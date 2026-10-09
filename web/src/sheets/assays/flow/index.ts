// Flow cytometry summary (assay module): a FlowJo statistics table to one
// value per donor / experiment and condition (engine flow_summary), then a
// linked column table with the experiment as the block, statistics on the
// experiment means (paired t test or repeated-measures ANOVA) and a
// SuperPlot (model.ts).
import { lazyPart } from "../../lazy";
import { defineAnalysis } from "../../types";
import type { AssayModule } from "../index";
import {
  DEFAULT_FLOW_OPTIONS, flowTable, normalizeFlowOptions, runFlow, type FlowOptions, type FlowResult,
} from "./model";
import { emptyFlow, flowSample } from "./sample";

export const ANALYSIS_ASSAY_FLOW = "assay_flow";

const panels = () => import("./panels");

export const flowAnalysis = defineAnalysis<FlowOptions, FlowResult>({
  id: ANALYSIS_ASSAY_FLOW,
  label: "Flow cytometry summary (FlowJo statistics per donor, paired / RM tests)",
  short: "Flow summary",
  description: "One value per donor (or experiment) and condition from a FlowJo table, FMO or "
    + "isotype subtraction, then a matched table tested with the donor as the block.",
  sheetName: (t) => `Flow summary of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_FLOW_OPTIONS }),
  normalizeOptions: (raw) => normalizeFlowOptions(raw),
  run: (engine, table, options) => runFlow((p) => engine.analyze(p), table, options),
  defaultGraph: null,
  derivedTable: (result) => flowTable(result),
  derivedName: (t) => `Per donor of ${t}`,
  derivedOnDemand: true,
  ControlsPanel: lazyPart(panels, "FlowControls"),
  ResultsPanel: lazyPart(panels, "FlowResults"),
  MethodsPanel: lazyPart(panels, "FlowMethods"),
});

export const flowAssay: AssayModule = {
  id: "flow",
  label: "Flow cytometry (FlowJo statistics → per-donor tests)",
  description: "A FlowJo table of gate statistics (% of parent, median, count): one value per donor "
    + "and condition, FMO / isotype subtraction, a paired or repeated-measures test by donor and a "
    + "SuperPlot.",
  tableType: "multivariable",
  tableName: "Flow",
  emptyTable: emptyFlow,
  sampleTable: flowSample,
  mainAnalysis: ANALYSIS_ASSAY_FLOW,
  wizard: true,
  analyses: [{ def: flowAnalysis, types: ["multivariable"] }],
  graphs: [],
  templates: [{
    id: "flow-cd69",
    name: "Flow cytometry: % CD69+ of 3 donors × 4 stimulations",
    description: "A FlowJo statistics table of CD4+ T cells from three donors under four conditions, "
      + "summarised per donor and compared by repeated-measures ANOVA with donor as the block.",
    tableName: "CD69 activation",
    table: flowSample,
    analysis: ANALYSIS_ASSAY_FLOW,
  }],
};
