"""Effect sizes with confidence intervals.

Every comparison in OpenDose can report how large an effect is, not only
whether it is statistically significant. The GraphPad statistics guide
page "Understanding ANOVA Effect Sizes" defines eta^2 = SS_effect /
SS_total, partial eta^2 = SS_effect / (SS_effect + SS_error) and Cohen's
f = sqrt(eta_p^2 / (1 - eta_p^2)) with the benchmarks f = 0.10, 0.25,
0.40; those definitions are used here unchanged. Methods implemented:

Standardized mean differences
- Cohen's d with the pooled SD (two independent groups; Cohen 1988,
  eq. 2.2.1), with the average-variance standardizer sqrt((s1^2+s2^2)/2)
  for unequal SDs (Cohen 1988 sec. 2.3; "d_av" in Cumming 2012), Glass's
  delta (control-group SD; Glass, McGaw & Smith 1981), the one-sample d,
  and the paired d_z (mean / SD of the differences) and d_av (mean
  difference / sqrt((s1^2+s2^2)/2)) of Lakens (2013, Front Psychol
  4:863).
- Hedges' g = J(df) d with the exact small-sample correction
  J(df) = Gamma(df/2) / (sqrt(df/2) Gamma((df-1)/2)) (Hedges 1981,
  J Educ Stat 6:107; Hedges & Olkin 1985 eq. 5.3.4). For d_av of paired
  data df = 2(n-1), as in Lakens (2013) and DABEST; for d_z df = n-1.
- Confidence intervals by inverting the noncentral t distribution
  (Steiger & Fouladi 1997; Cumming & Finch 2001; Smithson 2003): the
  limits of the noncentrality parameter are the roots in ncp of
  nct.cdf(t_obs; df, ncp) = 1 - alpha/2 and alpha/2, found by bracketing
  and Brent's method on scipy's noncentral t CDF, then rescaled to d.
  These are exact for the pooled two-group d, the one-sample d and d_z.
  For d_av (Welch, paired) the same inversion is applied with the
  standardizer treated as fixed (approximate; Algina & Keselman 2003,
  Educ Psychol Meas 63:537). For Glass's delta the large-sample normal
  interval with the Hedges-Olkin SE is used (Algina, Keselman & Penfield
  2006). ci_method="normal" gives the Hedges-Olkin SE with a t critical
  value, as R effsize::cohen.d(noncentral=FALSE) and pingouin.compute_esci
  do; ci_method="bootstrap" gives a BCa bootstrap interval (Efron 1987;
  opendose.estimation).

Variance explained (ANOVA)
- eta^2 = SS_effect / SS_total, partial eta^2 = SS_effect / (SS_effect +
  SS_error) (Cohen 1973; Richardson 2011), omega^2 = (SS_effect -
  df_effect MS_error) / (SS_total + MS_error) (Hays 1963), partial
  omega^2 = df_effect (MS_effect - MS_error) / (df_effect MS_effect +
  (N - df_effect) MS_error) (Keppel 1991; Olejnik & Algina 2003),
  epsilon^2 = (SS_effect - df_effect MS_error) / SS_total (Kelley 1935)
  and its partial form, Cohen's f = sqrt(eta_p^2 / (1 - eta_p^2)).
  Generalized eta^2 for repeated-measures and mixed designs (Olejnik &
  Algina 2003, Psychol Methods 8:434; Bakeman 2005): SS_effect over
  SS_effect plus every SS that involves subjects.
- CI of the population partial eta^2 by inverting the noncentral F
  distribution in its noncentrality lambda (Steiger 2004, Psychol Methods
  9:164; Smithson 2003): eta_p^2 = lambda / (lambda + df1 + df2 + 1),
  limits truncated at zero. The same interval covers the population
  quantity that omega^2 and epsilon^2 estimate (all three estimate
  sigma^2_effect / (sigma^2_effect + sigma^2_error); they differ in bias
  only), so it is reported once per term.

Association
- phi (signed for 2 x 2: (ad - bc) / sqrt of the margins product) and
  Cramer's V = sqrt(chi^2 / (N (min(r, c) - 1))) (Cramer 1946), with the
  bias-corrected V of Bergsma (2013, J Korean Stat Soc 42:323). CI by
  inverting the noncentral chi-square distribution in lambda and mapping
  the limits with sqrt(lambda / (N q)) (Smithson 2003; the method of the
  R package effectsize), or a multinomial bootstrap. Cohen's w for
  goodness of fit.
- Point-biserial r and Pearson r with the Fisher z interval (Fisher
  1921); r^2 interval by squaring the r limits (zero when the r interval
  spans zero).

Nonparametric
- Cliff's delta = P(X > Y) - P(X < Y) (Cliff 1993, Psychol Bull 114:494)
  with the unbiased variance estimate of Cliff (1993) floored at
  (1 - delta^2) / (n1 n2 - 1), and the asymmetric interval of Cliff (1996,
  Ordinal Methods for Behavioral Data Analysis, ch. 3; Feng & Cliff
  2004); at complete separation (delta = +-1, zero variance) the open
  limit is computed at delta' = +-(1 - 1/(n1 n2)), an ad hoc continuity
  adjustment. For Mann-Whitney delta equals the rank-biserial correlation
  1 - 2U / (n1 n2) (Glass 1965; Kerby 2014, Compr Psychol 3:11).
- Common-language effect size / probability of superiority
  A = P(X > Y) + P(X = Y)/2 = U / (n1 n2) (McGraw & Wong 1992; Vargha &
  Delaney 2000, J Educ Behav Stat 25:101), CI as (1 + delta CI) / 2; and
  the parametric Phi(d / sqrt 2) (paired: Phi(d_z)) of McGraw & Wong.
- Matched-pairs rank-biserial r = (R+ - R-) / (R+ + R-) (Kerby 2014),
  CI by Fisher z with the null SE of the signed-rank statistic (as in the
  R package effectsize; King, Rosopa & Minium 2011).
- Kendall's W = chi^2_Friedman / (n (k - 1)) (Kendall & Babington Smith
  1939), epsilon^2_R = H (n + 1) / (n^2 - 1) and eta^2_H = (H - k + 1) /
  (n - k) for Kruskal-Wallis (Tomczak & Tomczak 2014, Trends Sport Sci
  21:19).
- Cohen's h = 2 asin sqrt(p1) - 2 asin sqrt(p2) (Cohen 1988 ch. 6), CI on
  the arcsine scale with SE sqrt(1/n1 + 1/n2).

Interpretation labels ("negligible", "small", "medium", "large") come with
the thresholds and their published source: Cohen (1988) for d, g, h, r,
eta^2 (0.01/0.06/0.14), f and w (Cramer's V via w = V sqrt(min(r,c)-1),
Cohen 1988 sec. 7.2), Romano et al. (2006) for Cliff's delta, Vargha &
Delaney (2000) for A, Chen, Cohen & Chen (2010) for odds ratios. They
are conventions, not judgements of practical importance (Cohen 1988
p. 25; Lakens 2013).
"""

