// Grouped tables: two grouping factors (rows × datasets) with replicates
// in subcolumns. Analyses: two-way ANOVA (ordinary, repeated measures,
// mixed-effects when values are missing), three-way ANOVA, multiple
// t tests one per row, row means / totals, column statistics. Graphs:
// interleaved / stacked / separated bars, grouped scatter, box plots,
// connected lines, the two-panel three-way graph, heat map, volcano plot.
import { emptyTable } from "../../project/table";
import type { DataTableModel } from "../../project/types";
import DataGrid from "../common/DataGrid";
import type { FormatFeatures } from "../../graph/format";
import { lazyPart } from "../lazy";
import { defineAnalysis, defineGraph, type TableTypeDef } from "../types";
import { groupedComparisons } from "./comparisons";
import { groupedFormatDatasets, xyGroupedFormatDatasets } from "./graphData";
import {
  A_COLUMN_STATS, A_MULTI_T, A_REPLICATE_MEANS, A_ROW_MEANS, A_THREE_WAY, A_TWO_WAY,
  DEFAULT_REP_TWO_WAY, normalizeRepTwoWay, type RepTwoWayOptions,
  DEFAULT_COLUMN_STATS, DEFAULT_MULTI_T, DEFAULT_ROW_MEANS, DEFAULT_TWO_WAY,
  defaultThreeWay, G_BOX, G_HEATMAP, G_INTERLEAVED, G_LINES, G_SCATTER, G_SEPARATED,
  G_STACKED, G_THREE_WAY, G_VOLCANO, LOG_TESTS, normalizeColumnStats, normalizeMultiT,
  normalizeRowMeans, normalizeThreeWay, normalizeTwoWay,
  type ColumnStatsOptions, type MultiTOptions, type RowMeansOptions,
  type ThreeWayOptions, type TwoWayOptions,
} from "./options";
import { runColumnStats, runMultiT, runRowMeans, runThreeWay, runTwoWay } from "./run";
import { runReplicateTwoWay } from "./replicateMeans";
import { rowMeansTable } from "./tables";
import { estimationAnalysis, estimationGraph } from "../../report/estimation";
import { groupedSample } from "./sample";

// Panels load on first use (sheets/lazy.ts).
const controlsModule = () => import("./controls");
const ColumnStatsControls = lazyPart(controlsModule, "ColumnStatsControls");
const MultiTControls = lazyPart(controlsModule, "MultiTControls");
const RowMeansControls = lazyPart(controlsModule, "RowMeansControls");
const ThreeWayControls = lazyPart(controlsModule, "ThreeWayControls");
const TwoWayControls = lazyPart(controlsModule, "TwoWayControls");
const graphsModule = () => import("./graphs");
const GroupedOptions = lazyPart(graphsModule, "GroupedOptions");
const GroupedPlot = lazyPart(graphsModule, "GroupedPlot");
const HeatMapPlot = lazyPart(graphsModule, "HeatMapPlot");
const HeatOptions = lazyPart(graphsModule, "HeatOptions");
const VolcanoOptions = lazyPart(graphsModule, "VolcanoOptions");
const VolcanoPlot = lazyPart(graphsModule, "VolcanoPlot");
const XYGroupedPlot = lazyPart(graphsModule, "XYGroupedPlot");
const methodsModule = () => import("./methods");
const ColumnStatsMethods = lazyPart(methodsModule, "ColumnStatsMethods");
const MultiTMethods = lazyPart(methodsModule, "MultiTMethods");
const RowMeansMethods = lazyPart(methodsModule, "RowMeansMethods");
const ThreeWayMethods = lazyPart(methodsModule, "ThreeWayMethods");
const TwoWayMethods = lazyPart(methodsModule, "TwoWayMethods");
const repModule = () => import("./replicateMeansPanels");
const RepTwoWayControls = lazyPart(repModule, "RepTwoWayControls");
const RepTwoWayResults = lazyPart(repModule, "RepTwoWayResults");
const RepTwoWayMethods = lazyPart(repModule, "RepTwoWayMethods");
const resultsModule = () => import("./results");
const ColumnStatsResults = lazyPart(resultsModule, "ColumnStatsResults");
const MultiTResults = lazyPart(resultsModule, "MultiTResults");
const RowMeansResults = lazyPart(resultsModule, "RowMeansResults");
const ThreeWayResults = lazyPart(resultsModule, "ThreeWayResults");
const TwoWayResults = lazyPart(resultsModule, "TwoWayResults");

type Result = Record<string, unknown>;

