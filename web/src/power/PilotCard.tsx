// "Plan next experiment" (from a t test or one-way ANOVA results sheet):
// the pilot's SD, filled into the calculation, and the choice of the
// effect to detect: a difference that matters, or the pilot difference,
// offered as such. Never power for the effect observed (./pilot.ts).
import { useId, useState } from "react";
import { formatSig } from "../types";
import type { PowerForm } from "./power";
import { POST_HOC_SOURCES, sig4, withEffect, type PilotData } from "./pilot";

export default function PilotCard({ pilot, form, setForm }: {
  pilot: PilotData;
  form: PowerForm;
  setForm: (f: PowerForm) => void;
}) {
  const name = useId();
  const [mode, setMode] = useState<"relevant" | "pilot" | null>(null);
  const [diff, setDiff] = useState("");
  const anova = pilot.kind === "anova_oneway";
  const observed = Math.abs(pilot.observed);
  const choose = (m: "relevant" | "pilot", text = diff) => {
    setMode(m);
    const v = Number(text.trim().replace(",", "."));
    const next = m === "pilot" ? withEffect(form, pilot, { kind: "pilot" })
      : text.trim() !== "" && Number.isFinite(v) ? withEffect(form, pilot, { kind: "relevant", difference: v })
        : null;
    if (next) setForm(next);
  };
  const ns = pilot.groups.map((g) => g.n);
  return (
    <section className="result-card power-pilot" aria-labelledby={`${name}-h`}>
      <h3 id={`${name}-h`}>Sample size for the next experiment, from “{pilot.table}”</h3>
      <p className="power-pilot-sd">
        Pilot SD: <strong data-pilot-sd>{formatSig(pilot.sd, 4)}</strong>{" "}
        ({pilot.sdLabel}; {pilot.test},{" "}
        {pilot.kind === "t_paired" ? `${ns[0]} pairs`
          : new Set(ns).size === 1 ? `n = ${ns[0]} per group` : `n = ${ns.join(", ")}`}).
        It is filled in below; the calculation solves for n per group at 80% power,
        {anova ? " α = 0.05" : " two-sided, α = 0.05"}.
      </p>
      <fieldset className="power-pilot-choice">
        <legend>Difference to detect in the next experiment</legend>
        <label>
          <input type="radio" name={name} checked={mode === "relevant"}
            onChange={() => choose("relevant")} />
          <span>{anova ? "The smallest difference between two group means that matters"
            : "The smallest difference that matters biologically"}</span>
        </label>
        <input className="constraint-value" inputMode="decimal"
          aria-label="Difference to detect" value={diff}
          placeholder={`e.g. ${sig4(observed || pilot.sd)}`}
          onFocus={() => { if (mode !== "relevant") setMode("relevant"); }}
          onChange={(e) => { setDiff(e.target.value); choose("relevant", e.target.value); }} />
        <label>
          <input type="radio" name={name} checked={mode === "pilot"}
            onChange={() => choose("pilot")} />
          <span>{anova ? `The group means seen in the pilot (largest − smallest = ${formatSig(observed, 4)})`
            : `The difference seen in the pilot: ${formatSig(observed, 4)}`}{" "}
            <span className="field-note">(observed here; a pilot estimate is imprecise, and
              planning from it tends to give too few subjects)</span></span>
        </label>
      </fieldset>
      {mode === null && (
        <p className="hint-block">Choose the difference to detect to get n per group and the
          justification sentence.</p>
      )}
      <p className="field-note">
        This plans a new experiment for an effect you choose. It does not compute power for
        the difference observed here (&ldquo;post hoc&rdquo; power), which only restates the
        P value. Sources:{" "}
        {POST_HOC_SOURCES.map((s, i) => (
          <span key={s.url}>{i > 0 && "; "}
            <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
        ))}.
      </p>
    </section>
  );
}
