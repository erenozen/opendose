// The statistics table (report/statsTable.ts, P-66) against native engine
// results (stats-fixtures.json, made by stats-fixtures.py): per analysis
// kind, every row's numbers equal what its results sheet shows (the
// engine's field through formatSig at the results precision, P through
// the results tables' P formatter), and a kind or result the table
// cannot read is listed with a note, never dropped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatSig } from "../../types.ts";
import { pNumber } from "../pformat.ts";
import {
  STATS_COLUMNS, STATS_KINDS, statsKind, statsMatrix, statsRows, statsTable, statsWordSections,
  type StatsEntry, type StatsRow,
} from "../statsTable.ts";
import { statsCsv, statsWorkbook } from "../../export/statsExport.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const here = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(join(here, "stats-fixtures.json"), "utf8")) as
  Record<string, { options: unknown; result: any }>;

const sheet = (k: string) => (k === "quantal" ? { fits: FX.quantal.result.datasets, ci_level: 0.95 } : FX[k].result);
const entry = (k: string, over: Partial<StatsEntry> = {}): StatsEntry => ({
  sheet: `Results of ${k}`, data: "Data 1", analysisId: k === "quantal" ? "quantal" : "column",
  analysisLabel: "Analysis", panels: [], ...over, result: "result" in over ? over.result : sheet(k),
});
const rowsOf = (k: string) => statsRows(entry(k), { style: "graphpad" });
// what a results sheet writes: formatSig at the results precision, P in the
// GraphPad style's table form (pformat.tableP)
const S = (v: number) => formatSig(v);
const P = (p: number) => pNumber(p, "graphpad", "table");
const X = (p: number) => formatSig(p, 4);
const ci = (row: StatsRow) => [row.ciLower, row.ciUpper];

test("columns: one header per field, in the documented order", () => {
  assert.deepEqual(STATS_COLUMNS.map((c) => c.header), [
    "Results sheet", "Figure panel", "Data table", "Test", "Comparison", "n per group", "Statistic",
    "Statistic value", "df", "P", "P (exact)", "Adjustment", "Family", "Estimate", "Estimate value",
    "CI level", "CI lower", "CI upper", "Effect size", "Effect size value", "Effect size CI lower",
    "Effect size CI upper", "Note"]);
});

test("unpaired t test: one row equal to the results sheet (t signed as A − B, df, P, difference and CI, d)", () => {
  const r = FX.ttest_unpaired.result;
  const [row, more] = rowsOf("ttest_unpaired");
  assert.equal(more, undefined);
  assert.equal(row.test, "unpaired t test");
  assert.equal(row.comparison, "Control − Treated A");
  assert.equal(row.n, "Control 6; Treated A 6");
  assert.equal(row.statistic, "t");
  assert.equal(row.value, S(-r.t));
  assert.equal(row.value, "-5.596");
  assert.equal(row.df, "10");
  assert.equal(row.p, P(r.p_two_tailed));
  assert.equal(row.pExact, "2.290e-4");
  assert.equal(row.adjustment, "none (one comparison)");
  assert.equal(row.estimateValue, S(r.difference));
  assert.deepEqual(ci(row), r.ci_difference.map(S));
  assert.equal(row.ciLevel, "95%");
  assert.equal(row.effect, "Cohen's d (pooled SD)");
  assert.equal(row.effectValue, S(r.effect_size.d));
  assert.deepEqual([row.effectLower, row.effectUpper], r.effect_size.ci_d.map(S));
});

