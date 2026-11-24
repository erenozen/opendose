import { useSyncExternalStore } from "react";
import { softwareSentence } from "../../export/cite";
import { getRuntimeVersions } from "../../lib/engine";
import {
  modelLibraryVersion, modelMeta, subscribeModelLibrary, USER_MODEL_ID, type ModelMeta,
} from "../../lib/modelLibrary";
import { savedEquations, subscribeEquations, type UserEquationDef } from "../../lib/userEquation";
import { formatPValue, pLabel, tableP } from "../../report/pformat";
import type { ConstraintState, ErrorBarKind, WeightingKind } from "../../types";
import { DEFAULT_WEIGHT_K, ERROR_BAR_LABELS, formatSig, WEIGHTING_LABELS, weightK } from "../../types";
import CopyableMethods from "../common/CopyableMethods";
import type { ControlsProps, ResultsProps } from "../types";
import {
  comparable, comparableModels, compareWeightingSentence, DEFAULT_COMPARE, isGlobalModel, nestingSentence,
  preferred,
  sideMeta, type CompareMethod, type CompareOptions, type CompareRow,
} from "./compareFits";
import { ParameterControls, ParameterMethods, ParameterResults } from "./compareParameterPanels";
import "./xy.css";
import { NumberField } from "../../components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */

const USER_PREFIX = "user:";

