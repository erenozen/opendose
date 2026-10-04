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
- Ratio paired t ("Paired or ratio t test?", "Interpreting results:
  Ratio t test"): a paired t test on log10 values; the antilog of the
  mean log ratio is the geometric mean of the ratios A/B, and the
  antilogs of its confidence limits are the CI of that ratio.

Exact P values follow the rules the guide documents (opendose.exactdist):
Mann-Whitney is exact, ties included, when the smaller group has 100 or
fewer values ("Interpreting results: Mann-Whitney test"); the Wilcoxon
matched-pairs test is exact, ties included, with fewer than 200 pairs,
and rows with identical values are dropped (Wilcoxon's method, the
default) or ranked but left unsigned (Pratt's method) ("Results:
Wilcoxon matched pairs test"). Every result reports p_method ("exact" or
"approximate"). Without ties, the exact P comes from scipy's exact null
distribution, which is the same permutation distribution. The CIs of the
Hodges-Lehmann difference (Mann-Whitney) and of the median difference
(Wilcoxon) use the order statistics of the pairwise differences / Walsh
averages (Sheskin; Klotz), at the closest confidence level not below the
one requested, which is reported as ci_actual_level.

Every result also carries "effect_size" (opendose.effectsize): Cohen's d
and Hedges' g with noncentral-t CIs (pooled SD; Welch: the average-
variance standardizer), d_z and d_av for paired data, Cliff's delta /
rank-biserial r with the probability of superiority for Mann-Whitney,
and the matched-pairs rank-biserial r for Wilcoxon. None when degenerate.
"""

from __future__ import annotations

import math
from itertools import product

import numpy as np
from scipy import stats

from . import effectsize, exactdist


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
    return _unpaired_from_stats(mean_a, var_a, na, mean_b, var_b, nb,
                                welch=welch, ci_level=ci_level)


def _unpaired_from_stats(mean_a, var_a, na, mean_b, var_b, nb, *,
                         welch: bool = False, ci_level: float = 0.95) -> dict:
    """Unpaired / Welch t test from each group's mean, variance and n.

    These are sufficient statistics for the test, which is why the
    statistics guide ("Entering data for a t test") lets an unpaired t
    test run from data entered as mean, SD (or SEM) and n. Shared by
    unpaired_t (raw values) and opendose.summary (entered summaries).
    """
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

    out = {
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
    es = effectsize.safe(effectsize.d_from_stats, mean_a, var_a, na, mean_b,
                         var_b, nb, standardizer="average" if welch
                         else "pooled", ci_level=ci_level)
    if es is not None:
        es["cles_parametric"] = effectsize.cles_parametric(es["d"])
    out["effect_size"] = es
    return out


def paired_t(values_a, values_b, *, ci_level: float = 0.95,
             effect_size: bool = True) -> dict:
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
    out = {
        "test": "paired_t",
        "n_pairs": int(n),
        "mean_difference": mean_d, "se_difference": se,
        "ci_difference": [mean_d - tcrit * se, mean_d + tcrit * se],
        "t": abs(t_stat), "df": int(df), "p_two_tailed": p,
        "r_squared": t_stat ** 2 / (t_stat ** 2 + df) if math.isfinite(t_stat) else 1.0,
        "pairing_correlation": {"r": float(r_pair), "p": float(p_pair)},
    }
    if effect_size:
        out["effect_size"] = effectsize.safe(effectsize.paired_d, a, b,
                                             ci_level=ci_level)
    return out


def _hodges_lehmann(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.median([x - y for x, y in product(a, b)]))


def mann_whitney(values_a, values_b, *, ci_level: float = 0.95) -> dict:
    a, b = _clean(values_a), _clean(values_b)
    if a.size < 1 or b.size < 1:
        raise ValueError("each group needs at least 1 value")
    # Guide rule: exact P (even with ties) when the smaller group has
    # <= 100 values, else the normal approximation. Without ties scipy's
    # exact distribution is used (identical to the shuffle distribution).
    n_small, n_large = min(a.size, b.size), max(a.size, b.size)
    pooled = np.concatenate([a, b])
    ties = exactdist.has_ties(pooled)
    p_method = "exact"
    if n_small <= 100 and not ties:
        res = stats.mannwhitneyu(a, b, alternative="two-sided",
                                 method="exact")
        p = float(res.pvalue)
    elif n_small <= 100 and exactdist.rank_sum_exact_feasible(n_small,
                                                              n_large):
        res = stats.mannwhitneyu(a, b, alternative="two-sided",
                                 method="asymptotic")
        p = exactdist.rank_sum_two_sided_p(a, b)
    else:
        res = stats.mannwhitneyu(a, b, alternative="two-sided",
                                 method="asymptotic")
        p = float(res.pvalue)
        p_method = "approximate"
    u1 = float(res.statistic)
    ranks = stats.rankdata(pooled)
    diffs = np.sort(np.subtract.outer(a, b).ravel())
    k, level = exactdist.rank_sum_ci_index(int(a.size), int(b.size),
                                           ci_level)
    ci = ([float(diffs[k - 1]), float(diffs[diffs.size - k])]
          if k is not None else None)
    return {
        "test": "mann_whitney",
        "U": u1,
        "p_two_tailed": p,
        "median_a": float(np.median(a)), "median_b": float(np.median(b)),
        "hodges_lehmann_difference": _hodges_lehmann(a, b),
        "n_a": int(a.size), "n_b": int(b.size),
        "p_method": p_method,
        "U_smaller": min(u1, a.size * b.size - u1),
        "sum_ranks_a": float(ranks[:a.size].sum()),
        "sum_ranks_b": float(ranks[a.size:].sum()),
        "mean_rank_a": float(ranks[:a.size].mean()),
        "mean_rank_b": float(ranks[a.size:].mean()),
        "ci_hodges_lehmann": ci,
        "ci_actual_level": level,
        "effect_size": effectsize.safe(effectsize.cliffs_delta, a, b,
                                       ci_level=ci_level),
    }


def wilcoxon_matched_pairs(values_a, values_b, *,
                           zero_method: str = "wilcox",
                           ci_level: float = 0.95) -> dict:
    a, b = _pair(values_a, values_b)
    d = a - b
    nonzero = d[d != 0]
    if nonzero.size < 1:
        raise ValueError("all paired differences are zero")
    res = signed_rank_test(d, zero_method=zero_method)
    signed_ranks = stats.rankdata(np.abs(nonzero)) * np.sign(nonzero)
    out = {
        "test": "wilcoxon_matched_pairs",
        "n_pairs": int(a.size),
        "W": (float(signed_ranks.sum()) if zero_method == "wilcox"
              else res["sum_signed_ranks"]),
        "p_two_tailed": res["p"],
        "median_difference": float(np.median(d)),
    }
    out.update({key: res[key] for key in (
        "p_method", "zero_method", "sum_positive_ranks",
        "sum_negative_ranks", "n_zero_differences")})
    out.update(walsh_ci(d, ci_level))
    out["effect_size"] = effectsize.safe(
        effectsize.rank_biserial_paired, d, zero_method=zero_method,
        ci_level=ci_level)
    return out


def signed_rank_test(diffs, *, zero_method: str = "wilcox") -> dict:
    """Wilcoxon signed-rank test of differences against zero.

    zero_method: "wilcox" drops zero differences before ranking
    (Wilcoxon's original method, Prism up to version 5 and InStat);
    "pratt" ranks |d| including the zeros and then ignores the zeros'
    ranks (Pratt 1959). Exact P with fewer than 200 ranked values (ties
    included), else the normal approximation with the tie-corrected
    variance sum(r^2)/4 (no continuity correction)."""
    d = np.asarray(diffs, dtype=float)
    if zero_method not in ("wilcox", "pratt"):
        raise ValueError(f"unknown zero_method: {zero_method}")
    n_zero = int(np.sum(d == 0))
    if zero_method == "wilcox":
        d = d[d != 0]
        ranks = stats.rankdata(np.abs(d))
    else:
        ranks = stats.rankdata(np.abs(d))
        ranks, d = ranks[d != 0], d[d != 0]
    if d.size < 1:
        raise ValueError("all differences are zero")
    pos = d > 0
    r_plus = float(ranks[pos].sum())
    r_minus = float(ranks[~pos].sum())
    n_used = d.size + (n_zero if zero_method == "pratt" else 0)
    tied = exactdist.has_ties(np.abs(d)) or (zero_method == "pratt"
                                            and n_zero > 0)
    if n_used < 200 and not tied and n_zero == 0:
        p = float(stats.wilcoxon(d, method="exact").pvalue)
        p_method = "exact"
    elif n_used < 200:
        r2 = np.rint(2 * ranks).astype(np.int64)
        p = exactdist.signed_rank_two_sided_p(r2, pos)
        p_method = "exact"
    else:
        mean = ranks.sum() / 2.0
        sd = math.sqrt(float((ranks ** 2).sum()) / 4.0)
        p = (float(2 * stats.norm.sf(abs(r_plus - mean) / sd))
             if sd > 0 else 1.0)
        p_method = "approximate"
    return {"p": min(p, 1.0), "p_method": p_method,
            "zero_method": zero_method,
            "sum_positive_ranks": r_plus, "sum_negative_ranks": -r_minus,
            "sum_signed_ranks": r_plus - r_minus,
            "statistic_min": min(r_plus, r_minus),
            "n_zero_differences": n_zero, "n_ranked": int(d.size)}


def walsh_ci(values, ci_level: float = 0.95) -> dict:
    """CI of the median from the Walsh averages (x_i + x_j)/2, i <= j:
    the k-th smallest to the k-th largest, k from the exact signed-rank
    distribution (normal approximation for n >= 200)."""
    x = np.asarray(values, dtype=float)
    n = x.size
    iu = np.triu_indices(n)
    walsh = np.sort(((x[:, None] + x[None, :]) / 2.0)[iu])
    k, level = exactdist.signed_rank_ci_index(n, ci_level)
    return {"hodges_lehmann": float(np.median(walsh)),
            "ci_median": ([float(walsh[k - 1]), float(walsh[walsh.size - k])]
                          if k is not None else None),
            "ci_actual_level": level}


def ratio_paired_t(values_a, values_b, *, ci_level: float = 0.95) -> dict:
    """Ratio paired t test: paired t on log10(A) and log10(B). Reports the
    geometric mean of the ratios A/B with its CI (guide example: Treated
    / Control Km values 8.7/4.2, 4.9/2.5, 13.1/6.5 give 2.02, 95% CI
    1.88 to 2.16, P = 0.0005)."""
    a, b = _pair(values_a, values_b)
    if a.size < 2:
        raise ValueError("ratio t test needs at least 2 complete pairs")
    if np.any(a <= 0) or np.any(b <= 0):
        raise ValueError("the ratio t test needs positive values "
                         "(logarithms of zero or negative values are "
                         "undefined)")
    res = paired_t(np.log10(a), np.log10(b), ci_level=ci_level)
    mean_log = res["mean_difference"]
    lo, hi = res["ci_difference"]
    return {
        "test": "ratio_paired_t",
        "n_pairs": res["n_pairs"],
        "geometric_mean_ratio": 10.0 ** mean_log,
        "ci_ratio": [10.0 ** lo, 10.0 ** hi],
        "mean_log10_ratio": mean_log,
        "se_log10_ratio": res["se_difference"],
        "ci_log10_ratio": [lo, hi],
        "t": res["t"], "df": res["df"], "p_two_tailed": res["p_two_tailed"],
        "r_squared": res["r_squared"],
        "geometric_mean_a": float(10.0 ** np.log10(a).mean()),
        "geometric_mean_b": float(10.0 ** np.log10(b).mean()),
        "effect_size": (dict(res["effect_size"], scale="log10")
                        if res.get("effect_size") else None),
    }
