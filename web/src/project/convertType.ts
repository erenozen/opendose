// "Convert table to…": a table rebuilt in another table type or layout,
// keeping every value, every exclusion and the pairing (values of one
// subject stay in one row, or in one subcolumn across data sets). The
// grid always makes a NEW table from the result; the original is never
// changed. Pure; unit-tested.
//
//   column  -> grouped       same rows (row r stays row r), or all values
//                            of a group side by side in one row (rows
//                            become subcolumns, matched across data sets),
//                            or groups as rows of one data set
//   grouped -> column        one column per row x data set, or one per
//                            data set with the subcolumns stacked
//   column / grouped -> multiple variables (long: one value per row with
//                            its group, row / subject and replicate)
//   multiple variables -> column / grouped (pivot by categorical variables)
//   XY / grouped: replicates stacked down rows <-> side by side
import { emptyTable, normalizeTable, parseCell } from "./table.ts";
import type { DataColumn, DataTableModel, TableType } from "./types.ts";
import { SUBCOLUMN_FORMAT_TITLES } from "./types.ts";

const subs = (d: DataColumn | undefined) => d?.rows[0]?.length ?? 1;
const isEx = (d: DataColumn, r: number, s: number) => !!d.excluded?.includes(`${r}:${s}`);
const filled = (v: string | undefined) => (v ?? "").trim() !== "";
const rowName = (t: DataTableModel, r: number) => t.rowTitles[r]?.trim() || `Row ${r + 1}`;

/** Last row holding any value or row title (trailing blank rows dropped). */
function usedRows(t: DataTableModel): number {
  let last = -1;
  for (let r = 0; r < t.x.length; r++) {
    if (filled(t.x[r]) || filled(t.rowTitles[r])
      || t.datasets.some((d) => d.rows[r]?.some(filled))) last = r;
  }
  return last + 1;
}

function blankTable(type: TableType, base: DataTableModel): DataTableModel {
  const e = emptyTable(type, { datasets: 1, rows: 1, subcolumns: 1 });
  return {
    ...e,
    yTitle: base.yTitle,
    ...(base.decimals !== undefined ? { decimals: base.decimals } : {}),
  };
}

/** Build a data set from a list of cells, with exclusions. */
function makeColumn(name: string, nRows: number, width: number,
  cells: { r: number; s: number; v: string; ex?: boolean }[], subTitles?: string[]): DataColumn {
  const rows = Array.from({ length: Math.max(1, nRows) }, () => Array<string>(Math.max(1, width)).fill(""));
  const excluded: string[] = [];
  for (const c of cells) {
    rows[c.r][c.s] = c.v;
    if (c.ex) excluded.push(`${c.r}:${c.s}`);
  }
  const col: DataColumn = { name, rows };
  if (excluded.length) col.excluded = excluded;
  if (subTitles?.some((x) => x.trim())) col.subTitles = subTitles.slice(0, Math.max(1, width));
  return col;
}

// ------------------------------------------------------------ column -> grouped

export type ColumnToGroupedLayout = "rows" | "one-row" | "groups-as-rows";

/** A column table as a grouped table.
 *  "rows": each group becomes a data set and row r stays row r (pairs and
 *  subjects stay in their rows; summary formats keep their subcolumns).
 *  "one-row": each group becomes a data set whose values sit side by side
 *  in one row: row r becomes subcolumn r of every data set, so matched
 *  values stay matched (subcolumn titles from the row titles).
 *  "groups-as-rows": each group becomes a row of one data set, its values
 *  side by side (row r -> subcolumn r). */
