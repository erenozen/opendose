// Percent and unit cells (P-35): the fix reads exactly the typed digits.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fixCells, fixedText, percentDigits, percentFraction, shiftDecimal, unitOf,
} from "../unitCells.ts";
import { emptyTable, flatColumns, setCell, setExcluded } from "../table.ts";

// The flat grid column of the first Y value (a column table has row titles first).
const Y0 = flatColumns(emptyTable("column")).findIndex((c) => c.kind === "y");
import { pasteWithReport, reportParts, withFixed } from "../pasteReport.ts";

test("a percent reads as its typed digits, or as the fraction by moving the point", () => {
  assert.equal(percentDigits("12.5%"), "12.5");
  assert.equal(percentDigits(" 30 % "), "30");
  assert.equal(percentDigits("12.50%"), "12.50");          // as typed
  assert.equal(percentFraction("12.5%"), "0.125");
  assert.equal(percentFraction("30%"), "0.3");
  assert.equal(percentFraction("47.5%"), "0.475");          // not 0.47500000000000003
  assert.equal(percentFraction("0.07%"), "0.0007");
  assert.equal(percentFraction("-1.1%"), "-0.011");         // not -0.011000000000000001
  assert.equal(percentFraction("150%"), "1.5");
  assert.equal(percentFraction("0%"), "0");
  assert.equal(percentFraction(".5%"), "0.005");
  assert.equal(percentFraction("1e-3%"), "1e-5");
  for (const s of ["12.5", "12,5%", "%12", "abc%", "12.5%%", ""]) assert.equal(percentDigits(s), null, s);
});

test("shiftDecimal moves the point in the string", () => {
  assert.equal(shiftDecimal("123.45", -2), "1.2345");
  assert.equal(shiftDecimal("123.45", 2), "12345");
  assert.equal(shiftDecimal("0.001", 3), "1");
  assert.equal(shiftDecimal("-0", -2), "0");
  assert.equal(shiftDecimal("+5", -1), "+0.5");
  assert.throws(() => shiftDecimal("1,5", -2));
  // every two-decimal percent from 0 to 100 gives the four-decimal fraction
  // it spells (i / 10000 written to 4 places is that decimal, exactly)
  for (let i = 0; i <= 10000; i++) {
    const typed = (i / 100).toFixed(2);
    assert.equal(Number(percentFraction(`${typed}%`)), Number((i / 10000).toFixed(4)), typed);
  }
});

test("a unit is stripped to the typed number; a percent is not a unit", () => {
  assert.deepEqual(unitOf("3.2 µM"), { num: "3.2", unit: "µM" });
  assert.deepEqual(unitOf("3.2µM"), { num: "3.2", unit: "µM" });
  assert.deepEqual(unitOf("-12 mg/mL"), { num: "-12", unit: "mg/mL" });
  assert.deepEqual(unitOf("37 °C"), { num: "37", unit: "°C" });
  assert.deepEqual(unitOf("1.5e-3 M"), { num: "1.5e-3", unit: "M" });
  for (const s of ["12.5%", "µM", "3.2", "n.d.", "3 2 µM", "low"]) assert.equal(unitOf(s), null, s);
  assert.equal(fixedText("3.2 µM", "unit"), "3.2");
  assert.equal(fixedText("3.2 µM", "percent"), null);
});

const column = (vals: string[]) => {
  let t = emptyTable("column", { rows: vals.length });
  vals.forEach((v, r) => { t = setCell(t, 0, r, 0, v); });
  return t;
};

test("the paste report says 3 cells hold a percent sign; nothing changes until a fix is applied", () => {
  const block = [["12.5%"], ["30%"], ["47.5%"]];
  const { table, report } = pasteWithReport(emptyTable("column", { rows: 3 }), 0, Y0, block);
  assert.deepEqual(table.datasets[0].rows.map((r) => r[0]), ["12.5%", "30%", "47.5%"]);
  const part = reportParts(report).find((p) => p.key === "percents");
  assert.equal(part?.label, "3 cells hold a percent sign (not read as numbers)");
  assert.deepEqual(part?.cells.map((c) => c.addr), ["B1", "B2", "B3"]);
  assert.equal(report.text.length, 0);
  assert.equal(report.numbers, 0);
  const asIs = fixCells(table, report.percents, "percent");
  assert.equal(asIs.changed, 3);
  assert.deepEqual(asIs.table.datasets[0].rows.map((r) => r[0]), ["12.5", "30", "47.5"]);
  const frac = fixCells(table, report.percents, "fraction");
  assert.deepEqual(frac.table.datasets[0].rows.map((r) => r[0]), ["0.125", "0.3", "0.475"]);
  // the report after the fix: 3 numbers, no percent part
  const after = withFixed(report, "percents");
  assert.equal(after.numbers, 3);
  assert.equal(reportParts(after).some((p) => p.key === "percents"), false);
});

test("units: one unit offers the strip; several are named and not stripped", () => {
  const one = pasteWithReport(emptyTable("column", { rows: 2 }), 0, Y0, [["3.2 µM"], ["4 µM"]]).report;
  assert.equal(reportParts(one).find((p) => p.key === "units")?.label,
    "2 cells hold the unit “µM” (not read as numbers)");
  const mixed = pasteWithReport(emptyTable("column", { rows: 2 }), 0, Y0, [["3.2 µM"], ["4 nM"]]).report;
  assert.equal(reportParts(mixed).find((p) => p.key === "units")?.label,
    "2 cells hold units (µM, nM): convert them to one unit, then strip it");
});

test("fixCells keeps exclusions and their reasons, and leaves cells edited since alone", () => {
  let t = column(["12.5%", "30%", "low"]);
  t = setExcluded(t, [{ kind: "y", dataset: 0, row: 1, sub: 0 }], true);
  const before = JSON.stringify({ e: t.datasets[0].excluded, r: t.datasets[0].exclusionReasons });
  const cells = [0, 1, 2].map((row) => ({ row, col: Y0 }));
  const r = fixCells(t, cells, "fraction");
  assert.equal(r.changed, 2);
  assert.deepEqual(r.table.datasets[0].rows.map((x) => x[0]), ["0.125", "0.3", "low"]);
  assert.equal(JSON.stringify({ e: r.table.datasets[0].excluded, r: r.table.datasets[0].exclusionReasons }), before);
  // an XY table's X column is fixed too
  let xy = emptyTable("xy", { rows: 2 });
  xy = { ...xy, x: ["10%", "20%"] };
  const fx = fixCells(xy, [{ row: 0, col: 0 }, { row: 1, col: 0 }], "percent");
  assert.deepEqual(fx.table.x, ["10", "20"]);
});
