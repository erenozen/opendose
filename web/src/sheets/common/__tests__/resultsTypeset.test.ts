// Which results cells align right (resultsTypeset.ts): numbers, ranges
// and statistics do; words do not.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { numericCell } from "../resultsTypeset.ts";

test("numbers, ranges and statistics are numeric", () => {
  for (const t of ["−6.983", "1.040e-7", "9.694e-8 to 1.115e-7", "< 0.0001 ****", "n/a",
    "F(2, 12) = 4.5", "t=3.2, df=10", "10.0 ± 0.5 (n=3)", "= 100", "27"]) {
    assert.equal(numericCell(t), true, t);
  }
});

test("words are text, blanks are neither", () => {
  for (const t of ["not reported (extrapolated)", "(constrained)", "Yes", "model adequate",
    "withheld: one value per group gives no estimate"]) {
    assert.equal(numericCell(t), false, t);
  }
  assert.equal(numericCell("  "), null);
});
