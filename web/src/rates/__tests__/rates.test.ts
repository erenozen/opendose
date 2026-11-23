// Compare two event rates (P-47): the payload and the rows the dialog
// shows. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RATE_FORM, eventsProblem, exposureProblem, perUnit, ratePayload, rateRows, rateSentence,
} from "../rates.ts";

// engine/tests/reference/event_rates.py, acceptance: 23 events in 10 h vs
// 41 in 12 h (statsmodels test_poisson_2indep exact-cond; Clopper-Pearson)
const ACC = {
  analysis: "rate_compare", names: ["Treated", "Control"],
  groups: [
    { events: 23, exposure: 10, rate: 2.3, ci: [1.4580027037044678, 3.4511292894833026] },
    { events: 41, exposure: 12, rate: 3.4166666666666665, ci: [2.45185898903794, 4.635094130477909] }],
  rate_ratio: 0.673170731707317, ratio_ci: [0.38560333698030136, 1.1485084902855267],
  p_two_tailed: 0.13351109801331879, p_greater: 0.9520697689484362, p_less: 0.0793985149309937,
  n_events: 64, test: "exact conditional",
};

test("the payload waits for four valid numbers", () => {
  assert.equal(ratePayload(DEFAULT_RATE_FORM), null);
  const f = { ...DEFAULT_RATE_FORM, events1: "23", exposure1: "10", events2: "41", exposure2: "12" };
  assert.deepEqual(ratePayload(f), { analysis: "rate_compare", data: { groups: [
    { name: "Group 1", events: 23, exposure: 10 }, { name: "Group 2", events: 41, exposure: 12 }] },
  options: {} });
  assert.equal(ratePayload({ ...f, events1: "2.5" }), null);
  assert.equal(ratePayload({ ...f, exposure2: "0" }), null);
  assert.equal(eventsProblem("2.5"), "Enter a whole number of events, 0 or more");
  assert.equal(eventsProblem(""), null);
  assert.equal(exposureProblem("-1"), "Enter an exposure above 0");
  assert.equal(ratePayload({ ...f, exposure1: "2,5" })?.data !== undefined, true);
});

test("the acceptance rows", () => {
  const rows = rateRows(ACC, "hours");
  assert.deepEqual(rows.map((r) => [r.label, r.value]), [
    ["Rate of Treated (per hour, exact 95% CI)", "2.3 (1.458 to 3.451); 23 events in 10"],
    ["Rate of Control (per hour, exact 95% CI)", "3.417 (2.452 to 4.635); 41 events in 12"],
    ["Rate ratio Treated/Control (exact conditional 95% CI)", "0.6732 (0.3856 to 1.149)"],
    ["P value, exact conditional test (two-tailed)", "P = 0.1335"],
    ["One-tailed P, Treated rate higher", "P = 0.9521"],
    ["One-tailed P, Treated rate lower", "P = 0.0794"],
  ]);
  assert.match(rateSentence(ACC), /divided by the rate in Control is 0\.6732 \(95% CI 0\.3856 to 1\.149\)/);
});

test("units, no events and an unbounded ratio", () => {
  assert.equal(perUnit(""), "per unit of exposure");
  assert.equal(perUnit("mm²"), "per mm²");
  assert.equal(perUnit("10⁶ cells"), "per 10⁶ cells");
  const none = { ...ACC, rate_ratio: null, ratio_ci: null, p_two_tailed: null,
    test: "no events in either group: there is no ratio to estimate and no test" };
  assert.equal(rateRows(none, "h").at(-1)!.value, none.test);
  assert.equal(rateSentence(none), "");
  const unb = { ...ACC, rate_ratio: null, ratio_ci: [2.1, null] };
  assert.equal(rateRows(unb, "h")[2].value, "unbounded: no events in Control (CI 2.1 to ∞)");
});
