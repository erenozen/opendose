// Planning a dose series in "Plan an experiment…" (FEATURE-PLAN P-97):
// the form, the engine payload (handler "dose_plan",
// engine/opendose/doseplan.py) and the sentences that report it. Every
// value the form holds is an assumption about the experiment not yet run
// (IC50, Hill slope, plateaus, SD); the engine computes every number.
// Pure (no React), unit-tested in __tests__/doseSeries.test.ts.
import { formatSig } from "../types.ts";

export interface DoseForm {
  ic50: string;
  unit: string;
  /** Hill slope as a magnitude; the direction comes from the design. */
  hill: string;
  top: string;
  bottom: string;
  sd: string;
  replicates: string;
  topDose: string;
  nDoses: string;
  /** Dilution factor between neighbouring concentrations. */
  dilution: string;
}

export function defaultDoseForm(): DoseForm {
  return { ic50: "1", unit: "µM", hill: "1", top: "100", bottom: "0", sd: "5", replicates: "3",
    topDose: "56.2", nDoses: "8", dilution: "3.162" };
}

/** Dilution factors offered as presets (half-log is √10). */
export const DILUTIONS: readonly (readonly [string, string])[] = [
  ["3.162", "Half-log (× 3.162)"], ["10", "Log (× 10)"], ["2", "Twofold (× 2)"], ["3", "Threefold (× 3)"],
];

const num = (s: string): number | null => {
  const t = String(s).trim().replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

export type DoseOptions = Record<string, number>;

/** Engine options for the plan, or the first input problem. `rising`:
 *  the response rises with dose (agonist), so the Hill slope is positive. */
export function doseOptions(f: DoseForm, rising: boolean): { options: DoseOptions } | { error: string } {
  const need = (label: string, v: number | null, ok: (x: number) => boolean, what: string) => {
    if (v === null || !ok(v)) throw new Error(`${label}: ${what}.`);
    return v;
  };
  try {
    const ic50 = need("Expected IC50", num(f.ic50), (x) => x > 0, "enter a concentration above 0");
    const h = need("Hill slope", num(f.hill), (x) => x !== 0, "enter a number other than 0 (usually about 1)");
    const top = need("Top plateau", num(f.top), Number.isFinite, "enter a number");
    const bottom = need("Bottom plateau", num(f.bottom), (x) => x !== top, "enter a number different from the top");
    const sd = need("SD of one well", num(f.sd), (x) => x > 0, "enter a number above 0");
    const replicates = need("Replicates", num(f.replicates), (x) => Number.isInteger(x) && x >= 1 && x <= 24,
      "enter a whole number from 1 to 24");
    const topDose = need("Highest concentration", num(f.topDose), (x) => x > 0, "enter a concentration above 0");
    const nDoses = need("Concentrations", num(f.nDoses), (x) => Number.isInteger(x) && x >= 2 && x <= 48,
      "enter a whole number from 2 to 48");
    const dilution = need("Dilution factor", num(f.dilution), (x) => x > 1, "enter a factor above 1 (3.162 for half-log)");
    return { options: { ic50, hill: (rising ? 1 : -1) * Math.abs(h), top: Math.max(top, bottom),
      bottom: Math.min(top, bottom), sd, replicates, top_dose: topDose, n_doses: nDoses, dilution } };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export interface DosePlanResult {
  error?: string;
  doses: number[];
  replicates: number;
  n_observations: number;
  log_step?: number;
  range_log_units: number;
  estimable?: boolean;
  df: number;
  ic50: number;
  hill: number;
  expected_ci?: { log_width: number; fold_width: number; lower: number; upper: number; log_halfwidth: number };
  plateaus: Record<"top" | "bottom", { end: string; doses_beyond_bend: number; defined: boolean }>;
  bend_points: { low: number; high: number };
  ic50_in_range: boolean;
  flags: { id: string; text: string }[];
}

const g = (v: number, sig = 3) => formatSig(v, sig);

/** "8 concentrations from 0.0178 to 56.2 µM, × 3.16 apart, 3 replicates". */
export function seriesLabel(r: DosePlanResult, unit: string): string {
  const u = unit.trim() ? `\u00a0${unit.trim()}` : "";
  const n = r.doses.length;
  const step = r.log_step !== undefined ? `, × ${g(10 ** r.log_step)} apart` : "";
  return `${n} concentration${n === 1 ? "" : "s"} from ${g(r.doses[0])} to ${g(r.doses[n - 1])}${u}${step}, `
    + `${r.replicates} replicate${r.replicates === 1 ? "" : "s"} each`;
}

/** The expected CI in words, or why there is none. */
export function ciSentence(r: DosePlanResult, unit: string): string {
  const u = unit.trim() ? `\u00a0${unit.trim()}` : "";
  if (!r.expected_ci) {
    return "No expected CI: the planned series cannot estimate the IC50 (see below).";
  }
  const c = r.expected_ci;
  return `Expected 95% CI of the IC50: ${g(c.lower)} to ${g(c.upper)}${u}, a ${g(c.fold_width)}-fold range `
    + `(± ${g(c.log_halfwidth)} log units).`;
}

/** One line for the analysis plan's design notes. */
export function planNote(r: DosePlanResult, unit: string): string {
  const flags = r.flags.length ? ` Flags: ${r.flags.map((f) => f.text).join(" ")}` : "";
  return `Dose series: ${seriesLabel(r, unit)}. ${ciSentence(r, unit)} Assumed: IC50 ${g(r.ic50)}`
    + `${unit.trim() ? `\u00a0${unit.trim()}` : ""}, Hill slope ${g(r.hill)}.${flags}`;
}

export interface DoseSimPooled {
  n_sim: number; coverage: number | null; coverage_se: number | null;
  median_log_width: number | null; median_fold_width: number | null;
  fraction_without_ci: number | null; fraction_ambiguous: number | null;
}

/** Rows for the simulation check. */
export function simRows(s: DoseSimPooled, expectedFold: number | null): [string, string][] {
  const pct = (v: number | null) => (v === null ? "—" : `${formatSig(100 * v, 3)}%`);
  return [
    ["Median CI of the IC50 (fold range)", s.median_fold_width === null ? "—" : `${g(s.median_fold_width)}-fold`],
    ["Expected (from the information matrix)", expectedFold === null ? "—" : `${g(expectedFold)}-fold`],
    ["CIs that contain the true IC50", `${pct(s.coverage)}${s.coverage_se !== null ? ` (Monte Carlo SE ${pct(s.coverage_se)})` : ""}`],
    ["Fits flagged ambiguous", pct(s.fraction_ambiguous)],
    ["Fits without a usable CI", pct(s.fraction_without_ci)],
    ["Simulated experiments", s.n_sim.toLocaleString()],
  ];
}
