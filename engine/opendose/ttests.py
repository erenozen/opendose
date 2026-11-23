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

One-tailed results (every test here; Prism's "Options tab: t tests" offers
one- or two-tailed P): "p_greater" is the one-tailed P for the
alternative that A is larger than B (the difference A - B, the mean of the
paired differences, or the ratio A/B above 1; Mann-Whitney: A tends to be
larger; Wilcoxon: the differences A - B tend to be positive), "p_less" for
the opposite; R's alternative = "greater" / "less". The t tests also give
one-sided confidence bounds ("..._greater" = [lower, null], "..._less" =
[null, upper]). Rank tests follow the same exact / approximate rule as their
two-tailed P (p_method). The two-tailed P is unchanged.

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

from . import effectsize, exactdist, orderstats

# Large-data threshold (number of pairwise differences / Walsh averages).
# Up to this many the set is built and sorted (the original method);
# above it the order statistics are selected without building it
# (opendose.orderstats: Johnson & Mizoguchi 1978; Monahan 1984), which
# returns the same values bit for bit in O(n log n) memory.
PAIRWISE_DIRECT_MAX = 250_000


def _clean(values) -> np.ndarray:
    return np.array([float(v) for v in values if v is not None], dtype=float)


#: an SD at or below this multiple of machine epsilon times |mean| is
#: rounding in the mean, not scatter (identical decimal values such as
#: 0.1, 0.1, 0.1 give a variance of about 1e-34, not 0)
_SCATTER_EPS = 64 * float(np.finfo(float).eps)


def no_scatter(var: float, mean: float) -> bool:
    """True when a group's variance is zero up to rounding in its mean."""
    return not var > (_SCATTER_EPS * abs(mean)) ** 2


NO_SCATTER_CHECK = ("Check that each replicate was entered as measured, "
                    "not copied down the column or rounded to one value.")


def _pair(values_a, values_b):
    pairs = [(a, b) for a, b in zip(values_a, values_b)
             if a is not None and b is not None]
    return (np.array([p[0] for p in pairs], dtype=float),
            np.array([p[1] for p in pairs], dtype=float))


def one_sided_t(est: float, se: float, df: float, ci_level: float = 0.95
                ) -> dict:
    """One-tailed P values of t = est / se with df degrees of freedom and
    the one-sided confidence bounds of est: {"p_greater", "p_less",
    "ci_greater": [lower, None], "ci_less": [None, upper]} (R's t.test with
    alternative = "greater" / "less"). se = 0: P 0 / 1 by the sign of est,
    None when est is 0 as well."""
    if se > 0:
        t_stat = est / se
        p_g, p_l = float(stats.t.sf(t_stat, df)), float(stats.t.cdf(t_stat, df))
    elif est != 0:
        p_g, p_l = (0.0, 1.0) if est > 0 else (1.0, 0.0)
    else:
        p_g = p_l = None
    q = float(stats.t.ppf(ci_level, df))
    return {"p_greater": p_g, "p_less": p_l,
            "ci_greater": [est - q * se, None], "ci_less": [None, est + q * se]}


#: log functions of the bases a log-scale or ratio test may use
_LOG = {"log10": math.log10, "ln": math.log, "log2": math.log2}
_EXP = {"log10": lambda v: 10.0 ** v, "ln": math.exp,
        "log2": lambda v: 2.0 ** v}

TOST_SOURCE = ("Schuirmann DJ (1987) J Pharmacokinet Biopharm 15:657; "
               "as statsmodels ttost_ind / ttost_paired")


