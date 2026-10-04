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
import { runNonlinGated, xyAutoTitles } from "./run";
import {
  ANALYSIS_LINREG, DEFAULT_LINREG, GRAPH_LINREG, normalizeLinreg, runLinreg, type LinregOptions,
} from "./linreg";
import { LinregControls, LinregMethods, LinregResults } from "./linregPanels";
import {
  ANALYSIS_COMPARE, DEFAULT_COMPARE, GRAPH_COMPARE, normalizeCompare, runCompare,
  type CompareOptions,
} from "./compareFits";
import { CompareControls, CompareMethods, CompareResults } from "./compareFitsPanels";
import { modelMeta } from "../../lib/modelLibrary";
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
  // A new results sheet fits by itself only when the data look like a
  // dose-response (sheets/xy/autofit.ts); options saved without the field
  // (older projects, templates) fit as they always did.
  defaultOptions: ({ prefs }) => ({
    ...DEFAULT_XY_OPTIONS,
    errorBars: prefs.errorBars,
    ciMethod: prefs.ciMethod,
    autoFit: "auto",
  }),
  normalizeOptions: (raw, { prefs }) => {
    const r = raw && typeof raw === "object" ? raw as Partial<OptionsState> : {};
    return {
      ...DEFAULT_XY_OPTIONS,
      errorBars: prefs.errorBars,
      ciMethod: prefs.ciMethod,
      ...r,
      autoFit: r.autoFit === "auto" ? "auto" : "requested",
    };
  },
  run: runNonlinGated,
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

export const linregAnalysis = defineAnalysis<LinregOptions, Record<string, unknown>>({
  id: ANALYSIS_LINREG,
  label: "Linear regression",
  short: "Linear regression",
  description: "Straight line by least squares: slope and intercept with CIs, R², the "
    + "regression ANOVA, runs test; optionally through the origin.",
  sheetName: (t) => `Linear regression of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_LINREG }),
  normalizeOptions: (raw) => normalizeLinreg(raw),
  run: runLinreg,
  defaultGraph: GRAPH_LINREG,
  ControlsPanel: LinregControls,
  ResultsPanel: LinregResults,
  MethodsPanel: LinregMethods,
});

const tableTitles = (table: { xTitle: string; yTitle: string }) => ({
  x: table.xTitle && table.xTitle !== "X" ? table.xTitle : "X",
  y: table.yTitle || "Y",
});

export const linregGraph = defineGraph<LinregOptions, AnalysisResult>({
  id: GRAPH_LINREG,
  label: "XY: points and regression line",
  group: "linreg",
  analysis: ANALYSIS_LINREG,
  autoTitles: (table) => tableTitles(table),
  exportName: "linear-regression",
  PlotPanel: XYPlot as never,
  formatFeatures: { points: true, lines: true, connect: true, errorBars: true, xError: true },
});

export const compareAnalysis = defineAnalysis<CompareOptions, Record<string, unknown>>({
  id: ANALYSIS_COMPARE,
  label: "Compare fits (F test, AICc)",
  short: "Compare fits",
  description: "Two models on each data set, or one curve for all data sets against a "
    + "separate curve for each: extra-sum-of-squares F test and AICc.",
  sheetName: (t) => `Comparison of fits of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_COMPARE }),
  normalizeOptions: (raw) => normalizeCompare(raw),
  run: runCompare,
  defaultGraph: GRAPH_COMPARE,
  ControlsPanel: CompareControls,
  ResultsPanel: CompareResults,
  MethodsPanel: CompareMethods,
});

export const compareGraph = defineGraph<CompareOptions, AnalysisResult>({
  id: GRAPH_COMPARE,
  label: "XY: points and the compared fits",
  group: "compare_fits",
  analysis: ANALYSIS_COMPARE,
  autoTitles: (table, options) => {
    const o = options ? normalizeCompare(options) : DEFAULT_COMPARE;
    const meta = modelMeta(o.model1);
    if (table.xFormat !== "numbers" || !meta.needsLogX) return tableTitles(table);
    return { x: `${meta.xLabel}, ${table.xUnit || "M"}`, y: table.yTitle || "Response" };
  },
  exportName: "compare-fits",
  PlotPanel: XYPlot as never,
  formatFeatures: { points: true, lines: true, connect: true, errorBars: true, xError: true },
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
  analyses: [nonlinAnalysis, linregAnalysis, compareAnalysis, demingAnalysis, quantalAnalysis,
    columnAnalysis, rocAnalysis, blandAltmanAnalysis],
  graphs: [xyGraph, linregGraph, compareGraph, demingGraph, quantalGraph, ...xyGroupedGraphs,
    ...columnGraphs, rocGraph, blandAltmanGraph],
};
