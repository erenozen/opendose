// Contingency-table analyses: payloads for the engine and their option
// types. Pure (no React, no engine import), unit-tested with node --test.
//
// The table: rows are groups (row titles), each data set is one outcome
// column, one count per cell (first subcolumn).
//
// Stratified tables (Cochran-Mantel-Haenszel) need no new table layout:
// the strata are consecutive blocks of rows whose titles start with the
// stratum ("Site A: exposed", "Site A: unexposed" -> "Site A"), the same
// number of rows (two or more) and columns in every stratum; 2 × 2 strata
// give the classic CMH test, larger ones the generalized CMH test. Without
// such titles a two-column table is read as consecutive pairs of rows
// (rows 1-2 are stratum 1, rows 3-4 stratum 2, ...), named "Stratum k".
import { withExclusionsBlanked } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

export type PropCI = "wilson_brown" | "wilson" | "clopper_pearson";
export type DiffCI = "newcombe_cc" | "newcombe" | "asymptotic_cc";
export type RRCI = "koopman" | "katz";
export type ORCI = "baptista_pike" | "baptista_pike_midp" | "woolf";

export const PROP_CI_LABELS: Record<PropCI, string> = {
  wilson_brown: "Wilson/Brown",
  wilson: "Wilson (with continuity correction)",
  clopper_pearson: "Clopper-Pearson (exact)",
};
export const DIFF_CI_LABELS: Record<DiffCI, string> = {
  newcombe_cc: "Newcombe/Wilson with continuity correction",
  newcombe: "Newcombe/Wilson",
  asymptotic_cc: "Asymptotic with continuity correction",
};
export const RR_CI_LABELS: Record<RRCI, string> = {
  koopman: "Koopman asymptotic score",
  katz: "Katz (log method)",
};
export const OR_CI_LABELS: Record<ORCI, string> = {
  baptista_pike: "Baptista-Pike",
  baptista_pike_midp: "Baptista-Pike, mid-P",
  woolf: "Woolf (logit)",
};

export interface ContingencyOptions {
  /** 2 × 2: relative risk, difference, odds ratio, NNT, diagnostic
   *  measures and likelihood ratios with chosen CI methods; larger
   *  tables: Cramér's V. */
  effectSizes: boolean;
  rrCi: RRCI;
  diffCi: DiffCI;
  orCi: ORCI;
  propCi: PropCI;
  /** Rows are the condition (diseased / healthy) or the test result. */
  diagnosticLayout: "rows_condition" | "rows_test";
  /** Chi-square test for trend (rows, or columns, in a natural order). */
  trend: boolean;
  /** Scores of the ordered groups, comma-separated ("" = 1, 2, 3, ...). */
  trendScores: string;
  /** Fisher's exact test for tables larger than 2 × 2 (Freeman-Halton):
   *  "auto" within the engine's quick work budget, "large" with the
   *  larger budget (up to ~10 s). */
  fisherRxc: "auto" | "large";
}

export const DEFAULT_CONTINGENCY: ContingencyOptions = {
  effectSizes: false,
  rrCi: "koopman", diffCi: "newcombe_cc", orCi: "baptista_pike", propCi: "wilson_brown",
  diagnosticLayout: "rows_condition",
  trend: false, trendScores: "",
  fisherRxc: "auto",
};

export function normalizeContingency(raw: unknown): ContingencyOptions {
  const o = { ...DEFAULT_CONTINGENCY, ...(raw && typeof raw === "object" ? raw as Partial<ContingencyOptions> : {}) };
  if (o.fisherRxc !== "large") o.fisherRxc = "auto";
  return o;
}

export interface Counts {
  counts: number[][];
  rowTitles: string[];
  colTitles: string[];
}

/** The counts, or an error when a cell is not a non-negative number. */
export function readCounts(table: DataTableModel): Counts | { error: string } {
  const t = withExclusionsBlanked(table);
  const counts = t.x.map((_, r) =>
    t.datasets.map((d) => Number((d.rows[r]?.[0] ?? "").trim() || "0")));
  if (counts.some((row) => row.some((v) => !Number.isFinite(v) || v < 0))) {
    return { error: "Enter counts as whole, non-negative numbers" };
  }
  return {
    counts,
    rowTitles: t.x.map((_, r) => (t.rowTitles?.[r] ?? "").trim() || `Row ${r + 1}`),
    colTitles: t.datasets.map((d, i) => d.name.trim() || `Column ${i + 1}`),
  };
}

