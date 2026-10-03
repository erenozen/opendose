"""Parts-of-whole analyses: comparing observed and expected
distributions, and fraction of total.

GraphPad Prism guides:

- Statistics guide, "How to: Compare observed and expected
  distributions" (statistics/stat_compareoande.htm) and "How the
  chi-square goodness of fit test works" (stat_the_chi-square_goodness_
  of_fit.htm): enter observed counts; expected values are entered as
  counts (summing to the observed total) or percentages (summing to
  100), fractional values allowed. Chi-square = sum of (O-E)^2/E with
  df = number of categories - 1; no Yates correction. With exactly two
  categories the binomial test is recommended.
- Statistics guide, "The binomial test" (stat_binomial.htm): exact
  test; the two-sided P value uses the "method of small P values" (sum
  the probabilities of every outcome no more likely than the observed
  one), not a doubled one-tail P. Worked example: 7 of 100 with an
  expected 20% gives one-tail P = 0.0003 and two-tail P = 0.00061307.
- User guide, "Fraction of total" (user-guide/fractions_of_total.htm):
  divide each value by its column total, row total or the grand total,
  shown as fractions or percentages; optional confidence intervals of
  each fraction (for counts) by one of three methods, Wilson/Brown
  recommended. Statistics guide, "Three methods for computing the CI of
  a proportion" (stat_three_methods_for_computing_th.htm): Clopper-
  Pearson "exact", Wilson, and the hybrid Wilson/Brown method, which
  uses Wilson except for numerators 1, 2 (and 3 when the denominator
  exceeds 50), and the mirror cases near the denominator, where Brown,
  Cai & DasGupta (2001) prescribe a one-sided Poisson approximation.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats


# ------------------------------------------------------- CI of a proportion

def _wilson(k: float, n: float, z: float) -> list:
    p = k / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return [max(0.0, center - half), min(1.0, center + half)]


def proportion_ci(k, n, *, method: str = "wilson_brown",
                  ci_level: float = 0.95) -> list:
    """Two-sided CI of the proportion k/n.

    method: 'wilson_brown' (default), 'wilson' or 'clopper_pearson'.
    The Wilson/Brown Poisson limits follow Brown, Cai & DasGupta (2001,
    sec. 4.1.1): lower = chi2_{alpha}(2k) / (2n), with alpha = 1 - level.
    """
    if n <= 0:
        return [None, None]
    alpha = 1 - ci_level
    if method == "clopper_pearson":
        lo = 0.0 if k == 0 else float(stats.beta.ppf(alpha / 2, k, n - k + 1))
        hi = 1.0 if k == n else float(stats.beta.ppf(1 - alpha / 2, k + 1, n - k))
        return [lo, hi]
    z = float(stats.norm.ppf(1 - alpha / 2))
    lo, hi = _wilson(k, n, z)
    if method == "wilson":
        return [lo, hi]
    if method != "wilson_brown":
        raise ValueError(f"unknown proportion CI method: {method}")
    small = (1, 2, 3) if n > 50 else (1, 2)
    if k in small:
        lo = 0.5 * float(stats.chi2.ppf(alpha, 2 * k)) / n
    if (n - k) in small:
        hi = 1 - 0.5 * float(stats.chi2.ppf(alpha, 2 * (n - k))) / n
    return [lo, hi]


# ------------------------------------------------ chi-square goodness of fit

def _clean_counts(values) -> list:
    out = []
    for v in values:
        if v is None or (isinstance(v, float) and math.isnan(v)):
            raise ValueError("observed counts cannot contain blanks")
        v = float(v)
        if v < 0:
            raise ValueError("observed counts must be non-negative")
        out.append(v)
    return out


def binomial_test(k: int, n: int, p0: float) -> dict:
    """Exact binomial test; two-sided P by the method of small P values."""
    k, n = int(round(k)), int(round(n))
    res = stats.binomtest(k, n, p0, alternative="two-sided")
    expected = n * p0
    if k <= expected:
        one = float(stats.binom.cdf(k, n, p0))
    else:
        one = float(stats.binom.sf(k - 1, n, p0))
    return {"successes": k, "trials": n, "expected_fraction": p0,
            "p_two_tailed": float(res.pvalue), "p_one_tailed": min(one, 1.0)}


def chisq_goodness_of_fit(observed, expected, *, expected_as: str = "auto",
                          categories=None) -> dict:
    """Compare observed counts with an expected distribution.

    expected_as: 'counts' | 'percent' | 'fraction' | 'auto'. Whatever
    the form, the expected values are normalised to fractions and scaled
    to the observed total (so counts that do not quite sum to the total
    are rescaled; the raw sum is reported). 'auto' treats the values as
    percentages if they sum to 100, fractions if they sum to 1, and
    counts otherwise.
    """
    obs = _clean_counts(observed)
    exp_raw = _clean_counts(expected)
    k = len(obs)
    if k < 2:
        raise ValueError("need at least two categories")
    if len(exp_raw) != k:
        raise ValueError("enter one expected value per category")
    total = sum(obs)
    if total <= 0:
        raise ValueError("observed counts sum to zero")
    exp_sum = sum(exp_raw)
    if exp_sum <= 0 or any(e <= 0 for e in exp_raw):
        raise ValueError("every expected value must be positive")
    if expected_as == "auto":
        if abs(exp_sum - 100) < 1e-6:
            expected_as = "percent"
        elif abs(exp_sum - 1) < 1e-6:
            expected_as = "fraction"
        else:
            expected_as = "counts"
    if expected_as not in ("counts", "percent", "fraction"):
        raise ValueError(f"unknown expected-value form: {expected_as}")
    fractions = [e / exp_sum for e in exp_raw]
    exp_counts = [f * total for f in fractions]
    contrib = [(o - e) ** 2 / e for o, e in zip(obs, exp_counts)]
    chi2 = float(sum(contrib))
    df = k - 1
    names = list(categories) if categories else [f"Category {i + 1}"
                                                 for i in range(k)]
    out = {
        "categories": [
            {"name": str(nm), "observed": o, "observed_fraction": o / total,
             "expected": e, "expected_fraction": f, "difference": o - e,
             "contribution": c}
            for nm, o, e, f, c in zip(names, obs, exp_counts, fractions,
                                      contrib)],
        "total": total,
        "expected_entered_as": expected_as,
        "expected_entered_sum": exp_sum,
        "chi_square": {"chi2": chi2, "df": df,
                       "p": float(stats.chi2.sf(chi2, df))},
        "recommended": "chi_square",
    }
    if any(e < 5 for e in exp_counts):
        out["warning"] = ("some expected counts are below 5; the chi-square "
                          "P value is only approximate")
    if k == 2:
        if not all(float(o).is_integer() for o in obs):
            out["binomial"] = None
        else:
            out["binomial"] = binomial_test(obs[0], total, fractions[0])
            out["recommended"] = "binomial"
    return out


# ---------------------------------------------------------- fraction of total

def fraction_of_total(columns, *, divide_by: str = "column",
                      as_percent: bool = False, ci: bool = False,
                      ci_method: str = "wilson_brown",
                      ci_level: float = 0.95) -> dict:
    """columns: list of value lists (one per dataset column; rows
    aligned). Blanks stay blank and are left out of every total.

    divide_by: 'column' | 'row' | 'grand'. With ci=True every cell must
    be a non-negative whole number (a count), as the guide requires.
    """
    if divide_by not in ("column", "row", "grand"):
        raise ValueError(f"unknown divisor: {divide_by}")
    n_rows = max((len(c) for c in columns), default=0)
    grid = [[None if (i >= len(c) or c[i] is None or
                      (isinstance(c[i], float) and math.isnan(c[i])))
             else float(c[i]) for i in range(n_rows)] for c in columns]
    col_totals = [sum(v for v in col if v is not None) for col in grid]
    row_totals = [sum(col[i] for col in grid if col[i] is not None)
                  for i in range(n_rows)]
    grand = sum(col_totals)
    if ci:
        for col in grid:
            for v in col:
                if v is not None and (v < 0 or not v.is_integer()):
                    raise ValueError("confidence intervals need counts "
                                     "(non-negative whole numbers)")
    scale = 100.0 if as_percent else 1.0
    fractions, lows, highs = [], [], []
    for j, col in enumerate(grid):
        fcol, lcol, hcol = [], [], []
        for i, v in enumerate(col):
            denom = (col_totals[j] if divide_by == "column" else
                     row_totals[i] if divide_by == "row" else grand)
            if v is None or denom == 0:
                fcol.append(None)
                lcol.append(None)
                hcol.append(None)
                continue
            fcol.append(scale * v / denom)
            if ci:
                lo, hi = proportion_ci(v, denom, method=ci_method,
                                       ci_level=ci_level)
                lcol.append(scale * lo)
                hcol.append(scale * hi)
        fractions.append(fcol)
        if ci:
            lows.append(lcol)
            highs.append(hcol)
    out = {"divide_by": divide_by, "as_percent": as_percent,
           "fractions": fractions, "column_totals": col_totals,
           "row_totals": row_totals, "grand_total": grand}
    if ci:
        out.update({"ci_method": ci_method, "ci_level": ci_level,
                    "ci_lo": lows, "ci_hi": highs})
    return out
