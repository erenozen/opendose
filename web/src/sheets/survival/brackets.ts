// Log-rank brackets on the Kaplan-Meier graph (P-111): the pairs the
// survival analysis compared (engine survival_pairwise, P adjusted as its
// correction says; with two groups, the log-rank test itself), drawn in
// the right margin beside the curves' ends (graph/marginBrackets.ts). The
// family and its correction are stated in the dialog and the legend. Pure.
import type { ComparisonSet } from "../../graph/results.ts";
import type { Comparison } from "../../graph/significance.ts";
import { adjustedHeader } from "./extras.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export function survivalComparisons(result: unknown): ComparisonSet | null {
  const r = result as R | null;
  if (!r || r.error || !r.curves) return null;
  const names = Object.keys(r.curves);
  const pw = r.extras?.pairwise;
  if (pw && !pw.error && Array.isArray(pw.comparisons) && pw.comparisons.length) {
    const out: Comparison[] = [];
    let unmatched = 0;
    for (const c of pw.comparisons as R[]) {
      const p = c.p_adjusted ?? c.p_unadjusted;
      if (!names.includes(c.a) || !names.includes(c.b) || typeof p !== "number") { unmatched++; continue; }
      out.push({ a: String(c.a), b: String(c.b), p });
    }
    const k = typeof pw.family_size === "number" ? pw.family_size : pw.comparisons.length;
    const fam = String(pw.family?.label ?? "").startsWith("each group")
      ? `each group against ${pw.comparisons[0]?.a} (control)` : "every pair of groups";
    return { label: `Pairwise log-rank tests, ${fam}, P ${adjustedHeader(k, String(pw.correction))}`,
      comparisons: out, unmatched, letters: false, margin: true };
  }
  const p = r.logrank?.p;
  if (names.length === 2 && typeof p === "number" && Number.isFinite(p)) {
    return { label: "Log-rank (Mantel-Cox) test", comparisons: [{ a: names[0], b: names[1], p }],
      unmatched: 0, letters: false, margin: true };
  }
  return null;
}

/** The legend clause of the brackets ("" when none are drawn). */
export function survivalBracketClause(result: unknown): string {
  const set = survivalComparisons(result);
  if (!set || !set.comparisons.length) return "";
  return `Brackets at the right join the ends of the curves compared (${set.label})`;
}