def tost(estimate: float, se: float, df: float, lower=None, upper=None, *,
         alpha: float = 0.05, scale: str = "difference",
         log_base: str = "log10") -> dict:
    """Two one-sided tests (Schuirmann 1987) of an estimate with standard
    error se and df degrees of freedom against the equivalence margins
    (lower, upper). The lower test rejects H0: estimate <= lower (t =
    (estimate - lower) / se, P = P(T > t)), the upper test H0: estimate
    >= upper (P = P(T < t)), each one-sided at alpha. Equivalence is
    shown when both reject: P_TOST, the larger of the two P values, is
    below alpha, which happens exactly when the 1 - 2 alpha confidence
    interval lies inside (lower, upper). With only one margin the result
    is a non-inferiority test (the one test, at one-sided alpha; its
    decision is that of the same interval's limit on that side).

    scale "ratio": the estimate, se and the interval are on the log scale
    (log_base, as the analysis ran), the margins are ratios (> 0) and
    are logged here; the interval and the margins are also reported back
    as ratios ("ratio", "ci_ratio"). df may be math.inf (a z test)."""
    if lower is None and upper is None:
        raise ValueError("give an equivalence margin")
    if not 0 < alpha < 0.5:
        raise ValueError("alpha must be between 0 and 0.5")
    margins = [lower, upper]
    if scale == "ratio":
        if any(m is not None and not m > 0 for m in margins):
            raise ValueError("ratio margins must be positive")
        log = _LOG[log_base]
        margins = [None if m is None else log(m) for m in margins]
    elif scale != "difference":
        raise ValueError(f"unknown margin scale: {scale}")
    lo, hi = margins
    if lo is not None and hi is not None and not lo < hi:
        raise ValueError("the lower margin must be below the upper margin")
    tests = {}
    for side, m in (("lower", lo), ("upper", hi)):
        if m is None:
            tests[side] = None
            continue
        one = one_sided_t(estimate - m, se, df, 1 - alpha)
        t_stat = (estimate - m) / se if se > 0 else (
            math.copysign(math.inf, estimate - m) if estimate != m else 0.0)
        p = one["p_greater"] if side == "lower" else one["p_less"]
        if p is None:   # estimate on the margin with no spread
            p = 1.0
        tests[side] = {"margin": m, "t": t_stat, "p": p}
    q = float(stats.t.ppf(1 - alpha, df)) if math.isfinite(df) else \
        float(stats.norm.ppf(1 - alpha))
    ci = [estimate - q * se, estimate + q * se]
    p_tost = max(t["p"] for t in tests.values() if t is not None)
    out = {
        "kind": ("equivalence" if lo is not None and hi is not None
                 else "noninferiority"),
        "scale": scale, "alpha": alpha, "ci_level": 1 - 2 * alpha,
        "lower": lower, "upper": upper,
        "estimate": estimate, "se": se,
        "df": float(df) if math.isfinite(df) else None,
        "ci": ci,
        "test_lower": tests["lower"], "test_upper": tests["upper"],
        "p": p_tost, "shown": bool(p_tost < alpha),
        "source": TOST_SOURCE,
    }
    if scale == "ratio":
        exp = _EXP[log_base]
        out.update(log_base=log_base, ratio=exp(estimate),
                   ci_ratio=[exp(ci[0]), exp(ci[1])])
    return out


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
    flat_a, flat_b = no_scatter(var_a, mean_a), no_scatter(var_b, mean_b)
    if flat_a and flat_b:
        # t = difference / SE with SE = 0: undefined, not infinite
        raise ValueError(
            "The t test is undefined: the values within each group are all "
            "the same (SD 0), so there is no scatter to compare the "
            f"difference with. {NO_SCATTER_CHECK}")

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
    dfn, dfd = ((na - 1, nb - 1) if var_a >= var_b else (nb - 1, na - 1))
    if flat_a or flat_b:
        # one SD is 0: the variance ratio has no finite value
        f_test = {"F": None, "dfn": dfn, "dfd": dfd, "p": None,
                  "note": "undefined: one group has SD 0"}
    else:
        f = max(var_a, var_b) / min(var_a, var_b)
        p_f = 2 * float(stats.f.sf(f, dfn, dfd))
        f_test = {"F": f, "dfn": dfn, "dfd": dfd, "p": min(p_f, 1.0)}

    out = {
        "test": "welch_t" if welch else "unpaired_t",
        "mean_a": mean_a, "mean_b": mean_b,
        "sem_a": math.sqrt(var_a / na), "sem_b": math.sqrt(var_b / nb),
        "n_a": int(na), "n_b": int(nb),
        "difference": diff, "se_difference": se,
        "ci_difference": [diff - tcrit * se, diff + tcrit * se],
        "t": abs(t_stat), "df": float(df), "p_two_tailed": p,
        "r_squared": t_stat ** 2 / (t_stat ** 2 + df),
        "f_test_variances": f_test,
    }
    one = one_sided_t(diff, se, df, ci_level)
    out.update(p_greater=one["p_greater"], p_less=one["p_less"],
               ci_difference_greater=one["ci_greater"],
               ci_difference_less=one["ci_less"])
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
    one = one_sided_t(mean_d, se, df, ci_level)
    out.update(p_greater=one["p_greater"], p_less=one["p_less"],
               ci_difference_greater=one["ci_greater"],
               ci_difference_less=one["ci_less"])
    if effect_size:
        out["effect_size"] = effectsize.safe(effectsize.paired_d, a, b,
                                             ci_level=ci_level)
    return out


