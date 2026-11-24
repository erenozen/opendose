// The zero-dose note on a nonlinear-regression results sheet: which points
// a log(X) model left out because X = 0 has no logarithm, their mean, and
// a way to put those wells to use: (one curve) constrain the plateau they
// represent to their mean; (several curves, P-104) hold that plateau of
// each curve at its own zero-dose wells, with a stated reason.
import { useState, type FormEvent } from "react";
import { useProject } from "../../app/context";
import { SRC } from "../../guide/sources";
import { updateResultsOptions } from "../../project/ops";
import type { ResultsSheet } from "../../project/types";
import type { AnalysisResult, OptionsState } from "../../types";
import { formatSig } from "../../types";
import { Button, Field, Input } from "../../components/ui";
import { withConstraint } from "./fitOptions";
import { zeroDosePlan, ZERO_DOSE_REASON, type ZeroDosePlan } from "./zeroDose";

const plateauWord = (p: "Top" | "Bottom") => (p === "Top" ? "upper" : "lower");

function Sources() {
  const src = [SRC.gpRelAbsIc50];
  return (
    <p className="guide-chip-sources">
      {src.map((s) => (
        <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="guide-source">
          {s.label}</a>
      ))}
    </p>
  );
}

/** Several curves: hold one plateau of each at its own zero-dose wells. */
function PerCurve({ plan, locked, onSet }: {
  plan: ZeroDosePlan; locked: boolean;
  onSet: (z: { param: "Top" | "Bottom"; reason: string } | null) => void;
}) {
  const [reason, setReason] = useState(ZERO_DOSE_REASON);
  const [tries, setTries] = useState(0);
  if (plan.active) {
    const p = plan.active.param;
    return (
      <div className="zero-dose-actions">
        <p className="hint-block">
          Each curve&apos;s {p} is held at the mean of its own zero-dose wells
          {plan.held.length ? ": " : "."}
          {plan.held.map((h, i) => (
            <span key={h.name}>{i ? "; " : ""}{h.name} {formatSig(h.value)} (n = {h.n})</span>
          ))}
          {plan.held.length ? "." : ""} Stated reason: {plan.active.reason.trim().replace(/\.$/, "")}.
        </p>
        <Button size="sm" disabled={locked} onClick={() => onSet(null)}>
          Stop holding {p} at the zero-dose wells
        </Button>
      </div>
    );
  }
  const p = plan.perCurve;
  if (!p) {
    return (
      <p className="hint-block">
        Normalise each curve to its own zero-dose wells, or hold the plateau they represent at
        them; one shared constraint would not fit groups with different controls.
      </p>
    );
  }
  const problem = reason.trim() ? null : "Enter why the zero-dose wells can set this plateau";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTries((n) => n + 1);
    if (!problem) onSet({ param: p, reason: reason.trim() });
  };
  return (
    <form className="zero-dose-actions" onSubmit={submit}>
      <p className="hint-block">
        The zero dose is each curve&apos;s response with no drug, its {plateauWord(p)} plateau.
        Holding each curve&apos;s {p} at the mean of its own zero-dose wells puts those wells to
        use without drawing them as a dose; the fitted {p} otherwise comes from the other doses
        alone.
      </p>
      <Field label="Reason for the constraint" error={problem} submitCount={tries} className="zero-dose-reason"
        description="Written into the methods with the constraint.">
        <Input value={reason} autoComplete="off" onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Button type="submit" disabled={locked}>
        Hold each curve&apos;s {p} at its own zero-dose wells
      </Button>
    </form>
  );
}

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
  const setPerCurve = (z: { param: "Top" | "Bottom"; reason: string } | null) => {
    api.apply((p) => updateResultsOptions(p, sheet.id, (o) => {
      const next = { ...(o as OptionsState) };
      if (z) next.zeroDosePlateau = z;
      else delete next.zeroDosePlateau;
      return next;
    }));
  };
  const several = plan.groups.length > 1 || !!plan.active;
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
      {several ? (
        <PerCurve plan={plan} locked={locked} onSet={setPerCurve} />
      ) : plan.plateau && plan.value !== null ? (
        plan.constrained ? (
          <p className="hint-block">{plan.plateau} is constrained to {plan.value}, the mean of the zero-dose
            wells, so they still set the curve&apos;s {plateauWord(plan.plateau)} plateau.</p>
        ) : (
          <div className="zero-dose-actions">
            <Button disabled={locked} onClick={constrain}>
              Constrain {plan.plateau} to {plan.value}
            </Button>
            <p className="hint-block">
              The zero dose is the response with no drug, the curve&apos;s {plateauWord(plan.plateau)}{" "}
              plateau. Constraining {plan.plateau} to its mean puts those wells to use; the fitted{" "}
              {plan.plateau} otherwise comes from the other doses alone.
            </p>
          </div>
        )
      ) : (
        <p className="hint-block">
          Constrain the plateau the zero-dose wells represent to their mean, or normalise to them.
        </p>
      )}
      <Sources />
    </div>
  );
}
