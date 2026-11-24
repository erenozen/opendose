// Parametric survival (P-91): options, the percentiles field, the engine
// request, the wording and the headline facts. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { keyFacts } from "../../../components/answer/keyFacts.ts";
import {
  bestByAic, DEFAULT_PARAMETRIC_OPTIONS, normalizeParametricOptions, parametricMethodsText,
  parsePercentiles, percentileLabel, percentilesText, runParametric,
} from "../parametric.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

test("options: older or bad values fall back to the defaults", () => {
  assert.deepEqual(normalizeParametricOptions({}), DEFAULT_PARAMETRIC_OPTIONS);
  assert.deepEqual(normalizeParametricOptions(null), DEFAULT_PARAMETRIC_OPTIONS);
  assert.deepEqual(normalizeParametricOptions({ dist: "gamma", percentiles: [0.9, 1.5, "x", 0.1, 0.9] }),
    { dist: "weibull", percentiles: [0.1, 0.9] });
  assert.equal(normalizeParametricOptions({ dist: "lognormal" }).dist, "lognormal");
});

test("percentiles: percents in, fractions out; anything else is refused", () => {
  assert.deepEqual(parsePercentiles("25, 50, 75"), [0.25, 0.5, 0.75]);
  assert.deepEqual(parsePercentiles("90% 10%;50"), [0.1, 0.5, 0.9]);
  assert.deepEqual(parsePercentiles("33,3"), [0.03, 0.33]);
  assert.deepEqual(parsePercentiles("12.5"), [0.125]);
  assert.equal(parsePercentiles(""), null);
  assert.equal(parsePercentiles("0, 50"), null);
  assert.equal(parsePercentiles("50, 100"), null);
  assert.equal(parsePercentiles("half"), null);
  assert.equal(percentilesText([0.25, 0.5, 0.125]), "25, 50, 12.5");
  assert.equal(percentileLabel(0.5), "Median (50%)");
  assert.equal(percentileLabel(0.1), "10%");
});

test("run: one engine request with the distribution and percentiles", () => {
  const calls: any[] = [];
  const t = normalizeTable({ type: "survival", xUnit: "days", datasets: [
    { name: "rx 1", subTitles: ["Time", "Event"], rows: [["59", "1"], ["115", "1"]] }] });
  const engine = { analyze: (p: any) => { calls.push(p); return { analysis: "parametric_survival" }; } };
  const r = runParametric(engine, t, { dist: "lognormal", percentiles: [0.5] });
  assert.deepEqual(calls[0].options, { dist: "lognormal", percentiles: [0.5] });
  assert.equal(calls[0].analysis, "parametric_survival");
  assert.deepEqual(calls[0].data.datasets[0].ys, [[59, 1], [115, 1]]);
  assert.equal(r.time_unit, "days");
  assert.deepEqual(runParametric({ analyze: () => ({ error: "no events" }) }, t, {}), { error: "no events" });
});

// engine/tests/reference/parametric_survival.json: ovarian, Weibull ~ rx
const RESULT = {
  analysis: "parametric_survival", dist: "weibull", ci_level: 0.95, reference: "rx 1",
  group_names: ["rx 1", "rx 2"],
  time_ratios: [{ group: "rx 2", reference: "rx 1", value: 1.7494011500641944,
    ci: [0.6200377203405927, 4.93583581038395], p: 0.290606511996635 }],
  groups: [
    { name: "rx 1", n: 13, events: 7, percentiles: [{ p: 0.5, time: 665.0805946232517, beyond_follow_up: false }] },
    { name: "rx 2", n: 13, events: 5, percentiles: [{ p: 0.5, time: 1163.4927571192948, beyond_follow_up: false,
      ci: [521.6654758358532, 2594.987513214344] }] },
  ],
  compare: [{ dist: "weibull", aic: 200.7 }, { dist: "exponential", aic: 198.9 }, { dist: "lognormal", aic: 198.1 },
    { dist: "x", aic: null }],
};

test("key facts: the time ratio with its CI and P, the medians beside it", () => {
  const k = keyFacts(RESULT) as any;
  assert.equal(k.items[0].title, "rx 2 vs. rx 1");
  assert.equal(k.items[0].figure.name, "Time ratio (Weibull AFT)");
  assert.equal(k.items[0].figure.value, "1.749");
  assert.equal(k.items[0].figure.ci, "95% CI 0.62 to 4.936");
  assert.deepEqual(k.items[0].figure.facts.slice(1), ["rx 1 median 665.1", "rx 2 median 1163"]);
  const one = keyFacts({ ...RESULT, time_ratios: [], groups: [{ ...RESULT.groups[1],
    percentiles: [{ ...RESULT.groups[1].percentiles[0], beyond_follow_up: true }] }] }) as any;
  assert.equal(one.items[0].figure.name, "Median survival (Weibull model)");
  assert.equal(one.items[0].figure.value, "1163");
  assert.equal(one.items[0].figure.ci, "95% CI 521.7 to 2595");
  assert.equal(one.items[0].figure.note, "extrapolated beyond the last follow-up");
});

test("AIC: the lowest of those that fitted", () => {
  assert.equal(bestByAic(RESULT.compare), "lognormal");
  assert.equal(bestByAic([]), null);
});

test("methods: AFT by maximum likelihood, time ratios, delta-method percentiles", () => {
  const text = parametricMethodsText(RESULT, "Software.");
  assert.match(text, /^A Weibull accelerated failure time model with the group as a factor \(reference: rx 1\)/);
  assert.match(text, /Time ratios are exp\(coefficient\)/);
  assert.match(text, /delta method on the log scale/);
  assert.match(text, /extrapolations of the model\. Software\.$/);
  assert.equal(parametricMethodsText({ error: "x" }, "S"), "");
  assert.match(parametricMethodsText({ ...RESULT, dist: "exponential" }, "S"), /^An exponential accelerated/);
  assert.match(parametricMethodsText({ ...RESULT, dist: "lognormal" }, "S"), /^A log-normal accelerated/);
});
