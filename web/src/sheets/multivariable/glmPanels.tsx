// Parameter panels, results sheets and methods text of binomial regression
// (positives out of counted) and negative binomial regression (P-86).
// Models and payloads: ./glm.ts.
import type { ControlsProps, ResultsProps } from "../types";
import { variableInfo } from "./model";
import { CiField, Field, ModelSpec, Section } from "./controls";
import { Card, Grid, KV, Methods, Problem } from "./results";
import { TOOL, ci, f, fmtP, list, lvl, summaryStars } from "./resultFormat";
import type { BinomialOptions, BinomialResult, NegBinOptions, NegBinResult } from "./glm";
import { pLabel } from "../../report/pformat";
import type { Coefficient } from "./run";

export function CiMethod({ value, onChange, disabled, note }: {
  value: "profile" | "wald"; onChange: (v: "profile" | "wald") => void; disabled?: boolean; note?: string;
}) {
  return (
    <Field label="Method" note={note}>
      <select aria-label="Confidence interval method" value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value as "profile" | "wald")}>
        <option value="profile">Profile likelihood (asymmetrical)</option>
        <option value="wald">Wald (symmetrical)</option>
      </select>
    </Field>
  );
}

const refText = (r: Record<string, string>) => (Object.keys(r).length
  ? ` Reference levels: ${Object.entries(r).map(([k, v]) => `${k} = ${v}`).join("; ")}.` : "");

function coefRows(cs: Coefficient[], ratio: "odds_ratio" | "rate_ratio", t: boolean) {
  return cs.map((k, i) => [
    i === 0 ? "β0 (Intercept)" : `β${i}: ${k.name}`, f(k.estimate), f(k.se), ci(k.ci), f(t ? k.t : k.z),
    fmtP(k.p), summaryStars(k.p), f(k[ratio]), ci(k[`${ratio}_ci`] ?? null),
  ]);
}

/* ------------------------------------------------------------ binomial */

