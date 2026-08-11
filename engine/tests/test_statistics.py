"""Statistics validation.

Strategy: every result is cross-checked against an INDEPENDENT
implementation: statsmodels (Tukey, Lilliefors-family), hand-derived
formulas, or published textbook values, never only against the same
scipy call the engine itself makes.
"""

import math

import numpy as np
import pytest
from scipy import stats as sps

from prism_engine.anova import (kruskal_wallis, multiple_comparisons,
                                one_way_anova)
from prism_engine.columnstats import (column_statistics, describe,
                                      normality_tests, one_sample_t)
from prism_engine.outliers import grubbs, grubbs_critical
from prism_engine.ttests import (mann_whitney, paired_t, unpaired_t,
                                 wilcoxon_matched_pairs)

# Classic small datasets
A = [23.0, 26.0, 24.0, 25.0, 28.0, 27.0]
B = [30.0, 33.0, 29.0, 31.0, 34.0, 32.0]
C = [36.0, 34.0, 38.0, 35.0, 39.0, 37.0]


class TestDescriptive:
    def test_against_hand_computation(self):
        d = describe(A)
        arr = np.array(A)
        assert d["mean"] == pytest.approx(arr.mean())
        assert d["sd"] == pytest.approx(arr.std(ddof=1))
        assert d["sem"] == pytest.approx(arr.std(ddof=1) / math.sqrt(6))
        assert d["median"] == pytest.approx(25.5)
        assert d["cv_percent"] == pytest.approx(
            100 * arr.std(ddof=1) / arr.mean())
        # geometric mean: 10^mean(log10 x)
        assert d["geometric_mean"] == pytest.approx(
            10 ** np.log10(arr).mean())

    def test_ci_of_mean_uses_t(self):
        d = describe(A)
        arr = np.array(A)
        half = sps.t.ppf(0.975, 5) * arr.std(ddof=1) / math.sqrt(6)
        assert d["ci_mean"][1] - d["mean"] == pytest.approx(half)


class TestNormality:
    def test_three_tests_present(self):
        rng = np.random.default_rng(2)
        data = rng.normal(50, 5, 30).tolist()
        n = normality_tests(data)
        assert set(n) == {"shapiro_wilk", "dagostino_pearson",
                          "anderson_darling"}
        assert all(v["passed_alpha_05"] for v in n.values())

    def test_detects_non_normal(self):
        rng = np.random.default_rng(2)
        data = np.exp(rng.normal(0, 1, 80)).tolist()  # lognormal
        n = normality_tests(data)
        assert not n["shapiro_wilk"]["passed_alpha_05"]
        assert not n["anderson_darling"]["passed_alpha_05"]

    def test_anderson_darling_p_against_statsmodels(self):
        from statsmodels.stats.diagnostic import normal_ad
        rng = np.random.default_rng(3)
        for _ in range(3):
            data = rng.normal(0, 1, 40)
            ours = normality_tests(data.tolist())["anderson_darling"]
            stat, p = normal_ad(data)
            assert ours["A2"] == pytest.approx(stat, rel=1e-6)
            assert ours["p"] == pytest.approx(p, abs=0.02)


class TestTTests:
    def test_unpaired_matches_scipy_and_formulas(self):
        r = unpaired_t(A, B)
        t, p = sps.ttest_ind(A, B)
        assert r["t"] == pytest.approx(abs(t))
        assert r["p_two_tailed"] == pytest.approx(p)
        assert r["df"] == 10
        assert r["difference"] == pytest.approx(np.mean(A) - np.mean(B))
        # CI hand check
        half = sps.t.ppf(0.975, 10) * r["se_difference"]
        assert r["ci_difference"][1] - r["difference"] == pytest.approx(half)
        assert r["r_squared"] == pytest.approx(t * t / (t * t + 10))

    def test_welch_df(self):
        r = unpaired_t(A, [10.0, 40.0, 20.0, 35.0], welch=True)
        t, p = sps.ttest_ind(A, [10.0, 40.0, 20.0, 35.0], equal_var=False)
        assert r["t"] == pytest.approx(abs(t))
        assert r["p_two_tailed"] == pytest.approx(p)
        assert r["df"] < 10  # Welch reduces df

    def test_paired(self):
        r = paired_t(A, B)
        t, p = sps.ttest_rel(A, B)
        assert r["t"] == pytest.approx(abs(t))
        assert r["p_two_tailed"] == pytest.approx(p)
        assert r["mean_difference"] == pytest.approx(np.mean(A) - np.mean(B))

    def test_mann_whitney_exact_small(self):
        r = mann_whitney(A, B)
        u, p = sps.mannwhitneyu(A, B, alternative="two-sided", method="exact")
        assert r["U"] == pytest.approx(u)
        assert r["p_two_tailed"] == pytest.approx(p)
        # Hodges-Lehmann: median of all pairwise differences
        diffs = sorted(a - b for a in A for b in B)
        assert r["hodges_lehmann_difference"] == pytest.approx(
            np.median(diffs))

    def test_wilcoxon(self):
        r = wilcoxon_matched_pairs(A, B)
        _, p = sps.wilcoxon(A, B)
        assert r["p_two_tailed"] == pytest.approx(p)
        # W = sum of signed ranks; all differences negative here
        assert r["W"] == pytest.approx(-21.0)

    def test_one_sample(self):
        r = one_sample_t(A, 25.0)
        t, p = sps.ttest_1samp(A, 25.0)
        assert r["t"] == pytest.approx(abs(t))
        assert r["p_two_tailed"] == pytest.approx(p)


