import { ANALYSIS_COLUMN } from "../../project/builtin";
import { emptyTable, normalizeTable } from "../../project/table";
import type { ColumnGraphType, ColumnOptionsState } from "../../types";
import { COLUMN_GRAPH_LABELS, DEFAULT_COLUMN_OPTIONS } from "../../types";
import DataGrid from "../common/DataGrid";
import { defineAnalysis, defineGraph, type TableTypeDef } from "../types";
import { ColumnMethods } from "./methods";
import { ColumnAnalysisControls, ColumnAnalysisResults, ColumnGraph } from "./panels";
import { runColumn } from "./run";

export const columnAnalysis = defineAnalysis<ColumnOptionsState, Record<string, unknown>>({
  id: ANALYSIS_COLUMN,
  label: "Column analyses (t tests, ANOVA, nonparametric, …)",
  short: "Column stats",
  description: "Descriptive statistics and normality, t tests, one- and two-way "
    + "ANOVA (Welch and Brown-Forsythe too), nonparametric tests, median test, "
    + "correlation, ROC, Bland-Altman, outliers.",
  sheetName: (t) => `Column stats of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_COLUMN_OPTIONS }),
  normalizeOptions: (raw) => ({
    ...DEFAULT_COLUMN_OPTIONS,
    ...(raw && typeof raw === "object" ? raw as Partial<ColumnOptionsState> : {}),
  }),
  run: runColumn,
  defaultGraph: "scatter",
  ControlsPanel: ColumnAnalysisControls,
  ResultsPanel: ColumnAnalysisResults,
  MethodsPanel: ColumnMethods,
});

export const columnGraphs = (Object.keys(COLUMN_GRAPH_LABELS) as ColumnGraphType[])
  .map((id) => defineGraph({
    id,
    label: COLUMN_GRAPH_LABELS[id],
    group: "column",
    analysis: null,
    autoTitles: (table) => ({ x: "", y: table.yTitle || "Value" }),
    showXTitle: false,
    exportName: "column-graph",
    PlotPanel: ColumnGraph,
    formatFeatures: {
      categorical: true, points: true,
      errorBars: id === "scatter" || id === "bar",
      bars: id === "bar", boxes: id === "box" || id === "violin",
    },
  }));

function columnSample() {
  return normalizeTable({
    type: "column",
    datasets: [
      { name: "Control", rows: [["23.1"], ["25.4"], ["21.8"], ["24.9"], ["22.6"], ["26.0"]] },
      { name: "Treated A", rows: [["28.4"], ["30.2"], ["27.1"], ["31.5"], ["29.0"], ["28.8"]] },
      { name: "Treated B", rows: [["35.2"], ["33.9"], ["37.4"], ["34.1"], ["36.6"], ["35.8"]] },
    ],
  });
}

export const columnTable: TableTypeDef = {
  type: "column",
  label: "Column",
  short: "Col",
  description: "Each column is one group; values for that group run down the "
    + "rows. For comparing groups: t tests, one-way ANOVA, descriptive stats.",
  status: "ready",
  defaultTable: (init) => emptyTable("column", init),
  sampleTable: columnSample,
  sampleName: "Group comparison",
  Editor: DataGrid,
  analyses: [columnAnalysis],
  graphs: columnGraphs,
};
