"""Reference values for P-41 (trend across ordered groups): the
Jonckheere-Terpstra test and Page's test, engine/tests/test_ordered_trend.py
and the e2e step.

R is not installed (clinfun / PMCMRplus not available). The oracles:

Jonckheere-Terpstra
- exact P without ties: the number of arrangements of the pooled values
  into groups of the observed sizes counted by J, with Python integers,
  by a dynamic programme over the values from the largest down (each new
  value is below every value already placed, so it adds one counted pair
  per value already placed in a later group). This counts every
  arrangement exactly; it shares no code with the engine's convolution of
  Mann-Whitney distributions. Checked against full enumeration
  (itertools) on a 3 x 3 x 4 design.
- with ties: the exact permutation mean and variance of J by enumerating
  every assignment of a small tied data set (1,680 assignments), which
  must equal Hollander & Wolfe's (1999, eq. 6.19) tie-corrected variance;
  the normal P for the 4-dose table with ties is written out from that
  formula.

Page
- scipy.stats.page_trend_test (exact and asymptotic) on untied data;
- the Hicks (2009) teaching-method example quoted in scipy's docs and on
  Statext ("Page's L Trend Test"): published L = 133.5;
- Page's (1963) table value for k = 3, n = 10 (alpha = 0.05, one-sided):
  critical L = 128 (as quoted by Wikipedia, "Page's trend test");
- with ties, the exact P conditional on the ties from the product of the
  rows' permutation distributions in exact fractions (collections.Counter,
  fractions.Fraction), equal to full enumeration of every within-row
  permutation (1.9 million tables). (scipy's exact P, 0.001819, uses the
  untied null; Statext's Monte Carlo P is 0.00075.)
  Page's 1963 example data could not be obtained (the JASA article is
  behind a paywall), so it is not pinned.

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/ordered_trend.py
"""
import itertools
import json
import math
import os
from collections import Counter
from fractions import Fraction
from functools import lru_cache

import numpy as np
from scipy import stats

# 4 doses x 5 replicates, no ties (the plan's acceptance table)
DOSES = ["0 mg/kg", "1 mg/kg", "3 mg/kg", "10 mg/kg"]
JT_DATA = [[41.2, 38.5, 44.0, 39.7, 42.3],
           [43.1, 45.6, 40.8, 46.2, 44.9],
           [47.3, 44.4, 49.8, 46.9, 48.1],
           [50.2, 47.7, 52.6, 49.1, 53.4]]
# the same with ties (values rounded to whole numbers)
JT_TIED = [[round(v) for v in g] for g in JT_DATA]
SMALL_TIED = [[1, 2, 2], [2, 3, 3], [3, 4, 5]]

HICKS = [[3, 4, 3], [2, 2, 4], [3, 3, 5], [1, 3, 2], [2, 3, 2],
         [2, 4, 5], [1, 2, 4], [3, 4, 4], [2, 4, 5], [1, 3, 4]]
PAGE_UNTIED = [[10.1, 12.3, 13.0, 15.2], [9.8, 9.5, 11.7, 12.9],
               [11.4, 12.9, 12.2, 14.8], [10.7, 11.9, 13.5, 13.1],
               [9.2, 10.8, 10.4, 12.6], [12.0, 12.5, 14.1, 15.9],
               [10.3, 11.1, 12.8, 12.4], [11.8, 11.2, 13.3, 14.6]]


def j_stat(groups):
    J = 0.0
    for i in range(len(groups)):
        for j in range(i + 1, len(groups)):
            for x in groups[i]:
                for y in groups[j]:
                    J += 1.0 if x < y else 0.5 if x == y else 0.0
    return J


def jt_counts(sizes):
    """Counter {J: number of arrangements}, exact integers."""
    k = len(sizes)

    @lru_cache(maxsize=None)
    def f(placed):
        if sum(placed) == sum(sizes):
            return {0: 1}
        out = Counter()
        for g in range(k):
            if placed[g] < sizes[g]:
                add = sum(placed[h] for h in range(g + 1, k))
                nxt = list(placed)
                nxt[g] += 1
                for j, c in f(tuple(nxt)).items():
                    out[j + add] += c
        return dict(out)
    return Counter(f(tuple([0] * k)))


def jt_exact_p(groups):
    counts = jt_counts([len(g) for g in groups])
    total = sum(counts.values())
    J = int(j_stat(groups))
    up = Fraction(sum(c for j, c in counts.items() if j >= J), total)
    down = Fraction(sum(c for j, c in counts.items() if j <= J), total)
    return J, float(up), float(down), float(min(1, 2 * min(up, down))), total


def assignments(pooled, sizes):
    idx = list(range(len(pooled)))
    if len(sizes) == 1:
        yield [[pooled[i] for i in idx]]
        return
    for first in itertools.combinations(idx, sizes[0]):
        rest = [i for i in idx if i not in first]
        for tail in assignments([pooled[i] for i in rest], sizes[1:]):
            yield [[pooled[i] for i in first]] + tail


def hw_variance(groups):
    ns = np.array([len(g) for g in groups], float)
    N = ns.sum()
    _, t = np.unique(np.concatenate(groups), return_counts=True)
    t = t.astype(float)
    return ((N * (N - 1) * (2 * N + 5) - (ns * (ns - 1) * (2 * ns + 5)).sum()
             - (t * (t - 1) * (2 * t + 5)).sum()) / 72
            + (ns * (ns - 1) * (ns - 2)).sum() * (t * (t - 1) * (t - 2)).sum()
            / (36 * N * (N - 1) * (N - 2))
            + (ns * (ns - 1)).sum() * (t * (t - 1)).sum() / (8 * N * (N - 1)))


