// Pure operations on the generic data grid. Every function returns a new
// table and never mutates its input, so the history reducer can keep old
// versions around for undo at the cost of structural sharing only.
import type {
  Cell, DataColumn, DataTableModel, SubcolumnFormat, TableType, VarType,
  XFormat,
} from "./types.ts";
import { SUBCOLUMN_FORMAT_TITLES } from "./types.ts";

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
    case "column": return { hasX: false, hasRowTitles: false, hasSubcolumns: true, datasetNoun: "Group" };
    case "grouped": return { hasX: false, hasRowTitles: true, hasSubcolumns: true, datasetNoun: "Dataset" };
    case "contingency": return { hasX: false, hasRowTitles: true, hasSubcolumns: false, datasetNoun: "Outcome" };
    case "survival": return { hasX: false, hasRowTitles: false, hasSubcolumns: false, datasetNoun: "Group" };
    case "partsofwhole": return { hasX: false, hasRowTitles: true, hasSubcolumns: false, datasetNoun: "Column" };
    case "multivariable": return { hasX: false, hasRowTitles: true, hasSubcolumns: false, datasetNoun: "Variable" };
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
  else if ((type === "xy" || type === "grouped") && fmtTitles.length) {
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
    subcolumnFormat: type === "xy" || type === "grouped"
      ? i.subcolumnFormat : "replicates",
    replicateLayout: "side_by_side",
  };
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
    x: b.x.map(parseCell),
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
