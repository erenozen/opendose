// "Combine experiments" (meta-analysis, P-92) and its forest plot,
// registered on grouped tables (sheets/grouped/index.ts): rows are the
// experiments, a summary format holds each estimate with its SE or CI.
import { lazyPart } from "../../sheets/lazy";
import { defineAnalysis, defineGraph } from "../../sheets/types";
import {
  ANALYSIS_META, DEFAULT_META, GRAPH_FOREST, normalizeMeta, runMeta, type MetaOptions,
} from "./run";

const panels = () => import("./panels");
const plot = () => import("./plot");

export const metaAnalysis = defineAnalysis<MetaOptions, Record<string, unknown>>({
  id: ANALYSIS_META,
  label: "Combine experiments (meta-analysis)",
  short: "Combine",
  description: "Pool an estimate and its SE (or CI) from each experiment with common- and "
    + "random-effects models: REML, Hartung-Knapp CI, τ², I² and a prediction interval.",
  sheetName: (t) => `Combined experiments of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_META }),
  normalizeOptions: (raw) => normalizeMeta(raw),
  run: runMeta,
  defaultGraph: GRAPH_FOREST,
  ControlsPanel: lazyPart(panels, "MetaControls"),
  ResultsPanel: lazyPart(panels, "MetaResults"),
  MethodsPanel: lazyPart(panels, "MetaMethods"),
});

export const forestGraph = defineGraph<MetaOptions, Record<string, unknown>>({
  id: GRAPH_FOREST,
  label: "Forest plot (estimates with CIs)",
  group: "meta",
  analysis: ANALYSIS_META,
  autoTitles: () => ({ x: "", y: "" }),
  exportName: "forest-plot",
  PlotPanel: lazyPart(plot, "ForestPlot"),
  OptionsPanel: lazyPart(plot, "ForestOptions"),
  formatFeatures: { noDatasets: true },
  sheetName: (t) => `Forest plot of ${t}`,
});
