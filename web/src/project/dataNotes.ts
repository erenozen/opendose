// The Notes strip of a results sheet: what was analysed and what was
// left out, and why. Every engine warning or note in the result, every
// cell skipped because it is not a number, every excluded value and every
// incomplete pair or row the analysis could not use is named here, so n
// never changes silently. Pure (no React); unit-tested.
//
// The "Analysed" line counts from the table what the analysis reads, the
// way its payload builder sends it (sheets/<type>/run.ts): blanks,
// excluded values and text cells are missing; paired analyses pair row
// by row and leave out incomplete pairs; repeated-measures one-way ANOVA
// leaves out incomplete rows (subjects). Where the engine reports the
// count itself (n_pairs, incomplete_pairs) its number is preferred.
import { ANALYSIS_COLUMN, ANALYSIS_NONLIN, ANALYSIS_SURVIVAL } from "./builtin.ts";
import { classifyValue } from "./pasteReport.ts";
import { parseCell } from "./table.ts";
import type { DataTableModel } from "./types.ts";
import { xInvalid } from "./xformat.ts";

export interface DataNote {
  text: string;
  tone: "info" | "warn";
  /** "engine": a warning or note in the analysis result; "data": found
   *  in the table (skipped, excluded, incomplete). */
  from: "engine" | "data";
}

export interface DataNotes {
  /** "n = 10 pairs analysed; 2 incomplete pairs (rows 4, 9) left out",
   *  or null when the analysis has no simple n (contingency counts,
   *  multiple-variables models, manipulations, summary data). */
  analysed: string | null;
  notes: DataNote[];
}

/** Analysis ids (stored in results sheets; see sheets/*). */
const ROC = "roc_curve";
const BLAND_ALTMAN = "bland_altman";
const LINREG = "linear_regression";
const COMPARE_FITS = "compare_fits";
const NESTED = new Set(["nested_ttest", "nested_anova"]);
const GROUPED = new Set(["grouped_two_way", "grouped_three_way", "grouped_column_stats"]);
const GROUPED_MULTI_T = "grouped_multiple_t";

/** How an analysis reads the table, for counting n. */
type Plan =
  | { kind: "groups"; datasets: number[] }
  | { kind: "pairs"; datasets: [number, number] }
  | { kind: "subjects"; datasets: number[] }
  | { kind: "points"; datasets: number[] }
  | { kind: "survival"; datasets: number[] }
  | { kind: "none"; datasets: number[] };

type Opts = Record<string, unknown>;
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isInteger(v) ? v : d);
const all = (t: DataTableModel) => t.datasets.map((_, i) => i);
const two = (t: DataTableModel, a: number, b: number): number[] =>
  [a, b].filter((i, k, arr) => i >= 0 && i < t.datasets.length && arr.indexOf(i) === k);

/** Which data sets an analysis reads, and how it counts n. */
export function analysisPlan(analysisId: string, t: DataTableModel, options: unknown): Plan {
  const o = (options && typeof options === "object" ? options : {}) as Opts;
  const A = num(o.datasetA, 0);
  const B = num(o.datasetB, 1);
  const pair = (): Plan => {
    const d = two(t, A, B);
    return d.length === 2 ? { kind: "pairs", datasets: [d[0], d[1]] } : { kind: "none", datasets: d };
  };
  // assay modules read their tables their own way (sample names, gene
  // names and well ids are text by design): nothing to count here
  if (analysisId.startsWith("assay_")) return { kind: "none", datasets: [] };
  if (t.type === "multivariable" || t.type === "contingency" || t.type === "partsofwhole") {
    return { kind: "none", datasets: all(t) };
  }
  if (analysisId === ANALYSIS_COLUMN) {
    const kind = String(o.analysis ?? "column_statistics");
    if (kind === "ttest") {
      const tk = String(o.ttestKind ?? "unpaired");
      if (["paired", "ratio_paired", "wilcoxon"].includes(tk)) return pair();
      return { kind: "groups", datasets: two(t, A, B) };
    }
    if (kind === "correlation" || kind === "bland_altman") return pair();
    if (kind === "roc") return { kind: "groups", datasets: two(t, A, B) };
    if (kind === "rm_anova") return { kind: "subjects", datasets: all(t) };
    if (kind === "rm_two_way") return { kind: "none", datasets: all(t) };
    return { kind: "groups", datasets: all(t) };
  }
  if (analysisId === ROC) {
    return { kind: "groups", datasets: two(t, num(o.patients, 0), num(o.controls, 1)) };
  }
  if (analysisId === BLAND_ALTMAN) {
    return o.repeated === undefined || o.repeated === "none" ? pair()
      : { kind: "none", datasets: two(t, A, B) };
  }
  if (t.type === "xy" && [ANALYSIS_NONLIN, LINREG, COMPARE_FITS].includes(analysisId)) {
    return { kind: "points", datasets: all(t) };
  }
  if (t.type === "survival" && analysisId === ANALYSIS_SURVIVAL) {
    return { kind: "survival", datasets: all(t) };
  }
  if (t.type === "nested" && NESTED.has(analysisId)) return { kind: "groups", datasets: all(t) };
  if (t.type === "grouped" && GROUPED.has(analysisId)) return { kind: "groups", datasets: all(t) };
  if (t.type === "grouped" && analysisId === GROUPED_MULTI_T) {
    return { kind: "groups", datasets: two(t, A, B) };
  }
  return { kind: "none", datasets: all(t) };
}

