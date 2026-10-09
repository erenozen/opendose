// "Compare a parameter" (compareParameter.ts): the controls (model, the
// parameter, data sets A and B) and the result block (the ratio or the
// difference with its CI, the F test and AICc for one shared value, the
// two separate estimates, and "undefined (IC50 > …)" when an incomplete
// curve is involved).
import type { ReactNode } from "react";
import { softwareSentence } from "../../export/cite";
import { getRuntimeVersions } from "../../lib/engine";
import { modelMeta } from "../../lib/modelLibrary";
import type { DataTableModel } from "../../project/types";
import { formatPValue, pLabel } from "../../report/pformat";
import { formatSig } from "../../types";
import CopyableMethods from "../common/CopyableMethods";
import { chosenParameter, constraintValues, type CompareOptions } from "./compareFits";
import {
  aiccText, comparableParameters, COMPARE_PARAMETER_SOURCE, compareParameterMethods, fTestText,
  filledDatasets, headline, isMidpoint, linearName, MOTULSKY_2004, potencyText, ratioText,
  type MidpointFlag,
} from "./compareParameter";

/* eslint-disable @typescript-eslint/no-explicit-any */

const dsName = (t: DataTableModel, i: number) => t.datasets[i]?.name?.trim() || `Data set ${i + 1}`;

export function ParameterControls({ table, options, set, readOnly, model }: {
  table: DataTableModel; options: CompareOptions; set: (p: Partial<CompareOptions>) => void;
  readOnly?: boolean; model: ReactNode;
}) {
  const meta = modelMeta(options.model1);
  const params = comparableParameters(meta, constraintValues(meta, options.constraints1));
  const parameter = chosenParameter(options);
  const filled = new Set(filledDatasets(table));
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
        <h3>Parameter and data sets</h3>
        <label className="field">
          <span>Parameter</span>
          <select value={parameter} disabled={readOnly || !params.length}
            onChange={(e) => set({ parameter: e.target.value })}>
            {params.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        {dsSelect("Data set A (reference)", options.datasetA, "datasetA")}
        {dsSelect("Data set B", options.datasetB, "datasetB")}
        <p className="hint-block">
          Both data sets are fitted with {parameter || "the parameter"} shared and with separate
          values (the other parameters separate in both fits); the extra-sum-of-squares F test
          and AICc say whether one shared value is enough. The ratio is B / A
          {isMidpoint(parameter) && /^log/i.test(parameter)
            ? `: for ${parameter} it is the ${linearName(parameter)} ratio (the potency or dose ratio)` : ""}.
        </p>
      </section>
    </>
  );
}

const pct = (p: number) => {
  const v = 100 * p;
  if (v > 99.99) return "> 99.99%";
  if (v < 0.01) return "< 0.01%";
  return `${formatSig(v, 3)}%`;
};
const ciText = (ci: unknown) => (Array.isArray(ci) && typeof ci[0] === "number" && typeof ci[1] === "number"
  ? `${formatSig(ci[0])} to ${formatSig(ci[1])}` : "n/a");

function FlagNote({ flags, parameter }: { flags: MidpointFlag[]; parameter: string }) {
  if (!flags.length) return null;
  return (
    <div className="result-note result-note-warn" role="note">
      {flags.map((f) => (
        <p key={f.name}>
          {f.name}: the {f.label} lies {f.relation === ">" ? "above" : "below"} the concentrations
          tested ({f.text}, not reached), so its fitted {parameter} is an extrapolation and
          the {linearName(parameter)} ratio is undefined. Report it as {f.text}, or extend the
          concentration range (GraphPad Curve Fitting Guide, “Incomplete dose-response curves”).
        </p>
      ))}
    </div>
  );
}

