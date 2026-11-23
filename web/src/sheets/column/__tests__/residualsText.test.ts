import { test } from "node:test";
import assert from "node:assert/strict";
import { residualCaptions, rowsFromOne } from "../residualsText.ts";

test("residual captions follow the model the residuals come from", () => {
  const col = residualCaptions({});
  assert.equal(col.toggle, "Residuals: QQ plot and residuals vs. fitted");
  assert.equal(col.fittedAxis, "Fitted value (group mean)");
  assert.equal(residualCaptions({ paired: true }).fittedAxis, "Pair (row)");
  const fit = residualCaptions({ kind: "fit", residual_label: "Residual" });
  assert.equal(fit.fittedAxis, "Fitted Y (the curve)");
  assert.match(fit.teaser(27), /\(27 values\)/);
  assert.match(fit.againstFitted, /suggests weighting/);
  const w = residualCaptions({ kind: "fit", weighted: true, residual_label: "Weighted residual" });
  assert.equal(w.residualAxis, "Weighted residual");
  assert.match(w.againstFitted, /weighting does not match/);
  const m = residualCaptions({ kind: "model", fitted_label: "Fitted value (cell mean)" });
  assert.equal(m.fittedAxis, "Fitted value (cell mean)");
  assert.equal(m.fittedLabel, "Residuals against the fitted values (cell mean), with a zero line");
});

test("no caption for a fit or a model suggests choosing a test from a normality P", () => {
  for (const d of [{ kind: "fit" }, { kind: "model" }]) {
    const c = residualCaptions(d);
    for (const s of [c.qq, c.againstFitted, c.againstX, c.teaser(10)]) {
      assert.doesNotMatch(s, /nonparametric|ranks|Mann-Whitney|Kruskal/i);
    }
  }
});

test("residual warnings number rows from 1, as the grid does", () => {
  assert.equal(rowsFromOne("Treated: 1 missing or non-numeric value left out (row 2, counting from 0)."),
    "Treated: 1 missing or non-numeric value left out (row 3).");
  assert.equal(rowsFromOne("2 incomplete pairs (rows 3, 8, counting from 0) left out: a value is missing."),
    "2 incomplete pairs (rows 4, 9) left out: a value is missing.");
  assert.equal(rowsFromOne("Control: empty; the group is left out."), "Control: empty; the group is left out.");
});
