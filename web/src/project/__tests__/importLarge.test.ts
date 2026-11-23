// The Import dialog's parse made fit for large pastes (P-10): splitDelimited
// slices fields instead of building them a character at a time, the source
// is parsed once (sourceMatrix) for the titles check and the preview, and
// the first lines are read without splitting the whole text. Each function
// must give exactly what it gave before: the versions from before the
// change are kept below as the reference, and compared on fixtures and on
// random text with quotes, blank lines, spaces, tabs, CR LF and a BOM.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FILTER, DEFAULT_SOURCE, detectDecimal, detectDelimiter, detectTitlesRow, detectTitlesRowIn,
  firstLines, LARGE_PASTE_CHARS, largePasteLines, normalizeNumber, pasteNeedsImport,
  prepareFromMatrix, prepareImport, sourceMatrix, splitDelimited, transpose,
  type DelimiterChar, type FilterOptions, type ImportPreview, type SourceOptions,
} from "../importText.ts";
import { maxOf } from "../../lib/extent.ts";

// ---------------------------------------------- the versions before P-10

function splitBefore(text: string, delim: DelimiterChar): string[][] {
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let wasQuoted = false;
  const endField = () => { row.push(field); field = ""; wasQuoted = false; };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field.trim() === "" && !wasQuoted) {
      quoted = true; wasQuoted = true; field = ""; continue;
    }
    if (ch === "\n") { endField(); rows.push(row); row = []; continue; }
    if (delim === " " ? ch === " " || ch === "\t" : ch === delim) {
      if (delim === " " && field === "" && !wasQuoted) {
        if (row.length === 0 || src[i - 1] === " " || src[i - 1] === "\t") continue;
      }
      endField();
      continue;
    }
    field += ch;
  }
  if (field !== "" || wasQuoted || row.length) { endField(); rows.push(row); }
  if (delim === " ") {
    for (const r of rows) while (r.length > 1 && r[r.length - 1] === "") r.pop();
  }
  return rows;
}

function detectDelimiterBefore(text: string): DelimiterChar {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim()).slice(0, 25);
  if (!lines.length) return "\t";
  const sample = lines.join("\n");
  let best: DelimiterChar = "\t";
  let bestScore = 0;
  for (const d of ["\t", ";", ",", " "] as DelimiterChar[]) {
    const counts = splitBefore(sample, d).map((r) => r.length);
    const freq = new Map<number, number>();
    for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1);
    let mode = 1;
    let modeN = 0;
    for (const [c, n] of freq) if (n > modeN || (n === modeN && c > mode)) { mode = c; modeN = n; }
    if (mode < 2) continue;
    const score = modeN / counts.length + (d === " " ? -0.2 : 0);
    if (score > bestScore + 1e-9) { best = d; bestScore = score; }
  }
  return best;
}

const DELIM: Record<string, DelimiterChar> = { tab: "\t", comma: ",", semicolon: ";", space: " " };

function prepareBefore(source: string | string[][], s: SourceOptions, f: FilterOptions): ImportPreview {
  let delimiter: DelimiterChar | null = null;
  let m: string[][];
  if (typeof source === "string") {
    const body = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n")
      .split("\n").slice(Math.max(0, s.skipLines)).join("\n");
    delimiter = s.delimiter === "auto" ? detectDelimiterBefore(body) : DELIM[s.delimiter];
    m = splitBefore(body, delimiter);
  } else {
    m = source.slice(Math.max(0, s.skipLines)).map((r) => r.map((c) => c ?? ""));
  }
  while (m.length && m[m.length - 1].every((c) => c.trim() === "")) m.pop();
  if (s.transpose) m = transpose(m);
  let titles: string[] | null = null;
  if (s.titlesRow && m.length) { titles = m[0].map((c) => c.trim()); m = m.slice(1); }
  const width = Math.max(0, maxOf(m.map((r) => r.length)), titles?.length ?? 0);
  const decimal = s.decimal === "auto" ? (delimiter === "," ? "." : detectDecimal(m)) : s.decimal;
  const c0 = Math.max(1, f.colFrom || 1);
  const c1 = Math.min(width, f.colTo ?? width);
  const columns: number[] = [];
  for (let c = c0; c <= c1; c++) columns.push(c);
  const r0 = Math.max(1, f.rowFrom || 1);
  const r1 = Math.min(m.length, f.rowTo ?? m.length);
  const k = Math.max(1, Math.floor(f.everyK || 1));
  const code = f.missingCode.trim();
  const cellAt = (src: string[], c: number) => {
    const raw = (src[c - 1] ?? "").trim();
    if (code && raw === code) return "";
    const star = raw.endsWith("*");
    const v = normalizeNumber(star ? raw.slice(0, -1) : raw, decimal);
    return star ? `${v}*` : v;
  };
  const rawAt = (src: string[], c: number) => (src[c - 1] ?? "").trim();
  const rows: string[][] = [];
  const raw: string[][] = [];
  const keptRows: string[][] = [];
  for (let r = r0; r <= r1; r++) {
    if ((r - r0) % k !== 0) continue;
    const src = m[r - 1];
    keptRows.push(src);
    rows.push(columns.map((c) => cellAt(src, c)));
    raw.push(columns.map((c) => rawAt(src, c)));
  }
  if (f.unstack && f.unstack.dataCol >= 1 && f.unstack.groupCol >= 1) {
    const by = new Map<string, string[]>();
    const byRaw = new Map<string, string[]>();
    for (const src of keptRows) {
      const id = cellAt(src, f.unstack.groupCol).replace(/\*$/, "");
      if (!id) continue;
      if (!by.has(id)) { by.set(id, []); byRaw.set(id, []); }
      by.get(id)!.push(cellAt(src, f.unstack.dataCol));
      byRaw.get(id)!.push(rawAt(src, f.unstack.dataCol));
    }
    const ids = [...by.keys()];
    if (ids.every((id) => Number.isFinite(Number(id)))) ids.sort((a, b) => Number(a) - Number(b));
    const height = Math.max(0, maxOf(ids.map((id) => by.get(id)!.length)));
    return {
      delimiter, decimal, titles: ids, columns: ids.map((_, i) => width + 1 + i),
      rows: Array.from({ length: height }, (_, r) => ids.map((id) => by.get(id)![r] ?? "")),
      raw: Array.from({ length: height }, (_, r) => ids.map((id) => byRaw.get(id)![r] ?? "")),
      totalRows: m.length, totalColumns: width,
    };
  }
  return {
    delimiter, decimal, titles: titles ? columns.map((c) => titles![c - 1] ?? "") : null,
    columns, rows, raw, totalRows: m.length, totalColumns: width,
  };
}