export function columnToGrouped(t: DataTableModel, layout: ColumnToGroupedLayout): DataTableModel {
  const n = Math.max(1, usedRows(t));
  if (layout === "rows" || t.subcolumnFormat !== "replicates") {
    return normalizeTable({
      ...blankTable("grouped", t),
      subcolumnFormat: t.subcolumnFormat,
      rowTitles: Array.from({ length: n }, (_, r) => t.rowTitles[r] ?? ""),
      x: Array(n).fill(""),
      datasets: t.datasets.map((d) => ({
        ...d,
        rows: d.rows.slice(0, n).map((row) => [...row]),
        excluded: d.excluded?.filter((k) => Number(k.split(":")[0]) < n),
      })),
      ...(t.factorNames ? { factorNames: t.factorNames } : {}),
    }, "grouped");
  }
  const subTitles = Array.from({ length: n }, (_, r) => t.rowTitles[r]?.trim() ?? "");
  if (layout === "one-row") {
    return normalizeTable({
      ...blankTable("grouped", t),
      x: [""],
      rowTitles: [t.yTitle.trim() || "Values"],
      datasets: t.datasets.map((d) => makeColumn(d.name, 1, n,
        Array.from({ length: n }, (_, r) => ({ r: 0, s: r, v: d.rows[r]?.[0] ?? "", ex: isEx(d, r, 0) })),
        subTitles)),
    }, "grouped");
  }
  return normalizeTable({
    ...blankTable("grouped", t),
    x: Array(t.datasets.length).fill(""),
    rowTitles: t.datasets.map((d) => d.name),
    datasets: [makeColumn(t.yTitle.trim() || "Values", t.datasets.length, n,
      t.datasets.flatMap((d, di) => Array.from({ length: n }, (_, r) =>
        ({ r: di, s: r, v: d.rows[r]?.[0] ?? "", ex: isEx(d, r, 0) }))), subTitles)],
  }, "grouped");
}

// ------------------------------------------------------------ grouped -> column

export type GroupedToColumnLayout = "cells" | "datasets" | "rows";

/** A grouped table as a column table.
 *  "cells": one column per row x data set ("Day 1: WT"), its replicates
 *  down the rows (subcolumn s -> row s, so subject s stays in row s).
 *  "datasets": one column per data set, its rows' replicates stacked
 *  (row r, subcolumn s -> one row titled "Day 1 · Y2"); the same
 *  position in every data set lands in the same row.
 *  "rows": row r stays row r (only when each data set has one value per
 *  row, or for summary data). */
export function groupedToColumn(t: DataTableModel, layout: GroupedToColumnLayout): DataTableModel {
  const n = Math.max(1, usedRows(t));
  const width = Math.max(1, ...t.datasets.map(subs));
  if (layout === "rows" || t.subcolumnFormat !== "replicates") {
    return normalizeTable({
      ...blankTable("column", t),
      subcolumnFormat: t.subcolumnFormat,
      x: Array(n).fill(""),
      rowTitles: Array.from({ length: n }, (_, r) => t.rowTitles[r] ?? ""),
      datasets: t.datasets.map((d) => ({
        ...d,
        rows: d.rows.slice(0, n).map((row) => [...row]),
        excluded: d.excluded?.filter((k) => Number(k.split(":")[0]) < n),
      })),
      ...(t.factorNames ? { factorNames: t.factorNames } : {}),
    }, "column");
  }
  const subName = (d: DataColumn, s: number) => d.subTitles?.[s]?.trim() || `Y${s + 1}`;
  if (layout === "cells") {
    const datasets: DataColumn[] = [];
    for (let r = 0; r < n; r++) {
      t.datasets.forEach((d) => {
        datasets.push(makeColumn(`${rowName(t, r)}: ${d.name}`, width, 1,
          Array.from({ length: subs(d) }, (_, s) => ({ r: s, s: 0, v: d.rows[r]?.[s] ?? "", ex: isEx(d, r, s) }))));
      });
    }
    const titles = Array.from({ length: width }, (_, s) => {
      const named = t.datasets.map((d) => d.subTitles?.[s]?.trim()).find(Boolean);
      return named ?? "";
    });
    return normalizeTable({ ...blankTable("column", t), x: Array(width).fill(""), rowTitles: titles, datasets },
      "column");
  }
  // datasets: stacked replicates
  const rows = n * width;
  return normalizeTable({
    ...blankTable("column", t),
    x: Array(rows).fill(""),
    rowTitles: Array.from({ length: rows }, (_, k) => {
      const r = Math.floor(k / width);
      const s = k % width;
      return width > 1 ? `${rowName(t, r)} · ${subName(t.datasets[0], s)}` : rowName(t, r);
    }),
    datasets: t.datasets.map((d) => makeColumn(d.name, rows, 1,
      Array.from({ length: n }, (_, r) => Array.from({ length: subs(d) }, (_, s) =>
        ({ r: r * width + s, s: 0, v: d.rows[r]?.[s] ?? "", ex: isEx(d, r, s) }))).flat())),
  }, "column");
}

