import { useEffect, useMemo, useRef, useState } from "react";
import { resolveOptions, resultKey, sheetRunner, type ResultsCache } from "../app/analysis";
import { useProject } from "../app/context";
import { prismTableToFamily, type PrismTable } from "../app/factory";
import { useUi } from "../app/ui";
import Modal from "../components/Modal";
import { copyText } from "../export/download";
import { analyzeAsync, readXlsx } from "../lib/engine";
import { newId } from "../project/ids";
import { addSheets, findSheet, makeInfoSheet, makeProject, uniqueName } from "../project/ops";
import {
  buildReplayLog, matchTables, planFromJson, planTables, replaceTables,
  replayLogText, resultHeadline, type Fit, type IncomingTable, type LoadedPlan, type PlanTable,
  type ReplayLog,
} from "../project/replay";
import type { DataSheet, Project, TableType } from "../project/types";
import { analysisDef } from "../sheets/registry";
import "./replay.css";

const TYPE_NAMES: Record<TableType, string> = {
  xy: "XY", column: "Column", grouped: "Grouped", contingency: "Contingency",
  survival: "Survival", partsofwhole: "Parts of whole", multivariable: "Multiple variables",
  nested: "Nested",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stemOf = (file: string) => file.replace(/\.[^.]+$/, "");

/**
 * Bring every results sheet of the project up to date (the same runs the
 * workbench and the background refresh make, at user priority) and wait
 * until nothing has changed for a moment (derived tables settle too).
 * Returns the current result of every results sheet that has one.
 */
async function settle(get: () => Project, results: ResultsCache, timeoutMs = 120000,
  onProgress?: (left: number) => void): Promise<Map<string, unknown>> {
  const t0 = Date.now();
  let quiet = 0;
  let last = "";
  while (Date.now() - t0 < timeoutMs) {
    const p = get();
    let left = 0;
    const keys: string[] = [];
    for (const s of p.sheets) {
      if (s.kind !== "results" || s.frozen) continue;
      const data = findSheet(p, s.parentId) as DataSheet | undefined;
      if (!data || data.kind !== "data") continue;
      const def = analysisDef(data.table.type, s.analysis);
      if (!def) continue;
      const options = resolveOptions(def, s.options, data.table, p.prefs);
      const key = resultKey(s.analysis, options, data.table);
      keys.push(key);
      if (results.isCurrent(s.id, key)) continue;
      left++;
      if (results.isCancelled(s.id, key)) results.retry(s.id);
      if (results.pending(s.id)?.key !== key) {
        results.run(s.id, key, sheetRunner(def, data.table, options), "user");
      }
    }
    onProgress?.(left);
    // done when every result is current and no input has changed for a
    // moment (a derived table rewritten from new results changes keys)
    const sig = keys.join("|");
    quiet = !left && sig === last ? quiet + 1 : 0;
    last = sig;
    if (quiet >= 4) break;
    await sleep(250);
  }
  const out = new Map<string, unknown>();
  const p = get();
  for (const s of p.sheets) {
    if (s.kind !== "results") continue;
    const r = s.frozen ? s.cached : results.get(s.id)?.result;
    if (r !== undefined && r !== null) out.set(s.id, r);
  }
  return out;
}

/** Tables in a file of new data. */
async function readIncoming(file: File, prefs: Project["prefs"]): Promise<IncomingTable[]> {
  const name = file.name;
  if (/\.xlsx$/i.test(name)) {
    const sheets = (await readXlsx(new Uint8Array(await file.arrayBuffer())))
      .filter((s) => s.rows.some((r) => r.some((c) => c.trim())));
    return sheets.map((s) => ({
      name: sheets.length === 1 ? stemOf(name) : s.name,
      origin: sheets.length === 1 ? name : `${name} › ${s.name}`,
      source: s.rows,
    }));
  }
  if (/\.(pzfx|prism)$/i.test(name)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const res = await analyzeAsync({ analysis: "pzfx_import", data: { pzfx_b64: btoa(binary) },
      options: {} }, { priority: "user" }) as { error?: string; tables?: PrismTable[] };
    if (res.error || !res.tables?.length) throw new Error(res.error ?? "no tables found");
    return res.tables.map((t) => {
      const r = prismTableToFamily(makeProject(prefs), t, newId);
      const data = findSheet(r.project, r.dataId) as DataSheet;
      return { name: t.title || stemOf(name), origin: `${name} › ${t.title || "table"}`, table: data.table };
    });
  }
  if (/\.(xls|ods|numbers)$/i.test(name)) {
    throw new Error("only .xlsx workbooks can be read; save the sheet as .xlsx or CSV");
  }
  return [{ name: stemOf(name), origin: name, source: await file.text() }];
}

type Stage = "setup" | "running" | "log";

/**
 * "Apply to new data…": take a plan (this project, a project file or a
 * provenance.json) and new data (CSV, TSV, .xlsx, .pzfx or pasted), put
 * the data into the plan's tables in their own layouts, re-run every
 * analysis, keep every graph and layout, and log which numbers changed.
 */
export default function ReplayDialog({ dataId, onClose }: { dataId?: string; onClose: () => void }) {
  const api = useProject();
  const ui = useUi();
  const [planSrc, setPlanSrc] = useState<"current" | "file">("current");
  const [planFile, setPlanFile] = useState<{ name: string; plan: LoadedPlan } | null>(null);
  const [incoming, setIncoming] = useState<IncomingTable[]>([]);
  const [pasted, setPasted] = useState("");
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<Stage>("setup");
  const [progress, setProgress] = useState("");
  const [log, setLog] = useState<ReplayLog | null>(null);
  const [kept, setKept] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  const planProject: Project | null = planSrc === "current" ? api.project : planFile?.plan.project ?? null;
  const tables: PlanTable[] = useMemo(() => {
    if (!planProject) return [];
    const all = planTables(planProject);
    return planSrc === "current" && dataId ? all.filter((t) => t.id === dataId) : all;
  }, [planProject, planSrc, dataId]);
  const sources = useMemo(() => [...incoming,
    ...(pasted.trim() ? [{ name: "Pasted data", origin: "pasted data", source: pasted }] : [])],
  [incoming, pasted]);
  const matching = useMemo(() => matchTables(tables, sources), [tables, sources]);

  // the automatic pairing, until the user picks otherwise
  const pick = (i: number): string => {
    if (choice[i] !== undefined) return choice[i];
    for (const [planId, m] of matching.assign) if (m.source === i) return planId;
    return "";
  };
  const fitOf = (planId: string, i: number): Fit | null => {
    const j = tables.findIndex((t) => t.id === planId);
    return j >= 0 ? matching.fits[j]?.[i] ?? null : null;
  };
  const chosen = sources.map((_, i) => pick(i));
  const dup = tables.find((t) => chosen.filter((c) => c === t.id).length > 1);
  const ready = chosen.some((c, i) => !!c && !!fitOf(c, i))
    && !dup && !!planProject && !api.readOnly;

  const loadPlan = async (f: File | undefined) => {
    setErr("");
    if (!f) { setPlanFile(null); return; }
    try {
      const plan = planFromJson(JSON.parse(await f.text()), { prefs: api.project.prefs, ids: newId });
      setPlanFile({ name: f.name, plan });
      setChoice({});
    } catch (e) {
      setPlanFile(null);
      setErr(`Could not read the plan: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const loadData = async (files: FileList | null) => {
    setErr("");
    if (!files?.length) { setIncoming([]); return; }
    setBusy(true);
    try {
      const all: IncomingTable[] = [];
      for (const f of files) all.push(...await readIncoming(f, api.project.prefs));
      setIncoming(all);
      setChoice({});
    } catch (e) {
      setErr(`Could not read the data: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  const run = async () => {
    if (!ready || !planProject) return;
    setErr("");
    setStage("running");
    const fromFile = planSrc === "file" && planFile;
    try {
      // numbers before: this project's current results, or those saved in the plan file
      let before: Map<string, unknown>;
      if (!fromFile) {
        setProgress("Bringing the current results up to date…");
        before = await settle(() => api.store.project, api.results);
      } else {
        before = new Map(planProject.sheets.flatMap((s) => (s.kind === "results"
          && s.cached !== undefined && s.cached !== null ? [[s.id, s.cached] as const] : [])));
      }
      if (!live.current) return;
      const replaced: { planId: string; origin: string; fit: Fit }[] = [];
      const newTables = new Map<string, DataSheet["table"]>();
      chosen.forEach((planId, i) => {
        const fit = planId ? fitOf(planId, i) : null;
        if (!planId || !fit) return;
        replaced.push({ planId, origin: sources[i].origin, fit });
        newTables.set(planId, fit.table);
      });
      if (!fromFile) api.apply((p) => replaceTables(p, newTables), null);
      else api.replace(replaceTables(planProject, newTables), replaced[0]?.planId ?? null);
      const total = api.store.project.sheets.filter((s) => s.kind === "results" && !s.frozen).length;
      const after = await settle(() => api.store.project, api.results, 120000, (left) => {
        if (live.current) setProgress(left ? `Re-running analyses: ${total - left} of ${total} done…` : "Finishing…");
      });
      if (!live.current) return;
      const used = new Set(chosen.map((c, i) => (c && fitOf(c, i) ? i : -1)));
      setLog(buildReplayLog({
        date: new Date().toISOString(),
        plan: fromFile ? fromFile.name : "this project",
        project: api.store.project, replaced, incoming: sources,
        unused: sources.map((_, i) => i).filter((i) => !used.has(i)),
        before, after,
      }));
      setStage("log");
    } catch (e) {
      setErr(`The replay stopped: ${e instanceof Error ? e.message : String(e)}`);
      setStage("setup");
    }
  };

  const keepLog = () => {
    if (!log || kept) return;
    const text = replayLogText(log);
    api.apply((p) => addSheets(p, [{ ...makeInfoSheet(newId(), uniqueName(p, "Replay log")),
      notes: text, constants: [] }]), null);
    setKept(true);
    ui.notify("The replay log is now an info sheet in the project.");
  };

  if (stage === "log" && log) {
    return (
      <Modal title="Replay log" className="replay-dialog" onClose={onClose} onSubmit={onClose}
        actions={(
          <>
            <button type="button" className="spacer"
              onClick={async () => ui.notify(await copyText(replayLogText(log)) ? "Replay log copied." : "Copy failed.")}>
              Copy log
            </button>
            <button type="button" onClick={keepLog} disabled={kept}>
              {kept ? "Kept in the project" : "Keep as an info sheet"}
            </button>
            <button type="submit" className="btn-primary">Done</button>
          </>
        )}>
        <ReplayLogView log={log} undoable={log.plan === "this project"} />
      </Modal>
    );
  }

  return (
    <Modal title="Apply to new data" className="replay-dialog" onClose={onClose}
      onSubmit={() => { void run(); }}
      actions={(
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!ready || stage === "running"}>
            {stage === "running" ? "Re-running…" : "Apply and re-run"}
          </button>
        </>
      )}>
      <p className="modal-text">
        Puts new data into the tables of a project and re-runs every analysis
        with the same options; graphs, formats and page layouts are kept. A log
        then lists which numbers changed.
      </p>
      <fieldset className="field-radios">
        <legend>Analyses to apply</legend>
        <label>
          <input type="radio" name="replay-plan" checked={planSrc === "current"}
            onChange={() => { setPlanSrc("current"); setChoice({}); }} />
          This project{dataId ? ` (table “${findSheet(api.project, dataId)?.name ?? ""}”)` : ""}
        </label>
        <label>
          <input type="radio" name="replay-plan" checked={planSrc === "file"}
            onChange={() => { setPlanSrc("file"); setChoice({}); }} />
          A project file or provenance.json from an export bundle
        </label>
        {planSrc === "file" && (
          <input type="file" accept=".json,application/json" aria-label="Plan file"
            onChange={(e) => void loadPlan(e.target.files?.[0])} />
        )}
      </fieldset>
      {planSrc === "file" && planFile && (
        <p className="field-note" role="status">
          {planFile.name}: {tables.length} table{tables.length === 1 ? "" : "s"},{" "}
          {planFile.plan.project.sheets.filter((s) => s.kind === "results").length} analyses,{" "}
          {planFile.plan.project.sheets.filter((s) => s.kind === "graph").length} graphs.
          {planFile.plan.partial && " An older provenance file: graphs get their default format."}
          {" "}Applying opens it in place of the open project; save that first if you need it.
        </p>
      )}
      <div className="replay-data">
        <label className="field">
          <span>New data file (CSV, TSV, text, .xlsx or .pzfx)</span>
          <input type="file" multiple
            accept=".csv,.tsv,.txt,.tab,.dat,.prn,.xlsx,.pzfx,.prism,text/csv,text/plain"
            aria-label="New data file" onChange={(e) => void loadData(e.target.files)} />
        </label>
        <label className="field">
          <span>Or paste a table</span>
          <textarea rows={3} value={pasted} aria-label="Pasted data" spellCheck={false}
            onChange={(e) => { setPasted(e.target.value); setChoice({}); }}
            placeholder="Copy the block from a spreadsheet, in the same layout as the table" />
        </label>
      </div>
      {busy && <p className="field-note" role="status">Reading the file…</p>}
      {sources.length > 0 && (
        <table className="replay-map">
          <caption>Which table each part of the new data goes into</caption>
          <thead><tr><th scope="col">New data</th><th scope="col">Goes into</th></tr></thead>
          <tbody>
            {sources.map((src, i) => {
              const current = chosen[i];
              const fit = current ? fitOf(current, i) : null;
              const how = matching.assign.get(current)?.source === i && choice[i] === undefined
                ? matching.assign.get(current)?.how : null;
              return (
                <tr key={`${src.origin}-${i}`}>
                  <th scope="row">{src.origin}</th>
                  <td>
                    <select value={current} aria-label={`Table for ${src.origin}`}
                      onChange={(e) => setChoice({ ...choice, [i]: e.target.value })}>
                      <option value="">Not used</option>
                      {tables.map((t) => {
                        const f = fitOf(t.id, i);
                        return (
                          <option key={t.id} value={t.id} disabled={!f}>
                            {t.name} ({TYPE_NAMES[t.table.type]}){f ? (f.exact ? "" : ", other layout") : ", does not fit"}
                          </option>
                        );
                      })}
                    </select>
                    <span className="replay-how">
                      {how === "name" ? "matched by name" : how === "shape" ? "matched by shape"
                        : how === "only" ? "the only table" : ""}
                      {fit && !fit.exact ? " · a different layout from the table's" : ""}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {sources.length > 0 && matching.ambiguous && !Object.keys(choice).length && (
        <p className="field-note" role="status">
          Some data could go into more than one table: choose where each goes.
        </p>
      )}
      {dup && <p className="field-note replay-err" role="alert">
        Two parts of the new data go into “{dup.name}”: choose one.
      </p>}
      {api.readOnly && <p className="field-note replay-err" role="alert">
        This shared project is read-only: make a copy first.
      </p>}
      {stage === "running" && <p className="field-note" role="status" aria-live="polite">{progress}</p>}
      {err && <p className="field-note replay-err" role="alert">{err}</p>}
    </Modal>
  );
}

function ReplayLogView({ log, undoable }: { log: ReplayLog; undoable: boolean }) {
  return (
    <div className="replay-log">
      <p className="replay-plan">Analyses, graphs and layouts from {log.plan}.</p>
      <h3>Tables</h3>
      <ul>
        {log.tables.map((t) => (
          <li key={t.name}>
            <strong>{t.name}</strong>
            {t.status === "replaced" ? `: new data from ${t.origin} (${t.detail})` : `: ${t.detail}`}
            {t.warnings.map((w) => <div key={w} className="replay-warn">Note: {w}.</div>)}
          </li>
        ))}
        {log.unused.map((u) => (
          <li key={u.origin}><strong>{u.origin}</strong>: {u.reason}</li>
        ))}
      </ul>
      <h3>Results</h3>
      <ul>
        {log.results.map((r) => (
          <li key={r.id} className={`replay-result is-${r.status}`} data-sheet={r.name}>
            <strong>{r.name}</strong>: {resultHeadline(r)}
            {r.changes.length > 0 && (
              <table className="replay-changes">
                <thead><tr><th scope="col">Number</th><th scope="col">Before → after</th></tr></thead>
                <tbody>
                  {r.changes.map((c) => (
                    <tr key={c.label + c.text}><th scope="row">{c.label}</th><td>{c.text}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {r.more > 0 && <div className="replay-more">and {r.more} other number{r.more === 1 ? "" : "s"}</div>}
          </li>
        ))}
      </ul>
      <p className="field-note">
        {log.graphs} graph{log.graphs === 1 ? "" : "s"} and {log.layouts} page layout{log.layouts === 1 ? "" : "s"} kept;
        they redraw from the new numbers.{undoable ? " Undo puts the old data back." : ""}
      </p>
    </div>
  );
}
