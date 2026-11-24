// Standard curve / ELISA: controls with the setup wizard, the QC results
// sheet (ICH M10 acceptance, back-calculated standards, LLOQ / ULOQ,
// unknowns with flags, parallelism) and the methods text.
import { useEffect, useState, type ReactNode } from "react";
import { runEngine } from "../../../lib/engine";
import type { DataTableModel } from "../../../project/types";
import CopyableMethods from "../../common/CopyableMethods";
import type { ControlsProps, ResultsProps } from "../../types";
import { columnNames, resolveColumns } from "../kit/columns";
import { takeWizardRequest } from "../kit/create";
import { interval, num, pct } from "../kit/format";
import { Chip, ColumnPicker, KV, LinkedOutputs, Note, Pass, Warnings } from "../kit/ui";
import { useAssay, type SpecsFor } from "../kit/useAssay";
import Wizard from "../kit/Wizard";
import {
  columnSettings, concentrationTable, isInterpolating, MODEL_LABELS, readRows, runStdCurve, signalColumns,
  STD_ROLES, type StdModel, type StdOptions, type StdRow, type StdRun, type Weighting,
} from "./model";
import { Button, NumberField } from "../../../components/ui";
import { PrecisionReport } from "./precisionPanel";

/* eslint-disable @typescript-eslint/no-explicit-any */

const specsFor = (tableName: string): SpecsFor<StdOptions> => (engine, table, o) => {
  const run = runStdCurve((p) => engine.analyze(p), table, o);
  const t = concentrationTable(run, o);
  return t ? [{
    key: "concentrations", name: `Concentrations of ${tableName}`, table: t,
    configure: (prev: unknown) => columnSettings(prev, t),
  }] : [];
};

// ------------------------------------------------------------ controls

export function StdControls({ sheet, table, options: o, readOnly }: ControlsProps<StdOptions>) {
  const a = useAssay<StdOptions>(sheet);
  const [wizardAt, setWizardAt] = useState<number | null>(() => (takeWizardRequest(sheet.id) ? 0 : null));
  const set = (patch: Partial<StdOptions>) => a.save({ ...o, ...patch });
  const { rows, problem } = readRows(table, o);
  const levels = new Set(rows.filter((r) => r.kind === "standard").map((r) => r.conc)).size;
  return (
    <div className="controls assay-controls">
      <section>
        <h3>Standard curve / ELISA</h3>
        <div className="assay-setup">
          <Button variant="primary" disabled={readOnly}
            onClick={() => setWizardAt(0)}>Open setup wizard…</Button>
        </div>
        <p className="hint-block">
          {levels} standard level{levels === 1 ? "" : "s"}, {rows.filter((r) => r.kind === "blank").length} blank
          {" "}row(s), {lowCount(rows)}{rows.filter((r) => r.kind === "unknown").length} unknown row(s).
        </p>
        {problem && <p className="wizard-blocker">{problem}</p>}
      </section>
      <section>
        <h3>Curve</h3>
        <ModelFields o={o} set={set} readOnly={readOnly} />
      </section>
      {o.excludeLevels.length > 0 && (
        <section>
          <h3>Standards left out of the fit</h3>
          <div className="assay-chips">
            {o.excludeLevels.map((c) => (
              <Button key={c} disabled={readOnly}
                onClick={() => set({ excludeLevels: o.excludeLevels.filter((x) => x !== c) })}>
                {c} {o.unit}: put back
              </Button>
            ))}
          </div>
        </section>
      )}
      <section>
        <h3>Concentrations table</h3>
        <LinkedOutputs outputs={a.outputs}
          onMake={readOnly || problem || a.outputs.length ? undefined
            : () => { void a.commit(o, null, specsFor(a.tableName)); }}
          makeLabel="Make the linked concentrations table"
          hint="A column table of the reportable concentrations per group, ready for a t test or ANOVA and a dot plot." />
      </section>
      {wizardAt !== null && (
        <StdWizard start={wizardAt} table={table} options={o} tableName={a.tableName}
          hasOutputs={a.outputs.length > 0} onClose={() => setWizardAt(null)}
          onFinish={(opts) => { setWizardAt(null); void a.commit(opts, null, specsFor(a.tableName)); }} />
      )}
    </div>
  );
}

/** "3 low-level row(s), " when the table has Low rows, else "". */
function lowCount(rows: StdRow[]): string {
  const n = rows.filter((r) => r.kind === "low").length;
  return n ? `${n} low-level row(s), ` : "";
}

