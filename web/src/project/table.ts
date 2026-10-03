// Pure operations on the generic data grid. Every function returns a new
// table and never mutates its input, so the history reducer can keep old
// versions around for undo at the cost of structural sharing only.
import type {
  Cell, DataColumn, DataTableModel, SubcolumnFormat, TableType, VarType,
  XFormat,
} from "./types.ts";
import { SUBCOLUMN_FORMAT_TITLES } from "./types.ts";
import { xNumbers } from "./xformat.ts";

export function rowCount(t: DataTableModel): number {
  return t.x.length;
}

const blankRow = (n: number): Cell[] => Array<Cell>(n).fill("");
const subCount = (d: DataColumn): number =>
  d.rows[0]?.length ?? Math.max(d.subTitles?.length ?? 0, 1);

export function datasetLetter(i: number): string {
  // A..Z, then AA, AB, ... like spreadsheet columns
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** Shape chosen in the "New data table" dialog. */
export interface NewTableInit {
  datasets: number;        // Y columns (groups / variables / outcomes)
  subcolumns: number;      // replicates (or subgroups for nested tables)
  subcolumnFormat: SubcolumnFormat;
  rows: number;
  xFormat: XFormat;
}

/** Sensible starting shape per table type. */
export function defaultInit(type: TableType): NewTableInit {
  const base: NewTableInit = {
    datasets: 3, subcolumns: 1, subcolumnFormat: "replicates", rows: 8,
    xFormat: "numbers",
  };
  switch (type) {
    case "xy": return { ...base, datasets: 1, subcolumns: 3, rows: 9 };
    case "grouped": return { ...base, datasets: 2, subcolumns: 3, rows: 3 };
    case "contingency": return { ...base, datasets: 2, rows: 2 };
    case "survival": return { ...base, datasets: 2, subcolumns: 2, rows: 10 };
    case "partsofwhole": return { ...base, datasets: 1, rows: 4 };
    case "multivariable": return { ...base, datasets: 4, rows: 10 };
    case "nested": return { ...base, datasets: 2, subcolumns: 3, rows: 5 };
    default: return base;
  }
}

/** Which structural features a table type has. Shared by the grid editor
 *  and by the pure ops (paste mapping). */
export interface TableShape {
  hasX: boolean;
  hasRowTitles: boolean;
  hasSubcolumns: boolean;   // subcolumn count can change
  datasetNoun: string;      // "Dataset", "Group", "Variable", "Outcome", ...
}

export function tableShape(type: TableType): TableShape {
  switch (type) {
    case "xy": return { hasX: true, hasRowTitles: false, hasSubcolumns: true, datasetNoun: "Dataset" };
    case "column": return { hasX: false, hasRowTitles: true, hasSubcolumns: true, datasetNoun: "Group" };
    case "grouped": return { hasX: false, hasRowTitles: true, hasSubcolumns: true, datasetNoun: "Dataset" };
    case "contingency": return { hasX: false, hasRowTitles: true, hasSubcolumns: false, datasetNoun: "Outcome" };
    case "survival": return { hasX: false, hasRowTitles: false, hasSubcolumns: false, datasetNoun: "Group" };
    case "partsofwhole": return { hasX: false, hasRowTitles: true, hasSubcolumns: false, datasetNoun: "Column" };
    case "multivariable": return { hasX: false, hasRowTitles: false, hasSubcolumns: false, datasetNoun: "Variable" };
    case "nested": return { hasX: false, hasRowTitles: false, hasSubcolumns: true, datasetNoun: "Group" };
  }
}

export function defaultDatasetName(type: TableType, i: number): string {
  switch (type) {
    case "multivariable": return `Variable ${datasetLetter(i)}`;
    case "contingency": return `Outcome ${i + 1}`;
    case "column": case "nested": case "survival":
      return `Group ${datasetLetter(i)}`;
    case "partsofwhole": return i === 0 ? "Value" : `Column ${datasetLetter(i)}`;
    default: return `Dataset ${datasetLetter(i)}`;
  }
}

function defaultRowTitle(type: TableType, r: number): string {
  if (type === "contingency") return `Group ${r + 1}`;
  if (type === "partsofwhole") return `Part ${r + 1}`;
  if (type === "grouped") return `Row ${r + 1}`;
  return "";
}

/** Survival rows are subjects: Y1 = time, Y2 = event code. */
const SURVIVAL_SUBTITLES = ["Time", "Event"];

export function emptyTable(type: TableType, init?: Partial<NewTableInit>):
  DataTableModel {
  const i = { ...defaultInit(type), ...init };
  const shape = tableShape(type);
  const fmtTitles = SUBCOLUMN_FORMAT_TITLES[i.subcolumnFormat] ?? [];
  let subs = shape.hasSubcolumns ? Math.max(1, i.subcolumns) : 1;
  let subTitles: string[] = [];
  if (type === "survival") { subs = 2; subTitles = SURVIVAL_SUBTITLES; }
  else if (allowsSummaryFormat(type) && fmtTitles.length) {
    subs = fmtTitles.length;
    subTitles = fmtTitles;
  }
  const nRows = Math.max(1, i.rows);
  const datasets: DataColumn[] = Array.from(
    { length: Math.max(1, i.datasets) }, (_, d) => {
      const col: DataColumn = {
        name: defaultDatasetName(type, d),
        rows: Array.from({ length: nRows }, () => blankRow(subs)),
      };
      if (subTitles.length) col.subTitles = [...subTitles];
      if (type === "multivariable") col.varType = "continuous" as VarType;
      return col;
    });
  return {
    type,
    x: blankRow(nRows),
    xTitle: type === "xy" ? "X" : "",
    xFormat: type === "xy" ? i.xFormat : "numbers",
    xUnit: type === "xy" ? "M" : "",
    yTitle: "",
    rowTitles: Array.from({ length: nRows }, (_, r) => defaultRowTitle(type, r)),
    datasets,
    subcolumnFormat: allowsSummaryFormat(type) ? i.subcolumnFormat : "replicates",
    replicateLayout: "side_by_side",
  };
}

/** Table types whose Y values may be entered as summary data. */
export function allowsSummaryFormat(type: TableType): boolean {
  return type === "xy" || type === "grouped" || type === "column";
}

/** Repair a table read from a file or old state so every invariant holds:
 *  all datasets have one row per X entry, rows are rectangular, titles
 *  line up. Unknown fields are dropped. */
export function normalizeTable(raw: unknown, fallbackType: TableType = "xy"):
  DataTableModel {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const type = (typeof r.type === "string" ? r.type : fallbackType) as TableType;
  const str = (v: unknown): string => (v == null ? "" : String(v));
  const rawDs = Array.isArray(r.datasets) ? r.datasets : [];
  let datasets: DataColumn[] = rawDs.map((d: unknown, i: number) => {
    const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
    const rows = Array.isArray(o.rows)
      ? (o.rows as unknown[]).map((row) =>
        Array.isArray(row) ? row.map(str) : [str(row)])
      : [];
    const col: DataColumn = {
      name: typeof o.name === "string" ? o.name : defaultDatasetName(type, i),
      rows,
    };
    if (Array.isArray(o.subTitles)) col.subTitles = o.subTitles.map(str);
    if (Array.isArray(o.excluded)) {
      col.excluded = o.excluded.filter((k) => typeof k === "string") as string[];
    }
    if (o.varType === "categorical" || o.varType === "continuous") {
      col.varType = o.varType;
    } else if (type === "multivariable") col.varType = "continuous";
    return col;
  });
  if (!datasets.length) datasets = emptyTable(type).datasets;
  const x = Array.isArray(r.x) ? (r.x as unknown[]).map(str) : [];
  const nRows = Math.max(1, x.length, ...datasets.map((d) => d.rows.length));
  while (x.length < nRows) x.push("");
  datasets = datasets.map((d) => {
    const width = Math.max(1, ...d.rows.map((row) => row.length),
      d.subTitles?.length ?? 0);
    const rows = Array.from({ length: nRows }, (_, i) => {
      const row = [...(d.rows[i] ?? [])];
      while (row.length < width) row.push("");
      return row;
    });
    return { ...d, rows };
  });
  const rowTitles = Array.isArray(r.rowTitles)
    ? (r.rowTitles as unknown[]).map(str) : [];
  while (rowTitles.length < nRows) {
    rowTitles.push(defaultRowTitle(type, rowTitles.length));
  }
  rowTitles.length = nRows;
  const xf = r.xFormat === "dates" || r.xFormat === "elapsed" ? r.xFormat : "numbers";
  const sf = typeof r.subcolumnFormat === "string" && r.subcolumnFormat in SUBCOLUMN_FORMAT_TITLES
    ? r.subcolumnFormat as SubcolumnFormat : "replicates";
  const table: DataTableModel = {
    type,
    x,
    xTitle: typeof r.xTitle === "string" ? r.xTitle : (type === "xy" ? "X" : ""),
    xFormat: xf,
    xUnit: typeof r.xUnit === "string" ? r.xUnit : (type === "xy" ? "M" : ""),
    yTitle: typeof r.yTitle === "string" ? r.yTitle : "",
    rowTitles,
    datasets,
    subcolumnFormat: sf,
    replicateLayout: r.replicateLayout === "stacked" ? "stacked" : "side_by_side",
  };
  if (Array.isArray(r.xExcluded)) {
    table.xExcluded = (r.xExcluded as unknown[])
      .filter((n): n is number => typeof n === "number" && n < nRows);
  }
  if (typeof r.decimals === "number" && r.decimals >= 0 && r.decimals <= 12) {
    table.decimals = Math.round(r.decimals);
  }
  if (typeof r.xTimeUnit === "string"
    && ["seconds", "minutes", "hours", "days", "weeks", "years"].includes(r.xTimeUnit)) {
    table.xTimeUnit = r.xTimeUnit as DataTableModel["xTimeUnit"];
  }
  if (r.xDateOrder === "dmy" || r.xDateOrder === "mdy") table.xDateOrder = r.xDateOrder;
  if (r.xElapsedTwoPart === "hm" || r.xElapsedTwoPart === "ms") {
    table.xElapsedTwoPart = r.xElapsedTwoPart;
  }
  return table;
}

// ------------------------------------------------------------ cell edits

export function setX(t: DataTableModel, r: number, v: Cell): DataTableModel {
  if (r < 0 || r >= t.x.length) return t;
  const x = [...t.x];
  x[r] = v;
  return { ...t, x };
}

export function setCell(
  t: DataTableModel, d: number, r: number, s: number, v: Cell,
): DataTableModel {
  const ds = t.datasets[d];
  if (!ds || !ds.rows[r] || s < 0 || s >= ds.rows[r].length) return t;
  const rows = [...ds.rows];
  rows[r] = rows[r].map((c, i) => (i === s ? v : c));
  return replaceDataset(t, d, { ...ds, rows });
}

export function setRowTitle(t: DataTableModel, r: number, v: string): DataTableModel {
  if (r < 0 || r >= t.rowTitles.length) return t;
  const rowTitles = [...t.rowTitles];
  rowTitles[r] = v;
  return { ...t, rowTitles };
}

function replaceDataset(t: DataTableModel, d: number, next: DataColumn): DataTableModel {
  return { ...t, datasets: t.datasets.map((x, i) => (i === d ? next : x)) };
}

export function renameDataset(t: DataTableModel, d: number, name: string): DataTableModel {
  const ds = t.datasets[d];
  return ds ? replaceDataset(t, d, { ...ds, name }) : t;
}

export function setSubTitle(
  t: DataTableModel, d: number, s: number, title: string,
): DataTableModel {
  const ds = t.datasets[d];
  if (!ds) return t;
  const subTitles = Array.from({ length: subCount(ds) },
    (_, i) => ds.subTitles?.[i] ?? "");
  subTitles[s] = title;
  return replaceDataset(t, d, { ...ds, subTitles });
}

export function setVarType(t: DataTableModel, d: number, varType: VarType): DataTableModel {
  const ds = t.datasets[d];
  return ds ? replaceDataset(t, d, { ...ds, varType }) : t;
}

// ------------------------------------------------------------ structure

const shiftKeys = (keys: string[] | undefined, at: number, delta: number,
  removeRow: number | null): string[] | undefined => {
  if (!keys?.length) return keys;
  const out: string[] = [];
  for (const k of keys) {
    const [r, s] = k.split(":").map(Number);
    if (removeRow !== null && r === removeRow) continue;
    out.push(r >= at ? `${r + delta}:${s}` : k);
  }
  return out;
};

export function insertRows(t: DataTableModel, at: number, n = 1): DataTableModel {
  const pos = Math.max(0, Math.min(at, t.x.length));
  const ins = <T>(arr: T[], make: () => T): T[] =>
    [...arr.slice(0, pos), ...Array.from({ length: n }, make), ...arr.slice(pos)];
  return {
    ...t,
    x: ins(t.x, () => ""),
    xExcluded: t.xExcluded?.map((r) => (r >= pos ? r + n : r)),
    rowTitles: ins(t.rowTitles, () => ""),
    datasets: t.datasets.map((d) => ({
      ...d,
      rows: ins(d.rows, () => blankRow(subCount(d))),
      excluded: shiftKeys(d.excluded, pos, n, null),
    })),
  };
}

export function addRow(t: DataTableModel): DataTableModel {
  return insertRows(t, t.x.length, 1);
}

export function deleteRow(t: DataTableModel, r: number): DataTableModel {
  if (t.x.length <= 1 || r < 0 || r >= t.x.length) return t;
  const drop = <T>(arr: T[]): T[] => arr.filter((_, i) => i !== r);
  return {
    ...t,
    x: drop(t.x),
    xExcluded: t.xExcluded?.filter((i) => i !== r).map((i) => (i > r ? i - 1 : i)),
    rowTitles: drop(t.rowTitles),
    datasets: t.datasets.map((d) => ({
      ...d,
      rows: drop(d.rows),
      excluded: shiftKeys(d.excluded, r + 1, -1, r),
    })),
  };
}

export function addDataset(t: DataTableModel, name?: string): DataTableModel {
  const shape = tableShape(t.type);
  const template = t.datasets[t.datasets.length - 1];
  const width = shape.hasSubcolumns && template ? subCount(template)
    : t.type === "survival" ? 2 : 1;
  const col: DataColumn = {
    name: name ?? defaultDatasetName(t.type, t.datasets.length),
    rows: t.x.map(() => blankRow(width)),
  };
  if (t.type === "survival") col.subTitles = [...SURVIVAL_SUBTITLES];
  else if (t.subcolumnFormat !== "replicates" && template?.subTitles) {
    col.subTitles = [...template.subTitles];
  }
  if (t.type === "multivariable") col.varType = "continuous";
  return { ...t, datasets: [...t.datasets, col] };
}

export function deleteDataset(t: DataTableModel, d: number): DataTableModel {
  if (t.datasets.length <= 1) return t;
  return { ...t, datasets: t.datasets.filter((_, i) => i !== d) };
}

export function setSubcolumnCount(
  t: DataTableModel, d: number, count: number,
): DataTableModel {
  const ds = t.datasets[d];
  if (!ds || count < 1 || count > 24) return t;
  const rows = ds.rows.map((row) => {
    const next = row.slice(0, count);
    while (next.length < count) next.push("");
    return next;
  });
  const excluded = ds.excluded?.filter((k) => Number(k.split(":")[1]) < count);
  const subTitles = ds.subTitles?.slice(0, count);
  return replaceDataset(t, d, { ...ds, rows, excluded, subTitles });
}

/** "Duplicate without data": same columns, titles and row count, no values. */
export function clearValues(t: DataTableModel): DataTableModel {
  return {
    ...t,
    x: t.x.map(() => ""),
    xExcluded: undefined,
    datasets: t.datasets.map((d) => ({
      ...d,
      rows: d.rows.map((row) => row.map(() => "")),
      excluded: undefined,
    })),
  };
}

// ------------------------------------------------------------ paste

/** One editable column of the grid, left to right. */
export type FlatColumn =
  | { kind: "rowTitle" }
  | { kind: "x" }
  | { kind: "y"; dataset: number; sub: number };

export function flatColumns(t: DataTableModel): FlatColumn[] {
  const shape = tableShape(t.type);
  const cols: FlatColumn[] = [];
  if (shape.hasRowTitles) cols.push({ kind: "rowTitle" });
  if (shape.hasX) cols.push({ kind: "x" });
  t.datasets.forEach((d, di) => {
    for (let s = 0; s < subCount(d); s++) cols.push({ kind: "y", dataset: di, sub: s });
  });
  return cols;
}

/** Paste a tab/newline block with its top-left at (row, flat column),
 *  growing the table downwards as needed (columns beyond the last are
 *  ignored, as before). */
export function pasteBlock(
  t: DataTableModel, startRow: number, startFlat: number, block: string[][],
): DataTableModel {
  let next = t;
  const needed = startRow + block.length;
  if (needed > rowCount(next)) next = insertRows(next, rowCount(next), needed - rowCount(next));
  const cols = flatColumns(next);
  const x = [...next.x];
  const rowTitles = [...next.rowTitles];
  const datasets = next.datasets.map((d) => ({ ...d, rows: d.rows.map((r) => [...r]) }));
  block.forEach((line, dr) => {
    line.forEach((raw, dc) => {
      const col = cols[startFlat + dc];
      const r = startRow + dr;
      const v = raw.trim();
      if (!col) return;
      if (col.kind === "x") x[r] = v;
      else if (col.kind === "rowTitle") rowTitles[r] = v;
      else datasets[col.dataset].rows[r][col.sub] = v;
    });
  });
  return { ...next, x, rowTitles, datasets };
}

export function parseClipboardGrid(text: string): string[][] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .filter((line, i, arr) => !(i === arr.length - 1 && line === ""))
    .map((line) => line.split("\t"));
}

