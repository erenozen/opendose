// The result kinds merged after P-66 in the statistics table (P-66) and
// "What this means" (P-69): relative potency, comparing two global
// models, a precision study, competing risks, parametric survival,
// meta-analysis, smoothing, uncertainty carried through Normalize, custom
// and repeated-measures interaction contrasts, and bootstrap CIs. Native
// engine results from kinds-fixtures.py (the engine tests' published
// examples: S. alba, the vmkmki inhibition data, tidycmprsk's trial,
// ovarian, the BCG trials, cars). Every row's numbers equal the results
// sheet's (formatSig of the engine's value); every sentence is pinned.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { meaningOf } from "../meaning.ts";
import { statsRows, STATS_KINDS, type StatsRow } from "../statsTable.ts";
import { analysisPy, analysisR, scriptCoverage } from "../scripts.ts";
import { SRC } from "../../guide/sources.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const FX = JSON.parse(readFileSync(new URL("./kinds-fixtures.json", import.meta.url), "utf8")) as
  Record<string, { payload: any; result: any }>;
const FORBIDDEN = /\bprove[sd]?\b|\b(is|was|were|are|shows?|showed|found) no (difference|effect|association)\b|\btrend\b|—/i;
const clone = (v: unknown) => JSON.parse(JSON.stringify(v));
const rows = (k: string, result: unknown = FX[k].result): StatsRow[] => statsRows({ sheet: k, data: "Data", analysisId: "x",
  analysisLabel: "Analysis", panels: [], result }, { style: "graphpad" });
const pick = (r: StatsRow, keys: (keyof StatsRow)[]) => Object.fromEntries(keys.map((k) => [k, r[k]]));
const mean = (result: unknown) => {
  const m = meaningOf({ analysisId: "x", result, style: "graphpad" });
  assert.ok(m, "a meaning");
  assert.doesNotMatch(m.sentence, FORBIDDEN);
  return m;
};
const cites = (m: { sources: { url: string }[] }, ...s: { url: string }[]) =>
  s.forEach((x) => assert.ok(m.sources.some((y) => y.url === x.url), `cites ${x.url}`));

test("every new kind has a statistics-table mapper", () => {
  for (const k of ["relative_potency", "compare_global_fits", "precision_study", "competing_risks",
    "parametric_survival", "meta_analysis"]) assert.ok(STATS_KINDS.includes(k), k);
});

test("relative potency: the parallelism F test and the Fieller CI of the potency ratio", () => {
  const [f, pot] = rows("relative_potency");
  assert.deepEqual(pick(f, ["comparison", "statistic", "value", "df", "p", "pExact"]), {
    comparison: "Glyphosate vs. Bentazone: parallel curves", statistic: "F", value: "2.747", df: "3, 60",
    p: "0.05066", pExact: "0.05066" });
  assert.deepEqual(pick(pot, ["estimate", "estimateValue", "ciLevel", "ciLower", "ciUpper", "note"]), {
    estimate: "Relative potency (EC50 of Bentazone / EC50 of Glyphosate)", estimateValue: "0.4254", ciLevel: "95%",
    ciLower: "0.3497", ciUpper: "0.5161", note: "Fieller (correlated estimates, parallel model)" });
  const m = mean(FX.relative_potency.result);
  assert.equal(m.sentence, "Glyphosate is 0.4254 times as potent as Bentazone (the EC50 of Bentazone divided by the EC50 "
    + "of Glyphosate; 95% Fieller CI 0.3497 to 0.5161); the data do not show that the curves differ in shape "
    + "(F test of parallelism P = 0.0507).");
  assert.match(m.misreading!, /a parallelism P above 0\.05 does not prove they are/);
  cites(m, SRC.fieller1954, SRC.ritz2015, SRC.amrhein2019);
  const r = clone(FX.relative_potency.result);
  r.f_test.p = 0.003;
  assert.match(mean(r).sentence, /; but the curves are not parallel \(F test P = 0\.0030\), so one ratio does not describe every response level\.$/);
});

