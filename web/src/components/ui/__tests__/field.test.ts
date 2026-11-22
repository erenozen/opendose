// Field validation timing (reward early, punish late) and number checks.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextShown, numberProblem, parseNumber, visibleProblem } from "../Field.validation.ts";

/** Plays a sequence of [event, problem] and returns what the field shows
 *  after each step. */
function play(steps: ["change" | "blur" | "submit", string | null][]): (string | null)[] {
  let shown = false;
  return steps.map(([ev, problem]) => {
    shown = nextShown(shown, ev, !!problem);
    return visibleProblem(shown, problem);
  });
}

test("no error while the first attempt is typed", () => {
  assert.deepEqual(play([["change", "Enter a number"], ["change", "Enter a number"]]), [null, null]);
});

test("the error shows on blur, and on a submit attempt", () => {
  assert.deepEqual(play([["change", "Enter a number"], ["blur", "Enter a number"]]), [null, "Enter a number"]);
  assert.deepEqual(play([["change", "Too big"], ["submit", "Too big"]]), [null, "Too big"]);
});

test("once shown, it follows each change and clears the moment the value is valid", () => {
  assert.deepEqual(play([
    ["change", "Enter a number"], ["blur", "Enter a number"],
    ["change", "Enter 1 or more"], ["change", null],
  ]), [null, "Enter a number", "Enter 1 or more", null]);
});

test("after being fixed, a new problem waits for the next blur again", () => {
  assert.deepEqual(play([
    ["blur", "Enter a number"], ["change", null], ["change", "Enter a number"], ["blur", "Enter a number"],
  ]), ["Enter a number", null, null, "Enter a number"]);
});

test("a valid blur or submit shows nothing", () => {
  assert.deepEqual(play([["blur", null], ["submit", null]]), [null, null]);
});

test("number problems: blank, not a number, whole numbers, range", () => {
  assert.equal(numberProblem(""), null);
  assert.equal(numberProblem("  ", { required: true }), "Enter a number");
  assert.equal(numberProblem("abc"), "Enter a number");
  assert.equal(numberProblem("1e-7"), null);
  assert.equal(numberProblem("2.5", { integer: true }), "Enter a whole number");
  assert.equal(numberProblem("-1", { min: 0 }), "Enter 0 or more");
  assert.equal(numberProblem("101", { max: 100 }), "Enter 100 or less");
  assert.equal(numberProblem("50", { min: 0, max: 100 }), null);
});

test("parseNumber takes a decimal comma and exponents, nothing else", () => {
  assert.equal(parseNumber("0,5"), 0.5);
  assert.equal(parseNumber("-3.25e2"), -325);
  assert.equal(parseNumber(".5"), 0.5);
  assert.equal(parseNumber("1,000.5"), null);
  assert.equal(parseNumber("12abc"), null);
  assert.equal(parseNumber("Infinity"), null);
});
