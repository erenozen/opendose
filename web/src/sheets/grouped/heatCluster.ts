// Clustered heat maps: row / column order from the engine's hierarchical
// clustering handler `cluster_heatmap` (being written separately). The
// options exist now and stay disabled, with a note, until the running
// engine answers the handler; wiring is this one call:
//
//   clusterOrder(z, rowNames, colNames, { rows, cols }) -> { rows, cols } | null
//
// Contract expected from the engine:
//   payload  { analysis: "cluster_heatmap",
//              data: { matrix: (number|null)[][], row_names: string[], col_names: string[] },
//              options: { rows: bool, cols: bool, linkage: "average", distance: "euclidean" } }
//   answer   { row_order: number[], col_order: number[], ... } (permutations of
//            0..n-1; a dendrogram may come along and is not drawn yet)
import { getEngine } from "../../lib/engine";

export const CLUSTER_HANDLER = "cluster_heatmap";

export interface ClusterOrder { rows: number[]; cols: number[] }

export function clusterPayload(z: (number | null)[][], rowNames: string[], colNames: string[],
  which: { rows: boolean; cols: boolean }) {
  return {
    analysis: CLUSTER_HANDLER,
    data: { matrix: z, row_names: rowNames, col_names: colNames },
    options: { rows: which.rows, cols: which.cols, linkage: "average", distance: "euclidean" },
  };
}

const isPerm = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n
  && new Set(v).size === n && v.every((i) => Number.isInteger(i) && i >= 0 && i < n);

/** Read the engine's answer; identity for an axis it did not reorder. */
export function parseClusterOrder(res: unknown, nRows: number, nCols: number): ClusterOrder | null {
  if (!res || typeof res !== "object" || (res as { error?: unknown }).error) return null;
  const r = res as Record<string, unknown>;
  const id = (n: number) => Array.from({ length: n }, (_, i) => i);
  const rows = isPerm(r.row_order, nRows) ? r.row_order : id(nRows);
  const cols = isPerm(r.col_order, nCols) ? r.col_order : id(nCols);
  return { rows, cols };
}

let probe: Promise<boolean> | null = null;

/** Whether the running engine has the clustering handler (asked once). */
export function clusterAvailable(): Promise<boolean> {
  probe ??= getEngine().then((eng) => {
    const res = eng.analyze(clusterPayload([[0, 1], [1, 0]], ["a", "b"], ["c", "d"],
      { rows: true, cols: true })) as { error?: string };
    return !(typeof res?.error === "string" && /unknown analysis/i.test(res.error));
  }).catch(() => false);
  return probe;
}

/** Row and column order for a heat map matrix, or null (no handler,
 *  nothing to cluster, or an answer that does not fit). */
export async function clusterOrder(z: (number | null)[][], rowNames: string[],
  colNames: string[], which: { rows: boolean; cols: boolean }): Promise<ClusterOrder | null> {
  if (!which.rows && !which.cols) return null;
  if (!(await clusterAvailable())) return null;
  const eng = await getEngine();
  return parseClusterOrder(eng.analyze(clusterPayload(z, rowNames, colNames, which)),
    rowNames.length, colNames.length);
}