const parseList = (s: string) => s.split(/[\s,;]+/).filter(Boolean).map(Number);

export type Payload = { analysis: string; data: Record<string, unknown>; options: Record<string, unknown> };

/** The main contingency analysis. Default options send exactly what the
 *  original analysis sent ({}). */
export function contingencyPayload(c: Counts, o: ContingencyOptions): Payload | { error: string } {
  const options: Record<string, unknown> = {};
  if (o.effectSizes) {
    Object.assign(options, {
      effect_sizes: true, rr_ci: o.rrCi, diff_ci: o.diffCi, or_ci: o.orCi,
      proportion_ci: o.propCi, diagnostic_layout: o.diagnosticLayout,
    });
  }
  if (o.trend && trendApplies(c.counts)) {
    options.trend = true;
    const k = c.counts[0]?.length === 2 && c.counts.length >= 3 ? c.counts.length : c.counts[0]?.length ?? 0;
    const scores = parseList(o.trendScores);
    if (o.trendScores.trim()) {
      if (scores.length !== k || scores.some((v) => !Number.isFinite(v))) {
        return { error: `Enter ${k} scores for the test for trend (one per ordered group), or leave them blank for 1, 2, 3, …` };
      }
      options.scores = scores;
    }
  }
  const r = c.counts.length, k = c.counts[0]?.length ?? 0;
  if (o.fisherRxc === "large" && (r > 2 || k > 2)) options.fisher_rxc = true;
  return { analysis: "contingency", data: { table: c.counts }, options };
}

/** The test for trend needs two columns and three or more rows (or the
 *  transpose). */
export function trendApplies(counts: number[][]): boolean {
  const r = counts.length, k = counts[0]?.length ?? 0;
  return (k === 2 && r >= 3) || (r === 2 && k >= 3);
}

// ------------------------------------------------------------ McNemar

export function mcnemarPayload(c: Counts): Payload | { error: string } {
  const r = c.counts.length, k = c.counts[0]?.length ?? 0;
  if (r !== k || r < 2) {
    return { error: "Paired (matched) data need a square table: the same outcomes as rows "
      + "and as columns (2 × 2 for McNemar's test, larger for Bowker's test of symmetry)" };
  }
  return { analysis: "mcnemar", data: { table: c.counts }, options: {} };
}

// ------------------------------------------------------------ CMH

export interface Stratum { name: string; table: number[][]; rows: string[] }

const SEP = /\s*[:|/–—-]\s*|\s*,\s*/;

/** Text before the first separator of a row title ("Site A: exposed" ->
 *  "Site A"), or "" when there is none. */
export function titlePrefix(title: string): string {
  const t = title.trim();
  const p = t.split(SEP)[0]?.trim() ?? "";
  return p && p !== t ? p : "";
}

/** Name shared by the two row titles of a stratum. */
export function stratumName(a: string, b: string, index: number): string {
  const pa = titlePrefix(a);
  if (pa && pa === titlePrefix(b)) return pa;
  return `Stratum ${index + 1}`;
}

/** Strata named by their row titles: every title starts with the stratum
 *  and a separator ("Site A: exposed"), the rows of a stratum are
 *  consecutive and every stratum has the same number of rows (two or
 *  more). Null when the titles do not say so. */
function strataByTitle(c: Counts): Stratum[] | null {
  const prefixes = c.rowTitles.map(titlePrefix);
  if (prefixes.some((p) => !p)) return null;
  const blocks: { name: string; from: number; to: number }[] = [];
  prefixes.forEach((p, i) => {
    const last = blocks[blocks.length - 1];
    if (last && last.name === p) last.to = i + 1;
    else blocks.push({ name: p, from: i, to: i + 1 });
  });
  const size = blocks[0].to - blocks[0].from;
  if (blocks.length < 2 || size < 2 || blocks.some((b) => b.to - b.from !== size)) return null;
  if (new Set(blocks.map((b) => b.name)).size !== blocks.length) return null;
  return blocks.map((b) => ({
    name: b.name,
    table: c.counts.slice(b.from, b.to),
    rows: c.rowTitles.slice(b.from, b.to),
  }));
}