class TestANOVA:
    def test_table_matches_scipy_f_oneway_and_hand_ss(self):
        r = one_way_anova([A, B, C])
        f, p = sps.f_oneway(A, B, C)
        assert r["table"]["F"] == pytest.approx(f)
        assert r["table"]["p"] == pytest.approx(p)
        # hand-computed SS
        allv = np.concatenate([A, B, C])
        ss_total = ((allv - allv.mean()) ** 2).sum()
        assert r["table"]["ss_total"] == pytest.approx(ss_total)
        assert r["table"]["df_between"] == 2
        assert r["table"]["df_within"] == 15
        assert r["table"]["r_squared"] == pytest.approx(
            r["table"]["ss_between"] / ss_total)

    def test_tukey_against_statsmodels(self):
        from statsmodels.stats.multicomp import pairwise_tukeyhsd
        values = np.concatenate([A, B, C])
        labels = ["A"] * 6 + ["B"] * 6 + ["C"] * 6
        sm = pairwise_tukeyhsd(values, labels)
        ours = multiple_comparisons([A, B, C], "tukey",
                                    names=["A", "B", "C"])
        for our, sm_p, sm_lo, sm_hi in zip(
                ours["comparisons"], sm.pvalues,
                sm.confint[:, 0], sm.confint[:, 1]):
            assert our["p_adjusted"] == pytest.approx(sm_p, abs=1e-6)
            # statsmodels reports (group2 - group1); ours is (i - j)
            assert sorted([abs(our["ci"][0]), abs(our["ci"][1])]) == \
                pytest.approx(sorted([abs(sm_lo), abs(sm_hi)]), rel=1e-6)

    def test_dunnett_reduces_sensibly(self):
        ours = multiple_comparisons([A, B, C], "dunnett",
                                    names=["ctrl", "B", "C"],
                                    control_index=0)
        assert len(ours["comparisons"]) == 2
        for c in ours["comparisons"]:
            assert c["significant_05"]
            assert c["ci"][0] < c["difference"] < c["ci"][1]

    def test_bonferroni_vs_sidak_vs_holm_ordering(self):
        bon = multiple_comparisons([A, B, C], "bonferroni")
        sid = multiple_comparisons([A, B, C], "sidak")
        hol = multiple_comparisons([A, B, C], "holm_sidak")
        for b, s, h in zip(bon["comparisons"], sid["comparisons"],
                           hol["comparisons"]):
            # Bonferroni is most conservative; Holm-Sidak least
            assert b["p_adjusted"] >= s["p_adjusted"] >= h["p_adjusted"] - 1e-12

    def test_kruskal_wallis_and_dunns(self):
        r = kruskal_wallis([A, B, C], names=["A", "B", "C"])
        h, p = sps.kruskal(A, B, C)
        assert r["H"] == pytest.approx(h)
        assert r["p"] == pytest.approx(p)
        assert len(r["dunns"]["comparisons"]) == 3
        # scikit-posthocs-style hand check of one z value
        allv = np.concatenate([A, B, C])
        ranks = sps.rankdata(allv)
        mr = [ranks[:6].mean(), ranks[6:12].mean(), ranks[12:].mean()]
        n = 18
        _, counts = np.unique(allv, return_counts=True)
        tie_term = (counts ** 3 - counts).sum() / (12 * (n - 1))
        se = math.sqrt((n * (n + 1) / 12 - tie_term) * (1 / 6 + 1 / 6))
        z = abs(mr[0] - mr[1]) / se
        got = r["dunns"]["comparisons"][0]
        assert got["statistic"] == pytest.approx(z)
        assert got["p_adjusted"] == pytest.approx(
            min(1.0, 2 * sps.norm.sf(z) * 3))


class TestGrubbs:
    def test_critical_value_published(self):
        # Published two-sided Grubbs critical values (alpha=0.05):
        # n=10 -> 2.290, n=20 -> 2.709 (Grubbs 1969 / NIST tables)
        assert grubbs_critical(10) == pytest.approx(2.290, abs=0.002)
        assert grubbs_critical(20) == pytest.approx(2.709, abs=0.002)

    def test_detects_planted_outlier(self):
        data = A + [95.0]
        r = grubbs(data)
        assert len(r["outliers"]) == 1
        assert r["outliers"][0]["value"] == 95.0
        assert 95.0 not in r["cleaned"]

    def test_clean_data_no_outliers(self):
        assert grubbs(A)["outliers"] == []


class TestColumnStatisticsBundle:
    def test_full_bundle(self):
        r = column_statistics(A, hypothetical=25.0)
        assert r["descriptive"]["n"] == 6
        assert "shapiro_wilk" in r["normality"]
        assert r["one_sample_t"]["hypothetical"] == 25.0
        assert r["wilcoxon"] is not None
