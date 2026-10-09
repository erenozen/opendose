// Column and grouped tables that carry their replicate map: the values
// (one per image, well or cell) stay in the table, and the table says
// which independent experiment each one comes from (DataTableModel.
// replicates, sheets/common/superplot.ts). SuperPlots (Lord et al. 2020,
// J Cell Biol 219:e202001064) colour the values by experiment, and
// "Statistics on replicate means" tests one mean per experiment, so n is
// the number of experiments, not of images or cells. Pure.
import { cellNumber, isMissing } from "../tidy.ts";
import {
  distinct, finish, groupOf, type AggStep, type PivotResult, type Staging,
} from "./staging.ts";

/** The column naming the experiment (the first subject column), or -1
 *  when there is none or the values were already combined into one per
 *  experiment (then n is the experiments and no map is needed). */
export function experimentColumn(records: Staging, steps: AggStep[]): number {
  const e = records.columns.findIndex((c) => c.role === "subject");
  if (e < 0) return -1;
  const last = steps.length ? steps[steps.length - 1].level : -2;
  return last === e ? -1 : e;
}

/** What one value is, from the finest level aggregated into: one per
 *  file is one per image. */
export function valueUnit(records: Staging, steps: AggStep[]): string {
  const last = steps.length ? steps[steps.length - 1].level : -1;
  if (last < 0) return "values";
  const name = records.columns[last].name.trim().toLowerCase();
  if (/^(file|image|img|field|fov)s?$/.test(name)) return "images";
  if (/cell|object|nucle/.test(name)) return "cells";
  return name.endsWith("s") ? name : `${name}s`;
}

/** Experiment labels as text ("Replicate 1" for a bare 1), so the label
 *  data set of a column table is never read as numbers. */
export function experimentLabel(value: string, column: string): string {
  const v = value.trim();
  if (!v) return "";
  return cellNumber(v) !== null ? `${column} ${v}` : v;
}

const cell = (v: string) => (isMissing(v) ? "" : v);

/** The aggregated records as a column table (one data set per group and
 *  an "Experiment" data set of labels, rows matched by experiment) or a
 *  grouped table (subcolumns grouped by experiment), with the replicate
 *  map set. `exp` is the experiment column. */
export function replicatePivot(st: Staging, type: "column" | "grouped", exp: number,
  unit: string): PivotResult {
  const v = st.columns.findIndex((c) => c.role === "value");
  const t = st.columns.findIndex((c) => c.role === "time");
  if (v < 0) throw new Error("This table type needs a value column.");
  const label = (r: string[]) => groupOf(st, r) || "Values";
  const groups = distinct(st.rows.map(label));
  const reps = distinct(st.rows.map((r) => r[exp]).filter((x) => x !== ""));
  const names = reps.map((r) => experimentLabel(r, st.columns[exp].name));
  if (reps.length < 2) throw new Error("A replicate map needs at least two experiments in the "
    + `${st.columns[exp].name} column.`);

  if (type === "column") {
    // per experiment, as many rows as its largest group has values
    const lists = reps.map((rep) => groups.map((g) => st.rows
      .filter((r) => r[exp] === rep && label(r) === g).map((r) => cell(r[v])).filter((x) => x !== "")));
    const slots = lists.map((byGroup) => Math.max(1, ...byGroup.map((l) => l.length)));
    const rows = slots.flatMap((k, ri) => Array.from({ length: k }, (_, j) => ({ ri, j })));
    const res = finish({
      type: "column",
      x: rows.map(() => ""),
      datasets: [
        ...groups.map((g, gi) => ({ name: g, rows: rows.map(({ ri, j }) => [lists[ri][gi][j] ?? ""]) })),
        { name: "Experiment", rows: rows.map(({ ri }) => [names[ri]]) },
      ],
      replicates: { by: "column", column: groups.length, unit },
    });
    return { ...res, counts: res.counts.slice(0, groups.length) };
  }

  // grouped: one row per time / row value (or a single row)
  const keys = t >= 0 ? distinct(st.rows.map((r) => r[t]).filter((x) => x !== "")) : [""];
  const at = (g: string, k: string, rep: string) => st.rows.filter((r) => label(r) === g
    && (t < 0 || r[t] === k) && r[exp] === rep).map((r) => cell(r[v])).filter((x) => x !== "");
  const width = reps.map((rep) => Math.max(1, ...groups.flatMap((g) => keys.map((k) => at(g, k, rep).length))));
  const of = width.flatMap((w, ri) => Array<number>(w).fill(ri));
  const subTitles = width.flatMap((w, ri) => Array.from({ length: w },
    (_, j) => (w > 1 ? `${names[ri]} (${j + 1})` : names[ri])));
  return finish({
    type: "grouped",
    x: keys.map(() => ""),
    rowTitles: t >= 0 ? keys : [st.columns[v].name],
    datasets: groups.map((g) => ({
      name: g,
      subTitles,
      rows: keys.map((k) => reps.flatMap((rep, ri) => {
        const vals = at(g, k, rep);
        return Array.from({ length: width[ri] }, (_, j) => vals[j] ?? "");
      })),
    })),
    replicates: { by: "subcolumns", of, names, unit },
    ...(t >= 0 ? { factorNames: { rows: st.columns[t].name } } : {}),
  });
}
