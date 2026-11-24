// Parameter panel, results sheet and methods text of ordinal
// (proportional-odds) regression (P-88). Model and payload: ./ordinal.ts.
import type { ControlsProps, ResultsProps } from "../types";
import { variableInfo } from "./model";
import { CiField, Field, ModelSpec, Section } from "./controls";
import { CiMethod } from "./glmPanels";
import { Card, Grid, KV, Methods, Problem } from "./results";
import { TOOL, ci, f, fmtP, list, lvl, summaryStars } from "./resultFormat";
import type { OrdinalOptions, OrdinalResult } from "./ordinal";

export function OrdinalControls({ table, options, onChange }: ControlsProps<OrdinalOptions>) {
  const set = (p: Partial<OrdinalOptions>) => onChange({ ...options, ...p });
  const outcome = variableInfo(table).find((v) => v.name === options.outcome);
  return (
    <div className="controls">
      <ModelSpec table={table} options={options} onChange={onChange} outcomeFilter={() => true}
        outcomeHint="Scores on an ordered scale (histology 0 to 4, clinical EAE score, none < mild < severe): one row per animal or sample." />
      {outcome?.kind === "categorical" && (
        <Section title="Order of the outcome levels">
          <Field label="Lowest first" note={`Separate the levels with commas. In the table: ${outcome.levels.join(", ")}.`}>
            <input className="constraint-value mv-name-input" aria-label="Order of the outcome levels, lowest first"
              value={options.outcomeOrder} placeholder={outcome.levels.join(", ")}
              onChange={(e) => set({ outcomeOrder: e.target.value })} />
          </Field>
        </Section>
      )}
      <Section title="Experiment as a block">
        <p className="hint-block">
          Scored over several experiments, litters or batches? Add that column as a categorical predictor: the
          groups are then compared within each experiment.
        </p>
      </Section>
      <Section title="Confidence intervals">
        <CiMethod value={options.ciMethod} onChange={(ciMethod) => set({ ciMethod })} />
        <CiField value={options.ciLevel} onChange={(ciLevel) => set({ ciLevel })} />
      </Section>
    </div>
  );
}

const refText = (r: Record<string, string>) => (Object.keys(r).length
  ? ` Reference levels: ${Object.entries(r).map(([k, v]) => `${k} = ${v}`).join("; ")}.` : "");

