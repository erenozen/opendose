// Number formatting shared by results sheets: P values, significance
// summaries, confidence intervals. formatSig follows the results-precision
// preference.
import { formatSig } from "../../types";
import { pStars } from "../../graph/significance";

export function fmtP(p: unknown): string {
  if (typeof p !== "number" || !Number.isFinite(p)) return "n/a";
  return p < 0.0001 ? "< 0.0001" : formatSig(p, 4);
}

/** Significance summary in the usual asterisk notation. */
export function stars(p: unknown): string {
  // P ≤ 0.05 *, ≤ 0.01 **, ≤ 0.001 ***, ≤ 0.0001 ****, as on graph brackets.
  return typeof p === "number" && Number.isFinite(p) ? pStars(p) : "";
}

export function fmtCI(ci: unknown): string {
  if (!Array.isArray(ci) || ci.length !== 2
    || typeof ci[0] !== "number" || typeof ci[1] !== "number") return "n/a";
  return `${formatSig(ci[0])} to ${formatSig(ci[1])}`;
}

/** "95%" from 0.95. */
export function levelPct(level: number): string {
  return `${Number((level * 100).toPrecision(4))}%`;
}

export { formatSig };
