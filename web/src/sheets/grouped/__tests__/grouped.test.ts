// Unit tests for the grouped-table helpers. Run: npm run test:unit
// Reference numbers come from SciPy / NumPy (see comments).
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyTable, normalizeTable, setCell } from "../../../project/table.ts";
import {
  defaultAssign, normalizeGraph, normalizeHeat, normalizeMultiT, normalizeThreeWay,
  normalizeTwoWay,
} from "../options.ts";
import {
  barPositions, cellStats, colorAt, errorExtent, grandValue, groupedPayload,
  hasMissingRM, heatStops, inkOn, summarize, summaryCell, tCdf, tQuantile,
} from "../stats.ts";
import { rowMeansTable } from "../tables.ts";
import { groupedComparisons, threeWayCells } from "../comparisons.ts";

const close = (a: number | null, b: number, tol = 1e-9) =>
  assert.ok(a !== null && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)),
    `${a} != ${b}`);

test("Student t distribution matches scipy.stats.t", () => {
  close(tQuantile(0.975, 2), 4.302652729749462);
  close(tQuantile(0.975, 12), 2.1788128296672284);
  close(tQuantile(0.975, 1), 12.706204736174694);
  close(tQuantile(0.025, 12), -2.1788128296672284);
  close(tCdf(1.5, 7), 0.911350756505015);
});

test("replicate cell summary (numpy / scipy)", () => {
  const c = summarize([152, 168, 141])!;
  close(c.mean, 153.66666666666666);
  close(c.sd, 13.576941236277534);
  close(c.sem, 7.838650677536565);
  close(c.ciLo, 119.93967493141149);
  close(c.q1, 146.5); // np.percentile(v, 25)
  close(c.median, 152);
  assert.deepEqual(errorExtent(c, "range"), [153.66666666666666 - 141, 168 - 153.66666666666666]);
  assert.equal(summarize([]), null);
  assert.equal(summarize([5])!.sd, null);
});

test("summary formats convert to SD / SEM", () => {
  const sd = summaryCell([10, 2, 4], "mean_sd_n")!;
  close(sd.sem, 1);
  const sem = summaryCell([10, 1, 4], "mean_sem_n")!;
  close(sem.sd, 2);
  const cv = summaryCell([10, 20, 4], "mean_cv_n")!;
  close(cv.sd, 2);
  const lim = summaryCell([10, 13, 8], "upper_lower")!;
  assert.deepEqual(errorExtent(lim, "sd"), [2, 3]);
  assert.equal(summaryCell([null, 1, 2], "mean_sd_n"), null);
});

test("cell stats, grand mean and the grouped payload honor the table", () => {
  let t = emptyTable("grouped", { datasets: 2, subcolumns: 2, rows: 2 });
  t = setCell(t, 0, 0, 0, "1");
  t = setCell(t, 0, 0, 1, "3");
  t = setCell(t, 1, 1, 0, "10");
  const cells = cellStats(t);
  close(cells[0][0]!.mean, 2);
  assert.equal(cells[0][1], null);
  close(cells[1][1]!.mean, 10);
  close(grandValue(cells, "mean"), 14 / 3);
  close(grandValue(cells, "median"), 3);
  const p = groupedPayload(t);
  assert.deepEqual(p.row_titles, ["Row 1", "Row 2"]);
  assert.deepEqual(p.datasets[0].ys, [[1, 3], [null, null]]);
});

test("missing repeated measures are detected per design", () => {
  const complete = [[[1, 2], [3, 4]], [[5, 6], [7, 8]]];
  assert.equal(hasMissingRM(complete, false), false);
  const gap = [[[1, 2], [3, null]], [[5, 6], [7, 8]]];
  assert.equal(hasMissingRM(gap, false), true);
  // mixed design: a group with fewer subjects is not "missing"
  const unequal = [[[1, null], [3, null]], [[5, 6], [7, 8]]];
  assert.equal(hasMissingRM(unequal, false), false);
  assert.equal(hasMissingRM(unequal, true), true);
});

test("bar positions fill each cluster symmetrically", () => {
  const { width, x } = barPositions(2, 3, 0.25, 0);
  close(width, 0.25);
  assert.deepEqual(x[0].map((v) => +v.toFixed(6)), [-0.25, 0, 0.25]);
  assert.deepEqual(x[1].map((v) => +v.toFixed(6)), [0.75, 1, 1.25]);
});

test("heat-map color stops and label ink", () => {
  const seq = heatStops("sequential", "#2a78d6", "#eb6834", false);
  assert.equal(seq[0][0], 0);
  assert.equal(seq[seq.length - 1][0], 1);
  const div = heatStops("diverging", "#2a78d6", "#eb6834", false, 0.25);
  assert.equal(colorAt(div, 0.25), "#f4f4f2");
  const rev = heatStops("grayscale", "#000000", "#000000", true);
  assert.equal(colorAt(rev, 0), "#1d1d1f");
  assert.equal(inkOn("#1d1d1f"), "#ffffff");
  assert.equal(inkOn("#f4f4f6"), "#1d1d1f");
});

