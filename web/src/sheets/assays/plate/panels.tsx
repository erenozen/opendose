// Plate reader → dose-response: controls (with the setup wizard), the QC
// results sheet and the methods text.
import { useEffect, useMemo, useState } from "react";
import { getEngine, readXlsx } from "../../../lib/engine";
import { parseSource } from "../../../share/recipes/presets";
import CopyableMethods from "../../common/CopyableMethods";
import type { DataTableModel } from "../../../project/types";
import type { ControlsProps, ResultsProps } from "../../types";
import { takeWizardRequest } from "../kit/create";
import { num, pct } from "../kit/format";
import { Chip, KV, LinkedOutputs, Pass, Warnings } from "../kit/ui";
import { useAssay, type SpecsFor } from "../kit/useAssay";
import Wizard from "../kit/Wizard";
import {
  compoundsOf, decreasing, dims, doseResponseTable, findPlates, fitSettings, mapProblem,
  NORMALIZATION_LABELS, normalizePlateOptions, outputKeys, outputName, platesOf, plateTable,
  roleCounts, runPlateQc, wellName, type EdgeRole, type Normalization, type OutputMode,
  type PlateFormat, type PlateOptions, type PlateRun,
} from "./model";
import PlateMapEditor from "./PlateMapEditor";
import "./plate.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

const specsFor = (tableName: string): SpecsFor<PlateOptions> => (engine, table, o) => {
  const run = runPlateQc((p) => engine.analyze(p), table, o);
  if (run.error) return [];
  const n = run.plates?.length ?? 1;
  return outputKeys(run, o).flatMap((key) => {
    const t = doseResponseTable(run, o, key);
    return t ? [{
      key, name: outputName(key, tableName, n), table: t,
      configure: (prev: unknown) => fitSettings(prev as Record<string, unknown>, o),
    }] : [];
  });
};

// ------------------------------------------------------------ controls

export function PlateControls({ sheet, table, options, readOnly }: ControlsProps<PlateOptions>) {
  const a = useAssay<PlateOptions>(sheet);
  const [wizardAt, setWizardAt] = useState<number | null>(() => (takeWizardRequest(sheet.id) ? 0 : null));
  const o = options;
  const set = (patch: Partial<PlateOptions>) => a.save({ ...o, ...patch });
  const plates = platesOf(table, o.format);
  const counts = roleCounts(o.wells);
  const compounds = compoundsOf(o.wells);
  const problem = mapProblem(o.wells, o.normalization);

  return (
    <div className="controls assay-controls">
      <section>
        <h3>Plate reader → dose-response</h3>
        <div className="assay-setup">
          <button type="button" className="btn-primary" disabled={readOnly}
            onClick={() => setWizardAt(0)}>Open setup wizard…</button>
          <button type="button" disabled={readOnly} onClick={() => setWizardAt(1)}>Edit plate map…</button>
        </div>
        <p className="hint-block">
          {plates.length} plate{plates.length === 1 ? "" : "s"} of {o.format} wells in the table;
          {" "}{counts.blank} blank, {counts.negative} vehicle, {counts.positive} kill-control and
          {" "}{counts.sample} compound wells{compounds.length ? ` (${compounds.join(", ")})` : ""}.
        </p>
        <MiniMap options={o} />
        {problem && <p className="wizard-blocker">{problem}</p>}
      </section>
      <section>
        <h3>Normalisation and QC limits</h3>
        <NormalizationFields o={o} set={set} readOnly={readOnly} />
      </section>
      <section>
        <h3>Dose-response tables</h3>
        <OutputFields o={o} set={set} readOnly={readOnly} />
        <LinkedOutputs outputs={a.outputs}
          onMake={readOnly || problem ? undefined : () => { void a.commit(o, null, specsFor(a.tableName)); }}
          makeLabel={a.outputs.length ? "Update the linked tables" : "Make the linked dose-response tables"}
          hint="Linked XY tables follow the plate readings and these settings, each with its curve fit set up." />
      </section>
      {wizardAt !== null && (
        <PlateWizard start={wizardAt} table={table} options={o} tableName={a.tableName}
          hasOutputs={a.outputs.length > 0}
          onClose={() => setWizardAt(null)}
          onFinish={(opts, newTable) => {
            setWizardAt(null);
            void a.commit(opts, newTable, specsFor(a.tableName));
          }} />
      )}
    </div>
  );
}

