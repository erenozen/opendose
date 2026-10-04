// Power tool payloads, effect helpers, randomisation CSV and the saved
// justification. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeInfoSheet, makeProject } from "../../project/ops.ts";
import { DEFAULT_PREFS } from "../../project/prefs.ts";
import {
  defaultForm, dFromMeans, effectGrid, fFromMeans, findSampleSizeJustification, hFromProportions,
  hrFromMedians, JUSTIFICATION_CONSTANT, justificationSheetContent, nGrid, nParam, pooledSd, powerOptions,
  powerPayload, randomCsv, randomOptions, rawDetectable, unroundedN, type PowerResult,
} from "../power.ts";

test("G*Power (Faul 2007) inputs: two groups, d = 0.5, one-sided, power 0.95", () => {
  const f = { ...defaultForm(), d: "0.5", tails: "1" as const, power: "95", unit: "mice", attrition: "10" };
  const p = powerPayload(f);
  assert.ok("payload" in p);
  assert.deepEqual(p.payload.options, {
    kind: "t_two_sample", solve: "n", alpha: 0.05, power: 0.95, tails: 1, d: 0.5, ratio: 1,
    justification: { unit: "mice", attrition: 0.1 },
  });
});

test("F and chi-square tests carry no tails; n parameter names per kind", () => {
  const a = powerOptions({ ...defaultForm(), kind: "anova_oneway", solve: "power", n: "20" });
  assert.ok("options" in a);
  assert.equal(a.options.tails, undefined);
  assert.equal(a.options.n, 20);
  assert.equal(a.options.k, 3);
  const t = powerOptions({ ...defaultForm(), solve: "power", n: "20" });
  assert.ok("options" in t);
  assert.equal(t.options.n1, 20);
  // log-rank without a median counts events
  assert.equal(nParam({ ...defaultForm(), kind: "logrank" }), "events");
  assert.equal(nParam({ ...defaultForm(), kind: "logrank", medianControl: "12" }), "n");
  const e = powerOptions({ ...defaultForm(), solve: "effect", n: "20" });
  assert.ok("options" in e);
  assert.equal(e.options.d, undefined);
});

test("input problems are reported", () => {
  assert.match((powerOptions({ ...defaultForm(), alpha: "0.7" }) as { error: string }).error, /α/);
  assert.match((powerOptions({ ...defaultForm(), d: "" }) as { error: string }).error, /Effect size d/);
  assert.match((powerOptions({ ...defaultForm(), kind: "two_proportions", p2: "0.5" }) as { error: string }).error,
    /different from proportion 1/);
});

test("effect helpers", () => {
  assert.equal(dFromMeans(10, 14, 5), 0.8);
  assert.ok(Math.abs(fFromMeans([10, 12, 14], 4)! - Math.sqrt(8 / 3) / 4) < 1e-12);
  assert.ok(Math.abs(hFromProportions(0.5, 0.75) - 0.5235987755982985) < 1e-12);
  assert.equal(hrFromMedians(12, 24), 0.5);
});

test("curve grids", () => {
  const g = nGrid(26);
  assert.equal(g[0], 2);
  assert.ok(g.includes(26) && g[g.length - 1] >= 57);
  const pr = effectGrid("two_proportions", 0.75, { p1: 0.5 });
  assert.ok(pr.every((p) => p > 0.5 && p < 1));
  const hr = effectGrid("logrank", 0.5, {});
  assert.ok(hr.every((h) => h < 1 && h > 0));
});

test("randomisation options and CSV", () => {
  const o = randomOptions({ n: "12", groups: "A, B", ratio: "1, 1", method: "block", blockSizes: "4",
    strata: "", seed: "7", idPrefix: "M" });
  assert.ok("options" in o);
  assert.deepEqual(o.options.block_sizes, [4]);
  assert.equal(o.options.seed, 7);
  const bad = randomOptions({ n: "12", groups: "A, B", ratio: "1, 1", method: "block", blockSizes: "3",
    strata: "", seed: "", idPrefix: "" });
  assert.match((bad as { error: string }).error, /multiples of 2/);
  const s = randomOptions({ n: "", groups: "A, B, C", ratio: "2, 1, 1", method: "stratified", blockSizes: "4",
    strata: "male: 8\nfemale: 12", seed: "", idPrefix: "" });
  assert.ok("options" in s);
  assert.equal(s.options.n, 20);
  const csv = randomCsv({ method: "block", seed: 7, groups: ["A", "B"], ratio: [1, 1], n: 2,
    list: [{ sequence: 1, id: "M1", group: "A", block: 1 }, { sequence: 2, id: "M2", group: "B, x", block: 1 }],
    counts: { A: 1, B: 1 } });
  assert.equal(csv, 'Sequence,ID,Block,Group\n1,M1,1,A\n2,M2,1,"B, x"\n');
});

test("the justification is saved as an info constant and found again", () => {
  const r = { kind: "t_two_sample", solve: "n", alpha: 0.05, tails: 2, power: 0.807, target_power: 0.8,
    n_total: 52, n_per_group: [26, 26], effect: { name: "d", value: 0.8 },
    justification: { text: "A sample size of 26 mice per group…", allocate: null } } as PowerResult;
  const c = justificationSheetContent(defaultForm(), r);
  const sheet = { ...makeInfoSheet("i1", "Sample size justification"), ...c };
  const p = makeProject(DEFAULT_PREFS, [sheet], "x");
  assert.equal(findSampleSizeJustification(p), "A sample size of 26 mice per group…");
  assert.equal(c.constants[0].name, JUSTIFICATION_CONSTANT);
  assert.equal(findSampleSizeJustification(makeProject(DEFAULT_PREFS, [], "y")), null);
});

