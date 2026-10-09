// "Which test?" routes to the Wave 3 mixed models: cells or technical
// repeats in a two-factor design -> the nested two-way ANOVA; the same
// subjects over time -> the time-course module as an alternative.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DESIGN, recommend, type Design } from "../recommend.ts";

const d = (patch: Partial<Design>): Design => ({ ...DEFAULT_DESIGN, ...patch });

test("cells within animals and two factors: nested two-way ANOVA on a grouped table", () => {
  const r = recommend(d({ factors: "two", replicates: "cells" }));
  assert.equal(r.rule, "nested_two_way");
  assert.equal(r.target?.tableType, "grouped");
  assert.equal(r.target?.analysisId, "grouped_nested_two_way");
  assert.equal(r.target?.options.comparisons, "tukey");
  assert.match(r.reason, /df come from the units/);
  assert.ok(r.sources.some((s) => /Lazic 2010/.test(s.label)));
  assert.equal(r.alternatives[0].target?.analysisId, "grouped_two_way");
  // technical repeats, each vs a control
  const c = recommend(d({ factors: "two", replicates: "technical", question: "control" }));
  assert.equal(c.rule, "nested_two_way");
  assert.equal(c.target?.options.comparisons, "dunnett");
});

test("independent values in two factors are unchanged (two-way ANOVA)", () => {
  assert.equal(recommend(d({ factors: "two" })).rule, "two_way");
});

test("one repeated factor: the time-course module is offered as an alternative", () => {
  const r = recommend(d({ factors: "two", repeated: "one" }));
  assert.equal(r.rule, "two_way_rm");
  const tc = r.alternatives.find((a) => a.target?.analysisId === "assay_timecourse_mixed");
  assert.ok(tc);
  assert.equal(tc!.target?.tableType, "grouped");
  assert.match(tc!.when, /AR\(1\)/);
  assert.ok(!recommend(d({ factors: "two" })).alternatives
    .some((a) => a.target?.analysisId === "assay_timecourse_mixed"));
});
