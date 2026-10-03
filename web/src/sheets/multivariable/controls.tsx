// Parameter panels for the multiple-variables analyses.
import { useId, useState, type ReactNode } from "react";
import type { DataTableModel } from "../../project/types";
import type { ControlsProps } from "../types";
import {
  FILTER_OP_LABELS, TRANSFORM_LABELS, variableInfo,
  type CorrelationOptions, type DescriptiveOptions, type FilterOp,
  type LogisticOptions, type PcaOptions, type PcaSelection,
  type RearrangeOptions, type RegressionOptions, type TransformFunc, type VarInfo,
} from "./model";

/* ------------------------------------------------------------ pieces */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section><h3>{title}</h3>{children}</section>;
}

function Field({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  return (
    <label className="check-row mv-field">
      <span>{label}</span>
      {children}
      {note && <span className="field-note">{note}</span>}
    </label>
  );
}

function NumInput({ value, onChange, label, width }: {
  value: string; onChange: (v: string) => void; label: string; width?: number;
}) {
  return (
    <input className="constraint-value" inputMode="decimal" aria-label={label}
      style={width ? { width } : undefined}
      value={value} onChange={(e) => onChange(e.target.value)} />
  );
}

/** Checkbox list of variables. `chosen` empty means "all of them" when
 *  `emptyMeansAll` (the default for correlation / PCA). */
function VarChecklist({ legend, vars, chosen, onChange, emptyMeansAll, hint }: {
  legend: string; vars: VarInfo[]; chosen: string[];
  onChange: (names: string[]) => void; emptyMeansAll?: boolean; hint?: string;
}) {
  const all = emptyMeansAll && !chosen.some((c) => vars.some((v) => v.name === c));
  const isOn = (n: string) => all || chosen.includes(n);
  const toggle = (n: string, on: boolean) => {
    const base = all ? vars.map((v) => v.name) : chosen.filter((c) => vars.some((v) => v.name === c));
    const next = on ? [...base, n] : base.filter((c) => c !== n);
    // keep table order
    const ordered = vars.map((v) => v.name).filter((x) => next.includes(x));
    onChange(emptyMeansAll && ordered.length === vars.length ? [] : ordered);
  };
  return (
    <fieldset className="mv-varlist">
      <legend>{legend}</legend>
      {vars.length === 0 && <p className="hint-block">No suitable variables in the table yet.</p>}
      {vars.map((v) => (
        <label key={v.name} className="check-row">
          <input type="checkbox" checked={isOn(v.name)}
            onChange={(e) => toggle(v.name, e.target.checked)} />
          <span>{v.name}</span>
          {v.kind === "categorical" && <span className="mv-kind">categorical</span>}
        </label>
      ))}
      {hint && <p className="hint-block">{hint}</p>}
    </fieldset>
  );
}

function CiField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Confidence level (%)">
      <NumInput label="Confidence level in percent" value={value} onChange={onChange} />
    </Field>
  );
}

const continuous = (t: DataTableModel) => variableInfo(t).filter((v) => v.kind === "continuous");

/* ------------------------------------------------------------ descriptive */

