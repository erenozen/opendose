// Full-precision paste from Excel, Google Sheets and LibreOffice Calc
// (P-05). The table reader runs on hand-built tables here (node has no
// DOMParser); scripts/e2e-check.mjs runs the real DOMParser path on the
// clipboard fixtures in e2e-fixtures/clipboard/. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyTable, parseClipboardGrid } from "../table.ts";
import {
  blockText, fullPrecision, gridFromTable, parseClipboardHtml, roundsTo, storedValue,
  type CellLike, type TableLike,
} from "../clipboardHtml.ts";
import { pasteWithReport, reportLine, reportParts } from "../pasteReport.ts";

type Spec = { text: string; attrs?: Record<string, string>; colSpan?: number; rowSpan?: number };
const td = (text: string, attrs: Record<string, string> = {}, span: Partial<Spec> = {}): Spec =>
  ({ text, attrs, ...span });
const table = (rows: Spec[][]): TableLike => ({
  rows: rows.map((r) => ({
    cells: r.map((c): CellLike => ({
      textContent: c.text, colSpan: c.colSpan, rowSpan: c.rowSpan,
      getAttribute: (n) => c.attrs?.[n] ?? null,
    })),
  })),
});
const xnum = (v?: string) => ({ "x:num": v ?? "" });

const ACCEPT_TEXT = "0.12\r\n0.23\r\n0.35\r\n";
const ACCEPT_ROWS = [
  [td("0.12", xnum("0.123456"))], [td("0.23", xnum("0.234567"))], [td("0.35", xnum("0.345678"))],
];
const acceptExcel = table(ACCEPT_ROWS);

test("each app's attribute gives the stored number", () => {
  assert.deepEqual(storedValue({ getAttribute: (n) => (n === "x:num" ? "0.33333333333333331" : null) }, "0.33"),
    { app: "Excel", value: 1 / 3 });
  // x:num with no value: the shown text is the number
  assert.deepEqual(storedValue({ getAttribute: (n) => (n === "x:num" ? "" : null) }, "7"), { app: "Excel", value: 7 });
  assert.deepEqual(storedValue({ getAttribute: (n) => (n === "data-sheets-value" ? '{"1":3,"3":0.123456}' : null) }, "0.12"),
    { app: "Google Sheets", value: 0.123456 });
  // Sheets text (type 2) and booleans (type 4) carry no number
  assert.deepEqual(storedValue({ getAttribute: (n) => (n === "data-sheets-value" ? '{"1":2,"2":"ctrl"}' : null) }, "ctrl"),
    { app: "Google Sheets", value: null });
  assert.deepEqual(storedValue({ getAttribute: (n) => (n === "data-sheets-value" ? "{broken" : null) }, "1"),
    { app: "Google Sheets", value: null });
  assert.deepEqual(storedValue({ getAttribute: (n) => (n === "sdval" ? "0.123456" : null) }, "0.12"),
    { app: "LibreOffice Calc", value: 0.123456 });
  assert.equal(storedValue({ getAttribute: () => null }, "0.12"), null);
});

test("a value rounds to the text shown only at the digits shown", () => {
  assert.ok(roundsTo(0.123456, "0.12"));
  assert.ok(roundsTo(0.125, "0.13") && roundsTo(0.125, "0.12")); // either half-way rounding
  assert.ok(!roundsTo(0.123456, "0.13"));
  assert.ok(roundsTo(12.4, "12"));
  assert.ok(roundsTo(-0.000123456, "-1.23E-04"));
  assert.ok(!roundsTo(-0.000123456, "-1.24E-04"));
  assert.ok(roundsTo(1 / 3, "0.3333333333"));
  assert.ok(roundsTo(0.123456, "0,12")); // decimal comma
  assert.ok(!roundsTo(0.1234, "12.34%")); // a percent is not this number
  assert.ok(!roundsTo(45296, "2024-01-05"));
  assert.ok(!roundsTo(1234567, "1234.6")); // a display scaled by a format: not trusted
  assert.ok(roundsTo(1e12 + 0.4, "1000000000000"));
  assert.ok(roundsTo(1.23456e-12, "1.23E-12"));
});

