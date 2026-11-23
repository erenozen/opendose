// Options of the column graphs (scatter, bar, box, violin, raincloud), stored on the
// graph sheet as `settings.column`. Absent fields draw the graph exactly
// as before these options existed (mean ± SD, fixed-lane jitter, points
// on bars, no caption); new graphs start from NEW_COLUMN_GRAPH. Pure.
import { isPointSpread, type PointSpread } from "../../graph/swarm.ts";
import {
  normalizeSuperPlot, type SuperPlotSettings,
} from "../common/superplot.ts";
import { tQuantile } from "../grouped/stats.ts";
import { parseCell } from "../../project/table.ts";
import {
  DEFAULT_WHISKERS, percentileOf, readWhiskers, type PercentileMethod, type WhiskerRule,
} from "../../graph/boxStats.ts";
import type { DataTableModel } from "../../project/types.ts";

/** Centre and error bars of scatter and bar graphs. */
export type ColumnSummary = "mean_sd" | "mean_sem" | "mean_ci" | "median_iqr" | "geo_sd"
  | "geo_ci" | "none";

export const COLUMN_SUMMARY_LABELS: Record<ColumnSummary, string> = {
  mean_sd: "Mean ± SD",
  mean_sem: "Mean ± SEM",
  mean_ci: "Mean with 95% CI",
  median_iqr: "Median with IQR",
  geo_sd: "Geometric mean ×/÷ geometric SD",
  geo_ci: "Geometric mean with 95% CI",
  none: "Mean only (no error bars)",
};

/** "Follow the test" (sheets/column/rankSummary.ts): mean ± SD, or median
 *  with IQR while the bound analysis is a rank test. */
export const AUTO_SUMMARY_LABEL = "Follow the test (mean ± SD; median with IQR for a rank test)";

/** Summaries computed on the logarithms (values must be above 0). */
export const isGeometric = (k: ColumnSummary): boolean => k === "geo_sd" || k === "geo_ci";

/** Where the legend sentence (error-bar meaning and n) is shown:
 *  "below" = a line under the graph on screen (not in exported images),
 *  "figure" = drawn inside the figure, so exports carry it. */
export type CaptionMode = "off" | "below" | "figure";

export const CAPTION_LABELS: readonly (readonly [CaptionMode, string])[] = [
  ["below", "Under the graph (not in exports)"],
  ["figure", "In the figure (exports carry it)"],
  ["off", "Off"],
];

export interface ColumnGraphSettings {
  /** "auto": follow the test (new graphs; rankSummary.ts resolveSummary). */
  summary: ColumnSummary | "auto";
  spread: PointSpread;
  /** Bar graphs: individual values over the bars. */
  points: boolean;
  caption: CaptionMode;
  superplot: SuperPlotSettings;
  /** Box plots: where the whiskers end (graph/boxStats.ts). */
  whiskers: WhiskerRule;
  /** Violins: "quartiles" draws the density of graph/kde.ts (bandwidth
   *  stated in the legend) with quartile lines; "mean" is the plotting
   *  library's violin with a mean line, kept for violins saved before. */
  violin: ViolinLook;
}

export type ViolinLook = "quartiles" | "mean";

export const VIOLIN_LOOKS: readonly (readonly [ViolinLook, string])[] = [
  ["quartiles", "Quartile lines, bandwidth stated in the legend"],
  ["mean", "Mean line, bandwidth chosen by the plotting library (not stated)"],
];

export const DEFAULT_COLUMN_GRAPH: ColumnGraphSettings = {
  summary: "mean_sd", spread: "jitter", points: true, caption: "off",
  superplot: normalizeSuperPlot(undefined), whiskers: DEFAULT_WHISKERS, violin: "mean",
};

/** What a graph created from now on starts with (merged over the
 *  defaults); saved graphs without these keys keep the old look. */
export const NEW_COLUMN_GRAPH: Partial<ColumnGraphSettings> = {
  spread: "symmetric", caption: "below", summary: "auto", violin: "quartiles",
};

const SUMMARIES = Object.keys(COLUMN_SUMMARY_LABELS) as ColumnSummary[];

export function normalizeColumnGraph(raw: unknown): ColumnGraphSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_COLUMN_GRAPH;
  return {
    summary: o.summary === "auto" || SUMMARIES.includes(o.summary as ColumnSummary)
      ? o.summary as ColumnSummary | "auto" : d.summary,
    spread: isPointSpread(o.spread) ? o.spread : d.spread,
    points: typeof o.points === "boolean" ? o.points : d.points,
    caption: o.caption === "below" || o.caption === "figure" ? o.caption : d.caption,
    superplot: normalizeSuperPlot(o.superplot),
    whiskers: readWhiskers(o.whiskers),
    violin: o.violin === "quartiles" ? "quartiles" : d.violin,
  };
}

