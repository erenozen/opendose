import { test } from "node:test";
import assert from "node:assert/strict";
import { floorP, rankFloorBanner } from "../rankFloor.ts";
import { explainer } from "../explainers.ts";

const block = (p: number, n: number[], extra: Record<string, unknown> = {}) =>
  ({ p, p_one_sided: p / 2, alpha: 0.05, method: "exact", n, reachable: p < 0.05, ...extra });

test("Mann-Whitney 3 vs 3: the acceptance wording", () => {
  const b = rankFloorBanner({ test: "mann_whitney", min_attainable_p: block(0.1, [3, 3]) }, "two");
  assert.ok(b);
  assert.equal(b.title,
    "With 3 and 3 values the smallest possible two-sided P is 0.10, so this design cannot reach P < 0.05");
  assert.equal(b.tone, "warn");
  assert.equal(b.explainer, "rank-floor");
  assert.ok(explainer("rank-floor"));
  assert.match(b.body, /property of the design, fixed before any data were collected/);
  assert.match(b.fixes[0], /t test on the log of the values/);
  assert.match(b.fixes[0], /not from this result/);
  assert.ok(b.sources.some((s) => /Nonparametric tests with small and large samples/.test(s.label)));
});

test("a one-tailed P asked for as well: the note adds its floor", () => {
  const r = { test: "mann_whitney", min_attainable_p: block(0.1, [3, 3]) };
  const b = rankFloorBanner(r, "greater");
  assert.equal(b?.title, "With 3 and 3 values the smallest possible two-sided P is 0.10, so this design cannot reach P < 0.05");
  assert.match(b!.body, /The one-tailed P you asked for can go down to 0.050, so it cannot reach P < 0.05 either\./);
  const w = rankFloorBanner({ test: "wilcoxon_matched_pairs", min_attainable_p: block(0.0625, [5]) }, "less");
  assert.match(w!.body, /can go down to 0.031\.$/);
  // 4 vs 4: 2/70 can reach it
  assert.equal(rankFloorBanner({ test: "mann_whitney", min_attainable_p: block(2 / 70, [4, 4]) }, "less"), null);
});

test("nothing when the design can reach P < α, or no block", () => {
  assert.equal(rankFloorBanner({ test: "mann_whitney", min_attainable_p: block(2 / 70, [4, 4]) }), null);
  assert.equal(rankFloorBanner({ test: "mann_whitney" }), null);
  assert.equal(rankFloorBanner({ test: "mann_whitney", min_attainable_p: { p: null } }), null);
  assert.equal(rankFloorBanner({ error: "x", min_attainable_p: block(0.1, [3, 3]) }), null);
  assert.equal(rankFloorBanner(null), null);
});

test("Wilcoxon, Kruskal-Wallis and Friedman wording", () => {
  const w = rankFloorBanner({ test: "wilcoxon_matched_pairs", n_zero_differences: 1,
    min_attainable_p: block(0.125, [5]) });
  assert.equal(w?.title, "With 5 pairs (4 with a nonzero difference) the smallest possible two-sided P is 0.13, so this design cannot reach P < 0.05");
  const kw = rankFloorBanner({ analysis: "anova", kind: "nonparametric",
    min_attainable_p: block(6 / 90, [2, 2, 2]) });
  assert.equal(kw?.title, "With 2, 2 and 2 values the smallest possible P is 0.067, so this design cannot reach P < 0.05");
  const fr = rankFloorBanner({ analysis: "friedman",
    min_attainable_p: block(1 / 6, [2, 3], { method: "chi-square approximation" }) });
  assert.equal(fr?.title, "With 2 subjects and 3 treatments the smallest possible P is 0.17, so this design cannot reach P < 0.05");
  assert.match(fr!.body, /by the chi-square approximation the test used/);
});

test("floor P keeps two significant digits", () => {
  assert.equal(floorP(0.1), "0.10");
  assert.equal(floorP(2 / 30), "0.067");
  assert.equal(floorP(0.25), "0.25");
  assert.equal(floorP(1), "1");
});
