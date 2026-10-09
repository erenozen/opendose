// Explainers library: short, sourced answers to the questions users ask
// most (docs/research/forums-qa-graphpad-faq.md items 1-8). Surfaced as
// "Learn more" links from controls, results, chips and banners, and in the
// searchable Help panel (Ctrl/Cmd+/). Pure data.
import { SRC, type Source } from "./sources.ts";

export interface Explainer {
  id: string;
  title: string;
  /** One-line summary shown in lists and tooltips. */
  summary: string;
  /** Paragraphs (~150 words in all). */
  body: string[];
  sources: Source[];
  /** Extra words the Help search matches. */
  keywords: string;
}

export const EXPLAINERS: Explainer[] = [
  {
    id: "sd-sem-ci",
    title: "SD, SEM or 95% CI?",
    summary: "SD shows the scatter of the data, a 95% CI how precisely the mean is known; SEM bars are harder to read than either.",
    body: [
      "The standard deviation (SD) describes how much the individual values vary. It does "
        + "not shrink as you collect more data. Use it, or better the points themselves, to "
        + "show variability.",
      "The standard error of the mean (SEM) is SD/√n: it describes how precisely the mean is "
        + "known, and shrinks as n grows. An SEM bar is between about half (large n) and a "
        + "quarter (n = 3) of the 95% CI's half-width, so it looks more convincing than the "
        + "data justify, and it is harder to interpret than a CI.",
      "The 95% CI of the mean is the range that, in 95% of experiments, contains the true "
        + "mean. To show precision, plot the CI. With small samples, plot every point. "
        + "Whatever you choose, say in the legend which error bar it is and what n is.",
    ],
    sources: [SRC.gpSdSem, SRC.weissgerber2015, SRC.sampl],
    keywords: "error bar standard deviation standard error confidence interval legend",
  },
  {
    id: "relative-absolute-ic50",
    title: "Relative vs absolute IC50; normalise or constrain?",
    summary: "The usual IC50 is halfway between the fitted plateaus, not the concentration giving 50% of control.",
    body: [
      "The relative IC50 (the one dose-response fits report) is the concentration that gives "
        + "a response halfway between the fitted Top and Bottom plateaus. It is by far the "
        + "most common definition. The absolute IC50 is the concentration that gives 50% of "
        + "the control response; it is undefined when the curve never crosses 50%.",
      "Normalising to 0% and 100% is optional: it is not necessary to normalise before "
        + "fitting, and showing the actual data is often better. Constrain Bottom to 0 and "
        + "Top to 100 (or to the control means) only when the controls define those "
        + "plateaus well and the curve itself does not reach them; constraining a plateau "
        + "the data clearly contradict moves the IC50.",
      "Fit against log concentration: the EC50's uncertainty is symmetric on the log scale, "
        + "so its CI is asymmetric in concentration units.",
    ],
    sources: [SRC.gpRelAbsIc50, SRC.gpNormalizing, SRC.gpLogEc50Ci],
    keywords: "ec50 gi50 dose response normalize normalise constrain top bottom plateau",
  },
  {
    id: "posthoc",
    title: "Which multiple comparisons test?",
    summary: "Choose by question: Tukey for all pairs, Dunnett vs a control, Šídák for planned pairs.",
    body: [
      "Pick the test from the question you asked before seeing the data. Comparing every "
        + "mean with every other: Tukey. Comparing each group with one control: Dunnett, "
        + "which has more power because the family is smaller. A few pairs chosen in "
        + "advance: Šídák (slightly more powerful than Bonferroni). Choosing the pairs after "
        + "looking at the data is the same as having made all comparisons.",
      "When the SDs are not assumed equal (Welch's ANOVA) use Games-Howell for large groups "
        + "or Dunnett's T3 with fewer than about 50 per group. After Kruskal-Wallis or "
        + "Friedman, Dunn's test. Fisher's LSD does not correct for multiple comparisons; "
        + "Newman-Keuls does not hold the familywise error rate.",
      "After two-way ANOVA, decide what one family is (for example, treatment vs control "
        + "within each time point) rather than comparing every cell with every other.",
    ],
    sources: [SRC.gpMcHowTo, SRC.gpMultipleComparisons, SRC.gpMcSummary, SRC.gpTwoWay],
    keywords: "post hoc post test tukey dunnett sidak bonferroni games-howell dunn family",
  },
  {
    id: "survival",
    title: "Log-rank or Gehan-Breslow-Wilcoxon? Hazard ratio and median survival",
    summary: "Report the log-rank test unless you have a reason; the HR assumes proportional hazards.",
    body: [
      "The log-rank (Mantel-Cox) test weights every time point equally and is the most "
        + "powerful when the hazard ratio is constant over time. The Gehan-Breslow-Wilcoxon "
        + "test gives more weight to early deaths, when more subjects are at risk; it can "
        + "mislead when many subjects are censored early. If in doubt, report the log-rank "
        + "test, and decide before looking at the curves.",
      "One hazard ratio summarises the whole curve only if the hazards are proportional. If "
        + "the curves cross, the hazard ratio (and the log-rank test's power) are not "
        + "meaningful: describe the curves instead. The hazard ratio is not the ratio of "
        + "median survival times.",
      "Median survival is the time at which the curve crosses 50%. It is undefined when "
        + "more than half the subjects survive to the end; the log-rank P is still valid.",
    ],
    sources: [SRC.gpLogrankGehan, SRC.gpHazardRatio, SRC.gpMedianSurvival],
    keywords: "kaplan meier mantel cox gehan breslow wilcoxon hazard ratio median crossing curves",
  },
  {
    id: "r2",
    title: "R² is not a measure of curve quality",
    summary: "A high R² can come with nonsensical parameters, wide CIs or an ambiguous fit.",
    body: [
      "R² compares the scatter around the fitted curve with the scatter around a horizontal "
        + "line. With nonlinear models it says little about whether the fit is useful: a "
        + "curve can have R² = 0.99 and still report an IC50 far outside the doses tested, "
        + "a confidence interval spanning orders of magnitude, or an ambiguous fit. R² can "
        + "even be negative when a constrained curve fits worse than a horizontal line.",
      "Don't choose a model by R² (a model with more parameters almost always has a higher "
        + "R²). Instead, check that the parameters make scientific sense, that their CIs are "
        + "reasonably narrow, that the fit is not flagged ambiguous, and that the residuals "
        + "scatter randomly around the curve (the runs test and residual plots help).",
    ],
    sources: [SRC.gpR2, SRC.gpAmbiguous],
    keywords: "r squared goodness of fit model selection residuals",
  },
  {
    id: "replicates",
    title: "Biological vs technical replicates (what is n?)",
    summary: "n is the number of independent biological units, not wells, cells or repeated readings.",
    body: [
      "Biological replicates are independent samples of the population: separate animals, "
        + "patients, or experiments done on different days with different cultures. "
        + "Technical replicates (wells, repeated readings) and cells within one animal or "
        + "dish are pseudoreplicates: treating them as independent gives confidence "
        + "intervals that are too narrow and P values that are too small. Counting each "
        + "cell as n can give false-positive rates above 50%.",
      "Either analyse the hierarchy (nested t test or nested ANOVA, a mixed model with the "
        + "biological unit as a random effect) or average the technical replicates within "
        + "each unit and test the unit means: P computed with an n of three experiments, "
        + "not 300 cells.",
      "A SuperPlot shows both levels: every cell as a small point coloured by experiment, "
        + "and each experiment's mean as a large point. Journals ask for n as a number with "
        + "its unit (\"n = 4 mice\").",
    ],
    sources: [SRC.lord2020, SRC.gpNested, SRC.natureSummary],
    keywords: "superplots pseudoreplication nested technical biological cells animals n",
  },
  {
    id: "tails",
    title: "One-tailed or two-tailed P?",
    summary: "Use two-tailed unless the direction was fixed beforehand and the other direction would count as nothing.",
    body: [
      "A two-tailed P asks how likely a difference this large is, in either direction, if "
        + "there is no real effect. A one-tailed P counts only one direction and is half as "
        + "large when the effect goes the predicted way.",
      "A one-tailed P is legitimate only when the direction was predicted before collecting "
        + "the data and a large difference in the other direction would have been "
        + "attributed to chance, i.e. reported exactly like no difference. That is rarely "
        + "true in experimental biology. Switching to one-tailed after seeing the data is "
        + "not allowed. If in doubt, choose a two-tailed P, and always state which you "
        + "used.",
      "OpenDose reports two-tailed P values throughout.",
    ],
    sources: [SRC.gpTails, SRC.gpTwoTailed, SRC.sampl],
    keywords: "one-sided two-sided one tail two tail directional hypothesis",
  },
  {
    id: "exact-adjusted",
    title: "Exact, uncorrected and multiplicity-adjusted P values",
    summary: "An adjusted P accounts for the whole family of comparisons; say which kind you report.",
    body: [
      "After ANOVA, a multiplicity-adjusted P value is the smallest familywise significance "
        + "level at which that comparison would be called significant. It depends on every "
        + "comparison in the family: add or remove comparisons and it changes. Adjusted P "
        + "values are compared directly with 0.05.",
      "Uncorrected P values (Fisher's LSD, uncorrected Dunn's) treat each comparison alone. "
        + "They are appropriate only for a single planned comparison, or when you correct "
        + "for multiplicity some other way (for example a false discovery rate).",
      "Avoid calling either an \"exact\" P value; write \"multiplicity-adjusted P\" or "
        + "\"P not corrected for multiple comparisons\", and name the method and the family.",
    ],
    sources: [SRC.gpAdjustedP, SRC.gpExactP],
    keywords: "multiplicity adjusted familywise uncorrected fisher lsd false discovery",
  },
  {
    id: "ambiguous",
    title: "What \"ambiguous\" means in a curve fit",
    summary: "Several combinations of parameters fit equally well: the data do not define them all.",
    body: [
      "A fit is flagged ambiguous when at least one parameter's dependency exceeds 0.9999: "
        + "changing it can be compensated almost exactly by changing others, so many "
        + "different curves fit the data equally well. Typical cause: a dose-response curve "
        + "that never reaches its top or bottom plateau, so the IC50 and that plateau "
        + "trade off against each other. The confidence intervals are then very wide.",
      "The curve itself may still be fine for interpolation, but don't interpret the "
        + "parameters. Fixes: constrain the plateau the data don't reach to a value you "
        + "know (e.g. the control mean, or 0 and 100 after normalising), extend the dose "
        + "range, share the parameter with other data sets in a global fit, or use a "
        + "simpler model (for example fix the Hill slope).",
    ],
    sources: [SRC.gpAmbiguous, SRC.gpWideCi, SRC.gpNotConverged],
    keywords: "dependency unstable very wide plateau constrain global fit",
  },
  {
    id: "sphericity",
    title: "Sphericity and the Geisser-Greenhouse correction",
    summary: "Repeated measures assume equal variance of all pairwise differences; the correction removes that assumption.",
    body: [
      "Repeated-measures ANOVA assumes sphericity: the differences between every pair of "
        + "conditions have the same variance. Measurements over time usually violate it, "
        + "because nearby time points are more alike than distant ones, and the P value "
        + "is then too small.",
      "The Geisser-Greenhouse correction estimates how far the data are from sphericity "
        + "(epsilon, from 1/(k−1) to 1.0, where 1 means sphericity holds) and multiplies "
        + "both degrees of freedom by epsilon before computing P. If you aren't sure, don't "
        + "assume sphericity: OpenDose reports the corrected P and epsilon.",
      "A mixed-effects model fits the same design without dropping subjects that miss a "
        + "measurement.",
    ],
    sources: [SRC.gpSphericity, SRC.gpEpsilon, SRC.gpChooseAnova],
    keywords: "repeated measures epsilon greenhouse geisser compound symmetry",
  },
  {
    id: "normalised-control",
    title: "Control normalised to 1 (or 100%) has SD 0",
    summary: "A control set to 1 is not data: test the treated values against 1, on the log scale.",
    body: [
      "When every value is divided by its own control (Western blots, qPCR fold change, "
        + "% of control), the control column becomes all 1 (or 100) with SD 0. Those "
        + "identical values are not measurements but hypothetical values, so a t test or "
        + "ANOVA against that column is not valid.",
      "Instead, leave the control out and ask whether the treated values differ from 1: a "
        + "one-sample t test against 1 (or 100). Because ratios are asymmetric (0.5 and 2 "
        + "are equally large effects), test the logs: a one-sample t test of log(ratio) "
        + "against 0, which OpenDose reports as the ratio t test (geometric mean vs 1).",
      "If you still have the raw control and treated values from each experiment, a ratio "
        + "paired t test on them keeps the control's variability.",
    ],
    sources: [SRC.gpNormalizeFaq, SRC.gpRatioT, SRC.gpRatioPaired],
    keywords: "fold change western blot qpcr ratio t test sd zero normalised normalized",
  },
  {
    id: "normality",
    title: "Normality tests and choosing a nonparametric test",
    summary: "Don't let a normality test decide alone: it is weak with small n and oversensitive with large n.",
    body: [
      "Normality tests ask whether the data could have come from a Gaussian distribution. "
        + "With small samples (fewer than about a dozen values) they have little power, so "
        + "passing means little; with large samples they flag trivial departures that do "
        + "not matter, because parametric tests are robust then.",
      "So decide from what you know about the variable. Good reasons for a rank-based test: "
        + "ordinal scores, or values off the scale of the instrument. Skewed positive data "
        + "(concentrations, titres) are often lognormal: analyse log(values) with the "
        + "parametric test rather than switching to ranks. With tiny samples, rank tests "
        + "have little or no power (3 vs 3 Mann-Whitney cannot give P < 0.05).",
      "Shapiro-Wilk works from n = 3 (without ties); D'Agostino-Pearson and Anderson-Darling "
        + "need n ≥ 8.",
    ],
    sources: [SRC.gpNormalityChoice, SRC.gpNonparametric, SRC.gpNormalityQa],
    keywords: "gaussian shapiro wilk dagostino nonparametric mann whitney lognormal",
  },
  {
    id: "equal-sds",
    title: "Equal SDs: Welch's t test and Welch's ANOVA",
    summary: "Welch's methods do not assume equal SDs and lose little when the SDs are equal.",
    body: [
      "The ordinary unpaired t test and one-way ANOVA pool the SDs, assuming the groups vary "
        + "equally. When they don't, especially with unequal n, the P value can be badly "
        + "wrong. Welch's t test does not make that assumption, loses very little power when "
        + "the SDs are in fact equal, and is recommended as the default unless there is a "
        + "compelling reason to assume equal SDs.",
      "Decide this from the design, not by testing the data first: tests of equal variance "
        + "have little power with small samples, and choosing a test from them distorts the "
        + "P value. For three or more groups, Welch's ANOVA (with Games-Howell or Dunnett's "
        + "T3 comparisons) is the counterpart. Kruskal-Wallis is not a fix for unequal SDs.",
    ],
    sources: [SRC.gpWelch, SRC.gpWelchQa, SRC.gpChooseAnova],
    keywords: "variance welch brown-forsythe bartlett unequal sd heteroscedasticity",
  },
  {
    id: "missing-values",
    title: "Missing values in repeated measures: the mixed model",
    summary: "RM ANOVA drops every subject with a missing value; a mixed-effects model keeps them.",
    body: [
      "Repeated-measures ANOVA needs every subject measured in every condition: a subject "
        + "with one missing value is left out entirely. A mixed-effects model fits the same "
        + "design (think of it as repeated-measures ANOVA that allows missing values) and "
        + "uses all the data. With no missing values it gives identical results.",
      "OpenDose's two-way repeated-measures analysis switches to the mixed-effects model "
        + "automatically when values are missing and says so in the results. This is valid "
        + "when values are missing for random reasons (a failed well, a lost sample). If "
        + "subjects dropped out because of the treatment (for example animals removed at "
        + "late time points), no analysis can fully correct that bias: report it.",
    ],
    sources: [SRC.gpMixed, SRC.gpRmAnova],
    keywords: "mixed effects model missing data dropout repeated measures",
  },
  {
    id: "outliers",
    title: "Outliers: flag, don't delete",
    summary: "ROUT and Grubbs identify candidate outliers; removing them needs a reason beyond the test.",
    body: [
      "Grubbs' test finds one outlier at a time in Gaussian data; ROUT fits a robust model "
        + "and flags values whose residuals are too large for a chosen false discovery rate "
        + "Q (1% is usual). Both assume the rest of the data are Gaussian: a long tail of a "
        + "lognormal distribution is not a set of outliers.",
      "Look at a flagged value before acting on it: a typing error or a failed well is a "
        + "reason to exclude it; an inconvenient biological value is not. Exclude values in "
        + "the table (they stay visible, struck through) rather than deleting them, and report "
        + "how many were excluded and why.",
    ],
    sources: [SRC.gpChecklists, SRC.sampl],
    keywords: "rout grubbs exclude exclusion outlier",
  },
  {
    id: "normalize-sd",
    title: "What Normalize does to SD and SEM",
    summary: "Normalising rescales every value, so SD and SEM scale too; the references are treated as exact.",
    body: [
      "Normalize maps each data set so that the value chosen as 0% becomes 0 and the value "
        + "chosen as 100% becomes 100: Y' = 100 × (Y − zero) / (hundred − zero). Every value "
        + "of a data set is shifted and scaled by the same amounts, so SDs and SEMs are "
        + "multiplied by 100 / (hundred − zero) and their relative size is unchanged.",
      "The 0% and 100% references (e.g. the smallest and largest mean) are treated as exact "
        + "constants: their own uncertainty is not carried into the normalised values. A "
        + "reference row normalised replicate by replicate ends up with SD 0 and cannot be "
        + "tested as if it were measured. Normalising is optional for curve fitting; "
        + "weighting is not appropriate on normalised data.",
    ],
    sources: [SRC.gpNormalizing, SRC.gpNormalizeFaq],
    keywords: "normalize normalise percent of control rescale",
  },
  {
    id: "stacked",
    title: "Stacked vs side-by-side replicates",
    summary: "Column tables stack a group's values down the rows; XY and Grouped tables put replicates side by side.",
    body: [
      "In a Column table each group is one column and its values are stacked down the "
        + "rows; the rows of different columns are unrelated unless the data are paired "
        + "(then one row = one subject). In XY and Grouped tables, the replicates of one "
        + "condition sit side by side in subcolumns of the same row, because each row is "
        + "a level of X or of the row factor.",
      "Data exported as one long column of values with a second column of group labels "
        + "(\"indexed\" or long format) need unstacking: create the table, then Import › "
        + "Unstack indexed data turns each group label into its own column.",
      "If you have summary data only, choose \"Mean, SD, N\" (or SEM / CV) under \"Y values "
        + "entered as\" when you create the table.",
    ],
    sources: [SRC.gpChooseTest],
    keywords: "indexed long format wide format unstack subcolumns data entry layout",
  },
  {
    id: "paste-fidelity",
    title: "What happens to pasted cells",
    summary: "Blanks and spreadsheet errors stay missing, text is never read as 0, and identifiers are kept exactly as typed.",
    body: [
      "After every paste or import a line above the table counts the numbers read and names "
        + "every other cell: blanks and errors such as #DIV/0! or #N/A are kept as missing, text "
        + "in a number column is kept as typed and read as missing, and a value followed by * is "
        + "kept and excluded. Nothing is ever converted to 0, and the line says so.",
      "Row titles and categorical variables are identifiers: 0001234, 1E5 or SEPT2 stay exactly "
        + "as typed, never turned into numbers or dates. A pasted column of text in a "
        + "multiple-variables table becomes a categorical variable.",
      "Numbers with a decimal comma (1,5) or thousands separators are not guessed at in a plain "
        + "paste; the Import dialog reads them with the decimal separator you choose. Each "
        + "results sheet's Notes then say which cells an analysis skipped.",
    ],
    sources: [SRC.ziemann2016, SRC.sampl],
    keywords: "paste excel import blank missing #DIV/0! #N/A text zero gene id decimal comma",
  },
  {
    id: "why-differ",
    title: "Why your number may differ from another program",
    summary: "Tails, tie handling, exact vs approximate P, the correction, quantile definition and CI method all differ by default.",
    body: [
      "Two correct programs can report different numbers for the same data when their "
        + "defaults differ: one- vs two-tailed P; exact or normal-approximation P for rank "
        + "tests, and how ties and zero differences are handled; which multiple-comparisons "
        + "correction and family; the percentile (quantile) definition; asymptotic, profile "
        + "or delta-method confidence intervals for fitted parameters; relative or absolute "
        + "IC50; Type I or III sums of squares and the error term in two-way designs; and "
        + "whether repeated-measures P values use the sphericity correction.",
      "Each OpenDose result has a \"Why your number may differ\" note listing the settings "
        + "it actually used, so you can match them in another program (for example Dunn's "
        + "test P values in R's dunn.test are one-sided by default).",
    ],
    sources: [SRC.gpPercentiles, SRC.gpAdjustedP, SRC.gpLogEc50Ci],
    keywords: "reproduce match r spss python excel prism defaults quantile type 6 type 7",
  },
];

export const EXPLAINER_ALIASES: Record<string, string> = { superplots: "replicates" };

export function explainer(id: string): Explainer | undefined {
  const key = EXPLAINER_ALIASES[id] ?? id;
  return EXPLAINERS.find((e) => e.id === key);
}

/** Help panel search: every word must match the title, summary, body or
 *  keywords; titles rank first. */
export function searchExplainers(query: string): Explainer[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return EXPLAINERS;
  const hay = (e: Explainer) =>
    `${e.title} ${e.summary} ${e.body.join(" ")} ${e.keywords}`.toLowerCase();
  return EXPLAINERS
    .filter((e) => words.every((w) => hay(e).includes(w)))
    .sort((a, b) => Number(words.some((w) => b.title.toLowerCase().includes(w)))
      - Number(words.some((w) => a.title.toLowerCase().includes(w))));
}
