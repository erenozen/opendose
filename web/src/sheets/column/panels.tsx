import ColumnControls from "../../components/ColumnControls";
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

export function ColumnGraph({ graph, table, titles, scheme }: PlotProps) {
  if (table.subcolumnFormat !== "replicates") {
    return <SummaryPlot table={table} graphType={graph.graphType} scheme={scheme} yTitle={titles.y} />;
  }
  return (
    <ColumnPlot datasets={table.datasets}
      graphType={graph.graphType as ColumnGraphType}
      scheme={scheme} yTitle={titles.y} />
  );
}
