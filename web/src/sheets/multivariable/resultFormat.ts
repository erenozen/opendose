// Number and text formatting shared by the multiple-variables results
// sheets (results.tsx, ancovaPanels.tsx, glmPanels.tsx). Pure.
import { formatSig } from "../../types.ts";
import { tableP, tableStars } from "../../report/pformat.ts";

export const f = (v: number | null | undefined, sig?: number) => formatSig(v ?? null, sig);

/** P and asterisks in the project's P-value style (src/report/pformat.ts). */
export function fmtP(p: number | null | undefined): string {
  return tableP(p);
}

export function summaryStars(p: number | null | undefined): string {
  // P ≤ 0.05 *, ≤ 0.01 **, ≤ 0.001 ***, ≤ 0.0001 ****, as on graph brackets.
  return tableStars(p);
}

export const lvl = (level: number) => `${formatSig(level * 100, 3)}%`;
export const ci = (c: [number | null, number | null] | undefined | null) =>
  c ? `${c[0] === null ? "n/a" : f(c[0])} to ${c[1] === null ? "n/a" : f(c[1])}` : "n/a";

export const TOOL = "OpenDose (open-source, built on SciPy)";
export const list = (xs: string[]) => (xs.length <= 1 ? xs.join("")
  : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
