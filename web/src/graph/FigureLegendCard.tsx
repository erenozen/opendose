// "Figure legend" card under the methods text: the legend sentence of the
// family's graph (legend.ts), ready to paste into the manuscript's figure
// legend next to the methods paragraph.
import { useMemo, useState } from "react";
import type { DataTableModel, GraphSheet } from "../project/types";
import { withExclusionsBlanked } from "../project/table";
import { legendSentence } from "./legend";

export default function FigureLegendCard({ graph, table, result }: {
  graph: GraphSheet | null | undefined;
  table: DataTableModel;
  result: unknown;
}) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => (graph ? legendSentence(graph,
    graph.snapshot?.table ?? withExclusionsBlanked(table), result) : ""), [graph, table, result]);
  if (!text) return null;
  return (
    <div className="result-card methods-text figure-legend-text">
      <h3>Figure legend</h3>
      <p>{text}</p>
      <button type="button" className="copy-btn" onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}>
        <span className="swap-label" key={copied ? "copied" : "copy"}>
          {copied ? "Copied ✓" : "Copy"}
        </span>
      </button>
    </div>
  );
}
