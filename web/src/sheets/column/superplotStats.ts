// "Statistics on replicate means" (SuperPlots): the column table is
// reduced to one value per experiment and group (the mean or median of
// that experiment's values), and the chosen test runs on those through
// the ordinary column analyses, so n is the number of experiments. Pure:
// the engine is passed in.
type EngineBridge = { analyze: (payload: unknown) => unknown };
import type { DataTableModel } from "../../project/types.ts";
import {
  DEFAULT_COLUMN_OPTIONS, type ColumnOptionsState, type ComparisonsMethod,
} from "../../types.ts";
import { replicateInfo, replicateMeanTable, type SuperCenter } from "../common/superplot.ts";
import { runColumn } from "./run.ts";

export const ANALYSIS_REPLICATE_MEANS = "column_replicate_means";

export type RepTest =
  | "unpaired" | "welch" | "paired" | "ratio_paired" | "mann_whitney" | "wilcoxon"
  | "anova" | "rm_anova" | "kruskal" | "friedman";

export const REP_TEST_LABELS: Record<RepTest, string> = {
  paired: "Paired t test (experiments matched)",
  ratio_paired: "Ratio paired t test (matched, lognormal)",
  unpaired: "Unpaired t test",
  welch: "Unpaired t test with Welch's correction",
  wilcoxon: "Wilcoxon matched-pairs test",
  mann_whitney: "Mann-Whitney test",
  rm_anova: "Repeated-measures one-way ANOVA (matched)",
  anova: "Ordinary one-way ANOVA",
  friedman: "Friedman test (matched, nonparametric)",
  kruskal: "Kruskal-Wallis test",
};

/** Tests of two groups (the rest take every group). */
export const TWO_GROUP_TESTS: RepTest[] =
  ["paired", "ratio_paired", "unpaired", "welch", "wilcoxon", "mann_whitney"];

export interface RepMeansOptions {
  test: RepTest;
  /** Indices among the plotted groups (the replicate-mean table). */
  datasetA: number;
  datasetB: number;
  comparisons: ComparisonsMethod;
  controlIndex: number;
  center: SuperCenter;
}

export const DEFAULT_REP_MEANS: RepMeansOptions = {
  test: "paired", datasetA: 0, datasetB: 1, comparisons: "tukey", controlIndex: 0,
  center: "mean",
};

/** Sensible test for a table: paired t for two groups, RM ANOVA for more
 *  (experiments run all conditions side by side, Lord et al. 2020). */
export function defaultRepMeans(table: DataTableModel): RepMeansOptions {
  const groups = replicateInfo(table).groups.length;
  return { ...DEFAULT_REP_MEANS, test: groups > 2 ? "rm_anova" : "paired" };
}

export function normalizeRepMeans(raw: unknown, table: DataTableModel): RepMeansOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = defaultRepMeans(table);
  const int = (v: unknown, def: number) => (Number.isInteger(v) && (v as number) >= 0 ? v as number : def);
  return {
    test: typeof o.test === "string" && o.test in REP_TEST_LABELS ? o.test as RepTest : d.test,
    datasetA: int(o.datasetA, d.datasetA),
    datasetB: int(o.datasetB, d.datasetB),
    comparisons: typeof o.comparisons === "string" ? o.comparisons as ComparisonsMethod : d.comparisons,
    controlIndex: int(o.controlIndex, d.controlIndex),
    center: o.center === "median" ? "median" : "mean",
  };
}

/** The column-analysis options that run a replicate-means test. */
export function columnOptionsFor(o: RepMeansOptions): ColumnOptionsState {
  const base = { ...DEFAULT_COLUMN_OPTIONS, datasetA: o.datasetA, datasetB: o.datasetB,
    comparisons: o.comparisons, controlIndex: o.controlIndex };
  switch (o.test) {
    case "anova": return { ...base, analysis: "anova", anovaKind: "parametric", anovaSd: "equal" };
    case "kruskal": return { ...base, analysis: "anova", anovaKind: "nonparametric" };
    case "rm_anova": return { ...base, analysis: "rm_anova", rmKind: "parametric" };
    case "friedman": return { ...base, analysis: "rm_anova", rmKind: "nonparametric" };
    default: return { ...base, analysis: "ttest", ttestKind: o.test };
  }
}

/** Run the test on the replicate means; the result carries a `superplot`
 *  block (n experiments, their names, mean or median) and the table of
 *  replicate means. */
export function runReplicateMeans(engine: EngineBridge, table: DataTableModel,
  o: RepMeansOptions): Record<string, unknown> {
  if (table.subcolumnFormat !== "replicates") {
    return { error: "Statistics on replicate means need the individual values "
      + "(replicate subcolumns), not summary data." };
  }
  const means = replicateMeanTable(table, o.center);
  const names = means.rowTitles;
  if (names.length < 2) {
    return { error: "Only one experiment: assign the subcolumns (or an experiment column) "
      + "to at least two experiments in the graph's SuperPlot options." };
  }
  if (means.datasets.length < 2) return { error: "Needs at least two groups." };
  // Rows where any group lacks a mean break matched tests: report n per group.
  const n = Math.max(...means.datasets.map((d) => d.rows.filter((r) => r[0] !== "").length));
  const r = runColumn(engine, means, columnOptionsFor(o));
  return {
    ...r,
    superplot: { n, replicates: names, center: o.center },
    replicate_means: {
      replicates: names,
      groups: means.datasets.map((d) => ({ name: d.name,
        values: d.rows.map((row) => (row[0] === "" ? null : Number(row[0]))) })),
    },
  };
}
