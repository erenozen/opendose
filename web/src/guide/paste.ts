// "Paste data and suggest a table type" (start screen): read a pasted
// block, guess which of the eight table types it fits, say why, and build
// the table for whichever type the user settles on. Pure; unit-tested.
import {
  detectDecimal, detectDelimiter, normalizeNumber, splitDelimited,
} from "../project/importText.ts";
import { normalizeTable } from "../project/table.ts";
import type { DataTableModel, TableType } from "../project/types.ts";

export interface PastedBlock {
  /** Column titles (from a first row of text), or null. */
  titles: string[] | null;
  /** Data rows x columns, numbers normalised to a dot decimal. */
  rows: string[][];
  width: number;
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
  const decimal = detectDecimal(m);
  m = m.map((r) => r.map((c) => normalizeNumber(c.trim(), decimal)));
  const width = Math.max(...m.map((r) => r.length));
  m = m.map((r) => [...r, ...Array(width - r.length).fill("")]);
  // A first row of mostly text above rows that hold numbers = titles.
  const first = m[0];
  const rest = m.slice(1);
  const firstText = first.filter((c) => c !== "" && !isNum(c)).length;
  const restNums = rest.some((r) => r.some(isNum));
  const titled = m.length > 1 && restNums && firstText >= Math.max(1, Math.ceil(width / 2));
  return { titles: titled ? first : null, rows: titled ? rest : m, width };
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

/** The guess, with the reason shown next to it. */
export function suggestTableType(b: PastedBlock | null): Suggestion {
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
        datasets: yCols(1).map((c, i) => ({ name: title(b, c, `Data set ${letter(i)}`),
          rows: b.rows.map((_, r) => [cell(r, c)]) })) });
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
    default: // grouped, contingency, partsofwhole: row titles + one column each
      return normalizeTable({ type,
        rowTitles: rowTitles ?? Array.from({ length: nRows }, (_, r) => `Row ${r + 1}`),
        datasets: yCols(firstText ? 1 : 0).map((c, i) => ({
          name: title(b, c, type === "contingency" ? `Outcome ${i + 1}` : `Data set ${letter(i)}`),
          rows: b.rows.map((_, r) => [cell(r, c)]) })) });
  }
}