export function OrdinalResults({ result }: ResultsProps<OrdinalOptions, OrdinalResult>) {
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  const L = lvl(result.ci_level);
  const lr = result.likelihood_ratio_test;
  const po = result.proportional_odds?.tests ?? [];
  const counts = result.levels.map((l, i) => `${l} (${result.level_counts[i]})`).join(", ");
  return (
    <Card title={`Ordinal regression (proportional odds) of ${result.outcome}`}>
      {result.warnings.map((w) => <p key={w} className="result-note">{w}</p>)}
      <p className="hint-block">
        logit P({result.outcome} ≤ j) = θj − β1·X1 − …, the same β at every cut point j.
        {" "}{result.n_rows_analyzed} rows analyzed, {result.n_rows_skipped} skipped. Rows per score: {counts}.
      </p>
      <h4>Parameter estimates</h4>
      <Grid caption="Parameter estimates"
        head={["Parameter", "Estimate", "SE", `${L} CI`, "|z|", "P value", "", "Odds ratio", `${L} CI of odds ratio`]}
        rows={result.coefficients.map((k, i) => [`β${i + 1}: ${k.name}`, f(k.estimate), f(k.se), ci(k.ci), f(k.z),
          fmtP(k.p), summaryStars(k.p), f(k.odds_ratio), ci(k.odds_ratio_ci)])} />
      <p className="hint-block">
        An odds ratio is the factor by which the odds of a higher {result.outcome} (above any cut point) change
        relative to the reference level of a categorical predictor, or per unit of a continuous one; above 1 means
        higher scores. {result.ci_method === "profile" ? "Profile-likelihood" : "Wald"} confidence intervals;
        P values from Wald z.{refText(result.reference_levels)}
      </p>
      <h4>Cut points (thresholds)</h4>
      <Grid caption="Thresholds"
        head={["Cut point", "Estimate θ", "SE", "z"]}
        rows={result.thresholds.map((t) => [t.name, f(t.estimate), f(t.se), f(t.z)])} />
      <p className="hint-block">
        θj is the log odds of a score at or below the lower level of the cut point at the reference levels (and 0
        for continuous predictors). They are not tested against 0.
      </p>
      <h4>Each term</h4>
      <Grid caption="Tests of each term"
        head={["Term", "df", "Likelihood ratio χ²", "P value", ""]}
        rows={result.term_tests.map((t) => [t.term, String(t.df), f(t.LR), fmtP(t.p), summaryStars(t.p)])} />
      <p className="hint-block">Each term tested as a whole by dropping it from the model: for a block such as the
        experiment, how much the experiments differ.</p>
      {po.length > 0 && <>
        <h4>Proportional-odds check</h4>
        <Grid caption="Proportional-odds check"
          head={["Term", "df", "Likelihood ratio χ²", "P value", ""]}
          rows={po.map((t) => [t.term, String(t.df), t.LR === null ? "n/a" : f(t.LR),
            t.p === null ? "n/a" : fmtP(t.p), t.note ?? summaryStars(t.p)])} />
        <p className="hint-block">
          Each term against a model in which its effect differs at every cut point (partial proportional odds;
          Peterson &amp; Harrell 1990). A small P means the single odds ratio averages effects that differ between
          low and high scores.
        </p>
      </>}
      <div className="stat-cols">
        <KV title="Goodness of fit" rows={[
          ["Log likelihood", f(result.log_likelihood)],
          ["AIC", f(result.aic)],
          ["AICc", f(result.aicc)],
          ["Parameters", String(result.n_parameters)],
          ["Condition number of the Hessian", f(result.condition_number_hessian)],
        ]} />
        <KV title="Likelihood ratio test (vs thresholds only)" rows={[
          ["G (likelihood ratio)", f(lr.G)],
          ["Degrees of freedom", String(lr.df)],
          ["P value", lr.p === null ? "n/a" : `${fmtP(lr.p)} ${summaryStars(lr.p)}`],
        ]} />
      </div>
      <p className="hint-block">
        The model uses the order of the scores but not their spacing: the step from 0 to 1 need not equal the step
        from 3 to 4. A t test or ANOVA on scores assumes equal spacing (McCullagh 1980).
      </p>
    </Card>
  );
}

export function OrdinalMethods({ result }: ResultsProps<OrdinalOptions, OrdinalResult>) {
  if (!result || result.error) return null;
  const L = lvl(result.ci_level);
  const ors = result.coefficients.map((k) =>
    `${k.name}: odds ratio ${f(k.odds_ratio)} (${L} CI ${ci(k.odds_ratio_ci)})`);
  const po = result.proportional_odds?.tests ?? [];
  const poText = po.length ? ` The proportional-odds assumption was checked for each term by a likelihood ratio `
    + `test against a separate effect at every cut point (Peterson & Harrell 1990).` : "";
  return <Methods text={`${result.outcome} (${result.levels.length} ordered levels, ${result.levels[0]} to `
    + `${result.levels[result.levels.length - 1]}) was modeled by ordinal logistic regression (cumulative logit, `
    + `proportional odds; McCullagh 1980) on ${list(result.predictors ?? [])}, fitted by maximum likelihood with `
    + `${result.ci_method === "profile" ? "profile-likelihood" : "Wald"} confidence intervals as in the R package `
    + `ordinal (clm), using ${TOOL} (${result.n_rows_analyzed} rows).${poText} ${ors.join("; ")}.`} />;
}
