// Compare two versions of a project, or two project files (P-73): which
// cells changed, which values were excluded or put back (in the table, or
// left out of one analysis), which analysis options changed, and which
// reported numbers moved, P values first. The numbers are the engine's
// results of each side (app/projectResults.ts); their comparison and its
// ranking are the replay log's (project/replayDiff.ts). Pure: nothing here
// computes a statistic.
//
// Sheets are matched by id (versions of one project share them), then by
// kind and name (two files that were built apart).
import { cellWhere, excludedValues } from "./exclusions.ts";
import {
  describeChange, diffResults, relChange, type ChangeKind, type NumberChange, type ResultDiff,
} from "./replayDiff.ts";
import type { DataSheet, DataTableModel, LeftOutValue, Project, ResultsSheet, Sheet } from "./types.ts";

/** One project with its results (app/projectResults.ts). */
export interface CompareSide {
  project: Project;
  /** Results sheet id -> result. */
  results: ReadonlyMap<string, unknown>;
  /** Results sheet id -> the analysis options as they ran. */
  options: ReadonlyMap<string, unknown>;
  /** Results sheet id -> why there is no result. */
  missing: ReadonlyMap<string, string>;
}

export interface CellChange { where: string; before: string; after: string }
export interface ValueLine { group: string; where: string; value: string; reason: string }

export interface TableDiff {
  name: string;
  /** "renamed from “Old”", "rows: 6 → 7", "data set 2 renamed “A” → “B”". */
  notes: string[];
  cells: CellChange[];
  /** Changed cells past the ones listed. */
  cellsMore: number;
  excludedAdded: ValueLine[];
  excludedRemoved: ValueLine[];
}

export interface OptionChange { key: string; before: string; after: string }

export interface AnalysisDiff {
  name: string;
  table: string;
  options: OptionChange[];
  leftOutAdded: ValueLine[];
  leftOutRemoved: ValueLine[];
  status: "changed" | "same" | "missing" | "error";
  /** The numbers that moved, P values first (rankChanges). */
  changes: { label: string; text: string; kind: ChangeKind }[];
  more: number;
  note?: string;
}

export interface ProjectDiff {
  title?: { before: string; after: string };
  /** "Graph “Graph of Data 2”". */
  added: string[];
  removed: string[];
  /** Tables with any change. */
  tables: TableDiff[];
  /** Every analysis found in both. */
  analyses: AnalysisDiff[];
}

export const MAX_CELLS = 50;
const KIND_LABEL: Record<Sheet["kind"], string> = {
  data: "Data table", results: "Results", graph: "Graph", info: "Info sheet", layout: "Layout",
};
const describeSheet = (s: Sheet) => `${KIND_LABEL[s.kind]} “${s.name}”`;

/** Pairs of sheets: by id, then by kind and name. */
function matchSheets(a: Project, b: Project) {
  const pairs: [Sheet, Sheet][] = [];
  const bById = new Map(b.sheets.map((s) => [s.id, s]));
  const used = new Set<string>();
  const left: Sheet[] = [];
  for (const s of a.sheets) {
    const t = bById.get(s.id);
    if (t && t.kind === s.kind) { pairs.push([s, t]); used.add(t.id); } else left.push(s);
  }
  const removed: Sheet[] = [];
  for (const s of left) {
    const t = b.sheets.find((x) => !used.has(x.id) && x.kind === s.kind && x.name === s.name);
    if (t) { pairs.push([s, t]); used.add(t.id); } else removed.push(s);
  }
  return { pairs, removed, added: b.sheets.filter((s) => !used.has(s.id)) };
}

const cellOf = (t: DataTableModel, d: number, r: number, s: number) => t.datasets[d]?.rows[r]?.[s] ?? "";
const groupOf = (t: DataTableModel, d: number) => t.datasets[d]?.name || `Data set ${d + 1}`;
const maxOf = (xs: number[]) => xs.reduce((m, x) => Math.max(m, x), 0);

