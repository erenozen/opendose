import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useProject } from "../app/context";
import { addTemplateFamily, builtinTemplates, useSavedTemplates } from "../app/templates";
import Modal from "../components/Modal";
import { Button, Field, FileButton, notify } from "../components/ui";
import { WORKBOOK_ACCEPT } from "../lib/fileText";
import { newId } from "../project/ids";
import { importIntoSheet } from "../project/importRecord";
import { addSheets, findSheet, makeDataSheet, makeInfoSheet, uniqueName } from "../project/ops";
import { fitPlanned, replayFacts, type PlanTable } from "../project/replay";
import { templateFromFamily, type SheetTemplate } from "../project/templates";
import type { DataSheet, Project } from "../project/types";
import { sheetCells } from "../sheets/common/workbookReportText";
import { hasNumbers, numberChoices, summaryTable, type BatchRow, type NumberChoice } from "./batch";
import { readIncoming, recordedReimport, settle, stemOf } from "./replayRun";
import "./replay.css";

/** One file of the run: the family made from it, or why there is none. */
interface FileOutcome {
  file: string;
  dataId?: string;
  family?: string;
  error?: string;
  /** Results of the family's results sheets, in their order. */
  results?: unknown[];
  /** A workbook or .pzfx with several tables: only the first that fits is used. */
  note?: string;
}

type Stage = "setup" | "running" | "done";

const TEMPLATE = "tpl:";
const TABLE = "table:";

/**
 * "Run on many files…": one family per file from a family of this
 * project or a template. Each file goes through the same import a
 * one-file Apply to new data uses (the table's recorded recipe when it
 * has one, else the table's own layout), its family's analyses run one
 * after another in the engine, and a file that cannot be read or does not
 * fit is named with its error while the others go on. Then a summary
 * table of the numbers chosen, one row per file.
 */
