// Cells that hold a number with a percent sign ("12.5%") or a unit
// ("3.2 µM"): the grid reads them as text (never as a number it guessed),
// and the paste report offers one click to read them (P-35): a percent as
// its digits (12.5) or as a fraction (0.125), a unit stripped (3.2). The
// new text is made from the typed digits, by moving the decimal point in
// the string, never by floating-point arithmetic, so 47.5% becomes
// exactly 0.475. Nothing here runs unless the user clicks. Pure;
// unit-tested.
import { flatColumns, setCell, setX } from "./table.ts";
import type { DataTableModel } from "./types.ts";

const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`;
const PERCENT = new RegExp(`^(${NUM})\\s*%$`);
// A unit starts with a letter or µ, μ, °, Ω and may hold digits, /, ·, ^,
// ², ³, ⁻ and dots after it (µM, mg/mL, °C, cells/µL, m², kg·m⁻³).
const UNIT = new RegExp(`^(${NUM})\\s*([A-Za-zµμ°Ω][A-Za-z0-9µμ°Ω/·^²³⁻.\\-]*)$`);

/** "12.5%" → "12.5" (the digits as typed), else null. */
export function percentDigits(s: string): string | null {
  const m = PERCENT.exec(s.trim());
  return m ? m[1] : null;
}

/** The decimal text `num` times 10^places, by moving the point in the
 *  string: shiftDecimal("12.5", -2) is "0.125", exactly. */
export function shiftDecimal(num: string, places: number): string {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(num.trim());
  if (!m) throw new Error(`not a decimal number: ${num}`);
  const [, sign, int = "", frac = "", exp] = m;
  if (exp !== undefined) {
    const mant = frac ? `${int || "0"}.${frac}` : int || "0";
    return `${sign}${mant}e${Number(exp) + places}`;
  }
  let digits = int + frac;
  let point = int.length + places;
  if (point <= 0) { digits = "0".repeat(1 - point) + digits; point = 1; }
  if (point > digits.length) digits += "0".repeat(point - digits.length);
  const whole = digits.slice(0, point).replace(/^0+(?=\d)/, "");
  const rest = digits.slice(point).replace(/0+$/, "");
  const out = rest ? `${whole}.${rest}` : whole;
  return /^0(\.0*)?$/.test(out) ? out : `${sign}${out}`;
}

/** "12.5%" → "0.125", else null. */
export function percentFraction(s: string): string | null {
  const d = percentDigits(s);
  return d === null ? null : shiftDecimal(d, -2);
}

/** "3.2 µM" → { num: "3.2", unit: "µM" }; a percent is not a unit. */
export function unitOf(s: string): { num: string; unit: string } | null {
  const t = s.trim();
  if (PERCENT.test(t)) return null;
  const m = UNIT.exec(t);
  return m ? { num: m[1], unit: m[2] } : null;
}

/** How the user asked to read the cells. */
export type UnitFix = "percent" | "fraction" | "unit";

/** A cell's text read as asked, or null when it does not hold that. */
export function fixedText(s: string, how: UnitFix): string | null {
  if (how === "percent") return percentDigits(s);
  if (how === "fraction") return percentFraction(s);
  return unitOf(s)?.num ?? null;
}

/** The table with these cells (grid row, flat column) read as asked: one
 *  edit, so one undo restores the text. A cell edited since (no longer
 *  a percent or a unit) is left alone; exclusions are untouched. */
export function fixCells(t: DataTableModel, cells: { row: number; col: number }[], how: UnitFix):
  { table: DataTableModel; changed: number } {
  const cols = flatColumns(t);
  let next = t;
  let changed = 0;
  for (const { row, col } of cells) {
    const c = cols[col];
    if (!c || c.kind === "rowTitle") continue;
    const before = c.kind === "x" ? next.x[row] : next.datasets[c.dataset]?.rows[row]?.[c.sub];
    if (before === undefined) continue;
    const after = fixedText(before, how);
    if (after === null) continue;
    next = c.kind === "x" ? setX(next, row, after) : setCell(next, c.dataset, row, c.sub, after);
    changed++;
  }
  return { table: next, changed };
}
