// Notes strip: nothing an analysis drops goes unmentioned, and the
// "Analysed" line names n and the rows left out. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable, numericData, toggleExcluded } from "../table.ts";
import type { DataTableModel } from "../types.ts";
import { analysisPlan, cellName, dataNotes, engineMessages } from "../dataNotes.ts";
import { columnPayload } from "../../sheets/column/run.ts";
import { groupedPayload } from "../../sheets/grouped/stats.ts";
import { DEFAULT_COLUMN_OPTIONS, type ColumnOptionsState } from "../../types.ts";

const col = (o: Partial<ColumnOptionsState>) => ({ ...DEFAULT_COLUMN_OPTIONS, ...o });

const column = (cols: string[][], names = ["Before", "After", "C"]) => normalizeTable({
  type: "column",
  datasets: cols.map((c, i) => ({ name: names[i], rows: c.map((v) => [v]) })),
}, "column");

test("a paired t test with two incomplete pairs: n = 10 pairs; rows 4 and 9 left out", () => {
  const a = ["1", "2", "3", "", "5", "6", "7", "8", "9", "10", "11", "12"];
  const b = ["1.5", "2.4", "3.6", "4.1", "5.2", "6.9", "7.1", "8.8", "", "10.2", "11.1", "12.9"];
  const t = column([a, b]);
  const o = col({ analysis: "ttest", ttestKind: "paired", datasetA: 0, datasetB: 1 });
  const n = dataNotes({ analysisId: "column", table: t, options: o, result: null });
  assert.equal(n.analysed, "n = 10 pairs analysed; 2 incomplete pairs (rows 4, 9) left out");
  // the engine's own count wins when it reports one
  const e = dataNotes({ analysisId: "column", table: t, options: o, result: { n_pairs: 10 } });
  assert.equal(e.analysed, "n = 10 pairs analysed; 2 incomplete pairs (rows 4, 9) left out");
  const mismatch = dataNotes({ analysisId: "column", table: t, options: o, result: { n_pairs: 11 } });
  assert.ok(mismatch.notes.some((x) => /used 11 pairs but the table has 10 complete pairs/.test(x.text)));
});

test("paired payloads keep every cell in place, so the engine pairs row by row", () => {
  const a = ["1", "2", "", "4"];
  const b = ["5", "", "7", "8"];
  const t = column([a, b, ["9", "9", "9", "9"]]);
  for (const analysis of ["ttest", "correlation"] as const) {
    const p = columnPayload(t, col({ analysis, ttestKind: "paired" })) as {
      data: { datasets: { ys: (number | null)[][] }[] } };
    // blanks are sent as null at their own row, never compacted away
    assert.deepEqual(p.data.datasets[0].ys.map((r) => r[0]), [1, 2, null, 4], analysis);
    assert.deepEqual(p.data.datasets[1].ys.map((r) => r[0]), [5, null, 7, 8], analysis);
  }
  // the engine's incomplete_pairs (0-based rows) is preferred, and its
  // own warning saying the same is not repeated under the Analysed line
  const o = col({ analysis: "ttest", ttestKind: "paired" });
  const n = dataNotes({ analysisId: "column", table: t, options: o,
    result: { n_pairs: 2, incomplete_pairs: [1, 2], warnings: ["2 incomplete pairs (rows 2, 3) left out"] } });
  assert.equal(n.analysed, "n = 2 pairs analysed; 2 incomplete pairs (rows 2, 3) left out");
  assert.equal(n.notes.length, 0);
  const r = dataNotes({ analysisId: "column", table: t, options: col({ analysis: "correlation" }),
    result: { n: 2, incomplete_pairs: [1, 2], warnings: ["2 incomplete XY pairs (rows 2, 3) left out"] } });
  assert.equal(r.analysed, "n = 2 pairs analysed; 2 incomplete pairs (rows 2, 3) left out");
  assert.equal(r.notes.length, 0);
});

test("unequal n per group: n per group, blanks and exclusions counted", () => {
  let t = column([["1", "2", "3", "4", "5", "6", "7", "8", ""], ["1", "2", "3", "4", "5", "6", "7", "", ""],
    ["1", "2", "3", "4", "5", "6", "7", "8", "9"]], ["Control", "Drug A", "Drug B"]);
  t = toggleExcluded(t, { kind: "y", dataset: 2, row: 8, sub: 0 });
  const n = dataNotes({ analysisId: "column", table: t, options: col({ analysis: "anova" }), result: {} });
  assert.equal(n.analysed, "n = 8, 7, 8 analysed (Control, Drug A, Drug B); 3 blank cells, 1 excluded value left out");
  assert.ok(n.notes.some((x) => x.text === "1 excluded value left out: Drug B, row 9."));
});

// ---- every payload builder: a text cell in a numeric column is dropped
// from the payload (sent as missing) and always produces a note.

/** Cells of the table that hold something but reach the payload as null. */
function droppedCells(t: DataTableModel, ys: (number | null)[][][]): string[] {
  const out: string[] = [];
  t.datasets.forEach((d, di) => d.rows.forEach((row, r) => row.forEach((v, s) => {
    if (v.trim() !== "" && (ys[di]?.[r]?.[s] ?? null) === null
      && !d.excluded?.includes(`${r}:${s}`)) out.push(cellName(t, di, r, s));
  })));
  return out;
}

function assertNoted(label: string, t: DataTableModel, ys: (number | null)[][][], analysisId: string,
  options: unknown) {
  const dropped = droppedCells(t, ys);
  assert.ok(dropped.length > 0, `${label}: the test table has a dropped cell`);
  const notes = dataNotes({ analysisId, table: t, options, result: {} }).notes.map((n) => n.text).join("\n");
  for (const c of dropped) assert.ok(notes.includes(c), `${label}: ${c} is not named in the notes:\n${notes}`);
}

