"""Nonparametric method-comparison regression: Passing-Bablok and
Theil-Sen, with the CUSUM test of linearity.

Passing-Bablok (Passing H, Bablok W, 1983, "A new biometrical procedure
for testing the equality of measurements from two different analytical
methods. Application of linear regression procedures for method
comparison studies in clinical chemistry, Part I", J Clin Chem Clin
Biochem 21:709-720), as restated in the NCSS documentation chapter
"Passing-Bablok Regression for Method Comparison" (procedure 313):

- S_ij = (y_j - y_i) / (x_j - x_i) for every pair i < j. A pair of
  identical points (0/0) is left out. A pair with equal x and different
  y has an infinite slope; the points are ordered by x then y, so it is
  +inf (its sign does not matter: under the K shift below a -inf and a
  +inf take the same rank). A slope of exactly -1 is left out; K counts
  the slopes below -1. Data typed as decimals rarely give a binary -1
  exactly (4.86 - 4.75 is not -(4.60 - 4.71) in floating point), so a
  slope within MINUS_ONE_TOL of -1 counts as -1.
- The slope b is the median of the N sorted S_ij shifted K places up:
  S_((N+1)/2 + K) for odd N, the mean of S_(N/2 + K) and S_(N/2 + 1 + K)
  for even N.
- Its CI: C = z_(1-alpha/2) sqrt(n (n - 1) (2n + 5) / 18) with n points,
  M1 = (N - C) / 2 rounded to the nearest integer, M2 = N - M1 + 1;
  S_(M1 + K) <= beta <= S_(M2 + K).
- The intercept a = median(y_i - b x_i); its CI is median(y_i - b_U x_i)
  to median(y_i - b_L x_i).
- The method assumes a positive correlation (Kendall's tau tested first,
  Passing & Bablok 1983); with tau <= 0 it is refused here.
- CUSUM test of linearity: n_pos points above the line score
  sqrt(n_neg / n_pos), n_neg points below score -sqrt(n_pos / n_neg), points
  on the line 0; the scores are ordered by the position along the line,
  D_i = (y_i + x_i / b - a) / sqrt(1 + 1 / b^2), and cumulated;
  H = max |cusum| / sqrt(n_neg + 1) is compared with the Kolmogorov-Smirnov
  distribution (5% critical value 1.36, 1% 1.63). The scores and D_i are
  those of mcr's MCResult.calcCUSUM (R package mcr, Roche Diagnostics);
  the P value here is the asymptotic Kolmogorov tail, scipy's kstwobign.

Theil-Sen (Theil 1950; Sen 1968, JASA 63:1379-1389): the slope is the
median of the slopes over pairs with different x, its CI the ranks
(N -/+ z sigma) / 2 with sigma^2 the variance of Kendall's S corrected for
ties in x and in y, and the intercept median(y) - b median(x) (Conover
1980), as scipy.stats.theilslopes (the test oracle).

Both build the N = n (n - 1) / 2 pairwise slopes, one row of pairs at a
time; above MAX_POINTS points (4.5 million slopes) they refuse rather
than exhaust a browser tab's memory.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

MAX_POINTS = 3000
MINUS_ONE_TOL = 1e-9


def _points(x, y):
    pts = [(float(a), float(b)) for a, b in zip(x, y)
           if a is not None and b is not None
           and math.isfinite(float(a)) and math.isfinite(float(b))]
    if len(pts) > MAX_POINTS:
        raise ValueError(f"{len(pts)} pairs: this regression builds every "
                         f"pairwise slope and is limited to {MAX_POINTS} "
                         "pairs here")
    return (np.array([p[0] for p in pts], dtype=float),
            np.array([p[1] for p in pts], dtype=float))


def _pair_slopes(x, y, *, vertical: bool):
    """Slopes of all pairs, points ordered by x then y. vertical=True keeps
    pairs with equal x and different y as +inf (Passing-Bablok);
    False leaves them out (Theil-Sen). Identical points are left out."""
    order = np.lexsort((y, x))
    xs, ys = x[order], y[order]
    parts = []
    for i in range(xs.size - 1):
        dx = xs[i + 1:] - xs[i]
        dy = ys[i + 1:] - ys[i]
        flat = dx != 0
        s = np.full(dx.size, np.inf)
        s[flat] = dy[flat] / dx[flat]
        keep = flat | ((dy != 0) if vertical else np.zeros(dx.size, bool))
        parts.append(s[keep])
    return np.sort(np.concatenate(parts)) if parts else np.array([])


def _kendall(x, y):
    tau, p = stats.kendalltau(x, y)
    return {"tau": float(tau), "p": float(p)}


def _median_shifted(s, k):
    """1-based shifted median of the sorted slopes s (Passing & Bablok)."""
    n = s.size
    if n % 2:
        idx = [(n + 1) // 2 + k]
    else:
        idx = [n // 2 + k, n // 2 + 1 + k]
    if idx[-1] > n or idx[0] < 1:
        raise ValueError("the shifted median falls outside the slopes")
    return float(np.mean(s[np.array(idx) - 1]))


def cusum_linearity(x, y, intercept, slope) -> dict:
    """Passing & Bablok (1983) CUSUM test of linearity about the line
    y = intercept + slope x (see the module docstring)."""
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    res = y - intercept - slope * x
    n_pos = int(np.sum(res > 0))
    n_neg = int(np.sum(res < 0))
    out = {"n_above": n_pos, "n_below": n_neg,
           "n_on_line": int(x.size - n_pos - n_neg), "critical_5pct": 1.36}
    if n_pos == 0 or n_neg == 0 or slope == 0:
        out.update({"max_cusum": None, "H": None, "p": None,
                    "unavailable": "every point lies on one side of the line "
                                   "or on it, so the CUSUM test is not "
                                   "defined"})
        return out
    r = np.where(res > 0, math.sqrt(n_neg / n_pos),
                 np.where(res < 0, -math.sqrt(n_pos / n_neg), 0.0))
    d = (y + x / slope - intercept) / math.sqrt(1 + 1 / slope ** 2)
    cusum = np.cumsum(r[np.argsort(d, kind="stable")])
    mx = float(np.max(np.abs(cusum)))
    h = mx / math.sqrt(n_neg + 1)
    p = float(stats.kstwobign.sf(h))
    out.update({"max_cusum": mx, "H": h, "p": p,
                "linear": bool(p >= 0.05)})
    return out


def passing_bablok(x, y, *, ci_level: float = 0.95) -> dict:
    """Passing-Bablok regression of y (method 2) on x (method 1)."""
    xa, ya = _points(x, y)
    n = xa.size
    if n < 3:
        raise ValueError("Passing-Bablok regression needs at least 3 pairs")
    if np.all(xa == xa[0]) or np.all(ya == ya[0]):
        raise ValueError("one method gives the same value for every sample, "
                         "so there is no slope to estimate")
    kt = _kendall(xa, ya)
    if not kt["tau"] > 0:
        raise ValueError(f"Kendall's tau is {kt['tau']:.3g}: Passing-Bablok "
                         "regression assumes a positive correlation between "
                         "the two methods (Passing & Bablok 1983)")
    s = _pair_slopes(xa, ya, vertical=True)
    s = s[~(np.abs(s + 1.0) <= MINUS_ONE_TOL)]
    big_n = int(s.size)
    k = int(np.sum(s < -1.0))
    slope = _median_shifted(s, k)
    intercept = float(np.median(ya - slope * xa))
    z = float(stats.norm.ppf((1 + ci_level) / 2))
    c = z * math.sqrt(n * (n - 1) * (2 * n + 5) / 18.0)
    m1 = int(math.floor((big_n - c) / 2 + 0.5))
    m2 = big_n - m1 + 1
    slope_ci = intercept_ci = None
    ci_note = None
    if m1 >= 1 and m2 + k <= big_n:
        lo, hi = float(s[m1 + k - 1]), float(s[m2 + k - 1])
        if math.isfinite(lo) and math.isfinite(hi):
            slope_ci = [lo, hi]
            intercept_ci = [float(np.median(ya - hi * xa)),
                            float(np.median(ya - lo * xa))]
        else:
            ci_note = ("a confidence limit of the slope is infinite (pairs "
                       "with equal values of method 1)")
    else:
        ci_note = (f"too few pairs for a {round(100 * ci_level)}% confidence "
                   "interval")
    out = {
        "method": "passing_bablok", "n": int(n), "n_slopes": big_n,
        "k_below_minus_one": k, "ci_level": ci_level,
        "slope": {"value": slope, "ci": slope_ci},
        "intercept": {"value": intercept, "ci": intercept_ci},
        "kendall": kt,
        "cusum": cusum_linearity(xa, ya, intercept, slope),
        "ranks": {"C": c, "M1": m1, "M2": m2},
    }
    if ci_note:
        out["ci_note"] = ci_note
    return out


def theil_sen(x, y, *, ci_level: float = 0.95) -> dict:
    """Theil-Sen slope with Sen's CI; intercept median(y) - b median(x)."""
    xa, ya = _points(x, y)
    n = xa.size
    if n < 3:
        raise ValueError("Theil-Sen regression needs at least 3 pairs")
    s = _pair_slopes(xa, ya, vertical=False)
    if s.size == 0:
        raise ValueError("every pair has the same value of method 1, so "
                         "there is no slope to estimate")
    slope = float(np.median(s))
    intercept = float(np.median(ya) - slope * np.median(xa))

    def tie_term(v):
        _, c = np.unique(v, return_counts=True)
        c = c[c > 1].astype(float)
        return float(np.sum(c * (c - 1) * (2 * c + 5)))
    sigma = math.sqrt(max((n * (n - 1) * (2 * n + 5) - tie_term(xa)
                           - tie_term(ya)) / 18.0, 0.0))
    z = float(stats.norm.ppf((1 + ci_level) / 2))
    nt = s.size
    hi_i = min(int(np.round((nt + z * sigma) / 2.0)), nt - 1)
    lo_i = max(int(np.round((nt - z * sigma) / 2.0)) - 1, 0)
    return {"method": "theil_sen", "n": int(n), "n_slopes": int(nt),
            "ci_level": ci_level,
            "slope": {"value": slope, "ci": [float(s[lo_i]), float(s[hi_i])]},
            "intercept": {"value": intercept, "ci": None},
            "kendall": _kendall(xa, ya)}
