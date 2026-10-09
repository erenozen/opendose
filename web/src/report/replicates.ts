// The unit of n and the number of independent experiments, read from a
// table's replicate map (DataTableModel.replicates, set in a graph's
// SuperPlot options, with "Assign replicates…" or by answering "What does
// each value represent?"). The figure legend, the statistical-analysis
// paragraph, the journal checklists and the Reporting details dialog use
// these unless the user typed their own, so a table whose values are cells
// from three experiments reports "n = 18 cells from 3 independent
// experiments" without retyping it, and on replicate means "n = 3
// independent experiments (9 wells) per group". Column, grouped (per row ×
// data set cell) and XY tables (per X value). Pure.
import type { DataTableModel } from "../project/types.ts";
import {
  groupedCellReplicates, isReplicateMeansResult, replicateInfo, replicateSummary,
} from "../sheets/common/superplot.ts";
import type { ReportMeta } from "./meta.ts";

export interface ReplicateFacts {
  /** Independent experiments (biological replicates) in the map. */
  experiments: number;
  /** What one value is ("cells", "wells"; "values" when not said). */
  unit: string;
  /** The result ran on the experiment means (n = experiments). */
  onMeans: boolean;
  /** Values per group (column: per data set; grouped: per row × data set
   *  cell; XY: per X value of each data set), in table order. */
  values: { name: string; n: number }[];
}

const MAPPED = new Set(["column", "grouped", "xy"]);

/** Replicate facts of a column, grouped or XY table with a replicate map
 *  of at least two experiments (else null). Without an explicit map the
 *  subcolumns are the experiments, which counts only when a graph shows
 *  the table as a SuperPlot (`superplot`) or the result ran on replicate
 *  means. */
export function replicateFacts(table: DataTableModel, result?: unknown,
  opts: { superplot?: boolean } = {}): ReplicateFacts | null {
  if (!MAPPED.has(table.type) || table.subcolumnFormat !== "replicates") return null;
  if (!table.replicates && !opts.superplot && !isReplicateMeansResult(result)) return null;
  const info = replicateInfo(table.type === "column" ? table : { ...table, type: "grouped" });
  if (info.names.length < 2) return null;
  const values = table.type === "column"
    ? replicateSummary(table).groups.map((g) => ({ name: g.name, n: g.points.length }))
    : groupedCellReplicates(table).cells.flat()
      .map((c) => ({ name: c.name, n: c.points.length })).filter((c) => c.n > 0);
  return {
    experiments: info.names.length,
    unit: table.replicates?.unit?.trim() || "values",
    onMeans: isReplicateMeansResult(result),
    values,
  };
}

/** Several values per experiment in a group (technical repeats, cells):
 *  more values than experiments in some group. */
export function hasRepeats(f: ReplicateFacts | null): boolean {
  return !!f && f.values.some((g) => g.n > f.experiments);
}

/** The reporting details with the replicate map's unit and experiments
 *  filled in where the user left them blank. On replicate means (and for
 *  XY tables with repeats inside experiments, whose points are means) one
 *  n is an experiment. */
export function metaWithReplicates(meta: ReportMeta | undefined, table: DataTableModel,
  result?: unknown, opts: { superplot?: boolean } = {}): ReportMeta {
  const m = meta ?? {};
  const f = replicateFacts(table, result, opts);
  if (!f) return m;
  const byExperiment = f.onMeans || (table.type === "xy" && hasRepeats(f));
  return {
    ...m,
    unit: m.unit ?? (byExperiment ? "independent experiments" : f.unit),
    experiments: m.experiments ?? f.experiments,
  };
}

/** "9 wells" when n counts experiments and every group holds the same
 *  number of values (the legend writes "n = 3 independent experiments
 *  (9 wells) per group"), else "". */
export function withinPerGroup(f: ReplicateFacts | null, xy = false): string {
  if (!f || !(f.onMeans || (xy && hasRepeats(f))) || !f.values.length) return "";
  const n = f.values[0].n;
  if (!n || !f.values.every((g) => g.n === n)) return "";
  return `${n} ${f.unit}`;
}

/** "54 cells in all" for a legend whose n counts experiments when the
 *  groups hold different numbers of values, or "" when there is nothing
 *  to add (or withinPerGroup says it). */
export function withinNote(f: ReplicateFacts | null, xy = false): string {
  if (!f || !(f.onMeans || (xy && hasRepeats(f))) || !f.values.length) return "";
  if (withinPerGroup(f, xy)) return "";
  const total = f.values.reduce((a, g) => a + g.n, 0);
  if (!total) return "";
  return `${total} ${f.unit} in all`;
}
