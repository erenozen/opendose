// "Plan next experiment": the pilot's SD read off a t test / ANOVA result
// and the form it fills in. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultForm, powerPayload } from "../power.ts";
import { pilotForm, pilotFromResult, pilotSdText, withEffect } from "../pilot.ts";

// Two groups of 4: A = 1, 2, 3, 4 (SD 1.291), B = 3, 4, 5, 6 (SD 1.291).
const sd = Math.sqrt(5 / 3);
const unpaired = {
  test: "unpaired_t", names: ["A", "B"], mean_a: 2.5, mean_b: 4.5,
  sem_a: sd / 2, sem_b: sd / 2, n_a: 4, n_b: 4,
};

test("unpaired t: pooled SD from the SEMs and n, the observed difference", () => {
  const p = pilotFromResult("column", { analysis: "ttest", ttestKind: "unpaired" }, unpaired, "Pilot");
  assert.ok(p);
  assert.equal(p!.kind, "t_two_sample");
  assert.ok(Math.abs(p!.sd - sd) < 1e-12);
  assert.equal(p!.observed, 2);
  assert.equal(pilotSdText(p!), "SD = 1.291 (pooled SD of A and B, n = 4 per group)");
});

test("paired t: SD of the differences = SE × √n", () => {
  const p = pilotFromResult("column", { analysis: "ttest", ttestKind: "paired" },
    { test: "paired_t", names: ["Before", "After"], mean_difference: 1.5, se_difference: 0.5, n_pairs: 9 },
    "Pilot");
  assert.equal(p!.kind, "t_paired");
  assert.equal(p!.sd, 1.5);
  assert.equal(p!.observed, 1.5);
});

test("one-way ANOVA: √MS residual and the group means", () => {
  const p = pilotFromResult("column", { analysis: "anova" }, {
    table: { ms_within: 4 },
    group_summaries: [{ name: "C", n: 5, mean: 10, sd: 2 }, { name: "D1", n: 5, mean: 12, sd: 2 },
      { name: "D2", n: 5, mean: 15, sd: 2 }],
  }, "Pilot");
  assert.equal(p!.kind, "anova_oneway");
  assert.equal(p!.sd, 2);
  assert.equal(p!.observed, 5);
});

test("no SD to plan with: rank tests, errors, other analyses", () => {
  assert.equal(pilotFromResult("column", { analysis: "ttest", ttestKind: "mann_whitney" },
    { test: "mann_whitney" }, "x"), null);
  assert.equal(pilotFromResult("column", { analysis: "ttest" }, { error: "too few" }, "x"), null);
  assert.equal(pilotFromResult("nonlin", {}, unpaired, "x"), null);
  assert.equal(pilotFromResult("column", { analysis: "ttest" }, null, "x"), null);
});

test("the form solves for n at 80% power with the pilot SD and no effect yet", () => {
  const p = pilotFromResult("column", { analysis: "ttest", ttestKind: "unpaired" }, unpaired, "Pilot")!;
  const f = pilotForm(defaultForm(), p);
  assert.deepEqual([f.kind, f.solve, f.power, f.sd, f.d], ["t_two_sample", "n", "0.8", "1.291", ""]);
  // nothing to compute until the effect is chosen
  assert.ok("error" in powerPayload(f));
});

test("a relevant difference sets d = Δ / SD and says where it came from", () => {
  const p = pilotFromResult("column", { analysis: "ttest", ttestKind: "unpaired" }, unpaired, "Pilot")!;
  const f = withEffect(pilotForm(defaultForm(), p), p, { kind: "relevant", difference: 1 })!;
  assert.equal(f.d, String(Number((1 / sd).toPrecision(4))));
  assert.equal(f.mean1, "2.5");
  assert.equal(f.mean2, "3.5");
  assert.match(f.effectSource, /^a difference of 1 judged biologically relevant and the pooled SD of A and B in the pilot experiment “Pilot” \(1\.291; unpaired t test, n = 4 per group\)$/);
  const pp = powerPayload(f);
  assert.ok("payload" in pp);
  assert.equal(pp.payload.options.d, Number((1 / sd).toPrecision(4)));
  assert.equal(withEffect(f, p, { kind: "relevant", difference: 0 }), null);
});

test("the pilot difference is labelled as observed and imprecise", () => {
  const p = pilotFromResult("column", { analysis: "ttest", ttestKind: "unpaired" }, unpaired, "Pilot")!;
  const f = withEffect(pilotForm(defaultForm(), p), p, { kind: "pilot" })!;
  assert.equal(f.d, "1.549");
  assert.match(f.effectSource, /difference observed in the pilot \(2, an imprecise estimate\)/);
});

test("ANOVA: a difference that matters between two means, the others midway (f = Δ / (σ√(2k)))", () => {
  const p = pilotFromResult("column", { analysis: "anova" }, {
    table: { ms_within: 4 },
    group_summaries: [{ name: "C", n: 5, mean: 10 }, { name: "D1", n: 5, mean: 12 }, { name: "D2", n: 5, mean: 15 }],
  }, "Pilot")!;
  const f = withEffect(pilotForm(defaultForm(), p), p, { kind: "relevant", difference: 3 })!;
  assert.equal(f.groupMeans, "10, 13, 11.5");
  assert.equal(f.f, String(Number((3 / (2 * Math.sqrt(6))).toPrecision(4))));
  assert.equal(f.k, "3");
});
