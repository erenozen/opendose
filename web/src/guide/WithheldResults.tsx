// The results panel of a t test or one-way ANOVA whose P was withheld
// (fewer than two independent values in a group; sheets/common/
// withheld.ts): the values described, the P cell saying "withheld" with
// the reason and its source. The banner above says what replication would
// be needed (guide/smallN.ts).
import { formatSig } from "../types";
import { withheldInfo, withheldPhrase } from "../sheets/common/withheld";
import { SRC } from "./sources";

export default function WithheldResults({ result }: { result: unknown }) {
  const w = withheldInfo(result);
  if (!w) return null;
  const means = w.all.filter((g) => g.mean !== null);
  const two = means.length === 2;
  const title = two ? `${means[0].name} vs. ${means[1].name}` : means.map((g) => g.name).join(", ");
  return (
    <div className="result-card withheld-results">
      <h3>{title || "Results"}: descriptive only (exploratory)</h3>
      <table className="results-table goodness">
        <tbody>
          {w.all.map((g) => (
            <tr key={g.name}>
              <th>{w.matched ? `${g.name} (${g.n} matched)` : `${g.name} (n = ${g.n})`}</th>
              <td>{g.mean === null ? "n/a" : g.n > 1 ? `mean ${formatSig(g.mean)}` : formatSig(g.mean)}</td>
            </tr>
          ))}
          {two && (
            <tr>
              <th>Difference ({means[0].name} − {means[1].name})</th>
              <td>{formatSig((means[0].mean as number) - (means[1].mean as number))}</td>
            </tr>
          )}
          <tr className="withheld-p">
            <th>P value</th>
            <td>withheld: {withheldPhrase(w)} gives no estimate of the variability within
              groups, so no test was run (<a href={SRC.gpIndependent.url} target="_blank"
                rel="noreferrer">{SRC.gpIndependent.label}</a>).</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