export default function BatchDialog({ dataId, onClose }: { dataId?: string; onClose: () => void }) {
  const api = useProject();
  const uid = useId();
  const saved = useSavedTemplates();
  const tables = api.project.sheets.filter((s): s is DataSheet => s.kind === "data" && !s.derived);
  const templates = useMemo(() => [...builtinTemplates(api.project.prefs), ...saved.saved],
    [api.project.prefs, saved.saved]);
  const first = dataId && tables.some((t) => t.id === dataId) ? `${TABLE}${dataId}`
    : tables[0] ? `${TABLE}${tables[0].id}` : templates[0] ? `${TEMPLATE}${templates[0].id}` : "";
  const [src, setSrc] = useState(first);
  const [files, setFiles] = useState<File[]>([]);
  const [stage, setStage] = useState<Stage>("setup");
  const [progress, setProgress] = useState({ phase: "", count: "" });
  const [outcomes, setOutcomes] = useState<FileOutcome[]>([]);
  const [stopped, setStopped] = useState(false);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const cancelled = useRef(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; cancelled.current = true; };
  }, []);

  // The family as a template (Y values cleared), with the table's import
  // record so its recipe runs on each file.
  const plan = useMemo((): { template: SheetTemplate; table: PlanTable } | null => {
    if (src.startsWith(TABLE)) {
      const sheet = findSheet(api.project, src.slice(TABLE.length)) as DataSheet | undefined;
      if (!sheet || sheet.kind !== "data") return null;
      const t = templateFromFamily(api.project, sheet.id, { id: "batch", name: sheet.name, withData: false });
      return t ? { template: t, table: { id: sheet.id, name: sheet.name, table: t.table,
        ...(sheet.imported ? { imported: sheet.imported } : {}) } } : null;
    }
    const t = templates.find((x) => x.id === src.slice(TEMPLATE.length));
    return t ? { template: t, table: { id: "template", name: t.tableName || t.name, table: t.table } } : null;
  }, [src, api.project, templates]);

  const run = async () => {
    if (!plan || !files.length || api.readOnly) return;
    cancelled.current = false;
    setStage("running");
    setOutcomes([]);
    const out: FileOutcome[] = [];
    const at = new Date().toISOString();
    for (let i = 0; i < files.length; i++) {
      if (cancelled.current) break;
      const f = files[i];
      setProgress({ phase: "Running the family on each file", count: `${i + 1} of ${files.length}: ${f.name}` });
      try {
        const incoming = (await readIncoming(f, api.project.prefs)).map(({ sheet, ...t }) =>
          (sheet ? { ...t, source: sheetCells(sheet, false, false) } : t));
        if (!incoming.length) throw new Error("it holds no table");
        const tried = incoming.map((s) => ({ s, ...fitPlanned(plan.table, s, recordedReimport) }));
        const ok = tried.find((x) => x.fit && hasNumbers(x.fit.table));
        if (!ok?.fit) {
          const why = tried.find((x) => x.error)?.error
            ?? "it holds no numbers for the table";
          throw new Error(why);
        }
        const fit = ok.fit;
        const facts = { ...replayFacts(plan.table, ok.s, fit, at), mode: "new" as const };
        let famId = "";
        api.apply((p) => {
          const r = addTemplateFamily(p, plan.template, stemOf(f.name), newId, false);
          famId = r.dataId;
          return importIntoSheet(r.project, r.dataId, () => fit.table, facts);
        });
        if (!famId) throw new Error("the project would not take a new table");
        // the family's analyses, in the engine, before the next file
        await settle(() => api.store.project, api.results, 120000, undefined, () => cancelled.current);
        const p = api.store.project;
        const res = p.sheets.filter((s) => s.kind === "results" && s.parentId === famId)
          .map((s) => (s.kind === "results" && s.frozen ? s.cached : api.results.get(s.id)?.result) ?? null);
        out.push({ file: f.name, dataId: famId, family: findSheet(p, famId)?.name ?? stemOf(f.name), results: res,
          ...(incoming.length > 1 ? { note: `${incoming.length} tables in the file; “${ok.s.origin}” was used` } : {}) });
      } catch (e) {
        out.push({ file: f.name, error: (e instanceof Error ? e.message : String(e)).replace(/\.$/, "") });
      }
      if (live.current) setOutcomes([...out]);
    }
    if (!live.current) return;
    setStopped(cancelled.current && out.length < files.length);
    setStage("done");
  };

  // Numbers offered for the summary: those of the first family made.
  const done = outcomes.filter((o) => o.dataId);
  const choices: NumberChoice[] = useMemo(() => {
    const firstOk = outcomes.find((o) => o.results);
    if (!firstOk || !plan) return [];
    return numberChoices(plan.template.results.map((r, k) => ({ name: r.name.split("{table}").join(plan.table.name),
      result: firstOk.results?.[k] })));
  }, [outcomes, plan]);
  const chosen = picked ?? new Set(choices.filter((c) => c.key).map((c) => `${c.sheet}|${c.path}`));
  const toggle = (k: string) => {
    const next = new Set(chosen);
    if (next.has(k)) next.delete(k); else next.add(k);
    setPicked(next);
  };

  const choiceRow = (c: NumberChoice) => {
    const k = `${c.sheet}|${c.path}`;
    return (
      <label key={k} className="check-row">
        <input type="checkbox" checked={chosen.has(k)} disabled={!!made} onChange={() => toggle(k)} />
        <span>{c.label}</span>
      </label>
    );
  };

  const makeSummary = () => {
    const list = choices.filter((c) => chosen.has(`${c.sheet}|${c.path}`));
    if (!list.length || !plan) return;
    const rows: BatchRow[] = done.map((o) => ({ name: o.family ?? stemOf(o.file), results: o.results ?? [] }));
    const { table, notes } = summaryTable(rows, list);
    const failed = outcomes.filter((o) => o.error);
    let id = "";
    api.apply((p: Project) => {
      id = newId();
      const name = uniqueName(p, `Summary of ${plan.table.name}`);
      let q = addSheets(p, [makeDataSheet(id, name, table)]);
      const text = [
        `${name}: one row per file run through the family of ${plan.table.name}.`,
        ...(notes.length ? ["", "Empty cells:", ...notes.map((n) => `- ${n}`)] : []),
        ...(failed.length ? ["", "Files not run:", ...failed.map((o) => `- ${o.file}: ${o.error}`)] : []),
      ].join("\n");
      q = addSheets(q, [{ ...makeInfoSheet(newId(), uniqueName(q, `About ${name}`), id), notes: text, constants: [] }]);
      return q;
    });
    if (id) {
      setMade(id);
      api.select(id);
      notify(`Made the summary table of ${rows.length} file${rows.length === 1 ? "" : "s"}.`, { tone: "success" });
    }
  };

  if (stage === "done") {
    const failed = outcomes.filter((o) => o.error);
    return (
      <Modal title="Run on many files" className="replay-dialog batch-dialog" onClose={onClose} onSubmit={onClose}
        actions={(
          <>
            <Button className="spacer" onClick={makeSummary} disabled={!!made || !done.length || !chosen.size}>
              {made ? "Summary table made" : "Make the summary table"}
            </Button>
            <Button type="submit" variant="primary">Done</Button>
          </>
        )}>
        <div className="replay-log">
          <p className="replay-plan" role="status">
            {done.length} famil{done.length === 1 ? "y" : "ies"} made from {outcomes.length} file{outcomes.length === 1 ? "" : "s"}
            {failed.length ? `; ${failed.length} not run` : ""}{stopped ? `; stopped before the last ${files.length - outcomes.length}` : ""}.
          </p>
          <ul aria-label="Files">
            {outcomes.map((o, i) => (
              <li key={i} className={o.error ? "batch-failed" : undefined}>
                <strong>{o.file}</strong>
                {o.error ? `: not run. ${o.error.replace(/^./, (c) => c.toUpperCase())}.` : `: family “${o.family}”`}
                {o.note && <div className="replay-warn">Note: {o.note}.</div>}
              </li>
            ))}
          </ul>
          {done.length > 0 && (
            choices.length ? (
              <fieldset className="field-radios batch-numbers">
                <legend>Numbers for the summary table (one row per file)</legend>
                {choices.filter((c) => c.key).map(choiceRow)}
                {choices.some((c) => !c.key) && (
                  <details className="batch-more">
                    <summary>Other numbers ({choices.filter((c) => !c.key).length})</summary>
                    {choices.filter((c) => !c.key).map(choiceRow)}
                  </details>
                )}
              </fieldset>
            ) : <p className="field-note">The analyses gave no numbers to summarise.</p>
          )}
          <p className="field-note">
            Each family is an ordinary family of the project: its table records the file it came
            from, and its analyses and graphs are those of {plan?.table.name ?? "the family"}.
            A number the results do not report (an IC50 not reached in the range tested, an
            ambiguous fit) is left empty in the summary, with why in the info sheet beside it.
          </p>
        </div>
      </Modal>
    );
  }

  const running = stage === "running";
  return (
    <Modal title="Run on many files" className="replay-dialog batch-dialog"
      onClose={() => { cancelled.current = true; onClose(); }}
      onSubmit={() => { void run(); }}
      actions={(
        <>
          <Button onClick={() => { if (running) cancelled.current = true; else onClose(); }}>
            {running ? "Stop after this file" : "Cancel"}
          </Button>
          <Button type="submit" variant="primary" busy={running} busyLabel="Running…"
            disabled={!plan || !files.length || api.readOnly}>
            {files.length ? `Run on ${files.length} file${files.length === 1 ? "" : "s"}` : "Run on the files"}
          </Button>
        </>
      )}>
      <p className="modal-text">
        Makes one family per file: the same table layout, analyses and graphs, filled with
        that file the way Apply to new data fills one table (a table imported with a recipe
        gets each file through that recipe). The analyses run one file at a time. A file that
        cannot be read is named with its error and the others go on. Then choose the numbers
        for a summary table.
      </p>
      <Field label="Family to run" id={`${uid}-src`}>
        <select id={`${uid}-src`} value={src} disabled={running} onChange={(e) => setSrc(e.target.value)}>
          {tables.length > 0 && (
            <optgroup label="Families of this project">
              {tables.map((t) => <option key={t.id} value={`${TABLE}${t.id}`}>{t.name}</option>)}
            </optgroup>
          )}
          <optgroup label="Templates">
            {templates.map((t) => <option key={t.id} value={`${TEMPLATE}${t.id}`}>{t.name}</option>)}
          </optgroup>
        </select>
      </Field>
      <div className="field">
        <span className="ui-field-label">Files (CSV, TSV, text, .xlsx, .xls, .ods or .pzfx)</span>
        <div className="replay-file">
          <FileButton size="sm" multiple inputLabel="Files to run" disabled={running}
            accept={`.csv,.tsv,.txt,.tab,.dat,.prn,${WORKBOOK_ACCEPT},.pzfx,.prism,text/csv,text/plain`}
            onFiles={(list) => setFiles(list)}>
            {files.length ? "Choose other files…" : "Choose files…"}
          </FileButton>
          <span className="field-note">
            {files.length ? `${files.length} file${files.length === 1 ? "" : "s"}: ${files.slice(0, 4).map((f) => f.name).join(", ")}${files.length > 4 ? " …" : ""}` : ""}
          </span>
        </div>
      </div>
      {api.readOnly && <p className="field-note replay-err" role="alert">
        This shared project is read-only: make a copy first.
      </p>}
      <p className="field-note replay-progress">
        <span role="status">{running ? `${progress.phase}…` : ""}</span>
        {running && progress.count && <span aria-hidden="true"> {progress.count}</span>}
      </p>
      {running && outcomes.length > 0 && (
        <ul className="batch-sofar" aria-label="Files run so far">
          {outcomes.map((o, i) => <li key={i}>{o.file}: {o.error ? `not run (${o.error})` : `family “${o.family}”`}</li>)}
        </ul>
      )}
    </Modal>
  );
}