test("Welch, paired, Mann-Whitney, Wilcoxon and KS: each test's own statistic, estimate and CI", () => {
  const w = FX.ttest_welch.result;
  const [rw] = rowsOf("ttest_welch");
  assert.equal(rw.df, S(w.df));
  assert.equal(rw.p, P(w.p_two_tailed));
  const pr = FX.ttest_paired.result;
  const [rp] = rowsOf("ttest_paired");
  assert.match(rp.estimate, /^Mean of differences/);
  assert.equal(rp.estimateValue, S(pr.mean_difference));
  assert.equal(rp.df, String(pr.df));
  const m = FX.mann_whitney.result;
  const [rm] = rowsOf("mann_whitney");
  assert.deepEqual([rm.statistic, rm.value, rm.p], ["U", S(m.U), P(m.p_two_tailed)]);
  assert.equal(rm.estimateValue, S(m.hodges_lehmann_difference));
  assert.deepEqual(ci(rm), m.ci_hodges_lehmann.map(S));
  assert.equal(rm.ciLevel, `${Number((m.ci_actual_level * 100).toPrecision(4))}%`);
  const wi = FX.wilcoxon.result;
  const [rwi] = rowsOf("wilcoxon");
  assert.deepEqual([rwi.value, rwi.estimateValue], [S(wi.W), S(wi.hodges_lehmann)]);
  const k = FX.ks_test.result;
  const [rk] = rowsOf("ks_test");
  assert.deepEqual([rk.statistic, rk.value, rk.p], ["D", S(k.D), P(k.p)]);
});

test("one-way ANOVA with Tukey: the F test, then one row per comparison with its family", () => {
  const r = FX.anova_tukey.result;
  const rows = rowsOf("anova_tukey");
  assert.equal(rows.length, 1 + r.multiple_comparisons.comparisons.length);
  const [omni, ...cmp] = rows;
  assert.deepEqual([omni.comparison, omni.statistic, omni.value, omni.df, omni.p, omni.pExact],
    ["Among all groups", "F", S(r.table.F), "2, 15", P(r.table.p), "6.693e-9"]);
  assert.equal(omni.effect, "η²");
  assert.equal(omni.effectValue, S(r.effect_size.eta_squared));
  r.multiple_comparisons.comparisons.forEach((c: any, i: number) => {
    assert.equal(cmp[i].comparison, c.pair);
    assert.equal(cmp[i].statistic, "q");
    assert.equal(cmp[i].value, S(c.statistic));
    assert.equal(cmp[i].df, "15");
    assert.equal(cmp[i].p, P(c.p_adjusted));
    assert.equal(cmp[i].pExact, X(c.p_adjusted));
    assert.equal(cmp[i].adjustment, "Tukey");
    assert.equal(cmp[i].family, "3 comparisons (all pairs of 3 groups)");
    assert.equal(cmp[i].estimateValue, S(c.difference));
    assert.deepEqual(ci(cmp[i]), c.ci.map(S));
  });
  assert.equal(cmp[0].n, "Control 6; Treated A 6");
});

test("Kruskal-Wallis, Welch ANOVA, RM ANOVA, mixed-model RM and Friedman", () => {
  const k = FX.kruskal.result;
  const [h, d1] = rowsOf("kruskal");
  assert.deepEqual([h.statistic, h.value, h.df, h.p], ["H", S(k.H), "2", P(k.p)]);
  assert.deepEqual([d1.statistic, d1.value, d1.p, d1.adjustment], ["z", S(k.dunns.comparisons[0].statistic),
    P(k.dunns.comparisons[0].p_adjusted), "Dunn"]);
  assert.equal(d1.estimate, "Mean rank difference");
  const w = FX.welch_anova.result;
  const [wr, bf, gh] = rowsOf("welch_anova");
  assert.deepEqual([wr.value, wr.df, wr.p], [S(w.welch.W), `2, ${S(w.welch.dfd)}`, P(w.welch.p)]);
  assert.deepEqual([bf.value, bf.p], [S(w.brown_forsythe.F), P(w.brown_forsythe.p)]);
  assert.equal(gh.adjustment, "Games-Howell");
  const rm = FX.rm_anova.result;
  const [ro, rc] = rowsOf("rm_anova");
  // the sheet's headline P is the Geisser-Greenhouse corrected one
  assert.deepEqual([ro.value, ro.df, ro.p], [S(rm.table.F), "2, 10", P(rm.table.p_geisser_greenhouse)]);
  assert.match(ro.note, /Geisser-Greenhouse/);
  assert.equal(rc.p, P(rm.comparisons.comparisons[0].p_adjusted));
  const mr = FX.mixed_rm_one_way.result;
  const [mo] = rowsOf("mixed_rm_one_way");
  assert.deepEqual([mo.value, mo.df, mo.p], [S(mr.fixed_effect.F), "2, 9", P(mr.fixed_effect.p_geisser_greenhouse)]);
  const fr = FX.friedman.result;
  const [fo] = rowsOf("friedman");
  assert.deepEqual([fo.value, fo.p], [S(fr.statistic), P(fr.p)]);
});

