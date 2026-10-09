"""Column Statistics (Prism: Analyze -> Column statistics).

Prism statistics guide, "Descriptive statistics": n, minimum, 25th
percentile, median, 75th percentile, maximum, mean, SD, SEM, 95% CI of
mean, CV, geometric mean (+ CI), skewness, kurtosis, sum. Normality:
Shapiro-Wilk, D'Agostino-Pearson omnibus K2, Anderson-Darling (A2* with
Stephens' correction). describe() also reports the lag-1 autocorrelation
of the values in entry order ("lag1_autocorrelation", NIST StRD's
univariate statistic; not a Prism column statistic). One-sample tests vs a hypothetical value:
one-sample t test and Wilcoxon signed rank.

Percentiles: describe() keeps its original linear interpolation (R-7,
Excel's PERCENTILE.INC) by default. The guide ("Interpreting results:
Quartiles and the interquartile range") documents a different rule for
Prism 5 and later: rank R = P(n + 1)/100, interpolated between the
neighbouring values (Hyndman & Fan definition 6), with the smallest
(largest) value reported when R < 1 (R > n). percentile(...,
method="prism") implements that rule, and describe(...,
percentile_method="prism") uses it for the quartiles (the median is the
same under every definition).

Additions from the guide's descriptive-statistics pages (all opt-in):
- "Interpreting results: Median and its CI": the binomial-distribution
  method of Zar (pp. 548-549); the limits are data values, no
  interpolation, and the actual confidence level is reported (the
  guide's example shows 96.88% for n = 6, i.e. from the minimum to the
  maximum). median_ci().
- "The geometric mean and geometric SD factor": geometric SD factor =
  10^(SD of log10 values); guide example 12.6, 501.2, 7.9, 9.7, 83.1,
  19.0, 190.5, 245.5 -> geometric mean 49.55, geometric SD factor 5.15.
- "Harmonic, quadratic, trimmed, and winsorized mean": harmonic and
  quadratic means with CIs from the CI of the mean of reciprocals /
  squares; mode; trimmed and winsorized means for a chosen K (the guide
  notes Prism itself does not compute these two).
- "Choosing a normality test": the Kolmogorov-Smirnov normality test
  with the Dallal-Wilkinson approximation to Lilliefors' P; "since that
  method is only accurate with small P values, Prism simply reports
  P>0.10 for large P values"; needs n >= 5 ("Q&A: Normality tests").
  normality_tests(..., tests=[..., "kolmogorov_smirnov"]).
- "Interpreting results: One-sample ratio t test": t test of log10
  values against log10(hypothetical); reports the geometric mean, the
  ratio geometric mean / hypothetical with CI, and the geometric SD of
  the ratios. one_sample_ratio_t().
- "Interpreting results: Wilcoxon signed rank test": exact P with fewer
  than 200 values (ties included); values equal to the hypothetical
  median dropped (Wilcoxon) or handled by Pratt's method; CI of the
  median from the Walsh averages (Sheskin pp. 234-235, Klotz).
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

from . import effectsize


def _clean(values) -> np.ndarray:
    return np.array([float(v) for v in values if v is not None], dtype=float)


def lag1_autocorrelation(values):
    """Lag-1 autocorrelation in entry order (NIST StRD univariate
    summary statistics; Box & Jenkins' r1):

        r(1) = sum_{i<n} (y_i - ybar)(y_{i+1} - ybar) / sum_i (y_i - ybar)^2.

    The mean is refined once (ybar + mean(y - ybar)) so that data far
    from zero relative to their spread (NIST NumAcc4: 1e7 + 0.2, SD 0.1)
    keep every digit. Blank cells are skipped, so neighbours are the
    values as entered. None with fewer than two values or no spread."""
    arr = _clean(values)
    if arr.size < 2:
        return None
    m = float(arr.mean())
    m += float((arr - m).mean())
    d = arr - m
    den = float(d @ d)
    if not den > 0:
        return None
    return float(d[:-1] @ d[1:]) / den


def describe(values, ci_level: float = 0.95, *,
             percentile_method: str = "linear") -> dict:
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
    if percentile_method != "linear":
        out["percentile25"] = percentile(arr, 25, method=percentile_method)
        out["percentile75"] = percentile(arr, 75, method=percentile_method)
        out["percentile_method"] = percentile_method
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
    if n >= 2:
        out["lag1_autocorrelation"] = lag1_autocorrelation(arr)
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


# Royston (1995, Appl Stat 44:547, algorithm AS R94) approximates the
# Shapiro-Wilk P value for 3 <= n <= 5000; larger samples get a note.
SHAPIRO_MAX_N = 5000


def normality_tests(values, tests=None) -> dict:
    """Shapiro-Wilk, D'Agostino-Pearson and Anderson-Darling by default;
    tests = an iterable of names to choose ("shapiro_wilk",
    "dagostino_pearson", "anderson_darling", "kolmogorov_smirnov" / "ks").
    tests = True selects all four, False the default three.
    """
    if tests is True:
        tests = ("shapiro_wilk", "dagostino_pearson", "anderson_darling",
                 "kolmogorov_smirnov")
    elif tests is False:
        tests = None
    if tests is not None:
        wanted = {("kolmogorov_smirnov" if t == "ks" else t) for t in tests}
        full = normality_tests(values)
        if "kolmogorov_smirnov" in wanted and _clean(values).size >= 5:
            try:
                full["kolmogorov_smirnov"] = ks_normality(values)
            except ValueError as exc:
                full["kolmogorov_smirnov"] = {"error": str(exc)}
        return {k: v for k, v in full.items() if k in wanted}
    arr = _clean(values)
    n = arr.size
    out: dict = {}
    if n >= 3:
        w, p = stats.shapiro(arr)
        out["shapiro_wilk"] = {"W": float(w), "p": float(p),
                               "passed_alpha_05": bool(p > 0.05)}
        if n > SHAPIRO_MAX_N:
            out["shapiro_wilk"]["note"] = (
                f"n = {n} exceeds {SHAPIRO_MAX_N}, beyond the range of "
                "Royston's (1995) approximation of the Shapiro-Wilk P "
                "value (AS R94, as used by scipy): the P value may be "
                "inaccurate")
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
        "effect_size": effectsize.safe(effectsize.one_sample_d, arr,
                                       hypothetical, ci_level=ci_level),
    }


def wilcoxon_signed_rank(values, hypothetical: float, *,
                         zero_method: str = "wilcox",
                         ci_level: float = 0.95) -> dict:
    from .ttests import signed_rank_test, walsh_ci

    arr = _clean(values)
    diffs = arr - hypothetical
    if not np.any(diffs != 0):
        raise ValueError("all values equal the hypothetical value")
    res = signed_rank_test(diffs, zero_method=zero_method)
    nz = diffs[diffs != 0]
    signed_ranks = stats.rankdata(np.abs(nz)) * np.sign(nz)
    out = {
        "hypothetical": hypothetical,
        "median": float(np.median(arr)),
        "sum_signed_ranks": (float(signed_ranks.sum())
                             if zero_method == "wilcox"
                             else res["sum_signed_ranks"]),
        "W": res["statistic_min"],
        "p_two_tailed": res["p"],
        "n": int(arr.size),
    }
    out.update({key: res[key] for key in (
        "p_method", "zero_method", "sum_positive_ranks",
        "sum_negative_ranks", "n_zero_differences")})
    ci = walsh_ci(arr, ci_level)
    out.update({"hodges_lehmann_median": ci["hodges_lehmann"],
                "ci_median": ci["ci_median"],
                "ci_actual_level": ci["ci_actual_level"]})
    out["effect_size"] = effectsize.safe(
        effectsize.rank_biserial_paired, diffs, zero_method=zero_method,
        ci_level=ci_level)
    return out


def one_sample_ratio_t(values, hypothetical: float,
                       ci_level: float = 0.95) -> dict:
    """One-sample ratio t test: geometric mean vs a hypothetical
    geometric mean, on log10 values."""
    arr = _clean(values)
    if arr.size < 2:
        raise ValueError("one-sample ratio t test needs at least 2 values")
    if np.any(arr <= 0) or not hypothetical > 0:
        raise ValueError("the ratio t test needs positive values and a "
                         "positive hypothetical value")
    logs = np.log10(arr)
    n = arr.size
    diff = float(logs.mean() - math.log10(hypothetical))
    sd = float(logs.std(ddof=1))
    se = sd / math.sqrt(n)
    tcrit = float(stats.t.ppf((1 + ci_level) / 2, n - 1))
    t_stat = diff / se if se > 0 else (math.inf if diff != 0 else math.nan)
    p = (2 * float(stats.t.sf(abs(t_stat), n - 1))
         if t_stat == t_stat else math.nan)
    return {
        "hypothetical": hypothetical,
        "geometric_mean": float(10 ** logs.mean()),
        "ratio": 10 ** diff,
        "ci_ratio": [10 ** (diff - tcrit * se), 10 ** (diff + tcrit * se)],
        "geometric_sd_ratio": 10 ** sd,
        "geometric_se_ratio": 10 ** se,
        "log10_difference": diff,
        "t": abs(t_stat), "df": int(n - 1), "p_two_tailed": p,
    }


def ks_normality(values) -> dict:
    """Kolmogorov-Smirnov normality test (Lilliefors: mean and SD
    estimated from the data), P from the Dallal-Wilkinson (1986)
    approximation. P > 0.10 is reported as such (p = None,
    p_greater_than = 0.10)."""
    arr = _clean(values)
    n = arr.size
    if n < 5:
        raise ValueError("the Kolmogorov-Smirnov test needs 5 or more values")
    sd = float(arr.std(ddof=1))
    if not sd > 0:
        raise ValueError("all values are identical")
    z = np.sort((arr - arr.mean()) / sd)
    cdf = stats.norm.cdf(z)
    i = np.arange(1, n + 1)
    d = float(max(np.max(i / n - cdf), np.max(cdf - (i - 1) / n)))
    dd, nn = d, float(n)
    if nn > 100:
        dd = d * (nn / 100.0) ** 0.49
        nn = 100.0
    p = math.exp(-7.01256 * dd * dd * (nn + 2.78019)
                 + 2.99587 * dd * math.sqrt(nn + 2.78019) - 0.122119
                 + 0.974598 / math.sqrt(nn) + 1.67997 / nn)
    out = {"KS": d, "n": int(n), "p_method": "dallal_wilkinson"}
    if p > 0.10:
        out.update({"p": None, "p_greater_than": 0.10,
                    "p_summary": "P>0.10", "passed_alpha_05": True})
    else:
        out.update({"p": float(p), "p_greater_than": None,
                    "p_summary": None, "passed_alpha_05": bool(p > 0.05)})
    return out


# ------------------------------------------------------ descriptive extras

PERCENTILE_METHODS = ("prism", "linear")


def percentile(values, pct: float, *, method: str = "prism") -> float:
    """Percentile of the values.

    method "prism": R = pct (n + 1) / 100, interpolate between the R-th
    smallest values; R < 1 gives the minimum and R > n the maximum
    (Hyndman & Fan definition 6, as the guide documents). "linear":
    numpy's default (definition 7, Excel PERCENTILE.INC)."""
    arr = np.sort(_clean(values))
    n = arr.size
    if n == 0:
        return None
    if method == "linear":
        return float(np.percentile(arr, pct))
    if method != "prism":
        raise ValueError(f"unknown percentile method: {method}")
    r = pct * (n + 1) / 100.0
    if r <= 1:
        return float(arr[0])
    if r >= n:
        return float(arr[-1])
    lo = int(math.floor(r))
    frac = r - lo
    return float(arr[lo - 1] + frac * (arr[lo] - arr[lo - 1]))


# Large-data threshold: up to this many values median_ci scans k with
# scalar binomial CDF calls (the original loop); above it one vectorised
# call gives the same levels (the loop costs ~n/2 scipy calls).
MEDIAN_CI_LOOP_MAX_N = 1000


def median_ci(values, ci_level: float = 0.95) -> dict:
    """CI of the median from the binomial distribution (Zar): the k-th
    smallest to the k-th largest value, k the largest integer with
    1 - 2 P(B <= k - 1) >= ci_level, B ~ Binomial(n, 1/2)."""
    arr = np.sort(_clean(values))
    n = arr.size
    out = {"median": float(np.median(arr)) if n else None,
           "ci": None, "actual_level": None}
    if n < 1:
        return out
    best = None
    if n <= MEDIAN_CI_LOOP_MAX_N:
        for k in range(1, n // 2 + 1):
            level = 1.0 - 2.0 * float(stats.binom.cdf(k - 1, n, 0.5))
            if level >= ci_level - 1e-12:
                best = (k, level)
            else:
                break
    elif n // 2 >= 1:
        # the same scan with one vectorised binomial CDF call instead of
        # up to n/2 scalar calls: k runs while the level stays >= ci_level
        levels = 1.0 - 2.0 * stats.binom.cdf(np.arange(n // 2), n, 0.5)
        ok = levels >= ci_level - 1e-12
        stop = int(np.argmin(ok)) if not ok.all() else ok.size
        if stop > 0:
            best = (stop, float(levels[stop - 1]))
    if best is None:
        out["note"] = ("too few values for this confidence level "
                       "(the widest interval, minimum to maximum, has "
                       f"{100 * (1 - 2 * 0.5 ** n):.2f}% confidence)")
        return out
    k, level = best
    out.update({"ci": [float(arr[k - 1]), float(arr[n - k])],
                "actual_level": level, "rank_lower": k,
                "rank_upper": n - k + 1})
    return out


def _mean_ci(arr, ci_level):
    n = arr.size
    m = float(arr.mean())
    if n < 2:
        return m, None
    h = float(stats.t.ppf((1 + ci_level) / 2, n - 1)) * \
        float(arr.std(ddof=1)) / math.sqrt(n)
    return m, (m - h, m + h)


def descriptive_extras(values, ci_level: float = 0.95, *,
                       percentile_method: str = "prism",
                       percentiles=(10, 25, 75, 90),
                       trim_k=None) -> dict:
    """Descriptive statistics beyond describe(): percentiles by the
    guide's rule, median CI, geometric SD factor, harmonic and quadratic
    means with CIs, mode, and (with trim_k) trimmed/winsorized means."""
    arr = np.sort(_clean(values))
    n = arr.size
    out: dict = {"n": int(n), "percentile_method": percentile_method}
    if n == 0:
        return out
    out["percentiles"] = {str(p): percentile(arr, p, method=percentile_method)
                          for p in percentiles}
    q1 = percentile(arr, 25, method=percentile_method)
    q3 = percentile(arr, 75, method=percentile_method)
    out["interquartile_range"] = q3 - q1
    out["median_ci"] = median_ci(arr, ci_level)
    if np.all(arr > 0):
        logs = np.log10(arr)
        out["geometric_mean"] = float(10 ** logs.mean())
        out["geometric_sd_factor"] = (float(10 ** logs.std(ddof=1))
                                      if n >= 2 else None)
    else:
        out["geometric_mean"] = out["geometric_sd_factor"] = None
    # harmonic mean: reciprocal of the mean of reciprocals (and its CI)
    if np.all(arr != 0):
        m, ci = _mean_ci(1.0 / arr, ci_level)
        out["harmonic_mean"] = 1.0 / m if m != 0 else None
        out["ci_harmonic_mean"] = (
            [1.0 / ci[1], 1.0 / ci[0]] if ci and ci[0] > 0 or
            (ci and ci[1] < 0) else None)
    else:
        out["harmonic_mean"] = out["ci_harmonic_mean"] = None
    m, ci = _mean_ci(arr * arr, ci_level)
    out["quadratic_mean"] = math.sqrt(m)
    out["ci_quadratic_mean"] = ([math.sqrt(ci[0]), math.sqrt(ci[1])]
                                if ci and ci[0] >= 0 else None)
    vals, counts = np.unique(arr, return_counts=True)
    top = counts.max()
    modes = vals[counts == top]
    out["mode"] = float(modes[0]) if top > 1 or n == 1 else None
    out["mode_count"] = int(top)
    out["n_modes"] = int(modes.size) if top > 1 else 0
    if trim_k is not None:
        k = int(trim_k)
        if k < 0 or 2 * k >= n:
            raise ValueError("K must be >= 0 and leave at least one value")
        out["trim_k"] = k
        out["trimmed_mean"] = float(arr[k:n - k].mean())
        w = arr.copy()
        if k > 0:
            w[:k] = arr[k]
            w[n - k:] = arr[n - k - 1]
        out["winsorized_mean"] = float(w.mean())
    return out


def column_statistics(values, *, hypothetical=None, ci_level=0.95,
                      normality=None, zero_method: str = "wilcox",
                      ratio_t: bool = False, extras: bool = False,
                      percentile_method: str = "linear",
                      trim_k=None) -> dict:
    """Full Prism Column Statistics for one dataset column. Optional
    (default off, so the original output is unchanged): normality = list
    of normality tests (adds "kolmogorov_smirnov"), zero_method for the
    Wilcoxon signed rank test, ratio_t (one-sample ratio t test),
    extras (descriptive_extras), percentile_method for the quartiles."""
    out = {"descriptive": describe(values, ci_level,
                                   percentile_method=percentile_method),
           "normality": normality_tests(values, normality)}
    if hypothetical is not None and out["descriptive"].get("n", 0) >= 2:
        out["one_sample_t"] = one_sample_t(values, hypothetical, ci_level)
        try:
            out["wilcoxon"] = wilcoxon_signed_rank(
                values, hypothetical, zero_method=zero_method,
                ci_level=ci_level)
        except ValueError:
            out["wilcoxon"] = None
        if ratio_t:
            try:
                out["one_sample_ratio_t"] = one_sample_ratio_t(
                    values, hypothetical, ci_level)
            except ValueError as exc:
                out["one_sample_ratio_t"] = {"error": str(exc)}
    if extras:
        out["extras"] = descriptive_extras(
            values, ci_level,
            percentile_method=("prism" if percentile_method == "linear"
                               else percentile_method),
            trim_k=trim_k)
    return out
