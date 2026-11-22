// The zero-dose note on a nonlinear-regression results sheet: which points
// a log(X) model left out because X = 0 has no logarithm, their mean, and
// (one curve) a button that constrains the plateau they represent to it.
import { useProject } from "../../app/context";
import { updateResultsOptions } from "../../project/ops";
import type { ResultsSheet } from "../../project/types";
import type { AnalysisResult, OptionsState } from "../../types";
import { formatSig } from "../../types";
import { withConstraint } from "./fitOptions";
import { zeroDosePlan } from "./zeroDose";

export function ZeroDoseBar({ sheet, result, options }: {
  sheet: ResultsSheet; result: AnalysisResult | null; options: OptionsState;
}) {
  const api = useProject();
  const plan = zeroDosePlan(result, options);
  if (!plan) return null;
  const locked = !!sheet.frozen || api.readOnly;
  const at = (xs: number[]) => (xs.length === 1 && xs[0] === 0 ? "X = 0" : `X = ${xs.map((v) => formatSig(v)).join(", ")}`);
  const constrain = () => {
    if (!plan.plateau || plan.value === null) return;
    api.apply((p) => updateResultsOptions(p, sheet.id, (o) =>
      withConstraint(o as OptionsState, plan.plateau!, { enabled: true, value: plan.value! })));
  };
  return (
    <div className="result-card zero-dose" role="note" aria-label="Zero dose left out">
      <p className="range-chip">
        <strong>Left out of the fit: the zero dose</strong>{" "}
        {plan.groups.map((g, i) => (
          <span key={g.name}>{i ? "; " : ""}{plan.groups.length > 1 || g.name ? `${g.name}: ` : ""}
            {g.n} value{g.n === 1 ? "" : "s"} at {at(g.x)}, mean {formatSig(g.mean)}</span>
        ))}.
        {" "}The model uses log(X), and 0 has no logarithm, so these wells cannot be points on the curve.
      </p>
      {plan.plateau && plan.value !== null ? (
        plan.constrained ? (
          <p className="hint-block">{plan.plateau} is constrained to {plan.value}, the mean of the zero-dose
            wells, so they still set the curve&apos;s {plan.plateau === "Top" ? "upper" : "lower"} plateau.</p>
        ) : (
          <div className="zero-dose-actions">
            <button type="button" disabled={locked} onClick={constrain}>
              Constrain {plan.plateau} to {plan.value}
            </button>
            <p className="hint-block">
              The zero dose is the response with no drug, the curve&apos;s {plan.plateau === "Top" ? "upper" : "lower"}{" "}
              plateau. Constraining {plan.plateau} to its mean puts those wells to use; the fitted{" "}
              {plan.plateau} otherwise comes from the other doses alone.
            </p>
          </div>
        )
      ) : (
        <p className="hint-block">
          {plan.groups.length > 1
            ? "With several curves, normalise each to its own zero-dose wells, or constrain the plateau per curve; one shared constraint would not fit groups with different controls."
            : "Constrain the plateau the zero-dose wells represent to their mean, or normalise to them."}
        </p>
      )}
    </div>
  );
}
