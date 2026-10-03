import { ANALYSIS_NONLIN, GRAPH_XY } from "../../project/builtin";
import { emptyTable } from "../../project/table";
import type { AnalysisResult, OptionsState } from "../../types";
import { DEFAULT_XY_OPTIONS } from "../../types";
import { columnAnalysis, columnGraphs } from "../column";
import DataGrid from "../common/DataGrid";
import { defineAnalysis, defineGraph, type TableTypeDef } from "../types";
import {
  NonlinControls, NonlinMethods, NonlinResults, PlateAside, XYPlot,
} from "./panels";
import { runNonlin, xyAutoTitles } from "./run";
import {
  ANALYSIS_DEMING, DEFAULT_DEMING, demingPayload, demingResult, GRAPH_DEMING,
  normalizeDeming, type DemingOptions,
} from "./deming";
import { DemingControls, DemingMethods, DemingResults } from "./demingPanels";
import { xySample } from "./sample";

export const nonlinAnalysis = defineAnalysis<OptionsState, AnalysisResult>({
  id: ANALYSIS_NONLIN,
  label: "Nonlinear regression (curve fit)",
  short: "Curve fit",
  description: "Dose-response, kinetics, binding, exponential and polynomial models.",
  sheetName: (t) => `Nonlin fit of ${t}`,
  defaultOptions: ({ prefs }) => ({
    ...DEFAULT_XY_OPTIONS,
    errorBars: prefs.errorBars,
    ciMethod: prefs.ciMethod,
  }),
  normalizeOptions: (raw, { prefs }) => ({
    ...DEFAULT_XY_OPTIONS,
    errorBars: prefs.errorBars,
    ciMethod: prefs.ciMethod,
    ...(raw && typeof raw === "object" ? raw as Partial<OptionsState> : {}),
  }),
  run: runNonlin,
  defaultGraph: GRAPH_XY,
  ControlsPanel: NonlinControls,
  ResultsPanel: NonlinResults,
  MethodsPanel: NonlinMethods,
});

export const xyGraph = defineGraph<OptionsState, AnalysisResult>({
  id: GRAPH_XY,
  label: "XY: points, error bars and fitted curve",
  group: "xy",
  analysis: ANALYSIS_NONLIN,
  autoTitles: xyAutoTitles,
  exportName: "dose-response",
  PlotPanel: XYPlot,
});

export const demingAnalysis = defineAnalysis<DemingOptions, Record<string, unknown>>({
  id: ANALYSIS_DEMING,
  label: "Deming regression (errors in X and Y)",
  short: "Deming",
  description: "Model II straight line when X and Y are both measured with error "
    + "(method comparison).",
  sheetName: (t) => `Deming fit of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_DEMING }),
  normalizeOptions: (raw) => normalizeDeming(raw),
  run: (engine, table, options) => {
    const p = demingPayload(table, options);
    if ("error" in p) return p;
    return demingResult(engine.analyze(p), table);
  },
  defaultGraph: GRAPH_DEMING,
  ControlsPanel: DemingControls,
  ResultsPanel: DemingResults,
  MethodsPanel: DemingMethods,
});

// The XY graph draws the Deming line exactly as it draws a fitted curve.
export const demingGraph = defineGraph<DemingOptions, AnalysisResult>({
  id: GRAPH_DEMING,
  label: "XY: points and Deming regression line",
  group: "deming",
  analysis: ANALYSIS_DEMING,
  autoTitles: (table) => ({
    x: table.xTitle && table.xTitle !== "X" ? table.xTitle : "X",
    y: table.yTitle || "Y",
  }),
  exportName: "deming",
  PlotPanel: XYPlot as never,
});

export const xyTable: TableTypeDef = {
  type: "xy",
  label: "XY",
  short: "XY",
  description: "Every row has an X value (dose, concentration, time) and one or "
    + "more Y values, optionally with replicates side by side. For curve fitting "
    + "and regression.",
  status: "ready",
  defaultTable: (init) => emptyTable("xy", init),
  sampleTable: xySample,
  sampleName: "Dose response",
  Editor: DataGrid,
  EditorAside: PlateAside,
  analyses: [nonlinAnalysis, demingAnalysis, columnAnalysis],
  graphs: [xyGraph, demingGraph, ...columnGraphs],
};
