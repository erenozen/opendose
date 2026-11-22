// Kaplan-Meier graph options: survival or death, percent or fraction, the
// confidence interval, and older graphs left exactly as they were.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nudgeOnScale, normalizeSurvivalGraph, plotLimits, plotValue, survivalAt, survivalYRange, survivalYTitle,
} from "../graphSettings.ts";

test("older graphs (no settings, or only censor ticks and nudge) keep percent survival without a CI", () => {
  assert.deepEqual(normalizeSurvivalGraph(undefined),
    { censorMarks: false, nudge: 0, ci: "none", show: "survival", scale: "percent" });
  assert.deepEqual(normalizeSurvivalGraph({ censorMarks: true, nudge: 9 }),
    { censorMarks: true, nudge: 5, ci: "none", show: "survival", scale: "percent" });
  assert.deepEqual(normalizeSurvivalGraph({ ci: "band", show: "death", scale: "fraction" }),
    { censorMarks: false, nudge: 0, ci: "band", show: "death", scale: "fraction" });
  assert.equal(normalizeSurvivalGraph({ ci: "x", show: "y", scale: "z" }).ci, "none");
});

test("values: survival or death, percent or fraction", () => {
  assert.equal(plotValue(0.8, { show: "survival", scale: "percent" }), 80);
  assert.equal(plotValue(0.8, { show: "survival", scale: "fraction" }), 0.8);
  assert.ok(Math.abs(plotValue(0.8, { show: "death", scale: "percent" }) - 20) < 1e-12);
  assert.ok(Math.abs(plotValue(0.8, { show: "death", scale: "fraction" }) - 0.2) < 1e-12);
});

test("confidence limits swap for death (1 − S): the lower death limit is 1 − the upper survival limit", () => {
  assert.deepEqual(plotLimits(0.6, 0.9, { show: "survival", scale: "percent" }), [60, 90]);
  const [lo, hi] = plotLimits(0.6, 0.9, { show: "death", scale: "fraction" });
  assert.ok(Math.abs(lo - 0.1) < 1e-12 && Math.abs(hi - 0.4) < 1e-12);
});

test("titles, ranges and the nudge follow the scale", () => {
  assert.equal(survivalYTitle({ show: "survival", scale: "percent" }), "Percent survival");
  assert.equal(survivalYTitle({ show: "death", scale: "fraction" }), "Fraction death");
  assert.deepEqual(survivalYRange({ scale: "percent" }), [0, 105]);
  assert.deepEqual(survivalYRange({ scale: "fraction" }), [0, 1.05]);
  assert.equal(nudgeOnScale(2, { scale: "percent" }), 2);
  assert.equal(nudgeOnScale(2, { scale: "fraction" }), 0.02);
});

test("survivalAt reads the step at or before a time", () => {
  const pts = [{ time: 0, survival: 1 }, { time: 5, survival: 0.8 }, { time: 9, survival: 0.5 }];
  assert.equal(survivalAt(pts, 4), 1);
  assert.equal(survivalAt(pts, 5), 0.8);
  assert.equal(survivalAt(pts, 20), 0.5);
});
