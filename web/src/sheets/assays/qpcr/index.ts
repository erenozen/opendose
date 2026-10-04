// qPCR relative quantification (assay module). Input: long Cq records;
// analysis: engine assay_qpcr.qpcr_analysis (replicate QC, efficiency-
// weighted ΔCq with the geometric mean of reference genes, statistics on
// ΔCq, fold changes with asymmetric CIs); output: a linked ΔCq table.
import { lazyPart } from "../../lazy";
import { defineAnalysis, defineGraph } from "../../types";
import type { AssayModule } from "../index";
import {
  dcqTable, DEFAULT_QPCR_OPTIONS, normalizeQpcrOptions, readQpcr, runQpcr, type QpcrOptions, type QpcrResult,
} from "./model";
import { emptyQpcr, qpcrSample } from "./sample";

export const ANALYSIS_ASSAY_QPCR = "assay_qpcr";
export const GRAPH_ASSAY_QPCR = "assay_qpcr_fold";

const panels = () => import("./panels");
const plots = () => import("./plot");

export const qpcrAnalysis = defineAnalysis<QpcrOptions, QpcrResult>({
  id: ANALYSIS_ASSAY_QPCR,
  label: "qPCR relative quantification (ΔCq, ΔΔCq, efficiency-corrected)",
  short: "qPCR",
  description: "Technical-replicate QC, reference-gene normalisation, statistics on ΔCq and "
    + "fold changes with asymmetric CIs on a log2 axis.",
  sheetName: (t) => `qPCR of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_QPCR_OPTIONS }),
  normalizeOptions: (raw) => normalizeQpcrOptions(raw),
  run: (engine, table, options) => runQpcr((p) => engine.analyze(p), table, options),
  defaultGraph: GRAPH_ASSAY_QPCR,
  derivedTable: (result) => dcqTable(result),
  derivedName: (t) => `ΔCq of ${t}`,
  derivedOnDemand: true,
  ControlsPanel: lazyPart(panels, "QpcrControls"),
  ResultsPanel: lazyPart(panels, "QpcrResults"),
  MethodsPanel: lazyPart(panels, "QpcrMethods"),
});

export const qpcrGraph = defineGraph<QpcrOptions, QpcrResult>({
  id: GRAPH_ASSAY_QPCR,
  label: "Fold change (log2 axis)",
  group: "assay_qpcr",
  analysis: ANALYSIS_ASSAY_QPCR,
  autoTitles: () => ({ x: "", y: "Fold change vs calibrator" }),
  showXTitle: false,
  exportName: "qpcr-fold-change",
  sheetName: (t) => `Fold change of ${t}`,
  PlotPanel: lazyPart(plots, "QpcrFoldPlot"),
  OptionsPanel: lazyPart(plots, "QpcrFoldOptions"),
  formatFeatures: { points: true, errorBars: true, categoryX: true },
  formatDatasets: (table, _g, options) => readQpcr(table, normalizeQpcrOptions(options)).groups,
});

export const qpcrAssay: AssayModule = {
  id: "qpcr",
  label: "qPCR (ΔCq / ΔΔCq)",
  description: "Cq records from the instrument export: replicate QC, reference genes, "
    + "efficiencies, statistics on ΔCq and fold changes on a log2 axis (MIQE 2.0).",
  tableType: "multivariable",
  tableName: "qPCR",
  emptyTable: emptyQpcr,
  sampleTable: qpcrSample,
  mainAnalysis: ANALYSIS_ASSAY_QPCR,
  wizard: true,
  analyses: [{ def: qpcrAnalysis, types: ["multivariable"] }],
  graphs: [{ def: qpcrGraph, types: ["multivariable"] }],
};
