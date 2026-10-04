// Number formatting shared by results sheets: P values, significance
// summaries, confidence intervals. formatSig follows the results-precision
// preference.
import { formatSig } from "../../types";
import { tableP, tableStars } from "../../report/pformat";

export { pLabel } from "../../report/pformat";

/** P in the project's P-value style (src/report/pformat.ts). */
export function fmtP(p: unknown): string {
  return tableP(p);
}

/** Significance summary in the project's asterisk scale. */
export function stars(p: unknown): string {
  return tableStars(p);
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
