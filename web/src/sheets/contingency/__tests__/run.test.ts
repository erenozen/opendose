// Contingency payloads: trend, McNemar, strata for CMH, kappa, proportions.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import {
  cmhPayload, contingencyPayload, DEFAULT_CONTINGENCY, DEFAULT_PROPORTIONS, kappaPayload,
  mcnemarPayload, normalizeContingency, proportionPayload, readCounts, strataOf, stratumName,
  stratumShape, trendApplies,
  type Counts,
} from "../run.ts";

const table = (rows: number[][], titles: string[] = []) => normalizeTable({
  type: "contingency",
  x: rows.map(() => ""),
  rowTitles: rows.map((_, i) => titles[i] ?? ""),
  datasets: rows[0].map((_, c) => ({ name: `Outcome ${c + 1}`, rows: rows.map((r) => [String(r[c])]) })),
});
const counts = (rows: number[][], titles?: string[]) => readCounts(table(rows, titles)) as Counts;

test("default options send exactly what the original analysis sent", () => {
  assert.deepEqual(contingencyPayload(counts([[15, 85], [5, 95]]), DEFAULT_CONTINGENCY),
    { analysis: "contingency", data: { table: [[15, 85], [5, 95]] }, options: {} });
});

test("trend applies to k x 2 and 2 x k tables, with optional scores", () => {
  const shoes = [[5, 17], [7, 28], [6, 36], [7, 41], [8, 46], [10, 140]];
  assert.equal(trendApplies(shoes), true);
  assert.equal(trendApplies([[1, 2], [3, 4]]), false);
  assert.equal(trendApplies([[1, 2, 3], [4, 5, 6]]), true);
  const p = contingencyPayload(counts(shoes), { ...DEFAULT_CONTINGENCY, trend: true });
  assert.deepEqual("options" in p && p.options, { trend: true });
  const bad = contingencyPayload(counts(shoes), { ...DEFAULT_CONTINGENCY, trend: true, trendScores: "1,2" });
  assert.match("error" in bad ? bad.error : "", /Enter 6 scores/);
  const scored = contingencyPayload(counts(shoes),
    { ...DEFAULT_CONTINGENCY, trend: true, trendScores: "1 2 3 4 5 7" });
  assert.deepEqual("options" in scored && scored.options.scores, [1, 2, 3, 4, 5, 7]);
});

test("McNemar and kappa need square tables", () => {
  assert.ok("error" in mcnemarPayload(counts([[1, 2, 3], [4, 5, 6]])));
  assert.equal((mcnemarPayload(counts([[13, 25], [4, 92]])) as { analysis: string }).analysis, "mcnemar");
  assert.deepEqual((kappaPayload(counts([[1, 2], [3, 4]]), { weights: "linear" }) as
    { options: unknown }).options, { weights: "linear" });
});

test("strata are consecutive row pairs, named by the shared title prefix", () => {
  assert.equal(stratumName("Site A: exposed", "Site A: not exposed", 0), "Site A");
  assert.equal(stratumName("Exposed", "Not exposed", 1), "Stratum 2");
  const c = counts([[20, 10], [15, 25], [12, 18], [8, 30]],
    ["Men: smokers", "Men: non-smokers", "Women - smokers", "Women - non-smokers"]);
  const s = strataOf(c);
  assert.ok(Array.isArray(s));
  assert.deepEqual(s.map((x) => x.name), ["Men", "Women"]);
  assert.deepEqual(cmhPayload(c, { correction: false }), {
    analysis: "cmh",
    data: { tables: [[[20, 10], [15, 25]], [[12, 18], [8, 30]]], strata_names: ["Men", "Women"] },
    options: { correction: false },
  });
  assert.ok("error" in strataOf(counts([[1, 2], [3, 4], [5, 6]])));
});

test("proportions: successes in column 1, failures in column 2", () => {
  const c = counts([[15, 85], [5, 95]], ["Exposed", "Not exposed"]);
  assert.deepEqual(proportionPayload(c, DEFAULT_PROPORTIONS), {
    analysis: "proportion_test",
    data: { groups: [{ name: "Exposed", successes: 15, trials: 100 },
      { name: "Not exposed", successes: 5, trials: 100 }] },
    options: { ci_method: "wilson_brown", diff_ci: "newcombe_cc", rr_ci: "koopman", or_ci: "baptista_pike" },
  });
  const one = proportionPayload(c, { ...DEFAULT_PROPORTIONS, mode: "one", p0: "0.1" });
  assert.deepEqual("options" in one && one.options, { ci_method: "wilson_brown", p0: 0.1 });
  assert.ok("error" in proportionPayload(c, { ...DEFAULT_PROPORTIONS, mode: "one", p0: "2" }));
});

test("strata of any size are read from the row titles", () => {
  const c = counts([[1, 2, 3], [4, 5, 6], [7, 8, 9], [2, 2, 2], [3, 3, 3], [4, 4, 4]],
    ["Clinic A: low", "Clinic A: mid", "Clinic A: high", "Clinic B: low", "Clinic B: mid", "Clinic B: high"]);
  const s = strataOf(c);
  assert.ok(Array.isArray(s));
  assert.deepEqual(s.map((x) => x.name), ["Clinic A", "Clinic B"]);
  assert.equal(stratumShape(s), "3 × 3");
  assert.deepEqual(s[1].table, [[2, 2, 2], [3, 3, 3], [4, 4, 4]]);
  // unequal blocks fall back to pairs of rows (two columns) or an error
  const uneven = counts([[1, 2], [3, 4], [5, 6], [7, 8]], ["A: x", "A: y", "A: z", "B: x"]);
  const pairs = strataOf(uneven);
  assert.ok(Array.isArray(pairs));
  assert.deepEqual(pairs.map((x) => x.name), ["A", "Stratum 2"]);
  assert.ok("error" in strataOf(counts([[1, 2, 3], [4, 5, 6], [7, 8, 9]], ["A: x", "A: y", "B: x"])));
});

test("Fisher's exact test for r x c tables: larger budget on request", () => {
  const job = [[1, 3, 10, 6], [2, 3, 10, 7], [1, 6, 14, 12], [0, 1, 9, 11]];
  assert.deepEqual((contingencyPayload(counts(job), DEFAULT_CONTINGENCY) as { options: unknown }).options, {});
  assert.deepEqual((contingencyPayload(counts(job), { ...DEFAULT_CONTINGENCY, fisherRxc: "large" }) as
    { options: unknown }).options, { fisher_rxc: true });
  // 2 x 2 tables always get the exact test: nothing to send
  assert.deepEqual((contingencyPayload(counts([[1, 2], [3, 4]]), { ...DEFAULT_CONTINGENCY, fisherRxc: "large" }) as
    { options: unknown }).options, {});
  assert.equal(normalizeContingency({ fisherRxc: "bogus" }).fisherRxc, "auto");
});