test("column payloads: every dropped text cell is named in the notes", () => {
  const t = column([["1", "2", "high", "4"], ["5", "6", "7", "#DIV/0!"], ["1", "2", "3", "4"]]);
  for (const analysis of ["column_statistics", "ttest", "anova", "correlation", "outliers"] as const) {
    const o = col({ analysis });
    const p = columnPayload(t, o) as { data: { datasets: { ys: (number | null)[][] }[] } };
    assertNoted(analysis, t, p.data.datasets.map((d) => d.ys), "column", o);
  }
  const n = dataNotes({ analysisId: "column", table: t, options: col({ analysis: "ttest" }), result: {} });
  assert.match(n.notes.find((x) => x.tone === "warn")!.text,
    /^1 cell is not a number and was skipped: Before, row 3 \(“high”\)\./);
  assert.match(n.analysed!, /^n = 3, 3 analysed \(Before, After\); 1 text cell skipped, 1 missing-value code$/);
});

test("grouped payloads: a text replicate is named in the notes", () => {
  const t = normalizeTable({
    type: "grouped",
    rowTitles: ["Day 1", "Day 2"],
    datasets: [
      { name: "WT", rows: [["1", "2", "3"], ["4", "n.d", "6"]] },
      { name: "KO", rows: [["1", "2", "3"], ["4", "5", "6"]] },
    ],
  }, "grouped");
  const p = groupedPayload(t);
  assertNoted("grouped", t, p.datasets.map((d) => d.ys), "grouped_two_way", {});
  const n = dataNotes({ analysisId: "grouped_two_way", table: t, options: {}, result: {} });
  assert.ok(n.notes.some((x) => x.text.includes("WT, Y2, row 2 (“n.d”)")));
  assert.equal(n.analysed, "n = 5, 6 analysed (WT, KO); 1 text cell skipped");
});

test("XY payloads: text Y values and rows without a usable X are named", () => {
  const t = normalizeTable({
    type: "xy", x: ["1", "2", "", "abc", "5"],
    datasets: [{ name: "Curve", rows: [["1", "2"], ["3", "oops"], ["5", "6"], ["7", "8"], ["9", "10"]] }],
  }, "xy");
  const d = numericData(t);
  assertNoted("xy", t, d.datasets.map((x) => x.ys), "nonlin", {});
  const n = dataNotes({ analysisId: "nonlin", table: t, options: {}, result: {} });
  const text = n.notes.map((x) => x.text).join("\n");
  assert.match(text, /Curve, Y2, row 2 \(“oops”\)/);
  assert.match(text, /1 row has Y values but no X value, so it was left out: row 3\./);
  assert.match(text, /1 row has an X that is not a number, so its Y values were left out: row 4\./);
  assert.equal(n.analysed, "n = 5 points analysed; 1 text cell skipped");
});

test("survival payloads: a text time is named; subjects counted per group", () => {
  const t = normalizeTable({
    type: "survival",
    datasets: [
      { name: "A", subTitles: ["Time", "Event"], rows: [["5", "1"], ["8", "0"], ["x", "1"], ["9", ""]] },
      { name: "B", subTitles: ["Time", "Event"], rows: [["4", "1"], ["6", "1"], ["", ""], ["", ""]] },
    ],
  }, "survival");
  const d = numericData(t);
  assertNoted("survival", t, d.datasets.map((x) => x.ys), "survival", {});
  const n = dataNotes({ analysisId: "survival", table: t, options: {}, result: {} });
  assert.match(n.notes[0].text, /A, Time, row 3 \(“x”\)/);
  assert.equal(n.analysed, "n = 2, 2 subjects analysed (A, B); 2 rows with only one of time and event left out (rows 3, 4)");
});

test("every engine warning and note reaches the strip, at any depth", () => {
  const msgs = engineMessages({
    analysis: "x",
    warnings: ["top warning", { message: "object warning" }],
    note: "a note",
    datasets: [{ name: "Control", fit: { warnings: ["did not converge"] } }],
    fisher_exact: { p: null, note: "table too large" },
    comparisons_error: "comparisons failed",
    nested: { deeper: { notes: ["deep note"] } },
  });
  assert.deepEqual(msgs.map((m) => `${m.warn ? "W" : "N"} ${m.text}`), [
    "W top warning", "W object warning", "N a note", "W Control: did not converge",
    "N table too large", "W comparisons failed", "N deep note",
  ]);
  const n = dataNotes({ analysisId: "column", table: column([["1"], ["2"]]),
    options: col({}), result: { warnings: ["W1"], datasets: [] } });
  assert.equal(n.notes[0].text, "W1");
  assert.equal(n.notes[0].from, "engine");
});

test("plans: which data sets an analysis reads", () => {
  const t = column([["1"], ["2"], ["3"]]);
  assert.deepEqual(analysisPlan("column", t, col({ analysis: "ttest", datasetA: 2, datasetB: 0 })),
    { kind: "groups", datasets: [2, 0] });
  assert.equal(analysisPlan("column", t, col({ analysis: "rm_anova" })).kind, "subjects");
  assert.equal(analysisPlan("transform", t, {}).kind, "none");
  const rm = dataNotes({ analysisId: "column", table: column([["1", "2", ""], ["3", "", ""], ["5", "6", "7"]]),
    options: col({ analysis: "rm_anova" }), result: {} });
  assert.equal(rm.analysed, "n = 1 row (subjects) analysed; 2 incomplete rows (rows 2, 3) left out");
});
