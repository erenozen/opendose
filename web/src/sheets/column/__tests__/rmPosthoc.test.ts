// Comparisons after repeated-measures one-way ANOVA. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { DEFAULT_COLUMN_OPTIONS, type ColumnOptionsState } from "../../../types.ts";
import { columnPayload } from "../run.ts";
import {
  baselineName, fitsMixedModel, incompleteSubjects, mixedLimitations, mixedOptions,
  rmComparisonsOf, rmComparisonsSpec, rmMethodsSentence,
} from "../rmPosthoc.ts";
import { extractComparisons } from "../../../graph/results.ts";
import { familyLine, resultFamily } from "../../../report/family.ts";
import { describeResult } from "../../../report/describe.ts";
import { resultSentences } from "../../../report/sentences.ts";
import { familyTarget } from "../comparisonsFamily.ts";

const o = (patch: Partial<ColumnOptionsState>) =>
  ({ ...DEFAULT_COLUMN_OPTIONS, analysis: "rm_anova", ...patch } as ColumnOptionsState);
const table = normalizeTable({
  type: "column",
  datasets: [
    { name: "Baseline", rows: [["10"], ["12"], ["9"]] },
    { name: "Day 7", rows: [["14"], ["15"], [""]] },
    { name: "Day 14", rows: [["18"], ["16"], ["15"]] },
  ],
});

// Engine output (rm_anova, comparisons {method: dunnett, control: 0, error: per_pair})
const rm = {
  analysis: "rm_one_way_anova", n_subjects: 6, names: ["Baseline", "Day 7", "Day 14"],
  table: { F: 97.1, df_treatment: 2, df_error: 10, gg_epsilon: 0.682, p_geisser_greenhouse: 1.7e-5 },
  comparisons: {
    method: "dunnett", df: 5, error: "per_pair", names: ["Baseline", "Day 7", "Day 14"],
    comparisons: [
      { pair: "Day 7 vs. Baseline", a_index: 1, b_index: 0, difference: 3.667, ci: [2.68, 4.65],
        p_unadjusted: 1.08e-4, p_adjusted: 1.78e-4, family_size: 2, method: "dunnett" },
      { pair: "Day 14 vs. Baseline", a_index: 2, b_index: 0, difference: 6.667, ci: [4.85, 8.48],
        p_unadjusted: 1.16e-4, p_adjusted: 1.90e-4, family_size: 2, method: "dunnett" },
    ],
    family: { size: 2, method: "dunnett", label: "Dunnett, 2 comparisons (each of 2 groups vs. the control Baseline)" },
  },
};

test("the comparisons block sent to rm_anova", () => {
  // the default (Tukey) with each pair's own differences
  assert.deepEqual(rmComparisonsSpec(o({}), 3), { method: "tukey", control: 0, error: "per_pair" });
  // the flow module's stored keys: comparisons "dunnett", controlIndex 0
  assert.deepEqual(rmComparisonsSpec(o({ comparisons: "dunnett", controlIndex: 0 }), 3),
    { method: "dunnett", control: 0, error: "per_pair" });
  assert.deepEqual(rmComparisonsSpec(o({ comparisons: "dunnett", controlIndex: 7 }), 3),
    { method: "dunnett", control: 0, error: "per_pair" }, "baseline out of range");
  assert.equal(rmComparisonsSpec(o({ comparisons: "none" }), 3), null);
  assert.equal(rmComparisonsSpec(o({ comparisons: "newman_keuls" }), 3), null);
  assert.equal(rmComparisonsSpec(o({ rmKind: "nonparametric" }), 3), null);
  assert.deepEqual(rmComparisonsSpec(o({ comparisons: "sidak", comparisonsFamily: "pairs",
    plannedPairs: [[0, 2]], rmComparisonsError: "pooled" }), 3),
  { method: "sidak", control: 0, error: "pooled", family: "pairs", pairs: [[0, 2]] });
  assert.deepEqual(rmComparisonsSpec(o({ comparisons: "holm", comparisonsFamily: "control",
    controlIndex: 1 }), 3), { method: "holm", control: 1, error: "per_pair", family: "control" });
  assert.equal(familyTarget(o({ comparisons: "sidak" })), "posthoc");
  assert.equal(familyTarget(o({ comparisons: "tukey" })), null);
});

