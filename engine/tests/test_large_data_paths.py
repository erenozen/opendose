"""The large-data code paths return what the direct (O(n^2)) methods do.

Each fast path switches on above a module-level threshold; the tests
force it below the threshold (monkeypatch) and compare with the direct
method on the same data, ties included:

- opendose.orderstats: k-th pairwise difference / Walsh average (exact
  selection, Johnson & Mizoguchi 1978; Monahan 1984; Floyd & Rivest
  1975) and the Kendall concordance counts (Knight 1966);
- ttests.PAIRWISE_DIRECT_MAX: Hodges-Lehmann shift and CI (Mann-Whitney),
  Hodges-Lehmann median and CI (Wilcoxon, column statistics);
- effectsize.CLIFF_DIRECT_MAX_PAIRS: Cliff's delta from sorted samples;
- correlation.KENDALL_DIRECT_MAX_N: Kendall's tau without sign matrices;
- columnstats.MEDIAN_CI_LOOP_MAX_N: vectorised binomial median CI.
"""

import math

import numpy as np
import pytest

from opendose import (api, columnstats, correlation, effectsize, multivar,
                      orderstats, ttests)


def _samples(seed):
    """(a, b) pairs: continuous, heavy ties, mixed magnitudes, values one
    ulp apart, signed zeros, tiny samples."""
    rng = np.random.default_rng(seed)
    one = 1.0 + np.arange(6) * np.finfo(float).eps
    return [
        (rng.normal(size=37), rng.normal(0.4, 2, size=23)),
        (rng.integers(0, 4, 41).astype(float),
         rng.integers(0, 4, 29).astype(float)),
        (rng.normal(size=30) * 1e8, rng.normal(size=19) * 1e-6),
        (rng.choice(one, 33), rng.choice(one, 21) - 1e-16),
        (np.array([0.0, -0.0, 0.0, 1.0, -1.0, -0.0]),
         np.array([-0.0, 0.0, 2.0, -2.0])),
        (np.array([3.0]), np.array([1.0, 2.0, 2.0])),
        (rng.exponential(size=50) ** 3, rng.exponential(size=47) ** 3),
    ]


# Selection configurations: the defaults, and ones that force many
# deterministic / sampling steps on small inputs.
CONFIGS = [
    {},
    {"_GATHER": 1, "_GATHER_PER_ROW": 0, "_SAMPLE": 8},
    {"_GATHER": 1, "_GATHER_PER_ROW": 0, "_SAMPLE": 64, "_SAMPLE_Z": 0.3},
    {"_GATHER": 5, "_GATHER_PER_ROW": 0, "_SAMPLE": 256, "_SAMPLE_Z": 3.0},
]


@pytest.fixture(params=range(len(CONFIGS)))
def selection_config(request, monkeypatch):
    for name, value in CONFIGS[request.param].items():
        monkeypatch.setattr(orderstats, name, value)
    return CONFIGS[request.param]


@pytest.mark.parametrize("seed", [1, 2])
def test_kth_pairwise_difference_is_the_sorted_outer_difference(
        seed, selection_config):
    for a, b in _samples(seed):
        diffs = np.sort(np.subtract.outer(a, b).ravel())
        ks = sorted({1, 2, diffs.size // 3, (diffs.size + 1) // 2,
                     diffs.size - 1, diffs.size} - {0, diffs.size + 1})
        for k in ks:
            got = orderstats.kth_pairwise_difference(a, b, k)
            assert got == diffs[k - 1] or (got == 0 and diffs[k - 1] == 0)
        # orientation: the larger sample as rows
        for k in ks:
            assert orderstats.kth_pairwise_difference(b, a, k) == \
                np.sort(np.subtract.outer(b, a).ravel())[k - 1]
        assert orderstats.hodges_lehmann_shift(a, b) == \
            ttests._hodges_lehmann(a, b)


