"""Comparison families after one-way ANOVA and Kruskal-Wallis: unadjusted
P, family size and method on every comparison (need
adjusted-vs-raw-labelled), planned families for Sidak / Bonferroni /
Holm(-Sidak) / Fisher (planned-comparisons-family) and Dunn's test with a
control family, planned pairs and Holm (nonparametric-posthoc).

Independent references:
- R's PlantGrowth data (datasets package) with
    pairwise.t.test(PlantGrowth$weight, PlantGrowth$group,
                    p.adjust.method = "none")   # 0.194, 0.088, 0.0045
    pairwise.t.test(..., p.adjust.method = "holm")  # 0.194, 0.175, 0.013
    kruskal.test(weight ~ group, PlantGrowth)   # chi2 = 7.9882, p = 0.01842
    FSA::dunnTest(weight ~ group, data = PlantGrowth, method = "holm")
      ctrl - trt1  Z = 1.117725  P.unadj = 0.26368  P.adj = 0.26368
      ctrl - trt2  Z = -1.689290 P.unadj = 0.09116  P.adj = 0.18233
      trt1 - trt2  Z = -2.807015 P.unadj = 0.00500  P.adj = 0.01500
- statsmodels OLS contrasts (pooled-variance t with the residual df) and
  statsmodels multipletests for the adjustments.
"""

import math

import numpy as np
import pytest
from scipy import stats

from opendose import anova
from opendose.api import analyze

CTRL = [4.17, 5.58, 5.18, 6.11, 4.50, 4.61, 5.17, 4.53, 5.33, 5.14]
TRT1 = [4.81, 4.17, 4.41, 3.59, 5.87, 3.83, 6.03, 4.89, 4.32, 4.69]
TRT2 = [6.31, 5.12, 5.54, 5.50, 5.37, 5.29, 4.92, 6.15, 5.80, 5.26]
PG = [CTRL, TRT1, TRT2]
PG_NAMES = ["ctrl", "trt1", "trt2"]

# four groups of unequal n for the families
G4 = [[3.1, 4.2, 5.0, 4.4, 3.9], [5.5, 6.1, 4.9, 6.8],
      [7.2, 6.4, 8.1, 7.7, 6.9, 7.4], [4.0, 3.6, 4.8, 4.1]]


def _pooled_t_p(groups, i, j):
    """Independent pooled-variance t test of groups i and j with the
    one-way ANOVA residual MS and df (statsmodels OLS contrast)."""
    sm = pytest.importorskip("statsmodels.api")
    y = np.concatenate([np.asarray(g, float) for g in groups])
    lab = np.concatenate([[k] * len(g) for k, g in enumerate(groups)])
    X = np.column_stack([(lab == k).astype(float)
                         for k in range(len(groups))])
    fit = sm.OLS(y, X).fit()
    L = np.zeros(len(groups))
    L[i], L[j] = 1.0, -1.0
    return float(fit.t_test(L).pvalue)


def _pair_index(names, pair):
    a, b = pair.split(" vs. ")
    return names.index(a), names.index(b)


@pytest.mark.parametrize("method", ["tukey", "bonferroni", "sidak",
                                    "holm_sidak", "holm", "fisher_lsd",
                                    "dunnett"])
def test_every_one_way_method_reports_unadjusted_p(method):
    names = ["A", "B", "C", "D"]
    res = anova.multiple_comparisons(G4, method, names=names)
    m = len(res["comparisons"])
    assert res["family"]["size"] == m
    assert res["family"]["method"] == method
    assert str(m) in res["family"]["label"]
    assert m == (3 if method == "dunnett" else 6)
    for c in res["comparisons"]:
        assert c["family_size"] == m and c["method"] == method
        i, j = _pair_index(names, c["pair"])
        assert c["p_unadjusted"] == pytest.approx(_pooled_t_p(G4, i, j),
                                                  rel=1e-6)
        assert c["p_unadjusted"] <= c["p_adjusted"] + 1e-15


def test_plantgrowth_pairwise_t_matches_r():
    res = anova.multiple_comparisons(PG, "holm", names=PG_NAMES)
    unadj = [c["p_unadjusted"] for c in res["comparisons"]]
    adj = [c["p_adjusted"] for c in res["comparisons"]]
    # R pairwise.t.test, pooled SD (printed to 2 significant digits)
    assert unadj == pytest.approx([0.1944, 0.08768, 0.004459], rel=2e-3)
    assert adj == pytest.approx([0.1944, 0.1754, 0.01338], rel=2e-3)


