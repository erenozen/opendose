// Under a curve fit's parameters: how its bootstrap CIs were made (P-101)
// or why there are none, the caveats next to them, and a fold with each
// value's bootstrap SE and bias beside the asymptotic CI it replaced.
import { formatSig, type FitResult } from "../../types";
import { NumText } from "../../components/ui";
import { bootstrapNote, bootstrapRows, bootstrapWarnings } from "./bootstrap";
import "./xy.css";

export function BootstrapNote({ name, fit }: { name: string; fit: FitResult }) {
  const note = bootstrapNote(fit);
  if (!note) return null;
  const warnings = bootstrapWarnings(fit);
  const rows = bootstrapRows(fit);
  return (
    <>
      <p className="model-line fit-bootstrap"><NumText text={note} /></p>
      {rows.length > 0 && (
        // The coverage caveat sits next to the numbers (P-101 validation:
        // 91 to 94.5% for 95% percentile intervals at 27 points, 4 parameters).
        <p className="model-line fit-note fit-bootstrap-coverage">
          <NumText text={"Percentile intervals can run a little narrow with few points: in this app's"
            + " simulations of a 4-parameter fit to 27 points, 95% intervals held the true value"
            + " 91% to 94.5% of the time. Compare them with the asymptotic CIs under Bootstrap"
            + " details (Efron & Tibshirani 1993, An Introduction to the Bootstrap, ch. 13)."} />
        </p>
      )}
      {warnings.map((w) => (
        <p key={w} className="model-line fit-note fit-bootstrap-warning"><NumText text={w} /></p>
      ))}
      {rows.length > 0 && (
        <details className="advanced fit-fold fit-bootstrap-detail" data-no-export>
          <summary>Bootstrap details</summary>
          <table className="results-table goodness">
            <caption className="sr-only">Bootstrap SE and bias of {name}</caption>
            <thead>
              <tr>
                <th scope="col">Value</th>
                <th scope="col">Bootstrap SE</th>
                <th scope="col">Bias</th>
                <th scope="col">95% CI (asymptotic)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <th scope="row">{r.name}</th>
                  <td>{r.se === null ? "n/a" : formatSig(r.se)}</td>
                  <td>{r.bias === null ? "n/a" : formatSig(r.bias)}</td>
                  <td>{r.asymptotic ? `${formatSig(r.asymptotic[0])} to ${formatSig(r.asymptotic[1])}` : "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint-block">
            Bias is the mean of the refitted values minus the best-fit value. A bias that is large
            next to the bootstrap SE, or a bootstrap CI far from the asymptotic one, says the
            asymptotic CI is a poor approximation for these data.
          </p>
        </details>
      )}
    </>
  );
}
