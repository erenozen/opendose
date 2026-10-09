// Incomplete curves: "> highest dose" reporting from the engine's
// range_flags (rangeReport.ts) and the results sentence. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  concentrationUnit, displayOf, isLogMidpoint, isMidpoint, rangeDisplay, rangeHidesSpread,
  ratioText, withRangeReport,
} from "../rangeReport.ts";
import { resultSentence } from "../../../report/sentences.ts";
import type { AnalysisResult } from "../../../types.ts";

// range_flags as the engine returns them for a curve falling from 100 to
// 62 between 0.1 and 30 (engine/opendose/rangeflags.py)
const flags = {
  midpoint_param: "LogIC50", label: "IC50", midpoint: 2.53, x_units: "log10",
  x_min_tested: -1, x_max_tested: 1.4771212547196624, range_conc: [0.1, 30],
  ec50_in_range: false, ec50_above_range: true, ec50_below_range: false,
  top_defined: true, top_reason: "confidence interval finite and narrow enough",
  bottom_defined: false,
  bottom_reason: "confidence interval width 5093 is at least 10 x the observed response range 39.8",
  half_response: -98, crosses_half: false, report_as: "> 30", report_relation: ">",
  report_value: 30, notes: [],
};
const fit = {
  model: "log_inhibitor_vs_response_4pl", label: "log(inhibitor) vs. response", equation: "",
  status: "converged", dependency: {},
  params: {
    Top: { value: 100.05, se: 0.5, ci95: [98.9, 101.2] },
    Bottom: { value: -296.6, se: 1200, ci95: [-2843, 2250] },
    LogIC50: { value: 2.5276, se: 1.8, ci95: [-1.24, 6.29] },
    HillSlope: { value: -0.925, se: 0.19, ci95: [-1.32, -0.53] },
    IC50: { value: 337.0, se: null, ci95: [0.058, 1.96e6], derived: true },
  },
  param_order: ["Top", "Bottom", "LogIC50", "HillSlope", "IC50"],
  goodness: { df: 14, r_squared: 0.99, ss_res: 20, sy_x: 1.2, n_points: 18 },
  range_flags: flags,
};
const result = { analysis: "dose_response", datasets: [{ name: "Drug", points: { x: [], bars: [] }, fit }] } as
  unknown as AnalysisResult;

test("the concentration unit comes from the X title, else the table's unit", () => {
  assert.equal(concentrationUnit({ xTitle: "Concentration (µM)", xUnit: "M" }), "µM");
  assert.equal(concentrationUnit({ xTitle: "[Drug], nM", xUnit: "M" }), "nM");
  assert.equal(concentrationUnit({ xTitle: "log[Drug] (M)", xUnit: "µM" }), "µM");
  assert.equal(concentrationUnit({ xTitle: "X", xUnit: "M" }), "M");
  assert.equal(concentrationUnit({ xTitle: "", xUnit: "" }), "");
});

test("an IC50 above the range tested reads '> 30 µM (not reached in the range tested)'", () => {
  const d = rangeDisplay(flags, "µM")!;
  assert.equal(d.text, "IC50 > 30 µM (not reached in the range tested)");
  assert.equal(d.boundWithUnit, "> 30 µM");
  assert.equal(d.logBound, "> 1.477");
  assert.ok(isMidpoint("IC50", d) && isLogMidpoint("LogIC50", d) && !isMidpoint("Top", d));
  assert.equal(ratioText(d), "undefined (IC50 > 30 µM)");
  assert.equal(d.reasons.length, 3);
  assert.match(d.reasons[0], /above the highest concentration tested \(30 µM\)/);
  assert.match(d.reasons[1], /bottom plateau is not defined/);
  // in range: nothing to report
  assert.equal(rangeDisplay({ ...flags, report_as: null }, "µM"), null);
  assert.equal(rangeDisplay(null, "µM"), null);
});

test("the results and the sentence carry the bound, or the flagged number", () => {
  const bound = withRangeReport(result, { xTitle: "Concentration (µM)", xUnit: "M" }, {});
  const d = displayOf(bound.datasets[0].fit)!;
  assert.equal(d.mode, "bound");
  assert.ok(rangeHidesSpread("IC50", bound.datasets[0].fit) && !rangeHidesSpread("Top", bound.datasets[0].fit));
  const s = resultSentence(bound);
  assert.match(s, /IC50 > 30 µM \(not reached in the range tested\)/);
  assert.doesNotMatch(s, /IC50 = 337/);
  assert.doesNotMatch(s, /LogIC50/);
  const fitted = withRangeReport(result, { xTitle: "Concentration (µM)", xUnit: "M" },
    { extrapolatedReport: "fitted" });
  assert.equal(displayOf(fitted.datasets[0].fit)!.mode, "fitted");
  assert.match(resultSentence(fitted), /; IC50 = 337, 95% CI [^;]+ \(extrapolated, above the range tested\)/);
  // a fit in range is returned unchanged
  const inRange = { ...result, datasets: [{ ...result.datasets[0],
    fit: { ...fit, range_flags: { ...flags, report_as: null } } }] } as unknown as AnalysisResult;
  assert.equal(withRangeReport(inRange, { xTitle: "", xUnit: "M" }, {}), inRange);
});
