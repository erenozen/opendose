// Command palette ranking. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { commandScore, mergeResults, rankCommands } from "../commandRank.ts";

test("a label that starts with the query beats word prefixes and keywords", () => {
  assert.equal(commandScore({ label: "Save project" }, "save"), 0);
  assert.equal(commandScore({ label: "Copy share link…" }, "share li"), 1);
  assert.equal(commandScore({ label: "Power and sample size…", keywords: "calculator" }, "calc"), 2);
  assert.equal(commandScore({ label: "Randomisation list…" }, "domis"), 3);
  assert.equal(commandScore({ label: "Save project" }, "export"), null);
  assert.equal(commandScore({ label: "Save project" }, "   "), null);
});

test("every typed word has to match", () => {
  assert.equal(commandScore({ label: "Export graphs to PowerPoint (.pptx)…" }, "exp power"), 1);
  assert.equal(commandScore({ label: "Export graphs to PowerPoint (.pptx)…" }, "exp word"), null);
});

test("on a tie, commands for the sheet on screen come first", () => {
  const list = [
    { label: "Export tables as .pzfx" },
    { label: "Export this table as .pzfx", context: true },
  ];
  assert.deepEqual(rankCommands(list, "export").map((x) => x.item.label),
    ["Export this table as .pzfx", "Export tables as .pzfx"]);
});

test("strong command matches, then sheets, then weak command matches", () => {
  const ranked = rankCommands([
    { label: "Print…", keywords: "paper" },
    { label: "Plan an experiment…" },
  ], "p");
  assert.deepEqual(mergeResults(ranked, ["Plate 1"]).map((m) => m.kind),
    ["command", "command", "sheet"]);
  const weak = mergeResults(rankCommands([{ label: "Print…", keywords: "paper" }], "paper"),
    ["Paper data"]);
  assert.deepEqual(weak.map((m) => m.kind), ["sheet", "command"]);
});