test("two-way, three-way and RM two-way ANOVA: one row per term, then the post hoc rows", () => {
  const r = FX.two_way.result;
  const rows = rowsOf("two_way");
  const terms = rows.filter((x) => x.statistic === "F");
  assert.deepEqual(terms.map((x) => x.comparison), ["Interaction", "Day", "Treatment"]);
  assert.deepEqual(terms.map((x) => x.value), [r.sources.interaction.F, r.sources.Day.F, r.sources.Treatment.F].map(S));
  assert.deepEqual(terms.map((x) => x.df), ["2, 12", "2, 12", "1, 12"]);
  assert.equal(terms[0].effect, "Partial η²");
  assert.equal(terms[0].effectValue, S(r.effect_size.interaction.partial_eta_squared));
  const post = rows.filter((x) => x.adjustment === "Šídák");
  assert.equal(post.length, 3);
  assert.equal(post[2].comparison, "Vehicle vs. Drug (Day 21)");
  assert.equal(post[2].p, P(r.multiple_comparisons.comparisons[2].p_adjusted));
  const t3 = FX.three_way.result;
  const r3 = rowsOf("three_way");
  assert.equal(r3.length, 7);
  assert.equal(r3[3].comparison, "Sex x Dose");
  assert.deepEqual([r3[3].value, r3[3].df, r3[3].p], [S(t3.sources["Sex x Dose"].F), "1, 16", P(t3.sources["Sex x Dose"].p)]);
  const rm = FX.rm_two_way_mixed.result;
  const rr = rowsOf("rm_two_way_mixed");
  const inter = rr.find((x) => x.comparison === "Interaction")!;
  assert.equal(inter.p, P(rm.sources.interaction.p));
  assert.match(inter.note, new RegExp(`P \\(Geisser-Greenhouse\\) ${P(rm.sources.interaction.p_geisser_greenhouse)}`));
  assert.ok(!rr.some((x) => /subjects/i.test(x.comparison)), "the subjects row is not a comparison");
  assert.ok(rowsOf("rm_two_way_both").length >= 3);
  const mx = FX.mixed_rm_twoway.result;
  const mrows = rowsOf("mixed_rm_twoway");
  assert.equal(mrows.find((x) => x.comparison === "Column factor")!.value, S(mx.fixed_effects.column_factor.F));
});

test("aligned rank transform two-way ANOVA (P-85): one row per effect on its aligned ranks, then ART-C", () => {
  const r = FX.two_way_art.result;
  const rows = rowsOf("two_way_art");
  const terms = rows.filter((x) => x.statistic === "F (aligned ranks)");
  assert.deepEqual(terms.map((x) => x.comparison), ["Day", "Treatment", "Interaction"]);
  assert.deepEqual(terms.map((x) => x.value), [r.sources.Day.F, r.sources.Treatment.F, r.sources.interaction.F].map(S));
  assert.deepEqual(terms.map((x) => x.df), ["2, 12", "1, 12", "2, 12"]);
  assert.deepEqual(terms.map((x) => x.p), [r.sources.Day.p, r.sources.Treatment.p, r.sources.interaction.p].map(P));
  assert.ok(terms.every((x) => x.note === "ranks aligned for this effect"));
  const post = rows.filter((x) => x.adjustment === "Tukey");
  assert.equal(post.length, 1);
  assert.equal(post[0].comparison, "Vehicle vs. Drug");
  assert.equal(post[0].estimate, "Difference of mean aligned ranks");
  assert.equal(post[0].p, P(r.art_contrasts.comparisons[0].p_adjusted));
});

