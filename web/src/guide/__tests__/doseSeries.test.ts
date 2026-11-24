// Dose-series planning: payload, sentences, simulation rows. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ciSentence, defaultDoseForm, doseOptions, planNote, seriesLabel, simRows, type DosePlanResult,
} from "../doseSeries.ts";

test("payload: the design sets the slope's sign; plateaus ordered", () => {
  const down = doseOptions(defaultDoseForm(), false);
  assert.ok("options" in down);
  assert.deepEqual(down.options, { ic50: 1, hill: -1, top: 100, bottom: 0, sd: 5, replicates: 3, top_dose: 56.2,
    n_doses: 8, dilution: 3.162 });
  const up = doseOptions({ ...defaultDoseForm(), hill: "-1.5", top: "10", bottom: "80" }, true);
  assert.ok("options" in up);
  assert.equal(up.options.hill, 1.5);
  assert.equal(up.options.top, 80);
  assert.equal(up.options.bottom, 10);
});

test("payload: problems name the field and what to enter", () => {
  const err = (p: Partial<ReturnType<typeof defaultDoseForm>>) =>
    (doseOptions({ ...defaultDoseForm(), ...p }, false) as { error: string }).error;
  assert.match(err({ ic50: "0" }), /Expected IC50: enter a concentration above 0/);
  assert.match(err({ hill: "0" }), /Hill slope/);
  assert.match(err({ bottom: "100" }), /different from the top/);
  assert.match(err({ sd: "" }), /SD of one well/);
  assert.match(err({ replicates: "1.5" }), /whole number from 1 to 24/);
  assert.match(err({ nDoses: "1" }), /from 2 to 48/);
  assert.match(err({ dilution: "1" }), /above 1/);
  // decimal comma
  const c = doseOptions({ ...defaultDoseForm(), ic50: "0,5" }, false);
  assert.ok("options" in c);
  assert.equal(c.options.ic50, 0.5);
});

const RESULT: DosePlanResult = {
  doses: [0.0178, 0.0562, 0.178, 0.562, 1.78, 5.62, 17.8, 56.2], replicates: 3, n_observations: 24,
  log_step: 0.5, range_log_units: 3.5, estimable: true, df: 20, ic50: 1, hill: -1,
  expected_ci: { log_width: 0.2253, fold_width: 1.68, lower: 0.77151, upper: 1.29615, log_halfwidth: 0.11266 },
  plateaus: { top: { end: "low concentrations", doses_beyond_bend: 3, defined: true },
    bottom: { end: "high concentrations", doses_beyond_bend: 3, defined: true } },
  bend_points: { low: 0.2137, high: 4.68 }, ic50_in_range: true, flags: [],
};

test("sentences: series, expected CI, the plan note", () => {
  assert.equal(seriesLabel(RESULT, "µM"),
    "8 concentrations from 0.0178 to 56.2\u00a0µM, × 3.16 apart, 3 replicates each");
  assert.equal(ciSentence(RESULT, "µM"),
    "Expected 95% CI of the IC50: 0.772 to 1.3\u00a0µM, a 1.68-fold range (± 0.113 log units).");
  assert.equal(ciSentence({ ...RESULT, expected_ci: undefined, estimable: false }, "µM"),
    "No expected CI: the planned series cannot estimate the IC50 (see below).");
  const flagged = { ...RESULT, flags: [{ id: "top_plateau", text: "The top plateau will not be defined." }] };
  assert.match(planNote(flagged, "µM"), /^Dose series: 8 concentrations.*Assumed: IC50 1\sµM, Hill slope -1\. Flags: The top plateau/);
});

test("simulation rows", () => {
  const rows = simRows({ n_sim: 200, coverage: 0.94, coverage_se: 0.0168, median_log_width: 0.222,
    median_fold_width: 1.667, fraction_without_ci: 0, fraction_ambiguous: 0.005 }, 1.68);
  assert.deepEqual(rows, [
    ["Median CI of the IC50 (fold range)", "1.67-fold"],
    ["Expected (from the information matrix)", "1.68-fold"],
    ["CIs that contain the true IC50", "94% (Monte Carlo SE 1.68%)"],
    ["Fits flagged ambiguous", "0.5%"],
    ["Fits without a usable CI", "0%"],
    ["Simulated experiments", "200"],
  ]);
});