// ------------------------------------------------------------ to long

/** A column or grouped table as a multiple-variables table: one value per
 *  row, with its group (data set), its row (row title or number: the
 *  subject of paired data) and, for grouped tables, its replicate.
 *  Excluded values stay excluded; blank cells are not values and are left
 *  out; text in a value column stays as typed. */
export function toLong(t: DataTableModel): DataTableModel {
  const grouped = t.type === "grouped";
  const summary = t.subcolumnFormat !== "replicates";
  const valueNames = summary ? [...SUBCOLUMN_FORMAT_TITLES[t.subcolumnFormat]] : ["Value"];
  const keyNames = grouped
    ? [t.factorNames?.rows || "Row", t.factorNames?.datasets || "Data set", ...(summary ? [] : ["Replicate"])]
    : t.type === "xy"
      ? [t.xTitle || "X", "Data set", ...(summary ? [] : ["Replicate"])]
      : ["Group", t.factorNames?.rows || "Row"];
  const keys: string[][] = [];
  const values: { v: string; ex: boolean }[][] = [];
  const n = usedRows(t);
  t.datasets.forEach((d) => {
    if (summary) {
      for (let r = 0; r < n; r++) {
        const row = d.rows[r] ?? [];
        if (!row.some(filled)) continue;
        keys.push(grouped ? [rowName(t, r), d.name] : t.type === "xy" ? [t.x[r] ?? "", d.name]
          : [d.name, t.rowTitles[r]?.trim() || String(r + 1)]);
        values.push(valueNames.map((_, s) => ({ v: row[s] ?? "", ex: isEx(d, r, s) })));
      }
      return;
    }
    for (let r = 0; r < n; r++) {
      for (let s = 0; s < subs(d); s++) {
        const v = d.rows[r]?.[s] ?? "";
        if (!filled(v)) continue;
        const rep = d.subTitles?.[s]?.trim() || String(s + 1);
        keys.push(grouped ? [rowName(t, r), d.name, rep] : t.type === "xy" ? [t.x[r] ?? "", d.name, rep]
          : [d.name, t.rowTitles[r]?.trim() || String(r + 1)]);
        values.push([{ v, ex: isEx(d, r, s) || (t.type === "xy" && !!t.xExcluded?.includes(r)) }]);
      }
    }
  });
  const m = Math.max(1, keys.length);
  const datasets: DataColumn[] = [
    ...keyNames.map((name, k) => ({
      name, varType: "categorical" as const,
      rows: Array.from({ length: m }, (_, i) => [keys[i]?.[k] ?? ""]),
    })),
    ...valueNames.map((name, k) => {
      const ex = values.map((v, i) => (v[k]?.ex ? `${i}:0` : "")).filter(Boolean);
      const col: DataColumn = { name, varType: "continuous" as const,
        rows: Array.from({ length: m }, (_, i) => [values[i]?.[k]?.v ?? ""]) };
      if (ex.length) col.excluded = ex;
      return col;
    }),
  ];
  // an XY key column of numbers is continuous (X)
  if (t.type === "xy") datasets[0].varType = "continuous";
  return normalizeTable({ ...blankTable("multivariable", t), x: Array(m).fill(""),
    rowTitles: Array(m).fill(""), datasets }, "multivariable");
}

// ------------------------------------------------------------ from long

export interface PivotSpec {
  value: number;              // variable holding the values
  group: number;              // column table: groups; grouped: data sets
  rows?: number | null;       // grouped: the row factor; column: the row / subject key
  subject?: number | null;    // grouped: subject -> subcolumn (matched across data sets)
}

