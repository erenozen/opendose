import { useId, useState } from "react";
import type { AnalysisResult, DatasetResult, FitResult } from "../types";
import { MODELS_META, formatSig, weightingLabel } from "../types";
import { RangeNote, RangeValueCell } from "../sheets/xy/rangeFlags";
import { rangeHidesSpread } from "../sheets/xy/rangeReport";
import { paramCI, paramLabel } from "./answer/keyFacts";
import { Button, NumText } from "./ui";

interface Props {
  result: AnalysisResult | null;
  xUnit?: string;
}

const AMBIGUOUS_NOTE = "Some parameters are not defined by the data (dependency > 0.9999), so the "
  + "fit is ambiguous. Consider constraining parameters.";

// Every model that can report this fits against log10(dose), so the stored
// x values are logs and read back as concentrations.
function extrapolationNote(
  e: NonNullable<FitResult["extrapolation"]>,
): string {
  const at = formatSig(10 ** e.value);
  const lo = formatSig(10 ** e.x_min);
  const hi = formatSig(10 ** e.x_max);
  const edge = e.direction === "above" ? hi : lo;
  const fold = formatSig(10 ** e.distance, 2);
  const name = e.param.replace("Log", "");
  return `The fitted ${name} (${at}) falls ${e.direction} every dose tested `
    + `(${lo} to ${hi}): about ${fold}x past ${edge}. The curve does not `
    + `reach its midpoint inside your data, so this value is read off the `
    + `model's tail rather than measured, which is why its confidence `
    + `interval is wide. Doses beyond ${edge} are what would pin it down.`;
}

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
  const hs = diag.hougaard_skewness?.parameters as Record<string, { skewness: number; interpretation: string | null }> | undefined;
  if (hs) {
    for (const [name, v] of Object.entries(hs)) {
      rows.push([`Hougaard's skewness: ${name}`,
        `${formatSig(v.skewness, 3)}${v.interpretation ? ` (${v.interpretation})` : ""}`]);
    }
  }
  if (!rows.length) return null;
  return (
    <>
      <table className="results-table goodness">
        <tbody>
          {rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}
        </tbody>
      </table>
      {hs && (
        <p className="hint-block">Hougaard&apos;s skewness says how far a parameter&apos;s estimate is from the
          symmetric distribution its asymptotic CI assumes: below 0.1 it behaves as in a
          linear model, 0.1 to 0.25 reasonably close, above 0.25 the CI is less trustworthy (consider profile
          likelihood CIs or a reparameterization, e.g. log K), above 1 very skewed (Ratkowsky 1990).</p>
      )}
    </>
  );
}

type Caveat = "ambiguous" | "extrapolated";

/** The Ambiguous and Extrapolated badges in a card's title: each a
 *  disclosure whose note opens under the title, so touch and keyboard
 *  users can read it too. */
function useCaveats(fit: FitResult) {
  const [open, setOpen] = useState<Caveat | null>(null);
  const id = useId();
  const notes: [Caveat, string, string][] = [];
  if (fit.status === "ambiguous") notes.push(["ambiguous", "Ambiguous", AMBIGUOUS_NOTE]);
  if (fit.extrapolation) {
    notes.push(["extrapolated", "Extrapolated", extrapolationNote(fit.extrapolation)]);
  }
  const badges = notes.map(([k, label]) => (
    <Button key={k} size="sm" className={`result-badge badge-${k}`} aria-expanded={open === k}
      aria-controls={`${id}-${k}`} onClick={() => setOpen(open === k ? null : k)}>{label}</Button>
  ));
  const shown = notes.find(([k]) => k === open);
  const detail = shown && (
    <p id={`${id}-${shown[0]}`} className={`caveat-note caveat-${shown[0]}`}>
      <NumText text={shown[2]} />
    </p>
  );
  return { badges, detail };
}

