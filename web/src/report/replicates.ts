// The unit of n and the number of independent experiments, read from a
// table's replicate map (DataTableModel.replicates, set in a graph's
// SuperPlot options or with "Assign replicates…"). The figure legend, the
// statistical-analysis paragraph, the journal checklists and the
// Reporting details dialog use these unless the user typed their own, so
// a table whose values are cells from three experiments reports
// "n = 18 cells from 3 independent experiments" without retyping it. Pure.
import type { DataTableModel } from "../project/types.ts";
import {
  isReplicateMeansResult, replicateInfo, replicateSummary,
} from "../sheets/common/superplot.ts";
import type { ReportMeta } from "./meta.ts";

export interface ReplicateFacts {
  /** Independent experiments (biological replicates) in the map. */
  experiments: number;
  /** What one value is ("cells", "wells"; "values" when not said). */
  unit: string;
  /** The result ran on the experiment means (n = experiments). */
  onMeans: boolean;
  /** Values per group (cell-level n), groups in table order. */
  values: { name: string; n: number }[];
}

/** Replicate facts of a column or grouped table with a replicate map of
 *  at least two experiments (else null). Without an explicit map the
 *  subcolumns are the experiments, which counts only when a graph shows
 *  the table as a SuperPlot (`superplot`) or the result ran on replicate
 *  means. */
export function replicateFacts(table: DataTableModel, result?: unknown,
  opts: { superplot?: boolean } = {}): ReplicateFacts | null {
  if ((table.type !== "column" && table.type !== "grouped")
    || table.subcolumnFormat !== "replicates") return null;
  if (!table.replicates && !opts.superplot && !isReplicateMeansResult(result)) return null;
  const info = replicateInfo(table);
  if (info.names.length < 2) return null;
  const values = table.type === "column"
    ? replicateSummary(table).groups.map((g) => ({ name: g.name, n: g.points.length }))
    : [];
  return {
    experiments: info.names.length,
    unit: table.replicates?.unit?.trim() || "values",
    onMeans: isReplicateMeansResult(result),
    values,
  };
}

/** The reporting details with the replicate map's unit and experiments
 *  filled in where the user left them blank. On replicate means, one n is
 *  an experiment. */
export function metaWithReplicates(meta: ReportMeta | undefined, table: DataTableModel,
  result?: unknown, opts: { superplot?: boolean } = {}): ReportMeta {
  const m = meta ?? {};
  const f = replicateFacts(table, result, opts);
  if (!f) return m;
  return {
    ...m,
    unit: m.unit ?? (f.onMeans ? "independent experiments" : f.unit),
    experiments: m.experiments ?? f.experiments,
  };
}

/** "54 cells in all" for a legend whose n counts experiments, or "" when
 *  there is nothing to add. */
export function withinNote(f: ReplicateFacts | null): string {
  if (!f || !f.onMeans || !f.values.length) return "";
  const total = f.values.reduce((a, g) => a + g.n, 0);
  if (!total) return "";
  return `${total} ${f.unit} in all`;
}
