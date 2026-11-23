// "Paste data and suggest a table type": read a pasted block, guess which
// of the eight table types it fits, say why, and build the table for
// whichever type the user settles on. readPaste() is the one call for a
// paste outside the grid (clipboard text in; table, guess, reason and
// error-value note out). Pure; unit-tested.
import {
  detectDecimal, detectDelimiter, normalizeNumber, splitDelimited,
} from "../project/importText.ts";
import { isSpreadsheetError } from "../project/pasteReport.ts";
import { normalizeTable } from "../project/table.ts";
import type { DataTableModel, TableType } from "../project/types.ts";
import { maxOf } from "../lib/extent.ts";
import { sexPasteNote } from "./sex.ts";

export interface PastedBlock {
  /** Column titles (from a first row of text), or null. */
  titles: string[] | null;
  /** Data rows x columns, numbers normalised to a dot decimal. */
  rows: string[][];
  width: number;
  /** Spreadsheet error values (#DIV/0!, #N/A, #VALUE!, …) read as empty
   *  cells, and the distinct codes seen. */
  errors: { count: number; codes: string[] };
}

export interface Suggestion {
  type: TableType;
  reason: string;
}

const isNum = (s: string) => s.trim() !== "" && Number.isFinite(Number(s.trim()));

export function parsePasted(text: string): PastedBlock | null {
  const body = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  if (!body.trim()) return null;
  const delim = detectDelimiter(body);
  let m = splitDelimited(body, delim).filter((r) => r.some((c) => c.trim() !== ""));
  if (!m.length) return null;
  // An Excel error value holds no number: an empty cell, counted for the note.
  let errorCount = 0;
  const codes = new Set<string>();
  m = m.map((r) => r.map((c) => {
    if (!isSpreadsheetError(c)) return c;
    errorCount++;
    codes.add(c.trim().toUpperCase());
    return "";
  }));
  const decimal = detectDecimal(m);
  m = m.map((r) => r.map((c) => normalizeNumber(c.trim(), decimal)));
  const width = maxOf(m.map((r) => r.length));
  m = m.map((r) => [...r, ...Array(width - r.length).fill("")]);
  // A first row of mostly text above rows that hold numbers = titles.
  const first = m[0];
  const rest = m.slice(1);
  const firstText = first.filter((c) => c !== "" && !isNum(c)).length;
  const restNums = rest.some((r) => r.some(isNum));
  const titled = m.length > 1 && restNums && firstText >= Math.max(1, Math.ceil(width / 2));
  return { titles: titled ? first : null, rows: titled ? rest : m, width,
    errors: { count: errorCount, codes: [...codes] } };
}

/** The note for error values read as empty cells, or null when there
 *  are none: "2 Excel error values (#DIV/0!, #N/A) read as empty cells." */
export function errorValueNote(b: PastedBlock | null): string | null {
  const n = b?.errors.count ?? 0;
  if (!b || !n) return null;
  return `${n} Excel error ${n === 1 ? "value" : "values"} (${b.errors.codes.join(", ")}) `
    + `read as ${n === 1 ? "an empty cell" : "empty cells"}.`;
}

/** Values of column c (blank cells dropped). */
function col(b: PastedBlock, c: number): string[] {
  return b.rows.map((r) => r[c] ?? "").filter((v) => v.trim() !== "");
}
const numericCol = (b: PastedBlock, c: number) => {
  const v = col(b, c);
  return v.length > 0 && v.every(isNum);
};
const textCol = (b: PastedBlock, c: number) => {
  const v = col(b, c);
  return v.length > 0 && v.some((x) => !isNum(x));
};
const binaryCol = (b: PastedBlock, c: number) => {
  const v = col(b, c);
  return v.length >= 3 && v.every((x) => x === "0" || x === "1")
    && v.some((x) => x === "1");
};
const wholeNonNeg = (b: PastedBlock, c: number) =>
  col(b, c).every((x) => isNum(x) && Number(x) >= 0 && Number.isInteger(Number(x)));

function monotone(vals: number[]): boolean {
  if (vals.length < 3) return false;
  const up = vals.every((v, i) => i === 0 || v > vals[i - 1]);
  const down = vals.every((v, i) => i === 0 || v < vals[i - 1]);
  return up || down;
}

