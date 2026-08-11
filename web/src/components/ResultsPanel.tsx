import type { AnalysisResult, ParamEntry } from "../types";
import { MODELS_META, WEIGHTING_LABELS, formatSig } from "../types";

interface Props {
  result: AnalysisResult | null;
  xUnit?: string;
}

function ci(entry: ParamEntry | undefined): string {
  if (!entry?.ci95) return "n/a";
  const [lo, hi] = entry.ci95;
  const f = (v: number | null) =>
    v === null ? "(very wide)" : formatSig(v);
  return `${f(lo)} to ${f(hi)}`;
}

// Concentration-like derived parameters get the X unit appended.
const UNIT_PARAMS = new Set(["IC50", "EC50", "Km", "Kd", "AbsoluteIC50"]);

/* eslint-disable @typescript-eslint/no-explicit-any */
function Diagnostics({ diag }: { diag: any }) {
  const rows: [string, string][] = [];
  if (diag.replicates_test) {
    const r = diag.replicates_test;
    rows.push(["Replicates test (lack of fit)",
      `F=${formatSig(r.F)}, P=${formatSig(r.p)}: ` +
      (r.evidence_of_inadequate_model
        ? "evidence of inadequate model" : "model adequate")]);
  }
  if (diag.runs_test?.p != null) {
    rows.push(["Runs test",
      `${diag.runs_test.n_runs} runs, P=${formatSig(diag.runs_test.p)}`]);
  }
  if (diag.residual_normality) {
    const n = diag.residual_normality;
    rows.push(["Residual normality (Shapiro-Wilk)",
      `P=${formatSig(n.p)}, ${n.passed_alpha_05 ? "passed" : "failed"}`]);
  }
  if (!rows.length) return null;
  return (
    <table className="results-table goodness">
      <tbody>
        {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
      </tbody>
    </table>
  );
}

export default function ResultsPanel({ result, xUnit = "M" }: Props) {
  if (!result) return null;
  if (result.error) {
    return <div className="results-error">Analysis failed: {result.error}</div>;
  }

  return (
    <div className="results">
      {result.datasets.map((ds, i) => {
        if (ds.error) {
          return (
            <div key={i} className="result-card">
              <h3>{ds.name}</h3>
              <div className="results-error">Could not fit: {ds.error}</div>
            </div>
          );
        }
        const fit = ds.fit!;
        const order = fit.param_order ?? Object.keys(fit.params);
        const ciHeader = fit.ci_method === "profile"
          ? "95% CI (profile likelihood)" : "95% CI (asymptotic)";
        return (
          <div key={i} className="result-card">
            <h3>
              {ds.name}
              {fit.status === "ambiguous" && (
                <span className="badge-ambiguous"
                  title="Some parameters are not defined by the data (dependency > 0.9999), so the fit is ambiguous. Consider constraining parameters.">
                  Ambiguous
                </span>
              )}
            </h3>
            <p className="model-line">
              {fit.label ?? MODELS_META[fit.model]?.label ?? fit.model}
              <br />
              <code>{fit.equation}</code>
            </p>
            {(fit.weighting && fit.weighting !== "none") && (
              <p className="model-line">{WEIGHTING_LABELS[fit.weighting]}</p>
            )}
            {ds.rout && (
              <p className="model-line">
                ROUT (Q = {ds.rout.q * 100}%): {ds.rout.n_outliers} outlier
                {ds.rout.n_outliers === 1 ? "" : "s"} eliminated
                {ds.rout.n_outliers > 0 &&
                  `: ${ds.rout.outliers
                    .map((o) => `(${formatSig(o.x)}, ${formatSig(o.y)})`)
                    .join(", ")}`}
              </p>
            )}
            {ds.interpolated_x && (
              <p className="model-line">
                Interpolated X: {ds.interpolated_x
                  .map((v) => (v === null ? "out of range" : formatSig(v)))
                  .join(", ")}
              </p>
            )}
            {ds.diagnostics && <Diagnostics diag={ds.diagnostics} />}
            <table className="results-table">
              <thead>
                <tr>
                  <th />
                  <th>Best-fit value</th>
                  <th>Std. Error</th>
                  <th>{ciHeader}</th>
                </tr>
              </thead>
              <tbody>
                {order.map((name) => {
                  const e = fit.params[name];
                  if (!e) return null;
                  const base = UNIT_PARAMS.has(name)
                    ? `${name} (${xUnit})` : name;
                  const label = e.shared ? `${base} (shared)` : base;
                  return (
                    <tr key={name} className={e.derived ? "derived" : ""}>
                      <th>{label}</th>
                      <td>{e.constrained
                        ? `= ${formatSig(e.value)}` : formatSig(e.value)}</td>
                      <td>{e.constrained || e.derived
                        ? "n/a" : formatSig(e.se)}</td>
                      <td>{e.constrained ? "(constrained)" : ci(e)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <table className="results-table goodness">
              <tbody>
                <tr><th>Degrees of freedom</th><td>{fit.goodness.df}</td></tr>
                <tr><th>R squared</th><td>{formatSig(fit.goodness.r_squared)}</td></tr>
                <tr><th>Sum of squares</th><td>{formatSig(fit.goodness.ss_res)}</td></tr>
                <tr><th>Sy.x</th><td>{formatSig(fit.goodness.sy_x)}</td></tr>
                <tr><th># of points analyzed</th><td>{fit.goodness.n_points}</td></tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
