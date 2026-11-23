// Method-comparison regression (P-42): Passing-Bablok and Theil-Sen with
// the CUSUM test of linearity, and Deming on the same pairs.
// XY table: method 1 = X, method 2 = each data set (replicates pair with
// their row's X). Column table: two chosen columns, paired by row (the
// Bland-Altman layout). Pure; engine handler method_regression
// (engine/opendose/api.py, methodreg.py).
import { numericData } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import type { CccResult } from "../common/ccc.ts";

export const ANALYSIS_METHOD_REGRESSION = "method_regression";
export const GRAPH_METHOD_REGRESSION = "method_regression_plot";

export interface MethodRegOptions {
  /** Column tables: the columns holding method 1 (X) and method 2 (Y). */
  datasetA: number;
  datasetB: number;
  ciLevel: string;
}

export function defaultMethodRegOptions(): MethodRegOptions {
  return { datasetA: 0, datasetB: 1, ciLevel: "95" };
}

export function normalizeMethodRegOptions(raw: unknown): MethodRegOptions {
  const d = defaultMethodRegOptions();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  return {
    datasetA: Number.isInteger(r.datasetA) ? r.datasetA as number : d.datasetA,
    datasetB: Number.isInteger(r.datasetB) ? r.datasetB as number : d.datasetB,
    ciLevel: typeof r.ciLevel === "string" ? r.ciLevel : d.ciLevel,
  };
}

/** "95" or "0.95" -> 0.95, clamped to 50 to 99.99%. */
export function ciFraction(s: string): number {
  const n = Number(String(s).trim());
  const v = String(s).trim() !== "" && Number.isFinite(n) ? n : 95;
  return Math.min(0.9999, Math.max(0.5, v > 1 ? v / 100 : v));
}

type Payload = { analysis: string; data: unknown; options: Record<string, unknown> };

export function methodRegPayload(table: DataTableModel, o: MethodRegOptions): Payload | { error: string } {
  const ci_level = ciFraction(o.ciLevel);
  if (table.type === "xy") {
    const d = numericData(table);
    if (!d.datasets.length) return { error: "Enter method 1 in X and method 2 in a Y column." };
    return { analysis: ANALYSIS_METHOD_REGRESSION,
      data: { ...d, x_name: table.xTitle && table.xTitle !== "X" ? table.xTitle : "X" },
      options: { ci_level } };
  }
  const n = table.datasets.length;
  const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < n;
  if (n < 2) return { error: "Method comparison needs two columns: one per method." };
  if (!ok(o.datasetA) || !ok(o.datasetB) || o.datasetA === o.datasetB) {
    return { error: "Choose two different columns for the two methods." };
  }
  if (table.subcolumnFormat !== "replicates") {
    return { error: "Method comparison needs the individual measurements, not means with errors." };
  }
  const col = (i: number) => numericData(table).datasets[i]?.ys.map((row) => row[0] ?? null) ?? [];
  return { analysis: ANALYSIS_METHOD_REGRESSION,
    data: { a: col(o.datasetA), b: col(o.datasetB),
      names: [table.datasets[o.datasetA].name, table.datasets[o.datasetB].name] },
    options: { ci_level } };
}

// ------------------------------------------------------------ results

export interface Estimate { value: number; ci: [number, number] | null; se?: number }

export interface PbFit {
  error?: string;
  n: number;
  slope: Estimate;
  intercept: Estimate;
  ci_note?: string;
  kendall: { tau: number; p: number };
  cusum: {
    n_above: number; n_below: number; max_cusum: number | null; H: number | null;
    p: number | null; linear?: boolean; unavailable?: string;
  };
}

export interface TsFit { error?: string; slope: Estimate; intercept: Estimate }
export interface DemingFit { error?: string; slope: Estimate; intercept: Estimate }

export interface MethodComparison {
  name: string;
  x_name: string;
  n: number;
  points: { x: number[]; y: number[] };
  passing_bablok: PbFit;
  theil_sen: TsFit;
  deming: DemingFit;
  /** Lin's CCC of the same pairs (P-43). */
  ccc?: CccResult;
}

export interface MethodRegResult {
  error?: string;
  analysis: "method_regression";
  ci_level: number;
  comparisons: MethodComparison[];
}

type Engine = { analyze: (p: unknown) => unknown };

export function runMethodReg(engine: Engine, table: DataTableModel, o: MethodRegOptions): MethodRegResult {
  const p = methodRegPayload(table, o);
  if ("error" in p) return { error: p.error } as MethodRegResult;
  const r = engine.analyze(p) as MethodRegResult;
  if (r.error) return { error: String(r.error) } as MethodRegResult;
  return r;
}

/** The fitted line y = a + b x over [lo, hi], or null. */
export function lineOver(fit: { slope?: Estimate; intercept?: Estimate; error?: string } | undefined,
  lo: number, hi: number): { x: number[]; y: number[] } | null {
  if (!fit || fit.error || !fit.slope || !fit.intercept) return null;
  const b = fit.slope.value;
  const a = fit.intercept.value;
  return { x: [lo, hi], y: [a + b * lo, a + b * hi] };
}

/** Does the CI of the slope include 1 and that of the intercept 0? The
 *  reading Passing & Bablok (1983) give their CIs: null when a CI is
 *  missing. */
export function agreesWithIdentity(fit: PbFit): { slope: boolean; intercept: boolean } | null {
  if (fit.error || !fit.slope.ci || !fit.intercept.ci) return null;
  const [sl, sh] = fit.slope.ci;
  const [il, ih] = fit.intercept.ci;
  return { slope: sl <= 1 && 1 <= sh, intercept: il <= 0 && 0 <= ih };
}

/** Plain reading of the Passing-Bablok CIs (Passing & Bablok 1983). */
export function identityReading(fit: PbFit): string | null {
  const a = agreesWithIdentity(fit);
  if (!a) return null;
  if (a.slope && a.intercept) {
    return "The slope's CI includes 1 and the intercept's includes 0: no evidence of a proportional or a constant difference between the methods.";
  }
  const parts = [];
  if (!a.slope) parts.push("the slope's CI excludes 1 (a proportional difference)");
  if (!a.intercept) parts.push("the intercept's CI excludes 0 (a constant difference)");
  return `The methods differ: ${parts.join(" and ")}.`;
}
