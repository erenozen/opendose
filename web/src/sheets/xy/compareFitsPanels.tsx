import { useSyncExternalStore } from "react";
import { softwareSentence } from "../../export/cite";
import { getRuntimeVersions } from "../../lib/engine";
import {
  modelLibraryVersion, modelMeta, subscribeModelLibrary,
} from "../../lib/modelLibrary";
import { formatPValue, pLabel, tableP } from "../../report/pformat";
import type { ConstraintState, ErrorBarKind } from "../../types";
import { ERROR_BAR_LABELS, formatSig } from "../../types";
import CopyableMethods from "../common/CopyableMethods";
import type { ControlsProps, ResultsProps } from "../types";
import {
  comparableModels, preferred, type CompareMethod, type CompareOptions, type CompareRow,
} from "./compareFits";
import { ParameterControls, ParameterMethods, ParameterResults } from "./compareParameterPanels";
import "./xy.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

function ModelSelect({ label, value, onChange, disabled }: {
  label: string; value: string; onChange: (id: string) => void; disabled?: boolean;
}) {
  useSyncExternalStore(subscribeModelLibrary, modelLibraryVersion);
  const groups = comparableModels();
  const known = groups.some((g) => g.models.some((m) => m.id === value));
  return (
    <label className="check-row">
      <span>{label}</span>
      <select className="model-select" value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}>
        {!known && <option value={value}>{modelMeta(value).label}</option>}
        {groups.map((g) => (
          <optgroup key={g.family} label={g.family}>
            {g.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function HoldConstant({ which, model, value, onChange, disabled }: {
  which: string; model: string; value: Record<string, ConstraintState>;
  onChange: (c: Record<string, ConstraintState>) => void; disabled?: boolean;
}) {
  const meta = modelMeta(model);
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
  const m1 = modelMeta(options.model1), m2 = modelMeta(options.model2);
  const logX = m1.needsLogX || (options.mode === "models" && m2.needsLogX);
  if (options.mode === "parameter") {
    return (
      <div className="controls">
        <ModeSection options={options} set={set} readOnly={readOnly} />
        <ParameterControls table={table} options={options} set={set} readOnly={readOnly}
          model={<>
            <ModelSelect label="Model" value={options.model1} disabled={readOnly}
              onChange={(id) => set({ model1: id, constraints1: {}, parameter: "" })} />
            <HoldConstant which="the model" model={options.model1} value={options.constraints1}
              disabled={readOnly} onChange={(c) => set({ constraints1: c })} />
          </>} />
        {logX && (
          <label className="check-row">
            <input type="checkbox" checked={options.xIsLog} disabled={readOnly}
              onChange={(e) => set({ xIsLog: e.target.checked })} />
            <span>X values are already log10(concentration)</span>
          </label>
        )}
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
          <ModelSelect label="Model 1" value={options.model1} disabled={readOnly}
            onChange={(id) => set({ model1: id, constraints1: {} })} />
          <HoldConstant which="model 1" model={options.model1} value={options.constraints1}
            disabled={readOnly} onChange={(c) => set({ constraints1: c })} />
          <ModelSelect label="Model 2" value={options.model2} disabled={readOnly}
            onChange={(id) => set({ model2: id, constraints2: {} })} />
          <HoldConstant which="model 2" model={options.model2} value={options.constraints2}
            disabled={readOnly} onChange={(c) => set({ constraints2: c })} />
          <p className="hint-block">
            To test one parameter (e.g. Hill slope = 1), choose the same model twice and
            hold the parameter constant in one of them.
          </p>
        </section>
      ) : (
        <section>
          <h3>Model</h3>
          <ModelSelect label="Model" value={options.model1} disabled={readOnly}
            onChange={(id) => set({ model1: id, constraints1: {} })} />
          <HoldConstant which="the model" model={options.model1} value={options.constraints1}
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
      <ErrorBarSection options={options} set={set} readOnly={readOnly} />
    </div>
  );
}

type SetOptions = (patch: Partial<CompareOptions>) => void;

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
            disabled={readOnly} onChange={() => set({ mode: "global" })} />
          One curve for all data sets vs. a separate curve for each
        </label>
        <label>
          <input type="radio" name="compare-mode" checked={options.mode === "parameter"}
            disabled={readOnly} onChange={() => set({ mode: "parameter" })} />
          Compare a parameter (logEC50, Hill slope, Top …) between two data sets
        </label>
      </fieldset>
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

function Card({ row, method, short }: { row: CompareRow; method: CompareMethod; short: [string, string] }) {
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
              <th className="num">Sum of squares</th>
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
      {(result.rows ?? []).map((row: CompareRow, i: number) => (
        <Card key={i} row={row} method={result.method} short={short} />
      ))}
    </div>
  );
}

export function CompareMethods({ options, result }: ResultsProps<CompareOptions, any>) {
  if (!result || result.error) return null;
  if (result.mode === "parameter") return <ParameterMethods options={options} result={result} />;
  const rows = (result.rows ?? []).filter((r: CompareRow) => r.models);
  if (!rows.length) return null;
  const [l1, l2] = result.labels ?? ["", ""];
  const what = result.mode === "global"
    ? `The “${l1}” model was fitted by nonlinear regression with one curve for all data sets `
      + "(every parameter shared) and with a separate curve for each data set"
    : `Each data set was fitted by nonlinear regression to model 1 (“${l1}”) and model 2 (“${l2}”)`;
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
    + `regression, 2004). ${each}. ${softwareSentence(getRuntimeVersions())}`;
  return <CopyableMethods text={text} />;
}
