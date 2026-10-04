// Options of the Kaplan-Meier graph, stored on the graph sheet as
// `settings.survival`. Absent = as before (no censor ticks, no nudging);
// new graphs start with censor ticks (sheets/common/figureDefaults.ts).
// Pure.

export interface SurvivalGraphSettings {
  /** A tick where each subject was censored. */
  censorMarks: boolean;
  /** Vertical offset between curves, in percentage points (0 = none). */
  nudge: number;
}

export function normalizeSurvivalGraph(raw: unknown): SurvivalGraphSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = typeof o.nudge === "number" && Number.isFinite(o.nudge) ? o.nudge : 0;
  return { censorMarks: o.censorMarks === true, nudge: Math.min(5, Math.max(0, n)) };
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
