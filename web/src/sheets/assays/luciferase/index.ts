// Dual-luciferase reporter assay (assay module). Input: well records
// (experiment, well, group, Firefly, Renilla); analysis: engine
// assay_luciferase.luciferase (blank subtraction, Firefly / Renilla per
// well, fold change vs the control group, tests on log ratios with the
// experiment as the unit when recorded); output: a linked ratio table.
import { lazyPart } from "../../lazy";
import { defineAnalysis, defineGraph } from "../../types";
import type { AssayModule } from "../index";
import {
  DEFAULT_LUC_OPTIONS, normalizeLucOptions, ratioTable, readWells, runLuc, sampleGroups,
  type LucOptions, type LucResult,
} from "./model";
import { emptyLuciferase, luciferaseSample } from "./sample";

export const ANALYSIS_ASSAY_LUCIFERASE = "assay_luciferase";
export const GRAPH_ASSAY_LUCIFERASE = "assay_luciferase_fold";

const panels = () => import("./panels");
const plots = () => import("./plot");

export const luciferaseAnalysis = defineAnalysis<LucOptions, LucResult>({
  id: ANALYSIS_ASSAY_LUCIFERASE,
  label: "Dual-luciferase reporter (Firefly / Renilla, fold change vs control)",
  short: "Luciferase",
  description: "Background from mock wells, Firefly / Renilla per well, fold change vs the control "
    + "group with its CI, tests on log ratios with the experiment as the unit.",
  sheetName: (t) => `Luciferase of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_LUC_OPTIONS }),
  normalizeOptions: (raw) => normalizeLucOptions(raw),
  run: (engine, table, options) => runLuc((p) => engine.analyze(p), table, options),
  defaultGraph: GRAPH_ASSAY_LUCIFERASE,
  derivedTable: (result) => ratioTable(result),
  derivedName: (t) => `Luciferase ratios of ${t}`,
  derivedOnDemand: true,
  ControlsPanel: lazyPart(panels, "LucControls"),
  ResultsPanel: lazyPart(panels, "LucResults"),
  MethodsPanel: lazyPart(panels, "LucMethods"),
});

export const luciferaseGraph = defineGraph<LucOptions, LucResult>({
  id: GRAPH_ASSAY_LUCIFERASE,
  label: "Fold change vs control (log2 axis)",
  group: "assay_luciferase",
  analysis: ANALYSIS_ASSAY_LUCIFERASE,
  autoTitles: () => ({ x: "", y: "Relative luciferase activity (fold vs control)" }),
  showXTitle: false,
  exportName: "luciferase",
  sheetName: (t) => `Reporter activity of ${t}`,
  PlotPanel: lazyPart(plots, "LucFoldPlot"),
  OptionsPanel: lazyPart(plots, "LucFoldOptions"),
  formatFeatures: { points: true, errorBars: true, categoryX: true },
  formatDatasets: (table, _g, options) => {
    const o = normalizeLucOptions(options);
    return sampleGroups(o, readWells(table, o).groups);
  },
});

export const luciferaseAssay: AssayModule = {
  id: "luciferase",
  label: "Dual-luciferase reporter",
  description: "Firefly and Renilla readings per well: background from mock wells, Firefly / "
    + "Renilla ratio, fold change vs the control construct with its CI, and tests on the log "
    + "ratios with each experiment counted once.",
  tableType: "multivariable",
  tableName: "Luciferase",
  emptyTable: emptyLuciferase,
  sampleTable: luciferaseSample,
  mainAnalysis: ANALYSIS_ASSAY_LUCIFERASE,
  analyses: [{ def: luciferaseAnalysis, types: ["multivariable"] }],
  graphs: [{ def: luciferaseGraph, types: ["multivariable"] }],
  templates: [{
    id: "dual-luciferase",
    name: "Dual-luciferase reporter assay",
    description: "Three transfections, each with mock wells (background), an empty-vector control, "
      + "a promoter construct and the promoter with TNF-α. Firefly is divided by Renilla in each "
      + "well and expressed relative to the empty vector of the same experiment.",
    tableName: "Luciferase",
    table: luciferaseSample,
    analysis: ANALYSIS_ASSAY_LUCIFERASE,
  }],
};
