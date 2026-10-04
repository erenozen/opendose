import { useMemo } from "react";
import ColumnControls from "../../components/ColumnControls";
import { extractComparisons, resultBlocks } from "../../graph";
import { graphPStyle } from "../../graph/significance";
import ColumnPlot from "../../components/ColumnPlot";
import StatsResults from "../../components/StatsResults";
import type { ColumnGraphType, ColumnOptionsState } from "../../types";
import type { ControlsProps, PlotProps, ResultsProps } from "../types";
import SummaryPlot from "./SummaryPlot";
import SuperPlotView from "./SuperPlotView";
import { normalizeColumnGraph } from "./graphSettings";
import { legendSentence } from "../../graph/legend";

import { superPlotOn } from "../common/superplot";

export function ColumnAnalysisControls({ table, options, onChange }:
  ControlsProps<ColumnOptionsState>) {
  return (
    <ColumnControls options={options}
      datasetNames={table.datasets.map((d) => d.name)}
      onChange={onChange} />
  );
}

export function ColumnAnalysisResults({ result }:
  ResultsProps<ColumnOptionsState, Record<string, unknown>>) {
  return <StatsResults result={result} />;
}

export function ColumnGraph({ graph, table, titles, scheme, result, format,
  onFormatChange }: PlotProps) {
  const raw = graph.settings.column;
  const cs = useMemo(() => normalizeColumnGraph(raw), [raw]);
  // Comparisons of the bound results (ANOVA post tests, t tests, ...) feed
  // the pairwise brackets and the compact letter display.
  const comparisons = useMemo(() => extractComparisons(result,
    table.datasets.map((d) => d.name))?.comparisons, [result, table.datasets]);
  const pStyle = graphPStyle(format);
  const results = useMemo(() => resultBlocks(result, pStyle), [result, pStyle]);
  // "Under the graph" is the figure-legend card of the graph card
  // (report/GraphLegend.tsx, open in that mode); "In the figure" draws the
  // short legend sentence into the figure itself.
  const inFigure = useMemo(() => (cs.caption === "figure"
    ? legendSentence(graph, table, result) || undefined : undefined),
  [cs.caption, graph, table, result]);
  const superOn = table.subcolumnFormat === "replicates" && superPlotOn(cs.superplot, result);
  let plot;
  if (superOn) {
    plot = (
      <SuperPlotView table={table} settings={cs.superplot} spread={cs.spread} scheme={scheme}
        yTitle={titles.y} format={format} onFormatChange={onFormatChange}
        comparisons={comparisons} results={results} caption={inFigure} />
    );
  } else if (table.subcolumnFormat !== "replicates") {
    plot = (
      <SummaryPlot table={table} graphType={graph.graphType} scheme={scheme} yTitle={titles.y}
        format={format} onFormatChange={onFormatChange} comparisons={comparisons}
        results={results} />
    );
  } else {
    plot = (
      <ColumnPlot datasets={table.datasets}
        graphType={graph.graphType as ColumnGraphType}
        scheme={scheme} yTitle={titles.y} format={format} onFormatChange={onFormatChange}
        rowTitles={table.rowTitles} comparisons={comparisons} results={results}
        summary={cs.summary} spread={cs.spread} points={cs.points} caption={inFigure} />
    );
  }
  return plot;
}
