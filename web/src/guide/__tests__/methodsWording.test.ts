// P-32 follow-up: the reason Help me choose saves for the methods
// paragraph is in the third person (guide/methodsWording.ts), one wording
// per chooser outcome; the on-screen reason keeps its words; a project
// saved before, holding the on-screen words, reads as the methods wording.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { currentChoice } from "../choice.ts";
import {
  ALTERNATIVE_METHODS, alternativeMethods, BLOCK_METHODS, legacyMethodsReason, METHODS,
} from "../methodsWording.ts";
import { DEFAULT_DESIGN, recommend, type DataChecks, type Design, type Recommendation } from "../recommend.ts";
import { sequentialIds } from "../../project/ids.ts";
import { parseProjectFile } from "../../project/persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../../project/prefs.ts";
import type { ResultsSheet } from "../../project/types.ts";
import { statsMethodsParagraph } from "../../report/methods.ts";
import { DEFAULT_REPORT } from "../../report/prefs.ts";

const prefs = projectPrefs(DEFAULT_PREFS);
const fixtures = JSON.parse(readFileSync(new URL("../../report/__tests__/fixtures.json",
  import.meta.url), "utf8")) as Record<string, { result: unknown }>;

/** Every combination of the answers that changes the outcome. */
function* designs(): Generator<[Design, DataChecks | null]> {
  const pick = <T,>(xs: T[]) => xs;
  const missing: DataChecks = { tableType: "column", missing: true, groups: [
    { name: "A", n: 8, mean: 1, sd: 1, normalityP: null, allPositive: true },
    { name: "B", n: 8, mean: 2, sd: 1, normalityP: null, allPositive: true }] };
  for (const groups of pick<Design["groups"]>(["one", "two", "three_plus"]))
    for (const factors of pick<Design["factors"]>(["one", "two", "three"]))
      for (const paired of [false, true])
        for (const repeated of pick<Design["repeated"]>(["none", "one", "both"]))
          for (const replicates of pick<Design["replicates"]>(["independent", "technical", "cells"]))
            for (const distribution of pick<Design["distribution"]>(["unsure", "normal", "lognormal", "not_normal"]))
              for (const equalSD of pick<Design["equalSD"]>(["unsure", "equal", "unequal"]))
                for (const ratioEffect of [false, true])
                  for (const normalised of [false, true])
                    for (const blocked of [false, true])
                      for (const differential of [false, true])
                        for (const hypothetical of ["0", "5"])
                          for (const checks of [null, missing]) {
                            yield [{ ...DEFAULT_DESIGN, groups, factors, paired, repeated, replicates,
                              distribution, equalSD, ratioEffect, normalised, blocked, differential,
                              hypothetical }, checks];
                          }
  for (const groups of pick<Design["groups"]>(["one", "two", "three_plus"]))
    for (const twoOutcomes of [false, true])
      for (const ordered of [false, true])
        for (const stratified of [false, true])
          for (const paired of [false, true])
            for (const replicates of pick<Design["replicates"]>(["independent", "technical"])) {
              yield [{ ...DEFAULT_DESIGN, outcome: "counts", groups, twoOutcomes, ordered, stratified,
                paired, replicates }, null];
              yield [{ ...DEFAULT_DESIGN, outcome: "survival", groups, ordered }, null];
            }
  for (const curveGoal of pick<Design["curveGoal"]>(["ic50", "standard", "compare", "other"]))
    for (const agonist of [false, true])
      for (const replicates of pick<Design["replicates"]>(["independent", "technical"]))
        for (const paired of [false, true]) {
          yield [{ ...DEFAULT_DESIGN, outcome: "curve", curveGoal, agonist, replicates, paired }, null];
        }
}

const outcomes = (() => {
  const byKey = new Map<string, Recommendation>();
  for (const [d, c] of designs()) {
    const r = recommend(d, c);
    byKey.set(`${r.rule}|${r.reason}`, r);
  }
  return [...byKey.values()];
})();