const isNumeric = (v: string) => {
  const s = v.trim().replace(/\*$/, "");
  return s !== "" && Number.isFinite(Number(s));
};

function titlesBefore(source: string | string[][], s: SourceOptions): boolean {
  const p = prepareBefore(source, { ...s, titlesRow: false }, DEFAULT_FILTER);
  if (p.rows.length < 2) return false;
  const body = p.rows.slice(1, 201);
  let textOverNumbers = 0;
  for (let c = 0; c < p.columns.length; c++) {
    const vals = body.map((r) => (r[c] ?? "").trim()).filter((v) => v !== "");
    if (!vals.length) continue;
    if (vals.filter(isNumeric).length / vals.length < 0.8) continue;
    const head = (p.rows[0][c] ?? "").trim();
    if (head === "") continue;
    if (isNumeric(head)) return false;
    textOverNumbers++;
  }
  return textOverNumbers > 0;
}

function needsImportBefore(text: string): boolean {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return false;
  if (lines.length >= 60) return true;
  if (lines.some((l) => l.includes("\t"))) return titlesBefore(text, DEFAULT_SOURCE);
  return lines.filter((l) => /[;,]/.test(l)).length >= Math.ceil(lines.length / 2);
}

// --------------------------------------------------------------- inputs

const FIXTURES = [
  "", "\n", "\n\n", "a", "1\t2\n3\t4\n", "ID,drug1,drug2\n1,0.7,1.9\n2,-1.6,0.8",
  "group\tvalue\nA\t1.2\nB\t3.4", "1,2,3\n4,5,6\n7,8,9", "Control\t5\t6\nTreated\t7\t8",
  "Exported from reader\nx,y\n1,2\n3,4", "﻿Dose;Response\r\n0,1;98,5\r\n1;50,2\r\n",
  '"a, b",2\n"say ""hi""",3\n" x" ,4', 'x "y",1\n"",2\n"open\nline",3', "  1   2  3\n\t4 5\t\t6  \n",
  "1.234,5;2\n1.000;3", "12.5*,NA\n99,3*\n,,\n", "a\rb\n1\r2", '"unterminated,1\n2,3',
  "x\ty\n" + Array.from({ length: 300 }, (_, i) => `${i}\t${i * 0.5}`).join("\n"),
];

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const ALPHABET = ["1", "2", "7", ".", ",", ";", "\t", " ", '"', "\n", "\r", "\r\n", "a", "-", "*", "e", "NA", "﻿"];
const randomText = () => Array.from({ length: Math.floor(rnd() * 70) }, () => pick(ALPHABET)).join("");
const randomSource = (): SourceOptions => ({
  delimiter: pick(["auto", "auto", "tab", "comma", "semicolon", "space"] as const),
  decimal: pick(["auto", ".", ","] as const),
  skipLines: pick([0, 0, 1, 2, 5]),
  transpose: rnd() < 0.2,
  titlesRow: rnd() < 0.4,
});
const randomFilter = (): FilterOptions => ({
  rowFrom: pick([0, 1, 2]), rowTo: pick([null, null, 3]), everyK: pick([1, 1, 2]),
  colFrom: pick([1, 1, 2]), colTo: pick([null, null, 2]), missingCode: pick(["", "", "NA", "7"]),
  skipBlankX: false, asteriskExcluded: true,
  unstack: rnd() < 0.15 ? { dataCol: 2, groupCol: 1 } : null,
});
const TEXTS = [...FIXTURES, ...Array.from({ length: 2500 }, randomText)];

// ----------------------------------------------------------------- tests

