// Area under the curve of XY data sets (the statistics guide's analysis):
// options, the engine payload, and the shaded-area geometry the graph
// draws. Pure (no React), unit-tested in __tests__/assays.test.ts.
import { numericData, parseCell } from "../../project/table.ts";
import { SUBCOLUMN_FORMAT_ENGINE, type DataTableModel } from "../../project/types.ts";

export const ANALYSIS_AUC = "xy_auc";
export const GRAPH_AUC = "xy_auc_graph";

export type AucBaseline = "zero" | "value" | "first" | "last" | "mean_first_last";
export type PeakDirection = "positive" | "negative" | "both";

export interface AucOptions {
  baseline: AucBaseline;
  baselineValue: string;
  peakDirection: PeakDirection;
  minPeakHeightPct: string;
  minPeakPoints: string;
  /** "within": subcolumns are replicates of one experiment (SE by
   *  Gagnon & Peterson); "experiments": one AUC per subcolumn. */
  replicates: "within" | "experiments";
  ciLevel: string;
}

export const DEFAULT_AUC: AucOptions = {
  baseline: "zero",
  baselineValue: "0",
  peakDirection: "positive",
  minPeakHeightPct: "10",
  minPeakPoints: "0",
  replicates: "within",
  ciLevel: "95",
};

export const BASELINE_LABELS: Record<AucBaseline, string> = {
  zero: "Y = 0",
  value: "Y = a value you enter",
  first: "First Y value",
  last: "Last Y value",
  mean_first_last: "Mean of the first and last Y values",
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  (typeof v === "string" && (allowed as readonly string[]).includes(v) ? v as T : d);
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);

export function normalizeAuc(raw: unknown): AucOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_AUC;
  return {
    baseline: pick(o.baseline, ["zero", "value", "first", "last", "mean_first_last"] as const, d.baseline),
    baselineValue: str(o.baselineValue, d.baselineValue),
    peakDirection: pick(o.peakDirection, ["positive", "negative", "both"] as const, d.peakDirection),
    minPeakHeightPct: str(o.minPeakHeightPct, d.minPeakHeightPct),
    minPeakPoints: str(o.minPeakPoints, d.minPeakPoints),
    replicates: pick(o.replicates, ["within", "experiments"] as const, d.replicates),
    ciLevel: str(o.ciLevel, d.ciLevel),
  };
}

export function ciFraction(s: string): number {
  const v = parseCell(s);
  if (v === null) return 0.95;
  const f = v > 1 ? v / 100 : v;
  return f > 0 && f < 1 ? f : 0.95;
}

export function aucPayload(table: DataTableModel, o: AucOptions): Record<string, unknown> {
  const data = numericData(table);
  const summary = table.subcolumnFormat !== "replicates";
  return {
    analysis: "auc",
    data,
    options: {
      ...(summary ? { summary_format: SUBCOLUMN_FORMAT_ENGINE[table.subcolumnFormat] } : {}),
      baseline: o.baseline,
      baseline_value: parseCell(o.baselineValue) ?? 0,
      peak_direction: o.peakDirection,
      min_peak_height_pct: parseCell(o.minPeakHeightPct) ?? 10,
      min_peak_points: Math.max(0, Math.round(parseCell(o.minPeakPoints) ?? 0)),
      replicates: summary ? "within" : o.replicates,
      ci_level: ciFraction(o.ciLevel),
    },
  };
}

/** Polygons between a polyline and a horizontal baseline, split where the
 *  line crosses it (linear interpolation, as the engine computes the
 *  areas): one closed polygon per region, with its sign. */
export function shadedRegions(x: number[], y: number[], base: number):
  { sign: 1 | -1; x: number[]; y: number[] }[] {
  const out: { sign: 1 | -1; x: number[]; y: number[] }[] = [];
  let cur: { sign: 1 | -1; x: number[]; y: number[] } | null = null;
  const close = () => {
    if (cur && cur.x.length >= 2) {
      const first = cur.x[0];
      const last = cur.x[cur.x.length - 1];
      cur.x.push(last, first);
      cur.y.push(base, base);
      out.push(cur);
    }
    cur = null;
  };
  for (let i = 0; i < x.length; i++) {
    const d = y[i] - base;
    const s = d > 0 ? 1 : d < 0 ? -1 : 0;
    if (i > 0) {
      const d0 = y[i - 1] - base;
      const s0 = d0 > 0 ? 1 : d0 < 0 ? -1 : 0;
      if (s0 !== 0 && s !== 0 && s !== s0) {
        const xc = x[i - 1] + (x[i] - x[i - 1]) * d0 / (d0 - d);
        cur!.x.push(xc);
        cur!.y.push(base);
        close();
        cur = { sign: s as 1 | -1, x: [xc], y: [base] };
      }
    }
    if (s === 0) {
      if (cur) {
        cur.x.push(x[i]);
        cur.y.push(y[i]);
        close();
      }
      continue;
    }
    if (!cur) {
      cur = i > 0 && y[i - 1] === base
        ? { sign: s as 1 | -1, x: [x[i - 1]], y: [base] }
        : { sign: s as 1 | -1, x: [], y: [] };
    }
    cur.x.push(x[i]);
    cur.y.push(y[i]);
  }
  close();
  return out;
}

/** Trapezoid area of a polyline above a baseline (signed), for checks. */
export function trapezoid(x: number[], y: number[], base = 0): number {
  let a = 0;
  for (let i = 1; i < x.length; i++) a += (x[i] - x[i - 1]) * ((y[i] + y[i - 1]) / 2 - base);
  return a;
}