// ------------------------------------------------------------ exclusion

export type CellRef = { kind: "x"; row: number } |
  { kind: "y"; dataset: number; row: number; sub: number };

export function isExcluded(t: DataTableModel, ref: CellRef): boolean {
  if (ref.kind === "x") return t.xExcluded?.includes(ref.row) ?? false;
  return t.datasets[ref.dataset]?.excluded?.includes(`${ref.row}:${ref.sub}`) ?? false;
}

/** Excluded values stay visible in the table but are skipped by analyses
 *  and graphs. */
export function toggleExcluded(t: DataTableModel, ref: CellRef): DataTableModel {
  if (ref.kind === "x") {
    const cur = t.xExcluded ?? [];
    const xExcluded = cur.includes(ref.row)
      ? cur.filter((r) => r !== ref.row) : [...cur, ref.row].sort((a, b) => a - b);
    return { ...t, xExcluded };
  }
  const ds = t.datasets[ref.dataset];
  if (!ds) return t;
  const key = `${ref.row}:${ref.sub}`;
  const cur = ds.excluded ?? [];
  const excluded = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
  return replaceDataset(t, ref.dataset, { ...ds, excluded });
}

/** The table as graphs see it: excluded cells read as blank. */
export function withExclusionsBlanked(t: DataTableModel): DataTableModel {
  const anyExcluded = t.xExcluded?.length || t.datasets.some((d) => d.excluded?.length);
  if (!anyExcluded) return t;
  return {
    ...t,
    x: t.x.map((v, r) => (t.xExcluded?.includes(r) ? "" : v)),
    datasets: t.datasets.map((d) => {
      if (!d.excluded?.length) return d;
      const ex = new Set(d.excluded);
      return {
        ...d,
        rows: d.rows.map((row, r) => row.map((v, s) => (ex.has(`${r}:${s}`) ? "" : v))),
      };
    }),
  };
}