// ------------------------------------------------------------ the table

interface Cell { ds: number; row: number; sub: number; raw: string }

const subCount = (t: DataTableModel, d: number) => t.datasets[d]?.rows[0]?.length ?? 1;

/** Which subcolumns of a data set hold values the analysis reads. */
function valueSubs(t: DataTableModel, d: number): number[] {
  if (t.type === "survival") return [0, 1].filter((s) => s < subCount(t, d));
  return Array.from({ length: subCount(t, d) }, (_, s) => s);
}

const excludedKey = (t: DataTableModel, c: Cell) =>
  !!t.datasets[c.ds]?.excluded?.includes(`${c.row}:${c.sub}`);

/** A cell's name in notes: "Group B, row 7" (with the subcolumn when the
 *  data set has several: "Control, Y2, row 3"). */
export function cellName(t: DataTableModel, ds: number, row: number, sub: number): string {
  const d = t.datasets[ds];
  const name = d?.name?.trim() || `Data set ${ds + 1}`;
  const subs = subCount(t, ds);
  const subName = subs > 1 ? `, ${d?.subTitles?.[sub]?.trim() || (t.type === "survival"
    ? ["Time", "Event"][sub] ?? `Y${sub + 1}` : `Y${sub + 1}`)}` : "";
  return `${name}${subName}, row ${row + 1}`;
}

/** A value the analysis can use: a number, not excluded. */
const usable = (t: DataTableModel, c: Cell) => parseCell(c.raw) !== null && !excludedKey(t, c);

function cellsOf(t: DataTableModel, datasets: number[]): Cell[] {
  const out: Cell[] = [];
  for (const ds of datasets) {
    const d = t.datasets[ds];
    if (!d) continue;
    const subs = valueSubs(t, ds);
    d.rows.forEach((row, r) => subs.forEach((s) => out.push({ ds, row: r, sub: s, raw: row[s] ?? "" })));
  }
  return out;
}

/** Last row holding anything in these data sets (trailing blank rows of
 *  a table are not blanks in the data). */
