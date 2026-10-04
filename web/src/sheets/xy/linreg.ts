// Simple linear regression of an XY table: options, the engine payloads
// and the result. Each data set is fitted on its own (replicates as
// separate points) by the engine's `linear_regression` handler (slope,
// intercept, SEs and CIs, R², Sy.x, F test of slope = 0, runs test) or,
// forced through the origin, by `dose_response` with the
// `line_through_origin` model, whose R² and ANOVA are then computed about
// Y = 0 here. The result keeps the per-data-set fit shape the XY graph
// draws (points, `fit.curve`, `bands`) with the regression numbers under
// `linreg`. Pure: unit-tested with node --test.
import { numericData, parseCell } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { formatSig } from "../../types.ts";
import { rowPoints } from "./deming.ts";
import { anovaCentred, anovaThroughOrigin, type AnovaTable } from "./fitStats.ts";

export const ANALYSIS_LINREG = "linear_regression";
export const GRAPH_LINREG = "linreg_xy";

export interface LinregOptions {
  /** Constrain the line through X = 0, Y = 0. */
  throughOrigin: boolean;
  bands: "none" | "confidence" | "prediction";
  /** Runs test for departure from linearity. */
  runsTest: boolean;
  /** Y values to read X from on the line ("" = none). */
  xAtY: string;
}

export const DEFAULT_LINREG: LinregOptions = {
  throughOrigin: false, bands: "none", runsTest: true, xAtY: "",
};

export function normalizeLinreg(raw: unknown): LinregOptions {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<LinregOptions>;
  return {
    throughOrigin: typeof r.throughOrigin === "boolean" ? r.throughOrigin : DEFAULT_LINREG.throughOrigin,
    bands: r.bands === "confidence" || r.bands === "prediction" ? r.bands : "none",
    runsTest: typeof r.runsTest === "boolean" ? r.runsTest : DEFAULT_LINREG.runsTest,
    xAtY: typeof r.xAtY === "string" ? r.xAtY : "",
  };
}

type Payload = { analysis: string; data: unknown; options: Record<string, unknown> };

export function linregPayload(table: DataTableModel, o: LinregOptions): Payload | { error: string } {
  if (table.subcolumnFormat !== "replicates") {
    return { error: "Linear regression needs the individual Y values, not means with errors: "
      + "enter the replicates, or use the curve fit's straight-line model" };
  }
  const data = numericData(table);
  const bands = o.bands === "none" ? undefined : o.bands;
  if (o.throughOrigin) {
    return { analysis: "dose_response", data, options: {
      model: "line_through_origin", x_is_log: false, error_bars: "sd",
      ...(bands ? { bands } : {}), diagnostics: o.runsTest,
    } };
  }
  return { analysis: "linear_regression", data, options: bands ? { bands } : {} };
}

export interface Estimate { value: number; se: number | null; ci95: [number, number] | null }

/** The regression numbers of one data set. */
export interface LinregBlock {
  throughOrigin: boolean;
  n: number;
  df: number;
  slope: Estimate;
  /** null when the line is forced through the origin. */
  intercept: Estimate | null;
  xIntercept: number | null;
  oneOverSlope: number | null;
  /** Centred R² (1 - SS res / SS about the mean), or, through the origin,
   *  the uncentred R² (1 - SS res / sum of Y squared). */
  r2: number | null;
  /** Through the origin: the centred R², which can be negative. */
  r2Centred?: number | null;
  syx: number;
  ssRes: number;
  anova: AnovaTable;
  runs: { n_runs: number; p: number | null } | null;
  xAtY: { y: number; x: number | null }[];
  equation: string;
}

/** "Y = 3.932*X - 17.58" (or "Y = 2.074*X" through the origin). */
export function equationText(slope: number, intercept: number | null): string {
  const m = `Y = ${formatSig(slope)}*X`;
  if (intercept === null) return m;
  if (intercept === 0) return `${m} + 0`;
  return `${m} ${intercept < 0 ? "-" : "+"} ${formatSig(Math.abs(intercept))}`;
}

export function parseYValues(text: string): number[] {
  return text.split(/[\n,;\s]+/).map(parseCell).filter((v): v is number => v !== null);
}