const levelsOf = (vals: string[]) => {
  const out: string[] = [];
  for (const v of vals) if (filled(v) && !out.includes(v.trim())) out.push(v.trim());
  return out;
};

export interface PivotResult {
  table: DataTableModel;
  /** Rows of the long table left out because a key was blank. */
  skipped: number[];
}

/** A multiple-variables (long) table as a column table: one column per
 *  level of `group`; with `rows`, values of one key (subject) share a row
 *  (a repeat of a key and group goes to a new row with the same title, so
 *  no value is lost); without it, each group's values in order. */
export function longToColumn(t: DataTableModel, spec: PivotSpec): PivotResult {
  const col = (i: number) => t.datasets[i]?.rows.map((r) => r[0] ?? "") ?? [];
  const vals = col(spec.value);
  const groups = col(spec.group);
  const keyCol = spec.rows != null ? col(spec.rows) : null;
  const vd = t.datasets[spec.value];
  const levels = levelsOf(groups);
  const skipped: number[] = [];
  const titles: string[] = [];
  const cells = levels.map(() => [] as { r: number; s: number; v: string; ex?: boolean }[]);
  const used = new Set<string>();
  const nextRow = levels.map(() => 0);
  const rowsOfKey = new Map<string, number[]>();
  vals.forEach((v, i) => {
    if (!filled(v) && !(vd && isEx(vd, i, 0))) return;
    const g = groups[i]?.trim() ?? "";
    if (!g) { skipped.push(i); return; }
    const gi = levels.indexOf(g);
    let r: number;
    if (keyCol) {
      const k = keyCol[i]?.trim() ?? "";
      if (!k) { skipped.push(i); return; }
      // the key's first row free in this group; a repeat of a key in a
      // group gets a new row with the same title
      const mine = rowsOfKey.get(k) ?? [];
      r = mine.find((ri) => !used.has(`${ri}:${gi}`)) ?? -1;
      if (r < 0) {
        r = titles.length;
        titles.push(k);
        rowsOfKey.set(k, [...mine, r]);
      }
    } else {
      r = nextRow[gi]++;
      while (titles.length <= r) titles.push("");
    }
    used.add(`${r}:${gi}`);
    cells[gi].push({ r, s: 0, v: v.trim(), ex: !!vd && isEx(vd, i, 0) });
  });
  const nRows = Math.max(1, titles.length);
  return {
    skipped,
    table: normalizeTable({
      ...blankTable("column", t),
      x: Array(nRows).fill(""),
      rowTitles: Array.from({ length: nRows }, (_, r) => titles[r] ?? ""),
      datasets: (levels.length ? levels : ["Group A"]).map((name, gi) =>
        makeColumn(name, nRows, 1, cells[gi] ?? [])),
      ...(keyCol ? { factorNames: { rows: t.datasets[spec.rows!]?.name } } : {}),
    }, "column"),
  };
}

/** A multiple-variables (long) table as a grouped table: rows = levels of
 *  `rows`, data sets = levels of `group`; with `subject`, subcolumn k is
 *  subject k in every cell (matched across rows and data sets), else
 *  each cell's values side by side in order. */