function ModelFields({ o, set, readOnly }: {
  o: StdOptions; set: (p: Partial<StdOptions>) => void; readOnly?: boolean;
}) {
  return (
    <>
      <label className="field">
        <span>Model</span>
        <select value={o.model} disabled={readOnly} aria-label="Standard curve model"
          onChange={(e) => set({ model: e.target.value as StdModel })}>
          {(Object.keys(MODEL_LABELS) as StdModel[]).map((m) => <option key={m} value={m}>{MODEL_LABELS[m]}</option>)}
        </select>
      </label>
      {isInterpolating(o.model) && (
        <p className="hint-block">
          A curve through the mean signal of each standard: no parameters, no weighting and no
          confidence interval for the unknowns. Use it when the kit insert prescribes it; otherwise a 4PL
          or 5PL fit gives CIs and tests parallelism.
        </p>
      )}
      <div className="wizard-row">
        {!isInterpolating(o.model) && (
          <label className="field">
            <span>Weighting</span>
            <select value={o.weighting} disabled={readOnly} aria-label="Weighting"
              onChange={(e) => set({ weighting: e.target.value as Weighting })}>
              <option value="none">None (ordinary least squares)</option>
              <option value="1/Y">1/Y</option>
              <option value="1/Y2">1/Y²</option>
            </select>
          </label>
        )}
        <label className="field">
          <span>Blank</span>
          <select value={o.blank} disabled={readOnly} aria-label="Blank"
            onChange={(e) => set({ blank: e.target.value as StdOptions["blank"] })}>
            <option value="zero_standard">Subtract the mean of the blank rows</option>
            <option value="value">Subtract a value</option>
            <option value="none">Use signals as read</option>
          </select>
        </label>
        {o.blank === "value" && (
          <label className="field field-num">
            <span>Blank value</span>
            <input defaultValue={o.blankValue} disabled={readOnly} inputMode="decimal"
              onBlur={(e) => set({ blankValue: e.target.value })} />
          </label>
        )}
        {(o.model === "4pl" || o.model === "5pl") && (
          <label className="field field-num">
            <span>Bottom = (blank: fitted)</span>
            <input defaultValue={o.bottom} disabled={readOnly} inputMode="decimal" aria-label="Bottom constant"
              onBlur={(e) => set({ bottom: e.target.value.trim() })} />
          </label>
        )}
        {(o.model === "linear" || isInterpolating(o.model)) && (
          <label className="check-row">
            <input type="checkbox" checked={o.logX} disabled={readOnly}
              onChange={(e) => set({ logX: e.target.checked })} /> Fit on log(concentration)
          </label>
        )}
        <label className="field field-num">
          <span>Unit</span>
          <input defaultValue={o.unit} disabled={readOnly} aria-label="Concentration unit"
            onBlur={(e) => set({ unit: e.target.value.trim() || "units" })} />
        </label>
      </div>
    </>
  );
}

function NumField({ label, value, onChange, step }: {
  label: string; value: number; onChange: (v: number) => void; step?: string;
}) {
  return (
    <label className="field field-num">
      <span>{label}</span>
      <input inputMode="decimal" defaultValue={value} aria-label={label} step={step}
        onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) onChange(v); }} />
    </label>
  );
}

// ------------------------------------------------------------ wizard

