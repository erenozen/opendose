"""Wave 2 engine support: log-scale t tests and ANOVA (logscale), the
scale check, interaction contrasts and simple effects after two-way
ANOVA (twoway_contrasts), post tests after RM one-way ANOVA
(rm_posthoc), comparing one parameter between two curves
(compare_params), flow summaries (flow) and the qPCR reference-gene
wiring (qpcr_refs, validated in test_qpcr_refs.py).

Independent implementations: scipy.stats (t tests, F, studentized
range), statsmodels (OLS contrasts, Tukey HSD, CompareMeans), pingouin
(paired post tests, Geisser-Greenhouse epsilon), scipy.optimize
.curve_fit (curve fits), the REML mixed model of opendose.mixedmodel
(complete data reproduce RM ANOVA), and the GraphPad statistics guide's
ratio t test example. No R is installed here, so no R output is pasted.
"""

import json
import math
from itertools import combinations

import numpy as np
import pytest
from scipy import optimize, stats

from opendose import compare_params, flow, logscale, mixedmodel, rm_posthoc
from opendose.api import analyze, analyze_json


def _cols(*groups, names=None):
    names = names or [f"G{i + 1}" for i in range(len(groups))]
    return {"datasets": [{"name": n, "ys": [[v] for v in g]}
                         for n, g in zip(names, groups)]}


# ------------------------------------------------------------ 1. log scale

CYT_A = [12.1, 30.5, 8.2, 55.0, 19.7, 24.3, 41.8]
CYT_B = [48.0, 150.2, 77.5, 210.9, 95.1, 61.3]
CYT_C = [300.0, 520.4, 180.2, 910.0, 405.5]


@pytest.mark.parametrize("welch", [False, True])
def test_log_ttest_equals_scipy_on_log10(welch):
    r = analyze({"analysis": "ttest", "data": _cols(CYT_A, CYT_B),
                 "options": {"log_scale": True, "welch": welch}})
    assert "error" not in r, r.get("error")
    la, lb = np.log10(CYT_A), np.log10(CYT_B)
    ref = stats.ttest_ind(la, lb, equal_var=not welch)
    assert r["t"] == pytest.approx(abs(ref.statistic), rel=1e-10)
    assert r["p_two_tailed"] == pytest.approx(ref.pvalue, rel=1e-9)
    assert r["difference"] == pytest.approx(la.mean() - lb.mean(), rel=1e-12)
    # ratio of geometric means and its CI: the antilog of the CI of the
    # difference of mean logs (statsmodels CompareMeans, independent code)
    sm = pytest.importorskip("statsmodels.stats.weightstats")
    cm = sm.CompareMeans(sm.DescrStatsW(la), sm.DescrStatsW(lb))
    lo, hi = cm.tconfint_diff(alpha=0.05,
                              usevar="unequal" if welch else "pooled")
    assert r["ratio"] == pytest.approx(
        stats.gmean(CYT_A) / stats.gmean(CYT_B), rel=1e-10)
    assert r["ratio_ci"][0] == pytest.approx(10 ** lo, rel=1e-9)
    assert r["ratio_ci"][1] == pytest.approx(10 ** hi, rel=1e-9)
    gm = r["geometric_means"]
    assert gm[0]["geometric_mean"] == pytest.approx(stats.gmean(CYT_A))
    tci = stats.t.interval(0.95, la.size - 1, la.mean(), stats.sem(la))
    assert gm[0]["ci"] == pytest.approx([10 ** tci[0], 10 ** tci[1]])
    assert r["log_scale"]["base"] == "log10"
    assert r["log_scale"]["n_dropped"] == 0
    # values to display precision (fixed literals, computed once above)
    assert round(r["ratio"], 4) == round(
        10 ** (la.mean() - lb.mean()), 4)


def test_log_ttest_natural_log_same_p_and_ratio():
    r10 = analyze({"analysis": "ttest", "data": _cols(CYT_A, CYT_B),
                   "options": {"log_scale": True}})
    rln = analyze({"analysis": "ttest", "data": _cols(CYT_A, CYT_B),
                   "options": {"log_scale": True, "log_base": "ln"}})
    assert rln["p_two_tailed"] == pytest.approx(r10["p_two_tailed"],
                                                rel=1e-10)
    assert rln["ratio"] == pytest.approx(r10["ratio"], rel=1e-10)
    assert rln["difference"] == pytest.approx(
        r10["difference"] * math.log(10), rel=1e-10)


