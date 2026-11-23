// The graph-type select's words for the column graphs: say what the graph
// draws with its own settings and the bound analysis, so "Scatter" reads
// "median with IQR" under a rank test (P-26) or "geometric mean ×/÷
// geometric SD" when that is chosen (P-25), never a fixed "mean ± SD".
// Only words: no setting changes. Where the centre is not the graph's
// choice (summary data as entered, SuperPlot mode) the neutral label
// (types.ts COLUMN_GRAPH_LABELS) stays. Pure; unit-tested.
import { COLUMN_GRAPH_LABELS, type ColumnGraphType } from "../../types.ts";
import type { DataTableModel, GraphSheet } from "../../project/types.ts";
import { superPlotOn } from "../common/superplot.ts";
import { COLUMN_SUMMARY_LABELS, normalizeColumnGraph } from "./graphSettings.ts";
import { resolveSummary } from "./rankSummary.ts";

/** "Scatter (points + median with IQR)", "Bar (mean ± SD + points)". */
export function columnKindLabel(kind: ColumnGraphType, graph: Pick<GraphSheet, "settings">,
  table: DataTableModel, result: unknown, options: unknown): string {
  const base = COLUMN_GRAPH_LABELS[kind];
  if (kind !== "scatter" && kind !== "bar") return base;
  const s = normalizeColumnGraph(graph.settings.column);
  if (table.subcolumnFormat !== "replicates" || superPlotOn(s.superplot, result)) return base;
  const summary = resolveSummary(s.summary, options);
  const words = summary === "none" ? "mean, no error bars"
    : COLUMN_SUMMARY_LABELS[summary].replace(/^./, (c) => c.toLowerCase());
  return kind === "scatter" ? `Scatter (points + ${words})`
    : `Bar (${words}${s.points ? " + points" : ""})`;
}
