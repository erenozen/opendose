import { formatSig } from "../../types";
import type { ControlsProps, ResultsProps } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */

function fmtP(p: any): string {
  if (typeof p !== "number") return "n/a";
  return p < 0.0001 ? "< 0.0001" : formatSig(p, 4);
}

function fmtCI(ci: any): string {
  if (!Array.isArray(ci)) return "n/a";
  return `${formatSig(ci[0])} to ${formatSig(ci[1])}`;
}

export function ContingencyControls(_: ControlsProps) {
  void _;
  return (
    <div className="controls">
      <section>
        <h3>How to enter data</h3>
        <p className="hint-block">
          Rows are groups (e.g. exposed / not exposed); columns are
          outcomes. Enter the number of subjects in each cell as counts,
          not percentages. Click a label to rename it.
        </p>
      </section>
      <section>
        <h3>Which test</h3>
        <p className="hint-block">
          For 2×2 tables, Fisher&apos;s exact test is reported and
          recommended. Chi-square (with and without Yates&apos;
          correction) covers larger tables; odds ratio, relative risk
          and sensitivity/specificity are computed for 2×2.
        </p>
      </section>
    </div>
  );
}

export function ContingencyResults({ table, result }: ResultsProps<unknown, any>) {
  if (!result) return null;
  if (result.error) {
    return <div className="results-error">{String(result.error)}</div>;
  }
  const is2x2 = table.x.length === 2 && table.datasets.length === 2;
  return (
    <div className="result-card">
      <h3>Contingency table analysis</h3>
      <table className="results-table goodness">
        <tbody>
          {is2x2 && result.fisher_exact && (
            <tr>
              <th>Fisher's exact test (recommended for 2×2)</th>
              <td>P = {fmtP(result.fisher_exact.p)}</td>
            </tr>
          )}
          {result.chi_square && (
            <tr>
              <th>Chi-square, df</th>
              <td>
                {formatSig(result.chi_square.chi2)}, {result.chi_square.df}
                {", "}P = {fmtP(result.chi_square.p)}
              </td>
            </tr>
          )}
          {result.chi_square_yates && (
            <tr>
              <th>Chi-square with Yates' correction</th>
              <td>{formatSig(result.chi_square_yates.chi2)}, P ={" "}
                {fmtP(result.chi_square_yates.p)}</td>
            </tr>
          )}
          {result.odds_ratio && (
            <tr>
              <th>Odds ratio (Woolf 95% CI)</th>
              <td>{formatSig(result.odds_ratio.value)}{" "}
                ({fmtCI(result.odds_ratio.ci)})</td>
            </tr>
          )}
          {result.relative_risk && (
            <tr>
              <th>Relative risk (95% CI)</th>
              <td>{formatSig(result.relative_risk.value)}{" "}
                ({fmtCI(result.relative_risk.ci)})</td>
            </tr>
          )}
          {result.proportions && (
            <tr>
              <th>Difference between proportions</th>
              <td>{formatSig(result.proportions.p1)} −{" "}
                {formatSig(result.proportions.p2)} ={" "}
                {formatSig(result.proportions.difference)}</td>
            </tr>
          )}
          {result.sensitivity && (
            <>
              <tr>
                <th>Sensitivity (Wilson 95% CI)</th>
                <td>{formatSig(result.sensitivity.value)}{" "}
                  ({fmtCI(result.sensitivity.ci)})</td>
              </tr>
              <tr>
                <th>Specificity (Wilson 95% CI)</th>
                <td>{formatSig(result.specificity.value)}{" "}
                  ({fmtCI(result.specificity.ci)})</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
