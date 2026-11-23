// Ratio to control (P-18): the typeset row, the unbounded wording and the
// "What this means" clause. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { ratioClause, ratioText } from "../ratioToControl.ts";
import { meaningOf } from "../meaning.ts";

// engine/tests/reference/fieller_ratio.py: control 100, 95, 105, 98, 102;
// treated 60, 70, 65, 55, 75 (pooled SD, df 8)
const RATIO = { value: 0.65, ci: [0.5761502119401463, 0.7291946458111488], unbounded: false,
  ci_level: 0.95, numerator: "Treated", denominator: "Control" };

test("ratio and its Fieller CI at display precision", () => {
  const t = ratioText(RATIO, "Control");
  assert.deepEqual(t, { value: "0.65 (65% of Control)", ratio: "0.65", percent: "65%",
    ci: "0.5762 to 0.7292", unbounded: false });
});

test("an unbounded interval is said, not printed", () => {
  const t = ratioText({ value: 15, ci: null, unbounded: true }, "Control");
  assert.equal(t?.ci, "unbounded: the mean of Control is not clearly different from zero");
  assert.equal(ratioClause({ value: 15, ci: null, unbounded: true }, "Treated", "Control"),
    "Treated/Control = 15, a ratio whose 95% CI is unbounded because the mean of Control is not clearly different from zero");
  assert.equal(ratioText({ value: null }, "Control"), null);
  assert.equal(ratioText(null, "Control"), null);
});

test("the unpaired t test sentence uses the ratio and its CI", () => {
  const result = { analysis: "ttest", test: "unpaired_t", names: ["Control", "Treated"],
    p_two_tailed: 0.00002, difference: 35, ci_difference: [27.1, 42.9], mean_a: 100, mean_b: 65,
    ratio_to_control: RATIO };
  const m = meaningOf({ result, options: { analysis: "ttest" }, table: null, analysisId: "column" });
  assert.ok(m);
  assert.match(m.sentence, /^On average Treated was 35 lower than Control \(mean 65 vs\. 100; Treated\/Control = 0\.65, 95% CI 0\.5762 to 0\.7292 by Fieller's method\)/);
  assert.doesNotMatch(m.sentence, /35% lower/);
  // without a ratio (Welch, older results) the percentage stays
  const w = meaningOf({ result: { ...result, test: "welch_t", ratio_to_control: undefined },
    options: { analysis: "ttest" }, table: null, analysisId: "column" });
  assert.match(w!.sentence, /\(mean 65 vs\. 100, 35% lower\)/);
});
