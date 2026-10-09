import { ANALYSIS_SURVIVAL, GRAPH_SURVIVAL } from "../../project/builtin";
import { emptyTable, normalizeTable } from "../../project/table";
import DataGrid from "../common/DataGrid";
import { lazyPart } from "../lazy";
import { defineAnalysis, defineGraph, type AnalysisDef, type GraphKindDef, type TableTypeDef } from "../types";
import {
  coxModel, curveProfiles, defaultCoxOptions, normalizeCoxOptions, runCox,
  type CoxOptions, type CoxResult,
} from "./cox";
import { SurvivalControls, SurvivalGraph, SurvivalOptions, SurvivalResultsPanel } from "./panels";
import { DEFAULT_SURVIVAL_OPTIONS, normalizeSurvivalOptions, runSurvival } from "./extras";
import { SurvivalMethods } from "./extrasPanels";

// Cox regression panels load on first use (sheets/lazy.ts).
const coxModule = () => import("./coxPanels");
const CoxControls = lazyPart(coxModule, "CoxControls");
const CoxResults = lazyPart(coxModule, "CoxResults");
const CoxMethods = lazyPart(coxModule, "CoxMethods");
const CoxCurvesPlot = lazyPart(coxModule, "CoxCurvesPlot");
const CoxCurvesOptions = lazyPart(coxModule, "CoxCurvesOptions");
const CoxForestPlot = lazyPart(coxModule, "CoxForestPlot");
const CoxSchoenfeldPlot = lazyPart(coxModule, "CoxSchoenfeldPlot");
const CoxSchoenfeldOptions = lazyPart(coxModule, "CoxSchoenfeldOptions");
// Entry from counts / dates, the per-group reading and the covariates.
const SurvivalAside = lazyPart(() => import("./SurvivalAside"), "default");

export const survivalAnalysis = defineAnalysis<unknown, Record<string, unknown>>({
  id: ANALYSIS_SURVIVAL,
  label: "Survival analysis (Kaplan-Meier, log-rank)",
  short: "Survival",
  sheetName: (t) => `Survival of ${t}`,
  // Pairwise log-rank, survival at a time and RMST options (extras.ts);
  // older sheets store {} and get the defaults.
  defaultOptions: () => ({ ...DEFAULT_SURVIVAL_OPTIONS }),
  normalizeOptions: (raw) => normalizeSurvivalOptions(raw),
  run: (engine, table, options) => runSurvival(engine, table, options),
  defaultGraph: GRAPH_SURVIVAL,
  ControlsPanel: SurvivalControls,
  ResultsPanel: SurvivalResultsPanel,
  MethodsPanel: SurvivalMethods,
});

export const survivalGraph = defineGraph({
  id: GRAPH_SURVIVAL,
  label: "Kaplan-Meier survival curves",
  group: "survival",
  analysis: ANALYSIS_SURVIVAL,
  autoTitles: () => ({ x: "Time", y: "Percent survival" }),
  exportName: "survival",
  PlotPanel: SurvivalGraph,
  OptionsPanel: SurvivalOptions,
  formatFeatures: { lines: true, color: true, survival: true },
});

// Ids are stored in project files: never rename them.
export const ANALYSIS_COX = "cox";

/** Cox regression bound to `analysisId`, with its three graph kinds
 *  (`graphPrefix`_curves / _forest / _schoenfeld). Survival tables and
 *  multiple-variables tables each register one. */
export function coxDefinitions(analysisId: string, graphPrefix: string, label: string):
  { analysis: AnalysisDef; graphs: GraphKindDef[] } {
  const analysis = defineAnalysis<CoxOptions, CoxResult>({
    id: analysisId,
    label,
    short: "Cox",
    description: "Hazard ratios with confidence intervals for several covariates at "
      + "once, the proportional-hazards test and adjusted survival curves.",
    sheetName: (t) => `Cox regression of ${t}`,
    defaultOptions: ({ table }) => defaultCoxOptions(table),
    normalizeOptions: (raw, { table }) => normalizeCoxOptions(raw, table),
    run: runCox,
    defaultGraph: `${graphPrefix}_forest`,
    ControlsPanel: CoxControls,
    ResultsPanel: CoxResults,
    MethodsPanel: CoxMethods,
  });
  const none = () => ({ x: "", y: "" });
  const graphs = [
    defineGraph<CoxOptions, CoxResult>({
      id: `${graphPrefix}_forest`, label: "Hazard ratios with CIs (forest plot)",
      group: graphPrefix, analysis: analysisId, autoTitles: none,
      exportName: "hazard-ratios", PlotPanel: CoxForestPlot,
      formatFeatures: { noDatasets: true },
    }),
    defineGraph<CoxOptions, CoxResult>({
      id: `${graphPrefix}_curves`, label: "Adjusted survival curves",
      group: graphPrefix, analysis: analysisId, autoTitles: none,
      exportName: "adjusted-survival", PlotPanel: CoxCurvesPlot, OptionsPanel: CoxCurvesOptions,
      formatDatasets: (table, _g, options) => coxCurveLabels(table, options),
      formatFeatures: { lines: true, color: true },
    }),
    defineGraph<CoxOptions, CoxResult>({
      id: `${graphPrefix}_schoenfeld`, label: "Schoenfeld residuals (proportional hazards)",
      group: graphPrefix, analysis: analysisId, autoTitles: none,
      exportName: "schoenfeld-residuals", PlotPanel: CoxSchoenfeldPlot,
      OptionsPanel: CoxSchoenfeldOptions,
      formatDatasets: () => ["Residuals"],
      formatFeatures: { points: true, lines: true },
    }),
  ];
  return { analysis, graphs };
}

/** Labels of the adjusted curves, as the plot names them. */
function coxCurveLabels(table: Parameters<typeof normalizeCoxOptions>[1], options: CoxOptions | null): string[] {
  if (!options || !table) return [];
  try {
    return curveProfiles(options, coxModel(table, normalizeCoxOptions(options, table)))
      .map((p) => String(p.label));
  } catch {
    return [];
  }
}

const survivalCox = coxDefinitions(ANALYSIS_COX, "cox", "Cox proportional hazards regression");
export const coxAnalysis = survivalCox.analysis;
export const coxGraphs = survivalCox.graphs;

function survivalSample() {
  return normalizeTable({
    type: "survival",
    datasets: [
      {
        name: "Control", subTitles: ["Time", "Event"],
        rows: [["6", "1"], ["13", "1"], ["21", "1"], ["30", "1"], ["31", "0"],
               ["37", "1"], ["38", "1"], ["47", "0"], ["49", "1"], ["50", "1"]],
      },
      {
        name: "Treated", subTitles: ["Time", "Event"],
        rows: [["10", "1"], ["21", "1"], ["33", "1"], ["40", "0"], ["45", "1"],
               ["46", "1"], ["50", "1"], ["52", "0"], ["53", "1"], ["55", "0"]],
      },
    ],
  });
}

export const survivalTable: TableTypeDef = {
  type: "survival",
  label: "Survival",
  short: "Surv",
  description: "One row per subject: the time it was followed and whether the "
    + "event happened (1) or the subject was censored (0), one dataset per "
    + "group, plus optional covariate columns. For Kaplan-Meier curves, "
    + "log-rank tests and Cox regression.",
  status: "ready",
  defaultTable: (init) => emptyTable("survival", init),
  sampleTable: survivalSample,
  sampleName: "Survival example",
  Editor: DataGrid,
  EditorAside: SurvivalAside,
  analyses: [survivalAnalysis, coxAnalysis],
  graphs: [survivalGraph, ...coxGraphs],
};
