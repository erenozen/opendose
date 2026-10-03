import { ANALYSIS_NONLIN, GRAPH_XY } from "../../project/builtin";
import { emptyTable } from "../../project/table";
import type { AnalysisResult, OptionsState } from "../../types";
import { DEFAULT_XY_OPTIONS } from "../../types";
import { columnAnalysis, columnGraphs } from "../column";
import { xyGroupedGraphs } from "../grouped";
import DataGrid from "../common/DataGrid";
import { defineAnalysis, defineGraph, type TableTypeDef } from "../types";
import {
  NonlinControls, NonlinMethods, NonlinResults, PlateAside, XYPlot,
} from "./panels";
import { runNonlin, xyAutoTitles } from "./run";
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
  formatFeatures: { points: true, lines: true, connect: true, errorBars: true, xError: true },
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
  analyses: [nonlinAnalysis, columnAnalysis],
  graphs: [xyGraph, ...xyGroupedGraphs, ...columnGraphs],
};