export function ParameterResults({ result }: { result: any }) {
  const c = result.compare;
  if (!c) return null;
  const flags: MidpointFlag[] = result.flags ?? [];
  const [a, b] = c.dataset_names ?? ["A", "B"];
  const level = Math.round(100 * (c.ci_level ?? 0.95));
  const par = String(c.parameter);
  const potency = c.ratio?.kind === "potency_ratio";
  const lin = linearName(par);
  const rt = ratioText(c, flags, 4);
  const f = c.f_test;
  const d = c.difference;
  return (
    <div className="results">
      <div className="result-card compare-parameter">
        <h3>{par}: {b} vs {a}</h3>
        <p className="compare-headline"><strong>{headline(c, flags)}</strong></p>
        <FlagNote flags={flags} parameter={par} />
        <table className="results-table goodness compare-parameter-table">
          <tbody>
            {rt !== null && (
              <tr>
                <th>{potency ? `${lin} ratio (${b} / ${a}), relative potency` : `Ratio (${b} / ${a})`}</th>
                <td>{rt}</td>
              </tr>
            )}
            {potency && !flags.length && (
              <tr><th>Potency</th><td>{potencyText(c)}</td></tr>
            )}
            <tr>
              <th>Difference in {par} ({b} − {a})</th>
              <td>{formatSig(d?.value)} ({level}% CI {ciText(d?.ci)}); t = {formatSig(d?.t, 4)},
                df = {d?.df}, {pLabel(d?.p)}</td>
            </tr>
            {f ? (
              <tr>
                <th>F test for one shared {par}</th>
                <td>{fTestText(c)}</td>
              </tr>
            ) : (
              <tr><th>F test for one shared {par}</th><td>not computed (no degrees of freedom left)</td></tr>
            )}
            {c.aicc && <tr><th>AICc</th><td>{aiccText(c)}</td></tr>}
            {c.shared_fit?.value && (
              <tr>
                <th>Shared {par} (one value for both)</th>
                <td>{formatSig(c.shared_fit.value.value)} ({level}% CI {ciText(c.shared_fit.value.ci)})</td>
              </tr>
            )}
          </tbody>
        </table>
        <h4>Separate fits</h4>
        <div className="compare-table-wrap">
          <table className="results-table">
            <thead>
              <tr>
                <th scope="col">Data set</th>
                <th scope="col" className="num">{par}</th>
                <th scope="col" className="num">SE</th>
                <th scope="col">{level}% CI</th>
                {potency && <th scope="col">{lin}</th>}
                <th scope="col" className="num">Points</th>
                <th scope="col">Fit</th>
              </tr>
            </thead>
            <tbody>
              {(c.separate ?? []).map((s: any) => {
                const flag = flags.find((x) => x.name === s.name);
                return (
                  <tr key={s.name}>
                    <th scope="row">{s.name}</th>
                    <td className="num">{formatSig(s.value)}</td>
                    <td className="num">{formatSig(s.se)}</td>
                    <td>{ciText(s.ci)}</td>
                    {potency && (
                      <td>{flag ? `${flag.text} (not reached)`
                        : `${formatSig(10 ** s.value)} (${ciText(s.ci?.map((v: number) => 10 ** v))})`}</td>
                    )}
                    <td className="num">{s.n_points}</td>
                    <td>{s.status ?? "converged"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {f && (
          <p className="preferred-model">
            {f.p < 0.05
              ? `F test: separate ${par} values fit better than one shared value (${formatPValue(f.p)}).`
              : `F test: one shared ${par} is not rejected (${formatPValue(f.p)}).`}
            {c.aicc ? ` AICc: probability that separate values are correct ${pct(c.aicc.probability_2)}.` : ""}
          </p>
        )}
        {potency && (
          <p className="hint-block">
            The {lin} ratio is the antilog of the difference between the two fitted {par} values,
            and its CI the antilog of that difference's CI (the {lin} is fitted on the log scale,
            where its uncertainty is symmetric). It is the potency (dose) ratio: a ratio above 1 means
            {" "}{b} needs a higher concentration for the same effect.
          </p>
        )}
        {[...(c.warnings ?? []), ...(c.notes ?? [])].length > 0 && (
          <div className="result-note">
            <ul>{[...(c.warnings ?? []), ...(c.notes ?? [])].map((w: string) => <li key={w}>{w}</li>)}</ul>
          </div>
        )}
        <p className="hint-block">
          Method:{" "}
          <a href={COMPARE_PARAMETER_SOURCE.url} target="_blank" rel="noreferrer">{COMPARE_PARAMETER_SOURCE.label}</a>;
          {" "}{MOTULSKY_2004}. On the graph, each data set has its own fitted curve.
        </p>
      </div>
    </div>
  );
}

export function ParameterMethods({ options, result }: { options: CompareOptions; result: any }) {
  if (!result?.compare) return null;
  const text = `${compareParameterMethods(result.compare, modelMeta(options.model1).label)} `
    + `${softwareSentence(getRuntimeVersions())}`;
  return <CopyableMethods text={text} />;
}
