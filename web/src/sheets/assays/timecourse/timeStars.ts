// The time-course model's comparisons of the groups at each time point,
// for stars on its graph of group means (P-105, graph/timeStars.ts). The
// P values are the model's own (group_difference_at_time, adjusted as the
// analysis says); the curves are compared by the model's Group and
// Group × Time tests, which the legend points to. Pure.
import type { ComparisonSet } from "../../../graph/results.ts";
import type { Comparison } from "../../../graph/significance.ts";
import { adjustedText, splitPairOf } from "../../common/mixedModel.ts";
import { numericTimes } from "./model.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export const TC_CURVE_TEST = "the mixed model's Group × Time test asks whether the curves differ "
  + "in shape, and its Group test whether they differ overall";

/** The comparisons at each time point, family = the engine's ("Time 7"). */
export function tcComparisons(result: unknown): ComparisonSet | null {
  const r = result as R | null;
  const block = r?.group_difference_at_time;
  if (!r || r.error || !block || !Array.isArray(block.comparisons)) return null;
  const groups = Array.isArray(r.groups) ? (r.groups as unknown[]).map(String) : [];
  const out: Comparison[] = [];
  let unmatched = 0;
  for (const c of block.comparisons as R[]) {
    const p = c.p_adjusted ?? c.p_unadjusted;
    const pair = typeof c.pair === "string" ? splitPairOf(c.pair, groups) : null;
    if (!pair || typeof p !== "number" || typeof c.family !== "string") { unmatched++; continue; }
    out.push({ a: pair[0], b: pair[1], p, family: c.family });
  }
  if (!out.length) return null;
  return { label: `Groups compared at each time point, P ${adjustedText(block)}`, comparisons: out,
    unmatched, letters: false, timePoints: true, curveTest: TC_CURVE_TEST };
}

/** Where each time point (family) sits on the graph's X axis: the time
 *  itself when every time is a number, else its position on the category
 *  axis. */
export function tcFamilyX(result: unknown): Map<string, number> {
  const r = result as R | null;
  const out = new Map<string, number>();
  const times = Array.isArray(r?.times) ? (r!.times as unknown[]).map(String) : [];
  const num = numericTimes(times);
  for (const c of (r?.group_difference_at_time?.comparisons ?? []) as R[]) {
    if (typeof c.family !== "string" || out.has(c.family)) continue;
    const i = times.indexOf(String(c.time));
    if (i >= 0) out.set(c.family, num ? num[i] : i);
  }
  return out;
}
