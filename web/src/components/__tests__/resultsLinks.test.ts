// Results-sheet links: which sheets plan the next experiment, and how a
// Compare fits sheet opened from a fit is set up. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareFitsOptions, offersPlanning } from "../resultsLinks.ts";

test("Plan next experiment on t tests and one-way ANOVA only", () => {
  assert.equal(offersPlanning("column", { analysis: "ttest" }), true);
  assert.equal(offersPlanning("column", { analysis: "anova" }), true);
  assert.equal(offersPlanning("column", { analysis: "column_statistics" }), false);
  assert.equal(offersPlanning("nonlin", { analysis: "ttest" }), false);
  assert.equal(offersPlanning("column", null), false);
});

const lib = new Set(["log_inhibitor_vs_response_4pl", "log_inhibitor_vs_response_3pl",
  "one_site_binding"]);
const usable = (id: string) => lib.has(id);

test("a 4PL fit is compared with its 3-parameter version", () => {
  assert.deepEqual(compareFitsOptions("log_inhibitor_vs_response_4pl", true, "models", usable), {
    mode: "models", xIsLog: true, model1: "log_inhibitor_vs_response_3pl",
    model2: "log_inhibitor_vs_response_4pl" });
});

test("a 3PL fit is compared with the 4PL; other models stay model 2", () => {
  assert.deepEqual(compareFitsOptions("log_inhibitor_vs_response_3pl", false, "models", usable), {
    mode: "models", xIsLog: false, model1: "log_inhibitor_vs_response_3pl",
    model2: "log_inhibitor_vs_response_4pl" });
  assert.deepEqual(compareFitsOptions("one_site_binding", false, "models", usable),
    { mode: "models", xIsLog: false, model2: "one_site_binding" });
});

test("data sets: one curve vs separate curves with the fitted model; unknown models fall back", () => {
  assert.deepEqual(compareFitsOptions("one_site_binding", false, "global", usable),
    { mode: "global", xIsLog: false, model1: "one_site_binding" });
  assert.deepEqual(compareFitsOptions("user", false, "global", usable), { mode: "global", xIsLog: false });
});

test("the comparison starts with the fit's weighting", () => {
  assert.deepEqual(compareFitsOptions("log_inhibitor_vs_response_4pl", true, "models", usable,
    { weighting: "1/Y2" }), {
    mode: "models", xIsLog: true, model1: "log_inhibitor_vs_response_3pl",
    model2: "log_inhibitor_vs_response_4pl", weighting: "1/Y2" });
  assert.deepEqual(compareFitsOptions("one_site_binding", false, "global", usable,
    { weighting: "1/YK", weightK: 2.5 }),
    { mode: "global", xIsLog: false, model1: "one_site_binding", weighting: "1/YK", weightK: 2.5 });
  assert.deepEqual(compareFitsOptions("one_site_binding", false, "parameter", usable,
    { weighting: "none" }),
    { mode: "parameter", xIsLog: false, datasetA: 0, datasetB: 1, model1: "one_site_binding" });
});

test("a global model's fit opens the nested pair (P-99), simpler model first", () => {
  assert.deepEqual(compareFitsOptions("competitive_inhibition", false, "models", usable), {
    mode: "models", xIsLog: false, model1: "competitive_inhibition", model2: "mixed_model_inhibition" });
  assert.deepEqual(compareFitsOptions("mixed_model_inhibition", false, "models", usable), {
    mode: "models", xIsLog: false, model1: "competitive_inhibition", model2: "mixed_model_inhibition" });
  assert.deepEqual(compareFitsOptions("gaddum_schild_log", true, "models", usable), {
    mode: "models", xIsLog: true, model1: "gaddum_schild_slope1_log", model2: "gaddum_schild_log" });
  // the one-model modes do not take a global-only model
  assert.deepEqual(compareFitsOptions("competitive_inhibition", false, "global", usable),
    { mode: "global", xIsLog: false });
});