/** Centre and error bar of a set of values for a summary kind: the centre
 *  and the distances below and above it (0 when not defined). Null when
 *  there is no value, or for a geometric summary when a value is 0 or
 *  less (it has no logarithm: geoRefused names those groups).
 *
 *  Geometric (Limpert & Stahel 2011, PLoS ONE 6:e21403): on l = ln(x),
 *  the geometric mean g = exp(mean(l)) and the geometric SD
 *  s* = exp(SD(l)), SD on n - 1; "×/÷ s*" spans g / s* to g × s*. The
 *  95% CI is exp(mean(l) ± t(0.975, n - 1) SD(l) / √n), the t interval
 *  of the logs back-transformed. Reference values: __tests__/reference/
 *  geo_summary.py (numpy, scipy). */
export function summaryOf(values: number[], kind: ColumnSummary,
  percentile: PercentileMethod = "linear"):
  { center: number; lo: number; hi: number; label: string } | null {
  const v = values.filter((x) => Number.isFinite(x));
  const n = v.length;
  if (!n) return null;
  if (isGeometric(kind)) {
    if (v.some((x) => x <= 0)) return null;
    const l = v.map(Math.log);
    const m = l.reduce((a, b) => a + b, 0) / n;
    const s = n > 1 ? Math.sqrt(l.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : 0;
    const g = Math.exp(m);
    if (kind === "geo_ci") {
      const h = n > 1 ? tCrit(n - 1) * s / Math.sqrt(n) : 0;
      const lo = Math.exp(m - h), hi = Math.exp(m + h);
      return { center: g, lo: g - lo, hi: hi - g,
        label: `geometric mean ${fmt(g)}, 95% CI ${fmt(lo)} to ${fmt(hi)}` };
    }
    const gsd = Math.exp(s);
    return { center: g, lo: g - g / gsd, hi: g * gsd - g,
      label: `geometric mean ${fmt(g)} ×/÷ geometric SD ${fmt(gsd)}` };
  }
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  if (kind === "median_iqr") {
    // the quartiles of the column statistics (graph/boxStats.ts)
    const s = [...v].sort((a, b) => a - b);
    const q = (p: number) => percentileOf(s, p * 100, percentile)!;
    const med = q(0.5);
    return { center: med, lo: med - q(0.25), hi: q(0.75) - med,
      label: `median ${fmt(med)}, IQR ${fmt(q(0.25))} to ${fmt(q(0.75))}` };
  }
  if (kind === "mean_sem") {
    const sem = n > 1 ? sd / Math.sqrt(n) : 0;
    return { center: mean, lo: sem, hi: sem, label: `mean ${fmt(mean)} ± SEM ${fmt(sem)}` };
  }
  if (kind === "mean_ci") {
    const half = n > 1 ? tCrit(n - 1) * sd / Math.sqrt(n) : 0;
    return { center: mean, lo: half, hi: half,
      label: `mean ${fmt(mean)}, 95% CI ${fmt(mean - half)} to ${fmt(mean + half)}` };
  }
  if (kind === "none") return { center: mean, lo: 0, hi: 0, label: `mean ${fmt(mean)}` };
  return { center: mean, lo: sd, hi: sd, label: `mean ${fmt(mean)} ± SD ${fmt(sd)}` };
}

const fmt = (v: number) => v.toPrecision(4);

/** Two-sided 95% critical t value. */
const tCrit = (df: number) => tQuantile(0.975, df);

/** Data sets a geometric summary cannot describe: a value of 0 or less. */
export function geoRefused(table: DataTableModel, kind: ColumnSummary): string[] {
  if (!isGeometric(kind)) return [];
  return table.datasets.map((d, i) => ({ name: d.name.trim() || `Data set ${i + 1}`,
    bad: d.rows.some((row) => row.some((c) => {
      const v = parseCell(c);
      return v !== null && v <= 0;
    })) })).filter((d) => d.bad).map((d) => d.name);
}

/** Smallest number of values in a group (column tables; 0 = no data). */
export function smallestN(table: DataTableModel): number {
  const ns = table.datasets.map((d) => d.rows.reduce((n, row) =>
    n + row.filter((c) => parseCell(c) !== null).length, 0)).filter((n) => n > 0);
  return ns.length ? Math.min(...ns) : 0;
}
