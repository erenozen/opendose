// "What this means" of the Wave 2 models and the assay readers
// (report/meaning.ts, P-69), against native engine results
// (stats-fixtures.json, made by stats-fixtures.py) and the qPCR module's
// recorded run (sheets/assays/__tests__/analysed.fixtures.json). Each
// sentence is pinned; the numbers in it are the engine's, written as the
// results sheet writes them; P above 0.05 is never "no difference"
// (Amrhein et al. 2019) and each reader cites its sources (guide/sources.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { meaningOf, MEANING_SOURCES } from "../meaning.ts";
import { SRC } from "../../guide/sources.ts";
import { analysedCases } from "../../sheets/assays/__tests__/analysedCases.ts";
import { replay } from "../../sheets/assays/__tests__/analysedReplay.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const here = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(join(here, "stats-fixtures.json"), "utf8")) as Record<string, { result: any }>;
const FORBIDDEN = /\bprove[sd]?\b|\b(is|was|were|are|shows?|showed|found) no (difference|effect|association)\b|\btrend\b(?!”)/i;
const clone = (v: unknown) => JSON.parse(JSON.stringify(v));
const mean = (result: unknown, analysisId = "x") => {
  const m = meaningOf({ result, analysisId, style: "graphpad" });
  assert.ok(m, "a meaning");
  assert.doesNotMatch(m.sentence, FORBIDDEN);
  return m;
};
const cites = (m: { sources: { url: string }[] }, ...s: { url: string }[]) =>
  s.forEach((x) => assert.ok(m.sources.some((y) => y.url === x.url), `cites ${x.url}`));

test("Poisson regression: the rate ratio with its CI in words, per unit of exposure", () => {
  const m = mean(FX.poisson.result);
  assert.equal(m.sentence, "The rate of Colonies per unit of Area with Treatment Mutagen was 2.5 times that with Control "
    + "(rate ratio 2.5, 95% CI 1.99 to 3.166); a ratio this far from 1 would be unusual (P < 0.0001) "
    + "if Treatment had no association with Colonies.");
  assert.match(m.misreading ?? "", /^a rate ratio as a difference in counts/);
  assert.equal(m.test, "Poisson regression: models counts whose variance equals their mean.");
  cites(m, SRC.mccullaghNelder1989, MEANING_SOURCES.greenland2016);
});

test("quasi-Poisson and negative binomial: the same ratio, with the extra variance said", () => {
  const q = mean(FX.poisson_quasi.result);
  assert.match(q.sentence, /\(rate ratio 2\.5, 95% CI 1\.732 to 3\.608\); the CI and P allow for a variance 2\.091 times the Poisson variance \(quasi-likelihood\); a ratio this far from 1 would be unusual \(P = 0\.0001\)/);
  assert.match(q.test ?? "", /^Quasi-Poisson regression/);
  cites(q, SRC.wedderburn1974);
  const nb = mean(FX.negbin.result);
  assert.match(nb.sentence, /was 2\.498 times that with Control \(rate ratio 2\.498, 95% CI 1\.869 to 3\.356\); the CI and P allow for counts more variable than Poisson counts \(negative binomial\)/);
  cites(nb, SRC.venablesRipley2002);
});

test("a rate ratio whose CI includes 1 is never 'no effect'", () => {
  const r = clone(FX.poisson.result);
  const c = r.coefficients.find((x: any) => x.name !== "Intercept");
  Object.assign(c, { p: 0.31, rate_ratio: 1.2, rate_ratio_ci: [0.84, 1.71] });
  const m = mean(r);
  assert.match(m.sentence, /was 1\.2 times that with Control \(rate ratio 1\.2, 95% CI 0\.84 to 1\.71\); the data do not show an association \(P = 0\.3100\), and the CI includes 1\.$/);
  cites(m, MEANING_SOURCES.amrhein2019);
});

test("binomial regression: the odds ratio of positives out of counted", () => {
  const m = mean(FX.binomial.result);
  assert.equal(m.sentence, "Dose High (vs. Low) multiplies the odds of Positive (out of Counted) by 2.811 "
    + "(odds ratio, 95% CI 1.765 to 4.532); a ratio this far from 1 would be unusual (P < 0.0001) "
    + "if Dose had no association with Positive.");
  assert.match(m.misreading ?? "", /^an odds ratio of 2\.811 as 2\.811 times the share of positives/);
  cites(m, SRC.wartonHui2011);
});

