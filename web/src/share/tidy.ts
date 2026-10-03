// Wide <-> long. Every table type stores its values in a grid (datasets ×
// subcolumns × rows); the long ("tidy") form has one observation per row
// with its keys written out: the group it belongs to, the replicate or
// subject, X or the row title. Pure; used by the export bundle (tidy
// CSV), by Reshape (wide -> long table) and by the import recipes.
import { tableShape } from "../project/table.ts";
import type { DataColumn, DataTableModel } from "../project/types.ts";

export interface LongTable {
  headers: string[];
  rows: string[][];
  /** Per row: the observation was excluded in the source table. */
  excluded: boolean[];
}

const subCount = (d: DataColumn) => d.rows[0]?.length ?? 1;
const isExcl = (d: DataColumn, r: number, s: number) => !!d.excluded?.includes(`${r}:${s}`);

/** Subcolumns that form one record (Time + Event, Mean + SD + N) rather
 *  than replicates of one measurement. */
function recordSubcolumns(t: DataTableModel): string[] | null {
  if (t.type === "survival") return ["Time", "Event"];
  if (t.subcolumnFormat !== "replicates") {
    const d = t.datasets[0];
    return Array.from({ length: subCount(d) }, (_, s) => d.subTitles?.[s] || `Y${s + 1}`);
  }
  return null;
}

/** Name of the dataset key column for a table type. */
function datasetKey(t: DataTableModel): string {
  switch (t.type) {
    case "column": case "survival": case "nested": return "Group";
    case "contingency": return "Outcome";
    case "partsofwhole": return "Column";
    default: return "Dataset";
  }
}

/** The table in long form: one row per non-blank observation. */
export function tableToLong(t: DataTableModel): LongTable {
  const shape = tableShape(t.type);
  const n = t.x.length;
  const rowsOut: string[][] = [];
  const excluded: boolean[] = [];
  const hasRowTitles = shape.hasRowTitles && t.rowTitles.some((r) => r.trim());

  if (t.type === "multivariable") {
    const headers = ["Row", ...(hasRowTitles ? ["Row title"] : []), ...t.datasets.map((d) => d.name)];
    for (let r = 0; r < n; r++) {
      const vals = t.datasets.map((d) => d.rows[r]?.[0] ?? "");
      if (vals.every((v) => v.trim() === "")) continue;
      rowsOut.push([String(r + 1), ...(hasRowTitles ? [t.rowTitles[r] ?? ""] : []), ...vals]);
      excluded.push(t.datasets.some((d) => isExcl(d, r, 0)));
    }
    return { headers, rows: rowsOut, excluded };
  }

  const keyHead: string[] = [];
  const keyOf: ((r: number) => string)[] = [];
  if (t.type === "xy") {
    keyHead.push(t.xTitle || "X");
    keyOf.push((r) => t.x[r] ?? "");
  }
  if (t.type === "grouped" || t.type === "contingency" || t.type === "partsofwhole") {
    keyHead.push(t.type === "partsofwhole" ? "Part" : "Row");
    keyOf.push((r) => t.rowTitles[r]?.trim() || `Row ${r + 1}`);
  } else if (hasRowTitles) {
    keyHead.push("Row title");
    keyOf.push((r) => t.rowTitles[r] ?? "");
  }
  const dsHead = datasetKey(t);
  const record = recordSubcolumns(t);

  if (record) {
    const headers = [...keyHead, dsHead, t.type === "survival" ? "Subject" : "Row", ...record];
    for (const d of t.datasets) {
      for (let r = 0; r < n; r++) {
        const vals = record.map((_, s) => d.rows[r]?.[s] ?? "");
        if (vals.every((v) => v.trim() === "")) continue;
        rowsOut.push([...keyOf.map((f) => f(r)), d.name, String(r + 1), ...vals]);
        excluded.push(record.some((_, s) => isExcl(d, r, s)));
      }
    }
    return { headers, rows: rowsOut, excluded };
  }

  const nested = t.type === "nested";
  const single = t.type === "contingency" || t.type === "partsofwhole";
  const valueHead = t.type === "contingency" ? "Count" : "Value";
  const headers = [...keyHead, dsHead, ...(single ? [] : [nested ? "Subgroup" : "Replicate"]),
    ...(nested ? ["Replicate"] : []), valueHead];
  for (const d of t.datasets) {
    const subs = subCount(d);
    for (let s = 0; s < subs; s++) {
      for (let r = 0; r < n; r++) {
        const v = d.rows[r]?.[s] ?? "";
        if (v.trim() === "") continue;
        const sub = nested ? (d.subTitles?.[s]?.trim() || `${d.name} ${s + 1}`)
          : t.type === "column" && subs === 1 ? String(r + 1) : String(s + 1);
        rowsOut.push([...keyOf.map((f) => f(r)), d.name,
          ...(single ? [] : [sub]), ...(nested ? [String(r + 1)] : []), v]);
        excluded.push(isExcl(d, r, s));
      }
    }
  }
  return { headers, rows: rowsOut, excluded };
}

/** Long form as rows of text for CSV, with an "Excluded" column when
 *  any observation was excluded. */
export function longMatrix(l: LongTable): string[][] {
  const any = l.excluded.some(Boolean);
  return [
    any ? [...l.headers, "Excluded"] : l.headers,
    ...l.rows.map((r, i) => (any ? [...r, l.excluded[i] ? "TRUE" : ""] : r)),
  ];
}

const MISSING = new Set(["", "na", "n/a", "nan", "null", "-", "undetermined", "undet.", "#n/a"]);

/** Number in a cell, or null (blank, missing codes, text). */
export function cellNumber(v: string): number | null {
  const s = v.trim();
  if (MISSING.has(s.toLowerCase())) return null;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function isMissing(v: string): boolean {
  return MISSING.has(v.trim().toLowerCase());
}

/** A column is numeric when every non-missing cell is a number. */
export function isNumericColumn(values: string[]): boolean {
  let any = false;
  for (const v of values) {
    if (isMissing(v)) continue;
    if (cellNumber(v) === null) return false;
    any = true;
  }
  return any;
}

/** A long table as a multiple-variables data table: one variable per
 *  column (categorical when it holds text), one row per observation.
 *  Excluded observations stay excluded. */
export function longToMultivariable(l: LongTable, opts: { dropRowColumn?: boolean } = {}):
  DataTableModel {
  const keep = l.headers.map((h, i) => i).filter((i) => !(opts.dropRowColumn && l.headers[i] === "Row"
    && i === 0));
  const n = Math.max(1, l.rows.length);
  const datasets: DataColumn[] = keep.map((c) => {
    const values = l.rows.map((r) => r[c] ?? "");
    const numeric = isNumericColumn(values);
    const col: DataColumn = {
      name: l.headers[c],
      rows: Array.from({ length: n }, (_, r) => [numeric && isMissing(values[r] ?? "")
        ? "" : (values[r] ?? "")]),
      varType: numeric ? "continuous" : "categorical",
    };
    const ex = l.excluded.map((e, r) => (e && numeric ? `${r}:0` : "")).filter(Boolean);
    if (ex.length) col.excluded = ex;
    return col;
  });
  return {
    type: "multivariable",
    x: Array(n).fill(""),
    xTitle: "",
    xFormat: "numbers",
    xUnit: "",
    yTitle: "",
    rowTitles: Array(n).fill(""),
    datasets,
    subcolumnFormat: "replicates",
    replicateLayout: "side_by_side",
  };
}