def test_planned_pairs_sidak_is_one_minus_power():
    res = anova.multiple_comparisons(
        G4, "sidak", names=list("ABCD"), comparisons_family="pairs",
        pairs=[[2, 0], [3, 1]])
    assert res["family"]["size"] == 2
    assert res["planned_pairs"] == [[2, 0], [3, 1]]
    assert [c["pair"] for c in res["comparisons"]] == ["C vs. A", "D vs. B"]
    for c, (i, j) in zip(res["comparisons"], [(2, 0), (3, 1)]):
        p = _pooled_t_p(G4, i, j)
        assert c["p_unadjusted"] == pytest.approx(p, rel=1e-6)
        assert c["p_adjusted"] == pytest.approx(1 - (1 - p) ** 2, rel=1e-6)
        assert (c["a_index"], c["b_index"]) == (i, j)
        assert c["family_size"] == 2


def test_planned_pairs_holm_matches_p_adjust_on_subset():
    multipletests = pytest.importorskip(
        "statsmodels.stats.multitest").multipletests
    pairs = [[0, 1], [0, 2], [1, 3]]
    res = anova.multiple_comparisons(G4, "holm", names=list("ABCD"),
                                     comparisons_family="pairs", pairs=pairs)
    raw = [_pooled_t_p(G4, i, j) for i, j in pairs]
    ref = multipletests(raw, method="holm")[1]
    assert [c["p_adjusted"] for c in res["comparisons"]] == pytest.approx(
        list(ref), rel=1e-6)
    res_hs = anova.multiple_comparisons(G4, "holm_sidak",
                                        names=list("ABCD"),
                                        comparisons_family="pairs",
                                        pairs=pairs)
    ref_hs = multipletests(raw, method="holm-sidak")[1]
    assert [c["p_adjusted"] for c in res_hs["comparisons"]] == \
        pytest.approx(list(ref_hs), rel=1e-6)


def test_control_family_bonferroni_counts_k_minus_one():
    res = anova.multiple_comparisons(G4, "bonferroni", names=list("ABCD"),
                                     comparisons_family="control",
                                     control_index=1)
    assert res["family"]["size"] == 3
    assert "vs. the control B" in res["family"]["label"]
    for c in res["comparisons"]:
        assert c["pair"].endswith("vs. B")
        assert c["p_adjusted"] == pytest.approx(
            min(3 * c["p_unadjusted"], 1.0), rel=1e-12)
    # Bonferroni CIs use alpha / 3
    c = res["comparisons"][0]
    tcrit = stats.t.ppf(1 - 0.05 / 3 / 2, sum(map(len, G4)) - 4)
    half = (c["ci"][1] - c["ci"][0]) / 2
    se = c["difference"] / (c["statistic"] if c["difference"] > 0
                            else -c["statistic"])
    assert half == pytest.approx(tcrit * abs(se), rel=1e-9)


def test_default_family_is_unchanged():
    """Defaults reproduce the all-pairs family exactly (pinned values were
    computed before planned families existed)."""
    res = anova.multiple_comparisons(PG, "sidak", names=PG_NAMES)
    assert [c["pair"] for c in res["comparisons"]] == [
        "ctrl vs. trt1", "ctrl vs. trt2", "trt1 vs. trt2"]
    for c in res["comparisons"]:
        assert c["p_adjusted"] == pytest.approx(
            1 - (1 - c["p_unadjusted"]) ** 3, rel=1e-12)
    assert "planned_pairs" not in res


def test_planned_family_rejected_for_fixed_family_methods():
    with pytest.raises(ValueError, match="planned family"):
        anova.multiple_comparisons(G4, "tukey", comparisons_family="pairs",
                                   pairs=[[0, 1]])
    with pytest.raises(ValueError, match="twice"):
        anova.multiple_comparisons(G4, "sidak", comparisons_family="pairs",
                                   pairs=[[0, 1], [1, 0]])
    with pytest.raises(ValueError, match="out of range"):
        anova.multiple_comparisons(G4, "sidak", comparisons_family="pairs",
                                   pairs=[[0, 7]])


def test_api_planned_family_passthrough():
    data = {"datasets": [{"name": n, "ys": [[v] for v in g]}
                         for n, g in zip("ABCD", G4)]}
    r = analyze({"analysis": "anova", "data": data,
                 "options": {"comparisons": "sidak",
                             "comparisons_family": "pairs",
                             "pairs": [[0, 2]]}})
    mc = r["multiple_comparisons"]
    assert mc["family"]["size"] == 1
    p = _pooled_t_p(G4, 0, 2)
    assert mc["comparisons"][0]["p_adjusted"] == pytest.approx(p, rel=1e-6)


# ------------------------------------------------------------ Dunn's test

