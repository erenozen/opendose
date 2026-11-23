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
- "Interpreting results: Kruskal-Wallis test": "If your samples are
  small (even if there are ties), Prism calculates an exact P value",
  else the chi-square approximation, and the P value is labelled exact
  or approximate. The guide gives no numeric threshold.
  kruskal_wallis_exact_p() is the shuffle distribution of the pooled
  midranks over groups of the observed sizes; it gives up (returns None)
  when its work exceeds KW_EXACT_STATE_BUDGET, so the cost, not a sample
  size rule, decides when the approximation is used.
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


def snap_differences(diffs, *scale_from) -> np.ndarray:
    """Differences computed in floating point, with the rounding noise
    removed so that ties and zeros are recognised as in exact arithmetic.

    0.12 - 0.11 and 0.15 - 0.14 are both 0.01 exactly, but in binary
    floating point they differ in the 17th digit, so a rank test would
    rank them apart (GraphPad FAQ "Bug: Wilcoxon test with fractional data
    can give the wrong result", fixed in Prism 7.01; R's wilcox.test still
    does this). Differences within TOL of zero become zero, and runs of
    magnitudes within TOL of each other take the smallest magnitude of the
    run (signs kept); every other value is returned unchanged. TOL is
    1e-13 times the largest magnitude among the values the differences
    were computed from (scale_from; the differences themselves when none
    are given): about 200 times the rounding error of a subtraction
    (2.2e-16 of the operands per value), and below any difference that can
    be typed (15 significant digits)."""
    d = np.array(diffs, dtype=float)
    mags = [np.max(np.abs(np.asarray(v, dtype=float)), initial=0.0)
            for v in (scale_from or (d,))]
    scale = max(mags + [0.0])
    if d.size == 0 or not np.isfinite(scale) or scale == 0.0:
        return d
    tol = 1e-13 * scale
    d[np.abs(d) <= tol] = 0.0
    a = np.abs(d)
    order = np.argsort(a, kind="stable")
    s = a[order]
    start = np.concatenate([[True], np.diff(s) > tol])
    first = np.maximum.accumulate(np.where(start, np.arange(s.size), 0))
    a[order] = s[first]
    return np.copysign(a, d)


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


# The last distribution computed: the two-sided and one-sided P values
# and the smallest attainable P of one test share it (the same ranks in
# the same order), so it is built once. Read-only for every caller.
_NULL_CACHE: dict = {}


def rank_sum_null(ranks2, n_pick: int) -> np.ndarray:
    """P(sum of n_pick of the doubled ranks = s), s = 0..sum(ranks2)."""
    ranks2 = np.asarray(ranks2, dtype=np.int64)
    key = (ranks2.tobytes(), int(n_pick))
    hit = _NULL_CACHE.get(key)
    if hit is not None:
        return hit
    out = _rank_sum_null(ranks2, n_pick)
    _NULL_CACHE.clear()
    _NULL_CACHE[key] = out
    return out


def _rank_sum_null(ranks2, n_pick: int) -> np.ndarray:
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


def rank_sum_one_sided_p(values_a, values_b) -> tuple[float, float]:
    """Exact one-tailed permutation P values of the Mann-Whitney test (ties
    ok) for group a: (P(R_a >= r_a), P(R_a <= r_a)), R_a = a's rank sum.
    Computed on the smaller group's rank sum (the total is fixed, so a
    large R_a is a small rank sum of b)."""
    a = np.asarray(values_a, dtype=float)
    b = np.asarray(values_b, dtype=float)
    swap = a.size > b.size
    small, large = (b, a) if swap else (a, b)
    r2 = doubled_midranks(np.concatenate([small, large]))
    obs2 = int(r2[:small.size].sum())
    dist = rank_sum_null(r2, small.size)
    s2 = np.arange(dist.size)
    ge = float(min(dist[s2 >= obs2].sum(), 1.0))
    le = float(min(dist[s2 <= obs2].sum(), 1.0))
    return (le, ge) if swap else (ge, le)


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


def signed_rank_one_sided_p(ranks2, positive_mask) -> tuple[float, float]:
    """Exact one-tailed P values of the signed-rank statistic:
    (P(T+ >= t+), P(T+ <= t+)), ranks2 = doubled ranks of the nonzero
    differences."""
    ranks2 = np.asarray(ranks2, dtype=np.int64)
    t_obs = int(ranks2[np.asarray(positive_mask, bool)].sum())
    dist = signed_rank_null(ranks2)
    s = np.arange(dist.size)
    return (float(min(dist[s >= t_obs].sum(), 1.0)),
            float(min(dist[s <= t_obs].sum(), 1.0)))


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