export function longToGrouped(t: DataTableModel, spec: PivotSpec): PivotResult {
  const col = (i: number) => t.datasets[i]?.rows.map((r) => r[0] ?? "") ?? [];
  const vals = col(spec.value);
  const groups = col(spec.group);
  const rowsCol = spec.rows != null ? col(spec.rows) : vals.map(() => "Values");
  const subjCol = spec.subject != null ? col(spec.subject) : null;
  const vd = t.datasets[spec.value];
  const rowLevels = levelsOf(rowsCol);
  const dsLevels = levelsOf(groups);
  const subjLevels = subjCol ? levelsOf(subjCol) : [];
  const skipped: number[] = [];
  const cellFill = new Map<string, number>();
  const placed: { ri: number; gi: number; s: number; v: string; ex: boolean }[] = [];
  const taken = new Set<string>();
  let width = Math.max(1, subjLevels.length);
  vals.forEach((v, i) => {
    if (!filled(v) && !(vd && isEx(vd, i, 0))) return;
    const rk = rowsCol[i]?.trim() ?? "";
    const gk = groups[i]?.trim() ?? "";
    const sk = subjCol ? subjCol[i]?.trim() ?? "" : "";
    if (!rk || !gk || (subjCol && !sk)) { skipped.push(i); return; }
    const ri = rowLevels.indexOf(rk);
    const gi = dsLevels.indexOf(gk);
    let s: number;
    if (subjCol) {
      s = subjLevels.indexOf(sk);
      // a second value of one subject in one cell: next free subcolumn
      while (taken.has(`${ri}:${gi}:${s}`)) s++;
    } else {
      s = cellFill.get(`${ri}:${gi}`) ?? 0;
      cellFill.set(`${ri}:${gi}`, s + 1);
    }
    taken.add(`${ri}:${gi}:${s}`);
    width = Math.max(width, s + 1);
    placed.push({ ri, gi, s, v: v.trim(), ex: !!vd && isEx(vd, i, 0) });
  });
  const nRows = Math.max(1, rowLevels.length);
  const subTitles = Array.from({ length: width }, (_, s) => subjLevels[s] ?? "");
  return {
    skipped,
    table: normalizeTable({
      ...blankTable("grouped", t),
      x: Array(nRows).fill(""),
      rowTitles: rowLevels.length ? rowLevels : ["Values"],
      datasets: (dsLevels.length ? dsLevels : ["Data set A"]).map((name, gi) => makeColumn(name, nRows, width,
        placed.filter((p) => p.gi === gi).map((p) => ({ r: p.ri, s: p.s, v: p.v, ex: p.ex })),
        subjCol ? subTitles : undefined)),
      factorNames: {
        ...(spec.rows != null ? { rows: t.datasets[spec.rows]?.name } : {}),
        datasets: t.datasets[spec.group]?.name,
      },
    }, "grouped"),
  };
}

// ------------------------------------------------------------ replicates layout

/** Side-by-side replicates (XY) as stacked ones: each row's subcolumns
 *  become consecutive rows with the same X, one subcolumn per data set.
 *  An excluded X excludes every row it becomes. */
export function stackReplicates(t: DataTableModel): DataTableModel {
  const n = Math.max(1, usedRows(t));
  const width = Math.max(1, ...t.datasets.map(subs));
  const rows = n * width;
  const xEx: number[] = [];
  for (let r = 0; r < n; r++) {
    if (t.xExcluded?.includes(r)) for (let s = 0; s < width; s++) xEx.push(r * width + s);
  }
  const out = normalizeTable({
    ...t,
    x: Array.from({ length: rows }, (_, k) => t.x[Math.floor(k / width)] ?? ""),
    rowTitles: Array.from({ length: rows }, (_, k) => t.rowTitles[Math.floor(k / width)] ?? ""),
    replicateLayout: "stacked",
    datasets: t.datasets.map((d) => {
      const c = makeColumn(d.name, rows, 1, Array.from({ length: n }, (_, r) =>
        Array.from({ length: subs(d) }, (_, s) => ({ r: r * width + s, s: 0, v: d.rows[r]?.[s] ?? "",
          ex: isEx(d, r, s) }))).flat());
      if (d.varType) c.varType = d.varType;
      return c;
    }),
  }, t.type);
  delete out.replicates;
  if (xEx.length) out.xExcluded = xEx;
  return out;
}

/** The key of a row for unstacking: X (XY) or the row title (grouped). */
const rowKey = (t: DataTableModel, r: number) =>
  (t.type === "xy" ? t.x[r] : t.rowTitles[r])?.trim() ?? "";

/** Stacked replicates as side-by-side ones: consecutive rows with the same
 *  X (XY) or row title (grouped) become one row, their values side by side
 *  in subcolumns. Rows with a blank key stay rows of their own. */
