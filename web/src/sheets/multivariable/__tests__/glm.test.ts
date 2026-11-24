// P-86 binomial and negative binomial regression: defaults, engine
// payloads, the dispersion chip and the answer headline.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeTable } from "../../../project/table.ts";
import { keyFacts } from "../../../components/answer/keyFacts.ts";
import {
  ANALYSIS_MV_BINOMIAL, binomialDispersionChip, binomialPayload, defaultBinomial, defaultNegBin, negBinPayload,
  runBinomial,
} from "../glm.ts";

// engine/tests/reference/count_glms.json (statsmodels GLM Binomial)
const REF = JSON.parse(readFileSync(new URL("../../../../../engine/tests/reference/count_glms.json", import.meta.url),
  "utf8"));
const D = REF.dishes;

function dishes(names = ["Experiment", "Group", "Positive", "Counted"]) {
  const d = D.data;
  const cols = [d.experiment, d.group, d.positive.map(String), d.counted.map(String)];
  return normalizeTable({
    type: "multivariable", x: d.group.map(() => ""),
    datasets: names.map((name, c) => ({ name, varType: c < 2 ? "categorical" : "continuous",
      rows: cols[c].map((v: string) => [v]) })),
  }, "multivariable");
}

// The result the engine returns for the acceptance data (reference values).
const result = {
  analysis: "binomial_regression", outcome: "Positive", totals: "Counted", family: "binomial", ci_level: 0.95,
  predictors: ["Group", "Experiment"],
  coefficients: D.estimates.map((b: number, j: number) => ({
    name: ["Intercept", "Group[Treated]", "Experiment[E2]", "Experiment[E3]"][j], estimate: b, se: D.se[j],
    ci: D.profile_ci[j], z: D.z[j], p: D.p[j], odds_ratio: Math.exp(b),
    odds_ratio_ci: D.profile_ci[j].map(Math.exp) })),
  dispersion: { pearson_chi2: D.pearson_chi2, df: 2, phi: D.phi, phi_deviance: 0.1 },
  n_rows_analyzed: 6, reference_levels: { Group: "Control", Experiment: "E1" },
};

test("defaults: positives and totals by name, the block last among the predictors", () => {
  const o = defaultBinomial(dishes());
  assert.equal(o.outcome, "Positive");
  assert.equal(o.totals, "Counted");
  assert.deepEqual(o.predictors, ["Group", "Experiment"]);
  assert.equal(o.ciMethod, "profile");
  assert.equal(o.quasi, false);
  // unnamed counts: the column that never exceeds the other is the positives
  const plain = defaultBinomial(dishes(["Day", "Arm", "A", "B"]));
  assert.deepEqual([plain.outcome, plain.totals], ["A", "B"]);
  assert.deepEqual(plain.predictors, ["Arm", "Day"]);
});

test("binomial payload: totals out of the predictors, quasi only when on", () => {
  const t = dishes();
  const o = { ...defaultBinomial(t), predictors: ["Group", "Experiment", "Counted"] };
  const p = binomialPayload(t, o) as { options: Record<string, unknown> };
  assert.deepEqual(p.options.predictors, ["Group", "Experiment"]);
  assert.equal(p.options.totals, "Counted");
  assert.equal(p.options.ci_method, "profile");
  assert.equal("quasi" in p.options, false);
  assert.equal((binomialPayload(t, { ...o, quasi: true }) as typeof p).options.quasi, true);
  assert.match((binomialPayload(t, { ...o, totals: "" }) as { error: string }).error, /column of totals/);
  assert.match((binomialPayload(t, { ...o, totals: "Positive" }) as { error: string }).error, /column of totals/);
  assert.match((binomialPayload(t, { ...o, outcome: "" }) as { error: string }).error, /column of positives/);
  assert.match(runBinomial({ analyze: () => assert.fail("no engine call") }, t, { ...o, totals: "" }).error!,
    /column of totals/);
});

test("negative binomial payload: the Poisson model without quasi", () => {
  const t = normalizeTable({ type: "multivariable", x: ["", "", "", ""], datasets: [
    { name: "Dose", varType: "continuous", rows: [["0"], ["10"], ["100"], ["1000"]] },
    { name: "Colonies", varType: "continuous", rows: [["15"], ["16"], ["27"], ["20"]] },
  ] }, "multivariable");
  const o = defaultNegBin(t);
  assert.equal(o.outcome, "Colonies");
  assert.equal("quasi" in o, false);
  const p = negBinPayload(t, o) as { options: Record<string, unknown> };
  assert.deepEqual(p.options.predictors, ["Dose"]);
  assert.equal("quasi" in p.options, false);
});

test("the dispersion chip: info on 2 df, warn and the quasi switch when overdispersed, ok otherwise", () => {
  const info = binomialDispersionChip(ANALYSIS_MV_BINOMIAL, result, "r1")!;
  assert.equal(info.state, "info");
  assert.equal(info.label, "Dispersion φ = 0.02723 on 2 df");
  assert.equal(info.action, undefined);
  assert.ok(info.sources?.some((s) => s.url === "https://doi.org/10.1890/10-0340.1"));
  const over = REF.dishes_overdispersed;
  const warn = binomialDispersionChip(ANALYSIS_MV_BINOMIAL,
    { ...result, dispersion: { ...result.dispersion, phi: over.phi, df: 14 } }, "r1")!;
  assert.equal(warn.state, "warn");
  assert.equal(warn.label, "Proportions are overdispersed (φ = 4.772)");
  assert.equal(warn.action, "quasi-binomial");
  assert.equal(warn.target, "r1");
  assert.match(warn.detail, /√φ = 2\.184\./);
  const on = binomialDispersionChip(ANALYSIS_MV_BINOMIAL,
    { ...result, family: "quasibinomial", dispersion: { ...result.dispersion, phi: over.phi, df: 14 } }, "r1")!;
  assert.equal(on.label, "Quasi-binomial SEs (φ = 4.772)");
  assert.equal(on.action, "quasi-binomial");
  const fine = binomialDispersionChip(ANALYSIS_MV_BINOMIAL,
    { ...result, dispersion: { ...result.dispersion, phi: 1.1, df: 14 } }, "r1")!;
  assert.equal(fine.state, "ok");
  assert.equal(binomialDispersionChip("mv_poisson", result, "r1"), null);
  assert.equal(binomialDispersionChip(ANALYSIS_MV_BINOMIAL, { error: "x" }, "r1"), null);
});

test("the answer headline: the first predictor's odds ratio with its CI", () => {
  const k = keyFacts(result);
  assert.equal(k?.kind, "figures");
  if (k?.kind !== "figures") return;
  assert.equal(k.items.length, 1);
  assert.equal(k.items[0].title, "Group: Treated vs. Control");
  const f = k.items[0].figure!;
  assert.equal(f.name, "Odds ratio");
  assert.equal(f.value, "3.196");
  assert.equal(f.ci, "95% CI 2.127 to 4.881");
  assert.deepEqual(f.facts, ["P < 0.0001", "binomial regression, 6 rows"]);
});