function FitCard({ ds, xUnit }: { ds: DatasetResult; xUnit: string }) {
  const fit = ds.fit!;
  const caveats = useCaveats(fit);
  const order = fit.param_order ?? Object.keys(fit.params);
  const ciHeader = fit.ci_method === "profile"
    ? "95% CI (profile likelihood)" : "95% CI (asymptotic)";
  return (
          <div className="result-card">
            <h3>
              {ds.name}
              {caveats.badges}
            </h3>
            {caveats.detail}
            <p className="model-line">
              {fit.label ?? MODELS_META[fit.model]?.label ?? fit.model}
              <br />
              <code>{fit.equation}</code>
            </p>
            {(fit.weighting && fit.weighting !== "none") && (
              <p className="model-line">{weightingLabel(fit.weighting)}</p>
            )}
            {fit.fit_method === "robust" && (
              <p className="model-line">
                Robust nonlinear regression (Lorentzian): best-fit values only. Robust fitting cannot
                give standard errors, confidence intervals or bands
                {typeof fit.goodness?.rsdr === "number" ? `; RSDR = ${formatSig(fit.goodness.rsdr)}` : ""}.
                {ds.robust_skipped?.length ? ` Not computed: ${ds.robust_skipped.map((k) => ({
                  bands: "bands", interpolate_y: "interpolation", diagnostics: "diagnostics",
                  absolute_ic50_level: "absolute IC50" } as Record<string, string>)[k] ?? k).join(", ")}.` : ""}
              </p>
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
              <caption className="sr-only">Best-fit values of {ds.name}</caption>
              <thead>
                <tr>
                  <th scope="col" aria-label="Parameter" />
                  <th scope="col">Best-fit value</th>
                  <th scope="col">Std. Error</th>
                  <th scope="col">{ciHeader}</th>
                </tr>
              </thead>
              <tbody>
                {order.map((name) => {
                  const e = fit.params[name];
                  if (!e) return null;
                  const label = paramLabel(name, e, xUnit);
                  // an IC50 beyond the doses tested: "> 30 (not reached ...)"
                  const hide = !e.constrained && rangeHidesSpread(name, fit);
                  return (
                    <tr key={name} className={e.derived ? "derived" : ""}>
                      <th scope="row">{label}</th>
                      <RangeValueCell name={name} e={e} fit={fit} fallback={<td>{e.constrained
                        ? `= ${formatSig(e.value)}` : formatSig(e.value)}</td>} />
                      <td>{e.constrained || e.derived || hide
                        ? "n/a" : formatSig(e.se)}</td>
                      <td>{e.constrained ? "(constrained)" : hide ? "not reported (extrapolated)" : paramCI(e)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <RangeNote fit={fit} />
            <table className="results-table goodness">
              <tbody>
                <tr><th>Degrees of freedom</th><td>{fit.goodness.df}</td></tr>
                <tr><th>R squared</th><td>{formatSig(fit.goodness.r_squared)}</td></tr>
                {typeof fit.goodness.r_squared_uncentered === "number" && (
                  <tr><th>R squared about Y = 0 (uncentred, line through the origin)</th>
                    <td>{formatSig(fit.goodness.r_squared_uncentered)}</td></tr>
                )}
                <tr><th>Sum of squares</th><td>{formatSig(fit.goodness.ss_res)}</td></tr>
                <tr><th>Sy.x</th><td>{formatSig(fit.goodness.sy_x)}</td></tr>
                <tr><th># of points analyzed</th><td>{fit.goodness.n_points}</td></tr>
              </tbody>
            </table>
          </div>
  );
}

export default function ResultsPanel({ result, xUnit = "M" }: Props) {
  if (!result) return null;
  if (result.error) {
    return <div className="results-error">Analysis failed: {result.error}</div>;
  }

  return (
    <div className="results">
      {result.datasets.map((ds, i) => (ds.error ? (
        <div key={i} className="result-card">
          <h3>{ds.name}</h3>
          <div className="results-error">Could not fit: {ds.error}</div>
        </div>
      ) : <FitCard key={i} ds={ds} xUnit={xUnit} />))}
    </div>
  );
}
