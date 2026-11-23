// The LoD95 sentence of the qPCR methods (engine assay_qpcr.lod95_by_target).
// Pure, unit-tested.
import { interval, num } from "../kit/format.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** "" without a hit-rate series. */
export function lodMethods(lod: Record<string, any> | undefined, level: string): string {
  const rows = Object.entries(lod ?? {});
  if (!rows.length) return "";
  const each = rows.map(([t, r]) => (r.lod95 != null
    ? `${t} ${num(r.lod95)}${r.ci ? ` (${level} CI ${interval(r.ci)})` : ""}${r.note ? `; ${r.note}` : ""}`
    : `${t} not estimated (${r.note})`));
  return `The limit of detection (LoD95, the quantity detected in 95% of wells) was estimated from the hit rate `
    + `of the dilution series by probit regression on log10 quantity with Fieller's confidence interval `
    + `(Forootan et al. 2017): ${each.join("; ")}. `;
}
