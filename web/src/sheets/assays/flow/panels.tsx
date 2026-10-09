// Flow cytometry summary: controls with the setup wizard (FlowJo table,
// statistic, donors and conditions from the sample names, background,
// preview), the results sheet (one value per donor × condition, the
// background values, technical tubes averaged) and the methods text. The
// wizard's finish makes the linked per-donor table with statistics on the
// donor means and a SuperPlot (model.ts setupFlowOutput).
import { useCallback, useEffect, useState } from "react";
import { useProject } from "../../../app/context";
import { readXlsx, runEngine } from "../../../lib/engine";
import { newId } from "../../../project/ids";
import { findSheet, updateTable } from "../../../project/ops";
import type { DataSheet, DataTableModel, ResultsSheet } from "../../../project/types";
import { DELIMITERS } from "../../../share/recipes/pattern";
import CopyableMethods from "../../common/CopyableMethods";
import type { ControlsProps, ResultsProps } from "../../types";
import { assaySheets, ensureOutputs, familyOutputs, setFamilySettings, takeWizardRequest } from "../kit/create";
import { num } from "../kit/format";
import { LinkedOutputs, Note, Warnings } from "../kit/ui";
import Wizard from "../kit/Wizard";
import {
  conditionOrder, FLOW_SOURCE, flowTable, guessBackground, readFlow, runFlow, setupFlowOutput,
  tableFromFlowJo, unitSingular, type BackgroundKind, type FlowData, type FlowOptions,
  type FlowResult, type PartRole,
} from "./model";
import "./flow.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SOURCE_NOTE = "Statistics use one value per donor (or independent experiment) and condition: "
  + "events and technical tubes are not independent replicates (Cossarizza et al. 2019, Eur J "
  + "Immunol 49:1457, guidelines for flow cytometry in immunological studies; Lord et al. 2020). "
  + "Conditions measured on the same donors are compared with the donor as the block: a paired t "
  + "test for two conditions, repeated-measures one-way ANOVA for more.";

const BG_NOTE = "An FMO (fluorescence-minus-one) or isotype tube of the same donor gives that "
  + "donor's background; it is subtracted from each of the donor's conditions (Roederer 2001; "
  + "Maecker & Trotter 2006). Subtracting MFI backgrounds is common; for % positive, the FMO is "
  + "usually used to place the gate rather than subtracted.";

const plannedTest = (k: number) => (k === 2
  ? "paired t test on the donor values" : `repeated-measures one-way ANOVA (${k} conditions, donor as the block)`);

// ------------------------------------------------------------ commit

/** Save the settings (and the imported table) to every flow results sheet
 *  of the family and make the linked per-donor table, set up for
 *  statistics on donor means with a SuperPlot: one undo step. */
function useFlowAssay(sheet: ResultsSheet) {
  const { project, apply, store } = useProject();
  const dataId = sheet.parentId;
  const analysis = sheet.analysis;
  const outputs = familyOutputs(project, dataId, analysis);
  const tableName = findSheet(project, dataId)?.name ?? "data";
  const save = useCallback((o: FlowOptions) => {
    apply((p) => setFamilySettings(p, dataId, analysis, o), `assay:${dataId}:${analysis}`);
  }, [apply, dataId, analysis]);
  const commit = useCallback(async (o: FlowOptions, table: DataTableModel | null, make: boolean) => {
    const cur = findSheet(store.project, dataId) as DataSheet | undefined;
    if (!cur || cur.kind !== "data") return;
    const t = table ?? cur.table;
    let linked: DataTableModel | null = null;
    if (make) {
      try {
        linked = await runEngine((engine) => flowTable(runFlow((p) => engine.analyze(p), t, o)), { priority: "user" });
      } catch {
        linked = null;
      }
    }
    apply((p) => {
      let next = table ? updateTable(p, dataId, () => table) : p;
      next = setFamilySettings(next, dataId, analysis, o);
      const main = assaySheets(next, dataId, analysis)[0];
      if (!linked || !main) return next;
      const had = familyOutputs(next, dataId, analysis).length > 0;
      const r = ensureOutputs(next, main.id, [{ key: "per_donor", name: `Per ${unitSingular(o.unit).toLowerCase()} of ${cur.name}`, table: linked }], newId);
      next = r.project;
      if (!had && r.firstId) next = setupFlowOutput(next, r.firstId, o.unit);
      return next;
    });
  }, [apply, store, dataId, analysis]);
  return { outputs, save, commit, tableName };
}

