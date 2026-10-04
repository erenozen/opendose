// Under a graph: its figure legend (what is plotted, n and unit, test,
// correction, star scale, software), folded by default, with Copy.
import { useMemo } from "react";
import { CopyButton } from "../components/CiteBlock";
import type { DataSheet, DataTableModel, GraphSheet } from "../project/types";
import { legendFor } from "./legendFor";
import { softwareLabel, useReportPrefs } from "./useReport";
import "./report.css";

export default function GraphLegend({ graph, data, table, result, options }: {
  graph: GraphSheet; data: DataSheet; table: DataTableModel; result: unknown; options: unknown;
}) {
  const prefs = useReportPrefs();
  const text = useMemo(() => legendFor({
    data, table, graph, result: graph.resultsId ? result : null, options, prefs,
    software: softwareLabel(),
  }), [data, table, graph, result, options, prefs]);
  if (!text) return null;
  return (
    <details className="figure-legend">
      <summary>Figure legend</summary>
      <p className="figure-legend-text">{text}</p>
      <CopyButton text={text} label="Copy legend" />
    </details>
  );
}
