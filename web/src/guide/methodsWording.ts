// Why the test was chosen, in the words a methods paragraph uses (P-32).
// Help me choose (and Plan an experiment) explain their pick to the user
// in the second person ("unless you know the SDs are equal"); the reason
// saved with the results sheet (ResultsSheet.chosen) lands in a methods
// paragraph for a paper, so it is saved in the third person instead,
// one wording per chooser outcome. Projects saved before this change hold
// the on-screen wording: legacyMethodsReason maps each of those to the
// wording below when the project is read (guide/choice.ts parseChosen).
// Methods wording is scientific output (ruling 10): e2e-check pins it.
// Pure; unit-tested in __tests__/methodsWording.test.ts.

export interface MethodsParams {
  /** One group: the theoretical value ("0", "1", "100"). */
  hv?: string;
  /** Nested designs: "technical replicates" or "cells". */
  unit?: string;
  /** Dose-response: the agonist model (else the inhibitor model). */
  agonist?: boolean;
}

const nestedWhy = (unit = "technical replicates") => `${unit === "cells" ? "several cells"
  : "technical replicates"} were measured within each biological unit (animal, culture or `
  + "experiment)";

/** The methods wording of each chooser outcome, by rule id
 *  (Recommendation.rule). */
export const METHODS: Record<string, (p?: MethodsParams) => string> = {
  three_way: () => "Three-way ANOVA was chosen because the design has three factors; it tests "
    + "each factor, each two-way interaction and the three-way interaction.",
  nested_two_way: (p) => "A nested two-way ANOVA (a mixed model with the biological unit as a "
    + `random intercept) was chosen because ${nestedWhy(p?.unit)} and the design has two factors; `
    + "both factors and their interaction were tested against the variation between units "
    + "(Aarts et al. 2014).",
  two_way_rm: () => "Two-way repeated-measures ANOVA was chosen because the design has two "
    + "factors and the same subjects were measured repeatedly; it separates the variation "
    + "between subjects from the effects.",
  two_way_mixed: () => "A two-way repeated-measures analysis fitted as a mixed-effects model was "
    + "chosen because the design has two factors, the same subjects were measured repeatedly and "
    + "some values were missing; the mixed model keeps the subjects with a missing value.",
  two_way_art: () => "A nonparametric two-way ANOVA by the aligned rank transform (Wobbrock et al. "
    + "2011) was chosen because the design has two grouping factors with independent values that "
    + "were not considered Gaussian; contrasts used the ART-C procedure (Elkin et al. 2021).",
  two_way: () => "Two-way ANOVA was chosen because the design has two grouping factors with "
    + "independent values; it tests each factor and their interaction (whether the effect of "
    + "one factor depends on the level of the other).",
  one_sample_log: (p) => `A one-sample t test on the logarithms (ratio t test against ${p?.hv ?? "1"}) `
    + "was chosen because the values are ratios to a control (fold change or % of control), "
    + "which are bounded by zero and usually skewed; it tests whether the geometric mean ratio "
    + `differs from ${p?.hv ?? "1"}.`,
  wilcoxon_signed_rank: (p) => "The Wilcoxon signed-rank test was chosen because the values "
    + `were judged not to be Gaussian; it compares the median with ${p?.hv ?? "0"} using the `
    + "ranks of the differences.",
  one_sample_t: (p) => "The one-sample t test was chosen because one group was compared with a "
    + `theoretical value (${p?.hv ?? "0"}); it tests whether the mean differs from that value.`,
  nested_t: (p) => "A nested t test (a mixed model with the biological unit as a random effect) "
    + `was chosen because ${nestedWhy(p?.unit)}; the variation between units was used as the `
    + "error, so n is the number of units, not of measurements.",
  nested_anova: (p) => "A nested one-way ANOVA (a mixed model with the biological unit as a "
    + `random effect) was chosen because ${nestedWhy(p?.unit)}; the variation between units was `
    + "used as the error, so n is the number of units, not of measurements.",
  paired_normalised: () => "A one-sample t test on the logarithms of the treated/control ratios "
    + "(ratio t test against 1) was chosen because each treated value had been divided by its "
    + "own control, which leaves the control column at 1 (or 100) with no variability.",
  ratio_paired_t: () => "The ratio paired t test was chosen because the treatment was expected "
    + "to change values by a consistent factor rather than by a consistent amount; it analyses "
    + "log(treated/control) and reports the geometric mean ratio with its confidence interval.",
  wilcoxon_pairs: () => "The Wilcoxon matched-pairs signed-rank test was chosen because the "
    + "measurements were paired and their differences were judged not to be Gaussian; it "
    + "compares the median of the paired differences with zero by ranks.",
  paired_t: () => "The paired t test was chosen because the measurements came in pairs "
    + "(before and after, left and right, or the same experiment); analysing the difference "
    + "within each pair removes the variation between pairs.",
  unpaired_normalised: () => "A one-sample t test on the logarithms of the treated values "
    + "(ratio t test against 1) was chosen because the control group had been set to 1 (or 100) "
    + "and has no variability left, so an unpaired t test against it would not be valid.",
  mann_whitney: () => "The Mann-Whitney test was chosen because the values of the two "
    + "independent groups were judged not to be Gaussian; it compares the distributions by "
    + "ranks.",
  unpaired_t: () => "The unpaired t test with a pooled SD was chosen because the two groups were "
    + "independent, roughly Gaussian and known from the design or earlier data to have equal "
    + "SDs; it has slightly more power than Welch's t test when that holds.",
  welch_t: () => "Welch's t test was chosen for the two independent groups because it does not "
    + "assume equal SDs and loses little power when they are equal.",
  friedman: () => "The Friedman test was chosen because the same subjects (or matched sets) were "
    + "measured under every condition and the values were judged not to be Gaussian; it ranks "
    + "the values within each subject.",
  rm_one_way: () => "Repeated-measures one-way ANOVA was chosen because the same subjects (or "
    + "matched sets) were measured under every condition; it removes the variation between "
    + "subjects from the comparison.",
  multi_normalised: () => "One-sample t tests on the logarithms (ratio t test against 1), one per "
    + "treated group with Šídák's correction for the number of groups, were chosen because every "
    + "value had been divided by the control, which leaves the control column with no "
    + "variability.",
  kruskal_wallis: () => "The Kruskal-Wallis test, followed by Dunn's multiple comparisons, was "
    + "chosen because the values of the three or more independent groups were judged not to be "
    + "Gaussian; it compares the groups by ranks.",
  welch_anova: () => "Welch's one-way ANOVA was chosen because the SDs of the three or more "
    + "independent groups were expected to differ; neither it nor the comparisons that follow "
    + "it assume equal SDs.",
  one_way_anova: () => "Ordinary one-way ANOVA was chosen because there were three or more "
    + "independent groups with roughly Gaussian values; the multiple comparisons that follow it "
    + "adjust the P values for the number of comparisons.",
  proportion_per_unit: () => "The proportion was computed for each biological replicate and "
    + "those values compared, because the counts came from several animals, cultures or "
    + "experiments; a test on the pooled counts would treat every event as independent.",
  ancova: () => "Analysis of covariance (ANCOVA) was chosen because each subject was measured before "
    + "treatment and after it in two or more groups; the follow-up was compared between groups with the "
    + "baseline as a covariate (Vickers & Altman 2001).",
  binomial_glm: () => "Binomial regression (a logistic GLM) of the number positive out of the number "
    + "counted in each dish was chosen because the counts came from several dishes or animals per group; "
    + "the experiment entered as a block and overdispersion was checked (Warton & Hui 2011).",
  binomial: () => "The exact binomial test was chosen because one group with two outcomes was "
    + "compared with an expected proportion.",
  chisq_gof: () => "The chi-square goodness-of-fit test was chosen because counts in three or "
    + "more categories were compared with expected proportions.",
  mcnemar: () => "McNemar's test was chosen because each subject was classified twice (or the "
    + "subjects were matched pairs); it uses only the discordant pairs.",
  cmh: () => "The Cochran-Mantel-Haenszel test was chosen because the same 2×2 comparison was "
    + "made in several strata; it combines the strata without pooling the counts.",
  fisher: () => "Fisher's exact test was chosen for the 2×2 table of two independent groups and "
    + "two outcomes because it computes the P value exactly and stays valid with small counts.",
  chisq_trend: () => "The chi-square test for trend was chosen because the groups have a natural "
    + "order and two outcomes; it tests whether the proportion rises or falls with that order.",
  chisq: () => "The chi-square test was chosen because the table of independent counts is larger "
    + "than 2×2; it tests whether the distribution of outcomes differs between groups.",
  km: () => "The Kaplan-Meier method was chosen because one group was followed over time with "
    + "censoring; it estimates the survival curve and the median survival with its confidence "
    + "interval.",
  logrank: () => "The log-rank (Mantel-Cox) test was chosen because the data are times to an "
    + "event with censoring; it compares the whole survival curves and is most powerful when "
    + "the hazard ratio is constant over time.",
  standard_curve: () => "A sigmoidal four-parameter logistic (4PL) standard curve was chosen; "
    + "it was fitted to the standards and the unknowns were read off it.",
  compare_logic50_experiments: () => "Each experiment's curve was fitted on its own and the "
    + "LogIC50 values compared between conditions, matched by experiment, because the "
    + "experiments are the replicates; logarithms were used because IC50 values are lognormal.",
  compare_curves_global: () => "The curves were fitted together with the parameter of interest "
    + "(usually LogIC50) shared between data sets, to test whether they differ in that "
    + "parameter.",
  nonlin_other: () => "Nonlinear regression was chosen to fit a model of the mechanism (binding, "
    + "enzyme kinetics, exponential decay or growth).",
  ic50: (p) => `A variable-slope four-parameter logistic model (log(${p?.agonist ? "agonist"
    : "inhibitor"}) vs. response) was chosen for the dose-response experiment, fitted against `
    + "log concentration.",
  two_way_interaction: () => "Two-way ANOVA with the interaction first was chosen because the "
    + "question was whether the treatment effect differs between groups, which is the "
    + "interaction of the two factors (a difference of differences); the treatment effect "
    + "within each group was reported after it as simple effects.",
  two_way_interaction_rm: () => "Two-way repeated-measures ANOVA with the interaction first was "
    + "chosen because the question was whether the treatment effect differs between groups, "
    + "which is the interaction of the two factors (a difference of differences); the "
    + "treatment effect within each group was reported after it as simple effects.",
};
// rules that share a wording
METHODS.rm_one_way_missing = METHODS.rm_one_way;
METHODS.logrank_multi = METHODS.logrank;
METHODS.ec50 = (p) => METHODS.ic50({ ...p, agonist: true });

