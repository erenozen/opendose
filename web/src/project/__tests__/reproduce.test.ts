// Unit tests for reproducing saved results (project/reproduce.ts) and the
// engine change log (share/engineChanges.ts). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  changeLine, compareResults, headline, isPKey, parseSavedWith, sameAtPrecision, sameBuild,
  savedLabel, savedWithOf, totals, type ReproductionReport,
} from "../reproduce.ts";
import { changesBetween, compareVersions } from "../../share/engineChanges.ts";

const here = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(join(here, "..", "..", "report", "__tests__", "fixtures.json"), "utf8")) as
  Record<string, { result: Record<string, unknown> }>;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

test("a result compared with itself: every number reproduced", () => {
  const r = FX.anova_tukey.result;
  const c = compareResults(r, clone(r), { digits: 4 });
  assert.ok(c.compared > 30, `${c.compared} numbers`);
  assert.deepEqual(c.changes, []);
});

test("a changed Tukey P is listed with its comparison and both values", () => {
  const saved = FX.anova_tukey.result as any;
  const now = clone(saved);
  const cmp = now.multiple_comparisons.comparisons[0];
  const p = cmp.p_adjusted ?? cmp.p;
  const key = "p_adjusted" in cmp ? "p_adjusted" : "p";
  cmp[key] = p * 1.5;
  const c = compareResults(saved, now, { digits: 4 });
  assert.equal(c.changes.length, 1);
  const ch = c.changes[0];
  assert.equal(ch.path, `multiple_comparisons.comparisons[0].${key}`);
  assert.deepEqual(ch.context, ["Control vs. Treated A"]);
  assert.equal(ch.p, true);
  assert.match(changeLine(ch, "One-way ANOVA of Liver", 4),
    /^(adjusted )?P \(One-way ANOVA of Liver, Control vs\. Treated A\) \S+ → \S+$/);
});

test("display precision: rounding noise is not a change, the fourth digit is", () => {
  assert.equal(sameAtPrecision(0.031249999999, 0.03125, 4), true, "float noise");
  assert.equal(sameAtPrecision(1.23441, 1.23449, 4), true);
  assert.equal(sameAtPrecision(1.2344, 1.2356, 4), false);
  assert.equal(sameAtPrecision(0.03121, 0.03081, 4), false);
  // P at 4 significant digits regardless of the results precision
  const c = compareResults({ p: 0.031231, mean: 1.21 }, { p: 0.031234, mean: 1.24 }, { digits: 2 });
  assert.deepEqual(c.changes, []);
  const d = compareResults({ p: 0.03121, mean: 1.21 }, { p: 0.03081, mean: 1.29 }, { digits: 2 });
  assert.deepEqual(d.changes.map((x) => [x.what, x.p]), [["P", true], ["mean", false]]);
});

test("timings, versions and plotting grids are ignored; lost numbers are changes", () => {
  const grid = Array.from({ length: 200 }, (_, i) => i / 7);
  const saved = { elapsed_ms: 12, versions: { scipy: 1 }, curve: { x: grid }, fit: { params: { LogIC50: { value: -6.98, ci95: [-7.01, -6.95] } } } };
  const now = { elapsed_ms: 99, versions: { scipy: 2 }, curve: { x: grid.map((v) => v + 1) }, fit: { params: { LogIC50: { value: -6.98, ci95: [-7.01, -6.90] } } }, extra: 5 };
  const c = compareResults(saved, now, { digits: 4 });
  assert.equal(c.compared, 3);
  assert.deepEqual(c.changes.map((x) => x.what), ["LogIC50 95% CI upper limit"]);
  const lost = compareResults({ a: { b: 1 } }, {}, { digits: 4 });
  assert.equal(lost.changes[0].now, null);
  assert.match(changeLine(lost.changes[0], "S", 4), /→ not reported$/);
});

test("two-group results name the group of n_a / n_b; P values name their test", () => {
  const saved = FX.ttest_unpaired.result as any;
  const now = { ...clone(saved), n_b: 7, f_test_variances: { ...saved.f_test_variances, p: 0.5 } };
  const c = compareResults(saved, now, { digits: 4 });
  assert.deepEqual(c.changes.map((x) => [x.what, x.context]), [
    ["n", ["Treated A"]], ["F test for equal variances P", []]]);
  const ct = FX.contingency_2x2.result as any;
  const d = compareResults(ct, { ...clone(ct), chi_square: { ...ct.chi_square, p: 0.5 } }, { digits: 4 });
  assert.deepEqual(d.changes.map((x) => x.what), ["chi-square test P"]);
});

