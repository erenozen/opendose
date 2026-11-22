// MIC by broth microdilution (assay module). Input: an XY table, X the
// drug concentration (0 = growth control), one data set per strain and one
// replicate column per dilution series holding the endpoint OD; analysis:
// engine assay_mic.mic (% growth, MIC per series and strain, skipped
// wells, MIC50 / MIC90, IC50); output: a linked % growth table and the
// growth-against-concentration graph.
import { lazyPart } from "../../lazy";
import { defineAnalysis, defineGraph } from "../../types";
import type { AssayModule } from "../index";
import { emptyLayout } from "../kit/columns";
import {
  ANALYSIS_MIC, DEFAULT_MIC, GRAPH_MIC, growthTable, normalizeMic, runMic,
  type MicOptions, type MicResult,
} from "./model";
import { MIC_SAMPLE_BLANK, micSample } from "./sample";

const panels = () => import("./panels");

export const micAnalysis = defineAnalysis<MicOptions, MicResult>({
  id: ANALYSIS_MIC,
  label: "MIC (broth microdilution): MIC per strain, MIC50 / MIC90, IC50",
  short: "MIC",
  description: "Growth relative to the growth control, the MIC of each dilution series and strain "
    + "(skipped wells handled as CLSI M07), MIC50 and MIC90 across strains, and an IC50 fit.",
  sheetName: (t) => `MIC of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_MIC }),
  normalizeOptions: (raw) => normalizeMic(raw),
  run: (engine, table, options) => runMic((p) => engine.analyze(p), table, options),
  defaultGraph: GRAPH_MIC,
  derivedOnDemand: true,
  derivedTable: (result, source) => growthTable(result, source),
  derivedName: (t) => `% growth of ${t}`,
  ControlsPanel: lazyPart(panels, "MicControls"),
  ResultsPanel: lazyPart(panels, "MicResults"),
  MethodsPanel: lazyPart(panels, "MicMethods"),
});

export const micGraph = defineGraph<MicOptions, MicResult>({
  id: GRAPH_MIC,
  label: "Growth against concentration, MIC marked (log2 axis)",
  group: "assay_mic",
  analysis: ANALYSIS_MIC,
  autoTitles: (t) => ({ x: t.xTitle && t.xTitle !== "X" ? t.xTitle : "Concentration",
    y: "Growth (% of the growth control)" }),
  exportName: "mic",
  sheetName: (t) => `Growth of ${t}`,
  PlotPanel: lazyPart(panels, "MicPlot"),
  formatFeatures: { points: true, lines: true, errorBars: true },
});

export const micAssay: AssayModule = {
  id: "mic",
  label: "MIC (broth microdilution)",
  description: "Endpoint ODs of two-fold dilution series, one data set per strain: growth vs the "
    + "growth control, the MIC of each strain (skipped wells handled as CLSI M07), MIC50 / MIC90 and an IC50.",
  tableType: "xy",
  tableName: "MIC plate",
  emptyTable: () => emptyLayout(micSample()),
  sampleTable: micSample,
  sampleOptions: () => ({ blank: MIC_SAMPLE_BLANK }),
  mainAnalysis: ANALYSIS_MIC,
  analyses: [{ def: micAnalysis, types: ["xy"] }],
  graphs: [{ def: micGraph, types: ["xy"] }],
  templates: [{
    id: "mic-broth-microdilution",
    name: "MIC by broth microdilution",
    description: "Six isolates in triplicate dilution series from 0.125 to 64 µg/mL with a growth control, "
      + "read as OD600 with a medium blank of 0.045. Gives each isolate's MIC at 90% inhibition, "
      + "MIC50 / MIC90 and IC50s; one series has a skipped well.",
    tableName: "MIC plate",
    table: micSample,
    analysis: ANALYSIS_MIC,
    options: { blank: MIC_SAMPLE_BLANK },
  }],
};
