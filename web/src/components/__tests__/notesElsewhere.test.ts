import { test } from "node:test";
import assert from "node:assert/strict";
import { saidElsewhere } from "../notesElsewhere.ts";

test("notes printed by another block are found, with or without a group prefix", () => {
  const pane = "Tukey multiple comparisons ... Tukey with each pair's own SE: studentized range\n with df = n - 1 "
    + "(an approximation). Effect size ...";
  const notes = [
    "Tukey with each pair's own SE: studentized range with df = n - 1 (an approximation).",
    "Day 7: Tukey with each pair's own SE: studentized range with df = n - 1 (an approximation).",
    "1 cell is not a number and was skipped: Group A, row 4 (“high”).",
    "n = 6",
  ];
  assert.deepEqual([...saidElsewhere(notes, pane)], [0, 1]);
});

test("short notes are never hidden", () => {
  assert.equal(saidElsewhere(["n = 6"], "n = 6 per group").size, 0);
});
