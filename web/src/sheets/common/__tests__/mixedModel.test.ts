// Unit tests for the shared parts of the unit-random mixed models
// (common/mixedModel.ts). The result below is the engine's
// mixed_nested_two_way on engine/tests/test_mixed_nested.py's DATA with
// Tukey comparisons of treatment within genotype (values printed by the
// native engine). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adjustedText, bracketX, cellX, engineUnitOptions, factorsOf, iccSentence, mixedMethodsText,
  mixedPlotted, nestedBrackets, normalizeMixedUnit, scopeLabel, splitPairOf, unitWords,
} from "../mixedModel.ts";

const RESULT = {
  analysis: "mixed_nested_two_way",
  formula: "value ~ Genotype * Treatment + (1 | unit)",
  factor_names: ["Genotype", "Treatment"],
  levels: { Genotype: ["WT", "KO"], Treatment: ["Vehicle", "Drug"] },
  anova: [
    { term: "Genotype", f: 6.308112422803943, dfn: 1, dfd: 8, p: 0.036280638470239636, error_term: "mice within cells" },
    { term: "Treatment", f: 0.07066336176111995, dfn: 1, dfd: 8, p: 0.7970956036990444, error_term: "mice within cells" },
    { term: "Genotype × Treatment", f: 1.0352476578582916, dfn: 1, dfd: 8, p: 0.33870973100927976, error_term: "mice within cells" },
  ],
  variance_components: { unit: { variance: 2.28757, sd: 1.5125 }, residual: { variance: 0.767639, sd: 0.8761 } },
  icc: 0.7487441754744685, design_effect: 3.2462325264234053, effective_n: 14.78637146578186,
  mean_values_per_unit: 4, n_units: 12, n_values: 48, n_cells: 4,
  df: { units: 8, residual: 36 }, unit_nested_in: { Genotype: true, Treatment: true },
  comparisons: {
    method: "tukey", scope: "b_within_a", n_comparisons: 2,
    family: { size: 1, method: "tukey", label: "Tukey, comparisons within each of 2 separate families", n_families: 2, per_family: true },
    comparisons: [
      { pair: "Vehicle vs. Drug", p_adjusted: 0.6095133492057813, p_unadjusted: 0.6095, family: "Genotype: WT" },
      { pair: "Vehicle vs. Drug", p_adjusted: 0.2, p_unadjusted: 0.2, family: "Genotype: KO" },
    ],
  },
};

test("unit words: presets and a typed plural", () => {
  assert.deepEqual(unitWords("mouse"), { singular: "mouse", plural: "mice" });
  assert.deepEqual(unitWords("other", "organoids"), { singular: "organoid", plural: "organoids" });
  assert.deepEqual(unitWords("other", "colonies"), { singular: "colony", plural: "colonies" });
  assert.deepEqual(unitWords("other", ""), { singular: "unit", plural: "units" });
});

test("options: normalised and sent to the engine", () => {
  const o = normalizeMixedUnit({ unit: "litter", comparisons: "fisher", scope: "cells", controlIndex: -1 });
  assert.equal(o.scope, "cells");
  assert.equal(o.controlIndex, 0);
  const e = engineUnitOptions(o);
  assert.equal(e.unit_name, "litters");
  assert.equal(e.comparisons, "fisher");
  assert.equal(e.comparison_scope, "cells");
  assert.equal(normalizeMixedUnit({ scope: "rows" }).scope, "b_within_a");
});

test("family header: per family, all together, uncorrected", () => {
  assert.equal(adjustedText(RESULT.comparisons),
    "adjusted for 1 comparison within each of 2 families (Tukey)");
  assert.equal(adjustedText({ method: "sidak", family: { size: 6, method: "sidak", per_family: false, n_families: 6 } }),
    "adjusted for 6 comparisons (Šídák)");
  assert.equal(adjustedText({ method: "fisher_lsd", n_comparisons: 4, family: { size: 4, method: "fisher_lsd" } }),
    "not adjusted for the 4 comparisons (Fisher's LSD)");
  assert.equal(scopeLabel("b_within_a", "Genotype", "Treatment"), "Treatment within each level of Genotype");
  assert.equal(scopeLabel("a_means", "Genotype", null), "Genotype: every pair of levels");
});

test("brackets: each comparison sits on its two cells within its family", () => {
  assert.deepEqual(splitPairOf("A vs. B vs. C", ["A", "B vs. C"]), ["A", "B vs. C"]);
  const b = nestedBrackets(RESULT);
  assert.ok(b);
  assert.equal(b!.set.comparisons.length, 2);
  assert.deepEqual(b!.set.comparisons[1], { a: "Vehicle", b: "Drug", p: 0.2, family: "KO" });
  assert.equal(bracketX(b, "Vehicle", "WT"), cellX(0, 0, 2));
  assert.equal(bracketX(b, "Drug", "KO"), cellX(1, 1, 2));
  assert.equal(cellX(1, 1, 2), 3.9);
  // all cells
  const cells = nestedBrackets({ ...RESULT, comparisons: { ...RESULT.comparisons, scope: "cells",
    comparisons: [{ pair: "WT / Vehicle vs. KO / Drug", p_adjusted: 0.01 }] } });
  assert.equal(bracketX(cells, "KO / Drug"), 3.9);
  // B marginal means span the A groups: not drawn
  const bm = nestedBrackets({ ...RESULT, comparisons: { ...RESULT.comparisons, scope: "b_means",
    comparisons: [{ pair: "Vehicle vs. Drug", p_adjusted: 0.8 }] } });
  assert.equal(bm!.set.unmatched, 1);
  assert.equal(nestedBrackets({ error: "x" }), null);
  assert.deepEqual(factorsOf(RESULT).lb, ["Vehicle", "Drug"]);
});

test("words: ICC sentence, methods text and legend clause", () => {
  const words = unitWords("mouse");
  const s = iccSentence(RESULT, words);
  assert.match(s, /^ICC = 0\.749: 75% of the variation lies between mice/);
  assert.match(s, /design effect is 1 \+ \(4 − 1\) × ICC = 3\.25/);
  assert.match(s, /about as much information as 14\.8 independent ones/);
  const m = mixedMethodsText(RESULT, words, "soma area");
  assert.match(m, /^Soma area was analysed with a linear mixed model with Genotype, Treatment and their interaction/);
  assert.match(m, /value ~ Genotype \* Treatment \+ \(1 \| mouse\)/);
  assert.match(m, /12 mice − 4 cells = 8 df/);
  assert.match(m, /Genotype: F\(1, 8\) = 6\.308\d*, P = 0\.036/);
  assert.match(m, /Treatment within each level of Genotype was compared/);
  assert.match(mixedPlotted(words), /mean of each mouse.*df come from mice/);
});
