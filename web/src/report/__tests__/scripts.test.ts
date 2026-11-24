// The export bundle's analysis.py and analysis.R (report/scripts.ts,
// P-67). analysis.py is written for native engine fixtures
// (script-fixtures.json, made by script-fixtures.py) next to the long CSV
// files the bundle writes for their tables, run with Python (SciPy,
// statsmodels), and every number it prints is compared with the engine's
// within the tolerance stated per check. Python comes from $PYTHON, else
// the project's venv; without one that has SciPy and statsmodels the run
// is skipped and says so. analysis.R is checked as text only: R is not
// part of the test environment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toDelimited } from "../../project/exportTable.ts";
import type { DataTableModel } from "../../project/types.ts";
import { longMatrix, tableToLong } from "../../share/tidy.ts";
import { stem } from "../../share/bundle.ts";
import { analysisPy, analysisR, longValues, scriptCoverage, sheetScript, type ScriptEntry } from "../scripts.ts";
import { snippetsFor } from "../snippets.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const here = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(join(here, "script-fixtures.json"), "utf8")) as
  Record<string, { analysisId: string; options: unknown; table: DataTableModel; result: any }>;

const entries: ScriptEntry[] = Object.entries(FX).map(([k, c]) => ({
  sheet: k, analysisId: c.analysisId, options: c.options, result: c.result, table: c.table,
  dataName: `${k} table`, csv: `data/${stem(`${k} table`, "table")}.long.csv`,
}));
const META = { title: "Script fixtures", app: "OpenDose test", date: "2026-11-24T00:00:00.000Z" };

const PY = process.env.PYTHON ?? "/home/eren/opendose/.venv/bin/python";
const hasPython = existsSync(PY) || process.env.PYTHON !== undefined
  ? spawnSync(PY, ["-c", "import numpy, pandas, scipy, statsmodels"]).status === 0 : false;

function runScript(): Record<string, any> {
  const dir = mkdtempSync(join(tmpdir(), "opendose-scripts-"));
  mkdirSync(join(dir, "data"));
  for (const e of entries) {
    writeFileSync(join(dir, e.csv), toDelimited(longMatrix(tableToLong(e.table), { sourceData: true }), "csv"));
  }
  writeFileSync(join(dir, "analysis.py"), analysisPy(entries, META));
  const out = execFileSync(PY, [join(dir, "analysis.py"), "--json"], { cwd: tmpdir(), maxBuffer: 1 << 26,
    env: { ...process.env, PYTHONWARNINGS: "ignore" } }).toString();
  return JSON.parse(out);
}

/** |a − b| within `rel` of |b| (or `abs` near zero). */
function close(label: string, got: unknown, want: number, rel = 1e-6, abs = 1e-12) {
  assert.equal(typeof got, "number", `${label}: no number in the script's output`);
  const g = got as number;
  assert.ok(Math.abs(g - want) <= Math.max(abs, rel * Math.abs(want)),
    `${label}: script ${g} vs engine ${want} (tolerance ${rel} relative)`);
}