def test_log_paired_reuses_ratio_t_guide_example():
    # statistics guide, "Interpreting results: Ratio t test": treated /
    # control Km 8.7/4.2, 4.9/2.5, 13.1/6.5 -> geometric mean ratio 2.02,
    # 95% CI 1.88 to 2.16, P = 0.0005
    d = _cols([8.7, 4.9, 13.1], [4.2, 2.5, 6.5], names=["Treated",
                                                        "Control"])
    r = analyze({"analysis": "ttest", "data": d,
                 "options": {"kind": "paired", "log_scale": True}})
    assert round(r["ratio"], 2) == 2.02
    assert [round(v, 2) for v in r["ratio_ci"]] == [1.88, 2.16]
    assert round(r["p_two_tailed"], 4) == 0.0005
    ratio_t = analyze({"analysis": "ttest", "data": d,
                       "options": {"kind": "ratio_paired"}})
    assert r["ratio"] == pytest.approx(ratio_t["geometric_mean_ratio"])
    assert r["ratio_ci"] == pytest.approx(ratio_t["ci_ratio"])
    assert r["p_two_tailed"] == pytest.approx(ratio_t["p_two_tailed"])
    assert r["geometric_mean_ratio"] == r["ratio"]


def test_log_scale_drops_nonpositive_with_warning():
    r = analyze({"analysis": "ttest",
                 "data": _cols(CYT_A + [0.0, -3.0], CYT_B),
                 "options": {"log_scale": True}})
    assert r["log_scale"]["values_dropped"] == {"G1": 2, "G2": 0}
    assert any("2 values <= 0" in w for w in r["warnings"])
    ref = stats.ttest_ind(np.log10(CYT_A), np.log10(CYT_B))
    assert r["p_two_tailed"] == pytest.approx(ref.pvalue, rel=1e-9)
    # paired: the whole pair goes
    rp = analyze({"analysis": "ttest",
                  "data": _cols([1.0, 2.0, 0.0, 4.0], [2.0, 3.0, 1.0, 9.0]),
                  "options": {"kind": "paired", "log_scale": True}})
    assert rp["log_scale"]["pairs_dropped"] == 1
    assert rp["n_pairs"] == 3


def test_log_scale_ignored_for_rank_tests_with_warning():
    r = analyze({"analysis": "ttest", "data": _cols(CYT_A, CYT_B),
                 "options": {"kind": "mann_whitney", "log_scale": True}})
    plain = analyze({"analysis": "ttest", "data": _cols(CYT_A, CYT_B),
                     "options": {"kind": "mann_whitney"}})
    assert r["p_two_tailed"] == plain["p_two_tailed"]
    assert any("log_scale ignored" in w for w in r["warnings"])


def test_log_anova_with_tukey_ratios_matches_statsmodels():
    r = analyze({"analysis": "anova", "data": _cols(CYT_A, CYT_B, CYT_C),
                 "options": {"log_scale": True, "comparisons": "tukey"}})
    assert "error" not in r, r.get("error")
    logs = [np.log10(g) for g in (CYT_A, CYT_B, CYT_C)]
    f = stats.f_oneway(*logs)
    assert r["table"]["F"] == pytest.approx(f.statistic, rel=1e-9)
    assert r["table"]["p"] == pytest.approx(f.pvalue, rel=1e-8)
    mc = pytest.importorskip("statsmodels.stats.multicomp")
    endog = np.concatenate(logs)
    labels = np.repeat(["G1", "G2", "G3"], [len(g) for g in logs])
    hsd = mc.pairwise_tukeyhsd(endog, labels)
    for c, (i, j), md, ci, p in zip(
            r["multiple_comparisons"]["comparisons"],
            combinations(range(3), 2), hsd.meandiffs, hsd.confint,
            hsd.pvalues):
        # statsmodels: mean(j) - mean(i); OpenDose "Gi vs. Gj": i - j
        assert c["difference"] == pytest.approx(-md, rel=1e-9)
        assert c["ratio"] == pytest.approx(10 ** -md, rel=1e-9)
        assert c["ratio_ci"][0] == pytest.approx(10 ** -ci[1], rel=1e-5)
        assert c["ratio_ci"][1] == pytest.approx(10 ** -ci[0], rel=1e-5)
        assert c["p_adjusted"] == pytest.approx(p, abs=1e-3)
        assert c["ratio_label"].endswith(f"(G{i + 1} / G{j + 1})")
    assert [g["geometric_mean"] for g in r["geometric_means"]] == \
        pytest.approx([stats.gmean(g) for g in (CYT_A, CYT_B, CYT_C)])


def test_log_anova_dunnett_ratio_vs_control_and_holm_no_ci():
    r = analyze({"analysis": "anova", "data": _cols(CYT_A, CYT_B, CYT_C),
                 "options": {"log_scale": True, "comparisons": "dunnett"}})
    c = r["multiple_comparisons"]["comparisons"][0]   # G2 vs. G1
    assert c["ratio"] == pytest.approx(stats.gmean(CYT_B) / stats.gmean(CYT_A))
    r = analyze({"analysis": "anova", "data": _cols(CYT_A, CYT_B, CYT_C),
                 "options": {"log_scale": True, "comparisons": "holm"}})
    assert all(c["ratio_ci"] is None
               for c in r["multiple_comparisons"]["comparisons"])


