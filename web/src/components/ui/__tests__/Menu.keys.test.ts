import { test } from "node:test";
import assert from "node:assert/strict";
import { isTypeaheadKey, moveIndex, typeahead } from "../Menu.keys.ts";

test("arrows wrap at both ends; Home and End jump", () => {
  assert.equal(moveIndex("ArrowDown", 0, 4), 1);
  assert.equal(moveIndex("ArrowDown", 3, 4), 0);
  assert.equal(moveIndex("ArrowUp", 0, 4), 3);
  assert.equal(moveIndex("ArrowUp", 2, 4), 1);
  assert.equal(moveIndex("Home", 2, 4), 0);
  assert.equal(moveIndex("End", 0, 4), 3);
});

test("with no item focused, ArrowDown starts at the top and ArrowUp at the bottom", () => {
  assert.equal(moveIndex("ArrowDown", -1, 4), 0);
  assert.equal(moveIndex("ArrowUp", -1, 4), 3);
});

test("other keys and empty menus do not move", () => {
  assert.equal(moveIndex("Enter", 1, 4), null);
  assert.equal(moveIndex("a", 1, 4), null);
  assert.equal(moveIndex("ArrowDown", -1, 0), null);
});

const labels = ["Help me choose…", "Plan an experiment…", "Column analyses", "Correlation",
  "Normalize", "Nested t test", "Assay: Standard curve"];

test("type-ahead finds the next item starting with the letter, after the focused one", () => {
  assert.equal(typeahead(labels, 0, "c"), 2);
  assert.equal(typeahead(labels, 2, "c"), 3);
  assert.equal(typeahead(labels, 3, "c"), 2, "wraps to the top");
  assert.equal(typeahead(labels, 0, "N"), 4, "ignores case");
});

test("a longer buffer narrows the match and keeps the focused item while it matches", () => {
  assert.equal(typeahead(labels, 2, "co"), 2);
  assert.equal(typeahead(labels, 2, "cor"), 3);
  assert.equal(typeahead(labels, 4, "nes"), 5);
});

test("one letter pressed again cycles through its items", () => {
  assert.equal(typeahead(labels, 4, "nn"), 5);
  assert.equal(typeahead(labels, 5, "nnn"), 4);
});

test("no match leaves focus where it is", () => {
  assert.equal(typeahead(labels, 1, "z"), -1);
  assert.equal(typeahead(labels, 1, ""), -1);
  assert.equal(typeahead([], 0, "a"), -1);
});

test("only printable keys without modifiers feed type-ahead", () => {
  const k = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
    isTypeaheadKey({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods });
  assert.equal(k("a"), true);
  assert.equal(k("7"), true);
  assert.equal(k(" "), false, "Space activates");
  assert.equal(k("ArrowDown"), false);
  assert.equal(k("k", { ctrlKey: true }), false);
  assert.equal(k("k", { metaKey: true }), false);
});
