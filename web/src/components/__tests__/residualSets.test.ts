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

test("column tests keep theirs under the results", () => {
  assert.deepEqual(residualSets({ analysis: "ttest", residual_check: { points: [] } }), []);
  assert.deepEqual(residualSets({ error: "x", datasets: [{ residual_check: {} }] }), []);
  assert.deepEqual(residualSets(null), []);
});
