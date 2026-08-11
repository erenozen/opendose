"""t tests and nonparametric two-group comparisons.

Prism statistics guide, "t tests (and nonparametric), one or two groups".
Reported quantities follow Prism's results sheets:

- Unpaired t: t, df, two-tailed P, difference between means (mean_a -
  mean_b) with SE and 95% CI, R squared (t²/(t²+df)), plus an F test to
  compare variances. Welch's correction option changes SE and df
  (Welch-Satterthwaite).
- Paired t: t, df, P, mean of differences with CI, R squared, and Pearson
  correlation of pairs ("How effective was the pairing?").
- Mann-Whitney: U, two-tailed P (exact when possible, else normal
  approximation, Prism's rule), medians, and the Hodges-Lehmann
  difference between medians.
- Wilcoxon matched pairs: W (sum of signed ranks), P, median of
  differences.
"""

from __future__ import annotations

import math
from itertools import product

import numpy as np
from scipy import stats


def _clean(values) -> np.ndarray:
    return np.array([float(v) for v in values if v is not None], dtype=float)


def _pair(values_a, values_b):
    pairs = [(a, b) for a, b in zip(values_a, values_b)
             if a is not None and b is not None]
    return (np.array([p[0] for p in pairs], dtype=float),
            np.array([p[1] for p in pairs], dtype=float))


def unpaired_t(values_a, values_b, *, welch: bool = False,
               ci_level: float = 0.95) -> dict:
    a, b = _clean(values_a), _clean(values_b)
    na, nb = a.size, b.size
    if na < 2 or nb < 2:
        raise ValueError("each group needs at least 2 values")
    mean_a, mean_b = float(a.mean()), float(b.mean())
    var_a, var_b = float(a.var(ddof=1)), float(b.var(ddof=1))
    diff = mean_a - mean_b

    if welch:
        se = math.sqrt(var_a / na + var_b / nb)
        df = (var_a / na + var_b / nb) ** 2 / (
            (var_a / na) ** 2 / (na - 1) + (var_b / nb) ** 2 / (nb - 1))
    else:
        sp2 = ((na - 1) * var_a + (nb - 1) * var_b) / (na + nb - 2)
        se = math.sqrt(sp2 * (1 / na + 1 / nb))
        df = na + nb - 2
    t_stat = diff / se
    p = 2 * float(stats.t.sf(abs(t_stat), df))
    tcrit = float(stats.t.ppf((1 + ci_level) / 2, df))

    # F test to compare variances (Prism includes it with unpaired t).
    f = max(var_a, var_b) / min(var_a, var_b)
    dfn, dfd = ((na - 1, nb - 1) if var_a >= var_b else (nb - 1, na - 1))
    p_f = 2 * float(stats.f.sf(f, dfn, dfd))

    return {
        "test": "welch_t" if welch else "unpaired_t",
        "mean_a": mean_a, "mean_b": mean_b,
        "sem_a": math.sqrt(var_a / na), "sem_b": math.sqrt(var_b / nb),
        "n_a": int(na), "n_b": int(nb),
        "difference": diff, "se_difference": se,
        "ci_difference": [diff - tcrit * se, diff + tcrit * se],
        "t": abs(t_stat), "df": float(df), "p_two_tailed": p,
        "r_squared": t_stat ** 2 / (t_stat ** 2 + df),
        "f_test_variances": {"F": f, "dfn": dfn, "dfd": dfd,
                             "p": min(p_f, 1.0)},
    }


def paired_t(values_a, values_b, *, ci_level: float = 0.95) -> dict:
    a, b = _pair(values_a, values_b)
    n = a.size
    if n < 2:
        raise ValueError("paired t test needs at least 2 complete pairs")
    d = a - b
    mean_d = float(d.mean())
    se = float(d.std(ddof=1)) / math.sqrt(n)
    t_stat = mean_d / se if se > 0 else math.inf
    df = n - 1
    p = 2 * float(stats.t.sf(abs(t_stat), df))
    tcrit = float(stats.t.ppf((1 + ci_level) / 2, df))
    r_pair, p_pair = (stats.pearsonr(a, b) if n >= 3 else (float("nan"), float("nan")))
    return {
        "test": "paired_t",
        "n_pairs": int(n),
        "mean_difference": mean_d, "se_difference": se,
        "ci_difference": [mean_d - tcrit * se, mean_d + tcrit * se],
        "t": abs(t_stat), "df": int(df), "p_two_tailed": p,
        "r_squared": t_stat ** 2 / (t_stat ** 2 + df) if math.isfinite(t_stat) else 1.0,
        "pairing_correlation": {"r": float(r_pair), "p": float(p_pair)},
    }


def _hodges_lehmann(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.median([x - y for x, y in product(a, b)]))


def mann_whitney(values_a, values_b) -> dict:
    a, b = _clean(values_a), _clean(values_b)
    if a.size < 1 or b.size < 1:
        raise ValueError("each group needs at least 1 value")
    # Prism computes exact P for small samples without ties, otherwise the
    # normal approximation; scipy's method="auto" applies the same rule.
    res = stats.mannwhitneyu(a, b, alternative="two-sided", method="auto")
    return {
        "test": "mann_whitney",
        "U": float(res.statistic),
        "p_two_tailed": float(res.pvalue),
        "median_a": float(np.median(a)), "median_b": float(np.median(b)),
        "hodges_lehmann_difference": _hodges_lehmann(a, b),
        "n_a": int(a.size), "n_b": int(b.size),
    }


def wilcoxon_matched_pairs(values_a, values_b) -> dict:
    a, b = _pair(values_a, values_b)
    d = a - b
    nonzero = d[d != 0]
    if nonzero.size < 1:
        raise ValueError("all paired differences are zero")
    res = stats.wilcoxon(a, b)
    signed_ranks = stats.rankdata(np.abs(nonzero)) * np.sign(nonzero)
    return {
        "test": "wilcoxon_matched_pairs",
        "n_pairs": int(a.size),
        "W": float(signed_ranks.sum()),
        "p_two_tailed": float(res.pvalue),
        "median_difference": float(np.median(d)),
    }
