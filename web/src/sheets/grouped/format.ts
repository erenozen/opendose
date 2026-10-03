// Number formatting shared by the grouped results sheets.
import { formatSig } from "../../types";

export function fmtP(p: unknown): string {
  if (typeof p !== "number" || !Number.isFinite(p)) return "n/a";
  if (p < 0.0001) return "< 0.0001";
  return formatSig(p, 4);
}

export function stars(p: unknown): string {
  if (typeof p !== "number") return "";
  if (p < 0.0001) return "****";
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "ns";
}

export const fmtCI = (ci: unknown) => (Array.isArray(ci) && ci.length === 2
  ? `${formatSig(ci[0])} to ${formatSig(ci[1])}` : "n/a");