from __future__ import annotations

import math

import numpy as np
from scipy import optimize, special, stats

# ------------------------------------------------------------ interpretation

SCALES = {
    "d": ((0.2, 0.5, 0.8),
          "Cohen (1988) sec. 2.2.3: d = 0.2 small, 0.5 medium, 0.8 large"),
    "h": ((0.2, 0.5, 0.8),
          "Cohen (1988) sec. 6.2.1: h = 0.2 small, 0.5 medium, 0.8 large"),
    "r": ((0.1, 0.3, 0.5),
          "Cohen (1988) sec. 3.2.1: r = 0.1 small, 0.3 medium, 0.5 large"),
    "eta2": ((0.01, 0.06, 0.14),
             "Cohen (1988) sec. 8.2.3 (eta^2 from f = 0.10, 0.25, 0.40): "
             "0.01 small, 0.06 medium, 0.14 large"),
    "f": ((0.10, 0.25, 0.40),
          "Cohen (1988) sec. 8.2.3: f = 0.10 small, 0.25 medium, "
          "0.40 large"),
    "w": ((0.1, 0.3, 0.5),
          "Cohen (1988) sec. 7.2.3: w = 0.1 small, 0.3 medium, 0.5 large "
          "(Cramer's V compared as w = V sqrt(min(r, c) - 1))"),
    "cliffs_delta": ((0.147, 0.33, 0.474),
                     "Romano, Kromrey, Coraggio & Skowronek (2006): "
                     "|delta| = 0.147 small, 0.33 medium, 0.474 large"),
    "cles": ((0.06, 0.14, 0.21),
             "Vargha & Delaney (2000): A = 0.56 small, 0.64 medium, "
             "0.71 large (|A - 0.5| = 0.06, 0.14, 0.21)"),
    "odds_ratio": ((1.68, 3.47, 6.71),
                   "Chen, Cohen & Chen (2010): OR = 1.68 small, 3.47 "
                   "medium, 6.71 large (or their reciprocals)"),
    "kendalls_w": ((0.1, 0.3, 0.5),
                   "Cohen's (1988) r benchmarks as applied to Kendall's W "
                   "(Tomczak & Tomczak 2014): 0.1 small, 0.3 medium, "
                   "0.5 large"),
}


def interpret(value, scale: str) -> dict | None:
    """Conventional label for an effect size on a named scale. The
    magnitude is |value| (for "cles", |A - 0.5|; for "odds_ratio",
    max(OR, 1/OR))."""
    if value is None or not np.isfinite(value):
        return None
    thresholds, source = SCALES[scale]
    if scale == "cles":
        mag = abs(value - 0.5)
    elif scale == "odds_ratio":
        if value <= 0:
            return None
        mag = max(value, 1.0 / value)
    else:
        mag = abs(value)
    label = "negligible"
    for name, cut in zip(("small", "medium", "large"), thresholds):
        if mag >= cut:
            label = name
    return {"label": label, "scale": scale, "thresholds": list(thresholds),
            "source": source}


# ------------------------------------------------- noncentral inversions

def _invert_decreasing(fn, target, start, lower_bound=None):
    """Root in x of fn(x) = target where fn decreases in x, bracketing
    outward from start."""
    step = max(1.0, abs(start) * 0.5)
    lo = hi = start
    if fn(start) < target:          # root lies below start
        lo = start - step
        while fn(lo) < target:
            step *= 2.0
            lo = start - step
            if lower_bound is not None and lo <= lower_bound:
                lo = lower_bound
                break
            if step > 1e7:
                return None
    else:
        hi = start + step
        while fn(hi) > target:
            step *= 2.0
            hi = start + step
            if step > 1e7:
                return None
    return float(optimize.brentq(lambda x: fn(x) - target, lo, hi,
                                 xtol=1e-12, rtol=1e-12, maxiter=500))


def ncp_t_interval(t, df, ci_level: float = 0.95):
    """Limits of the noncentrality parameter of a noncentral t given an
    observed t on df degrees of freedom (Steiger & Fouladi 1997)."""
    if t is None or not np.isfinite(t) or not df > 0:
        return None
    alpha = 1.0 - ci_level

    def cdf(ncp):
        return float(stats.nct.cdf(t, df, ncp))

    lo = _invert_decreasing(cdf, 1.0 - alpha / 2.0, t)
    hi = _invert_decreasing(cdf, alpha / 2.0, t)
    if lo is None or hi is None:
        return None
    return [lo, hi]


def ncp_f_interval(f, df1, df2, ci_level: float = 0.95):
    """Limits of the noncentrality lambda of a noncentral F given an
    observed F (Steiger 2004); each limit is 0 when even lambda = 0 puts
    the observed F beyond it."""
    if f is None or not np.isfinite(f) or not (df1 > 0 and df2 > 0):
        return None
    alpha = 1.0 - ci_level

    def cdf(lam):
        if lam <= 0:
            return float(stats.f.cdf(f, df1, df2))
        return float(stats.ncf.cdf(f, df1, df2, lam))

    def bound(target):
        if cdf(0.0) <= target:
            return 0.0
        start = max(f * df1 - df1, 1.0)
        return _invert_decreasing(cdf, target, start, lower_bound=0.0)

    lo, hi = bound(1.0 - alpha / 2.0), bound(alpha / 2.0)
    if lo is None or hi is None:
        return None
    return [lo, hi]


