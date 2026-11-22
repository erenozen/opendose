"""One-tailed P values (p_greater / p_less) and one-sided bounds of the
t tests, Mann-Whitney and Wilcoxon tests, against scipy's alternative =
"greater" / "less" (R's) and, with ties, against full enumeration of the
permutation / sign-flip distributions. The two-tailed P is unchanged."""

from itertools import combinations, product

import numpy as np
import pytest
from scipy import stats

from opendose import api, columnstats, summary, ttests

RNG = np.random.default_rng(2)
A, B = RNG.normal(1, 1, 7), RNG.normal(0, 1.5, 9)


@pytest.mark.parametrize("welch", [False, True])
@pytest.mark.parametrize("alt", ["greater", "less"])
def test_unpaired_t_matches_scipy(welch, alt):
    r = ttests.unpaired_t(A, B, welch=welch)
    ref = stats.ttest_ind(A, B, equal_var=not welch, alternative=alt)
    assert r[f"p_{alt}"] == pytest.approx(ref.pvalue, rel=1e-12)
    ci = ref.confidence_interval(0.95)
    got = r[f"ci_difference_{alt}"]
    if alt == "greater":
        assert got[0] == pytest.approx(ci.low, rel=1e-12) and got[1] is None
    else:
        assert got[0] is None and got[1] == pytest.approx(ci.high, rel=1e-12)
    assert r["p_greater"] + r["p_less"] == pytest.approx(1.0)
    assert r["p_two_tailed"] == pytest.approx(
        2 * min(r["p_greater"], r["p_less"]))


def test_paired_ratio_and_one_sample_t_match_scipy():
    b = A[:6] + RNG.normal(0.4, 0.3, 6)
    r = ttests.paired_t(A[:6], b)
    for alt in ("greater", "less"):
        assert r[f"p_{alt}"] == pytest.approx(
            stats.ttest_rel(A[:6], b, alternative=alt).pvalue, rel=1e-12)
    pos_a, pos_b = np.exp(A[:6]), np.exp(b)
    ratio = ttests.ratio_paired_t(pos_a, pos_b)
    logs = stats.ttest_rel(np.log10(pos_a), np.log10(pos_b),
                           alternative="greater")
    assert ratio["p_greater"] == pytest.approx(logs.pvalue, rel=1e-12)
    assert ratio["ci_ratio_greater"][0] == pytest.approx(
        10 ** logs.confidence_interval(0.95).low, rel=1e-12)
    one = columnstats.one_sample_t(A, 0.5)
    ref = stats.ttest_1samp(A, 0.5, alternative="greater")
    assert one["p_greater"] == pytest.approx(ref.pvalue, rel=1e-12)
    assert one["ci_discrepancy_greater"][0] == pytest.approx(
        ref.confidence_interval(0.95).low - 0.5, rel=1e-12)
    # from mean, SD and n: the same numbers
    sm = summary.one_sample_t_summary(
        {"mean": float(A.mean()), "sd": float(A.std(ddof=1)), "n": A.size},
        0.5)
    assert sm["p_greater"] == pytest.approx(one["p_greater"], rel=1e-10)
    assert sm["p_less"] == pytest.approx(one["p_less"], rel=1e-10)


def test_zero_variance_paired_differences():
    r = ttests.paired_t([2, 3, 4], [1, 2, 3])          # every difference 1
    assert (r["p_greater"], r["p_less"]) == (0.0, 1.0)
    r = ttests.paired_t([1, 2, 3], [2, 3, 4])
    assert (r["p_greater"], r["p_less"]) == (1.0, 0.0)


def test_mann_whitney_with_ties_is_the_permutation_tail():
    x, y = [1, 2, 2, 3, 5], [2, 3, 3, 4, 6, 6]
    pooled = np.array(x + y, float)
    ranks = stats.rankdata(pooled)
    obs = ranks[:5].sum()
    sums = np.array([ranks[list(i)].sum()
                     for i in combinations(range(11), 5)])
    r = ttests.mann_whitney(x, y)
    assert r["p_method"] == "exact"
    assert r["p_greater"] == pytest.approx(np.mean(sums >= obs - 1e-9))
    assert r["p_less"] == pytest.approx(np.mean(sums <= obs + 1e-9))
    swapped = ttests.mann_whitney(y, x)                  # larger group first
    assert swapped["p_greater"] == pytest.approx(r["p_less"])
    assert swapped["p_less"] == pytest.approx(r["p_greater"])


def test_mann_whitney_exact_and_approximate_match_scipy():
    x, y = RNG.normal(0, 1, 8), RNG.normal(1, 1, 6)
    r = ttests.mann_whitney(x, y)
    for alt in ("greater", "less"):
        assert r[f"p_{alt}"] == pytest.approx(stats.mannwhitneyu(
            x, y, alternative=alt, method="exact").pvalue, rel=1e-12)
    big_x, big_y = RNG.normal(0, 1, 130), RNG.normal(0.3, 1, 140)
    r = ttests.mann_whitney(big_x, big_y)
    assert r["p_method"] == "approximate"
    assert r["p_less"] == pytest.approx(stats.mannwhitneyu(
        big_x, big_y, alternative="less", method="asymptotic").pvalue,
        rel=1e-12)


def test_wilcoxon_with_ties_is_the_sign_flip_tail():
    d = np.array([1.5, -0.5, 2.0, 2.0, 3.0, -1.0, 0.5])
    rk = stats.rankdata(np.abs(d))
    t_obs = rk[d > 0].sum()
    tp = np.array([sum(r for r, s in zip(rk, signs) if s)
                   for signs in product([0, 1], repeat=d.size)])
    r = ttests.wilcoxon_matched_pairs(d, np.zeros_like(d))
    assert r["p_greater"] == pytest.approx(np.mean(tp >= t_obs - 1e-9))
    assert r["p_less"] == pytest.approx(np.mean(tp <= t_obs + 1e-9))
    one = columnstats.wilcoxon_signed_rank(d + 1.0, 1.0)
    assert one["p_greater"] == pytest.approx(r["p_greater"])


def test_wilcoxon_exact_untied_and_approximate():
    d = RNG.normal(0.4, 1, 12)
    r = ttests.signed_rank_test(d)
    assert r["p_greater"] == pytest.approx(stats.wilcoxon(
        d, alternative="greater", method="exact").pvalue, rel=1e-12)
    big = RNG.normal(0.1, 1, 260)
    r = ttests.signed_rank_test(big)
    assert r["p_method"] == "approximate"
    ranks = stats.rankdata(np.abs(big))
    z = (ranks[big > 0].sum() - ranks.sum() / 2) / np.sqrt(
        (ranks ** 2).sum() / 4)
    assert r["p_greater"] == pytest.approx(stats.norm.sf(z), rel=1e-12)


def test_api_ttest_results_carry_both_tails():
    data = {"datasets": [{"name": "A", "ys": [[v] for v in A]},
                         {"name": "B", "ys": [[v] for v in B]}]}
    for kind in ("unpaired", "mann_whitney"):
        r = api.analyze({"analysis": "ttest", "data": data,
                         "options": {"kind": kind}})
        assert 0 <= r["p_greater"] <= 1 and 0 <= r["p_less"] <= 1