def test_scale_check_rules():
    # SD proportional to the mean across 4 groups -> suggest logs
    base = np.array([0.8, 1.0, 1.25, 0.9, 1.1])
    groups = [list(m * base) for m in (2.0, 10.0, 40.0, 150.0)]
    r = analyze({"analysis": "scale_check", "data": _cols(*groups)})
    assert r["suggest_log"] is True
    assert r["pearson_r_sd_mean"] == pytest.approx(1.0, abs=1e-9)
    sds = [np.std(g, ddof=1) for g in groups]
    assert r["sd_ratio_max_min"] == pytest.approx(max(sds) / min(sds))
    assert r["text"]
    # equal SDs -> no suggestion
    flat = [list(m + base) for m in (2.0, 10.0, 40.0, 150.0)]
    r = analyze({"analysis": "scale_check", "data": _cols(*flat)})
    assert r["suggest_log"] is False
    # two groups: larger SD (> 3x) with the larger mean
    r = logscale.scale_check([list(5 * base), list(80 * base)])
    assert r["suggest_log"] is True and r["sd_ratio_max_min"] == \
        pytest.approx(16.0)
    r = logscale.scale_check([list(5 * base), list(80 + 2 * base)])
    assert r["suggest_log"] is False
    # a zero value: logs undefined, no suggestion
    r = logscale.scale_check([[0.0] + list(5 * base), list(80 * base)])
    assert r["suggest_log"] is False and r["all_positive"] is False


def test_scale_check_block_on_ttest_and_anova():
    r = analyze({"analysis": "ttest", "data": _cols(CYT_A, CYT_B)})
    assert "suggest_log" in r["scale_check"]
    r = analyze({"analysis": "anova", "data": _cols(CYT_A, CYT_B, CYT_C)})
    assert r["scale_check"]["suggest_log"] is True


# ------------------------------------------------- 2. interaction contrasts

def _grouped(cells, names=("Vehicle", "Drug")):
    # cells[row][col]
    return {"datasets": [{"name": nm,
                          "ys": [cells[r][j] for r in range(len(cells))]}
                         for j, nm in enumerate(names)]}


CELLS_2X2 = [[[10.1, 11.3, 9.4, 12.0], [14.2, 15.1, 13.0, 16.4]],
             [[11.0, 10.2, 13.1, 12.5, 11.7], [20.3, 22.0, 19.1, 21.4]]]


def _ols_cells(cells):
    sm = pytest.importorskip("statsmodels.api")
    a, b = len(cells), len(cells[0])
    y, X = [], []
    for i in range(a):
        for j in range(b):
            for v in cells[i][j]:
                y.append(v)
                row = np.zeros(a * b)
                row[i * b + j] = 1.0
                X.append(row)
    return sm.OLS(np.array(y), np.array(X)).fit(), a, b


def test_two_by_two_difference_of_differences_is_the_interaction():
    r = analyze({"analysis": "two_way_anova", "data": _grouped(CELLS_2X2),
                 "options": {"row_names": ["WT", "KO"]}})
    ic = r["interaction_contrasts"]
    c = ic["contrasts"][0]
    inter = r["sources"]["interaction"]
    assert c["p"] == pytest.approx(inter["p"], rel=1e-8)
    assert c["t"] ** 2 == pytest.approx(inter["F"], rel=1e-9)
    assert c["equals_interaction_test"] is True
    assert c["rows"] == ["WT", "KO"] and c["cols"] == ["Vehicle", "Drug"]
    # cell-means OLS contrast m22 - m12 - m21 + m11 (statsmodels)
    fit, a, b = _ols_cells(CELLS_2X2)
    tt = fit.t_test(np.array([[1.0, -1.0, -1.0, 1.0]]))
    assert c["difference"] == pytest.approx(float(tt.effect[0]), rel=1e-10)
    assert c["se"] == pytest.approx(float(tt.sd[0, 0]), rel=1e-9)
    assert c["ci"] == pytest.approx(list(tt.conf_int()[0]), rel=1e-9)
    assert c["df"] == fit.df_resid
    m = [[np.mean(cell) for cell in row] for row in CELLS_2X2]
    assert c["effect_in_col_1"] == pytest.approx(m[1][0] - m[0][0])
    assert c["effect_in_col_2"] == pytest.approx(m[1][1] - m[0][1])
    assert ic["explainer"]


