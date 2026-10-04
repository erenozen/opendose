// Plate reader → dose-response (assay module). Input: the plate grid(s)
// in a multiple-variables table; analysis: plate map, normalisation and
// plate QC (engine assay_plate.plate_qc); outputs: linked XY tables of
// the normalised dose-response data, each with its curve fit set up.
import { lazyPart } from "../../lazy";
import { defineAnalysis, defineGraph } from "../../types";
import type { AssayModule } from "../index";
import {
  detectFormat, doseResponseTable, normalizePlateOptions, outputKeys, rowsLayout,
  runPlateQc, type PlateOptions, type PlateRun, DEFAULT_PLATE_OPTIONS,
} from "./model";
import { emptyPlate, plateSample } from "./sample";

export const ANALYSIS_ASSAY_PLATE = "assay_plate";
export const GRAPH_ASSAY_PLATE = "assay_plate_map";

const panels = () => import("./panels");
const plots = () => import("./plot");

export const plateAnalysis = defineAnalysis<PlateOptions, PlateRun>({
  id: ANALYSIS_ASSAY_PLATE,
  label: "Plate reader: plate map, QC and dose-response",
  short: "Plate QC",
  description: "Blank, vehicle and kill-control wells, % of control, Z′ and replicate CVs; "
    + "linked dose-response tables ready to fit.",
  sheetName: (t) => `Plate QC of ${t}`,
  defaultOptions: ({ table }) => ({ ...DEFAULT_PLATE_OPTIONS, format: detectFormat(table) }),
  normalizeOptions: (raw, { table }) => normalizePlateOptions(
    raw && typeof raw === "object" && "format" in raw ? raw : { ...(raw as object ?? {}), format: detectFormat(table) }),
  run: (engine, table, options) => runPlateQc((p) => engine.analyze(p), table, options),
  defaultGraph: GRAPH_ASSAY_PLATE,
  derivedTable: (result, _source, options) =>
    doseResponseTable(result, options, options.output ?? outputKeys(result, options)[0]),
  derivedName: (t) => `Dose-response of ${t}`,
  derivedOnDemand: true,
  ControlsPanel: lazyPart(panels, "PlateControls"),
  ResultsPanel: lazyPart(panels, "PlateResults"),
  MethodsPanel: lazyPart(panels, "PlateMethods"),
});

export const plateGraph = defineGraph<PlateOptions, PlateRun>({
  id: GRAPH_ASSAY_PLATE,
  label: "Plate heat map",
  group: "assay_plate",
  analysis: ANALYSIS_ASSAY_PLATE,
  autoTitles: () => ({ x: "Column", y: "Row" }),
  showXTitle: false,
  exportName: "plate-map",
  sheetName: (t) => `Plate map of ${t}`,
  PlotPanel: lazyPart(plots, "PlateHeatmap"),
  OptionsPanel: lazyPart(plots, "PlateHeatOptions"),
  formatFeatures: { noAxes: true, noDatasets: true },
});

export const plateAssay: AssayModule = {
  id: "plate",
  label: "Plate reader → dose-response",
  description: "Paste or import 96- or 384-well plates, draw the plate map, check Z′ and "
    + "replicate CVs, and get normalised dose-response tables with the fit set up.",
  tableType: "multivariable",
  tableName: "Plate",
  emptyTable: emptyPlate,
  sampleTable: plateSample,
  sampleOptions: () => ({ wells: rowsLayout() }),
  mainAnalysis: ANALYSIS_ASSAY_PLATE,
  analyses: [{ def: plateAnalysis, types: ["multivariable"] }],
  graphs: [{ def: plateGraph, types: ["multivariable"] }],
};