test("two global models: F test and AICc", () => {
  const [row] = rows("compare_global_fits");
  assert.deepEqual(pick(row, ["comparison", "n", "statistic", "value", "df", "p", "pExact", "note"]), {
    comparison: "Competitive inhibition vs. Mixed model inhibition", n: "72 points", statistic: "F", value: "218.3",
    df: "1, 68", p: "< 0.0001", pExact: "6.553e-23", note: "AICc difference -101.2; AICc prefers Mixed model inhibition" });
  assert.equal(mean(FX.compare_global_fits.result).sentence, "Mixed model inhibition fits better than Competitive inhibition "
    + "(F(1, 68) = 218.3, P < 0.0001): a reduction in scatter this large would be unusual if the simpler model were right. "
    + "AICc also prefers Mixed model inhibition (difference −101.2).");
  const r = clone(FX.compare_global_fits.result);
  r.f_test.p = 0.2;
  assert.match(mean(r).sentence, /^The data do not show that Mixed model inhibition fits better than Competitive inhibition \(F\(1, 68\) = 218\.3, P = 0\.2000\), so the simpler model is kept\./);
  // not nested: AICc alone, no F row
  const nn = { ...clone(FX.compare_global_fits.result), f_test: null };
  assert.equal(rows("compare_global_fits", nn)[0].test, "AICc (global models, not nested)");
  assert.match(mean(nn).sentence, /^AICc prefers Mixed model inhibition \(difference −101\.2; probability 1 that it is the better of the two\); the models are not nested, so there is no F test\.$/);
});

test("precision study: CVs and recovery with their CIs, no P", () => {
  const rs = rows("precision_study");
  assert.deepEqual(rs.map((r) => [r.estimate, r.estimateValue, r.ciLower, r.ciUpper, r.p]), [
    ["Repeatability CV (%)", "1.665", "1.24", "2.534", ""],
    ["Between-run CV (%)", "3.009", "0", "4.943", ""],
    ["Total (within-laboratory) CV (%)", "3.439", "2.106", "9.053", ""],
    ["Recovery (%)", "103.1", "97.97", "108.1", ""],
  ]);
  assert.equal(rs[3].note, "accepted (limits ±15% recovery, 15% CV)");
  const m = mean(FX.precision_study.result);
  assert.equal(m.sentence, "For QC mid, the repeatability CV is 1.665% (95% CI 1.24 to 2.534) and the within-laboratory "
    + "(total) CV is 3.439% (95% CI 2.106 to 9.053), from 20 values in 4 runs; recovery is 103.1% of the nominal 50 "
    + "(95% CI 97.97 to 108.1), within the acceptance limits.");
  cites(m, SRC.blandAltman1996);
});

test("competing risks: Gray's test per cause; P above 0.05 is not 'no difference'", () => {
  assert.deepEqual(rows("competing_risks").map((r) => [r.comparison, r.statistic, r.value, r.df, r.p]), [
    ["Cause 1: Drug A vs. Drug B", "χ²", "1.988", "1", "0.1585"],
    ["Cause 2: Drug A vs. Drug B", "χ²", "0.08857", "1", "0.766"],
  ]);
  const m = mean(FX.competing_risks.result);
  assert.equal(m.sentence, "The data do not show that the cumulative incidence of any cause differs between Drug A and "
    + "Drug B (Gray's test: cause 1 P = 0.1585, cause 2 P = 0.7660).");
  assert.match(m.misreading!, /^1 − Kaplan-Meier as the risk of one cause/);
  cites(m, SRC.gray1988, SRC.amrhein2019);
  const r = clone(FX.competing_risks.result);
  r.causes[0].gray.p = 0.01;
  assert.match(mean(r).sentence, /^The cumulative incidence of cause 1 differs between Drug A and Drug B: a difference this large would be unusual/);
});

test("parametric survival: likelihood-ratio test and the time ratio", () => {
  const [lr, tr] = rows("parametric_survival");
  assert.deepEqual(pick(lr, ["test", "comparison", "statistic", "value", "df", "p"]), {
    test: "parametric survival regression (Weibull AFT)", comparison: "Among all groups (likelihood ratio)",
    statistic: "χ²", value: "1.18", df: "1", p: "0.2775" });
  assert.deepEqual(pick(tr, ["comparison", "estimate", "estimateValue", "ciLower", "ciUpper", "p"]), {
    comparison: "rx 2 vs. rx 1", estimate: "Time ratio (acceleration factor)", estimateValue: "1.749",
    ciLower: "0.62", ciUpper: "4.936", p: "0.2906" });
  const m = mean(FX.parametric_survival.result);
  assert.equal(m.sentence, "Under the Weibull model, survival times in rx 2 are 1.749 times those in rx 1 (time ratio, "
    + "longer in rx 2; 95% CI 0.62 to 4.936); the data do not show a difference (P = 0.2906), and the CI includes 1.");
  assert.match(m.misreading!, /^a time ratio as a hazard ratio/);
  cites(m, SRC.wei1992);
});