function compareTables(a: DataSheet, b: DataSheet): TableDiff {
  const ta = a.table;
  const tb = b.table;
  const notes: string[] = [];
  if (a.name !== b.name) notes.push(`renamed from “${a.name}”`);
  if (ta.type !== tb.type) notes.push(`table type: ${ta.type} → ${tb.type}`);
  if (ta.x.length !== tb.x.length) notes.push(`rows: ${ta.x.length} → ${tb.x.length}`);
  if (ta.datasets.length !== tb.datasets.length) {
    notes.push(`data sets: ${ta.datasets.length} → ${tb.datasets.length}`);
  }
  const all: CellChange[] = [];
  const rows = Math.max(ta.x.length, tb.x.length);
  for (let r = 0; r < rows; r++) {
    const x0 = ta.x[r] ?? "";
    const x1 = tb.x[r] ?? "";
    if (x0 !== x1) all.push({ where: `X, row ${r + 1}`, before: x0, after: x1 });
    const t0 = ta.rowTitles[r] ?? "";
    const t1 = tb.rowTitles[r] ?? "";
    if (t0 !== t1) all.push({ where: `Row title, row ${r + 1}`, before: t0, after: t1 });
  }
  const sets = Math.max(ta.datasets.length, tb.datasets.length);
  for (let d = 0; d < sets; d++) {
    const da = ta.datasets[d];
    const db = tb.datasets[d];
    if (da && db && da.name !== db.name) notes.push(`data set ${d + 1} renamed “${da.name}” → “${db.name}”`);
    const n = Math.max(da?.rows.length ?? 0, db?.rows.length ?? 0);
    const subs = maxOf([...(da?.rows ?? []), ...(db?.rows ?? [])].map((row) => row.length));
    // The side that has the cell names it (rows past the end of one side).
    for (let r = 0; r < n; r++) {
      for (let s = 0; s < subs; s++) {
        const v0 = cellOf(ta, d, r, s);
        const v1 = cellOf(tb, d, r, s);
        if (v0 === v1) continue;
        const t = db?.rows[r] ? tb : ta;
        all.push({ where: `${groupOf(t, d)}, ${cellWhere(t, d, r, s)}`, before: v0, after: v1 });
      }
    }
  }
  const key = (v: { dataset: number; row: number; sub: number; value: string }) =>
    `${v.dataset}|${v.row}|${v.sub}|${v.value}`;
  const line = (v: { group: string; where: string; value: string; reason: string }): ValueLine =>
    ({ group: v.group, where: v.where, value: v.value, reason: v.reason });
  const ea = excludedValues(ta);
  const eb = excludedValues(tb);
  const inA = new Set(ea.map(key));
  const inB = new Set(eb.map(key));
  return {
    name: b.name, notes,
    cells: all.slice(0, MAX_CELLS), cellsMore: Math.max(0, all.length - MAX_CELLS),
    excludedAdded: eb.filter((v) => !inA.has(key(v))).map(line),
    excludedRemoved: ea.filter((v) => !inB.has(key(v))).map(line),
  };
}

const hasChanges = (t: TableDiff) => t.notes.length > 0 || t.cells.length > 0
  || t.excludedAdded.length > 0 || t.excludedRemoved.length > 0;

