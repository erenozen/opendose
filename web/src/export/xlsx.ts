// Excel workbooks (.xlsx) written by hand: the SpreadsheetML parts of a
// minimal workbook (workbook, sheets, shared strings, two cell styles),
// zipped with fflate, the way export/pptx.ts writes PowerPoint. Numbers
// go in as numbers (a cell Excel right-aligns and sums), text as shared
// strings. Pure. Reference: ECMA-376 Part 1, section 18 (SpreadsheetML);
// sheet-name rules and size limits from Microsoft's "Excel specifications
// and limits" and "Rename a worksheet" pages.
import { zipSync, strToU8 } from "fflate";

export type XlsxCell = string | number | null;

export interface XlsxSheet {
  /** A valid, unique sheet name (see `sheetNames`). */
  name: string;
  rows: XlsxCell[][];
  /** Rows (0-based) written bold: titles and headings. */
  bold?: number[];
}

/** Excel's limits (Excel specifications and limits). */
export const MAX_ROWS = 1048576;
export const MAX_COLS = 16384;
export const MAX_NAME = 31;
export const MAX_TEXT = 32767;
/** Excel stores no number smaller in magnitude than this (no subnormals). */
const MIN_NORMAL = 2.2250738585072014e-308;

// ------------------------------------------------------------ cells

/** A plain decimal number as CSV writes it: "-1.5", "0.25", "1e-9",
 *  "2.5E+21". Leading zeros ("007"), thousands separators, "1.",
 *  "NaN", "Infinity", "<0.0001" and anything else stay text. */
const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d+)?$/;

/**
 * A CSV field as a workbook cell: a number when the text is a plain
 * decimal number Excel can hold exactly as the text reads it (the same
 * double a CSV reader gets), else the text itself; "" is an empty cell.
 * Overflow ("1e400") and values below Excel's smallest normal number
 * ("1e-310", or "1e-400", which would read as 0) stay text, so no value
 * changes silently.
 */
export function numericCell(text: string): XlsxCell {
  if (text === "") return null;
  if (!NUMBER.test(text)) return text;
  const n = Number(text);
  if (!Number.isFinite(n)) return text;
  if (n !== 0 && Math.abs(n) < MIN_NORMAL) return text;
  if (n === 0 && /[1-9]/.test(text.replace(/[eE].*$/, ""))) return text;
  return n;
}

/** Column letters: 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** The number as `<v>` text: the shortest string that reads back as the
 *  same double ("0.3333333333333333", "1e-300", "1e+21"); -0 keeps its sign. */
export function numberText(n: number): string {
  return Object.is(n, -0) ? "-0" : String(n);
}

// ------------------------------------------------------------ sheet names

export interface SheetName {
  /** The name in the workbook. */
  name: string;
  /** The name asked for. */
  from: string;
  /** Why it changed (null: unchanged). */
  why: string | null;
}

// eslint-disable-next-line no-control-regex
const NAME_BAD = /[[\]:*?/\\\u0000-\u001F]/g;

/** Cut to `max` UTF-16 units without splitting a surrogate pair. */
function cut(s: string, max: number): string {
  if (s.length <= max) return s;
  let out = s.slice(0, max);
  if (/[\uD800-\uDBFF]$/.test(out)) out = out.slice(0, -1);
  return out;
}

/**
 * Valid, unique sheet names for the given names, in order: characters
 * Excel refuses ([ ] : * ? / \) become "_", a leading or trailing
 * apostrophe goes, names are cut to 31 characters, "History" (reserved)
 * and repeats (compared without case, as Excel does) get " (2)", " (3)".
 * Each result says why it changed, for the README sheet and the toast.
 */
