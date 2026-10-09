// Results of a t test or one-way ANOVA run on the log scale (logScale.ts):
// the ratio of geometric means as a fold change with its CI, the
// geometric mean of each group with its CI, and the post hoc comparisons as
// ratios. The test itself (t, F, P) is the test on the logarithms.
import { formatSig } from "../../types";
import { tableP, tableStars } from "../../report/pformat";
import { adjustedHeader, familyOf, hasUnadjusted } from "../../report/family";
import FamilyLine from "../common/FamilyLine";
import { droppedValues, foldNumber, logBase, pairNames, ttestFold } from "./logScale";
import "./logScale.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ci = (c: unknown, fmt: (v: number) => string = (v) => formatSig(v)) =>
  (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number"
    ? `${fmt(c[0])} to ${fmt(c[1])}` : "n/a");

export function GeometricMeans({ result }: { result: any }) {
  const gm: any[] = Array.isArray(result.geometric_means) ? result.geometric_means : [];
  if (!gm.length) return null;
  return (
    <table className="results-table geometric-means">
      <caption className="sr-only">Geometric means</caption>
      <thead>
        <tr><th scope="col">Group</th><th scope="col">n</th><th scope="col">Geometric mean</th>
          <th scope="col">95% CI</th><th scope="col">Geometric SD factor</th></tr>
      </thead>
      <tbody>
        {gm.map((g) => (
          <tr key={g.name}>
            <th scope="row">{g.name}</th><td>{g.n}</td><td>{formatSig(g.geometric_mean)}</td>
            <td>{ci(g.ci)}</td><td>{formatSig(g.geometric_sd_factor)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LogNote({ result }: { result: any }) {
  const d = droppedValues(result);
  return (
    <p className="model-line log-note">
      Analysed on {logBase(result)}(values): t, F and P are those of the test on the
      logarithms; geometric means and ratios are their antilogs.
      {d && ` ${d.label}${d.groups.length ? ` (${d.groups.map(([g, n]) => `${g}: ${n}`).join(", ")})` : ""}.`}
    </p>
  );
}

/** Unpaired / Welch t test on the log scale. */
export function LogTTest({ result }: { result: any }) {
  const [a, b] = result.names ?? ["A", "B"];
  const fold = ttestFold(result);
  const base = logBase(result);
  const t = typeof result.t === "number" && typeof result.difference === "number" && result.difference < 0
    ? -Math.abs(result.t) : result.t;
  const rows: [string, string][] = [
    [`P value (two-tailed, test on ${base} values)`,
      `${tableP(result.p_two_tailed)} ${tableStars(result.p_two_tailed)}`],
    ["t, df", `t=${formatSig(t)}, df=${formatSig(result.df)}`],
    [`Ratio of geometric means (${a} / ${b})`, formatSig(result.ratio)],
    ["95% CI of the ratio", ci(result.ratio_ci)],
    [`Difference of mean ${base} (${a} − ${b})`,
      `${formatSig(result.difference)} (95% CI ${ci(result.ci_difference)})`],
  ];
  return (
    <div className="result-card">
      <h3>{a} vs. {b}, {result.test === "welch_t" ? "Welch's t test" : "unpaired t test"} on the log scale</h3>
      {fold && <p className="log-fold" data-fold>{fold}</p>}
      <table className="results-table goodness">
        <tbody>
          {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
        </tbody>
      </table>
      <h4>Geometric means</h4>
      <GeometricMeans result={result} />
      <LogNote result={result} />
    </div>
  );
}

/** The geometric means and the comparisons of a log-scale ANOVA as ratios
 *  (shown above the ANOVA table on the logarithms). */
export function LogAnovaRatios({ result }: { result: any }) {
  const mc = result.multiple_comparisons;
  const fam = mc ? familyOf(mc) : null;
  const unadj = !!mc && hasUnadjusted(mc.comparisons) && fam?.kind !== "unadjusted";
  return (
    <div className="result-card">
      <h3>Geometric means and ratios (one-way ANOVA on the log scale)</h3>
      <GeometricMeans result={result} />
      {mc && Array.isArray(mc.comparisons) && (
        <>
          <h4>Comparisons as ratios of geometric means</h4>
          <FamilyLine family={fam} />
          <table className="results-table comparisons-table log-ratios">
            <thead>
              <tr><th>Comparison</th><th>Ratio</th><th>95% CI of ratio</th>
                <th>{adjustedHeader(fam)}</th>{unadj && <th>Unadjusted P</th>}<th>Summary</th></tr>
            </thead>
            <tbody>
              {mc.comparisons.map((c: any, i: number) => {
                const n = pairNames(c.pair);
                const p = c.p_adjusted ?? (fam?.kind === "unadjusted" ? c.p_unadjusted : null);
                return (
                  <tr key={i}>
                    <th>{n ? `${n[0]} / ${n[1]}` : c.pair}</th>
                    <td>{typeof c.ratio === "number" ? `${foldNumber(c.ratio)}-fold` : "n/a"}</td>
                    <td>{c.ratio_ci ? ci(c.ratio_ci, foldNumber) : "n/a (step-down test)"}</td>
                    <td data-p={p ?? undefined}>{tableP(p)}</td>
                    {unadj && <td>{tableP(c.p_unadjusted)}</td>}
                    <td>{tableStars(p)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      <LogNote result={result} />
    </div>
  );
}
