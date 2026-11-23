// Full-precision paste: the number a spreadsheet stores, not the one it
// shows. A copy from Excel, Google Sheets or LibreOffice Calc puts two
// versions of the block on the clipboard: text/plain holds each cell as
// it is displayed (0.12 for a cell formatted to two decimals), and
// text/html holds a table whose cells also carry the stored value:
//
//   Excel             <td x:num="0.123456">0.12</td>   (x:num with no value:
//                     the shown text is the value)
//   Google Sheets     <td data-sheets-value='{"1":3,"3":0.123456}'>0.12</td>
//                     (type 3 = number; 2 = text, 4 = boolean)
//   LibreOffice Calc  <td sdval="0.123456" sdnum="1033;0;0.00">0.12</td>
//
// Only plain numbers take the stored value: a cell shown as a percent, a
// date, a time, a currency or with thousands separators keeps its text
// (today's path), because its stored value means something else (0.12 for
// 12 %, a day count for a date). A stored value is used only when the
// shown text rounds it (the value agrees with what was shown to the shown
// digits), so a misaligned or mis-scaled cell is never swapped in.
// When the HTML table does not line up with the text block cell for cell,
// the text is used and the report says so. Pure except `parseClipboardHtml`,
// which reads the HTML with DOMParser (an inert document: no script runs,
// nothing loads, nothing touches the page).
import { looksLikeLocaleNumber, NUMBER_RE } from "./pasteReport.ts";

export type SheetApp = "Excel" | "Google Sheets" | "LibreOffice Calc";

/** One cell of a copied table: the text the app showed and, when the app
 *  also wrote the number it stores, that number. */
export interface HtmlCell {
  text: string;
  value: number | null;
}

export interface HtmlGrid {
  /** The app whose attributes carried stored values (null: none did). */
  app: SheetApp | null;
  rows: HtmlCell[][];
}

/** The parts of a table the reader uses: what DOMParser's
 *  HTMLTableElement gives, and what a test can build by hand. */
export interface CellLike {
  textContent: string | null;
  colSpan?: number;
  rowSpan?: number;
  getAttribute(name: string): string | null;
}
export interface TableLike {
  rows: ArrayLike<{ cells: ArrayLike<CellLike> }>;
}

/** Whitespace as a spreadsheet shows it: non-breaking spaces and line
 *  breaks inside a cell read as one space. */
