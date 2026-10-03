// Read what the graph layer needs out of engine results and tables:
// pairwise comparisons (for brackets and letters), short text blocks (for
// "add results to graph") and survival risk sets (for the number-at-risk
// table). Pure; tolerant of missing fields.
import type { ResultsBlock } from "./format.ts";
import { formatP, splitPair, type Comparison } from "./significance.ts";
import { shortNumber } from "./axes.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export interface ComparisonSet {
  /** Shown in the dialog: "Tukey multiple comparisons", "Unpaired t test". */
  label: string;
  comparisons: Comparison[];
  /** Comparisons that could not be matched to plotted groups. */
  unmatched: number;
}

const METHOD_LABELS: Record<string, string> = {
  tukey: "Tukey", dunnett: "Dunnett", bonferroni: "Bonferroni", sidak: "Šídák",
  holm_sidak: "Holm-Šídák", dunns: "Dunn's",
};

function fromTable(mc: Any, names: string[], label: string): ComparisonSet | null {
  if (!mc || !Array.isArray(mc.comparisons)) return null;
  const out: Comparison[] = [];
  let unmatched = 0;
  for (const c of mc.comparisons) {
    const p = c?.p_adjusted ?? c?.p;
    const pair = typeof c?.pair === "string" ? splitPair(c.pair, names) : null;
    if (!pair || typeof p !== "number") { unmatched++; continue; }
    // Main-effect families compare the plotted groups themselves; other
    // families (within one row of a two-way design) belong on grouped
    // graphs, where the plot supplies a position for each family.
    const fam = typeof c.family === "string" && c.family !== "Column main effect"
      ? c.family : undefined;
    out.push({ a: pair[0], b: pair[1], p, ...(fam ? { family: fam } : {}) });
  }
  const m = METHOD_LABELS[String(mc.method)] ?? String(mc.method ?? "");
  return { label: `${m ? `${m} ` : ""}${label}`.trim(), comparisons: out, unmatched };
}

/**
 * Every pairwise comparison a result offers, for groups named `names`
 * (dataset names as entered). Handles one-way ANOVA post tests, Kruskal-
 * Wallis / Friedman with Dunn's test, two-way ANOVA comparisons, repeated
 * measures and nested/mixed models that report `multiple_comparisons`,
 * and two-group tests (t tests, Mann-Whitney, Wilcoxon).
 */
export function extractComparisons(result: unknown, names: string[]): ComparisonSet | null {
  const r = result as Any;
  if (!r || typeof r !== "object" || r.error) return null;
  if (r.multiple_comparisons) {
    return fromTable(r.multiple_comparisons, names, "multiple comparisons");
  }
  if (r.dunns) return fromTable(r.dunns, names, "multiple comparisons");
  if (Array.isArray(r.comparisons)) return fromTable(r, names, "multiple comparisons");
  const p2 = twoGroupP(r);
  if (r.analysis === "ttest" && Array.isArray(r.names) && p2 !== null) {
    const [a, b] = r.names as string[];
    if (!names.includes(a) || !names.includes(b)) return null;
    return { label: TEST_LABELS[String(r.test)] ?? "Two-group test",
      comparisons: [{ a, b, p: p2 }], unmatched: 0 };
  }
  return null;
}

const TEST_LABELS: Record<string, string> = {
  unpaired_t: "Unpaired t test", welch_t: "Welch's t test", paired_t: "Paired t test",
  mann_whitney: "Mann-Whitney test", wilcoxon_matched_pairs: "Wilcoxon matched-pairs test",
};

/** Two-tailed P of a two-group test (engine key `p_two_tailed`). */
function twoGroupP(r: Any): number | null {
  const p = r?.p_two_tailed ?? r?.p;
  return typeof p === "number" && Number.isFinite(p) ? p : null;
}

const fmt = (v: unknown) => (typeof v === "number" && Number.isFinite(v)
  ? shortNumber(v) : "n/a");

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Overall P value line(s) of a result, or "" when it has none. */
function pvalueBlock(r: Any): string {
  if (r.analysis === "ttest" && twoGroupP(r) !== null) {
    return `${TEST_LABELS[String(r.test)] ?? "Two-group test"}: ${formatP(twoGroupP(r)!)}`;
  }
  if (r.analysis === "anova") {
    if (r.kind === "nonparametric") return `Kruskal-Wallis ${formatP(r.p)}`;
    if (r.table?.p != null) return `One-way ANOVA ${formatP(r.table.p)}`;
  }
  if (r.table?.p_geisser_greenhouse != null) {
    return `RM ANOVA ${formatP(r.table.p_geisser_greenhouse)}`;
  }
  if (r.sources && typeof r.sources === "object") {
    return Object.entries(r.sources as Record<string, Any>)
      .filter(([, s]) => typeof s?.p === "number")
      .map(([name, s]) => `${esc(name)}: ${formatP(s.p)}`).join("<br>");
  }
  if (r.logrank?.p != null) return `Log-rank ${formatP(r.logrank.p)}`;
  if (typeof r.p === "number") return formatP(r.p);
  return "";
}