// ------------------------------------------------------------ controls

export function FlowControls({ sheet, table, options: o, readOnly }: ControlsProps<FlowOptions>) {
  const a = useFlowAssay(sheet);
  const [wizardAt, setWizardAt] = useState<number | null>(() => (takeWizardRequest(sheet.id) ? 0 : null));
  const set = (patch: Partial<FlowOptions>) => a.save({ ...o, ...patch });
  const d = readFlow(table, o);
  return (
    <div className="controls assay-controls">
      <section>
        <h3>Flow cytometry summary</h3>
        <div className="assay-setup">
          <button type="button" className="btn-primary" disabled={readOnly}
            onClick={() => setWizardAt(0)}>Open setup wizard…</button>
        </div>
        <p className="hint-block">
          {d.samples.length} samples: {d.experiments.length} {o.unit} × {d.conditions.length} conditions.
          {d.stat ? ` Statistic: ${d.stat.label}.` : ""}
        </p>
        {d.problem && <p className="wizard-blocker">{d.problem}</p>}
      </section>
      <section>
        <h3>Statistic</h3>
        <StatField d={d} o={o} set={set} readOnly={readOnly} />
      </section>
      <section>
        <h3>Background and control</h3>
        <BackgroundFields d={d} o={o} set={set} readOnly={readOnly} />
      </section>
      <section>
        <h3>Per-donor table</h3>
        <LinkedOutputs outputs={a.outputs}
          onMake={readOnly || d.problem || a.outputs.length ? undefined : () => { void a.commit(o, null, true); }}
          makeLabel={`Make the linked per-${unitSingular(o.unit).toLowerCase()} table`}
          hint="One value per donor and condition, tested with the donor as the block, drawn as a SuperPlot." />
      </section>
      {wizardAt !== null && (
        <FlowWizard start={wizardAt} table={table} options={o} hasOutputs={a.outputs.length > 0}
          onClose={() => setWizardAt(null)}
          onFinish={(opts, nt) => { setWizardAt(null); void a.commit(opts, nt, true); }} />
      )}
    </div>
  );
}

function StatField({ d, set, readOnly }: {
  d: FlowData; o?: FlowOptions; set: (p: Partial<FlowOptions>) => void; readOnly?: boolean;
}) {
  return (
    <label className="field">
      <span>Statistic (gate and value)</span>
      <select value={d.stat?.name ?? ""} disabled={readOnly || !d.stats.length}
        onChange={(e) => set({ statistic: e.target.value })}>
        {d.stats.map((s) => (
          <option key={s.index} value={s.name}>{s.label}{s.gate ? ` (${s.gate})` : ""}</option>
        ))}
      </select>
      <span className="field-note">% of parent, median or mean fluorescence, or count, per gate.</span>
    </label>
  );
}

