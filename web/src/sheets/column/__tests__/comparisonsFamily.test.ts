// Comparison families of the column post tests and the residuals payload.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { DEFAULT_COLUMN_OPTIONS, type ColumnOptionsState } from "../../../types.ts";
import {
  allPairs, effectiveFamily, familyOptions, familySize, familyTarget, togglePair, validPairs,
} from "../comparisonsFamily.ts";
import { columnPayload, residualsPayload } from "../run.ts";

const o = (patch: Partial<ColumnOptionsState>) => ({ ...DEFAULT_COLUMN_OPTIONS, ...patch });
const four = normalizeTable({
  type: "column",
  datasets: ["Control", "A", "B", "C"].map((name, i) => ({
    name, rows: [[String(1 + i)], [String(2 + i)], [String(4 + i)]],
  })),
});

test("where a family applies", () => {
  assert.equal(familyTarget(o({ analysis: "anova", anovaKind: "nonparametric" })), "dunn");
  assert.equal(familyTarget(o({ analysis: "rm_anova", rmKind: "nonparametric" })), "dunn");
  assert.equal(familyTarget(o({ analysis: "anova", comparisons: "sidak" })), "posthoc");
  assert.equal(familyTarget(o({ analysis: "anova", comparisons: "sidak" }), true), null);
  for (const m of ["tukey", "dunnett", "newman_keuls", "none"] as const) {
    assert.equal(familyTarget(o({ analysis: "anova", comparisons: m })), null, m);
  }
  assert.equal(familyTarget(o({ analysis: "anova", anovaSd: "unequal", comparisons: "sidak" })), null);
});

test("pairs, sizes and the effective family", () => {
  assert.deepEqual(allPairs(3), [[0, 1], [0, 2], [1, 2]]);
  assert.deepEqual(validPairs([[0, 1], [1, 0], [2, 2], [0, 9], [1, 2], "x"], 4), [[0, 1], [1, 2]]);
  assert.deepEqual(togglePair([[0, 1]], 1, 0, false), []);
  assert.deepEqual(togglePair([[0, 1]], 0, 2, true), [[0, 1], [0, 2]]);
  const kw = o({ analysis: "anova", anovaKind: "nonparametric" });
  assert.equal(familySize(kw, 4), 6);
  assert.equal(familySize({ ...kw, comparisonsFamily: "control" }, 4), 3);
  assert.equal(familySize({ ...kw, comparisonsFamily: "pairs", plannedPairs: [[0, 1], [2, 3]] }, 4), 2);
  // nothing ticked yet: every pair
  assert.equal(effectiveFamily({ ...kw, comparisonsFamily: "pairs", plannedPairs: [] }, 4), "all");
  assert.equal(effectiveFamily({ ...kw, comparisonsFamily: "control", controlIndex: 7 }, 4), "all");
});

test("engine options: Dunn's family and the planned post-test family", () => {
  const kw = o({ analysis: "anova", anovaKind: "nonparametric", comparisonsFamily: "control", controlIndex: 0 });
  assert.deepEqual(familyOptions(kw, 4), { dunn_family: "control", control: 0 });
  assert.deepEqual(columnPayload(four, kw).options, {
    kind: "nonparametric", comparisons: "tukey", control_index: 0,
    dunn_family: "control", control: 0 });
  const fr = o({ analysis: "rm_anova", rmKind: "nonparametric", comparisonsFamily: "pairs",
    plannedPairs: [[1, 0], [3, 0]] });
  assert.deepEqual(columnPayload(four, fr).options,
    { kind: "nonparametric", dunn_family: "pairs", pairs: [[1, 0], [3, 0]] });
  const sidak = o({ analysis: "anova", comparisons: "sidak", comparisonsFamily: "pairs",
    plannedPairs: [[0, 1], [0, 2]] });
  assert.deepEqual(columnPayload(four, sidak).options, { kind: "parametric", comparisons: "sidak",
    control_index: 0, comparisons_family: "pairs", pairs: [[0, 1], [0, 2]] });
  // Tukey keeps its own family even if a planned family was stored
  assert.deepEqual(columnPayload(four, { ...sidak, comparisons: "tukey" }).options,
    { kind: "parametric", comparisons: "tukey", control_index: 0 });
  // every pair (the default) sends nothing new
  assert.deepEqual(familyOptions(o({ analysis: "anova", anovaKind: "nonparametric" }), 4), {});
});

test("residuals payload for the tests that assume Gaussian residuals", () => {
  const t = residualsPayload(four, o({ analysis: "ttest", datasetA: 1, datasetB: 3 })) as Record<string, any>;
  assert.equal(t.analysis, "residuals_column");
  assert.deepEqual(t.data.datasets.map((d: { name: string }) => d.name), ["A", "C"]);
  assert.deepEqual(t.options, {});
  const p = residualsPayload(four, o({ analysis: "ttest", ttestKind: "paired" })) as Record<string, any>;
  assert.deepEqual(p.options, { paired: true, dataset_a: 0, dataset_b: 1 });
  assert.equal(residualsPayload(four, o({ analysis: "ttest", ttestKind: "mann_whitney" })), null);
  assert.equal((residualsPayload(four, o({ analysis: "anova" })) as Record<string, any>).data.datasets.length, 4);
  assert.ok((residualsPayload(four, o({ analysis: "anova", anovaSd: "unequal" })) as Record<string, any>).data);
  assert.equal(residualsPayload(four, o({ analysis: "anova", anovaKind: "nonparametric" })), null);
  assert.ok("unavailable" in (residualsPayload(four, o({ analysis: "rm_anova" })) as object));
  assert.equal(residualsPayload(four, o({ analysis: "column_statistics" })), null);
});
