// "@Name" in analysis options reads an Info-sheet constant (infoRefs.ts).
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveInfoRefs, setInfoConstants, infoSignature } from "../infoRefs.ts";
import type { Project } from "../types.ts";

const project = (value: string) => ({
  sheets: [{ id: "i1", kind: "info", name: "Info", parentId: null, notes: "",
    constants: [{ name: "Dilution factor", value }, { name: "Mu", value: "100" }, { name: "", value: "9" }] }],
}) as unknown as Project;

test("whole values, underscored names and tokens inside a string are replaced", () => {
  setInfoConstants(project("20"));
  const o = { hypothetical: "@mu", d: "@Dilution_factor", full: "@Dilution factor", f: "Y*@Dilution_factor+1",
    nested: [{ v: "@Mu" }], n: 3, keep: "@Unknown", plain: "abc" };
  assert.deepEqual(resolveInfoRefs(o), { hypothetical: "100", d: "20", full: "20", f: "Y*20+1",
    nested: [{ v: "100" }], n: 3, keep: "@Unknown", plain: "abc" });
});

test("objects without references come back unchanged (same object)", () => {
  setInfoConstants(project("20"));
  const o = { a: "1", b: [1, 2], c: { d: "x" } };
  assert.equal(resolveInfoRefs(o), o);
});

test("the signature follows the constants' values", () => {
  setInfoConstants(project("20"));
  const a = infoSignature();
  setInfoConstants(project("25"));
  assert.notEqual(infoSignature(), a);
  assert.equal(resolveInfoRefs("@Dilution_factor"), "25");
});
