// Unit tests for exclusion reasons (project/exclusions.ts) and their
// remapping by the row operations of table.ts. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allReasoned, cleanReason, exclusionGroups, exclusionSentence, excludedValues,
  includeExcluded, newlyExcluded, parseReasons, reasonAt, reasonsText, setReasons,
} from "../exclusions.ts";
import {
  clearBlock, deleteRow, deleteRows, insertRows, normalizeTable, numericData,
  setSubcolumnCount, setSubcolumnFormat, sortRows, toggleBlockExcluded, toggleExcluded,
  type CellRef,
} from "../table.ts";
import type { DataTableModel } from "../types.ts";

// Column tables: flat column 0 holds the row titles, 1 Control, 2 Treated.
/** Two groups of eight mice; Treated's row 3 (41) is the ulcerated one. */
function mice(): DataTableModel {
  return normalizeTable({
    type: "column",
    datasets: [
      { name: "Control", rows: ["12", "14", "11", "13", "15", "12", "14", "13"].map((v) => [v]) },
      { name: "Treated", rows: ["20", "22", "41", "21", "23", "19", "22", "24"].map((v) => [v]) },
    ],
  });
}
const T3: CellRef = { kind: "y", dataset: 1, row: 2, sub: 0 };

test("a reason is set on an excluded value only, and cleaned", () => {
  const t = mice();
  assert.equal(setReasons(t, [T3], "tumour ulceration"), t, "not excluded: unchanged");
  const ex = toggleExcluded(t, T3);
  const r = setReasons(ex, [T3], "  tumour\n ulceration  ");
  assert.equal(reasonAt(r, T3), "tumour ulceration");
  assert.deepEqual(r.datasets[1].exclusionReasons, { "2:0": "tumour ulceration" });
  assert.equal(r.datasets[0].exclusionReasons, undefined);
  // clearing deletes the field again
  assert.equal(setReasons(r, [T3], " ").datasets[1].exclusionReasons, undefined);
  assert.equal(cleanReason("x".repeat(500)).length, 200);
});

test("including a value drops its reason; excluding again starts without one", () => {
  const r = setReasons(toggleExcluded(mice(), T3), [T3], "tumour ulceration");
  const back = toggleExcluded(r, T3);
  assert.equal(back.datasets[1].exclusionReasons, undefined);
  assert.equal(reasonAt(toggleExcluded(back, T3), T3), "");
});

test("the n sentence of the acceptance test: 8 enrolled, 7 analysed, 1 excluded", () => {
  const t = setReasons(toggleExcluded(mice(), T3), [T3], "tumour ulceration");
  const g = exclusionGroups(t)!;
  assert.deepEqual(g.map((x) => [x.name, x.entered, x.excluded, x.analysed]),
    [["Control", 8, 0, 8], ["Treated", 8, 1, 7]]);
  assert.equal(exclusionSentence(t),
    "Treated, n = 8 enrolled, 7 analysed (1 excluded: tumour ulceration); no exclusions in Control");
  // one group: no name
  const one = normalizeTable({ type: "column", datasets: [mice().datasets[1]] });
  const oneEx = setReasons(toggleExcluded(one, { ...T3, dataset: 0 }), [{ ...T3, dataset: 0 }],
    "tumour ulceration");
  assert.equal(exclusionSentence(oneEx), "n = 8 enrolled, 7 analysed (1 excluded: tumour ulceration)");
  assert.equal(exclusionSentence(mice()), null);
});

test("several reasons are counted; a missing one is said to be missing", () => {
  const refs: CellRef[] = [0, 1, 2].map((row) => ({ kind: "y", dataset: 1, row, sub: 0 }));
  let t = toggleBlockExcluded(mice(), { r0: 0, r1: 2, c0: 2, c1: 2 });
  t = setReasons(t, refs.slice(0, 2), "technical failure");
  assert.equal(reasonsText(exclusionGroups(t)![1].reasons),
    "technical failure (2), reason not recorded (1)");
  assert.equal(allReasoned(t), false);
  assert.equal(allReasoned(setReasons(t, [refs[2]], "other")), true);
  assert.deepEqual(excludedValues(t).map((v) => [v.group, v.where, v.value, v.reason]), [
    ["Treated", "row 1", "20", "technical failure"],
    ["Treated", "row 2", "22", "technical failure"],
    ["Treated", "row 3", "41", ""],
  ]);
});

