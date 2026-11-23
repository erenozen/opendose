"""The smallest P a rank test can reach with the design entered
(FEATURE-PLAN P-15; exactdist.min_p_*).

References, all independent of the engine's code:
- hand derivation without ties: Mann-Whitney 2 / C(n1 + n2, n1),
  Wilcoxon signed rank 2 / 2^n, Friedman (k!)^(1 - n), Kruskal-Wallis
  (orders of the blocks reaching the largest H) x prod(n_j!) / N!;
- scipy.stats.mannwhitneyu(method = "exact") and scipy.stats.wilcoxon
  (method = "exact") on the most extreme data;
- brute-force enumeration (itertools) of every relabelling, ties
  included, for Mann-Whitney, Kruskal-Wallis and Friedman.
"""

from __future__ import annotations

import itertools
import math

import numpy as np
import pytest
from scipy import stats

from opendose import anova, api, exactdist, repeated, ttests


def test_acceptance_3_vs_3():
    """Mann-Whitney on 1, 2, 3 vs 4, 5, 6: 2 / C(6, 3) = 2 / 20 = 0.10."""
    r = ttests.mann_whitney([1, 2, 3], [4, 5, 6])
    f = r["min_attainable_p"]
    assert f["p"] == pytest.approx(0.1, abs=1e-15)
    assert f["p"] == pytest.approx(2 / math.comb(6, 3))
    assert f["p"] == pytest.approx(stats.mannwhitneyu([1, 2, 3], [4, 5, 6], method="exact").pvalue)
    assert f["p_one_sided"] == pytest.approx(0.05)
    assert f["reachable"] is False and f["alpha"] == 0.05 and f["n"] == [3, 3]
    # the observed P is the floor itself here (the most extreme data)
    assert r["p_two_tailed"] == pytest.approx(f["p"])


@pytest.mark.parametrize("n1, n2", [(2, 2), (2, 5), (3, 4), (4, 4), (5, 7), (8, 8)])
def test_mann_whitney_untied_closed_form(n1, n2):
    rng = np.random.default_rng(n1 * 10 + n2)
    a, b = rng.normal(size=n1), rng.normal(size=n2) + 0.3
    f = ttests.mann_whitney(a, b)["min_attainable_p"]
    assert f["p"] == pytest.approx(exactdist.untied_min_p_rank_sum(n1, n2), rel=1e-12)
    assert f["reachable"] == (2 / math.comb(n1 + n2, n1) < 0.05)


def _mw_enumerated(a, b):
    """Smallest two-sided P over all relabellings, by enumeration."""
    pooled = np.concatenate([a, b])
    ranks = stats.rankdata(pooled)
    n, na = pooled.size, len(a)
    e = na * (n + 1) / 2
    sums = [ranks[list(c)].sum() for c in itertools.combinations(range(n), na)]
    dev = np.abs(np.array(sums) - e)
    return float(np.mean(dev >= dev.max() - 1e-9))


@pytest.mark.parametrize("a, b", [
    ([1, 2, 2], [2, 3, 4]), ([1, 1, 1, 2], [2, 3, 3]), ([5, 5, 5], [5, 5, 6, 6])])
def test_mann_whitney_with_ties_matches_enumeration(a, b):
    f = ttests.mann_whitney(a, b)["min_attainable_p"]
    assert f["method"] == "exact"
    assert f["p"] == pytest.approx(_mw_enumerated(np.array(a, float), np.array(b, float)), rel=1e-12)


def test_all_values_tied_can_never_differ():
    f = ttests.mann_whitney([2, 2, 2], [2, 2, 2])["min_attainable_p"]
    assert f["p"] == pytest.approx(1.0)


@pytest.mark.parametrize("n", [3, 4, 5, 6, 8])
def test_wilcoxon_untied_closed_form_and_scipy(n):
    rng = np.random.default_rng(n)
    a = rng.normal(size=n)
    b = a - rng.uniform(0.1, 2, size=n)
    f = ttests.wilcoxon_matched_pairs(a, b)["min_attainable_p"]
    assert f["p"] == pytest.approx(2 / 2 ** n, rel=1e-12)
    d = np.abs(a - b)
    assert f["p"] == pytest.approx(stats.wilcoxon(d, method="exact").pvalue, rel=1e-12)
    assert f["p_one_sided"] == pytest.approx(1 / 2 ** n, rel=1e-12)
    assert f["reachable"] == (n >= 6)


def test_wilcoxon_zero_differences_are_dropped():
    a = [1.0, 2.0, 3.0, 4.0, 5.0]
    b = [1.0, 1.5, 2.0, 2.5, 6.0]  # one zero difference, four nonzero
    f = ttests.wilcoxon_matched_pairs(a, b)["min_attainable_p"]
    assert f["p"] == pytest.approx(2 / 2 ** 4)


