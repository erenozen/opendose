// Covariate columns of a survival table (for Cox regression): every group
// gets the same extra subcolumns after Time and Event, titled with the
// covariate's name. Pure edits on the table model.
import type { DataColumn, DataTableModel } from "../../project/types.ts";
import { survivalCovariateNames } from "./cox.ts";

const width = (t: DataTableModel) => Math.max(2, ...t.datasets.map((d) => d.rows[0]?.length ?? 2));

function titles(d: DataColumn, w: number): string[] {
  const out = [...(d.subTitles ?? [])];
  while (out.length < w) out.push("");
  out[0] = out[0] || "Time";
  out[1] = out[1] || "Event";
  return out.slice(0, w);
}

/** Add a covariate subcolumn named `name` to every group. */
export function addSurvivalCovariate(t: DataTableModel, name: string): DataTableModel {
  const w = width(t);
  const label = name.trim() || `Covariate ${w - 1}`;
  return {
    ...t,
    datasets: t.datasets.map((d) => {
      const rows = d.rows.map((row) => {
        const next = row.slice(0, w);
        while (next.length < w) next.push("");
        next.push("");
        return next;
      });
      const subTitles = titles(d, w);
      subTitles.push(label);
      return { ...d, rows, subTitles };
    }),
  };
}

/** Remove covariate k (0 = the third subcolumn) from every group. */
export function removeSurvivalCovariate(t: DataTableModel, k: number): DataTableModel {
  const s = 2 + k;
  if (k < 0 || s >= width(t)) return t;
  return {
    ...t,
    datasets: t.datasets.map((d) => {
      const rows = d.rows.map((row) => row.filter((_, i) => i !== s));
      const subTitles = titles(d, width(t)).filter((_, i) => i !== s);
      const excluded = d.excluded?.flatMap((key) => {
        const [r, c] = key.split(":").map(Number);
        if (c === s) return [];
        return [c > s ? `${r}:${c - 1}` : key];
      });
      return { ...d, rows, subTitles, ...(excluded ? { excluded } : {}) };
    }),
  };
}

/** Rename covariate k in every group. */
export function renameSurvivalCovariate(t: DataTableModel, k: number, name: string): DataTableModel {
  const s = 2 + k;
  if (k < 0 || s >= width(t)) return t;
  return {
    ...t,
    datasets: t.datasets.map((d) => {
      const subTitles = titles(d, width(t));
      subTitles[s] = name;
      return { ...d, subTitles };
    }),
  };
}

export { survivalCovariateNames };
