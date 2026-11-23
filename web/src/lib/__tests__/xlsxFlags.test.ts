// Formula cells saved without a value and rows hidden in Excel (P-06),
// read from the sheet XML. The two workbooks and expected.json come from
// e2e-fixtures/xlsx/make_fixtures.py (openpyxl, normal mode and
// data_only=True). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import {
  cellRef, columnLetters, rangeRows, scanSheet, visibleRows, xlsxFlags, xmlText,
} from "../xlsxFlags.ts";

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../../e2e-fixtures/xlsx/${name}`, import.meta.url)));
const expected = JSON.parse(readFileSync(new URL("../../../e2e-fixtures/xlsx/expected.json", import.meta.url), "utf8")) as
  Record<string, Record<string, { blankFormulas: string[]; hiddenRows: number[]; autoFilter: string | null }>>;

test("workbook A: the five =A2*2 formulas openpyxl saved without values", () => {
  const flags = xlsxFlags(fixture("formulas-uncached.xlsx"));
  const ref = expected["formulas-uncached.xlsx"].doubled;
  assert.deepEqual(flags.get("doubled")?.blankFormulas, ref.blankFormulas);
  assert.deepEqual(ref.blankFormulas, ["B2", "B3", "B4", "B5", "B6"]);
  assert.deepEqual(flags.get("doubled")?.filterHidden, []);
});

test("workbook B: rows 4 to 6 hidden by the AutoFilter, row 3 of another sheet by hand", () => {
  const flags = xlsxFlags(fixture("filter-hidden.xlsx"));
  const f = expected["filter-hidden.xlsx"];
  assert.deepEqual(flags.get("filtered"), { filterHidden: f.filtered.hiddenRows, manualHidden: [], blankFormulas: [] });
  assert.deepEqual(f.filtered.hiddenRows, [4, 5, 6]);
  assert.equal(f.filtered.autoFilter, "A1:B10");
  assert.deepEqual(flags.get("by hand"), { filterHidden: [], manualHidden: f["by hand"].hiddenRows, blankFormulas: [] });
});

test("a cached empty string is a value; a missing <v> is not", () => {
  const xml = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="str"><f>""</f><v></v></c><c r="B1"><f>1/0</f></c>
      <c r="C1" t="e"><f>1/0</f><v>#DIV/0!</v></c><c r="D1"><f t="shared" si="0"/><v/></c>
      <c r="E1"><f>A1</f><v>0</v></c><c r="F1" t="str"><f>A1</f></c></row>
  </sheetData></worksheet>`;
  assert.deepEqual(scanSheet(xml).blankFormulas, ["B1", "D1", "F1"]);
});

test("rows and cells without r, prefixes, hidden=\"true\", and a table's filter", () => {
  const xml = `<x:worksheet xmlns:x="m"><x:sheetData>
    <x:row><x:c><x:v>1</x:v></x:c><x:c><x:f>A1</x:f></x:c></x:row>
    <x:row hidden="true"><x:c><x:v>2</x:v></x:c></x:row>
    <x:row r="5" hidden="1"/><x:row r="9" hidden="1"/>
  </x:sheetData></x:worksheet>`;
  const s = scanSheet(xml, ["A1:C6"]);
  assert.deepEqual(s.blankFormulas, ["B1"]);
  assert.deepEqual(s.filterHidden, [2, 5]);
  assert.deepEqual(s.manualHidden, [9]);
  // the filter's header row itself is not "hidden by the filter"
  assert.deepEqual(scanSheet(`<worksheet><sheetData><row r="1" hidden="1"/></sheetData><autoFilter ref="A1:B4"/></worksheet>`),
    { filterHidden: [], manualHidden: [1], blankFormulas: [] });
});

test("an Excel table's AutoFilter is found through the sheet's relationships", () => {
  const ct = '<?xml version="1.0"?><Types/>';
  const files = {
    "[Content_Types].xml": strToU8(ct),
    "_rels/.rels": strToU8('<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    "xl/workbook.xml": strToU8('<workbook xmlns:r="r"><sheets><sheet name="R&amp;D" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml"/></Relationships>'),
    "xl/worksheets/sheet1.xml": strToU8('<worksheet><sheetData><row r="3" hidden="1"/><row r="12" hidden="1"/></sheetData></worksheet>'),
    "xl/worksheets/_rels/sheet1.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/></Relationships>'),
    "xl/tables/table1.xml": strToU8('<table ref="A1:C10"><autoFilter ref="A1:C10"/></table>'),
  };
  const flags = xlsxFlags(zipSync(files));
  assert.deepEqual(flags.get("R&D"), { filterHidden: [3], manualHidden: [12], blankFormulas: [] });
});

test("the import leaves out filtered rows by default and keeps them in one click", () => {
  const rows = [["Dose", "Response"], ...Array.from({ length: 9 }, (_, i) => [String(i), String(10 * i)])];
  const sheet = { name: "filtered", rows, flags: { filterHidden: [3, 4, 5], manualHidden: [8], blankFormulas: [] } };
  const firstCol = (r: string[][]) => r.map((x) => x[0]).join(",");
  // as copying the range in Excel: filtered rows out, rows hidden by hand in
  assert.equal(firstCol(visibleRows(sheet, false, false)), "Dose,0,1,5,6,7,8");
  assert.equal(firstCol(visibleRows(sheet, true, false)), "Dose,0,1,2,3,4,5,6,7,8");
  assert.equal(firstCol(visibleRows(sheet, false, true)), "Dose,0,1,5,6,8");
  assert.equal(visibleRows({ ...sheet, flags: null }, false, false), rows);
});

test("addresses and ranges", () => {
  assert.deepEqual(cellRef("AB12"), [12, 28]);
  assert.deepEqual(cellRef("$C$4"), [4, 3]);
  assert.equal(columnLetters(28), "AB");
  assert.equal(columnLetters(702), "ZZ");
  assert.deepEqual(rangeRows("B10:A2"), [2, 10]);
  assert.deepEqual(rangeRows("3:7"), [3, 7]);
  assert.equal(xmlText("R&amp;D &#181;m&#xB2;"), "R&D µm²");
});
