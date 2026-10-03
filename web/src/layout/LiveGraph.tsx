import { useMemo } from "react";
import { useProject } from "../app/context";
import { useAnalysisResult } from "../app/useAnalysisResult";
import { findSheet } from "../project/ops";
import { withExclusionsBlanked } from "../project/table";
import type { DataSheet, DataTableModel, GraphSheet, ResultsSheet } from "../project/types";
import { graphDef, tableDef } from "../sheets/registry";

/**
 * A graph sheet drawn by its own plot panel (looked up in the sheets
 * registry, exactly as the workbench does), with its results computed if
 * nobody has yet. Used by layout placeholders and by batch export, which
 * size the surrounding box; the panel's `.plot` fills it.
 */
export default function LiveGraph({ graph }: { graph: GraphSheet }) {
  const { project } = useProject();
  const data = findSheet(project, graph.parentId) as DataSheet | undefined;
  const res = findSheet(project, graph.resultsId) as ResultsSheet | undefined;
  const live = useAnalysisResult(
    !graph.frozen && res?.kind === "results" ? res : null,
    data?.kind === "data" ? data.table : null);
  const snap = graph.frozen ? graph.snapshot : undefined;
  const table: DataTableModel | null = useMemo(() => (snap?.table
    ?? (data?.kind === "data" ? withExclusionsBlanked(data.table) : null)), [snap, data]);
  if (!data || data.kind !== "data" || !table) {
    return <div className="plot empty-hint">This graph&apos;s data table is missing.</div>;
  }
  const kind = graphDef(data.table.type, graph.graphType);
  const Plot = kind?.PlotPanel ?? tableDef(data.table.type).PlotPanel;
  const result = snap ? snap.result : live.result;
  const options = snap ? snap.options : live.options;
  const auto = kind ? kind.autoTitles(table, options) : { x: "", y: "" };
  const titles = {
    x: graph.settings.titles.x.trim() || auto.x,
    y: graph.settings.titles.y.trim() || auto.y,
  };
  if (!Plot) return <div className="plot empty-hint">No plot for this graph type.</div>;
  return <Plot graph={graph} table={table} options={options} result={result}
    titles={titles} scheme={graph.settings.scheme} />;
}