# ----------------------------------------------------------- Kruskal-Wallis

# Most (count, rank sum) states the exact Kruskal-Wallis recursion may hold
# at once; beyond it the chi-square approximation is used. Measured natively:
# under 1 s for any design, exact or given up (3-10 groups; e.g. 4 + 6 + 8
# values without ties, or 5 + 8 + 11 with ties, are still exact); Pyodide is
# a few times slower.
KW_EXACT_STATE_BUDGET = 50_000


def kruskal_wallis_exact_p(groups, *, state_budget: int = KW_EXACT_STATE_BUDGET
                           ) -> float | None:
    """Exact P for the Kruskal-Wallis test, ties included: the fraction of
    the N! / prod(n_j!) equally likely assignments of the pooled midranks to
    groups of the observed sizes whose sum(R_j^2 / n_j) is >= the observed
    one (the tie correction and the other terms of H are the same for every
    assignment, so this orders the assignments as H does).

    The ranks are dealt out one at a time; a state is the (count, doubled
    rank sum) of every group, with groups of equal size kept sorted
    (relabelling them changes nothing). Returns None, without finishing,
    once more than state_budget states are live."""
    sizes = [int(np.asarray(g).size) for g in groups]
    if len(sizes) < 2 or min(sizes) < 1:
        raise ValueError("Kruskal-Wallis needs at least 2 non-empty groups")
    if len(sizes) == 2:
        # H grows with |R - E[R]| of either group: the two-sided exact
        # Mann-Whitney P, whose rank-sum table is much cheaper
        if not rank_sum_exact_feasible(min(sizes), max(sizes)):
            return None
        return rank_sum_two_sided_p(groups[0], groups[1])
    r2 = doubled_midranks(np.concatenate([np.asarray(g, float)
                                          for g in groups])).tolist()
    # sum(S_j^2 / n_j) scaled by lcm(n) to stay an integer (S_j doubled)
    lcm = math.lcm(*sizes)

    def score(pairs) -> int:
        return sum(s * s * (lcm // c) for c, s in pairs)

    start = 0
    observed = []
    for n in sizes:
        observed.append((n, sum(r2[start:start + n])))
        start += n
    obs = score(observed)

    caps = sorted(sizes)
    blocks = []  # [a, b): runs of equal sizes, whose states are kept sorted
    a = 0
    while a < len(caps):
        b = a
        while b < len(caps) and caps[b] == caps[a]:
            b += 1
        blocks.append((a, b))
        a = b

    def canonical(st):
        if len(blocks) == len(caps):
            return tuple(st)
        out = []
        for a, b in blocks:
            out.extend(sorted(st[a:b]))
        return tuple(out)

    states = {tuple((0, 0) for _ in caps): 1}
    for r in r2:
        new = {}
        for st, ways in states.items():
            for g, (c, s) in enumerate(st):
                if c == caps[g]:
                    continue
                nxt = list(st)
                nxt[g] = (c + 1, s + r)
                key = canonical(nxt)
                new[key] = new.get(key, 0) + ways
        if len(new) > state_budget:
            return None
        states = new
    # integer counts throughout, so the P value is exact
    total = sum(states.values())
    hits = sum(w for st, w in states.items() if score(st) >= obs)
    return float(min(hits / total, 1.0))


# ------------------------------------------- smallest attainable P value

# A rank test's P value comes from where the ranks fall, so a design
# with few values has a smallest P it can ever give, whatever the data
# (with no ties: Mann-Whitney 2 / C(n1 + n2, n1), Wilcoxon signed rank
# 2 / 2^n, Friedman (k!)^(1 - n)). The functions below find it by asking
# the test itself (p_fn, the same P computation the analysis used:
# exact, exact with ties, or its approximation) for the most extreme
# arrangement of the values actually entered, so ties, zero differences
# and the approximations are accounted for. It is a property of the
# design, fixed before the data are seen (GraphPad statistics guide,
# "Nonparametric tests with small and large samples": with tiny samples
# a nonparametric test has little or no power).

def untied_min_p_rank_sum(n1: int, n2: int) -> float:
    """2 / C(n1 + n2, n1): every arrangement equally likely, and only the
    two with one group entirely below the other reach the extreme."""
    return min(1.0, 2.0 / math.comb(n1 + n2, n1))


def untied_min_p_signed_rank(n: int) -> float:
    """2 / 2^n: all differences positive, or all negative."""
    return min(1.0, 2.0 / 2.0 ** n)


def untied_min_p_friedman(n_subjects: int, k: int) -> float:
    """(k!)^(1 - n): every subject ranks the treatments the same way,
    k! of the (k!)^n equally likely within-row orderings."""
    return min(1.0, math.factorial(k) ** (1 - n_subjects))


def min_p_rank_sum(values_a, values_b, p_fn):
    """Smallest P of a two-group rank-sum test: the smaller of p_fn on
    the two extreme arrangements of the pooled values (group a holding
    the n_a smallest, or the n_a largest). The rank sum's distance from
    its mean is largest there, and every P is monotone in it. p_fn may
    return a tuple of P values (two-sided, one-sided): each is
    minimised."""
    a = np.asarray(values_a, dtype=float)
    pooled = np.sort(np.concatenate([a, np.asarray(values_b, dtype=float)]))
    na = a.size
    low = p_fn(pooled[:na], pooled[na:])
    high = p_fn(pooled[pooled.size - na:], pooled[:pooled.size - na])
    if isinstance(low, tuple):
        return tuple(float(min(u, v)) for u, v in zip(low, high))
    return float(min(low, high))


def rank_sum_min_p_exact(values_a, values_b) -> tuple[float, float]:
    """(two-sided, one-sided) smallest exact P of the rank-sum test with
    the pooled values' ties: the null distribution's mass at the most
    extreme rank sums (the smaller group holding the smallest, or the
    largest, doubled midranks). The same distribution as
    rank_sum_two_sided_p, so it is not computed again."""
    a = np.asarray(values_a, dtype=float)
    b = np.asarray(values_b, dtype=float)
    if a.size > b.size:
        a, b = b, a
    r2 = doubled_midranks(np.concatenate([a, b]))
    n_s, n = a.size, r2.size
    dist = rank_sum_null(r2, n_s)
    srt = np.sort(r2)
    lo, hi = int(srt[:n_s].sum()), int(srt[n - n_s:].sum())
    e2 = n_s * (n + 1)
    s2 = np.arange(dist.size)
    dev = max(abs(lo - e2), abs(hi - e2))
    two = float(min(dist[np.abs(s2 - e2) >= dev].sum(), 1.0))
    one = float(min(dist[:lo + 1].sum(), dist[hi:].sum(), 1.0))
    return two, one


def min_p_signed_rank(diffs, p_fn):
    """Smallest P of the signed-rank test: p_fn on |differences| (every
    nonzero difference positive, the same magnitudes and zeros)."""
    return p_fn(np.abs(np.asarray(diffs, dtype=float)))


MIN_P_MAX_GROUPS = 8   # k! orders of the blocks are compared below


def min_p_kruskal(groups, p_fn) -> float | None:
    """Smallest P of the Kruskal-Wallis test: p_fn on the groups that
    hold contiguous blocks of the sorted pooled values, in the order of
    group sizes that maximises sum(R_j^2 / n_j) (the statistic H orders
    arrangements by it; for fixed sizes it is largest when each group is
    a block of consecutive ranks). None above MIN_P_MAX_GROUPS groups."""
    sizes = [int(np.asarray(g).size) for g in groups]
    if len(sizes) > MIN_P_MAX_GROUPS:
        return None
    pooled = np.sort(np.concatenate([np.asarray(g, dtype=float) for g in groups]))
    ranks = stats.rankdata(pooled)
    best, best_order = -1.0, None
    seen = set()
    for order in permutations(range(len(sizes))):
        key = tuple(sizes[i] for i in order)
        if key in seen:
            continue
        seen.add(key)
        start, score = 0, 0.0
        for n in key:
            score += ranks[start:start + n].sum() ** 2 / n
            start += n
        if score > best + 1e-9:
            best, best_order = score, order
    out, start = [None] * len(sizes), 0
    for i in best_order:
        out[i] = pooled[start:start + sizes[i]]
        start += sizes[i]
    return float(p_fn(out))


def min_p_friedman(M, p_fn) -> float:
    """Smallest P of the Friedman test: p_fn on the matrix whose every
    row holds its own values sorted, so every subject ranks the
    treatments the same way (the column rank sums are then as unequal
    as they can be)."""
    return float(p_fn(np.sort(np.asarray(M, dtype=float), axis=1)))


def min_p_block(p_min: float | None, method: str, ns, *, alpha: float = 0.05,
                one_sided: float | None = None) -> dict:
    """The result block the web reads (guide/rankFloor.ts)."""
    return {"p": None if p_min is None else float(p_min),
            "p_one_sided": None if one_sided is None else float(one_sided),
            "alpha": alpha, "method": method, "n": [int(n) for n in ns],
            "reachable": None if p_min is None else bool(p_min < alpha),
            "source": ("GraphPad statistics guide, 'Nonparametric tests "
                       "with small and large samples'")}


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


# ------------------------------------------- trend across ordered groups

#: the exact Jonckheere-Terpstra null is used without ties up to this many
#: values (R clinfun::jonckheere.test's rule); otherwise the normal
#: approximation with the tie-corrected variance
JT_EXACT_MAX_N = 100


def mann_whitney_u_null(m: int, n: int) -> np.ndarray:
    """P(U = u), u = 0..m n, for U = the number of (x, y) pairs with x
    from a sample of m below y from a sample of n, no ties, under H0: the
    recurrence p(u; a, b) = b/(a+b) p(u - a; a, b - 1) + a/(a+b)
    p(u; a - 1, b) (Mann & Whitney 1947, Ann Math Stat 18:50), carried in
    probabilities so large samples do not overflow."""
    size = m * n + 1
    unit = np.zeros(size)
    unit[0] = 1.0
    prev = [unit] * (n + 1)  # pmf for (a - 1, b), b = 0..n
    for a in range(1, m + 1):
        cur = [unit]
        for b in range(1, n + 1):
            shifted = np.zeros(size)
            shifted[a:] = cur[b - 1][:size - a]
            cur.append((a / (a + b)) * prev[b] + (b / (a + b)) * shifted)
        prev = cur
    return prev[n]


def jt_null(sizes) -> np.ndarray:
    """Exact null distribution of the Jonckheere-Terpstra statistic J
    without ties: P(J = j), j = 0..sum_{i<j} n_i n_j. J is the sum over
    groups j of U_j, the pairs (earlier-group value < group-j value);
    under H0 the U_j are independent Mann-Whitney counts for (n_1 + ... +
    n_{j-1}, n_j), so the null is their convolution (Hollander & Wolfe
    1999, Nonparametric Statistical Methods, sec. 6.2)."""
    sizes = [int(s) for s in sizes]
    dist = np.array([1.0])
    before = sizes[0]
    for n_j in sizes[1:]:
        dist = np.convolve(dist, mann_whitney_u_null(before, n_j))
        before += n_j
    return dist / dist.sum()


def page_exact_feasible(n_rows: int, k: int) -> bool:
    """When Page's L gets an exact P: Page's (1963) tables, the rule of
    scipy.stats.page_trend_test's 'auto' (k <= 8 columns and n <= 12
    rows, or n <= 20 rows with 3 columns)."""
    return not (k > 8 or (n_rows > 12 and k > 3) or n_rows > 20)


def page_null(ranks2) -> tuple[np.ndarray, int]:
    """Exact permutation null of 2L = sum_j j (doubled rank in column j),
    the values permuted within each row; with ties the row's midranks are
    permuted, so the distribution is conditional on the ties, as the
    Friedman test's exact P (friedman_exact_p). Returns (pmf of 2L -
    offset, offset)."""
    ranks2 = np.asarray(ranks2, dtype=np.int64)
    k = ranks2.shape[1]
    w = np.arange(1, k + 1)
    cache: dict = {}
    dist, offset = np.array([1.0]), 0
    for row in ranks2:
        key = tuple(sorted(int(v) for v in row))
        if key not in cache:
            vals = np.array([int(np.dot(w, p)) for p in permutations(key)])
            lo = int(vals.min())
            pmf = np.bincount(vals - lo).astype(float)
            cache[key] = (pmf / pmf.sum(), lo)
        pmf, lo = cache[key]
        dist = np.convolve(dist, pmf)
        offset += lo
    return dist / dist.sum(), offset
