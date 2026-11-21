// Wound-healing (scratch) assay (assay module). Input: an XY table, time
// in X, one data set per condition and one replicate column per well
// holding the wound area (or width); analysis: engine
// assay_wound.wound_healing (% closure, closure rate, time to 50%
// closure, rates compared between conditions); output: a linked table of
// % closure and the closure-over-time graph.
import { lazyPart } from "../../lazy";
import { defineAnalysis, defineGraph } from "../../types";
import type { AssayModule } from "../index";
import { emptyLayout } from "../kit/columns";
import {
  ANALYSIS_WOUND, closureTable, DEFAULT_WOUND, GRAPH_WOUND, normalizeWound, runWound,
  type WoundOptions, type WoundResult,
} from "./model";
import { woundSample } from "./sample";

const panels = () => import("./panels");

export const woundAnalysis = defineAnalysis<WoundOptions, WoundResult>({
  id: ANALYSIS_WOUND,
  label: "Wound healing (scratch assay): % closure, rate, time to 50%",
  short: "Wound healing",
  description: "Percent closure of each wound against its own start, the closure rate from a "
    + "straight-line fit, the time to 50% closure, and the rates compared between conditions.",
  sheetName: (t) => `Wound healing of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_WOUND }),
  normalizeOptions: (raw) => normalizeWound(raw),
  run: (engine, table, options) => runWound((p) => engine.analyze(p), table, options),
  defaultGraph: GRAPH_WOUND,
  derivedOnDemand: true,
  derivedTable: (result, source) => closureTable(result, source),
  derivedName: (t) => `% closure of ${t}`,
  ControlsPanel: lazyPart(panels, "WoundControls"),
  ResultsPanel: lazyPart(panels, "WoundResults"),
  MethodsPanel: lazyPart(panels, "WoundMethods"),
});

export const woundGraph = defineGraph<WoundOptions, WoundResult>({
  id: GRAPH_WOUND,
  label: "Wound closure over time (mean ± SD)",
  group: "assay_wound",
  analysis: ANALYSIS_WOUND,
  autoTitles: (t) => ({ x: t.xTitle && t.xTitle !== "X" ? t.xTitle : "Time", y: "Wound closure (%)" }),
  exportName: "wound-closure",
  sheetName: (t) => `Closure of ${t}`,
  PlotPanel: lazyPart(panels, "WoundPlot"),
  formatFeatures: { points: true, lines: true, errorBars: true },
});

export const woundAssay: AssayModule = {
  id: "wound",
  label: "Wound healing (scratch assay)",
  description: "Wound area or width over time, one replicate column per well: % closure, the "
    + "closure rate, the time to 50% closure, and the rates compared between conditions.",
  tableType: "xy",
  tableName: "Scratch assay",
  emptyTable: () => emptyLayout(woundSample()),
  sampleTable: woundSample,
  mainAnalysis: ANALYSIS_WOUND,
  analyses: [{ def: woundAnalysis, types: ["xy"] }],
  graphs: [{ def: woundGraph, types: ["xy"] }],
  templates: [{
    id: "wound-healing",
    name: "Wound healing (scratch) assay",
    description: "Wound area of four wells per condition every 6 hours for a day: a control, a "
      + "knock-down that slows migration and TGF-β that speeds it up. Gives % closure, the closure "
      + "rate of each well, the time to 50% closure and a one-way ANOVA on the rates.",
    tableName: "Scratch assay",
    table: woundSample,
    analysis: ANALYSIS_WOUND,
  }],
};
