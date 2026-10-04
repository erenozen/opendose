// Number formatting shared by the grouped results sheets.
import { formatSig } from "../../types";
import { tableP, tableStars } from "../../report/pformat";

export { pLabel } from "../../report/pformat";

/** P and asterisks in the project's P-value style (src/report/pformat.ts). */
export function fmtP(p: unknown): string {
  return tableP(p);
}

export function stars(p: unknown): string {
  return tableStars(p);
}

export const fmtCI = (ci: unknown) => (Array.isArray(ci) && ci.length === 2
  ? `${formatSig(ci[0])} to ${formatSig(ci[1])}` : "n/a");

