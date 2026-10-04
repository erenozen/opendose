// Synergy results: the matrices a view shows (observed, expected, ZIP
// fitted, synergy), the results table's choices, and the flags on the
// Chou-Talalay table. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isMatrixView, matricesFor, monotherapyIssues, scoresVsCi, viewMatrix, type SynergyModel,
} from "../synergyModel.ts";

const m = (v: number) => [[0, v], [v, v]];
const result = {
  drug1: "A", drug2: "B",
  response: m(1),
  models: {
    hsa: { reference: m(2), synergy: m(3), score: 12 },
    bliss: { reference: m(4), synergy: m(5), score: 14 },
    loewe: { reference: m(6), synergy: m(7), score: 11 },
    zip: { reference: m(8), synergy: m(9), fitted: m(10), score: 13 },
  },
  monotherapy: { drug1: { fitted: true, r_squared: 0.98 }, drug2: { fitted: true, r_squared: 0.95 } },
  chou_talalay: {
    drug1: { m: 1.2, Dm: 3, r: 0.97 }, drug2: { m: -0.4, Dm: 2, r: -0.55 },
    combinations: [{ ci: 3 }, { ci: 1e28 }, { ci: 0.8 }, { ci: null }],
  },
};

test("each view reads its matrix from the engine result", () => {
  assert.deepEqual(viewMatrix(result, "observed"), m(1));
  assert.deepEqual(viewMatrix(result, "hsa_expected"), m(2));
  assert.deepEqual(viewMatrix(result, "bliss_synergy"), m(5));
  assert.deepEqual(viewMatrix(result, "loewe_expected"), m(6));
  assert.deepEqual(viewMatrix(result, "zip_expected"), m(8));
  assert.deepEqual(viewMatrix(result, "zip_fitted"), m(10));
  assert.equal(viewMatrix({ ...result, models: { hsa: {} } }, "zip_fitted"), null);
  assert.equal(viewMatrix({ error: "x" }, "observed"), null);
  assert.ok(isMatrixView("bliss_expected") && !isMatrixView("synergy") && !isMatrixView(undefined));
});

test("results table choices: default, every matrix of the shown models, one", () => {
  const keys = (c: Parameters<typeof matricesFor>[0], shown: SynergyModel[] = ["hsa", "bliss", "loewe", "zip"]) =>
    matricesFor(c, shown).map((d) => d.key);
  assert.deepEqual(keys("default"), ["observed", "hsa_synergy", "bliss_synergy", "loewe_synergy", "zip_synergy"]);
  assert.deepEqual(keys("default", ["bliss"]), ["observed", "bliss_synergy"]);
  assert.deepEqual(keys("all", ["bliss", "zip"]),
    ["observed", "bliss_expected", "zip_expected", "zip_fitted", "bliss_synergy", "zip_synergy"]);
  assert.deepEqual(keys("loewe_expected"), ["loewe_expected"]);
});

test("a failed or wrong-way monotherapy fit is flagged, and the contradiction with the scores", () => {
  const issues = monotherapyIssues(result);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /median-effect line of B slopes the wrong way \(r = -0\.55/);
  const failed = monotherapyIssues({ ...result, monotherapy: { drug1: { fitted: false }, drug2: { fitted: true, r_squared: 0.5 } },
    chou_talalay: { ...result.chou_talalay, drug1: null, drug2: { r: 0.8 } } });
  assert.deepEqual(failed, [
    "the four-parameter fit of A alone failed",
    "A has no median-effect line (fewer than two doses with Fa between 0 and 1)",
    "the four-parameter fit of B alone is poor (R² = 0.5)",
    "the median-effect line of B fits poorly (r = 0.8)",
  ]);
  // scores all above 10, median CI 3: they disagree
  assert.match(scoresVsCi(result, ["hsa", "bliss", "loewe", "zip"])!, /likely synergistic.*median combination index is 3 \(antagonism\)/);
  const agree = { ...result, chou_talalay: { ...result.chou_talalay, combinations: [{ ci: 0.5 }, { ci: 0.7 }] } };
  assert.equal(scoresVsCi(agree, ["hsa", "bliss"]), null);
  assert.equal(monotherapyIssues({ ...result, chou_talalay: { ...result.chou_talalay, drug2: { r: 0.95 } } }).length, 0);
});