def test_dunn_plantgrowth_matches_fsa_dunntest():
    res = anova.kruskal_wallis(PG, PG_NAMES, dunn_correction="holm")
    assert res["H"] == pytest.approx(7.9882, rel=1e-4)
    assert res["p"] == pytest.approx(0.01842, rel=1e-3)
    comps = res["dunns"]["comparisons"]
    assert [c["statistic"] for c in comps] == pytest.approx(
        [1.117725, 1.689290, 2.807015], rel=1e-6)
    assert [c["p_unadjusted"] for c in comps] == pytest.approx(
        [0.26368, 0.09116, 0.0050003], rel=1e-4)
    assert [c["p_adjusted"] for c in comps] == pytest.approx(
        [0.26368, 0.18233, 0.015001], rel=1e-4)
    assert all(c["method"] == "dunn_holm" and c["family_size"] == 3
               for c in comps)
    assert res["dunns"]["family"]["label"].startswith("Dunn (Holm), 3")


def _dunn_z(groups, i, j):
    """Independent Dunn z: mean ranks with the tie-corrected variance
    (Dunn 1964; dunn.test documentation)."""
    allv = np.concatenate([np.asarray(g, float) for g in groups])
    n = allv.size
    order = np.argsort(allv, kind="mergesort")
    ranks = np.empty(n)
    sv = allv[order]
    k = 0
    while k < n:
        m = k
        while m + 1 < n and sv[m + 1] == sv[k]:
            m += 1
        ranks[order[k:m + 1]] = (k + m) / 2 + 1
        k = m + 1
    starts = np.cumsum([0] + [len(g) for g in groups])
    mr = [ranks[starts[g]:starts[g + 1]].mean() for g in range(len(groups))]
    _, t = np.unique(allv, return_counts=True)
    var = (n * (n + 1) / 12 - (t ** 3 - t).sum() / (12 * (n - 1)))
    return (mr[i] - mr[j]) / math.sqrt(var * (1 / len(groups[i])
                                              + 1 / len(groups[j])))


def test_dunn_default_is_bonferroni_over_all_pairs():
    res = anova.kruskal_wallis(G4, list("ABCD"))
    comps = res["dunns"]["comparisons"]
    assert len(comps) == 6
    for c in comps:
        i, j = c["a_index"], c["b_index"]
        z = _dunn_z(G4, i, j)
        assert c["statistic"] == pytest.approx(abs(z), rel=1e-9)
        p = 2 * stats.norm.sf(abs(z))
        assert c["p_unadjusted"] == pytest.approx(p, rel=1e-9)
        assert c["p_adjusted"] == pytest.approx(min(6 * p, 1), rel=1e-9)
        assert c["method"] == "dunn_bonferroni"
    assert "corrected" not in res["dunns"]


def test_dunn_control_family_uses_k_minus_one():
    allp = anova.kruskal_wallis(G4, list("ABCD"))["dunns"]["comparisons"]
    ctl = anova.kruskal_wallis(G4, list("ABCD"), dunn_family="control",
                               control=0)["dunns"]
    assert ctl["family"]["size"] == 3
    z_all = {frozenset((c["a_index"], c["b_index"])): c["statistic"]
             for c in allp}
    for c in ctl["comparisons"]:
        assert c["b_index"] == 0
        assert c["statistic"] == pytest.approx(
            z_all[frozenset((c["a_index"], 0))], rel=1e-12)
        assert c["p_adjusted"] == pytest.approx(
            min(3 * c["p_unadjusted"], 1.0), rel=1e-12)


def test_dunn_planned_pairs_and_uncorrected():
    res = anova.kruskal_wallis(G4, list("ABCD"), dunn_family="pairs",
                               pairs=[[1, 3]])
    c, = res["dunns"]["comparisons"]
    assert res["dunns"]["family"]["size"] == 1
    assert c["p_adjusted"] == pytest.approx(c["p_unadjusted"], rel=1e-12)
    unc = anova.kruskal_wallis(G4, list("ABCD"), dunn_corrected=False)
    assert unc["dunns"]["corrected"] is False
    for c in unc["dunns"]["comparisons"]:
        assert c["p_adjusted"] == c["p_unadjusted"]
        assert c["method"] == "dunn_none"


def test_api_dunn_options():
    data = {"datasets": [{"name": n, "ys": [[v] for v in g]}
                         for n, g in zip(PG_NAMES, PG)]}
    r = analyze({"analysis": "anova", "data": data,
                 "options": {"kind": "nonparametric", "dunn_family":
                             "control", "control": 0,
                             "dunn_correction": "holm"}})
    comps = r["dunns"]["comparisons"]
    assert len(comps) == 2
    # ctrl-trt1 and ctrl-trt2 Holm within a family of 2
    assert comps[1]["p_adjusted"] == pytest.approx(2 * 0.0911639, rel=1e-5)
    assert comps[0]["p_adjusted"] == pytest.approx(0.2636843, rel=1e-5)
