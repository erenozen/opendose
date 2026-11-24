// Excel writer (P-64): cell typing at full precision, sheet-name rules,
// limits, the package parts, and the project workbook equal to the CSV
// export. Independent readers (openpyxl, python-calamine, LibreOffice)
// check the same files in scripts/xlsx-readback.py. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import {
  colName, MAX_ROWS, numberText, numericCell, overLimits, sheetNames, writeXlsx, xmlText,
} from "../xlsx.ts";
import { projectWorkbook, renamedPhrase, resultCells, tableCells } from "../workbook.ts";
import { normalizeTable, toggleExcluded } from "../../project/table.ts";
import { DEFAULT_EXPORT, tableMatrix } from "../../project/exportTable.ts";

/** A minimal reader for what writeXlsx writes: sheet name -> rows of
 *  cells (numbers parsed from <v>, shared strings resolved). */
function readBack(bytes: Uint8Array): Map<string, (string | number | null)[][]> {
  const z = unzipSync(bytes);
  const text = (k: string) => strFromU8(z[k]);
  const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
  const sst = [...text("xl/sharedStrings.xml").matchAll(/<si><t xml:space="preserve">([\s\S]*?)<\/t><\/si>/g)]
    .map((m) => unesc(m[1]));
  const names = [...text("xl/workbook.xml").matchAll(/<sheet name="([^"]*)"/g)].map((m) => unesc(m[1]));
  const out = new Map<string, (string | number | null)[][]>();
  names.forEach((n, i) => {
    const rows: (string | number | null)[][] = [];
    for (const m of text(`xl/worksheets/sheet${i + 1}.xml`).matchAll(/<c r="([A-Z]+)(\d+)"[^>]*?( t="s")?><v>([^<]*)<\/v><\/c>/g)) {
      const col = [...m[1]].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const r = Number(m[2]) - 1;
      while (rows.length <= r) rows.push([]);
      while (rows[r].length < col) rows[r].push(null);
      rows[r][col] = m[3] ? sst[Number(m[4])] : Number(m[4]);
    }
    out.set(n, rows);
  });
  return out;
}

test("numericCell: plain decimal numbers become numbers at full precision", () => {
  assert.equal(numericCell("0.3333333333333333"), 1 / 3);
  assert.equal(numericCell("0.333333333333333314829616256247"), 1 / 3);
  assert.equal(numericCell("1e-300"), 1e-300);
  assert.equal(numericCell("1e21"), 1e21);
  assert.equal(numericCell("2.5E+21"), 2.5e21);
  assert.equal(numericCell("-1.5"), -1.5);
  assert.ok(Object.is(numericCell("-0"), -0));
  assert.equal(numericCell("0"), 0);
  assert.equal(numericCell(""), null);
  // text stays text: no value may change on the way into Excel
  for (const s of ["NaN", "Infinity", "-Infinity", "007", "1.", ".5", "1,234", "<0.0001", "12.5*",
    "1e400", "1e-310", "1e-400", " 1", "0x10", "+1", "—", "1.2 to 3.4"]) {
    assert.equal(numericCell(s), s, s);
  }
});

test("numberText is the shortest text that reads back as the same double", () => {
  for (const v of [1 / 3, 1e-300, 1e21, 0.1 + 0.2, -2.2250738585072014e-308, 123456789012345680000,
    Number.MAX_VALUE, 5e-324 * 2 ** 52]) {
    assert.equal(Number(numberText(v)), v);
  }
  assert.equal(numberText(-0), "-0");
  assert.equal(numberText(1e21), "1e+21");
});

test("colName: A, Z, AA, XFD", () => {
  assert.deepEqual([0, 25, 26, 51, 52, 701, 702, 16383].map(colName),
    ["A", "Z", "AA", "AZ", "BA", "ZZ", "AAA", "XFD"]);
});

