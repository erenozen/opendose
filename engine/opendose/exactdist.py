"""Exact (permutation) null distributions used by the nonparametric tests.

GraphPad statistics guide pages whose documented rules these implement:

- "Interpreting results: Mann-Whitney test" (how_the_mann-whitney_test_
  works.htm): the P value is exact, even with ties, when the smaller
  sample has 100 or fewer values; Prism "tabulates every possible way to
  shuffle the data into two groups of the sample size actually used, and
  computes the fraction of those shuffled data sets where the difference
  between mean ranks was as large or larger than actually observed".
  rank_sum_null() is that shuffle distribution (midranks for ties).
- "Results: Wilcoxon matched pairs test" and "Interpreting results:
  Wilcoxon signed rank test": exact P with fewer than 200 pairs (values),
  even with ties; zeros are either dropped (Wilcoxon) or ranked and left
  unsigned (Pratt). signed_rank_null() is the distribution of the sum of
  positive ranks over the 2^n equally likely sign patterns.
- "Interpreting results: Kolmogorov-Smirnov test": exact when the number
  of ways to choose n1 values from n1 + n2 is below 60,000, ties included
  (the fraction of reshuffled data sets whose D is >= the observed D).
  ks_2samp_exact_p() counts lattice paths, checking D only where the
  pooled sorted values change, which is the same shuffle distribution.
- "Interpreting results: Friedman test": exact when (T!)^S <= 10^9 (T
  treatments, S subjects), ties allowed; values are permuted within each
  row. friedman_exact_p() convolves the per-row rank permutations.
- "How the Dunnett T3, Games and Howell, and Tamhane T2 tests work":
  Dunnett's T3 takes its P values and critical values from the
  studentized maximum modulus distribution (smm_cdf / smm_ppf).

Ranks are carried as doubled integers (midranks of ties are multiples of
1/2), so every comparison with the observed statistic is exact.
"""

from __future__ import annotations

import math
from itertools import permutations

import numpy as np
from scipy import integrate, optimize, special, stats


def doubled_midranks(values) -> np.ndarray:
    """2 x midrank of each value (integers)."""
    return np.rint(2.0 * stats.rankdata(values)).astype(np.int64)


def has_ties(values) -> bool:
    arr = np.asarray(values, dtype=float)
    return np.unique(arr).size < arr.size


# ----------------------------------------------------------- rank sum (MWU)

# Work budget (array cells touched) for the exact rank-sum distribution;
# beyond it the normal approximation is used and labelled as such.
RANK_SUM_BUDGET = 2e9


def rank_sum_null(ranks2, n_pick: int) -> np.ndarray:
    """P(sum of n_pick of the doubled ranks = s), s = 0..sum(ranks2)."""
    ranks2 = np.asarray(ranks2, dtype=np.int64)
    top = int(np.sort(ranks2)[::-1][:n_pick].sum())
    dist = np.zeros((n_pick + 1, top + 1))
    dist[0, 0] = 1.0
    for idx, r in enumerate(ranks2):
        r = int(r)
        jmax = min(idx + 1, n_pick)
        # numpy buffers overlapping in-place ufuncs, so the right side is
        # the table before this item was added
        if r <= top:
            dist[1:jmax + 1, r:] += dist[0:jmax, :top + 1 - r]
    total = math.comb(len(ranks2), n_pick)
    return dist[n_pick] / float(total)


def rank_sum_exact_feasible(n_small: int, n_large: int) -> bool:
    n = n_small + n_large
    return n_small * (2 * n_small * n + 1) * n <= RANK_SUM_BUDGET


def rank_sum_two_sided_p(values_a, values_b) -> float:
    """Exact two-sided permutation P of the Mann-Whitney test (ties ok):
    P(|R - E[R]| >= |R_obs - E[R]|), R = rank sum of the smaller group."""
    a = np.asarray(values_a, dtype=float)
    b = np.asarray(values_b, dtype=float)
    if a.size > b.size:
        a, b = b, a
    pooled = np.concatenate([a, b])
    r2 = doubled_midranks(pooled)
    n_s, n = a.size, pooled.size
    obs2 = int(r2[:n_s].sum())         # 2 * R (doubled ranks)
    expected2 = n_s * (n + 1)          # 2 * E[R]
    dist = rank_sum_null(r2, n_s)
    s2 = np.arange(dist.size)
    mask = np.abs(s2 - expected2) >= abs(obs2 - expected2)
    return float(min(dist[mask].sum(), 1.0))


# ------------------------------------------------------- signed rank (WSR)