def _kw_enumerated(groups):
    pooled = np.concatenate(groups)
    ranks = stats.rankdata(pooled)
    sizes = [len(g) for g in groups]
    labels = [i for i, n in enumerate(sizes) for _ in range(n)]
    scores = []
    for lab in set(itertools.permutations(labels)):
        lab = np.array(lab)
        scores.append(sum(ranks[lab == g].sum() ** 2 / n for g, n in enumerate(sizes)))
    scores = np.array(scores)
    return float(np.mean(scores >= scores.max() - 1e-9))


@pytest.mark.parametrize("groups", [
    [[1, 2], [3, 4], [5, 6]], [[1, 2, 3], [4, 5], [6, 7, 8]], [[1], [2, 3], [4, 5, 6]],
    [[1, 1, 2], [2, 3], [3, 3]]])
def test_kruskal_exact_matches_enumeration(groups):
    g = [np.array(x, float) for x in groups]
    f = anova.kruskal_wallis(groups, exact=True)["min_attainable_p"]
    assert f["method"] == "exact"
    assert f["p"] == pytest.approx(_kw_enumerated(g), rel=1e-9)


def test_kruskal_untied_hand_value():
    """2, 2, 2 values: the 3! block orders all reach the largest H, of
    6! / (2! 2! 2!) = 90 labellings: 6 / 90."""
    f = anova.kruskal_wallis([[1, 2], [3, 4], [5, 6]], exact=True)["min_attainable_p"]
    assert f["p"] == pytest.approx(6 / 90)


def test_kruskal_chi_square_floor_is_the_approximation_at_the_largest_h():
    f = anova.kruskal_wallis([[1, 2], [3, 4], [5, 6]])["min_attainable_p"]
    h_max = stats.kruskal([1, 2], [3, 4], [5, 6]).statistic
    assert f["method"] == "chi-square approximation"
    assert f["p"] == pytest.approx(stats.chi2.sf(h_max, 2), rel=1e-12)


@pytest.mark.parametrize("n, k", [(2, 3), (3, 3), (4, 3), (3, 4), (2, 4)])
def test_friedman_untied_closed_form(n, k):
    rng = np.random.default_rng(n * 7 + k)
    M = rng.normal(size=(n, k))
    f = repeated.friedman([list(M[:, j]) for j in range(k)], exact=True)["min_attainable_p"]
    assert f["p"] == pytest.approx(exactdist.untied_min_p_friedman(n, k), rel=1e-9)
    assert f["p"] == pytest.approx(math.factorial(k) ** (1 - n), rel=1e-9)


def test_friedman_with_ties_matches_enumeration():
    M = np.array([[1.0, 1.0, 2.0], [3.0, 4.0, 5.0], [2.0, 2.0, 2.5]])
    rows2 = [stats.rankdata(r) for r in M]
    scores = []
    for perms in itertools.product(*[list(itertools.permutations(r)) for r in rows2]):
        scores.append(float(np.sum(np.sum(perms, axis=0) ** 2)))
    scores = np.array(scores)
    expect = float(np.mean(scores >= scores.max() - 1e-9))
    f = repeated.friedman([list(M[:, j]) for j in range(3)], exact=True)["min_attainable_p"]
    assert f["p"] == pytest.approx(expect, rel=1e-9)


def test_api_carries_the_block_for_every_rank_test():
    two = {"datasets": [{"name": "A", "ys": [[1], [2], [3]]}, {"name": "B", "ys": [[4], [5], [6]]}]}
    mw = api.analyze({"analysis": "ttest", "data": two, "options": {"kind": "mann_whitney"}})
    wx = api.analyze({"analysis": "ttest", "data": two, "options": {"kind": "wilcoxon"}})
    three = {"datasets": two["datasets"] + [{"name": "C", "ys": [[7], [8], [9]]}]}
    kw = api.analyze({"analysis": "anova", "data": three, "options": {"kind": "nonparametric"}})
    fr = api.analyze({"analysis": "rm_anova", "data": three, "options": {"kind": "nonparametric"}})
    assert mw["min_attainable_p"]["p"] == pytest.approx(0.1)
    assert wx["min_attainable_p"]["p"] == pytest.approx(0.25)
    assert kw["min_attainable_p"]["p"] is not None
    assert fr["min_attainable_p"]["n"] == [3, 3]


def test_parametric_results_unchanged():
    """The block is added only to rank tests; P values are untouched."""
    r = ttests.mann_whitney([1.1, 2.4, 3.3, 7.0], [4.5, 5.2, 6.8, 9.9, 10.2])
    assert r["p_two_tailed"] == pytest.approx(
        stats.mannwhitneyu([1.1, 2.4, 3.3, 7.0], [4.5, 5.2, 6.8, 9.9, 10.2], method="exact").pvalue,
        rel=1e-14)