test("multiple t tests: one row per data row with the family's adjusted P and the unadjusted one in the note", () => {
  const r = FX.multi_t.result;
  const rows = rowsOf("multi_t");
  assert.equal(rows.length, 3);
  r.rows.forEach((x: any, i: number) => {
    assert.equal(rows[i].p, P(x.p_adjusted));
    assert.equal(rows[i].value, S(x.statistic));
    assert.equal(rows[i].df, S(x.df));
    assert.equal(rows[i].adjustment, "Holm-Šídák");
  });
  assert.match(rows[1].note, /^unadjusted P /);
});

test("correlation, contingency, McNemar, kappa, two proportions, rates", () => {
  const c = FX.correlation.result;
  const [rc] = rowsOf("correlation");
  assert.deepEqual([rc.statistic, rc.value, rc.df, rc.p], ["Pearson r", S(c.r), String(c.n - 2), P(c.p_two_tailed)]);
  assert.deepEqual(ci(rc), c.ci_r.map(S));
  const t = FX.contingency_2x2.result;
  const [fisher, chi] = rowsOf("contingency_2x2");
  assert.equal(fisher.test, "Fisher's exact test");
  assert.equal(fisher.p, P(t.fisher_exact.p));
  assert.equal(fisher.estimateValue, S(t.relative_risk.value));
  assert.deepEqual([chi.value, chi.df, chi.p], [S(t.chi_square.chi2), "1", P(t.chi_square.p)]);
  const t3 = FX.contingency_2x3.result;
  const r3 = rowsOf("contingency_2x3");
  assert.equal(r3.length, 1);
  assert.equal(r3[0].df, "2");
  assert.equal(r3[0].effect, "Cramér's V");
  const mc = FX.mcnemar.result;
  const [rm] = rowsOf("mcnemar");
  assert.equal(rm.p, P(mc.recommended_p));
  assert.match(rm.note, /exact binomial/);
  const k = FX.kappa.result;
  const [rk] = rowsOf("kappa");
  assert.deepEqual([rk.test, rk.estimateValue, rk.p], ["Cohen's kappa", S(k.kappa), P(k.p)]);
  const pp = FX.proportions.result;
  const [rp] = rowsOf("proportions");
  assert.equal(rp.p, P(pp.fisher_exact.p));
  const rr = FX.rate_compare.result;
  const [rt] = rowsOf("rate_compare");
  assert.deepEqual([rt.estimateValue, rt.p], [S(rr.rate_ratio), P(rr.p_two_tailed)]);
  assert.deepEqual(ci(rt), rr.ratio_ci.map(S));
  void t3;
});

test("survival and Cox: log-rank with the hazard ratio, Cox per term with its hazard ratio", () => {
  const s = FX.survival.result;
  const [lr, gbw] = rowsOf("survival");
  assert.deepEqual([lr.value, lr.df, lr.p, lr.estimateValue], [S(s.logrank.chi2), "1", P(s.logrank.p), S(s.hazard_ratio.value)]);
  assert.equal(gbw.test, "Gehan-Breslow-Wilcoxon test");
  const c = FX.cox.result;
  const rows = rowsOf("cox");
  assert.equal(rows.length, c.coefficients.length);
  assert.equal(rows[0].test, "Cox proportional-hazards regression");
  assert.equal(rows[0].comparison, "Group: Treated vs. Control");
  assert.deepEqual([rows[0].statistic, rows[0].value, rows[0].p, rows[0].estimate, rows[0].estimateValue],
    ["z", S(c.coefficients[0].z), P(c.coefficients[0].p), "Hazard ratio", S(c.coefficients[0].hazard_ratio)]);
  assert.deepEqual(ci(rows[0]), c.coefficients[0].hazard_ratio_ci.map(S));
});