def _hodges_lehmann(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.median([x - y for x, y in product(a, b)]))


def ratio_to_control(values_control, values_treated, *,
                     ci_level: float = 0.95) -> dict:
    """Treated mean / control mean with Fieller's (1954) confidence
    interval, for the unpaired t test with a pooled SD: the means are
    independent with SEs s_p sqrt(1/n), df = n_c + n_t - 2, so this is
    R's mratios::ttestratio(var.equal = TRUE). When the control mean is
    not clearly different from zero (g = t^2 SE_c^2 / mean_c^2 >= 1) the
    interval is unbounded: "unbounded" is true and "ci" null. The
    percentage of control is 100 x the ratio and its CI."""
    from .compare_params import fieller_ratio
    c, t = _clean(values_control), _clean(values_treated)
    nc, nt = c.size, t.size
    if nc < 2 or nt < 2:
        raise ValueError("each group needs at least 2 values")
    df = nc + nt - 2
    sp = math.sqrt(((nc - 1) * c.var(ddof=1) + (nt - 1) * t.var(ddof=1)) / df)
    r = fieller_ratio(float(c.mean()), sp / math.sqrt(nc),
                      float(t.mean()), sp / math.sqrt(nt), df, ci_level)
    return {"value": r["value"], "ci": r["ci"], "g": r.get("g"),
            "unbounded": r["value"] is not None and r["ci"] is None,
            "ci_level": ci_level, "df": df, "method": "fieller",
            "source": "Fieller EC (1954) J R Stat Soc B 16:175; as R "
                      "mratios::ttestratio(var.equal = TRUE)"}


def _mann_whitney_p(a, b):
    """(statistic U1, two-sided P, P greater, P less, p_method).
    Guide rule: exact P (even with ties) when the smaller group has
    <= 100 values, else the normal approximation. Without ties scipy's
    exact distribution is used (identical to the shuffle distribution)."""
    n_small, n_large = min(a.size, b.size), max(a.size, b.size)
    ties = exactdist.has_ties(np.concatenate([a, b]))
    p_method = "exact"
    if n_small <= 100 and not ties:
        res = stats.mannwhitneyu(a, b, alternative="two-sided",
                                 method="exact")
        p = float(res.pvalue)
        p_g, p_l = (float(stats.mannwhitneyu(a, b, alternative=alt,
                                             method="exact").pvalue)
                    for alt in ("greater", "less"))
    elif n_small <= 100 and exactdist.rank_sum_exact_feasible(n_small,
                                                              n_large):
        res = stats.mannwhitneyu(a, b, alternative="two-sided",
                                 method="asymptotic")
        p = exactdist.rank_sum_two_sided_p(a, b)
        p_g, p_l = exactdist.rank_sum_one_sided_p(a, b)
    else:
        res = stats.mannwhitneyu(a, b, alternative="two-sided",
                                 method="asymptotic")
        p = float(res.pvalue)
        p_g, p_l = (float(stats.mannwhitneyu(a, b, alternative=alt,
                                             method="asymptotic").pvalue)
                    for alt in ("greater", "less"))
        p_method = "approximate"
    return float(res.statistic), p, p_g, p_l, p_method


