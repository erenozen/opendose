// Power tool: the inputs and the extra result rows of the designs added
// by FEATURE-PLAN P-95 (engine/opendose/power_designs.py): repeated
// measures ANOVA, ANCOVA, equivalence (TOST), rank tests by the A.R.E.
// method, multiple regression and logistic regression. Every method line
// names its published source; every input is an assumption about the
// planned experiment, never a value observed in finished data.
import type { ReactNode } from "react";
import { Select, TextNum } from "./fields";
import type { PowerForm } from "./power";

function Method({ children }: { children: ReactNode }) {
  return <p className="hint-block power-method">{children}</p>;
}

export function MoreDesignInputs({ form, set, solvingEffect }: {
  form: PowerForm; set: (p: Partial<PowerForm>) => void; solvingEffect: boolean;
}) {
  const k = form.kind;
  const effectField = (label: string, key: keyof PowerForm, note?: ReactNode) => (solvingEffect
    ? <p className="hint-block">{label}: solved for.</p>
    : <TextNum label={label} value={form[key] as string} note={note}
      onChange={(v) => set({ [key]: v } as Partial<PowerForm>)} />);
  if (k === "anova_rm") {
    return (
      <>
        <Select label="Effect tested" value={form.rmEffect}
          options={[["within", "Within subjects (time)"], ["between", "Between groups"],
            ["interaction", "Group × time interaction"]]}
          onChange={(rmEffect) => set({ rmEffect })} />
        <TextNum label="Groups" value={form.rmGroups} onChange={(rmGroups) => set({ rmGroups })} />
        <TextNum label="Measurements per subject" value={form.m} onChange={(m) => set({ m })} />
        <TextNum label="Correlation among measurements (ρ)" value={form.rmRho}
          onChange={(rmRho) => set({ rmRho })} />
        {form.rmEffect !== "between" && (
          <TextNum label="Nonsphericity correction ε" value={form.eps} onChange={(eps) => set({ eps })}
            note="1 when sphericity holds; as low as 1/(m − 1) when it is badly violated." />
        )}
        {effectField("Cohen's f", "f")}
        <p className="hint-block">Conventions: 0.1 small, 0.25 medium, 0.4 large.</p>
        <Method>Univariate approach: λ = f² u N ε, u = m/(1 − ρ) for within and interaction
          effects, u = m/(1 + (m − 1)ρ) between groups (Faul et al. 2007, Behav Res Methods
          39:175, Table 3).</Method>
      </>
    );
  }
  if (k === "ancova") {
    return (
      <>
        {effectField("Cohen's d (difference ÷ SD of the outcome)", "d")}
        <TextNum label="Correlation of baseline and outcome (ρ)" value={form.ancovaRho}
          onChange={(ancovaRho) => set({ ancovaRho })} />
        <Method>Adjusting for the baseline shrinks the error variance by 1 − ρ² (Borm et al.
          2007, J Clin Epidemiol 60:1234). Power is exact for a normal baseline covariate (Shieh
          2020, Psychometrika 85:101).</Method>
      </>
    );
  }
  if (k === "tost") {
    return (
      <>
        <Select label="Design" value={form.tostDesign}
          options={[["two_sample", "Two independent groups"], ["paired", "Paired (or one group vs a value)"]]}
          onChange={(tostDesign) => set({ tostDesign })} />
        {effectField("Equivalence margin (±)", "margin")}
        <TextNum label="Expected true difference" value={form.theta} onChange={(theta) => set({ theta })}
          note="0 if the two are expected to be the same." />
        <TextNum label={form.tostDesign === "paired" ? "SD of the differences" : "SD within groups"}
          value={form.tostSd} onChange={(tostSd) => set({ tostSd })} />
        <Method>Two one-sided t tests, each at α (Schuirmann 1987, J Pharmacokinet Biopharm
          15:657); exact power by integration over the SD (Phillips 1990, J Pharmacokinet
          Biopharm 18:137). Set the margin before the data, from what difference does not
          matter.</Method>
      </>
    );
  }
  if (k === "mann_whitney" || k === "wilcoxon_signed_rank") {
    return (
      <>
        {effectField(k === "wilcoxon_signed_rank" ? "Cohen's d (d_z for pairs)" : "Cohen's d", "d")}
        <Select label="Shape of the data" value={form.parent}
          options={[["normal", "Normal (A.R.E. 0.955)"], ["logistic", "Logistic (A.R.E. 1.097)"],
            ["laplace", "Laplace, heavy tails (A.R.E. 1.5)"], ["min_are", "Worst case (A.R.E. 0.864)"]]}
          onChange={(parent) => set({ parent })} />
        <Method>A.R.E. method: the t test’s power with n scaled by the rank test’s asymptotic
          relative efficiency (G*Power 3.1 manual, chs. 22–24; Lehmann 1975). It is a
          large-sample approximation: with heavy tails and small groups it overstates the power
          (0.80 against 0.75 simulated for d = 0.6, 30 per group, Laplace data).</Method>
      </>
    );
  }
  if (k === "regression_r2") {
    const all = form.tested.trim() === form.predictors.trim();
    return (
      <>
        <TextNum label="Predictors in the model" value={form.predictors}
          onChange={(predictors) => set({ predictors })} />
        <TextNum label="Predictors tested" value={form.tested} onChange={(tested) => set({ tested })}
          note="All of them for the model as a whole; fewer to test what they add to the rest." />
        {solvingEffect ? <p className="hint-block">f²: solved for.</p> : (
          <>
            <TextNum label={all ? "R² of the model" : "R² added by the tested predictors"} value={form.r2}
              onChange={(r2) => set({ r2 })} />
            {!all && (
              <TextNum label="R² of the full model" value={form.r2Full} onChange={(r2Full) => set({ r2Full })} />
            )}
          </>
        )}
        <p className="hint-block">Conventions for f² = R²/(1 − R²): 0.02 small, 0.15 medium, 0.35 large.</p>
        <Method>F test with fixed predictors, λ = f² N (G*Power 3.1 manual, chs. 13–14; Cohen
          1988, ch. 9).</Method>
      </>
    );
  }
  return (
    <>
      <Select label="Covariate" value={form.covariate}
        options={[["normal", "Continuous (normal)"], ["binary", "Binary (yes / no)"]]}
        onChange={(covariate) => set({ covariate })} />
      {effectField(form.covariate === "binary" ? "Odds ratio (X = 1 vs X = 0)" : "Odds ratio per SD of the covariate",
        "lgOr")}
      <TextNum label={form.covariate === "binary" ? "Event rate when X = 0" : "Event rate at the covariate’s mean"}
        value={form.lgP0} onChange={(lgP0) => set({ lgP0 })} />
      {form.covariate === "binary" && (
        <TextNum label="Share with X = 1" value={form.xProp} onChange={(xProp) => set({ xProp })} />
      )}
      <TextNum label="R² with the other covariates" value={form.r2Other} onChange={(r2Other) => set({ r2Other })}
        note="0 when this is the only covariate; other covariates inflate n by 1/(1 − R²)." />
      <Method>Wald test, normal approximation of Hsieh, Bloch and Larsen (1998, Stat Med
        17:1623). At N = 317 a simulation gave 0.940 where the formula says 0.950 (G*Power 3.1
        manual, 29.3).</Method>
    </>
  );
}
