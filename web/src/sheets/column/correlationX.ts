// Correlation on an XY table, X against each Y data set (Prism, "How to:
// Correlation": "X vs. YA, X vs. YB ... but not YA vs. YB"; with replicate
// subcolumns only the row means are used). One engine "correlation"
// request per Y data set, X and the Y row means as its two data sets.
// Pure (no React).
import { numericData } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import type { ColumnOptionsState } from "../../types.ts";

export interface CorrelationXRequests {
  requests: { name: string; payload: Record<string, unknown> }[];
  /** Some row held more than one Y value of a data set: its mean was used. */
  replicatesAveraged: boolean;
}

/** One Y per row: the mean of the row's replicate values (null when the
 *  row has none), and whether any row held more than one. */
export function yRowMeans(ys: (number | null)[][]): { means: (number | null)[]; averaged: boolean } {
  let averaged = false;
  const means = ys.map((row) => {
    const v = row.filter((y): y is number => y !== null);
    if (v.length > 1) averaged = true;
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  });
  return { means, averaged };
}

export function correlationXRequests(table: DataTableModel, o: ColumnOptionsState):
  CorrelationXRequests | { error: string } {
  if (table.type !== "xy") return { error: "X against each Y needs an XY table" };
  if (table.subcolumnFormat !== "replicates") {
    return { error: "Correlation needs the Y values themselves (not mean / SD / n)" };
  }
  const d = numericData(table);
  const xName = table.xTitle.trim() || "X";
  let averaged = false;
  const requests = d.datasets.map((ds, k) => {
    const m = yRowMeans(ds.ys);
    if (m.averaged) averaged = true;
    const means = m.means;
    const name = ds.name.trim() || `Data set ${k + 1}`;
    return {
      name,
      payload: {
        analysis: "correlation",
        data: { datasets: [
          { name: xName, ys: d.x.map((x) => [x]) },
          { name, ys: means.map((m) => [m]) },
        ] },
        options: { method: o.corrMethod, dataset_a: 0, dataset_b: 1 },
      },
    };
  }).filter((r) => (r.payload.data.datasets[1].ys as (number | null)[][]).some((v) => v[0] !== null));
  if (!requests.length) return { error: "No Y data set has values" };
  return { requests, replicatesAveraged: averaged };
}