/** Best-fit parameters (curve fits) or group summaries, as text. */
function paramsBlock(r: Any): string {
  if (Array.isArray(r.datasets) && r.datasets.some((d: Any) => d?.fit)) {
    return r.datasets.filter((d: Any) => d?.fit).map((d: Any) => {
      const f = d.fit;
      const order: string[] = f.param_order ?? Object.keys(f.params ?? {});
      const lines = order.filter((k) => f.params?.[k])
        .map((k) => `${esc(k)} = ${fmt(f.params[k].value)}`);
      if (f.goodness?.r_squared != null) lines.push(`R² = ${fmt(f.goodness.r_squared)}`);
      return `<b>${esc(String(d.name ?? ""))}</b><br>${lines.join("<br>")}`;
    }).join("<br><br>");
  }
  if (r.curves && typeof r.curves === "object") {
    return Object.entries(r.curves as Record<string, Any>).map(([name, c]) =>
      `${esc(name)}: median ${c?.median_survival != null ? fmt(c.median_survival)
        : "not reached"}`).join("<br>");
  }
  if (Array.isArray(r.group_summaries)) {
    return r.group_summaries.map((g: Any) =>
      `${esc(String(g.name))}: ${g.mean != null ? `mean ${fmt(g.mean)}` : `median ${fmt(g.median)}`}`)
      .join("<br>");
  }
  return "";
}

function equationBlock(r: Any): string {
  if (Array.isArray(r.datasets)) {
    const f = r.datasets.find((d: Any) => d?.fit?.equation)?.fit;
    if (f) return esc(String(f.equation));
  }
  return "";
}

/** The text blocks "Add results to graph" can embed; empty strings when a
 *  result has no such block. Plotly label markup (<b>, <br>) is used. */
export function resultBlocks(result: unknown): Partial<Record<ResultsBlock, string>> {
  const r = result as Any;
  if (!r || typeof r !== "object" || r.error) return {};
  const out: Partial<Record<ResultsBlock, string>> = {};
  const p = pvalueBlock(r); if (p) out.pvalue = p;
  const params = paramsBlock(r); if (params) out.params = params;
  const eq = equationBlock(r); if (eq) out.equation = eq;
  return out;
}

// --------------------------------------------------------- number at risk

export interface RiskSet {
  name: string;
  /** Follow-up time of each subject. */
  times: number[];
  /** 1 = event, 0 = censored, aligned with `times`. */
  events: number[];
}

/** Subjects still followed at time t (follow-up time ≥ t). */
export function atRisk(set: RiskSet, t: number): number {
  return set.times.reduce((n, v) => n + (v >= t ? 1 : 0), 0);
}

/** Subjects censored at or before time t. */
export function censoredBy(set: RiskSet, t: number): number {
  let n = 0;
  set.times.forEach((v, i) => { if (v <= t && set.events[i] === 0) n++; });
  return n;
}

/** Risk sets from a survival table: each dataset is a group, Y1 = time,
 *  Y2 = event code (rows missing either are skipped, as the analysis does). */
export function riskSetsFromTable(datasets: { name: string; rows: string[][] }[]): RiskSet[] {
  const out: RiskSet[] = [];
  for (const d of datasets) {
    const times: number[] = [], events: number[] = [];
    for (const row of d.rows) {
      const t = Number((row[0] ?? "").trim()), e = Number((row[1] ?? "").trim());
      if ((row[0] ?? "").trim() === "" || (row[1] ?? "").trim() === "") continue;
      if (!Number.isFinite(t) || !Number.isFinite(e)) continue;
      times.push(t); events.push(e === 0 ? 0 : 1);
    }
    if (times.length) out.push({ name: d.name, times, events });
  }
  return out;
}

/**
 * Fallback when only the Kaplan-Meier result is at hand: rebuild
 * approximate risk sets from each curve's step points (`at_risk` after
 * each event time). Subjects censored between event times are placed at
 * the next event time, so counts between events can be slightly high.
 */
export function riskSetsFromResult(result: unknown): RiskSet[] {
  const curves = (result as Any)?.curves;
  if (!curves || typeof curves !== "object") return [];
  const out: RiskSet[] = [];
  for (const [name, c] of Object.entries(curves as Record<string, Any>)) {
    const pts = Array.isArray(c?.points) ? c.points : [];
    if (!pts.length) continue;
    const times: number[] = [], events: number[] = [];
    let prev = Number(pts[0].at_risk) || 0;
    for (const p of pts.slice(1)) {
      const left = Math.max(0, prev - (Number(p.at_risk) || 0));
      for (let k = 0; k < left; k++) { times.push(Number(p.time)); events.push(1); }
      prev = Number(p.at_risk) || 0;
    }
    const lastT = pts.length ? Number(pts[pts.length - 1].time) : 0;
    for (let k = 0; k < prev; k++) { times.push(lastT); events.push(0); }
    out.push({ name, times, events });
  }
  return out;
}
