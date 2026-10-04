// Under a graph: its figure legend (what is plotted, n and unit, test,
// correction, star scale, software), with Copy. The only legend card under
// a graph: open when the graph's "Legend sentence" option is "Under the
// graph" (the default for new column and grouped graphs), folded
// otherwise. The "what is plotted" clause is the figure package's legend
// sentence (graph/legend.ts), so the two never disagree.
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
  const open = captionBelow(graph);
  if (!text) return null;
  return (
    <details className="figure-legend" open={open} key={open ? "open" : "folded"}>
      <summary>Figure legend</summary>
      <p className="figure-legend-text">{text}</p>
      <CopyButton text={text} label="Copy legend" />
    </details>
  );
}

/** The graph asks for its legend under it (column and grouped graphs). */
function captionBelow(g: GraphSheet): boolean {
  const own = (g.settings.column ?? g.settings.grouped) as { caption?: unknown } | undefined;
  return own?.caption === "below";
}
