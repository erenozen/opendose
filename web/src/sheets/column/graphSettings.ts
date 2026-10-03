// Options of the column graphs (scatter, bar, box, violin), stored on the
// graph sheet as `settings.column`. Absent fields draw the graph exactly
// as before these options existed (mean ± SD, fixed-lane jitter, points
// on bars, no caption); new graphs start from NEW_COLUMN_GRAPH. Pure.
import { isPointSpread, type PointSpread } from "../../graph/swarm.ts";
import {
  normalizeSuperPlot, type SuperPlotSettings,
} from "../common/superplot.ts";
import { tQuantile } from "../grouped/stats.ts";
import { parseCell } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

/** Centre and error bars of scatter and bar graphs. */
export type ColumnSummary = "mean_sd" | "mean_sem" | "mean_ci" | "median_iqr" | "none";

export const COLUMN_SUMMARY_LABELS: Record<ColumnSummary, string> = {
  mean_sd: "Mean ± SD",
  mean_sem: "Mean ± SEM",
  mean_ci: "Mean with 95% CI",
  median_iqr: "Median with IQR",
  none: "Mean only (no error bars)",
};

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
  summary: ColumnSummary;
  spread: PointSpread;
  /** Bar graphs: individual values over the bars. */
  points: boolean;
  caption: CaptionMode;
  superplot: SuperPlotSettings;
}

export const DEFAULT_COLUMN_GRAPH: ColumnGraphSettings = {
  summary: "mean_sd", spread: "jitter", points: true, caption: "off",
  superplot: normalizeSuperPlot(undefined),
};

/** What a graph created from now on starts with (merged over the
 *  defaults); saved graphs without these keys keep the old look. */
export const NEW_COLUMN_GRAPH: Partial<ColumnGraphSettings> = {
  spread: "symmetric", caption: "below",
};

const SUMMARIES = Object.keys(COLUMN_SUMMARY_LABELS) as ColumnSummary[];

export function normalizeColumnGraph(raw: unknown): ColumnGraphSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_COLUMN_GRAPH;
  return {
    summary: SUMMARIES.includes(o.summary as ColumnSummary) ? o.summary as ColumnSummary : d.summary,
    spread: isPointSpread(o.spread) ? o.spread : d.spread,
    points: typeof o.points === "boolean" ? o.points : d.points,
    caption: o.caption === "below" || o.caption === "figure" ? o.caption : d.caption,
    superplot: normalizeSuperPlot(o.superplot),
  };
}

/** Centre and error bar of a set of values for a summary kind: the centre
 *  and the distances below and above it (0 when not defined). */
export function summaryOf(values: number[], kind: ColumnSummary):
  { center: number; lo: number; hi: number; label: string } | null {
  const v = values.filter((x) => Number.isFinite(x));
  const n = v.length;
  if (!n) return null;
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  if (kind === "median_iqr") {
    const s = [...v].sort((a, b) => a - b);
    const q = (p: number) => {
      const h = (n - 1) * p, k = Math.floor(h);
      return k >= n - 1 ? s[n - 1] : s[k] + (h - k) * (s[k + 1] - s[k]);
    };
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

/** Smallest number of values in a group (column tables; 0 = no data). */
export function smallestN(table: DataTableModel): number {
  const ns = table.datasets.map((d) => d.rows.reduce((n, row) =>
    n + row.filter((c) => parseCell(c) !== null).length, 0)).filter((n) => n > 0);
  return ns.length ? Math.min(...ns) : 0;
}
