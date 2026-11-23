// A rank test compares distributions, not means (Hart 2001, BMJ 323:391:
// "The Mann-Whitney test is a test of both location and shape"), so a
// column graph created from now on summarises the groups the way the test
// sees them: its centre and error bars start as "Follow the test", which
// draws mean ± SD, or median with IQR while the bound analysis is a rank
// test (P-26). A graph whose centre the user chose, and every graph saved
// before this option existed (no "auto"), keeps what it draws. The results
// headline says in one line what the test compares. Pure.
import { COLUMN_SUMMARY_LABELS, type ColumnSummary } from "./graphSettings.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RankTest {
  /** "Mann-Whitney". */
  name: string;
  /** "compares distributions (ranks)". */
  compares: string;
}

/** The rank-based (or median) test the column analysis options run, or
 *  null for any other analysis. */
export function rankTestOf(options: unknown): RankTest | null {
  const o = (options && typeof options === "object" ? options : {}) as Record<string, any>;
  switch (o.analysis) {
    case "ttest":
      if (o.ttestKind === "mann_whitney") return { name: "Mann-Whitney", compares: "compares distributions (ranks)" };
      if (o.ttestKind === "wilcoxon") {
        return { name: "Wilcoxon matched-pairs", compares: "compares paired values (signed ranks of the differences)" };
      }
      if (o.ttestKind === "kolmogorov_smirnov") {
        return { name: "Kolmogorov-Smirnov", compares: "compares whole distributions (cumulative distributions)" };
      }
      return null;
    case "anova":
      return o.anovaKind === "nonparametric"
        ? { name: "Kruskal-Wallis", compares: "compares distributions (ranks)" } : null;
    case "rm_anova":
      return o.rmKind === "nonparametric"
        ? { name: "Friedman", compares: "compares paired values within each row (ranks)" } : null;
    case "median_test":
      return { name: "median", compares: "compares medians" };
    default:
      return null;
  }
}

/** What a column graph's centre and error bars draw: "auto" (Follow the
 *  test) is median with IQR under a rank test, else mean ± SD. */
export function resolveSummary(s: ColumnSummary | "auto", options: unknown): ColumnSummary {
  if (s !== "auto") return s;
  return rankTestOf(options) ? "median_iqr" : "mean_sd";
}

/** The results headline's line on what the test compares, with what the
 *  bound graph shows ("median and IQR"), or null for other analyses.
 *  `shown` is the bound graph's centre (null: no such graph). */
export function rankLine(options: unknown, shown: ColumnSummary | "box" | null): string | null {
  const t = rankTestOf(options);
  if (!t) return null;
  const head = `The ${t.name} test ${t.compares}`;
  if (shown === null) return `${head}.`;
  if (shown === "median_iqr" || shown === "box") return `${head}, shown as median and IQR.`;
  return `${head}; the graph shows ${COLUMN_SUMMARY_LABELS[shown].replace(/^./, (c) => c.toLowerCase())}.`;
}