const base = { alpha: 0.05, tails: 2, power: 0.8, target_power: 0.8, effect: { name: "d", value: 1 } };

test("unrounded n says per group or total for every design", () => {
  // R: power.anova.test(groups = 4, between.var = 1, within.var = 3, power = .80) -> n = 11.92613
  const anova = unroundedN({ ...base, kind: "anova_oneway", solve: "n", n_total: 48, k: 4,
    n_per_group: [12, 12, 12, 12], n_total_exact: 47.70452, equal_n: true } as PowerResult);
  assert.deepEqual(anova.map(([l]) => l), ["Unrounded n per group", "Unrounded total N"]);
  assert.ok(Math.abs(anova[0][1] - 11.92613) < 1e-5);
  assert.equal(anova[1][1], 47.70452);
  // R: power.t.test(delta = 1, sd = 1, power = .90) -> n = 22.02110 per group
  const t = unroundedN({ ...base, kind: "t_two_sample", solve: "n", n_total: 46, n1: 23, n2: 23,
    n1_exact: 22.0211, ratio: 1 } as PowerResult);
  assert.deepEqual(t, [["Unrounded n per group", 22.0211], ["Unrounded total N", 44.0422]]);
  const unequal = unroundedN({ ...base, kind: "two_proportions", solve: "n", n_total: 90, n1: 30, n2: 60,
    n1_exact: 29.5, ratio: 2 } as PowerResult);
  assert.deepEqual(unequal, [["Unrounded n, group 1", 29.5], ["Unrounded n, group 2", 59],
    ["Unrounded total N", 88.5]]);
  const lr = unroundedN({ ...base, kind: "logrank", solve: "n", n_total: 100, n_exact: 99, ratio: 1 } as PowerResult);
  assert.deepEqual(lr, [["Unrounded n per group", 49.5], ["Unrounded total N", 99]]);
  assert.deepEqual(unroundedN({ ...base, kind: "t_paired", solve: "n", n_total: 10, n_exact: 9.4 } as PowerResult),
    [["Unrounded number of pairs", 9.4]]);
  assert.deepEqual(unroundedN({ ...base, kind: "t_one_sample", solve: "n", n_total: 10, n_exact: 9.4 } as PowerResult),
    [["Unrounded n (one group)", 9.4]]);
  assert.deepEqual(unroundedN({ ...base, kind: "chi_square", solve: "n", n_total: 88, n_exact: 87.2 } as PowerResult),
    [["Unrounded total N", 87.2]]);
  // exact searches have no real-valued n; post hoc calculations have none either
  assert.deepEqual(unroundedN({ ...base, kind: "correlation", solve: "n", n_total: 84 } as PowerResult), []);
  assert.deepEqual(unroundedN({ ...base, kind: "t_two_sample", solve: "power", n_total: 40, n1_exact: 3 } as PowerResult), []);
});

test("detectable effect in raw units: d × pooled or common SD, ANOVA spread of the means", () => {
  const sp = Math.sqrt((9 * 1.44 + 11 * 1.96) / 20);
  assert.ok(Math.abs(pooledSd(1.2, 1.4, 10, 12)! - sp) < 1e-12);
  assert.equal(pooledSd(1, 0, 5, 5), null);
  const r = { ...base, kind: "t_two_sample", solve: "effect", n_total: 22, n1: 10, n2: 12,
    effect: { name: "d", value: 0.95 } } as PowerResult;
  const pooled = rawDetectable({ ...defaultForm(), sdSource: "groups", sd1: "1.2", sd2: "1.4", measureUnit: "mmol/L" }, r);
  assert.equal(pooled.length, 1);
  assert.equal(pooled[0].label, "Detectable difference");
  assert.ok(Math.abs(pooled[0].value - 0.95 * sp) < 1e-12);
  assert.equal(pooled[0].text, "1.25 mmol/L (d = 0.95 × pooled SD 1.31)");
  assert.equal(rawDetectable({ ...defaultForm(), sd: "2" }, r)[0].text, "1.9 (d = 0.95 × SD 2)");
  assert.deepEqual(rawDetectable(defaultForm(), r), []);
  const paired = rawDetectable({ ...defaultForm(), sd: "4" },
    { ...r, kind: "t_paired", effect: { name: "d_z", value: 0.5 } } as PowerResult);
  assert.equal(paired[0].text, "2 (d_z = 0.5 × SD of the differences 4)");
  const an = rawDetectable({ ...defaultForm(), groupSd: "10" },
    { ...r, kind: "anova_oneway", k: 4, effect: { name: "f", value: 0.25 } } as PowerResult);
  assert.equal(an[0].value, 2.5);
  assert.ok(Math.abs(an[1].value - 2.5 * Math.sqrt(8)) < 1e-12);
  assert.deepEqual(rawDetectable({ ...defaultForm(), sd: "2" }, { ...r, solve: "n" } as PowerResult), []);
});