def test_simple_effects_against_statsmodels():
    cells = [CELLS_2X2[0] + [[12.2, 13.0, 11.1]],
             CELLS_2X2[1] + [[25.0, 24.1, 27.3, 26.0]]]   # 2 rows x 3 cols
    r = analyze({"analysis": "two_way_anova",
                 "data": _grouped(cells, ("Veh", "Low", "High"))})
    fit, a, b = _ols_cells(cells)
    se_rows = r["simple_effects"]
    assert [s["within"] for s in se_rows] == ["Row 1", "Row 2"]
    for i, block in enumerate(se_rows):
        L = np.zeros((2, 6))
        L[0, i * 3 + 1], L[0, i * 3] = 1, -1
        L[1, i * 3 + 2], L[1, i * 3] = 1, -1
        ft = fit.f_test(L)
        assert block["F"] == pytest.approx(float(ft.fvalue), rel=1e-9)
        assert block["p"] == pytest.approx(float(ft.pvalue), rel=1e-8)
        d = block["differences"][0]          # Low - Veh
        tt = fit.t_test(L[:1])
        assert d["difference"] == pytest.approx(float(tt.effect[0]))
        assert d["ci"] == pytest.approx(list(tt.conf_int()[0]), rel=1e-9)
        assert d["p"] == pytest.approx(float(tt.pvalue), rel=1e-8)
        assert d["p_label"] == "unadjusted"
    # three 2 x 2 sub-squares (column pairs) with one row pair
    ic = r["interaction_contrasts"]
    assert ic["n_contrasts"] == 3
    for c in ic["contrasts"]:
        j1, j2 = c["col_indices"]
        L = np.zeros((1, 6))
        L[0, 3 + j2], L[0, j2], L[0, 3 + j1], L[0, j1] = 1, -1, -1, 1
        tt = fit.t_test(L)
        assert c["difference"] == pytest.approx(float(tt.effect[0]))
        assert c["p"] == pytest.approx(float(tt.pvalue), rel=1e-8)
    assert len(r["simple_effects_rows_within_columns"]) == 3


def test_interaction_contrasts_withheld_without_replicates():
    cells = [[[1.0], [2.0]], [[3.0], [5.0]], [[2.0], [2.5]]]
    r = analyze({"analysis": "two_way_anova", "data": _grouped(cells)})
    assert r["interaction_contrasts"]["withheld"] is True
    assert r["simple_effects"] is None
    assert r["interaction_contrasts"]["notes"]


def test_interaction_contrasts_can_be_switched_off_and_restricted():
    r = analyze({"analysis": "two_way_anova", "data": _grouped(CELLS_2X2),
                 "options": {"interaction_contrasts": False}})
    assert "interaction_contrasts" not in r
    cells = [CELLS_2X2[0] + [[12.2, 13.0, 11.1]],
             CELLS_2X2[1] + [[25.0, 24.1, 27.3, 26.0]]]
    r = analyze({"analysis": "two_way_anova",
                 "data": _grouped(cells, ("Veh", "Low", "High")),
                 "options": {"interaction_cols": [0, 2]}})
    assert r["interaction_contrasts"]["n_contrasts"] == 1
    assert r["interaction_contrasts"]["contrasts"][0]["cols"] == \
        ["Veh", "High"]


# ------------------------------------------------- 5. RM post hoc tests

RM = [[10.0, 12.0, 9.0, 14.0, 11.0, 13.0],
      [12.0, 15.0, 10.0, 17.0, 12.0, 16.0],
      [15.0, 17.0, 13.0, 20.0, 14.0, 18.0],
      [11.0, 14.0, 11.0, 16.0, 12.0, 15.0]]
RM_NAMES = ["Baseline", "Day 7", "Day 14", "Day 21"]


def _rm_ms_error():
    M = np.array(RM).T
    n, k = M.shape
    resid = M - M.mean(axis=0) - M.mean(axis=1, keepdims=True) + M.mean()
    return float((resid ** 2).sum() / ((n - 1) * (k - 1))), n, k


def test_rm_pooled_tukey_against_hand_q():
    r = analyze({"analysis": "rm_anova", "data": _cols(*RM, names=RM_NAMES),
                 "options": {"comparisons": "tukey"}})
    assert "error" not in r, r.get("error")
    comp = r["comparisons"]
    mse, n, k = _rm_ms_error()
    assert comp["ms_error"] == pytest.approx(mse, rel=1e-10)
    assert comp["df"] == (n - 1) * (k - 1) == 15
    means = np.array(RM).mean(axis=1)
    for c, (i, j) in zip(comp["comparisons"], combinations(range(k), 2)):
        q = abs(means[i] - means[j]) / math.sqrt(mse / n)
        assert c["q"] == pytest.approx(q, rel=1e-10)
        assert c["p_adjusted"] == pytest.approx(
            stats.studentized_range.sf(q, k, 15), abs=2e-6)
        qcrit = stats.studentized_range.ppf(0.95, k, 15)
        half = qcrit * math.sqrt(mse / n)
        assert c["ci"] == pytest.approx(
            [means[i] - means[j] - half, means[i] - means[j] + half],
            rel=1e-5)
    assert comp["error"] == "pooled"
    assert comp["family"]["size"] == 6