@pytest.mark.parametrize("seed", [3, 4])
def test_kth_walsh_average_is_the_sorted_walsh_set(seed, selection_config):
    for x, _ in _samples(seed):
        iu = np.triu_indices(x.size)
        walsh = np.sort(((x[:, None] + x[None, :]) / 2.0)[iu])
        for k in sorted({1, 2, walsh.size // 4, (walsh.size + 1) // 2,
                         walsh.size} - {0, walsh.size + 1}):
            assert orderstats.kth_walsh_average(x, k) == walsh[k - 1]
        assert orderstats.hodges_lehmann_walsh(x) == float(np.median(walsh))


def test_selection_rejects_ranks_out_of_range():
    with pytest.raises(ValueError):
        orderstats.kth_pairwise_difference([1.0], [2.0], 2)
    with pytest.raises(ValueError):
        orderstats.kth_walsh_average([1.0, 2.0], 0)


def test_selection_at_scale_matches_direct_sort():
    # 700 x 800 = 560,000 differences: above the direct threshold, small
    # enough to sort here
    rng = np.random.default_rng(7)
    a = np.round(rng.normal(size=700), 2)
    b = np.round(rng.normal(0.1, 1.3, size=800), 2)
    diffs = np.sort(np.subtract.outer(a, b).ravel())
    for k in (1, 1234, diffs.size // 2, diffs.size // 2 + 1, diffs.size):
        assert orderstats.kth_pairwise_difference(a, b, k) == diffs[k - 1]
    walsh = np.sort(((a[:, None] + a[None, :]) / 2.0)[np.triu_indices(700)])
    for k in (1, 999, walsh.size // 2, walsh.size):
        assert orderstats.kth_walsh_average(a, k) == walsh[k - 1]


# --------------------------------------------------- Mann-Whitney / Wilcoxon

def _mw_keys(res):
    return (res["hodges_lehmann_difference"], res["ci_hodges_lehmann"],
            res["ci_actual_level"], res["U"], res["p_two_tailed"],
            res["p_method"])


@pytest.mark.parametrize("seed", [5, 6])
def test_mann_whitney_fast_path_equals_direct(seed, monkeypatch,
                                              selection_config):
    for a, b in _samples(seed):
        direct = ttests.mann_whitney(a, b)
        monkeypatch.setattr(ttests, "PAIRWISE_DIRECT_MAX", 0)
        fast = ttests.mann_whitney(a, b)
        monkeypatch.setattr(ttests, "PAIRWISE_DIRECT_MAX", 250_000)
        assert _mw_keys(fast) == _mw_keys(direct)


@pytest.mark.parametrize("na,nb", [(500, 500), (501, 500)])
def test_mann_whitney_either_side_of_the_threshold(na, nb, monkeypatch):
    # 500 x 500 = 250,000 pairs is the last direct size; 501 x 500 the
    # first selected one. Both must equal the direct method.
    rng = np.random.default_rng(na)
    a = np.round(rng.normal(size=na), 1)        # ties
    b = np.round(rng.normal(0.2, 1, size=nb), 1)
    res = ttests.mann_whitney(a, b)
    monkeypatch.setattr(ttests, "PAIRWISE_DIRECT_MAX", 10 ** 12)
    assert _mw_keys(res) == _mw_keys(ttests.mann_whitney(a, b))


@pytest.mark.parametrize("seed", [8, 9])
def test_walsh_ci_fast_path_equals_direct(seed, monkeypatch,
                                          selection_config):
    for x, y in _samples(seed):
        for level in (0.95, 0.99, 0.5):
            direct = ttests.walsh_ci(x, level)
            monkeypatch.setattr(ttests, "PAIRWISE_DIRECT_MAX", 0)
            fast = ttests.walsh_ci(x, level)
            monkeypatch.setattr(ttests, "PAIRWISE_DIRECT_MAX", 250_000)
            assert fast == direct
        if x.size == y.size or x.size > y.size:
            d = x[:y.size]
            if np.any(d - y != 0):
                direct = ttests.wilcoxon_matched_pairs(d, y)
                monkeypatch.setattr(ttests, "PAIRWISE_DIRECT_MAX", 0)
                fast = ttests.wilcoxon_matched_pairs(d, y)
                monkeypatch.setattr(ttests, "PAIRWISE_DIRECT_MAX", 250_000)
                assert fast == direct


@pytest.mark.parametrize("n", [706, 707])
def test_walsh_ci_either_side_of_the_threshold(n, monkeypatch):
    # 706 values -> 249,571 averages (direct); 707 -> 250,278 (selected)
    rng = np.random.default_rng(n)
    x = np.round(rng.normal(size=n), 2)
    res = ttests.walsh_ci(x)
    stat = columnstats.wilcoxon_signed_rank(x, 0.1)
    monkeypatch.setattr(ttests, "PAIRWISE_DIRECT_MAX", 10 ** 12)
    assert res == ttests.walsh_ci(x)
    assert stat == columnstats.wilcoxon_signed_rank(x, 0.1)


# ----------------------------------------------------------- Cliff's delta

def _cliff_compare(fast, direct):
    for key in ("cliffs_delta", "rank_biserial", "cles", "p_a_greater",
                "p_a_less", "p_tie", "n_a", "n_b", "ci_method"):
        assert fast[key] == direct[key], key
    for key in ("se_cliffs_delta",):
        if direct[key] is None:
            assert fast[key] is None
        else:
            assert fast[key] == pytest.approx(direct[key], rel=1e-10,
                                              abs=1e-15)
    for key in ("ci_cliffs_delta", "ci_cles"):
        if direct[key] is None:
            assert fast[key] is None
        else:
            np.testing.assert_allclose(fast[key], direct[key], rtol=1e-10,
                                       atol=1e-14)


@pytest.mark.parametrize("seed", [10, 11, 12])
def test_cliffs_delta_fast_path_equals_direct(seed, monkeypatch):
    rng = np.random.default_rng(seed)
    cases = _samples(seed) + [
        (np.arange(10.0), np.arange(10.0) + 100),        # separation
        (np.arange(10.0) + 100, np.arange(10.0)),
        (np.full(7, 2.0), np.full(5, 2.0)),              # all tied
        (rng.integers(0, 2, 60).astype(float),
         rng.integers(0, 2, 70).astype(float)),
    ]
    for a, b in cases:
        direct = effectsize.cliffs_delta(a, b)
        monkeypatch.setattr(effectsize, "CLIFF_DIRECT_MAX_PAIRS", 0)
        fast = effectsize.cliffs_delta(a, b)
        monkeypatch.setattr(effectsize, "CLIFF_DIRECT_MAX_PAIRS", 250_000)
        _cliff_compare(fast, direct)


def test_cliffs_delta_equals_mann_whitney_u():
    # delta = 2 U / (n_a n_b) - 1 (Cliff 1993)
    rng = np.random.default_rng(13)
    a = np.round(rng.normal(size=900), 1)
    b = np.round(rng.normal(0.3, 1, size=800), 1)
    res = ttests.mann_whitney(a, b)
    assert res["effect_size"]["cliffs_delta"] == pytest.approx(
        2 * res["U"] / (a.size * b.size) - 1, abs=1e-14)


# ------------------------------------------------------------ Kendall's tau

@pytest.mark.parametrize("seed", [14, 15, 16])
def test_kendall_fast_counts_equal_sign_matrices(seed, monkeypatch):
    rng = np.random.default_rng(seed)
    cases = [
        (rng.normal(size=60), rng.normal(size=60)),
        (rng.integers(0, 5, 80).astype(float),
         rng.integers(0, 3, 80).astype(float)),
        (np.arange(30.0), np.arange(30.0)),
        (np.arange(30.0), -np.arange(30.0)),
        (np.array([1.0, 1.0, 2.0, 2.0, 3.0]), np.array([1.0, 1.0, 1.0, 2.0,
                                                         2.0])),
        (rng.normal(size=7), rng.normal(size=7)),
    ]
    for a, b in cases:
        direct = correlation.kendall(a, b)
        monkeypatch.setattr(correlation, "KENDALL_DIRECT_MAX_N", 0)
        fast = correlation.kendall(a, b)
        monkeypatch.setattr(correlation, "KENDALL_DIRECT_MAX_N", 1000)
        assert fast == direct or (math.isnan(direct["tau"])
                                  and math.isnan(fast["tau"]))


@pytest.mark.parametrize("n", [1, 2, 3, 17, 64, 65, 300])
def test_count_inversions_matches_brute_force(n):
    rng = np.random.default_rng(n)
    y = rng.integers(0, max(2, n // 3), n)
    brute = sum(int(y[i] > y[j]) for i in range(n) for j in range(i + 1, n))
    assert orderstats.count_inversions(y) == brute


# ------------------------------------------------------- column statistics

def test_median_ci_vectorised_equals_loop(monkeypatch):
    rng = np.random.default_rng(17)
    for n in list(range(1, 120)) + [999, 1000, 1001, 2500]:
        x = rng.normal(size=n)
        for level in (0.95, 0.99, 0.9, 0.5):
            monkeypatch.setattr(columnstats, "MEDIAN_CI_LOOP_MAX_N", 10 ** 9)
            loop = columnstats.median_ci(x, level)
            monkeypatch.setattr(columnstats, "MEDIAN_CI_LOOP_MAX_N", 0)
            vec = columnstats.median_ci(x, level)
            assert vec == loop, (n, level)


def test_normality_tests_option_true_selects_all_four():
    x = np.random.default_rng(18).normal(size=40)
    res = columnstats.normality_tests(x, True)
    assert set(res) == {"shapiro_wilk", "dagostino_pearson",
                        "anderson_darling", "kolmogorov_smirnov"}
    assert columnstats.normality_tests(x, False) == \
        columnstats.normality_tests(x)


def test_shapiro_wilk_beyond_its_range_says_so():
    x = np.random.default_rng(19).normal(size=5001)
    assert "note" in columnstats.normality_tests(x)["shapiro_wilk"]
    assert "note" not in columnstats.normality_tests(x[:5000])["shapiro_wilk"]


# ------------------------------------------------------ correlation matrix

def test_correlation_matrix_pairs_complete_cases_as_before():
    rng = np.random.default_rng(20)
    cols = [list(rng.normal(size=40)) for _ in range(4)]
    for c, holes in zip(cols, ([3, 7], [], [7, 11, 30], [0])):
        for h in holes:
            c[h] = None
    variables = [{"name": f"V{i}", "kind": "continuous", "values": c}
                 for i, c in enumerate(cols)]
    for method in ("pearson", "spearman", "kendall"):
        res = multivar.correlation_matrix(variables, method=method)
        for i in range(4):
            for j in range(i + 1, 4):
                pairs = [(x, y) for x, y in zip(cols[i], cols[j])
                         if x is not None and y is not None]
                ref = correlation.correlate([p[0] for p in pairs],
                                            [p[1] for p in pairs],
                                            method=method)
                assert res["n"][i][j] == len(pairs)
                assert res["r"][i][j] == ref["r"]
                assert res["p"][i][j] == min(ref["p_two_tailed"], 1.0)


def test_large_mann_whitney_through_the_api_is_exact_and_labelled():
    rng = np.random.default_rng(21)
    a, b = np.round(rng.normal(size=3000), 1), np.round(rng.normal(size=2000), 1)
    res = api.analyze({"analysis": "ttest", "options": {"kind": "mann_whitney"},
                       "data": {"x": [], "datasets": [
                           {"name": "A", "ys": [[float(v)] for v in a]},
                           {"name": "B", "ys": [[float(v)] for v in b]}]}})
    diffs = np.sort(np.subtract.outer(a, b).ravel())
    assert res["hodges_lehmann_difference"] == float(np.median(diffs))
    assert res["p_method"] == "approximate"
