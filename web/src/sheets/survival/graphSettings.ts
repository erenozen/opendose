// Options of the Kaplan-Meier graph, stored on the graph sheet as
// `settings.survival`. Absent = as before (no censor ticks, no nudging,
// percent survival without confidence bands); new graphs start with censor
// ticks (sheets/common/figureDefaults.ts). Prism's Kaplan-Meier graph
// offers the same choices: survival or death, fraction or percent, and
// the confidence interval as a shaded band or dotted lines. Pure.

export type SurvivalCi = "none" | "band" | "lines";
export type SurvivalShow = "survival" | "death";
export type SurvivalScale = "percent" | "fraction";

export interface SurvivalGraphSettings {
  /** A tick where each subject was censored. */
  censorMarks: boolean;
  /** Vertical offset between curves, in percentage points (0 = none). */
  nudge: number;
  /** The pointwise confidence interval of each curve (log-log, as the
   *  Kaplan-Meier table). */
  ci: SurvivalCi;
  /** Survival S(t), or death 1 − S(t). */
  show: SurvivalShow;
  /** Y as a percentage (0-100) or a fraction (0-1). */
  scale: SurvivalScale;
}

export function normalizeSurvivalGraph(raw: unknown): SurvivalGraphSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = typeof o.nudge === "number" && Number.isFinite(o.nudge) ? o.nudge : 0;
  return {
    censorMarks: o.censorMarks === true,
    nudge: Math.min(5, Math.max(0, n)),
    ci: o.ci === "band" || o.ci === "lines" ? o.ci : "none",
    show: o.show === "death" ? "death" : "survival",
    scale: o.scale === "fraction" ? "fraction" : "percent",
  };
}

/** Survival (fraction) of a step curve at time t: the last step at or
 *  before t (null before the first step). */
export function survivalAt(points: { time: number; survival: number }[], t: number):
  number | null {
  let s: number | null = null;
  for (const p of points) {
    if (p.time <= t) s = p.survival;
    else break;
  }
  return s;
}

/** A survival fraction as plotted: survival or death, percent or fraction. */
export function plotValue(s: number, o: Pick<SurvivalGraphSettings, "show" | "scale">): number {
  const v = o.show === "death" ? 1 - s : s;
  return o.scale === "percent" ? v * 100 : v;
}

/** The plotted confidence limits of a point. Death is 1 − S, so its lower
 *  limit comes from the survival's upper limit and vice versa. */
export function plotLimits(lower: number, upper: number,
  o: Pick<SurvivalGraphSettings, "show" | "scale">): [number, number] {
  return o.show === "death"
    ? [plotValue(upper, o), plotValue(lower, o)]
    : [plotValue(lower, o), plotValue(upper, o)];
}

/** The Y-axis title that matches the choice ("Percent survival",
 *  "Fraction death", ...). */
export function survivalYTitle(o: Pick<SurvivalGraphSettings, "show" | "scale">): string {
  return `${o.scale === "percent" ? "Percent" : "Fraction"} ${o.show}`;
}

/** The Y-axis range: a little headroom above 100% (or 1). */
export function survivalYRange(o: Pick<SurvivalGraphSettings, "scale">): [number, number] {
  return o.scale === "percent" ? [0, 105] : [0, 1.05];
}

/** Nudge (given in percentage points) on the plotted scale. */
export function nudgeOnScale(nudge: number, o: Pick<SurvivalGraphSettings, "scale">): number {
  return o.scale === "percent" ? nudge : nudge / 100;
}