export function sheetNames(names: string[], reserved: string[] = []): SheetName[] {
  const used = new Set(["history", ...reserved.map((r) => r.toLowerCase())]);
  return names.map((from) => {
    const why: string[] = [];
    let s = from.replace(NAME_BAD, "_");
    if (s !== from) why.push("Excel does not allow [ ] : * ? / \\ in a sheet name");
    const t = s.trim().replace(/^'+|'+$/g, "").trim();
    if (t !== s && /^\s*'|'\s*$/.test(s)) why.push("a sheet name cannot start or end with an apostrophe");
    s = t || "Sheet";
    if (!t) why.push("a sheet name cannot be blank");
    if (s.length > MAX_NAME) why.push(`longer than ${MAX_NAME} characters`);
    let name = cut(s, MAX_NAME).trimEnd();
    if (used.has(name.toLowerCase())) {
      why.push(name.toLowerCase() === "history" ? "Excel reserves the name “History”"
        : "another sheet has this name");
      for (let k = 2; ; k++) {
        const tag = ` (${k})`;
        const c = cut(s, MAX_NAME - tag.length).trimEnd() + tag;
        if (!used.has(c.toLowerCase())) { name = c; break; }
      }
    }
    used.add(name.toLowerCase());
    return { name, from, why: why.length ? why.join("; ") : null };
  });
}

// ------------------------------------------------------------ limits

/** Why the sheets do not fit in Excel (null: they do). */
export function overLimits(sheets: { name: string; rows: XlsxCell[][] }[]): string | null {
  for (const s of sheets) {
    if (s.rows.length > MAX_ROWS) {
      return `“${s.name}” has ${s.rows.length.toLocaleString("en")} rows; an Excel worksheet holds ${MAX_ROWS.toLocaleString("en")}`;
    }
    const cols = Math.max(0, ...s.rows.map((r) => r.length));
    if (cols > MAX_COLS) {
      return `“${s.name}” has ${cols.toLocaleString("en")} columns; an Excel worksheet holds ${MAX_COLS.toLocaleString("en")}`;
    }
  }
  return null;
}

// ------------------------------------------------------------ XML