test("sheetNames: 31 characters, no [ ] : * ? / \\, unique without case, History reserved", () => {
  const long = "Nonlin fit of Dose response of compound 7 in HeLa cells";
  const out = sheetNames([long, "a/b: [c]?", "Data 1", "data 1", "'quoted'", "", "History", long, "README"],
    ["README"]);
  assert.equal(out[0].name, long.slice(0, 31).trimEnd());
  assert.match(out[0].why!, /longer than 31 characters/);
  assert.equal(out[1].name, "a_b_ _c__");
  assert.match(out[1].why!, /does not allow/);
  assert.equal(out[2].name, "Data 1");
  assert.equal(out[2].why, null);
  assert.equal(out[3].name, "data 1 (2)");
  assert.match(out[3].why!, /another sheet has this name/);
  assert.equal(out[4].name, "quoted");
  assert.match(out[4].why!, /apostrophe/);
  assert.equal(out[5].name, "Sheet");
  assert.equal(out[6].name, "History (2)");
  assert.match(out[6].why!, /reserves/);
  assert.equal(out[7].name, `${long.slice(0, 27).trimEnd()} (2)`);
  assert.equal(out[8].name, "README (2)");
  for (const n of out) assert.ok(n.name.length <= 31 && !/[[\]:*?/\\]/.test(n.name), n.name);
  assert.equal(new Set(out.map((n) => n.name.toLowerCase())).size, out.length);
  // a surrogate pair is never split at the cut
  const emoji = sheetNames(["a".repeat(30) + "😀b"])[0].name;
  assert.equal(emoji, "a".repeat(30));
});

test("limits: rows over 1,048,576 and columns over 16,384 are refused with the sheet named", () => {
  assert.equal(overLimits([{ name: "A", rows: [[1]] }]), null);
  const tall = { name: "Tall", rows: { length: MAX_ROWS + 1 } as unknown as number[][] };
  assert.match(overLimits([tall])!, /“Tall” has 1,048,577 rows; an Excel worksheet holds 1,048,576/);
  assert.match(overLimits([{ name: "Wide", rows: [new Array(16385).fill(1)] }])!, /16,385 columns/);
  assert.throws(() => writeXlsx([]), /at least one sheet/);
});

test("writeXlsx: parts, content types, bold rows, escaped text and numbers as <v>", () => {
  const bytes = writeXlsx([
    { name: "A & B", rows: [["x", "y <1>"], [1 / 3, 1e-300], [null, -0], ["=SUM(A1)", 1e21]], bold: [0] },
    { name: "Empty", rows: [] },
  ], { title: "T", created: "2026-11-24T10:00:00Z" });
  const z = unzipSync(bytes);
  for (const k of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels",
    "xl/styles.xml", "xl/sharedStrings.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml",
    "docProps/core.xml", "docProps/app.xml"]) assert.ok(z[k], k);
  const s1 = strFromU8(z["xl/worksheets/sheet1.xml"]);
  assert.match(s1, /<c r="A2"><v>0.3333333333333333<\/v><\/c>/);
  assert.match(s1, /<c r="B2"><v>1e-300<\/v><\/c>/);
  assert.match(s1, /<c r="B3"><v>-0<\/v><\/c>/);
  assert.match(s1, /<c r="B4"><v>1e\+21<\/v><\/c>/);
  assert.match(s1, /<c r="A1" s="1" t="s">/);
  assert.doesNotMatch(s1, /r="A3"/); // a blank cell is not written
  assert.doesNotMatch(s1, /<f>/);    // text that looks like a formula stays text
  assert.match(strFromU8(z["xl/workbook.xml"]), /<sheet name="A &amp; B"/);
  assert.match(strFromU8(z["[Content_Types].xml"]), /sheet2.xml/);
  const back = readBack(bytes);
  assert.deepEqual(back.get("A & B"), [["x", "y <1>"], [1 / 3, 1e-300], [null, -0], ["=SUM(A1)", 1e21]]);
  assert.deepEqual(back.get("Empty"), []);
  assert.equal(xmlText("a\u0001b<"), "ab&lt;");
});