function MiniMap({ options: o }: { options: PlateOptions }) {
  const [nr, nc] = dims(o.format);
  const compounds = compoundsOf(o.wells);
  return (
    <div className="plate-mini" aria-hidden="true"
      style={{ gridTemplateColumns: `repeat(${nc}, 1fr)`, maxWidth: o.format === 384 ? 300 : 220 }}>
      {Array.from({ length: nr * nc }, (_, i) => {
        const w = o.wells[wellName(Math.floor(i / nc), i % nc)];
        const cls = w ? `well-${w.role}` : "";
        const style = w?.role === "sample"
          ? { background: `color-mix(in srgb, var(--accent) ${30 + 50 * ((compounds.indexOf(w.compound ?? "Sample") % 3) / 2)}%, var(--surface))` }
          : undefined;
        return <span key={i} className={`plate-well ${cls}`} style={style} />;
      })}
    </div>
  );
}

function NormalizationFields({ o, set, readOnly }: {
  o: PlateOptions; set: (p: Partial<PlateOptions>) => void; readOnly?: boolean;
}) {
  return (
    <>
      <label className="field">
        <span>Normalise each well as</span>
        <select value={o.normalization} disabled={readOnly} aria-label="Normalisation"
          onChange={(e) => set({ normalization: e.target.value as Normalization })}>
          {(Object.keys(NORMALIZATION_LABELS) as Normalization[]).map((k) => (
            <option key={k} value={k}>{NORMALIZATION_LABELS[k]}</option>
          ))}
        </select>
        <span className="field-note">{NORM_FORMULA[o.normalization]}</span>
      </label>
      <div className="wizard-row">
        <label className="field field-num">
          <span>Z′ at least</span>
          <input inputMode="decimal" disabled={readOnly} defaultValue={o.zLimit} aria-label="Z′ limit"
            onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) set({ zLimit: v }); }} />
        </label>
        <label className="field field-num">
          <span>CV at most (%)</span>
          <input inputMode="decimal" disabled={readOnly} defaultValue={o.cvLimit} aria-label="CV limit"
            onBlur={(e) => { const v = Number(e.target.value); if (v > 0) set({ cvLimit: v }); }} />
        </label>
        <label className="field">
          <span>Edge check on</span>
          <select value={o.edgeRole} disabled={readOnly}
            onChange={(e) => set({ edgeRole: e.target.value as EdgeRole })}>
            <option value="negative">Vehicle wells</option>
            <option value="positive">Kill-control wells</option>
            <option value="all">Every well (uniformity plate)</option>
            <option value="sample">Compound wells (confounded with dose)</option>
          </select>
        </label>
      </div>
    </>
  );
}

const NORM_FORMULA: Record<Normalization, string> = {
  percent_of_control: "100 × (S − blank) / (vehicle − blank); blank = mean of the blank wells (0 without them).",
  percent_activity: "100 × (S − positive) / (vehicle − positive): the controls define 100% and 0%.",
  percent_inhibition: "100 × (vehicle − S) / (vehicle − positive): the controls define 0% and 100%.",
  inhibition_vs_blank: "100 − 100 × (S − blank) / (vehicle − blank).",
  none: "S − blank, in the reader's units.",
};

