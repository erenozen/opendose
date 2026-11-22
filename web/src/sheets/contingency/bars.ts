// Graphs of a contingency table: one bar per group (row), the outcomes
// (columns) stacked, as percentages of the group (the usual way to show
// such a table) or as counts, or side by side. Pure: the numbers each
// bar segment shows (plot.tsx draws them). Excluded cells count as blank.
import { parseCell, withExclusionsBlanked } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

export const GRAPH_CT_PERCENT = "contingency_stacked_percent";
export const GRAPH_CT_STACKED = "contingency_stacked_counts";
export const GRAPH_CT_GROUPED = "contingency_grouped_counts";

export const CT_GRAPH_LABELS: Record<string, string> = {
  [GRAPH_CT_PERCENT]: "Stacked bars, % of each group (row)",
  [GRAPH_CT_STACKED]: "Stacked bars, counts",
  [GRAPH_CT_GROUPED]: "Grouped bars, counts",
};

export const groupNames = (t: DataTableModel) =>
  t.x.map((_, r) => t.rowTitles[r]?.trim() || `Row ${r + 1}`);
export const outcomeNames = (t: DataTableModel) =>
  t.datasets.map((d, i) => d.name?.trim() || `Outcome ${i + 1}`);

export interface CtSeries {
  /** Outcome (column) name. */
  name: string;
  counts: (number | null)[];
  /** Percent of each group's (row's) total. */
  percent: (number | null)[];
}

/** One series per outcome, one value per group (row), with each group's
 *  total. Groups with no counts are left out. */
export function contingencyBars(t: DataTableModel):
  { groups: string[]; rows: number[]; series: CtSeries[]; totals: number[] } {
  const b = withExclusionsBlanked(t);
  const names = groupNames(t);
  const counts = b.datasets.map((d) => b.x.map((_, r) => parseCell(d.rows[r]?.[0] ?? "")));
  const rows = b.x.map((_, r) => r).filter((r) => counts.some((c) => c[r] !== null));
  const totals = rows.map((r) => counts.reduce((a, c) => a + (c[r] ?? 0), 0));
  return {
    groups: rows.map((r) => names[r]),
    rows,
    totals,
    series: outcomeNames(t).map((name, d) => ({
      name,
      counts: rows.map((r) => counts[d][r]),
      percent: rows.map((r, k) => (counts[d][r] !== null && totals[k] > 0 ? 100 * (counts[d][r] as number) / totals[k] : null)),
    })),
  };
}

export function ctAutoTitles(graphType: string) {
  return (t: DataTableModel) => ({ x: "", y: graphType === GRAPH_CT_PERCENT ? "Percent of group" : t.yTitle || "Count" });
}
