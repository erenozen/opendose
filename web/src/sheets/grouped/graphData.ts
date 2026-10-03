// What the grouped graphs need besides their traces (pure): the series
// Format graph lists as data sets, and XY tables read as grouped tables.
import type { DataTableModel, GraphSheet } from "../../project/types";
import { clusterByFor } from "./buildGrouped";
import { groupedDatasetLabels, groupedRowLabels } from "./comparisons";
import { G_THREE_WAY, normalizeGraph, type ThreeWayOptions } from "./options";

export const isThreeWayOptions = (o: unknown): o is ThreeWayOptions =>
  !!o && typeof o === "object" && Array.isArray((o as ThreeWayOptions).assign)
  && Array.isArray((o as ThreeWayOptions).bLevels);

/** What Format graph lists as data sets on a grouped graph: the series
 *  (one colour each), which are the data sets, the rows when clustered by
 *  data set, or the factor B levels of the three-way graph. */
export function groupedFormatDatasets(table: DataTableModel, graph: GraphSheet,
  options: unknown): string[] {
  const kind = graph.graphType;
  if (kind === G_THREE_WAY) {
    const b = isThreeWayOptions(options) ? options.bLevels : ["B1", "B2"];
    return b.map((n, i) => n.trim() || `B${i + 1}`);
  }
  const s = normalizeGraph(graph.settings.grouped);
  return clusterByFor(kind, s) === "rows" ? groupedDatasetLabels(table)
    : groupedRowLabels(table);
}

/** An XY table read as a grouped one: each X row is a level of the row
 *  factor (titled by its row title, else its X value), each data set a
 *  level of the other. */
export function rowsFromX(t: DataTableModel): DataTableModel {
  return {
    ...t,
    rowTitles: t.x.map((x, i) => t.rowTitles[i]?.trim() || x.trim() || `Row ${i + 1}`),
  };
}

export const xyGroupedFormatDatasets = (t: DataTableModel, g: GraphSheet) =>
  groupedFormatDatasets(rowsFromX(t), g, null);

