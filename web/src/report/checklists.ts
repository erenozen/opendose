// Journal checklists, auto-ticked from a family (a data table with its
// results and graphs). Only the items a statistics tool can know about
// are listed; each is ticked from facts the app holds, with a one-line
// reason and where to fix it. Pure, unit-tested.
//
// Sources (the checklist wording is paraphrased; every item cites its own):
// - Nature Portfolio Reporting Summary, "Statistics" section (2023 form).
// - eLife Transparent Reporting Form (sample size, replicates, exclusions,
//   statistical reporting, source data) and eLife author guide ("show the
//   individual data points ... typically when N per group is less than 10").
// - Cell Press STAR Methods, "Quantification and statistical analysis".
// - SAMPL: Lang & Altman, Basic statistical reporting for articles
//   published in biomedical journals (2013).
// - ARRIVE 2.0 Essential 10 (Percie du Sert et al. 2020, PLoS Biol
//   18:e3000410), items 1-3, 7 and 10.
import type { TestInfo } from "./describe.ts";
import type { ErrorBars } from "./legend.ts";
import type { ReportMeta } from "./meta.ts";
import type { PlanFacts } from "../project/plan.ts";

export interface ResultFacts {
  sheetId: string;
  name: string;
  info: TestInfo;
  /** Effect sizes reported, and whether any has a CI. */
  effect: boolean;
  effectCI: boolean;
  /** A CI on the estimate itself (difference, ratio, slope). */
  estimateCI: boolean;
}

export interface GraphFacts {
  sheetId: string;
  name: string;
  /** The legend can say what is plotted (known graph kind). */
  described: boolean;
  errorBars: ErrorBars | null;
  /** Individual values drawn (null: cannot tell). */
  pointsShown: boolean | null;
}

export interface FamilyFacts {
  dataId: string;
  dataName: string;
  results: ResultFacts[];
  graphs: GraphFacts[];
  meta: ReportMeta;
  /** Cells excluded in the data table. */
  excludedCount: number;
  /** Smallest n of any analysed group (null: unknown). */
  minN: number | null;
  /** The ARRIVE-style justification of a power analysis in the project. */
  powerJustification: string | null;
  /** "OpenDose 0.2.0 with SciPy 1.14.1 and NumPy 2.0.2". */
  software: string;
  /** A column-statistics sheet with normality tests is in the family. */
  normalityChecked: boolean;
  /** The analysis plan written for this table (project/plan.ts), if any. */
  plan?: PlanFacts | null;
}

export type Status = "met" | "unmet" | "na";

/** Where to fix an item: the reporting details form, a results sheet, a
 *  graph sheet, or the Analyze menu (add an analysis). */
export interface FixTarget {
  kind: "details" | "results" | "graph" | "analyze";
  sheetId?: string;
  label: string;
}

export interface RuleOutcome { status: Status; reason: string; fix?: FixTarget }

export interface ChecklistItem extends RuleOutcome {
  id: string;
  text: string;
  /** Where the item comes from (form and section). */
  source: string;
}

export interface Checklist {
  id: string;
  title: string;
  source: string;
  items: ChecklistItem[];
}

// ------------------------------------------------------------ the rules

type Rule = (f: FamilyFacts) => RuleOutcome;

const DETAILS = (label: string): FixTarget => ({ kind: "details", label });
const tested = (f: FamilyFacts) => f.results.filter((r) => r.info.test);

const names = (rs: { name: string }[]) => rs.map((r) => `“${r.name}”`).join(", ");

