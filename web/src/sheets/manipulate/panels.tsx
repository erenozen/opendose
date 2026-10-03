// Controls / results / methods panels for the data manipulations.
import { useState, type ReactNode } from "react";
import { useProject } from "../../app/context";
import { newId } from "../../project/ids";
import { addSheets, findSheet, uniqueName } from "../../project/ops";
import { derivedOutputs, makeDerivedSheet } from "../../project/derived";
import { clearValues, datasetLetter } from "../../project/table";
import type { DataTableModel } from "../../project/types";
import type { ControlsProps, ResultsProps } from "../types";
import { FormulaEditor } from "./FormulaEditor";
import { LinkIcon } from "./LinkIcon";
import {
  BUILTIN_FUNCS, EXTRA_Y_FUNCS, fmtCell, PHARM_FUNCS,
  type BaselineOptions, type ConcOptions, type FractionOptions, type ManipResult,
  type NormalizeOptions, type PruneOptions, type TransformOptions, type TransposeOptions,
} from "./run";
import "./manipulate.css";

// ------------------------------------------------------------ helpers

function Select<T extends string>({ label, value, onChange, options, disabled }: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function NumField({ label, value, onChange, readOnly, width }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  width?: number;
}) {
  return (
    <label className="field field-num">
      <span>{label}</span>
      <input inputMode="decimal" value={value} readOnly={readOnly}
        style={width ? { width } : undefined}
        onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Radios<T extends string>({ legend, name, value, onChange, options, disabled }: {
  legend: string;
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, ReactNode][];
  disabled?: boolean;
}) {
  return (
    <fieldset className="field-radios">
      <legend>{legend}</legend>
      {options.map(([v, l]) => (
        <label key={v}>
          <input type="radio" name={name} value={v} checked={value === v} disabled={disabled}
            onChange={() => onChange(v)} /> {l}
        </label>
      ))}
    </fieldset>
  );
}

function patcher<O>(options: O, onChange: (o: O) => void) {
  return (patch: Partial<O>) => onChange({ ...options, ...patch });
}

// ------------------------------------------------------------ Transform

export function TransformControls({ sheet, table, options: o, onChange, readOnly }:
  ControlsProps<TransformOptions>) {
  const set = patcher(o, onChange);
  const isXY = table.type === "xy";
  const yb = BUILTIN_FUNCS.find((f) => f.id === o.yFunc);
  const ye = EXTRA_Y_FUNCS.find((f) => f.id === o.yFunc);
  const yNeedsK = !!(yb?.k || ye?.k);
  const xb = BUILTIN_FUNCS.find((f) => f.id === o.xFunc);
  const pharm = PHARM_FUNCS.find((p) => p.id === o.pharm) ?? PHARM_FUNCS[0];
  return (
    <div className="controls manip-controls">
      <section>
        <h3>Transform</h3>
        <Radios legend="Function list" name={`tmode-${sheet.id}`} value={o.mode} disabled={readOnly}
          onChange={(mode) => set({ mode })}
          options={[
            ["standard", "Standard functions"],
            ...(isXY ? [["pharm", "Pharmacology and biochemistry"] as ["pharm", string]] : []),
            ["user", "User-defined formulas"],
          ]} />
      </section>
      {o.mode === "standard" && (
        <section>
          {isXY && (
            <div className="field-pair">
              <Select label="Transform X values" value={o.xFunc} disabled={readOnly}
                onChange={(xFunc) => set({ xFunc })}
                options={[["none", "X unchanged"], ...BUILTIN_FUNCS.map((f) => [f.id, f.x] as [string, string])]} />
              {xb?.k && <NumField label="K for X" value={o.xK} readOnly={readOnly}
                onChange={(xK) => set({ xK })} />}
            </div>
          )}
          <div className="field-pair">
            <label className="field">
              <span>Transform Y values</span>
              <select value={o.yFunc} disabled={readOnly} onChange={(e) => set({ yFunc: e.target.value })}>
                <option value="none">Y unchanged</option>
                <optgroup label="Standard">
                  {BUILTIN_FUNCS.map((f) => <option key={f.id} value={f.id}>{f.y}</option>)}
                </optgroup>
                <optgroup label="More functions">
                  {EXTRA_Y_FUNCS.filter((f) => isXY || !f.xy).map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            {yNeedsK && !o.kPerDataset && <NumField label="K" value={o.yK} readOnly={readOnly}
              onChange={(yK) => set({ yK })} />}
          </div>
          {yNeedsK && table.datasets.length > 1 && (
            <label className="check-row">
              <input type="checkbox" checked={o.kPerDataset} disabled={readOnly}
                onChange={(e) => set({ kPerDataset: e.target.checked })} />
              <span>A different K for each data set</span>
            </label>
          )}
          {yNeedsK && o.kPerDataset && (
            <div className="k-grid">
              {table.datasets.map((d, i) => (
                <label key={i} className="field field-num">
                  <span>K for {datasetLetter(i)}: {d.name}</span>
                  <input inputMode="decimal" readOnly={readOnly} value={o.yKs[i] ?? o.yK}
                    onChange={(e) => {
                      const yKs = table.datasets.map((_, j) => o.yKs[j] ?? o.yK);
                      yKs[i] = e.target.value;
                      set({ yKs });
                    }} />
                </label>
              ))}
            </div>
          )}
          {o.yFunc === "gauss_k" && (
            <NumField label="Random seed" value={o.seed} readOnly={readOnly}
              onChange={(seed) => set({ seed })} />
          )}
          <p className="hint-block">
            Values a function cannot take (the log of zero, 1/0) become blanks.
          </p>
        </section>
      )}
      {o.mode === "pharm" && (
        <section>
          <Select label="Plot" value={o.pharm} disabled={readOnly}
            onChange={(pharm) => set({ pharm })}
            options={PHARM_FUNCS.map((p) => [p.id, p.label])} />
          <p className="hint-block">{pharm.note}</p>
          <p className="formula-preview"><code>X = {pharm.x}</code><br /><code>Y = {pharm.y}</code></p>
          {pharm.k && <NumField label={pharm.k} value={o.pharmK} readOnly={readOnly}
            onChange={(pharmK) => set({ pharmK })} />}
        </section>
      )}
      {o.mode === "user" && <FormulaEditor table={table} options={o} set={set} readOnly={readOnly} />}
    </div>
  );
}

// ---------------------------------------------- Transform concentrations

export function ConcControls({ sheet, options: o, onChange, readOnly }: ControlsProps<ConcOptions>) {
  const set = patcher(o, onChange);
  return (
    <div className="controls manip-controls">
      <section>
        <h3>Transform concentrations (X)</h3>
        <p className="hint-block">Steps run in this order: replace zero, change units, take logarithms.</p>
        <Radios legend="Concentrations of zero" name={`zero-${sheet.id}`} value={o.zero}
          disabled={readOnly} onChange={(zero) => set({ zero })}
          options={[
            ["blank", "Leave as zero (its log is blank, so the row is left out)"],
            ["auto", "Replace with a value two log units below the lowest concentration"],
            ["value", "Replace with this value:"],
          ]} />
        {o.zero === "value" && <NumField label="Value used for zero" value={o.zeroValue}
          readOnly={readOnly} onChange={(zeroValue) => set({ zeroValue })} />}
      </section>
      <section>
        <div className="field-pair">
          <Select label="Change units" value={o.units} disabled={readOnly}
            onChange={(units) => set({ units })}
            options={[["none", "Keep the units"], ["multiply", "Multiply every X by"], ["divide", "Divide every X by"]]} />
          {o.units !== "none" && <NumField label="Factor" value={o.factor} readOnly={readOnly}
            onChange={(factor) => set({ factor })} />}
        </div>
        <Select label="Logarithm" value={o.log} disabled={readOnly}
          onChange={(log) => set({ log })}
          options={[["log10", "X = log10(X)"], ["ln", "X = ln(X)"], ["none", "No logarithm"]]} />
      </section>
    </div>
  );
}

// ------------------------------------------------------ Remove baseline

export function BaselineControls({ sheet, table, options: o, onChange, readOnly }:
  ControlsProps<BaselineOptions>) {
  const set = patcher(o, onChange);
  const multi = table.datasets.length > 1;
  return (
    <div className="controls manip-controls">
      <section>
        <h3>Where is the baseline?</h3>
        <Select label="Baseline" value={o.baseline} disabled={readOnly}
          onChange={(baseline) => set({ baseline })}
          options={[
            ["first_row", "First row of each data set"],
            ["last_row", "Last row of each data set"],
            ["first_rows", "Mean of the first K rows"],
            ["last_rows", "Mean of the last K rows"],
            ["first_last_rows", "Mean of the first and last K rows"],
            ...(multi ? [
              ["column", "A baseline data set (same row)"] as [BaselineOptions["baseline"], string],
              ["alternate", "Every other data set (pairs)"] as [BaselineOptions["baseline"], string],
            ] : []),
            ["value", "A constant"],
          ]} />
        {["first_rows", "last_rows", "first_last_rows"].includes(o.baseline) && (
          <NumField label="K (rows)" value={o.k} readOnly={readOnly} onChange={(k) => set({ k })} />
        )}
        {o.baseline === "value" && (
          <NumField label="Baseline value" value={o.value} readOnly={readOnly}
            onChange={(value) => set({ value })} />
        )}
        {o.baseline === "column" && (
          <Select label="Baseline data set" value={String(o.baselineDataset)} disabled={readOnly}
            onChange={(v) => set({ baselineDataset: Number(v) })}
            options={table.datasets.map((d, i) => [String(i), `${datasetLetter(i)}: ${d.name}`])} />
        )}
        {o.baseline === "alternate" && (
          <Radios legend="Pairs" name={`pairs-${sheet.id}`} value={o.pairs} disabled={readOnly}
            onChange={(pairs) => set({ pairs })}
            options={[["total_first", "Total first (A total, B baseline, …)"],
              ["baseline_first", "Baseline first (A baseline, B total, …)"]]} />
        )}
        {(o.baseline === "column" || o.baseline === "alternate") && table.type === "xy" && (
          <label className="check-row">
            <input type="checkbox" checked={o.linearBaseline} disabled={readOnly}
              onChange={(e) => set({ linearBaseline: e.target.checked })} />
            <span>Smooth the baseline: use a straight line fitted to baseline vs. X</span>
          </label>
        )}
      </section>
      <section>
        <h3>Calculate</h3>
        <Select label="Each value becomes" value={o.operation} disabled={readOnly}
          onChange={(operation) => set({ operation })}
          options={[
            ["subtract", "Value − baseline"],
            ["divide", "Value / baseline"],
            ["fraction_difference", "(Value − baseline) / baseline"],
            ["percent_difference", "100 × (value − baseline) / baseline"],
            ["percent_of_baseline", "100 × value / baseline"],
            ["add", "Value + baseline"],
            ["multiply", "Value × baseline"],
          ]} />
        <Radios legend="Replicates of the baseline" name={`reps-${sheet.id}`} value={o.replicates}
          disabled={readOnly} onChange={(replicates) => set({ replicates })}
          options={[["mean", "Use their mean"], ["each", "Match each replicate with its own"]]} />
      </section>
    </div>
  );
}

// ------------------------------------------------------------ Normalize

export function NormalizeControls({ sheet, options: o, onChange, readOnly }:
  ControlsProps<NormalizeOptions>) {
  const set = patcher(o, onChange);
  return (
    <div className="controls manip-controls">
      <section>
        <h3>Normalize</h3>
        <div className="field-pair">
          <Select label="0% is" value={o.zeroMode} disabled={readOnly}
            onChange={(zeroMode) => set({ zeroMode })}
            options={[["smallest", "Smallest value in each data set"], ["first", "Value in the first row"],
              ["value", "This value"]]} />
          {o.zeroMode === "value" && <NumField label="0% value" value={o.zeroValue} readOnly={readOnly}
            onChange={(zeroValue) => set({ zeroValue })} />}
        </div>
        <div className="field-pair">
          <Select label="100% is" value={o.hundredMode} disabled={readOnly}
            onChange={(hundredMode) => set({ hundredMode })}
            options={[["largest", "Largest value in each data set"], ["last", "Value in the last row"],
              ["sum", "Sum of all values"], ["value", "This value"]]} />
          {o.hundredMode === "value" && <NumField label="100% value" value={o.hundredValue}
            readOnly={readOnly} onChange={(hundredValue) => set({ hundredValue })} />}
        </div>
        <Radios legend="Present results as" name={`pct-${sheet.id}`} value={o.asPercent ? "p" : "f"}
          disabled={readOnly} onChange={(v) => set({ asPercent: v === "p" })}
          options={[["p", "Percentages"], ["f", "Fractions"]]} />
        <Radios legend="Subcolumns" name={`subs-${sheet.id}`} value={o.subcolumns}
          disabled={readOnly} onChange={(subcolumns) => set({ subcolumns })}
          options={[["mean", "Define 0% and 100% from the row means"],
            ["separate", "Normalize each subcolumn separately"]]} />
      </section>
    </div>
  );
}

// ------------------------------------------------------------ Transpose

export function TransposeControls({ sheet, table, options: o, onChange, readOnly }:
  ControlsProps<TransposeOptions>) {
  const set = patcher(o, onChange);
  return (
    <div className="controls manip-controls">
      <section>
        <h3>Transpose</h3>
        <p className="hint-block">Each row of Y values becomes a data set; each data set becomes a row.</p>
        <Select label="New data set titles" value={o.columnTitles} disabled={readOnly}
          onChange={(columnTitles) => set({ columnTitles })}
          options={[["row_titles", "Row titles (X when a row has none)"],
            ...(table.type === "xy" ? [["x", "X values"] as [TransposeOptions["columnTitles"], string]] : []),
            ["numbers", "Row numbers"]]} />
        <Radios legend="Replicates" name={`trep-${sheet.id}`} value={o.replicates} disabled={readOnly}
          onChange={(replicates) => set({ replicates })}
          options={[["keep", "Keep each replicate"], ["mean", "Use the mean of each cell"]]} />
        <Select label="Result table format" value={o.outputType} disabled={readOnly}
          onChange={(outputType) => set({ outputType })}
          options={[["same", "Same as this table"], ["xy", "XY"], ["column", "Column"],
            ["grouped", "Grouped"]]} />
      </section>
    </div>
  );
}

// ------------------------------------------------------------ Prune rows

export function PruneControls({ sheet, table, options: o, onChange, readOnly }:
  ControlsProps<PruneOptions>) {
  const set = patcher(o, onChange);
  return (
    <div className="controls manip-controls">
      {table.type === "xy" && (
        <section>
          <h3>Range of X</h3>
          <label className="check-row">
            <input type="checkbox" checked={o.useRange} disabled={readOnly}
              onChange={(e) => set({ useRange: e.target.checked })} />
            <span>Keep only rows with X in a range</span>
          </label>
          {o.useRange && (
            <div className="field-pair">
              <NumField label="From X" value={o.xMin} readOnly={readOnly} onChange={(xMin) => set({ xMin })} />
              <NumField label="To X" value={o.xMax} readOnly={readOnly} onChange={(xMax) => set({ xMax })} />
            </div>
          )}
        </section>
      )}
      <section>
        <h3>Fewer rows</h3>
        <Radios legend="Rows" name={`prune-${sheet.id}`} value={o.mode} disabled={readOnly}
          onChange={(mode) => set({ mode })}
          options={[["none", "Keep every row"], ["keep_every", "Keep one row in every K"],
            ["average", "Average every K rows into one"]]} />
        {o.mode !== "none" && (
          <div className="field-pair">
            <NumField label="K" value={o.k} readOnly={readOnly} onChange={(k) => set({ k })} />
            {o.mode === "keep_every" && <NumField label="Start at row" value={o.start}
              readOnly={readOnly} onChange={(start) => set({ start })} />}
          </div>
        )}
        {o.mode === "average" && (
          <>
            <Radios legend="Averaging" name={`avg-${sheet.id}`} value={o.average} disabled={readOnly}
              onChange={(average) => set({ average })}
              options={[["keep_replicates", "Average each subcolumn (keep replicates)"],
                ["mean", "Average every value into one"]]} />
            <Radios legend="A last, incomplete group" name={`part-${sheet.id}`} value={o.partial}
              disabled={readOnly} onChange={(partial) => set({ partial })}
              options={[["keep", "Average what is there"], ["drop", "Leave it out"]]} />
          </>
        )}
      </section>
    </div>
  );
}

// ----------------------------------------------------- Fraction of total

export function FractionControls({ sheet, options: o, onChange, readOnly }:
  ControlsProps<FractionOptions>) {
  const set = patcher(o, onChange);
  return (
    <div className="controls manip-controls">
      <section>
        <h3>Fraction of total</h3>
        <Radios legend="Divide each value by" name={`div-${sheet.id}`} value={o.divideBy}
          disabled={readOnly} onChange={(divideBy) => set({ divideBy })}
          options={[["column", "Its column total"], ["row", "Its row total"], ["grand", "The grand total"]]} />
        <Radios legend="Show as" name={`fpct-${sheet.id}`} value={o.asPercent ? "p" : "f"}
          disabled={readOnly} onChange={(v) => set({ asPercent: v === "p" })}
          options={[["f", "Fractions"], ["p", "Percentages"]]} />
        <label className="check-row">
          <input type="checkbox" checked={o.ci} disabled={readOnly}
            onChange={(e) => set({ ci: e.target.checked })} />
          <span>Confidence intervals (for counts)</span>
        </label>
        {o.ci && (
          <div className="field-pair">
            <Select label="Method" value={o.ciMethod} disabled={readOnly}
              onChange={(ciMethod) => set({ ciMethod })}
              options={[["wilson_brown", "Wilson/Brown (recommended)"], ["wilson", "Wilson"],
                ["clopper_pearson", "Clopper-Pearson (exact)"]]} />
            <NumField label="Level (%)" value={o.ciLevel} readOnly={readOnly}
              onChange={(ciLevel) => set({ ciLevel })} />
          </div>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------ results

const PREVIEW_ROWS = 8;

/** Results of any manipulation: what came out, remarks, a preview, and
 *  the link to the derived table (or a way to recreate it). */
export function ManipResultsView({ sheet, table, result, outputName, extra }:
  ResultsProps<unknown, ManipResult> & {
    outputName: (table: string) => string;
    extra?: (r: ManipResult) => ReactNode;
  }) {
  {
    const { project, select, apply } = useProject();
    const outs = derivedOutputs(project, sheet.id);
    const source = findSheet(project, sheet.parentId);
    if (!result) return null;
    const create = () => {
      const id = newId();
      apply((p) => addSheets(p, [makeDerivedSheet(id,
        uniqueName(p, outputName(source?.name ?? "data")), clearValues(table),
        { sourceId: sheet.parentId, resultsId: sheet.id })], sheet.id));
      select(id);
    };
    return (
      <div className="result-card manip-results">
        <h3>{sheet.name}</h3>
        {result.error ? (
          <div className="results-error" role="alert">{result.error}</div>
        ) : (
          <>
            <p className="manip-summary">
              {result.datasets.length} data set{result.datasets.length === 1 ? "" : "s"},{" "}
              {Math.max(result.x.length, ...result.datasets.map((d) => d.ys.length))} rows.
            </p>
            {result.notes.map((n, i) => <p key={i} className="hint-block">{n}</p>)}
            {extra?.(result)}
            <ResultPreview result={result} table={table} />
          </>
        )}
        <div className="manip-output">
          {outs.length ? outs.map((o) => (
            <button key={o.id} type="button" className="btn-primary manip-open"
              onClick={() => select(o.id)}>
              <LinkIcon /> Open {o.name}
            </button>
          )) : (
            <>
              <span className="hint-block">This analysis has no output table.</span>
              <button type="button" onClick={create} disabled={!!sheet.frozen}>
                Create the output table
              </button>
            </>
          )}
        </div>
        {outs.length > 0 && (
          <p className="hint-block">
            The output table updates whenever this table or these settings
            change, and so do analyses of it.
          </p>
        )}
      </div>
    );
  }
}

function ResultPreview({ result, table }: { result: ManipResult; table: DataTableModel }) {
  const type = result.outputType ?? table.type;
  const n = Math.max(result.x.length, ...result.datasets.map((d) => d.ys.length));
  const rows = Math.min(n, PREVIEW_ROWS);
  const showX = type === "xy";
  const titles = result.rowTitles;
  if (!n || !result.datasets.length) return null;
  return (
    <div className="manip-preview" role="region" aria-label="Preview of the output table" tabIndex={0}>
      <table className="results-table">
        <thead>
          <tr>
            {titles && <th scope="col"><span className="sr-only">Row</span></th>}
            {showX && <th scope="col">X</th>}
            {result.datasets.map((d, i) => {
              const w = Math.max(1, ...d.ys.map((r) => r.length));
              return <th key={i} scope="col" colSpan={w}>{d.name}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {titles && <th scope="row">{titles[r] ?? ""}</th>}
              {showX && <td>{fmtCell(result.x[r])}</td>}
              {result.datasets.map((d, i) => {
                const w = Math.max(1, ...d.ys.map((rr) => rr.length));
                return Array.from({ length: w }, (_, s) => (
                  <td key={`${i}-${s}`}>{fmtCell(d.ys[r]?.[s])}</td>
                ));
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {n > rows && <p className="hint-block">First {rows} of {n} rows.</p>}
    </div>
  );
}

export function FractionExtra({ result: r }: { result: ManipResult }) {
  const e = r.extra as { columnTotals?: (number | null)[]; grandTotal?: number | null;
    ci?: { lower: (number | null)[]; upper: (number | null)[] }[] | null } | undefined;
  if (!e) return null;
  return (
    <>
      <table className="results-table goodness">
        <tbody>
          {r.datasets.map((d, i) => (
            <tr key={i}><th scope="row">Total of {d.name}</th><td>{fmtCell(e.columnTotals?.[i] ?? null)}</td></tr>
          ))}
          <tr><th scope="row">Grand total</th><td>{fmtCell(e.grandTotal ?? null)}</td></tr>
        </tbody>
      </table>
      {e.ci && (
        <>
          <h4>Confidence intervals</h4>
          <div className="manip-preview" tabIndex={0} role="region" aria-label="Confidence intervals">
            <table className="results-table">
              <thead>
                <tr><th scope="col">Row</th>{r.datasets.map((d, i) => <th key={i} scope="col">{d.name}</th>)}</tr>
              </thead>
              <tbody>
                {r.datasets[0]?.ys.map((_, row) => (
                  <tr key={row}>
                    <th scope="row">{row + 1}</th>
                    {r.datasets.map((d, i) => (
                      <td key={i}>
                        {fmtCell(d.ys[row]?.[0])}
                        {e.ci?.[i]?.lower[row] != null && (
                          <span className="ci-range"> ({fmtCell(e.ci[i].lower[row])} to {fmtCell(e.ci[i].upper[row])})</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

export function MethodsCard({ text, title = "Methods text" }: { text: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="result-card methods-text">
      <h3>{title}</h3>
      <p>{text}</p>
      <button type="button" className="copy-btn" onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}>
        <span className="swap-label" key={copied ? "copied" : "copy"}>
          {copied ? "Copied ✓" : "Copy"}
        </span>
      </button>
    </div>
  );
}