export function unstackReplicates(t: DataTableModel): DataTableModel {
  const n = usedRows(t);
  const blocks: number[][] = [];
  for (let r = 0; r < n; r++) {
    const k = rowKey(t, r);
    const prev = blocks[blocks.length - 1];
    if (prev && k && rowKey(t, prev[0]) === k) prev.push(r);
    else blocks.push([r]);
  }
  if (!blocks.length) return t;
  const per = Math.max(1, ...t.datasets.map(subs));
  const width = Math.min(24, Math.max(...blocks.map((b) => b.length)) * per);
  const out = normalizeTable({
    ...t,
    x: blocks.map((b) => t.x[b[0]] ?? ""),
    rowTitles: blocks.map((b) => t.rowTitles[b[0]] ?? ""),
    replicateLayout: "side_by_side",
    datasets: t.datasets.map((d) => {
      const cells: { r: number; s: number; v: string; ex?: boolean }[] = [];
      blocks.forEach((b, bi) => b.forEach((r, k) => {
        for (let s = 0; s < subs(d); s++) {
          const target = k * per + s;
          if (target < width) cells.push({ r: bi, s: target, v: d.rows[r]?.[s] ?? "", ex: isEx(d, r, s) });
        }
      }));
      return makeColumn(d.name, blocks.length, width, cells);
    }),
  }, t.type);
  const xEx = blocks.map((b, bi) => (b.every((r) => t.xExcluded?.includes(r)) ? bi : -1)).filter((i) => i >= 0);
  if (xEx.length) out.xExcluded = xEx;
  else delete out.xExcluded;
  return out;
}

/** Can the table be unstacked (some consecutive rows share a key)? */
export function hasStackedRows(t: DataTableModel): boolean {
  const n = usedRows(t);
  for (let r = 1; r < n; r++) if (rowKey(t, r) && rowKey(t, r) === rowKey(t, r - 1)) return true;
  return false;
}

// ------------------------------------------------------------ checking

/** Every value of a table with its exclusion, as a sorted list (positions
 *  ignored): "12.5" / "12.5*". For a multiple-variables table, only the
 *  given value variables count (the others are keys). */
export function valueInventory(t: DataTableModel, valueVars?: number[]): string[] {
  const out: string[] = [];
  t.datasets.forEach((d, di) => {
    if (t.type === "multivariable" && valueVars && !valueVars.includes(di)) return;
    if (t.type === "multivariable" && !valueVars && d.varType === "categorical") return;
    d.rows.forEach((row, r) => row.forEach((v, s) => {
      if (!filled(v)) return;
      const xEx = t.type === "xy" && !!t.xExcluded?.includes(r);
      out.push(`${v.trim()}${isEx(d, r, s) || xEx ? "*" : ""}`);
    }));
  });
  return out.sort();
}

export interface ConversionCheck {
  values: number;
  excluded: number;
  /** Values of the source missing from the result (should be none). */
  lost: string[];
  ok: boolean;
}

/** Compare the values (and exclusions) before and after a conversion. */
export function checkConversion(before: DataTableModel, after: DataTableModel,
  opts: { beforeVars?: number[]; afterVars?: number[] } = {}): ConversionCheck {
  const a = valueInventory(before, opts.beforeVars);
  const b = valueInventory(after, opts.afterVars);
  const rest = new Map<string, number>();
  for (const v of b) rest.set(v, (rest.get(v) ?? 0) + 1);
  const lost: string[] = [];
  for (const v of a) {
    const k = rest.get(v) ?? 0;
    if (k > 0) rest.set(v, k - 1); else lost.push(v);
  }
  const extra = [...rest.values()].reduce((x, y) => x + y, 0);
  return { values: a.length, excluded: a.filter((v) => v.endsWith("*")).length, lost,
    ok: lost.length === 0 && extra === 0 };
}

/** Numeric value of a cell (for tests and previews). */
export const cellValue = (t: DataTableModel, ds: number, r: number, s = 0): number | null =>
  parseCell(t.datasets[ds]?.rows[r]?.[s] ?? "");