test("regression models: one row per coefficient (not the intercept), ratio scale where the model has one", () => {
  const cases: [string, string, string, string][] = [
    ["multiple_regression", "multiple linear regression", "Coefficient", "estimate"],
    ["logistic", "logistic regression", "Odds ratio", "odds_ratio"],
    ["poisson", "Poisson regression", "Rate ratio", "rate_ratio"],
    ["poisson_quasi", "quasi-Poisson regression", "Rate ratio", "rate_ratio"],
    ["negbin", "negative binomial regression", "Rate ratio", "rate_ratio"],
    ["binomial", "binomial regression", "Odds ratio", "odds_ratio"],
    ["ordinal", "ordinal logistic regression (proportional odds)", "Odds ratio", "odds_ratio"],
  ];
  for (const [k, test, est, field] of cases) {
    const r = FX[k].result;
    const coefs = r.coefficients.filter((c: any) => c.name !== "Intercept");
    const rows = rowsOf(k);
    assert.equal(rows.length, coefs.length, k);
    coefs.forEach((c: any, i: number) => {
      assert.equal(rows[i].test, test, k);
      assert.equal(rows[i].estimate, est, k);
      assert.equal(rows[i].estimateValue, S(c[field]), k);
      assert.equal(rows[i].p, P(c.p), k);
      assert.equal(rows[i].value, S(c.t ?? c.z), k);
      assert.equal(rows[i].statistic, typeof c.t === "number" ? "t" : "z", k);
    });
  }
  // quasi-Poisson: t with the residual df, the rate ratio 2.5 with its wider CI
  const [q] = rowsOf("poisson_quasi");
  assert.deepEqual([q.statistic, q.df, q.estimateValue, q.ciLower, q.ciUpper], ["t", "14", "2.5", "1.732", "3.608"]);
});

test("nested t test and nested ANOVA", () => {
  const t = FX.nested_t.result;
  const [rt] = rowsOf("nested_t");
  assert.deepEqual([rt.comparison, rt.value, rt.df, rt.p, rt.estimateValue],
    ["Diet A − Control", S(t.t), "4", P(t.p), S(t.difference)]);
  const a = FX.nested_anova.result;
  const [ra, ...cmp] = rowsOf("nested_anova");
  assert.deepEqual([ra.value, ra.df, ra.p], [S(a.F), "2, 6", P(a.p)]);
  assert.equal(cmp.length, 3);
});

test("mixed models: nested two-way, grouping column and time course", () => {
  const m = FX.mixed_nested.result;
  const rows = rowsOf("mixed_nested");
  const terms = rows.filter((x) => x.adjustment.startsWith("not adjusted"));
  assert.deepEqual(terms.map((x) => x.comparison), m.anova.map((x: any) => x.term));
  assert.deepEqual(terms.map((x) => x.value), m.anova.map((x: any) => S(x.f)));
  assert.deepEqual(terms.map((x) => x.df), m.anova.map((x: any) => `${x.dfn}, ${x.dfd}`));
  const post = rows.filter((x) => x.adjustment === "Šídák");
  assert.equal(post.length, m.comparisons.comparisons.length);
  assert.equal(post[0].comparison, "Female vs. Male (Diet: Chow)");
  assert.equal(post[0].p, P(m.comparisons.comparisons[0].p_adjusted));
  const g = FX.mixed_grouping.result;
  const [gr] = rowsOf("mixed_grouping");
  assert.deepEqual([gr.value, gr.df, gr.p], [S(g.anova[0].f), "1, 6", P(g.anova[0].p)]);
  const lm = FX.lmm.result;
  const [lr] = rowsOf("lmm");
  assert.deepEqual([lr.comparison, lr.value, lr.df, lr.p], [lm.anova[0].term, S(lm.anova[0].f),
    `${lm.anova[0].dfn}, ${S(lm.anova[0].dfd)}`, P(lm.anova[0].p)]);
  const tc = FX.mixed_timecourse.result;
  const tr = rowsOf("mixed_timecourse");
  assert.equal(tr.length, tc.anova.length + tc.group_difference_at_time.comparisons.length);
  assert.equal(tr[3].comparison, "Vehicle vs. Drug (Time 0)");
  assert.equal(tr[5].p, P(tc.group_difference_at_time.comparisons[2].p_adjusted));
});

