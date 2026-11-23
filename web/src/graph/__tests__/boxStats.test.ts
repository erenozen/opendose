// Box statistics against numpy (reference/box_stats.py writes
// reference/box_stats.json): definition 7 ("linear") and definition 6
// ("prism", which the script checks equals the engine's column statistics)
// for every whisker rule, plus the cases the reference does not cover.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  boxPercentileMethod, boxStats, percentileOf, readWhiskers,
  type PercentileMethod, type WhiskerRule,
} from "../boxStats.ts";
import { composeLegend } from "../legend.ts";
import { normalizeColumnGraph } from "../../sheets/column/graphSettings.ts";
import { normalizeGraph } from "../../sheets/grouped/options.ts";
import type { Sheet } from "../../project/types.ts";

const ref = JSON.parse(readFileSync(new URL("./reference/box_stats.json", import.meta.url), "utf8"));
const DATA: Record<string, number[]> = {
  acceptance: [1, 2, 3, 4, 5, 6, 7, 8, 9, 100],
  odd: [3.1, 0.4, 2.2, 9.9, 5.0, 4.4, 1.7],
  ties: [2, 2, 2, 2, 5, 5, 9],
  two: [4.0, 6.0],
};

test("boxStats equals numpy for both percentile methods and every whisker rule", () => {
  for (const [name, values] of Object.entries(DATA)) {
    for (const method of ["linear", "prism"] as PercentileMethod[]) {
      for (const [rule, want] of Object.entries(ref[name][method]) as [WhiskerRule, Record<string, number>][]) {
        const got = boxStats(values, method, rule)!;
        for (const k of ["q1", "median", "q3", "lowerfence", "upperfence"] as const) {
          assert.ok(Math.abs(got[k] - want[k]) <= 1e-12 * Math.max(1, Math.abs(want[k])),
            `${name} ${method} ${rule} ${k}: ${got[k]} vs ${want[k]}`);
        }
      }
    }
  }
});

test("the acceptance data: R type 7 gives 3.25 / 5.5 / 7.75, type 6 gives 2.75 / 5.5 / 8.25, Tukey whiskers 1 to 9", () => {
  assert.deepEqual(boxStats(DATA.acceptance, "linear", "tukey"),
    { n: 10, q1: 3.25, median: 5.5, q3: 7.75, lowerfence: 1, upperfence: 9 });
  assert.deepEqual(boxStats(DATA.acceptance, "prism", "tukey"),
    { n: 10, q1: 2.75, median: 5.5, q3: 8.25, lowerfence: 1, upperfence: 9 });
  assert.deepEqual(boxStats(DATA.acceptance, "prism", "minmax")!.upperfence, 100);
});

test("edge cases: no values, one value, all equal, missing values, order and scale", () => {
  assert.equal(boxStats([], "linear", "tukey"), null);
  assert.equal(boxStats([NaN, Infinity], "prism", "tukey"), null);
  for (const m of ["linear", "prism"] as PercentileMethod[]) {
    assert.deepEqual(boxStats([7], m, "tukey"), { n: 1, q1: 7, median: 7, q3: 7, lowerfence: 7, upperfence: 7 });
    assert.deepEqual(boxStats([3, 3, 3, 3], m, "p10_90"), { n: 4, q1: 3, median: 3, q3: 3, lowerfence: 3, upperfence: 3 });
  }
  // blanks are left out, not read as zero
  assert.deepEqual(boxStats([1, NaN, 2, 3, 4, 5, 6, 7, 8, 9, 100], "prism", "tukey"),
    boxStats(DATA.acceptance, "prism", "tukey"));
  // order does not matter; units scale every statistic
  const shuffled = [100, 7, 1, 9, 3, 2, 8, 5, 4, 6];
  assert.deepEqual(boxStats(shuffled, "linear", "tukey"), boxStats(DATA.acceptance, "linear", "tukey"));
  const a = boxStats(DATA.odd, "prism", "p5_95")!;
  const b = boxStats(DATA.odd.map((v) => v * 1e-9), "prism", "p5_95")!;
  for (const k of ["q1", "median", "q3", "lowerfence", "upperfence"] as const) {
    assert.ok(Math.abs(b[k] - a[k] * 1e-9) <= 1e-21, k);
  }
  // whiskers never sit inside the box
  const s = boxStats([1, 2, 3], "linear", "p10_90")!;
  assert.ok(s.lowerfence <= s.q1 && s.upperfence >= s.q3);
});

test("percentileOf clips definition 6 at the ends and matches numpy's lerp at t = 1", () => {
  assert.equal(percentileOf([1, 2, 3], 1, "prism"), 1);
  assert.equal(percentileOf([1, 2, 3], 99, "prism"), 3);
  assert.equal(percentileOf([0.1, 0.7], 100, "linear"), 0.7);
  assert.equal(percentileOf([], 50, "linear"), null);
});

test("whisker rules: unknown or absent reads as Tukey; the legend names each rule", () => {
  assert.equal(readWhiskers(undefined), "tukey");
  assert.equal(readWhiskers("bogus"), "tukey");
  assert.equal(readWhiskers("p5_95"), "p5_95");
  const box = (whiskers?: WhiskerRule) => composeLegend({ display: "box", summary: "none",
    points: true, groups: [{ name: "A", n: 10 }], whiskers });
  assert.match(box(), /^Median with IQR \(box\) and 1\.5 × IQR \(Tukey\) \(whiskers\)/);
  assert.match(box("minmax"), /and minimum to maximum \(whiskers\)/);
  assert.match(box("p2_5_97_5"), /and 2\.5th to 97\.5th percentile \(whiskers\)/);
});

test("old saved graphs: no whisker key reads as Tukey on column and grouped graphs", () => {
  assert.equal(normalizeColumnGraph({ spread: "swarm" }).whiskers, "tukey");
  assert.equal(normalizeGraph({ error: "sem" }).whiskers, "tukey");
  assert.equal(normalizeColumnGraph({ whiskers: "p10_90" }).whiskers, "p10_90");
  assert.equal(normalizeGraph({ whiskers: "minmax" }).whiskers, "minmax");
});

test("boxPercentileMethod: bound column statistics, else the table's, else linear", () => {
  const graph = { parentId: "d1" };
  const res = (id: string, parentId: string, options: unknown) =>
    ({ id, kind: "results", parentId, name: id, analysis: "column", options }) as unknown as Sheet;
  assert.equal(boxPercentileMethod(graph, []), "linear");
  assert.equal(boxPercentileMethod(graph, [res("r1", "d1", { analysis: "ttest", percentileMethod: "prism" })]), "linear");
  assert.equal(boxPercentileMethod(graph, [res("r1", "d2", { analysis: "column_statistics", percentileMethod: "prism" })]), "linear");
  assert.equal(boxPercentileMethod(graph, [res("r1", "d1", { analysis: "column_statistics", percentileMethod: "prism" })]), "prism");
  assert.equal(boxPercentileMethod(graph, [res("r1", "d1", { analysis: "column_statistics", percentileMethod: "prism" })],
    { analysis: "column_statistics", percentileMethod: "linear" }), "linear");
  assert.equal(boxPercentileMethod(graph, [res("g", "d1", { unit: "cell" })]), "linear");
});
