// Clustered heat maps: row and column order from the engine's hierarchical
// clustering handler `cluster_heatmap` (engine/opendose/assay_clustering.py).
// The toggles stay disabled, with a note, while the running engine does
// not answer the handler (older engine builds); the wiring is one call:
//
//   clusterOrder(z, rowNames, colNames, { rows, cols }) -> { rows, cols } or null
//
// Engine contract:
//   payload  { analysis: "cluster_heatmap",
//              data: { values: number[][], row_names, column_names },
//              options: { method, metric, scale: "none",
//                         cluster_rows: bool, cluster_columns: bool } }
//   method / metric: the Clustered heat map assay's defaults (average
//   linkage, Euclidean; sheets/assays/clusterModel.ts DEFAULT_CLUSTER), so
//   the toggles and the assay order a matrix the same way.
//   answer   { row_order: number[], column_order: number[], rows?, columns?
//              (linkage, leaf order and dendrogram), ... }; the dendrograms
//              are drawn beside the map (sheets/common/dendrogram.ts, the
//              Clustered heat map assay's drawing).
// The matrix is the one the map colours (already z-scored when chosen);
// blank cells are filled with their column's mean for the ordering only.
import { analyzeAsync } from "../../lib/engine";
import { DEFAULT_CLUSTER, LINKAGE_LABEL, METRIC_LABEL } from "../assays/clusterModel";
import { parseDendrogram, type Dendrogram } from "../common/dendrogram";

export const CLUSTER_HANDLER = "cluster_heatmap";

export interface ClusterOrder {
  rows: number[];
  cols: number[];
  /** Dendrograms of the clustered axes (leaves in the new order). */
  rowTree?: Dendrogram | null;
  colTree?: Dendrogram | null;
}

/** Linkage and distance of the toggles (the assay's defaults), and how
 *  the toggle label names them: "average linkage, Euclidean". */
export const HEAT_CLUSTER_METHOD = DEFAULT_CLUSTER.method;
export const HEAT_CLUSTER_METRIC = DEFAULT_CLUSTER.metric;
export const HEAT_CLUSTER_SETTINGS = `${LINKAGE_LABEL[HEAT_CLUSTER_METHOD].split(" (")[0].toLowerCase()} `
  + `linkage, ${METRIC_LABEL[HEAT_CLUSTER_METRIC].split(" (")[0]}`;

/** Blank cells filled with their column's mean (0 when the column is
 *  empty): hierarchical clustering needs a complete matrix. */
export function filledMatrix(z: (number | null)[][]): number[][] {
  const nc = Math.max(0, ...z.map((r) => r.length));
  const ok = (x: number | null | undefined): x is number =>
    x !== null && x !== undefined && Number.isFinite(x);
  const means = Array.from({ length: nc }, (_, j) => {
    const v = z.map((r) => r[j]).filter(ok);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  });
  return z.map((r) => means.map((m, j) => (ok(r[j]) ? r[j] as number : m)));
}

export function clusterPayload(z: (number | null)[][], rowNames: string[], colNames: string[],
  which: { rows: boolean; cols: boolean }) {
  return {
    analysis: CLUSTER_HANDLER,
    data: { values: filledMatrix(z), row_names: rowNames, column_names: colNames },
    options: { method: HEAT_CLUSTER_METHOD, metric: HEAT_CLUSTER_METRIC, scale: "none",
      cluster_rows: which.rows, cluster_columns: which.cols },
  };
}

const isPerm = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n
  && new Set(v).size === n && v.every((i) => Number.isInteger(i) && i >= 0 && i < n);

/** Read the engine's answer; identity for an axis it did not reorder. */
export function parseClusterOrder(res: unknown, nRows: number, nCols: number): ClusterOrder | null {
  if (!res || typeof res !== "object" || (res as { error?: unknown }).error) return null;
  const r = res as Record<string, unknown>;
  const id = (n: number) => Array.from({ length: n }, (_, i) => i);
  const rowsOk = isPerm(r.row_order, nRows);
  const colsOk = isPerm(r.column_order, nCols);
  const rows = rowsOk ? r.row_order as number[] : id(nRows);
  const cols = colsOk ? r.column_order as number[] : id(nCols);
  const rowTree = rowsOk ? parseDendrogram(r.rows) : null;
  const colTree = colsOk ? parseDendrogram(r.columns) : null;
  return { rows, cols, rowTree, colTree };
}

let probe: Promise<boolean> | null = null;

/** Whether the running engine has the clustering handler (asked once). */
export function clusterAvailable(): Promise<boolean> {
  probe ??= analyzeAsync(clusterPayload([[0, 1, 2], [1, 0, 2], [2, 2, 0]],
    ["a", "b", "c"], ["d", "e", "f"], { rows: true, cols: true })).then((r) => {
    const res = r as { error?: string };
    return !(typeof res?.error === "string" && /unknown analysis/i.test(res.error));
  }).catch(() => false);
  return probe;
}

/** Row and column order for a heat map matrix, or null (no handler,
 *  nothing to cluster, or an answer that does not fit). */
export async function clusterOrder(z: (number | null)[][], rowNames: string[],
  colNames: string[], which: { rows: boolean; cols: boolean }): Promise<ClusterOrder | null> {
  if (!which.rows && !which.cols) return null;
  if (rowNames.length < 2 && colNames.length < 2) return null;
  if (!(await clusterAvailable())) return null;
  return parseClusterOrder(await analyzeAsync(clusterPayload(z, rowNames, colNames, which)),
    rowNames.length, colNames.length);
}