// eslint-disable-next-line no-control-regex
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function xmlText(s: string): string {
  return s.replace(XML_INVALID, "").replace(/[<>&"]/g, (c) => (
    { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
}

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT = "application/vnd.openxmlformats-officedocument";

function contentTypes(n: number): string {
  const sheets = Array.from({ length: n }, (_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT}.spreadsheetml.worksheet+xml"/>`).join("");
  return `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + `<Override PartName="/xl/workbook.xml" ContentType="${CT}.spreadsheetml.sheet.main+xml"/>`
    + sheets
    + `<Override PartName="/xl/sharedStrings.xml" ContentType="${CT}.spreadsheetml.sharedStrings+xml"/>`
    + `<Override PartName="/xl/styles.xml" ContentType="${CT}.spreadsheetml.styles+xml"/>`
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + `<Override PartName="/docProps/app.xml" ContentType="${CT}.extended-properties+xml"/>`
    + "</Types>";
}

const ROOT_RELS = `${HEAD}<Relationships xmlns="${PKG_REL}">`
  + `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>`
  + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
  + `<Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/>`
  + "</Relationships>";

/** Two cell formats: 0 plain, 1 bold. "General" shows up to 11 digits;
 *  the cell holds the full value. */
const STYLES = `${HEAD}<styleSheet xmlns="${MAIN}">`
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'
  + '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + "</styleSheet>";

function workbookXml(names: string[]): string {
  return `${HEAD}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>`
    + names.map((n, i) => `<sheet name="${xmlText(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")
    + "</sheets></workbook>";
}

function workbookRels(n: number): string {
  const rels = Array.from({ length: n }, (_, i) =>
    `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`);
  rels.push(`<Relationship Id="rId${n + 1}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>`);
  rels.push(`<Relationship Id="rId${n + 2}" Type="${REL}/styles" Target="styles.xml"/>`);
  return `${HEAD}<Relationships xmlns="${PKG_REL}">${rels.join("")}</Relationships>`;
}

function coreXml(title: string, created: string): string {
  return `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" `
    + 'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
    + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + `<dc:title>${xmlText(title)}</dc:title><dc:creator>OpenDose</dc:creator>`
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${xmlText(created)}</dcterms:created>`
    + "</cp:coreProperties>";
}

const APP_XML = `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">`
  + "<Application>OpenDose</Application></Properties>";

/** Column widths in characters from the longest value (8 to 60). */
function widths(rows: XlsxCell[][]): number[] {
  const w: number[] = [];
  for (const r of rows) {
    r.forEach((c, i) => {
      if (c === null) return;
      const len = typeof c === "number" ? numberText(c).length : Math.min(60, c.length);
      // a long heading alone in its row does not widen its column
      if (typeof c === "string" && r.length === 1 && len > 20) return;
      w[i] = Math.max(w[i] ?? 0, len);
    });
  }
  return Array.from({ length: w.length }, (_, i) => Math.min(60, Math.max(8, (w[i] ?? 0) + 2)));
}

function sheetXml(s: XlsxSheet, str: (t: string) => number): string {
  const bold = new Set(s.bold ?? []);
  const cols = Math.max(1, ...s.rows.map((r) => r.length));
  const ref = s.rows.length ? `A1:${colName(cols - 1)}${s.rows.length}` : "A1";
  const out: string[] = [];
  s.rows.forEach((r, ri) => {
    const cells: string[] = [];
    const st = bold.has(ri) ? ' s="1"' : "";
    r.forEach((c, ci) => {
      if (c === null || c === "") return;
      const at = `${colName(ci)}${ri + 1}`;
      if (typeof c === "number") {
        if (Number.isFinite(c)) cells.push(`<c r="${at}"${st}><v>${numberText(c)}</v></c>`);
        else cells.push(`<c r="${at}"${st} t="s"><v>${str(String(c))}</v></c>`);
      } else {
        cells.push(`<c r="${at}"${st} t="s"><v>${str(c)}</v></c>`);
      }
    });
    if (cells.length) out.push(`<row r="${ri + 1}">${cells.join("")}</row>`);
  });
  const w = widths(s.rows);
  const colXml = w.length
    ? `<cols>${w.map((x, i) => `<col min="${i + 1}" max="${i + 1}" width="${x}" customWidth="1"/>`).join("")}</cols>`
    : "";
  return `${HEAD}<worksheet xmlns="${MAIN}" xmlns:r="${REL}"><dimension ref="${ref}"/>`
    + `${colXml}<sheetData>${out.join("")}</sheetData></worksheet>`;
}

/**
 * The workbook as .xlsx bytes. Sheet names must already be valid and
 * unique (`sheetNames`); throws when a sheet is over Excel's limits
 * (`overLimits`) or there is no sheet. Text longer than 32,767
 * characters (Excel's cell limit) is cut, ending in "…".
 */
export function writeXlsx(sheets: XlsxSheet[], meta: { title?: string; created?: string } = {}): Uint8Array {
  if (!sheets.length) throw new Error("a workbook needs at least one sheet");
  const over = overLimits(sheets);
  if (over) throw new Error(over);
  const strings: string[] = [];
  const index = new Map<string, number>();
  const str = (t: string) => {
    const v = t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT - 1)}…` : t;
    let i = index.get(v);
    if (i === undefined) { i = strings.length; strings.push(v); index.set(v, i); }
    return i;
  };
  const parts: Record<string, Uint8Array> = {};
  sheets.forEach((s, i) => { parts[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s, str)); });
  const sst = `${HEAD}<sst xmlns="${MAIN}" count="${strings.length}" uniqueCount="${strings.length}">`
    + strings.map((t) => `<si><t xml:space="preserve">${xmlText(t)}</t></si>`).join("") + "</sst>";
  const all: Record<string, [Uint8Array, { level: 6 }]> = {};
  const put = (k: string, v: Uint8Array | string) => {
    all[k] = [typeof v === "string" ? strToU8(v) : v, { level: 6 }];
  };
  put("[Content_Types].xml", contentTypes(sheets.length));
  put("_rels/.rels", ROOT_RELS);
  put("docProps/core.xml", coreXml(meta.title ?? "", meta.created ?? new Date().toISOString().replace(/\.\d+Z$/, "Z")));
  put("docProps/app.xml", APP_XML);
  put("xl/workbook.xml", workbookXml(sheets.map((s) => s.name)));
  put("xl/_rels/workbook.xml.rels", workbookRels(sheets.length));
  put("xl/styles.xml", STYLES);
  put("xl/sharedStrings.xml", sst);
  for (const [k, v] of Object.entries(parts)) put(k, v);
  return zipSync(all);
}

/** The .xlsx MIME type. */
export const XLSX_MIME = `${CT}.spreadsheetml.sheet`;