def ncp_chi2_interval(chi2, df, ci_level: float = 0.95):
    """Limits of the noncentrality lambda of a noncentral chi-square
    given an observed statistic (Smithson 2003)."""
    if chi2 is None or not np.isfinite(chi2) or not df > 0:
        return None
    alpha = 1.0 - ci_level

    def cdf(lam):
        if lam <= 0:
            return float(stats.chi2.cdf(chi2, df))
        return float(stats.ncx2.cdf(chi2, df, lam))

    def bound(target):
        if cdf(0.0) <= target:
            return 0.0
        return _invert_decreasing(cdf, target, max(chi2 - df, 1.0),
                                  lower_bound=0.0)

    lo, hi = bound(1.0 - alpha / 2.0), bound(alpha / 2.0)
    if lo is None or hi is None:
        return None
    return [lo, hi]


def hedges_j(df) -> float:
    """Exact small-sample correction J(df) = Gamma(df/2) / (sqrt(df/2)
    Gamma((df-1)/2)) (Hedges 1981), via log-gamma (no overflow)."""
    if not df > 1:
        return float("nan")
    return float(math.exp(special.gammaln(df / 2.0)
                          - special.gammaln((df - 1.0) / 2.0))
                 / math.sqrt(df / 2.0))


# ------------------------------------------------------------- helpers

def _clean(values) -> np.ndarray:
    return np.array([float(v) for v in values
                     if v is not None and not (isinstance(v, float)
                                               and math.isnan(v))],
                    dtype=float)


def _pair(values_a, values_b):
    pairs = [(float(a), float(b)) for a, b in zip(values_a, values_b)
             if a is not None and b is not None
             and not (isinstance(a, float) and math.isnan(a))
             and not (isinstance(b, float) and math.isnan(b))]
    return (np.array([p[0] for p in pairs], dtype=float),
            np.array([p[1] for p in pairs], dtype=float))


def _finite(x):
    return x is not None and np.isfinite(x)


def _scale(ci, factor):
    if ci is None or not _finite(factor):
        return None
    lo, hi = ci[0] * factor, ci[1] * factor
    return [min(lo, hi), max(lo, hi)]


def _normal_ci(est, se, ci_level, df=None):
    if not (_finite(est) and _finite(se)):
        return None
    crit = (float(stats.t.ppf((1 + ci_level) / 2, df)) if df
            else float(stats.norm.ppf((1 + ci_level) / 2)))
    return [est - crit * se, est + crit * se]


def _bootstrap(a, b, effect, paired, ci_level, n_boot, seed):
    from . import estimation  # local import: estimation imports this module
    res = estimation.bootstrap_effect(a, b, effect=effect, paired=paired,
                                      ci_level=ci_level, n_boot=n_boot,
                                      seed=seed, ci_type="bca")
    return res["ci"]


# --------------------------------------------- standardized differences

def d_from_stats(mean_a, var_a, n_a, mean_b, var_b, n_b, *,
                 standardizer: str = "pooled", ci_level: float = 0.95,
                 ci_method: str = "nct") -> dict:
    """Cohen's d / Hedges' g (A - B) from each group's mean, variance and
    n. standardizer: "pooled" (Cohen's d_s), "average"
    (sqrt((s_a^2 + s_b^2)/2), for unequal SDs) or "control" (Glass's
    delta, SD of group B). ci_method: "nct" (noncentral t; exact for
    "pooled") or "normal" (Hedges-Olkin SE, t critical value)."""
    diff = mean_a - mean_b
    df_pooled = n_a + n_b - 2
    if standardizer == "pooled":
        sd = math.sqrt(((n_a - 1) * var_a + (n_b - 1) * var_b) / df_pooled)
        df_j = df_pooled
    elif standardizer == "average":
        sd = math.sqrt((var_a + var_b) / 2.0)
        df_j = df_pooled
    elif standardizer == "control":
        sd = math.sqrt(var_b)
        df_j = n_b - 1
    else:
        raise ValueError(f"unknown standardizer: {standardizer}")
    d = diff / sd if sd > 0 else (math.copysign(math.inf, diff) if diff
                                  else math.nan)
    j = hedges_j(df_j)
    ci = None
    method = None
    if _finite(d):
        if ci_method == "normal" or standardizer == "control":
            if standardizer == "control":
                se = math.sqrt(1 / n_a + 1 / n_b + d * d / (2 * (n_b - 1)))
                ci = _normal_ci(d, se, ci_level)
                method = ("normal approximation, SE sqrt(1/n1 + 1/n2 + "
                          "delta^2 / (2 (n_control - 1))) (Hedges & Olkin "
                          "1985)")
            else:
                se = math.sqrt((n_a + n_b) / (n_a * n_b)
                               + d * d / (2 * (n_a + n_b)))
                ci = _normal_ci(d, se, ci_level, df_pooled)
                method = ("normal approximation, SE sqrt((n1 + n2)/(n1 n2) "
                          "+ d^2 / (2 (n1 + n2))), t critical value")
        elif standardizer == "pooled":
            scale = math.sqrt(1 / n_a + 1 / n_b)
            ci = _scale(ncp_t_interval(d / scale, df_pooled, ci_level), scale)
            method = "noncentral t (exact)"
        else:  # average SD: invert the Welch t, standardizer held fixed
            se = math.sqrt(var_a / n_a + var_b / n_b)
            df_w = (var_a / n_a + var_b / n_b) ** 2 / (
                (var_a / n_a) ** 2 / (n_a - 1) + (var_b / n_b) ** 2 / (n_b - 1))
            ci = _scale(ncp_t_interval(diff / se, df_w, ci_level), se / sd)
            method = ("noncentral t on the Welch t and df, standardizer "
                      "held fixed (approximate; Algina & Keselman 2003)")
    name = {"pooled": "cohens_d", "average": "cohens_d_av",
            "control": "glass_delta"}[standardizer]
    return {
        "measure": name, "standardizer": standardizer,
        "d": d, "hedges_g": j * d if _finite(d) else d,
        "ci_d": ci, "ci_g": _scale(ci, j), "ci_method": method,
        "ci_level": ci_level, "hedges_j": j, "df_correction": df_j,
        "standardizer_sd": sd, "n_a": int(n_a), "n_b": int(n_b),
        "interpretation": interpret(j * d if _finite(d) else d, "d"),
    }


