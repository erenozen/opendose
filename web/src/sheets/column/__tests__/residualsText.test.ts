import { test } from "node:test";
import assert from "node:assert/strict";
import { rowsFromOne } from "../residualsText.ts";

test("residual warnings number rows from 1, as the grid does", () => {
  assert.equal(rowsFromOne("Treated: 1 missing or non-numeric value left out (row 2, counting from 0)."),
    "Treated: 1 missing or non-numeric value left out (row 3).");
  assert.equal(rowsFromOne("2 incomplete pairs (rows 3, 8, counting from 0) left out: a value is missing."),
    "2 incomplete pairs (rows 4, 9) left out: a value is missing.");
  assert.equal(rowsFromOne("Control: empty; the group is left out."), "Control: empty; the group is left out.");
});
