"""Power and sample size for more designs (prospective only): repeated
measures ANOVA, ANCOVA, rank tests, equivalence (TOST), multiple
regression and logistic regression. Registered in power.KINDS, so the
"power" handler answers the same three questions as for the other
designs: "n" (a priori), "power" (for a planned n) and "effect"
(sensitivity). None of them takes an observed effect from finished data:
post hoc (observed) power is not offered (GraphPad Statistics Guide,
"Don't compute the power to detect the difference actually observed";
Hoenig & Heisey 2001, Am Stat 55:19).

Methods
- Repeated measures ANOVA, univariate approach (Faul, Erdfelder, Lang &
  Buchner 2007, Behav Res Methods 39:175, Table 3 and pp. 182-183; the
  G*Power 3 "Repeated measures" procedures). k groups (between factor),
  m measurements, correlation rho among the repeated measures, the
  nonsphericity correction eps (1 / (m - 1) <= eps <= 1):
    within:       lambda = f^2 u N eps, u = m / (1 - rho),
                  df = ((m - 1) eps, (N - k)(m - 1) eps)
    interaction:  lambda = f^2 u N eps, u = m / (1 - rho),
                  df = ((k - 1)(m - 1) eps, (N - k)(m - 1) eps)
    between:      lambda = f^2 u N, u = m / (1 + (m - 1) rho),
                  df = (k - 1, N - k)
  N is a multiple of k (equal groups).
- ANCOVA with one normally distributed covariate (a baseline) whose
  within-group correlation with the outcome is rho: the residual variance
  is sigma^2 (1 - rho^2), so the design factor against the t test is
  1 - rho^2 (Borm, Fransen & Lemmens 2007, J Clin Epidemiol 60:1234).
  The power is the exact unconditional power of the ANCOVA t test of the
  treatment effect over the random covariate (Shieh 2020, Psychometrika
  85:101): conditional on the covariate the statistic is noncentral t on
  N - 3 df with noncentrality delta / sqrt(1 + F / (N - 2)), F ~ F(1,
  N - 2) the standardized covariate imbalance; the expectation over F is
  integrated numerically. Borm et al.'s large-sample rule ((1 - rho^2)
  times the t-test n, plus one per group) is reported beside it.
- Mann-Whitney and Wilcoxon signed-rank tests by the asymptotic relative
  efficiency (A.R.E.) method of the G*Power 3.1 manual (chs. 22-24): the
  t-test power with the sample size scaled by the A.R.E. k of the parent
  distribution (normal 3/pi, logistic pi^2/9, Laplace 3/2, uniform 1,
  the minimum 0.864; Lehmann 1975): two groups delta = d sqrt(N1 N2 k /
  (N1 + N2)), df = N k - 2; one sample or pairs delta = d sqrt(N k),
  df = N k - 1. A large-sample approximation: at small n it can overstate
  the power (G*Power manual 22.3: 0.923 against about 0.83 by the exact
  variance method for d = 0.8, N = 11, Laplace parent); the nested-design
  simulation (simulate.nested_power) gives the rank test's power directly.
- Equivalence by two one-sided tests (TOST; Schuirmann 1987, J
  Pharmacokinet Biopharm 15:657): exact power of rejecting both one-sided
  nulls at level alpha each (Phillips 1990, J Pharmacokinet Biopharm
  18:137), integrated numerically over the sampling distribution of the
  SD: with D ~ N(theta, (sigma c)^2) and s = sigma v, v^2 ~ chi^2_nu /
  nu, power = E_v[Phi((U - theta)/(sigma c) - t v) - Phi((L - theta) /
  (sigma c) + t v)]^+, c = sqrt(1/n1 + 1/n2) (two groups) or sqrt(1/n)
  (pairs, one sample), t = t_{1 - alpha, nu}.
- Multiple regression, fixed predictors (G*Power manual chs. 13-14;
  Cohen 1988 ch. 9): f^2 = R^2 / (1 - R^2) for the omnibus test of p
  predictors, f^2 = (R^2_full - R^2_reduced) / (1 - R^2_full) for q
  predictors added to the others; lambda = f^2 N, df = (q, N - p - 1).
- Logistic regression, Wald test of one covariate (Hsieh, Bloch & Larsen
  1998, Stat Med 17:1623; G*Power manual ch. 29, "Hsieh et al."):
  a standard normal covariate, N = (z_a + z_b)^2 / (P (1 - P) beta^2)
  with P the event rate at the covariate's mean and beta = ln(odds ratio
  per SD); a binary covariate with a proportion B at X = 1, N = [z_a
  sqrt(Pbar (1 - Pbar) / B) + z_b sqrt(P1 (1 - P1) + P2 (1 - P2) (1 - B)
  / B)]^2 / ((P1 - P2)^2 (1 - B)); other covariates inflate N by
  1 / (1 - R^2). One-tail normal approximations, as published; at N =
  317 a simulation of the Wald test gave 0.940 against the formula's
  0.950 (G*Power manual 29.3).

Validation: engine/tests/test_power_designs.py (Faul et al. 2007 worked
examples, the G*Power 3.1 manual's printed results, Hsieh et al. 1998
Tables I and II, Borm et al. 2007 Table 1, statsmodels and simulation;
the scripts are in engine/tests/reference/power_designs.py).
"""