test("analysis.py reproduces the engine's numbers on every fixture", { skip: hasPython ? false
  : `no Python with numpy, pandas, SciPy and statsmodels at ${PY} (set PYTHON)` }, () => {
  const out = runScript();
  const r = (k: string) => FX[k].result;
  const o = (k: string) => out[k] ?? out[Object.keys(out).find((x) => x.startsWith(`${k} | `)) ?? ""];
  // t tests: t, df, P and the difference to 1e-9
  for (const k of ["ttest_unpaired", "ttest_welch"]) {
    close(`${k} |t|`, Math.abs(o(k).t), r(k).t, 1e-9);
    close(`${k} df`, o(k).df, r(k).df, 1e-9);
    close(`${k} P`, o(k).p, r(k).p_two_tailed, 1e-9);
    close(`${k} difference`, o(k).difference, r(k).difference, 1e-9);
    close(`${k} CI low`, o(k).ci[0], r(k).ci_difference[0], 1e-9);
  }
  close("paired |t|", Math.abs(o("ttest_paired").t), r("ttest_paired").t, 1e-9);
  close("paired P", o("ttest_paired").p, r("ttest_paired").p_two_tailed, 1e-9);
  close("Mann-Whitney U", o("mann_whitney").U, r("mann_whitney").U, 0, 1e-12);
  close("Mann-Whitney P (exact)", o("mann_whitney").p, r("mann_whitney").p_two_tailed, 1e-9);
  close("Mann-Whitney Hodges-Lehmann", o("mann_whitney").hodges_lehmann, r("mann_whitney").hodges_lehmann_difference, 1e-9);
  close("Wilcoxon P (exact)", o("wilcoxon").p, r("wilcoxon").p_two_tailed, 1e-9);
  close("KS D", o("ks").D, r("ks").D, 1e-12);
  close("KS P", o("ks").p, r("ks").p, 1e-6);
  // one-way ANOVA, Tukey and Dunnett: F and P to 1e-9; the post hoc P to
  // 1e-3 relative (SciPy integrates the studentized range and Dunnett's
  // multivariate t numerically, as the engine does, to about 4 digits)
  close("ANOVA F", o("anova_tukey").F, r("anova_tukey").table.F, 1e-9);
  close("ANOVA P", o("anova_tukey").p, r("anova_tukey").table.p, 1e-9);
  for (const c of r("anova_tukey").multiple_comparisons.comparisons) {
    close(`Tukey ${c.pair}`, o("anova_tukey").tukey_p[c.pair], c.p_adjusted, 1e-3, 1e-6);
  }
  // Dunnett: SciPy's quasi-Monte Carlo P agrees to about 1e-5 absolute
  // (the engine's 6.0594e-5 for Treated A equals a 1e-13 quadrature of the
  // bivariate t; SciPy gives 5.0e-5 to 5.5e-5 depending on its seed)
  r("anova_dunnett").multiple_comparisons.comparisons.forEach((c: any, i: number) => {
    close(`Dunnett ${c.pair}`, o("anova_dunnett").dunnett_p[i], c.p_adjusted, 0, 2e-5);
  });
  // custom contrasts (P-83): estimate, SE and t to 1e-9; P planned from t,
  // post hoc from Scheffe's F, to 1e-9
  for (const c of r("anova_contrasts").custom_contrasts.contrasts) {
    const got = o("anova_contrasts").contrasts[`${c.name} (${c.planned ? "planned" : "post hoc"})`];
    close(`contrast ${c.name} estimate`, got?.estimate, c.estimate, 1e-9);
    close(`contrast ${c.name} SE`, got?.se, c.se, 1e-9);
    close(`contrast ${c.name} t`, got?.t, c.t, 1e-9);
    close(`contrast ${c.name} P (${c.kind})`, got?.p, c.p, 1e-9);
  }
  close("Kruskal-Wallis H", o("kruskal").H, r("kruskal").H, 1e-9);
  close("Kruskal-Wallis P", o("kruskal").p, r("kruskal").p, 1e-9);
  close("Welch F", o("welch_anova").welch_F, r("welch_anova").welch.W, 1e-9);
  close("Welch P", o("welch_anova").welch_p, r("welch_anova").welch.p, 1e-6);
  close("Brown-Forsythe F*", o("welch_anova").bf_F, r("welch_anova").brown_forsythe.F, 1e-9);
  close("RM ANOVA F", o("rm_anova").F, r("rm_anova").table.F, 1e-9);
  close("RM ANOVA P (sphericity assumed)", o("rm_anova").p_sphericity_assumed, r("rm_anova").table.p_assuming_sphericity, 1e-6);
  close("Friedman statistic", o("friedman").statistic, r("friedman").statistic, 1e-9);
  close("Pearson r", o("correlation").r, r("correlation").r, 1e-12);
  close("Pearson P", o("correlation").p, r("correlation").p_two_tailed, 1e-9);
  close("Spearman r", o("spearman").r, r("spearman").r, 1e-12);
  close("one-sample t", o("column_statistics").t, r("column_statistics").datasets[0].one_sample_t.t, 1e-9);
  // two-way ANOVA (type III): F to 1e-9
  const tw = r("two_way").sources;
  close("two-way F rows", o("two_way").F_rows, tw.Day.F, 1e-9);
  close("two-way F columns", o("two_way").F_columns, tw.Treatment.F, 1e-9);
  close("two-way F interaction", o("two_way").F_interaction, tw.interaction.F, 1e-9);
  // contingency
  close("chi-square", o("contingency_2x2").chi2, r("contingency_2x2").chi_square.chi2, 1e-12);
  close("Fisher P", o("contingency_2x2").fisher_p, r("contingency_2x2").fisher_exact.p, 1e-9);
  close("chi-square 2 x 3", o("contingency_2x3").chi2, r("contingency_2x3").chi_square.chi2, 1e-12);
  close("McNemar exact P", o("mcnemar").p_exact, r("mcnemar").binomial.p_two_tailed, 1e-9);
  close("kappa", o("kappa").kappa, r("kappa").kappa, 1e-12);
  // log-rank: SciPy's statistic is the variance form (chi2_variance)
  close("log-rank chi-square (variance form)", o("survival").chi2, r("survival").logrank.chi2_variance, 1e-9);
  close("log-rank P (variance form)", o("survival").p, r("survival").logrank.p_variance, 1e-9);
  // 4PL: curve_fit (Levenberg-Marquardt) against the engine's fit, to 1e-4
  // relative on the parameters and 1e-3 on the CI limits
  const fit = r("dose_response").datasets[0].fit.params;
  const dr = o("dose_response");
  close("4PL LogIC50", dr.LogIC50, fit.LogIC50.value, 1e-4);
  close("4PL IC50", dr.IC50, fit.IC50.value, 1e-3);
  close("4PL HillSlope", dr.HillSlope, fit.HillSlope.value, 1e-3);
  close("4PL Top", dr.Top, fit.Top.value, 1e-4);
  close("4PL Bottom", dr.Bottom, fit.Bottom.value, 1e-2, 1e-3);
  close("4PL LogIC50 CI low", dr.LogIC50_ci[0], fit.LogIC50.ci95[0], 1e-3);
  close("4PL LogIC50 CI high", dr.LogIC50_ci[1], fit.LogIC50.ci95[1], 1e-3);
  const lr = r("linear_regression").datasets[0].fit;
  close("linear regression slope", o("linear_regression").slope, lr.slope.value, 1e-12);
  close("linear regression P", o("linear_regression").p, lr.f_nonzero_slope.p, 1e-9);
  // regression models: every coefficient (statsmodels) to 1e-6, P to 1e-5
  const coef = (k: string, name: string) => r(k).coefficients.find((c: any) => c.name === name);
  const mr = o("multiple_regression");
  close("multiple regression Dose", mr["coef Q(\"Dose\")"], coef("multiple_regression", "Dose").estimate, 1e-9);
  close("multiple regression Sex[M]", mr["coef C(Q(\"Sex\"))[T.M]"], coef("multiple_regression", "Sex[M]").estimate, 1e-9);
  const lg = o("logistic");
  close("logistic Dose", lg["coef Q(\"Dose\")"], coef("logistic", "Dose").estimate, 1e-5);
  close("logistic P Dose (Wald)", lg["p Q(\"Dose\")"], coef("logistic", "Dose").p, 1e-4);
  const key = "C(Q(\"Treatment\"))[T.Mutagen]";
  close("Poisson Mutagen", o("poisson")[`coef ${key}`], coef("poisson", "Treatment[Mutagen]").estimate, 1e-7);
  close("Poisson P", o("poisson")[`p ${key}`], coef("poisson", "Treatment[Mutagen]").p, 1e-5);
  close("quasi-Poisson Mutagen", o("poisson_quasi")[`coef ${key}`], coef("poisson_quasi", "Treatment[Mutagen]").estimate, 1e-7);
  close("negative binomial Mutagen", o("negbin")[`coef ${key}`], coef("negbin", "Treatment[Mutagen]").estimate, 1e-4);
  close("binomial High", o("binomial")["coef C(Q(\"Dose\"))[T.High]"],
    coef("binomial", "Dose[High]").estimate, 1e-7);
  const cx = o("cox");
  close("Cox HR Group[Treated]", cx["hazard ratio C(Q(\"Group\"))[T.Treated]"],
    coef("cox", "Group[Treated]").hazard_ratio, 1e-5);
  close("Cox HR Age", cx["hazard ratio Q(\"Age\")"], coef("cox", "Age").hazard_ratio, 1e-5);
  close("Cox P Age", cx["p Q(\"Age\")"], coef("cox", "Age").p, 1e-4);
  // nested t: the REML difference of the group means
  close("nested difference", o("nested_t")["coef Group[T.Diet A]"], r("nested_t").difference, 1e-5);
  // mixed models: the REML fixed effects (statsmodels mixedlm) to 1e-5
  const mg = r("mixed_grouping").cell_means;
  close("grouping-column model: Drug − Vehicle", o("mixed_grouping")["coef C(Q(\"Treatment\"))[T.Drug]"],
    mg.find((c: any) => c.a === "Drug").mean - mg.find((c: any) => c.a === "Vehicle").mean, 1e-5);
  close("grouping-column model: dish variance", o("mixed_grouping").unit_variance,
    r("mixed_grouping").variance_components.unit.variance, 1e-4);
  const em = r("mixed_rm_one_way").estimated_means;
  close("mixed-model RM: Treated A − Control", o("mixed_rm_one_way")["coef condition[T.Treated A]"],
    em[1].mean - em[0].mean, 1e-5);
  close("Bland-Altman bias", o("bland_altman").bias, r("bland_altman").bias.value, 1e-12);
  close("ROC AUC", o("roc").auc, r("roc").auc.value, 1e-12);
});

