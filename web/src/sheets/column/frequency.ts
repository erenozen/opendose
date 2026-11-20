// Frequency distribution of each data set of a Column table (engine
// frequency_distribution; statistics guide, "How to: Frequency
// distribution"): bins of a chosen or automatic width, counts, fractions
// or percents, cumulative (binned or exact), and a Gaussian or cumulative
// Gaussian fit. Pure (no React).
import { numericData, parseCell } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import type { ColumnOptionsState } from "../../types.ts";

export type FreqTabulate = "counts" | "fraction" | "percent";
export type FreqCumulative = "none" | "binned" | "exact";
export type FreqFit = "none" | "gaussian" | "cumulative_gaussian";

/** The engine request, or why these options cannot run. */
export function frequencyPayload(table: DataTableModel, o: ColumnOptionsState):
  { payload: Record<string, unknown> } | { error: string } {
  if (table.subcolumnFormat !== "replicates") {
    return { error: "A frequency distribution needs the values themselves (not mean / SD / n)" };
  }
  const cumulative: FreqCumulative = o.freqCumulative ?? "none";
  const fit: FreqFit = o.freqFit ?? "none";
  if (fit === "gaussian" && cumulative !== "none") {
    return { error: "Fit a Gaussian to the histogram (not cumulative), or choose the cumulative Gaussian "
      + "with the exact cumulative distribution" };
  }
  if (fit === "cumulative_gaussian" && cumulative !== "exact") {
    return { error: "The cumulative Gaussian is fitted to the exact cumulative distribution: choose "
      + "“Cumulative: exact (no bins)”" };
  }
  const num = (s: string | undefined) => {
    const v = parseCell(s ?? "");
    return v === null ? null : v;
  };
  const width = num(o.freqBinWidth);
  if (width !== null && !(width > 0)) return { error: "The bin width must be positive" };
  const tab: FreqTabulate = o.freqTabulate ?? "counts";
  const d = numericData(table);
  return {
    payload: {
      analysis: "frequency_distribution",
      data: { datasets: d.datasets },
      options: {
        ...(width !== null ? { bin_width: width } : {}),
        ...(num(o.freqFirstCenter) !== null ? { first_center: num(o.freqFirstCenter) } : {}),
        ...(num(o.freqUpper) !== null ? { upper_limit: num(o.freqUpper) } : {}),
        ...(cumulative === "binned" ? { cumulative: true } : {}),
        ...(cumulative === "exact" ? { exact: true } : {}),
        ...(tab !== "counts" ? { relative: tab } : {}),
        ...(fit !== "none" ? { fit } : {}),
        ...(o.freqReplicates === "mean" ? { replicates: "mean" } : {}),
      },
    },
  };
}