from __future__ import annotations

import math

import numpy as np
from scipy import integrate, optimize, special, stats

from .power import (_check, _continuous_n, _need, _smallest_n,
                    _solve_effect, f_power, t_power)

ARE = {"normal": 3 / math.pi, "logistic": math.pi ** 2 / 9,
       "laplace": 1.5, "uniform": 1.0, "min_are": 0.864}


def _f_value(f=None, eta2=None):
    if f is not None:
        return float(f)
    if eta2 is not None:
        if not 0 < eta2 < 1:
            raise ValueError("eta squared must be between 0 and 1")
        return math.sqrt(eta2 / (1 - eta2))
    return None


# ------------------------------------------------------ repeated measures

def anova_rm(solve="n", *, effect="within", f=None, eta2=None, k=1, m=None,
             rho=None, eps=1.0, n_total=None, alpha=0.05,
             power=None) -> dict:
    """Repeated measures ANOVA, univariate approach (Faul et al. 2007,
    Table 3): the within effect, the between effect or the
    between x within interaction. k groups, m measurements, correlation
    rho among the repeated measures, nonsphericity correction eps.
    n_total is the total number of subjects (a multiple of k)."""
    _check(alpha, power, 2, solve)
    if effect not in ("within", "between", "interaction"):
        raise ValueError("effect must be within, between or interaction")
    k = int(k)
    m = int(_need(m, "m (number of measurements)"))
    rho = float(_need(rho, "rho (correlation among repeated measures)"))
    eps = float(eps)
    if k < 1:
        raise ValueError("the number of groups must be at least 1")
    if m < 2:
        raise ValueError("a repeated measures design needs at least 2 "
                         "measurements per subject")
    if effect in ("between", "interaction") and k < 2:
        raise ValueError(f"the {effect} effect needs at least 2 groups")
    if not -1 / (m - 1) < rho < 1:
        raise ValueError(f"rho must be between {-1 / (m - 1):.3g} and 1 "
                         f"for {m} measurements")
    if effect != "between" and not 1 / (m - 1) - 1e-12 <= eps <= 1:
        raise ValueError(f"epsilon must be between 1/(m - 1) = "
                         f"{1 / (m - 1):.3g} and 1")
    f = _f_value(f, eta2)

    def design(N):
        if effect == "between":
            u = m / (1 + (m - 1) * rho)
            return u * N, k - 1, N - k
        u = m / (1 - rho)
        df1 = (m - 1) * eps * (1 if effect == "within" else k - 1)
        return u * N * eps, df1, (N - k) * (m - 1) * eps

    def pw(N, ff):
        scale, df1, df2 = design(N)
        return f_power(ff * ff * scale, df1, df2, alpha)

    out = {"kind": "anova_rm", "solve": solve, "alpha": alpha, "tails": None,
           "effect_type": effect, "k": k, "m": m, "rho": rho,
           "eps": eps if effect != "between" else None}
    if solve == "n":
        f = _need(f, "f")
        N = k * _smallest_n(lambda nn: pw(nn * k, f), power, 2)
        out["n_total_exact"] = _continuous_n(lambda nn: pw(nn, f), power,
                                             k + 1.0, N)
        out["target_power"] = power
    else:
        N = int(_need(n_total, "n_total"))
        if N <= k:
            raise ValueError(f"the total sample size must exceed the number "
                             f"of groups ({k})")
        f = (_solve_effect(lambda e: pw(N, e), power, 1e-8, 1e2)
             if solve == "effect" else _need(f, "f"))
    scale, df1, df2 = design(N)
    out.update({
        "n_total": N, "n_per_group": [N // k] * k if N % k == 0 else None,
        "power": pw(N, f), "df1": df1, "df2": df2, "ncp": f * f * scale,
        "critical_f": float(stats.f.isf(alpha, df1, df2)),
        "effect": {"name": "f", "value": f, "eta_squared": f * f / (1 + f * f)},
    })
    return out


# ------------------------------------------------------------------ ANCOVA

def _beta_half_nodes(nu, n=48):
    """Quadrature for E[g(U)], U = F / (nu + F) ~ Beta(1/2, nu/2):
    Gauss-Jacobi (weight u^(-1/2) (1 - u)^(nu/2 - 1)) up to nu = 300;
    above, generalized Gauss-Laguerre in s = nu u / 2 (weight s^(-1/2)
    e^(-s)) with the smooth factor (1 - 2s/nu)^(nu/2 - 1) e^s folded into
    the weights (Jacobi weights overflow there)."""
    if nu <= 300:
        x, w = special.roots_jacobi(n, nu / 2 - 1, -0.5)
        u = (x + 1) / 2
    else:
        s, w = special.roots_genlaguerre(n, -0.5)
        u = 2 * s / nu
        inside = u < 1
        c = np.zeros_like(s)
        c[inside] = np.exp((nu / 2 - 1) * np.log1p(-u[inside]) + s[inside])
        w = w * c
        u = np.minimum(u, 1.0)
    return u, w / np.sum(w)


def ancova_power(d, rho, n1, n2, alpha=0.05, tails=2) -> float:
    """Exact unconditional power of the two-group ANCOVA t test with one
    normal covariate (Shieh 2020): E_F[t power(delta / sqrt(1 + F/(N-2)),
    N - 3)], F ~ F(1, N - 2), i.e. delta sqrt(1 - U) with U ~ Beta(1/2,
    (N - 2)/2), by Gaussian quadrature (agrees with adaptive quadrature
    over F to 1e-11: engine/tests/test_power_designs.py)."""
    N = n1 + n2
    if N < 4:
        return float("nan")
    delta = abs(d) / math.sqrt(1 - rho * rho) * math.sqrt(n1 * n2 / N)
    df = N - 3
    u, w = _beta_half_nodes(N - 2)
    ncp = delta * np.sqrt(1 - u)
    tc = float(stats.t.isf(alpha / tails, df))
    p = stats.nct.sf(tc, df, ncp)
    if tails == 2:
        # scipy's nct.cdf is NaN deep in the far tail; it is bounded by
        # Phi(-ncp), 0 to double precision there (power._far_tail).
        far = stats.nct.cdf(-tc, df, ncp)
        p = p + np.where(np.isfinite(far), far, 0.0)
    return float(min(max(np.sum(w * p), 0.0), 1.0))


def ancova(solve="n", *, d=None, delta=None, sd=None, rho=None, n1=None,
           n2=None, ratio=1.0, alpha=0.05, power=None, tails=2) -> dict:
    """Two groups compared by ANCOVA on one baseline covariate. Effect: d
    (the difference over the SD of the outcome, not the adjusted SD) or
    delta / sd; rho: correlation of baseline and outcome within groups."""
    _check(alpha, power, tails, solve)
    rho = float(_need(rho, "rho (correlation of covariate and outcome)"))
    if not -1 < rho < 1:
        raise ValueError("rho must be between -1 and 1")
    if d is None and delta is not None and sd:
        d = float(delta) / float(sd)

    def b_of(a):
        return max(2, math.ceil(ratio * a - 1e-9))

    out = {"kind": "ancova", "solve": solve, "alpha": alpha, "tails": tails,
           "ratio": ratio, "rho": rho, "covariates": 1,
           "design_factor": 1 - rho * rho}
    if solve == "n":
        d = float(_need(d, "d"))
        a = _smallest_n(lambda k: ancova_power(d, rho, k, b_of(k), alpha,
                                               tails), power, 2)
        b = b_of(a)
        out["target_power"] = power
        # Borm et al. (2007): (1 - rho^2) times the t test's n, plus one.
        a_t = _smallest_n(lambda k: t_power(d * math.sqrt(k * b_of(k)
                                                          / (k + b_of(k))),
                                            k + b_of(k) - 2, alpha, tails),
                          power, 2)
        out["n1_t_test"] = a_t
        out["n1_design_factor"] = (1 - rho * rho) * a_t + 1
    else:
        a = int(_need(n1, "n1"))
        b = int(n2 if n2 is not None else b_of(a))
        if a + b < 5:
            raise ValueError("ANCOVA needs at least 5 subjects in total")
        if solve == "effect":
            d = _solve_effect(lambda e: ancova_power(e, rho, a, b, alpha,
                                                     tails), power, 1e-8, 1e2)
        else:
            d = float(_need(d, "d"))
    out.update({
        "n1": a, "n2": b, "n_per_group": [a, b], "n_total": a + b,
        "power": ancova_power(d, rho, a, b, alpha, tails), "df": a + b - 3,
        "effect": {"name": "d", "value": d,
                   "d_adjusted": d / math.sqrt(1 - rho * rho)},
    })
    return out


# -------------------------------------------------------------- rank tests

def _are_of(parent, are):
    if are is not None:
        are = float(are)
        if not 0 < are <= 10:
            raise ValueError("the A.R.E. must be a positive number")
        return are, "manual"
    if parent not in ARE:
        raise ValueError(f"unknown parent distribution: {parent}")
    return ARE[parent], parent


def mann_whitney(solve="n", *, d=None, n1=None, n2=None, ratio=1.0,
                 parent="normal", are=None, alpha=0.05, power=None,
                 tails=2) -> dict:
    """Wilcoxon-Mann-Whitney test, A.R.E. method (G*Power manual 24.5)."""
    _check(alpha, power, tails, solve)
    kk, parent = _are_of(parent, are)

    def pw(a, b, e):
        N = a + b
        return t_power(e * math.sqrt(a * b * kk / N), N * kk - 2, alpha,
                       tails)

    def b_of(a):
        return max(2, math.ceil(ratio * a - 1e-9))

    out = {"kind": "mann_whitney", "solve": solve, "alpha": alpha,
           "tails": tails, "ratio": ratio, "parent": parent, "are": kk}
    if solve == "n":
        d = float(_need(d, "d"))
        a = _smallest_n(lambda k: pw(k, b_of(k), d), power, 2)
        b = b_of(a)
        out["n1_exact"] = _continuous_n(
            lambda k: pw(k, max(ratio * k, 1.0 + 1e-9), d), power, 2.0, a)
        out["target_power"] = power
    else:
        a = int(_need(n1, "n1"))
        b = int(n2 if n2 is not None else b_of(a))
        d = (_solve_effect(lambda e: pw(a, b, e), power, 1e-8, 1e3)
             if solve == "effect" else float(_need(d, "d")))
    N = a + b
    out.update({"n1": a, "n2": b, "n_per_group": [a, b], "n_total": N,
                "power": pw(a, b, d), "df": N * kk - 2,
                "ncp": d * math.sqrt(a * b * kk / N),
                "effect": {"name": "d", "value": d}})
    return out


def wilcoxon_signed_rank(solve="n", *, d=None, n=None, parent="normal",
                         are=None, alpha=0.05, power=None, tails=2) -> dict:
    """Wilcoxon signed-rank test (one sample or matched pairs; d is d_z
    for pairs), A.R.E. method (G*Power manual chs. 22-23)."""
    _check(alpha, power, tails, solve)
    kk, parent = _are_of(parent, are)

    def pw(nn, e):
        return t_power(e * math.sqrt(nn * kk), nn * kk - 1, alpha, tails)

    out = {"kind": "wilcoxon_signed_rank", "solve": solve, "alpha": alpha,
           "tails": tails, "parent": parent, "are": kk}
    if solve == "n":
        d = float(_need(d, "d"))
        nn = _smallest_n(lambda k: pw(k, d), power, 2)
        out["n_exact"] = _continuous_n(lambda k: pw(k, d), power, 2.0, nn)
        out["target_power"] = power
    else:
        nn = int(_need(n, "n"))
        d = (_solve_effect(lambda e: pw(nn, e), power, 1e-8, 1e3)
             if solve == "effect" else float(_need(d, "d")))
    out.update({"n": nn, "n_total": nn, "power": pw(nn, d),
                "df": nn * kk - 1, "ncp": d * math.sqrt(nn * kk),
                "effect": {"name": "d", "value": d}})
    return out


# ------------------------------------------------------------- equivalence

def tost_power(theta, lower, upper, sd, c, nu, alpha=0.05) -> float:
    """Exact power of two one-sided t tests at level alpha each:
    E_v[Phi(a - t v) - Phi(b + t v)]^+ with a = (U - theta)/(sd c),
    b = (L - theta)/(sd c), v^2 ~ chi^2_nu / nu (Phillips 1990)."""
    if not (sd > 0 and c > 0 and nu > 0):
        return float("nan")
    t = float(stats.t.isf(alpha, nu))
    a = (upper - theta) / (sd * c)
    b = (lower - theta) / (sd * c)
    vmax = (a - b) / (2 * t)
    if vmax <= 0:
        return 0.0
    rt = math.sqrt(nu)
    # v lives (to 1e-16) between these chi quantiles; integrating only
    # there keeps quad on the mass when the margins are very wide.
    lo = float(stats.chi.ppf(1e-16, nu)) / rt
    hi = min(vmax, float(stats.chi.isf(1e-16, nu)) / rt)
    if hi <= lo:
        return 0.0

    def g(v):
        return (stats.norm.cdf(a - t * v) - stats.norm.cdf(b + t * v)) * \
            stats.chi.pdf(v * rt, nu) * rt

    pts = [p for p in (1.0,) if lo < p < hi]
    val, _ = integrate.quad(g, lo, hi, points=pts or None, limit=200,
                            epsabs=1e-13, epsrel=1e-10)
    return float(min(max(val, 0.0), 1.0))


def tost(solve="n", *, design="two_sample", margin=None, lower=None,
         upper=None, theta=0.0, sd=1.0, n1=None, n2=None, n=None, ratio=1.0,
         alpha=0.05, power=None) -> dict:
    """Equivalence of two means (or of a mean or mean difference to a
    reference) by TOST. Margins: lower and upper (raw units), or margin
    for -margin to +margin. theta: the true difference assumed; sd: the
    SD (two groups: within groups; pairs: of the differences). Effect
    solve: the smallest symmetric margin with the target power."""
    _check(alpha, power, 2, solve)
    if design not in ("two_sample", "paired", "one_sample"):
        raise ValueError("design must be two_sample, paired or one_sample")
    sd = float(sd)
    if not sd > 0:
        raise ValueError("the SD must be positive")
    theta = float(theta)
    two = design == "two_sample"
    if solve != "effect":
        if lower is None and upper is None:
            mg = float(_need(margin, "margin"))
            lower, upper = -abs(mg), abs(mg)
        lower, upper = float(_need(lower, "lower")), float(_need(upper, "upper"))
        if not lower < upper:
            raise ValueError("the lower margin must be below the upper one")
        if not lower < theta < upper:
            raise ValueError("the true difference must lie inside the "
                             "equivalence margins, or equivalence cannot "
                             "be shown")

    def b_of(a):
        return max(2, math.ceil(ratio * a - 1e-9))

    def geom(a, b):
        if two:
            return math.sqrt(1 / a + 1 / b), a + b - 2
        return math.sqrt(1 / a), a - 1

    def pw(a, b, lo, hi):
        c, nu = geom(a, b)
        return tost_power(theta, lo, hi, sd, c, nu, alpha)

    out = {"kind": "tost", "solve": solve, "alpha": alpha, "tails": None,
           "design": design, "theta": theta, "sd": sd}
    if two:
        out["ratio"] = ratio
    if solve == "n":
        a = _smallest_n(lambda k: pw(k, b_of(k), lower, upper), power, 2)
        b = b_of(a) if two else None
        out["target_power"] = power
    else:
        a = int(_need(n1 if two else n, "n1" if two else "n"))
        b = (int(n2) if n2 is not None else b_of(a)) if two else None
        if solve == "effect":
            g = lambda mg: pw(a, b, -mg, mg)
            lo_m = abs(theta) + 1e-9 * sd
            hi_m = abs(theta) + 1e3 * sd
            if g(hi_m) < power:
                raise ValueError("no margin reaches the target power with "
                                 "this sample size")
            mg = float(optimize.brentq(lambda v: g(v) - power, lo_m, hi_m,
                                       xtol=1e-12 * sd, rtol=1e-10))
            lower, upper = -mg, mg
    c, nu = geom(a, b)
    out.update({
        "lower": lower, "upper": upper, "df": nu,
        "critical_t": float(stats.t.isf(alpha, nu)),
        "power": pw(a, b, lower, upper),
        "effect": {"name": "margin",
                   "value": (upper - lower) / 2 if abs(upper + lower) < 1e-12
                   * max(1.0, abs(upper)) else None,
                   "lower": lower, "upper": upper, "theta": theta, "sd": sd},
    })
    if two:
        out.update({"n1": a, "n2": b, "n_per_group": [a, b],
                    "n_total": a + b})
    else:
        out.update({"n": a, "n_total": a})
    return out


# -------------------------------------------------------------- regression

def regression_r2(solve="n", *, f2=None, r2=None, r2_full=None,
                  r2_change=None, predictors=None, tested=None,
                  n_total=None, alpha=0.05, power=None) -> dict:
    """F test of a linear multiple regression, fixed predictors (G*Power
    chs. 13-14). Omnibus (tested = predictors): f2, or r2 of the model.
    Increase: tested predictors added to the others: f2, or r2_change
    with r2_full (the R^2 with every predictor)."""
    _check(alpha, power, 2, solve)
    p = int(_need(predictors, "predictors"))
    q = int(tested if tested is not None else p)
    if p < 1 or not 1 <= q <= p:
        raise ValueError("the tested predictors must be between 1 and the "
                         "total number of predictors")
    if f2 is None:
        if q == p and r2 is not None:
            if not 0 < r2 < 1:
                raise ValueError("R² must be between 0 and 1")
            f2 = r2 / (1 - r2)
        elif r2_change is not None and r2_full is not None:
            if not 0 < r2_change <= r2_full < 1:
                raise ValueError("the R² change must be positive and at "
                                 "most the full model's R², which is below 1")
            f2 = r2_change / (1 - r2_full)
    if f2 is not None:
        f2 = float(f2)
        if not f2 > 0:
            raise ValueError("f² must be positive")

    def pw(N, ff2):
        return f_power(ff2 * N, q, N - p - 1, alpha)

    out = {"kind": "regression_r2", "solve": solve, "alpha": alpha,
           "tails": None, "predictors": p, "tested": q}
    if solve == "n":
        f2 = _need(f2, "f2 (or R²)")
        N = _smallest_n(lambda k: pw(k, f2), power, p + 2)
        out["n_exact"] = _continuous_n(lambda k: pw(k, f2), power, p + 2.0, N)
        out["target_power"] = power
    else:
        N = int(_need(n_total, "n_total"))
        if N < p + 2:
            raise ValueError(f"the sample size must be at least the number "
                             f"of predictors + 2 ({p + 2})")
        f2 = (_solve_effect(lambda e: pw(N, e), power, 1e-10, 1e3)
              if solve == "effect" else f2)
        f2 = _need(f2, "f2 (or R²)")
    out.update({"n": N, "n_total": N, "power": pw(N, f2), "ncp": f2 * N,
                "df1": q, "df2": N - p - 1,
                "critical_f": float(stats.f.isf(alpha, q, N - p - 1)),
                "effect": {"name": "f2", "value": f2,
                           "r2_equivalent": f2 / (1 + f2)}})
    return out


# ---------------------------------------------------------------- logistic

def _hsieh_z(N, covariate, beta, p0, B, r2_other, zc):
    """z_beta of Hsieh et al. (1998) at sample size N."""
    Ne = N * (1 - r2_other)
    if covariate == "normal":
        return math.sqrt(Ne * p0 * (1 - p0)) * abs(beta) - zc
    o1 = p0 / (1 - p0) * math.exp(beta)
    p1 = o1 / (1 + o1)
    pbar = (1 - B) * p0 + B * p1
    num = (math.sqrt(Ne * (p0 - p1) ** 2 * (1 - B))
           - zc * math.sqrt(pbar * (1 - pbar) / B))
    return num / math.sqrt(p0 * (1 - p0) + p1 * (1 - p1) * (1 - B) / B)


def logistic(solve="n", *, odds_ratio=None, p0=None, p1=None,
             covariate="normal", x_prop=0.5, r2_other=0.0, n=None,
             alpha=0.05, power=None, tails=2) -> dict:
    """Wald test of one covariate in a logistic regression (Hsieh et al.
    1998). covariate "normal": odds_ratio per SD of the covariate, p0 the
    event rate at its mean. "binary": p0 the event rate at X = 0 and
    odds_ratio (or p1, the rate at X = 1), x_prop the proportion with
    X = 1. r2_other: R^2 of the covariate on the other covariates."""
    _check(alpha, power, tails, solve)
    if covariate not in ("normal", "binary"):
        raise ValueError("covariate must be normal or binary")
    p0 = float(_need(p0, "p0 (event rate)"))
    if not 0 < p0 < 1:
        raise ValueError("the event rate must be between 0 and 1")
    B = float(x_prop)
    if covariate == "binary" and not 0 < B < 1:
        raise ValueError("the proportion with X = 1 must be between 0 and 1")
    r2_other = float(r2_other or 0.0)
    if not 0 <= r2_other < 1:
        raise ValueError("R² with the other covariates must be in [0, 1)")
    if odds_ratio is None and p1 is not None:
        if not 0 < p1 < 1:
            raise ValueError("p1 must be between 0 and 1")
        odds_ratio = (p1 / (1 - p1)) / (p0 / (1 - p0))
    zc = float(stats.norm.isf(alpha / tails))

    def pw(N, orr):
        return float(stats.norm.cdf(_hsieh_z(N, covariate, math.log(orr),
                                             p0, B, r2_other, zc)))

    def n_formula(orr):
        zb = float(stats.norm.ppf(power))
        beta = math.log(orr)
        if covariate == "normal":
            return (zc + zb) ** 2 / (p0 * (1 - p0) * beta ** 2) / (1 - r2_other)
        o1 = p0 / (1 - p0) * orr
        q1 = o1 / (1 + o1)
        pbar = (1 - B) * p0 + B * q1
        top = (zc * math.sqrt(pbar * (1 - pbar) / B) + zb * math.sqrt(
            p0 * (1 - p0) + q1 * (1 - q1) * (1 - B) / B)) ** 2
        return top / ((p0 - q1) ** 2 * (1 - B)) / (1 - r2_other)

    out = {"kind": "logistic", "solve": solve, "alpha": alpha,
           "tails": tails, "covariate": covariate, "r2_other": r2_other}
    if covariate == "binary":
        out["x_prop"] = B
    if solve == "n":
        orr = float(_need(odds_ratio, "odds_ratio"))
        if not orr > 0 or orr == 1:
            raise ValueError("the odds ratio must be positive and not 1")
        n_exact = n_formula(orr)
        N = max(3, math.ceil(n_exact - 1e-9))
        while pw(N, orr) < power:   # rounding safety
            N += 1
        out.update({"n_exact": n_exact, "target_power": power})
    else:
        N = int(_need(n, "n"))
        if solve == "effect":
            below = odds_ratio is not None and odds_ratio < 1
            f = lambda lo: pw(N, math.exp(lo)) - power
            rng = (-12.0, -1e-9) if below else (1e-9, 12.0)
            if f(rng[0] if below else rng[1]) < 0:
                raise ValueError("no odds ratio reaches the target power "
                                 "with this sample size")
            orr = math.exp(optimize.brentq(f, *rng, xtol=1e-12))
        else:
            orr = float(_need(odds_ratio, "odds_ratio"))
    o1 = p0 / (1 - p0) * orr
    out.update({"n": N, "n_total": N, "power": pw(N, orr),
                "critical_z": zc,
                "effect": {"name": "odds_ratio", "value": orr, "p0": p0,
                           **({"p1": o1 / (1 + o1)} if covariate == "binary"
                              else {})}})
    return out


KINDS = {
    "anova_rm": anova_rm,
    "ancova": ancova,
    "mann_whitney": mann_whitney,
    "wilcoxon_signed_rank": wilcoxon_signed_rank,
    "tost": tost,
    "regression_r2": regression_r2,
    "logistic": logistic,
}
