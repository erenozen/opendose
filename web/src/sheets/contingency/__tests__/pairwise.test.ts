// Pairwise comparisons of rows (P-14): the payload, the test named for
// each pair, the methods sentence. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { contingencyPayload, DEFAULT_CONTINGENCY, pairwiseOptions } from "../run.ts";
import { pairTestText, pairwiseMethods } from "../pairwiseText.ts";

const C3 = { counts: [[18, 2], [15, 5], [5, 15]], rowTitles: ["WT", "Het", "KO"], colTitles: ["Pos", "Neg"] };

test("the engine is asked only with three or more rows and a correction", () => {
  assert.deepEqual(pairwiseOptions(C3, DEFAULT_CONTINGENCY), {});
  assert.deepEqual(pairwiseOptions(C3, { ...DEFAULT_CONTINGENCY, pairwise: "holm" }),
    { pairwise: { method: "holm", test: "auto" }, row_names: ["WT", "Het", "KO"] });
  const two = { ...C3, counts: C3.counts.slice(0, 2), rowTitles: ["WT", "Het"] };
  assert.deepEqual(pairwiseOptions(two, { ...DEFAULT_CONTINGENCY, pairwise: "holm" }), {});
  // default options still send exactly what they always did
  assert.deepEqual((contingencyPayload(C3, DEFAULT_CONTINGENCY) as { options: object }).options, {});
});

test("each pair names its test and why", () => {
  // engine/tests/reference/pairwise_proportions.py, acceptance data
  assert.equal(pairTestText({ test: "fisher", reason: "an expected count below 5" }),
    "Fisher's exact (an expected count below 5)");
  assert.equal(pairTestText({ test: "chi_square", yates: true, reason: "every expected count 5 or more" }),
    "Chi-square with Yates' correction (every expected count 5 or more)");
  assert.equal(pairTestText({ test: "fisher", reason: "chosen" }), "Fisher's exact");
  assert.equal(pairTestText({ test: null, note: "no test: a row has no counts" }), "no test: a row has no counts");
});

test("the methods sentence names the rule and the family", () => {
  assert.equal(pairwiseMethods({ comparisons: [{}, {}, {}], test: "auto", method: "holm", family: { size: 3 } }),
    "Each pair of rows was compared by Fisher's exact test when any expected count was below 5 and "
    + "otherwise by the chi-square test, with P values adjusted over 3 comparisons (Holm).");
  assert.match(pairwiseMethods({ comparisons: [{}], test: "fisher", method: "bh", family: { size: 1 } }),
    /by Fisher's exact test, .*\(Benjamini-Hochberg, false discovery rate\)/);
  assert.equal(pairwiseMethods(null), "");
});
