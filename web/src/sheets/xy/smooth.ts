// Smooth / spline of an XY table (P-103): LOWESS, a smoothing spline or
// a curve through the points (natural cubic spline, PCHIP, point to
// point), one per data set, by the engine's `smooth_xy` handler
// (engine/opendose/smooth.py). None of these curves is a model with
// parameters, so none has a confidence interval: the result says so.
// The result keeps the per-data-set shape the XY graph draws (points,
// `fit.curve`) with the engine's own numbers under `smooth`. Pure:
// unit-tested with node --test.
import { numericData, parseCell } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { formatSig } from "../../types.ts";
import { rowPoints } from "./deming.ts";

export const ANALYSIS_SMOOTH = "smooth_xy";
export const GRAPH_SMOOTH = "smooth_xy_graph";

export type SmoothMethod = "lowess" | "smoothing_spline" | "natural_spline" | "pchip" | "linear";

export const SMOOTH_METHODS: { id: SmoothMethod; label: string; note: string }[] = [
  { id: "lowess", label: "LOWESS",
    note: "Locally weighted straight lines, robust to outliers (Cleveland 1979; R's lowess())." },
  { id: "smoothing_spline", label: "Smoothing spline",
    note: "A natural cubic spline with a roughness penalty, chosen by GCV or by degrees of freedom (R's smooth.spline())." },
  { id: "natural_spline", label: "Cubic spline through the points",
    note: "Passes through the mean Y at each X; may overshoot between points (R's splinefun(method = \"natural\"))." },
  { id: "pchip", label: "Monotone spline through the points (PCHIP)",
    note: "Passes through the mean Y at each X and never overshoots them (Fritsch & Carlson 1980)." },
  { id: "linear", label: "Point to point",
    note: "Straight lines between the mean Y at each X." },
];

export interface SmoothOptions {
  method: SmoothMethod;
  /** LOWESS span f, the fraction of the points in each local fit ("" = 2/3). */
  span: string;
  /** LOWESS robustness iterations ("" = 3). */
  iterations: string;
  /** Smoothing spline: lambda by GCV, or by equivalent degrees of freedom. */
  smoothing: "gcv" | "df";
  df: string;
}

export const DEFAULT_SMOOTH: SmoothOptions = {
  method: "lowess", span: "", iterations: "", smoothing: "gcv", df: "",
};

const METHOD_IDS = SMOOTH_METHODS.map((m) => m.id);

export function normalizeSmooth(raw: unknown): SmoothOptions {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<SmoothOptions>;
  const s = (v: unknown, d: string) => (typeof v === "string" ? v : d);
  return {
    method: METHOD_IDS.includes(r.method as SmoothMethod) ? r.method as SmoothMethod : DEFAULT_SMOOTH.method,
    span: s(r.span, ""),
    iterations: s(r.iterations, ""),
    smoothing: r.smoothing === "df" ? "df" : "gcv",
    df: s(r.df, ""),
  };
}

/** A typed number; NumberField accepts a decimal comma ("0,5"). */
const num = (v: string): number | null => parseCell(v.includes(".") ? v : v.replace(",", "."));

/** The live problem of each typed number, or null (the field's error). */
export function smoothProblems(o: SmoothOptions): { span: string | null; iterations: string | null; df: string | null } {
  const span = o.span.trim() === "" ? null : num(o.span);
  const it = o.iterations.trim() === "" ? null : num(o.iterations);
  const df = num(o.df);
  return {
    span: o.span.trim() !== "" && (span === null || !(span > 0 && span <= 1))
      ? "Enter a fraction more than 0 and at most 1" : null,
    iterations: o.iterations.trim() !== "" && (it === null || !Number.isInteger(it) || it < 0 || it > 10)
      ? "Enter a whole number from 0 to 10" : null,
    df: o.smoothing === "df" && (df === null || !(df > 2))
      ? "Enter degrees of freedom more than 2" : null,
  };
}

type Payload = { analysis: string; data: unknown; options: Record<string, unknown> };