test("survival curves keyed by group name the group", () => {
  const saved = FX.survival.result as any;
  const now = clone(saved);
  const g = Object.keys(now.curves)[0];
  now.curves[g].median_survival += 3;
  const c = compareResults(saved, now, { digits: 4 });
  assert.equal(c.changes.length, 1);
  assert.deepEqual([c.changes[0].what, c.changes[0].context], ["median survival", [g]]);
});

test("savedWith: parsed from the file, compared by build, labelled", () => {
  const cur = { app: "0.4.0", commit: "abc1234", engine: "e1" };
  assert.equal(savedWithOf("{\"savedWith\":{\"app\":\"0.3.0\",\"libraries\":{\"scipy\":\"1.14.1\"}}}")?.libraries?.scipy, "1.14.1");
  assert.equal(savedWithOf("not json"), null);
  assert.equal(parseSavedWith({ app: "" }), null);
  assert.equal(sameBuild(cur, { ...cur }), true);
  assert.equal(sameBuild({ ...cur, engine: "e0" }, cur), false);
  assert.equal(sameBuild(null, cur), false);
  assert.equal(savedLabel(null, cur), "an earlier version");
  assert.equal(savedLabel({ app: "0.3.0" }, cur), "0.3.0");
  assert.equal(savedLabel({ app: "0.4.0", commit: "fff0000" }, cur), "0.4.0 (build fff0000)");
});

test("headline: all reproduced, or k of N changed", () => {
  const base: ReproductionReport = {
    file: "x.json", savedWith: { app: "0.3.0" }, current: { app: "0.4.0" }, checkedAt: "", digits: 4,
    sheets: [
      { sheetId: "a", name: "A", analysis: "ttest", status: "reproduced", compared: 40, changes: [] },
      { sheetId: "b", name: "B", analysis: "anova", status: "reproduced", compared: 8, changes: [] },
    ],
  };
  assert.equal(headline(base), "All 48 results reproduced with OpenDose 0.4.0 (saved with 0.3.0)");
  const ch = { path: "p", what: "P", context: [], saved: 0.0312, now: 0.0308, p: true };
  const changed = { ...base, sheets: [{ ...base.sheets[0], status: "changed" as const, changes: [ch, ch] }, base.sheets[1],
    { sheetId: "c", name: "C", analysis: "x", status: "failed" as const, compared: 0, changes: [], note: "boom" }] };
  assert.equal(headline(changed),
    "2 of 48 results changed with OpenDose 0.4.0 (saved with 0.3.0); 1 analysis could not be recomputed");
  assert.deepEqual(totals(changed), { compared: 48, changed: 2, sheets: 2, changedSheets: 1, failed: 1, skipped: 0 });
});

test("P keys", () => {
  for (const k of ["p", "p_adjusted", "recommended_p", "p_value", "pvalue", "p_peto"]) assert.ok(isPKey(k), k);
  for (const k of ["params", "power", "span", "top"]) assert.ok(!isPKey(k), k);
});

test("engine change log: entries after the saving version, relevant ones by analysis", () => {
  assert.equal(compareVersions("0.10.0", "0.9.1"), 1);
  assert.equal(compareVersions("0.3.0", "0.3"), 0);
  assert.ok(changesBetween("0.2.0", "0.3.0").length >= 8);
  assert.ok(changesBetween("0.3.0", "0.4.0").length >= 8);
  assert.ok(changesBetween("0.3.0", "0.4.0").every((c) => c.version === "0.4.0"));
  assert.ok(changesBetween("0.3.0", "0.4.0", "ttest").some((c) => /blank/.test(c.note)), "the pairing fix explains a changed paired t");
  assert.ok(changesBetween(null, "0.3.0", "dose_response").every((c) => c.analyses.includes("dose_response")));
  assert.equal(changesBetween("0.2.0", "0.3.0", "ttest").length, 0);
  assert.ok(changesBetween("0.3.0", "0.3.0", "survival").length === 1, "a rebuilt engine of one release");
});