def test_rm_pooled_dunnett_vs_baseline_equals_mixed_model():
    r = analyze({"analysis": "rm_anova", "data": _cols(*RM, names=RM_NAMES),
                 "options": {"comparisons": {"method": "dunnett",
                                             "control": 0}}})
    comp = r["comparisons"]["comparisons"]
    assert [c["pair"] for c in comp] == ["Day 7 vs. Baseline",
                                         "Day 14 vs. Baseline",
                                         "Day 21 vs. Baseline"]
    # complete data: REML mixed model (compound symmetry) = RM ANOVA
    mm = mixedmodel.mixed_rm_one_way(RM, RM_NAMES, comparisons="dunnett")
    for c, m in zip(comp, mm["multiple_comparisons"]["comparisons"]):
        assert c["difference"] == pytest.approx(-m["difference"], rel=1e-6)
        assert c["se"] == pytest.approx(m["se"], rel=1e-6)
        assert c["p_adjusted"] == pytest.approx(m["p_adjusted"], rel=1e-4)
        assert c["ci"][1] == pytest.approx(-m["ci"][0], rel=1e-6)


def test_rm_pooled_bonferroni_by_hand():
    r = analyze({"analysis": "rm_anova", "data": _cols(*RM, names=RM_NAMES),
                 "options": {"comparisons": "bonferroni"}})
    mse, n, k = _rm_ms_error()
    means = np.array(RM).mean(axis=1)
    for c, (i, j) in zip(r["comparisons"]["comparisons"],
                         combinations(range(k), 2)):
        t = abs(means[i] - means[j]) / math.sqrt(2 * mse / n)
        assert c["p_adjusted"] == pytest.approx(
            min(1.0, 6 * 2 * stats.t.sf(t, 15)), rel=1e-9)


@pytest.mark.parametrize("padjust,method", [("bonf", "bonferroni"),
                                            ("holm", "holm"),
                                            ("none", "fisher_lsd")])
def test_rm_per_pair_matches_pingouin(padjust, method):
    pg = pytest.importorskip("pingouin")
    pd = pytest.importorskip("pandas")
    rows = [{"subj": s, "time": RM_NAMES[t], "y": RM[t][s]}
            for t in range(4) for s in range(6)]
    df = pd.DataFrame(rows)
    ref = pg.pairwise_tests(data=df, dv="y", within="time", subject="subj",
                            padjust=padjust)
    r = analyze({"analysis": "rm_anova", "data": _cols(*RM, names=RM_NAMES),
                 "options": {"comparisons": {"method": method,
                                             "error": "per_pair"}}})
    comps = {frozenset(c["pair"].split(" vs. ")): c
             for c in r["comparisons"]["comparisons"]}
    assert len(comps) == 6
    for _, row in ref.iterrows():
        c = comps[frozenset((row["A"], row["B"]))]
        assert c["t"] == pytest.approx(abs(row["T"]), rel=1e-9)
        assert c["df"] == 5
        cols = {k.replace("-", "_"): k for k in row.index}
        p_ref = row[cols["p_corr"]] if padjust != "none" \
            else row[cols["p_unc"]]
        assert c["p_adjusted"] == pytest.approx(p_ref, rel=1e-8)


def test_rm_gg_df_option_uses_pingouin_epsilon():
    pg = pytest.importorskip("pingouin")
    pd = pytest.importorskip("pandas")
    df = pd.DataFrame([{"subj": s, "time": RM_NAMES[t], "y": RM[t][s]}
                       for t in range(4) for s in range(6)])
    eps = pg.epsilon(df, dv="y", within="time", subject="subj",
                     correction="gg")
    r = analyze({"analysis": "rm_anova", "data": _cols(*RM, names=RM_NAMES),
                 "options": {"comparisons": {"method": "sidak",
                                             "pooled_df": "gg"}}})
    assert r["comparisons"]["df"] == pytest.approx(15 * eps, rel=1e-8)
    assert r["comparisons"]["gg_epsilon"] == pytest.approx(eps, rel=1e-8)


def test_rm_per_pair_tukey_and_dunnett_are_labelled():
    for m in ("tukey", "dunnett"):
        r = rm_posthoc.rm_comparisons(RM, RM_NAMES, m, error="per_pair")
        assert any("approximation" in note for note in r["notes"])
        assert all(c["df"] == 5 for c in r["comparisons"])
    r = rm_posthoc.rm_comparisons(RM, RM_NAMES, "tukey", error="per_pair")
    M = np.array(RM).T
    d = M[:, 0] - M[:, 1]
    t = abs(d.mean()) / (d.std(ddof=1) / math.sqrt(6))
    assert r["comparisons"][0]["q"] == pytest.approx(t * math.sqrt(2))
    assert r["comparisons"][0]["p_adjusted"] == pytest.approx(
        stats.studentized_range.sf(t * math.sqrt(2), 4, 5), abs=2e-6)


def test_rm_planned_family_and_missing_rows():
    data = _cols(*[col + [None] for col in RM], names=RM_NAMES)
    data["datasets"][0]["ys"][-1] = [99.0]   # incomplete subject row
    r = analyze({"analysis": "rm_anova", "data": data,
                 "options": {"comparisons": {
                     "method": "holm_sidak", "family": "pairs",
                     "pairs": [[1, 0], [2, 0]]}}})
    assert r["comparisons"]["family"]["size"] == 2
    assert r["comparisons"]["n_subjects"] == 6
    assert r["incomplete_subjects"] == [6]
    nonpar = analyze({"analysis": "rm_anova",
                      "data": _cols(*RM, names=RM_NAMES),
                      "options": {"kind": "nonparametric"}})
    assert "comparisons" not in nonpar


