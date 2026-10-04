// Area under the curve for XY tables: trapezoid area per data set with
// its SE and CI from replicates, the peaks table, total / net areas and
// the comparison between data sets; graph with the shaded areas.
import { lazyPart } from "../lazy";
import { defineAnalysis, defineGraph } from "../types";
import type { AssayModule } from "./index";
import { emptyLayout } from "./kit/columns";
import {
  ANALYSIS_AUC, DEFAULT_AUC, GRAPH_AUC, aucPayload, normalizeAuc, type AucOptions,
} from "./aucModel";
import { aucSample } from "./aucSample";

const panels = () => import("./aucPanels");
const AucControls = lazyPart(panels, "AucControls");
const AucResults = lazyPart(panels, "AucResults");
const AucMethods = lazyPart(panels, "AucMethods");
const AucPlot = lazyPart(panels, "AucPlot");

type R = Record<string, unknown>;

export const aucAnalysis = defineAnalysis<AucOptions, R>({
  id: ANALYSIS_AUC,
  label: "Area under the curve",
  short: "AUC",
  description: "Trapezoid area of each data set above a baseline, with SE and CI "
    + "from replicates, peaks, total and net areas, and a comparison of data sets.",
  sheetName: (t) => `AUC of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_AUC }),
  normalizeOptions: (raw) => normalizeAuc(raw),
  run: (engine, table, options) => engine.analyze(aucPayload(table, options)) as R,
  defaultGraph: GRAPH_AUC,
  ControlsPanel: AucControls,
  ResultsPanel: AucResults,
  MethodsPanel: AucMethods,
});

export const aucGraph = defineGraph<AucOptions, R>({
  id: GRAPH_AUC,
  label: "Curves with the area under them shaded",
  group: "xy_auc",
  analysis: ANALYSIS_AUC,
  autoTitles: (t) => ({
    x: t.xTitle && t.xTitle !== "X" ? t.xTitle : "X",
    y: t.yTitle || "Y",
  }),
  exportName: "area-under-curve",
  PlotPanel: AucPlot,
  formatFeatures: { points: true, lines: true },
});

export const aucAssay: AssayModule = {
  id: "auc",
  label: "Area under the curve",
  description: "Curves on an XY table (a glucose tolerance test, a pharmacokinetic "
    + "profile ...): trapezoid area of each data set above a baseline with its SE and CI, "
    + "peaks, and a comparison of the data sets.",
  tableType: "xy",
  tableName: "Glucose tolerance test",
  emptyTable: () => emptyLayout(aucSample()),
  sampleTable: aucSample,
  sampleOptions: () => ({ replicates: "experiments" }),
  mainAnalysis: ANALYSIS_AUC,
  analyses: [{ def: aucAnalysis, types: ["xy"] }],
  graphs: [{ def: aucGraph, types: ["xy"] }],
};
