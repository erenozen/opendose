// The staging table every import recipe produces: long format, one
// record per row, each column typed and given a role. From here the
// records can be aggregated up a hierarchy (cell -> image -> animal) and
// pivoted into any table type. Pure and unit-tested.
import { normalizeTable } from "../../project/table.ts";
import type { DataColumn, DataTableModel } from "../../project/types.ts";
import { cellNumber, isMissing, isNumericColumn } from "../tidy.ts";

/** What a staging column means.
 *  group    the treatment / condition (several group columns are joined)
 *  subject  the experimental unit: animal, donor, biological replicate
 *  time     X or the row factor: time point, dose, target gene
 *  value    the measurement
 *  event    survival event code (1 = event, 0 = censored)
 *  level    a level of the sampling hierarchy below or above the subject
 *           (cell, image, well, slide)
 *  meta     kept for reference, not used by the pivot
 *  skip     ignored */
export type Role = "group" | "subject" | "time" | "value" | "event" | "level" | "meta" | "skip";

export const ROLE_LABELS: Record<Role, string> = {
  group: "Group", subject: "Subject / replicate", time: "Time / X / row",
  value: "Value", event: "Event (1/0)", level: "Hierarchy level", meta: "Metadata", skip: "Skip",
};

export const ROLES: Role[] = ["group", "subject", "time", "value", "event", "level", "meta", "skip"];

export interface StagingColumn {
  name: string;
  role: Role;
  numeric: boolean;
}

export interface Staging {
  columns: StagingColumn[];
  rows: string[][];
}

export function makeStaging(headers: string[], rows: string[][], roles: Role[]): Staging {
  const width = headers.length;
  const rect = rows.map((r) => Array.from({ length: width }, (_, c) => (r[c] ?? "").trim()));
  return {
    columns: headers.map((name, c) => ({
      name: name || `Column ${c + 1}`,
      role: roles[c] ?? "meta",
      numeric: isNumericColumn(rect.map((r) => r[c])),
    })),
    rows: rect,
  };
}

export function withRoles(st: Staging, roles: Role[]): Staging {
  return { ...st, columns: st.columns.map((c, i) => ({ ...c, role: roles[i] ?? c.role })) };
}

const idx = (st: Staging, role: Role) => st.columns.findIndex((c) => c.role === role);
const all = (st: Staging, role: Role) =>
  st.columns.map((c, i) => (c.role === role ? i : -1)).filter((i) => i >= 0);

/** Group label of a record: its group columns joined ("" when none). */
export function groupOf(st: Staging, row: string[]): string {
  return all(st, "group").map((c) => row[c]).filter((v) => v !== "").join(" ");
}

/** Distinct values in first-appearance order. */
export function distinct(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) if (!seen.has(v)) { seen.add(v); out.push(v); }
  return out;
}

// ------------------------------------------------------------ aggregation

export type AggFn = "mean" | "median" | "sum" | "count";

export const AGG_LABELS: Record<AggFn, string> = {
  mean: "Mean", median: "Median", sum: "Sum", count: "Count",
};

/** One aggregation step: combine the records that share group, time and
 *  `level` (and every coarser level aggregated later) into one record.
 *  `level` -1 means no level: records sharing group and time only (for
 *  example technical replicate wells). */
export interface AggStep { level: number; fn: AggFn }

export function aggValue(values: number[], fn: AggFn, records: number): number | null {
  if (fn === "count") return records;
  if (!values.length) return null;
  if (fn === "sum") return values.reduce((a, b) => a + b, 0);
  if (fn === "mean") return values.reduce((a, b) => a + b, 0) / values.length;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Shortest decimal text for an aggregated number (no float noise such
 *  as 0.30000000000000004). */
export function numText(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toPrecision(12)));
}

/** Hierarchy columns (subject and level roles), finest first: the
 *  column with more distinct values (in context of its group) is lower
 *  in the hierarchy. */
export function hierarchy(st: Staging): number[] {
  const cols = st.columns.map((_, i) => i)
    .filter((i) => st.columns[i].role === "subject" || st.columns[i].role === "level");
  const g = all(st, "group");
  const count = (c: number) => new Set(st.rows.map((r) => [...g.map((k) => r[k]), r[c]].join("\u0001"))).size;
  const n = new Map(cols.map((c) => [c, count(c)]));
  return cols.sort((a, b) => (n.get(b)! - n.get(a)!) || a - b);
}

