// What an .xlsx reader that reads cached values cannot see (P-06):
// formula cells saved without a value (openpyxl and some exporters write
// formulas and no result; they read as blank) and rows hidden in Excel,
// by an AutoFilter or by hand. Read straight from the sheet XML (ECMA-376
// Part 1, 18.3.1.73 row@hidden, 18.3.1.4 c, 18.3.1.40 f, 18.3.1.96 v,
// 18.3.1.2 autoFilter, 18.5.1.2 table), so a large workbook is never loaded
// into openpyxl's normal mode. Pure: unit-tested in
// lib/__tests__/xlsxFlags.test.ts.
//
// A hidden row inside an AutoFilter range (the sheet's, or an Excel
// table's) below its header row counts as hidden by the filter; any other
// hidden row as hidden by hand. The XML does not say why a row inside a
// filtered range is hidden; Excel itself treats every hidden row there as
// filtered out when it copies the range.
import { unzipSync } from "fflate";

export interface SheetFlags {
  /** Rows hidden inside an AutoFilter range (1-based sheet rows). */
  filterHidden: number[];
  /** Other hidden rows (1-based sheet rows). */
  manualHidden: number[];
  /** Formula cells with no saved value (A1 addresses, in sheet order). */
  blankFormulas: string[];
}

const ATTR = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
const TAG = /<(\/?)([\w:.-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;

/** XML character references and the five named entities. */
export function xmlText(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const l = e.toLowerCase();
    if (l === "amp") return "&";
    if (l === "lt") return "<";
    if (l === "gt") return ">";
    if (l === "quot") return "\"";
    if (l === "apos") return "'";
    return String.fromCodePoint(l.startsWith("#x") ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10));
  });
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(ATTR)) out[localName(m[1])] = xmlText(m[3] ?? m[4] ?? "");
  return out;
}
/** Element and attribute names without a namespace prefix (x:row → row). */
const localName = (n: string) => n.slice(n.lastIndexOf(":") + 1);