export const cellText = (s: string | null): string =>
  (s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();

/** The stored number an app wrote on a cell, and which app wrote it. */
export function storedValue(cell: Pick<CellLike, "getAttribute">, text: string):
  { app: SheetApp; value: number | null } | null {
  const xnum = cell.getAttribute("x:num");
  if (xnum !== null) {
    const v = xnum.trim() === "" ? Number(text) : Number(xnum);
    return { app: "Excel", value: xnum.trim() === "" && text === "" ? null : finite(v) };
  }
  const sheets = cell.getAttribute("data-sheets-value");
  if (sheets !== null) {
    let v: number | null = null;
    try {
      const o = JSON.parse(sheets) as Record<string, unknown>;
      if (o["1"] === 3 && typeof o["3"] === "number") v = finite(o["3"]);
    } catch { /* not the documented shape: no stored value */ }
    return { app: "Google Sheets", value: v };
  }
  const sdval = cell.getAttribute("sdval");
  if (sdval !== null) return { app: "LibreOffice Calc", value: sdval.trim() === "" ? null : finite(Number(sdval)) };
  return null;
}

const finite = (v: number) => (Number.isFinite(v) ? v : null);

/** Read a table element into a grid of cells, spreading merged cells
 *  (colspan, rowspan) into blanks the way the text copy lays them out. */
export function gridFromTable(table: TableLike): HtmlGrid {
  const rows: HtmlCell[][] = [];
  // rowspan: columns still covered in the rows below
  const covered = new Map<number, Set<number>>();
  let app: SheetApp | null = null;
  for (let r = 0; r < table.rows.length; r++) {
    const out: HtmlCell[] = [];
    const busy = covered.get(r) ?? new Set<number>();
    let col = 0;
    const skipCovered = () => { while (busy.has(col)) { out[col] = { text: "", value: null }; col++; } };
    const cells = table.rows[r].cells;
    for (let k = 0; k < cells.length; k++) {
      skipCovered();
      const td = cells[k];
      const text = cellText(td.textContent);
      const sv = storedValue(td, text);
      if (sv && !app) app = sv.app;
      out[col] = { text, value: sv?.value ?? null };
      const span = Math.max(1, td.colSpan ?? 1);
      const down = Math.max(1, td.rowSpan ?? 1);
      for (let dr = 1; dr < down; dr++) {
        const set = covered.get(r + dr) ?? new Set<number>();
        for (let dc = 0; dc < span; dc++) set.add(col + dc);
        covered.set(r + dr, set);
      }
      for (let dc = 1; dc < span; dc++) out[col + dc] = { text: "", value: null };
      col += span;
    }
    skipCovered();
    rows.push(out);
  }
  return { app, rows };
}

/** The first table in clipboard HTML, or null when there is none (a copy
 *  from a text editor, a web page without a table). */
export function parseClipboardHtml(html: string): HtmlGrid | null {
  if (!html || !/<table/i.test(html) || typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  return table ? gridFromTable(table) : null;
}

/** A shown number with a decimal comma read as a point ("0,12" → "0.12"),
 *  or the text itself; null when it is not a plain number. */
function shownNumber(text: string): { n: number; digits: string } | null {
  const t = text.trim();
  const plain = NUMBER_RE.test(t) ? t
    : /^[+-]?\d*,\d+([eE][+-]?\d+)?$/.test(t) ? t.replace(",", ".") : null;
  return plain === null ? null : { n: Number(plain), digits: plain };
}

/** Whether `value` rounds to the number shown, at the digits shown. */
export function roundsTo(value: number, shown: string): boolean {
  const s = shownNumber(shown);
  if (!s) return false;
  const m = /^[+-]?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s.digits);
  if (!m) return false;
  const decimals = m[2]?.length ?? 0;
  const exp = m[3] ? Number(m[3]) : 0;
  const half = 0.5 * 10 ** (exp - decimals);
  // a hair of slack for the binary representation of both numbers
  return Math.abs(value - s.n) <= half * (1 + 1e-9) + Math.abs(value) * 1e-15;
}

/** Whether the stored value replaces the shown text: it rounds to the
 *  text, and the text is not already that number written plainly (a
 *  shown 2.5E-07 stays as typed; 0.12 for 0.123456, and 1,5, do not). */
function swaps(value: number, text: string): boolean {
  const t = text.trim();
  return roundsTo(value, t) && !(NUMBER_RE.test(t) && Number(t) === value);
}

export interface FullValues {
  app: SheetApp;
  /** The block to write: the stored number where one replaced the shown
   *  text, the text everywhere else. */
  block: string[][];
  /** Cells (relative to the block) whose shown text was a rounded form
   *  of the stored number. */
  rounded: { row: number; col: number }[];
}

export type FullValuesResult =
  | { kind: "none" }
  | { kind: "full"; full: FullValues }
  /** The HTML carried stored values but its table did not line up with
   *  the text: the text was used. */
  | { kind: "mismatch"; app: SheetApp };

const trimRow = (r: string[]) => {
  let n = r.length;
  while (n > 0 && r[n - 1].trim() === "") n--;
  return n;
};
const trimRows = (rows: string[][]) => {
  let n = rows.length;
  while (n > 0 && trimRow(rows[n - 1]) === 0) n--;
  return n;
};

/** The stored numbers of `grid` placed into the text block, cell for
 *  cell, or why not. A text cell takes the stored value only when it is
 *  a plain number (point or decimal comma) the value rounds to; then the
 *  block holds the shortest text that reads back as the same double. If
 *  any number-like cell is left with a comma or separator after that, no
 *  value is used (a block mixing 0.123456 and 1.234,5 would be read
 *  inconsistently), as when nothing would change. */
export function fullPrecision(textBlock: string[][], grid: HtmlGrid | null): FullValuesResult {
  if (!grid?.app) return { kind: "none" };
  const app = grid.app;
  // something to gain: a cell whose stored value would replace its text
  if (!grid.rows.some((r) => r.some((c) => c.value !== null && swaps(c.value, c.text)))) {
    return { kind: "none" };
  }
  const htmlText = grid.rows.map((r) => r.map((c) => c.text));
  const nRows = trimRows(textBlock);
  const lined = nRows === trimRows(htmlText)
    && textBlock.slice(0, nRows).every((r, i) => trimRow(r) === trimRow(htmlText[i])
      && r.slice(0, trimRow(r)).every((t, j) => cellText(t) === htmlText[i][j]));
  if (!lined) return { kind: "mismatch", app };
  const rounded: { row: number; col: number }[] = [];
  let used = 0;
  const block = textBlock.map((r, i) => r.map((t, j) => {
    const v = grid.rows[i]?.[j]?.value ?? null;
    if (v === null || !swaps(v, t)) return t;
    used++;
    if (Number(shownNumber(t)!.digits) !== v) rounded.push({ row: i, col: j });
    return String(v);
  }));
  if (!used || block.some((r) => r.some((t) => looksLikeLocaleNumber(t)))) return { kind: "none" };
  return { kind: "full", full: { app, block, rounded } };
}

/** A block back to clipboard text (tabs between cells, one line a row). */
export const blockText = (block: string[][]): string => block.map((r) => r.join("\t")).join("\n");
