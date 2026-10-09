// Paste / import report: blanks and spreadsheet errors stay missing,
// nothing becomes 0, identifiers are kept as typed. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyTable, isExcluded, numericData, parseCell, parseClipboardGrid } from "../table.ts";
import {
  applyImportWithCells, DEFAULT_FILTER, DEFAULT_SOURCE, defaultRoles, prepareImport,
} from "../importText.ts";
import {
  cellAddress, classifyValue, isMissingCode, looksLikeLocaleNumber, pasteReport, pasteWithReport,
  placedCells, reportLine, reportParts,
} from "../pasteReport.ts";

test("cells are classified as the grid reads them", () => {
  assert.equal(classifyValue("12.5"), "number");
  assert.equal(classifyValue("-1e-3"), "number");
  assert.equal(classifyValue(""), "blank");
  assert.equal(classifyValue("   "), "blank");
  for (const e of ["#DIV/0!", "#N/A", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#NULL!", "NA", "n.d.", "-"]) {
    assert.equal(classifyValue(e), "missing", e);
    assert.ok(isMissingCode(e));
  }
  assert.equal(classifyValue("1,5"), "localeNumber");
  assert.equal(classifyValue("1,234.5"), "localeNumber");
  assert.equal(classifyValue("1.234,5"), "localeNumber");
  assert.equal(classifyValue("1 234"), "localeNumber");
  assert.ok(!looksLikeLocaleNumber("1.5"));
  assert.equal(classifyValue("12 mg"), "text");
  assert.equal(classifyValue("high"), "text");
  assert.equal(cellAddress(6, 1), "B7");
  assert.equal(cellAddress(11, 27), "AB12");
});

test("no blank, error code or text ever reads as 0 (or as any number)", () => {
  for (const v of ["", " ", "#DIV/0!", "#N/A", "#VALUE!", "NA", "n.d.", "-", ".", "abc", "1,5",
    "1,234", "0x10", "0b11", "0o7", "Infinity", "1_000", "12 mg", "5%"]) {
    assert.equal(parseCell(v), null, JSON.stringify(v));
  }
  assert.equal(parseCell("0"), 0);
  assert.equal(parseCell("+.5"), 0.5);
  assert.equal(parseCell("1E5"), 100000);
});

test("a pasted block with #DIV/0!, a blank and IDs: told which cells became missing", () => {
  const t = emptyTable("column", { datasets: 2, rows: 3 });
  const block = parseClipboardGrid("0001234\t1.5\t#DIV/0!\n0001235\t\t2.5\n1E5\t3.5\t4.5\n");
  const { table, report } = pasteWithReport(t, 0, 0, block);
  // identifiers kept exactly as typed
  assert.deepEqual(table.rowTitles, ["0001234", "0001235", "1E5"]);
  assert.equal(report.numbers, 4);
  assert.deepEqual(report.blanks.map((c) => c.addr), ["B2"]);
  assert.deepEqual(report.missing.map((c) => `${c.addr} ${c.text}`), ["C1 #DIV/0!"]);
  assert.equal(report.labels, 3);
  assert.equal(report.zeros.length, 0);
  // the error text stays visible in its cell and the analyses see missing
  assert.equal(table.datasets[1].rows[0][0], "#DIV/0!");
  const d = numericData(table).datasets;
  assert.deepEqual(d.map((x) => x.ys.map((r) => r[0])), [[1.5, null, 3.5], [null, 2.5, 4.5]]);
  assert.ok(!d.some((x) => x.ys.some((r) => r[0] === 0)));
  const line = reportLine(report);
  assert.match(line, /^4 numbers · 1 blank kept as missing: B2 · 1 spreadsheet error kept as missing: C1/);
  assert.match(line, /3 labels kept exactly as typed · nothing was converted to 0$/);
});

test("text in a numeric column is named and read as missing; * marks an exclusion", () => {
  const t = emptyTable("column", { datasets: 3, rows: 12 });
  const rows = Array.from({ length: 12 }, (_, r) => ["", String(r + 1), String(r + 2), String(r + 3)]);
  rows[6][1] = "high";
  rows[11][2] = "n/d value";
  rows[3][3] = "7.5*";
  const { table, report } = pasteWithReport(t, 0, 0, rows);
  assert.deepEqual(report.text.map((c) => c.addr), ["B7", "C12"]);
  assert.deepEqual(report.excluded.map((c) => c.addr), ["D4"]);
  assert.equal(table.datasets[2].rows[3][0], "7.5");
  assert.ok(isExcluded(table, { kind: "y", dataset: 2, row: 3, sub: 0 }));
  assert.equal(report.numbers, 34);
  const text = reportParts(report).find((p) => p.key === "text");
  assert.equal(text?.label, "2 cells read as text, not 0");
  assert.match(reportLine(report), /2 cells read as text, not 0: B7, C12/);
});

test("decimal commas pasted straight into the grid are kept as text, never misread", () => {
  const t = emptyTable("xy", { datasets: 1, subcolumns: 1, rows: 3 });
  const { table, report } = pasteWithReport(t, 0, 0, parseClipboardGrid("0,1\t98,5\n1\t50,2\n10\t3.908"));
  assert.equal(report.localeNumbers.length, 3);
  assert.deepEqual(report.localeNumbers.map((c) => c.addr), ["A1", "B1", "B2"]);
  assert.equal(numericData(table).x[0], null);
  assert.equal(numericData(table).datasets[0].ys[2][0], 3.908);
});

test("a multiple-variables column of text pasted into an empty column becomes categorical", () => {
  const t = emptyTable("multivariable", { datasets: 2, rows: 3 });
  const { table, report } = pasteWithReport(t, 0, 1, parseClipboardGrid("male\t5\nfemale\t6\nmale\t7"));
  assert.equal(table.datasets[0].varType, "categorical");
  assert.equal(table.datasets[1].varType, "continuous");
  assert.equal(report.labels, 3);
  assert.equal(report.text.length, 0);
  // gene ids with leading zeros: identifiers, kept as typed
  const g = pasteWithReport(emptyTable("multivariable", { datasets: 2, rows: 2 }), 0, 1,
    parseClipboardGrid("0001234\t1\n0004567\t2")).table;
  assert.deepEqual(g.datasets[0].rows.map((r) => r[0]), ["0001234", "0004567"]);
});

test("import: decimal commas converted and reported; titles and categorical text kept as typed", () => {
  const t = emptyTable("column", { datasets: 2, rows: 2 });
  const text = "ID;A;B\n1,50;1,5;#DIV/0!\n0001234;;2,25\n";
  const p = prepareImport(text, { ...DEFAULT_SOURCE, titlesRow: true }, DEFAULT_FILTER);
  const roles = defaultRoles(t, p);
  roles[0] = "rowTitle";
  const { table, written } = applyImportWithCells(t, p, roles,
    { mode: "replace", row: 0, col: 0, perDataset: 1, useTitles: true }, DEFAULT_FILTER);
  // a row title that looks like a decimal-comma number stays as typed
  assert.deepEqual(table.rowTitles, ["1,50", "0001234"]);
  assert.equal(table.datasets[0].rows[0][0], "1.5");
  const r = pasteReport(placedCells(table, written));
  assert.equal(r.numbers, 2);
  assert.deepEqual(r.converted.map((c) => `${c.addr}:${c.text}->${c.to}`), ["B1:1,5->1.5", "C2:2,25->2.25"]);
  assert.deepEqual(r.missing.map((c) => c.addr), ["C1"]);
  assert.deepEqual(r.blanks.map((c) => c.addr), ["B2"]);
  assert.equal(r.labels, 2);
  assert.equal(r.zeros.length, 0);
});

test("import: a missing-value code becomes blank and is reported as missing", () => {
  const t = emptyTable("column", { datasets: 1, rows: 2 });
  const p = prepareImport("5\n99\n7", DEFAULT_SOURCE, { ...DEFAULT_FILTER, missingCode: "99" });
  const { table, written } = applyImportWithCells(t, p, defaultRoles(t, p),
    { mode: "replace", row: 0, col: 0, perDataset: 1, useTitles: false }, DEFAULT_FILTER);
  assert.deepEqual(table.datasets[0].rows.map((r) => r[0]), ["5", "", "7"]);
  const r = pasteReport(placedCells(table, written));
  assert.deepEqual(r.missing.map((c) => `${c.addr} ${c.text}`), ["B2 99"]);
});

test("import into a multiple-variables table: leading-zero IDs make a categorical variable", () => {
  const t = emptyTable("multivariable", { datasets: 2, rows: 2 });
  const q = prepareImport("gene;expr\n0001234;1,5\n0004567;2", { ...DEFAULT_SOURCE, titlesRow: true },
    DEFAULT_FILTER);
  const { table } = applyImportWithCells(t, q, defaultRoles(t, q),
    { mode: "replace", row: 0, col: 0, perDataset: 1, useTitles: true }, DEFAULT_FILTER);
  assert.equal(table.datasets[0].varType, "categorical");
  assert.deepEqual(table.datasets[0].rows.map((r) => r[0]), ["0001234", "0004567"]);
  assert.deepEqual(table.datasets[1].rows.map((r) => r[0]), ["1.5", "2"]);
});

test("a 0 in the report always comes from a 0 in the source", () => {
  const cells = placedCells(
    { ...emptyTable("column", { datasets: 1, rows: 2 }),
      datasets: [{ name: "A", rows: [["0"], ["0"]] }] },
    [{ row: 0, col: 1, raw: "0" }, { row: 1, col: 1, raw: "#DIV/0!" }]);
  const r = pasteReport(cells);
  assert.deepEqual(r.zeros.map((c) => c.addr), ["B2"]);
  assert.match(reportLine(r), /1 cell read as 0 from text: B2$/);
});