function StdWizard({ start, table, options, tableName, hasOutputs, onClose, onFinish }: {
  start: number; table: DataTableModel; options: StdOptions; tableName: string; hasOutputs: boolean;
  onClose: () => void; onFinish: (o: StdOptions) => void;
}) {
  const [o, setO] = useState(options);
  const set = (patch: Partial<StdOptions>) => setO((p) => ({ ...p, ...patch }));
  const { rows, problem } = readRows(table, o);
  const isXY = table.type === "xy";
  const resolved = resolveColumns(table, STD_ROLES, o.columns);
  const sig = isXY ? [] : signalColumns(table, o, Object.values(resolved));
  const names = columnNames(table);
  return (
    <Wizard title="Standard curve / ELISA" start={start} onClose={onClose}
      finishLabel={hasOutputs ? "Save settings" : "Create the concentrations table"}
      onFinish={() => onFinish(o)}
      steps={[
        {
          id: "layout", title: "Layout", blocker: problem,
          render: () => (
            <>
              <p className="wizard-explain">
                {isXY
                  ? <>This XY table is read as standards (X = concentration, 0 = blank) and unknowns
                    (rows without X, named by their row title); the first data set holds the replicate
                    signals and a data set called <strong>Dilution</strong> the dilution factors.</>
                  : <>One row per standard level, blank or unknown sample dilution. The
                    <strong> standards block</strong> needs a concentration and the replicate signals;
                    the <strong>unknowns block</strong> a name, the signals and its dilution factor
                    (1 = neat). Give a Group to get a concentrations table per group, and a Plate to
                    fit one curve per plate. Mark a sample at several dilutions with the same name to
                    check parallelism.</>}
              </p>
              {!isXY && (
                <>
                  <ColumnPicker table={table} specs={STD_ROLES} choice={o.columns} resolved={resolved}
                    onChange={(columns) => set({ columns })} />
                  <fieldset className="field-radios">
                    <legend>Replicate signal columns</legend>
                    <div className="gene-picks">
                      {names.map((n, i) => (
                        <label key={`${n}-${i}`}>
                          <input type="checkbox" checked={sig.includes(i)}
                            onChange={(e) => {
                              const cur = sig.map((j) => names[j]);
                              set({ signals: e.target.checked ? [...cur, n] : cur.filter((x) => x !== n) });
                            }} /> {n}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </>
              )}
              <p className="hint-block">
                Read {new Set(rows.filter((r) => r.kind === "standard").map((r) => r.conc)).size} standard
                levels, {rows.filter((r) => r.kind === "blank").length} blank row(s), {lowCount(rows)}and
                {" "}{rows.filter((r) => r.kind === "unknown").length} unknown row(s)
                {new Set(rows.map((r) => r.plate).filter(Boolean)).size > 1
                  ? ` on ${new Set(rows.map((r) => r.plate).filter(Boolean)).size} plates` : ""}.
              </p>
            </>
          ),
        },
        {
          id: "model", title: "Model",
          render: () => (
            <>
              <ModelFields o={o} set={set} />
              <div className="wizard-explain">
                <p>
                  <strong>4PL</strong> on log(concentration) is the usual immunoassay curve. Use
                  <strong> 5PL</strong> only for asymmetry that recurs from run to run, not to chase one
                  odd standard. Choose the <strong>weighting</strong> by the back-calculated accuracy of
                  the standards (signals whose scatter grows with the mean usually need 1/Y²); R² close
                  to 1 does not show that a curve is right.
                </p>
                <p>
                  Choose <strong>Cubic spline</strong> or <strong>Point to point</strong> only when the kit
                  insert prescribes it: the curve passes through every standard&apos;s mean, so recoveries
                  are near 100% by construction and the unknowns get no confidence interval.
                </p>
              </div>
            </>
          ),
        },
        {
          id: "accept", title: "Acceptance",
          render: () => (
            <>
              <p className="wizard-explain">
                ICH M10 (2022), ligand-binding assays: back-calculated standards within ±20% of
                nominal (±25% at the LLOQ and ULOQ), CV within 20% (25%); at least 75% of the
                standards and six levels must pass. The LLOQ and ULOQ are the lowest and highest
                passing levels; unknowns outside them are reported as &lt;LLOQ or &gt;ULOQ, never
                as extrapolated numbers.
              </p>
              <div className="wizard-row">
                <NumField label="Accuracy (±%)" value={o.accuracy} onChange={(v) => set({ accuracy: v })} />
                <NumField label="At LLOQ / ULOQ (±%)" value={o.accuracyEnds} onChange={(v) => set({ accuracyEnds: v })} />
                <NumField label="Precision CV (%)" value={o.precision} onChange={(v) => set({ precision: v })} />
                <NumField label="At LLOQ / ULOQ (%)" value={o.precisionEnds} onChange={(v) => set({ precisionEnds: v })} />
                <NumField label="Standards passing (fraction)" value={o.minFraction} onChange={(v) => set({ minFraction: v })} />
                <NumField label="Levels passing (at least)" value={o.minLevels} onChange={(v) => set({ minLevels: v })} />
              </div>
              <div className="wizard-row">
                <NumField label="Unknown CV limit (%)" value={o.cvLimit} onChange={(v) => set({ cvLimit: v })} />
                <label className="field">
                  <span>Unknown CV on</span>
                  <select value={o.cvBasis} onChange={(e) => set({ cvBasis: e.target.value as StdOptions["cvBasis"] })}>
                    <option value="concentration">Interpolated concentrations</option>
                    <option value="signal">Signals</option>
                  </select>
                </label>
                <NumField label="Parallelism CV limit (%)" value={o.parallelismCv} onChange={(v) => set({ parallelismCv: v })} />
              </div>
              <h4>With these settings</h4>
              <AcceptancePreview table={table} options={o} />
            </>
          ),
        },
        {
          id: "limits", title: "Blanks and low samples",
          render: () => <LimitsStep table={table} o={o} set={set} rows={rows} />,
        },
        {
          id: "precision", title: "Precision",
          render: () => <PrecisionStep table={table} o={o} set={set} rows={rows} />,
        },
        {
          id: "out", title: "Outputs",
          render: () => (
            <p className="wizard-explain">
              The results sheet shows the curve with the standards and the quantification range
              shaded, the back-calculated recovery of every level (pass / fail), the acceptance
              decision with its reasons, and every unknown with its interpolated and
              dilution-corrected concentration and flags. A linked column table of the reportable
              concentrations per group follows {tableName}; it opens with a{" "}
              {"t test (two groups) or one-way ANOVA (more)"} and a dot plot.
            </p>
          ),
        },
      ]} />
  );
}

/** The engine run of the wizard's draft settings, 150 ms after they settle. */
function usePreviewRun(table: DataTableModel, options: StdOptions): StdRun | null {
  const [run, setRun] = useState<StdRun | null>(null);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const r = await runEngine((engine) => runStdCurve((p) => engine.analyze(p), table, options),
        { priority: "user" }).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
      if (live) setRun(r);
    }, 150);
    return () => { live = false; clearTimeout(timer); };
  }, [table, options]);
  return run;
}

const EP17_NOTE = "CLSI EP17-A2 (2012), parametric, as Armbruster & Pry (2008) write it: "
  + "LoB = mean of the blanks + 1.645 SD of the blanks; LoD = LoB + 1.645 SD of the low-level samples "
  + "(pooled over the samples); both assume normally distributed signals. LoQ is the lowest low-level "
  + "sample whose back-calculated concentrations meet the CV goal at or above the LoD (functional "
  + "sensitivity). EP17-A2 asks for at least 60 blank and 60 low-sample replicates per reagent lot to "
  + "establish the LoB and LoD, and 20 of each to verify a stated value.";

/** The wizard's Precision step (P-94): which samples make the report and
 *  the ICH M10 acceptance limits for them, with the report itself. */