export const RULES: Record<string, Rule> = {
  n_exact: (f) => {
    const rs = f.results.filter((r) => r.info.test || r.info.groups.length);
    if (!rs.length) return { status: "unmet", reason: "No analysis yet: nothing states n.", fix: { kind: "analyze", label: "Add an analysis" } };
    const missing = rs.filter((r) => !r.info.groups.length);
    if (missing.length) {
      return { status: "unmet", reason: `n per group is not known for ${names(missing)}.`,
        fix: { kind: "results", sheetId: missing[0].sheetId, label: "Open the results" } };
    }
    const g = rs[0].info.groups;
    const same = g.every((x) => x.n === g[0].n);
    return { status: "met", reason: `Exact n per group is in the legend (${same ? `n = ${g[0].n} per group` : g.map((x) => `${x.name} ${x.n}`).join(", ")}).` };
  },
  n_unit: (f) => (f.meta.unit
    ? { status: "met", reason: `n counts ${f.meta.unit}.` }
    : { status: "unmet", reason: "Say what one n is (mice, wells, cells, patients).", fix: DETAILS("Reporting details: unit of n") }),
  replicates: (f) => (f.meta.experiments
    ? { status: "met", reason: `${f.meta.experiments} independent experiment${f.meta.experiments === 1 ? "" : "s"} stated in the legend.` }
    : { status: "unmet", reason: "State how many independent experiments (biological replicates) the data come from.", fix: DETAILS("Reporting details: independent experiments") }),
  test_named: (f) => {
    const t = tested(f);
    if (!t.length) return { status: "unmet", reason: "No statistical test in this family yet.", fix: { kind: "analyze", label: "Add an analysis" } };
    return { status: "met", reason: `Named in the methods and legend: ${[...new Set(t.map((r) => r.info.test))].join("; ")}.` };
  },
  sidedness: (f) => {
    const t = tested(f);
    if (!t.length) return { status: "na", reason: "No test yet." };
    const un = t.filter((r) => !r.info.sided);
    return un.length ? { status: "unmet", reason: `Sidedness unknown for ${names(un)}.` }
      : { status: "met", reason: "Every P value is two-sided, and the text says so." };
  },
  repeated_stated: (f) => {
    const t = tested(f);
    if (!t.length) return { status: "na", reason: "No test yet." };
    const rep = t.filter((r) => r.info.repeated);
    return { status: "met", reason: rep.length ? `Matched / repeated design named (${names(rep)}).`
      : "Independent groups: the tests named are for unmatched samples." };
  },
  statistic_df: (f) => {
    const t = tested(f);
    if (!t.length) return { status: "na", reason: "No test yet." };
    const without = t.filter((r) => !r.info.statisticWithDf
      && !/Mann-Whitney|Wilcoxon|Kolmogorov|Kruskal|Friedman|Fisher|exact|estimation|McNemar/i.test(r.info.test ?? ""));
    return without.length ? { status: "unmet", reason: `No test statistic with df for ${names(without)}.`,
      fix: { kind: "results", sheetId: without[0].sheetId, label: "Open the results" } }
      : { status: "met", reason: "Test statistics with their df (rank tests: the statistic) are in the results sentence." };
  },
  exact_p: (f) => {
    const t = tested(f);
    if (!t.length) return { status: "na", reason: "No test yet." };
    return t.every((r) => r.info.exactP) ? { status: "met", reason: "P values are exact, with the style's floor (e.g. P < 0.0001)." }
      : { status: "unmet", reason: "Some results report only thresholds." };
  },
  effect_ci: (f) => {
    const t = tested(f);
    if (!t.length) return { status: "na", reason: "No comparison yet." };
    const without = t.filter((r) => !r.effectCI && !r.estimateCI);
    if (without.length) {
      return { status: "unmet", reason: `No effect size with a CI for ${names(without)}${without.some((r) => r.effect) ? " (an effect size without CI is shown)" : ""}.`,
        fix: { kind: "analyze", label: "Add an estimation plot (bootstrap CI)" } };
    }
    return { status: "met", reason: "Every comparison reports an effect size or difference with its 95% CI." };
  },
  multiplicity: (f) => {
    const multi = f.results.filter((r) => r.info.multiplicity === "corrected" || r.info.multiplicity === "uncorrected");
    if (!multi.length) return { status: "na", reason: "One comparison per analysis: no correction needed." };
    const un = multi.filter((r) => r.info.multiplicity === "uncorrected");
    if (un.length) {
      return { status: "unmet", reason: `${names(un)}: several comparisons without a multiplicity correction${un[0].info.posthoc ? ` (${un[0].info.posthoc})` : ""}.`,
        fix: { kind: "results", sheetId: un[0].sheetId, label: "Choose a correction" } };
    }
    return { status: "met", reason: `Correction named: ${[...new Set(multi.map((r) => r.info.correction))].join(", ")}.` };
  },
  assumptions: (f) => {
    const t = tested(f);
    if (!t.length) return { status: "na", reason: "No test yet." };
    const un = t.filter((r) => !r.info.assumptions && !f.normalityChecked);
    return un.length ? { status: "unmet", reason: `No assumption check for ${names(un)}; add column statistics with normality tests or use a test without that assumption.`,
      fix: { kind: "analyze", label: "Add column statistics (normality)" } }
      : { status: "met", reason: [...new Set(t.map((r) => r.info.assumptions).filter(Boolean))].join("; ") || "Normality tests in the family." };
  },
  centre_dispersion: (f) => {
    if (!f.graphs.length) return { status: "unmet", reason: "No graph: add one so the legend defines centre and dispersion.", fix: { kind: "analyze", label: "Add a graph" } };
    const un = f.graphs.filter((g) => !g.described);
    return un.length ? { status: "unmet", reason: `The legend cannot describe ${names(un)}.`,
      fix: { kind: "graph", sheetId: un[0].sheetId, label: "Open the graph" } }
      : { status: "met", reason: "The legend says what the centre, error bars and points are." };
  },
  no_sem: (f) => {
    const sem = f.graphs.filter((g) => g.errorBars === "sem");
    if (!f.graphs.length) return { status: "na", reason: "No graph." };
    return sem.length ? { status: "unmet", reason: `${names(sem)} uses SEM error bars; SAMPL asks for SD to show variability (or a 95% CI for inference).`,
      fix: { kind: "graph", sheetId: sem[0].sheetId, label: "Change the error bars" } }
      : { status: "met", reason: "Variability is shown as SD (or CI, IQR), not SEM." };
  },
  points_small_n: (f) => {
    if (f.minN === null) return { status: "na", reason: "n not known." };
    if (f.minN >= 10) return { status: "na", reason: `n ≥ 10 in every group (smallest ${f.minN}).` };
    if (!f.graphs.length) return { status: "unmet", reason: `n = ${f.minN} < 10: show the individual values in a graph.`, fix: { kind: "analyze", label: "Add a graph" } };
    const un = f.graphs.filter((g) => g.pointsShown !== true);
    return un.length ? { status: "unmet", reason: `n = ${f.minN} < 10 but ${names(un)} does not show the individual values.`,
      fix: { kind: "graph", sheetId: un[0].sheetId, label: "Show the points" } }
      : { status: "met", reason: `n = ${f.minN} < 10 and every graph shows the individual values.` };
  },
  significance: (f) => (tested(f).length
    ? { status: "met", reason: "The methods text states two-sided tests, exact P and α = 0.05; the legend gives the star scale." }
    : { status: "na", reason: "No test yet." }),
  software: (f) => ({ status: "met", reason: `${f.software} (methods text and legend).` }),
  exclusions: (f) => {
    if (f.meta.exclusions) return { status: "met", reason: `Recorded: “${f.meta.exclusions}”${f.excludedCount ? ` (${f.excludedCount} value${f.excludedCount === 1 ? "" : "s"} excluded in the table)` : ""}.` };
    return { status: "unmet", reason: f.excludedCount
      ? `${f.excludedCount} value${f.excludedCount === 1 ? " is" : "s are"} excluded in the table but no reason is recorded.`
      : "Record whether any data were excluded (write “none” if none) and the criteria.", fix: DETAILS("Reporting details: exclusions") };
  },
  sample_size: (f) => {
    if (f.powerJustification) return { status: "met", reason: "From the power analysis in this project." };
    if (f.meta.sampleSize) return { status: "met", reason: `Stated: “${f.meta.sampleSize}”.` };
    return { status: "unmet", reason: "Say how the sample size was decided (a power analysis, or the reason in Reporting details).", fix: DETAILS("Reporting details: sample size") };
  },
  plan: (f) => {
    const pl = f.plan;
    if (!pl) {
      return { status: "na", reason: "No analysis plan recorded here. If a protocol with the analysis plan was written before the study, say so and where it was registered (an Analysis plan info sheet records it with the data)." };
    }
    if (!pl.locked) {
      return { status: "unmet", reason: `The analysis plan (written ${pl.written}) is not locked: lock it before the data are analysed.`,
        fix: { kind: "results", sheetId: pl.sheetId, label: "Open the analysis plan" } };
    }
    if (pl.unexplained) {
      return { status: "unmet", reason: `${pl.unexplained} deviation${pl.unexplained === 1 ? "" : "s"} from the analysis plan without a reason.`,
        fix: { kind: "results", sheetId: pl.firstUnexplained ?? pl.sheetId, label: "Add a reason" } };
    }
    return { status: "met", reason: `Analysis plan written ${pl.written} and locked; ${pl.deviations
      ? `${pl.deviations} deviation${pl.deviations === 1 ? "" : "s"}, each with its reason, in the methods text` : "no deviations"}.` };
  },
  mean_sd_format: () => ({ status: "met", reason: "Sentences write mean (SD) / M and SD, never mean ± SEM." }),
  source_data: () => ({ status: "met", reason: "The export bundle (Save menu) holds every table as CSV with the results and provenance." }),
};