# ------------------------------------------ 3. compare one curve parameter

X = [-9.0, -8.5, -8.0, -7.5, -7.0, -6.5, -6.0, -5.5, -5.0]
NOISE = np.random.default_rng(20261009).normal(0.0, 4.0, (2, 9, 3))


def _curve(logec, slope=1.0, which=0):
    return [[float(2.0 + 98.0 / (1 + 10 ** ((logec - x) * slope))
                   + NOISE[which, r, k]) for k in range(3)]
            for r, x in enumerate(X)]


def _f4(x, top, bottom, logec, hill):
    return bottom + (top - bottom) / (1 + 10 ** ((logec - x) * hill))


def _stack(ys):
    xs = np.repeat(X, 3)
    return xs, np.array(ys).ravel()


def test_compare_logec50_against_curve_fit():
    d = {"x": X, "datasets": [{"name": "Drug", "ys": _curve(-7.5)},
                              {"name": "Drug + inhibitor",
                               "ys": _curve(-6.9, which=1)}]}
    r = analyze({"analysis": "compare_parameter", "data": d,
                 "options": {"model": "log_agonist_vs_response_4pl",
                             "parameter": "logEC50"}})
    assert "error" not in r, r.get("error")
    # separate fits, independently with scipy curve_fit
    fits = []
    for ds in d["datasets"]:
        xs, ys = _stack(ds["ys"])
        p, cov = optimize.curve_fit(_f4, xs, ys, p0=[100, 0, -7, 1])
        ss = float(((ys - _f4(xs, *p)) ** 2).sum())
        fits.append((p, np.sqrt(np.diag(cov)), ss, xs.size - 4))
    for sep, (p, se, ss, df) in zip(r["separate"], fits):
        assert sep["value"] == pytest.approx(p[2], abs=1e-5)
        assert sep["se"] == pytest.approx(se[2], rel=1e-3)
        assert sep["df"] == df
    diff = fits[1][0][2] - fits[0][0][2]
    se = math.hypot(fits[0][1][2], fits[1][1][2])
    df = fits[0][3] + fits[1][3]
    tcrit = stats.t.ppf(0.975, df)
    assert r["difference"]["value"] == pytest.approx(diff, abs=1e-5)
    assert r["difference"]["df"] == df
    assert r["ratio"]["value"] == pytest.approx(10 ** diff, rel=1e-4)
    assert r["ratio"]["ci"][0] == pytest.approx(10 ** (diff - tcrit * se),
                                                rel=1e-3)
    assert r["ratio"]["ci"][1] == pytest.approx(10 ** (diff + tcrit * se),
                                                rel=1e-3)
    assert r["ratio"]["kind"] == "potency_ratio"
    # shared logEC50 fit with scipy: 7 parameters on the stacked data
    xa, ya = _stack(d["datasets"][0]["ys"])
    xb, yb = _stack(d["datasets"][1]["ys"])
    xs = np.concatenate([xa, xb])
    ys = np.concatenate([ya, yb])
    grp = np.r_[np.zeros(xa.size), np.ones(xb.size)]

    def shared(x, t1, b1, h1, t2, b2, h2, logec):
        return np.where(grp == 0, _f4(x, t1, b1, logec, h1),
                        _f4(x, t2, b2, logec, h2))
    p, _ = optimize.curve_fit(shared, xs, ys,
                              p0=[100, 0, 1, 100, 0, 1, -7.2])
    ss_sh = float(((ys - shared(xs, *p)) ** 2).sum())
    ss_sep = fits[0][2] + fits[1][2]
    f = ((ss_sh - ss_sep) / 1) / (ss_sep / (xs.size - 8))
    assert r["f_test"]["ss_shared"] == pytest.approx(ss_sh, rel=1e-5)
    assert r["f_test"]["f"] == pytest.approx(f, rel=1e-4)
    assert r["f_test"]["dfn"] == 1 and r["f_test"]["dfd"] == 46
    assert r["f_test"]["p"] == pytest.approx(stats.f.sf(f, 1, 46), rel=1e-3)
    assert r["aicc"]["preferred"] == "separate"


def test_compare_identical_curves_ratio_one():
    ys = _curve(-7.2)
    d = {"x": X, "datasets": [{"name": "A", "ys": ys}, {"name": "B",
                                                         "ys": ys}]}
    r = analyze({"analysis": "compare_parameter", "data": d,
                 "options": {"model": "log_agonist_vs_response_4pl",
                             "parameter": "LogEC50"}})
    assert r["difference"]["value"] == pytest.approx(0.0, abs=1e-6)
    assert r["ratio"]["value"] == pytest.approx(1.0, abs=1e-5)
    assert r["difference"]["p"] == pytest.approx(1.0, abs=1e-4)
    assert r["f_test"]["p"] == pytest.approx(1.0, abs=1e-4)
    assert r["aicc"]["preferred"] == "shared"