/** Sum of Y² and n over the XY pairs the engine fits (X and Y present). */
export function sumYSquared(x: (number | null)[], ys: (number | null)[][]): { sumY2: number; n: number } {
  let sumY2 = 0, n = 0;
  ys.forEach((row, r) => {
    if (x[r] === null || x[r] === undefined) return;
    for (const v of row) {
      if (v === null || v === undefined) continue;
      sumY2 += v * v;
      n += 1;
    }
  });
  return { sumY2, n };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const est = (e: any): Estimate => ({
  value: e?.value, se: e?.se ?? null, ci95: Array.isArray(e?.ci95) ? [e.ci95[0], e.ci95[1]] : null,
});

/** One data set's engine output -> regression block (null on failure). */
export function linregBlock(raw: any, o: LinregOptions, sums?: { sumY2: number; n: number }):
  LinregBlock | null {
  const ys = parseYValues(o.xAtY);
  if (o.throughOrigin) {
    const f = raw?.fit;
    const s = f?.params?.Slope;
    if (!s || !sums) return null;
    const g = f.goodness ?? {};
    const n = g.n_points ?? sums.n;
    const a = anovaThroughOrigin(sums.sumY2, g.ss_res, n);
    const runs = raw?.diagnostics?.runs_test;
    const slope = est(s);
    return {
      throughOrigin: true, n, df: g.df ?? n - 1, slope, intercept: null,
      xIntercept: 0, oneOverSlope: slope.value ? 1 / slope.value : null,
      // the engine's uncentred R² when it reports one, else from ΣY²
      r2: typeof g.r_squared_uncentered === "number" ? g.r_squared_uncentered : a.r2,
      r2Centred: g.r_squared ?? null, syx: g.sy_x, ssRes: g.ss_res,
      anova: a,
      runs: o.runsTest && runs ? { n_runs: runs.n_runs, p: runs.p ?? null } : null,
      xAtY: ys.map((y) => ({ y, x: slope.value ? y / slope.value : null })),
      equation: equationText(slope.value, null),
    };
  }
  const f = raw?.fit;
  if (!f?.slope) return null;
  const slope = est(f.slope), intercept = est(f.y_intercept);
  const ft = f.f_nonzero_slope ?? {};
  return {
    throughOrigin: false, n: f.n, df: f.df, slope, intercept,
    xIntercept: f.x_intercept ?? null, oneOverSlope: f.one_over_slope ?? null,
    r2: f.r_squared ?? null, syx: f.sy_x, ssRes: f.ss_res,
    anova: anovaCentred(ft.F, ft.p, f.ss_res, ft.dfd ?? f.df),
    runs: o.runsTest && f.runs_test ? { n_runs: f.runs_test.n_runs, p: f.runs_test.p ?? null } : null,
    xAtY: ys.map((y) => ({ y, x: slope.value ? (y - intercept.value) / slope.value : null })),
    equation: equationText(slope.value, intercept.value),
  };
}

const derived = (value: number | null) => ({
  value: value ?? NaN, se: null, ci95: null, constrained: false, derived: true,
});

/** Engine result -> the per-data-set shape the XY graph, the results and
 *  the report understand. */
export function linregResult(raw: any, table: DataTableModel, o: LinregOptions): any {
  if (raw?.error) return { analysis: ANALYSIS_LINREG, datasets: [], error: raw.error };
  const pts = rowPoints(table);
  const data = numericData(table);
  return {
    analysis: ANALYSIS_LINREG,
    throughOrigin: o.throughOrigin,
    datasets: (raw.datasets ?? []).map((ds: any, i: number) => {
      const out: any = { name: ds.name, points: pts[i] ?? { x: [], bars: [] } };
      if (ds.error) return { ...out, error: ds.error };
      const sums = o.throughOrigin ? sumYSquared(data.x, data.datasets[i]?.ys ?? []) : undefined;
      const b = linregBlock(ds, o, sums);
      if (!b) return { ...out, error: "no fit" };
      const curve = ds.fit.curve;
      const bands = o.throughOrigin ? ds.bands : ds.fit.bands;
      const params: Record<string, unknown> = {
        Slope: { ...b.slope, constrained: false },
      };
      const order = ["Slope"];
      if (b.intercept) {
        params["Y intercept"] = { ...b.intercept, constrained: false };
        params["X intercept"] = derived(b.xIntercept);
        order.push("Y intercept", "X intercept");
      }
      params["1/slope"] = derived(b.oneOverSlope);
      order.push("1/slope");
      return {
        ...out,
        linreg: b,
        ...(bands ? { bands } : {}),
        fit: {
          model: o.throughOrigin ? "line_through_origin" : "linear_regression",
          label: o.throughOrigin ? "Linear regression through the origin" : "Simple linear regression",
          equation: b.equation, status: "converged", dependency: {},
          params, param_order: order,
          goodness: { df: b.df, n_points: b.n, r_squared: b.r2, ss_res: b.ssRes, sy_x: b.syx },
          curve,
        },
      };
    }),
  };
}

export function runLinreg(engine: { analyze: (p: any) => any }, table: DataTableModel,
  o: LinregOptions): any {
  const p = linregPayload(table, o);
  if ("error" in p) return { analysis: ANALYSIS_LINREG, datasets: [], error: p.error };
  return linregResult(engine.analyze(p), table, o);
}
