// The automatic curve fit of a new XY table runs only on data that could
// be a dose-response; any change to its settings means it always runs.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { doseResponseScreen, FIT_ANYWAY, isAutomaticFit, spearman } from "../fitGuard.ts";
import { normalizeTable } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

function xy(x: number[], y: number[]): DataTableModel {
  return normalizeTable({
    type: "xy", x: x.map(String),
    datasets: [{ name: "Y", rows: y.map((v) => [String(v)]) }],
  });
}

const doses = [1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4];
const response = [98, 95, 80, 40, 10, 3];

test("a dilution series with a falling response passes", () => {
  assert.equal(doseResponseScreen(xy(doses, response), false), null);
  // already log10(dose)
  assert.equal(doseResponseScreen(xy([-9, -8, -7, -6, -5, -4], response), true), null);
});

test("fewer than four usable doses, a narrow X range or no trend are held back", () => {
  assert.match(doseResponseScreen(xy([1, 2, 3], [1, 2, 3]), false)!.reason, /at least 4 different doses/);
  // log10 doses typed into a table that expects concentrations
  assert.match(doseResponseScreen(xy([-9, -8, -7, -6], response.slice(0, 4)), false)!.reason,
    /X ≤ 0.*already log10/);
  // a straight line over X = 60…70 (NIST NoInt1)
  const x = Array.from({ length: 11 }, (_, i) => 60 + i);
  assert.match(doseResponseScreen(xy(x, x.map((v) => v * 2.07)), false)!.reason, /8-fold range/);
  // wide range but no monotone trend
  assert.match(doseResponseScreen(xy(doses, [50, 10, 90, 20, 80, 30]), false)!.reason, /monotone/);
  assert.equal(Math.round(spearman([1, 2, 3, 4], [4, 3, 2, 1])), -1);
  // a flat response over a dilution series is a dose-response without an
  // effect: it is fitted (the fit then says the curve is undefined)
  assert.equal(doseResponseScreen(xy(doses, [50.2, 49.8, 50.5, 49.6, 50.1, 50.3]), false), null);
});

test("only the untouched default curve fit is screened", () => {
  const defaults = { model: "log_inhibitor_vs_response_4pl", xIsLog: false };
  assert.equal(isAutomaticFit("nonlin", { xIsLog: false, model: "log_inhibitor_vs_response_4pl" }, defaults), true);
  assert.equal(isAutomaticFit("nonlin", { ...defaults, model: "linear" }, defaults), false);
  assert.equal(isAutomaticFit("nonlin", { ...defaults, [FIT_ANYWAY]: true }, defaults), false);
  assert.equal(isAutomaticFit("column_stats", defaults, defaults), false);
});