function lastRow(t: DataTableModel, datasets: number[]): number {
  let last = -1;
  for (const ds of datasets) {
    t.datasets[ds]?.rows.forEach((row, r) => { if (row.some((v) => v.trim() !== "")) last = Math.max(last, r); });
  }
  return last;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function listCells(t: DataTableModel, cells: Cell[], max = 5): string {
  const shown = cells.slice(0, max).map((c) => `${cellName(t, c.ds, c.row, c.sub)} (“${c.raw.trim()}”)`);
  return cells.length > max ? `${shown.join(", ")} and ${cells.length - max} more` : shown.join(", ");
}

function rowList(rows: number[], max = 8): string {
  const shown = rows.slice(0, max).map((r) => String(r + 1)).join(", ");
  return rows.length > max ? `${shown} and ${rows.length - max} more` : shown;
}

/** Rows whose pair (two data sets, every subcolumn position) is
 *  incomplete: one side has a usable value and the other does not. */
function pairRows(t: DataTableModel, a: number, b: number): { complete: number; incomplete: number[] } {
  const n = Math.max(t.datasets[a]?.rows.length ?? 0, t.datasets[b]?.rows.length ?? 0);
  const w = Math.max(subCount(t, a), subCount(t, b));
  let complete = 0;
  const incomplete: number[] = [];
  for (let r = 0; r < n; r++) {
    let bad = false;
    for (let s = 0; s < w; s++) {
      const ca = { ds: a, row: r, sub: s, raw: t.datasets[a]?.rows[r]?.[s] ?? "" };
      const cb = { ds: b, row: r, sub: s, raw: t.datasets[b]?.rows[r]?.[s] ?? "" };
      const ua = usable(t, ca);
      const ub = usable(t, cb);
      if (ua && ub) complete++;
      else if (ua !== ub) bad = true;
    }
    if (bad) incomplete.push(r);
  }
  return { complete, incomplete };
}

/** The n the engine reports for a paired analysis, if any: n_pairs (t
 *  tests) or n (correlation), and incomplete_pairs (0-based row indices,
 *  one per incomplete pair). */
function engineCounts(result: unknown): { n?: number; incomplete?: number; rows?: number[] } {
  const r = (result && typeof result === "object" ? result : {}) as Record<string, unknown>;
  const out: { n?: number; incomplete?: number; rows?: number[] } = {};
  if (typeof r.n_pairs === "number") out.n = r.n_pairs;
  else if (typeof r.n === "number" && Array.isArray(r.incomplete_pairs)) out.n = r.n;
  const ip = r.incomplete_pairs;
  if (typeof ip === "number") out.incomplete = ip;
  else if (Array.isArray(ip) && ip.every((v) => typeof v === "number")) {
    out.incomplete = ip.length;
    out.rows = [...new Set(ip as number[])].sort((x, y) => x - y);
  }
  return out;
}

/** The engine's own "2 incomplete pairs (rows 4, 9) left out": the
 *  Analysed line already says it. */
const INCOMPLETE_WARNING = /^\d+ incomplete (XY )?pairs? \(rows? [\d, ]+\) left out\.?$/;

/** The "Analysed" line and the notes about the table. */
function tableNotes(t: DataTableModel, plan: Plan, result: unknown):
  { analysed: string | null; notes: DataNote[] } {
  const notes: DataNote[] = [];
  const summary = t.subcolumnFormat !== "replicates";
  const cells = cellsOf(t, plan.datasets);
  const excluded = cells.filter((c) => excludedKey(t, c) && c.raw.trim() !== "");
  // multiple-variables tables hold text columns by design (grouping
  // columns, categorical predictors, sample names)
  const notNumbers = t.type === "multivariable" ? [] : cells.filter((c) => !excludedKey(t, c)
    && ["text", "localeNumber"].includes(classifyValue(c.raw)));
  const codes = cells.filter((c) => !excludedKey(t, c) && classifyValue(c.raw) === "missing");
  // X: text or unreadable dates / times in XY fits
  const xBad: number[] = [];
  const xMissing: number[] = [];
  if (plan.kind === "points") {
    t.x.forEach((v, r) => {
      const hasY = plan.datasets.some((d) => valueSubs(t, d)
        .some((s) => usable(t, { ds: d, row: r, sub: s, raw: t.datasets[d].rows[r]?.[s] ?? "" })));
      if (!hasY) return;
      const xEx = t.xExcluded?.includes(r);
      if (xEx) return;
      const bad = t.xFormat === "numbers" ? v.trim() !== "" && parseCell(v) === null
        : v.trim() !== "" && xInvalid(t, v);
      if (bad) xBad.push(r);
      else if (v.trim() === "") xMissing.push(r);
    });
  }

  if (notNumbers.length) {
    notes.push({ from: "data", tone: "warn", text: `${notNumbers.length === 1
      ? "1 cell is not a number and was skipped"
      : `${notNumbers.length} cells are not numbers and were skipped`}: ${listCells(t, notNumbers)}. `
      + "Skipped cells are not counted in n; correct them in the table to include them." });
  }
  if (codes.length) {
    notes.push({ from: "data", tone: "info", text: `${plural(codes.length, "cell holds",
      "cells hold")} an error or missing-value code, read as missing: ${listCells(t, codes)}.` });
  }
  if (excluded.length) {
    notes.push({ from: "data", tone: "info", text: `${plural(excluded.length, "excluded value",
      "excluded values")} left out: ${excluded.slice(0, 5).map((c) => cellName(t, c.ds, c.row, c.sub))
      .join(", ")}${excluded.length > 5 ? ` and ${excluded.length - 5} more` : ""}.` });
  }
  if (xBad.length) {
    notes.push({ from: "data", tone: "warn", text: `${plural(xBad.length, "row has", "rows have")} an X`
      + ` that is not ${t.xFormat === "numbers" ? "a number" : t.xFormat === "dates" ? "a date" : "a time"}`
      + `, so its Y values were left out: row${xBad.length === 1 ? "" : "s"} ${rowList(xBad)}.` });
  }
  if (xMissing.length) {
    notes.push({ from: "data", tone: "warn", text: `${plural(xMissing.length, "row has", "rows have")}`
      + ` Y values but no X value, so ${xMissing.length === 1 ? "it was" : "they were"} left out: `
      + `row${xMissing.length === 1 ? "" : "s"} ${rowList(xMissing)}.` });
  }

  if (summary || plan.kind === "none" || !plan.datasets.length) return { analysed: null, notes };

  const extras = (blanks: number) => {
    const bits: string[] = [];
    if (blanks) bits.push(plural(blanks, "blank cell", "blank cells"));
    if (excluded.length) bits.push(`${plural(excluded.length, "excluded value", "excluded values")} left out`);
    if (notNumbers.length) bits.push(`${plural(notNumbers.length, "text cell", "text cells")} skipped`);
    if (codes.length) bits.push(`${plural(codes.length, "missing-value code", "missing-value codes")}`);
    return bits.length ? `; ${bits.join(", ")}` : "";
  };
  const names = plan.datasets.map((d) => t.datasets[d]?.name?.trim() || `Data set ${d + 1}`);

  if (plan.kind === "pairs") {
    const [a, b] = plan.datasets;
    const { complete, incomplete } = pairRows(t, a, b);
    const eng = engineCounts(result);
    const n = eng.n ?? complete;
    // the engine's list when it gives one, else the table's
    const rowsLeft = eng.rows ?? incomplete;
    const nIncomplete = eng.incomplete ?? incomplete.length;
    const rows = rowsLeft.length && (eng.rows || nIncomplete === incomplete.length)
      ? ` (row${rowsLeft.length === 1 ? "" : "s"} ${rowList(rowsLeft)})` : "";
    const left = nIncomplete
      ? `; ${plural(nIncomplete, "incomplete pair", "incomplete pairs")}${rows} left out`
      : "; no incomplete pairs";
    if (eng.n !== undefined && eng.n !== complete) {
      notes.push({ from: "data", tone: "warn", text: `The analysis used ${plural(eng.n, "pair", "pairs")}`
        + ` but the table has ${plural(complete, "complete pair", "complete pairs")} (${names.join(" and ")}).` });
    }
    return { analysed: `n = ${plural(n, "pair", "pairs")} analysed${left}`, notes };
  }

  if (plan.kind === "subjects") {
    const rowsN = Math.max(0, ...plan.datasets.map((d) => t.datasets[d]?.rows.length ?? 0));
    let complete = 0;
    const incomplete: number[] = [];
    for (let r = 0; r < rowsN; r++) {
      const has = plan.datasets.map((d) => usable(t, { ds: d, row: r, sub: 0, raw: t.datasets[d]?.rows[r]?.[0] ?? "" }));
      if (has.every(Boolean)) complete++;
      else if (has.some(Boolean)) incomplete.push(r);
    }
    // RM one-way fitted as a mixed-effects model: incomplete subjects kept
    if ((result as { analysis?: string } | null)?.analysis === "mixed_rm_one_way" && incomplete.length) {
      return { analysed: `n = ${plural(complete + incomplete.length, "row", "rows")} (subjects) analysed by the `
        + `mixed-effects model; ${plural(incomplete.length, "incomplete row", "incomplete rows")} (row`
        + `${incomplete.length === 1 ? "" : "s"} ${rowList(incomplete)}) kept`, notes };
    }
    const left = incomplete.length
      ? `; ${plural(incomplete.length, "incomplete row", "incomplete rows")} (row${incomplete.length === 1 ? "" : "s"} `
        + `${rowList(incomplete)}) left out`
      : "; no incomplete rows";
    return { analysed: `n = ${plural(complete, "row", "rows")} (subjects) analysed${left}`, notes };
  }

  if (plan.kind === "survival") {
    const counts = plan.datasets.map((d) => {
      let n = 0;
      t.datasets[d]?.rows.forEach((row, r) => {
        const time = usable(t, { ds: d, row: r, sub: 0, raw: row[0] ?? "" });
        const event = usable(t, { ds: d, row: r, sub: 1, raw: row[1] ?? "" });
        if (time && event) n++;
      });
      return n;
    });
    const half: number[] = [];
    plan.datasets.forEach((d) => t.datasets[d]?.rows.forEach((row, r) => {
      const time = usable(t, { ds: d, row: r, sub: 0, raw: row[0] ?? "" });
      const event = usable(t, { ds: d, row: r, sub: 1, raw: row[1] ?? "" });
      if (time !== event) half.push(r);
    }));
    const left = half.length ? `; ${plural(half.length, "row", "rows")} with only one of time and event`
      + ` left out (row${half.length === 1 ? "" : "s"} ${rowList([...new Set(half)].sort((x, y) => x - y))})` : "";
    return { analysed: `n = ${counts.join(", ")} subjects analysed (${names.join(", ")})${left}`, notes };
  }

  if (plan.kind === "points") {
    const counts = plan.datasets.map((d) => {
      let n = 0;
      t.datasets[d]?.rows.forEach((row, r) => {
        const xOk = !t.xExcluded?.includes(r) && (t.xFormat === "numbers"
          ? parseCell(t.x[r] ?? "") !== null : (t.x[r] ?? "").trim() !== "" && !xInvalid(t, t.x[r]));
        if (!xOk) return;
        valueSubs(t, d).forEach((s) => { if (usable(t, { ds: d, row: r, sub: s, raw: row[s] ?? "" })) n++; });
      });
      return n;
    });
    const last = lastRow(t, plan.datasets);
    const blanks = cells.filter((c) => c.row <= last && c.raw.trim() === "").length;
    return { analysed: `n = ${counts.join(", ")} ${counts.length === 1 && counts[0] === 1 ? "point" : "points"}`
      + ` analysed${counts.length > 1 ? ` (${names.join(", ")})` : ""}${extras(blanks)}`, notes };
  }

  // groups
  const counts = plan.datasets.map((d) => cells.filter((c) => c.ds === d && usable(t, c)).length);
  const last = lastRow(t, plan.datasets);
  const blanks = cells.filter((c) => c.row <= last && c.raw.trim() === "").length;
  return {
    analysed: `n = ${counts.join(", ")} analysed (${names.join(", ")})${extras(blanks)}`,
    notes,
  };
}

// ------------------------------------------------------------ the result

const WARN_KEYS = new Set(["warning", "warnings"]);
const NOTE_KEYS = new Set(["note", "notes"]);

export interface EngineMessage { text: string; warn: boolean }

/** Every warning and note in an analysis result, at any depth, as text
 *  (with the data set it belongs to when the result names one).
 *  `*_error` strings (a part of the analysis that failed, such as the
 *  multiple comparisons) count as warnings. */
export function engineMessages(result: unknown): EngineMessage[] {
  const out: EngineMessage[] = [];
  const seen = new Set<string>();
  const add = (text: string, context: string, warn: boolean) => {
    const s = text.trim();
    if (!s) return;
    const msg = context && !s.startsWith(context) ? `${context}: ${s}` : s;
    if (!seen.has(msg)) { seen.add(msg); out.push({ text: msg, warn }); }
  };
  const take = (v: unknown, context: string, warn: boolean) => {
    if (typeof v === "string") add(v, context, warn);
    else if (Array.isArray(v)) v.forEach((x) => take(x, context, warn));
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const m = o.message ?? o.text ?? o.note ?? o.warning;
      if (typeof m === "string") add(m, context, warn);
    }
  };
  const walk = (v: unknown, depth: number, context: string) => {
    if (depth > 6 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      if (v.length > 2000) return;
      v.forEach((x) => walk(x, depth + 1, context));
      return;
    }
    const o = v as Record<string, unknown>;
    const ctx = depth > 0 && typeof o.name === "string" && o.name.trim() ? o.name.trim() : context;
    for (const [k, val] of Object.entries(o)) {
      // the Residuals section states its own note and warnings
      // (sheets/column/residualsPanel.tsx): not repeated here
      if (depth === 0 && k === "residual_check") continue;
      if (WARN_KEYS.has(k)) take(val, ctx, true);
      else if (NOTE_KEYS.has(k)) take(val, ctx, false);
      else if (k.endsWith("_error") && typeof val === "string") add(val, ctx, true);
      else if (val && typeof val === "object") walk(val, depth + 1, ctx);
    }
  };
  walk(result, 0, "");
  return out;
}

/** Everything the Notes strip shows for one results sheet. */
export function dataNotes(input: { analysisId: string; table: DataTableModel; options: unknown;
  result: unknown }): DataNotes {
  const plan = analysisPlan(input.analysisId, input.table, input.options);
  const { analysed, notes } = tableNotes(input.table, plan, input.result);
  const r = input.result as { error?: unknown } | null;
  const failed = !!(r && typeof r === "object" && r.error);
  const engine = engineMessages(input.result)
    .filter((m) => !(plan.kind === "pairs" && analysed && INCOMPLETE_WARNING.test(m.text)))
    .map((m): DataNote => ({ from: "engine", tone: m.warn ? "warn" : "info", text: m.text }));
  return { analysed: failed ? null : analysed, notes: [...engine, ...notes] };
}
