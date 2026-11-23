// Equivalence and non-inferiority (P-12): margins sent to the engine, the
// verdict, the CI line, the one-sided test rows. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  equivalenceCI, equivalenceReading, equivalenceSpec, equivalenceVerdict, marginChipLabel,
  marginText, stripGeometry, tostRows,
} from "../equivalence.ts";

// engine/tests/reference/equivalence_tost.py, acceptance data (means 10.2
// and 10.0, SD 0.5, n = 8 each): statsmodels ttost_ind
const ACC1 = { kind: "equivalence", scale: "difference", alpha: 0.05, ci_level: 0.9,
  lower: -1, upper: 1, estimate: 0.2, ci: [-0.24032753394372358, 0.6403275339437222],
  test_lower: { margin: -1, t: 4.8, p: 0.00014128233358487297 },
  test_upper: { margin: 1, t: -3.2, p: 0.003210270582712357 },
  p: 0.003210270582712357, shown: true };
const ACC05 = { ...ACC1, lower: -0.5, upper: 0.5, p: 0.1250263804141635, shown: false,
  test_lower: { margin: -0.5, t: 2.8, p: 0.007090161191469837 },
  test_upper: { margin: 0.5, t: -1.2, p: 0.1250263804141635 } };

test("margins sent to the engine", () => {
  assert.equal(equivalenceSpec("off", "1", "difference"), null);
  assert.equal(equivalenceSpec(undefined, "1", "difference"), null);
  assert.deepEqual(equivalenceSpec("equivalence", "1", "difference"),
    { lower: -1, upper: 1, scale: "difference" });
  assert.deepEqual(equivalenceSpec("equivalence", "0,5", "difference"),
    { lower: -0.5, upper: 0.5, scale: "difference" });
  assert.deepEqual(equivalenceSpec("noninferior_higher", "2", "difference"),
    { lower: -2, upper: null, scale: "difference" });
  assert.deepEqual(equivalenceSpec("noninferior_lower", "2", "difference"),
    { lower: null, upper: 2, scale: "difference" });
  assert.deepEqual(equivalenceSpec("equivalence", "1.25", "ratio"),
    { lower: 0.8, upper: 1.25, scale: "ratio" });
  // 0.8 is the same margin as 1.25
  assert.deepEqual(equivalenceSpec("equivalence", "0.8", "ratio"),
    { lower: 0.8, upper: 1.25, scale: "ratio" });
  assert.match((equivalenceSpec("equivalence", "", "difference") as { error: string }).error,
    /Enter the equivalence margin/);
  assert.match((equivalenceSpec("equivalence", "-1", "difference") as { error: string }).error,
    /above 0/);
  assert.match((equivalenceSpec("equivalence", "1", "ratio") as { error: string }).error,
    /other than 1/);
});

test("the plan's acceptance verdicts and CI", () => {
  assert.equal(equivalenceVerdict(ACC1), "Equivalent within ±1");
  assert.equal(equivalenceCI(ACC1), "90% CI -0.2403 to 0.6403");
  assert.equal(equivalenceVerdict(ACC05), "Not shown to be equivalent");
  assert.equal(marginChipLabel(ACC1), "Equivalence margin ±1: set before looking at the data?");
  const rows = tostRows(ACC1, "A", "B");
  assert.deepEqual(rows.map((r) => [r.label, r.statistic]), [
    ["Null hypothesis A − B ≤ -1", "t = 4.8"], ["Null hypothesis A − B ≥ 1", "t = -3.2"]]);
});

test("a failed TOST never reads as a difference", () => {
  const s = equivalenceReading(ACC05, "A", "B");
  assert.match(s, /equivalence is not shown/);
  assert.match(s, /does not show that the groups differ/);
  assert.doesNotMatch(equivalenceVerdict(ACC05), /differ/);
});

test("ratio margins and non-inferiority", () => {
  // log_unpaired reference: ratio 1.009, 90% CI 0.9337 to 1.091
  const r = { kind: "equivalence", scale: "ratio", lower: 0.8, upper: 1.25, ci_level: 0.9,
    estimate: 0.004082555274044886, ratio: 1.0094447537417268,
    ci: [-0.0298, 0.0380], ci_ratio: [0.9336987292802215, 1.0913356513210801],
    p: 0.00013445065785117036, shown: true, test_lower: { t: 5.25, p: 6e-5 },
    test_upper: { t: -4.83, p: 0.000134 } };
  assert.equal(equivalenceVerdict(r), "Equivalent within 0.8 to 1.25");
  assert.equal(equivalenceCI(r), "90% CI 0.9337 to 1.091");
  const ni = { ...ACC1, kind: "noninferiority", upper: null, test_upper: null,
    lower: -0.5, p: 0.00709, shown: true };
  assert.equal(marginText(ni), "above -0.5");
  assert.equal(equivalenceVerdict(ni, "New", "Old"), "Non-inferior: New − Old above -0.5");
  assert.equal(tostRows(ni).length, 1);
  assert.equal(equivalenceVerdict({ ...ni, shown: false }), "Not shown to be non-inferior");
  // score tests name z
  assert.equal(tostRows({ ...ACC1, method: "score", test_lower: { z: 2.02, p: 0.02 },
    test_upper: { z: -0.9, p: 0.18 } })[0].statistic, "z = 2.02");
});

test("the strip puts the CI inside the margin lines when equivalent", () => {
  const g = stripGeometry(ACC1)!;
  assert.ok(g.marginLo! < g.lo && g.hi < g.marginHi!);
  assert.ok(g.lo < g.est && g.est < g.hi);
  const g2 = stripGeometry(ACC05)!;
  assert.ok(g2.hi > g2.marginHi!);
  assert.equal(stripGeometry({ ...ACC1, p: null }), null);
});