test("reasons follow their values when rows are sorted, inserted or deleted", () => {
  const t = setReasons(toggleExcluded(mice(), T3), [T3], "tumour ulceration");
  // 41 is the largest Treated value: sorted descending it goes to row 0
  const sorted = sortRows(t, { kind: "dataset", dataset: 1 }, "desc");
  assert.deepEqual(sorted.datasets[1].excluded, ["0:0"]);
  assert.equal(reasonAt(sorted, { ...T3, row: 0 }), "tumour ulceration");
  const ins = insertRows(t, 0, 2);
  assert.equal(reasonAt(ins, { ...T3, row: 4 }), "tumour ulceration");
  assert.equal(reasonAt(deleteRow(t, 0), { ...T3, row: 1 }), "tumour ulceration");
  assert.equal(deleteRow(t, 2).datasets[1].exclusionReasons, undefined, "its row deleted");
  assert.equal(deleteRows(t, 2, 1).datasets[1].exclusionReasons, undefined);
  assert.equal(clearBlock(t, { r0: 2, r1: 2, c0: 2, c1: 2 }).datasets[1].exclusionReasons, undefined);
});

test("reasons go with their subcolumn when subcolumns are removed", () => {
  const g = normalizeTable({ type: "grouped", rowTitles: ["Day 1"], datasets: [
    { name: "A", rows: [["1", "2", "3"]] }] });
  const ref: CellRef = { kind: "y", dataset: 0, row: 0, sub: 2 };
  const t = setReasons(toggleExcluded(g, ref), [ref], "technical failure");
  assert.equal(setSubcolumnCount(t, 0, 2).datasets[0].exclusionReasons, undefined);
  assert.equal(reasonAt(setSubcolumnCount(t, 0, 3), ref), "technical failure");
  assert.equal(setSubcolumnFormat(t, "mean_sd").datasets[0].exclusionReasons, undefined);
  // grouped tables count per row × data set
  const ex = exclusionGroups(t)!;
  assert.deepEqual(ex.map((x) => [x.name, x.entered, x.analysed]), [["Day 1 · A", 3, 2]]);
});

test("reasons survive a file round trip; junk is dropped", () => {
  const t = setReasons(toggleExcluded(mice(), T3), [T3], "tumour ulceration");
  const back = normalizeTable(JSON.parse(JSON.stringify(t)));
  assert.equal(reasonAt(back, T3), "tumour ulceration");
  assert.deepEqual(parseReasons({ "2:0": "ok", bad: "x", "1:0": 5, "3:0": "  " }), { "2:0": "ok" });
  assert.equal(parseReasons(["x"]), undefined);
});

test("newlyExcluded lists what a toggle excluded; includeExcluded lifts everything", () => {
  const before = mice();
  const after = toggleBlockExcluded(before, { r0: 1, r1: 2, c0: 1, c1: 2 });
  assert.deepEqual(newlyExcluded(before, after).map((r) => r.kind === "y" && `${r.dataset}:${r.row}`),
    ["0:1", "0:2", "1:1", "1:2"]);
  assert.deepEqual(newlyExcluded(after, toggleBlockExcluded(after, { r0: 1, r1: 2, c0: 1, c1: 2 })), []);
  const all = includeExcluded(setReasons(after, newlyExcluded(before, after), "x"));
  assert.ok(all.datasets.every((d) => !d.excluded && !d.exclusionReasons));
  assert.deepEqual(numericData(all).datasets[1].ys.flat().length, 8);
});

test("XY: a whole excluded X row counts in every data set; survival counts subjects", () => {
  const xy = normalizeTable({ type: "xy", x: ["1", "2"], xExcluded: [1],
    datasets: [{ name: "A", rows: [["1", "2"], ["3", "4"]] }] });
  const g = exclusionGroups(xy)!;
  assert.deepEqual([g[0].entered, g[0].excluded, g[0].analysed], [4, 2, 2]);
  assert.equal(excludedValues(xy)[0].where, "row 2");
  const surv = normalizeTable({ type: "survival", datasets: [{ name: "Mice", subTitles: ["Time", "Event"],
    rows: [["5", "1"], ["9", "0"], ["", ""]] }] });
  const s = toggleExcluded(surv, { kind: "y", dataset: 0, row: 1, sub: 1 });
  assert.equal(exclusionSentence(s), "n = 2 enrolled, 1 analysed (1 excluded: reason not recorded)");
  // counts without an n (contingency)
  const ct = normalizeTable({ type: "contingency", rowTitles: ["a"], datasets: [{ name: "Yes", rows: [["4"]] }] });
  assert.equal(exclusionSentence(toggleExcluded(ct, { kind: "y", dataset: 0, row: 0, sub: 0 })),
    "1 value excluded from the analysis (reason not recorded)");
});