function table() {
  let t = normalizeTable({
    type: "column", x: ["", "", ""], rowTitles: ["2019", "Mouse 7", ""],
    datasets: [
      { name: "Control", rows: [["0.333333333333333314829616256247"], ["1e-300"], ["-0"]] },
      { name: "1e21", rows: [["1e21"], [""], ["NaN"]] },
    ],
  });
  t = toggleExcluded(t, { kind: "y", dataset: 0, row: 1, sub: 0 });
  return t;
}

test("tableCells: every CSV field, numbers as numbers, titles and row titles as text", () => {
  const t = { ...table(), type: "grouped" as const };
  const csv = tableMatrix(t, DEFAULT_EXPORT);
  const { rows, titleRows } = tableCells(t);
  assert.equal(titleRows, 1);
  assert.deepEqual(rows[0], ["Row title", "Control", "1e21"]); // a title is text even when numeric
  assert.equal(rows[1][0], "2019");
  assert.equal(rows[1][1], 1 / 3);
  assert.equal(rows[2][1], "1e-300*"); // excluded: text, as in the CSV, so sums leave it out
  assert.ok(Object.is(rows[3][1], -0));
  assert.equal(rows[1][2], 1e21);
  assert.equal(rows[3][2], "NaN");
  assert.equal(rows[2][2], null);
  // every value equals the CSV export
  csv.forEach((r, i) => r.forEach((v, j) => {
    const c = rows[i][j];
    if (typeof c === "number") assert.equal(c, Number(v));
    else assert.equal(c ?? "", v);
  }));
});

test("resultCells: digits as shown, headings bold, ranges and P text stay text", () => {
  const { rows, headings } = resultCells([["Unpaired t test"], ["P value", "0.0123"], ["P value summary", "*"],
    ["95% CI", "-1.2 to 3.4"], ["P", "<0.0001"], []]);
  assert.deepEqual(rows, [["Unpaired t test"], ["P value", 0.0123], ["P value summary", "*"],
    ["95% CI", "-1.2 to 3.4"], ["P", "<0.0001"], []]);
  assert.deepEqual(headings, [0]);
});

test("projectWorkbook: README first, one sheet per table and results sheet, renames reported", () => {
  const long = "Nonlin fit of a very long table name: assay 3";
  const wb = projectWorkbook({
    title: "Assay", app: "OpenDose test", date: "2026-11-24T10:00:00.000Z",
    tables: [{ name: long, table: table() }, { name: "Data 1", table: table() }],
    results: [{ name: "Data 1", analysis: "Unpaired t test", data: "Data 1", matrix: [["P value", "0.0123"]] }],
    skipped: ["Slow fit"],
  });
  assert.equal(wb.sheets, 4);
  const back = readBack(wb.bytes);
  assert.deepEqual([...back.keys()], ["README", "Nonlin fit of a very long table", "Data 1", "Data 1 (2)"]);
  assert.deepEqual(back.get("Data 1 (2)"), [["P value", 0.0123]]);
  const readme = back.get("README")!;
  assert.deepEqual(readme[3], ["Sheet", "What it holds", "Name in OpenDose", "Renamed because"]);
  assert.deepEqual(readme[4].slice(0, 3), ["Nonlin fit of a very long table", "Data table, as laid out in the app", long]);
  assert.match(String(readme[4][3]), /longer than 31/);
  assert.equal(readme[6][1], "Unpaired t test of “Data 1”");
  assert.match(String(readme[6][3]), /another sheet has this name/);
  assert.ok(readme.some((r) => /Not included .*Slow fit/.test(String(r[0]))));
  assert.equal(wb.renamed.length, 2);
  assert.equal(renamedPhrase(wb.renamed), "2 sheet names were changed for Excel (see the README sheet)");
  assert.equal(renamedPhrase([]), "");
});
