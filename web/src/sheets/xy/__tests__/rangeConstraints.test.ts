// Range constraints on built-in models (P-20): what the engine receives,
// when a range is held back (no reason, a limit missing), the methods
// text, and that a project saved before ranges keeps its constants.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ModelMeta } from "../../../lib/modelLibrary.ts";
import { DEFAULT_XY_OPTIONS, type ConstraintState, type OptionsState } from "../../../types.ts";
import {
  builtinBounds, builtinConstraints, constraintKind, rangeProblems, rangeText, withConstraint,
} from "../fitOptions.ts";

const meta = { constrainable: ["Top", "Bottom", "LogIC50", "HillSlope"], constants: [] } as unknown as ModelMeta;
const withC = (p: string, c: ConstraintState, o: OptionsState = DEFAULT_XY_OPTIONS) =>
  withConstraint(o, p, c);
const bottomGt0: ConstraintState = {
  enabled: true, value: "0", kind: "greater", lo: "0", reason: "signal cannot be negative",
};

test("Bottom > 0 with a reason goes to the engine as a range, not a constant", () => {
  const o = withC("Bottom", bottomGt0);
  assert.deepEqual(builtinBounds(meta, o), { Bottom: [0, null] });
  assert.deepEqual(builtinConstraints(meta, o), {});
  assert.equal(rangeText("Bottom", o.bottom), "Bottom > 0, stated reason: signal cannot be negative");
});

test("less than and between send the limits they name", () => {
  const o = withC("HillSlope", { enabled: true, value: "-1", kind: "between", lo: "-3", hi: "-0,3",
    reason: "Hill slopes past -3 are not seen with this receptor." });
  assert.deepEqual(builtinBounds(meta, o), { HillSlope: [-3, -0.3] });
  assert.equal(rangeText("HillSlope", o.hillSlope),
    "-3 < HillSlope < -0,3, stated reason: Hill slopes past -3 are not seen with this receptor");
  const less = withC("Top", { enabled: true, value: "", kind: "less", hi: "120", reason: "the plate saturates" });
  assert.deepEqual(builtinBounds(meta, less), { Top: [null, 120] });
});

test("a range without a reason or a limit is not sent, and says what to enter", () => {
  const noReason = { ...bottomGt0, reason: "  " };
  assert.deepEqual(builtinBounds(meta, withC("Bottom", noReason)), {});
  assert.equal(rangeProblems(noReason).reason, "Enter why the value cannot go past this limit");
  const noLimit = { ...bottomGt0, lo: "" };
  assert.deepEqual(builtinBounds(meta, withC("Bottom", noLimit)), {});
  assert.equal(rangeProblems(noLimit).lo, "Enter a number");
  const upsideDown = { ...bottomGt0, kind: "between" as const, lo: "5", hi: "1" };
  assert.equal(rangeProblems(upsideDown).hi, "Enter a number above 5");
  assert.deepEqual(builtinBounds(meta, withC("Bottom", upsideDown)), {});
  assert.equal(rangeText("Bottom", upsideDown), null);
});

test("a switched-off range sends nothing", () => {
  const o = withC("Bottom", { ...bottomGt0, enabled: false });
  assert.deepEqual(builtinBounds(meta, o), {});
  assert.deepEqual(builtinConstraints(meta, o), {});
});

test("a constraint saved before ranges is a constant, sent as before", () => {
  const saved = { enabled: true, value: "100" };       // no kind, lo, hi, reason
  assert.equal(constraintKind(saved), "constant");
  const o = withC("Top", saved);
  assert.deepEqual(builtinConstraints(meta, o), { Top: 100 });
  assert.deepEqual(builtinBounds(meta, o), {});
  assert.equal(rangeText("Top", saved), null);
  assert.deepEqual(rangeProblems(saved), { lo: null, hi: null, reason: "Enter why the value cannot go past this limit" });
});
