// Import frictions found by the site validation run: titles rows,
// replicate stems, unfilled data sets, factor names. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyTable, pasteBlock, parseClipboardGrid } from "../table.ts";
import {
  applyImport, datasetTitle, DEFAULT_FILTER, DEFAULT_SOURCE, defaultRoles, detectTitlesRow,
  dropUnfilledDatasets, pasteNeedsImport, prepareImport,
} from "../importText.ts";

test("a titles row is detected when text sits above columns of numbers", () => {
  assert.ok(detectTitlesRow("ID,drug1,drug2\n1,0.7,1.9\n2,-1.6,0.8", DEFAULT_SOURCE));
  assert.ok(detectTitlesRow("group\tvalue\nA\t1.2\nB\t3.4", DEFAULT_SOURCE));
  assert.ok(!detectTitlesRow("1,2,3\n4,5,6\n7,8,9", DEFAULT_SOURCE));
  // row titles in the first column are not a titles row
  assert.ok(!detectTitlesRow("Control\t5\t6\nTreated\t7\t8", DEFAULT_SOURCE));
  // a note line above the titles: only once it is skipped
  const csv = "Exported from reader\nx,y\n1,2\n3,4";
  assert.ok(detectTitlesRow(csv, { ...DEFAULT_SOURCE, skipLines: 1 }));
  // spreadsheet blocks with titles go through the Import dialog
  assert.ok(pasteNeedsImport("treated\tcontrol\n1\t2\n3\t4"));
  assert.ok(!pasteNeedsImport("1\t2\n3\t4"));
});

test("data sets are named after the stem of their replicate titles", () => {
  assert.equal(datasetTitle(["treated_1", "treated_2"]), "treated");
  assert.equal(datasetTitle(["A1", "A2", "A3"]), "A");
  assert.equal(datasetTitle(["Control rep 1", "Control rep 2"]), "Control rep");
  assert.equal(datasetTitle(["Drug"]), "Drug");
  assert.equal(datasetTitle(["alpha", "beta"]), "alpha");
  const t = emptyTable("xy");
  const p = prepareImport("conc,treated_1,treated_2,untreated_1,untreated_2\n0.02,76,47,67,51\n0.06,97,107,84,86",
    { ...DEFAULT_SOURCE, titlesRow: true }, DEFAULT_FILTER);
  const out = applyImport(t, p, defaultRoles(t, p),
    { mode: "replace", row: 0, col: 0, perDataset: 2, useTitles: true }, DEFAULT_FILTER);
  assert.deepEqual(out.datasets.map((d) => d.name), ["treated", "untreated"]);
});

test("pasting two columns into an empty three-group table leaves two groups", () => {
  const t = emptyTable("column");
  assert.equal(t.datasets.length, 3);
  const p = prepareImport("ID,drug1,drug2\n1,0.7,1.9\n2,-1.6,0.8",
    { ...DEFAULT_SOURCE, titlesRow: true }, DEFAULT_FILTER);
  const roles = defaultRoles(t, p);
  roles[0] = "rowTitle";
  const ins = applyImport(t, p, roles, { mode: "insert", row: 0, col: 1, perDataset: 1, useTitles: true },
    DEFAULT_FILTER);
  assert.deepEqual(ins.datasets.map((d) => d.name), ["drug1", "drug2"]);
  const grid = dropUnfilledDatasets(t, pasteBlock(t, 0, 1, parseClipboardGrid("1\t2\n3\t4")));
  assert.equal(grid.datasets.length, 2);
  // one column: the other groups stay for the next paste
  assert.equal(dropUnfilledDatasets(t, pasteBlock(t, 0, 1, parseClipboardGrid("1\n2"))).datasets.length, 3);
  // a table that already held values keeps its data sets
  const filled = pasteBlock(t, 0, 1, parseClipboardGrid("9"));
  assert.equal(dropUnfilledDatasets(filled, pasteBlock(filled, 0, 2, parseClipboardGrid("1\t2\n3\t4")))
    .datasets.length, 3);
});

test("the header above the row titles names the row factor", () => {
  const t = emptyTable("grouped");
  const p = prepareImport("tension,A,A,B,B\nL,26,30,27,14\nM,18,21,42,26",
    { ...DEFAULT_SOURCE, titlesRow: true }, DEFAULT_FILTER);
  const roles = defaultRoles(t, p);
  assert.equal(roles[0], "rowTitle");
  const out = applyImport(t, p, roles, { mode: "replace", row: 0, col: 0, perDataset: 2, useTitles: true },
    DEFAULT_FILTER);
  assert.equal(out.factorNames?.rows, "tension");
  assert.deepEqual(out.datasets.map((d) => d.name), ["A", "B"]);
});