test("every chooser outcome has a methods wording of its own, in the third person", () => {
  const rules = new Set(outcomes.map((r) => r.rule));
  for (const r of outcomes) {
    assert.ok(r.methods.length > 40, `${r.rule}: ${r.methods}`);
    assert.doesNotMatch(r.methods, /\byou\b|\byour\b/i, r.rule);
    assert.doesNotMatch(r.methods, /—/, r.rule);
    assert.match(r.methods, /\.$/, r.rule);
    assert.notEqual(r.methods, `${r.test} was chosen.`, `${r.rule} falls back to the bare sentence`);
    // the on-screen reason keeps the chooser's words
    assert.notEqual(r.methods, r.reason);
    if (r.rule.startsWith("block_")) assert.ok(r.methods.startsWith(`${BLOCK_METHODS} `), r.rule);
  }
  // every wording is reached by some design
  for (const k of Object.keys(METHODS)) assert.ok(rules.has(k), `rule ${k} never recommended`);
  assert.ok(rules.size >= 45, String(rules.size));
});

test("an on-screen reason saved before maps to the methods wording of its outcome", () => {
  for (const r of outcomes) {
    assert.equal(legacyMethodsReason(r.reason, r.test), r.methods, `${r.rule}: ${r.reason.slice(0, 60)}`);
    // the methods wording is not mapped again
    assert.equal(legacyMethodsReason(r.methods, r.test), null, r.rule);
  }
  // the theoretical value comes back from the old words
  const one = outcomes.find((r) => r.rule === "one_sample_t" && r.test.endsWith("5"))!;
  assert.match(legacyMethodsReason(one.reason, one.test)!, /theoretical value \(5\)/);
  assert.equal(legacyMethodsReason("A reason typed by hand.", "Paired t test"), null);
});

test("alternatives the chooser opens are saved in the methods wording too", () => {
  const opened = outcomes.flatMap((r) => r.alternatives.filter((a) => a.target));
  assert.ok(opened.length > 0);
  for (const a of opened) {
    assert.ok(ALTERNATIVE_METHODS[a.test], `no methods wording for ${a.test}`);
    assert.equal(alternativeMethods(a.test), ALTERNATIVE_METHODS[a.test]);
    // the old "<test>: <when>." saved before
    assert.equal(legacyMethodsReason(`${a.test}: ${a.when}.`, a.test), ALTERNATIVE_METHODS[a.test]);
  }
});

test("the wordings e2e-check pins", () => {
  const two = outcomes.filter((r) => r.rule === "unpaired_t" || r.rule === "welch_t");
  assert.deepEqual(two.map((r) => r.methods).sort(), [
    "The unpaired t test with a pooled SD was chosen because the two groups were independent, "
      + "roughly Gaussian and known from the design or earlier data to have equal SDs; it has "
      + "slightly more power than Welch's t test when that holds.",
    "Welch's t test was chosen for the two independent groups because it does not assume equal "
      + "SDs and loses little power when they are equal.",
  ]);
  // and the on-screen words are as before
  assert.match(two.find((r) => r.rule === "welch_t")!.reason, /unless you know the SDs are equal\.$/);
});

test("a project saved before (the stage fixture why-history.json) reads in the methods wording", () => {
  const raw = readFileSync(new URL("../../../e2e-fixtures/stage/why-history.json", import.meta.url), "utf8");
  assert.match(raw, /so it is the safer default unless you know the SDs are equal\./);
  const p = parseProjectFile(raw, { prefs, ids: sequentialIds("n") });
  const s = p.sheets.find((x) => x.kind === "results" && x.chosen) as ResultsSheet;
  assert.equal(s.chosen!.reason, METHODS.welch_t());
  assert.equal(s.chosen!.test, "Unpaired t test with Welch's correction");
  const text = statsMethodsParagraph(fixtures.ttest_welch.result, DEFAULT_REPORT, undefined,
    { chosen: currentChoice(s) });
  assert.ok(text.includes("Choice of test (OpenDose Help me choose): Welch's t test was chosen for "
    + "the two independent groups because it does not assume equal SDs and loses little power when "
    + "they are equal. "), text);
  assert.doesNotMatch(text, /\byou\b/);
});