test("acceptance: Excel shows 0.12, 0.23, 0.35; the cells get the six-decimal values", () => {
  const block = parseClipboardGrid(ACCEPT_TEXT);
  const res = fullPrecision(block, gridFromTable(acceptExcel));
  assert.equal(res.kind, "full");
  if (res.kind !== "full") return;
  assert.deepEqual(res.full.block, [["0.123456"], ["0.234567"], ["0.345678"]]);
  assert.equal(res.full.rounded.length, 3);
  const t = emptyTable("column", { datasets: 1, rows: 3 });
  const { table: after, report } = pasteWithReport(t, 0, 1, block, res);
  assert.deepEqual(after.datasets[0].rows.map((r) => r[0]), ["0.123456", "0.234567", "0.345678"]);
  assert.equal(report.numbers, 3);
  assert.deepEqual(report.rounded.map((c) => `${c.addr} ${c.text} ${c.to}`),
    ["B1 0.12 0.123456", "B2 0.23 0.234567", "B3 0.35 0.345678"]);
  const part = reportParts(report).find((p) => p.key === "rounded");
  assert.equal(part?.label, "3 cells were shown rounded in Excel; the full values were used");
  assert.match(reportLine(report), /^3 numbers · 3 cells were shown rounded in Excel; the full values were used: B1, B2, B3 · nothing was converted to 0$/);
});

test("a paste with no HTML table (a text editor) is today's paste", () => {
  const block = parseClipboardGrid("0.12\n0.23\n0.35\n");
  assert.deepEqual(fullPrecision(block, null), { kind: "none" });
  assert.equal(parseClipboardHtml(""), null);
  assert.equal(parseClipboardHtml("<div><span>0.12</span></div>"), null);
  const t = emptyTable("column", { datasets: 1, rows: 3 });
  const a = pasteWithReport(t, 0, 1, block);
  const b = pasteWithReport(t, 0, 1, block, { kind: "none" });
  assert.deepEqual(a, b);
  assert.deepEqual(a.table.datasets[0].rows.map((r) => r[0]), ["0.12", "0.23", "0.35"]);
  assert.ok(!reportParts(a.report).some((p) => p.key === "rounded" || p.key === "fullValuesIgnored"));
});

test("an HTML table that does not line up with the text: the text is used, and said", () => {
  const block = parseClipboardGrid(ACCEPT_TEXT);
  // an extra row in the HTML (as a hidden row would be)
  const extra = table([...ACCEPT_ROWS, [td("9.99", xnum("9.987"))]]);
  assert.deepEqual(fullPrecision(block, gridFromTable(extra)), { kind: "mismatch", app: "Excel" });
  // shifted text: the same shape, other cells
  const shifted = parseClipboardGrid("0.23\n0.35\n0.12\n");
  const res = fullPrecision(shifted, gridFromTable(acceptExcel));
  assert.deepEqual(res, { kind: "mismatch", app: "Excel" });
  const t = emptyTable("column", { datasets: 1, rows: 3 });
  const { table: after, report } = pasteWithReport(t, 0, 1, shifted, res);
  assert.deepEqual(after.datasets[0].rows.map((r) => r[0]), ["0.23", "0.35", "0.12"]);
  assert.match(reportLine(report),
    /the full values from Excel did not line up with the pasted text, so the values as shown were used/);
});

