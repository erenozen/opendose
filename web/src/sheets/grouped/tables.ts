// Derived tables built from results (pure).
import { normalizeTable } from "../../project/table.ts";
import type { DataTableModel, SubcolumnFormat } from "../../project/types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export const CALC_TITLE: Record<string, string> = {
  mean: "Mean", median: "Median", geometric_mean: "Geometric mean", total: "Total",
};

/** The row-means result as a new grouped data table: mean with SD / SEM
 *  / %CV and N where those were computed, otherwise one value per cell. */
export function rowMeansTable(result: R, name: string): DataTableModel {
  const err = result.error_type as string;
  const fmt: SubcolumnFormat = result.calculate === "mean" && err === "sd" ? "mean_sd_n"
    : result.calculate === "mean" && err === "sem" ? "mean_sem_n"
      : result.calculate === "mean" && err === "cv" ? "mean_cv_n" : "replicates";
  const cell = (r: R): string[] => {
    const v = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? String(x) : "");
    if (fmt === "mean_sd_n") return [v(r.value), v(r.sd), v(r.n)];
    if (fmt === "mean_sem_n") return [v(r.value), v(r.sem), v(r.n)];
    if (fmt === "mean_cv_n") return [v(r.value), v(r.cv_percent), v(r.n)];
    return [v(r.value)];
  };
  const blocks: { name: string; rows: R[] }[] = result.scope === "dataset"
    ? result.datasets : [{ name: CALC_TITLE[result.calculate] ?? "Value", rows: result.rows }];
  const titles = (result.row_titles as string[]) ?? [];
  return normalizeTable({
    type: "grouped",
    x: titles.map(() => ""),
    rowTitles: titles,
    yTitle: `${CALC_TITLE[result.calculate] ?? "Value"} of ${name}`,
    subcolumnFormat: fmt,
    datasets: blocks.map((b) => ({
      name: b.name,
      rows: b.rows.map(cell),
      ...(fmt === "replicates" ? {} : {
        subTitles: fmt === "mean_sd_n" ? ["Mean", "SD", "N"]
          : fmt === "mean_sem_n" ? ["Mean", "SEM", "N"] : ["Mean", "%CV", "N"],
      }),
    })),
  });
}

