// When a new XY table's curve fit starts by itself. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { DEFAULT_XY_OPTIONS, type OptionsState } from "../../../types.ts";
import {
  autoFitGate, concentrationLike, doseResponseLike, fitRequested, ranks, spearman,
} from "../autofit.ts";

const xy = (x: (string | number)[], ys: (string | number)[][][], extra = {}) => normalizeTable({
  type: "xy", x: x.map(String),
  datasets: ys.map((rows, i) => ({ name: `D${i}`, rows: rows.map((r) => r.map(String)) })),
  ...extra,
});
// The example table (sheets/xy/sample.ts, the engine's reference data).
const xySample = () => xy(["1e-9", "3.162e-9", "1e-8", "3.162e-8", "1e-7", "3.162e-7", "1e-6",
  "3.162e-6", "1e-5"], [[[98.2, 101.5, 99.1], [97.0, 95.8, 99.9], [93.4, 90.1, 92.7],
  [78.9, 82.3, 80.0], [51.2, 48.7, 50.9], [22.1, 25.6, 24.0], [8.9, 10.2, 7.5], [3.1, 4.4, 2.2],
  [1.0, 0.5, 2.1]]]);
const AUTO: OptionsState = { ...DEFAULT_XY_OPTIONS, autoFit: "auto" };

test("ranks share ties; Spearman is 1 for any monotone relation", () => {
  assert.deepEqual(ranks([10, 20, 20, 5]), [2, 3.5, 3.5, 1]);
  assert.equal(spearman([1, 2, 3, 4], [1, 8, 27, 64]), 1);
  assert.equal(spearman([1, 2, 3, 4], [9, 7, 3, 1]), -1);
  assert.equal(spearman([1, 2, 3, 4], [5, 5, 5, 5]), null);
  assert.equal(spearman([1, 2], [1, 2]), null);
});

test("dilution series are concentration-like, evenly spaced X are not", () => {
  assert.ok(concentrationLike([1e-9, 3.162e-9, 1e-8, 3.162e-8, 1e-7]));
  assert.ok(concentrationLike([0, 0.01, 0.1, 1, 10]));          // zero control ignored
  assert.ok(concentrationLike([100, 50, 25, 12.5, 6.25]));      // two-fold, descending
  assert.ok(concentrationLike([0.1, 0.3, 1, 3, 10, 100]));      // irregular half-logs
  assert.ok(!concentrationLike([1, 2, 3, 4, 5, 6]));
  assert.ok(!concentrationLike([10, 20, 30, 40]));
  assert.ok(!concentrationLike([1, 10, 100]));                   // too few
});

test("the example dose-response table fits by itself", () => {
  assert.deepEqual(doseResponseLike(xySample()), { ok: true });
  assert.deepEqual(autoFitGate(xySample(), AUTO), { fit: true });
});

test("straight-line data waits for a choice", () => {
  const line = xy([1, 2, 3, 4, 5, 6], [[[2.1], [3.9], [6.2], [7.8], [10.3], [11.9]]]);
  assert.deepEqual(autoFitGate(line, AUTO), { fit: false, reason: "spacing" });
});

test("no monotone trend, log X values, dates", () => {
  const flat = xy([1e-9, 1e-8, 1e-7, 1e-6, 1e-5], [[[5], [9], [4], [8], [5]]]);
  assert.deepEqual(autoFitGate(flat, AUTO), { fit: false, reason: "trend" });
  const logs = xy([-9, -8, -7, -6, -5], [[[100], [90], [50], [10], [0]]]);
  assert.deepEqual(autoFitGate(logs, AUTO), { fit: false, reason: "nonpositive" });
  const dates = xy(["2024-01-01", "2024-01-05", "2024-02-01", "2024-03-01"],
    [[[1], [2], [3], [4]]], { xFormat: "dates" });
  assert.deepEqual(autoFitGate(dates, AUTO), { fit: false, reason: "dates" });
});

test("a little noise still counts as monotone; one flat data set does not block", () => {
  const noisy = xy([1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4],
    [[[99], [101], [80], [40], [12], [3]], [[50], [52], [49], [51], [50], [48]]]);
  assert.deepEqual(autoFitGate(noisy, AUTO), { fit: true });
});

test("too few points or an empty table go to the fit (its messages explain)", () => {
  assert.deepEqual(autoFitGate(xy(["", "", ""], [[[""], [""], [""]]]), AUTO), { fit: true });
  assert.deepEqual(autoFitGate(xy([1, 2, 3], [[[1], [2], [3]]]), AUTO), { fit: true });
});

test("summary tables read the mean from the first subcolumn", () => {
  const t = xy([1e-9, 1e-8, 1e-7, 1e-6], [[["100", "5", "3"], ["80", "50", "3"],
    ["30", "90", "3"], ["5", "200", "3"]]], { subcolumnFormat: "mean_sd_n" });
  assert.deepEqual(doseResponseLike(t), { ok: true });
});

test("an explicit request, older options and set-up fits always fit", () => {
  const line = xy([1, 2, 3, 4, 5], [[[1], [2], [3], [4], [5]]]);
  assert.equal(fitRequested({ ...DEFAULT_XY_OPTIONS }), true);              // older file: no field
  assert.equal(fitRequested(AUTO), false);
  assert.equal(fitRequested({ ...AUTO, autoFit: "requested" }), true);
  assert.equal(fitRequested({ ...AUTO, model: "michaelis_menten" }), true);  // wizard / template
  assert.equal(fitRequested({ ...AUTO, xIsLog: true }), true);               // simulated table
  assert.equal(fitRequested({ ...AUTO, top: { enabled: true, value: "100" } }), true); // plate
  assert.deepEqual(autoFitGate(line, { ...AUTO, autoFit: "requested" }), { fit: true });
});
