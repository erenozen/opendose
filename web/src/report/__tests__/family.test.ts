// Comparison families in words (report/family.ts) and where they show:
// the legend, the methods paragraph and the results sentences. The blocks
// below have the shapes the engine returns (engine/tests/
// test_comparison_families.py, test_anova_families.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adjustedHeader, familyDetail, familyHeader, familyLine, familyMethodsClause, familyOf,
  hasUnadjusted, resultFamily,
} from "../family.ts";
import { legendParagraph } from "../legend.ts";
import { statsMethodsParagraph } from "../methods.ts";
import { resultSentence } from "../sentences.ts";
import { DEFAULT_REPORT } from "../prefs.ts";

const cmp = (pair: string, pAdj: number, pUn: number, size: number, method: string, extra = {}) => ({
  pair, difference: -5.2, ci: [-7.7, -2.7], statistic: 8.1, p_adjusted: pAdj,
  significant_05: pAdj < 0.05, p_unadjusted: pUn, family_size: size, method, ...extra,
});

const groups = ["Control", "A", "B", "C"].map((name) => ({ name, n: 6, mean: 1, sd: 1 }));
const tukeyAnova = {
  analysis: "anova", kind: "parametric",
  table: { df_between: 3, df_within: 20, F: 66.3, p: 1e-10, ss_between: 1, ss_within: 1 },
  group_summaries: groups,
  multiple_comparisons: {
    method: "tukey", df: 20,
    comparisons: [cmp("Control vs. A", 7.4e-5, 1.35e-5, 6, "tukey"),
      cmp("Control vs. B", 2.9e-10, 5.1e-11, 6, "tukey")],
    family: { size: 6, method: "tukey", label: "Tukey, 6 comparisons (all pairs of 4 groups)" },
  },
};
const plannedSidak = {
  ...tukeyAnova,
  multiple_comparisons: {
    method: "sidak", df: 20,
    comparisons: [cmp("Control vs. A", 2.7e-5, 1.35e-5, 2, "sidak", { a_index: 0, b_index: 1 }),
      cmp("Control vs. B", 1e-10, 5.1e-11, 2, "sidak", { a_index: 0, b_index: 2 })],
    family: { size: 2, method: "sidak", label: "Šídák, 2 comparisons (planned pairs only)" },
    planned_pairs: [[0, 1], [0, 2]],
  },
};
const dunnControl = {
  analysis: "anova", kind: "nonparametric", H: 19.8, p: 1.9e-4, group_summaries: groups,
  dunns: {
    method: "dunns",
    comparisons: [cmp("A vs. Control", 0.038, 0.0128, 3, "dunn_bonferroni"),
      cmp("B vs. Control", 2.2e-4, 7.5e-5, 3, "dunn_bonferroni"),
      cmp("C vs. Control", 1, 0.57, 3, "dunn_bonferroni")],
    family: { size: 3, method: "dunn_bonferroni",
      label: "Dunn (Bonferroni), 3 comparisons (each of 3 groups vs. the control Control)" },
  },
};

test("family of a Tukey table: header, line, legend, methods, sentence", () => {
  const f = familyOf(tukeyAnova.multiple_comparisons)!;
  assert.equal(f.size, 6);
  assert.equal(f.kind, "adjusted");
  assert.equal(familyHeader(f), "adjusted for 6 comparisons (Tukey)");
  assert.equal(familyLine(f), "P values adjusted for 6 comparisons (Tukey): all pairs of 4 groups.");
  assert.equal(adjustedHeader(f), "Adjusted P");
  assert.ok(hasUnadjusted(tukeyAnova.multiple_comparisons.comparisons));
  const legend = legendParagraph({ graphType: "scatter", result: tukeyAnova, style: "graphpad",
    software: "OpenDose" });
  assert.match(legend, /with P values adjusted for 6 comparisons \(Tukey\)/);
  const methods = statsMethodsParagraph(tukeyAnova, DEFAULT_REPORT, undefined);
  assert.match(methods, /Tukey's correction for 6 comparisons: all pairs of 4 groups/);
  assert.match(resultSentence(tukeyAnova), /Tukey's multiple comparisons test \(P values adjusted for 6 comparisons\):/);
});

test("Dunn's test against a control: three comparisons corrected for three", () => {
  const f = resultFamily(dunnControl)!;
  assert.equal(f.size, 3);
  assert.equal(f.control, true);
  assert.equal(f.planned, false);
  assert.equal(familyHeader(f), "adjusted for 3 comparisons (Dunn)");
  assert.equal(familyDetail(dunnControl.dunns.family.label),
    "each of 3 groups vs. the control Control");
  assert.match(familyMethodsClause(f), /^Bonferroni correction for 3 comparisons \(each of 3 groups vs\. the control Control\)$/);
});

test("planned pairs: Šídák correction for 2 planned comparisons", () => {
  const f = resultFamily(plannedSidak)!;
  assert.equal(f.planned, true);
  assert.equal(familyHeader(f), "adjusted for 2 planned comparisons (Šídák)");
  assert.equal(familyMethodsClause(f), "Šídák correction for 2 planned comparisons");
  assert.match(statsMethodsParagraph(plannedSidak, DEFAULT_REPORT, undefined),
    /Šídák correction for 2 planned comparisons/);
});

test("two-way Tukey within each row, FDR, uncorrected and legacy results", () => {
  const tw = familyOf({ method: "tukey", comparisons: [cmp("A vs. B", 0.1, 0.04, 3, "tukey", { family: "Row 1" })],
    family: { size: 3, method: "tukey", label: "Tukey, 3 comparisons within each row (2 separate families)",
      n_families: 2, per_family: true } })!;
  assert.equal(familyHeader(tw), "adjusted for 3 comparisons (Tukey), separately within each of 2 families");
  const fdr = resultFamily({ analysis: "multiple_row_tests", approach: "fdr", method: "bky", n_tests: 4,
    rows: [{ p: 0.01, p_adjusted: 0.03, p_unadjusted: 0.01, family_size: 4, method: "bky" }],
    family: { size: 4, method: "bky", label: "Two-stage Benjamini-Krieger-Yekutieli FDR, 4 comparisons (one test per row, 1 row left out)" } })!;
  assert.equal(fdr.kind, "fdr");
  assert.equal(adjustedHeader(fdr), "q value");
  assert.match(familyLine(fdr), /^Q values: false discovery rate controlled over 4 comparisons/);
  const lsd = familyOf({ method: "fisher_lsd", comparisons: [cmp("A vs. B", 0.04, 0.04, 6, "fisher_lsd")],
    family: { size: 6, method: "fisher_lsd", label: "Fisher's LSD (no correction), 6 comparisons (all pairs of 4 groups)" } })!;
  assert.equal(lsd.kind, "unadjusted");
  assert.equal(adjustedHeader(lsd), "P (not adjusted)");
  assert.equal(familyHeader(lsd), "not adjusted for multiple comparisons (Fisher's LSD; 6 comparisons)");
  // a result saved before the engine labelled families says nothing new
  assert.equal(familyOf({ method: "tukey", comparisons: [{ pair: "A vs. B", p_adjusted: 0.1 }] }), null);
  assert.doesNotMatch(statsMethodsParagraph({ ...tukeyAnova, multiple_comparisons: {
    method: "tukey", comparisons: [{ pair: "A vs. B", p_adjusted: 0.1 }] } }, DEFAULT_REPORT, undefined),
  /comparisons:/);
});
