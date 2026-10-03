"""Exact Spearman P values for 17 or fewer pairs (opendose.correlation).

The statistics guide ("Interpreting results: Correlation") computes the
Spearman P value exactly from all permutations with 17 or fewer XY
pairs, ties included, and from the t ratio with 18 or more. GraphPad FAQ
1982 notes that with ties the permutation distribution is asymmetric
and works the example X = 1, 2, 3, 3, 4 / Y = 2, 1, 2, 2, 2: rs = 0.36,
one-tailed P = 0.4, two-tailed P = 0.6 (pinned below).

Pinned reference values:
- Brute-force enumeration of all n! permutations (n <= 9, and with ties
  n <= 8): the counted distribution must be identical.
- scipy.stats.permutation_test with full enumeration (n_resamples=inf).
  Its two-sided P doubles the smaller one-sided P, which equals
  P(|rs| >= |observed|) only when the null distribution is symmetric
  (no ties in at least one variable), so it is used for those cases.
- "Upper Critical Values of Spearman's Rank Correlation Coefficient Rs"
  (University of York, Department of Mathematics historical tables,
  www.york.ac.uk/depts/maths/histstat/tables/spearman.pdf): the smallest
  rs whose one-sided P(Rs >= rs) does not exceed the nominal alpha, for
  alpha = 0.10, 0.05, 0.025, 0.01, 0.005, 0.001 and n = 5..17. These
  agree with Zar's Table B.20 (two-sided alpha = 2 x one-sided) for
  n <= 16, e.g. n = 10, two-sided 0.05 -> 0.648. For n = 17 the exact
  two-sided 0.05 critical value is 0.488 (sum d^2 = 418, exact two-sided
  P = 0.0490); a printed 0.490 for n = 17 (sum d^2 = 416) is the next
  grid point, i.e. a conservative/approximate entry, not the exact one.
- Closed-form counts for n = 17: one permutation with sum d^2 = 0,
  n - 1 with 2 (adjacent swaps), C(n-2, 2) with 4 (two disjoint
  adjacent swaps), 2(n-2) + C(n-3, 3) with 6 (consecutive 3-cycles or
  three disjoint adjacent swaps).
"""

import itertools
import math
import time
from collections import Counter

import numpy as np
import pytest
from scipy import stats

from opendose import correlation as C
from opendose import multivar

# York table (one-sided nominal alpha); None = no rs reaches alpha
ALPHAS = (0.10, 0.05, 0.025, 0.01, 0.005, 0.001)
YORK = {
    5: (0.800, 0.900, 1.000, 1.000, None, None),
    6: (0.657, 0.829, 0.886, 0.943, 1.000, None),
    7: (0.571, 0.714, 0.786, 0.893, 0.929, 1.000),
    8: (0.524, 0.643, 0.738, 0.833, 0.881, 0.952),
    9: (0.483, 0.600, 0.700, 0.783, 0.833, 0.917),
    10: (0.455, 0.564, 0.648, 0.745, 0.794, 0.879),
    11: (0.427, 0.536, 0.618, 0.709, 0.755, 0.845),
    12: (0.406, 0.503, 0.587, 0.678, 0.727, 0.818),
    13: (0.385, 0.484, 0.560, 0.648, 0.703, 0.791),
    14: (0.367, 0.464, 0.538, 0.626, 0.679, 0.771),
    15: (0.354, 0.446, 0.521, 0.604, 0.654, 0.750),
    16: (0.341, 0.429, 0.503, 0.582, 0.635, 0.729),
    17: (0.328, 0.414, 0.488, 0.566, 0.618, 0.711),
}


def _rank_r(x, yy, axis=-1):
    rx = stats.rankdata(x)
    cx = rx - rx.mean()
    ry = stats.rankdata(yy, axis=axis)
    ry = ry - ry.mean(axis=axis, keepdims=True)
    return (ry @ cx) / np.sqrt((ry ** 2).sum(axis=axis) * (cx @ cx))


def _brute(x, y):
    """Counter of n * S - sum(a) sum(b) (S = sum a_i b_pi(i), a, b twice
    the midranks) over all n! permutations, and the observed value."""
    a, b = C._double_ranks(x), C._double_ranks(y)
    n = a.size
    ab = int(a.sum()) * int(b.sum())
    dev = Counter(n * int(a @ b[list(p)]) - ab
                  for p in itertools.permutations(range(n)))
    return dev, n * int(a @ b) - ab


