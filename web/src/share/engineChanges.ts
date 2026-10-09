// Engine change log: one line per change that can move a number a saved
// project shows, by the app version that shipped it. When a reopened
// project's results are recomputed and a number changes (project/
// reproduce.ts), the reproduction strip and the History panel give these
// lines as the "why". Add an entry with every release whose engine
// changes results; `analyses` lists the result ids (`result.analysis`) a
// change can touch, so a changed number is explained by the relevant
// lines first. Source of the 0.3.0 entries: docs/validation/
// results-engine.md, "What changed in engine/opendose/" (2026-10-04);
// of the 0.4.0 entries: the engine commits of 2026-10-09 (Waves 1-3).
import type { ReproductionReport } from "../project/reproduce.ts";

export interface EngineChange {
  /** App version that first shipped the change. */
  version: string;
  date: string;
  note: string;
  /** Result ids (`result.analysis`) it can change; empty = any. */
  analyses: string[];
}

const FITS = ["dose_response", "nonlin", "global_fit", "user_equation", "schild", "quantal"];

export const ENGINE_CHANGES: EngineChange[] = [
  { version: "0.3.0", date: "2026-10-04", analyses: FITS,
    note: "Nonlinear fits converge to tighter tolerances (1e-12, then a Gauss-Newton polish): best-fit values can move in the last digits, and fits that stopped early now reach the certified optimum." },
  { version: "0.3.0", date: "2026-10-04", analyses: FITS,
    note: "Standard errors use a scale-aware, central-difference Jacobian: SEs and CIs no longer depend on the units of X (an EC50 in M and in nM had SEs up to 7% apart)." },
  { version: "0.3.0", date: "2026-10-04", analyses: FITS,
    note: "A fit no better than a horizontal line restarts from more starting values; when none helps it is reported as ambiguous." },
  { version: "0.3.0", date: "2026-10-04", analyses: ["survival"],
    note: "Log-rank: the variance (R survdiff) form is reported next to the Peto form, which is unchanged." },
  { version: "0.3.0", date: "2026-10-04", analyses: ["two_way_anova"],
    note: "Two-way ANOVA with one value per cell fits the main-effects (additive) model." },
  { version: "0.3.0", date: "2026-10-04", analyses: ["contingency"],
    note: "Contingency tables: Fisher's exact test for r x c tables, one-sided Fisher P values and the conditional MLE odds ratio were added; the CI level option is applied." },
  { version: "0.3.0", date: "2026-10-04", analyses: FITS,
    note: "The extra sum-of-squares F test and AICc no longer divide by zero when the more complex model fits exactly." },
  { version: "0.3.0", date: "2026-10-04",
    analyses: ["anova", "two_way_anova", "rm_two_way_mixed", "rm_two_way_both", "three_way_anova", "anova_unequal_var"],
    note: "Tukey, Games-Howell and Newman-Keuls P values come from a deterministic studentized-range integral (exact to 1e-13 for two groups) instead of SciPy's." },
  { version: "0.4.0", date: "2026-10-09", analyses: ["ttest", "correlation"],
    note: "Paired t, Wilcoxon and correlation pair values cell by cell: a blank in one column no longer shifts every later pair, so paired results of tables with blanks can change; incomplete pairs are left out and listed." },
  { version: "0.4.0", date: "2026-10-09",
    analyses: ["ttest", "anova", "anova_unequal_var", "friedman", "rm_one_way_anova", "two_way_anova"],
    note: "When a group has fewer than two independent values, P values are withheld and the result is labelled exploratory, with the detectable effect at n = 2-3." },
  { version: "0.4.0", date: "2026-10-09",
    analyses: ["anova", "anova_unequal_var", "friedman", "rm_one_way_anova", "two_way_anova", "three_way_anova"],
    note: "Comparisons tables give the unadjusted P and the family size next to each adjusted P; Dunn's test (all pairs, vs a control or planned pairs) follows Kruskal-Wallis and Friedman, and Sidak, Bonferroni and Holm can correct a planned family only." },
  { version: "0.4.0", date: "2026-10-09", analyses: ["rm_one_way_anova", "mixed_rm_one_way"],
    note: "Repeated-measures one-way ANOVA reports post hoc comparisons (Tukey by default; Dunnett, Sidak, Bonferroni, Holm, Holm-Sidak, Fisher) on each pair's own differences; the overall F and P are unchanged." },
  { version: "0.4.0", date: "2026-10-09", analyses: ["survival", "survival_pairwise", "survival_at_time", "rmst"],
    note: "Survival adds pairwise log-rank tests (Holm-Sidak or Bonferroni), the log-rank test for trend, survival at a chosen time, restricted mean survival time and warnings when few events drive the test." },
  { version: "0.4.0", date: "2026-10-09", analyses: FITS,
    note: "Dose-response fits flag an IC50 or EC50 outside the tested range and plateaus the data do not define." },
  { version: "0.4.0", date: "2026-10-09", analyses: ["ttest", "correlation", "column_statistics", "descriptive"],
    note: "Large-data paths: the Hodges-Lehmann estimate and its CI use exact Walsh-average selection, Kendall's tau counts inversions, and the CI of the median is vectorised; values can move in the last digits for large samples." },
  { version: "0.4.0", date: "2026-10-09",
    analyses: ["ttest", "anova", "two_way_anova", "dose_response", "qpcr_reference_check", "flow_summary",
      "residuals_column", "scale_check", "compare_parameter", "mixed_nested_two_way", "mixed_grouping", "mixed_timecourse", "subject_auc"],
    note: "New results that leave earlier numbers unchanged: residual diagnostics, analysis on the log scale with geometric-mean ratios, two-way interaction contrasts and simple effects, comparing one curve parameter with the potency ratio, qPCR reference-gene stability, the flow-cytometry summary, nested two-way and grouping-column mixed models, and time-course mixed models with AUC per subject." },
];

/** -1, 0, 1 comparing dotted versions numerically ("0.10.0" > "0.9.1");
 *  anything that is not a version sorts first. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => (/^\d+(\.\d+)*$/.test(v) ? v.split(".").map(Number) : null);
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/**
 * The changes shipped after `saved` up to and including `current` (all
 * up to `current` when the saving version is unknown), relevant to
 * `analysis` first. With the same version on both sides (a rebuilt
 * engine of one release) every entry of that version is returned.
 */
export function changesBetween(saved: string | null, current: string,
  analysis?: string): EngineChange[] {
  const inRange = ENGINE_CHANGES.filter((c) => {
    const upTo = compareVersions(c.version, current) <= 0 || !/^\d/.test(current);
    if (!upTo) return false;
    if (!saved || !/^\d/.test(saved)) return true;
    const cmp = compareVersions(c.version, saved);
    return cmp > 0 || (cmp === 0 && compareVersions(saved, current) === 0);
  });
  if (!analysis) return inRange;
  return inRange.filter((c) => !c.analyses.length || c.analyses.includes(analysis));
}

/** The change-log entries that may explain a reproduction report's
 *  changed sheets (each once, in log order). */
export function whyLines(r: Pick<ReproductionReport, "savedWith" | "current" | "sheets">): EngineChange[] {
  const saved = r.savedWith?.app ?? null;
  const out: EngineChange[] = [];
  for (const c of ENGINE_CHANGES) {
    if (r.sheets.some((s) => s.changes.length
      && changesBetween(saved, r.current.app, s.analysis).includes(c))) out.push(c);
  }
  return out;
}
