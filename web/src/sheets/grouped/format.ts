// Number formatting shared by the grouped results sheets.
import { formatSig } from "../../types";
import { pStars } from "../../graph/significance";

export function fmtP(p: unknown): string {
  if (typeof p !== "number" || !Number.isFinite(p)) return "n/a";
  if (p < 0.0001) return "< 0.0001";
  return formatSig(p, 4);
}

export function stars(p: unknown): string {
  // P ≤ 0.05 *, ≤ 0.01 **, ≤ 0.001 ***, ≤ 0.0001 ****, as on graph brackets.
  return typeof p === "number" && Number.isFinite(p) ? pStars(p) : "";
}

export const fmtCI = (ci: unknown) => (Array.isArray(ci) && ci.length === 2
  ? `${formatSig(ci[0])} to ${formatSig(ci[1])}` : "n/a");

