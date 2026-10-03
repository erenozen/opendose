import { ANALYSIS_SURVIVAL, GRAPH_SURVIVAL } from "../../project/builtin";
import { emptyTable, normalizeTable, numericData } from "../../project/table";
import DataGrid from "../common/DataGrid";
import { defineAnalysis, defineGraph, type TableTypeDef } from "../types";
import { SurvivalControls, SurvivalGraph, SurvivalResultsPanel } from "./panels";

export const survivalAnalysis = defineAnalysis<unknown, Record<string, unknown>>({
  id: ANALYSIS_SURVIVAL,
  label: "Survival analysis (Kaplan-Meier, log-rank)",
  short: "Survival",
  sheetName: (t) => `Survival of ${t}`,
  defaultOptions: () => ({}),
  run: (engine, table) => engine.analyze({
    analysis: "survival", data: numericData(table), options: {},
  }) as Record<string, unknown>,
  defaultGraph: GRAPH_SURVIVAL,
  ControlsPanel: SurvivalControls,
  ResultsPanel: SurvivalResultsPanel,
});

export const survivalGraph = defineGraph({
  id: GRAPH_SURVIVAL,
  label: "Kaplan-Meier survival curves",
  group: "survival",
  analysis: ANALYSIS_SURVIVAL,
  autoTitles: () => ({ x: "Time", y: "Percent survival" }),
  exportName: "survival",
  PlotPanel: SurvivalGraph,
  formatFeatures: { lines: true, survival: true },
});

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
    + "group. For Kaplan-Meier curves and log-rank tests.",
  status: "ready",
  defaultTable: (init) => emptyTable("survival", init),
  sampleTable: survivalSample,
  sampleName: "Survival example",
  Editor: DataGrid,
  analyses: [survivalAnalysis],
  graphs: [survivalGraph],
};