def signed_rank_null(ranks2) -> np.ndarray:
    """P(sum of the positive doubled ranks = s) when every sign is +/-
    with probability 1/2 independently."""
    ranks2 = np.asarray(ranks2, dtype=np.int64)
    total = int(ranks2.sum())
    dist = np.zeros(total + 1)
    dist[0] = 1.0
    for r in ranks2:
        r = int(r)
        shifted = np.zeros_like(dist)
        shifted[r:] = dist[:total + 1 - r]
        dist = 0.5 * (dist + shifted)
    return dist


def signed_rank_two_sided_p(ranks2, positive_mask) -> float:
    """Exact two-sided P for the signed-rank statistic: P(|T+ - E| >=
    |t+ - E|), ranks2 = doubled ranks of the nonzero differences."""
    ranks2 = np.asarray(ranks2, dtype=np.int64)
    t_obs = int(ranks2[np.asarray(positive_mask, bool)].sum())
    total = int(ranks2.sum())
    dist = signed_rank_null(ranks2)
    s = np.arange(dist.size)
    mask = np.abs(2 * s - total) >= abs(2 * t_obs - total)
    return float(min(dist[mask].sum(), 1.0))


def signed_rank_ci_index(n: int, ci_level: float):
    """Largest k with P(T+ <= k-1) <= alpha/2 for n untied ranks; the CI
    of the median runs from the k-th to the (M-k+1)-th Walsh average.
    Returns (k, actual confidence level) or (None, None)."""
    alpha = 1.0 - ci_level
    if n < 200:
        cdf = np.cumsum(signed_rank_null(2 * np.arange(1, n + 1)))[::2]
        # cdf[t] = P(T+ <= t), t in rank units
        ks = np.nonzero(cdf <= alpha / 2 + 1e-12)[0]
        if ks.size == 0:
            return None, None
        k = int(ks[-1]) + 1
        return k, float(1.0 - 2.0 * cdf[k - 1])
    m = n * (n + 1) / 4.0
    sd = math.sqrt(n * (n + 1) * (2 * n + 1) / 24.0)
    z = stats.norm.ppf(1 - alpha / 2)
    k = int(math.floor(m - z * sd))
    if k < 1:
        return None, None
    return k, float(1 - 2 * stats.norm.cdf((k - 1 + 0.5 - m) / sd))


def rank_sum_ci_index(n1: int, n2: int, ci_level: float):
    """Largest k with P(U <= k-1) <= alpha/2 (untied null); the CI of the
    Hodges-Lehmann shift runs from the k-th to the (n1 n2 - k + 1)-th
    pairwise difference. Returns (k, actual level) or (None, None)."""
    alpha = 1.0 - ci_level
    if min(n1, n2) <= 100 and rank_sum_exact_feasible(min(n1, n2),
                                                     max(n1, n2)):
        n_s = min(n1, n2)
        n = n1 + n2
        dist = rank_sum_null(2 * np.arange(1, n + 1), n_s)[::2]
        # dist[w] = P(rank sum = w); U = W - n_s(n_s+1)/2
        offset = n_s * (n_s + 1) // 2
        cdf_u = np.cumsum(dist[offset:])
        ks = np.nonzero(cdf_u <= alpha / 2 + 1e-12)[0]
        if ks.size == 0:
            return None, None
        k = int(ks[-1]) + 1
        return k, float(1.0 - 2.0 * cdf_u[k - 1])
    m = n1 * n2 / 2.0
    sd = math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12.0)
    z = stats.norm.ppf(1 - alpha / 2)
    k = int(math.floor(m - z * sd))
    if k < 1:
        return None, None
    return k, float(1 - 2 * stats.norm.cdf((k - 1 + 0.5 - m) / sd))


# --------------------------------------------------------- Kolmogorov-Smirnov

KS_EXACT_LIMIT = 60000  # guide: exact when C(n1+n2, n1) < 60,000


def ks_d_numerator(a, b) -> int:
    """D * n1 * n2 as an integer, D = max |F_a - F_b| over the pooled
    values (evaluated where the pooled sorted values change)."""
    a = np.sort(np.asarray(a, dtype=float))
    b = np.sort(np.asarray(b, dtype=float))
    n1, n2 = a.size, b.size
    grid = np.unique(np.concatenate([a, b]))
    i = np.searchsorted(a, grid, side="right")
    j = np.searchsorted(b, grid, side="right")
    return int(np.max(np.abs(i * n2 - j * n1)))


