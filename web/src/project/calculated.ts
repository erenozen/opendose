// Calculated columns: a data set whose values come from a formula over the
// table's other columns (C = A + B, B / A * 100, GROUPMEAN(Weight, Sex)),
// recomputed whenever those columns change (app/useCalculatedSync.ts).
// The values are written into the cells, so every analysis and graph
// reads them like typed values; the formula is kept on the column.
//
// The formula language is the engine's (opendose/formulas.py, the
// "calculate" mode of formula_transform): a column is referenced by its
// letter (A, B, ...) or its name ({Name with spaces}); X is the X column
// of an XY table. Columns are calculated left to right, so a formula can
// use a calculated column to its left. With subcolumns (replicates) the
// formula is evaluated once per subcolumn: subcolumn j of the result uses
// subcolumn j of every other column (blank where a column has fewer).
// Excluded cells are calculated with like any other value. Pure.
import { parseCell } from "./table.ts";
import type { DataColumn, DataTableModel } from "./types.ts";

export const isCalculated = (d: DataColumn): boolean =>
  typeof d.formula === "string" && d.formula.trim() !== "";

export function hasCalculated(t: DataTableModel): boolean {
  return t.datasets.some(isCalculated);
}

/** Column letter of data set i: A..Z, AA, AB, ... */
export function letterOf(i: number): string {
  let s = "";
  let n = i + 1;
  while (n) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** The table's contents as one string. The sync records it for the table
 *  it wrote, so a table is recalculated when anything differs from that,
 *  including values pasted over a calculated column (restored). */
export function calcSignature(t: DataTableModel): string {
  return JSON.stringify([t.type, t.x,
    t.datasets.map((d) => [d.formula ?? "", d.name, d.varType ?? "", d.rows])]);
}

const num = (v: string): number | null => parseCell(v);

function cellValue(t: DataTableModel, d: DataColumn, v: string | undefined): number | string | null {
  if (v === undefined || v.trim() === "") return null;
  if (t.type === "multivariable" && d.varType === "categorical") return v.trim();
  return num(v);
}

/** Names a formula may use for data set i: its letter, and its name when
 *  that differs. */
function namesOf(d: DataColumn, i: number): string[] {
  const out = [letterOf(i)];
  const n = d.name.trim();
  if (n && n.toUpperCase() !== letterOf(i)) out.push(n);
  return out;
}

export interface CalcRequest {
  /** Subcolumn of the calculated columns this request fills. */
  sub: number;
  payload: {
    analysis: "formula_transform";
    data: { columns: Record<string, (number | string | null)[]> };
    options: { mode: "calculate"; formulas: { name: string; formula: string }[] };
  };
}

/** The engine requests (one per subcolumn) for a table's calculated
 *  columns; [] when it has none. */
export function calcRequests(t: DataTableModel): CalcRequest[] {
  if (!hasCalculated(t)) return [];
  const nRows = t.x.length;
  const width = Math.max(1, ...t.datasets.filter(isCalculated).map((d) => d.rows[0]?.length ?? 1));
  const out: CalcRequest[] = [];
  for (let sub = 0; sub < width; sub++) {
    const columns: Record<string, (number | string | null)[]> = {};
    if (t.type === "xy") columns.X = t.x.map((v) => num(v));
    t.datasets.forEach((d, i) => {
      if (isCalculated(d)) return;
      const vals = Array.from({ length: nRows }, (_, r) => cellValue(t, d, d.rows[r]?.[sub]));
      for (const n of namesOf(d, i)) columns[n] = vals;
    });
    const formulas: { name: string; formula: string }[] = [];
    t.datasets.forEach((d, i) => {
      if (!isCalculated(d)) return;
      const names = namesOf(d, i);
      formulas.push({ name: names[0], formula: String(d.formula) });
      // the name too, so later formulas can use it
      for (const n of names.slice(1)) formulas.push({ name: n, formula: names[0] });
    });
    out.push({ sub, payload: { analysis: "formula_transform", data: { columns },
      options: { mode: "calculate", formulas } } });
  }
  return out;
}

/** Engine value -> cell text, without float noise. */
export function calcCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v !== "number" || !Number.isFinite(v)) return "";
  return String(Number(v.toPrecision(12)));
}

/** The table with its calculated columns filled from the engine results
 *  (`results[k]` answers `calcRequests(t)[k]`; an { error } answer marks
 *  every calculated column with it). */
export function applyCalcResults(t: DataTableModel, results: unknown[]): DataTableModel {
  const reqs = calcRequests(t);
  const error = results.map((r) => (r && typeof r === "object" && "error" in r
    ? String((r as { error: unknown }).error) : null)).find((e) => e) ?? null;
  const datasets = t.datasets.map((d, i) => {
    if (!isCalculated(d)) return d;
    const letter = letterOf(i);
    const rows = d.rows.map((row) => [...row]);
    if (!error) {
      reqs.forEach((q, k) => {
        const cols = (results[k] as { columns?: Record<string, unknown[]> })?.columns ?? {};
        const vals = cols[letter] ?? [];
        rows.forEach((row, r) => {
          if (q.sub < row.length) row[q.sub] = calcCell(vals[r]);
        });
      });
    }
    const next: DataColumn = { ...d, rows };
    if (error) next.formulaError = error;
    else delete next.formulaError;
    return next;
  });
  return { ...t, datasets };
}

/** The value of a typed "=2*3+1": +, -, *, /, ^ (right-associative),
 *  parentheses, unary minus, PI, E and SQRT / LN / LOG (base 10) / EXP /
 *  ABS of one argument. null when the text is not such an expression (or
 *  the result is not a finite number). References to other cells are
 *  not supported: use a calculated column. */
export function evalCellExpression(text: string): number | null {
  const src = text.trim();
  if (!src.startsWith("=")) return null;
  const s = src.slice(1).replace(/\s+/g, "");
  let i = 0;
  const FN: Record<string, (x: number) => number> = {
    SQRT: Math.sqrt, LN: Math.log, LOG: Math.log10, EXP: Math.exp, ABS: Math.abs,
  };
  const fail = (): never => { throw new Error("bad"); };
  const primary = (): number => {
    if (s[i] === "(") { i++; const v = expr(); if (s[i] !== ")") fail(); i++; return v; }
    const m = /^(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(s.slice(i));
    if (m) { i += m[0].length; return Number(m[0]); }
    const w = /^[A-Za-z]+/.exec(s.slice(i));
    if (w) {
      const name = w[0].toUpperCase();
      i += w[0].length;
      if (name === "PI") return Math.PI;
      if (name === "E") return Math.E;
      const f = FN[name];
      if (!f || s[i] !== "(") fail();
      i++;
      const v = expr();
      if (s[i] !== ")") fail();
      i++;
      return f!(v);
    }
    return fail();
  };
  const unary = (): number => {
    if (s[i] === "-") { i++; return -unary(); }
    if (s[i] === "+") { i++; return unary(); }
    return power();
  };
  const power = (): number => {
    const b = primary();
    if (s[i] === "^") { i++; return b ** unary(); }
    return b;
  };
  const term = (): number => {
    let v = unary();
    while (s[i] === "*" || s[i] === "/") {
      const op = s[i++];
      const r = unary();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (s[i] === "+" || s[i] === "-") {
      const op = s[i++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  try {
    if (!s) return null;
    const v = expr();
    return i === s.length && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
