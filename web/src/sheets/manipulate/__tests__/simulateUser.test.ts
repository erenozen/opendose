// Simulating from a user-defined equation (P-51): the parameters a form
// offers and the methods phrase. The ideal curve itself is checked in
// engine/tests/test_simulate_user_equation.py and the dialog end to end
// in scripts/e2e-results.mjs. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import type { UserEquationDef } from "../../../lib/userEquation.ts";
import { userEquationPhrase, userSimParams } from "../simulateUser.ts";

const decay = {
  id: "eq1", name: "Decay", text: "Y = A*exp(-k*X) ; first order\n", xIsLog: false,
  rules: {
    A: { kind: "rule", value: "1", op: "*", of: "YMAX" },
    k: { kind: "value", value: "0,3", op: "*", of: "YMAX" },
    B: { kind: "value", value: "", op: "*", of: "YMAX" },
  },
  constraints: {}, transforms: [],
} as unknown as UserEquationDef;

test("every rule's parameter is offered, plain numbers as their values", () => {
  assert.deepEqual(userSimParams(decay), [
    { name: "A", label: "A", value: 1 },
    { name: "k", label: "k", value: 0.3 },
    { name: "B", label: "B", value: 1 },
  ]);
});

test("the methods phrase names the equation without its comments", () => {
  assert.equal(userEquationPhrase(decay), "the user-defined equation “Decay” (Y = A*exp(-k*X))");
  assert.equal(userEquationPhrase({ ...decay, name: " ", text: "a = 2*X\nY = a + C" }),
    "the user-defined equation “User-defined equation” (a = 2*X; Y = a + C)");
});