function PrecisionStep({ table, o, set, rows }: {
  table: DataTableModel; o: StdOptions; set: (p: Partial<StdOptions>) => void; rows: StdRow[];
}) {
  const plates = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.kind !== "unknown" || !r.plate) continue;
    plates.set(r.name, (plates.get(r.name) ?? new Set()).add(r.plate));
  }
  const qc = [...plates.entries()].filter(([, p]) => p.size > 1).map(([n]) => n);
  const run = usePreviewRun(table, o);
  const num_ = (v: string, key: "qcAccuracy" | "qcCv") => {
    const x = Number(v.replace(",", "."));
    if (v.trim() && Number.isFinite(x) && x > 0) set({ [key]: x });
  };
  return (
    <>
      <p className="wizard-explain">
        A sample measured on two or more plates (a QC typed <strong>QC</strong> or <strong>Unknown</strong>,
        the same name on every plate) gets a precision report: each plate is a run and its replicates
        the within-run scatter, so the report gives the repeatability (within-run), between-run and
        total CV with their confidence intervals (CLSI EP05-A3), and a <strong>Day</strong> column
        separates between-day from between-run. Type the nominal concentration in the Concentration
        column of its rows to get its recovery. ICH M10 accepts a QC whose mean is within ±15% of
        nominal with within-run and between-run CV at most 15% (±20% and 20% at the LLOQ).
      </p>
      <p className="hint-block">
        {qc.length ? `Precision samples: ${qc.join(", ")}.`
          : "No sample is on two or more plates yet: give each run its own Plate and repeat the QC rows on every plate."}
      </p>
      <div className="wizard-row">
        <NumberField label="Recovery within" unit="±%" min={0} defaultValue={String(o.qcAccuracy)}
          onValueChange={(v) => num_(v, "qcAccuracy")} />
        <NumberField label="CV at most" unit="%" min={0} defaultValue={String(o.qcCv)}
          onValueChange={(v) => num_(v, "qcCv")} />
      </div>
      {run && !run.error && run.precision && (
        <>
          <h4>With these settings</h4>
          <PrecisionReport p={run.precision} unit={o.unit} />
        </>
      )}
    </>
  );
}

function precisionMethods(p: any, o: StdOptions): string {
  const n = Array.isArray(p?.samples) ? p.samples.filter((s: any) => !s.error).length : 0;
  if (!n) return "";
  return `Precision of the ${n} sample${n === 1 ? "" : "s"} measured on two or more plates was estimated `
    + "from the dilution-corrected replicate concentrations by the ANOVA estimators of the nested random "
    + "model (plate as the run, within day when given; CLSI EP05-A3), negative variance components set to "
    + "zero, with chi-square confidence intervals for the repeatability and total variances (Satterthwaite's "
    + "df for the total) and Wald intervals for the between-run and between-day variances (as the VCA "
    + `package); recovery was the mean over the nominal concentration, accepted within ±${o.qcAccuracy}% `
    + `with within-run and total CV at most ${o.qcCv}% (ICH M10). `;
}

function LimitsStep({ table, o, set, rows }: {
  table: DataTableModel; o: StdOptions; set: (p: Partial<StdOptions>) => void; rows: StdRow[];
}) {
  const blanks = rows.filter((r) => r.kind === "blank").flatMap((r) => r.signals).filter((v) => v !== null).length;
  const lowRows = rows.filter((r) => r.kind === "low");
  const lows = lowRows.flatMap((r) => r.signals).filter((v) => v !== null).length;
  const samples = new Set(lowRows.map((r) => r.name)).size;
  return (
    <>
      <p className="wizard-explain">
        Rows typed <strong>Blank</strong> give the limit of blank (LoB), rows typed <strong>Low</strong> (a
        sample near the detection limit, its replicates as signals or as rows of one name) the limit of
        detection (LoD) and of quantification (LoQ), each in signal and read off the curve as a
        concentration. Without Low rows the results show LLOQ and ULOQ only.
      </p>
      <p className="hint-block">
        {table.type === "xy"
          ? "An XY table has no Low rows: use the module's own layout for detection limits."
          : `Read ${blanks} blank and ${lows} low-level replicate${lows === 1 ? "" : "s"}`
            + `${samples ? ` (${samples} sample${samples === 1 ? "" : "s"})` : ""}.`}
      </p>
      <div className="wizard-row">
        <NumberField label="LoQ goal: CV at most" unit="%" min={0}
          defaultValue={String(o.loqCv)}
          onValueChange={(v) => { const x = Number(v.replace(",", ".")); if (v.trim() && Number.isFinite(x) && x >= 0) set({ loqCv: x }); }} />
        <label className="check-row">
          <input type="checkbox" checked={o.lodCBeta} onChange={(e) => set({ lodCBeta: e.target.checked })} />
          <span>LoD multiplier c<sub>β</sub> = 1.645 / (1 − 1/(4(N − K))) for small runs (CLSI EP17-A2), not 1.645</span>
        </label>
      </div>
      <p className="wizard-explain">{EP17_NOTE}</p>
      {lows > 0 && (
        <>
          <h4>With these settings</h4>
          <LimitsPreview table={table} options={o} />
        </>
      )}
    </>
  );
}