function ModelSelect({ label, value, onChange, disabled, scope = "single", equation, onEquation }: {
  label: string; value: string; onChange: (id: string) => void; disabled?: boolean;
  /** "models": also global-only models and the saved user equations. */
  scope?: "single" | "models";
  /** The user equation of this side (value = USER_MODEL_ID). */
  equation?: UserEquationDef | null;
  onEquation?: (def: UserEquationDef) => void;
}) {
  useSyncExternalStore(subscribeModelLibrary, modelLibraryVersion);
  const saved = useSyncExternalStore(subscribeEquations, savedEquations);
  const groups = comparableModels(scope);
  const user = value === USER_MODEL_ID && !!equation;
  const mine = scope === "models" && onEquation
    ? [...(user && !saved.some((d) => d.id === equation!.id) ? [equation!] : []), ...saved] : [];
  const current = user ? `${USER_PREFIX}${equation!.id}` : value;
  const known = user || groups.some((g) => g.models.some((m) => m.id === value));
  return (
    <label className="check-row">
      <span>{label}</span>
      <select className="model-select" value={current} disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          if (!v.startsWith(USER_PREFIX)) { onChange(v); return; }
          const def = mine.find((d) => `${USER_PREFIX}${d.id}` === v);
          if (def) onEquation?.(def);
        }}>
        {!known && <option value={value}>{modelMeta(value).label}</option>}
        {groups.map((g) => (
          <optgroup key={g.family} label={g.family}>
            {g.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}{scope === "models" && isGlobalModel(m) ? " (global)" : ""}
              </option>
            ))}
          </optgroup>
        ))}
        {mine.length > 0 && (
          <optgroup label="My equations">
            {mine.map((d) => (
              <option key={d.id} value={`${USER_PREFIX}${d.id}`}>
                {d.name.trim() || "User-defined equation"}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

function HoldConstant({ which, meta, value, onChange, disabled }: {
  which: string; meta: ModelMeta; value: Record<string, ConstraintState>;
  onChange: (c: Record<string, ConstraintState>) => void; disabled?: boolean;
}) {
  if (!meta.constrainable.length) return null;
  const on = meta.constrainable.filter((p) => value[p]?.enabled).length;
  return (
    <details className="advanced">
      <summary>Hold parameters of {which} constant{on ? ` (${on})` : ""}</summary>
      {meta.equation && <p className="hint-block"><code>{meta.equation}</code></p>}
      {meta.constrainable.map((p) => {
        const st = value[p] ?? { enabled: false, value: "" };
        return (
          <label key={p} className="constraint-row">
            <input type="checkbox" checked={st.enabled} disabled={disabled}
              aria-label={`Hold ${p} of ${which} constant`}
              onChange={(e) => onChange({ ...value, [p]: { ...st, enabled: e.target.checked } })} />
            <span>{p} = constant</span>
            <input className="constraint-value" inputMode="decimal" value={st.value}
              disabled={disabled || !st.enabled} aria-label={`${p} of ${which}: constant value`}
              onChange={(e) => onChange({ ...value, [p]: { ...st, value: e.target.value } })} />
          </label>
        );
      })}
    </details>
  );
}

const METHOD_LABELS: Record<CompareMethod, string> = {
  both: "Both: the extra-sum-of-squares F test (if nested) and AICc",
  f: "The models are nested: extra-sum-of-squares F test",
  aicc: "The models are not nested: AICc only",
};

export function CompareControls({ table, options, onChange, readOnly }: ControlsProps<CompareOptions>) {
  const set = (patch: Partial<CompareOptions>) => onChange({ ...options, ...patch });
  const m1 = modelMeta(options.model1);
  const s1 = sideMeta(options, 1), s2 = sideMeta(options, 2);
  const logX = options.mode === "models" ? s1.needsLogX || s2.needsLogX : m1.needsLogX;
  const globalConstants = [...new Set([...(s1.datasetConstants ?? []), ...(s2.datasetConstants ?? [])])];
  if (options.mode === "parameter") {
    return (
      <div className="controls">
        <ModeSection options={options} set={set} readOnly={readOnly} />
        <ParameterControls table={table} options={options} set={set} readOnly={readOnly}
          model={<>
            <ModelSelect label="Model" value={options.model1} disabled={readOnly}
              onChange={(id) => set({ model1: id, constraints1: {}, parameter: "" })} />
            <HoldConstant which="the model" meta={modelMeta(options.model1)} value={options.constraints1}
              disabled={readOnly} onChange={(c) => set({ constraints1: c })} />
          </>} />
        {logX && (
          <label className="check-row">
            <input type="checkbox" checked={options.xIsLog} disabled={readOnly}
              onChange={(e) => set({ xIsLog: e.target.checked })} />
            <span>X values are already log10(concentration)</span>
          </label>
        )}
        <WeightingSection options={options} set={set} readOnly={readOnly} />
        <ErrorBarSection options={options} set={set} readOnly={readOnly} />
      </div>
    );
  }
  return (
    <div className="controls">
      <ModeSection options={options} set={set} readOnly={readOnly} />
      {options.mode === "models" ? (
        <section>
          <h3>Models</h3>
          <ModelSelect label="Model 1" value={options.model1} disabled={readOnly} scope="models"
            equation={options.userEquation1}
            onEquation={(def) => set({ model1: USER_MODEL_ID, userEquation1: def, constraints1: {} })}
            onChange={(id) => set({ model1: id, userEquation1: null, constraints1: {} })} />
          <HoldConstant which="model 1" meta={s1} value={options.constraints1}
            disabled={readOnly} onChange={(c) => set({ constraints1: c })} />
          <ModelSelect label="Model 2" value={options.model2} disabled={readOnly} scope="models"
            equation={options.userEquation2}
            onEquation={(def) => set({ model2: USER_MODEL_ID, userEquation2: def, constraints2: {} })}
            onChange={(id) => set({ model2: id, userEquation2: null, constraints2: {} })} />
          <HoldConstant which="model 2" meta={s2} value={options.constraints2}
            disabled={readOnly} onChange={(c) => set({ constraints2: c })} />
          <p className="hint-block">
            To test one parameter (e.g. Hill slope = 1), choose the same model twice and
            hold the parameter constant in one of them.
          </p>
          {(isGlobalModel(s1) || isGlobalModel(s2)) && (
            <p className="hint-block">
              A global model (enzyme inhibition, Gaddum/Schild, or an equation that shares a
              parameter) is fitted to all data sets at once, so both models are fitted that way
              and compared once, over all data sets.
              {globalConstants.length > 0 && ` Each data set's ${globalConstants.join(", ")} is the
              number in its title (for example 6.25).`}
            </p>
          )}
        </section>
      ) : (
        <section>
          <h3>Model</h3>
          <ModelSelect label="Model" value={options.model1} disabled={readOnly}
            onChange={(id) => set({ model1: id, constraints1: {} })} />
          <HoldConstant which="the model" meta={modelMeta(options.model1)} value={options.constraints1}
            disabled={readOnly} onChange={(c) => set({ constraints1: c })} />
          <p className="hint-block">
            One curve shares every parameter between the data sets; the alternative fits
            each data set on its own.
          </p>
        </section>
      )}
      {logX && (
        <label className="check-row">
          <input type="checkbox" checked={options.xIsLog} disabled={readOnly}
            onChange={(e) => set({ xIsLog: e.target.checked })} />
          <span>X values are already log10(concentration)</span>
        </label>
      )}
      <section>
        <h3>Method</h3>
        <fieldset className="field-radios">
          <legend className="sr-only">Comparison method</legend>
          {(Object.keys(METHOD_LABELS) as CompareMethod[]).map((k) => (
            <label key={k}>
              <input type="radio" name="compare-method" checked={options.method === k}
                disabled={readOnly} onChange={() => set({ method: k })} />
              {METHOD_LABELS[k]}
            </label>
          ))}
        </fieldset>
        <p className="hint-block">
          The F test applies when one model is a special case of the other (the
          simpler one has fewer parameters). AICc compares any two models fitted to
          the same data.
        </p>
      </section>
      <WeightingSection options={options} set={set} readOnly={readOnly} />
      <ErrorBarSection options={options} set={set} readOnly={readOnly} />
    </div>
  );
}

type SetOptions = (patch: Partial<CompareOptions>) => void;

/** Leaving "Two models" for a one-model mode: a global-only model or a
 *  user equation in model 1 falls back to the default model. */
function singleModel(o: CompareOptions): Partial<CompareOptions> {
  return o.model1 === USER_MODEL_ID || !comparable(modelMeta(o.model1))
    ? { model1: DEFAULT_COMPARE.model1, userEquation1: null, constraints1: {} } : {};
}

function ModeSection({ options, set, readOnly }: { options: CompareOptions; set: SetOptions; readOnly?: boolean }) {
  return (
    <section>
      <h3>Compare</h3>
      <fieldset className="field-radios">
        <legend className="sr-only">What to compare</legend>
        <label>
          <input type="radio" name="compare-mode" checked={options.mode === "models"}
            disabled={readOnly} onChange={() => set({ mode: "models" })} />
          Two models, fitted to each data set
        </label>
        <label>
          <input type="radio" name="compare-mode" checked={options.mode === "global"}
            disabled={readOnly} onChange={() => set({ mode: "global", ...singleModel(options) })} />
          One curve for all data sets vs. a separate curve for each
        </label>
        <label>
          <input type="radio" name="compare-mode" checked={options.mode === "parameter"}
            disabled={readOnly} onChange={() => set({ mode: "parameter", ...singleModel(options) })} />
          Compare a parameter (logEC50, Hill slope, Top …) between two data sets
        </label>
      </fieldset>
    </section>
  );
}

function WeightingSection({ options, set, readOnly }: { options: CompareOptions; set: SetOptions; readOnly?: boolean }) {
  return (
    <section>
      <h3>Weighting</h3>
      <select aria-label="Weighting" value={options.weighting} disabled={readOnly}
        onChange={(e) => set({ weighting: e.target.value as WeightingKind })}>
        {(Object.keys(WEIGHTING_LABELS) as WeightingKind[]).map((w) => (
          <option key={w} value={w}>{WEIGHTING_LABELS[w]}</option>
        ))}
      </select>
      {options.weighting === "1/YK" && (
        <NumberField label="Weighting exponent K" fieldClassName="field-num"
          disabled={readOnly} key={weightK(options)} defaultValue={String(weightK(options))}
          min={0.1} max={10} step={0.1}
          onBlur={(e) => {
            const k = Number(e.currentTarget.value.replace(",", "."));
            set({ weightK: Number.isFinite(k) && k > 0 && k <= 10 ? k : DEFAULT_WEIGHT_K });
          }} />
      )}
      <p className="hint-block">
        Every fit in the comparison uses this weighting; weighted fits are compared on their
        weighted sums of squares. Opened from a curve fit, it starts as that fit&apos;s weighting.
      </p>
    </section>
  );
}

function ErrorBarSection({ options, set, readOnly }: { options: CompareOptions; set: SetOptions; readOnly?: boolean }) {
  return (
    <section>
      <h3>Error bars</h3>
      <select aria-label="Error bar type" value={options.errorBars} disabled={readOnly}
        onChange={(e) => set({ errorBars: e.target.value as ErrorBarKind })}>
        {(Object.keys(ERROR_BAR_LABELS) as ErrorBarKind[]).map((k) => (
          <option key={k} value={k}>{ERROR_BAR_LABELS[k]}</option>
        ))}
      </select>
    </section>
  );
}

const pct = (p: number) => {
  const v = 100 * p;
  if (v > 99.99) return "> 99.99%";
  if (v < 0.01) return "< 0.01%";
  return `${formatSig(v)}%`;
};

/** The preferred model in words, for the F test and for AICc. */
function preferredSentences(row: CompareRow, method: CompareMethod,
  short: [string, string]): string[] {
  const out: string[] = [];
  const name = (k: 1 | 2) => short[k - 1];
  if (method !== "aicc") {
    if (row.f && Number.isFinite(row.f.p)) {
      const pr = preferred(row, "f")!;
      const simpler = pr.model === row.f.simpler;
      out.push(`${method === "both" ? "F test: t" : "T"}he ${simpler ? "simpler" : "more complex"} `
        + `model (${name(pr.model)}) is preferred: ${pLabel(row.f.p)}.`);
    } else if (method === "f") {
      out.push("The two fits have the same number of parameters, so they are not nested and "
        + "the F test does not apply: compare them by AICc.");
    }
  }
  if (method !== "f" && row.aicc) {
    const k = row.aicc.prefer;
    const p = k === 1 ? row.aicc.probability1 : row.aicc.probability2;
    const who = method === "both" ? name(k) : name(k).charAt(0).toUpperCase() + name(k).slice(1);
    out.push(`${method === "both" ? "AICc: " : ""}${who} is more likely to be correct `
      + `(probability ${pct(p)}).`);
  }
  return out;
}

function shortNames(result: any): [string, string] {
  return result?.mode === "global"
    ? ["one curve for all data sets", "a separate curve for each data set"]
    : ["model 1", "model 2"];
}

function Card({ row, method, short, weighted }: {
  row: CompareRow; method: CompareMethod; short: [string, string]; weighted?: boolean;
}) {
  if (row.error || !row.models) {
    return (
      <div className="result-card">
        <h3>{row.name}</h3>
        <div className="results-error">Could not compare: {String(row.error ?? "no result")}</div>
      </div>
    );
  }
  const showF = method !== "aicc";
  const showA = method !== "f" && !!row.aicc;
  const sentences = preferredSentences(row, method, short);
  return (
    <div className="result-card">
      <h3>{row.name}</h3>
      <div className="compare-table-wrap">
        <table className="results-table compare-table">
          <thead>
            <tr>
              <th>Model</th>
              <th className="num">{weighted ? "Weighted sum of squares" : "Sum of squares"}</th>
              <th className="num">DF</th>
              <th className="num">Parameters</th>
              {showA && <th className="num">AICc</th>}
              {showA && <th className="num">Probability correct</th>}
            </tr>
          </thead>
          <tbody>
            {row.models.map((m, i) => (
              <tr key={i}>
                <th>{i + 1}. {m.label}</th>
                <td className="num">{formatSig(m.ss)}</td>
                <td className="num">{m.df}</td>
                <td className="num">{m.k}</td>
                {showA && <td className="num">{formatSig(i === 0 ? row.aicc!.aicc1 : row.aicc!.aicc2)}</td>}
                {showA && <td className="num">{pct(i === 0 ? row.aicc!.probability1 : row.aicc!.probability2)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <table className="results-table goodness">
        <tbody>
          {showF && row.f && (
            <>
              <tr><th>Extra-sum-of-squares F test</th>
                <td>F ({row.f.dfn}, {row.f.dfd}) = {formatSig(row.f.F)}</td></tr>
              <tr><th>P value</th><td>{tableP(row.f.p)}</td></tr>
            </>
          )}
          {showF && !row.f && (
            <tr><th>Extra-sum-of-squares F test</th><td>not nested (same degrees of freedom)</td></tr>
          )}
          {showA && (
            <tr><th>Difference in AICc (2 − 1)</th><td>{formatSig(row.aicc!.delta)}</td></tr>
          )}
          <tr><th>Number of points</th><td>{row.n}</td></tr>
        </tbody>
      </table>
      {sentences.map((s, i) => <p key={i} className="preferred-model">{s}</p>)}
    </div>
  );
}

export function CompareResults({ result }: ResultsProps<CompareOptions, any>) {
  if (!result) return null;
  if (result.error) return <div className="results-error">Analysis failed: {String(result.error)}</div>;
  if (result.mode === "parameter") return <ParameterResults result={result} />;
  const short = shortNames(result);
  return (
    <div className="results">
      {result.mode === "models" && (
        <p className="hint-block">Model 1: {result.labels?.[0]}. Model 2: {result.labels?.[1]}.
          On the graph, model 2 is dotted.</p>
      )}
      {result.mode === "global" && (
        <p className="hint-block">Model: {result.labels?.[0]}. On the graph, the separate curves
          are solid and the one curve for all data sets is dotted.</p>
      )}
      {result.mode === "models" && result.nesting
        && (result.nesting.status !== "unknown" || !result.global) && (
        <p className="hint-block compare-nesting">{nestingSentence(result.nesting)}</p>
      )}
      {result.global && result.constants && Object.entries(result.constants as Record<string, number[]>)
        .map(([p, v]) => (
          <p key={p} className="hint-block">{p} of each data set, read from its title: {v.map((x) => formatSig(x)).join(", ")}.</p>
        ))}
      {(result.rows ?? []).map((row: CompareRow, i: number) => (
        <Card key={i} row={row} method={result.method} short={short} weighted={!!result.weighted} />
      ))}
      {result.global && [...(result.warnings ?? []), ...(result.notes ?? [])].length > 0 && (
        <div className="result-note">
          <ul>{[...(result.warnings ?? []), ...(result.notes ?? [])].map((w: string) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

const withSpace = (s: string) => (s ? `${s} ` : "");

export function CompareMethods({ options, result }: ResultsProps<CompareOptions, any>) {
  if (!result || result.error) return null;
  if (result.mode === "parameter") return <ParameterMethods options={options} result={result} />;
  const rows = (result.rows ?? []).filter((r: CompareRow) => r.models);
  if (!rows.length) return null;
  const [l1, l2] = result.labels ?? ["", ""];
  const consts = Object.keys(result.constants ?? {});
  const what = result.mode === "global"
    ? `The “${l1}” model was fitted by nonlinear regression with one curve for all data sets `
      + "(every parameter shared) and with a separate curve for each data set"
    : result.global
      ? `All data sets were fitted at once (global nonlinear regression) to model 1 (“${l1}”) and `
        + `model 2 (“${l2}”)${consts.length ? `, with ${consts.join(", ")} of each data set read `
        + "from its title" : ""}`
      : `Each data set was fitted by nonlinear regression to model 1 (“${l1}”) and model 2 (“${l2}”)`;
  const nest = result.mode === "models" && result.nesting?.status === "nested"
    ? ` Model ${result.nesting.simpler} is a special case of the other (${result.nesting.reason}).`
    : result.mode === "models" && result.nesting?.status === "not_nested"
      ? " The models are not nested, so only AICc applies." : "";
  const m = options.method;
  const how = m === "f"
    ? "the fits were compared with the extra-sum-of-squares F test for nested models (the "
      + "simpler model was rejected when P < 0.05)"
    : m === "aicc"
      ? "the fits were compared with Akaike's information criterion corrected for small "
        + "samples (AICc), from which the probability that each model is correct was computed"
      : "the fits were compared with the extra-sum-of-squares F test for nested models (the "
        + "simpler model was rejected when P < 0.05) and with Akaike's information criterion "
        + "corrected for small samples (AICc), from which the probability that each model is "
        + "correct was computed";
  const each = rows.map((r: CompareRow) => {
    const parts: string[] = [];
    if (m !== "aicc" && r.f) parts.push(`F(${r.f.dfn}, ${r.f.dfd}) = ${formatSig(r.f.F)}, ${formatPValue(r.f.p)}`);
    if (m !== "f" && r.aicc) parts.push(`ΔAICc = ${formatSig(r.aicc.delta)}`);
    return `${r.name}: ${parts.join("; ")}`;
  }).join("; ");
  const text = `${what}; ${how}, as described in the GraphPad Prism curve-fitting guide and by `
    + `Motulsky and Christopoulos (Fitting models to biological data using linear and nonlinear `
    + `regression, 2004).${nest} ${each}. ${withSpace(compareWeightingSentence(options))}`
    + `${softwareSentence(getRuntimeVersions())}`;
  return <CopyableMethods text={text} />;
}