def cohens_d(values_a, values_b, *, standardizer: str = "pooled",
             ci_level: float = 0.95, ci_method: str = "nct",
             n_boot: int = 5000, seed: int | None = 12345) -> dict:
    """Cohen's d and Hedges' g for two independent groups, A - B (see
    d_from_stats). ci_method "bootstrap" replaces the CI by a BCa
    bootstrap interval of d (and of g)."""
    a, b = _clean(values_a), _clean(values_b)
    if a.size < 2 or b.size < 2:
        raise ValueError("each group needs at least 2 values")
    out = d_from_stats(float(a.mean()), float(a.var(ddof=1)), a.size,
                       float(b.mean()), float(b.var(ddof=1)), b.size,
                       standardizer=standardizer, ci_level=ci_level,
                       ci_method="normal" if ci_method == "normal" else "nct")
    if ci_method == "bootstrap":
        effect = {"pooled": "cohens_d", "average": "cohens_d_av",
                  "control": "glass_delta"}[standardizer]
        ci = _bootstrap(b, a, effect, False, ci_level, n_boot, seed)
        out["ci_d"] = ci
        out["ci_g"] = _scale(ci, out["hedges_j"])
        out["ci_method"] = f"BCa bootstrap ({n_boot} resamples, seed {seed})"
    return out


def glass_delta(values_a, values_b, **kw) -> dict:
    """Glass's delta: (mean A - mean B) / SD of B (the control group)."""
    return cohens_d(values_a, values_b, standardizer="control", **kw)


def one_sample_d(values, mu: float = 0.0, *, ci_level: float = 0.95) -> dict:
    """d = (mean - mu) / SD with the exact noncentral t interval (df =
    n - 1) and Hedges' g with J(n - 1)."""
    x = _clean(values)
    n = x.size
    if n < 2:
        raise ValueError("need at least 2 values")
    sd = float(x.std(ddof=1))
    diff = float(x.mean()) - mu
    d = diff / sd if sd > 0 else (math.copysign(math.inf, diff) if diff
                                  else math.nan)
    j = hedges_j(n - 1)
    scale = 1.0 / math.sqrt(n)
    ci = (_scale(ncp_t_interval(d / scale, n - 1, ci_level), scale)
          if _finite(d) else None)
    return {"measure": "one_sample_d", "d": d,
            "hedges_g": j * d if _finite(d) else d, "ci_d": ci,
            "ci_g": _scale(ci, j), "ci_method": "noncentral t (exact)",
            "ci_level": ci_level, "hedges_j": j, "n": int(n), "mu": mu,
            "interpretation": interpret(j * d if _finite(d) else d, "d")}


def paired_d(values_a, values_b, *, ci_level: float = 0.95,
             ci_method: str = "nct", n_boot: int = 5000,
             seed: int | None = 12345) -> dict:
    """Standardized mean difference for paired data, A - B (Lakens 2013):
    d_z = mean(D) / SD(D) with the exact noncentral t interval (df n-1)
    and g_z = J(n-1) d_z; d_av = mean(D) / sqrt((s_a^2 + s_b^2)/2) with
    the noncentral t interval of t_paired rescaled by SD(D) / (sqrt(n)
    SD_av) (approximate; Algina & Keselman 2003) and g_av = J(2(n-1))
    d_av. Also the common-language effect size Phi(d_z) (McGraw & Wong
    1992). ci_method "bootstrap": BCa intervals for both."""
    a, b = _pair(values_a, values_b)
    n = a.size
    if n < 2:
        raise ValueError("need at least 2 complete pairs")
    dd = a - b
    mean_d = float(dd.mean())
    sd_d = float(dd.std(ddof=1))
    sd_av = math.sqrt((float(a.var(ddof=1)) + float(b.var(ddof=1))) / 2.0)
    dz = mean_d / sd_d if sd_d > 0 else (math.copysign(math.inf, mean_d)
                                        if mean_d else math.nan)
    dav = mean_d / sd_av if sd_av > 0 else math.nan
    jz, jav = hedges_j(n - 1), hedges_j(2 * (n - 1))
    if ci_method == "bootstrap":
        ci_z = _bootstrap(b, a, "cohens_dz", True, ci_level, n_boot, seed)
        ci_av = _bootstrap(b, a, "cohens_d_av", True, ci_level, n_boot,
                           seed)
        method = f"BCa bootstrap ({n_boot} resamples, seed {seed})"
        method_av = method
    else:
        ncp = (ncp_t_interval(mean_d / (sd_d / math.sqrt(n)), n - 1,
                              ci_level) if sd_d > 0 else None)
        ci_z = _scale(ncp, 1.0 / math.sqrt(n))
        ci_av = (_scale(ncp, sd_d / (math.sqrt(n) * sd_av))
                 if sd_av > 0 else None)
        method = "noncentral t (exact)"
        method_av = ("noncentral t of the paired t, standardizer held fixed "
                     "(approximate; Algina & Keselman 2003)")
    r = (float(np.corrcoef(a, b)[0, 1]) if n >= 3 and a.std() > 0
         and b.std() > 0 else None)
    return {
        "measure": "paired_d", "n_pairs": int(n),
        "d_z": dz, "hedges_g_z": jz * dz if _finite(dz) else dz,
        "ci_d_z": ci_z, "ci_g_z": _scale(ci_z, jz), "ci_method_z": method,
        "d_av": dav, "hedges_g_av": jav * dav if _finite(dav) else dav,
        "ci_d_av": ci_av, "ci_g_av": _scale(ci_av, jav),
        "ci_method_av": method_av, "ci_level": ci_level,
        "correlation": r,
        "cles_paired": (float(stats.norm.cdf(dz)) if _finite(dz) else None),
        "interpretation_z": interpret(jz * dz if _finite(dz) else dz, "d"),
        "interpretation_av": interpret(jav * dav if _finite(dav) else dav,
                                       "d"),
    }