/** The strata of a stratified table: consecutive blocks of rows named by
 *  their titles ("Stratum: level", any number of rows and columns per
 *  stratum, the same in every stratum), else consecutive pairs of rows
 *  of a two-column table (rows 1-2 are stratum 1, ...). */
export function strataOf(c: Counts): Stratum[] | { error: string } {
  const named = strataByTitle(c);
  if (named) return named;
  if ((c.counts[0]?.length ?? 0) !== 2 || c.counts.length < 4 || c.counts.length % 2) {
    return { error: "Enter stratified tables as consecutive rows per stratum, each row title "
      + "starting with its stratum and a colon (“Site A: exposed”, “Site A: not exposed”), "
      + "or as a two-column table with two rows per stratum: rows 1-2 are the first stratum, rows 3-4 the second, …" };
  }
  const out: Stratum[] = [];
  for (let i = 0; i < c.counts.length; i += 2) {
    out.push({
      name: stratumName(c.rowTitles[i], c.rowTitles[i + 1], i / 2),
      table: [c.counts[i], c.counts[i + 1]],
      rows: [c.rowTitles[i], c.rowTitles[i + 1]],
    });
  }
  return out;
}

/** Rows and columns of each stratum ("2 × 2", "3 × 4"). */
export function stratumShape(s: Stratum[]): string {
  return `${s[0]?.table.length ?? 0} × ${s[0]?.table[0]?.length ?? 0}`;
}

export interface CmhOptions { correction: boolean }
export const DEFAULT_CMH: CmhOptions = { correction: false };

export function cmhPayload(c: Counts, o: CmhOptions): Payload | { error: string } {
  const s = strataOf(c);
  if ("error" in s) return s;
  return { analysis: "cmh",
    data: { tables: s.map((x) => x.table), strata_names: s.map((x) => x.name) },
    options: { correction: o.correction } };
}

// ------------------------------------------------------------ kappa

export interface KappaOptions { weights: "none" | "linear" | "quadratic" }
export const DEFAULT_KAPPA: KappaOptions = { weights: "none" };

export function kappaPayload(c: Counts, o: KappaOptions): Payload | { error: string } {
  const r = c.counts.length, k = c.counts[0]?.length ?? 0;
  if (r !== k || r < 2) {
    return { error: "Agreement needs a square table: the categories of rater 1 as rows and "
      + "the same categories of rater 2 as columns" };
  }
  return { analysis: "kappa", data: { table: c.counts },
    options: { weights: o.weights === "none" ? null : o.weights } };
}

// ------------------------------------------------------------ proportions

export interface ProportionOptions {
  mode: "one" | "two";
  rowA: number;
  rowB: number;
  /** Hypothetical proportion for the one-proportion binomial test. */
  p0: string;
  ciMethod: PropCI;
  diffCi: DiffCI;
  rrCi: RRCI;
  orCi: ORCI;
}

export const DEFAULT_PROPORTIONS: ProportionOptions = {
  mode: "two", rowA: 0, rowB: 1, p0: "", ciMethod: "wilson_brown",
  diffCi: "newcombe_cc", rrCi: "koopman", orCi: "baptista_pike",
};

export function proportionPayload(c: Counts, o: ProportionOptions): Payload | { error: string } {
  if ((c.counts[0]?.length ?? 0) !== 2) {
    return { error: "Enter each group as one row with two columns: the number with the "
      + "outcome (successes) and the number without it" };
  }
  const group = (r: number) => {
    const row = c.counts[r];
    if (!row) return null;
    return { name: c.rowTitles[r], successes: row[0], trials: row[0] + row[1] };
  };
  const a = group(o.rowA);
  if (!a) return { error: "Choose a row" };
  const common = { ci_method: o.ciMethod };
  if (o.mode === "one") {
    const p0 = o.p0.trim() === "" ? null : Number(o.p0);
    if (p0 !== null && !(p0 > 0 && p0 < 1)) {
      return { error: "The hypothetical proportion must be between 0 and 1" };
    }
    return { analysis: "proportion_test", data: { groups: [a] },
      options: { ...common, ...(p0 !== null ? { p0 } : {}) } };
  }
  const b = group(o.rowB);
  if (!b || o.rowA === o.rowB) return { error: "Choose two different rows to compare" };
  return { analysis: "proportion_test", data: { groups: [a, b] },
    options: { ...common, diff_ci: o.diffCi, rr_ci: o.rrCi, or_ci: o.orCi } };
}
