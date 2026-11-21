// Kinetic plate reads (assay module). Input: an XY table, read time in X,
// one data set per sample and one replicate column per well; analysis:
// engine assay_kinetic.kinetic_rates (initial rate of each well from the
// steepest stretch, the R² rule or a window; blank subtraction; unit
// conversion); output: a linked substrate-vs-rate table opened with the
// Michaelis-Menten fit, and the traces graph.
import { lazyPart } from "../../lazy";
import { defineAnalysis, defineGraph } from "../../types";
import type { AssayModule } from "../index";
import { emptyLayout } from "../kit/columns";
import {
  ANALYSIS_KINETIC, DEFAULT_KINETIC, GRAPH_KINETIC, normalizeKinetic, runKinetic,
  type KineticOptions, type KineticResult,
} from "./model";
import { kineticSample } from "./sample";

const panels = () => import("./panels");

export const kineticAnalysis = defineAnalysis<KineticOptions, KineticResult>({
  id: ANALYSIS_KINETIC,
  label: "Kinetic plate reads: initial rates, blank, Michaelis-Menten table",
  short: "Kinetic rates",
  description: "The initial rate of every well from the linear part of its trace (steepest stretch, "
    + "R² rule or a time window), a blank rate subtracted, and a substrate-vs-rate table for Michaelis-Menten.",
  sheetName: (t) => `Kinetic rates of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_KINETIC }),
  normalizeOptions: (raw) => normalizeKinetic(raw),
  run: (engine, table, options) => runKinetic((p) => engine.analyze(p), table, options),
  defaultGraph: GRAPH_KINETIC,
  ControlsPanel: lazyPart(panels, "KineticControls"),
  ResultsPanel: lazyPart(panels, "KineticResults"),
  MethodsPanel: lazyPart(panels, "KineticMethods"),
});

export const kineticGraph = defineGraph<KineticOptions, KineticResult>({
  id: GRAPH_KINETIC,
  label: "Kinetic traces with the fitted stretches",
  group: "assay_kinetic",
  analysis: ANALYSIS_KINETIC,
  autoTitles: (t) => ({ x: t.xTitle && t.xTitle !== "X" ? t.xTitle : "Time", y: t.yTitle?.trim() || "Signal" }),
  exportName: "kinetic-traces",
  sheetName: (t) => `Traces of ${t}`,
  PlotPanel: lazyPart(panels, "KineticPlot"),
  formatFeatures: { points: true, lines: true },
});

export const kineticAssay: AssayModule = {
  id: "kinetic",
  label: "Kinetic plate reads (initial rates)",
  description: "Absorbance or fluorescence read over time, one replicate column per well: the initial "
    + "rate of every well, a blank subtracted, and the rates against substrate for a Michaelis-Menten fit.",
  tableType: "xy",
  tableName: "Kinetic reads",
  emptyTable: () => emptyLayout(kineticSample()),
  sampleTable: kineticSample,
  mainAnalysis: ANALYSIS_KINETIC,
  analyses: [{ def: kineticAnalysis, types: ["xy"] }],
  graphs: [{ def: kineticGraph, types: ["xy"] }],
  templates: [{
    id: "kinetic-enzyme",
    name: "Enzyme kinetics from plate reads (pNPP, A405)",
    description: "A phosphatase with p-nitrophenyl phosphate read every 30 s for 10 min: a no-enzyme blank "
      + "and seven substrate concentrations in triplicate. Gives the initial rate of every well and a "
      + "substrate-vs-rate table for the Michaelis-Menten fit (Vmax and Km).",
    tableName: "Kinetic reads",
    table: kineticSample,
    analysis: ANALYSIS_KINETIC,
  }],
};