export function smoothPayload(table: DataTableModel, o: SmoothOptions): Payload | { error: string } {
  const p = smoothProblems(o);
  const problem = o.method === "lowess" ? p.span ?? p.iterations
    : o.method === "smoothing_spline" ? p.df : null;
  if (problem) return { error: `${problem}.` };
  const options: Record<string, unknown> = { method: o.method };
  if (o.method === "lowess") {
    if (o.span.trim()) options.span = num(o.span);
    if (o.iterations.trim()) options.iterations = num(o.iterations);
  }
  if (o.method === "smoothing_spline" && o.smoothing === "df") options.df = num(o.df);
  return { analysis: ANALYSIS_SMOOTH, data: numericData(table), options };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Engine result -> data sets the XY graph and results understand. */
export function smoothResult(raw: any, table: DataTableModel): any {
  if (!raw || raw.error) return raw;
  const pts = rowPoints(table);
  return {
    analysis: ANALYSIS_SMOOTH,
    method: raw.method,
    note: raw.note,
    no_model_ci: true,
    datasets: (raw.datasets ?? []).map((ds: any, i: number) => {
      const out: any = { name: ds.name, points: pts[i] ?? { x: [], bars: [] } };
      if (ds.error) return { ...out, error: ds.error };
      const f = ds.fit;
      return {
        ...out,
        smooth: f,
        fit: {
          model: ANALYSIS_SMOOTH, label: f.label, equation: "", status: "converged", dependency: {},
          params: {}, param_order: [],
          goodness: { df: null, n_points: f.n, r_squared: null, ss_res: f.rss ?? null, sy_x: null },
          curve: f.curve,
        },
      };
    }),
  };
}

/** The method's own numbers for one data set, as [label, value] rows. */
export function smoothRows(f: any): [string, string][] {
  const rows: [string, string][] = [];
  if (f.method === "lowess") {
    rows.push(["Span f (fraction of points in each local fit)", formatSig(f.span)]);
    rows.push(["Points in each local fit", String(f.points_per_fit)]);
    rows.push(["Robustness iterations", String(f.iterations)]);
  } else if (f.method === "smoothing_spline") {
    rows.push(["Smoothness chosen by", f.chosen_by === "df" ? "Degrees of freedom" : "GCV"]);
    rows.push(["Equivalent degrees of freedom", formatSig(f.df)]);
    rows.push(["λ (X scaled to 0 to 1)", formatSig(f.lambda)]);
    if (f.gcv != null) rows.push(["GCV score", formatSig(f.gcv)]);
    if (f.residual_sd != null) rows.push(["Residual SD", formatSig(f.residual_sd)]);
  }
  if (f.rss != null && !f.interpolating) rows.push(["Sum of squared residuals", formatSig(f.rss)]);
  rows.push(["Points analyzed", String(f.n)]);
  rows.push(["Distinct X values", String(f.n_x)]);
  return rows;
}

const METHOD_SENTENCE: Record<SmoothMethod, (f: any) => string> = {
  lowess: (f) => `LOWESS (Cleveland 1979) with span f = ${formatSig(f.span)} and ${f.iterations} robustness `
    + "iterations, as R's lowess() computes it",
  smoothing_spline: (f) => `a natural cubic smoothing spline (Green & Silverman 1994) with ${formatSig(f.df)} `
    + `equivalent degrees of freedom (λ = ${formatSig(f.lambda)} with X scaled to 0 to 1, `
    + `${f.chosen_by === "df" ? "set by the degrees of freedom" : "chosen by generalized cross-validation"})`,
  natural_spline: () => "a natural cubic spline through the mean Y at each X",
  pchip: () => "a monotone piecewise cubic Hermite interpolant (PCHIP; Fritsch & Carlson 1980) through the mean Y at each X",
  linear: () => "straight lines between the mean Y at each X (point to point)",
};

/** The methods sentence ("" when nothing was fitted). */
export function smoothMethods(result: any): string {
  const fits = (result?.datasets ?? []).filter((d: any) => d.smooth);
  if (!fits.length) return "";
  const m = fits[0].smooth.method as SmoothMethod;
  const tail = "The curve describes the data; it is not a fitted model, and no confidence interval is "
    + "computed for it.";
  // the smoothing spline's degrees of freedom differ per data set
  const each = m === "smoothing_spline" ? fits : [fits[0]];
  const parts = each.map((d: any) => (m === "smoothing_spline" || fits.length === 1
    ? `${d.name}: ${METHOD_SENTENCE[m](d.smooth)}`
    : `${fits.map((x: any) => x.name).join(", ")}: ${METHOD_SENTENCE[m](d.smooth)}`));
  return `A curve was drawn through each data set (${parts.join("; ")}). ${tail}`;
}
