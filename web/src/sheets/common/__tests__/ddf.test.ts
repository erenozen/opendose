// Denominator df setting of the mixed models (ddf.ts), and how the sheets
// keep it: new sheets Kenward-Roger, saved sheets containment.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { DDF_NEW_SHEET, ddfMethodsSentence, ddfName, ddfOf } from "../ddf.ts";
import { normalizeTwoWay } from "../../grouped/options.ts";
import { rmMethodsSentence } from "../../column/rmPosthoc.ts";

test("absent or unknown = containment; new sheets = Kenward-Roger", () => {
  assert.equal(ddfOf(undefined), "containment");
  assert.equal(ddfOf("bogus"), "containment");
  assert.equal(ddfOf("satterthwaite"), "satterthwaite");
  assert.equal(DDF_NEW_SHEET, "kenward_roger");
  assert.equal(ddfName("kenward_roger"), "Kenward-Roger");
});

test("Methods sentences", () => {
  assert.equal(ddfMethodsSentence("containment"), "");
  assert.match(ddfMethodsSentence("kenward_roger"), /Kenward-Roger method \(Kenward & Roger 1997\)/);
  assert.match(ddfMethodsSentence("satterthwaite"), /Satterthwaite's method \(as in lmerTest/);
});

test("two-way options keep the setting; old files have none", () => {
  assert.equal("mixedDdf" in normalizeTwoWay({}), false);
  assert.equal(normalizeTwoWay({ mixedDdf: "satterthwaite" }).mixedDdf, "satterthwaite");
  assert.equal(normalizeTwoWay({ mixedDdf: "nonsense" }).mixedDdf, "containment");
});

test("RM one-way Methods: the df method replaces the Geisser-Greenhouse clause", () => {
  const base = { analysis: "mixed_rm_one_way", n_missing: 2, n_subjects: 6 };
  assert.match(rmMethodsSentence(base), /with the Geisser-Greenhouse correction\.$/);
  const kr = rmMethodsSentence({ ...base, ddf: "kenward_roger" });
  assert.match(kr, /6 subjects\), Kenward-Roger degrees of freedom\. Denominator degrees of freedom and standard errors/);
  assert.doesNotMatch(kr, /Geisser/);
});

test("the results summary sentence follows the df method", async () => {
  const { resultSentences } = await import("../../../report/sentences.ts");
  const { describeResult } = await import("../../../report/describe.ts");
  const r = { analysis: "mixed_rm_one_way", n_subjects: 7, n_missing: 2,
    fixed_effect: { F: 155.4, df_num: 2, df_den: 10.02, p: 2.9e-8 }, estimated_means: [] };
  const kr = resultSentences({ ...r, ddf: "kenward_roger" }).join(" ");
  assert.match(kr, /2 missing values; Kenward-Roger df\) gave F/);
  assert.doesNotMatch(kr, /Geisser/);
  assert.match(describeResult({ ...r, ddf: "satterthwaite" }).test ?? "", /Satterthwaite df/);
  const old = resultSentences({ ...r, fixed_effect: { ...r.fixed_effect, p_geisser_greenhouse: 3e-7 } }).join(" ");
  assert.match(old, /Geisser-Greenhouse corrected\) gave/);
});