export function parseCell(v: Cell): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Engine payload `data` for grid-shaped analyses:
 *  {x: [..], datasets: [{name, ys: rows x subcolumns}]}, excluded → null. */
export function numericData(t: DataTableModel): {
  x: (number | null)[];
  datasets: { name: string; ys: (number | null)[][] }[];
} {
  const b = withExclusionsBlanked(t);
  return {
    // dates count from the earliest included date, as graphs label them
    x: xNumbers(b),
    datasets: b.datasets.map((d) => ({
      name: d.name,
      ys: d.rows.map((row) => row.map(parseCell)),
    })),
  };
}

export function hasAnyValue(t: DataTableModel): boolean {
  return t.x.some((v) => v.trim() !== "") ||
    t.datasets.some((d) => d.rows.some((r) => r.some((v) => v.trim() !== "")));
}

// ------------------------------------------------------------ rearranging

/** New table whose row i is row `rows[i]` of t (a permutation, or a subset
 *  to drop rows). Exclusions travel with their values; at least one row
 *  always remains. */
export function pickRows(t: DataTableModel, rows: number[]): DataTableModel {
  const n = t.x.length;
  const idx = rows.filter((r) => r >= 0 && r < n);
  if (!idx.length) {
    const blank = pickRows(insertRows(t, 0, 1), [0]);
    return { ...blank, rowTitles: [""] };
  }
  const to = new Map<number, number>();
  idx.forEach((src, dst) => { if (!to.has(src)) to.set(src, dst); });
  const remap = (keys?: string[]) => {
    if (!keys) return keys;
    const out: string[] = [];
    for (const k of keys) {
      const [r, s] = k.split(":");
      const nr = to.get(Number(r));
      if (nr !== undefined) out.push(`${nr}:${s}`);
    }
    return out;
  };
  const xEx = t.xExcluded?.map((r) => to.get(r))
    .filter((r): r is number => r !== undefined).sort((a, b) => a - b);
  return {
    ...t,
    x: idx.map((i) => t.x[i]),
    rowTitles: idx.map((i) => t.rowTitles[i] ?? ""),
    xExcluded: xEx,
    datasets: t.datasets.map((d) => ({
      ...d,
      rows: idx.map((i) => [...d.rows[i]]),
      excluded: remap(d.excluded),
    })),
  };
}

