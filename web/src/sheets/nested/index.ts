import { emptyTable, normalizeTable } from "../../project/table";
import DataGrid from "../common/DataGrid";
import { defineAnalysis, defineGraph, type TableTypeDef } from "../types";
import {
  NestedAnovaControls, NestedMethods, NestedResults, NestedTControls,
} from "./panels";
import { NestedOptions, NestedPlot } from "./plot";
import {
  ANALYSIS_NESTED_ANOVA, ANALYSIS_NESTED_T, DEFAULT_NESTED_ANOVA, DEFAULT_NESTED_T, GRAPH_NESTED, type NestedAnovaOptions, nestedAutoTitles, nestedComparisons, type NestedTOptions, normalizeNestedAnova, normalizeNestedT, runNestedAnova, runNestedT,
} from "./run";

export const nestedAnovaAnalysis = defineAnalysis<NestedAnovaOptions, Record<string, unknown>>({
  id: ANALYSIS_NESTED_ANOVA,
  label: "Nested one-way ANOVA",
  short: "Nested ANOVA",
  description: "Two or more groups whose replicates sit within subgroups; "
    + "mixed model with multiple comparisons.",
  sheetName: (t) => `Nested ANOVA of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_NESTED_ANOVA }),
  normalizeOptions: (raw) => normalizeNestedAnova(raw),
  run: runNestedAnova,
  defaultGraph: GRAPH_NESTED,
  ControlsPanel: NestedAnovaControls,
  ResultsPanel: NestedResults,
  MethodsPanel: NestedMethods,
});

export const nestedTAnalysis = defineAnalysis<NestedTOptions, Record<string, unknown>>({
  id: ANALYSIS_NESTED_T,
  label: "Nested t test",
  short: "Nested t test",
  description: "Two groups whose replicates sit within subgroups; mixed "
    + "model with a random subgroup effect.",
  sheetName: (t) => `Nested t test of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_NESTED_T }),
  normalizeOptions: (raw) => normalizeNestedT(raw),
  run: runNestedT,
  defaultGraph: GRAPH_NESTED,
  ControlsPanel: NestedTControls,
  ResultsPanel: NestedResults,
  MethodsPanel: NestedMethods,
});

export const nestedGraph = defineGraph({
  id: GRAPH_NESTED,
  label: "Nested scatter",
  group: "nested",
  analysis: null,
  autoTitles: nestedAutoTitles,
  showXTitle: false,
  exportName: "nested",
  PlotPanel: NestedPlot,
  OptionsPanel: NestedOptions,
  comparisons: nestedComparisons,
  formatFeatures: { points: true, errorBars: true, categoryX: true },
});

// Synthetic weight-gain data: three treatments, three herds per treatment,
// four animals per herd. Herds within a treatment differ clearly, which is
// the situation nested analyses exist for.
function nestedSample() {
  const herds = ["Herd 1", "Herd 2", "Herd 3"];
  const cols: Record<string, number[][]> = {
    Control: [[42.1, 44.3, 40.8, 43.5], [46.2, 47.9, 45.1, 48.4], [41.0, 39.6, 42.7, 40.2]],
    "Diet A": [[49.8, 52.1, 50.4, 51.7], [47.3, 45.9, 48.8, 46.5], [53.0, 54.6, 51.9, 52.8]],
    "Diet B": [[55.2, 57.8, 56.1, 54.9], [52.4, 50.8, 53.9, 51.6], [58.7, 60.2, 57.5, 59.1]],
  };
  return normalizeTable({
    type: "nested",
    x: ["", "", "", ""],
    yTitle: "Weight gain (kg)",
    datasets: Object.entries(cols).map(([name, subs]) => ({
      name,
      subTitles: herds,
      rows: subs[0].map((_, r) => subs.map((s) => String(s[r]))),
    })),
  });
}

export const nestedTable: TableTypeDef = {
  type: "nested",
  label: "Nested",
  short: "Nest",
  description: "Two-level hierarchy: each column is a group, its subcolumns "
    + "are subgroups (e.g. animals or culture dishes), and replicate values "
    + "run down the rows. For nested t tests and nested ANOVA.",
  status: "ready",
  defaultTable: (init) => emptyTable("nested", init),
  sampleTable: nestedSample,
  sampleName: "Herds",
  Editor: DataGrid,
  entryHint: "Each column is a treatment group; each subcolumn one subgroup "
    + "within it (an animal, a dish); enter that subgroup's replicate "
    + "measurements down the rows.",
  analyses: [nestedAnovaAnalysis, nestedTAnalysis],
  graphs: [nestedGraph],
};