export const twoWayAnalysis = defineAnalysis<TwoWayOptions, Result>({
  id: A_TWO_WAY,
  label: "Two-way ANOVA (or mixed model)",
  short: "Two-way ANOVA",
  description: "Rows × datasets, ordinary or repeated measures; a mixed-effects "
    + "model when repeated values are missing. Tukey, Šídák or Bonferroni comparisons.",
  sheetName: (t) => `Two-way ANOVA of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_TWO_WAY }),
  normalizeOptions: (raw) => normalizeTwoWay(raw),
  run: runTwoWay,
  defaultGraph: G_INTERLEAVED,
  ControlsPanel: TwoWayControls,
  ResultsPanel: TwoWayResults,
  MethodsPanel: TwoWayMethods,
});

export const repTwoWayAnalysis = defineAnalysis<RepTwoWayOptions, Result>({
  id: A_REPLICATE_MEANS,
  label: "Two-way ANOVA on replicate means (SuperPlot)",
  short: "Replicate means",
  description: "Summarise each experiment's subcolumns first, then run the two-way "
    + "ANOVA on the experiment means (n = number of experiments), matched by "
    + "experiment by default.",
  sheetName: (t) => `Two-way ANOVA on replicate means of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_REP_TWO_WAY }),
  normalizeOptions: (raw) => normalizeRepTwoWay(raw),
  run: runReplicateTwoWay,
  defaultGraph: G_INTERLEAVED,
  ControlsPanel: RepTwoWayControls,
  ResultsPanel: RepTwoWayResults,
  MethodsPanel: RepTwoWayMethods,
});

export const threeWayAnalysis = defineAnalysis<ThreeWayOptions, Result>({
  id: A_THREE_WAY,
  label: "Three-way ANOVA",
  short: "Three-way ANOVA",
  description: "Rows are factor A; datasets A–D carry two more factors with two "
    + "levels each. Seven effects, cell means and multiple comparisons.",
  sheetName: (t) => `Three-way ANOVA of ${t}`,
  defaultOptions: ({ table }) => defaultThreeWay(table.datasets.length),
  normalizeOptions: (raw, { table }) => normalizeThreeWay(raw, table.datasets.length),
  run: runThreeWay,
  defaultGraph: G_THREE_WAY,
  ControlsPanel: ThreeWayControls,
  ResultsPanel: ThreeWayResults,
  MethodsPanel: ThreeWayMethods,
});

export const multiTAnalysis = defineAnalysis<MultiTOptions, Result>({
  id: A_MULTI_T,
  label: "Multiple t tests (one per row)",
  short: "Multiple t tests",
  description: "Compare two datasets row by row (t, lognormal, paired or "
    + "nonparametric tests), with FDR or family-wise correction.",
  sheetName: (t) => `Multiple t tests of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_MULTI_T }),
  normalizeOptions: (raw) => normalizeMultiT(raw),
  run: runMultiT,
  defaultGraph: G_VOLCANO,
  ControlsPanel: MultiTControls,
  ResultsPanel: MultiTResults,
  MethodsPanel: MultiTMethods,
});

export const rowMeansAnalysis = defineAnalysis<RowMeansOptions, Result>({
  id: A_ROW_MEANS,
  label: "Row means or totals",
  short: "Row means",
  description: "Mean, median, geometric mean or total of each row, with SD, "
    + "SEM, CI or percentiles.",
  sheetName: (t) => `Row means of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_ROW_MEANS }),
  normalizeOptions: (raw) => normalizeRowMeans(raw),
  run: runRowMeans,
  defaultGraph: null,
  ControlsPanel: RowMeansControls,
  ResultsPanel: RowMeansResults,
  MethodsPanel: RowMeansMethods,
  // "Make a linked data table" in the results.
  derivedOnDemand: true,
  derivedTable: (result, source) => (result.error || !Array.isArray(result.row_titles)
    ? null : rowMeansTable(result, source.yTitle.trim())),
  derivedName: (t) => `Row means of ${t}`,
});