def _rank_test_floor(p_min, p_method, ns, one_sided=None):
    """exactdist.min_p_block, naming the method the test used."""
    method = "exact" if p_method == "exact" else "normal approximation"
    return exactdist.min_p_block(p_min, method, ns, one_sided=one_sided)


def mann_whitney(values_a, values_b, *, ci_level: float = 0.95) -> dict:
    a, b = _clean(values_a), _clean(values_b)
    if a.size < 1 or b.size < 1:
        raise ValueError("each group needs at least 1 value")
    pooled = np.concatenate([a, b])
    u1, p, p_g, p_l, p_method = _mann_whitney_p(a, b)
    # the smallest P this design can give, by the same method
    # (exactdist.min_p_rank_sum)
    if p_method != "exact":   # the approximation at the extreme data
        def p_two_one(x, y):
            r = _mann_whitney_p(x, y)
            return r[1], min(r[2], r[3])
        two, one = exactdist.min_p_rank_sum(a, b, p_two_one)
    elif exactdist.has_ties(pooled):
        two, one = exactdist.rank_sum_min_p_exact(a, b)
    else:
        two = exactdist.untied_min_p_rank_sum(int(a.size), int(b.size))
        one = min(1.0, two / 2)
    floor = _rank_test_floor(two, p_method, [a.size, b.size], one_sided=one)
    ranks = stats.rankdata(pooled)
    k, level = exactdist.rank_sum_ci_index(int(a.size), int(b.size),
                                           ci_level)
    n_pairs = int(a.size) * int(b.size)
    if n_pairs <= PAIRWISE_DIRECT_MAX:
        diffs = np.sort(np.subtract.outer(a, b).ravel())
        ci = ([float(diffs[k - 1]), float(diffs[diffs.size - k])]
              if k is not None else None)
        hl = _hodges_lehmann(a, b)
    else:
        ci = ([orderstats.kth_pairwise_difference(a, b, k),
               orderstats.kth_pairwise_difference(a, b, n_pairs - k + 1)]
              if k is not None else None)
        hl = orderstats.hodges_lehmann_shift(a, b)
    return {
        "test": "mann_whitney",
        "U": u1,
        "p_two_tailed": p,
        "p_greater": p_g, "p_less": p_l,
        "median_a": float(np.median(a)), "median_b": float(np.median(b)),
        "hodges_lehmann_difference": hl,
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
        "min_attainable_p": floor,
    }


def wilcoxon_matched_pairs(values_a, values_b, *,
                           zero_method: str = "wilcox",
                           ci_level: float = 0.95) -> dict:
    a, b = _pair(values_a, values_b)
    # without floating-point noise, so tied and zero differences are
    # recognised (exactdist.snap_differences)
    d = exactdist.snap_differences(a - b, a, b)
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
        "sum_negative_ranks", "n_zero_differences", "p_greater", "p_less")})
    out.update(walsh_ci(d, ci_level))
    out["effect_size"] = effectsize.safe(
        effectsize.rank_biserial_paired, d, zero_method=zero_method,
        ci_level=ci_level)

    # the smallest P this design can give: every nonzero difference of
    # the same sign (exactdist.min_p_signed_rank), by the same method
    def p_two_one(dd):
        r = signed_rank_test(dd, zero_method=zero_method)
        return r["p"], min(r["p_greater"], r["p_less"])
    two, one = exactdist.min_p_signed_rank(d, p_two_one)
    out["min_attainable_p"] = _rank_test_floor(
        two, res["p_method"], [int(a.size)], one_sided=one)
    return out


