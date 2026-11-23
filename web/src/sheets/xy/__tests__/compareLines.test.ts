// Compare slopes and intercepts (P-13): the rows and the methods sentence.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareLinesMethods, compareLinesRows, fText, usableCompare } from "../compareLines.ts";
import { DEFAULT_LINREG, linregPayload, normalizeLinreg } from "../linreg.ts";
import { normalizeTable } from "../../../project/table.ts";

// engine/tests/reference/compare_lines.py, "parallel" (statsmodels OLS)
const PARALLEL = {
  k: 2, names: ["Control", "Treated"], slopes: [1.97857, 2.0119],
  slopes_test: { F: 0.6440306681270599, dfn: 1, dfd: 12, p: 0.4378605161731694 },
  slopes_differ: false,
  intercepts_test: { F: 987.8513513513522, dfn: 1, dfd: 13, p: 1.194848813986423e-13 },
  intercepts_meaningful: true, intercepts_differ: true,
  common_slope: { value: 1.9952380952380957, ci: [1.9509900145723413, 2.03948617590385] },
  slope_difference: { value: -0.03333333333333299, ci: [-0.12383266977909545, 0.05716600311242946] },
  pooled_line: { slope: 1.9952380952380944, y_intercept: 2.4964285714285754 },
  ci_level: 0.95,
};

test("rows of two parallel lines at different heights", () => {
  const rows = compareLinesRows(PARALLEL);
  const by = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.equal(by["Are the slopes equal?"].value, "F (1, 12) = 0.644, P = 0.4379");
  assert.equal(by["Are the slopes equal?"].note, "The slopes are not shown to differ.");
  assert.equal(by["Slope difference (Control − Treated)"].value, "-0.03333");
  assert.equal(by["Slope difference (Control − Treated)"].note, "95% CI -0.1238 to 0.05717");
  assert.equal(by["Common slope (parallel lines)"].value, "1.995");
  assert.equal(by["Common slope (parallel lines)"].note, "95% CI 1.951 to 2.039");
  assert.equal(by["Are the intercepts equal?"].value, "F (1, 13) = 987.9, P < 0.0001");
  assert.equal(by["Are the intercepts equal?"].note, "The lines are parallel but at different heights.");
  assert.equal(by["Pooled line (all the points)"], undefined);
});

test("the intercept test is flagged as not meaningful when the slopes differ", () => {
  const div = { ...PARALLEL, slopes_differ: true, intercepts_meaningful: false,
    slopes_test: { F: 621.5, dfn: 1, dfd: 8, p: 7.2e-9 } };
  const r = compareLinesRows(div).find((x) => x.label === "Are the intercepts equal?")!;
  assert.match(r.note!, /^Not meaningful: the slopes differ/);
  assert.match(compareLinesMethods(div), /the intercepts were not compared because the slopes differ/);
  const same = { ...PARALLEL, intercepts_differ: false };
  assert.equal(compareLinesRows(same).find((x) => x.label === "Pooled line (all the points)")!.value,
    "Y = 1.995*X + 2.496");
});

test("an undefined F is said in words; unusable blocks are rejected", () => {
  assert.match(fText({ F: null, dfn: 1, dfd: 4, p: null }), /undefined/);
  assert.equal(usableCompare({ unavailable: "x" }), false);
  assert.equal(usableCompare(PARALLEL), true);
});

test("the option asks the engine only with two or more data sets", () => {
  assert.equal(normalizeLinreg({}).compareLines, undefined);
  assert.equal(normalizeLinreg({ compareLines: true }).compareLines, true);
  const two = normalizeTable({ type: "xy", x: ["1", "2", "3"], datasets: [
    { name: "A", rows: [["1"], ["2"], ["3"]] }, { name: "B", rows: [["2"], ["3"], ["5"]] }] });
  const p = linregPayload(two, { ...DEFAULT_LINREG, compareLines: true }) as { options: Record<string, unknown> };
  assert.equal(p.options.compare_lines, true);
  const off = linregPayload(two, DEFAULT_LINREG) as { options: Record<string, unknown> };
  assert.equal(off.options.compare_lines, undefined);
});
