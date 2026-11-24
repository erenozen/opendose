// Unit tests for the general mixed model's words and tables (P-87).
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fixedMatrix, fixedPhrase, groupCounts, lmmDesignNote, lmmMethodsText, randomMatrix, randomPhrase,
} from "../lmmModel.ts";

// The shape of engine/opendose/lmm.py's result (sleepstudy with a random
// slope, values from engine/tests/reference/lmm_long.json).
const slope = {
  analysis: "lmm", outcome: "Reaction", formula: "Reaction ~ Days + (1 + Days | Subject)",
  n_values: 180, n_groups: { Subject: 18 }, ddf: "satterthwaite", factor_names: [],
  covariates: ["Days"], random_slopes: ["Days"], slope_structure: "correlated",
  fixed_effects: [
    { term: "(Intercept)", estimate: 251.40510484848485, se: 6.824582411576025, df: 17, t: 36.838, p: 1.17e-17, ci: [237, 265] },
    { term: "Days", estimate: 10.467285959595962, se: 1.5457880977442258, df: 17, t: 6.771, p: 3.26e-6, ci: [7.2, 13.7] },
  ],
  anova: [{ term: "Days", f: 45.853, dfn: 1, dfd: 17, p: 3.26e-6 }],
  random_effects: [
    { group: "Subject", coefficient: "(Intercept)", variance: 612.09, sd: 24.74 },
    { group: "Subject", coefficient: "Days", variance: 35.07, sd: 5.922 },
  ],
  residual: { variance: 654.94, sd: 25.59 }, singular: false, converged: true,
};

const nested = {
  ...slope, formula: "current ~ genotype + size + (1 | animal) + (1 | animal:slice)",
  outcome: "current", n_values: 172, n_groups: { animal: 12, slice: 36 }, ddf: "kenward_roger",
  factor_names: ["genotype"], covariates: ["size"], random_slopes: [], singular: true,
  boundary: ["(Intercept) by slice"],
};

test("design note counts the groups, not the values, and names the df method", () => {
  assert.deepEqual(groupCounts(nested), [["animal", 12], ["slice", 36]]);
  assert.equal(lmmDesignNote(nested), "df come from the 12 animal groups (36 slice groups within them), "
    + "not from the 172 values: Kenward-Roger df for each test, estimate and comparison.");
  assert.equal(lmmDesignNote(slope), "df come from the 18 Subject groups, not from the 180 values: "
    + "Satterthwaite df for each test, estimate and comparison.");
});

test("fixed and random parts in words", () => {
  assert.equal(randomPhrase(slope), "a random intercept for each Subject with a random slope of Days "
    + "(correlated with the intercept)");
  assert.equal(randomPhrase(nested), "a random intercept for each animal, and one for each slice within its animal");
  assert.equal(fixedPhrase(nested), "genotype and the covariate size");
  assert.equal(fixedPhrase({ factor_names: ["A", "B"], covariates: [] }), "A, B and their interaction");
});

test("methods paragraph: formula, df method, F tests and a singular fit", () => {
  const t = lmmMethodsText(nested);
  assert.match(t, /^Current was analysed with a linear mixed model with genotype and the covariate size/);
  assert.match(t, /lme4 notation: current ~ genotype \+ size \+ \(1 \| animal\) \+ \(1 \| animal:slice\)/);
  assert.match(t, /172 values from 12 animal groups and 36 slice groups/);
  assert.match(t, /Kenward-Roger method/);
  assert.match(t, /Days: F\(1, 17\) = 45\.85, P/);
  assert.match(t, /The fit was singular \(\(Intercept\) by slice at the boundary/);
  assert.doesNotMatch(lmmMethodsText(slope), /singular/);
});

test("tables for Copy keep the engine's numbers unrounded", () => {
  const m = fixedMatrix(slope);
  assert.deepEqual(m[0], ["Term", "Estimate", "SE", "df", "t", "P", "CI lower", "CI upper"]);
  assert.equal(m[2][1], "10.467285959595962");
  assert.equal(m[2][2], "1.5457880977442258");
  const r = randomMatrix(slope);
  assert.deepEqual(r[3], ["Residual", "", "654.94", "25.59"]);
});
