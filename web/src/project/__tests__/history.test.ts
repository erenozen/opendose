// Undo depth and cost: 1,000 steps, references not copies, a memory guard
// that drops the oldest steps, and 200 edits + undo + redo in well under a
// second of model time. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  commit, HISTORY_BYTES, HISTORY_LIMIT, initHistory, redo, undo, uniqueBytes, type History,
} from "../history.ts";
import { makeDataSheet, makeProject, updateTable } from "../ops.ts";
import { DEFAULT_PREFS, projectPrefs } from "../prefs.ts";
import { emptyTable, setCell } from "../table.ts";
import type { DataSheet, Project } from "../types.ts";

const prefs = projectPrefs(DEFAULT_PREFS);

function project(rows = 50): Project {
  const a = emptyTable("column", { datasets: 4, subcolumns: 1, rows });
  const b = emptyTable("column", { datasets: 4, subcolumns: 1, rows: 2000 });
  return makeProject(prefs, [makeDataSheet("d1", "Edits", a), makeDataSheet("d2", "Big", b)], "P");
}

const edit = (p: Project, i: number) =>
  updateTable(p, "d1", (t) => setCell(t, i % 4, Math.floor(i / 4), 0, String(i + 1)));

test("1,000 undo steps", () => {
  assert.equal(HISTORY_LIMIT, 1000);
  let h = initHistory(project(400));
  for (let i = 0; i < 1200; i++) h = commit(h, edit(h.present, i), null, i * 2000);
  assert.equal(h.past.length, 1000);
  assert.equal(h.pastBytes.length, h.past.length);
});

test("history stores references: an edit to one table shares every other sheet", () => {
  let h = initHistory(project());
  const big = h.present.sheets[1];
  for (let i = 0; i < 10; i++) h = commit(h, edit(h.present, i), null, i * 2000);
  for (const p of [...h.past, h.present]) assert.equal(p.sheets[1], big);
  // and the estimate charges each step only for what it does not share
  const step = uniqueBytes(h.past[0], h.past[1]);
  assert.ok(step < 20_000, `one cell edit costs ${step} bytes, not the 2,000-row table`);
});

test("the memory guard drops the oldest steps beyond the budget", () => {
  // each step replaces a ~1 MB table: the budget, not the count, binds
  const big = "x".repeat(500_000);
  let p = project(1);
  let h: History = initHistory(p);
  for (let i = 0; i < 120; i++) {
    p = updateTable(p, "d1", (t) => ({ ...t, datasets: t.datasets.map((d, k) => (k === 0
      ? { ...d, name: `${big}${i}` } : d)) }));
    h = commit(h, p, null, i * 2000);
  }
  const total = h.pastBytes.reduce((a, b) => a + b, 0);
  assert.ok(total <= HISTORY_BYTES, `kept ${total} bytes`);
  assert.ok(h.past.length < 120 && h.past.length > 10, `kept ${h.past.length} steps`);
  assert.equal((h.present.sheets[0] as DataSheet).table.datasets[0].name, `${big}119`);
});

test("200 edits, 200 undos and 200 redos are fast and exact", () => {
  let h = initHistory(project());
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) h = commit(h, edit(h.present, i), null, i * 2000);
  const last = h.present;
  for (let i = 0; i < 200; i++) h = undo(h);
  const empty = (h.present.sheets[0] as DataSheet).table.datasets.every((d) =>
    d.rows.every((r) => r.every((v) => v === "")));
  assert.ok(empty, "undo reaches the empty table");
  for (let i = 0; i < 200; i++) h = redo(h);
  const ms = performance.now() - t0;
  assert.equal(h.present, last, "redo restores the very same snapshot");
  assert.ok(ms < 1500, `took ${ms.toFixed(0)} ms`);
});
