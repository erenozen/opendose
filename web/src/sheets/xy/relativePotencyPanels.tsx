// "Relative potency" (relativePotency.ts): the controls (model, reference
// and test data sets, equivalence margins) and the result (the potency
// ratio with Fieller's CI, the parallelism F test, the equivalence table,
// both curves' potencies).
import type { ReactNode } from "react";
import { softwareSentence } from "../../export/cite";
import { getRuntimeVersions } from "../../lib/engine";
import { modelMeta } from "../../lib/modelLibrary";
import type { DataTableModel } from "../../project/types";
import { formatSig } from "../../types";
import { NumberField } from "../../components/ui";
import CopyableMethods from "../common/CopyableMethods";
import { compareWeightingSentence, constraintValues, type CompareOptions } from "./compareFits";
import { filledDatasets } from "./compareParameter";
import {
  marginParameters, marginProblem, parallelFText, parallelSentence, parallelVerdict,
  potencyMethods, potencyParameter, potencyText, POTENCY_SOURCES, type Margin,
} from "./relativePotency";

/* eslint-disable @typescript-eslint/no-explicit-any */

const dsName = (t: DataTableModel, i: number) => t.datasets[i]?.name?.trim() || `Data set ${i + 1}`;

export function PotencyControls({ table, options, set, readOnly, model }: {
  table: DataTableModel; options: CompareOptions; set: (p: Partial<CompareOptions>) => void;
  readOnly?: boolean; model: ReactNode;
}) {
  const meta = modelMeta(options.model1);
  const pot = potencyParameter(meta);
  const params = marginParameters(meta, constraintValues(meta, options.constraints1));
  const filled = new Set(filledDatasets(table));
  const margins = options.margins ?? {};
  const setMargin = (name: string, patch: Partial<Margin>) => {
    const cur = margins[name] ?? { lower: "", upper: "" };
    set({ margins: { ...margins, [name]: { ...cur, ...patch } } });
  };
  const dsSelect = (label: string, value: number, key: "datasetA" | "datasetB") => (
    <label className="field">
      <span>{label}</span>
      <select value={value} disabled={readOnly} onChange={(e) => set({ [key]: Number(e.target.value) })}>
        {table.datasets.map((_, i) => (
          <option key={i} value={i} disabled={!filled.has(i)}>{dsName(table, i)}</option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <section>
        <h3>Model</h3>
        {model}
      </section>
      <section>
        <h3>Samples</h3>
        {dsSelect("Reference standard", options.datasetA, "datasetA")}
        {dsSelect("Test sample", options.datasetB, "datasetB")}
        <p className="hint-block">
          Both are fitted with every parameter shared except {pot ?? "the EC50"} (parallel curves),
          and with every parameter separate. The relative potency is the reference&apos;s EC50 divided
          by the test&apos;s: above 1, the test sample is more potent.
        </p>
      </section>
      {params.length > 0 && (
        <section className="potency-margins">
          <h3>Equivalence margins</h3>
          <p className="hint-block">
            Set these from the reference standard&apos;s history, before you look at these data
            (USP &lt;1032&gt;; Hauck et al. 2005). A curve pair is parallel enough when the 90% CI of
            each difference (test − reference; the ratio test / reference for a slope) lies inside its
            margin. Leave them blank to report the F test only.
          </p>
          {params.map((p) => {
            const mg = margins[p.name];
            const what = p.kind === "ratio" ? `${p.name} ratio` : `${p.name} difference`;
            return (
              <fieldset key={p.name} className="potency-margin">
                <legend>{what}</legend>
                <NumberField label="From" fieldClassName="field-num" disabled={readOnly}
                  value={mg?.lower ?? ""} onValueChange={(v) => setMargin(p.name, { lower: v })}
                  {...(p.kind === "ratio" ? { min: 0 } : {})}
                  error={marginProblem(mg, p.kind)} />
                <NumberField label="To" fieldClassName="field-num" disabled={readOnly}
                  value={mg?.upper ?? ""} onValueChange={(v) => setMargin(p.name, { upper: v })}
                  {...(p.kind === "ratio" ? { min: 0 } : {})} />
              </fieldset>
            );
          })}
        </section>
      )}
    </>
  );
}

const ciText = (ci: unknown) => (Array.isArray(ci) && typeof ci[0] === "number" && typeof ci[1] === "number"
  ? `${formatSig(ci[0])} to ${formatSig(ci[1])}` : "unbounded");

export function PotencyResults({ result }: { result: any }) {
  const r = result.potency;
  if (!r) return null;
  const p = r.potency ?? {};
  const eq = r.equivalence ?? {};
  const level = Math.round(100 * (p.ci_level ?? 0.95));
  const eqLevel = Math.round(100 * (eq.level ?? 0.9));
  const verdict = parallelVerdict(r);
  const lin = p.linear ?? "EC50";
  const f = parallelFText(r);
  const notes = [...(r.warnings ?? []), ...(r.notes ?? [])];
  return (
    <div className="results">
      <div className="result-card relative-potency">
        <h3>Relative potency of {r.test} against {r.reference}</h3>
        {verdict === "no" && (
          <div className="result-note result-note-warn" role="note"><p>{parallelSentence(r)}</p></div>
        )}
        <p className={`compare-headline${verdict === "no" ? " potency-unsupported" : ""}`}>
          <strong>Relative potency {potencyText(r)}</strong>
        </p>
        {verdict !== "no" && (
          <div className={`result-note${verdict === "yes" ? "" : " result-note-warn"}`} role="note">
            <p>{parallelSentence(r)}</p>
          </div>
        )}
        <table className="results-table goodness potency-table">
          <tbody>
            <tr>
              <th>Relative potency ({lin} of {r.reference} / {lin} of {r.test})</th>
              <td>{formatSig(p.ratio)}</td>
            </tr>
            <tr><th>{level}% CI (Fieller)</th><td>{ciText(p.ci)}</td></tr>
            {p.se_delta != null && <tr><th>SE (delta method)</th><td>{formatSig(p.se_delta)}</td></tr>}
            <tr><th>Parallel fit: degrees of freedom</th><td>{p.df}</td></tr>
            <tr><th>F test for parallelism</th><td>{f ?? "not computed (only the potency is fitted)"}</td></tr>
          </tbody>
        </table>
        <h4>Potency of each curve (parallel fit)</h4>
        <div className="compare-table-wrap">
          <table className="results-table">
            <thead>
              <tr>
                <th scope="col">Sample</th>
                <th scope="col" className="num">{p.parameter}</th>
                <th scope="col" className="num">SE</th>
                {p.parameter !== lin && <th scope="col" className="num">{lin}</th>}
              </tr>
            </thead>
            <tbody>
              {[["Reference", p.reference], ["Test", p.test]].map(([role, s]: any) => (
                <tr key={role}>
                  <th scope="row">{s?.name} ({role.toLowerCase()})</th>
                  <td className="num">{formatSig(s?.value)}</td>
                  <td className="num">{formatSig(s?.se)}</td>
                  {p.parameter !== lin && <td className="num">{formatSig(s?.ec50)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h4>Equivalence of the other parameters ({eqLevel}% CI, separate curves)</h4>
        {(eq.parameters ?? []).length ? (
          <div className="compare-table-wrap">
            <table className="results-table potency-equivalence">
              <thead>
                <tr>
                  <th scope="col">Parameter</th>
                  <th scope="col" className="num">Estimate</th>
                  <th scope="col">{eqLevel}% CI</th>
                  <th scope="col">Margin</th>
                  <th scope="col">Equivalent</th>
                </tr>
              </thead>
              <tbody>
                {eq.parameters.map((x: any) => (
                  <tr key={x.name}>
                    <th scope="row">{x.name} {x.kind === "ratio" ? "ratio (test / reference)" : "difference (test − reference)"}</th>
                    <td className="num">{formatSig(x.estimate)}</td>
                    <td>{ciText(x.ci)}</td>
                    <td>{x.margin ? `${formatSig(x.margin[0])} to ${formatSig(x.margin[1])}` : "not set"}</td>
                    <td>{x.margin ? (x.equivalent ? "Yes" : "No") : "not tested"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint-block">Only the potency is fitted: there are no other parameters to compare.</p>
        )}
        {notes.length > 0 && (
          <div className="result-note"><ul>{notes.map((w: string) => <li key={w}>{w}</li>)}</ul></div>
        )}
        <p className="hint-block">
          The F test cannot show that curves are parallel: a precise assay fails it on trivial
          differences and a noisy one passes it on large ones, so parallelism is shown by equivalence
          margins set in advance. On the graph, the parallel curves are solid and the separate curves
          dotted. Method: {POTENCY_SOURCES}.
        </p>
      </div>
    </div>
  );
}

export function PotencyMethods({ options, result }: { options: CompareOptions; result: any }) {
  if (!result?.potency) return null;
  const w = compareWeightingSentence(options);
  const text = `${potencyMethods(result.potency, modelMeta(options.model1).label)} `
    + `${w ? `${w} ` : ""}${softwareSentence(getRuntimeVersions())}`;
  return <CopyableMethods text={text} />;
}
