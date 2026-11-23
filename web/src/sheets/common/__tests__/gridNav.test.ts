// The data grid's spreadsheet keys (gridNav.ts). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { cellReady, edgeJump, lastUsedCell, movesCell } from "../gridNav.ts";

// one column: rows 0-2 filled, 3-4 blank, 5-6 filled, 7-9 blank
const col = ["a", "b", "c", "", "", "f", "g", "", "", ""];
const filled = (r: number, c: number) => c === 0 && !!col[r];
const down = (r: number) => edgeJump(filled, r, 0, 1, 0, col.length, 1)[0];
const up = (r: number) => edgeJump(filled, r, 0, -1, 0, col.length, 1)[0];

test("Ctrl+Down: end of the run, then the next value, then the last row", () => {
  assert.equal(down(0), 2);
  assert.equal(down(2), 5);
  assert.equal(down(5), 6);
  assert.equal(down(6), 9);
  assert.equal(down(9), 9);
  assert.equal(down(3), 5);
});

test("Ctrl+Up mirrors it, ending at row 1", () => {
  assert.equal(up(9), 6);
  assert.equal(up(6), 5);
  assert.equal(up(5), 2);
  assert.equal(up(2), 0);
  assert.equal(up(0), 0);
});

test("acceptance: in a 50-row column Ctrl+Down from row 1 reaches row 50, Ctrl+Up from row 50 row 1", () => {
  const f = (r: number) => r >= 0 && r < 50;
  assert.deepEqual(edgeJump((r) => f(r), 0, 0, 1, 0, 50, 1), [49, 0]);
  assert.deepEqual(edgeJump((r) => f(r), 49, 0, -1, 0, 50, 1), [0, 0]);
  // a grid longer than the data stops at the last value
  assert.deepEqual(edgeJump((r) => f(r), 0, 0, 1, 0, 80, 1), [49, 0]);
});

test("Ctrl+Left / Right across columns; an empty row goes to the edge", () => {
  const row = ["1", "", "3", "4"];
  const g = (_r: number, c: number) => !!row[c];
  assert.deepEqual(edgeJump(g, 0, 0, 0, 1, 1, 4), [0, 2]);
  assert.deepEqual(edgeJump(g, 0, 2, 0, 1, 1, 4), [0, 3]);
  assert.deepEqual(edgeJump(g, 0, 3, 0, -1, 1, 4), [0, 2]);
  assert.deepEqual(edgeJump(() => false, 0, 1, 0, 1, 1, 4), [0, 3]);
});

test("Ctrl+End: last row and last column holding a value", () => {
  const cells = new Set(["0:0", "4:1", "2:3"]);
  assert.deepEqual(lastUsedCell((r, c) => cells.has(`${r}:${c}`), 8, 5), [4, 3]);
  assert.deepEqual(lastUsedCell(() => false, 8, 5), [0, 0]);
});

test("Home, End, Ctrl+Left / Right move between cells only when the cell is not being edited", () => {
  const c = (start: number, end: number, length = 4, readOnly = false) => ({ start, end, length, readOnly });
  assert.ok(movesCell(c(0, 4), "start"));          // reached by the keyboard: whole text selected
  assert.ok(movesCell(c(0, 4), "end"));
  assert.ok(movesCell(c(0, 0, 0), "end"));         // empty
  assert.ok(movesCell(c(2, 2, 4, true), "start")); // read-only
  assert.ok(movesCell(c(0, 0), "start"));          // caret already at that end
  assert.ok(movesCell(c(4, 4), "end"));
  assert.ok(!movesCell(c(2, 2), "start"));         // editing: the caret moves
  assert.ok(!movesCell(c(0, 0), "end"));
  assert.ok(!movesCell(c(1, 3), "end"));
});

test("Ctrl+A selects the table unless the cell is being edited", () => {
  assert.ok(cellReady({ start: 0, end: 5, length: 5, readOnly: false }));
  assert.ok(cellReady({ start: 0, end: 0, length: 0, readOnly: false }));
  assert.ok(!cellReady({ start: 5, end: 5, length: 5, readOnly: false }));
});
