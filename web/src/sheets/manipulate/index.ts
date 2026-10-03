// Data manipulations (each a table-producing analysis: its output is a
// derived data table, so analyses chain) and Monte Carlo simulation.
// They apply to several table types; registry.ts appends them to each
// type's analyses via `extraAnalyses` / `extraGraphs`.
import type { ComponentType } from "react";
import type { DataTableModel, TableType } from "../../project/types";
import { defineAnalysis, defineGraph, type AnalysisDef, type GraphKindDef } from "../types";
import {
  baselineMethods, concMethods, fractionMethods, normalizeMethods, pruneMethods,
  transformMethods, transposeMethods,
} from "./methods";
import HistogramPlot from "./MonteCarloHistogram";
import {
  MonteCarloControls, MonteCarloMethods, MonteCarloResults,
} from "./MonteCarloPanels";
import { DEFAULT_HIT, type McOutput, type MonteCarloOptions } from "./montecarlo";
import { makeManipResults, makeMethods } from "./factories";
import {
  BaselineControls, ConcControls, FractionControls, FractionExtra,
  NormalizeControls, PruneControls, TransformControls, TransposeControls,
} from "./panels";
import {
  DEFAULT_BASELINE, DEFAULT_CONC, DEFAULT_FRACTION, DEFAULT_NORMALIZE, DEFAULT_PRUNE,
  DEFAULT_TRANSFORM, DEFAULT_TRANSPOSE, resultToTable, runBaseline, runConc, runFraction,
  runNormalize, runPrune, runTransform, runTranspose, type ManipResult,
} from "./run";

// Ids are stored in project files: never rename.
export const ANALYSIS_TRANSFORM = "transform";
export const ANALYSIS_TRANSFORM_CONC = "transform_concentrations";
export const ANALYSIS_REMOVE_BASELINE = "remove_baseline";
export const ANALYSIS_NORMALIZE = "normalize";
export const ANALYSIS_TRANSPOSE = "transpose";
export const ANALYSIS_PRUNE = "prune_rows";
export const ANALYSIS_FRACTION = "fraction_of_total_table";
export const ANALYSIS_MONTE_CARLO = "monte_carlo";
export const GRAPH_MC_HISTOGRAM = "mc_histogram";

const merge = <O,>(defaults: O) => (raw: unknown): O => ({
  ...defaults,
  ...(raw && typeof raw === "object" ? raw as Partial<O> : {}),
});

const derivedTable = (r: ManipResult | null, source: DataTableModel) =>
  (r ? resultToTable(r, source) : null);

function manipulation<O>(def: {
  id: string; label: string; short: string; description: string;
  verb: string; output: (t: string) => string; defaults: O;
  run: AnalysisDef<O, ManipResult>["run"];
  Controls: AnalysisDef<O, ManipResult>["ControlsPanel"];
  methods: (o: O, t: DataTableModel) => string;
  extra?: ComponentType<{ result: ManipResult }>;
}): AnalysisDef {
  return defineAnalysis<O, ManipResult>({
    id: def.id,
    label: def.label,
    short: def.short,
    description: def.description,
    sheetName: (t) => `${def.verb} of ${t}`,
    defaultOptions: () => ({ ...def.defaults }),
    normalizeOptions: merge(def.defaults),
    run: def.run,
    defaultGraph: null,
    ControlsPanel: def.Controls,
    ResultsPanel: makeManipResults(def.output, def.extra),
    MethodsPanel: makeMethods(def.methods),
    derivedTable,
    derivedName: def.output,
  });
}

export const transformAnalysis = manipulation({
  id: ANALYSIS_TRANSFORM,
  label: "Transform (standard functions or your own formula)",
  short: "Transform",
  description: "Y = log(Y), X = log(X), Y × K, pharmacology plots, or any formula; the result is a new linked table.",
  verb: "Transform", output: (t) => `Transformed ${t}`,
  defaults: DEFAULT_TRANSFORM, run: runTransform, Controls: TransformControls,
  methods: transformMethods,
});

export const concAnalysis = manipulation({
  id: ANALYSIS_TRANSFORM_CONC,
  label: "Transform concentrations (X)",
  short: "Transform X",
  description: "Log of concentrations with a stand-in for zero, and unit changes.",
  verb: "Transform concentrations", output: (t) => `log X of ${t}`,
  defaults: DEFAULT_CONC, run: runConc, Controls: ConcControls,
  methods: (o) => concMethods(o),
});

export const baselineAnalysis = manipulation({
  id: ANALYSIS_REMOVE_BASELINE,
  label: "Remove baseline and column math",
  short: "Baseline",
  description: "Subtract or divide by a baseline row, column or constant.",
  verb: "Remove baseline", output: (t) => `Baseline-corrected ${t}`,
  defaults: DEFAULT_BASELINE, run: runBaseline, Controls: BaselineControls,
  methods: baselineMethods,
});