test("percents, dates, text and exact numbers keep today's path", () => {
  const text = "12.34%\t0.12\n2024-01-05\t2.5E-07\nctrl\t1234.5\n";
  const grid = gridFromTable(table([
    [td("12.34%", xnum("0.1234")), td("0.12", xnum("0.123456"))],
    [td("2024-01-05", xnum("45296")), td("2.5E-07", xnum("2.4999999999999999e-07"))],
    [td("ctrl", { "x:str": "" }), td("1234.5", xnum())],
  ]));
  const res = fullPrecision(parseClipboardGrid(text), grid);
  assert.equal(res.kind, "full");
  if (res.kind !== "full") return;
  assert.deepEqual(res.full.block, [["12.34%", "0.123456"], ["2024-01-05", "2.5E-07"], ["ctrl", "1234.5"]]);
  assert.deepEqual(res.full.rounded, [{ row: 0, col: 1 }]);
});

test("Google Sheets and LibreOffice Calc copies, and a decimal comma", () => {
  const block = parseClipboardGrid("0.12\n12\n");
  const sheets = gridFromTable(table([
    [td("0.12", { "data-sheets-value": '{"1":3,"3":0.123456}' })],
    [td("12", { "data-sheets-value": '{"1":3,"3":12.4}' })],
  ]));
  const s = fullPrecision(block, sheets);
  assert.ok(s.kind === "full" && s.full.app === "Google Sheets");
  assert.deepEqual(s.kind === "full" && s.full.block, [["0.123456"], ["12.4"]]);
  const calc = gridFromTable(table([
    [td("0.12", { sdval: "0.123456", sdnum: "1033;0;0.00" })], [td("12", { sdval: "12.4", sdnum: "1033;0;0" })],
  ]));
  const c = fullPrecision(block, calc);
  assert.ok(c.kind === "full" && c.full.app === "LibreOffice Calc" && c.full.rounded.length === 2);
  // German Excel shows 0,12 and 1,5: the stored numbers are read with a point
  const de = fullPrecision(parseClipboardGrid("0,12\n1,5\n"), gridFromTable(table([
    [td("0,12", xnum("0.123456"))], [td("1,5", xnum("1.5"))],
  ])));
  assert.ok(de.kind === "full");
  if (de.kind !== "full") return;
  assert.deepEqual(de.full.block, [["0.123456"], ["1.5"]]);
  assert.deepEqual(de.full.rounded, [{ row: 0, col: 0 }]);
  assert.equal(blockText(de.full.block), "0.123456\n1.5");
  // a separator left over (1.234,5 has no stored value here): nothing is swapped
  const mixed = fullPrecision(parseClipboardGrid("0,12\n1.234,5\n"), gridFromTable(table([
    [td("0,12", xnum("0.123456"))], [td("1.234,5")],
  ])));
  assert.deepEqual(mixed, { kind: "none" });
});

test("merged cells spread into blanks as in the text copy", () => {
  const g = gridFromTable(table([
    [td("Dose", {}, { colSpan: 2 }), td("0.12", xnum("0.123"), { rowSpan: 2 })],
    [td("1"), td("2")],
  ]));
  assert.deepEqual(g.rows.map((r) => r.map((c) => c.text)), [["Dose", "", "0.12"], ["1", "2", ""]]);
  assert.equal(g.app, "Excel");
  // non-breaking spaces and line breaks inside a cell read as one space
  const n = gridFromTable(table([[td(" a\n b ")]]));
  assert.equal(n.rows[0][0].text, "a b");
});

test("only numeric columns take stored values: row titles stay as typed", () => {
  const block = parseClipboardGrid("1.5\t0.12\n");
  const res = fullPrecision(block, gridFromTable(table([
    [td("1.5", xnum("1.49")), td("0.12", xnum("0.123456"))],
  ])));
  assert.equal(res.kind, "full");
  const t = emptyTable("column", { datasets: 1, rows: 1 });
  const { table: after, report } = pasteWithReport(t, 0, 0, block, res);
  assert.deepEqual(after.rowTitles, ["1.5"]);
  assert.equal(after.datasets[0].rows[0][0], "0.123456");
  assert.deepEqual(report.rounded.map((c) => c.addr), ["B1"]);
  assert.match(reportLine(report), /1 cell was shown rounded in Excel; the full value was used: B1/);
});
