// A small .xlsx reader for the e2e suites (P-64, P-65): sheet names in
// workbook order and each sheet's cells, a number for a number cell and a
// string for a text cell (shared or inline), null where empty. Enough to
// compare a workbook with the CSV export; scripts/xlsx-readback.py checks
// the same files with openpyxl, python-calamine and LibreOffice.
import { strFromU8, unzipSync } from "fflate";

const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");

const colIndex = (letters) => [...letters].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** { names: string[], sheets: { [name]: (string | number | null)[][] }, bold: { [name]: Set<row> } } */
export function readXlsx(bytes) {
  const z = unzipSync(bytes);
  const text = (k) => (z[k] ? strFromU8(z[k]) : "");
  const sst = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const rels = Object.fromEntries([...text("xl/_rels/workbook.xml.rels")
    .matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const names = [];
  const sheets = {};
  const bold = {};
  for (const m of text("xl/workbook.xml").matchAll(/<sheet name="([^"]*)"[^>]*r:id="([^"]+)"/g)) {
    const name = unesc(m[1]);
    names.push(name);
    const xml = text(`xl/${rels[m[2]].replace(/^\/?xl\//, "")}`);
    const rows = [];
    const b = new Set();
    for (const c of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = colIndex(c[1]);
      const r = Number(c[2]) - 1;
      const attrs = c[3];
      const body = c[4] ?? "";
      const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = null;
      if (t === "s") value = sst[Number(v)];
      else if (t === "inlineStr") value = unesc(/<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] ?? "");
      else if (t === "str") value = unesc(v ?? "");
      else if (v !== undefined) value = Number(v);
      while (rows.length <= r) rows.push([]);
      while (rows[r].length < col) rows[r].push(null);
      rows[r][col] = value;
      if (/\bs="1"/.test(attrs)) b.add(r);
    }
    sheets[name] = rows;
    bold[name] = b;
  }
  return { names, sheets, bold };
}

/** RFC 4180 CSV (as toDelimited writes it) -> rows of fields. */
export function parseCsv(text) {
  const src = text.replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let i = 0;
  while (i < src.length) {
    let field = "";
    if (src[i] === '"') {
      i++;
      while (i < src.length) {
        if (src[i] === '"' && src[i + 1] === '"') { field += '"'; i += 2; } else if (src[i] === '"') { i++; break; } else field += src[i++];
      }
    } else {
      while (i < src.length && src[i] !== "," && src[i] !== "\r" && src[i] !== "\n") field += src[i++];
    }
    row.push(field);
    if (src[i] === ",") { i++; continue; }
    if (src[i] === "\r") i++;
    if (src[i] === "\n") i++;
    rows.push(row);
    row = [];
  }
  return rows.map((r) => (r.length === 1 && r[0] === "" ? [] : r));
}
