// Engine payloads for the nested analyses. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable, toggleExcluded } from "../../../project/table.ts";
import {
  DEFAULT_NESTED_ANOVA, DEFAULT_NESTED_T, nestedAnovaPayload, nestedTPayload,
  normalizeNestedAnova,
} from "../run.ts";

// Group A: subcolumns A1 (1, 2), A2 (3, blank), A3 (empty).
// Group B: B1 (5, 6), B2 titled "Dish 2" (7, 8), B3 (9, blank).
const table = () => normalizeTable({
  type: "nested",
  x: ["", ""],
  datasets: [
    { name: "Ctrl", rows: [["1", "3", ""], ["2", "", ""]] },
    { name: "", subTitles: ["", "Dish 2", ""], rows: [["5", "7", "9"], ["6", "8", ""]] },
  ],
});

test("groups = datasets, subgroups = non-empty subcolumns, names aligned", () => {
  const b = nestedTPayload(table(), DEFAULT_NESTED_T);
  assert.equal(b.error, undefined);
  assert.deepEqual(b.payload, {
    analysis: "nested_ttest",
    data: { groups: [
      { name: "Ctrl", subgroups: [[1, 2], [3]], subgroup_names: ["A1", "A2"] },
      { name: "Group B", subgroups: [[5, 6], [7, 8], [9]],
        subgroup_names: ["B1", "Dish 2", "B3"] },
    ] },
    options: { ci_level: 0.95, swap: false, negative_variance: "allow" },
  });
});

test("excluded values are left out; dunnett control index passes through", () => {
  const t = toggleExcluded(table(), { kind: "y", dataset: 1, row: 0, sub: 2 });
  const b = nestedAnovaPayload(t, { ...DEFAULT_NESTED_ANOVA, comparisons: "dunnett",
    controlIndex: 1 });
  const p = b.payload as { data: { groups: { subgroups: number[][] }[] }; options: unknown };
  assert.deepEqual(p.data.groups[1].subgroups, [[5, 6], [7, 8]]);
  assert.deepEqual(p.options, { comparisons: "dunnett", control_index: 1,
    ci_level: 0.95, negative_variance: "allow" });
  const none = nestedAnovaPayload(t, { ...DEFAULT_NESTED_ANOVA, comparisons: "none" });
  assert.equal((none.payload as { options: { comparisons: unknown } }).options.comparisons, null);
});

test("friendly errors before the engine is asked", () => {
  const empty = normalizeTable({ type: "nested", x: ["", ""],
    datasets: [{ name: "A", rows: [["", ""], ["", ""]] }, { name: "B", rows: [["", ""], ["", ""]] }] });
  assert.match(nestedAnovaPayload(empty, DEFAULT_NESTED_ANOVA).error ?? "", /Enter replicate values/);
  assert.match(nestedTPayload(table(), { ...DEFAULT_NESTED_T, groupB: 0 }).error ?? "",
    /two different groups/);
  const oneSubEach = normalizeTable({ type: "nested", x: ["", ""],
    datasets: [{ name: "A", rows: [["1"], ["2"]] }, { name: "B", rows: [["3"], ["4"]] }] });
  assert.match(nestedAnovaPayload(oneSubEach, DEFAULT_NESTED_ANOVA).error ?? "",
    /two or more subcolumns/);
  assert.deepEqual(normalizeNestedAnova({ comparisons: "bogus", ciLevel: 0.99 }),
    { ...DEFAULT_NESTED_ANOVA, ciLevel: 0.99 });
});