def test_compare_hill_slope_fieller_ratio():
    d = {"x": X, "datasets": [{"name": "A", "ys": _curve(-7.2, 1.0)},
                              {"name": "B", "ys": _curve(-7.2, 1.6, 1)}]}
    r = analyze({"analysis": "compare_parameter", "data": d,
                 "options": {"model": "log_agonist_vs_response_4pl",
                             "parameter": "HillSlope"}})
    a, b = r["separate"]
    assert r["ratio"]["value"] == pytest.approx(b["value"] / a["value"])
    # Fieller limits solve (b - rho a)^2 = t^2 (se_b^2 + rho^2 se_a^2)
    t = stats.t.ppf(0.975, r["difference"]["df"])
    for rho in r["ratio"]["ci"]:
        lhs = (b["value"] - rho * a["value"]) ** 2
        rhs = t ** 2 * (b["se"] ** 2 + rho ** 2 * a["se"] ** 2)
        assert lhs == pytest.approx(rhs, rel=1e-9)
    assert r["ratio"]["ci"][0] < r["ratio"]["value"] < r["ratio"]["ci"][1]


def test_fieller_unbounded_and_errors():
    res = compare_params.fieller_ratio(0.1, 1.0, 2.0, 0.5, 20)
    assert res["ci"] is None and res["value"] == pytest.approx(20.0)
    d = {"x": X, "datasets": [{"name": "A", "ys": _curve(-7.2)},
                              {"name": "B", "ys": _curve(-7.0, which=1)}]}
    r = analyze({"analysis": "compare_parameter", "data": d,
                 "options": {"model": "log_agonist_vs_response_3pl",
                             "parameter": "HillSlope"}})
    assert "constrained" in r["error"]
    r = analyze({"analysis": "compare_parameter", "data": d,
                 "options": {"model": "log_agonist_vs_response_4pl",
                             "parameter": "Kd"}})
    assert "unknown parameter" in r["error"]
    r = analyze({"analysis": "compare_parameter", "data": d,
                 "options": {"model": "log_agonist_vs_response_3pl",
                             "parameter": "logEC50"}})
    assert r["f_test"]["dfd"] == 54 - 6 and r["separate"][0]["df"] == 24


# --------------------------------------------------------- 6. flow summary

def _flow_records():
    recs = []
    vals = {"D1": {"FMO": 1.0, "Unstim": 3.0, "Low": 12.0, "High": 30.0,
                   "High+inh": 8.0},
            "D2": {"FMO": 2.0, "Unstim": 4.5, "Low": 15.0, "High": 41.0,
                   "High+inh": 10.0},
            "D3": {"FMO": 0.5, "Unstim": 2.5, "Low": 9.5, "High": 25.5,
                   "High+inh": 5.5}}
    for donor, conds in vals.items():
        for cond, v in conds.items():
            recs.append({"sample": f"{donor}_{cond}", "donor": donor,
                         "condition": cond, "gate": "CD69+",
                         "statistic": "freq_parent", "value": v})
            recs.append({"sample": f"{donor}_{cond}", "donor": donor,
                         "condition": cond, "gate": "CD69+",
                         "statistic": "median", "value": 100 * v})
    # a technical duplicate of D1 High (mean 30 -> (30 + 32) / 2 = 31)
    recs.append({"sample": "D1_High_b", "donor": "D1", "condition": "High",
                 "gate": "CD69+", "statistic": "freq_parent",
                 "value": "32%"})
    return recs


def test_flow_summary_fmo_subtraction():
    r = analyze({"analysis": "flow_summary",
                 "data": {"records": _flow_records()},
                 "options": {"statistic": "freq_parent",
                             "background": {"kind": "fmo",
                                            "condition": "FMO"}}})
    assert "error" not in r, r.get("error")
    assert r["conditions"] == ["Unstim", "Low", "High", "High+inh"]
    assert r["experiments"] == ["D1", "D2", "D3"]
    assert r["subtracted"] is True
    assert r["values"][0] == pytest.approx([2.0, 11.0, 30.0, 7.0])
    assert r["values"][1] == pytest.approx([2.5, 13.0, 39.0, 8.0])
    assert r["values"][2] == pytest.approx([2.0, 9.0, 25.0, 5.0])
    assert r["n_technical"][0] == [1, 1, 2, 1]
    assert r["background"]["values"] == {"D1": 1.0, "D2": 2.0, "D3": 0.5}
    assert any("technical replicates" in w for w in r["warnings"])
    assert any("another gate or statistic" in w for w in r["warnings"])
    # the matched table feeds rm_anova directly (donor = block)
    rm = analyze({"analysis": "rm_anova", "data": r["table"],
                  "options": {"comparisons": {"method": "dunnett"}}})
    assert rm["n_subjects"] == 3 and len(rm["comparisons"]["comparisons"]) \
        == 3
    json.loads(analyze_json(json.dumps(
        {"analysis": "flow_summary", "data": {"records": _flow_records()},
         "options": {"statistic": "median"}})))