test("option normalizers keep valid values and repair the rest", () => {
  assert.deepEqual(defaultAssign(5), [[0, 0], [0, 1], [1, 0], [1, 1], null]);
  const tw = normalizeThreeWay({ assign: [[1, 1], null, "x"], method: "nope" }, 3);
  assert.deepEqual(tw.assign, [[1, 1], null, [1, 0]]);
  assert.equal(tw.method, "none_cmp");
  assert.equal(normalizeTwoWay({ design: "rm_rows" }).design, "rm_rows");
  assert.equal(normalizeTwoWay({ design: 3 }).design, "none");
  assert.equal(normalizeMultiT({ method: "bh", test: "paired" }).test, "paired");
  assert.equal(normalizeGraph({ clusterGap: 5 }).clusterGap, 0.9);
  assert.equal(normalizeHeat({ missing: "red" }).missing, "#d1d1d6");
});

test("row means copy into a grouped table with mean, SD and N", () => {
  const t = rowMeansTable({
    calculate: "mean", error_type: "sd", scope: "row", row_titles: ["Day 7", "Day 14"],
    rows: [{ value: 151.3, sd: 3.3, n: 2 }, { value: 269.3, sd: 67.4, n: 2 }],
  }, "Tumour growth");
  assert.equal(t.type, "grouped");
  assert.equal(t.subcolumnFormat, "mean_sd_n");
  assert.deepEqual(t.rowTitles, ["Day 7", "Day 14"]);
  assert.deepEqual(t.datasets[0].rows[1], ["269.3", "67.4", "2"]);
  const again = normalizeTable(t);
  assert.deepEqual(again.datasets[0].subTitles, ["Mean", "SD", "N"]);
});

test("grouped comparisons: two-way within rows, multiple t tests, three-way cells", () => {
  const table = normalizeTable({
    type: "grouped", x: ["", ""], rowTitles: ["Day 7", "Day 14"],
    datasets: [{ name: "Control", rows: [["1"], ["2"]] }, { name: "Drug", rows: [["3"], ["4"]] }],
  });
  const twoWay = { multiple_comparisons: { method: "sidak", comparisons: [
    { family: "Day 7", pair: "Control vs. Drug", p_adjusted: 0.02 },
    { family: "Day 14", pair: "Control vs. Drug", p_adjusted: 0.0004 },
    { family: "Column main effect", pair: "Control vs. Drug", p_adjusted: 0.01 },
  ] } };
  const tw = groupedComparisons(twoWay, table)!;
  assert.equal(tw.comparisons.length, 3);
  assert.deepEqual(tw.comparisons[0], { a: "Control", b: "Drug", p: 0.02, family: "Day 7" });
  assert.equal(tw.comparisons[2].family, undefined);

  const multiT = { names: ["Control", "Drug"], n_tests: 2, approach: "fdr", method: "bky",
    rows: [{ row: "Day 7", p: 0.01, p_adjusted: 0.02 }, { row: "Day 14", p: null, omitted: "n < 2" }] };
  const mt = groupedComparisons(multiT, table)!;
  assert.deepEqual(mt.comparisons, [{ a: "Control", b: "Drug", p: 0.02, family: "Day 7" }]);
  assert.equal(mt.unmatched, 1);
  assert.match(mt.label, /q values/);

  const threeWay = { multiple_comparisons: { method: "tukey",
    means: [{ label: "Day 7:B1:C1", cell: [0, 0, 0] }, { label: "Day 7:B2:C1", cell: [0, 1, 0] }],
    comparisons: [{ pair: "Day 7:B1:C1 vs. Day 7:B2:C1", p_adjusted: 0.03 }] } };
  assert.deepEqual(threeWayCells(threeWay).get("Day 7:B2:C1"), [0, 1, 0]);
  assert.deepEqual(groupedComparisons(threeWay, table)!.comparisons,
    [{ a: "Day 7:B1:C1", b: "Day 7:B2:C1", p: 0.03 }]);
  assert.equal(groupedComparisons({ error: "x" }, table), null);
});

test("row means table: Y title from what was averaged, or the statistic alone", () => {
  const r = { calculate: "mean", error_type: "sd", scope: "row", row_titles: ["A"],
    rows: [{ value: 1, sd: 0.5, n: 3 }] };
  assert.equal(rowMeansTable(r, "Volume").yTitle, "Mean of Volume");
  assert.equal(rowMeansTable(r, "").yTitle, "Mean");
});