/** Each condition run once per experiment on different days
 *  (guide/blocking.ts): said before the matched test's wording. */
export const BLOCK_METHODS = "Each experiment (day) was treated as a block, and the conditions "
  + "were matched by experiment, because each condition was run once in every experiment on "
  + "different days.";

/** Alternatives Help me choose can open, by their test name. */
export const ALTERNATIVE_METHODS: Record<string, string> = {
  "Two-way ANOVA on the unit means": "Two-way ANOVA on the mean of each biological unit was "
    + "chosen; with the same number of values in every unit it is equivalent to the nested "
    + "mixed model.",
  "Time course: mixed model with a covariance choice, AUC per subject": "A time-course mixed "
    + "model was chosen because the repeated factor was time; the analysis compares covariance "
    + "structures by AIC and each subject's area under the curve between groups.",
  "Two-way repeated-measures ANOVA (group × time)": "Two-way repeated-measures ANOVA with group and "
    + "time as factors was chosen to analyse the measurements before and after treatment.",
  "Proportion per biological replicate, then a t test or ANOVA": "The proportion was computed for "
    + "each biological replicate and those values compared.",
  "Negative binomial regression": "Negative binomial regression was chosen for counts that vary more "
    + "than a Poisson distribution allows.",
  "Cox regression": "Cox regression was chosen for hazard ratios with confidence intervals "
    + "adjusted for covariates, or for a continuous predictor instead of groups.",
  "Two-way ANOVA": "Ordinary two-way ANOVA was chosen; the values were taken to be roughly "
    + "Gaussian (or Gaussian after a log transform).",
};

