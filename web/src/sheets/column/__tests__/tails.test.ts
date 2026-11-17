// One-tailed P values of two-group tests: the alternative in words, the
// sidedness the analysis plan records, and an unchanged engine payload
// (p_greater / p_less come with every result). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { sidedness } from "../../../project/plan.ts";
import { DEFAULT_COLUMN_OPTIONS, type ColumnOptionsState } from "../../../types.ts";
import { columnPayload } from "../run.ts";
import { oneTailedAlternative } from "../tails.ts";

test("the alternative names the groups and the test's quantity", () => {
  const r = (test: string) => ({ test, names: ["Treated", "Control"] });
  assert.equal(oneTailedAlternative(r("unpaired_t"), "greater"), "mean of Treated > mean of Control");
  assert.equal(oneTailedAlternative(r("paired_t"), "less"), "mean of the differences Treated − Control < 0");
  assert.equal(oneTailedAlternative(r("ratio_paired_t"), "greater"), "ratio Treated/Control > 1");
  assert.equal(oneTailedAlternative(r("mann_whitney"), "less"), "Treated tends to be smaller than Control");
  assert.equal(oneTailedAlternative(r("wilcoxon_matched_pairs"), "greater"),
    "differences Treated − Control tend to be positive");
});

test("a one-tailed choice is recorded as one-sided, except for Kolmogorov-Smirnov", () => {
  assert.equal(sidedness("column", { analysis: "ttest", ttestKind: "unpaired", ttestTails: "greater" }), "one");
  assert.equal(sidedness("column", { analysis: "ttest", ttestKind: "mann_whitney", ttestTails: "less" }), "one");
  assert.equal(sidedness("column", { analysis: "ttest", ttestKind: "unpaired", ttestTails: "two" }), "two");
  assert.equal(sidedness("column", { analysis: "ttest", ttestKind: "kolmogorov_smirnov", ttestTails: "greater" }), "two");
});

test("choosing a tail leaves the engine payload unchanged", () => {
  const table = normalizeTable({ type: "column", datasets: [
    { name: "A", rows: [["1"], ["2"], ["3"]] }, { name: "B", rows: [["4"], ["5"], ["7"]] }] });
  const o = (patch: Partial<ColumnOptionsState>) => ({ ...DEFAULT_COLUMN_OPTIONS, analysis: "ttest", ...patch }) as ColumnOptionsState;
  assert.deepEqual(columnPayload(table, o({ ttestTails: "greater" })), columnPayload(table, o({})));
});