def ks_2samp_exact_p(a, b) -> float:
    """Fraction of the C(n1+n2, n1) relabelings with D >= observed D."""
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    n1, n2 = a.size, b.size
    d_num = ks_d_numerator(a, b)
    pooled = np.sort(np.concatenate([a, b]))
    n = pooled.size
    boundary = np.zeros(n + 1, dtype=bool)  # step s ends a tie block
    boundary[n] = True
    boundary[1:n] = pooled[1:] != pooled[:-1]
    paths = np.zeros((n1 + 1, n2 + 1))
    paths[0, 0] = 1.0
    for s in range(1, n + 1):
        for i in range(max(0, s - n2), min(s, n1) + 1):
            j = s - i
            v = (paths[i - 1, j] if i > 0 else 0.0) + \
                (paths[i, j - 1] if j > 0 else 0.0)
            if boundary[s] and abs(i * n2 - j * n1) >= d_num:
                v = 0.0
            paths[i, j] = v
    ok = paths[n1, n2] / float(math.comb(n, n1))
    return float(min(max(1.0 - ok, 0.0), 1.0))


def ks_2samp_asymptotic_p(d: float, n1: int, n2: int) -> float:
    """Numerical Recipes (3rd ed., sec. 14.3.3) approximation:
    Q_KS([sqrt(Ne) + 0.12 + 0.11/sqrt(Ne)] D), Ne = n1 n2 / (n1 + n2)."""
    ne = n1 * n2 / float(n1 + n2)
    lam = (math.sqrt(ne) + 0.12 + 0.11 / math.sqrt(ne)) * d
    return float(min(max(special.kolmogorov(lam), 0.0), 1.0))


# ------------------------------------------------------------------ Friedman

FRIEDMAN_EXACT_LIMIT = 1e9  # guide: approximate when (T!)^S exceeds 10^9


def friedman_exact_feasible(n_subjects: int, k: int) -> bool:
    if n_subjects < 1 or k < 2:
        return False
    return n_subjects * math.lgamma(k + 1) <= math.log(FRIEDMAN_EXACT_LIMIT)


def friedman_exact_p(M) -> float:
    """Exact P for Friedman's test: fraction of the (k!)^n within-row
    rearrangements whose column rank sums give sum(R_j^2) >= observed
    (the tie correction is the same for every rearrangement, so this
    ordering is the ordering of the Friedman statistic)."""
    M = np.asarray(M, dtype=float)
    n, k = M.shape
    rows2 = [doubled_midranks(row) for row in M]
    obs = int(np.sum(np.sum(rows2, axis=0) ** 2))
    # Column-relabelling symmetry: every row is permuted over all k!
    # orders, so the distribution over sorted rank-sum vectors suffices.
    states = {tuple([0] * k): 1.0}
    for r2 in rows2:
        perms = {}
        for p in permutations(r2.tolist()):
            perms[p] = perms.get(p, 0) + 1
        nperm = float(sum(perms.values()))
        plist = [(np.array(p), c / nperm) for p, c in perms.items()]
        new = {}
        for st, prob in states.items():
            base = np.array(st)
            for p, w in plist:
                key = tuple(sorted((base + p).tolist()))
                new[key] = new.get(key, 0.0) + prob * w
        states = new
    p_value = sum(prob for st, prob in states.items()
                  if sum(v * v for v in st) >= obs)
    return float(min(p_value, 1.0))


# ------------------------------------- studentized maximum modulus (T3)

def smm_cdf(c: float, m: int, df: float) -> float:
    """P(max_{i<=m} |Z_i| / S <= c), Z_i iid N(0,1), S^2 ~ chi2_df/df:
    the studentized maximum modulus distribution."""
    if not c > 0:
        return 0.0
    if not math.isfinite(df) or df > 1e7:
        return float((2 * stats.norm.cdf(c) - 1) ** m)

    def integrand(s):
        inner = 2 * special.ndtr(c * s) - 1
        return inner ** m * math.sqrt(df) * stats.chi.pdf(s * math.sqrt(df),
                                                            df)

    root = math.sqrt(df)
    lo = stats.chi.ppf(1e-14, df) / root
    hi = stats.chi.ppf(1 - 1e-14, df) / root
    val, _ = integrate.quad(integrand, lo, hi, limit=200,
                            points=[1.0], epsabs=1e-13, epsrel=1e-11)
    return float(min(max(val, 0.0), 1.0))


def smm_sf(c: float, m: int, df: float) -> float:
    return float(min(max(1.0 - smm_cdf(c, m, df), 0.0), 1.0))


def smm_ppf(q: float, m: int, df: float) -> float:
    """Critical value c with smm_cdf(c, m, df) = q."""
    hi = 2.0
    while smm_cdf(hi, m, df) < q:
        hi *= 2.0
    return float(optimize.brentq(lambda c: smm_cdf(c, m, df) - q, 1e-9, hi,
                                 xtol=1e-12))
