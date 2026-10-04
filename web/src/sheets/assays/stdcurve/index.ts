// Standard curve / ELISA (assay module). Input: standards, blanks and
// unknowns (module layout or an XY table); analysis: engine
// assay_stdcurve.standard_curve_qc per plate (fit, ICH M10 acceptance,
// LLOQ / ULOQ, dilution-corrected unknowns, parallelism); output: a
// linked column table of the reportable concentrations.
import { lazyPart } from "../../lazy";
import { defineAnalysis, defineGraph } from "../../types";
import type { AssayModule } from "../index";
import {
  concentrationTable, DEFAULT_STD_OPTIONS, normalizeStdOptions, runStdCurve,
  type StdOptions, type StdRun,
} from "./model";
import { emptyStdcurve, stdcurveSample } from "./sample";

export const ANALYSIS_ASSAY_STDCURVE = "assay_stdcurve";
export const GRAPH_ASSAY_STDCURVE = "assay_stdcurve_curve";

const panels = () => import("./panels");
const plots = () => import("./plot");

export const stdcurveAnalysis = defineAnalysis<StdOptions, StdRun>({
  id: ANALYSIS_ASSAY_STDCURVE,
  label: "Standard curve / ELISA with acceptance (ICH M10)",
  short: "Standard curve",
  description: "4PL / 5PL / linear standard curve, back-calculated recovery, LLOQ and ULOQ, "
    + "dilution-corrected unknowns with <LLOQ / >ULOQ flags.",
  sheetName: (t) => `Standard curve of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_STD_OPTIONS }),
  normalizeOptions: (raw) => normalizeStdOptions(raw),
  run: (engine, table, options) => runStdCurve((p) => engine.analyze(p), table, options),
  defaultGraph: GRAPH_ASSAY_STDCURVE,
  derivedTable: (result, _source, options) => concentrationTable(result, options),
  derivedName: (t) => `Concentrations of ${t}`,
  derivedOnDemand: true,
  ControlsPanel: lazyPart(panels, "StdControls"),
  ResultsPanel: lazyPart(panels, "StdResults"),
  MethodsPanel: lazyPart(panels, "StdMethods"),
});

export const stdcurveGraph = defineGraph<StdOptions, StdRun>({
  id: GRAPH_ASSAY_STDCURVE,
  label: "Standard curve with quantification range",
  group: "assay_stdcurve",
  analysis: ANALYSIS_ASSAY_STDCURVE,
  autoTitles: (_t, o) => ({ x: `Concentration (${o?.unit || "units"})`, y: "Signal" }),
  exportName: "standard-curve",
  sheetName: (t) => `Standard curve graph of ${t}`,
  PlotPanel: lazyPart(plots, "StdCurvePlot"),
  OptionsPanel: lazyPart(plots, "StdCurveOptions"),
  formatFeatures: { points: true, lines: true },
});

export const stdcurveAssay: AssayModule = {
  id: "stdcurve",
  label: "Standard curve / ELISA",
  description: "Standards plus unknowns with dilution factors: 4PL/5PL fit with weighting, "
    + "back-calculated recovery, LLOQ/ULOQ, flags and a concentrations table.",
  tableType: "multivariable",
  tableName: "ELISA",
  emptyTable: emptyStdcurve,
  sampleTable: stdcurveSample,
  mainAnalysis: ANALYSIS_ASSAY_STDCURVE,
  analyses: [{ def: stdcurveAnalysis, types: ["multivariable", "xy"] }],
  graphs: [{ def: stdcurveGraph, types: ["multivariable", "xy"] }],
};