function OutputFields({ o, set, readOnly }: {
  o: PlateOptions; set: (p: Partial<PlateOptions>) => void; readOnly?: boolean;
}) {
  return (
    <>
      <fieldset className="field-radios">
        <legend>With more than one plate</legend>
        {([
          ["pooled", "One XY table: each compound once, the plates' replicates side by side"],
          ["combined", "One XY table: a data set per compound and plate"],
          ["per_plate", "One XY table per plate"],
        ] as [OutputMode, string][]).map(([k, label]) => (
          <label key={k}>
            <input type="radio" name="plate-output" checked={o.outputMode === k} disabled={readOnly}
              onChange={() => set({ outputMode: k })} /> {label}
          </label>
        ))}
      </fieldset>
      <label className="check-row">
        <input type="checkbox" checked={o.constrain} disabled={readOnly || o.normalization === "none"}
          onChange={(e) => set({ constrain: e.target.checked })} />
        Constrain Top = 100 and Bottom = 0 in the curve fit
      </label>
      <label className="field field-num">
        <span>Concentration unit</span>
        <input defaultValue={o.unit} disabled={readOnly} aria-label="Concentration unit"
          onBlur={(e) => set({ unit: e.target.value.trim() || "µM" })} />
      </label>
    </>
  );
}

function ConstrainNote({ o }: { o: PlateOptions }) {
  return (
    <div className="wizard-explain">
      <p>
        <strong>Constrain Top = 100 and Bottom = 0?</strong> Normalising sets the scale;
        constraining is a separate decision. Hold the plateaus at 100 and 0 only when the
        controls really define them ({o.normalization === "percent_activity"
          || o.normalization === "percent_inhibition"
          ? "here both controls are on the plate, so it is reasonable"
          : "with % of vehicle the kill control rarely sits at exactly 0%, so the default leaves them free"})
        and the curve does not reach a plateau within the doses tested. With well-defined plateaus
        in the data, fit them (curve-fitting guidance of the GraphPad Prism guide, "normalizing
        dose-response data").
      </p>
      <p>
        <strong>Relative vs absolute IC50.</strong> The fit reports the relative IC50: the
        concentration halfway between the fitted Top and Bottom. The absolute IC50 (GI50) is
        where the curve crosses 50% of control; it is undefined when the curve never gets
        there. Report which one you give, and keep the IC50 inside the tested range.
      </p>
    </div>
  );
}

// ------------------------------------------------------------ wizard

function PlateWizard({ start, table, options, tableName, hasOutputs, onClose, onFinish }: {
  start: number;
  table: DataTableModel;
  options: PlateOptions;
  tableName: string;
  hasOutputs: boolean;
  onClose: () => void;
  onFinish: (o: PlateOptions, table: DataTableModel | null) => void;
}) {
  const [o, setO] = useState<PlateOptions>(options);
  const [newTable, setNewTable] = useState<typeof table | null>(null);
  const t = newTable ?? table;
  const set = (patch: Partial<PlateOptions>) => setO((prev) => ({ ...prev, ...patch }));
  const plates = platesOf(t, o.format);
  const hasValues = plates.some((g) => g.some((r) => r.some((v) => v !== null)));
  const problem = mapProblem(o.wells, o.normalization);

  return (
    <Wizard title="Plate reader → dose-response" start={start} onClose={onClose}
      finishLabel={hasOutputs ? "Update the linked tables" : "Create the linked tables"}
      onFinish={() => onFinish(o, newTable)}
      steps={[
        {
          id: "data", title: "Plate readings",
          blocker: hasValues ? null : "Paste or import at least one plate (or type the readings into the table).",
          render: () => (
            <ImportStep table={t} format={o.format}
              onFormat={(format) => set({ format, wells: format === o.format ? o.wells : {} })}
              onTable={(nt, format) => {
                setNewTable(nt);
                if (format !== o.format) set({ format, wells: {} });
              }} />
          ),
        },
        {
          id: "map", title: "Plate map", blocker: problem,
          render: () => (
            <>
              <p className="hint-block">
                Mark the blank (medium only), vehicle (negative control = 100% signal) and kill or
                positive control wells, then each compound's concentration series. One map serves
                every plate in the table.
              </p>
              <PlateMapEditor format={o.format} wells={o.wells} unit={o.unit || "µM"}
                values={plates[0]} onChange={(wells) => set({ wells })} />
            </>
          ),
        },
        {
          id: "qc", title: "Normalisation and QC",
          render: () => (
            <>
              <NormalizationFields o={o} set={set} />
              <h4>Plate QC with these settings</h4>
              <QcPreview table={t} options={o} />
            </>
          ),
        },
        {
          id: "out", title: "Dose-response tables",
          render: () => (
            <>
              <OutputFields o={o} set={set} />
              <ConstrainNote o={o} />
              <p className="hint-block">
                Each linked XY table is fitted with “{decreasing(o.normalization)
                  ? "log(inhibitor) vs. response" : "log(agonist) vs. response"}, variable
                slope (four parameters)” on the concentrations ({o.unit || "µM"}), log-transformed
                by the fit. They stay linked to {tableName}: edit a reading or this map and the
                tables, fits and graphs follow.
              </p>
            </>
          ),
        },
      ]} />
  );
}

function ImportStep({ table, format, onFormat, onTable }: {
  table: DataTableModel;
  format: PlateFormat;
  onFormat: (f: PlateFormat) => void;
  onTable: (t: DataTableModel, f: PlateFormat) => void;
}) {
  const [text, setText] = useState("");
  const [append, setAppend] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const current = platesOf(table, format);
  const filled = current.filter((g) => g.some((r) => r.some((v) => v !== null))).length;

  const take = (matrices: string[][][]) => {
    const found = findPlates(matrices);
    if (!found.plates.length) {
      setMsg("No plate block was found: the export needs rows labelled A, B, C … with the "
        + "readings beside them, or a bare 8 × 12 (16 × 24) grid of numbers.");
      return;
    }
    const keep = append && found.format === format ? current.slice(0, filled) : [];
    const plates = [...keep, ...found.plates];
    onTable(plateTable(plates, found.format), found.format);
    setMsg(`Read ${found.plates.length} plate${found.plates.length === 1 ? "" : "s"} of `
      + `${found.format} wells${keep.length ? `, after the ${keep.length} already in the table` : ""}.`);
  };

  return (
    <>
      <p>
        The table holds {filled || "no"} plate{filled === 1 ? "" : "s"} of {format} wells.
        Paste a reader export below, choose a file, or type straight into the data table
        (rows A–{format === 384 ? "P" : "H"}, columns 1–{format === 384 ? 24 : 12}; a further
        plate goes below the first).
      </p>
      <div className="wizard-row">
        <label className="field">
          <span>Plate format</span>
          <select value={format} aria-label="Plate format"
            onChange={(e) => onFormat(Number(e.target.value) === 384 ? 384 : 96)}>
            <option value={96}>96 wells (8 × 12)</option>
            <option value={384}>384 wells (16 × 24)</option>
          </select>
        </label>
        <label className="field">
          <span>Reader file (.csv, .txt or .xlsx)</span>
          <input type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,text/plain" aria-label="Reader file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              try {
                const bytes = new Uint8Array(await f.arrayBuffer());
                if (/\.xlsx$/i.test(f.name)) {
                  const sheets = await readXlsx(bytes);
                  take(sheets.map((s) => (s.rows as unknown[][]).map((r) => r.map((c) => (c == null ? "" : String(c))))));
                } else {
                  take([parseSource(new TextDecoder("utf-8").decode(bytes))]);
                }
              } catch (err) {
                setMsg(`Could not read the file: ${err instanceof Error ? err.message : String(err)}`);
              } finally { setBusy(false); }
            }} />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={append} onChange={(e) => setAppend(e.target.checked)} />
          Add to the plates already in the table
        </label>
      </div>
      <label className="field">
        <span>…or paste the plate grid(s)</span>
        <textarea className="wizard-paste" value={text} aria-label="Paste plate grid"
          placeholder={"\t1\t2\t3\t…\nA\t0.046\t1.216\t0.154\t…\nB\t…"}
          onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="assay-setup">
        <button type="button" disabled={!text.trim() || busy} onClick={() => take([parseSource(text)])}>
          Read pasted plates
        </button>
        {msg && <span className="hint-block" role="status">{msg}</span>}
      </div>
    </>
  );
}