export const normalizeAnalysis = manipulation({
  id: ANALYSIS_NORMALIZE,
  label: "Normalize",
  short: "Normalize",
  description: "Rescale each data set so a chosen 0% and 100% become 0 and 100.",
  verb: "Normalize", output: (t) => `Normalized ${t}`,
  defaults: DEFAULT_NORMALIZE, run: runNormalize, Controls: NormalizeControls,
  methods: (o) => normalizeMethods(o),
});

export const transposeAnalysis = manipulation({
  id: ANALYSIS_TRANSPOSE,
  label: "Transpose X and Y",
  short: "Transpose",
  description: "Rows become data sets and data sets become rows.",
  verb: "Transpose", output: (t) => `Transposed ${t}`,
  defaults: DEFAULT_TRANSPOSE, run: runTranspose, Controls: TransposeControls,
  methods: (o) => transposeMethods(o),
});

export const pruneAnalysis = manipulation({
  id: ANALYSIS_PRUNE,
  label: "Prune rows",
  short: "Prune",
  description: "Keep a range of X, keep every Kth row, or average groups of rows.",
  verb: "Prune", output: (t) => `Pruned ${t}`,
  defaults: DEFAULT_PRUNE, run: runPrune, Controls: PruneControls,
  methods: pruneMethods,
});

export const fractionAnalysis = manipulation({
  id: ANALYSIS_FRACTION,
  label: "Fraction of total",
  short: "Fraction",
  description: "Divide each value by its column, row or grand total, with optional CIs.",
  verb: "Fraction of total", output: (t) => `Fractions of ${t}`,
  defaults: DEFAULT_FRACTION, run: runFraction, Controls: FractionControls,
  methods: (o) => fractionMethods(o), extra: FractionExtra,
});

const DEFAULT_MC: MonteCarloOptions = {
  simulation: null, analysis: "dose_response", fitFrom: "", tabulate: [], hit: DEFAULT_HIT,
  nRepeats: "100", seed: "", histogram: "", output: null,
};

const mcDefaults = (t: DataTableModel): MonteCarloOptions => ({
  ...DEFAULT_MC,
  analysis: t.type === "contingency" ? "contingency"
    : t.type === "column" ? (t.datasets.length === 2 ? "ttest" : "anova") : "dose_response",
});

export const monteCarloAnalysis = defineAnalysis<MonteCarloOptions, McOutput | null>({
  id: ANALYSIS_MONTE_CARLO,
  label: "Monte Carlo simulation",
  short: "Monte Carlo",
  description: "Simulate and analyze many data sets; tabulate estimates, CI coverage or power.",
  sheetName: (t) => `Monte Carlo of ${t}`,
  defaultOptions: ({ table }) => mcDefaults(table),
  normalizeOptions: (raw, { table }) => ({
    ...mcDefaults(table),
    ...(raw && typeof raw === "object" ? raw as Partial<MonteCarloOptions> : {}),
  }),
  // The heavy work happens when the user presses Run (chunked, with
  // progress); the stored output is the result.
  run: (_engine, _table, o) => o.output ?? null,
  defaultGraph: GRAPH_MC_HISTOGRAM,
  ControlsPanel: MonteCarloControls,
  ResultsPanel: MonteCarloResults,
  MethodsPanel: MonteCarloMethods,
});

export const mcHistogramGraph = defineGraph<MonteCarloOptions, McOutput | null>({
  id: GRAPH_MC_HISTOGRAM,
  label: "Histogram of a tabulated value",
  group: "mc",
  analysis: ANALYSIS_MONTE_CARLO,
  autoTitles: () => ({ x: "", y: "Number of repeats" }),
  exportName: "monte-carlo",
  PlotPanel: HistogramPlot,
  formatFeatures: { bars: true },
  formatDatasets: (_t, _g, o) => [o?.histogram || "Values"],
  sheetName: (t) => `Monte Carlo histogram of ${t}`,
});

const MANIPULATIONS: Partial<Record<TableType, AnalysisDef[]>> = {
  xy: [transformAnalysis, concAnalysis, baselineAnalysis, normalizeAnalysis, transposeAnalysis,
    pruneAnalysis, fractionAnalysis, monteCarloAnalysis],
  column: [transformAnalysis, baselineAnalysis, normalizeAnalysis, transposeAnalysis,
    pruneAnalysis, fractionAnalysis, monteCarloAnalysis],
  grouped: [transformAnalysis, baselineAnalysis, normalizeAnalysis, transposeAnalysis,
    pruneAnalysis, fractionAnalysis],
  contingency: [monteCarloAnalysis],
};

/** Analyses this package adds to a table type (after its own). */
export function extraAnalyses(type: TableType): AnalysisDef[] {
  return MANIPULATIONS[type] ?? [];
}

/** Graph kinds this package adds to a table type. */
export function extraGraphs(type: TableType): GraphKindDef[] {
  return (MANIPULATIONS[type] ?? []).includes(monteCarloAnalysis) ? [mcHistogramGraph] : [];
}
