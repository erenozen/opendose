// One definition of a box plot, shared by the column and grouped box
// graphs: quartiles from the percentile method the column statistics use
// (so a box agrees with the statistics table) and whiskers from a stated
// rule. Plotly draws the box from these numbers (q1, median, q3,
// lowerfence, upperfence); it never computes its own. Pure.
//
// Percentile methods (Hyndman & Fan 1996, Am Stat 50:361):
//   "linear": definition 7, h = (n - 1) p, numpy's default, R's
//             quantile(type = 7), Excel PERCENTILE.INC; the column
//             statistics' default.
//   "prism":  definition 6, rank R = p (n + 1), the smallest (largest)
//             value when R < 1 (R > n), R's quantile(type = 6); the rule
//             the GraphPad guide documents ("Interpreting results:
//             Quartiles and the interquartile range") and the engine's
//             columnstats.percentile(method="prism").
// Whisker rules: Tukey (1977, Exploratory Data Analysis) draws each
// whisker to the most extreme value within 1.5 × IQR of the box; the
// others end at the minimum and maximum or at a pair of percentiles.

import type { GraphSheet, Sheet } from "../project/types.ts";

export type PercentileMethod = "linear" | "prism";

export type WhiskerRule = "tukey" | "minmax" | "p10_90" | "p5_95" | "p2_5_97_5";

export const WHISKER_RULES: readonly (readonly [WhiskerRule, string])[] = [
  ["tukey", "Tukey (1.5 × IQR)"],
  ["minmax", "Minimum to maximum"],
  ["p10_90", "10th to 90th percentile"],
  ["p5_95", "5th to 95th percentile"],
  ["p2_5_97_5", "2.5th to 97.5th percentile"],
];

/** The note under the whisker control: what the box is, and the source
 *  of the Tukey rule. */
export const WHISKER_NOTE = "Box: median and quartiles, as the column statistics compute them. "
  + "Tukey whiskers end at the most extreme values within 1.5 × IQR of the box "
  + "(Tukey 1977, Exploratory Data Analysis); every value is drawn as a point.";

/** The rule every box graph uses unless its settings say otherwise. */
export const DEFAULT_WHISKERS: WhiskerRule = "tukey";

export function readWhiskers(v: unknown): WhiskerRule {
  return WHISKER_RULES.some(([k]) => k === v) ? v as WhiskerRule : DEFAULT_WHISKERS;
}

/** Percentile `pct` (0 to 100) of ascending finite values, by method.
 *  Bit-identical to numpy.percentile(method="linear") and to the
 *  engine's columnstats.percentile(method="prism"). Null when empty. */
export function percentileOf(sorted: readonly number[], pct: number,
  method: PercentileMethod): number | null {
  const n = sorted.length;
  if (!n) return null;
  if (method === "prism") {
    const r = pct * (n + 1) / 100;
    if (r <= 1) return sorted[0];
    if (r >= n) return sorted[n - 1];
    const lo = Math.floor(r);
    const frac = r - lo;
    return sorted[lo - 1] + frac * (sorted[lo] - sorted[lo - 1]);
  }
  const h = (n - 1) * pct / 100;
  const k = Math.floor(h);
  if (k >= n - 1) return sorted[n - 1];
  const a = sorted[k], b = sorted[k + 1], t = h - k;
  // numpy's _lerp: from the nearer end, so t = 1 returns b exactly
  return t >= 0.5 ? b - (b - a) * (1 - t) : a + (b - a) * t;
}

export interface BoxStats {
  n: number;
  q1: number;
  median: number;
  q3: number;
  /** Where the whiskers end. */
  lowerfence: number;
  upperfence: number;
}

const PCT: Record<Exclude<WhiskerRule, "tukey" | "minmax">, [number, number]> = {
  p10_90: [10, 90], p5_95: [5, 95], p2_5_97_5: [2.5, 97.5],
};

/** Quartiles and whisker ends of the finite values (null when none). */
export function boxStats(values: readonly number[], method: PercentileMethod,
  rule: WhiskerRule): BoxStats | null {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const n = s.length;
  if (!n) return null;
  const q = (p: number) => percentileOf(s, p, method)!;
  const q1 = q(25), median = q(50), q3 = q(75);
  let lowerfence = s[0], upperfence = s[n - 1];
  if (rule === "tukey") {
    const lo = q1 - 1.5 * (q3 - q1), hi = q3 + 1.5 * (q3 - q1);
    lowerfence = s.find((v) => v >= lo) ?? q1;
    upperfence = s.findLast((v) => v <= hi) ?? q3;
  } else if (rule !== "minmax") {
    const [a, b] = PCT[rule];
    lowerfence = Math.min(q(a), q1);
    upperfence = Math.max(q(b), q3);
  }
  return { n, q1, median, q3, lowerfence, upperfence };
}

const methodOf = (o: unknown): PercentileMethod | null => {
  const r = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
  if (r.analysis !== "column_statistics") return null;
  return r.percentileMethod === "prism" ? "prism" : "linear";
};

/** The percentile method of the column statistics on the graph's data:
 *  the bound results (`boundOptions`, which frozen graphs keep in their
 *  snapshot) when they are column statistics, else the first column
 *  statistics sheet of the same table; "linear" (the column statistics'
 *  default, and the only method of grouped column statistics) when there
 *  is none. */
export function boxPercentileMethod(graph: Pick<GraphSheet, "parentId">,
  sheets: readonly Sheet[], boundOptions?: unknown): PercentileMethod {
  const bound = methodOf(boundOptions);
  if (bound) return bound;
  for (const s of sheets) {
    if (s.kind !== "results" || s.parentId !== graph.parentId) continue;
    const m = methodOf(s.options);
    if (m) return m;
  }
  return "linear";
}