/** An item made of several rules: unmet if any is unmet, else met if any
 *  is met, else not applicable. Reasons of the decisive rules are kept. */
function combine(f: FamilyFacts, ids: string[]): RuleOutcome {
  const outs = ids.map((id) => RULES[id](f));
  const unmet = outs.filter((o) => o.status === "unmet");
  if (unmet.length) return { status: "unmet", reason: unmet.map((o) => o.reason).join(" "), fix: unmet[0].fix };
  const met = outs.filter((o) => o.status === "met");
  if (met.length) return { status: "met", reason: met.map((o) => o.reason).join(" ") };
  return { status: "na", reason: outs.map((o) => o.reason).join(" ") };
}

interface ItemDef { id: string; text: string; rules: string[]; source: string }

const NATURE = "Nature Portfolio Reporting Summary, Statistics";
const ELIFE = "eLife Transparent Reporting Form";
const STAR = "Cell Press STAR Methods, Quantification and statistical analysis";
const SAMPL = "SAMPL guidelines (Lang & Altman 2013)";
const ARRIVE = "ARRIVE 2.0 Essential 10";

const DEFS: { id: string; title: string; source: string; items: ItemDef[] }[] = [
  { id: "nature", title: "Nature reporting summary: statistics", source: NATURE, items: [
    { id: "n", text: "The exact sample size (n) for each group, as a discrete number and unit of measurement", rules: ["n_exact", "n_unit"], source: NATURE },
    { id: "distinct", text: "Whether measurements were taken from distinct samples or the same sample measured repeatedly", rules: ["repeated_stated"], source: NATURE },
    { id: "tests", text: "The statistical test(s) used AND whether they are one- or two-sided", rules: ["test_named", "sidedness"], source: NATURE },
    { id: "assumptions", text: "A description of any assumptions or corrections, such as tests of normality and adjustment for multiple comparisons", rules: ["assumptions", "multiplicity"], source: NATURE },
    { id: "parameters", text: "Central tendency (e.g. means) AND variation (e.g. SD) or associated estimates of uncertainty (e.g. CIs)", rules: ["centre_dispersion"], source: NATURE },
    { id: "nhst", text: "Test statistic with CIs, effect sizes, degrees of freedom and P value; exact P values whenever suitable", rules: ["statistic_df", "exact_p", "effect_ci"], source: NATURE },
    { id: "hierarchy", text: "For hierarchical designs, the appropriate level for tests and full reporting of outcomes", rules: ["n_unit", "replicates"], source: NATURE },
    { id: "effects", text: "Estimates of effect sizes (e.g. Cohen's d, Pearson's r), indicating how they were calculated", rules: ["effect_ci"], source: NATURE },
  ] },
  { id: "elife", title: "eLife transparent reporting", source: ELIFE, items: [
    { id: "sample_size", text: "How the sample size was estimated", rules: ["sample_size"], source: `${ELIFE}, sample-size estimation` },
    { id: "replicates", text: "Biological and technical replicates defined, and how many", rules: ["n_unit", "replicates"], source: `${ELIFE}, replicates` },
    { id: "exclusions", text: "Outliers and data exclusions, with the criteria", rules: ["exclusions"], source: `${ELIFE}, inclusion and exclusion` },
    { id: "reporting", text: "Exact P values alongside effect sizes with 95% CIs, the test named, n stated", rules: ["exact_p", "effect_ci", "test_named", "n_exact"], source: `${ELIFE}, statistical reporting` },
    { id: "raw", text: "Individual data points shown when n per group is less than 10", rules: ["points_small_n"], source: "eLife author guide, figures" },
    { id: "source", text: "Source data available", rules: ["source_data"], source: `${ELIFE}, data availability` },
  ] },
  { id: "star", title: "Cell STAR Methods: quantification and statistical analysis", source: STAR, items: [
    { id: "tests", text: "The statistical tests used", rules: ["test_named", "sidedness"], source: STAR },
    { id: "n", text: "The exact value of n", rules: ["n_exact"], source: STAR },
    { id: "n_means", text: "What n represents (cells, animals, experiments)", rules: ["n_unit", "replicates"], source: STAR },
    { id: "centre", text: "Definition of center and dispersion and precision measures", rules: ["centre_dispersion"], source: STAR },
    { id: "significance", text: "Definition of statistical significance", rules: ["significance"], source: STAR },
    { id: "sample_size", text: "Whether and how the sample size was estimated", rules: ["sample_size"], source: STAR },
    { id: "exclusions", text: "Inclusion and exclusion criteria of data", rules: ["exclusions"], source: STAR },
    { id: "assumptions", text: "Whether the data met the assumptions of the test", rules: ["assumptions"], source: STAR },
    { id: "software", text: "Software used, with version", rules: ["software"], source: STAR },
  ] },
  { id: "sampl", title: "SAMPL basic statistical reporting", source: SAMPL, items: [
    { id: "mean_sd", text: "Report mean (SD), not mean ± SD", rules: ["mean_sd_format"], source: SAMPL },
    { id: "no_sem", text: "Do not use the SEM to describe variability", rules: ["no_sem"], source: SAMPL },
    { id: "tests", text: "Name the test, whether one- or two-tailed, and whether paired", rules: ["test_named", "sidedness", "repeated_stated"], source: SAMPL },
    { id: "alpha", text: "State the alpha level", rules: ["significance"], source: SAMPL },
    { id: "exact_p", text: "Report exact P values, with P < 0.001 as the floor", rules: ["exact_p"], source: SAMPL },
    { id: "multiple", text: "Say how multiple comparisons were handled", rules: ["multiplicity"], source: SAMPL },
    { id: "ci", text: "Report effect sizes with confidence intervals", rules: ["effect_ci"], source: SAMPL },
    { id: "software", text: "Name the statistical software", rules: ["software"], source: SAMPL },
  ] },
  { id: "arrive", title: "ARRIVE 2.0 Essential 10 and protocol registration (items a statistics tool can check)", source: ARRIVE, items: [
    { id: "e1", text: "1. Study design: the groups compared and the experimental unit", rules: ["test_named", "n_unit"], source: `${ARRIVE}, item 1` },
    { id: "e2", text: "2. Sample size: exact n per group and how it was decided", rules: ["n_exact", "sample_size"], source: `${ARRIVE}, item 2` },
    { id: "e3", text: "3. Inclusion and exclusion criteria, with exclusions and exact n per analysis", rules: ["exclusions", "n_exact"], source: `${ARRIVE}, item 3` },
    { id: "e7", text: "7. Statistical methods for each analysis, with software and assumption checks", rules: ["test_named", "software", "assumptions"], source: `${ARRIVE}, item 7` },
    { id: "e10", text: "10. Results: summary statistics with variability and the effect size with a confidence interval", rules: ["centre_dispersion", "effect_ci"], source: `${ARRIVE}, item 10` },
    { id: "r19", text: "19. Protocol registration (Recommended Set): whether a protocol with the analysis plan was prepared before the study", rules: ["plan"], source: "ARRIVE 2.0 Recommended Set, item 19" },
  ] },
];

/** Every checklist, ticked for this family. */
export function evaluateChecklists(f: FamilyFacts): Checklist[] {
  return DEFS.map((d) => ({
    id: d.id, title: d.title, source: d.source,
    items: d.items.map((it) => ({ id: it.id, text: it.text, source: it.source, ...combine(f, it.rules) })),
  }));
}

/** Counts for a summary line: "12 of 18 met, 2 not applicable". */
export function checklistSummary(lists: Checklist[]): { met: number; unmet: number; na: number } {
  const all = lists.flatMap((l) => l.items);
  return {
    met: all.filter((i) => i.status === "met").length,
    unmet: all.filter((i) => i.status === "unmet").length,
    na: all.filter((i) => i.status === "na").length,
  };
}