test("meta-analysis: pooled ratio (random and common effect), heterogeneity", () => {
  const rs = rows("meta_analysis");
  assert.deepEqual(rs.map((r) => [r.comparison, r.statistic, r.value, r.p, r.estimateValue, r.ciLower, r.ciUpper]), [
    ["Pooled (random effects, REML)", "z", "-3.974", "< 0.0001", "0.4894", "0.3441", "0.6962"],
    ["Pooled (common effect, inverse variance)", "z", "-10.62", "< 0.0001", "0.6503", "0.6007", "0.704"],
    ["Between studies", "Q", "152.2", "< 0.0001", "", "", ""],
  ]);
  assert.equal(rs[0].note, "τ² = 0.3132, I² = 92.22%");
  const m = mean(FX.meta_analysis.result);
  assert.equal(m.sentence, "Combined over 13 studies, the pooled ratio is 0.4894 (random effects, REML; 95% CI 0.3441 to "
    + "0.6962); a ratio this far from 1 would be unusual (P < 0.0001) if the true ratio were 1; I² = 92.22% of the variation "
    + "between studies is beyond chance, and the true effect of a new study is expected between 0.1342 and 1.785 "
    + "(95% prediction interval).");
  cites(m, SRC.derSimonianLaird1986, SRC.higginsThompson2002, SRC.riley2011);
  // log ratios entered (the app's "Estimates are log ratios") read the same
  const logs = { ...clone(FX.meta_analysis.result), scale: "log_ratio" };
  assert.equal(mean(logs).sentence, m.sentence);
  assert.equal(rows("meta_analysis", logs)[0].estimateValue, "0.4894");
  // differences stay on their own scale
  const diff = { ...clone(FX.meta_analysis.result), scale: "difference" };
  assert.match(mean(diff).sentence, /the pooled estimate is −0\.7145 \(random effects, REML; 95% CI −1\.067 to −0\.3622\); a pooled effect this far from 0 would be unusual \(P < 0\.0001\) if the true effect were 0;/);
});

test("smoothing: descriptive in the table; the meaning says it has no model CI", () => {
  for (const k of ["smooth_spline", "smooth_lowess", "curve_ops"]) {
    assert.equal(rows(k)[0].note, "Descriptive analysis or data manipulation: no test or estimate to tabulate.", k);
  }
  assert.equal(mean(FX.smooth_spline.result).sentence, "The curve through Distance is a smoothing spline (natural cubic, "
    + "penalised) with 2.636 effective degrees of freedom chosen by generalized cross-validation: it describes the shape of the data "
    + "and has no parameters, so it gives no model-based confidence interval.");
  assert.equal(mean(FX.smooth_lowess.result).sentence, "The curve through Distance is a LOWESS (locally weighted regression, "
    + "Cleveland 1979) with a span of 0.6667 of the points: it describes the shape of the data and has no parameters, so it gives no "
    + "model-based confidence interval.");
  cites(mean(FX.smooth_lowess.result), SRC.cleveland1979, SRC.cravenWahba1978);
  assert.equal(meaningOf({ result: FX.curve_ops.result, style: "graphpad" }), null);
});

test("custom contrasts and RM interaction contrasts follow the kind's own rows", () => {
  const cc = rows("custom_contrasts").filter((r) => r.estimate === "Contrast");
  assert.deepEqual(cc.map((r) => [r.comparison, r.value, r.df, r.p, r.adjustment, r.estimateValue, r.ciLower, r.ciUpper]), [
    ["Drugs vs vehicle: -2 × Vehicle + Drug A + Drug B", "3.446", "15", "0.003601", "none (planned)", "7.771", "2.964", "12.58"],
    ["Drugs vs vehicle: -2 × Vehicle + Drug A + Drug B", "3.446", "15", "0.0126", "Scheffe (2, 15 df)", "7.771", "1.651", "13.89"],
    ["A vs B: Drug A - Drug B", "-1.396", "15", "0.1831", "none (planned)", "-1.834", "-4.635", "0.9667"],
    ["A vs B: Drug A - Drug B", "-1.396", "15", "0.4002", "Scheffe (2, 15 df)", "-1.834", "-5.4", "1.732"],
  ]);
  const ic = rows("rm_contrasts").filter((r) => r.estimate === "Difference of the two effects");
  assert.deepEqual(ic.map((r) => [r.comparison, r.value, r.df, r.p, r.estimateValue, r.ciLower, r.ciUpper]), [
    ["(Drug - Vehicle) in KO minus (Drug - Vehicle) in WT", "2.577", "10", "0.02755", "2.165", "0.2932", "4.037"],
  ]);
  // the interaction contrast is the 2 x 2 interaction test: same P
  assert.equal(rows("rm_contrasts").find((r) => r.comparison === "Interaction")!.p, ic[0].p);
});