export const columnStatsAnalysis = defineAnalysis<ColumnStatsOptions, Result>({
  id: A_COLUMN_STATS,
  label: "Column statistics",
  short: "Column stats",
  description: "Descriptive statistics and normality tests for each cell or "
    + "each dataset.",
  sheetName: (t) => `Column stats of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_COLUMN_STATS }),
  normalizeOptions: (raw) => normalizeColumnStats(raw),
  run: runColumnStats,
  defaultGraph: G_SCATTER,
  ControlsPanel: ColumnStatsControls,
  ResultsPanel: ColumnStatsResults,
  MethodsPanel: ColumnStatsMethods,
});

const yAuto = (t: DataTableModel) => ({ x: "", y: t.yTitle || "Value" });

/** Format graph controls per grouped graph kind. */
function groupedFeatures(id: string): FormatFeatures {
  switch (id) {
    case G_HEATMAP: return { noDatasets: true, noAxes: true };
    case G_SCATTER: return { points: true, errorBars: true, categoryX: true };
    case G_BOX: return { boxes: true, categoryX: true };
    case G_LINES: return { points: true, lines: true, errorBars: true, categoryX: true };
    default: return { bars: true, points: true, errorBars: true, categoryX: true };
  }
}

const rawGraph = (id: string, label: string, exportName: string) => defineGraph({
  id, label, group: "grouped", analysis: null,
  autoTitles: id === G_HEATMAP ? () => ({ x: "", y: "" }) : yAuto,
  showXTitle: false,
  exportName,
  PlotPanel: id === G_HEATMAP ? HeatMapPlot : GroupedPlot,
  OptionsPanel: id === G_HEATMAP ? HeatOptions : GroupedOptions,
  formatFeatures: groupedFeatures(id),
  ...(id === G_HEATMAP ? {} : {
    // Comparisons within rows / data sets / three-way cells land on bars.
    comparisons: groupedComparisons,
    formatDatasets: groupedFormatDatasets,
  }),
});

export const groupedGraphs = [
  rawGraph(G_INTERLEAVED, "Interleaved bars", "grouped-bars"),
  rawGraph(G_SEPARATED, "Separated bars", "separated-bars"),
  rawGraph(G_STACKED, "Stacked bars", "stacked-bars"),
  rawGraph(G_SCATTER, "Grouped scatter (points with mean)", "grouped-scatter"),
  rawGraph(G_BOX, "Interleaved box plots", "grouped-box"),
  rawGraph(G_LINES, "Connected lines across rows", "grouped-lines"),
  rawGraph(G_THREE_WAY, "Three-way: two panels by factor C", "three-way-graph"),
  rawGraph(G_HEATMAP, "Heat map", "heat-map"),
  defineGraph<MultiTOptions, Result>({
    id: G_VOLCANO,
    label: "Volcano plot",
    // Same group as the bar graphs, so a multiple t tests graph can switch
    // to bars (with a bracket per row); only offered on graphs of that
    // analysis (the switcher lists kinds of the bound analysis).
    group: "grouped",
    analysis: A_MULTI_T,
    autoTitles: (t, o) => {
      const names = t.datasets.map((d, i) => d.name || `Dataset ${i + 1}`);
      let a = names[o?.datasetA ?? 0] ?? "A";
      let b = names[o?.datasetB ?? 1] ?? "B";
      if (o?.swap) [a, b] = [b, a];
      const ratio = !!o && LOG_TESTS.includes(o.test);
      return { x: ratio ? `Ratio (${a} / ${b})` : `Difference (${a} − ${b})`, y: "−log10(P)" };
    },
    exportName: "volcano-plot",
    PlotPanel: VolcanoPlot,
    OptionsPanel: VolcanoOptions,
    formatFeatures: { noDatasets: true },
  }),
];

/** Grouped graphs offered on XY tables, X rows as the row factor. They
 *  share the XY graph's group, so the XY graph can switch to them. */
export const xyGroupedGraphs = ([
  [G_INTERLEAVED, "Grouped: interleaved bars (X rows as groups)", "grouped-bars"],
  [G_SEPARATED, "Grouped: separated bars", "separated-bars"],
  [G_STACKED, "Grouped: stacked bars", "stacked-bars"],
  [G_SCATTER, "Grouped: scatter (points with mean)", "grouped-scatter"],
  [G_BOX, "Grouped: box plots", "grouped-box"],
  [G_LINES, "Grouped: connected lines across rows", "grouped-lines"],
] as const).map(([id, label, exportName]) => defineGraph({
  id, label, group: "xy", analysis: null,
  autoTitles: (t: DataTableModel) => ({ x: "", y: t.yTitle || "Response" }),
  showXTitle: false,
  exportName,
  PlotPanel: XYGroupedPlot,
  OptionsPanel: GroupedOptions,
  formatFeatures: groupedFeatures(id),
  formatDatasets: xyGroupedFormatDatasets,
}));

export const groupedTable: TableTypeDef = {
  type: "grouped",
  label: "Grouped",
  short: "Grp",
  description: "Two grouping factors: rows are the levels of one (titled on "
    + "the left), columns the levels of the other, with replicates side by "
    + "side. For two-way ANOVA and grouped bar graphs.",
  status: "ready",
  defaultTable: (init) => emptyTable("grouped", init),
  sampleTable: groupedSample,
  sampleName: "Tumour growth",
  Editor: DataGrid,
  entryHint: "Title each row with a level of the first factor; each dataset "
    + "column is a level of the second factor. Replicates go side by side "
    + "in subcolumns.",
  analyses: [twoWayAnalysis, multiTAnalysis, threeWayAnalysis, rowMeansAnalysis,
    columnStatsAnalysis, repTwoWayAnalysis, estimationAnalysis],
  graphs: [...groupedGraphs, estimationGraph],
};