/** Spacing of a monotone X: even on a linear or a log scale (doses). */
function spacing(vals: number[]): "linear" | "log" | "uneven" {
  const d = vals.slice(1).map((v, i) => v - vals[i]);
  const even = (xs: number[]) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return m !== 0 && xs.every((x) => Math.abs(x - m) <= 1e-6 * Math.abs(m) + Math.abs(m) * 0.02);
  };
  if (even(d)) return "linear";
  if (vals.every((v) => v > 0)) {
    const r = vals.slice(1).map((v, i) => Math.log(v / vals[i]));
    if (even(r)) return "log";
  }
  return "uneven";
}

// ------------------------------------------------------------ replicates

/** Adjacent Y columns that make one data set: a run of titles that share
 *  a stem and count up from 1 ("Rep 1, Rep 2, Rep 3", "WT_1, WT_2",
 *  "A1, A2"), or a single column. `name` is the data set's name, "" when
 *  the stem only says "replicate". */
export interface ColumnGroup { name: string; cols: number[] }

const REP_TITLE = /^(.*?)[\s_\-.:#(]*(\d{1,3})\)?$/;
/** Stems that say "a replicate" and nothing about the data set. */
const REPLICATE_STEM = /^(rep|reps|repl|replicate|replicates|r|n|run|trial|repeat|y|value|values|measurement|meas|well|technical replicate|biological replicate)?$/i;

function parseRepTitle(t: string): { stem: string; n: number } | null {
  const m = REP_TITLE.exec(t.trim());
  return m ? { stem: m[1].trim(), n: Number(m[2]) } : null;
}

/** The Y columns from `from` on, grouped into data sets. A run of
 *  replicate titles becomes one data set when it cannot be levels of a
 *  factor: its stem only says "replicate" (Rep 1, Rep 2), or the columns
 *  hold two or more runs (WT 1, WT 2, KO 1, KO 2), or, in an XY table
 *  (whose Y columns are never factor levels), one run covers every Y
 *  column. Anything else stays one data set per column. */
export function replicateGroups(b: PastedBlock, from: number, type: TableType): ColumnGroup[] {
  const W = b.width;
  const titles = Array.from({ length: W }, (_, c) => (b.titles?.[c] ?? "").trim());
  const runs: { stem: string; cols: number[] }[] = [];
  for (let c = from; c < W;) {
    const head = b.titles ? parseRepTitle(titles[c]) : null;
    const cols = [c];
    if (head && head.n === 1) {
      for (let next = c + 1; next < W; next++) {
        const t = parseRepTitle(titles[next]);
        if (!t || t.stem.toLowerCase() !== head.stem.toLowerCase() || t.n !== cols.length + 1) break;
        cols.push(next);
      }
    }
    runs.push({ stem: head && cols.length > 1 ? head.stem : "", cols });
    c += cols.length;
  }
  const multi = runs.filter((r) => r.cols.length > 1).length;
  const keep = (stem: string) => REPLICATE_STEM.test(stem) || multi >= 2
    || (type === "xy" && runs.length === 1);
  return runs.flatMap((r) => (r.cols.length > 1 && keep(r.stem)
    ? [{ name: REPLICATE_STEM.test(r.stem) ? "" : r.stem, cols: r.cols }]
    : r.cols.map((c) => ({ name: titles[c], cols: [c] }))));
}

/** Replicates per data set in the guess for `type` (the size of its
 *  replicate runs, when every data set has the same), else 1: what the
 *  Import dialog's "Y columns per dataset" starts at for a new table. */
export function replicatesPerSet(b: PastedBlock, type: TableType): number {
  if (type !== "xy" && type !== "grouped") return 1;
  const from = type === "xy" || (textCol(b, 0) && b.width > 1) ? 1 : 0;
  const groups = replicateGroups(b, from, type);
  const k = groups[0]?.cols.length ?? 1;
  return groups.every((g) => g.cols.length === k) ? k : 1;
}

/** "Rep 1 to Rep 3 read as 3 replicates of one data set.", or null. */
function replicateReason(b: PastedBlock, from: number, type: TableType): string | null {
  const reps = replicateGroups(b, from, type).filter((g) => g.cols.length > 1);
  if (!reps.length) return null;
  const t = (c: number) => (b.titles?.[c] ?? "").trim();
  const spans = reps.map((g) => `${t(g.cols[0])} to ${t(g.cols[g.cols.length - 1])}`);
  if (reps.length === 1) {
    return `${spans[0]} read as ${reps[0].cols.length} replicates of one data set.`;
  }
  const same = reps.every((g) => g.cols.length === reps[0].cols.length);
  return `${spans.slice(0, -1).join(", ")} and ${spans[spans.length - 1]} read as `
    + `${reps.length} data sets with `
    + `${same ? `${reps[0].cols.length} replicates each` : "their replicates side by side"}.`;
}

/** The guess, with the reason shown next to it. */
export function suggestTableType(b: PastedBlock | null): Suggestion {
  const s = guessType(b);
  if (!b || (s.type !== "xy" && s.type !== "grouped")) return s;
  const from = s.type === "xy" || (textCol(b, 0) && b.width > 1) ? 1 : 0;
  const reps = replicateReason(b, from, s.type);
  return reps ? { ...s, reason: `${s.reason} ${reps}` } : s;
}

function guessType(b: PastedBlock | null): Suggestion {
  if (!b || !b.rows.length) {
    return { type: "column", reason: "Nothing to read yet: paste a block copied from a spreadsheet." };
  }
  const W = b.width;
  const cols = Array.from({ length: W }, (_, c) => c);
  const numeric = cols.filter((c) => numericCol(b, c));
  const text = cols.filter((c) => textCol(b, c));
  const nRows = b.rows.length;

  // Survival: a column of times followed by a column of 0/1 events.
  const pairs = cols.filter((c) => c + 1 < W && numericCol(b, c) && !binaryCol(b, c)
    && binaryCol(b, c + 1) && col(b, c).every((x) => Number(x) >= 0));
  if (pairs.length && numeric.length >= 2) {
    return { type: "survival", reason: `Column ${pairs[0] + 2} holds only 0 and 1 next to a `
      + "column of non-negative numbers: that reads as times with events (1) and censored "
      + "subjects (0)." };
  }

  const labels = text.length === 1 && text[0] === 0;
  const counts = numeric.length >= 2 && numeric.every((c) => wholeNonNeg(b, c));

  // Contingency: whole-number counts in a few rows, labelled by group.
  if (labels && counts && nRows >= 2 && nRows <= 12 && numeric.length <= 6
    && new Set(col(b, 0)).size === col(b, 0).length) {
    return { type: "contingency", reason: "Rows labelled with group names and cells holding "
      + "whole-number counts: a contingency table (rows = groups, columns = outcomes)." };
  }

  // XY: a numeric first column with monotone spacing plus Y columns.
  if (numericCol(b, 0) && numeric.length >= 2 && W >= 2) {
    const xs = col(b, 0).map(Number);
    if (xs.length === nRows && monotone(xs)) {
      const sp = spacing(xs);
      return { type: "xy", reason: "The first column is numeric and runs steadily "
        + `${xs[1] > xs[0] ? "up" : "down"}${sp === "log" ? " in equal fold steps (like a "
          + "dilution series)" : sp === "linear" ? " in equal steps" : ""}: it reads as X `
        + "(dose, concentration or time) with the other columns as Y values." };
    }
  }

  // Contingency without labels: a small block of counts.
  if (counts && text.length === 0 && nRows >= 2 && nRows <= 4 && W <= 4) {
    return { type: "contingency", reason: "A small block of whole-number counts: it reads as "
      + "a contingency table (rows = groups, columns = outcomes). Change it to Column if these "
      + "are measurements." };
  }

  // Multiple variables: a categorical text column (values repeat) and
  // several numeric columns.
  if (text.length >= 1 && numeric.length >= 2) {
    const repeats = text.some((c) => new Set(col(b, c)).size < col(b, c).length);
    if (repeats) {
      return { type: "multivariable", reason: "A text column whose values repeat (categories "
        + "such as sex or genotype) next to numeric columns: each row is one observation and "
        + "each column one variable." };
    }
  }

  // Grouped vs column by the presence of row titles.
  if (labels && numeric.length >= 1) {
    return { type: "grouped", reason: "The first column holds a distinct label for each row "
      + "(row titles) and the other columns hold numbers: a grouped table, with the rows as "
      + "one factor and the columns as the other." };
  }
  return { type: "column", reason: "Columns of numbers without row labels: each column reads "
    + "as one group with its values down the rows." };
}

const title = (b: PastedBlock, c: number, fallback: string) =>
  (b.titles?.[c] ?? "").trim() || fallback;
const letter = (i: number) => String.fromCharCode(65 + (i % 26));

/** One data set from a column group: replicates side by side, their
 *  source titles kept as subcolumn titles. */
function replicateDataset(b: PastedBlock, g: ColumnGroup, i: number) {
  const rows = b.rows.map((r) => g.cols.map((c) => r[c] ?? ""));
  const name = g.name || `Data set ${letter(i)}`;
  if (g.cols.length === 1) return { name, rows };
  return { name, rows, subTitles: g.cols.map((c) => (b.titles?.[c] ?? "").trim()) };
}

/** The pasted block as a table of `type`. */
export function buildTable(b: PastedBlock, type: TableType): DataTableModel {
  const W = b.width;
  const cols = Array.from({ length: W }, (_, c) => c);
  const firstText = textCol(b, 0) && W > 1;
  const cell = (r: number, c: number) => b.rows[r]?.[c] ?? "";
  const nRows = b.rows.length;
  const yCols = (from: number) => cols.slice(from);
  const rowTitles = firstText ? b.rows.map((r) => r[0] ?? "") : undefined;

  switch (type) {
    case "xy": {
      const x = b.rows.map((r) => r[0] ?? "");
      return normalizeTable({ type, x, xTitle: title(b, 0, "X"),
        datasets: replicateGroups(b, 1, type).map((g, i) => replicateDataset(b, g, i)) });
    }
    case "survival": {
      const starts = cols.filter((c) => c + 1 < W && numericCol(b, c) && binaryCol(b, c + 1));
      const use = starts.length ? starts.filter((c, i) => i === 0 || c >= starts[i - 1] + 2) : [0];
      return normalizeTable({ type,
        datasets: use.map((c, i) => ({ name: title(b, c, `Group ${letter(i)}`),
          subTitles: ["Time", "Event"],
          rows: b.rows.map((_, r) => [cell(r, c), cell(r, c + 1)]) })) });
    }
    case "multivariable":
      return normalizeTable({ type,
        rowTitles: b.rows.map((_, r) => `S${r + 1}`),
        datasets: cols.map((c, i) => ({ name: title(b, c, `Variable ${i + 1}`),
          varType: textCol(b, c) ? "categorical" : "continuous",
          rows: b.rows.map((_, r) => [cell(r, c)]) })) });
    case "nested":
      return normalizeTable({ type,
        datasets: yCols(firstText ? 1 : 0).map((c, i) => ({ name: title(b, c, `Group ${letter(i)}`),
          subTitles: ["Subgroup 1"], rows: b.rows.map((_, r) => [cell(r, c)]) })) });
    case "column":
      return normalizeTable({ type, rowTitles,
        datasets: yCols(firstText ? 1 : 0).map((c, i) => ({ name: title(b, c, `Group ${letter(i)}`),
          rows: b.rows.map((_, r) => [cell(r, c)]) })) });
    case "grouped":
      return normalizeTable({ type,
        rowTitles: rowTitles ?? Array.from({ length: nRows }, (_, r) => `Row ${r + 1}`),
        datasets: replicateGroups(b, firstText ? 1 : 0, type)
          .map((g, i) => replicateDataset(b, g, i)) });
    default: // contingency, partsofwhole: row titles + one column each
      return normalizeTable({ type,
        rowTitles: rowTitles ?? Array.from({ length: nRows }, (_, r) => `Row ${r + 1}`),
        datasets: yCols(firstText ? 1 : 0).map((c, i) => ({
          name: title(b, c, type === "contingency" ? `Outcome ${i + 1}` : `Data set ${letter(i)}`),
          rows: b.rows.map((_, r) => [cell(r, c)]) })) });
  }
}

// ------------------------------------------------------------ one call

export interface ReadPaste {
  block: PastedBlock;
  /** The guessed type and why (shown next to a "Read as" select). */
  suggestion: Suggestion;
  /** The type the table is built as: `as` when given, else the guess. */
  type: TableType;
  table: DataTableModel;
  /** Excel error values read as empty cells (0 when none). */
  errorValues: number;
  /** errorValueNote(): the counted note, or null. */
  errorNote: string | null;
  /** A column that looks like sex: the question to ask (guide/sex.ts). */
  sexNote: string | null;
}

/** Clipboard text to a table: parse it, guess the table type with its
 *  reason, and build the table as the guess (or as `as`, the user's
 *  "Read as" choice). Null when the text holds no cells. */
export function readPaste(text: string, as?: TableType): ReadPaste | null {
  const block = parsePasted(text);
  if (!block) return null;
  const suggestion = suggestTableType(block);
  const type = as ?? suggestion.type;
  return { block, suggestion, type, table: buildTable(block, type),
    errorValues: block.errors.count, errorNote: errorValueNote(block), sexNote: sexPasteNote(block) };
}