test("every fixture is re-run with a call, not only a comment", () => {
  const cov = scriptCoverage(entries);
  assert.deepEqual(cov.commented, []);
});

test("caveats are comments, never pretend: weighting, Tukey, ROUT-style options say so", () => {
  const py = analysisPy(entries, META);
  assert.match(py, /^# analysis\.py: the analyses of “Script fixtures”/);
  assert.match(py, /# Caveat: SciPy's log-rank statistic \(squared here\) is the variance form/);
  assert.match(py, /# Caveat: statsmodels' AnovaRM assumes sphericity/);
  // an analysis with no standard call: a comment, and no code for it
  const odd: ScriptEntry = { ...entries[0], sheet: "Heat map", analysisId: "cluster",
    result: { analysis: "cluster_heatmap" } };
  const p2 = analysisPy([odd], META);
  assert.match(p2, /# No standard call is written for this analysis \(cluster_heatmap\)/);
  assert.doesNotMatch(p2, /SHEET = "Heat map"/);
  // a weighted fit with ROUT is fitted unweighted here, and says so
  const dr = entries.find((e) => e.sheet === "dose_response")!;
  const res = JSON.parse(JSON.stringify(dr.result));
  res.datasets[0].fit.weighting = "1/Y^2";
  res.datasets[0].rout = { q: 0.01, n_outliers: 1, outliers: [] };
  const weighted = analysisPy([{ ...dr, result: res }], META);
  assert.match(weighted, /# Caveat: "Drug A" was fitted with weighting \(1\/Y\^2\); this fit is unweighted\./);
  assert.match(weighted, /# Caveat: "Drug A": OpenDose removed 1 outlier\(s\) by ROUT \(Q = 0\.01\)\. ROUT \(Motulsky & Brown 2006\) has no standard call/);
  const failed = analysisPy([{ ...entries[0], result: { error: "each group needs at least 2 values" } }], META);
  assert.match(failed, /# This analysis failed in OpenDose/);
});

test("analysis.R (text only: R is not installed here) reads the same CSVs with balanced calls", () => {
  const r = analysisR(entries, META);
  assert.match(r, /^# analysis\.R: the analyses of “Script fixtures”/m);
  assert.match(r, /load_table <- function\(name\)/);
  assert.match(r, /d <- load_table\("ttest-unpaired-table\.long\.csv"\)\nw?a? ?<?-? ?/);
  assert.match(r, /print\(t\.test\(a, b, var\.equal = TRUE\)\)/);
  assert.match(r, /print\(TukeyHSD\(fit\)\)/);
  assert.match(r, /drc::drm\(y ~ dose, data = s, fct = drc::LL\.4/);
  assert.match(r, /coxph\(Surv\(as\.numeric\(`Time`\), `Event` == "1"\) ~ `Group` \+ `Age`/);
  assert.match(r, /family = quasipoisson/);
  // every call's brackets and quotes balance
  for (const line of r.split("\n").filter((l) => l && !l.startsWith("#"))) {
    const code = line.replace(/"(?:[^"\\]|\\.)*"/g, "\"\"").replace(/#.*$/, "");
    assert.equal((code.match(/"/g) ?? []).length % 2, 0, `quotes in: ${line}`);
  }
  const open = (s: string, a: string, b: string) => s.split(a).length - s.split(b).length;
  const code = r.split("\n").filter((l) => !l.startsWith("#")).join("\n").replace(/"(?:[^"\\]|\\.)*"/g, "\"\"");
  assert.equal(open(code, "(", ")"), 0, "parentheses balance");
  assert.equal(open(code, "{", "}"), 0, "braces balance");
  assert.equal(open(code, "[", "]"), 0, "brackets balance");
});

test("snippets of regression, logistic, Cox, ROC, Bland-Altman and mixed models carry the table's values", () => {
  for (const [k, call] of [["logistic", /smf\.logit\(/], ["poisson", /family=sm\.families\.Poisson\(\)/],
    ["cox", /smf\.phreg\(/], ["roc", /mannwhitneyu/], ["bland_altman", /bias, sd = /],
    ["mixed_grouping", /smf\.mixedlm\(/], ["multiple_regression", /smf\.ols\(/]] as [string, RegExp][]) {
    const s = snippetsFor(FX[k].result, FX[k].options, FX[k].table);
    assert.match(s.python, call, k);
    assert.match(s.python, /^d = pd\.DataFrame\(\{$/m, `${k}: the values are in the code`);
    assert.doesNotMatch(s.python, /load\("/, k);
    assert.match(s.r, /^d <- data\.frame\($/m, k);
  }
  const lg = snippetsFor(FX.logistic.result, FX.logistic.options, FX.logistic.table);
  assert.ok(lg.caveats.some((c) => /profile likelihood/.test(c)));
});

test("Copy whole script: one sheet, helpers and values included, runs on its own", { skip: hasPython ? false
  : `no Python with SciPy and statsmodels at ${PY}` }, () => {
  const e = entries.find((x) => x.sheet === "ttest_unpaired")!;
  const py = sheetScript(e, "py", longValues(e.table), META);
  assert.match(py, /^# “ttest_unpaired” of “Script fixtures”, re-run with the closest standard call/);
  const dir = mkdtempSync(join(tmpdir(), "opendose-sheet-"));
  writeFileSync(join(dir, "s.py"), py);
  const out = JSON.parse(execFileSync(PY, [join(dir, "s.py"), "--json"]).toString());
  close("whole script t", Math.abs(out.ttest_unpaired.t), FX.ttest_unpaired.result.t, 1e-9);
});
