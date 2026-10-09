// "How this is validated": which pinned checks belong to an analysis and
// the sentence that counts them. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checksIn, validationScope, validationSentence } from "../validationIndex.ts";

const manifest = JSON.parse(readFileSync(new URL("../validation.json", import.meta.url), "utf8")) as
  { checks: { group: string; analysis: string }[] };
const checks = manifest.checks;
const of = (id: string, o?: unknown) => checksIn(checks, validationScope(id, o));

test("Dunnett after one-way ANOVA: the Dunnett checks only", () => {
  const c = of("column", { analysis: "anova", comparisons: "dunnett" });
  assert.ok(c.length >= 5);
  assert.ok(c.every((x) => /^Dunnett/.test(x.analysis)));
  assert.ok(c.some((x) => x.group === "Published table"));
  assert.match(validationSentence(c), /^Checked against SciPy, \d+ published tables? and/);
});

test("nonlinear regression includes the Prism results-sheet comparisons", () => {
  const c = of("nonlin");
  assert.ok(c.some((x) => x.group === "Prism screenshot"));
  assert.ok(c.every((x) => /nonlinear regression/i.test(x.analysis)));
});

test("linear regression does not borrow the nonlinear checks", () => {
  assert.equal(of("linear_regression").filter((x) => /nonlinear/i.test(x.analysis)).length, 0);
});

test("the unpaired t test does not count paired, nested or multiple t tests", () => {
  for (const x of of("column", { analysis: "ttest", ttestKind: "welch" })) {
    assert.doesNotMatch(x.analysis, /paired|nested|multiple/i);
  }
  assert.ok(of("column", { analysis: "ttest", ttestKind: "paired" })
    .every((x) => /^paired t test/i.test(x.analysis)));
});

test("contingency excludes the goodness-of-fit example; correlation excludes Clopper-Pearson", () => {
  assert.ok(of("contingency").length > 5);
  assert.ok(of("contingency").every((x) => !/goodness of fit/i.test(x.analysis)));
  assert.ok(of("column", { analysis: "correlation" }).every((x) => !/Clopper/.test(x.analysis)));
});

test("unknown analyses have no scope; empty lists have no sentence", () => {
  assert.equal(validationScope("transpose"), null);
  assert.deepEqual(checksIn(checks, null), []);
  assert.equal(validationSentence([]), "");
});

test("the sentence counts distinct cases per kind of reference", () => {
  assert.equal(validationSentence([
    { group: "R", analysis: "a" }, { group: "statsmodels", analysis: "b" },
    { group: "Published example", analysis: "c" }, { group: "Published example", analysis: "c" },
    { group: "Published example", analysis: "d" }, { group: "Published table", analysis: "e" },
  ]), "Checked against R, statsmodels, 1 published table and 2 published examples (6 pinned checks).");
});
