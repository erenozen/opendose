// Under a curve fit's parameters (P-102): a fold with the correlation and
// covariance matrices of the free parameters, the matrix the standard
// errors come from (engine fitregion.covariance_block).
import type { FitResult } from "../../types";
import { matrixTable, type MatrixTable } from "./fitRegion";
import "./xy.css";

function Matrix({ table, caption }: { table: MatrixTable; caption: string }) {
  return (
    <div className="fit-matrix-scroll" tabIndex={0} role="region" aria-label={caption}>
      <table className="results-table goodness fit-matrix">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" aria-label="Parameter" />
            {table.params.map((p) => <th key={p} scope="col">{p}</th>)}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => (
            <tr key={r.name}>
              <th scope="row">{r.name}</th>
              {r.cells.map((c, j) => <td key={table.params[j]}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CovarianceFold({ name, fit }: { name: string; fit: FitResult }) {
  const corr = matrixTable(fit, "correlation");
  const cov = matrixTable(fit, "covariance");
  if (!corr || !cov) return null;
  return (
    <details className="advanced fit-fold fit-covariance" data-no-export>
      <summary>Parameter correlation and covariance</summary>
      <Matrix table={corr} caption={`Correlation of the parameters of ${name}`} />
      <p className="hint-block">
        Correlation of the estimates, from the covariance below (cov2cor). Near ±1, two parameters
        trade off against each other: the data pin down a combination of them better than either
        one, and each one&apos;s CI is wide for that reason.
      </p>
      <Matrix table={cov} caption={`Covariance of the parameters of ${name}`} />
      <p className="hint-block">
        The asymptotic covariance s²(J′J)⁻¹; the Std. Error column is the square root of its
        diagonal. Parameters held constant are not in it.
      </p>
    </details>
  );
}