test("splitDelimited gives the same fields as before, for every delimiter", () => {
  for (const t of TEXTS) {
    for (const d of ["\t", ",", ";", " "] as DelimiterChar[]) {
      assert.deepEqual(splitDelimited(t, d), splitBefore(t, d), JSON.stringify([t, d]));
    }
  }
});

test("detectDelimiter, firstLines and pasteNeedsImport read only the first lines, with the same answer", () => {
  for (const t of TEXTS) {
    assert.equal(detectDelimiter(t), detectDelimiterBefore(t), JSON.stringify(t));
    assert.equal(pasteNeedsImport(t), needsImportBefore(t), JSON.stringify(t));
    assert.deepEqual(firstLines(t, 25), t.replace(/\r/g, "").split("\n").filter((l) => l.trim()).slice(0, 25));
  }
  const many = Array.from({ length: 1000 }, (_, i) => `${i}\t${i}`).join("\n");
  assert.equal(pasteNeedsImport(many), true);
  assert.equal(needsImportBefore(many), true);
});

test("prepareImport and the titles check give the same preview as before", () => {
  for (const t of TEXTS) {
    const s = randomSource();
    const f = randomFilter();
    assert.deepEqual(prepareImport(t, s, f), prepareBefore(t, s, f), JSON.stringify([t, s, f]));
    assert.equal(detectTitlesRow(t, s), titlesBefore(t, s), JSON.stringify([t, s]));
  }
  // a spreadsheet matrix (strings and missing cells)
  const sheet = [["x", "y"], ["1", "2"], ["3", null as unknown as string], [" 4 ", "5*"]];
  for (const skipLines of [0, 1]) {
    for (const titlesRow of [false, true]) {
      const s = { ...DEFAULT_SOURCE, skipLines, titlesRow };
      assert.deepEqual(prepareImport(sheet, s, DEFAULT_FILTER), prepareBefore(sheet, s, DEFAULT_FILTER));
      assert.equal(detectTitlesRow(sheet, s), titlesBefore(sheet, s));
    }
  }
});

test("one parse serves the titles check and every preview setting", () => {
  const text = "dose\tresp\n" + Array.from({ length: 500 }, (_, i) => `${i}\t${(i * 0.37).toFixed(2)}`).join("\n");
  const sm = sourceMatrix(text, DEFAULT_SOURCE);
  const before = JSON.stringify(sm.m);
  assert.equal(detectTitlesRowIn(sm, DEFAULT_SOURCE), true);
  for (const s of [{ ...DEFAULT_SOURCE, titlesRow: true }, { ...DEFAULT_SOURCE, transpose: true }]) {
    for (const f of [DEFAULT_FILTER, { ...DEFAULT_FILTER, everyK: 3, rowTo: 90 }]) {
      assert.deepEqual(prepareFromMatrix(sm, s, f), prepareBefore(text, s, f));
    }
  }
  assert.equal(JSON.stringify(sm.m), before, "the shared parse is never changed");
  // a row stored as typed shares its array with the raw cells
  const p = prepareFromMatrix(sm, { ...DEFAULT_SOURCE, titlesRow: true }, DEFAULT_FILTER);
  assert.equal(p.raw![0], p.rows[0]);
  const q = prepareImport("1,5;2*\n3;4", { ...DEFAULT_SOURCE, decimal: "," }, DEFAULT_FILTER);
  assert.deepEqual(q.rows[0], ["1.5", "2*"]);
  assert.deepEqual(q.raw![0], ["1,5", "2*"]);
  assert.notEqual(q.raw![0], q.rows[0]);
});

test("a paste too long for the text box is counted in lines", () => {
  assert.equal(largePasteLines("1\t2\n3\t4"), null);
  assert.equal(largePasteLines("x".repeat(LARGE_PASTE_CHARS)), null);
  const rows = Array.from({ length: 30000 }, (_, i) => `${i}\t${i / 7}`);
  assert.ok(rows.join("\n").length > LARGE_PASTE_CHARS);
  assert.equal(largePasteLines(rows.join("\n")), 30000);
  assert.equal(largePasteLines(`${rows.join("\n")}\n`), 30000);
  assert.equal(largePasteLines(`${rows.join("\r\n")}\r\n`), 30000);
});

test("500,000 pasted rows parse into the preview in seconds", () => {
  let s = 11;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const text = Array.from({ length: 500000 }, (_, i) => `${(i / 1000).toFixed(3)}\t${(2 + r()).toFixed(3)}`).join("\n");
  const t0 = Date.now();
  const sm = sourceMatrix(text, DEFAULT_SOURCE);
  const titled = detectTitlesRowIn(sm, DEFAULT_SOURCE);
  const p = prepareFromMatrix(sm, { ...DEFAULT_SOURCE, titlesRow: titled }, DEFAULT_FILTER);
  assert.equal(titled, false);
  assert.equal(p.rows.length, 500000);
  assert.deepEqual(p.rows[499999], ["499.999", text.slice(text.lastIndexOf("\t") + 1)]);
  assert.ok(Date.now() - t0 < 20000, `${Date.now() - t0} ms`);
});