class TestDistribution:
    @pytest.mark.parametrize("n", range(2, 10))
    def test_equals_brute_force_without_ties(self, n):
        d = C.spearman_null_distribution(n)
        r = np.arange(n)
        ref = Counter(int(((r - np.array(p)) ** 2).sum())
                      for p in itertools.permutations(range(n)))
        assert dict(zip(d["sum_d2"].tolist(), d["counts"].tolist())) == \
            dict(ref)
        assert int(d["counts"].sum()) == math.factorial(n)

    def test_equals_brute_force_with_ties(self):
        rng = np.random.default_rng(5)
        checked = 0
        while checked < 60:
            n = int(rng.integers(3, 9))
            x = rng.integers(0, int(rng.integers(2, n + 2)), n).astype(float)
            y = rng.integers(0, int(rng.integers(2, n + 2)), n).astype(float)
            if np.ptp(x) == 0 or np.ptp(y) == 0:
                continue
            dev, obs = _brute(x, y)
            tot = math.factorial(n)
            two = sum(c for d, c in dev.items() if abs(d) >= abs(obs)) / tot
            up = sum(c for d, c in dev.items() if d >= obs) / tot
            down = sum(c for d, c in dev.items() if d <= obs) / tot
            assert C.spearman_exact_p(x, y) == two
            assert C.spearman_exact_p(x, y, alternative="greater") == up
            assert C.spearman_exact_p(x, y, alternative="less") == down
            # every recursion plan (orientation, odd-score split) counts
            # the same distribution
            a, b = C._double_ranks(x), C._double_ranks(y)
            dists = []
            for wf, wl, v, scale, offset in C._plans(a, b) + C._plans(b, a):
                t0, cnt = C._perm_sum_counts(wf, wl, v)
                idx = np.flatnonzero(cnt)
                dists.append(dict(zip((offset + scale * (t0 + idx)).tolist(),
                                      cnt[idx].tolist())))
            assert all(dd == dists[0] for dd in dists)
            checked += 1

    def test_n17_closed_form_counts_and_symmetry(self):
        n = 17
        d = C.spearman_null_distribution(n)
        counts = dict(zip(d["sum_d2"].tolist(), d["counts"].tolist()))
        assert int(d["counts"].sum()) == math.factorial(17)
        assert counts[0] == 1
        assert counts[2] == n - 1
        assert counts[4] == math.comb(n - 2, 2)
        assert counts[6] == 2 * (n - 2) + math.comb(n - 3, 3)
        # no ties: symmetric about sum d^2 = (n^3 - n) / 6
        top = (n ** 3 - n) // 3
        assert all(counts.get(top - k, 0) == c for k, c in counts.items())

    @pytest.mark.parametrize("n", sorted(YORK))
    def test_york_critical_values(self, n):
        d = C.spearman_null_distribution(n)
        d2, cnt, tot = d["sum_d2"], d["counts"], d["total"]
        denom = n ** 3 - n
        for alpha, expected in zip(ALPHAS, YORK[n]):
            crit = None
            for k in range(0, denom // 6 + 1, 2):  # rs = 1 - 6 k / denom
                p_upper = int(cnt[d2 <= k].sum()) / tot
                if p_upper <= alpha:
                    crit = 1 - 6 * k / denom
                else:
                    break
            if expected is None:
                assert crit is None
            else:
                assert round(crit, 3) == expected, (n, alpha, crit)

    def test_n17_two_sided_05_critical_value(self):
        # exact: rs = 0.4877 (sum d^2 = 418) has two-sided P 0.0490; the
        # next larger sum d^2 (420, rs = 0.4853) exceeds 0.05
        rank = np.arange(1, 18, dtype=float)
        for d2, p_expected_le in ((418, True), (420, False)):
            # build a permutation with that sum d^2 by swaps
            perm = _perm_with_sum_d2(17, d2)
            p = C.spearman_exact_p(rank, rank[perm])
            assert (p <= 0.05) is p_expected_le
            assert C.correlate(rank, rank[perm], method="spearman")["r"] == \
                pytest.approx(1 - 6 * d2 / (17 ** 3 - 17))


def _perm_with_sum_d2(n, target):
    """A permutation of range(n) with sum of squared displacements equal
    to target (greedy search over transpositions)."""
    perm = list(range(n))
    cur = 0
    while cur != target:
        best = None
        for i in range(n):
            for j in range(i + 1, n):
                delta = 2 * (j - i) * (perm[j] - perm[i])
                if 0 < delta <= target - cur and (best is None
                                                  or delta > best[0]):
                    best = (delta, i, j)
        if best is None:
            raise AssertionError("no permutation found")
        _, i, j = best
        perm[i], perm[j] = perm[j], perm[i]
        cur = sum((k - v) ** 2 for k, v in enumerate(perm))
    return perm


class TestPValues:
    def test_graphpad_faq_1982_example(self):
        x, y = [1, 2, 3, 3, 4], [2, 1, 2, 2, 2]
        r = C.correlate(x, y, method="spearman")
        assert round(r["r"], 2) == 0.36
        assert r["p_two_tailed"] == pytest.approx(0.6, abs=1e-15)
        assert r["p_type"] == "exact"
        assert C.spearman_exact_p(x, y, alternative="greater") == \
            pytest.approx(0.4, abs=1e-15)

    @pytest.mark.parametrize("seed", [0, 1, 2])
    def test_permutation_test_full_enumeration(self, seed):
        rng = np.random.default_rng(seed)
        x = rng.normal(size=9)
        y = 0.5 * x + rng.normal(size=9)
        y[3] = y[5]  # a tie in y only: the null stays symmetric
        ref = stats.permutation_test(
            (y,), lambda yy, axis=-1: _rank_r(x, yy, axis),
            permutation_type="pairings", n_resamples=np.inf,
            vectorized=True, alternative="two-sided")
        assert C.spearman_exact_p(x, y) == pytest.approx(ref.pvalue,
                                                         rel=1e-12)
        for alt in ("greater", "less"):
            ref = stats.permutation_test(
                (y,), lambda yy, axis=-1: _rank_r(x, yy, axis),
                permutation_type="pairings", n_resamples=np.inf,
                vectorized=True, alternative=alt)
            assert C.spearman_exact_p(x, y, alternative=alt) == \
                pytest.approx(ref.pvalue, rel=1e-12)

    def test_monte_carlo_n17_with_ties(self):
        rng = np.random.default_rng(1)
        x = np.r_[np.arange(16.0), 3.0]
        y = np.r_[rng.permutation(16).astype(float), 5.0]
        p = C.spearman_exact_p(x, y)
        a, b = C._double_ranks(x), C._double_ranks(y)
        sims = rng.permuted(np.tile(b, (200000, 1)), axis=1)
        dev = 17 * (sims @ a) - a.sum() * b.sum()
        obs = 17 * (a @ b) - a.sum() * b.sum()
        mc = float(np.mean(np.abs(dev) >= abs(obs)))
        assert abs(p - mc) < 5 * math.sqrt(p * (1 - p) / 200000)

    def test_deterministic_and_fast_n17(self):
        rng = np.random.default_rng(4)
        x, y = rng.normal(size=17), rng.normal(size=17)
        C._perm_sum_distribution.cache_clear()
        t0 = time.perf_counter()
        p1 = C.spearman_exact_p(x, y)
        elapsed = time.perf_counter() - t0
        C._perm_sum_distribution.cache_clear()
        p2 = C.spearman_exact_p(x, y)
        assert p1 == p2
        assert elapsed < 5.0  # ~0.3-0.5 s natively

    def test_correlate_switches_to_t_above_17(self):
        rng = np.random.default_rng(7)
        for n, kind in ((17, "exact"), (18, "approximate")):
            x, y = rng.normal(size=n), rng.normal(size=n)
            r = C.correlate(x, y, method="spearman")
            assert r["p_type"] == kind
            if kind == "approximate":
                assert r["p_two_tailed"] == pytest.approx(
                    stats.spearmanr(x, y).pvalue, rel=1e-12)
            else:
                assert r["p_two_tailed"] == C.spearman_exact_p(x, y)
        with pytest.raises(ValueError):
            C.spearman_exact_p(np.arange(18.0), np.arange(18.0))


class TestCorrelationMatrix:
    def _vars(self, **cols):
        return [{"name": k, "values": list(v)} for k, v in cols.items()]

    def test_p_type_and_exact_values_up_to_17(self):
        rng = np.random.default_rng(11)
        a = rng.normal(size=20)
        b = a + rng.normal(size=20)
        c = [None] * 4 + list(rng.normal(size=16))  # 16 pairs with a, b
        res = multivar.correlation_matrix(self._vars(a=a, b=b, c=c),
                                          method="spearman")
        assert res["p_type"][0][1] == "approximate"   # 20 pairs
        assert res["p_type"][0][2] == "exact"         # 16 pairs
        assert res["p"][0][2] == C.spearman_exact_p(a[4:], c[4:])

    def test_one_tailed_exact_uses_observed_direction(self):
        x, y = [1, 2, 3, 3, 4], [2, 1, 2, 2, 2]
        two = multivar.correlation_matrix(self._vars(x=x, y=y),
                                          method="spearman")
        one = multivar.correlation_matrix(self._vars(x=x, y=y),
                                          method="spearman", tails=1)
        assert two["p"][0][1] == pytest.approx(0.6)
        # asymmetric with ties: one-tailed 0.4 is not half of 0.6
        assert one["p"][0][1] == pytest.approx(0.4)