# --------------------------------------------------- variance explained

def anova_term(ss_effect, df_effect, ss_error, df_error, *,
               ss_total=None, n_total=None, f_value=None,
               ci_level: float = 0.95) -> dict:
    """Effect sizes of one ANOVA term tested against an error term:
    partial eta^2, partial omega^2, partial epsilon^2, Cohen's f, and
    (with ss_total) eta^2, omega^2 and epsilon^2 of the whole design.
    n_total is the number of observations (for partial omega^2; defaults
    to df_effect + df_error + 1). CI of the population partial eta^2 from
    the noncentral F (Steiger 2004)."""
    ms_error = ss_error / df_error if df_error > 0 else math.nan
    ms_effect = ss_effect / df_effect if df_effect > 0 else math.nan
    denom = ss_effect + ss_error
    eta_p = ss_effect / denom if denom > 0 else None
    n = n_total if n_total is not None else df_effect + df_error + 1
    omega_p = None
    if np.isfinite(ms_error) and np.isfinite(ms_effect):
        den = df_effect * ms_effect + (n - df_effect) * ms_error
        if den > 0:
            omega_p = df_effect * (ms_effect - ms_error) / den
    eps_p = ((ss_effect - df_effect * ms_error) / denom
             if denom > 0 and np.isfinite(ms_error) else None)
    if f_value is None and ms_error and np.isfinite(ms_error) \
            and ms_error > 0:
        f_value = ms_effect / ms_error
    lam = ncp_f_interval(f_value, df_effect, df_error, ci_level) \
        if f_value is not None else None
    ci = ([l / (l + df_effect + df_error + 1) for l in lam]
          if lam is not None else None)
    out = {
        "partial_eta_squared": eta_p,
        "ci_partial_eta_squared": ci,
        "partial_omega_squared": omega_p,
        "partial_epsilon_squared": eps_p,
        "cohens_f": (math.sqrt(eta_p / (1 - eta_p))
                     if eta_p is not None and eta_p < 1 else None),
        "ci_cohens_f": ([math.sqrt(v / (1 - v)) if v < 1 else math.inf
                         for v in ci] if ci is not None else None),
        "ci_level": ci_level,
        "ci_method": ("noncentral F, eta_p^2 = lambda / (lambda + df1 + df2 "
                      "+ 1) (Steiger 2004); covers the population value "
                      "that eta^2, omega^2 and epsilon^2 estimate"),
        "interpretation": interpret(eta_p, "eta2"),
    }
    if ss_total is not None and ss_total > 0:
        out["eta_squared"] = ss_effect / ss_total
        if np.isfinite(ms_error):
            out["omega_squared"] = ((ss_effect - df_effect * ms_error)
                                    / (ss_total + ms_error))
            out["epsilon_squared"] = ((ss_effect - df_effect * ms_error)
                                      / ss_total)
    return out


def one_way(ss_between, df_between, ss_within, df_within, *,
            ci_level: float = 0.95) -> dict:
    """One-way ANOVA: eta^2 (= partial eta^2), omega^2, epsilon^2, f,
    with the noncentral-F interval of eta^2."""
    term = anova_term(ss_between, df_between, ss_within, df_within,
                      ss_total=ss_between + ss_within,
                      n_total=df_between + df_within + 1,
                      ci_level=ci_level)
    return {
        "eta_squared": term.get("eta_squared"),
        "ci_eta_squared": term["ci_partial_eta_squared"],
        "omega_squared": term.get("omega_squared"),
        "epsilon_squared": term.get("epsilon_squared"),
        "cohens_f": term["cohens_f"], "ci_cohens_f": term["ci_cohens_f"],
        "ci_level": ci_level, "ci_method": term["ci_method"],
        "interpretation": term["interpretation"],
    }


def factorial_terms(sources: dict, *, n_total: int, ss_total: float,
                    residual_key: str = "residual",
                    ci_level: float = 0.95) -> dict:
    """Per-term effect sizes for an ordinary (between-subjects)
    factorial ANOVA table {label: {ss, df, F?}}: every term against the
    residual (partial eta^2 with CI, partial omega^2, partial epsilon^2,
    f) plus eta^2 = SS / SS_total."""
    res = sources[residual_key]
    out = {}
    for label, src in sources.items():
        if label == residual_key or not src.get("df"):
            continue
        out[label] = anova_term(src["ss"], src["df"], res["ss"], res["df"],
                                ss_total=ss_total, n_total=n_total,
                                f_value=src.get("F"), ci_level=ci_level)
    return out


def generalized_eta_squared(ss_effect, ss_subject_terms) -> float | None:
    """Generalized eta^2 (Olejnik & Algina 2003; Bakeman 2005): SS of the
    effect over itself plus all sums of squares that involve subjects
    (subjects, subjects x factor interactions, residual), for designs
    whose factors are all manipulated."""
    den = ss_effect + sum(ss_subject_terms)
    return ss_effect / den if den > 0 else None