test("three-way ANOVA: the highest-order interaction the data show comes first", () => {
  const m = mean(FX.three_way.result);
  assert.equal(m.sentence, "The effect of Time depended on Dose (Dose × Time interaction P < 0.0001); Sex and Dose also "
    + "interact (P = 0.0002); the data do not show a three-way interaction (P = 0.1047), so describe the effect "
    + "of Time at each level of Dose.");
  cites(m, SRC.gpThreeWay, MEANING_SOURCES.gpInteraction);
  const r = clone(FX.three_way.result);
  r.sources["Sex x Dose x Time"].p = 0.003;
  assert.match(mean(r).sentence, /^How Dose × Time combine differs between levels of Sex \(three-way interaction P = 0\.0030\)/);
  for (const k of Object.keys(r.sources)) if (r.sources[k].term?.length > 1) r.sources[k].p = 0.5;
  assert.match(mean(r).sentence, /^The data do not show that any factor's effect depends on another \(smallest interaction P = 0\.5000; the data do not show a three-way interaction \(P = 0\.5000\)\); averaged over the others, the main effects are Sex P < 0\.0001, Dose P < 0\.0001 and Time P < 0\.0001\.$/);
});

test("nested two-way and grouping-column mixed models: n is the units, not the values", () => {
  const n = mean(FX.mixed_nested.result);
  assert.equal(n.sentence, "The data do not show an interaction (P = 0.1784); the Diet means differ (F(1, 8) = 84.24, "
    + "P < 0.0001); the Sex means differ (F(1, 8) = 44.72, P = 0.0002); the tests count the 12 mice, not the 36 values "
    + "(78% of the variation lies between mice).");
  assert.match(n.misreading ?? "", /^every value as an independent replicate/);
  cites(n, SRC.lazic2010, SRC.aarts2014);
  const g = mean(FX.mixed_grouping.result);
  assert.equal(g.sentence, "The Treatment means differ (F(1, 6) = 14.53, P = 0.0088); the tests count the 8 dishes, "
    + "not the 24 values (86% of the variation lies between dishes).");
  const ns = clone(FX.mixed_grouping.result);
  ns.anova[0].p = 0.2;
  assert.match(mean(ns).sentence, /^The data do not show a difference between the Treatment means \(F\(1, 6\) = 14\.53, P = 0\.2000\)/);
});

test("general mixed model on a long table: the grouping column is the unit", () => {
  const m = mean(FX.lmm.result);
  assert.match(m.sentence, /^The Treatment means differ \(F\(1, \S+\) = \S+, P = \S+\); the tests count the 8 Dish groups, not the 24 values \(86% of the variation lies between Dish groups\)\.$/);
  const a = FX.lmm.result.anova[0];
  assert.ok(m.sentence.includes(`F(1, ${Number(a.dfd.toPrecision(4))}) = ${Number(a.f.toPrecision(4))}`), m.sentence);
});

test("time-course mixed model: Group × Time first, with the difference at the first and last time", () => {
  const m = mean(FX.mixed_timecourse.result);
  assert.equal(m.sentence, "The Vehicle and Drug groups changed differently over time (Group × Time P < 0.0001): "
    + "Vehicle − Drug was 0 at time 0 and 105 at time 21, so compare the groups at each time rather than by one "
    + "average difference.");
  assert.match(m.test ?? "", /compound symmetry \(random subject intercept\)/);
  const r = clone(FX.mixed_timecourse.result);
  r.anova.find((t: any) => /×/.test(t.term)).p = 0.4;
  assert.match(mean(r).sentence, /^The data do not show that the groups change differently over time \(Group × Time P = 0\.4000\); averaged over time, the groups differ \(P = 0\.0001\)\.$/);
});

test("time-course summary per subject (tumour and time-course modules)", () => {
  const m = mean(FX.subject_auc.result);
  assert.equal(m.sentence, "Each subject's area under the curve differs between the groups (subjects: Vehicle 4, Drug 4): "
    + "a difference this large would be unusual (P < 0.0001) if the groups did not differ; Vehicle − Drug = 1103.");
  const w = mean({ ...FX.subject_auc.result, summary: "mean" });
  assert.match(w.sentence, /^Each subject's mean over the window differs/);
});

test("quantal fits: the ED50 with its Fieller CI", () => {
  const m = mean({ fits: FX.quantal.result.datasets, ci_level: 0.95 }, "quantal");
  assert.equal(m.sentence, "For Compound X, 50% of the subjects are expected to respond at a dose of 4.282 (95% Fieller CI 3.258 to 5.655).");
  assert.match(m.misreading ?? "", /the ED50 is the dose at which 50% of them do/);
  cites(m, SRC.bliss1934);
  const poor = { fits: [{ ...FX.quantal.result.datasets[0], goodness_of_fit: { p_pearson: 0.01 },
    heterogeneity: { applied: true, alpha: 0.05 } }], ci_level: 0.95 };
  assert.match(mean(poor, "quantal").sentence, /; the counts scatter more than the probit curve allows \(Pearson χ² P = 0\.01\), so its CIs are widened for heterogeneity\.$/);
});

test("qPCR assay: the fold change against the calibrator, normalised to the reference genes", () => {
  const c = analysedCases().find((x) => x.key === "qpcr_example")!;
  const m = meaningOf({ result: replay(c), analysisId: c.analysisId, options: c.options, style: "graphpad" })!;
  // the fold change and CI of the sheet's "LPS vs. Control" row (e2e-assays pins 11.71, 8.218 to 16.69)
  assert.equal(m.sentence, "IL6 expression in LPS was 11.71-fold higher than in Control (fold change 11.71, 95% CI 8.218 "
    + "to 16.69), normalised to GAPDH and ACTB; a change this large would be unusual (P < 0.0001) if expression did not differ.");
  cites(m, SRC.livakSchmittgen2001);
});