/** Delete `count` rows starting at `from` (at least one row remains). */
export function deleteRows(t: DataTableModel, from: number, count: number): DataTableModel {
  const n = t.x.length;
  const keep = Array.from({ length: n }, (_, i) => i)
    .filter((i) => i < from || i >= from + count);
  return keep.length === n ? t : pickRows(t, keep);
}

export function reverseRows(t: DataTableModel): DataTableModel {
  return pickRows(t, Array.from({ length: t.x.length }, (_, i) => t.x.length - 1 - i));
}

/** What to sort rows by: X, the row titles, or a dataset (one subcolumn,
 *  or the mean of its replicates / its first summary subcolumn). */
export type SortKey =
  | { kind: "x" }
  | { kind: "rowTitle" }
  | { kind: "dataset"; dataset: number; sub?: number };

function sortValues(t: DataTableModel, key: SortKey): (number | string | null)[] {
  if (key.kind === "x") {
    const nums = xNumbers(t);
    return t.x.map((v, r) => nums[r] ?? (v.trim() ? v.trim() : null));
  }
  if (key.kind === "rowTitle") {
    return t.rowTitles.map((v) => {
      const s = v.trim();
      if (!s) return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : s;
    });
  }
  const ds = t.datasets[key.dataset];
  if (!ds) return t.x.map(() => null);
  const sub = key.sub ?? (t.subcolumnFormat !== "replicates" ? 0 : undefined);
  return ds.rows.map((row) => {
    if (sub !== undefined) return parseCell(row[sub] ?? "");
    const vals = row.map(parseCell).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
}

/** Sort whole rows (X, row title and every dataset move together; blanks
 *  sort last either way; numbers before text; ties keep their order). */
export function sortRows(t: DataTableModel, key: SortKey,
  dir: "asc" | "desc" = "asc"): DataTableModel {
  const vals = sortValues(t, key);
  const sign = dir === "asc" ? 1 : -1;
  const order = vals.map((_, i) => i).sort((a, b) => {
    const va = vals[a];
    const vb = vals[b];
    if (va === null || vb === null) {
      return va === vb ? a - b : va === null ? 1 : -1;
    }
    let c: number;
    if (typeof va === "number" && typeof vb === "number") c = va - vb;
    else if (typeof va === "number") c = -1;
    else if (typeof vb === "number") c = 1;
    else c = va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" });
    return c ? c * sign : a - b;
  });
  return pickRows(t, order);
}

/** Insert a new dataset (column) so it lands at position `at`. */
export function insertDataset(t: DataTableModel, at: number, name?: string): DataTableModel {
  const added = addDataset(t, name);
  return moveDataset(added, added.datasets.length - 1, at);
}

/** Move dataset `from` to position `to` (others shift to make room). */
export function moveDataset(t: DataTableModel, from: number, to: number): DataTableModel {
  const n = t.datasets.length;
  if (from < 0 || from >= n) return t;
  const dest = Math.max(0, Math.min(n - 1, to));
  if (dest === from) return t;
  const datasets = [...t.datasets];
  const [moved] = datasets.splice(from, 1);
  datasets.splice(dest, 0, moved);
  return { ...t, datasets };
}

/** Decimal places shown in the grid; undefined shows values as typed. */
export function setDecimals(t: DataTableModel, decimals: number | undefined): DataTableModel {
  const next = { ...t };
  if (decimals === undefined || !Number.isFinite(decimals)) delete next.decimals;
  else next.decimals = Math.max(0, Math.min(12, Math.round(decimals)));
  return next;
}

/** Switch how Y subcolumns are entered. Summary formats get their fixed
 *  subcolumns (titled Mean, SD, N, ...); replicates get `replicates`
 *  subcolumns (default: keep the current count). Values are kept by
 *  position: to turn replicates into means and SDs, use a conversion. */
export function setSubcolumnFormat(t: DataTableModel, fmt: SubcolumnFormat,
  replicates?: number): DataTableModel {
  if (!allowsSummaryFormat(t.type)) return t;
  if (fmt === t.subcolumnFormat && replicates === undefined) return t;
  const titles = SUBCOLUMN_FORMAT_TITLES[fmt] ?? [];
  const datasets = t.datasets.map((d) => {
    const width = titles.length || Math.max(1, Math.min(24, replicates ?? subCount(d)));
    const rows = d.rows.map((row) => {
      const next = row.slice(0, width);
      while (next.length < width) next.push("");
      return next;
    });
    const excluded = d.excluded?.filter((k) => Number(k.split(":")[1]) < width);
    const col: DataColumn = { ...d, rows, excluded };
    if (titles.length) col.subTitles = [...titles];
    else delete col.subTitles;
    return col;
  });
  return { ...t, subcolumnFormat: fmt, datasets };
}

// ------------------------------------------------------------ blocks

/** A rectangle of grid cells in flat-column coordinates (see
 *  flatColumns); corners in any order, both inclusive. */
export interface CellRect { r0: number; c0: number; r1: number; c1: number }

export function normRect(rect: CellRect): CellRect {
  return {
    r0: Math.min(rect.r0, rect.r1), r1: Math.max(rect.r0, rect.r1),
    c0: Math.min(rect.c0, rect.c1), c1: Math.max(rect.c0, rect.c1),
  };
}

function flatValue(t: DataTableModel, col: FlatColumn, r: number): string {
  if (col.kind === "x") return t.x[r] ?? "";
  if (col.kind === "rowTitle") return t.rowTitles[r] ?? "";
  return t.datasets[col.dataset]?.rows[r]?.[col.sub] ?? "";
}

/** Raw values of a block, rows x columns (for copy). */
export function blockValues(t: DataTableModel, rect: CellRect): string[][] {
  const { r0, r1, c0, c1 } = normRect(rect);
  const cols = flatColumns(t).slice(c0, c1 + 1);
  const out: string[][] = [];
  for (let r = r0; r <= Math.min(r1, t.x.length - 1); r++) {
    out.push(cols.map((c) => flatValue(t, c, r)));
  }
  return out;
}

/** The X / Y cells of a block (row titles cannot be excluded). */
export function blockRefs(t: DataTableModel, rect: CellRect): CellRef[] {
  const { r0, r1, c0, c1 } = normRect(rect);
  const cols = flatColumns(t);
  const refs: CellRef[] = [];
  for (let r = r0; r <= Math.min(r1, t.x.length - 1); r++) {
    for (let c = c0; c <= c1; c++) {
      const col = cols[c];
      if (!col || col.kind === "rowTitle") continue;
      refs.push(col.kind === "x" ? { kind: "x", row: r }
        : { kind: "y", dataset: col.dataset, row: r, sub: col.sub });
    }
  }
  return refs;
}

/** Set (rather than toggle) the excluded state of many cells. */
export function setExcluded(t: DataTableModel, refs: CellRef[], on: boolean): DataTableModel {
  let next = t;
  for (const ref of refs) {
    if (isExcluded(next, ref) !== on) next = toggleExcluded(next, ref);
  }
  return next;
}

/** Blank every cell of a block (exclusion marks on them go too). */
export function clearBlock(t: DataTableModel, rect: CellRect): DataTableModel {
  const { r0, r1, c0, c1 } = normRect(rect);
  const height = Math.min(r1, t.x.length - 1) - r0 + 1;
  if (height <= 0) return t;
  const blank = Array.from({ length: height }, () => Array<string>(c1 - c0 + 1).fill(""));
  const cleared = pasteBlock(t, r0, c0, blank);
  return setExcluded(cleared, blockRefs(cleared, rect), false);
}

/** Ctrl+E on a block: exclude every value, or include them all again when
 *  every one is already excluded. */
export function toggleBlockExcluded(t: DataTableModel, rect: CellRect): DataTableModel {
  const refs = blockRefs(t, rect);
  const allOn = refs.length > 0 && refs.every((ref) => isExcluded(t, ref));
  return setExcluded(t, refs, !allOn);
}

// ------------------------------------------------------------ series

export interface SeriesSpec {
  start: number;
  step: number;                       // increment, or factor (geometric)
  kind: "arithmetic" | "geometric";
  count: number;
}

/** The series' values as cell text (12 significant digits, so 0.1 steps
 *  read 0.3 rather than 0.30000000000000004). */
export function seriesValues(spec: SeriesSpec): string[] {
  const n = Math.max(0, Math.min(100000, Math.floor(spec.count)));
  return Array.from({ length: n }, (_, i) => {
    const v = spec.kind === "geometric"
      ? spec.start * spec.step ** i : spec.start + spec.step * i;
    return Number.isFinite(v) ? String(Number(v.toPrecision(12))) : "";
  });
}

/** Write a series down flat column `col` from row `row`, adding rows as
 *  needed (any column works; X is the usual one). */
export function insertSeries(t: DataTableModel, row: number, col: number,
  spec: SeriesSpec): DataTableModel {
  return pasteBlock(t, row, col, seriesValues(spec).map((v) => [v]));
}
