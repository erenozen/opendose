"""Column Statistics (Prism: Analyze -> Column statistics).

Prism statistics guide, "Descriptive statistics": n, minimum, 25th
percentile, median, 75th percentile, maximum, mean, SD, SEM, 95% CI of
mean, CV, geometric mean (+ CI), skewness, kurtosis, sum. Normality:
Shapiro-Wilk, D'Agostino-Pearson omnibus K2, Anderson-Darling (A2* with
Stephens' correction). One-sample tests vs a hypothetical value:
one-sample t test and Wilcoxon signed rank.

Percentiles: Prism interpolates using the same rule as Excel's
PERCENTILE.INC (linear interpolation, R-7) by default.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats


def _clean(values) -> np.ndarray:
    return np.array([float(v) for v in values if v is not None], dtype=float)


def describe(values, ci_level: float = 0.95) -> dict:
    arr = _clean(values)
    n = arr.size
    if n == 0:
        return {"n": 0}
    out: dict = {"n": int(n), "sum": float(arr.sum()),
                 "minimum": float(arr.min()), "maximum": float(arr.max()),
                 "mean": float(arr.mean()),
                 "median": float(np.percentile(arr, 50)),
                 "percentile25": float(np.percentile(arr, 25)),
                 "percentile75": float(np.percentile(arr, 75))}
    if n >= 2:
        sd = float(arr.std(ddof=1))
        sem = sd / math.sqrt(n)
        tcrit = float(stats.t.ppf((1 + ci_level) / 2, n - 1))
        out.update({
            "sd": sd, "sem": sem, "variance": sd * sd,
            "ci_mean": [out["mean"] - tcrit * sem, out["mean"] + tcrit * sem],
            "cv_percent": (100.0 * sd / abs(out["mean"])
                           if out["mean"] != 0 else None),
        })
        if np.all(arr > 0):
            logs = np.log10(arr)
            gm = 10 ** logs.mean()
            gsem = logs.std(ddof=1) / math.sqrt(n)
            out["geometric_mean"] = float(gm)
            out["ci_geometric_mean"] = [
                float(10 ** (logs.mean() - tcrit * gsem)),
                float(10 ** (logs.mean() + tcrit * gsem)),
            ]
        else:
            out["geometric_mean"] = None
            out["ci_geometric_mean"] = None
    if n >= 3:
        out["skewness"] = float(stats.skew(arr, bias=False))
    if n >= 4:
        out["kurtosis"] = float(stats.kurtosis(arr, bias=False))
    return out


def _anderson_darling_p(a2: float, n: int) -> float:
    """A2* correction and P value per D'Agostino & Stephens (1986), the
    approach Prism cites for its Anderson-Darling normality test."""
    a = a2 * (1.0 + 0.75 / n + 2.25 / (n * n))
    if a >= 0.6:
        p = math.exp(1.2937 - 5.709 * a + 0.0186 * a * a)
    elif a > 0.34:
        p = math.exp(0.9177 - 4.279 * a - 1.38 * a * a)
    elif a > 0.2:
        p = 1 - math.exp(-8.318 + 42.796 * a - 59.938 * a * a)
    else:
        p = 1 - math.exp(-13.436 + 101.14 * a - 223.73 * a * a)
    return min(max(p, 0.0), 1.0)


def normality_tests(values) -> dict:
    arr = _clean(values)
    n = arr.size
    out: dict = {}
    if n >= 3:
        w, p = stats.shapiro(arr)
        out["shapiro_wilk"] = {"W": float(w), "p": float(p),
                               "passed_alpha_05": bool(p > 0.05)}
    if n >= 8:  # D'Agostino-Pearson requires n >= 8
        k2, p = stats.normaltest(arr)
        out["dagostino_pearson"] = {"K2": float(k2), "p": float(p),
                                    "passed_alpha_05": bool(p > 0.05)}
    if n >= 5:
        # A2 computed directly (Anderson-Darling with estimated mean/SD):
        # A2 = -n - (1/n) * sum (2i-1) * [ln F(z_(i)) + ln(1 - F(z_(n+1-i)))]
        z = np.sort((arr - arr.mean()) / arr.std(ddof=1))
        cdf = stats.norm.cdf(z)
        cdf = np.clip(cdf, 1e-15, 1 - 1e-15)
        i = np.arange(1, n + 1)
        a2 = float(-n - np.sum((2 * i - 1) * (np.log(cdf)
                                              + np.log(1 - cdf[::-1]))) / n)
        p = _anderson_darling_p(a2, n)
        out["anderson_darling"] = {"A2": a2, "p": p,
                                   "passed_alpha_05": bool(p > 0.05)}
    return out


def one_sample_t(values, hypothetical: float, ci_level: float = 0.95) -> dict:
    arr = _clean(values)
    n = arr.size
    if n < 2:
        raise ValueError("one-sample t test needs at least 2 values")
    t_stat, p = stats.ttest_1samp(arr, hypothetical)
    mean = float(arr.mean())
    sem = float(arr.std(ddof=1)) / math.sqrt(n)
    tcrit = float(stats.t.ppf((1 + ci_level) / 2, n - 1))
    diff = mean - hypothetical
    return {
        "hypothetical": hypothetical,
        "mean": mean,
        "discrepancy": diff,
        "t": float(abs(t_stat)),
        "df": int(n - 1),
        "p_two_tailed": float(p),
        "ci_discrepancy": [diff - tcrit * sem, diff + tcrit * sem],
        "r_squared": float(t_stat ** 2 / (t_stat ** 2 + (n - 1))),
    }


def wilcoxon_signed_rank(values, hypothetical: float) -> dict:
    arr = _clean(values)
    diffs = arr - hypothetical
    diffs = diffs[diffs != 0]
    if diffs.size < 1:
        raise ValueError("all values equal the hypothetical value")
    res = stats.wilcoxon(diffs)
    signed_ranks = stats.rankdata(np.abs(diffs)) * np.sign(diffs)
    return {
        "hypothetical": hypothetical,
        "median": float(np.median(arr)),
        "sum_signed_ranks": float(signed_ranks.sum()),
        "W": float(res.statistic),
        "p_two_tailed": float(res.pvalue),
        "n": int(arr.size),
    }


def column_statistics(values, *, hypothetical=None, ci_level=0.95) -> dict:
    """Full Prism Column Statistics for one dataset column."""
    out = {"descriptive": describe(values, ci_level),
           "normality": normality_tests(values)}
    if hypothetical is not None and out["descriptive"].get("n", 0) >= 2:
        out["one_sample_t"] = one_sample_t(values, hypothetical, ci_level)
        try:
            out["wilcoxon"] = wilcoxon_signed_rank(values, hypothetical)
        except ValueError:
            out["wilcoxon"] = None
    return out
