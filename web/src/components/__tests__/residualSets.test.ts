import { test } from "node:test";
import assert from "node:assert/strict";
import { residualSets } from "../residualSets.ts";

const rc = (n: number) => ({ kind: "fit", points: [], n_qq: n });

test("one residual set per fitted data set, titled by its name", () => {
  const sets = residualSets({ analysis: "dose_response", datasets: [
    { name: "Drug A", fit: {}, residual_check: rc(27) },
    { name: "Drug B", error: "did not converge" },
    { name: "  ", fit: {}, residual_check: rc(9) },
  ] });
  assert.deepEqual(sets.map((s) => [s.key, s.title]), [["ds-0", "Drug A"], ["ds-2", "Data set 3"]]);
  assert.equal(sets[0].data.n_qq, 27);
});

test("a model's residuals come once, untitled; column tests keep theirs", () => {
  assert.deepEqual(residualSets({ analysis: "two_way_anova", residual_diagnostics: { kind: "model" } })
    .map((s) => s.key), ["model"]);
  assert.deepEqual(residualSets({ analysis: "ttest", residual_check: { points: [] } }), []);
  assert.deepEqual(residualSets({ error: "x", residual_diagnostics: {} }), []);
  assert.deepEqual(residualSets(null), []);
});