def signed_rank_test(diffs, *, zero_method: str = "wilcox") -> dict:
    """Wilcoxon signed-rank test of differences against zero.

    zero_method: "wilcox" drops zero differences before ranking
    (Wilcoxon's original method, Prism up to version 5 and InStat);
    "pratt" ranks |d| including the zeros and then ignores the zeros'
    ranks (Pratt 1959). Exact P with fewer than 200 ranked values (ties
    included), else the normal approximation with the tie-corrected
    variance sum(r^2)/4 (no continuity correction)."""
    d = exactdist.snap_differences(diffs)
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
        p_g, p_l = (float(stats.wilcoxon(d, alternative=alt,
                                         method="exact").pvalue)
                    for alt in ("greater", "less"))
        p_method = "exact"
    elif n_used < 200:
        r2 = np.rint(2 * ranks).astype(np.int64)
        p = exactdist.signed_rank_two_sided_p(r2, pos)
        p_g, p_l = exactdist.signed_rank_one_sided_p(r2, pos)
        p_method = "exact"
    else:
        mean = ranks.sum() / 2.0
        sd = math.sqrt(float((ranks ** 2).sum()) / 4.0)
        p = (float(2 * stats.norm.sf(abs(r_plus - mean) / sd))
             if sd > 0 else 1.0)
        z = (r_plus - mean) / sd if sd > 0 else 0.0
        p_g, p_l = ((float(stats.norm.sf(z)), float(stats.norm.cdf(z)))
                    if sd > 0 else (1.0, 1.0))
        p_method = "approximate"
    return {"p": min(p, 1.0), "p_method": p_method,
            "p_greater": min(p_g, 1.0), "p_less": min(p_l, 1.0),
            "zero_method": zero_method,
            "sum_positive_ranks": r_plus, "sum_negative_ranks": -r_minus,
            "sum_signed_ranks": r_plus - r_minus,
            "statistic_min": min(r_plus, r_minus),
            "n_zero_differences": n_zero, "n_ranked": int(d.size)}


def walsh_ci(values, ci_level: float = 0.95) -> dict:
    """CI of the median from the Walsh averages (x_i + x_j)/2, i <= j:
    the k-th smallest to the k-th largest, k from the exact signed-rank
    distribution (normal approximation for n >= 200). Above
    PAIRWISE_DIRECT_MAX averages they are selected, not built
    (opendose.orderstats; identical values)."""
    x = np.asarray(values, dtype=float)
    n = x.size
    k, level = exactdist.signed_rank_ci_index(n, ci_level)
    n_walsh = n * (n + 1) // 2
    if n_walsh > PAIRWISE_DIRECT_MAX:
        # same values, selected without building the n(n+1)/2 averages
        return {"hodges_lehmann": orderstats.hodges_lehmann_walsh(x),
                "ci_median": ([orderstats.kth_walsh_average(x, k),
                               orderstats.kth_walsh_average(
                                   x, n_walsh - k + 1)]
                              if k is not None else None),
                "ci_actual_level": level}
    iu = np.triu_indices(n)
    walsh = np.sort(((x[:, None] + x[None, :]) / 2.0)[iu])
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
        # one-tailed: the ratio A/B above 1 ("greater") or below it
        "p_greater": res["p_greater"], "p_less": res["p_less"],
        "ci_ratio_greater": [10.0 ** res["ci_difference_greater"][0], None],
        "ci_ratio_less": [None, 10.0 ** res["ci_difference_less"][1]],
        "r_squared": res["r_squared"],
        "geometric_mean_a": float(10.0 ** np.log10(a).mean()),
        "geometric_mean_b": float(10.0 ** np.log10(b).mean()),
        "effect_size": (dict(res["effect_size"], scale="log10")
                        if res.get("effect_size") else None),
    }
