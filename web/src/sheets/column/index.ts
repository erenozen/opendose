import { ANALYSIS_COLUMN } from "../../project/builtin";
import { emptyTable, normalizeTable } from "../../project/table";
import type { ColumnGraphType, ColumnOptionsState } from "../../types";
import { COLUMN_GRAPH_LABELS, DEFAULT_COLUMN_OPTIONS } from "../../types";
import DataGrid from "../common/DataGrid";
import { lazyPart } from "../lazy";
import { defineAnalysis, defineGraph, type TableTypeDef } from "../types";
import {
  ANALYSIS_BLAND_ALTMAN, defaultBaOptions, normalizeBaOptions, runBa, type BaOptions,
  type BaResult,
} from "./blandAltman";
import {
  ANALYSIS_ROC, defaultRocOptions, normalizeRocOptions, rocCurveNames, runRoc, type RocOptions,
  type RocResult,
} from "./roc";
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

// ROC and Bland-Altman panels load on first use (sheets/lazy.ts).
const rocModule = () => import("./rocPanels");
const baModule = () => import("./baPanels");

export const rocAnalysis = defineAnalysis<RocOptions, RocResult>({
  id: ANALYSIS_ROC,
  label: "ROC curve (AUC, cut-offs, compare two markers)",
  short: "ROC",
  description: "Area under the ROC curve with its CI, the optimal cut-off with sensitivity, "
    + "specificity, likelihood ratios and predictive values, partial AUC, and DeLong's "
    + "comparison of two curves.",
  sheetName: (t) => `ROC of ${t}`,
  defaultOptions: ({ table }) => defaultRocOptions(table),
  normalizeOptions: (raw, { table }) => normalizeRocOptions(raw, table),
  run: runRoc,
  defaultGraph: "roc_curve",
  ControlsPanel: lazyPart(rocModule, "RocControls"),
  ResultsPanel: lazyPart(rocModule, "RocResults"),
  MethodsPanel: lazyPart(rocModule, "RocMethods"),
});

export const rocGraph = defineGraph<RocOptions, RocResult>({
  id: "roc_curve",
  label: "ROC curves with the optimal cut-off",
  group: "roc",
  analysis: ANALYSIS_ROC,
  autoTitles: () => ({ x: "", y: "" }),
  exportName: "roc-curve",
  PlotPanel: lazyPart(rocModule, "RocPlot"),
  formatDatasets: (table, _g, options) => rocCurveNames(table, options),
  formatFeatures: { lines: true, color: true },
});

export const blandAltmanAnalysis = defineAnalysis<BaOptions, BaResult>({
  id: ANALYSIS_BLAND_ALTMAN,
  label: "Bland-Altman method comparison (limits with CIs)",
  short: "Bland-Altman",
  description: "Bias and limits of agreement with confidence intervals, proportional bias, "
    + "ratio and percent differences, and repeated measurements per subject.",
  sheetName: (t) => `Bland-Altman of ${t}`,
  defaultOptions: () => defaultBaOptions(),
  normalizeOptions: (raw) => normalizeBaOptions(raw),
  run: runBa,
  defaultGraph: "bland_altman_plot",
  ControlsPanel: lazyPart(baModule, "BaControls"),
  ResultsPanel: lazyPart(baModule, "BaResults"),
  MethodsPanel: lazyPart(baModule, "BaMethods"),
});

export const blandAltmanGraph = defineGraph<BaOptions, BaResult>({
  id: "bland_altman_plot",
  label: "Bland-Altman plot",
  group: "bland_altman",
  analysis: ANALYSIS_BLAND_ALTMAN,
  autoTitles: () => ({ x: "", y: "" }),
  exportName: "bland-altman",
  PlotPanel: lazyPart(baModule, "BaPlot"),
  formatDatasets: () => ["Differences"],
  formatFeatures: { points: true, lines: true },
});

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
  analyses: [columnAnalysis, rocAnalysis, blandAltmanAnalysis],
  graphs: [...columnGraphs, rocGraph, blandAltmanGraph],
};