def test_flow_summary_missing_background_and_choices():
    recs = [r for r in _flow_records()
            if not (r["donor"] == "D2" and r["condition"] == "FMO")]
    r = flow.flow_summary(recs, statistic="freq_parent",
                          background={"kind": "isotype", "condition": "FMO"})
    assert r["values"][1] == [None] * 4
    assert any("No background" in w for w in r["warnings"])
    with pytest.raises(ValueError, match="several statistics"):
        flow.flow_summary(_flow_records())
    r = flow.flow_summary(_flow_records(), statistic="median")
    assert r["subtracted"] is False and "FMO" in r["conditions"]
    assert r["values"][0][r["conditions"].index("High")] == \
        pytest.approx(3000.0)   # the duplicate is freq_parent only


# ------------------------------------------ 4. qPCR reference-gene wiring

def _qpcr_records():
    recs = []
    cq = {"C1": (20.0, 18.1, 25.0), "C2": (20.1, 18.3, 25.2),
          "C3": (19.9, 18.0, 24.9), "T1": (22.0, 18.2, 23.0),
          "T2": (22.1, 18.1, 23.3), "T3": (21.9, 18.3, 22.8)}
    for s, (gapdh, actb, tgt) in cq.items():
        grp = "Control" if s.startswith("C") else "Drug"
        for gene, v in (("GAPDH", gapdh), ("ACTB", actb), ("IL6", tgt)):
            recs.append({"sample": s, "group": grp, "target": gene,
                         "cq": v})
    return recs


def test_qpcr_result_has_reference_stability_and_standalone_handler():
    r = analyze({"analysis": "qpcr", "data": {"records": _qpcr_records()},
                 "options": {"reference_genes": ["GAPDH", "ACTB"]}})
    assert "error" not in r, r.get("error")
    rs = r["reference_stability"]
    genes = {g["gene"]: g for g in rs["genes"]}
    assert genes["GAPDH"]["shifts_with_treatment"] is True
    assert genes["ACTB"]["shifts_with_treatment"] is False
    f = stats.f_oneway([20.0, 20.1, 19.9], [22.0, 22.1, 21.9])
    assert genes["GAPDH"]["group_test"]["p"] == pytest.approx(f.pvalue)
    d = np.array([20.0, 20.1, 19.9, 22.0, 22.1, 21.9]) - \
        np.array([18.1, 18.3, 18.0, 18.2, 18.1, 18.3])
    assert genes["GAPDH"]["M"] == pytest.approx(np.std(d, ddof=1))
    s = analyze({"analysis": "qpcr_reference_check",
                 "data": {"records": _qpcr_records()},
                 "options": {"reference_genes": ["GAPDH", "ACTB"],
                             "calibrator": "Control"}})
    assert s["analysis"] == "qpcr_reference_check"
    assert s["any_shift"] is True
    assert s["pairs"][0]["sd_dcq_raw"] == pytest.approx(np.std(d, ddof=1))
    off = analyze({"analysis": "qpcr", "data": {"records": _qpcr_records()},
                   "options": {"reference_genes": ["GAPDH"],
                               "reference_stability": False}})
    assert "reference_stability" not in off


def test_new_handlers_are_json_safe():
    for payload in (
            {"analysis": "scale_check", "data": _cols(CYT_A, CYT_B, CYT_C)},
            {"analysis": "ttest", "data": _cols(CYT_A, CYT_B),
             "options": {"log_scale": True}},
            {"analysis": "two_way_anova", "data": _grouped(CELLS_2X2)},
            {"analysis": "rm_anova", "data": _cols(*RM),
             "options": {"comparisons": "dunnett"}},
            {"analysis": "qpcr_reference_check",
             "data": {"records": _qpcr_records()},
             "options": {"reference_genes": ["GAPDH", "ACTB"]}}):
        out = json.loads(analyze_json(json.dumps(payload)))
        assert "error" not in out, out.get("error")


def test_interaction_contrasts_from_mean_sd_n_equal_raw():
    raw = analyze({"analysis": "two_way_anova", "data": _grouped(CELLS_2X2)})
    summ = analyze({"analysis": "two_way_anova_summary", "data": {
        "format": "mean_sd_n",
        "datasets": [{"name": nm, "rows": [
            [float(np.mean(CELLS_2X2[r][j])),
             float(np.std(CELLS_2X2[r][j], ddof=1)), len(CELLS_2X2[r][j])]
            for r in range(2)]} for j, nm in enumerate(("Vehicle", "Drug"))]}})
    a = raw["interaction_contrasts"]["contrasts"][0]
    b = summ["interaction_contrasts"]["contrasts"][0]
    for key in ("difference", "se", "p"):
        assert b[key] == pytest.approx(a[key], rel=1e-9)
    assert summ["simple_effects"][1]["p"] == pytest.approx(
        raw["simple_effects"][1]["p"], rel=1e-9)
