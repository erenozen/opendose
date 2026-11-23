// Results of Cochran's Q (P-45): the test, the proportion of yes per
// condition and the pairwise McNemar tests with their Holm family
// (engine trend.cochrans_q).
import { formatSig } from "../../types";
import { tableP, tableStars } from "../../report/pformat";
import { adjustedHeader, familyOf } from "../../report/family";
import FamilyLine from "../common/FamilyLine";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function CochranQ({ result }: { result: any }) {
  const names: string[] = result.names ?? [];
  const mc = result.comparisons;
  const fam = familyOf(mc, "holm");
  return (
    <div className="result-card">
      <h3>Cochran&apos;s Q test</h3>
      <table className="results-table goodness">
        <tbody>
          <tr><th scope="row">Cochran&apos;s Q</th><td>{formatSig(result.Q)}</td></tr>
          <tr><th scope="row">df</th><td>{result.df}</td></tr>
          <tr><th scope="row">P value (chi-square)</th>
            <td>{`${tableP(result.p)} ${tableStars(result.p)}`}</td></tr>
          <tr><th scope="row">n subjects (complete rows)</th><td>{result.n_subjects}</td></tr>
          <tr><th scope="row">Subjects whose answer differs between conditions</th>
            <td>{result.n_informative}</td></tr>
        </tbody>
      </table>
      <table className="results-table">
        <thead><tr><th>Condition</th><th>Yes (1)</th><th>Proportion yes</th></tr></thead>
        <tbody>
          {names.map((n, j) => (
            <tr key={j}><th scope="row">{n}</th><td>{result.successes?.[j]}</td>
              <td>{formatSig(result.proportions?.[j])}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="model-line">
        Rows are subjects, columns are conditions, 1 is yes and 0 is no. Subjects with the same
        answer under every condition do not change Q. Cochran (1950).
      </p>
      {mc && (
        <>
          <h4>Pairwise McNemar tests</h4>
          <FamilyLine family={fam} />
          <div className="results-scroll">
          <table className="results-table comparisons-table">
            <thead>
              <tr><th>Comparison</th><th>Discordant pairs (yes/no, no/yes)</th>
                <th>Difference in proportion yes</th><th>{adjustedHeader(fam)}</th>
                <th>Unadjusted P</th><th>Summary</th></tr>
            </thead>
            <tbody>
              {(mc.comparisons as any[]).map((c, i) => (
                <tr key={i}>
                  <th scope="row">{c.pair}</th>
                  <td>{`${c.discordant[0]}, ${c.discordant[1]}`}</td>
                  <td>{formatSig(c.difference)}</td>
                  <td>{tableP(c.p_adjusted)}</td>
                  <td>{tableP(c.p_unadjusted)}</td>
                  <td>{tableStars(c.p_adjusted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p className="model-line">
            Each pair&apos;s P is the exact binomial test of its discordant subjects
            (McNemar&apos;s test, exact at any count), adjusted by Holm&apos;s step-down method.
          </p>
        </>
      )}
    </div>
  );
}