def repeated_term(ss_effect, df_effect, ss_error, df_error,
                  ss_subject_terms, *, ci_level: float = 0.95) -> dict:
    """Effect sizes of a term in a repeated-measures or mixed design:
    partial eta^2 against the term's own error (CI from the noncentral F
    on the uncorrected df, i.e. assuming sphericity), Cohen's f, and
    generalized eta^2 (Olejnik & Algina 2003; Bakeman 2005) with
    ss_subject_terms = every SS involving subjects."""
    t = anova_term(ss_effect, df_effect, ss_error, df_error,
                   ci_level=ci_level)
    g = generalized_eta_squared(ss_effect, ss_subject_terms)
    return {
        "partial_eta_squared": t["partial_eta_squared"],
        "ci_partial_eta_squared": t["ci_partial_eta_squared"],
        "cohens_f": t["cohens_f"], "ci_cohens_f": t["ci_cohens_f"],
        "generalized_eta_squared": g,
        "ci_level": ci_level,
        "ci_method": t["ci_method"] + "; uncorrected df (assumes "
                     "sphericity)",
        "interpretation": t["interpretation"],
        "interpretation_generalized": interpret(g, "eta2"),
    }


def kruskal_wallis(h, n_total, k) -> dict:
    """epsilon^2_R = H (n + 1) / (n^2 - 1) and eta^2_H = (H - k + 1) /
    (n - k) (Tomczak & Tomczak 2014)."""
    eps = h * (n_total + 1) / (n_total ** 2 - 1) if n_total > 1 else None
    eta = (h - k + 1) / (n_total - k) if n_total > k else None
    return {"epsilon_squared": eps, "eta_squared_h": eta,
            "interpretation": interpret(eps, "eta2")}


def kendalls_w(chi2_friedman, n_subjects, k) -> dict:
    """Kendall's W from the (tie-corrected) Friedman statistic:
    W = chi^2 / (n (k - 1))."""
    w = (chi2_friedman / (n_subjects * (k - 1))
         if n_subjects > 0 and k > 1 else None)
    return {"kendalls_w": w, "interpretation": interpret(w, "kendalls_w")}


# ------------------------------------------------------------ association

def phi_cramers_v(table, *, bias_correction: bool = False,
                  ci_level: float = 0.95, ci_method: str = "ncp",
                  n_boot: int = 2000, seed: int | None = 12345) -> dict:
    """phi (signed for 2 x 2) and Cramer's V of an r x c table of counts,
    the bias-corrected V (Bergsma 2013), and a CI for V (and |phi|) from
    the noncentral chi-square (ci_method "ncp") or a multinomial
    bootstrap (percentile interval; ci_method "bootstrap")."""
    grid = np.asarray(table, dtype=float)
    if grid.ndim != 2 or min(grid.shape) < 2:
        raise ValueError("need at least a 2 x 2 table")
    n = float(grid.sum())
    r, c = grid.shape
    q = min(r, c) - 1
    rs, cs = grid.sum(1), grid.sum(0)
    if np.any(rs == 0) or np.any(cs == 0):
        raise ValueError("every row and column total must be positive")
    chi2 = float(stats.chi2_contingency(grid, correction=False)[0])
    df = (r - 1) * (c - 1)
    v = math.sqrt(chi2 / (n * q))
    phi = math.sqrt(chi2 / n)
    if grid.shape == (2, 2):
        a, b_, c_, d = grid.ravel()
        phi = float((a * d - b_ * c_) / math.sqrt(rs[0] * rs[1] * cs[0]
                                                  * cs[1]))
    # Bergsma (2013) bias correction
    phi2_t = max(0.0, chi2 / n - (r - 1) * (c - 1) / (n - 1))
    r_t = r - (r - 1) ** 2 / (n - 1)
    c_t = c - (c - 1) ** 2 / (n - 1)
    den = min(r_t - 1, c_t - 1)
    v_bc = math.sqrt(phi2_t / den) if den > 0 else None
    if ci_method == "bootstrap":
        rng = np.random.default_rng(seed)
        draws = rng.multinomial(int(round(n)), (grid / n).ravel(),
                                size=n_boot).reshape(n_boot, r, c)
        vals = []
        for g in draws:
            if np.any(g.sum(1) == 0) or np.any(g.sum(0) == 0):
                vals.append(0.0)
                continue
            x2 = float(stats.chi2_contingency(g, correction=False)[0])
            if bias_correction:
                p2 = max(0.0, x2 / n - (r - 1) * (c - 1) / (n - 1))
                vals.append(math.sqrt(p2 / den) if den > 0 else 0.0)
            else:
                vals.append(math.sqrt(x2 / (n * q)))
        alpha = 1 - ci_level
        ci = [float(np.quantile(vals, alpha / 2)),
              float(np.quantile(vals, 1 - alpha / 2))]
        method = (f"multinomial bootstrap, percentile ({n_boot} resamples, "
                  f"seed {seed})")
    else:
        lam = ncp_chi2_interval(chi2, df, ci_level)
        ci = ([min(1.0, math.sqrt(l / (n * q))) for l in lam]
              if lam is not None else None)
        method = ("noncentral chi-square, V = sqrt(lambda / (N (min(r, c) "
                  "- 1))) (Smithson 2003)")
    return {
        "phi": phi, "cramers_v": v, "cramers_v_corrected": v_bc,
        "ci_cramers_v": ci, "ci_method": method, "ci_level": ci_level,
        "chi2": chi2, "df": int(df), "n": n, "min_dim_minus_1": int(q),
        "cohens_w": phi if grid.shape != (2, 2) else abs(phi),
        "interpretation": interpret(
            (v_bc if bias_correction and v_bc is not None else v)
            * math.sqrt(q), "w"),
    }


def cohens_w(observed, expected=None) -> dict:
    """Cohen's w = sqrt(sum((p1 - p0)^2 / p0)) for a goodness-of-fit
    table (proportions or counts; expected defaults to uniform)."""
    obs = np.asarray(observed, dtype=float)
    p1 = obs / obs.sum()
    if expected is None:
        p0 = np.full(obs.size, 1.0 / obs.size)
    else:
        p0 = np.asarray(expected, dtype=float)
        p0 = p0 / p0.sum()
    w = float(math.sqrt(np.sum((p1 - p0) ** 2 / p0)))
    return {"cohens_w": w, "interpretation": interpret(w, "w")}


