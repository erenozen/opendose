// Incomplete curves: an IC50 / EC50 beyond the concentrations tested is
// reported as "> 30 µM (not reached in the range tested)" rather than as
// the extrapolated number, unless the results sheet asks for the fitted
// number (flagged). Reads the engine's range_flags (rangeflags.py) and
// never changes a fitted number. Sources: GraphPad curve fitting guide
// ("Incomplete dose-response curves"; "50% of what? Relative vs. absolute
// IC50"); Sebaugh JL (2011) Guidelines for accurate EC50/IC50 estimation,
// Pharm Stat 10:128-134. Need `incomplete-curve-flags`. Pure, unit-tested.
import type { AnalysisResult, OptionsState } from "../../types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export type ExtrapolatedReport = "bound" | "fitted";

export const NOT_REACHED = "not reached in the range tested";

export interface RangeDisplay {
  /** "bound": report "> 30 µM"; "fitted": the fitted number, flagged. */
  mode: ExtrapolatedReport;
  /** "IC50" / "EC50". */
  label: string;
  /** The midpoint parameter (LogIC50, EC50, ...). */
  param: string;
  relation: ">" | "<";
  /** "> 30" (engine's report_as) and with the unit: "> 30 µM". */
  bound: string;
  boundWithUnit: string;
  /** "> 1.477": the bound on the log scale, for a LogIC50 row. */
  logBound: string | null;
  unit: string;
  /** "IC50 > 30 µM (not reached in the range tested)". */
  text: string;
  /** Why the number is not reported: midpoint beyond the range, plateaus. */
  reasons: string[];
}

/** The concentration unit: the X title's "(µM)" when it has one, else the
 *  table's X unit (log X titles are skipped: their unit is a log). */
export function concentrationUnit(table: { xTitle?: string; xUnit?: string }): string {
  const title = (table.xTitle ?? "").trim();
  const m = /\(([^()]+)\)\s*$/.exec(title) ?? /,\s*([^\s,()]+)\s*$/.exec(title);
  if (m && !/^log/i.test(title) && m[1].trim().length <= 8) return m[1].trim();
  return (table.xUnit ?? "").trim();
}

function fmtLog(v: number): string {
  return String(Number(v.toPrecision(4)));
}

/** The display of one fit's flags, or null when its midpoint was reached. */
export function rangeDisplay(flags: unknown, unit: string,
  mode: ExtrapolatedReport = "bound"): RangeDisplay | null {
  const f = flags as R | null;
  if (!f || typeof f !== "object" || f.error || !f.report_as) return null;
  const relation = f.report_relation === "<" ? "<" : ">";
  const label = String(f.label ?? "EC50");
  const bound = String(f.report_as);
  const boundWithUnit = `${bound}${unit ? ` ${unit}` : ""}`;
  const edge = relation === ">" ? f.x_max_tested : f.x_min_tested;
  const logBound = f.x_units === "log10" && typeof edge === "number"
    ? `${relation} ${fmtLog(edge)}` : null;
  const reasons: string[] = [];
  reasons.push(`the fitted ${label} lies ${relation === ">" ? "above the highest" : "below the lowest"} `
    + `concentration tested (${String(f.report_value)}${unit ? ` ${unit}` : ""})`);
  if (f.top_defined === false) reasons.push(`the top plateau is not defined by the data (${f.top_reason})`);
  if (f.bottom_defined === false) reasons.push(`the bottom plateau is not defined by the data (${f.bottom_reason})`);
  if (f.crosses_half === false) reasons.push("the observed responses never cross half-way between the fitted top and bottom");
  return {
    mode, label, param: String(f.midpoint_param ?? label), relation, bound, boundWithUnit,
    logBound, unit, text: `${label} ${boundWithUnit} (${NOT_REACHED})`, reasons,
  };
}

/** Is this parameter the reported midpoint (IC50 / EC50 in concentration)? */
export function isMidpoint(name: string, d: RangeDisplay): boolean {
  return name === d.label || (name === d.param && !/^Log/.test(d.param));
}

/** Is this parameter the midpoint on the log scale (LogIC50)? */
export function isLogMidpoint(name: string, d: RangeDisplay): boolean {
  return /^Log/.test(d.param) && name === d.param;
}

/** A ratio or relative potency computed from the midpoint. */
export function isRatioParam(name: string): boolean {
  return /ratio|potency/i.test(name);
}

/** "undefined (IC50 > 30 µM)". */
export function ratioText(d: RangeDisplay): string {
  return `undefined (${d.label} ${d.boundWithUnit})`;
}

/** The results with each flagged fit's display attached (fit.range_flags.
 *  display), so the table, the results sentence and the report agree. */
export function withRangeReport(result: AnalysisResult, table: { xTitle?: string; xUnit?: string },
  options: Pick<OptionsState, "extrapolatedReport">): AnalysisResult {
  if (!result || (result as R).error || !Array.isArray(result.datasets)) return result;
  const unit = concentrationUnit(table);
  const mode: ExtrapolatedReport = options.extrapolatedReport === "fitted" ? "fitted" : "bound";
  let changed = false;
  const datasets = result.datasets.map((ds) => {
    const fit = ds.fit as R | undefined;
    const d = fit ? rangeDisplay(fit.range_flags, unit, mode) : null;
    if (!fit || !d) return ds;
    changed = true;
    return { ...ds, fit: { ...fit, range_flags: { ...fit.range_flags, display: d } } } as unknown as typeof ds;
  });
  return changed ? { ...result, datasets } : result;
}

/** SE and CI of a midpoint (or ratio) reported as a bound: not reported. */
export function rangeHidesSpread(name: string, fit: unknown): boolean {
  const d = displayOf(fit);
  return !!d && d.mode === "bound"
    && (isMidpoint(name, d) || isLogMidpoint(name, d) || isRatioParam(name));
}

/** The display of a fit, if its midpoint is flagged. */
export function displayOf(fit: unknown): RangeDisplay | null {
  const d = (fit as R | null)?.range_flags?.display;
  return d && typeof d === "object" && typeof d.bound === "string" ? d as RangeDisplay : null;
}