test("bootstrap CIs: the table and the meaning say how the CI was made", () => {
  const [ic50] = rows("dose_bootstrap");
  assert.deepEqual(pick(ic50, ["estimate", "estimateValue", "ciLower", "ciUpper", "note"]), {
    estimate: "IC50", estimateValue: "1.040e-7", ciLower: "9.761e-8", ciUpper: "1.131e-7",
    note: "CI by bootstrap (case resampling, 500 resamples, percentile)" });
  const m = mean(FX.dose_bootstrap.result);
  assert.match(m.sentence, /at 1\.040e-7, its IC50 \(95% bootstrap CI 9\.761e-8 to 1\.131e-7; case resampling, 500 resamples\);/);
  cites(m, SRC.efron1987);
  // an asymptotic fit keeps its wording
  const a = clone(FX.dose_bootstrap.result);
  a.datasets[0].fit.ci_method = "asymptotic";
  assert.match(mean(a).sentence, /its IC50 \(95% CI 9\.761e-8 to 1\.131e-7\);/);
  assert.equal(rows("dose_bootstrap", a)[0].note, "");
});

test("uncertainty carried through Normalize: what the SDs are, and are not", () => {
  const r = { analysis: "normalize", datasets: [], propagation: {
    method: "first-order (delta method) propagation, GUM (JCGM 100:2008) section 5.1, over the individual replicate values",
    warning: "Propagated SDs and SEs describe each derived value; they are not replicates. Do not enter them, or the derived values, into a t test or ANOVA as independent replicates: the baseline's error is shared by every value. Analyse the raw values with the control (blank) as a block instead.",
    datasets: [] } };
  const m = mean(r);
  assert.equal(m.sentence, "Each normalised value carries an SD and SE propagated from the scatter of its own replicates and "
    + "of the reference values (first-order (delta method) propagation, GUM (JCGM 100:2008) section 5.1, over the "
    + "individual replicate values).");
  assert.match(m.misreading!, /^the propagated SDs as replicates\. They describe each derived value/);
  cites(m, SRC.gum2008, SRC.curtis2018);
  assert.equal(meaningOf({ result: { analysis: "normalize", datasets: [] }, style: "graphpad" }), null);
});

test("script export: no pretend call for the kinds without one; each says why and names the closest R call", () => {
  const table = { type: "xy", x: [], xTitle: "", rowTitles: [], datasets: [], subcolumnFormat: "replicates" } as any;
  const entries = ["relative_potency", "compare_global_fits", "precision_study", "competing_risks", "parametric_survival",
    "meta_analysis", "smooth_spline", "curve_ops"].map((k) => ({ sheet: k, analysisId: "x", result: FX[k].result,
    options: {}, table, dataName: "t", csv: "data/t.long.csv" }));
  assert.deepEqual(scriptCoverage(entries).run, []);
  const meta = { title: "t", app: "OpenDose", date: "2026-11-24T00:00:00.000Z" };
  const py = analysisPy(entries, meta);
  assert.match(py, /# Cumulative incidence with Gray's test: SciPy and statsmodels have no such call/);
  assert.match(py, /# statsmodels\.stats\.meta_analysis\.combine_effects pools the same estimates, but its random-effects tau² is DerSimonian-Laird or Paule-Mandel, not REML; not run here\./);
  assert.doesNotMatch(py, /No standard call is written for this analysis/);
  const r = analysisR(entries, meta);
  assert.match(r, /# Closest call: cmprsk::cuminc\(ftime, fstatus, group\)/);
  assert.match(r, /# Closest call: survival::survreg\(Surv\(time, event\) ~ group, dist = "weibull"\)/);
});
