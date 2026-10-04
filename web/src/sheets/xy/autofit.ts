// When does a new XY table's curve fit start by itself? The default model
// is a four-parameter dose-response curve, so the fit runs on its own only
// when the data look like a dose-response: at least four distinct X values
// spaced like concentrations (evenly on a log scale rather than on a
// linear one) and row means that rise or fall monotonically (Spearman
// |rho| >= 0.8 in some data set, which allows a little noise). Otherwise
// the results ask the user to choose: linear regression or a curve fit.
// Any explicit choice (a model picked, "Fit a curve", a template, the
// plate import, an older project without the option) runs the fit as
// before. Pure: unit-tested with node --test.
import { numericData } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { DEFAULT_XY_OPTIONS, type OptionsState } from "../../types.ts";

/** Why the fit did not start by itself. */
export type ChooseReason =
  | "dates"        // X holds dates or elapsed times
  | "nonpositive"  // X values are zero or negative (logs already?)
  | "spacing"      // X spaced evenly on a linear scale, not like concentrations
  | "trend";       // no monotone trend in the row means

export type GateDecision = { fit: true } | { fit: false; reason: ChooseReason };

/** Average ranks (ties share their mean rank), 1-based. */
export function ranks(v: number[]): number[] {
  const idx = v.map((_, i) => i).sort((a, b) => v[a] - v[b]);
  const out = new Array<number>(v.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && v[idx[j + 1]] === v[idx[i]]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k]] = r;
    i = j + 1;
  }
  return out;
}

/** Spearman's rank correlation, or null when either variable is constant
 *  or there are fewer than three pairs. */
export function spearman(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  const rx = ranks(x.slice(0, n)), ry = ranks(y.slice(0, n));
  const mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (rx[i] - mx) * (ry[i] - my);
    sxx += (rx[i] - mx) ** 2;
    syy += (ry[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

function cv(v: number[]): number {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  if (!(m > 0)) return Infinity;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
  return sd / m;
}

/** Positive X values (at least four distinct) spaced like a dilution
 *  series: more evenly on a log scale than on a linear one. An evenly
 *  spaced series (1, 2, 3, ...; time points) is not. */
export function concentrationLike(xs: number[]): boolean {
  const u = [...new Set(xs.filter((v) => Number.isFinite(v) && v > 0))].sort((a, b) => a - b);
  if (u.length < 4) return false;
  const lin: number[] = [], log: number[] = [];
  for (let i = 1; i < u.length; i++) {
    lin.push(u[i] - u[i - 1]);
    log.push(Math.log10(u[i]) - Math.log10(u[i - 1]));
  }
  return cv(log) < 0.75 * cv(lin);
}

/** Per data set: (X, mean Y) of each row with a value. Summary formats
 *  (mean with SD / SEM / ...) read the mean from the first subcolumn. */
export function rowMeans(table: DataTableModel): { x: number; y: number }[][] {
  const d = numericData(table);
  const summary = table.subcolumnFormat !== "replicates";
  return d.datasets.map((ds) => {
    const out: { x: number; y: number }[] = [];
    ds.ys.forEach((row, r) => {
      const xv = d.x[r];
      if (xv === null || xv === undefined || !Number.isFinite(xv)) return;
      const vals = (summary ? row.slice(0, 1) : row)
        .filter((v): v is number => v !== null && Number.isFinite(v));
      if (!vals.length) return;
      out.push({ x: xv, y: vals.reduce((a, b) => a + b, 0) / vals.length });
    });
    return out;
  });
}

/** Do the data look like a dose-response? "few" = fewer than four
 *  distinct X values with data (too little to judge: the fit's own
 *  messages explain what is missing). */
export function doseResponseLike(table: DataTableModel): { ok: true } | { ok: false; reason: ChooseReason | "few" } {
  const sets = rowMeans(table);
  const xsAll = new Set(sets.flatMap((s) => s.map((p) => p.x)));
  if (xsAll.size < 4) return { ok: false, reason: "few" };
  if (table.xFormat !== "numbers") return { ok: false, reason: "dates" };
  const positive = [...xsAll].filter((v) => v > 0);
  if (positive.length < 4) return { ok: false, reason: "nonpositive" };
  if (!concentrationLike(positive)) return { ok: false, reason: "spacing" };
  const monotone = sets.some((s) => {
    const pts = s.filter((p) => p.x > 0);
    if (new Set(pts.map((p) => p.x)).size < 4) return false;
    const rho = spearman(pts.map((p) => p.x), pts.map((p) => p.y));
    return rho !== null && Math.abs(rho) >= 0.8;
  });
  return monotone ? { ok: true } : { ok: false, reason: "trend" };
}

/** Has the fit been asked for (or set up) rather than merely created with
 *  a new table? Options without the field (older projects, v1 files,
 *  templates saved before it) count as asked for, and so does anything
 *  that changed the model or its X handling from the defaults (the plate
 *  import, the "Which test?" wizard, the data simulator, ...). */
export function fitRequested(o: Partial<OptionsState> | null | undefined): boolean {
  if (!o || o.autoFit !== "auto") return true;
  if (o.model !== undefined && o.model !== DEFAULT_XY_OPTIONS.model) return true;
  if (o.xIsLog || o.normalize?.enabled || o.top?.enabled || o.bottom?.enabled
    || o.hillSlope?.enabled) return true;
  if ((o.sharedParams?.length ?? 0) > 0 || (o.interpolateY ?? "").trim() !== ""
    || o.userEquation) return true;
  return false;
}

/** Should the curve fit run now? */
export function autoFitGate(table: DataTableModel, o: Partial<OptionsState> | null | undefined):
  GateDecision {
  if (fitRequested(o)) return { fit: true };
  const d = doseResponseLike(table);
  if (d.ok || d.reason === "few") return { fit: true };
  return { fit: false, reason: d.reason };
}

/** One sentence on why the fit waits for a choice. */
export function chooseReasonText(reason: ChooseReason): string {
  switch (reason) {
    case "dates":
      return "X holds dates or times, which a dose-response curve does not describe.";
    case "nonpositive":
      return "Most X values are zero or negative. If they are already log(concentration), "
        + "choose Fit a curve and tick “X values are already log10(concentration)”.";
    case "spacing":
      return "The X values are evenly spaced, not a dilution series, so these do not look "
        + "like dose-response data.";
    default:
      return "The response does not rise or fall steadily with X, so a dose-response curve "
        + "may not describe it.";
  }
}
