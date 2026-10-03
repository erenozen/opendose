// The simulation settings, shared by the "Simulate data" dialog and the
// Monte Carlo analysis.
import { useId } from "react";
import { datasetLetter } from "../../project/table";
import { MODEL_FAMILIES, MODELS_META } from "../../types";
import {
  defaultXYForm, SIM_MODELS, simModel,
  type ColumnSimForm, type ContingencySimForm, type ErrorForm, type SimForm, type SimKind,
  type XYSimForm,
} from "./simulate";

interface FormProps<F> {
  form: F;
  onChange: (f: F) => void;
  readOnly?: boolean;
}

function Num({ label, value, onChange, readOnly, wide }: {
  label: string; value: string; onChange: (v: string) => void; readOnly?: boolean; wide?: boolean;
}) {
  return (
    <label className={`field field-num${wide ? " field-wide" : ""}`}>
      <span>{label}</span>
      <input inputMode="decimal" value={value} readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function ErrorFields({ error, onChange, readOnly, allowPoisson = true }: {
  error: ErrorForm; onChange: (e: ErrorForm) => void; readOnly?: boolean; allowPoisson?: boolean;
}) {
  const set = (p: Partial<ErrorForm>) => onChange({ ...error, ...p });
  return (
    <fieldset className="sim-group">
      <legend>Random scatter</legend>
      <div className="field-row">
        <label className="field">
          <span>Kind</span>
          <select value={error.kind} disabled={readOnly}
            onChange={(e) => set({ kind: e.target.value as ErrorForm["kind"] })}>
            <option value="gaussian">Gaussian, constant SD</option>
            <option value="relative">Gaussian, SD as a percent of Y</option>
            <option value="t">t distribution (wider tails)</option>
            {allowPoisson && <option value="poisson">Poisson (counts)</option>}
            <option value="none">None</option>
          </select>
        </label>
        {(error.kind === "gaussian" || error.kind === "t") && (
          <Num label="SD" value={error.sd} readOnly={readOnly} onChange={(sd) => set({ sd })} />
        )}
        {error.kind === "relative" && (
          <Num label="SD (% of Y)" value={error.percent} readOnly={readOnly}
            onChange={(percent) => set({ percent })} />
        )}
        {error.kind === "t" && (
          <Num label="df" value={error.df} readOnly={readOnly} onChange={(df) => set({ df })} />
        )}
      </div>
      {error.kind !== "none" && error.kind !== "poisson" && (
        <>
          <label className="check-row">
            <input type="checkbox" checked={error.outliers} disabled={readOnly}
              onChange={(e) => set({ outliers: e.target.checked })} />
            <span>Add occasional outliers</span>
          </label>
          {error.outliers && (
            <div className="field-row">
              <Num label="Chance per value (%)" value={error.outlierProbability} readOnly={readOnly}
                onChange={(outlierProbability) => set({ outlierProbability })} />
              <Num label="Size (× SD)" value={error.outlierMultiple} readOnly={readOnly}
                onChange={(outlierMultiple) => set({ outlierMultiple })} />
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}

export function XYSimFields({ form: f, onChange, readOnly }: FormProps<XYSimForm>) {
  const set = (p: Partial<XYSimForm>) => onChange({ ...f, ...p });
  const m = simModel(f.model);
  const n = Math.max(1, Math.min(26, Math.round(Number(f.nDatasets)) || 1));
  const meta = MODELS_META[m.id];
  return (
    <>
      <fieldset className="sim-group">
        <legend>Curve</legend>
        <label className="field">
          <span>Model</span>
          <select value={f.model} disabled={readOnly}
            onChange={(e) => {
              const next = defaultXYForm(e.target.value);
              onChange({ ...next, nDatasets: f.nDatasets, replicates: f.replicates, ideal: f.ideal });
            }}>
            {MODEL_FAMILIES.map((fam) => {
              const ms = SIM_MODELS.filter((s) => MODELS_META[s.id]?.family === fam);
              return ms.length ? (
                <optgroup key={fam} label={fam}>
                  {ms.map((s) => <option key={s.id} value={s.id}>{MODELS_META[s.id].label}</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
        </label>
        <div className="field-row">
          {m.params.map((p) => (
            <Num key={p.name} label={p.label} value={f.params[p.name] ?? String(p.value)}
              readOnly={readOnly}
              onChange={(v) => set({ params: { ...f.params, [p.name]: v } })} />
          ))}
        </div>
        {meta?.needsLogX && (
          <p className="hint-block">X is log10 of the concentration, as the model expects.</p>
        )}
      </fieldset>
      <fieldset className="sim-group">
        <legend>X values</legend>
        <div className="field-row">
          <label className="field">
            <span>Series</span>
            <select value={f.xKind} disabled={readOnly}
              onChange={(e) => set({ xKind: e.target.value as XYSimForm["xKind"] })}>
              <option value="arithmetic">Start, add a step</option>
              <option value="geometric">Start, multiply by a factor</option>
              <option value="linear">Evenly spaced from start to end</option>
              <option value="log">Evenly spaced on a log scale</option>
            </select>
          </label>
          <Num label="First X" value={f.xStart} readOnly={readOnly} onChange={(xStart) => set({ xStart })} />
          {(f.xKind === "arithmetic" || f.xKind === "geometric") && (
            <Num label={f.xKind === "arithmetic" ? "Step" : "Factor"} value={f.xStep}
              readOnly={readOnly} onChange={(xStep) => set({ xStep })} />
          )}
        </div>
        <div className="field-row">
          {(f.xKind === "arithmetic" || f.xKind === "geometric") && (
            <label className="field">
              <span>Stop</span>
              <select value={f.xBy} disabled={readOnly}
                onChange={(e) => set({ xBy: e.target.value as XYSimForm["xBy"] })}>
                <option value="stop">At this X</option>
                <option value="count">After this many values</option>
              </select>
            </label>
          )}
          {(f.xKind === "linear" || f.xKind === "log" || f.xBy === "stop") && (
            <Num label="Last X" value={f.xStop} readOnly={readOnly} onChange={(xStop) => set({ xStop })} />
          )}
          {(f.xKind === "linear" || f.xKind === "log" || f.xBy === "count") && (
            <Num label="Number of X values" value={f.xCount} readOnly={readOnly}
              onChange={(xCount) => set({ xCount })} />
          )}
        </div>
      </fieldset>
      <fieldset className="sim-group">
        <legend>Data sets</legend>
        <div className="field-row">
          <Num label="Data sets" value={f.nDatasets} readOnly={readOnly}
            onChange={(nDatasets) => set({ nDatasets })} />
          <Num label="Replicates" value={f.replicates} readOnly={readOnly}
            onChange={(replicates) => set({ replicates })} />
        </div>
        {n > 1 && (
          <details className="advanced">
            <summary>Different parameter values per data set</summary>
            <section>
              <p className="hint-block">Blank cells use the values above.</p>
              <div className="sim-grid-wrap">
                <table className="const-table">
                  <thead>
                    <tr><th scope="col">Data set</th>
                      {m.params.map((p) => <th key={p.name} scope="col">{p.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: n }, (_, i) => (
                      <tr key={i}>
                        <th scope="row">{datasetLetter(i)}</th>
                        {m.params.map((p) => (
                          <td key={p.name}>
                            <input inputMode="decimal" className="const-value" readOnly={readOnly}
                              aria-label={`${p.label} for data set ${datasetLetter(i)}`}
                              placeholder={f.params[p.name] ?? String(p.value)}
                              value={f.perDataset[i]?.[p.name] ?? ""}
                              onChange={(e) => {
                                const per = Array.from({ length: n }, (_, j) => ({ ...(f.perDataset[j] ?? {}) }));
                                per[i][p.name] = e.target.value;
                                set({ perDataset: per });
                              }} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </details>
        )}
        <label className="check-row">
          <input type="checkbox" checked={f.ideal} disabled={readOnly}
            onChange={(e) => set({ ideal: e.target.checked })} />
          <span>Add each data set&apos;s ideal values (no scatter) as an extra column</span>
        </label>
      </fieldset>
      <ErrorFields error={f.error} readOnly={readOnly} onChange={(error) => set({ error })} />
    </>
  );
}

export function ColumnSimFields({ form: f, onChange, readOnly }: FormProps<ColumnSimForm>) {
  const set = (p: Partial<ColumnSimForm>) => onChange({ ...f, ...p });
  const setGroup = (i: number, p: Partial<ColumnSimForm["groups"][number]>) =>
    set({ groups: f.groups.map((g, j) => (j === i ? { ...g, ...p } : g)) });
  return (
    <>
      <fieldset className="sim-group">
        <legend>Groups</legend>
        <table className="const-table">
          <thead>
            <tr>
              <th scope="col">Title</th><th scope="col">n</th>
              {!f.randomMeans && <th scope="col">Population mean</th>}
              <th><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {f.groups.map((g, i) => (
              <tr key={i}>
                <td><input value={g.name} readOnly={readOnly} aria-label={`Group ${i + 1} title`}
                  onChange={(e) => setGroup(i, { name: e.target.value })} /></td>
                <td><input className="const-value" inputMode="numeric" value={g.n} readOnly={readOnly}
                  aria-label={`n of group ${i + 1}`} onChange={(e) => setGroup(i, { n: e.target.value })} /></td>
                {!f.randomMeans && (
                  <td><input className="const-value" inputMode="decimal" value={g.mean} readOnly={readOnly}
                    aria-label={`Mean of group ${i + 1}`}
                    onChange={(e) => setGroup(i, { mean: e.target.value })} /></td>
                )}
                <td>
                  <button type="button" className="icon-btn" disabled={readOnly || f.groups.length < 2}
                    aria-label={`Remove group ${i + 1}`}
                    onClick={() => set({ groups: f.groups.filter((_, j) => j !== i) })}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="chip-btn" disabled={readOnly || f.groups.length >= 26}
          onClick={() => set({ groups: [...f.groups, {
            name: `Group ${datasetLetter(f.groups.length)}`, n: f.groups.at(-1)?.n ?? "8",
            mean: f.groups.at(-1)?.mean ?? "10",
          }] })}>+ Add a group</button>
        <label className="check-row">
          <input type="checkbox" checked={f.randomMeans} disabled={readOnly}
            onChange={(e) => set({ randomMeans: e.target.checked })} />
          <span>Draw each population mean at random</span>
        </label>
        {f.randomMeans && (
          <div className="field-row">
            <Num label="Mean of the means" value={f.meanOfMeans} readOnly={readOnly}
              onChange={(meanOfMeans) => set({ meanOfMeans })} />
            <Num label="SD of the means" value={f.sdOfMeans} readOnly={readOnly}
              onChange={(sdOfMeans) => set({ sdOfMeans })} />
          </div>
        )}
      </fieldset>
      <ErrorFields error={f.error} readOnly={readOnly} onChange={(error) => set({ error })} />
    </>
  );
}

const DESIGN_HELP: Record<ContingencySimForm["design"], string> = {
  cross_sectional: "Subjects are sampled without regard to exposure or outcome. Enter the "
    + "chance of landing in each cell (rescaled to sum to 1) and the total.",
  prospective: "Groups (rows) are chosen by exposure and followed up. Enter each row's "
    + "chance of each outcome (rescaled to sum to 1 across the row) and the row totals.",
  experimental: "Subjects are assigned to treatments (rows). Enter each row's chance of "
    + "each outcome (rescaled to sum to 1 across the row) and the row totals.",
  case_control: "Cases and controls (columns) are chosen, then exposure is looked back on. "
    + "Enter each column's chance of each exposure row (rescaled to sum to 1 down the "
    + "column) and the column totals.",
};

export function ContingencySimFields({ form: f, onChange, readOnly }: FormProps<ContingencySimForm>) {
  const set = (p: Partial<ContingencySimForm>) => onChange({ ...f, ...p });
  const r = f.rowTitles.length;
  const c = f.columnTitles.length;
  const resize = (nr: number, nc: number) => {
    nr = Math.max(2, Math.min(10, nr));
    nc = Math.max(2, Math.min(10, nc));
    const rowTitles = Array.from({ length: nr }, (_, i) => f.rowTitles[i] ?? `Row ${i + 1}`);
    const columnTitles = Array.from({ length: nc }, (_, j) => f.columnTitles[j] ?? `Outcome ${datasetLetter(j)}`);
    const probs = Array.from({ length: nr }, (_, i) => Array.from({ length: nc },
      (_, j) => f.probs[i]?.[j] ?? (1 / nc).toFixed(3)));
    set({
      rowTitles, columnTitles, probs,
      rowTotals: Array.from({ length: nr }, (_, i) => f.rowTotals[i] ?? "100"),
      columnTotals: Array.from({ length: nc }, (_, j) => f.columnTotals[j] ?? "100"),
    });
  };
  const id = useId();
  return (
    <>
      <fieldset className="sim-group">
        <legend>Design</legend>
        <label className="field">
          <span>Study design</span>
          <select value={f.design} disabled={readOnly}
            onChange={(e) => set({ design: e.target.value as ContingencySimForm["design"] })}>
            <option value="cross_sectional">Cross-sectional</option>
            <option value="prospective">Prospective</option>
            <option value="experimental">Experimental</option>
            <option value="case_control">Case-control (retrospective)</option>
          </select>
        </label>
        <p className="hint-block" id={`${id}-help`}>{DESIGN_HELP[f.design]}</p>
        <div className="field-row">
          <Num label="Rows" value={String(r)} readOnly={readOnly}
            onChange={(v) => { const n = Math.round(Number(v)); if (n) resize(n, c); }} />
          <Num label="Columns" value={String(c)} readOnly={readOnly}
            onChange={(v) => { const n = Math.round(Number(v)); if (n) resize(r, n); }} />
          {f.design === "cross_sectional" && (
            <Num label="Total subjects" value={f.total} readOnly={readOnly} onChange={(total) => set({ total })} />
          )}
        </div>
      </fieldset>
      <div className="sim-grid-wrap">
        <table className="const-table contingency-sim" aria-describedby={`${id}-help`}>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Row title</span></th>
              {f.columnTitles.map((t, j) => (
                <th key={j} scope="col">
                  <input value={t} readOnly={readOnly} aria-label={`Column ${j + 1} title`}
                    onChange={(e) => set({ columnTitles: f.columnTitles.map((x, k) => (k === j ? e.target.value : x)) })} />
                </th>
              ))}
              {(f.design === "prospective" || f.design === "experimental") && <th scope="col">Row total</th>}
            </tr>
          </thead>
          <tbody>
            {f.rowTitles.map((t, i) => (
              <tr key={i}>
                <th scope="row">
                  <input value={t} readOnly={readOnly} aria-label={`Row ${i + 1} title`}
                    onChange={(e) => set({ rowTitles: f.rowTitles.map((x, k) => (k === i ? e.target.value : x)) })} />
                </th>
                {f.columnTitles.map((_, j) => (
                  <td key={j}>
                    <input className="const-value" inputMode="decimal" readOnly={readOnly}
                      aria-label={`Probability, ${f.rowTitles[i]}, ${f.columnTitles[j]}`}
                      value={f.probs[i]?.[j] ?? ""}
                      onChange={(e) => set({ probs: f.probs.map((row, k) => (k === i
                        ? row.map((v, l) => (l === j ? e.target.value : v)) : row)) })} />
                  </td>
                ))}
                {(f.design === "prospective" || f.design === "experimental") && (
                  <td>
                    <input className="const-value" inputMode="numeric" readOnly={readOnly}
                      aria-label={`Total of ${f.rowTitles[i]}`} value={f.rowTotals[i] ?? ""}
                      onChange={(e) => set({ rowTotals: f.rowTotals.map((v, k) => (k === i ? e.target.value : v)) })} />
                  </td>
                )}
              </tr>
            ))}
            {f.design === "case_control" && (
              <tr>
                <th scope="row">Column total</th>
                {f.columnTitles.map((_, j) => (
                  <td key={j}>
                    <input className="const-value" inputMode="numeric" readOnly={readOnly}
                      aria-label={`Total of ${f.columnTitles[j]}`} value={f.columnTotals[j] ?? ""}
                      onChange={(e) => set({ columnTotals: f.columnTotals.map((v, k) => (k === j ? e.target.value : v)) })} />
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function SimFields({ kind, form, onChange, readOnly }: {
  kind: SimKind; form: SimForm; onChange: (f: SimForm) => void; readOnly?: boolean;
}) {
  if (kind === "xy") return <XYSimFields form={form as XYSimForm} onChange={onChange} readOnly={readOnly} />;
  if (kind === "column") {
    return <ColumnSimFields form={form as ColumnSimForm} onChange={onChange} readOnly={readOnly} />;
  }
  return <ContingencySimFields form={form as ContingencySimForm} onChange={onChange} readOnly={readOnly} />;
}