/** The methods wording of an alternative the chooser opens. */
export const alternativeMethods = (test: string): string =>
  ALTERNATIVE_METHODS[test] ?? `${test} was chosen.`;

// ------------------------------------------------------------ saved before

/* The on-screen wording saved by Help me choose from 2026-11-23 (P-32)
 * until the methods wording above, frozen here: what older files hold.
 * Each entry is the opening of one outcome's reason (unique among them)
 * and how to rebuild its methods wording; the dynamic parts (the
 * theoretical value, the unit) are read back from the old text. */
type Legacy = [RegExp, (m: RegExpMatchArray, test: string) => string];

const LEGACY_BLOCK = "Each condition was run once in every experiment, on different days, so the "
  + "experiment is a block: values from the same day share that day's cells, reagents and "
  + "instrument settings. Matching by experiment removes the day-to-day differences from the "
  + "comparison, which an ordinary (unmatched) test would leave in the error and lose power to. ";

const m0 = (rule: string): Legacy[1] => () => METHODS[rule]();
const LEGACY: Legacy[] = [
  [/^Three factors at once /, m0("three_way")],
  [/^You have (cells|technical replicates) within each animal, culture or experiment, and two factors\. /,
    (m) => METHODS.nested_two_way({ unit: m[1] })],
  [/^Two factors with the same subjects measured repeatedly: /,
    (_m, test) => METHODS[/mixed-effects/.test(test) ? "two_way_mixed" : "two_way_rm"]()],
  [/^Two grouping factors \(for example genotype and treatment\) with independent values: /, m0("two_way")],
  [/^Two grouping factors with independent values that are not Gaussian: the aligned /, m0("two_way_art")],
  [/^Values expressed relative to a control \(fold change, % of control\) are ratios: .* differs from (.+?), and the logs /,
    (m) => METHODS.one_sample_log({ hv: m[1] })],
  [/^The values do not look Gaussian, so the median is compared with (.+?) using ranks /,
    (m) => METHODS.wilcoxon_signed_rank({ hv: m[1] })],
  [/^One group compared with a theoretical value \((.+?)\): the one-sample t test /,
    (m) => METHODS.one_sample_t({ hv: m[1] })],
  [/^You have (cells|technical replicates) within each biological unit\. /,
    (m, test) => METHODS[/ANOVA/.test(test) ? "nested_anova" : "nested_t"]({ unit: m[1] })],
  [/^Each treated value was divided by its own control, so the control column /, m0("paired_normalised")],
  [/^The treatment changes values by a consistent factor /, m0("ratio_paired_t")],
  [/^Paired measurements whose differences are not Gaussian: /, m0("wilcoxon_pairs")],
  [/^The two measurements come in pairs /, m0("paired_t")],
  [/^The control group was set to 1 \(or 100\) so it has no variability left; /, m0("unpaired_normalised")],
  [/^Two independent groups whose values are not Gaussian /, m0("mann_whitney")],
  [/^Two independent groups, Gaussian enough, and you know /, m0("unpaired_t")],
  [/^Two independent groups\. Welch's t test does not assume /, m0("welch_t")],
  [/^The same subjects \(or matched sets\) were measured under every condition and the values are not Gaussian: /,
    m0("friedman")],
  [/^The same subjects \(or matched sets, such as one experiment run on every condition\) were measured /,
    m0("rm_one_way")],
  [/^Every value was divided by the control, so the control column carries no variability\. /,
    m0("multi_normalised")],
  [/^Three or more independent groups whose values are not Gaussian: /, m0("kruskal_wallis")],
  [/^Three or more independent groups whose SDs you expect to differ: /, m0("welch_anova")],
  [/^Three or more independent groups with roughly Gaussian values: /, m0("one_way_anova")],
  [/^The counts were pooled from several animals, cultures or experiments\. /, m0("proportion_per_unit")],
  [/^The counts come from several dishes, wells or animals per group /, m0("binomial_glm")],
  [/^One group with two outcomes compared with an expected proportion: /, m0("binomial")],
  [/^Counts in three or more categories compared with expected proportions /, m0("chisq_gof")],
  [/^Each subject was classified twice /, m0("mcnemar")],
  [/^The same 2×2 comparison was made in several strata /, m0("cmh")],
  [/^Two independent groups and two outcomes \(a 2×2 table\): /, m0("fisher")],
  [/^Three or more ordered groups \(doses, age bands\) with two outcomes: /, m0("chisq_trend")],
  [/^A table larger than 2×2 of independent counts: /, m0("chisq")],
  [/^One group followed over time with censoring: /, m0("km")],
  [/^Time-to-event data with censoring: the log-rank test /, m0("logrank")],
  [/^A standard curve: fit a sigmoidal 4PL /, m0("standard_curve")],
  [/^When each experiment produced its own curve, /, m0("compare_logic50_experiments")],
  [/^To ask whether two curves differ in one parameter /, m0("compare_curves_global")],
  [/^Pick the model from the mechanism /, m0("nonlin_other")],
  [/^A dose-response experiment: fit the (agonist|inhibitor) model /,
    (m) => METHODS.ic50({ agonist: m[1] === "agonist" })],
  [/^Each subject was measured before treatment \(the baseline\) and after it /, m0("ancova")],
  [/^You are asking whether the treatment effect is different in one group than in another /,
    (_m, test) => METHODS[/repeated-measures/.test(test) ? "two_way_interaction_rm" : "two_way_interaction"]()],
];

/** The methods wording of a reason saved in the chooser's on-screen
 *  words (projects saved before the methods wording), or null when the
 *  reason is not one of those (already in the methods wording). `test`
 *  is the saved test name (ChosenTest.test). */
export function legacyMethodsReason(reason: string, test: string): string | null {
  const r = reason.trim();
  if (r.startsWith(LEGACY_BLOCK)) {
    const matched = legacyMethodsReason(r.slice(LEGACY_BLOCK.length), test);
    return matched ? `${BLOCK_METHODS} ${matched}` : null;
  }
  // an alternative opened from the chooser: "<test>: <when>."
  for (const [name, text] of Object.entries(ALTERNATIVE_METHODS)) {
    if (test === name && r.startsWith(`${name}: `)) return text;
  }
  for (const [re, make] of LEGACY) {
    const m = r.match(re);
    if (m) return make(m, test);
  }
  return null;
}