function BackgroundFields({ d, o, set, readOnly }: {
  d: FlowData; o: FlowOptions; set: (p: Partial<FlowOptions>) => void; readOnly?: boolean;
}) {
  const order = conditionOrder(d, o);
  return (
    <>
      <fieldset className="field-radios">
        <legend>Background subtraction</legend>
        {([["none", "None"], ["fmo", "FMO control"], ["isotype", "Isotype control"]] as [BackgroundKind, string][])
          .map(([k, label]) => (
            <label key={k}>
              <input type="radio" name="flow-background" checked={o.background.kind === k} disabled={readOnly}
                onChange={() => set({ background: { kind: k, condition: k === "none" ? "" : o.background.condition
                  || guessBackground(d.conditions).condition || d.conditions[0] || "" } })} />
              {label}
            </label>
          ))}
      </fieldset>
      {o.background.kind !== "none" && (
        <label className="field">
          <span>{o.background.kind === "fmo" ? "FMO" : "Isotype"} condition</span>
          <select value={o.background.condition} disabled={readOnly}
            onChange={(e) => set({ background: { ...o.background, condition: e.target.value } })}>
            {d.conditions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      )}
      <label className="field">
        <span>Control condition (compared with the others)</span>
        <select value={order[0] ?? ""} disabled={readOnly} onChange={(e) => set({ control: e.target.value })}>
          {d.conditions.filter((c) => c !== (o.background.kind !== "none" ? o.background.condition : ""))
            .map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <p className="hint-block">{BG_NOTE}</p>
    </>
  );
}

// ------------------------------------------------------------ wizard

function FlowWizard({ start, table, options, hasOutputs, onClose, onFinish }: {
  start: number; table: DataTableModel; options: FlowOptions; hasOutputs: boolean;
  onClose: () => void; onFinish: (o: FlowOptions, t: DataTableModel | null) => void;
}) {
  const [o, setO] = useState(options);
  const [nt, setNt] = useState<DataTableModel | null>(null);
  const t = nt ?? table;
  const set = (patch: Partial<FlowOptions>) => setO((p) => ({ ...p, ...patch }));
  const d = readFlow(t, o);
  return (
    <Wizard title="Flow cytometry summary" start={start} onClose={onClose}
      finishLabel={hasOutputs ? "Save settings" : "Create the per-donor table"}
      onFinish={() => onFinish(o, nt)}
      steps={[
        {
          id: "data", title: "FlowJo table", blocker: d.samples.length ? null : d.problem,
          render: () => (
            <>
              <FlowJoImport onTable={(t2) => {
                setNt(t2);
                const d2 = readFlow(t2, { ...o, sampleColumn: "", statistic: "", delimiter: "", parts: [] });
                set({ sampleColumn: "", statistic: "", delimiter: "", parts: [], control: "",
                  background: guessBackground(d2.conditions) });
              }} />
              <p className="hint-block">
                {d.samples.length} samples; {d.stats.length} statistic column{d.stats.length === 1 ? "" : "s"}.
              </p>
            </>
          ),
        },
        {
          id: "stat", title: "Statistic", blocker: d.stat ? null : "No statistic columns in the table.",
          render: () => (
            <>
              <StatField d={d} o={o} set={set} />
              {d.stat && (
                <p className="hint-block">
                  First values: {d.samples.slice(0, 4).map((s) => `${s.sample} = ${s.value || "blank"}`).join("; ")}.
                </p>
              )}
            </>
          ),
        },
        {
          id: "names", title: "Donors and conditions",
          blocker: d.problem && d.samples.length && d.stat ? d.problem : null,
          render: () => <NameStep d={d} o={o} set={set} />,
        },
        {
          id: "background", title: "Background",
          render: () => <BackgroundFields d={d} o={o} set={set} />,
        },
        {
          id: "preview", title: "Preview",
          render: () => <FlowPreview table={t} options={o} />,
        },
      ]} />
  );
}

function NameStep({ d, o, set }: { d: FlowData; o: FlowOptions; set: (p: Partial<FlowOptions>) => void }) {
  const width = d.parts.length;
  const example = (i: number) => [...new Set(d.split.map((p) => p[i] ?? "").filter(Boolean))].slice(0, 4).join(", ");
  return (
    <>
      <p className="hint-block">
        Sample names such as “{d.samples[0]?.sample ?? "D1_Unstim_001.fcs"}” are split into parts:
        say which part is the donor (or independent experiment) and which the condition.
      </p>
      <div className="wizard-row">
        <label className="field">
          <span>Split names at</span>
          <select value={d.delimiter} onChange={(e) => set({ delimiter: e.target.value, parts: [] })}>
            {DELIMITERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={o.stripExtension}
            onChange={(e) => set({ stripExtension: e.target.checked, parts: [] })} />
          Drop the file extension (.fcs)
        </label>
        <label className="field">
          <span>Each donor / experiment is one of</span>
          <input value={o.unit} aria-label="What one experiment is (plural)"
            onChange={(e) => set({ unit: e.target.value })} placeholder="donors" />
        </label>
      </div>
      <table className="mini-grid flow-parts">
        <thead><tr><th scope="col">Part</th><th scope="col">Values</th><th scope="col">Is the</th></tr></thead>
        <tbody>
          {Array.from({ length: width }, (_, i) => (
            <tr key={i}>
              <th scope="row">{i + 1}</th>
              <td>{example(i)}</td>
              <td>
                <select value={d.parts[i]} aria-label={`Part ${i + 1} is the`}
                  onChange={(e) => {
                    const parts = [...d.parts];
                    const v = e.target.value as PartRole;
                    // one experiment part: choosing it elsewhere moves it
                    if (v === "experiment") parts.forEach((p, k) => { if (p === "experiment") parts[k] = "skip"; });
                    parts[i] = v;
                    set({ parts, control: "" });
                  }}>
                  <option value="experiment">{unitSingular(o.unit)} / experiment</option>
                  <option value="condition">Condition</option>
                  <option value="skip">Ignore (tube, well…)</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint-block">
        {d.experiments.length} {o.unit} ({d.experiments.join(", ") || "none"}) × {d.conditions.length} conditions
        ({d.conditions.join(", ") || "none"}).
      </p>
    </>
  );
}

function FlowPreview({ table, options }: { table: DataTableModel; options: FlowOptions }) {
  const [state, setState] = useState<{ key: string; result: FlowResult } | null>(null);
  const key = JSON.stringify(options);
  useEffect(() => {
    let live = true;
    runEngine((engine) => runFlow((p) => engine.analyze(p), table, options), { priority: "user" })
      .then((r) => { if (live) setState({ key, result: r }); },
        (e) => { if (live) setState({ key, result: { error: e instanceof Error ? e.message : String(e) } }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, table]);
  if (!state || state.key !== key) return <p className="hint-block" role="status">Computing the per-donor values…</p>;
  const r = state.result;
  if (r.error) return <p className="wizard-blocker">{r.error}</p>;
  return (
    <>
      <ValuesTable r={r} />
      <p className="wizard-explain">
        The linked table will hold these values with the {unitSingular(r.unit).toLowerCase()} as the
        block; statistics: {plannedTest((r.conditions ?? []).length)}, drawn as a SuperPlot.
      </p>
      <Warnings items={r.warnings} />
    </>
  );
}

function ValuesTable({ r }: { r: FlowResult }) {
  const conds: string[] = r.conditions ?? [];
  const exps: string[] = r.experiments ?? [];
  return (
    <div className="results-scroll">
      <table className="results-table flow-values">
        <caption>{r.y_title}{r.subtracted ? `, ${r.background?.kind === "fmo" ? "FMO" : "isotype"} (${r.background?.condition}) subtracted` : ""}</caption>
        <thead>
          <tr>
            <th scope="col">{unitSingular(r.unit)}</th>
            {conds.map((c) => <th scope="col" key={c}>{c}</th>)}
            {r.subtracted && <th scope="col">Background ({r.background?.condition})</th>}
          </tr>
        </thead>
        <tbody>
          {exps.map((e, i) => (
            <tr key={e}>
              <th scope="row">{e}</th>
              {conds.map((c, j) => (
                <td key={c}>
                  {num(r.values?.[i]?.[j]) || "blank"}
                  {(r.n_technical?.[i]?.[j] ?? 1) > 1 ? <span className="flow-ntech"> (mean of {r.n_technical[i][j]} tubes)</span> : null}
                </td>
              ))}
              {r.subtracted && <td>{num(r.background?.values?.[e]) || "none"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ACCEPT = ".csv,.tsv,.txt,.xlsx,text/csv,text/plain";

function FlowJoImport({ onTable }: { onTable: (t: DataTableModel) => void }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const take = (src: string) => {
    const r = tableFromFlowJo(src);
    if (!r) { setMsg("Nothing to read: paste the FlowJo table with its header row."); return; }
    onTable(r.table);
    setMsg(`Read ${r.samples} samples and ${r.table.datasets.length - 1} statistic columns (FlowJo's Mean / SD rows dropped).`);
  };
  return (
    <>
      <p className="hint-block">
        Export the statistics from the FlowJo Table Editor (one row per sample file, one column per gate
        statistic such as “Lymphocytes/…/CD69+ | Freq. of Parent”) and paste or open it here, or type it
        into the table.
      </p>
      <label className="field">
        <span>FlowJo table (.csv, .txt or .xlsx)</span>
        <input type="file" accept={ACCEPT} aria-label="FlowJo table file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const bytes = new Uint8Array(await f.arrayBuffer());
              if (/\.xlsx$/i.test(f.name)) {
                const sheets = await readXlsx(bytes);
                const rows = (sheets[0]?.rows as unknown[][] ?? []).map((r) => r.map((c) => (c == null ? "" : String(c))));
                take(rows.map((r) => r.map((c) => c.replace(/[\t\n]/g, " ")).join("\t")).join("\n"));
              } else take(new TextDecoder("utf-8").decode(bytes));
            } catch (err) {
              setMsg(`Could not read the file: ${err instanceof Error ? err.message : String(err)}`);
            }
          }} />
      </label>
      <label className="field">
        <span>…or paste it</span>
        <textarea className="wizard-paste" value={text} aria-label="Paste FlowJo table"
          placeholder={",CD4+/CD69+ | Freq. of Parent\nD1_Unstim_001.fcs,2.1\n…"} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="assay-setup">
        <button type="button" disabled={!text.trim()} onClick={() => take(text)}>Read pasted table</button>
        {msg && <span className="hint-block" role="status">{msg}</span>}
      </div>
    </>
  );
}

// ------------------------------------------------------------ results

export function FlowResults({ sheet, options: o, result: r }: ResultsProps<FlowOptions, FlowResult>) {
  const a = useFlowAssay(sheet);
  if (!r) return null;
  if (r.error) {
    return <div className="result-card assay-results"><h3>Flow cytometry summary</h3><div className="results-error">{r.error}</div></div>;
  }
  const k = (r.conditions ?? []).length;
  return (
    <div className="result-card assay-results flow-results">
      <h3>Flow cytometry summary</h3>
      <p className="model-line">
        {r.stat_label}: one value per {unitSingular(r.unit).toLowerCase()} and condition
        ({(r.experiments ?? []).length} {r.unit} × {k} conditions); next: {plannedTest(k)}.
      </p>
      <ValuesTable r={r} />
      <Note>{SOURCE_NOTE}</Note>
      {r.subtracted && <Note>{BG_NOTE}</Note>}
      <Warnings items={r.warnings} />
      <h4>Per-donor table</h4>
      <LinkedOutputs outputs={a.outputs}
        onMake={a.outputs.length || sheet.frozen ? undefined : () => { void a.commit(o, null, true); }}
        makeLabel={`Make the linked per-${unitSingular(o.unit).toLowerCase()} table`} />
    </div>
  );
}

// ------------------------------------------------------------ methods

export function FlowMethods({ result: r }: ResultsProps<FlowOptions, FlowResult>) {
  if (!r || r.error) return null;
  const k = (r.conditions ?? []).length;
  const tech = (r.n_technical ?? []).some((row: number[]) => row.some((n) => n > 1));
  const text = `Gate statistics (${r.stat_label}) were exported from FlowJo and summarised to one value `
    + `per ${unitSingular(r.unit).toLowerCase()} and condition${tech ? " (technical tubes averaged)" : ""}`
    + (r.subtracted ? `, with the ${r.background?.kind === "fmo" ? "FMO" : "isotype"} control `
      + `(${r.background?.condition}) of each ${unitSingular(r.unit).toLowerCase()} subtracted` : "")
    + `. Conditions were compared by ${plannedTest(k)} with ${r.unit} as the independent replicates `
    + `(n = ${(r.experiments ?? []).length} ${r.unit}), following ${FLOW_SOURCE}. Analysed in OpenDose.`;
  return <CopyableMethods text={text} />;
}
