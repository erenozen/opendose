// The zero-dose note: what is offered for one curve and for several.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_XY_OPTIONS, type AnalysisResult, type OptionsState } from "../../../types.ts";
import { withConstraint } from "../fitOptions.ts";
import { zeroDosePlan } from "../zeroDose.ts";

const ds = (name: string, top: number, bottom: number, dropped?: { n: number; mean: number }) => ({
  name, points: { x: [], bars: [] },
  fit: { params: { Top: { value: top }, Bottom: { value: bottom } } },
  ...(dropped ? { log_x_dropped: { n_values: dropped.n, x_values: [0], mean_y: dropped.mean } } : {}),
});
const res = (...d: unknown[]) => ({ analysis: "dose_response", datasets: d }) as unknown as AnalysisResult;
const O: OptionsState = { ...DEFAULT_XY_OPTIONS, model: "log_inhibitor_vs_response_4pl" };

test("one inhibitor curve: offers to constrain Top to the zero-dose mean", () => {
  const p = zeroDosePlan(res(ds("A", 103.05, 12.1, { n: 2, mean: 98.5 })), O)!;
  assert.deepEqual(p.groups, [{ name: "A", n: 2, mean: 98.5, x: [0] }]);
  assert.equal(p.plateau, "Top");
  assert.equal(p.value, "98.5");
  assert.equal(p.constrained, false);
  // once constrained, it says so instead of offering it again
  const c = zeroDosePlan(res(ds("A", 98.5, 12.1, { n: 2, mean: 98.5 })),
    withConstraint(O, "Top", { enabled: true, value: "98.5" }))!;
  assert.equal(c.constrained, true);
});

test("an agonist curve's zero dose is its bottom plateau", () => {
  const p = zeroDosePlan(res(ds("A", 95, 4.8, { n: 3, mean: 5.2 })),
    { ...O, model: "log_agonist_vs_response_4pl" })!;
  assert.equal(p.plateau, "Bottom");
  assert.equal(p.value, "5.2");
});

test("several curves: the note per group, no shared constraint", () => {
  const p = zeroDosePlan(res(ds("A", 100, 10, { n: 2, mean: 98 }), ds("B", 80, 5, { n: 2, mean: 79 })), O)!;
  assert.equal(p.groups.length, 2);
  assert.equal(p.plateau, null);
  assert.equal(p.value, null);
});

test("no zero dose, or a failed analysis: nothing to show", () => {
  assert.equal(zeroDosePlan(res(ds("A", 100, 10)), O), null);
  assert.equal(zeroDosePlan({ analysis: "dose_response", datasets: [], error: "x" } as AnalysisResult, O), null);
});
