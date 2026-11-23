// P-41: trend across ordered columns, the wording of the controls,
// results rows and methods sentence. Values from engine/tests/reference/
// ordered_trend.json. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { trendNote, trendOrderHint, trendRows, trendSentence } from "../orderedTrend.ts";

const jt = { test: "jonckheere_terpstra", statistic: 140, mean: 75, sd: 14.865, z: 4.37,
  p: 8.89305953436869e-07, p_increasing: 4.446529767184345e-07, p_decreasing: 0.9999997510386535,
  p_method: "exact", ties: false, direction: "increasing",
  order: ["0 mg/kg", "1 mg/kg", "3 mg/kg", "10 mg/kg"] };
const page = { test: "page", L: 133.5, mean: 120, sd: 4.4, z: 3.1, p: 0.0007684296093075243,
  p_increasing: 0.00038421480465376215, p_decreasing: 0.9997824899659604, p_method: "exact",
  ties: true, direction: "increasing", order: ["Tutorial", "Lecture", "Seminar"] };
const fmt = (v: number) => String(v);
const p = (v: number) => (v < 0.0001 ? "< 0.0001" : v.toFixed(4));

test("the controls name the order that is tested", () => {
  assert.equal(trendOrderHint(["Vehicle", "", "High"], "columns"),
    "Tested in the order of the columns, first to last: Vehicle, then Dataset 2, then High. "
    + "That order is the hypothesis: it must be the dose (or time) order, fixed before looking "
    + "at the data. Reorder the columns if it is not.");
});

test("Jonckheere-Terpstra rows", () => {
  const rows = trendRows(jt, fmt, p);
  assert.deepEqual(rows[0], ["Jonckheere-Terpstra J", "140"]);
  assert.deepEqual(rows[3], ["P value, two-sided (exact)", "< 0.0001"]);
  assert.deepEqual(rows[6], ["Direction", "values increase from the first column to the last"]);
  assert.match(trendNote(jt), /in the order entered \(0 mg\/kg, then 1 mg\/kg, then 3 mg\/kg, then 10 mg\/kg\)/);
});

test("Page rows say the exact P is given the ties", () => {
  const rows = trendRows(page, fmt, p);
  assert.deepEqual(rows[0], ["Page's L", "133.5"]);
  assert.deepEqual(rows[3], ["P value, two-sided (exact, given the ties)", "0.0008"]);
  assert.deepEqual(rows[4], ["P value, one-sided: increasing", "0.0004"]);
});

test("methods sentences, and nothing for an error or no block", () => {
  const P = (v: unknown) => `P = ${(v as number).toFixed(4)}`;
  assert.equal(trendSentence(page, P), " Page's test for trend across the treatments in the "
    + "order entered gave L = 133.5 (exact P = 0.0008, two-sided).");
  assert.match(trendSentence(jt, P), /^ A Jonckheere-Terpstra test .* gave J = 140 \(exact P = 0\.0000, two-sided\)\.$/);
  assert.equal(trendSentence({ error: "x" }, P), "");
  assert.equal(trendSentence(undefined, P), "");
  assert.deepEqual(trendRows({ error: "x" }, fmt, p), []);
});