def page_L(table):
    r = stats.rankdata(np.asarray(table, float), axis=1)
    return float((r.sum(axis=0) * np.arange(1, r.shape[1] + 1)).sum()), r


def page_tied_exact(table):
    """Exact P(L >= obs) and P(L <= obs) given the ties, in fractions."""
    L, r = page_L(table)
    k = r.shape[1]
    dist = Counter({Fraction(0): Fraction(1)})
    for row in r:
        vals = Counter()
        for p in itertools.permutations(row):
            vals[sum(Fraction(v).limit_denominator(4) * (j + 1)
                     for j, v in enumerate(p))] += 1
        tot = sum(vals.values())
        new = Counter()
        for a, pa in dist.items():
            for b, cb in vals.items():
                new[a + b] += pa * Fraction(cb, tot)
        dist = new
    Lf = Fraction(L).limit_denominator(4)
    up = sum(p for v, p in dist.items() if v >= Lf)
    down = sum(p for v, p in dist.items() if v <= Lf)
    return L, float(up), float(down)


def page_by_enumeration(table):
    L, r = page_L(table)
    w = np.arange(1, r.shape[1] + 1)
    # every permutation of each row's ranks, weighted by multiplicity
    counts = [Counter(itertools.permutations(row)) for row in r]
    up = down = total = 0
    for combo in itertools.product(*[list(c.items()) for c in counts]):
        weight = math.prod(c for _, c in combo)
        val = sum(float(np.dot(w, arr)) for arr, _ in combo)
        total += weight
        up += weight * (val >= L - 1e-9)
        down += weight * (val <= L + 1e-9)
    return L, up / total, down / total


def main():
    ref = {}
    # --- JT exact, no ties
    J, up, down, two, total = jt_exact_p(JT_DATA)
    ref["jt_untied"] = {"data": JT_DATA, "names": DOSES, "J": J,
                        "p_increasing": up, "p_decreasing": down,
                        "p": two, "arrangements": total}
    small = [[1.1, 2.3, 0.4], [2.9, 1.7, 3.3], [4.2, 3.8, 2.2, 5.0]]
    counts = Counter(int(j_stat(a)) for a in assignments(
        [v for g in small for v in g], [3, 3, 4]))
    assert counts == jt_counts([3, 3, 4]), "DP differs from enumeration"
    J2, up2, down2, two2, _ = jt_exact_p(small)
    ref["jt_small"] = {"data": small, "J": J2, "p_increasing": up2,
                       "p_decreasing": down2, "p": two2,
                       "enumerated": sum(counts.values())}
    # --- JT with ties: permutation moments by enumeration = H&W formula
    pooled = [v for g in SMALL_TIED for v in g]
    js = [j_stat(a) for a in assignments(pooled, [3, 3, 3])]
    ref["jt_small_tied"] = {
        "data": SMALL_TIED, "J": j_stat(SMALL_TIED),
        "perm_mean": float(np.mean(js)), "perm_var": float(np.var(js)),
        "hw_var": float(hw_variance(SMALL_TIED)),
        "n_assignments": len(js)}
    Jt = j_stat(JT_TIED)
    ns = np.array([len(g) for g in JT_TIED], float)
    mean = (ns.sum() ** 2 - (ns ** 2).sum()) / 4
    z = (Jt - mean) / math.sqrt(hw_variance(JT_TIED))
    ref["jt_tied"] = {"data": JT_TIED, "names": DOSES, "J": Jt,
                      "mean": mean, "sd": math.sqrt(hw_variance(JT_TIED)),
                      "z": z, "p_increasing": float(stats.norm.sf(z)),
                      "p": float(2 * min(stats.norm.sf(z),
                                         stats.norm.cdf(z)))}
    # --- Page
    L, _ = page_L(HICKS)
    p_inc, p_dec = page_tied_exact(HICKS)[1:]
    # every within-row permutation of all ten rows (1.9 million)
    _, up_e, down_e = page_by_enumeration(HICKS)
    assert abs(up_e - p_inc) < 1e-12 and abs(down_e - p_dec) < 1e-12
    sc = stats.page_trend_test(HICKS)
    ref["page_hicks"] = {"data": HICKS, "names": ["Tutorial", "Lecture",
                                                   "Seminar"],
                         "L_published": 133.5, "L": L,
                         "p_increasing_exact_ties": p_inc,
                         "p_decreasing_exact_ties": p_dec,
                         "scipy_exact_untied_null": float(sc.pvalue)}
    ex = stats.page_trend_test(PAGE_UNTIED, method="exact")
    asy = stats.page_trend_test(PAGE_UNTIED, method="asymptotic")
    dec = stats.page_trend_test(np.asarray(PAGE_UNTIED)[:, ::-1],
                                method="exact")
    ref["page_untied"] = {"data": PAGE_UNTIED, "L": float(ex.statistic),
                          "p_increasing_exact": float(ex.pvalue),
                          "p_increasing_normal": float(asy.pvalue),
                          "p_decreasing_exact_reversed": float(dec.pvalue)}
    # Page's (1963) table, k = 3, n = 10: critical L = 128 at 0.05
    # (scipy's exact upper tail, Odeh 1977, untied null)
    from scipy.stats._page_trend_test import _l_p_exact
    ref["page_table_k3_n10"] = {"p_ge_127": float(_l_p_exact(127, 10, 3)),
                                "p_ge_128": float(_l_p_exact(128, 10, 3))}
    path = os.path.join(os.path.dirname(__file__), "ordered_trend.json")
    with open(path, "w") as fh:
        json.dump(ref, fh, indent=1)
    print(json.dumps(ref, indent=1, default=str)[:4000])


if __name__ == "__main__":
    main()