function QcPreview({ table, options }: {
  table: DataTableModel; options: PlateOptions;
}) {
  const [run, setRun] = useState<PlateRun | null>(null);
  const key = useMemo(() => JSON.stringify([options, table]), [options, table]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const engine = await getEngine();
      const r = runPlateQc((p) => engine.analyze(p), table, options);
      if (live) setRun(r);
    }, 150);
    return () => { live = false; clearTimeout(timer); };
  }, [key]);
  if (!run) return <p className="hint-block">Computing…</p>;
  if (run.error) return <div className="results-error">{run.error}</div>;
  return (
    <table className="results-table">
      <thead>
        <tr><th scope="col">Plate</th><th scope="col">Z′</th><th scope="col">Category</th>
          <th scope="col">Vehicle CV</th><th scope="col">Kill CV</th><th scope="col">QC</th></tr>
      </thead>
      <tbody>
        {(run.plates ?? []).map((p: any, k: number) => (
          <tr key={k}>
            <th scope="row">Plate {k + 1}</th>
            {p.error ? <td colSpan={5}>{String(p.error)}</td> : (
              <>
                <td>{num(p.qc?.z_prime, 3)}</td>
                <td>{p.qc?.category ?? "n/a"}</td>
                <td>{pct(p.qc?.negative?.cv_pct)}</td>
                <td>{pct(p.qc?.positive?.cv_pct)}</td>
                <td><Pass ok={p.passed} />{p.qc_flags?.length ? ` ${p.qc_flags.join("; ")}` : ""}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ------------------------------------------------------------ results

export function PlateResults({ sheet, options, result }: ResultsProps<PlateOptions, PlateRun>) {
  const a = useAssay<PlateOptions>(sheet);
  const [k, setK] = useState(0);
  if (!result) return null;
  if (result.error) {
    return (
      <div className="result-card assay-results">
        <h3>Plate QC</h3>
        <div className="results-error">{result.error}</div>
      </div>
    );
  }
  const plates = result.plates ?? [];
  const at = Math.min(k, plates.length - 1);
  const p = plates[at];
  return (
    <div className="result-card assay-results plate-results">
      <h3>Plate QC</h3>
      <p className="model-line">
        {plates.length} plate{plates.length === 1 ? "" : "s"} of {result.format} wells;
        {" "}{NORMALIZATION_LABELS[options.normalization]}. Limits: Z′ ≥ {options.zLimit},
        control and replicate CV ≤ {options.cvLimit}%.
      </p>
      {plates.length > 1 && (
        <>
          <table className="results-table">
            <thead>
              <tr><th scope="col">Plate</th><th scope="col">Z′</th><th scope="col">Robust Z′</th>
                <th scope="col">S/B</th><th scope="col">QC</th></tr>
            </thead>
            <tbody>
              {plates.map((x: any, i: number) => (
                <tr key={i} className={x.error || !x.passed ? "qc-row-fail" : ""}>
                  <th scope="row">Plate {i + 1}</th>
                  <td>{num(x.qc?.z_prime, 3)}</td>
                  <td>{num(x.qc?.robust_z_prime, 3)}</td>
                  <td>{num(x.qc?.signal_to_background, 3)}</td>
                  <td><Pass ok={x.error ? false : x.passed} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="assay-tabs" role="group" aria-label="Plate">
            {plates.map((_: unknown, i: number) => (
              <button key={i} type="button" aria-pressed={i === at} onClick={() => setK(i)}>
                Plate {i + 1}
              </button>
            ))}
          </div>
        </>
      )}
      {p.error ? <div className="results-error">{String(p.error)}</div> : <PlateQcCard p={p} />}
      <h4>Linked dose-response tables</h4>
      <LinkedOutputs outputs={a.outputs}
        onMake={a.outputs.length ? undefined
          : () => { void a.commit(options, null, specsFor(a.tableName)); }}
        makeLabel="Make the linked dose-response tables" />
      <p className="assay-cite">
        Z′ = 1 − 3(SD<sub>vehicle</sub> + SD<sub>kill</sub>) / |mean<sub>vehicle</sub> −
        mean<sub>kill</sub>| (Zhang, Chung &amp; Oldenburg 1999, J Biomol Screen 4:67): 1 ideal,
        0.5 to 1 excellent, 0 to 0.5 marginal, below 0 screening impossible. Robust Z′ uses the
        median and 1.4826 × MAD. Signal window and S/B as in the NCATS Assay Guidance Manual
        (HTS assay validation).
      </p>
    </div>
  );
}

function PlateQcCard({ p }: { p: any }) {
  const qc = p.qc ?? {};
  const edge = p.edge_effect ?? {};
  const ev = edge.edge_vs_interior;
  const flagged = (p.replicate_cv ?? []).filter((e: any) => e.flag);
  return (
    <>
      <div className="assay-summary">
        <Pass ok={p.passed} yes="Plate passes QC" no="Plate fails QC" />
        {(p.qc_flags ?? []).map((f: string) => <Chip key={f} tone="fail">{f}</Chip>)}
      </div>
      <div className="plate-qc-grid">
        <div className="assay-stat"><span>Z′</span><strong>{num(qc.z_prime, 3) || "n/a"}</strong>
          <span>{qc.category ?? ""}</span></div>
        <div className="assay-stat"><span>Robust Z′</span><strong>{num(qc.robust_z_prime, 3) || "n/a"}</strong></div>
        <div className="assay-stat"><span>Signal / background</span><strong>{num(qc.signal_to_background, 3) || "n/a"}</strong></div>
        <div className="assay-stat"><span>Signal window</span><strong>{num(qc.signal_window, 3) || "n/a"}</strong></div>
        <div className="assay-stat"><span>Signal / noise</span><strong>{num(qc.signal_to_noise, 3) || "n/a"}</strong></div>
      </div>
      <KV rows={[
        ["Blank (medium)", qc.blank?.n ? `${num(qc.blank.mean)} (n = ${qc.blank.n})` : "none (blank = 0)"],
        ["Vehicle (negative control)", qc.negative?.n
          ? `${num(qc.negative.mean)} ± ${num(qc.negative.sd)} SD, CV ${pct(qc.negative.cv_pct)} (n = ${qc.negative.n})` : "none"],
        ["Kill / positive control", qc.positive?.n
          ? `${num(qc.positive.mean)} ± ${num(qc.positive.sd)} SD, CV ${pct(qc.positive.cv_pct)} (n = ${qc.positive.n})` : "none"],
      ]} />
      <h4>Replicate CV by compound and concentration</h4>
      {flagged.length === 0 && (
        <p className="hint-block">Every compound/concentration group is within the CV limit.</p>
      )}
      <div className="results-scroll">
        <table className="results-table">
          <thead>
            <tr><th scope="col">Compound</th><th scope="col">Concentration</th><th scope="col">n</th>
              <th scope="col">Mean signal</th><th scope="col">CV (signal)</th>
              <th scope="col">Mean normalised</th><th scope="col">SD</th><th scope="col">Wells</th></tr>
          </thead>
          <tbody>
            {(p.replicate_cv ?? []).map((e: any) => (
              <tr key={`${e.compound}-${e.concentration}`} className={e.flag ? "qc-row-fail" : ""}>
                <th scope="row">{e.compound}</th>
                <td>{num(e.concentration)}</td>
                <td>{e.n}</td>
                <td>{num(e.mean_raw)}</td>
                <td className={e.flag ? "qc-cell-fail" : ""}>{pct(e.cv_raw_pct)}</td>
                <td>{num(e.mean_normalized)}</td>
                <td>{num(e.sd_normalized)}</td>
                <td>{(e.wells ?? []).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h4>Edge effect ({edgeRoleText(edge.role)})</h4>
      {ev ? (
        <KV rows={[
          ["Outer ring vs interior", `${num(ev.mean_edge)} vs ${num(ev.mean_interior)} `
            + `(${num(ev.difference_pct, 3)}%), Welch t = ${num(ev.t, 3)}, df = ${num(ev.df, 3)}, `
            + `P = ${num(ev.p, 3)}`],
          ["Rows (one-way ANOVA)", edge.rows?.anova ? `P = ${num(edge.rows.anova.p, 3)}` : "n/a"],
          ["Columns (one-way ANOVA)", edge.columns?.anova ? `P = ${num(edge.columns.anova.p, 3)}` : "n/a"],
        ]} />
      ) : (
        <p className="hint-block">
          Needs at least two {edgeRoleText(edge.role)} on the outer ring and two inside
          ({edge.n_edge ?? 0} and {edge.n_interior ?? 0} here).
        </p>
      )}
      <Warnings items={p.warnings} />
    </>
  );
}

function edgeRoleText(role: unknown): string {
  return role === "positive" ? "kill-control wells" : role === "all" ? "all wells"
    : role === "sample" ? "compound wells" : "vehicle wells";
}

// ------------------------------------------------------------ methods

export function PlateMethods({ options, result }: ResultsProps<PlateOptions, PlateRun>) {
  if (!result || result.error) return null;
  const o = normalizePlateOptions(options);
  const plates = result.plates ?? [];
  const p0 = plates.find((p: any) => !p.error) ?? {};
  const nBlank = p0.qc?.blank?.n ?? 0;
  const norm: Record<Normalization, string> = {
    percent_of_control: "expressed as percent of the vehicle control, 100 × (signal − blank)/(vehicle − blank)",
    percent_activity: "expressed as percent activity, 100 × (signal − positive control)/(vehicle − positive control)",
    percent_inhibition: "expressed as percent inhibition, 100 × (vehicle − signal)/(vehicle − positive control)",
    inhibition_vs_blank: "expressed as percent inhibition, 100 − percent of the blank-corrected vehicle control",
    none: "blank-subtracted",
  };
  const text = `Plate reads (${plates.length} plate${plates.length === 1 ? "" : "s"}, ${o.format} wells) were `
    + `${nBlank ? `corrected by the mean of ${nBlank} medium blank wells and ` : ""}${norm[o.normalization]}. `
    + `Plate quality was assessed with the Z′ factor (Zhang, Chung & Oldenburg 1999) and its robust form `
    + `(median and scaled MAD), the signal-to-background ratio and signal window (NCATS Assay Guidance `
    + `Manual), control and replicate coefficients of variation, and an edge-effect check (outer ring vs `
    + `interior wells, Welch t test); plates were accepted at Z′ ≥ ${o.zLimit} and CV ≤ ${o.cvLimit}%. `
    + `Normalised responses were fitted against concentration (${o.unit || "µM"}, log-transformed) with a `
    + `four-parameter logistic model (${decreasing(o.normalization) ? "log(inhibitor)" : "log(agonist)"} vs. `
    + `response, variable slope)${o.constrain && o.normalization !== "none"
      ? " with Top and Bottom constrained to 100 and 0" : " with Top and Bottom fitted"}; IC50 values are `
    + `relative (midway between the fitted plateaus). Analysed in OpenDose.`;
  return <CopyableMethods text={text} />;
}