test("curve fits: the IC50 and LogIC50 with their CIs; linear regression slope; quantal slope test and ED50", () => {
  const fit = FX.dose_response.result.datasets[0].fit;
  const [ic50, log] = rowsOf("dose_response");
  assert.deepEqual([ic50.estimate, ic50.estimateValue], ["IC50", S(fit.params.IC50.value)]);
  assert.equal(ic50.estimateValue, "1.040e-7");
  assert.deepEqual(ci(ic50), fit.params.IC50.ci95.map(S));
  assert.deepEqual([log.estimate, log.estimateValue], ["LogIC50", "-6.983"]);
  assert.deepEqual(ci(log), fit.params.LogIC50.ci95.map(S));
  assert.equal(ic50.n, "Drug A 27 points");
  assert.equal(ic50.p, "");
  const lr = FX.linear_regression.result.datasets[0].fit;
  const [rl] = rowsOf("linear_regression");
  assert.deepEqual([rl.estimateValue, rl.value, rl.df, rl.p], [S(lr.slope.value), S(lr.f_nonzero_slope.F), "1, 4",
    P(lr.f_nonzero_slope.p)]);
  const q = FX.quantal.result.datasets[0];
  const [slope, ed] = statsRows(entry("quantal", { analysisId: "quantal" }));
  assert.deepEqual([slope.value, slope.p], [S(q.slope_test.statistic), P(q.slope_test.p)]);
  assert.deepEqual([ed.estimate, ed.estimateValue], ["ED50 (dose)", S(q.ec[0].dose)]);
  assert.deepEqual(ci(ed), q.ec[0].dose_ci_fieller.map(S));
});

test("one-sample tests, estimation, Deming and ICC", () => {
  const cs = FX.column_statistics.result;
  const rows = rowsOf("column_statistics");
  assert.equal(rows.length, 6);
  const t0 = cs.datasets[0].one_sample_t;
  assert.deepEqual([rows[0].value, rows[0].df, rows[0].p, rows[0].estimateValue], [S(t0.t), "5", P(t0.p_two_tailed), S(t0.discrepancy)]);
  assert.match(rows[0].adjustment, /not adjusted/);
  const e = FX.estimation_two.result.comparisons[0];
  const [re] = rowsOf("estimation_two");
  assert.deepEqual([re.comparison, re.estimateValue, re.p], ["Treated A − Control", S(e.effects[0].difference),
    P(e.effects[0].permutation.p)]);
  assert.deepEqual(ci(re), e.effects[0].ci.map(S));
  const dm = FX.deming.result.datasets[0].fit;
  const [ds, di] = rowsOf("deming");
  assert.deepEqual([ds.estimateValue, di.estimateValue], [S(dm.slope.value), S(dm.y_intercept.value)]);
  const icc = FX.icc.result.forms.find((x: any) => x.form === "ICC2");
  const [ri] = rowsOf("icc");
  assert.deepEqual([ri.estimateValue, ri.value, ri.p], [S(icc.value), S(icc.F), P(icc.p)]);
});

test("ROC and Bland-Altman: the AUC with its CI and P against 0.5; bias and limits of agreement", () => {
  const roc = FX.roc.result;
  const [r] = rowsOf("roc");
  assert.deepEqual([r.estimateValue, r.p], [S(roc.auc.value), P(roc.auc.p_vs_05)]);
  assert.deepEqual(ci(r), roc.auc.ci.map(S));
  const ba = FX.bland_altman.result;
  const [bias, lo, hi] = rowsOf("bland_altman");
  assert.deepEqual([bias.estimateValue, lo.estimateValue, hi.estimateValue],
    [S(ba.bias.value), S(ba.loa_lower.value), S(ba.loa_upper.value)]);
  assert.deepEqual(ci(bias), ba.bias.ci.map(S));
  assert.equal(bias.p, "");
});

