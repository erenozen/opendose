// The workbook report's words (P-06): neutral about the app for every
// format, the defaults stated with the copy behaviour of Excel and
// LibreOffice Calc, and the step that saves a formula's value named for
// the app that writes the format. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { reportParts, sheetCells } from "../workbookReportText.ts";

const flags = { filterHidden: [3, 4, 5], manualHidden: [2], blankFormulas: ["B2", "B3"] };

test("no format says the rows are hidden in Excel", () => {
  for (const format of ["xlsx", "xls", "ods"] as const) {
    const parts = reportParts(flags, format, false, false);
    assert.deepEqual(parts.map((p) => p.key), ["filterHidden", "manualHidden", "blankFormulas"]);
    assert.equal(parts[0].text, "3 rows are hidden by a filter in the workbook (rows 4, 5, 6): left out, "
      + "as copying the filtered range in Excel or LibreOffice Calc leaves them out");
    assert.equal(parts[1].text, "1 row is hidden in the workbook (row 3): imported, "
      + "as copying the range in Excel or LibreOffice Calc copies it");
    assert.ok(parts.every((p) => !/hidden (by a filter )?in Excel/.test(p.text)), format);
  }
});

test("the toggled defaults: filtered rows imported, hidden rows left out", () => {
  const parts = reportParts(flags, "ods", true, true);
  assert.equal(parts[0].text, "3 rows are hidden by a filter in the workbook (rows 4, 5, 6): imported");
  assert.equal(parts[0].warn, false);
  assert.equal(parts[1].text, "1 row is hidden in the workbook (row 3): left out");
});

test("a formula without a saved value: Excel for .xlsx and .xls, LibreOffice Calc for .ods", () => {
  const xlsx = reportParts({ ...flags, filterHidden: [], manualHidden: [] }, "xlsx", false, false);
  assert.equal(xlsx[0].text, "2 formula cells have no saved value and read as blank: B2, B3. "
    + "Open the workbook in Excel, save it, then import it again");
  assert.equal(xlsx[0].warn, true);
  const ods = reportParts({ ...flags, filterHidden: [], manualHidden: [] }, "ods", false, false);
  assert.match(ods[0].text, /read as blank: B2, B3\. Open the workbook in LibreOffice Calc, recalculate it/);
});

test("flags null: could not be checked; undefined or empty: nothing to say", () => {
  const parts = reportParts(null, "xlsx", false, false);
  assert.deepEqual(parts.map((p) => [p.key, p.warn]), [["unchecked", true]]);
  assert.deepEqual(reportParts(undefined, "xlsx", false, false), []);
  assert.deepEqual(reportParts({ filterHidden: [], manualHidden: [], blankFormulas: [] }, "xls", false, false), []);
});

test("long lists name six rows and count the rest", () => {
  const parts = reportParts({ filterHidden: [1, 2, 3, 4, 5, 6, 7, 8], manualHidden: [], blankFormulas: [] },
    "xlsx", false, false);
  assert.match(parts[0].text, /^8 rows are hidden by a filter in the workbook \(rows 2, 3, 4, 5, 6, 7 and 2 more\)/);
});

test("sheetCells: what a picker takes, with the Import dialog's defaults", () => {
  // as the filtered sheet of e2e-fixtures/xlsx/filter-hidden.xlsx: rows 4
  // to 6 (indices 3 to 5) hidden by the filter; a row hidden by hand at 1
  const rows = [["Dose", "Response"], [0.1, 98.5], [0.3, 95.1], [1, 80.2], [3, 51.7], [10, 22.4], [30, null]];
  const sheet = { rows, flags: { filterHidden: [3, 4, 5], manualHidden: [1], blankFormulas: [] } };
  const first = (k: boolean, s: boolean) => sheetCells(sheet, k, s).map((r) => r[0]);
  assert.deepEqual(first(false, false), ["Dose", "0.1", "0.3", "30"]);
  assert.deepEqual(first(true, false), ["Dose", "0.1", "0.3", "1", "3", "10", "30"]);
  assert.deepEqual(first(false, true), ["Dose", "0.3", "30"]);
  assert.deepEqual(sheetCells(sheet, false, false).at(-1), ["30", ""]);
  // no flags (not checked, or nothing hidden): every row, whatever the choices
  assert.equal(sheetCells({ rows }, false, true).length, rows.length);
  assert.equal(sheetCells({ rows, flags: null }, false, true).length, rows.length);
});
