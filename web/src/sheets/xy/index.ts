import { ANALYSIS_NONLIN, GRAPH_XY } from "../../project/builtin";
import { emptyTable } from "../../project/table";
import type { AnalysisResult, OptionsState } from "../../types";
import { DEFAULT_XY_OPTIONS } from "../../types";
import {
  blandAltmanAnalysis, blandAltmanGraph, columnAnalysis, columnGraphs, rocAnalysis, rocGraph,
} from "../column";
import { lazyPart } from "../lazy";
import {
  ANALYSIS_QUANTAL, defaultQuantalOptions, normalizeQuantalOptions, runQuantal,
  type QuantalOptions, type QuantalResult,
} from "./quantal";
import { xyGroupedGraphs } from "../grouped";
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
  formatFeatures: { points: true, lines: true, connect: true, errorBars: true, xError: true },
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

// Quantal dose-response panels load on first use (sheets/lazy.ts).
const quantalModule = () => import("./quantalPanels");

export const quantalAnalysis = defineAnalysis<QuantalOptions, QuantalResult>({
  id: ANALYSIS_QUANTAL,
  label: "Quantal dose-response (probit / logit, LD50)",
  short: "Quantal",
  description: "Responders out of N at each dose: probit, logit or cloglog fit, LD50 and "
    + "other effective doses with Fieller CIs, heterogeneity, parallel lines and relative potency.",
  sheetName: (t) => `Quantal fit of ${t}`,
  defaultOptions: () => defaultQuantalOptions(),
  normalizeOptions: (raw) => normalizeQuantalOptions(raw),
  run: runQuantal,
  defaultGraph: "quantal",
  ControlsPanel: lazyPart(quantalModule, "QuantalControls"),
  ResultsPanel: lazyPart(quantalModule, "QuantalResults"),
  MethodsPanel: lazyPart(quantalModule, "QuantalMethods"),
});

export const quantalGraph = defineGraph<QuantalOptions, QuantalResult>({
  id: "quantal",
  label: "Percent responding with the fitted curve",
  group: "quantal",
  analysis: ANALYSIS_QUANTAL,
  autoTitles: (table) => ({ x: table.xTitle && table.xTitle !== "X" ? table.xTitle : "Dose", y: "Percent responding" }),
  exportName: "quantal-dose-response",
  PlotPanel: lazyPart(quantalModule, "QuantalPlot"),
  formatDatasets: (table, _g, options) => {
    const o = normalizeQuantalOptions(options);
    if (o.layout === "pairs") {
      return table.datasets.filter((_, i) => i % 2 === 0 && i + 1 < table.datasets.length).map((d) => d.name);
    }
    return table.datasets.map((d) => d.name);
  },
  formatFeatures: { points: true, lines: true, errorBars: true },
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
  analyses: [nonlinAnalysis, demingAnalysis, quantalAnalysis, columnAnalysis, rocAnalysis,
    blandAltmanAnalysis],
  graphs: [xyGraph, demingGraph, quantalGraph, ...xyGroupedGraphs, ...columnGraphs, rocGraph,
    blandAltmanGraph],
};