export function BinomialControls({ table, options, onChange }: ControlsProps<BinomialOptions>) {
  const set = (p: Partial<BinomialOptions>) => onChange({ ...options, ...p });
  const totals = variableInfo(table).filter((v) => v.kind === "continuous" && v.name !== options.outcome);
  return (
    <div className="controls">
      <ModelSpec table={table} options={options} onChange={onChange} exclude={[options.totals]}
        outcomeFilter={(v) => v.kind === "continuous"}
        outcomeHint="The number positive in each row (cells stained, embryos affected, colonies): whole counts, not percentages." />
      <Section title="Out of">
        <Field label="Total counted" note="The number counted in the same row: the positives are out of this.">
          <select aria-label="Totals variable"
            value={totals.some((v) => v.name === options.totals) ? options.totals : ""}
            onChange={(e) => set({ totals: e.target.value,
              predictors: options.predictors.filter((p) => p !== e.target.value) })}>
            <option value="">Choose…</option>
            {totals.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
          </select>
        </Field>
        <p className="hint-block">
          Add the experiment (or day, batch) as a categorical predictor: it then acts as a block, so the
          comparison is made within each experiment.
        </p>
      </Section>
      <Section title="Overdispersion">
        <label className="check-row">
          <input type="checkbox" checked={options.quasi === true}
            onChange={(e) => set({ quasi: e.target.checked })} />
          <span>Quasi-binomial standard errors (multiplied by √φ)</span>
        </label>
        <p className="field-note">For dishes that differ more than counting error allows (dispersion ratio φ
          well above 1): same estimates, wider intervals.</p>
      </Section>
      <Section title="Confidence intervals">
        <CiMethod value={options.ciMethod} onChange={(ciMethod) => set({ ciMethod })} disabled={options.quasi}
          note={options.quasi ? "Quasi-binomial intervals are Wald intervals from t with rows − k df." : undefined} />
        <CiField value={options.ciLevel} onChange={(ciLevel) => set({ ciLevel })} />
      </Section>
    </div>
  );
}

export function BinomialResults({ result }: ResultsProps<BinomialOptions, BinomialResult>) {
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  const quasi = result.family === "quasibinomial";
  const d = result.dispersion;
  const lr = result.likelihood_ratio_test;
  const ft = result.f_test;
  const mc = result.model_comparison;
  const L = lvl(result.ci_level);
  return (
    <Card title={`${quasi ? "Quasi-binomial" : "Binomial"} regression of ${result.outcome} out of ${result.totals}`}>
      {result.warnings.map((w) => <p key={w} className="result-note">{w}</p>)}
      <p className="hint-block">
        logit(P(positive)) = β0 + β1·X1 + … {result.n_rows_analyzed} rows analyzed
        ({f(result.total_positive)} positive of {f(result.total_counted)} counted), {result.n_rows_skipped} skipped.
      </p>
      <h4>Parameter estimates</h4>
      <Grid caption="Parameter estimates"
        head={["Parameter", "Estimate", "SE", `${L} CI`, quasi ? "|t|" : "|z|", "P value", "", "Odds ratio",
          `${L} CI of odds ratio`]}
        rows={coefRows(result.coefficients, "odds_ratio", quasi)} />
      <p className="hint-block">
        An odds ratio is the factor by which the odds of being positive change relative to the reference level
        of a categorical predictor (or per unit of a continuous one).
        {" "}{quasi
          ? `Quasi-binomial: the estimates are the binomial ones and every SE is multiplied by √φ = ${
            f(d.se_factor)}; P values from t and Wald confidence intervals from t, with ${d.df} df (Wedderburn 1974).`
          : `${result.ci_method === "profile" ? "Profile-likelihood" : "Wald"} confidence intervals; P values from Wald z.`}
        {refText(result.reference_levels)}
      </p>
      <h4>Each term</h4>
      <Grid caption="Tests of each term"
        head={quasi ? ["Term", "df", "F", "P value", ""] : ["Term", "df", "Likelihood ratio χ²", "P value", ""]}
        rows={result.term_tests.map((t) => [t.term, quasi ? `${t.df}, ${t.df2}` : String(t.df),
          f(quasi ? t.F : t.deviance_drop), fmtP(t.p), summaryStars(t.p)])} />
      <p className="hint-block">
        Each term tested as a whole by dropping it from the model{quasi ? " (F = drop in deviance / df / φ)" : ""}:
        for a block such as the experiment, how much the experiments differ.
      </p>
      <div className="stat-cols">
        <KV title="Goodness of fit" rows={[
          ["Deviance (G²)", f(result.deviance)],
          ["Degrees of freedom", String(result.deviance_df)],
          ["Dispersion ratio φ (Pearson χ² / df)", f(d.phi)],
          ["Deviance / df", f(d.phi_deviance)],
          ["Log likelihood", f(result.log_likelihood)],
        ]} />
        {quasi && ft ? (
          <KV title="F test (vs intercept only)" rows={[
            ["F", f(ft.F)],
            ["Degrees of freedom", `${ft.df1}, ${ft.df2}`],
            ["P value", ft.p === null ? "n/a" : `${fmtP(ft.p)} ${summaryStars(ft.p)}`],
          ]} />
        ) : (
          <KV title="Likelihood ratio test (vs intercept only)" rows={[
            ["G (likelihood ratio)", f(lr.G)],
            ["Degrees of freedom", String(lr.df)],
            ["P value", lr.p === null ? "n/a" : `${fmtP(lr.p)} ${summaryStars(lr.p)}`],
            ...(mc ? [["AICc, intercept only", f(mc.intercept_only.aicc)] as [string, string],
              ["AICc, this model", f(mc.selected.aicc)] as [string, string]] : []),
          ]} />
        )}
      </div>
      <p className="hint-block">
        φ well above 1 means the rows differ more than counting error allows (overdispersion): the SEs, CIs and
        P values are then too small. Modelling the counts this way, rather than a t test on percentages, keeps
        how many were counted in each row (Warton &amp; Hui 2011).
      </p>
    </Card>
  );
}

export function BinomialMethods({ result }: ResultsProps<BinomialOptions, BinomialResult>) {
  if (!result || result.error) return null;
  const L = lvl(result.ci_level);
  const ors = result.coefficients.slice(1).map((k) =>
    `${k.name}: odds ratio ${f(k.odds_ratio)} (${L} CI ${ci(k.odds_ratio_ci ?? null)})`);
  const quasi = result.family === "quasibinomial";
  const fit = quasi
    ? `by quasi-binomial regression (logit link): binomial maximum-likelihood estimates with every standard `
      + `error multiplied by √φ, where φ = Pearson χ² / df = ${f(result.dispersion.phi)} (Wedderburn 1974), `
      + `P values and Wald confidence intervals from t with ${result.dispersion.df} df`
    : `by binomial regression (logistic GLM, maximum likelihood) with `
      + `${result.ci_method === "profile" ? "profile-likelihood" : "Wald"} confidence intervals`;
  return <Methods text={`The number positive (${result.outcome}) out of the number counted (${result.totals}) `
    + `was modeled ${fit}, on ${list(result.predictors ?? [])}, using ${TOOL} (${result.n_rows_analyzed} rows; `
    + `${f(result.total_positive)} positive of ${f(result.total_counted)}). Dispersion ratio φ = `
    + `${f(result.dispersion.phi)} on ${result.dispersion.df} df. ${ors.join("; ")}.`} />;
}

/* ------------------------------------------------------------ negative binomial */

export function NegBinControls({ table, options, onChange }: ControlsProps<NegBinOptions>) {
  const set = (p: Partial<NegBinOptions>) => onChange({ ...options, ...p });
  const exposures = variableInfo(table).filter((v) => v.kind === "continuous"
    && v.name !== options.outcome && !options.predictors.includes(v.name));
  return (
    <div className="controls">
      <ModelSpec table={table} options={options} onChange={onChange}
        outcomeFilter={(v) => v.kind === "continuous"}
        outcomeHint="Actual counts (0, 1, 2, ...) that vary more than a Poisson distribution allows: colonies, cells per field, events per animal." />
      <Section title="Exposure (optional)">
        <Field label="Counted over"
          note="Counts gathered over different times, areas or volumes: the model is then for the count per unit, and the rate ratios compare rates.">
          <select aria-label="Exposure variable"
            value={exposures.some((v) => v.name === options.exposure) ? options.exposure : ""}
            onChange={(e) => set({ exposure: e.target.value })}>
            <option value="">None (equal exposure)</option>
            {exposures.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
          </select>
        </Field>
      </Section>
      <Section title="Confidence intervals">
        <CiMethod value={options.ciMethod} onChange={(ciMethod) => set({ ciMethod })} />
        <CiField value={options.ciLevel} onChange={(ciLevel) => set({ ciLevel })} />
      </Section>
    </div>
  );
}

export function NegBinResults({ result }: ResultsProps<NegBinOptions, NegBinResult>) {
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  const L = lvl(result.ci_level);
  const lr = result.likelihood_ratio_test;
  const vp = result.vs_poisson;
  const unit = result.exposure ? ` per unit of ${result.exposure}` : "";
  return (
    <Card title={`Negative binomial regression of ${result.outcome}`}>
      {result.warnings.map((w) => <p key={w} className="result-note">{w}</p>)}
      <p className="hint-block">
        log(mean count{result.exposure ? ` / ${result.exposure}` : ""}) = β0 + β1·X1 + …, variance = mean +
        mean² / θ. {result.n_rows_analyzed} rows analyzed ({f(result.total_count)} counts in all),
        {" "}{result.n_rows_skipped} skipped.
        {result.exposure && ` ${result.exposure} enters as an offset (its log, coefficient fixed at 1).`}
      </p>
      <h4>Parameter estimates</h4>
      <Grid caption="Parameter estimates"
        head={["Parameter", "Estimate", "SE", `${L} CI`, "|z|", "P value", "", "Rate ratio", `${L} CI of rate ratio`]}
        rows={coefRows(result.coefficients, "rate_ratio", false)} />
      <p className="hint-block">
        A rate ratio is the factor by which the mean count{unit} changes per unit of a continuous predictor, or
        relative to the reference level of a categorical one.
        {" "}{result.ci_method === "profile" ? "Profile-likelihood" : "Wald"} confidence intervals with θ held at
        its estimate; P values from Wald z.{refText(result.reference_levels)}
      </p>
      <div className="stat-cols">
        <KV title="Dispersion" rows={[
          ["θ (shape)", f(result.theta)],
          ["α = 1 / θ", f(result.alpha)],
          ["Pearson χ² / df", f(result.dispersion.phi)],
          ["Log likelihood", f(result.log_likelihood)],
          ["AICc", f(result.aicc)],
        ]} />
        <KV title="Likelihood ratio test (vs intercept only)" rows={[
          ["G (likelihood ratio)", f(lr.G)],
          ["Degrees of freedom", String(lr.df)],
          ["P value", lr.p === null ? "n/a" : `${fmtP(lr.p)} ${summaryStars(lr.p)}`],
        ]} />
        <KV title="Negative binomial vs Poisson" rows={[
          ["Likelihood ratio", f(vp.LR)],
          ["P value", fmtP(vp.p)],
        ]} />
      </div>
      <p className="hint-block">
        θ small means strong overdispersion; as θ grows the model becomes Poisson regression. The test against
        Poisson halves the χ² (1 df) P value because θ = ∞ lies on the boundary (Venables &amp; Ripley 2002).
      </p>
    </Card>
  );
}

export function NegBinMethods({ result }: ResultsProps<NegBinOptions, NegBinResult>) {
  if (!result || result.error) return null;
  const L = lvl(result.ci_level);
  const rrs = result.coefficients.slice(1).map((k) =>
    `${k.name}: rate ratio ${f(k.rate_ratio)} (${L} CI ${ci(k.rate_ratio_ci ?? null)})`);
  return <Methods text={`${result.outcome} (counts) was modeled by negative binomial regression with a log link `
    + `(maximum likelihood, θ estimated as in MASS::glm.nb; Venables & Ripley 2002) on `
    + `${list(result.predictors ?? [])}${result.exposure ? `, with log(${result.exposure}) as an offset` : ""}, with `
    + `${result.ci_method === "profile" ? "profile-likelihood" : "Wald"} confidence intervals, using ${TOOL} `
    + `(${result.n_rows_analyzed} rows). θ = ${f(result.theta)}; likelihood ratio test against Poisson regression: `
    + `${f(result.vs_poisson.LR)}, ${pLabel(result.vs_poisson.p)}. ${rrs.join("; ")}.`} />;
}
