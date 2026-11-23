// The equivalence block of a t test, one-sample t test or two-proportion
// result (report/equivalence.ts, P-12): the verdict, the typeset rows
// (margin, estimate, 90% CI, each one-sided test, P_TOST) and the 90% CI
// drawn against the margin lines.
import { formatSig } from "../../types";
import { pLabel, tableP } from "../../report/pformat";
import {
  TOST_SOURCES, equivalenceCI, equivalenceEstimate, equivalenceReading, equivalenceVerdict,
  estimateLabel, hasEquivalence, marginText, stripGeometry, tostRows,
} from "../../report/equivalence";
import { NumText } from "../../components/ui";
import "./equivalence.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The 90% CI as a bar with its estimate, between the margin lines; the
 *  line of no difference dotted. Decorative for screen readers: the rows
 *  above say the same in numbers. */
function Strip({ e }: { e: any }) {
  const g = stripGeometry(e);
  if (!g) return null;
  const W = 400, x = (f: number) => 8 + f * (W - 16);
  return (
    <svg className="equivalence-strip" viewBox={`0 0 ${W} 36`} role="img"
      aria-label={`${equivalenceCI(e)} against the margin ${marginText(e)}`}>
      <line className="eq-zero" x1={x(g.zero)} x2={x(g.zero)} y1={4} y2={32} />
      {g.marginLo !== null && <line className="eq-margin" x1={x(g.marginLo)} x2={x(g.marginLo)} y1={2} y2={34} />}
      {g.marginHi !== null && <line className="eq-margin" x1={x(g.marginHi)} x2={x(g.marginHi)} y1={2} y2={34} />}
      <line className="eq-ci" x1={x(g.lo)} x2={x(g.hi)} y1={18} y2={18} />
      <line className="eq-ci" x1={x(g.lo)} x2={x(g.lo)} y1={13} y2={23} />
      <line className="eq-ci" x1={x(g.hi)} x2={x(g.hi)} y1={13} y2={23} />
      <circle className="eq-est" cx={x(g.est)} cy={18} r={3.5} />
    </svg>
  );
}

export default function EquivalenceResults({ block, a, b, method }: {
  block: any;
  /** Names of the two sides of the estimate ("Group A", "Group B"). */
  a: string; b: string;
  /** "two one-sided t tests", "two one-sided score tests (…)". */
  method?: string;
}) {
  if (!block) return null;
  if (!hasEquivalence(block)) {
    return block.unavailable
      ? <p className="model-line">Equivalence test not run: {String(block.unavailable)}.</p> : null;
  }
  const e = block;
  const ni = e.kind === "noninferiority";
  const est = estimateLabel(e, a, b);
  const level = Math.round((e.ci_level ?? 0.9) * 100);
  const ciVals = e.scale === "ratio" && Array.isArray(e.ci_ratio) ? e.ci_ratio : e.ci;
  return (
    <div className="equivalence-results">
      <h4>{ni ? "Non-inferiority (one-sided test)" : "Equivalence (two one-sided tests)"}</h4>
      <p className="equivalence-verdict" data-shown={e.shown ? "true" : "false"}>
        {equivalenceVerdict(e, a, b)}
      </p>
      <table className="results-table goodness equivalence-table">
        <tbody>
          <tr><th>Margin ({est})</th><td>{marginText(e)}</td></tr>
          <tr><th>{e.scale === "ratio" ? `Ratio ${est}` : `Difference ${est}`}</th>
            <td>{formatSig(equivalenceEstimate(e))}</td></tr>
          <tr><th>{level}% CI</th><td>{`${formatSig(ciVals[0])} to ${formatSig(ciVals[1])}`}</td></tr>
          {tostRows(e, a, b).map((r) => (
            <tr key={r.label}><th>{r.label}</th><td>{`${r.statistic}, ${pLabel(r.p)}`}</td></tr>
          ))}
          {!ni && <tr><th>P (TOST, the larger one-sided P)</th><td>{tableP(e.p)}</td></tr>}
        </tbody>
      </table>
      <figure className="equivalence-figure">
        <Strip e={e} />
        <figcaption className="equivalence-key">
          The {level}% CI (bar, with the estimate) against the margin (dashed lines); the dotted
          line is no difference.
        </figcaption>
      </figure>
      <p className="model-line">
        <NumText text={equivalenceReading(e, a, b)} />{" "}
        {method ?? (ni ? "A one-sided t test on the test's own estimate"
          : "Two one-sided t tests on the test's own estimate")}: {ni
          ? `the ${level}% CI's limit lies past the margin exactly when the test rejects at one-sided α = ${formatSig(e.alpha ?? 0.05)}.`
          : `the ${level}% CI lies inside the margin exactly when both tests reject at α = ${formatSig(e.alpha ?? 0.05)}.`}{" "}
        <span className="source-line">Sources: {TOST_SOURCES.slice(0, 2).map((s, i) => (
          <span key={s.url}>{i > 0 && "; "}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
        ))}.</span>
      </p>
    </div>
  );
}