def r_interval(r, n, ci_level: float = 0.95) -> list | None:
    """Fisher z interval of a correlation (Fisher 1921)."""
    if n < 4 or r is None or not abs(r) < 1:
        return None
    z = math.atanh(r)
    crit = float(stats.norm.ppf((1 + ci_level) / 2))
    se = 1 / math.sqrt(n - 3)
    return [math.tanh(z - crit * se), math.tanh(z + crit * se)]


def r_squared_interval(ci_r) -> list | None:
    """Interval of r^2 from the interval of r: the squared limits,
    with 0 as the lower limit when the r interval contains zero."""
    if ci_r is None:
        return None
    lo, hi = ci_r
    if lo <= 0 <= hi:
        return [0.0, max(lo * lo, hi * hi)]
    return sorted([lo * lo, hi * hi])


def point_biserial(values_a, values_b, *, ci_level: float = 0.95) -> dict:
    """Point-biserial r between the values and group membership (A = 1,
    B = 0), with the Fisher z interval; r = t / sqrt(t^2 + df) of the
    pooled t test."""
    a, b = _clean(values_a), _clean(values_b)
    if a.size < 1 or b.size < 1 or a.size + b.size < 3:
        raise ValueError("need values in both groups")
    y = np.concatenate([a, b])
    x = np.concatenate([np.ones(a.size), np.zeros(b.size)])
    if y.std() == 0:
        raise ValueError("all values are identical")
    r = float(np.corrcoef(x, y)[0, 1])
    ci = r_interval(r, y.size, ci_level)
    return {"r": r, "ci_r": ci, "r_squared": r * r,
            "ci_r_squared": r_squared_interval(ci), "n": int(y.size),
            "ci_method": "Fisher z", "ci_level": ci_level,
            "interpretation": interpret(r, "r")}


# ----------------------------------------------------------- nonparametric

def cliffs_delta(values_a, values_b, *, ci_level: float = 0.95) -> dict:
    """Cliff's delta = P(A > B) - P(A < B), the probability of
    superiority A = P(A > B) + P(A = B)/2, and their intervals (Cliff
    1993, 1996). delta equals the Mann-Whitney rank-biserial
    correlation."""
    a, b = _clean(values_a), _clean(values_b)
    n1, n2 = a.size, b.size
    if n1 < 1 or n2 < 1:
        raise ValueError("each group needs at least 1 value")
    dom = np.sign(np.subtract.outer(a, b))
    delta = float(dom.mean())
    gt, lt = float((dom > 0).mean()), float((dom < 0).mean())
    ci = None
    var = None
    if n1 >= 2 and n2 >= 2:
        di, dj = dom.mean(1), dom.mean(0)
        var = ((n2 ** 2 * float(((di - delta) ** 2).sum())
                + n1 ** 2 * float(((dj - delta) ** 2).sum())
                - float(((dom - delta) ** 2).sum()))
               / (n1 * n2 * (n1 - 1) * (n2 - 1)))
        var = max(var, (1 - delta ** 2) / (n1 * n2 - 1))
        s = math.sqrt(var)
        z = float(stats.norm.ppf((1 + ci_level) / 2))

        def limits(dl, vr):
            root = z * math.sqrt(vr) * math.sqrt((1 - dl ** 2) ** 2
                                                 + z * z * vr)
            den = 1 - dl ** 2 + z * z * vr
            return [(dl - dl ** 3 - root) / den, (dl - dl ** 3 + root) / den]

        if abs(delta) < 1:
            ci = limits(delta, var)
        else:
            # Complete separation: the variance estimate is zero. The
            # open-ended limit is taken from delta' = +-(1 - 1/(n1 n2))
            # (one dominance moved to a tie) with its variance floor, the
            # other limit is +-1 (an ad hoc continuity adjustment).
            dl = math.copysign(1 - 1 / (n1 * n2), delta)
            vr = max(var, (1 - dl ** 2) / (n1 * n2 - 1))
            lo, hi = limits(dl, vr)
            ci = [lo, 1.0] if delta > 0 else [-1.0, hi]
    a_val = gt + 0.5 * (1 - gt - lt)
    return {
        "cliffs_delta": delta, "ci_cliffs_delta": ci,
        "se_cliffs_delta": math.sqrt(var) if var is not None else None,
        "rank_biserial": delta,
        "cles": a_val,
        "ci_cles": [(1 + ci[0]) / 2, (1 + ci[1]) / 2] if ci else None,
        "p_a_greater": gt, "p_a_less": lt, "p_tie": 1 - gt - lt,
        "ci_level": ci_level,
        "ci_method": ("Cliff (1996) asymmetric interval, unbiased variance "
                      "of Cliff (1993)"),
        "n_a": int(n1), "n_b": int(n2),
        "interpretation": interpret(delta, "cliffs_delta"),
        "interpretation_cles": interpret(a_val, "cles"),
    }


def cles_parametric(d) -> float | None:
    """McGraw & Wong (1992) common-language effect size for two
    independent normal groups, Phi(d / sqrt 2)."""
    return float(stats.norm.cdf(d / math.sqrt(2))) if _finite(d) else None


