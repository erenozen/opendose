// Unit tests for the custom contrasts' stored form, checks and payload (P-83).
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coefficientProblem, contrastsOption, contrastText, defaultName, normalizeContrasts,
} from "../customContrasts.ts";

test("stored contrasts: only well-formed ones survive", () => {
  assert.deepEqual(normalizeContrasts(undefined), []);
  assert.deepEqual(normalizeContrasts([{ coefficients: [1, -1] }, { coefficients: [1, "x"] }, null, {}]),
    [{ name: "", coefficients: [1, -1], planned: false }]);
  assert.deepEqual(normalizeContrasts([{ name: "A", coefficients: [-2, 1, 1], planned: true }]),
    [{ name: "A", coefficients: [-2, 1, 1], planned: true }]);
});

test("the engine option is sent only when a contrast is set", () => {
  assert.deepEqual(contrastsOption(undefined), {});
  assert.deepEqual(contrastsOption([]), {});
  assert.deepEqual(contrastsOption([{ name: "A", coefficients: [1, -1], planned: false }]),
    { custom_contrasts: [{ name: "A", coefficients: [1, -1], planned: false }] });
});

test("typed coefficients: every mean, two non-zero, adding up to 0", () => {
  assert.match(coefficientProblem([1, null, -1]) ?? "", /^Enter a coefficient for every mean/);
  assert.match(coefficientProblem([1, 0, 0]) ?? "", /^Enter at least two/);
  assert.equal(coefficientProblem([1, 1, 1]), "Make the coefficients add up to 0 (they add up to 3)");
  assert.equal(coefficientProblem([-2, 1, 1]), null);
  assert.equal(coefficientProblem([0.5, 0.5, -1]), null);
  assert.equal(coefficientProblem([0.1, 0.2, -0.3]), null);   // rounding of 0.1 + 0.2
});

test("contrast text and default names", () => {
  assert.equal(contrastText([-2, 1, 1], ["Vehicle", "Drug A", "Drug B"]), "−2 × Vehicle + Drug A + Drug B");
  assert.equal(contrastText([1, 0, -1], ["a", "b", "c"]), "a − c");
  assert.equal(contrastText([0.5, 0.5, -1], ["a", "b", "c"]), "0.5 × a + 0.5 × b − c");
  assert.equal(defaultName([]), "Contrast 1");
});
