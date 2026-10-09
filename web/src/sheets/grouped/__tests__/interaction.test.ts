// The Interaction block's content (grouped/interactionSummary.ts) read
// from an engine result. The fixture is the engine's two-way ANOVA of a
// hand-made 2 x 2 (Vehicle/Drug x WT/KO, 3 mice per cell, values mean ± 1,
// so MS residual = 1 on 8 df): drug effect 3 in WT and 7 in KO, difference
// of differences 4, SE √(4/3) = 1.1547, 95% CI 4 ± t(0.975, 8) × 1.1547 =
// 1.337 to 6.663, P = 0.0085 (= the interaction F = 12 test).
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  contrastReading, contrastSentence, interactionSummary, isAdditiveTwoWay,
} from "../interactionSummary.ts";
import { normalizeTwoWay } from "../options.ts";

const here = dirname(fileURLToPath(import.meta.url));
const result = JSON.parse(readFileSync(join(here, "twoway-interaction.json"), "utf8"));

test("the interaction test, the difference of differences and the simple effects", () => {
  const s = interactionSummary(result)!;
  assert.ok(s);
  assert.ok(Math.abs(s.test!.F! - 12) < 1e-9);
  assert.ok(Math.abs(s.test!.p! - 0.008516263370901292) < 1e-12);
  assert.equal(s.test!.dfn, 1);
  assert.equal(s.test!.dfd, 8);
  assert.equal(s.contrasts.length, 1);
  const c = s.contrasts[0];
  assert.deepEqual([c.rows, c.cols], [["Vehicle", "Drug"], ["WT", "KO"]]);
  assert.equal(c.effect1, 3);
  assert.equal(c.effect2, 7);
  assert.equal(c.difference, 4);
  assert.ok(c.isInteraction);
  // hand computation: t(0.975, 8) = 2.306004, SE = sqrt(1 × 4/3)
  const half = 2.306004135 * Math.sqrt(4 / 3);
  assert.ok(Math.abs(c.ci![0] - (4 - half)) < 1e-6 && Math.abs(c.ci![1] - (4 + half)) < 1e-6);
  assert.equal(c.label, "(Drug − Vehicle) in KO minus (Drug − Vehicle) in WT");
  assert.deepEqual(s.rowEffects.map((e) => [e.within, e.pair, e.difference]),
    [["WT", "Drug − Vehicle", 3], ["KO", "Drug − Vehicle", 7]]);
  assert.deepEqual(s.colEffects.map((e) => [e.within, e.difference]), [["Vehicle", 0], ["Drug", 4]]);
});

test("the sentence and its plain reading", () => {
  const s = interactionSummary(result)!;
  assert.equal(contrastSentence(s.contrasts[0]),
    "The effect (Drug − Vehicle) is 3 in WT and 7 in KO: the difference between these effects is "
    + "4 (95% CI 1.337 to 6.663), P = 0.008516.");
  assert.match(contrastReading(s.contrasts[0]), /^The 95% CI excludes 0: the effect differs between WT and KO/);
  const wide = { ...s.contrasts[0], ci: [-1, 9] as [number, number] };
  assert.match(contrastReading(wide), /cannot tell whether the effect differs/);
});

test("no contrasts: repeated measures, older results, one value per cell", () => {
  assert.equal(interactionSummary({ sources: {} }), null);
  const one = interactionSummary({ interaction_contrasts: { withheld: true, contrasts: [],
    notes: ["one value per cell: there is no within-cell residual"] } })!;
  assert.ok(one.withheld);
  assert.equal(one.contrasts.length, 0);
  assert.match(one.notes[0], /one value per cell/);
});

test("the interactionFocus option survives normalisation; absent otherwise", () => {
  assert.equal(normalizeTwoWay({ interactionFocus: true }).interactionFocus, true);
  assert.equal("interactionFocus" in normalizeTwoWay({}), false);
  assert.equal("interactionFocus" in normalizeTwoWay({ interactionFocus: "yes" }), false);
});

test("the no-interaction note belongs to the additive model only", () => {
  // the engine (opendose.twoway) names the model it fitted every time
  assert.equal(isAdditiveTwoWay({ ...result, model: "full (with interaction)" }), false);
  assert.equal(isAdditiveTwoWay({ model: "main effects only (additive)" }), true);
  assert.equal(isAdditiveTwoWay({}), false);
  assert.equal(isAdditiveTwoWay(null), false);
});