test("payload: parametric adds the comparisons, Friedman keeps its options", () => {
  assert.deepEqual(columnPayload(table, o({ comparisons: "dunnett" })).options,
    { kind: "parametric", comparisons: { method: "dunnett", control: 0, error: "per_pair" } });
  assert.deepEqual(columnPayload(table, o({ comparisons: "none" })).options, { kind: "parametric" });
  assert.deepEqual(columnPayload(table, o({ rmKind: "nonparametric", comparisons: "dunnett" })).options,
    { kind: "nonparametric" });
});

test("missing values: the mixed-effects model when chosen", () => {
  assert.equal(incompleteSubjects(table), 1);
  assert.equal(fitsMixedModel(o({}), table), false);
  assert.equal(fitsMixedModel(o({ rmMixed: true }), table), true);
  assert.equal(fitsMixedModel(o({ rmMixed: true, rmKind: "nonparametric" }), table), false);
  assert.deepEqual(mixedOptions(o({ comparisons: "dunnett", controlIndex: 2 }), 3),
    { method: "mixed", comparisons: "dunnett", control_index: 2 });
  assert.deepEqual(mixedOptions(o({ comparisons: "fisher_lsd" }), 3),
    { method: "mixed", comparisons: "fisher", control_index: 0 });
  assert.equal(mixedOptions(o({ comparisons: "holm" }), 3).comparisons, null);
  assert.match(mixedLimitations(o({ comparisons: "holm" }), 3), /Holm/);
  assert.equal(mixedLimitations(o({ comparisons: "tukey" }), 3), "");
});

test("the comparisons reach brackets, family line, describe and sentences", () => {
  assert.equal(rmComparisonsOf(rm), rm.comparisons);
  const set = extractComparisons(rm, ["Baseline", "Day 7", "Day 14"]);
  assert.equal(set?.comparisons.length, 2);
  assert.deepEqual(set?.comparisons.map((c) => [c.a, c.b]), [["Day 7", "Baseline"], ["Day 14", "Baseline"]]);
  const fam = resultFamily(rm);
  assert.equal(fam?.size, 2);
  assert.match(familyLine(fam!), /^P values adjusted for 2 comparisons \(Dunnett\)/);
  assert.match(describeResult(rm).posthoc ?? "", /Dunnett/);
  const s = resultSentences(rm);
  assert.equal(s.length, 2);
  assert.match(s[1], /Day 7 vs\. Baseline/);
  assert.equal(baselineName(rm.comparisons), "Baseline");
});

test("methods sentence names the test, the baseline and the error term", () => {
  assert.equal(rmMethodsSentence(rm),
    "Matched values were compared by repeated-measures one-way ANOVA with the Geisser-Greenhouse "
    + "correction, followed by Dunnett's test vs. Baseline; each comparison used only the paired "
    + "differences of its two treatments (sphericity not assumed), P values adjusted for 2 comparisons.");
  assert.equal(rmMethodsSentence({ analysis: "rm_one_way_anova" }),
    "Matched values were compared by repeated-measures one-way ANOVA with the Geisser-Greenhouse correction.");
  const mixed = { analysis: "mixed_rm_one_way", n_missing: 2, n_subjects: 6, names: rm.names,
    multiple_comparisons: { method: "tukey", comparisons: [{ pair: "Baseline vs. Day 7" }], family: { size: 3 } } };
  assert.match(rmMethodsSentence(mixed), /mixed-effects model .* 2 missing values, 6 subjects/);
  assert.match(rmMethodsSentence(mixed), /Tukey's multiple comparisons test; each comparison used the model's estimated means/);
});
