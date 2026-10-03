"""Proportions: one proportion vs a hypothetical value, two proportions,
and the effect sizes of a 2 x 2 table with the CI methods Prism offers.

GraphPad statistics guide pages whose documented methods this implements:

- "The binomial test" (stat_binomial.htm): exact; the two-sided P value
  by the method of small P values (7 of 100 with 20% expected:
  P = 0.00061307). Reused from opendose.partsofwhole.binomial_test.
- "Three methods for computing the CI of a proportion": Clopper-Pearson,
  Wilson, and the hybrid Wilson/Brown method (recommended, default).
  Reused from opendose.partsofwhole.proportion_ci ("How Prism can
  compute a confidence interval of a proportion": 6 of 85 -> 0.0706,
  CI 0.0263 to 0.1473).
- "How to: Contingency table analysis" (Options) and the pages on
  relative risk, attributable risk and odds ratio:
  * relative risk = (first-column fraction of row 1) / (same of row 2),
    also reported as its reciprocal; CI by Koopman's asymptotic score
    method (recommended) or Katz's log method (Prism 6 and earlier,
    which adds 0.5 to every cell when one is zero);
  * difference between proportions P1 - P2 (attributable risk) with the
    Newcombe/Wilson score CI with or without continuity correction
    (Newcombe 1998 methods 11 and 10; with correction recommended) or
    the asymptotic method with continuity correction (Prism 6 and
    earlier, 0.5 added to every cell when one is zero); NNT = 1/(P1 -
    P2), whose CI is the reciprocal of both difference limits;
  * odds ratio with the Baptista-Pike exact conditional CI (recommended;
    the mid-p variant as an option) or Woolf's logit CI (0.5 added to
    every cell when one is zero). The guide's Woolf example (Doll & Hill
    688/650 vs 21/59) gives 2.974, 1.787 to 4.950;
  * "Interpreting results: Sensitivity and specificity": sensitivity,
    specificity, positive and negative predictive values with CIs by the
    chosen proportion method (Wilson/Brown recommended), and the
    likelihood ratio = sensitivity / (1 - specificity);
  * "Interpreting Results: Cramer's V and the Phi Coefficient": phi for
    2 x 2 tables (signed, (ad - bc) / sqrt(row and column totals)) and
    Cramer's V = sqrt(chi2 / (N (min(r, c) - 1))) for larger tables.

Published values used to validate the CI methods (Fagerland, Lydersen &
Laake 2015, Stat Methods Med Res 24:224-254, Perondi et al. data 7/34 vs
1/34): Newcombe hybrid score 0.019 to 0.34; Koopman 1.21 to 43; Katz
0.91 to 54; Woolf 0.99 to 74; Baptista-Pike exact 1.00 to 195;
Baptista-Pike mid-p 1.33 to 99.

The guide does not say how the CI of the likelihood ratio is computed;
it is computed here as a ratio of two independent proportions (the
positive rates in the two condition rows) with the Koopman score method.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import optimize, special, stats

from . import partsofwhole

PROPORTION_CI_METHODS = ("wilson_brown", "wilson", "clopper_pearson")
RR_CI_METHODS = ("koopman", "katz")
DIFF_CI_METHODS = ("newcombe_cc", "newcombe", "asymptotic_cc")
OR_CI_METHODS = ("baptista_pike", "baptista_pike_midp", "woolf")


def _z(ci_level):
    return float(stats.norm.ppf((1 + ci_level) / 2))


def _count(v, what="count"):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        raise ValueError(f"{what} cannot be blank")
    v = float(v)
    if v < 0 or not v.is_integer():
        raise ValueError(f"{what} must be a whole number >= 0")
    return int(v)


# ------------------------------------------------------- single proportion

def _prop_ci(k, n, method, ci_level):
    """partsofwhole.proportion_ci with the exact 0 / 1 ends for k = 0 / n
    (the guide: "when N=0 ... the lower confidence limit is 0.0")."""
    lo, hi = partsofwhole.proportion_ci(k, n, method=method,
                                        ci_level=ci_level)
    if k == 0:
        lo = 0.0
    if k == n:
        hi = 1.0
    return [lo, hi]


def one_proportion(successes, trials, *, p0=None, ci_method="wilson_brown",
                   ci_level: float = 0.95) -> dict:
    k, n = _count(successes, "successes"), _count(trials, "trials")
    if n < 1 or k > n:
        raise ValueError("need 0 <= successes <= trials and trials >= 1")
    out = {"successes": k, "trials": n, "proportion": k / n,
           "ci": _prop_ci(k, n, ci_method, ci_level),
           "ci_method": ci_method}
    if p0 is not None:
        p0 = float(p0)
        if not 0 < p0 < 1:
            raise ValueError("the hypothetical proportion must be between "
                             "0 and 1")
        out["binomial_test"] = partsofwhole.binomial_test(k, n, p0)
        out["hypothetical"] = p0
    return out


def _wilson_cc(k, n, z):
    """Wilson score interval with continuity correction (Newcombe 1998,
    method 4)."""
    p = k / n
    q = 1 - p
    denom = 2 * (n + z * z)
    lo = 0.0 if k == 0 else (
        (2 * n * p + z * z - 1
         - z * math.sqrt(max(z * z - 2 - 1 / n + 4 * p * (n * q + 1), 0.0)))
        / denom)
    hi = 1.0 if k == n else (
        (2 * n * p + z * z + 1
         + z * math.sqrt(max(z * z + 2 - 1 / n + 4 * p * (n * q - 1), 0.0)))
        / denom)
    return max(lo, 0.0), min(hi, 1.0)


def _wilson(k, n, z):
    return tuple(partsofwhole._wilson(k, n, z))


# ---------------------------------------------- difference of proportions

def difference_ci(k1, n1, k2, n2, *, method="newcombe_cc",
                  ci_level: float = 0.95) -> list:
    """CI of p1 - p2."""
    z = _z(ci_level)
    p1, p2 = k1 / n1, k2 / n2
    d = p1 - p2
    if method in ("newcombe", "newcombe_cc"):
        f = _wilson_cc if method == "newcombe_cc" else _wilson
        l1, u1 = f(k1, n1, z)
        l2, u2 = f(k2, n2, z)
        return [d - math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2),
                d + math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)]
    if method == "asymptotic_cc":
        if 0 in (k1, n1 - k1, k2, n2 - k2):
            k1, n1, k2, n2 = k1 + 0.5, n1 + 1.0, k2 + 0.5, n2 + 1.0
            p1, p2 = k1 / n1, k2 / n2
            d = p1 - p2
        half = (z * math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2)
                + 0.5 * (1 / n1 + 1 / n2))
        return [d - half, d + half]
    raise ValueError(f"unknown CI method for a difference: {method}")


# ------------------------------------------------------ ratio of proportions

def _pearson_term(x, n, p):
    """(x - n p)^2 / (n p (1 - p)), with its limits at p = 0 or 1."""
    if p >= 1 - 1e-12:
        return n * (1 - p) / p if x == n else math.inf
    if p <= 1e-300:
        return math.inf if x > 0 else 0.0
    return (x - n * p) ** 2 / (n * p * (1 - p))


def _koopman_u(theta, x1, n1, x2, n2):
    """Koopman's score statistic for H0: p1 / p2 = theta: the Pearson
    chi-square at the constrained MLE p1~ (closed form, Fagerland et al.
    2015) and p2~ = p1~ / theta. Written as the sum of the two Pearson
    terms (equivalent to their single-term form) so that p~ = 1 limits
    stay finite."""
    n = n1 + n2
    a = theta * (n1 + x2) + x1 + n2
    disc = max(a * a - 4 * theta * n * (x1 + x2), 0.0)
    pt1 = (a - math.sqrt(disc)) / (2 * n)
    pt2 = pt1 / theta
    pt1 = min(max(pt1, 0.0), 1.0)
    pt2 = min(max(pt2, 0.0), 1.0)
    return _pearson_term(x1, n1, pt1) + _pearson_term(x2, n2, pt2)


def koopman_ci(x1, n1, x2, n2, *, ci_level: float = 0.95) -> list:
    """Koopman (1984) asymptotic score CI for (x1/n1) / (x2/n2): the two
    solutions of U(theta) = chi2_{1, level} (Fagerland et al. 2015)."""
    if x1 == 0 and x2 == 0:
        return [None, None]
    crit = float(stats.chi2.ppf(ci_level, 1))

    def g(logt):
        return _koopman_u(math.exp(logt), x1, n1, x2, n2) - crit

    lo = hi = None
    if x1 == 0:
        lo = 0.0
    if x2 == 0:
        hi = math.inf
    est = math.log((x1 / n1) / (x2 / n2)) if x1 > 0 and x2 > 0 else None
    if lo is None:
        start = est if est is not None else math.log(1e6)
        a = start - 1e-9
        b = a - 1.0
        while g(b) < 0:
            b -= 1.0
            if b < -700:
                break
        lo = math.exp(optimize.brentq(g, b, a, xtol=1e-12))
    if hi is None:
        start = est if est is not None else math.log(1e-6)
        a = start + 1e-9
        b = a + 1.0
        while g(b) < 0:
            b += 1.0
            if b > 700:
                break
        hi = math.exp(optimize.brentq(g, a, b, xtol=1e-12))
    return [lo, hi]


def relative_risk(table, *, method="koopman", ci_level: float = 0.95) -> dict:
    (a, b), (c, d) = table
    n1, n2 = a + b, c + d
    if n1 <= 0 or n2 <= 0:
        return None
    if method == "koopman":
        if a == 0 and c == 0:
            return None
        rr = (a / n1) / (c / n2) if c > 0 else math.inf
        ci = koopman_ci(a, n1, c, n2, ci_level=ci_level)
        note = None
    elif method == "katz":
        note = None
        if 0 in (a, b, c, d):
            a, b, c, d = a + 0.5, b + 0.5, c + 0.5, d + 0.5
            n1, n2 = a + b, c + d
            note = "0.5 was added to every cell (a cell is zero)"
        rr = (a / n1) / (c / n2)
        se = math.sqrt(1 / a - 1 / n1 + 1 / c - 1 / n2)
        z = _z(ci_level)
        ci = [rr * math.exp(-z * se), rr * math.exp(z * se)]
    else:
        raise ValueError(f"unknown CI method for a relative risk: {method}")
    out = {"value": rr, "ci": ci, "ci_method": method,
           "reciprocal": (1 / rr if rr not in (0, math.inf) else
                          (math.inf if rr == 0 else 0.0)),
           "reciprocal_ci": [(1 / ci[1] if ci[1] not in (0, math.inf, None)
                              else (0.0 if ci[1] == math.inf else None)),
                             (1 / ci[0] if ci[0] not in (0, None)
                              else (math.inf if ci[0] == 0 else None))]}
    if note:
        out["note"] = note
    return out


# ---------------------------------------------------------------- odds ratio

def _nchg_logpmf(x1, n1, n2, m1, theta):
    """log f(x | theta) of Fisher's noncentral hypergeometric over the
    support of x11 (row totals n1, n2; first-column total m1)."""
    lo, hi = max(0, m1 - n2), min(n1, m1)
    xs = np.arange(lo, hi + 1)
    logc = (special.gammaln(n1 + 1) - special.gammaln(xs + 1)
            - special.gammaln(n1 - xs + 1) + special.gammaln(n2 + 1)
            - special.gammaln(m1 - xs + 1) - special.gammaln(n2 - m1 + xs + 1))
    lw = logc + xs * math.log(theta)
    lw -= special.logsumexp(lw)
    return xs, lw


def _bp_pvalue(log_theta, x11, n1, n2, m1, midp):
    xs, lp = _nchg_logpmf(x11, n1, n2, m1, math.exp(log_theta))
    p = np.exp(lp)
    obs = p[xs == x11][0]
    val = float(p[p <= obs * (1 + 1e-7)].sum())
    if midp:
        val -= 0.5 * obs
    return val


def baptista_pike_ci(table, *, ci_level: float = 0.95,
                     midp: bool = False) -> list:
    """Baptista-Pike exact conditional CI of the odds ratio: the outermost
    theta with sum_{f(x|theta) <= f(x11|theta)} f(x|theta) = alpha
    (minus half the observed point probability for mid-p)."""
    (a, b), (c, d) = [[int(v) for v in row] for row in table]
    n1, n2, m1 = a + b, c + d, a + c
    lo_x, hi_x = max(0, m1 - n2), min(n1, m1)
    alpha = 1 - ci_level
    if lo_x == hi_x:
        return [0.0, math.inf]
    if a == lo_x:      # conditional MLE is 0: the set is (0, U)
        center = -40.0
    elif a == hi_x:    # conditional MLE is infinite: the set is (L, inf)
        center = 40.0
    elif b * c > 0 and a * d > 0:
        center = math.log(a * d / (b * c))
    else:
        center = 0.0

    def f(t):
        return _bp_pvalue(t, a, n1, n2, m1, midp) - alpha

    def outer(direction):
        # scan outward on a log grid and keep the outermost theta still
        # inside the acceptance set; P(theta) -> 0 in both tails, so the
        # scan stops once it has been outside for 10 log units
        step = 0.02
        t = center
        last_in = center if f(center) > 0 else None
        for _ in range(int(80 / step)):
            t += direction * step
            if f(t) > 0:
                last_in = t
            elif abs(t - (center if last_in is None else last_in)) > 10:
                break
        if last_in is None:
            return None
        # refine between last_in and the next (outside) grid point
        a_, b_ = last_in, last_in + direction * step
        if f(b_) > 0:
            return math.inf if direction > 0 else -math.inf
        return optimize.brentq(f, min(a_, b_), max(a_, b_), xtol=1e-12)

    lower = 0.0 if a == lo_x else outer(-1)
    upper = math.inf if a == hi_x else outer(+1)
    lo = lower if lower == 0.0 else (0.0 if lower in (None, -math.inf)
                                     else math.exp(lower))
    hi = upper if upper == math.inf else (math.inf if upper is None
                                          else math.exp(upper))
    return [lo, hi]


def odds_ratio(table, *, method="baptista_pike",
               ci_level: float = 0.95) -> dict:
    (a, b), (c, d) = table
    if method in ("baptista_pike", "baptista_pike_midp"):
        if (a + b) * (c + d) * (a + c) * (b + d) == 0:
            return None
        value = (a * d) / (b * c) if b * c > 0 else math.inf
        ci = baptista_pike_ci(table, ci_level=ci_level,
                              midp=method.endswith("midp"))
        out = {"value": value, "ci": ci, "ci_method": method}
    elif method == "woolf":
        note = None
        if 0 in (a, b, c, d):
            a, b, c, d = a + 0.5, b + 0.5, c + 0.5, d + 0.5
            note = "0.5 was added to every cell (a cell is zero)"
        value = (a * d) / (b * c)
        se = math.sqrt(1 / a + 1 / b + 1 / c + 1 / d)
        z = _z(ci_level)
        out = {"value": value,
               "ci": [value * math.exp(-z * se), value * math.exp(z * se)],
               "ci_method": "woolf"}
        if note:
            out["note"] = note
    else:
        raise ValueError(f"unknown CI method for an odds ratio: {method}")
    v = out["value"]
    out["reciprocal"] = 1 / v if v not in (0, math.inf) else (
        math.inf if v == 0 else 0.0)
    return out


# --------------------------------------------------------- 2 x 2 effect sizes

def _check_2x2(table):
    grid = np.asarray(table, dtype=float)
    if grid.shape != (2, 2):
        raise ValueError("effect sizes need a 2 x 2 table")
    if not np.all(np.isfinite(grid)) or np.any(grid < 0):
        raise ValueError("counts must be non-negative numbers")
    if not np.all(grid == np.round(grid)):
        raise ValueError("enter counts (whole numbers)")
    return [[int(grid[0, 0]), int(grid[0, 1])],
            [int(grid[1, 0]), int(grid[1, 1])]]


def diagnostic_measures(table, *, ci_method="wilson_brown",
                        ci_level: float = 0.95,
                        layout: str = "rows_condition") -> dict:
    """Sensitivity, specificity, predictive values and likelihood ratios.

    layout "rows_condition" (as opendose.contingency): row 1 = condition
    present, row 2 = absent; column 1 = test positive. "rows_test":
    row 1 = test positive, row 2 = test negative; column 1 = condition
    present."""
    t = _check_2x2(table)
    if layout == "rows_test":
        (tp, fp), (fn, tn) = t
    elif layout == "rows_condition":
        (tp, fn), (fp, tn) = t
    else:
        raise ValueError(f"unknown layout: {layout}")

    def prop(k, n):
        if n <= 0:
            return None
        return {"value": k / n, "numerator": k, "denominator": n,
                "ci": _prop_ci(k, n, ci_method, ci_level)}

    out = {"layout": layout, "ci_method": ci_method,
           "sensitivity": prop(tp, tp + fn),
           "specificity": prop(tn, tn + fp),
           "positive_predictive_value": prop(tp, tp + fp),
           "negative_predictive_value": prop(tn, tn + fn)}
    # LR+ = P(test+ | condition) / P(test+ | no condition)
    if tp + fn > 0 and fp + tn > 0 and (tp > 0 or fp > 0):
        lr = ((tp / (tp + fn)) / (fp / (fp + tn)) if fp > 0 else math.inf)
        out["likelihood_ratio"] = {
            "value": lr,
            "ci": koopman_ci(tp, tp + fn, fp, fp + tn, ci_level=ci_level),
            "ci_method": "koopman"}
    else:
        out["likelihood_ratio"] = None
    if tp + fn > 0 and fp + tn > 0 and (fn > 0 or tn > 0):
        lrn = ((fn / (tp + fn)) / (tn / (fp + tn)) if tn > 0 else math.inf)
        out["negative_likelihood_ratio"] = {
            "value": lrn,
            "ci": koopman_ci(fn, tp + fn, tn, fp + tn, ci_level=ci_level),
            "ci_method": "koopman"}
    else:
        out["negative_likelihood_ratio"] = None
    return out


def two_by_two_effects(table, *, rr_method="koopman",
                       diff_method="newcombe_cc", or_method="baptista_pike",
                       prop_ci_method="wilson_brown", ci_level: float = 0.95,
                       diagnostic_layout: str = "rows_condition") -> dict:
    """Every 2 x 2 effect size the contingency analysis offers. Rows are
    groups, columns outcomes; the 'risk' of a row is its first-column
    count divided by its total."""
    t = _check_2x2(table)
    (a, b), (c, d) = t
    n1, n2 = a + b, c + d
    out = {"ci_level": ci_level}
    if n1 > 0 and n2 > 0:
        p1, p2 = a / n1, c / n2
        diff = p1 - p2
        dci = difference_ci(a, n1, c, n2, method=diff_method,
                            ci_level=ci_level)
        out["proportions"] = {"p1": p1, "p2": p2}
        out["difference"] = {"value": diff, "ci": dci,
                             "ci_method": diff_method}
        out["nnt"] = {
            "value": (1 / diff if diff != 0 else math.inf),
            "ci": [(1 / dci[0] if dci[0] != 0 else math.inf),
                   (1 / dci[1] if dci[1] != 0 else math.inf)],
            "ci_includes_infinity": bool(dci[0] < 0 < dci[1])}
        out["relative_risk"] = relative_risk(t, method=rr_method,
                                             ci_level=ci_level)
    out["odds_ratio"] = odds_ratio(t, method=or_method, ci_level=ci_level)
    out["diagnostic"] = diagnostic_measures(
        t, ci_method=prop_ci_method, ci_level=ci_level,
        layout=diagnostic_layout)
    denom = math.sqrt(float(n1) * n2 * (a + c) * (b + d))
    out["phi"] = (a * d - b * c) / denom if denom > 0 else None
    return out


def cramers_v(table) -> dict:
    grid = np.asarray(table, dtype=float)
    chi2 = float(stats.chi2_contingency(grid, correction=False)[0])
    n = grid.sum()
    q = min(grid.shape) - 1
    return {"value": math.sqrt(chi2 / (n * q)) if n > 0 and q > 0 else None,
            "chi2": chi2}


# --------------------------------------------------------- two proportions

def compare_two_proportions(k1, n1, k2, n2, *, ci_level: float = 0.95,
                            ci_method: str = "wilson_brown",
                            diff_method: str = "newcombe_cc",
                            rr_method: str = "koopman",
                            or_method: str = "baptista_pike") -> dict:
    """Compare two independent proportions k1/n1 and k2/n2: Fisher's
    exact test, the z test (= chi-square without correction) with and
    without Yates' correction, and the 2 x 2 effect sizes."""
    k1, n1 = _count(k1, "successes"), _count(n1, "trials")
    k2, n2 = _count(k2, "successes"), _count(n2, "trials")
    if n1 < 1 or n2 < 1 or k1 > n1 or k2 > n2:
        raise ValueError("need 0 <= successes <= trials and trials >= 1")
    table = [[k1, n1 - k1], [k2, n2 - k2]]
    p1, p2 = k1 / n1, k2 / n2
    pooled = (k1 + k2) / (n1 + n2)
    se0 = math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2))
    out = {"groups": [one_proportion(k1, n1, ci_method=ci_method,
                                     ci_level=ci_level),
                      one_proportion(k2, n2, ci_method=ci_method,
                                     ci_level=ci_level)],
           "difference": p1 - p2,
           "fisher_exact": {"p": float(stats.fisher_exact(table)[1])}}
    if se0 > 0:
        z = (p1 - p2) / se0
        zc = math.copysign(
            max(abs(p1 - p2) - 0.5 * (1 / n1 + 1 / n2), 0.0) / se0, z)
        out["z_test"] = {"z": z, "p": float(2 * stats.norm.sf(abs(z))),
                         "chi2": z * z}
        out["z_test_yates"] = {"z": zc,
                               "p": float(2 * stats.norm.sf(abs(zc))),
                               "chi2": zc * zc}
    else:
        out["z_test"] = out["z_test_yates"] = None
    eff = two_by_two_effects(table, rr_method=rr_method,
                             diff_method=diff_method, or_method=or_method,
                             prop_ci_method=ci_method, ci_level=ci_level)
    for key in ("difference", "nnt", "relative_risk", "odds_ratio"):
        out[key + ("_ci" if key == "difference" else "")] = eff.get(key)
    return out
