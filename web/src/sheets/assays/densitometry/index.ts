// Western blot densitometry (assay module). Input: lane records; analysis:
// engine assay_densitometry.densitometry (background and loading-control
// normalisation, fold change within blot, ratio paired t test or RM ANOVA
// on logs with blot as the unit); output: a linked matched table.
import { lazyPart } from "../../lazy";
import { defineAnalysis, defineGraph } from "../../types";
import type { AssayModule } from "../index";
import {
  DEFAULT_DENS_OPTIONS, matchedTable, normalizeDensOptions, readLanes, runDens,
  type DensOptions, type DensResult,
} from "./model";
import { densitometrySample, emptyDensitometry } from "./sample";

export const ANALYSIS_ASSAY_DENSITOMETRY = "assay_densitometry";
export const GRAPH_ASSAY_DENSITOMETRY = "assay_densitometry_fold";

const panels = () => import("./panels");
const plots = () => import("./plot");

export const densitometryAnalysis = defineAnalysis<DensOptions, DensResult>({
  id: ANALYSIS_ASSAY_DENSITOMETRY,
  label: "Western blot densitometry (fold change within blot, ratio t test)",
  short: "Densitometry",
  description: "Background and loading-control normalisation, fold change vs the control lanes "
    + "of each blot, ratio paired t test with blot as the pair.",
  sheetName: (t) => `Densitometry of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_DENS_OPTIONS }),
  normalizeOptions: (raw) => normalizeDensOptions(raw),
  run: (engine, table, options) => runDens((p) => engine.analyze(p), table, options),
  defaultGraph: GRAPH_ASSAY_DENSITOMETRY,
  derivedTable: (result) => matchedTable(result),
  derivedName: (t) => `Normalised bands of ${t}`,
  derivedOnDemand: true,
  ControlsPanel: lazyPart(panels, "DensControls"),
  ResultsPanel: lazyPart(panels, "DensResults"),
  MethodsPanel: lazyPart(panels, "DensMethods"),
});

export const densitometryGraph = defineGraph<DensOptions, DensResult>({
  id: GRAPH_ASSAY_DENSITOMETRY,
  label: "Fold change by blot (log2 axis)",
  group: "assay_densitometry",
  analysis: ANALYSIS_ASSAY_DENSITOMETRY,
  autoTitles: () => ({ x: "", y: "Fold change vs control" }),
  showXTitle: false,
  exportName: "densitometry",
  sheetName: (t) => `Fold change of ${t}`,
  PlotPanel: lazyPart(plots, "DensFoldPlot"),
  OptionsPanel: lazyPart(plots, "DensFoldOptions"),
  formatFeatures: { points: true, errorBars: true, categoryX: true },
  formatDatasets: (table, _g, options) => readLanes(table, normalizeDensOptions(options)).groups,
});

export const densitometryAssay: AssayModule = {
  id: "densitometry",
  label: "Western blot densitometry",
  description: "Lane intensities from ImageJ or Image Lab: background, loading-control "
    + "normalisation, fold change within blot and the ratio paired t test.",
  tableType: "multivariable",
  tableName: "Blots",
  emptyTable: emptyDensitometry,
  sampleTable: densitometrySample,
  mainAnalysis: ANALYSIS_ASSAY_DENSITOMETRY,
  analyses: [{ def: densitometryAnalysis, types: ["multivariable"] }],
  graphs: [{ def: densitometryGraph, types: ["multivariable"] }],
};
