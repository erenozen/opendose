// The estimation analysis and its graph kind, registered on column and
// grouped tables (sheets/column/index.ts, sheets/grouped/index.ts).
import { lazyPart } from "../../sheets/lazy";
import { defineAnalysis, defineGraph } from "../../sheets/types";
import {
  ANALYSIS_ESTIMATION, DEFAULT_ESTIMATION, GRAPH_ESTIMATION, normalizeEstimation,
  runEstimation, type EstimationOptions,
} from "./run";

const panels = () => import("./panels");
const plot = () => import("./plot");

export const estimationAnalysis = defineAnalysis<EstimationOptions, Record<string, unknown>>({
  id: ANALYSIS_ESTIMATION,
  label: "Estimation plot (effect size with bootstrap CI)",
  short: "Estimation",
  description: "Gardner-Altman and Cumming estimation plots: the difference between "
    + "groups with its bootstrap confidence interval and a permutation P value.",
  sheetName: (t) => `Estimation of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_ESTIMATION }),
  normalizeOptions: (raw) => normalizeEstimation(raw),
  run: runEstimation,
  defaultGraph: GRAPH_ESTIMATION,
  ControlsPanel: lazyPart(panels, "EstimationControls"),
  ResultsPanel: lazyPart(panels, "EstimationResults"),
  MethodsPanel: lazyPart(panels, "EstimationMethods"),
});

export const estimationGraph = defineGraph<EstimationOptions, Record<string, unknown>>({
  id: GRAPH_ESTIMATION,
  label: "Estimation plot",
  group: "estimation",
  analysis: ANALYSIS_ESTIMATION,
  autoTitles: (t) => ({ x: "", y: t.yTitle || "Value" }),
  showXTitle: false,
  exportName: "estimation-plot",
  PlotPanel: lazyPart(plot, "EstimationPlot"),
  formatFeatures: { points: true, categoryX: true },
  sheetName: (t) => `Estimation plot of ${t}`,
});
