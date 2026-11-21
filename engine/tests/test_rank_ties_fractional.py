"""Signed-rank tests with fractional data: tied and zero differences must
be recognised as in exact arithmetic.

GraphPad FAQ "Bug: Wilcoxon test with fractional data can give the wrong
result" (fixed in Prism 7.01): Before 11, 15, 36, 23, 37, 16, 19, 7 and
After 12, 14, 45, 35, 22, 24, 29, 11 give W+ = 26.5 and W- = -9.5 (After
- Before) at any scale. Computed in binary floating point, the
differences of the data divided by 100 (0.12 - 0.11 and 0.14 - 0.15)
are not exactly 0.01 in size, so ranking them as they are breaks the
tie (W+ 27, W- -9, P 0.25); R's wilcox.test still does (V = 27). The
rank tests on the values as entered (Mann-Whitney, Kruskal-Wallis,
Friedman) compare stored values, which tie exactly, and are checked to
be unchanged by the scale too."""

import numpy as np
import pytest

from opendose import anova, columnstats, effectsize, exactdist, repeated, ttests

BEFORE = [11, 15, 36, 23, 37, 16, 19, 7]
AFTER = [12, 14, 45, 35, 22, 24, 29, 11]
SCALES = [1, 100, 3, 7, 1e-6, 1e6]


@pytest.mark.parametrize("s", SCALES)
def test_wilcoxon_matched_pairs_graphpad_example_at_any_scale(s):
    r = ttests.wilcoxon_matched_pairs([v / s for v in AFTER], [v / s for v in BEFORE])
    assert r["sum_positive_ranks"] == 26.5
    assert r["sum_negative_ranks"] == -9.5
    # exact P with ties (the integer data): 0.265625 at every scale
    assert r["p_two_tailed"] == pytest.approx(0.265625, abs=1e-12)


@pytest.mark.parametrize("s", SCALES)
def test_rank_biserial_and_one_sample_signed_rank_are_scale_free(s):
    rb = effectsize.rank_biserial_paired([v / s for v in AFTER], [v / s for v in BEFORE])
    assert rb["rank_biserial"] == pytest.approx((26.5 - 9.5) / 36)
    diffs = [(a - b) / s for a, b in zip(AFTER, BEFORE)]
    one = columnstats.wilcoxon_signed_rank(diffs, 0.0)
    ref = columnstats.wilcoxon_signed_rank([a - b for a, b in zip(AFTER, BEFORE)], 0.0)
    assert one["p_two_tailed"] == pytest.approx(ref["p_two_tailed"], abs=1e-12)
    assert one["sum_signed_ranks"] == ref["sum_signed_ranks"]


def test_a_value_equal_to_the_hypothetical_in_exact_arithmetic_is_a_zero():
    # 0.1 + 0.2 is 0.30000000000000004 in floating point: still a zero difference
    r = columnstats.wilcoxon_signed_rank([0.1 + 0.2, 0.5, 0.7, 0.2, 0.9], 0.3)
    exact = columnstats.wilcoxon_signed_rank([0.3, 0.5, 0.7, 0.2, 0.9], 0.3)
    assert r["p_two_tailed"] == exact["p_two_tailed"]
    assert r["sum_signed_ranks"] == exact["sum_signed_ranks"]


def test_real_small_differences_are_kept():
    d = exactdist.snap_differences([1e-6, 2e-6, -1e-6], [1.0, 1.0 + 2e-6])
    assert np.count_nonzero(d) == 3 and len(set(np.abs(d))) == 2
    # differences far below a billionth of the data are rounding noise
    assert exactdist.snap_differences([1e-12], [1000.0])[0] == 0.0
    assert list(exactdist.snap_differences([0.0, 0.0])) == [0.0, 0.0]


@pytest.mark.parametrize("s", [100, 7, 1e-6])
def test_rank_tests_on_entered_values_are_unchanged_by_scale(s):
    g = [[1.2, 3.4, 2.2, 5.1, 3.4], [2.9, 4.4, 6.1, 3.4, 5.0], [7.7, 6.2, 3.4, 8.8, 6.2]]
    mw = ttests.mann_whitney(g[0], g[1])
    mws = ttests.mann_whitney([v / s for v in g[0]], [v / s for v in g[1]])
    assert mws["p_two_tailed"] == pytest.approx(mw["p_two_tailed"], abs=1e-12)
    kw = anova.kruskal_wallis(g, ["A", "B", "C"])
    kws = anova.kruskal_wallis([[v / s for v in x] for x in g], ["A", "B", "C"])
    assert kws["p"] == pytest.approx(kw["p"], abs=1e-12)
    fr = repeated.friedman(g, ["A", "B", "C"])
    frs = repeated.friedman([[v / s for v in x] for x in g], ["A", "B", "C"])
    assert frs["p"] == pytest.approx(fr["p"], abs=1e-12)