/** Apply the steps in order. The schema stays the same; columns that are
 *  not keys keep their value where it is constant within a combined
 *  record and become blank otherwise. */
export function aggregate(st: Staging, steps: AggStep[]): Staging {
  const v = idx(st, "value");
  if (v < 0 || !steps.length) return st;
  let rows = st.rows;
  const g = all(st, "group");
  const t = idx(st, "time");
  steps.forEach((step, i) => {
    const coarser = steps.slice(i).map((s) => s.level).filter((l) => l >= 0);
    const keys = [...g, ...(t >= 0 ? [t] : []), ...coarser];
    const buckets = new Map<string, string[][]>();
    for (const r of rows) {
      const k = keys.map((c) => r[c]).join("\u0001");
      let b = buckets.get(k);
      if (!b) { b = []; buckets.set(k, b); }
      b.push(r);
    }
    rows = [...buckets.values()].map((b) => {
      const out = b[0].map((_, c) => (b.every((r) => r[c] === b[0][c]) ? b[0][c] : ""));
      const nums = b.map((r) => cellNumber(r[v])).filter((x): x is number => x !== null);
      const agg = aggValue(nums, step.fn, b.length);
      out[v] = agg === null ? "" : numText(agg);
      return out;
    });
  });
  return { columns: st.columns.map((c, i) => (i === v ? { ...c, numeric: true } : c)), rows };
}

// ------------------------------------------------------------ pivot

export type OutputType = "column" | "grouped" | "xy" | "multivariable" | "survival" | "nested";

export const OUTPUT_LABELS: Record<OutputType, string> = {
  column: "Column (one column per group)",
  grouped: "Grouped (rows × groups, replicates side by side)",
  xy: "XY (X = time or dose, one dataset per group)",
  multivariable: "Multiple variables (the long table itself)",
  survival: "Survival (time and event per subject)",
  nested: "Nested (groups × subjects × values)",
};

export interface PivotOptions {
  /** Column whose values identify replicates (aligns subcolumns across
   *  rows); defaults to the subject column. -1 = none. */
  subject?: number;
}

export interface PivotResult {
  table: DataTableModel;
  /** Datasets with the number of values each holds. */
  counts: { name: string; n: number }[];
}

export function requirements(type: OutputType): string {
  switch (type) {
    case "column": return "a value column (and usually a group column)";
    case "grouped": return "a value column, a group column and a time / row column";
    case "xy": return "a value column and a numeric time / X column";
    case "survival": return "a time (or value) column, and an event column if any subject was censored";
    case "nested": return "a value column, a group column and a subject column";
    default: return "";
  }
}

const cell = (v: string) => (isMissing(v) ? "" : v);

export function finish(raw: unknown): PivotResult {
  const table = normalizeTable(raw);
  const counts = table.datasets.map((d) => ({
    name: d.name,
    n: d.rows.reduce((a, row) => a + row.filter((x, s) => (table.type === "survival" ? s === 0 : true)
      && x.trim() !== "").length, 0),
  }));
  return { table, counts };
}

/** Records as a table of the chosen type. Throws with a readable message
 *  when a role the type needs is missing. */
