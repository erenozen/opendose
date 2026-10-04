// The automatic first fit of a new XY table is a 4PL log(dose) fit. On
// data that is clearly not a dose-response (time courses, a straight
// line over a narrow range, X already on a log scale) that fit can only
// fail, slowly, after trying many starting values. So while a curve fit
// still has its untouched default settings, it runs only on data that
// looks like a dose-response; otherwise the results say why and offer
// "Fit anyway" (and every setting stays at hand). Any change to the fit
// settings means the user asked for this fit: it then always runs.
import { ANALYSIS_NONLIN } from "../project/builtin.ts";
import { numericData } from "../project/table.ts";
import type { DataTableModel } from "../project/types.ts";

/** Raw option set by "Fit anyway". */
export const FIT_ANYWAY = "fitAnyway";

/** The reason on a held-back result (sheetRunner), else null. */
export function notFittedReason(result: unknown): string | null {
  const r = result as { notFitted?: boolean; error?: unknown } | null;
  return r?.notFitted && typeof r.error === "string" ? r.error : null;
}

export interface GuardVerdict {
  /** Why the automatic fit was not run, in the user's terms. */
  reason: string;
}

function ranks(v: number[]): number[] {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(v.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
}

/** Spearman's rank correlation (no ties correction needed for a screen). */
export function spearman(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  const rx = ranks(x);
  const ry = ranks(y);
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (rx[i] - mx) * (ry[i] - my);
    sxx += (rx[i] - mx) ** 2;
    syy += (ry[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Null when the data could be a dose-response for a log(X) fit, else why
 *  not. `xIsLog`: X values are already log10(dose). */
export function doseResponseScreen(table: DataTableModel, xIsLog: boolean): GuardVerdict | null {
  const { x, datasets } = numericData(table);
  // Mean Y per usable X (any data set), on the scale the fit uses.
  const byX = new Map<number, { sum: number; n: number }>();
  let nonPositive = 0;
  x.forEach((xv, i) => {
    if (xv === null || !Number.isFinite(xv)) return;
    const ys = datasets.flatMap((d) => d.ys[i] ?? []).filter((v): v is number => v !== null && Number.isFinite(v));
    if (!ys.length) return;
    if (!xIsLog && xv <= 0) { nonPositive++; return; }
    const key = xIsLog ? xv : Math.log10(xv);
    const e = byX.get(key) ?? { sum: 0, n: 0 };
    for (const y of ys) { e.sum += y; e.n++; }
    byX.set(key, e);
  });
  const lx = [...byX.keys()];
  if (lx.length < 4) {
    const hint = !xIsLog && nonPositive
      ? ` ${nonPositive} row${nonPositive === 1 ? " has" : "s have"} X ≤ 0, which a log(dose) fit cannot use;`
        + " if X is already log10(dose), tick “X values are already log10”."
      : "";
    return {
      reason: `A dose-response fit needs at least 4 different doses; this table has ${lx.length}.${hint}`,
    };
  }
  const span = Math.max(...lx) - Math.min(...lx);
  if (span < Math.log10(8)) {
    return {
      reason: "The X values cover less than an 8-fold range, unlike the dilution series of a "
        + "dose-response experiment.",
    };
  }
  const means = lx.map((k) => byX.get(k)!.sum / byX.get(k)!.n);
  const rho = spearman(lx, means);
  // A flat response over a dilution series is a dose-response experiment
  // without an effect: the fit runs and says so (and how to constrain it).
  // Large swings without a trend are not a dose-response at all.
  const level = means.reduce((a, b) => a + Math.abs(b), 0) / means.length;
  const swing = Math.max(...means) - Math.min(...means);
  const flat = swing <= 0.1 * level;
  if (Math.abs(rho) < 0.5 && !flat) {
    return { reason: "Y does not rise or fall steadily with dose (no monotone trend)." };
  }
  return null;
}

function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
    : x));
}

/** Whether this is the untouched automatic curve fit the screen applies
 *  to: a curve fit whose stored options are still exactly the defaults a
 *  new results sheet gets (no "Fit anyway", no setting changed). */
export function isAutomaticFit(analysis: string, rawOptions: unknown, defaults: unknown): boolean {
  if (analysis !== ANALYSIS_NONLIN) return false;
  if (rawOptions && typeof rawOptions === "object"
    && (rawOptions as Record<string, unknown>)[FIT_ANYWAY] === true) return false;
  return stable(rawOptions ?? {}) === stable(defaults);
}
