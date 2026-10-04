// Column roles of long-format assay tables (qPCR records, blot lanes,
// standard-curve rows): which data-table column holds the sample, the
// group, the Cq ... Each module declares its roles with header patterns;
// a saved choice (options.columns) wins, otherwise the first unused
// column whose name matches is taken. Pure, unit-tested.
import { parseCell, withExclusionsBlanked } from "../../../project/table.ts";
import type { DataTableModel, VarType } from "../../../project/types.ts";

export interface RoleSpec<K extends string = string> {
  key: K;
  label: string;
  required: boolean;
  /** Header patterns, tried in order against the trimmed column name. */
  patterns: RegExp[];
  hint?: string;
}

/** role -> column name ("" = none chosen). */
export type ColumnChoice<K extends string = string> = Partial<Record<K, string>>;

/** role -> column index in table.datasets (-1 = absent). */
export type ColumnIndex<K extends string = string> = Record<K, number>;

export function columnNames(t: DataTableModel): string[] {
  return t.datasets.map((d) => d.name);
}

/** Saved choices first; then each remaining role takes the first unused
 *  column whose header matches one of its patterns. */
export function resolveColumns<K extends string>(t: DataTableModel,
  specs: RoleSpec<K>[], choice: ColumnChoice<K> = {}): ColumnIndex<K> {
  const names = columnNames(t).map((n) => n.trim());
  const used = new Set<number>();
  const out = {} as ColumnIndex<K>;
  for (const s of specs) {
    const want = choice[s.key];
    if (want === "") { out[s.key] = -1; continue; }   // explicitly "none"
    const i = want ? names.indexOf(want.trim()) : -1;
    out[s.key] = i;
    if (i >= 0) used.add(i);
  }
  for (const s of specs) {
    if (out[s.key] >= 0 || choice[s.key] === "") continue;
    let found = -1;
    for (const re of s.patterns) {
      found = names.findIndex((n, i) => !used.has(i) && re.test(n));
      if (found >= 0) break;
    }
    out[s.key] = found;
    if (found >= 0) used.add(found);
  }
  return out;
}

/** Required roles without a column, as labels. */
export function missingRoles<K extends string>(specs: RoleSpec<K>[],
  idx: ColumnIndex<K>): string[] {
  return specs.filter((s) => s.required && idx[s.key] < 0).map((s) => s.label);
}

/** Text of one column, row by row (excluded cells read as blank). */
export function textColumn(t: DataTableModel, i: number): string[] {
  if (i < 0 || i >= t.datasets.length) return t.x.map(() => "");
  const b = withExclusionsBlanked(t);
  return b.datasets[i].rows.map((r) => (r[0] ?? "").trim());
}

/** Numbers of one column (blank, text or excluded = null). */
export function numberColumn(t: DataTableModel, i: number): (number | null)[] {
  return textColumn(t, i).map((v) => parseCell(v));
}

/** Rows that hold anything in the given columns. */
export function filledRows(t: DataTableModel, cols: number[]): number[] {
  const texts = cols.filter((c) => c >= 0).map((c) => textColumn(t, c));
  const out: number[] = [];
  for (let r = 0; r < t.x.length; r++) {
    if (texts.some((col) => col[r] !== "")) out.push(r);
  }
  return out;
}

/** Distinct non-blank values in first-appearance order. */
export function distinctValues(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (v !== "" && !seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

/** A multiple-variables table from named columns of text, in the layout
 *  an assay module asks for. */
export function longTable(columns: { name: string; varType: VarType; values: string[] }[],
  rowTitles?: string[]): DataTableModel {
  const n = Math.max(1, ...columns.map((c) => c.values.length));
  return {
    type: "multivariable",
    x: Array<string>(n).fill(""),
    xTitle: "",
    xFormat: "numbers",
    xUnit: "",
    yTitle: "",
    rowTitles: Array.from({ length: n }, (_, i) => rowTitles?.[i] ?? String(i + 1)),
    datasets: columns.map((c) => ({
      name: c.name,
      varType: c.varType,
      rows: Array.from({ length: n }, (_, i) => [c.values[i] ?? ""]),
    })),
    subcolumnFormat: "replicates",
    replicateLayout: "side_by_side",
  };
}

/** Number formatting for table cells built from engine output: up to 10
 *  significant digits (drops float noise such as 0.30000000000000004). */
export function cellOf(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  return String(Number(v.toPrecision(10)));
}
