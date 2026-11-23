// The Schild plot of an EC50-shift (Gaddum/Schild) fit (FEATURE-PLAN
// P-49): log10(DR - 1) against log10[antagonist], with the straight line
// through it and its slope's 95% CI read against 1 (Arunlakshana &
// Schild 1959, Br J Pharmacol 14:48). The engine computes everything
// (engine/opendose/schild.py schild_plot): each curve's EC50 from a fit
// with shared Top, Bottom and Hill slope, the dose ratios, and the OLS
// line. The plot is a display; pA2 and KB stay those of the global fit.
// This module reads the result for the results card, the graph and the
// linked XY table. Every number is the engine's, printed with formatSig.
// Pure; unit-tested.
import { formatSig } from "../../types.ts";
import { normalizeTable } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** The derived-table output name (DerivedLink.output) of the Schild table. */
export const SCHILD_OUTPUT = "schild";

export interface SchildRow {
  name: string;
  /** "1e-07" (as entered, M) */
  antagonist: string;
  logB: string;
  /** EC50 of the curve (its own, from the parallel fit) */
  logEC50: string;
  doseRatio: string;
  /** log10(DR - 1), or "n/a" */
  y: string;
  included: boolean;
  reason?: string;
}

export interface SchildView {
  /** Set when there is no plot to draw: the engine's reason. */
  error?: string;
  control: string;
  controlLogEC50: string;
  rows: SchildRow[];
  /** The line (absent with fewer than 2 usable points). */
  slope?: string;
  /** "0.946 to 1.155", or null when n = 2 (no residual df). */
  slopeCI?: string | null;
  /** The slope's 95% CI contains 1 (null: no CI). */
  includes1?: boolean | null;
  pSlope1?: string;
  intercept?: string;
  pA2Plot?: string;
  r2?: string;
  n?: number;
  df?: number;
  /** Numbers to draw: points used, and the line. */
  points: { x: number; y: number; name: string }[];
  line?: { slope: number; intercept: number };
}

const fs = (v: unknown) => (typeof v === "number" ? formatSig(v) : "n/a");

/** The Schild plot of a curve-fit result, or null when the result is not
 *  an EC50-shift fit (no `schild_plot`). */
export function readSchild(result: unknown): SchildView | null {
  const r = result as R | null;
  const sp = r && typeof r === "object" ? r.schild_plot as R | undefined : undefined;
  if (!sp || typeof sp !== "object") return null;
  const rows: SchildRow[] = (Array.isArray(sp.points) ? sp.points as R[] : []).map((p) => ({
    name: String(p.name ?? ""),
    antagonist: fs(p.antagonist),
    logB: fs(p.log_antagonist),
    logEC50: fs(p.log_ec50),
    doseRatio: fs(p.dose_ratio),
    y: p.included ? fs(p.log_dr_minus_1) : "n/a",
    included: !!p.included,
    ...(p.included ? {} : { reason: String(p.reason ?? "left out") }),
  }));
  const view: SchildView = {
    control: String(sp.control ?? ""), controlLogEC50: fs(sp.control_log_ec50), rows,
    points: (Array.isArray(sp.points) ? sp.points as R[] : [])
      .filter((p) => p.included && Number.isFinite(p.log_antagonist) && Number.isFinite(p.log_dr_minus_1))
      .map((p) => ({ x: p.log_antagonist, y: p.log_dr_minus_1, name: String(p.name ?? "") })),
  };
  if (sp.error) view.error = String(sp.error).replace(/\.$/, "");
  const g = sp.regression as R | undefined;
  if (g && Number.isFinite(g.slope)) {
    view.slope = fs(g.slope);
    view.intercept = fs(g.intercept);
    view.slopeCI = Array.isArray(g.slope_ci95) ? `${fs(g.slope_ci95[0])} to ${fs(g.slope_ci95[1])}` : null;
    view.includes1 = typeof g.slope_ci_includes_1 === "boolean" ? g.slope_ci_includes_1 : null;
    if (typeof g.p_slope_1 === "number") view.pSlope1 = fs(g.p_slope_1);
    if (typeof g.pA2_from_plot === "number") view.pA2Plot = fs(g.pA2_from_plot);
    if (typeof g.r_squared === "number") view.r2 = fs(g.r_squared);
    view.n = Number(g.n);
    view.df = Number(g.df);
    view.line = { slope: g.slope, intercept: g.intercept };
  }
  return view;
}

/** One sentence on the slope against 1, next to the number. */
export function slopeSentence(v: SchildView): string {
  if (!v.slope) return "";
  if (v.slopeCI == null) {
    return `Slope ${v.slope} from 2 points: no confidence interval (it needs a third antagonist `
      + "concentration), so it cannot be compared with 1.";
  }
  return v.includes1
    ? `Slope ${v.slope} (95% CI ${v.slopeCI}): the interval includes 1, as simple competitive `
      + "antagonism predicts."
    : `Slope ${v.slope} (95% CI ${v.slopeCI}): the interval excludes 1, which simple competitive `
      + "antagonism does not predict; read pA2 with care (it is not then −log KB).";
}

/** The linked XY table: X = log10[antagonist], Y = log10(DR - 1), one row
 *  per antagonist curve (named), only curves with a dose ratio above 1. */
export function schildTable(result: unknown): DataTableModel | null {
  const v = readSchild(result);
  if (!v || !v.points.length) return null;
  const sp = (result as R).schild_plot as R;
  const used = (sp.points as R[]).filter((p) => p.included);
  return normalizeTable({
    type: "xy",
    x: used.map((p) => String(p.log_antagonist)),
    xTitle: "log[Antagonist]",
    yTitle: "log(DR − 1)",
    rowTitles: used.map((p) => String(p.name ?? "")),
    datasets: [{ name: "log(DR − 1)", rows: used.map((p) => [String(p.log_dr_minus_1)]) }],
  });
}
