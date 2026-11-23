// Numbers in prose stay on one line (Num.runs.ts): the runs rebuild the
// text exactly, and each number, comparator or range is one run.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { numberRuns } from "../Num.runs.ts";

const nums = (s: string) => numberRuns(s).filter((r) => r.num).map((r) => r.text);

test("the runs rebuild the sentence exactly", () => {
  const s = "Drug A gives a response halfway (Bottom 0.9801, Top 99.86) at 104 nM, P < 0.0001.";
  assert.equal(numberRuns(s).map((r) => r.text).join(""), s);
});

test("e-notation, comparators, P and ranges stay whole", () => {
  assert.deepEqual(nums("IC50 1.04e-7 (95% CI 9.694e-8 to 1.115e-7), P < 0.0001"),
    ["1.04e-7", "95%", "9.694e-8 to 1.115e-7", "P < 0.0001"]);
  assert.deepEqual(nums("n = 6 per group, difference −6.983"), ["n = 6", "−6.983"]);
});

test("digits inside a word are part of the word", () => {
  assert.deepEqual(nums("IC50 and log10 and EC50"), []);
});
