import { ANALYSIS_CONTINGENCY } from "../../project/builtin";
import { emptyTable, normalizeTable } from "../../project/table";
import type { DataTableModel } from "../../project/types";
import type { EngineBridge } from "../../lib/engine";
import DataGrid from "../common/DataGrid";
import { defineAnalysis, defineGraph, type TableTypeDef } from "../types";
import { CT_GRAPH_LABELS, ctAutoTitles, GRAPH_CT_GROUPED, GRAPH_CT_PERCENT, GRAPH_CT_STACKED, outcomeNames } from "./bars";
import { CtOptions, CtPlot } from "./plot";
import { ctComparisons } from "./brackets";
import {
  CmhMethods, ContingencyMethods, KappaMethods, McNemarMethods, ProportionMethods,
} from "./methods";
import {
  CmhControls, CmhResults, ContingencyControls, ContingencyResults, KappaControls,
  KappaResults, McNemarControls, McNemarResults, ProportionControls, ProportionResults,
} from "./panels";
import {
  cmhPayload, contingencyPayload, DEFAULT_CMH, DEFAULT_KAPPA, DEFAULT_PROPORTIONS,
  kappaPayload, mcnemarPayload, normalizeContingency, proportionPayload, readCounts,
  DEFAULT_CONTINGENCY,
  type CmhOptions, type ContingencyOptions, type Counts, type KappaOptions, type Payload,
  type ProportionOptions,
} from "./run";

type Result = Record<string, unknown>;

/** Read the counts, build the payload, run it. */
function runWith<O>(build: (c: Counts, o: O) => Payload | { error: string }) {
  return (engine: EngineBridge, table: DataTableModel, options: O): Result => {
    const c = readCounts(table);
    if ("error" in c) return c;
    const p = build(c, options);
    if ("error" in p) return p;
    return engine.analyze(p) as Result;
  };
}

const merge = <O>(defaults: O) => (raw: unknown): O =>
  ({ ...defaults, ...(raw && typeof raw === "object" ? raw as Partial<O> : {}) });

// Rows = groups, columns = outcomes; each dataset is one outcome column.
export const contingencyAnalysis = defineAnalysis<ContingencyOptions, Result>({
  id: ANALYSIS_CONTINGENCY,
  label: "Contingency analysis (Fisher, chi-square, OR, RR, trend)",
  short: "Contingency",
  sheetName: (t) => `Contingency of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_CONTINGENCY }),
  normalizeOptions: (raw) => normalizeContingency(raw),
  run: runWith(contingencyPayload),
  // a new contingency analysis comes with the "% of each row" stacked
  // bars, bound to it so its pairs of rows can be drawn as brackets (P-14)
  defaultGraph: GRAPH_CT_PERCENT,
  ControlsPanel: ContingencyControls,
  ResultsPanel: ContingencyResults,
  MethodsPanel: ContingencyMethods,
});

export const mcnemarAnalysis = defineAnalysis<Record<string, never>, Result>({
  id: "mcnemar",
  label: "McNemar's test (paired / matched data)",
  short: "McNemar",
  description: "Pairs counted in a square table: McNemar's test for 2×2, Bowker's "
    + "test of symmetry for larger tables.",
  sheetName: (t) => `McNemar of ${t}`,
  defaultOptions: () => ({}),
  run: runWith((c) => mcnemarPayload(c)),
  defaultGraph: null,
  ControlsPanel: McNemarControls,
  ResultsPanel: McNemarResults,
  MethodsPanel: McNemarMethods,
});

export const cmhAnalysis = defineAnalysis<CmhOptions, Result>({
  id: "cmh",
  label: "Cochran-Mantel-Haenszel (stratified tables)",
  short: "CMH",
  description: "Several tables, one block of rows per stratum: for 2×2 strata the common "
    + "odds ratio and relative risk, CMH test, Breslow-Day and Woolf tests; larger "
    + "strata get the generalized CMH test.",
  sheetName: (t) => `CMH of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_CMH }),
  normalizeOptions: merge(DEFAULT_CMH),
  run: runWith(cmhPayload),
  defaultGraph: null,
  ControlsPanel: CmhControls,
  ResultsPanel: CmhResults,
  MethodsPanel: CmhMethods,
});

export const kappaAnalysis = defineAnalysis<KappaOptions, Result>({
  id: "kappa",
  label: "Cohen's kappa (agreement between two raters)",
  short: "Kappa",
  description: "Square table of two raters' categories; unweighted, linear or "
    + "quadratic weights.",
  sheetName: (t) => `Kappa of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_KAPPA }),
  normalizeOptions: merge(DEFAULT_KAPPA),
  run: runWith(kappaPayload),
  defaultGraph: null,
  ControlsPanel: KappaControls,
  ResultsPanel: KappaResults,
  MethodsPanel: KappaMethods,
});

export const proportionAnalysis = defineAnalysis<ProportionOptions, Result>({
  id: "proportions",
  label: "One or two proportions (CI, binomial test, comparison)",
  short: "Proportions",
  description: "Rows are groups with successes and failures: a proportion with "
    + "its CI and binomial test, or two proportions compared.",
  sheetName: (t) => `Proportions of ${t}`,
  defaultOptions: () => ({ ...DEFAULT_PROPORTIONS }),
  normalizeOptions: merge(DEFAULT_PROPORTIONS),
  run: runWith(proportionPayload),
  defaultGraph: null,
  ControlsPanel: ProportionControls,
  ResultsPanel: ProportionResults,
  MethodsPanel: ProportionMethods,
});

function contingencySample() {
  return normalizeTable({
    type: "contingency",
    x: ["", ""],
    rowTitles: ["Exposed", "Not exposed"],
    datasets: [
      { name: "Event", rows: [["15"], ["5"]] },
      { name: "No event", rows: [["85"], ["95"]] },
    ],
  });
}

// One bar per group (row), the outcomes (columns) as segments (bars.ts).
export const contingencyGraphs = [GRAPH_CT_PERCENT, GRAPH_CT_STACKED, GRAPH_CT_GROUPED].map((id) => defineGraph({
  id,
  label: CT_GRAPH_LABELS[id],
  group: "contingency",
  analysis: null,
  autoTitles: ctAutoTitles(id),
  showXTitle: false,
  exportName: "contingency",
  PlotPanel: CtPlot,
  OptionsPanel: CtOptions,
  formatDatasets: (table) => outcomeNames(table),
  formatFeatures: { bars: true, categoryX: true },
  // brackets for the pairs of rows (P-14): the stacked graphs only
  comparisons: (result, table) => ctComparisons(result, table, id),
}));

export const contingencyTable: TableTypeDef = {
  type: "contingency",
  label: "Contingency",
  short: "Cont",
  description: "Counts of subjects: rows are groups (e.g. exposed or not), "
    + "columns are outcomes. For Fisher's exact and chi-square tests, odds "
    + "ratio and relative risk.",
  status: "ready",
  defaultTable: (init) => emptyTable("contingency", init),
  sampleTable: contingencySample,
  sampleName: "Contingency example",
  Editor: DataGrid,
  analyses: [contingencyAnalysis, mcnemarAnalysis, cmhAnalysis, kappaAnalysis, proportionAnalysis],
  graphs: contingencyGraphs,
};
