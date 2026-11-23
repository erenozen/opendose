"""Linear regression (Prism: Analyze -> Simple linear regression).

Prism reports: slope and Y-intercept with SE and 95% CI, X-intercept,
1/slope, R squared, Sy.x, F test for nonzero slope (dfn=1, dfd=n-2) with
P, the runs test for linearity, and n. Confidence/prediction bands use
the closed-form OLS formulas.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats
from scipy.special import logsumexp


def _pairs(x_values, y_values):
    pairs = [(float(a), float(b)) for a, b in zip(x_values, y_values)
             if a is not None and b is not None]
    return (np.array([p[0] for p in pairs]), np.array([p[1] for p in pairs]))


# Up to this many nonzero residuals the runs test sums the exact
# distribution in big integers (the original computation, whose cost
# grows about as n^2.8: 0.04 s at 2,000, 0.55 s at 5,000, 24.5 s at
# 20,000 natively); above it the same distribution is summed in floating
# point (_runs_p_float), agreeing to about 1e-12 relative.
RUNS_EXACT_INT_MAX_N = 2000


def _runs_p_float(n1: int, n2: int, runs: int) -> float:
    """P(R <= runs) from the exact null distribution of the number of runs
    R in a random arrangement of n1 positive and n2 negative signs
    (Wald & Wolfowitz 1940; Bradley 1968, Distribution-Free Statistical
    Tests, ch. 11):

        P(R = 2k)   = 2 C(n1-1, k-1) C(n2-1, k-1) / C(N, n1)
        P(R = 2k+1) = [C(n1-1, k) C(n2-1, k-1) + C(n1-1, k-1) C(n2-1, k)]
                      / C(N, n1),

    evaluated in logarithms: log C(n-1, k) as running sums of
    log((n - k) / k) outward from k = n1 n2 / N, where the probability
    sits (so the sums stay small there and keep their digits), and the
    denominator as the log-sum of every term (the probabilities sum to
    1), so no factorial of N is formed. O(N) work; agrees with exact
    rational arithmetic to about 1e-12 relative (see
    engine/tests/reference/large_tables.py)."""
    centre = n1 * n2 // (n1 + n2)

    def log_comb_row(n):  # log C(n - 1, k) - log C(n - 1, c), k = 0 .. n - 1
        c = min(centre, n - 1)
        k = np.arange(1, n, dtype=float)
        step = np.log((n - k) / k)          # step[j - 1] = L[j] - L[j - 1]
        out = np.zeros(n)
        out[c + 1:] = np.cumsum(step[c:])
        out[:c] = -np.cumsum(step[:c][::-1])[::-1]
        return out

    a, b = log_comb_row(n1), log_comb_row(n2)
    m = min(n1, n2)
    k = np.arange(1, m + 1)                     # even R = 2k
    even = math.log(2.0) + a[k - 1] + b[k - 1]
    kk = np.arange(1, m + (1 if n1 != n2 else 0))  # odd R = 2k + 1
    a_k = a[np.minimum(kk, n1 - 1)]
    b_k = b[np.minimum(kk, n2 - 1)]
    odd = np.logaddexp(np.where(kk <= n1 - 1, a_k + b[kk - 1], -np.inf),
                       np.where(kk <= n2 - 1, a[kk - 1] + b_k, -np.inf))
    r_even, r_odd = 2 * k, 2 * kk + 1
    log_all = np.concatenate((even, odd))
    log_low = np.concatenate((even[r_even <= runs], odd[r_odd <= runs]))
    if log_low.size == 0:
        return 0.0
    return min(float(np.exp(logsumexp(log_low) - logsumexp(log_all))), 1.0)


def runs_test(signs) -> dict:
    """Exact runs test (Prism's test for departure from linearity):
    P = probability of observing this few runs or fewer given n1 positive
    and n2 negative residuals (Bradley 1968). Up to RUNS_EXACT_INT_MAX_N
    nonzero residuals the distribution is summed in big integers
    (p_method "exact"); above it, the same distribution in floating point
    (p_method "exact_float", _runs_p_float)."""
    signs = [s for s in signs if s != 0]
    n1 = sum(1 for s in signs if s > 0)
    n2 = sum(1 for s in signs if s < 0)
    runs = 1 + sum(1 for a, b in zip(signs, signs[1:]) if a * b < 0) \
        if signs else 0
    if n1 == 0 or n2 == 0:
        return {"n_runs": runs, "n_positive": n1, "n_negative": n2, "p": None}
    if n1 + n2 > RUNS_EXACT_INT_MAX_N:
        return {"n_runs": runs, "n_positive": n1, "n_negative": n2,
                "p": _runs_p_float(n1, n2, runs), "p_method": "exact_float"}

    from math import comb
    total = comb(n1 + n2, n1)

    def count_runs_leq(r_max):
        c = 0
        for r in range(2, r_max + 1):
            if r % 2 == 0:
                k = r // 2
                c += 2 * comb(n1 - 1, k - 1) * comb(n2 - 1, k - 1)
            else:
                k = (r + 1) // 2
                c += (comb(n1 - 1, k - 1) * comb(n2 - 1, k - 2)
                      + comb(n1 - 1, k - 2) * comb(n2 - 1, k - 1))
        return c

    p = count_runs_leq(runs) / total
    return {"n_runs": runs, "n_positive": n1, "n_negative": n2,
            "p": min(float(p), 1.0), "p_method": "exact"}


RUNS_ORDER_NOTE = ("Residuals taken in order of X; residuals at the same X "
                   "keep the order they were entered in.")


def runs_test_by_x(x, resid) -> dict:
    """The runs test on the residuals ordered by X (stable sort: tied X
    values keep their entry order), as the curve-fit diagnostics do
    (diagnostics.py). Runs are a property of the residuals along the
    line, so a table entered in any row order gives the same answer."""
    order = np.argsort(np.asarray(x, dtype=float), kind="stable")
    out = runs_test(np.sign(np.asarray(resid, dtype=float)[order]).tolist())
    out["order"] = RUNS_ORDER_NOTE
    return out


def x_intercept_ci(a, b, var_a, var_b, cov_ab, tcrit):
    """Fieller confidence interval of X0 = -a / b, where the line a + b X
    crosses Y = 0: the X values at which the confidence band of the line
    crosses 0, i.e. the roots of (b^2 - t^2 var_b) X^2 + 2 (a b - t^2
    cov_ab) X + (a^2 - t^2 var_a) = 0 (Draper & Smith 1998, section 3.2,
    inverse prediction). None when the slope is not clearly non-zero
    (b^2 <= t^2 var_b: the band never leaves Y = 0 on one side, so the
    interval is unbounded)."""
    A = b * b - tcrit * tcrit * var_b
    B = 2.0 * (a * b - tcrit * tcrit * cov_ab)
    C = a * a - tcrit * tcrit * var_a
    if A <= 0:
        return None
    disc = B * B - 4.0 * A * C
    if disc < 0:
        return None
    r = math.sqrt(disc)
    lo, hi = sorted(((-B - r) / (2.0 * A), (-B + r) / (2.0 * A)))
    return [float(lo), float(hi)]


def linear_regression_through_point(x_values, y_values, x0: float, y0: float, *,
                                    ci_level: float = 0.95) -> dict:
    """Line forced through (x0, y0): Y - y0 = Slope (X - x0), one free
    parameter, df = n - 1, SE(Slope) = Sy.x / sqrt(sum (X - x0)^2), and the
    confidence band t Sy.x |X - x0| / sqrt(sum (X - x0)^2), zero width at
    the point (R: lm(I(y - y0) ~ 0 + I(x - x0))). R squared is 1 - SS res
    / SS about the mean, so it can be negative when the point is far from
    the data."""
    x, y = _pairs(x_values, y_values)
    n = int(x.size)
    if n < 2:
        raise ValueError("a line through a point needs at least 2 XY pairs")
    u = x - x0
    suu = float(np.sum(u * u))
    if suu == 0:
        raise ValueError("every X value equals the X of the point")
    slope = float(np.sum(u * (y - y0)) / suu)
    resid = y - (y0 + slope * u)
    ss_res = float(np.sum(resid ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    df = n - 1
    sy_x = math.sqrt(ss_res / df) if df > 0 else math.nan
    se = sy_x / math.sqrt(suu)
    tcrit = float(stats.t.ppf((1 + ci_level) / 2, df))
    a = y0 - slope * x0
    var_b = se * se
    t = slope / se if se > 0 else math.inf
    p = float(2 * stats.t.sf(abs(t), df))
    return {
        "analysis": "linear_regression", "through_point": [float(x0), float(y0)],
        "equation": "Y = Slope*X + Yintercept, through the point",
        "n": n,
        "slope": {"value": slope, "se": se, "ci95": [slope - tcrit * se, slope + tcrit * se]},
        "y_intercept": {"value": a, "se": abs(x0) * se,
                        "ci95": sorted([a - tcrit * abs(x0) * se, a + tcrit * abs(x0) * se]),
                        "derived": True},
        "x_intercept": (-a / slope) if slope != 0 else None,
        "x_intercept_ci": x_intercept_ci(a, slope, x0 * x0 * var_b, var_b, -x0 * var_b, tcrit),
        "one_over_slope": (1.0 / slope) if slope != 0 else None,
        "r_squared": 1 - ss_res / ss_tot if ss_tot > 0 else None,
        "sy_x": sy_x,
        "f_nonzero_slope": {"F": float(t * t), "dfn": 1, "dfd": df, "p": p},
        "runs_test": runs_test_by_x(x, resid),
        "df": df,
        "ss_res": ss_res,
    }


def linear_regression(x_values, y_values, *, ci_level: float = 0.95) -> dict:
    x, y = _pairs(x_values, y_values)
    n = int(x.size)
    if n < 3:
        raise ValueError("linear regression needs at least 3 XY pairs")
    sxx = float(np.sum((x - x.mean()) ** 2))
    if sxx == 0:
        raise ValueError("all X values are identical")
    slope = float(np.sum((x - x.mean()) * (y - y.mean())) / sxx)
    intercept = float(y.mean() - slope * x.mean())
    yhat = slope * x + intercept
    resid = y - yhat
    ss_res = float(np.sum(resid ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    df = n - 2
    sy_x = math.sqrt(ss_res / df)
    se_slope = sy_x / math.sqrt(sxx)
    se_intercept = sy_x * math.sqrt(1 / n + x.mean() ** 2 / sxx)
    tcrit = float(stats.t.ppf((1 + ci_level) / 2, df))
    t_slope = slope / se_slope if se_slope > 0 else math.inf
    f = t_slope ** 2
    p = float(stats.f.sf(f, 1, df))

    return {
        "analysis": "linear_regression",
        "equation": "Y = Slope*X + Yintercept",
        "n": n,
        "slope": {"value": slope, "se": se_slope,
                  "ci95": [slope - tcrit * se_slope, slope + tcrit * se_slope]},
        "y_intercept": {"value": intercept, "se": se_intercept,
                        "ci95": [intercept - tcrit * se_intercept,
                                 intercept + tcrit * se_intercept]},
        "x_intercept": (-intercept / slope) if slope != 0 else None,
        "x_intercept_ci": x_intercept_ci(
            intercept, slope, se_intercept ** 2, se_slope ** 2,
            -x.mean() * sy_x ** 2 / sxx, tcrit),
        "one_over_slope": (1.0 / slope) if slope != 0 else None,
        "r_squared": 1 - ss_res / ss_tot if ss_tot > 0 else None,
        "sy_x": sy_x,
        "f_nonzero_slope": {"F": float(f), "dfn": 1, "dfd": df, "p": p},
        "runs_test": runs_test_by_x(x, resid),
        "df": df,
        "ss_res": ss_res,
    }


def linear_bands(x_values, y_values, xs, *, kind: str = "confidence",
                 ci_level: float = 0.95, through=None) -> dict:
    """Closed-form confidence/prediction band for simple linear regression
    (through = (x0, y0): the line forced through that point)."""
    x, y = _pairs(x_values, y_values)
    if through is not None:
        x0, y0 = through
        fit = linear_regression_through_point(x_values, y_values, x0, y0, ci_level=ci_level)
        u = x - x0
        suu = float(np.sum(u * u))
        tcrit = float(stats.t.ppf((1 + ci_level) / 2, fit["df"]))
        xs = np.asarray(xs, float)
        yc = y0 + fit["slope"]["value"] * (xs - x0)
        core = (xs - x0) ** 2 / suu
        if kind == "prediction":
            core = core + 1.0
        half = tcrit * fit["sy_x"] * np.sqrt(core)
        return {"x": xs.tolist(), "y": yc.tolist(),
                "lower": (yc - half).tolist(), "upper": (yc + half).tolist()}
    n = x.size
    fit = linear_regression(x_values, y_values, ci_level=ci_level)
    slope, intercept = fit["slope"]["value"], fit["y_intercept"]["value"]
    sxx = float(np.sum((x - x.mean()) ** 2))
    sy_x = fit["sy_x"]
    tcrit = float(stats.t.ppf((1 + ci_level) / 2, n - 2))
    xs = np.asarray(xs, float)
    yc = slope * xs + intercept
    core = 1 / n + (xs - x.mean()) ** 2 / sxx
    if kind == "prediction":
        core = core + 1.0
    half = tcrit * sy_x * np.sqrt(core)
    return {"x": xs.tolist(), "y": yc.tolist(),
            "lower": (yc - half).tolist(), "upper": (yc + half).tolist()}