/** "B12" → [12, 2]; "AB3" → [3, 28]. */
export function cellRef(ref: string): [number, number] | null {
  const m = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(ref.trim());
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return [Number(m[2]), col];
}
export function columnLetters(col: number): string {
  let s = "";
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
/** The rows an A1 range spans ("A1:C10" → [1, 10]). */
export function rangeRows(ref: string): [number, number] | null {
  const [a, b = a] = ref.split(":");
  const p = cellRef(a);
  const q = cellRef(b);
  if (!p || !q) {
    // whole rows ("1:10") or whole columns ("A:C", every row)
    const rows = /^\$?(\d+):\$?(\d+)$/.exec(ref.trim());
    return rows ? [Number(rows[1]), Number(rows[2])] : null;
  }
  return [Math.min(p[0], q[0]), Math.max(p[0], q[0])];
}

/** Scan one worksheet's XML. `filterRefs`: AutoFilter ranges from the
 *  sheet's tables, added to its own autoFilter. */
export function scanSheet(xml: string, filterRefs: string[] = []): SheetFlags {
  const hidden: number[] = [];
  const blankFormulas: string[] = [];
  const filters = [...filterRefs];
  let row = 0;
  let col = 0;
  let cell: { ref: string; t: string; f: boolean; v: boolean; vText: string } | null = null;
  let vStart = -1;
  let inSheetData = false;
  for (const m of xml.matchAll(TAG)) {
    const close = m[1] === "/";
    const name = localName(m[2]);
    const selfClose = m[4] === "/";
    if (name === "sheetData") { inSheetData = !close && !selfClose; continue; }
    if (name === "autoFilter" && !close) {
      const ref = attrs(m[3]).ref;
      if (ref) filters.push(ref);
      continue;
    }
    if (!inSheetData) continue;
    if (name === "row" && !close) {
      const a = attrs(m[3]);
      row = a.r ? Number(a.r) : row + 1;
      col = 0;
      if (a.hidden === "1" || a.hidden === "true") hidden.push(row);
    } else if (name === "c") {
      if (!close) {
        const a = attrs(m[3]);
        const pos = a.r ? cellRef(a.r) : null;
        col = pos ? pos[1] : col + 1;
        cell = { ref: a.r ?? `${columnLetters(col)}${row}`, t: a.t ?? "n", f: false, v: false, vText: "" };
      }
      if ((close || selfClose) && cell) {
        // A formula with no <v>, or an empty one (a cached "" is written
        // as t="str" with an empty <v>): no value was saved.
        if (cell.f && (!cell.v || (cell.vText.trim() === "" && cell.t !== "str"))) blankFormulas.push(cell.ref);
        cell = null;
      }
    } else if (name === "f" && cell && !close) {
      cell.f = true;
    } else if (name === "v" && cell) {
      if (!close) {
        cell.v = true;
        vStart = selfClose ? -1 : (m.index ?? 0) + m[0].length;
      } else if (vStart >= 0) {
        cell.vText = xml.slice(vStart, m.index);
        vStart = -1;
      }
    }
  }
  const spans = filters.map(rangeRows).filter((r): r is [number, number] => !!r);
  const inFilter = (r: number) => spans.some(([a, b]) => r > a && r <= b);
  return {
    filterHidden: hidden.filter(inFilter),
    manualHidden: hidden.filter((r) => !inFilter(r)),
    blankFormulas,
  };
}

const dec = new TextDecoder("utf-8");
/** A part path from a relationship target, relative to the part that
 *  holds the relationship (or absolute from the package root). */
function resolve(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}
function rels(files: Record<string, Uint8Array>, part: string): Map<string, { type: string; target: string }> {
  const dir = part.split("/").slice(0, -1).join("/");
  const name = part.split("/").pop();
  const relPath = `${dir ? `${dir}/` : ""}_rels/${name}.rels`;
  const out = new Map<string, { type: string; target: string }>();
  const bytes = files[relPath];
  if (!bytes) return out;
  for (const m of dec.decode(bytes).matchAll(TAG)) {
    if (localName(m[2]) !== "Relationship" || m[1] === "/") continue;
    const a = attrs(m[3]);
    if (a.Id && a.Target && a.TargetMode !== "External") {
      out.set(a.Id, { type: a.Type ?? "", target: resolve(part, a.Target) });
    }
  }
  return out;
}

/** Every worksheet's flags, by sheet name. */
export function xlsxFlags(bytes: Uint8Array): Map<string, SheetFlags> {
  const files = unzipSync(bytes, {
    filter: (f) => /\.(xml|rels)$/i.test(f.name) && !/(sharedStrings|styles|theme|drawing|chart)/i.test(f.name),
  });
  const out = new Map<string, SheetFlags>();
  const root = rels(files, "");
  const wbPart = [...root.values()].find((r) => /officeDocument$/.test(r.type))?.target ?? "xl/workbook.xml";
  const wb = files[wbPart];
  if (!wb) return out;
  const wbRels = rels(files, wbPart);
  for (const m of dec.decode(wb).matchAll(TAG)) {
    if (localName(m[2]) !== "sheet" || m[1] === "/") continue;
    const a = attrs(m[3]);
    const rel = a.id ? wbRels.get(a.id) : undefined;
    if (!a.name || !rel || !/worksheet$/.test(rel.type) || !files[rel.target]) continue;
    // AutoFilters of the sheet's Excel tables
    const tables: string[] = [];
    for (const t of rels(files, rel.target).values()) {
      if (!/\/table$/.test(t.type) || !files[t.target]) continue;
      for (const tm of dec.decode(files[t.target]).matchAll(TAG)) {
        if (localName(tm[2]) === "autoFilter" && tm[1] !== "/") {
          const ref = attrs(tm[3]).ref;
          if (ref) tables.push(ref);
        }
      }
    }
    out.set(a.name, scanSheet(dec.decode(files[rel.target]), tables));
  }
  return out;
}

/** A sheet's rows without the hidden rows the import leaves out: by
 *  default the rows a filter hides (copying the filtered range in Excel
 *  leaves them out) and none of the rows hidden by hand (a copy keeps
 *  them). */
export function visibleRows(sheet: { rows: string[][]; flags?: SheetFlags | null },
  keepFiltered: boolean, skipHidden: boolean): string[][] {
  const f = sheet.flags;
  if (!f) return sheet.rows;
  const drop = new Set([...(keepFiltered ? [] : f.filterHidden), ...(skipHidden ? f.manualHidden : [])]);
  return drop.size ? sheet.rows.filter((_, i) => !drop.has(i)) : sheet.rows;
}