/** An option value as one short line. */
function show(v: unknown): string {
  if (v === undefined) return "not set";
  const s = typeof v === "string" ? `“${v}”` : JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 79)}…` : s;
}

function compareOptions(a: unknown, b: unknown): OptionChange[] {
  const oa = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
  const ob = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(oa), ...Object.keys(ob)])];
  return keys.filter((k) => JSON.stringify(oa[k]) !== JSON.stringify(ob[k]))
    .map((k) => ({ key: k, before: show(oa[k]), after: show(ob[k]) }));
}

function leftOutLines(list: readonly LeftOutValue[] | undefined, other: readonly LeftOutValue[] | undefined,
  t: DataTableModel | undefined): ValueLine[] {
  const key = (v: LeftOutValue) => `${v.dataset}|${v.row}|${v.sub}|${v.value}`;
  const seen = new Set((other ?? []).map(key));
  return (list ?? []).filter((v) => !seen.has(key(v))).map((v) => ({
    group: t ? groupOf(t, v.dataset) : `Data set ${v.dataset + 1}`,
    where: t ? cellWhere(t, v.dataset, v.row, v.sub) : `row ${v.row + 1}`,
    value: v.value, reason: v.reason,
  }));
}

/** The replay log's order (P values, then fitted parameters, then the
 *  largest relative changes), except that summary numbers come before
 *  numbers inside lists (one row per data point: indices, residuals, which
 *  shift when a value leaves), and numbers present on one side only come
 *  after the numbers that moved. */
export function rankChanges(d: ResultDiff, max = 8): NumberChange[] {
  const rank = (c: NumberChange) => (c.kind === "p" ? 0 : c.kind === "param" ? 1 : 2);
  const gone = (c: NumberChange) => (c.before === null || c.after === null ? 1 : 0);
  const depth = (c: NumberChange) => (c.path.match(/\[\d+\]/g) ?? []).length;
  return [...d.changed].sort((x, y) => rank(x) - rank(y) || gone(x) - gone(y)
    || (rank(x) === 2 ? depth(x) - depth(y) : 0)
    || (rank(x) === 2 && !gone(x) ? relChange(y) - relChange(x) : 0)).slice(0, max);
}

/** describeChange, without a percentage when the earlier value is next to
 *  zero (1.46e-15 → -0.89 is not a change of -6e16 %). */
function changeText(c: NumberChange, digits: number): string {
  const t = describeChange(c, digits);
  const tiny = c.before !== null && c.after !== null && Math.abs(c.before) * 100 < Math.abs(c.after);
  return tiny ? t.replace(/ \([+-]?[\d.e+-]+%\)$/, "") : t;
}

function compareAnalyses(a: ResultsSheet, b: ResultsSheet, before: CompareSide, after: CompareSide,
  digits: number): AnalysisDiff {
  const dataOf = (side: CompareSide, s: ResultsSheet) =>
    side.project.sheets.find((x): x is DataSheet => x.id === s.parentId && x.kind === "data");
  const da = dataOf(before, a);
  const db = dataOf(after, b);
  const base = {
    name: b.name, table: db?.name ?? "",
    options: compareOptions(before.options.get(a.id), after.options.get(b.id)),
    leftOutAdded: leftOutLines(b.leftOut, a.leftOut, db?.table),
    leftOutRemoved: leftOutLines(a.leftOut, b.leftOut, da?.table),
    changes: [], more: 0,
  };
  const why0 = before.missing.get(a.id);
  const why1 = after.missing.get(b.id);
  if (why0 || why1 || !before.results.has(a.id) || !after.results.has(b.id)) {
    const which = why0 || !before.results.has(a.id) ? "earlier" : "later";
    return { ...base, status: "missing",
      note: `no result in the ${which} one${(why0 ?? why1) ? `: ${why0 ?? why1}` : ""}` };
  }
  const d = diffResults(before.results.get(a.id), after.results.get(b.id), digits);
  if (d.afterError || d.beforeError) {
    return { ...base, status: "error",
      note: d.afterError ? `the analysis failed in the later one: ${d.afterError}`
        : `the analysis failed in the earlier one: ${d.beforeError}` };
  }
  const key = rankChanges(d, 8);
  return {
    ...base,
    status: d.changed.length ? "changed" : "same",
    changes: key.map((c) => ({ label: c.label, text: changeText(c, digits), kind: c.kind })),
    more: d.changed.length - key.length,
  };
}

/** `before` → `after`. Numbers are compared at the later project's
 *  results precision (P values at four significant digits). */
export function compareProjects(before: CompareSide, after: CompareSide): ProjectDiff {
  const a = before.project;
  const b = after.project;
  const { pairs, removed, added } = matchSheets(a, b);
  const digits = b.prefs.digits ?? 4;
  const tables: TableDiff[] = [];
  const analyses: AnalysisDiff[] = [];
  for (const [s, t] of pairs) {
    if (s.kind === "data" && t.kind === "data") {
      const diff = compareTables(s, t);
      if (hasChanges(diff)) tables.push(diff);
    } else if (s.kind === "results" && t.kind === "results") {
      analyses.push(compareAnalyses(s, t, before, after, digits));
    }
  }
  return {
    ...(a.title !== b.title ? { title: { before: a.title, after: b.title } } : {}),
    added: added.map(describeSheet),
    removed: removed.map(describeSheet),
    tables, analyses,
  };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** One line: what differs ("2 cells, 1 value excluded, 1 option, 3
 *  reported numbers changed"), or that nothing does. */
export function diffSummary(d: ProjectDiff): string {
  const cells = d.tables.reduce((n, t) => n + t.cells.length + t.cellsMore, 0);
  const exAdd = d.tables.reduce((n, t) => n + t.excludedAdded.length, 0)
    + d.analyses.reduce((n, x) => n + x.leftOutAdded.length, 0);
  const exRem = d.tables.reduce((n, t) => n + t.excludedRemoved.length, 0)
    + d.analyses.reduce((n, x) => n + x.leftOutRemoved.length, 0);
  const opts = d.analyses.reduce((n, x) => n + x.options.length, 0);
  const nums = d.analyses.reduce((n, x) => n + x.changes.length + x.more, 0);
  const parts = [
    cells ? `${plural(cells, "cell")} changed` : "",
    exAdd ? `${plural(exAdd, "value")} excluded` : "",
    exRem ? `${plural(exRem, "value")} put back` : "",
    opts ? `${plural(opts, "analysis option")} changed` : "",
    nums ? `${plural(nums, "result number")} moved` : "",
    d.added.length ? `${plural(d.added.length, "sheet")} added` : "",
    d.removed.length ? `${plural(d.removed.length, "sheet")} removed` : "",
    d.title ? "the title changed" : "",
  ].filter(Boolean);
  const unknown = d.analyses.filter((x) => x.status === "missing" || x.status === "error").length;
  const caveat = unknown
    ? ` The numbers of ${unknown === 1 ? "1 analysis" : `${unknown} analyses`} could not be compared.`
    : "";
  if (!parts.length) {
    return unknown ? `No differences in the data or options.${caveat}`
      : "No differences: the same data, options and numbers.";
  }
  const s = parts.join(", ");
  return `${s[0].toUpperCase()}${s.slice(1)}.${caveat}`;
}
