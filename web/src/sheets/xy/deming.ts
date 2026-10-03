// Deming (Model II) linear regression of an XY table: options, the engine
// payload, and the result in the per-data-set fit shape the XY graph
// draws (points with mean ± SD, the fitted line as `fit.curve`, slope and
// intercepts as parameters). Pure; unit-tested with node --test.
import { numericData, parseCell } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

export const ANALYSIS_DEMING = "deming";
export const GRAPH_DEMING = "deming_xy";

export interface DemingOptions {
  /** How the X and Y errors compare: equal SDs, a ratio of variances
   *  (lambda = (SD of X / SD of Y)²), or both SDs. */
  errorModel: "equal" | "lambda" | "sd";
  lambda: string;
  sdX: string;
  sdY: string;
  /** SEs and CIs as the statistics guide computes them, or jackknife. */
  seMethod: "prism" | "jackknife";
  /** Report Y at this X (blank: 0, the Y intercept). */
  x0: string;
  /** Also test slope = 1 and intercept = 0 (agreement with identity). */
  compareIdentity: boolean;
}

export const DEFAULT_DEMING: DemingOptions = {
  errorModel: "equal", lambda: "1", sdX: "", sdY: "",
  seMethod: "prism", x0: "", compareIdentity: false,
};

export function normalizeDeming(raw: unknown): DemingOptions {
  return { ...DEFAULT_DEMING, ...(raw && typeof raw === "object" ? raw as Partial<DemingOptions> : {}) };
}

type Payload = { analysis: string; data: unknown; options: Record<string, unknown> };

export function demingPayload(table: DataTableModel, o: DemingOptions): Payload | { error: string } {
  const options: Record<string, unknown> = { se_method: o.seMethod };
  if (o.errorModel === "lambda") {
    const l = parseCell(o.lambda);
    if (l === null || !(l > 0)) return { error: "Enter λ, the ratio of the X and Y error variances (a positive number)" };
    options.lambda = l;
  } else if (o.errorModel === "sd") {
    const sx = parseCell(o.sdX), sy = parseCell(o.sdY);
    if (sx === null || sy === null || !(sx > 0) || !(sy > 0)) {
      return { error: "Enter the SD of the X errors and the SD of the Y errors (positive numbers)" };
    }
    options.sd_x = sx;
    options.sd_y = sy;
  } else {
    options.equal_errors = true;
  }
  const x0 = parseCell(o.x0);
  if (x0 !== null) options.x0 = x0;
  if (o.compareIdentity) options.compare_identity = true;
  return { analysis: "deming", data: numericData(table), options };
}

/** Mean ± SD of each row's replicates (the plotted points). */
export function rowPoints(table: DataTableModel) {
  const d = numericData(table);
  return d.datasets.map((ds) => ({
    x: d.x,
    bars: ds.ys.map((row) => {
      const v = row.filter((y): y is number => y !== null);
      const n = v.length;
      if (!n) return { mean: null, lo: null, hi: null, n: 0 };
      const mean = v.reduce((a, b) => a + b, 0) / n;
      const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
      return { mean, lo: sd === null ? null : mean - sd, hi: sd === null ? null : mean + sd, n };
    }),
  }));
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const entry = (e: any, derived = false) => ({
  value: e?.value ?? e, se: e?.se ?? null, ci95: e?.ci ?? null,
  constrained: false, ...(derived ? { derived: true } : {}),
});

/** Engine result -> fits the XY graph and results blocks understand. The
 *  engine's own numbers stay under `deming`. */
export function demingResult(raw: any, table: DataTableModel): any {
  if (raw?.error) return raw;
  const pts = rowPoints(table);
  return {
    analysis: "deming",
    datasets: (raw.datasets ?? []).map((ds: any, i: number) => {
      const out: any = { name: ds.name, points: pts[i] ?? { x: [], bars: [] } };
      if (ds.error) return { ...out, error: ds.error };
      const f = ds.fit;
      const params: Record<string, unknown> = {
        Slope: entry(f.slope),
        "Y intercept": entry(f.y_intercept),
        "X intercept": entry(f.x_intercept, true),
      };
      const order = ["Slope", "Y intercept", "X intercept"];
      if (f.y_at_x0 && f.y_at_x0.x0 !== 0) {
        const k = `Y at X = ${f.y_at_x0.x0}`;
        params[k] = entry(f.y_at_x0, true);
        order.push(k);
      }
      return {
        ...out,
        deming: f,
        fit: {
          model: "deming", label: "Deming (Model II) linear regression",
          equation: f.equation, status: "converged", dependency: {},
          params, param_order: order,
          goodness: { df: f.df, n_points: f.n, r_squared: null, ss_res: null, sy_x: null },
          curve: f.curve,
        },
      };
    }),
  };
}