export function DescriptiveControls({ options, onChange }: ControlsProps<DescriptiveOptions>) {
  return (
    <div className="controls">
      <Section title="Descriptive statistics">
        <p className="hint-block">
          Continuous variables get the full column statistics; categorical
          variables get a count and fraction for each level. Blank and
          excluded cells count as missing.
        </p>
        <CiField value={options.ciLevel} onChange={(ciLevel) => onChange({ ...options, ciLevel })} />
      </Section>
      <Section title="Graph of the data">
        <p className="hint-block">
          The graph next to this analysis plots the table itself: pick the
          X and Y variables, color, size and labels above the plot, or switch
          to a categorical graph (groups on X) in the graph header.
        </p>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------ correlation */

export function CorrelationControls({ table, options, onChange }: ControlsProps<CorrelationOptions>) {
  const set = (p: Partial<CorrelationOptions>) => onChange({ ...options, ...p });
  return (
    <div className="controls">
      <VarChecklist legend="Variables" vars={continuous(table)} chosen={options.variables}
        emptyMeansAll onChange={(variables) => set({ variables })}
        hint="Only continuous variables are correlated." />
      <Section title="Correlation">
        <Field label="Method">
          <select aria-label="Correlation method" value={options.method}
            onChange={(e) => set({ method: e.target.value as CorrelationOptions["method"] })}>
            <option value="pearson">Pearson (assumes Gaussian data)</option>
            <option value="spearman">Spearman (nonparametric, ranks)</option>
          </select>
        </Field>
        <Field label="Missing values">
          <select aria-label="Missing values" value={options.missing}
            onChange={(e) => set({ missing: e.target.value as CorrelationOptions["missing"] })}>
            <option value="pairwise">Skip a row only for the pairs it is blank in</option>
            <option value="listwise">Skip any row with a blank</option>
          </select>
        </Field>
        <Field label="P value">
          <select aria-label="P value tails" value={options.tails}
            onChange={(e) => set({ tails: Number(e.target.value) === 1 ? 1 : 2 })}>
            <option value={2}>Two-tailed</option>
            <option value={1}>One-tailed</option>
          </select>
        </Field>
        <CiField value={options.ciLevel} onChange={(ciLevel) => set({ ciLevel })} />
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------ regression */

function ModelSpec<O extends RegressionOptions>({ table, options, onChange, outcomeHint, outcomeFilter }: {
  table: DataTableModel; options: O; onChange: (o: O) => void;
  outcomeHint: string; outcomeFilter: (v: VarInfo) => boolean;
}) {
  const info = variableInfo(table);
  const set = (p: Partial<O>) => onChange({ ...options, ...p });
  const candidates = info.filter((v) => v.name !== options.outcome);
  const chosen = options.predictors.filter((p) => candidates.some((v) => v.name === p));
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const idA = useId();
  const outcomes = info.filter(outcomeFilter);
  const outcomeKnown = outcomes.some((v) => v.name === options.outcome);

  const togglePredictor = (n: string, on: boolean) => {
    const next = on ? [...chosen, n] : chosen.filter((c) => c !== n);
    set({
      predictors: candidates.map((v) => v.name).filter((x) => next.includes(x)),
      interactions: options.interactions.filter(([x, y]) => next.includes(x) && next.includes(y)),
    } as Partial<O>);
  };

  return (
    <>
      <Section title="Outcome (dependent variable)">
        <select aria-label="Outcome variable" className="mv-wide"
          value={outcomeKnown ? options.outcome : ""}
          onChange={(e) => set({
            outcome: e.target.value,
            predictors: options.predictors.filter((p) => p !== e.target.value),
          } as Partial<O>)}>
          <option value="">Choose…</option>
          {outcomes.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
        </select>
        <p className="hint-block">{outcomeHint}</p>
      </Section>
      <fieldset className="mv-varlist">
        <legend>Predictors (independent variables)</legend>
        {candidates.length === 0 && <p className="hint-block">Add more variables to the table.</p>}
        {candidates.map((v) => {
          const on = chosen.includes(v.name);
          return (
            <div key={v.name} className="mv-pred">
              <label className="check-row">
                <input type="checkbox" checked={on}
                  onChange={(e) => togglePredictor(v.name, e.target.checked)} />
                <span>{v.name}</span>
                {v.kind === "categorical" && <span className="mv-kind">categorical</span>}
              </label>
              {on && v.kind === "categorical" && v.levels.length > 1 && (
                <label className="check-row mv-ref">
                  <span>Reference level</span>
                  <select aria-label={`Reference level of ${v.name}`}
                    value={v.levels.includes(options.referenceLevels[v.name] ?? "")
                      ? options.referenceLevels[v.name] : v.levels[0]}
                    onChange={(e) => set({
                      referenceLevels: { ...options.referenceLevels, [v.name]: e.target.value },
                    } as Partial<O>)}>
                    {v.levels.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
              )}
            </div>
          );
        })}
        <p className="hint-block">
          A categorical predictor enters as one 0/1 column per level other
          than its reference level.
        </p>
      </fieldset>
      <Section title="Interactions">
        {options.interactions.length === 0 && <p className="hint-block">None. Add products of two predictors below.</p>}
        <ul className="mv-rule-list">
          {options.interactions.map(([x, y], i) => (
            <li key={`${x}:${y}`}>
              <span>{x} × {y}</span>
              <button type="button" className="mv-remove" aria-label={`Remove interaction ${x} × ${y}`}
                onClick={() => set({ interactions: options.interactions.filter((_, j) => j !== i) } as Partial<O>)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        {chosen.length >= 2 && (
          <div className="mv-rule-add">
            <label htmlFor={idA} className="sr-only">First predictor</label>
            <select id={idA} value={a} onChange={(e) => setA(e.target.value)}>
              <option value="">Predictor…</option>
              {chosen.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span aria-hidden="true">×</span>
            <select aria-label="Second predictor" value={b} onChange={(e) => setB(e.target.value)}>
              <option value="">Predictor…</option>
              {chosen.filter((n) => n !== a).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button type="button" disabled={!a || !b || a === b
              || options.interactions.some(([x, y]) => (x === a && y === b) || (x === b && y === a))}
              onClick={() => {
                set({ interactions: [...options.interactions, [a, b]] } as Partial<O>);
                setA(""); setB("");
              }}>Add</button>
          </div>
        )}
      </Section>
    </>
  );
}

export function RegressionControls({ table, options, onChange }: ControlsProps<RegressionOptions>) {
  return (
    <div className="controls">
      <ModelSpec table={table} options={options} onChange={onChange}
        outcomeFilter={(v) => v.kind === "continuous"}
        outcomeHint="A continuous variable, fitted by least squares with an intercept." />
      <Section title="Options">
        <CiField value={options.ciLevel} onChange={(ciLevel) => onChange({ ...options, ciLevel })} />
      </Section>
    </div>
  );
}

export function LogisticControls({ table, options, onChange }: ControlsProps<LogisticOptions>) {
  const set = (p: Partial<LogisticOptions>) => onChange({ ...options, ...p });
  const out = variableInfo(table).find((v) => v.name === options.outcome);
  return (
    <div className="controls">
      <ModelSpec table={table} options={options} onChange={onChange}
        outcomeFilter={(v) => v.binary || v.name === options.outcome}
        outcomeHint="A binary variable: 0 and 1, or two text levels such as Yes / No." />
      {out?.kind === "categorical" && out.levels.length === 2 && (
        <Section title="Outcome coding">
          <Field label="Level counted as 1 (event)">
            <select aria-label="Level counted as 1"
              value={out.levels.includes(options.positiveLevel) ? options.positiveLevel : out.levels[1]}
              onChange={(e) => set({ positiveLevel: e.target.value })}>
              {out.levels.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
        </Section>
      )}
      <Section title="Classification">
        <Field label="Cutoff probability"
          note="Rows with a predicted probability above it are classified as 1.">
          <NumInput label="Classification cutoff" value={options.cutoff}
            onChange={(cutoff) => set({ cutoff })} />
        </Field>
        <Field label="Hosmer-Lemeshow groups">
          <NumInput label="Hosmer-Lemeshow groups" value={options.hlGroups}
            onChange={(hlGroups) => set({ hlGroups })} />
        </Field>
      </Section>
      <Section title="Confidence intervals">
        <Field label="Method">
          <select aria-label="Confidence interval method" value={options.ciMethod}
            onChange={(e) => set({ ciMethod: e.target.value as LogisticOptions["ciMethod"] })}>
            <option value="profile">Profile likelihood (asymmetrical)</option>
            <option value="wald">Wald (symmetrical)</option>
          </select>
        </Field>
        <CiField value={options.ciLevel} onChange={(ciLevel) => set({ ciLevel })} />
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------ PCA */

const SELECTION_LABELS: Record<PcaSelection, string> = {
  parallel_analysis: "Parallel analysis (recommended)",
  kaiser: "Eigenvalue greater than 1 (Kaiser)",
  variance: "Enough to explain a percentage of variance",
  number: "A fixed number of components",
  all: "All components",
};

export function PcaControls({ table, options, onChange }: ControlsProps<PcaOptions>) {
  const set = (p: Partial<PcaOptions>) => onChange({ ...options, ...p });
  return (
    <div className="controls">
      <VarChecklist legend="Variables" vars={continuous(table)} chosen={options.variables}
        emptyMeansAll onChange={(variables) => set({ variables })}
        hint="Rows with a blank in any chosen variable are left out." />
      <Section title="Data">
        <label className="check-row">
          <input type="checkbox" checked={options.standardize}
            onChange={(e) => set({ standardize: e.target.checked })} />
          <span>Standardize (scale each variable to SD 1)</span>
        </label>
        <p className="hint-block">
          Standardizing analyzes the correlation matrix, so variables measured
          on different scales weigh equally; otherwise the covariance matrix
          of the centered data is used.
        </p>
      </Section>
      <Section title="Components to keep">
        <select aria-label="Component selection" className="mv-wide" value={options.selection}
          onChange={(e) => set({ selection: e.target.value as PcaSelection })}>
          {(Object.keys(SELECTION_LABELS) as PcaSelection[]).map((k) => (
            <option key={k} value={k}>{SELECTION_LABELS[k]}</option>
          ))}
        </select>
        {options.selection === "parallel_analysis" && (
          <>
            <Field label="Simulated data sets">
              <NumInput label="Simulated data sets" value={options.nSimulations}
                onChange={(nSimulations) => set({ nSimulations })} />
            </Field>
            <Field label="Percentile">
              <NumInput label="Percentile of simulated eigenvalues" value={options.percentile}
                onChange={(percentile) => set({ percentile })} />
            </Field>
            <Field label="Random seed">
              <NumInput label="Random seed" value={options.seed} onChange={(seed) => set({ seed })} />
            </Field>
            <p className="hint-block">
              Keeps the components whose eigenvalue beats the chosen percentile
              of eigenvalues from random normal data of the same size.
            </p>
          </>
        )}
        {options.selection === "variance" && (
          <Field label="Cumulative variance (%)">
            <NumInput label="Cumulative variance in percent" value={options.varianceThreshold}
              onChange={(varianceThreshold) => set({ varianceThreshold })} />
          </Field>
        )}
        {options.selection === "number" && (
          <Field label="Components">
            <NumInput label="Number of components" value={options.nComponents}
              onChange={(nComponents) => set({ nComponents })} />
          </Field>
        )}
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------ extract & rearrange */

const NO_VALUE: FilterOp[] = ["is_missing", "not_missing"];

export function RearrangeControls({ table, options, onChange }: ControlsProps<RearrangeOptions>) {
  const info = variableInfo(table);
  const set = (p: Partial<RearrangeOptions>) => onChange({ ...options, ...p });
  const newNames = options.transforms.map((t) => t.newName.trim()).filter(Boolean);
  const allVars: VarInfo[] = [
    ...info,
    ...newNames.filter((n) => !info.some((v) => v.name === n))
      .map((n) => ({ name: n, kind: "continuous" as const, n: 0, levels: [], binary: false })),
  ];
  const editFilter = (i: number, p: Partial<RearrangeOptions["filters"][number]>) =>
    set({ filters: options.filters.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const editTransform = (i: number, p: Partial<RearrangeOptions["transforms"][number]>) =>
    set({ transforms: options.transforms.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const firstCont = info.find((v) => v.kind === "continuous")?.name ?? "";

  return (
    <div className="controls">
      <Section title="Transform">
        {options.transforms.length === 0 && (
          <p className="hint-block">No transforms. Add one to replace a variable, or to add a new one.</p>
        )}
        <ul className="mv-rule-list">
          {options.transforms.map((tr, i) => (
            <li key={i} className="mv-rule">
              <select aria-label={`Transform ${i + 1}: function`} value={tr.func}
                onChange={(e) => editTransform(i, { func: e.target.value as TransformFunc })}>
                {(Object.keys(TRANSFORM_LABELS) as TransformFunc[]).map((k) => (
                  <option key={k} value={k}>{TRANSFORM_LABELS[k]}</option>
                ))}
              </select>
              <span>of</span>
              <select aria-label={`Transform ${i + 1}: variable`} value={tr.variable}
                onChange={(e) => editTransform(i, { variable: e.target.value })}>
                {info.filter((v) => v.kind === "continuous").map((v) => (
                  <option key={v.name} value={v.name}>{v.name}</option>
                ))}
              </select>
              <span>as</span>
              <input className="constraint-value mv-name-input" aria-label={`Transform ${i + 1}: new variable name`}
                placeholder="(replace)" value={tr.newName}
                onChange={(e) => editTransform(i, { newName: e.target.value })} />
              <button type="button" className="mv-remove" aria-label={`Remove transform ${i + 1}`}
                onClick={() => set({ transforms: options.transforms.filter((_, j) => j !== i) })}>Remove</button>
            </li>
          ))}
        </ul>
        <button type="button" disabled={!firstCont}
          onClick={() => set({ transforms: [...options.transforms,
            { variable: firstCont, func: "log10", newName: `log ${firstCont}` }] })}>
          + Transform
        </button>
      </Section>

      <Section title="Rows to keep">
        {options.filters.length === 0 && <p className="hint-block">All rows. Add a condition to keep only some.</p>}
        {options.filters.length > 1 && (
          <Field label="Keep rows that match">
            <select aria-label="Combine conditions" value={options.combine}
              onChange={(e) => set({ combine: e.target.value === "or" ? "or" : "and" })}>
              <option value="and">all conditions</option>
              <option value="or">any condition</option>
            </select>
          </Field>
        )}
        <ul className="mv-rule-list">
          {options.filters.map((f, i) => {
            const v = allVars.find((x) => x.name === f.variable);
            const ops = (Object.keys(FILTER_OP_LABELS) as FilterOp[]).filter((op) =>
              v?.kind !== "categorical" || ["==", "!=", "in", "not_in", "is_missing", "not_missing"].includes(op));
            return (
              <li key={i} className="mv-rule">
                <select aria-label={`Condition ${i + 1}: variable`} value={f.variable}
                  onChange={(e) => editFilter(i, { variable: e.target.value })}>
                  {allVars.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
                </select>
                <select aria-label={`Condition ${i + 1}: test`} value={f.op}
                  onChange={(e) => editFilter(i, { op: e.target.value as FilterOp })}>
                  {ops.map((op) => <option key={op} value={op}>{FILTER_OP_LABELS[op]}</option>)}
                </select>
                {!NO_VALUE.includes(f.op) && (
                  v?.kind === "categorical" && (f.op === "==" || f.op === "!=") ? (
                    <select aria-label={`Condition ${i + 1}: value`} value={f.value}
                      onChange={(e) => editFilter(i, { value: e.target.value })}>
                      <option value="">Choose…</option>
                      {v.levels.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  ) : (
                    <input className="constraint-value mv-name-input"
                      aria-label={`Condition ${i + 1}: value`}
                      placeholder={f.op === "between" ? "low, high" : f.op === "in" || f.op === "not_in" ? "a, b, c" : "value"}
                      value={f.value} onChange={(e) => editFilter(i, { value: e.target.value })} />
                  )
                )}
                <button type="button" className="mv-remove" aria-label={`Remove condition ${i + 1}`}
                  onClick={() => set({ filters: options.filters.filter((_, j) => j !== i) })}>Remove</button>
              </li>
            );
          })}
        </ul>
        <button type="button" disabled={!allVars.length}
          onClick={() => set({ filters: [...options.filters,
            { variable: allVars[0]?.name ?? "", op: allVars[0]?.kind === "categorical" ? "==" : ">", value: "" }] })}>
          + Condition
        </button>
      </Section>

      <VarChecklist legend="Variables in the new table" vars={allVars} chosen={options.select}
        emptyMeansAll onChange={(select) => set({ select })}
        hint="Transforms run first, on every row; then the conditions pick rows." />

      <Section title="New table">
        <Field label="Name">
          <input className="constraint-value mv-name-input" aria-label="Name of the new table"
            placeholder="automatic" value={options.tableName}
            onChange={(e) => set({ tableName: e.target.value })} />
        </Field>
      </Section>
    </div>
  );
}
