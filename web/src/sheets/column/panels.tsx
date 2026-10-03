import { useMemo } from "react";
import ColumnControls from "../../components/ColumnControls";
import { extractComparisons, resultBlocks } from "../../graph";
import ColumnPlot from "../../components/ColumnPlot";
import StatsResults from "../../components/StatsResults";
import type { ColumnGraphType, ColumnOptionsState } from "../../types";
import type { ControlsProps, PlotProps, ResultsProps } from "../types";
import SummaryPlot from "./SummaryPlot";

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
  // Comparisons of the bound results (ANOVA post tests, t tests, ...) feed
  // the pairwise brackets and the compact letter display.
  const comparisons = useMemo(() => extractComparisons(result,
    table.datasets.map((d) => d.name))?.comparisons, [result, table.datasets]);
  const results = useMemo(() => resultBlocks(result), [result]);
  if (table.subcolumnFormat !== "replicates") {
    return <SummaryPlot table={table} graphType={graph.graphType} scheme={scheme} yTitle={titles.y} />;
  }
  return (
    <ColumnPlot datasets={table.datasets}
      graphType={graph.graphType as ColumnGraphType}
      scheme={scheme} yTitle={titles.y} format={format} onFormatChange={onFormatChange}
      rowTitles={table.rowTitles} comparisons={comparisons} results={results} />
  );
}