def rank_biserial_paired(values_a, values_b=None, *,
                         zero_method: str = "wilcox",
                         ci_level: float = 0.95) -> dict:
    """Matched-pairs rank-biserial correlation of the differences A - B
    (or of one sample against zero when values_b is None): (R+ - R-) /
    (R+ + R-) (Kerby 2014). zero_method "wilcox" drops zero differences
    before ranking; "pratt" ranks them and then drops their ranks. CI by
    Fisher z with SE sqrt((2n^3 + 3n^2 + n)/6) / (n(n + 1)/2), n the
    number of ranked differences."""
    if values_b is None:
        d = _clean(values_a)
    else:
        a, b = _pair(values_a, values_b)
        d = a - b
    if zero_method == "wilcox":
        d = d[d != 0]
        ranks = stats.rankdata(np.abs(d))
    elif zero_method == "pratt":
        ranks = stats.rankdata(np.abs(d))
        ranks, d = ranks[d != 0], d[d != 0]
    else:
        raise ValueError(f"unknown zero_method: {zero_method}")
    n = d.size
    if n < 1:
        raise ValueError("all differences are zero")
    rp, rm = float(ranks[d > 0].sum()), float(ranks[d < 0].sum())
    r = (rp - rm) / (rp + rm)
    ci = None
    if n >= 2:
        se = math.sqrt((2 * n ** 3 + 3 * n ** 2 + n) / 6.0) / (n * (n + 1) / 2.0)
        crit = float(stats.norm.ppf((1 + ci_level) / 2))
        if abs(r) < 1:
            z = math.atanh(r)
            ci = [math.tanh(z - crit * se), math.tanh(z + crit * se)]
    return {"rank_biserial": r, "ci_rank_biserial": ci, "n_ranked": int(n),
            "ci_method": "Fisher z, null SE of the signed-rank statistic",
            "ci_level": ci_level, "interpretation": interpret(r, "r")}


def cohens_h(p1, p2, n1=None, n2=None, *, ci_level: float = 0.95) -> dict:
    """Cohen's h = 2 asin sqrt(p1) - 2 asin sqrt(p2), with a normal
    interval on the arcsine scale when n1 and n2 are given."""
    h = 2 * math.asin(math.sqrt(p1)) - 2 * math.asin(math.sqrt(p2))
    ci = None
    if n1 and n2:
        ci = _normal_ci(h, math.sqrt(1 / n1 + 1 / n2), ci_level)
    return {"cohens_h": h, "ci_cohens_h": ci, "ci_level": ci_level,
            "interpretation": interpret(h, "h")}


def odds_ratio_label(odds_ratio) -> dict | None:
    """Interpretation of an odds ratio (values and CIs are computed in
    opendose.contingency and opendose.proportions)."""
    return interpret(odds_ratio, "odds_ratio")


# ------------------------------------------------- bundles for analyses

def safe(fn, *args, **kwargs):
    """Effect sizes never make an analysis fail: degenerate data (zero
    SD, too few values) give None."""
    try:
        return fn(*args, **kwargs)
    except (ValueError, ZeroDivisionError, FloatingPointError,
            OverflowError, RuntimeError):
        return None


def two_group_summary(values_a, values_b, *, ci_level: float = 0.95,
                      ci_method: str = "nct", n_boot: int = 5000,
                      seed: int | None = 12345) -> dict:
    """Every two-independent-group effect size, A - B: Cohen's d / Hedges'
    g (pooled), d_av (average variance), Glass's delta (B = control),
    point-biserial r, Cliff's delta with the probability of superiority,
    and the parametric common-language effect size."""
    kw = dict(ci_level=ci_level, ci_method=ci_method, n_boot=n_boot,
              seed=seed)
    d = safe(cohens_d, values_a, values_b, **kw)
    return {
        "cohens_d": d,
        "cohens_d_av": safe(cohens_d, values_a, values_b,
                            standardizer="average", **kw),
        "glass_delta": safe(glass_delta, values_a, values_b, **kw),
        "point_biserial": safe(point_biserial, values_a, values_b,
                               ci_level=ci_level),
        "cliffs_delta": safe(cliffs_delta, values_a, values_b,
                             ci_level=ci_level),
        "cles_parametric": cles_parametric(d["d"]) if d else None,
    }


def from_statistic(*, t=None, F=None, df=None, df1=None, df2=None,
                   n_a=None, n_b=None, n=None,
                   ci_level: float = 0.95) -> dict:
    """Effect size from a reported test statistic.

    t with n_a and n_b (two independent groups): d = t sqrt(1/n_a +
    1/n_b), df = n_a + n_b - 2 unless given; t with n (one sample or
    paired): d (d_z) = t / sqrt(n), df = n - 1; both with exact
    noncentral-t CIs and Hedges' g. F with df1 and df2: partial eta^2 =
    F df1 / (F df1 + df2), its noncentral-F CI, partial omega^2 =
    df1 (F - 1) / (df1 (F - 1) + df1 + df2 + 1) and Cohen's f."""
    if t is not None:
        if n_a and n_b:
            scale = math.sqrt(1 / n_a + 1 / n_b)
            df = df if df is not None else n_a + n_b - 2
            measure = "cohens_d"
        elif n:
            scale = 1 / math.sqrt(n)
            df = df if df is not None else n - 1
            measure = "cohens_d_one_sample_or_paired"
        else:
            raise ValueError("t needs n_a and n_b, or n")
        d = t * scale
        j = hedges_j(df)
        ci = _scale(ncp_t_interval(t, df, ci_level), scale)
        return {"measure": measure, "d": d, "hedges_g": j * d, "ci_d": ci,
                "ci_g": _scale(ci, j), "df": df, "ci_level": ci_level,
                "ci_method": "noncentral t (exact)",
                "interpretation": interpret(j * d, "d")}
    if F is not None:
        if not (df1 and df2):
            raise ValueError("F needs df1 and df2")
        eta_p = F * df1 / (F * df1 + df2)
        lam = ncp_f_interval(F, df1, df2, ci_level)
        ci = ([l / (l + df1 + df2 + 1) for l in lam] if lam is not None
              else None)
        n_tot = df1 + df2 + 1
        omega_p = df1 * (F - 1) / (df1 * (F - 1) + n_tot)
        return {"measure": "partial_eta_squared",
                "partial_eta_squared": eta_p, "ci_partial_eta_squared": ci,
                "partial_omega_squared": omega_p,
                "cohens_f": math.sqrt(eta_p / (1 - eta_p)) if eta_p < 1
                else None,
                "ci_level": ci_level,
                "ci_method": "noncentral F (Steiger 2004)",
                "interpretation": interpret(eta_p, "eta2")}
    raise ValueError("give t or F")