test("time-course summaries: one value per subject, compared between groups", () => {
  const c = FX.subject_auc.result.comparison;
  const [row] = rowsOf("subject_auc");
  assert.deepEqual([row.statistic, row.value, row.df, row.p, row.estimateValue],
    ["t", S(c.t), S(c.df), P(c.p), S(c.difference)]);
  assert.equal(row.comparison, "Vehicle − Drug");
});

test("every kind with a mapper is checked above on a native result", () => {
  const tested = new Set(Object.keys(FX).map((k) => statsKind(k === "quantal" ? "quantal" : "column", sheet(k))));
  // the kinds merged after P-66 are checked in kinds.test.ts (kinds-fixtures.json)
  const KINDS = JSON.parse(readFileSync(join(here, "kinds-fixtures.json"), "utf8")) as Record<string, { result: unknown }>;
  for (const c of Object.values(KINDS)) tested.add(statsKind("x", c.result));
  // aliases of a tested mapper
  const alias = new Set(["mixed_rm_twoway", "compare_fits"]); // compare_fits: on its app wrapper in kinds.test.ts
  const missing = STATS_KINDS.filter((k) => !tested.has(k) && !alias.has(k));
  assert.deepEqual(missing, []);
});

test("nothing is dropped: unknown kinds, descriptive analyses, failures and pending results get a row with a note", () => {
  const unknown = statsRows(entry("x", { result: { analysis: "cluster_heatmap" } }));
  assert.equal(unknown.length, 1);
  assert.match(unknown[0].note, /^Not tabulated: no statistics-table mapper for this analysis \(cluster_heatmap\)/);
  const desc = statsRows(entry("x", { result: { analysis: "descriptive" } }));
  assert.match(desc[0].note, /^Descriptive analysis or data manipulation/);
  const failed = statsRows(entry("x", { result: { error: "each group needs at least 2 values" } }));
  assert.equal(failed[0].note, "The analysis failed: each group needs at least 2 values.");
  const pending = statsRows(entry("x", { result: null }));
  assert.match(pending[0].note, /^Not computed yet/);
  const t = statsTable([entry("ttest_unpaired"), entry("x", { sheet: "Heat map", result: { analysis: "cluster_heatmap" } })]);
  assert.equal(t.rows.length, 2);
  assert.deepEqual(t.untabulated, ["Heat map"]);
  assert.equal(t.rows[1].sheet, "Heat map");
});

test("the sheet, data table and figure panel travel with every row", () => {
  const rows = statsRows(entry("anova_tukey", { sheet: "One-way", data: "Weights", panels: ["Figure 1, panel B"] }));
  assert.ok(rows.every((r) => r.sheet === "One-way" && r.data === "Weights" && r.panel === "Figure 1, panel B"));
});

test("CSV, Word and Excel: the same cells", () => {
  const rows = [...rowsOf("ttest_unpaired"), ...rowsOf("anova_tukey")];
  const m = statsMatrix(rows);
  assert.equal(m.length, 1 + rows.length);
  assert.equal(m[0].length, STATS_COLUMNS.length);
  const csv = statsCsv(rows);
  assert.equal(csv.split(/\r?\n/)[0].split(",")[0], "Results sheet");
  assert.ok(csv.includes(",2.290e-4,"));
  const [sec] = statsWordSections(rows);
  assert.equal(sec.headRows, 1);
  assert.equal(sec.rows.length, 1 + rows.length);
  assert.equal(sec.rows[1][5].text, "t = -5.596 (10)");
  assert.equal(sec.rows[1][8].text, "Difference between means (Control − Treated A) -5.2 (95% CI -7.271 to -3.129)");
  const bytes = statsWorkbook(rows, { title: "Test", app: "OpenDose test", date: "2026-11-24T00:00:00.000Z" });
  assert.equal(bytes[0], 0x50); // a zip (xlsx)
  assert.equal(bytes[1], 0x4b);
});