export function pivot(st: Staging, type: OutputType, opts: PivotOptions = {}): PivotResult {
  const v = idx(st, "value");
  const t = idx(st, "time");
  const ev = idx(st, "event");
  const subj = opts.subject !== undefined ? opts.subject : idx(st, "subject");
  const rows = st.rows;
  const groupLabel = (r: string[]) => groupOf(st, r) || "Values";
  const groups = distinct(rows.map(groupLabel));
  const need = (ok: boolean) => {
    if (!ok) throw new Error(`This table type needs ${requirements(type)}.`);
  };

  if (type === "multivariable") {
    const cols = st.columns.map((_, i) => i).filter((i) => st.columns[i].role !== "skip");
    const n = Math.max(1, rows.length);
    return finish({
      type: "multivariable",
      x: Array(n).fill(""),
      datasets: cols.map((c) => ({
        name: st.columns[c].name,
        varType: st.columns[c].numeric ? "continuous" : "categorical",
        rows: rows.map((r) => [st.columns[c].numeric ? cell(r[c]) : r[c]]),
      })),
    });
  }

  if (type === "survival") {
    const timeCol = t >= 0 ? t : v;
    need(timeCol >= 0);
    const eventCode = (x: string) => {
      const s = x.trim().toLowerCase();
      if (["0", "false", "no", "censored", "alive", "c"].includes(s)) return "0";
      return "1";
    };
    return finish({
      type: "survival",
      datasets: groups.map((g) => ({
        name: g,
        subTitles: ["Time", "Event"],
        rows: rows.filter((r) => groupLabel(r) === g && cellNumber(r[timeCol]) !== null)
          .map((r) => [r[timeCol], ev >= 0 ? eventCode(r[ev]) : "1"]),
      })),
    });
  }

  need(v >= 0);

  if (type === "column") {
    const cols = groups.map((g) => rows.filter((r) => groupLabel(r) === g)
      .map((r) => cell(r[v])).filter((x) => x !== ""));
    const n = Math.max(1, ...cols.map((c) => c.length));
    return finish({
      type: "column",
      x: Array(n).fill(""),
      datasets: groups.map((g, i) => ({ name: g, rows: cols[i].map((x) => [x]) })),
    });
  }

  if (type === "nested") {
    need(subj >= 0);
    return finish({
      type: "nested",
      datasets: groups.map((g) => {
        const mine = rows.filter((r) => groupLabel(r) === g);
        const subs = distinct(mine.map((r) => r[subj]));
        const lists = subs.map((s) => mine.filter((r) => r[subj] === s)
          .map((r) => cell(r[v])).filter((x) => x !== ""));
        const n = Math.max(1, ...lists.map((l) => l.length));
        return {
          name: g,
          subTitles: subs.map((s) => s || "(blank)"),
          rows: Array.from({ length: n }, (_, r) => lists.map((l) => l[r] ?? "")),
        };
      }),
    });
  }

  // grouped and XY: rows are time values, replicates side by side.
  need(t >= 0);
  const isXY = type === "xy";
  let keys = distinct(rows.map((r) => r[t]).filter((x) => x !== ""));
  if (isXY) {
    need(keys.every((k) => cellNumber(k) !== null));
    keys = [...keys].sort((a, b) => cellNumber(a)! - cellNumber(b)!);
  }
  // Replicate slots: per group, one subcolumn per subject (so repeated
  // measures of one subject stay in one subcolumn), or by order of
  // appearance within each cell when there is no subject column.
  const datasets: DataColumn[] = groups.map((g) => {
    const mine = rows.filter((r) => groupLabel(r) === g);
    const subs = subj >= 0 ? distinct(mine.map((r) => r[subj])) : [];
    const byKey = new Map<string, string[][]>();
    for (const r of mine) {
      const b = byKey.get(r[t]);
      if (b) b.push(r); else byKey.set(r[t], [r]);
    }
    const cells = keys.map((k) => byKey.get(k) ?? []);
    const width = subj >= 0 ? Math.max(1, subs.length)
      : Math.max(1, ...cells.map((c) => c.filter((r) => cell(r[v]) !== "").length));
    const grid = cells.map((c) => {
      const row = Array<string>(width).fill("");
      if (subj >= 0) {
        for (const r of c) {
          const s = subs.indexOf(r[subj]);
          if (row[s] === "") row[s] = cell(r[v]);
        }
      } else {
        c.map((r) => cell(r[v])).filter((x) => x !== "").forEach((x, i) => { row[i] = x; });
      }
      return row;
    });
    const col: DataColumn = { name: g, rows: grid };
    if (subj >= 0) col.subTitles = subs;
    return col;
  });
  return finish({
    type,
    x: isXY ? keys : Array(keys.length).fill(""),
    xTitle: isXY ? st.columns[t].name : "",
    xUnit: "",
    rowTitles: isXY ? [] : keys,
    datasets,
    // the long file's factor columns name the two-way factors
    ...(isXY ? {} : { factorNames: {
      rows: st.columns[t].name,
      datasets: all(st, "group").map((c) => st.columns[c].name).join(" × "),
    } }),
  });
}

/** Number of distinct experimental units per group after the steps:
 *  what n will be. */
export function unitsPerGroup(st: Staging, subject: number): { name: string; n: number }[] {
  const groups = distinct(st.rows.map((r) => groupOf(st, r) || "Values"));
  return groups.map((g) => {
    const mine = st.rows.filter((r) => (groupOf(st, r) || "Values") === g);
    return { name: g, n: subject >= 0 ? new Set(mine.map((r) => r[subject])).size : mine.length };
  });
}