function LimitsPreview({ table, options }: { table: DataTableModel; options: StdOptions }) {
  const run = usePreviewRun(table, options);
  if (!run) return <p className="hint-block">Computing…</p>;
  if (run.error) return <div className="results-error">{run.error}</div>;
  return (
    <ul className="assay-preview">
      {(run.plates ?? []).map(({ plate, res }) => {
        const dl = res?.detection_limits;
        return (
          <li key={plate}>
            {plate ? `Plate ${plate}: ` : ""}
            {res.error ? String(res.error) : !dl ? "no low-level samples on this plate." : (
              <>
                LoB {limitConc(dl.lob, options.unit)}, LoD {limitConc(dl.lod, options.unit)},
                LoQ {dl.loq ? `${num(dl.loq.concentration)} ${options.unit}` : "not reached"}.
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A limit on the concentration scale, or why it has none. */
function limitConc(l: any, unit: string): string {
  if (l?.concentration != null) return `${num(l.concentration)} ${unit}`;
  if (l?.status === "below_curve") return "below the curve";
  if (l?.status === "above_curve") return "above the curve";
  return "undefined";
}

function AcceptancePreview({ table, options }: { table: DataTableModel; options: StdOptions }) {
  const run = usePreviewRun(table, options);
  if (!run) return <p className="hint-block">Computing…</p>;
  if (run.error) return <div className="results-error">{run.error}</div>;
  return (
    <ul className="assay-preview">
      {(run.plates ?? []).map(({ plate, res }) => (
        <li key={plate}>
          {plate ? `Plate ${plate}: ` : ""}
          {res.error ? String(res.error) : (
            <>
              <Pass ok={res.acceptance?.accepted} yes="Run accepted" no="Run rejected" />{" "}
              LLOQ {num(res.quantification_range?.lloq) || "undefined"}, ULOQ{" "}
              {num(res.quantification_range?.uloq) || "undefined"} {options.unit};
              {" "}{res.acceptance?.n_pass} of {res.acceptance?.n_standards} standards and
              {" "}{res.acceptance?.n_levels_pass} of {res.acceptance?.n_levels} levels pass.
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------ results

const FLAG_TEXT: Record<string, [string, "fail" | "warn" | "info"]> = {
  "<LLOQ": ["< LLOQ", "warn"], ">ULOQ": ["> ULOQ", "warn"], extrapolated: ["extrapolated", "fail"],
  outside_curve: ["outside the curve", "fail"], high_cv: ["CV over limit", "fail"],
  ambiguous: ["two concentrations", "fail"],
  replicate_outside_curve: ["a replicate is off the curve", "warn"],
};

function Flags({ flags }: { flags: unknown }) {
  const list = Array.isArray(flags) ? flags as string[] : [];
  if (!list.length) return <Chip tone="pass">ok</Chip>;
  return <>{list.map((f) => <Chip key={f} tone={FLAG_TEXT[f]?.[1] ?? "warn"}>{FLAG_TEXT[f]?.[0] ?? f}</Chip>)}</>;
}

export function StdResults({ sheet, options: o, result }: ResultsProps<StdOptions, StdRun>) {
  const a = useAssay<StdOptions>(sheet);
  const [k, setK] = useState(0);
  if (!result) return null;
  if (result.error) {
    return (
      <div className="result-card assay-results"><h3>Standard curve</h3>
        <div className="results-error">{result.error}</div></div>
    );
  }
  const plates = result.plates ?? [];
  const at = Math.min(k, plates.length - 1);
  const { plate, res } = plates[at];
  const toggle = sheet.frozen ? undefined : (c: number, on: boolean) =>
    a.save({ ...o, excludeLevels: on ? [...o.excludeLevels, c] : o.excludeLevels.filter((x) => x !== c) });
  return (
    <div className="result-card assay-results std-results">
      <h3>Standard curve{plate ? `, plate ${plate}` : ""}</h3>
      {plates.length > 1 && (
        <div className="assay-tabs" role="group" aria-label="Plate">
          {plates.map((p, i) => (
            <button key={p.plate} type="button" aria-pressed={i === at} onClick={() => setK(i)}>
              Plate {p.plate}
            </button>
          ))}
        </div>
      )}
      {(result.notes ?? []).map((n) => <Note key={n}>{n}</Note>)}
      {res.error ? <div className="results-error">{String(res.error)}</div>
        : <StdPlate res={res} o={o} onExclude={toggle} />}
      <PrecisionReport p={result.precision} unit={o.unit} />
      <h4>Concentrations table</h4>
      <LinkedOutputs outputs={a.outputs}
        onMake={a.outputs.length || sheet.frozen ? undefined : () => { void a.commit(o, null, specsFor(a.tableName)); }}
        makeLabel="Make the linked concentrations table" />
    </div>
  );
}

function StdPlate({ res, o, onExclude }: {
  res: any; o: StdOptions; onExclude?: (c: number, on: boolean) => void;
}) {
  const acc = res.acceptance ?? {};
  const q = res.quantification_range ?? {};
  const fit = res.fit ?? {};
  const u = o.unit;
  const params: [string, any][] = Object.entries(fit.params ?? {});
  return (
    <>
      <div className="assay-summary">
        <Pass ok={acc.accepted} yes="Run accepted (ICH M10)" no="Run rejected (ICH M10)" />
        {(acc.reasons ?? []).map((r: string) => <Chip key={r} tone="fail">{r}</Chip>)}
      </div>
      <div className="plate-qc-grid">
        <Stat label={`LLOQ (${u})`} value={num(q.lloq) || "undefined"} />
        <Stat label={`ULOQ (${u})`} value={num(q.uloq) || "undefined"} />
        <Stat label="Dynamic range" value={q.dynamic_range_fold ? `${num(q.dynamic_range_fold, 3)}-fold` : "n/a"} />
        <Stat label="Standards passing" value={`${acc.n_pass ?? 0} / ${acc.n_standards ?? 0}`} />
        <Stat label="Levels passing" value={`${acc.n_levels_pass ?? 0} / ${acc.n_levels ?? 0}`} />
        {res.detection_limits && (
          <>
            <Stat label={`LoB (${u})`} value={limitStat(res.detection_limits.lob)} />
            <Stat label={`LoD (${u})`} value={limitStat(res.detection_limits.lod)} />
            <Stat label={`LoQ (${u})`} value={res.detection_limits.loq ? num(res.detection_limits.loq.concentration) : "not reached"} />
          </>
        )}
      </div>
      {res.detection_limits && <DetectionLimits dl={res.detection_limits} unit={u} />}
      <p className="model-line">
        {fit.label ?? res.model_id}{res.log_x ? ", X = log10(concentration)" : ""};
        {res.no_model_ci ? "" : ` weighting ${res.weighting};`}
        {" "}{res.blank !== null && res.blank !== undefined ? `blank ${num(res.blank)} subtracted` : "no blank subtracted"}
        {res.no_model_ci ? "; an interpolating curve: no parameters, no R², no model CI."
          : `; R² ${num(fit.goodness?.r_squared, 4)} (not a measure of accuracy: see the recoveries).`}
      </p>
      {params.length > 0 && <div className="results-scroll">
        <table className="results-table">
          <thead><tr><th scope="col">Parameter</th><th scope="col">Value</th><th scope="col">SE</th><th scope="col">95% CI</th></tr></thead>
          <tbody>
            {params.map(([name, p]) => (
              <tr key={name}><th scope="row">{name}</th><td>{num(p.value)}</td>
                <td>{p.constrained ? "constant" : num(p.se)}</td><td>{interval(p.ci95)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>}

      <h4>Back-calculated standards</h4>
      <div className="results-scroll">
        <table className="results-table std-levels">
          <thead>
            <tr><th scope="col">Nominal ({u})</th><th scope="col">Mean signal</th><th scope="col">Back-calculated</th>
              <th scope="col">Recovery</th><th scope="col">CV</th><th scope="col">Replicates in limits</th>
              <th scope="col">Level</th><th scope="col">Role</th><th scope="col">Fit</th></tr>
          </thead>
          <tbody>
            {(res.standards ?? []).filter((lv: any) => lv.concentration > 0 || lv.excluded === "excluded by the user").map((lv: any) => {
              const userOut = lv.excluded === "excluded by the user";
              return (
                <tr key={lv.concentration} className={lv.level_pass === false ? "qc-row-fail" : ""}>
                  <th scope="row">{num(lv.concentration)}</th>
                  <td>{num(lv.mean_signal)}</td>
                  <td>{num(lv.mean_back_calc)}</td>
                  <td className={lv.level_pass === false ? "qc-cell-fail" : lv.level_pass ? "qc-cell-pass" : ""}>
                    {pct(lv.recovery_pct)}{lv.accuracy_limit_pct ? ` (±${lv.accuracy_limit_pct}%)` : ""}</td>
                  <td>{pct(lv.cv_back_calc_pct)}</td>
                  <td>{lv.replicate_pass?.length ? `${lv.replicate_pass.filter(Boolean).length} / ${lv.replicate_pass.length}` : ""}</td>
                  <td>{userOut ? <Chip tone="info">left out</Chip> : <Pass ok={lv.level_pass} />}</td>
                  <td>{lv.role ?? ""}</td>
                  <td>
                    {onExclude && (
                      <label className="check-row">
                        <input type="checkbox" checked={!o.excludeLevels.includes(lv.concentration)}
                          aria-label={`Use the ${lv.concentration} standard in the fit`}
                          onChange={(e) => onExclude(lv.concentration, !e.target.checked)} /> use
                      </label>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="assay-cite">
        Criteria: {acc.criteria?.source}. A level passes on its mean recovery, its CV and at least half
        of its replicates; untick a failing standard inside the range to refit without it.
      </p>

      <h4>Unknowns</h4>
      <div className="results-scroll">
        <table className="results-table std-unknowns">
          <thead>
            <tr><th scope="col">Sample</th><th scope="col">Dilution</th><th scope="col">Mean signal</th>
              <th scope="col">Interpolated ({u})</th><th scope="col">95% CI</th>
              <th scope="col">× dilution ({u})</th><th scope="col">CV</th><th scope="col">Flags</th></tr>
          </thead>
          <tbody>
            {(res.unknowns ?? []).map((x: any, i: number) => (
              <tr key={`${x.name}-${i}`} className={x.status !== "ok" ? "qc-row-fail" : ""}>
                <th scope="row">{x.name}</th>
                <td>{num(x.dilution)}</td>
                <td>{num(x.mean_signal)}</td>
                <td>{x.status === "ok" ? num(x.concentration) : x.status}</td>
                <td className={res.no_model_ci && x.status === "ok" ? "std-no-ci" : undefined}>
                  {x.status !== "ok" ? "" : res.no_model_ci ? "no model CI" : interval(x.concentration_ci)}</td>
                <td>{x.status === "ok" ? num(x.corrected) : x.status === "<LLOQ"
                  ? `< ${num(x.lloq_corrected)}` : x.status === ">ULOQ" ? `> ${num(x.uloq_corrected)}` : ""}</td>
                <td>{pct(o.cvBasis === "signal" ? x.cv_signal_pct : x.cv_concentration_pct)}</td>
                <td className="flags"><Flags flags={x.flags} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4>Samples (dilution-corrected, in-range dilutions)</h4>
      <div className="results-scroll">
        <table className="results-table">
          <thead><tr><th scope="col">Sample</th><th scope="col">Mean ({u})</th><th scope="col">SD</th>
            <th scope="col">CV</th><th scope="col">n</th><th scope="col">Dilutions in range</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {(res.samples ?? []).map((s: any) => (
              <tr key={s.name}>
                <th scope="row">{s.name}</th><td>{num(s.mean)}</td><td>{num(s.sd)}</td><td>{pct(s.cv_pct)}</td>
                <td>{s.n}</td><td>{s.n_in_range} / {s.n_dilutions}</td>
                <td>{s.status === "ok" ? <Chip tone="pass">reportable</Chip> : <Chip tone="warn">{s.status}</Chip>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(res.parallelism ?? []).length > 0 && (
        <>
          <h4>Parallelism and dilutional linearity</h4>
          {(res.parallelism as any[]).map((p) => (
            <div key={p.name} className="std-parallel">
              <KV rows={[
                ["Sample", `${p.name} at 1:${p.dilutions.join(", 1:")}`],
                ["Corrected concentrations", p.corrected_by_dilution
                  .map((c: any) => `1:${c.dilution} ${c.status === "ok" ? num(c.corrected) : c.status}`).join("; ")],
                ["CV across in-range dilutions", <span key="cv">{pct(p.cv_pct)} (limit {p.cv_limit_pct}%){" "}
                  <Pass ok={p.cv_pass} /></span>],
                ["Parallel to the standards (F test)", p.f_test
                  ? <span key="f">F({p.f_test.dfn}, {p.f_test.dfd}) = {num(p.f_test.F, 3)}, P = {num(p.f_test.p, 3)}{" "}
                    <Pass ok={p.f_test.parallel_at_05} yes="parallel" no="not parallel" /></span>
                  : (p.f_test_note ?? "n/a")],
              ] as [string, ReactNode][]} />
            </div>
          ))}
        </>
      )}
      <Warnings items={res.warnings} />
    </>
  );
}

/** A limit's concentration for a summary tile. */
function limitStat(l: any): string {
  if (l?.concentration != null) return num(l.concentration);
  return l?.status === "below_curve" ? "below curve" : l?.status === "above_curve" ? "above curve" : "undefined";
}

/** The concentration cell of a limit: the number, or why there is none,
 *  with a flag when it lies below the lowest standard. */
function LimitCell({ l }: { l: any }) {
  if (l?.concentration == null) {
    return <>{l?.status === "below_curve" ? "below the fitted curve (no crossing)"
      : l?.status === "above_curve" ? "above the fitted curve (no crossing)" : "undefined"}</>;
  }
  return (
    <>
      {num(l.concentration)}{" "}
      {l.status === "extrapolated" && <Chip tone="warn">
        below the lowest standard</Chip>}
    </>
  );
}

function DetectionLimits({ dl, unit }: { dl: any; unit: string }) {
  const pm = dl.direction === "decreasing" ? "−" : "+";
  const lows: any[] = dl.low_samples ?? [];
  return (
    <div className="std-limits">
      <h4>Limits of blank, detection and quantification</h4>
      <div className="results-scroll">
        <table className="results-table std-limits-table">
          <thead><tr><th scope="col">Limit</th><th scope="col">Signal</th><th scope="col">Concentration ({unit})</th>
            <th scope="col">From</th></tr></thead>
          <tbody>
            <tr><th scope="row">LoB</th><td>{num(dl.lob_signal) || "undefined"}</td><td><LimitCell l={dl.lob} /></td>
              <td>{dl.n_blank} blank replicates: mean {num(dl.mean_blank)} {pm} 1.645 × SD {num(dl.sd_blank)}</td></tr>
            <tr><th scope="row">LoD</th><td>{num(dl.lod_signal) || "undefined"}</td><td><LimitCell l={dl.lod} /></td>
              <td>{dl.sd_low != null
                ? `LoB ${pm} ${num(dl.multiplier_low, 4)} × pooled SD ${num(dl.sd_low)} of ${dl.n_low} low-sample replicates (${dl.k_low} sample${dl.k_low === 1 ? "" : "s"})${dl.c_beta_correction ? ", cβ" : ""}`
                : "needs a low-level sample with 2 or more replicates"}</td></tr>
            <tr><th scope="row">LoQ</th><td>—</td><td>{dl.loq ? <LimitCell l={dl.loq} /> : "not reached"}</td>
              <td>{dl.loq ? `${dl.loq.sample}: lowest low sample with CV ≤ ${dl.loq_cv_limit_pct}% at or above the LoD`
                : `no low sample has CV ≤ ${dl.loq_cv_limit_pct}% at or above the LoD`}</td></tr>
          </tbody>
        </table>
      </div>
      {lows.length > 0 && (
        <div className="results-scroll">
          <table className="results-table">
            <thead><tr><th scope="col">Low sample</th><th scope="col">n</th><th scope="col">Mean signal</th>
              <th scope="col">SD</th><th scope="col">Mean ({unit})</th><th scope="col">CV</th><th scope="col">LoQ goal</th></tr></thead>
            <tbody>
              {lows.map((s) => (
                <tr key={s.name}><th scope="row">{s.name}</th><td>{s.n}</td><td>{num(s.mean_signal)}</td>
                  <td>{num(s.sd_signal)}</td><td>{num(s.mean_concentration)}</td><td>{pct(s.cv_concentration_pct)}</td>
                  <td>{s.meets_goal ? <Chip tone="pass">met</Chip> : <Chip tone="warn">{s.reason}</Chip>}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(dl.notes ?? []).map((n: string) => <Note key={n} warn>{n}</Note>)}
      <p className="assay-cite">
        Method: parametric, {dl.source}. LoB = mean of the blanks {pm} 1.645 SD; LoD = LoB {pm} 1.645 SD of the
        low-level samples{dl.c_beta_correction ? " (here the small-sample cβ)" : ""}; normally distributed signals
        assumed. The concentrations are read off the fitted standard curve after the same blank correction as the
        unknowns; one below the lowest standard is read off the extrapolated curve and less certain.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="assay-stat"><span>{label}</span><strong>{value}</strong></div>;
}

// ------------------------------------------------------------ methods

/** The detection-limit sentence of the methods ("" without low samples). */
function limitsMethods(dl: any, unit: string): string {
  if (!dl) return "";
  const pm = dl.direction === "decreasing" ? "−" : "+";
  const c = (l: any) => (l?.concentration != null ? `${num(l.concentration)} ${unit}` : "not defined on the curve");
  return `The limit of blank (LoB) and limit of detection (LoD) followed CLSI EP17-A2 (parametric; Armbruster & Pry `
    + `2008): LoB = mean ${pm} 1.645 SD of ${dl.n_blank} blank replicates (signal ${num(dl.lob_signal) || "undefined"}, `
    + `${c(dl.lob)}), LoD = LoB ${pm} ${dl.c_beta_correction ? `${num(dl.multiplier_low, 4)} (cβ)` : "1.645"} pooled SD `
    + `of ${dl.n_low} low-level replicates (signal ${num(dl.lod_signal) || "undefined"}, ${c(dl.lod)}), read off the `
    + `standard curve; the limit of quantification (LoQ) was the lowest low-level sample with a CV of at most `
    + `${dl.loq_cv_limit_pct}% at or above the LoD (${dl.loq ? `${num(dl.loq.concentration)} ${unit}` : "not reached"}). `;
}

export function StdMethods({ options: o, result }: ResultsProps<StdOptions, StdRun>) {
  if (!result || result.error) return null;
  const res = result.plates?.find((p) => !p.res?.error)?.res;
  if (!res) return null;
  const model: Record<StdModel, string> = {
    "4pl": "a four-parameter logistic model with X = log10(concentration)",
    "5pl": "a five-parameter asymmetric logistic model",
    linear: o.logX ? "a straight line on log10(concentration)" : "a straight line",
    loglog: "a straight line of log10(signal) on log10(concentration)",
    quadratic: "a second-order polynomial on concentration, read only within the standards' range",
    spline: `a natural cubic spline through the mean signal of each standard level${o.logX
      ? " on log10(concentration)" : ""} (an interpolating curve, read only within the standards' range)`,
    point_to_point: `straight lines between the mean signals of adjacent standard levels${o.logX
      ? " on log10(concentration)" : ""} (point to point, read only within the standards' range)`,
  };
  const ciText = res.no_model_ci
    ? "An interpolating curve has no parameters, so interpolated concentrations have no model-based "
      + "confidence interval and none is reported. "
    : "Confidence intervals of interpolated concentrations are where the curve's "
      + "confidence band crosses the signal. ";
  const q = res.quantification_range ?? {};
  const text = `Standards${res.blank != null ? " (blank-subtracted)" : ""} were fitted with ${model[o.model]}`
    + `${o.weighting !== "none" && !res.no_model_ci ? `, weighted by ${o.weighting === "1/Y" ? "1/Y" : "1/Y²"}` : ""}`
    // the Bottom constant applies to the logistic models only (model.ts)
    + `${o.bottom && (o.model === "4pl" || o.model === "5pl") ? `, Bottom held at ${o.bottom}` : ""}. Calibration acceptance followed ICH M10 (2022): `
    + `back-calculated standards within ±${o.accuracy}% of nominal (±${o.accuracyEnds}% at the LLOQ and ULOQ) `
    + `with CV ≤ ${o.precision}% (${o.precisionEnds}%), at least ${Math.round(o.minFraction * 100)}% of standards `
    + `and ${o.minLevels} levels passing. The quantification range was ${num(q.lloq) || "undefined"} to `
    + `${num(q.uloq) || "undefined"} ${o.unit} (lowest and highest passing levels). Unknown concentrations were `
    + `interpolated from the curve, multiplied by their dilution factor and averaged per sample over the `
    + `dilutions within the range; values outside it are reported as below the LLOQ or above the ULOQ and `
    + `were not extrapolated. ${ciText}${limitsMethods(res.detection_limits, o.unit)}`
    + `${precisionMethods(result.precision, o)}Analysed in OpenDose.`;
  return <CopyableMethods text={text} />;
}
