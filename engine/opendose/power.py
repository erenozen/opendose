"""Power and sample size, randomisation lists, and sample-size
justification text.

The GraphPad statistics guide discusses the principles in "Choosing
sample size" and "Statistical power" (alpha, power and the effect size
worth detecting must be chosen before the experiment). Three questions
are answered for each design, as in G*Power (Faul, Erdfelder, Lang &
Buchner 2007, Behav Res Methods 39:175; the G*Power 3.1 manual, 2023):
"n" (a priori: the smallest sample size whose power reaches the target),
"power" (post hoc / achieved power for a given n) and "effect"
(sensitivity: the smallest effect detectable with the given n and
power). Two-sided tests are the default (tails = 2) and, as in G*Power,
their power includes both rejection regions.

Designs and methods
- t tests (G*Power manual chs. 19-21, 25): one sample and matched pairs
  (noncentral t, delta = d sqrt(n), df = n - 1), two independent groups
  (delta = d sqrt(n1 n2 / (n1 + n2)), df = n1 + n2 - 2; n2 =
  ceil(ratio n1)); Welch's test for unequal SDs with population SDs
  (delta = Delta / sqrt(s1^2/n1 + s2^2/n2), Welch-Satterthwaite df; an
  approximation, as in PASS).
- One-way ANOVA (ch. 10): lambda = f^2 N, df = (k - 1, N - k), N a
  multiple of k (equal groups, as G*Power reports); f from eta^2 or from
  the group means and the common SD. General F tests for main effects,
  interactions and planned contrasts (ch. 11): lambda = f^2 N, df2 =
  N - (number of groups); no rounding of N.
- Two proportions: the normal approximation with the pooled variance
  under H0 (Fleiss, Levin & Paik 2003 eq. 4.14; R power.prop.test), with
  the continuity correction of Fleiss, Tytun & Ury (1980, Biometrics
  36:343), the arcsine (Cohen's h) test (Cohen 1988 ch. 6; statsmodels
  NormalIndPower), and Fisher's exact test by enumeration: the
  unconditional power of the conditional test, summing the binomial
  probabilities of every table whose two-sided Fisher P (probability
  ordering, as scipy) is <= alpha (G*Power manual ch. 6).
- One proportion vs a constant (ch. 4): exact binomial test with alpha/2
  in each tail (G*Power's default balancing), or the normal
  approximation.
- McNemar (ch. 5): exact unconditional power of the conditional binomial
  test of the discordant pairs (sum over the binomial number of
  discordant pairs; alpha balancing "equal" = G*Power option 1,
  "minor_tail" = option 2, O'Brien 2002), or the normal approximation of
  Connor (1987, Biometrics 43:207).
- Correlation (ch. 3): exact distribution of the sample correlation
  (Hotelling 1953 density with the Gauss hypergeometric function,
  integrated numerically in Fisher's z), the Fisher z approximation
  (z(rho) - z(rho0)) sqrt(N - 3), or the t test of rho = 0 (point
  biserial model, ch. 16; delta = sqrt(rho^2 N / (1 - rho^2)), df =
  N - 2).
- Log-rank test / survival: required events by Schoenfeld (1981,
  Biometrika 68:316; 1983, Biometrics 39:499), D = (z_a + z_b)^2 /
  (p1 p2 ln^2 HR), or Freedman (1982, Stat Med 1:121), D = (z_a + z_b)^2
  (1 + phi HR)^2 / (phi (1 - HR)^2), phi = n2/n1; converted to subjects
  through the probability of an event: exponential survival with
  uniform accrual over a and further follow-up f, P = 1 - (e^{-l f} -
  e^{-l (a + f)}) / (l a), or Simpson's rule 1 - (S(f) + 4 S(f + a/2) +
  S(f + a)) / 6 (Schoenfeld 1983), averaged over the arms by allocation.
  These are one-tail normal approximations, as published.
- Chi-square goodness of fit and contingency tables (Cohen 1988 ch. 7):
  lambda = w^2 N on df degrees of freedom (statsmodels
  GofChisquarePower).
- Generic noncentral t, F and chi-square power for any test given its
  noncentrality and df (G*Power ch. 25).

Validation (engine/tests/test_power.py) reproduces the worked examples of
the G*Power 3.1 manual, Faul et al. (2007), Lakens (2013), R's
power.t.test and power.prop.test documentation examples, and statsmodels.

randomization_list: simple randomisation, a random permutation of a
balanced list ("random allocation rule"), permuted blocks with optional
random block sizes, and permuted blocks within strata (Altman & Bland
1999, BMJ 318:1209; Schulz & Grimes 2002, Lancet 359:515), from a
reported seed so the list can be regenerated.

justification: the a priori calculation written as the sentence that the
ARRIVE guidelines 2.0 (Percie du Sert et al. 2020, PLoS Biol 18:e3000410,
Essential 10 item 2b) and CONSORT 2010 item 7a ask for.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import integrate, optimize, special, stats

SOLVE = ("n", "power", "effect")
N_MAX = 10_000_000


# ------------------------------------------------------------- engines

def t_power(ncp, df, alpha=0.05, tails=2) -> float:
    """Power of a t test with noncentrality ncp on df degrees of freedom
    (both rejection regions for tails = 2; the region on the side of the
    effect for tails = 1)."""
    ncp = abs(ncp)
    if tails == 2:
        tc = stats.t.isf(alpha / 2, df)
        return float(stats.nct.sf(tc, df, ncp) + _far_tail(tc, df, ncp))
    tc = stats.t.isf(alpha, df)
    return float(stats.nct.sf(tc, df, ncp))


def _far_tail(tc, df, ncp) -> float:
    """P(T' < -tc) for T' ~ noncentral t(df, ncp >= 0) and tc > 0: the
    rejection region on the far side of the effect. scipy's nct.cdf
    returns NaN deep in this tail for large ncp (e.g. ncp 25-40 at df
    19-33), which used to turn the power into NaN and break solving for
    the effect size. The term is bounded by P(T' < 0) = Phi(-ncp)
    (T' < 0 exactly when Z < -ncp), so where that bound is below 1e-15
    the term is 0 to double precision."""
    v = float(stats.nct.cdf(-tc, df, ncp))
    if math.isfinite(v):
        return v
    if float(stats.norm.cdf(-ncp)) < 1e-15:
        return 0.0
    raise ValueError("noncentral t tail probability could not be computed")


def f_power(lam, df1, df2, alpha=0.05) -> float:
    fc = stats.f.isf(alpha, df1, df2)
    return float(stats.ncf.sf(fc, df1, df2, lam)) if lam > 0 else alpha


def chi2_power(lam, df, alpha=0.05) -> float:
    cc = stats.chi2.isf(alpha, df)
    return float(stats.ncx2.sf(cc, df, lam)) if lam > 0 else alpha


def z_power(mu, alpha=0.05, tails=2, sd1=1.0) -> float:
    """Power of a z test whose statistic is N(mu, sd1^2) under H1."""
    mu = abs(mu)
    if tails == 2:
        zc = stats.norm.isf(alpha / 2)
        return float(stats.norm.sf((zc - mu) / sd1)
                     + stats.norm.cdf((-zc - mu) / sd1))
    zc = stats.norm.isf(alpha)
    return float(stats.norm.sf((zc - mu) / sd1))


def _z_crit(alpha, tails):
    return float(stats.norm.isf(alpha / tails))


# ---------------------------------------------------------- solvers

def _smallest_n(power_of, target, n_min, monotone=True, n_max=N_MAX,
                start=None):
    """Smallest integer n >= n_min with power_of(n) >= target. Monotone
    power: bracketing and bisection. Discrete tests (power zig-zags): a
    scan upward from n_min (G*Power's rule: the lowest n whose power is
    not below the target)."""
    if not monotone:
        n = max(n_min, int(start) if start else n_min)
        while n <= n_max:
            if power_of(n) >= target:
                return n
            n += 1
        raise ValueError("no sample size up to the search limit reaches "
                         "the target power")
    lo = n_min
    if power_of(lo) >= target:
        return lo
    hi = max(lo + 1, 2 * lo)
    while power_of(hi) < target:
        lo = hi
        hi *= 2
        if hi > n_max:
            raise ValueError("no sample size up to the search limit "
                             "reaches the target power")
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if power_of(mid) >= target:
            hi = mid
        else:
            lo = mid
    return hi


def _continuous_n(power_of, target, n_lo, n_int):
    """Real-valued n with power_of(n) = target (as R's power.t.test
    reports), bracketed below the integer answer."""
    try:
        f = lambda n: power_of(n) - target
        if f(n_lo) >= 0:
            return float(n_lo)
        return float(optimize.brentq(f, n_lo, n_int + 1e-9, xtol=1e-10))
    except (ValueError, RuntimeError):
        return None


def _solve_effect(power_of_effect, target, lo, hi):
    f = lambda e: power_of_effect(e) - target
    if f(hi) < 0:
        raise ValueError("no effect size in the search range reaches the "
                         "target power with this sample size")
    if f(lo) >= 0:
        return lo
    return float(optimize.brentq(f, lo, hi, xtol=1e-12, rtol=1e-10))


def _check(alpha, power, tails, solve):
    if solve not in SOLVE:
        raise ValueError(f"solve must be one of {SOLVE}")
    if not 0 < alpha < 1:
        raise ValueError("alpha must be between 0 and 1")
    if tails not in (1, 2):
        raise ValueError("tails must be 1 or 2")
    if solve in ("n", "effect") and not (power is not None and
                                         0 < power < 1):
        raise ValueError("power must be between 0 and 1")


def _need(value, name):
    if value is None:
        raise ValueError(f"{name} is required")
    return value


# ------------------------------------------------------------- t tests

def _d_of(p):
    if p.get("d") is not None:
        return float(p["d"])
    if p.get("delta") is not None and p.get("sd"):
        return float(p["delta"]) / float(p["sd"])
    return None


def t_test_one(solve="n", *, d=None, n=None, alpha=0.05, power=None,
               tails=2, design="one_sample", delta=None, sd=None,
               sd_a=None, sd_b=None, r=None) -> dict:
    """One-sample or paired (design="paired") t test. Effect: d (paired:
    d_z), or delta / sd, or for paired designs delta with sd_a, sd_b and
    the correlation r: d_z = delta / sqrt(sd_a^2 + sd_b^2 - 2 r sd_a
    sd_b) (G*Power manual sec. 19.1). n = number of subjects (pairs)."""
    _check(alpha, power, tails, solve)
    if d is None:
        if design == "paired" and delta is not None and sd_a and sd_b \
                and r is not None:
            d = delta / math.sqrt(sd_a ** 2 + sd_b ** 2 - 2 * r * sd_a * sd_b)
        else:
            d = _d_of({"delta": delta, "sd": sd})
    pw = lambda nn, dd: t_power(dd * math.sqrt(nn), nn - 1, alpha, tails)
    out = {"kind": "t_paired" if design == "paired" else "t_one_sample",
           "solve": solve, "alpha": alpha, "tails": tails,
           "effect": {"name": "d_z" if design == "paired" else "d"}}
    if solve == "n":
        d = _need(d, "d")
        nn = _smallest_n(lambda k: pw(k, d), power, 2)
        out["n_exact"] = _continuous_n(lambda k: pw(k, d), power, 2.0, nn)
        out["target_power"] = power
    elif solve == "power":
        nn = int(_need(n, "n"))
        d = _need(d, "d")
    else:
        nn = int(_need(n, "n"))
        d = _solve_effect(lambda e: pw(nn, e), power, 1e-8, 1e3)
    out["effect"]["value"] = d
    out.update({"n": nn, "n_total": nn, "power": pw(nn, d), "df": nn - 1,
                "ncp": d * math.sqrt(nn),
                "critical_t": float(stats.t.isf(alpha / tails, nn - 1))})
    return out


def t_test_two(solve="n", *, d=None, n1=None, n2=None, ratio=1.0,
               alpha=0.05, power=None, tails=2, welch=False, delta=None,
               sd=None, sd1=None, sd2=None) -> dict:
    """Two independent groups. Effect: d, or delta / sd; with welch=True
    give delta, sd1 and sd2 (population SDs). ratio = n2 / n1; a priori
    n1 is searched with n2 = ceil(ratio n1)."""
    _check(alpha, power, tails, solve)
    if welch:
        if sd1 is None or sd2 is None:
            if d is None:
                raise ValueError("Welch power needs delta, sd1 and sd2")
            sd1 = sd2 = 1.0
            delta = d
        delta = _need(delta if delta is not None else d, "delta")
        d_equiv = delta / math.sqrt((sd1 ** 2 + sd2 ** 2) / 2)
    else:
        if d is None:
            d = _d_of({"delta": delta, "sd": sd})

    def stats_for(a, b, eff):
        if welch:
            v1, v2 = sd1 ** 2 / a, sd2 ** 2 / b
            se = math.sqrt(v1 + v2)
            df = (v1 + v2) ** 2 / (v1 ** 2 / (a - 1) + v2 ** 2 / (b - 1))
            return eff / se, df
        return eff * math.sqrt(a * b / (a + b)), a + b - 2

    def pw(a, b, eff):
        ncp, df = stats_for(a, b, eff)
        return t_power(ncp, df, alpha, tails)

    eff = delta if welch else d
    out = {"kind": "t_two_sample", "solve": solve, "alpha": alpha,
           "tails": tails, "welch": bool(welch), "ratio": ratio}
    if solve == "n":
        eff = _need(eff, "d")
        a = _smallest_n(lambda k: pw(k, max(2, math.ceil(ratio * k - 1e-9)),
                                     eff), power, 2)
        b = max(2, math.ceil(ratio * a - 1e-9))
        out["n1_exact"] = _continuous_n(
            lambda k: pw(k, max(ratio * k, 1.0 + 1e-9), eff), power, 2.0, a)
        out["target_power"] = power
    else:
        a = int(_need(n1, "n1"))
        b = int(n2 if n2 is not None else math.ceil(ratio * a - 1e-9))
        if solve == "effect":
            eff = _solve_effect(lambda e: pw(a, b, e), power, 1e-8, 1e3)
        else:
            eff = _need(eff, "d")
    ncp, df = stats_for(a, b, eff)
    out.update({
        "n1": a, "n2": b, "n_per_group": [a, b], "n_total": a + b,
        "power": t_power(ncp, df, alpha, tails), "df": df, "ncp": ncp,
        "critical_t": float(stats.t.isf(alpha / tails, df)),
        "effect": ({"name": "delta", "value": eff, "sd1": sd1, "sd2": sd2,
                    "d_average_sd": eff / math.sqrt((sd1 ** 2 + sd2 ** 2) / 2)}
                   if welch else {"name": "d", "value": eff}),
    })
    return out


# --------------------------------------------------------------- ANOVA

def _f_of(f=None, eta2=None, means=None, sd=None, ns=None):
    if f is not None:
        return float(f)
    if eta2 is not None:
        return math.sqrt(eta2 / (1 - eta2))
    if means is not None and sd:
        m = np.asarray(means, float)
        w = (np.asarray(ns, float) / np.sum(ns) if ns is not None
             else np.full(m.size, 1.0 / m.size))
        mu = float(np.sum(w * m))
        return math.sqrt(float(np.sum(w * (m - mu) ** 2))) / sd
    return None


def anova_oneway(solve="n", *, f=None, k=None, n=None, n_total=None,
                 alpha=0.05, power=None, eta2=None, means=None, sd=None,
                 equal_n=True) -> dict:
    """One-way ANOVA with k groups. Effect: Cohen's f, eta^2, or the
    group means with the common SD (G*Power sec. 10.1). n = per-group n
    (equal_n) or n_total."""
    _check(alpha, power, 2, solve)
    k = int(_need(k if k is not None else (len(means) if means else None),
                  "k"))
    f = _f_of(f, eta2, means, sd)
    pw = lambda N, ff: f_power(ff * ff * N, k - 1, N - k, alpha)
    out = {"kind": "anova_oneway", "solve": solve, "alpha": alpha,
           "tails": None, "k": k, "equal_n": bool(equal_n)}
    if solve == "n":
        f = _need(f, "f")
        if equal_n:
            per = _smallest_n(lambda m: pw(m * k, f), power, 2)
            N = per * k
        else:
            N = _smallest_n(lambda m: pw(m, f), power, k + 1)
        out["n_total_exact"] = _continuous_n(lambda m: pw(m, f), power,
                                             k + 1.0, N)
        out["target_power"] = power
    else:
        N = int(n_total if n_total is not None else _need(n, "n") * k)
        if solve == "effect":
            f = _solve_effect(lambda e: pw(N, e), power, 1e-8, 1e2)
        else:
            f = _need(f, "f")
    out.update({
        "n_total": N, "n_per_group": [N // k] * k if N % k == 0 else None,
        "power": pw(N, f), "df1": k - 1, "df2": N - k, "ncp": f * f * N,
        "critical_f": float(stats.f.isf(alpha, k - 1, N - k)),
        "effect": {"name": "f", "value": f, "eta_squared": f * f / (1 + f * f)},
    })
    return out


def f_test(solve="n", *, f=None, df1=None, groups=None, n_total=None,
           alpha=0.05, power=None, eta2=None) -> dict:
    """Fixed-effects F test for a main effect, interaction or contrast
    (G*Power ch. 11): lambda = f^2 N, df = (df1, N - groups)."""
    _check(alpha, power, 2, solve)
    df1 = int(_need(df1, "df1"))
    groups = int(_need(groups, "groups"))
    f = _f_of(f, eta2)
    pw = lambda N, ff: f_power(ff * ff * N, df1, N - groups, alpha)
    out = {"kind": "f_test", "solve": solve, "alpha": alpha, "tails": None,
           "groups": groups}
    if solve == "n":
        f = _need(f, "f")
        N = _smallest_n(lambda m: pw(m, f), power, groups + 1)
        out["target_power"] = power
    else:
        N = int(_need(n_total, "n_total"))
        f = (_solve_effect(lambda e: pw(N, e), power, 1e-8, 1e2)
             if solve == "effect" else _need(f, "f"))
    out.update({"n_total": N, "power": pw(N, f), "df1": df1,
                "df2": N - groups, "ncp": f * f * N,
                "critical_f": float(stats.f.isf(alpha, df1, N - groups)),
                "effect": {"name": "f", "value": f,
                           "eta_squared": f * f / (1 + f * f)}})
    return out


# ---------------------------------------------------------- proportions

def _fisher_power(n1, n2, p1, p2, alpha, tails):
    """Unconditional power of Fisher's exact test (exact enumeration)."""
    N = n1 + n2
    b1 = stats.binom.pmf(np.arange(n1 + 1), n1, p1)
    b2 = stats.binom.pmf(np.arange(n2 + 1), n2, p2)
    total = 0.0
    for m in range(N + 1):
        lo, hi = max(0, m - n2), min(n1, m)
        xs = np.arange(lo, hi + 1)
        f0 = stats.hypergeom.pmf(xs, N, n1, m)
        if tails == 2:
            order = np.argsort(f0, kind="mergesort")
            srt = f0[order]
            cs = np.cumsum(srt)
            idx = np.searchsorted(srt, f0 * (1 + 1e-7), side="right")
            pvals = cs[idx - 1]
        elif p1 >= p2:   # one-sided: large x1
            pvals = np.cumsum(f0[::-1])[::-1]
        else:
            pvals = np.cumsum(f0)
        rej = pvals <= alpha * (1 + 1e-12)
        if rej.any():
            total += float(np.sum(b1[xs[rej]] * b2[m - xs[rej]]))
    return min(total, 1.0)


def two_proportions(solve="n", *, p1=None, p2=None, n1=None, n2=None,
                    ratio=1.0, alpha=0.05, power=None, tails=2,
                    method="z") -> dict:
    """Two independent proportions. method: "z" (pooled-variance normal
    approximation; Fleiss), "z_cc" (with the Fleiss-Tytun-Ury continuity
    correction), "arcsine" (Cohen's h, both tails), "fisher_exact"
    (exact enumeration). ratio = n2 / n1. Sensitivity solves for p2
    given p1 (p2 above p1 unless p2 is given below it)."""
    _check(alpha, power, tails, solve)
    p1 = float(_need(p1, "p1"))
    if method not in ("z", "z_cc", "arcsine", "fisher_exact"):
        raise ValueError(f"unknown method: {method}")
    zc = _z_crit(alpha, tails)

    def z_pow(a, b, q2):
        delta = abs(p1 - q2)
        pbar = (a * p1 + b * q2) / (a + b)
        se0 = math.sqrt(pbar * (1 - pbar) * (1 / a + 1 / b))
        se1 = math.sqrt(p1 * (1 - p1) / a + q2 * (1 - q2) / b)
        if se1 == 0:
            return 1.0 if delta > 0 else alpha
        return float(stats.norm.cdf((delta - zc * se0) / se1))

    def pw(a, b, q2):
        if method == "z":
            return z_pow(a, b, q2)
        if method == "z_cc":
            delta = abs(p1 - q2)
            if delta == 0:
                return alpha
            r = b / a
            c = (r + 1) / (2 * r * delta)
            if a <= c:
                return 0.0
            a_eq = (a - c) ** 2 / a
            return z_pow(a_eq, r * a_eq, q2)
        if method == "arcsine":
            h = 2 * math.asin(math.sqrt(p1)) - 2 * math.asin(math.sqrt(q2))
            return z_power(h * math.sqrt(a * b / (a + b)), alpha, tails)
        return _fisher_power(int(a), int(b), p1, q2, alpha, tails)

    def b_of(a):
        return max(1, math.ceil(ratio * a - 1e-9))

    out = {"kind": "two_proportions", "solve": solve, "alpha": alpha,
           "tails": tails, "method": method, "ratio": ratio}
    discrete = method == "fisher_exact"
    if solve == "n":
        q2 = float(_need(p2, "p2"))
        if q2 == p1:
            raise ValueError("p1 and p2 must differ")
        start = None
        if discrete:
            guess = two_proportions("n", p1=p1, p2=q2, ratio=ratio,
                                    alpha=alpha, power=power, tails=tails,
                                    method="z_cc")["n1"]
            start = max(2, int(guess * 0.5))
            if guess > 2000:
                raise ValueError("Fisher's exact power is enumerated up to "
                                 "about 2000 per group; use method z_cc")
        a = _smallest_n(lambda k: pw(k, b_of(k), q2), power, 2,
                        monotone=not discrete, start=start)
        b = b_of(a)
        if not discrete:
            out["n1_exact"] = _continuous_n(
                lambda k: pw(k, ratio * k, q2), power, 2.0, a)
        out["target_power"] = power
    else:
        a = int(_need(n1, "n1"))
        b = int(n2 if n2 is not None else b_of(a))
        if solve == "effect":
            up = p2 is None or p2 > p1
            lo, hi = (p1 + 1e-9, 1 - 1e-9) if up else (1e-9, p1 - 1e-9)
            f = lambda q: pw(a, b, q) - power
            ends = (lo, hi) if up else (hi, lo)
            if f(ends[1]) < 0:
                raise ValueError("no proportion reaches the target power "
                                 "with this sample size")
            q2 = float(optimize.brentq(f, *sorted(ends), xtol=1e-12))
        else:
            q2 = float(_need(p2, "p2"))
    h = 2 * math.asin(math.sqrt(p1)) - 2 * math.asin(math.sqrt(q2))
    out.update({"n1": a, "n2": b, "n_per_group": [a, b], "n_total": a + b,
                "power": pw(a, b, q2),
                "effect": {"name": "p2", "value": q2, "p1": p1,
                           "difference": q2 - p1, "cohens_h": h,
                           "odds_ratio": ((q2 / (1 - q2)) / (p1 / (1 - p1))
                                          if 0 < q2 < 1 and 0 < p1 < 1
                                          else None),
                           "relative_risk": q2 / p1 if p1 > 0 else None}})
    return out


def _binom_power(n, p0, p1, alpha, tails, balance="equal"):
    """Exact binomial test of p = p0 for x ~ Bin(n, .): power under p1 and
    the attained alpha, with G*Power's alpha balancing for two tails."""
    if n <= 0:
        return 0.0, 0.0, None, None
    x = np.arange(n + 1)
    f0, f1 = stats.binom.pmf(x, n, p0), stats.binom.pmf(x, n, p1)
    cdf0, cdf1 = np.cumsum(f0), np.cumsum(f1)
    sf0 = np.cumsum(f0[::-1])[::-1]
    sf1 = np.cumsum(f1[::-1])[::-1]
    eps = 1e-12

    def lower(a):    # largest c with P0(X <= c) <= a
        idx = np.nonzero(cdf0 <= a + eps)[0]
        return int(idx[-1]) if idx.size else None

    def upper(a):    # smallest c with P0(X >= c) <= a
        idx = np.nonzero(sf0 <= a + eps)[0]
        return int(idx[0]) if idx.size else None

    cl = cu = None
    if tails == 1:
        if p1 < p0:
            cl = lower(alpha)
        else:
            cu = upper(alpha)
    elif balance == "minor_tail":
        if p1 < p0:          # H1 below: the upper tail is the minor one
            cu = upper(alpha / 2)
            cl = lower(alpha - (sf0[cu] if cu is not None else 0.0))
        else:
            cl = lower(alpha / 2)
            cu = upper(alpha - (cdf0[cl] if cl is not None else 0.0))
    else:
        cl, cu = lower(alpha / 2), upper(alpha / 2)
    pw = (cdf1[cl] if cl is not None else 0.0) + \
        (sf1[cu] if cu is not None else 0.0)
    size = (cdf0[cl] if cl is not None else 0.0) + \
        (sf0[cu] if cu is not None else 0.0)
    return float(pw), float(size), cl, cu


def one_proportion(solve="n", *, p0=None, p=None, n=None, alpha=0.05,
                   power=None, tails=2, method="exact",
                   balance="equal") -> dict:
    """One proportion vs a constant p0 (G*Power ch. 4): exact binomial
    test (method "exact"; tails = 2 balances alpha with "equal" = alpha/2
    per tail or "minor_tail") or the normal approximation ("z")."""
    _check(alpha, power, tails, solve)
    p0 = float(_need(p0, "p0"))

    def pw(nn, q):
        if method == "exact":
            return _binom_power(int(nn), p0, q, alpha, tails, balance)[0]
        mu = math.sqrt(nn) * (q - p0)
        s0, s1 = math.sqrt(p0 * (1 - p0)), math.sqrt(q * (1 - q))
        zc = _z_crit(alpha, tails)
        up = float(stats.norm.sf((zc * s0 - mu) / s1))
        down = float(stats.norm.cdf((-zc * s0 - mu) / s1))
        if tails == 1:
            return up if q >= p0 else down
        return up + down

    out = {"kind": "one_proportion", "solve": solve, "alpha": alpha,
           "tails": tails, "method": method}
    if method == "exact":
        out["balance"] = balance
    if solve == "n":
        q = float(_need(p, "p"))
        nn = _smallest_n(lambda k: pw(k, q), power, 1,
                         monotone=method != "exact")
        out["target_power"] = power
    else:
        nn = int(_need(n, "n"))
        if solve == "effect":
            up = p is None or p > p0
            lo, hi = (p0 + 1e-9, 1 - 1e-9) if up else (1e-9, p0 - 1e-9)
            q = float(optimize.brentq(lambda v: pw(nn, v) - power, lo, hi,
                                      xtol=1e-12))
        else:
            q = float(_need(p, "p"))
    out.update({"n": nn, "n_total": nn, "power": pw(nn, q),
                "effect": {"name": "p", "value": q, "p0": p0,
                           "g": q - p0}})
    if method == "exact":
        _, size, cl, cu = _binom_power(nn, p0, q, alpha, tails, balance)
        out.update({"actual_alpha": size, "lower_critical": cl,
                    "upper_critical": cu})
    return out


def mcnemar(solve="n", *, p12=None, p21=None, odds_ratio=None,
            p_discordant=None, n=None, alpha=0.05, power=None, tails=2,
            method="exact", balance="equal") -> dict:
    """McNemar test of paired proportions. Effect: the discordant cell
    probabilities p12 and p21, or the odds ratio p12/p21 with the
    proportion of discordant pairs p_D = p12 + p21 (G*Power ch. 5).
    method "exact" (unconditional power of the exact conditional test)
    or "connor" (Connor 1987 normal approximation). n = pairs."""
    _check(alpha, power, tails, solve)
    if odds_ratio is None and p12 is not None and p21 is not None:
        odds_ratio, p_discordant = p12 / p21, p12 + p21
    pd_ = float(_need(p_discordant, "p_discordant"))

    def cells(orr):
        q12 = pd_ * orr / (1 + orr)
        return q12, pd_ - q12

    def pw(nn, orr, want_size=False):
        q12, q21 = cells(orr)
        if method == "connor":
            delta = abs(q12 - q21)
            zc = _z_crit(alpha, tails)
            v = pd_ - delta ** 2
            pwr = float(stats.norm.cdf((delta * math.sqrt(nn)
                                        - zc * math.sqrt(pd_)) / math.sqrt(v)))
            return (pwr, None) if want_size else pwr
        q = q12 / pd_
        weights = stats.binom.pmf(np.arange(int(nn) + 1), int(nn), pd_)
        total = size = 0.0
        for i in range(1, int(nn) + 1):
            if weights[i] < 1e-16:
                continue
            pi, si, _, _ = _binom_power(i, 0.5, q, alpha, tails, balance)
            total += weights[i] * pi
            size += weights[i] * si
        total, size = float(min(total, 1.0)), float(size)
        return (total, size) if want_size else total

    out = {"kind": "mcnemar", "solve": solve, "alpha": alpha,
           "tails": tails, "method": method}
    if method == "exact":
        out["balance"] = balance
    if solve == "n":
        orr = float(_need(odds_ratio, "odds_ratio"))
        start = None
        if method == "exact":
            approx = mcnemar("n", odds_ratio=orr, p_discordant=pd_,
                             alpha=alpha, power=power, tails=tails,
                             method="connor")["n"]
            start = max(1, int(approx * 0.6))
        nn = _smallest_n(lambda k: pw(k, orr), power, 1,
                         monotone=method != "exact", start=start)
        out["target_power"] = power
    else:
        nn = int(_need(n, "n"))
        if solve == "effect":
            below = odds_ratio is not None and odds_ratio < 1
            f = lambda lo: pw(nn, math.exp(lo)) - power
            rng = (-12.0, -1e-6) if below else (1e-6, 12.0)
            orr = math.exp(optimize.brentq(f, *rng, xtol=1e-10))
        else:
            orr = float(_need(odds_ratio, "odds_ratio"))
    pwr, size = pw(nn, orr, want_size=True)
    q12, q21 = cells(orr)
    out.update({"n": nn, "n_total": nn, "power": pwr, "actual_alpha": size,
                "effect": {"name": "odds_ratio", "value": orr,
                           "p_discordant": pd_, "p12": q12, "p21": q21}})
    return out


# ------------------------------------------------------------ correlation

def _r_logpdf(r, rho, n):
    """log density of the sample correlation of n bivariate normal pairs
    with population correlation rho (Hotelling 1953)."""
    return (math.log(n - 2) + special.gammaln(n - 1)
            + (n - 1) / 2 * math.log1p(-rho * rho)
            + (n - 4) / 2 * np.log1p(-r * r)
            - 0.5 * math.log(2 * math.pi) - special.gammaln(n - 0.5)
            - (n - 1.5) * np.log1p(-rho * r)
            + np.log(special.hyp2f1(0.5, 0.5, n - 0.5, (1 + rho * r) / 2)))


def r_cdf(x, rho, n) -> float:
    """P(r <= x) for the sample correlation, integrated in z = atanh r."""
    if x <= -1:
        return 0.0
    if x >= 1:
        return 1.0
    zx = math.atanh(x)
    mu, sd = math.atanh(rho), 1 / math.sqrt(max(n - 3, 1))
    a = mu - 40 * sd

    def dens(z):
        r = math.tanh(z)
        return math.exp(_r_logpdf(r, rho, n)) * (1 - r * r)

    if zx <= a:
        return 0.0
    pts = [p for p in (mu - 4 * sd, mu, mu + 4 * sd) if a < p < zx]
    val, _ = integrate.quad(dens, a, zx, points=pts or None, limit=200,
                            epsabs=1e-13, epsrel=1e-11)
    return float(min(max(val, 0.0), 1.0))


def _r_quantile(q, rho, n):
    mu, sd = math.atanh(rho), 1 / math.sqrt(max(n - 3, 1))
    f = lambda z: r_cdf(math.tanh(z), rho, n) - q
    lo, hi = mu - 12 * sd, mu + 12 * sd
    return math.tanh(optimize.brentq(f, lo, hi, xtol=1e-13))


def correlation(solve="n", *, rho=None, rho0=0.0, n=None, alpha=0.05,
                power=None, tails=2, method="exact") -> dict:
    """Test of a Pearson correlation against rho0 (G*Power chs. 3, 16).
    method "exact" (distribution of r), "fisher_z" (large-sample
    approximation) or "t" (rho0 = 0 only: t test, point-biserial
    model)."""
    _check(alpha, power, tails, solve)
    if method == "t" and rho0 != 0:
        raise ValueError("the t method tests rho = 0 only")

    def pw(nn, rr, detail=False):
        if method == "fisher_z":
            mu = (math.atanh(rr) - math.atanh(rho0)) * math.sqrt(nn - 3)
            p = z_power(mu, alpha, tails)
            return (p, None) if detail else p
        if method == "t":
            ncp = math.sqrt(rr * rr * nn / (1 - rr * rr))
            p = t_power(ncp, nn - 2, alpha, tails)
            return (p, None) if detail else p
        lo = hi = None
        if tails == 2:
            lo = _r_quantile(alpha / 2, rho0, nn)
            hi = _r_quantile(1 - alpha / 2, rho0, nn)
        elif rr < rho0:
            lo = _r_quantile(alpha, rho0, nn)
        else:
            hi = _r_quantile(1 - alpha, rho0, nn)
        p = ((r_cdf(lo, rr, nn) if lo is not None else 0.0)
             + (1 - r_cdf(hi, rr, nn) if hi is not None else 0.0))
        return (p, (lo, hi)) if detail else p

    out = {"kind": "correlation", "solve": solve, "alpha": alpha,
           "tails": tails, "method": method, "rho0": rho0}
    n_min = 4 if method != "t" else 3
    if solve == "n":
        rr = float(_need(rho, "rho"))
        if method == "exact":
            approx = correlation("n", rho=rr, rho0=rho0, alpha=alpha,
                                 power=power, tails=tails,
                                 method="fisher_z")["n"]
            lo = max(n_min, int(approx * 0.7) - 2)
            if pw(lo, rr) >= power:
                lo = n_min
            hi = max(lo + 1, int(approx * 1.3) + 5)
            while pw(hi, rr) < power:
                lo, hi = hi, hi * 2
            while hi - lo > 1:
                mid = (lo + hi) // 2
                if pw(mid, rr) >= power:
                    hi = mid
                else:
                    lo = mid
            nn = hi
        else:
            nn = _smallest_n(lambda k: pw(k, rr), power, n_min)
        out["target_power"] = power
    else:
        nn = int(_need(n, "n"))
        if solve == "effect":
            below = rho is not None and rho < rho0
            lo, hi = ((-1 + 1e-9, rho0 - 1e-7) if below
                      else (rho0 + 1e-7, 1 - 1e-9))
            rr = float(optimize.brentq(lambda v: pw(nn, v) - power, lo, hi,
                                       xtol=1e-10))
        else:
            rr = float(_need(rho, "rho"))
    p, crit = pw(nn, rr, detail=True)
    out.update({"n": nn, "n_total": nn, "power": p,
                "effect": {"name": "rho", "value": rr, "rho0": rho0}})
    if crit:
        out["critical_r"] = list(crit)
    return out


# ------------------------------------------------------------- survival

def event_probability(hazard, accrual=0.0, followup=0.0,
                      approach="exponential") -> float:
    """P(event observed) for exponential survival with uniform accrual
    over [0, accrual] and further follow-up; approach "simpson" uses
    Schoenfeld's (1983) Simpson-rule approximation."""
    s = lambda t: math.exp(-hazard * t)
    if approach == "simpson":
        return 1 - (s(followup) + 4 * s(followup + accrual / 2)
                    + s(followup + accrual)) / 6
    if accrual <= 0:
        return 1 - s(followup)
    return 1 - (s(followup) - s(followup + accrual)) / (hazard * accrual)


def logrank(solve="n", *, hr=None, n=None, events=None, ratio=1.0,
            alpha=0.05, power=None, tails=2, method="schoenfeld",
            p_event=None, median_control=None, hazard_control=None,
            accrual=0.0, followup=None, approach="exponential") -> dict:
    """Log-rank test comparing group 2 (hazard ratio hr vs group 1) with
    group 1; ratio = n2 / n1. Required events (Schoenfeld or Freedman)
    and subjects, via p_event or exponential survival (median_control
    or hazard_control, accrual, followup)."""
    _check(alpha, power, tails, solve)
    if method not in ("schoenfeld", "freedman"):
        raise ValueError(f"unknown method: {method}")
    p1, p2 = 1 / (1 + ratio), ratio / (1 + ratio)
    zc = _z_crit(alpha, tails)
    lam = (hazard_control if hazard_control is not None else
           (math.log(2) / median_control if median_control else None))

    def prob_event(h):
        if p_event is not None:
            return float(p_event)
        if lam is None or followup is None:
            return None
        pc = event_probability(lam, accrual, followup, approach)
        pt = event_probability(lam * h, accrual, followup, approach)
        return p1 * pc + p2 * pt

    def z_of(d, h):
        if method == "schoenfeld":
            return math.sqrt(d * p1 * p2) * abs(math.log(h))
        return math.sqrt(d * ratio) * abs(1 - h) / (1 + ratio * h)

    def events_needed(h, target):
        zb = float(stats.norm.ppf(target))
        if method == "schoenfeld":
            return (zc + zb) ** 2 / (p1 * p2 * math.log(h) ** 2)
        return (zc + zb) ** 2 * (1 + ratio * h) ** 2 / (ratio * (1 - h) ** 2)

    out = {"kind": "logrank", "solve": solve, "alpha": alpha, "tails": tails,
           "method": method, "ratio": ratio}
    if solve == "n":
        h = float(_need(hr, "hr"))
        d_exact = events_needed(h, power)
        d = math.ceil(d_exact - 1e-9)
        pe = prob_event(h)
        out.update({"events_exact": d_exact, "target_power": power})
        if pe:
            n_exact = d_exact / pe
            n1 = math.ceil(n_exact * p1 - 1e-9)
            n2 = math.ceil(n1 * ratio - 1e-9)
            out.update({"n_exact": n_exact, "n1": n1, "n2": n2,
                        "n_per_group": [n1, n2], "n_total": n1 + n2})
    else:
        if events is None and n is not None:
            nn = int(n)
            ev = lambda h: nn * _need(prob_event(h), "p_event or survival "
                                      "inputs")
        else:
            d0 = float(_need(events, "events or n"))
            ev = lambda h: d0
        if solve == "effect":
            increase = hr is not None and hr > 1
            f = lambda lh: (stats.norm.cdf(z_of(ev(math.exp(lh)),
                                                math.exp(lh)) - zc) - power)
            rng = (1e-9, 12.0) if increase else (-12.0, -1e-9)
            h = math.exp(optimize.brentq(f, *rng, xtol=1e-12))
        else:
            h = float(_need(hr, "hr"))
        d = ev(h)
        if n is not None:
            out.update({"n_total": int(n)})
    pe = prob_event(h)
    out.update({
        "events": d, "p_event": pe,
        "power": float(stats.norm.cdf(z_of(d, h) - zc)),
        "effect": {"name": "hazard_ratio", "value": h},
    })
    if lam is not None:
        out["hazard_control"] = lam
        out["median_control"] = math.log(2) / lam
    return out


# ----------------------------------------------------------- chi-square

def chi_square(solve="n", *, w=None, df=None, n=None, alpha=0.05,
               power=None, p0=None, p1=None) -> dict:
    """Chi-square goodness-of-fit or contingency test: lambda = w^2 N.
    Effect: Cohen's w, or the proportions under H0 (p0) and H1 (p1)."""
    _check(alpha, power, 2, solve)
    if w is None and p0 is not None and p1 is not None:
        a, b = np.asarray(p0, float), np.asarray(p1, float)
        a, b = a / a.sum(), b / b.sum()
        w = float(math.sqrt(np.sum((b - a) ** 2 / a)))
        df = df if df is not None else a.size - 1
    df = int(_need(df, "df"))
    pw = lambda N, ww: chi2_power(ww * ww * N, df, alpha)
    out = {"kind": "chi_square", "solve": solve, "alpha": alpha,
           "tails": None, "df": df}
    if solve == "n":
        w = float(_need(w, "w"))
        N = _smallest_n(lambda k: pw(k, w), power, 1)
        out["n_exact"] = _continuous_n(lambda k: pw(k, w), power, 1.0, N)
        out["target_power"] = power
    else:
        N = int(_need(n, "n"))
        w = (_solve_effect(lambda e: pw(N, e), power, 1e-8, 1e2)
             if solve == "effect" else float(_need(w, "w")))
    out.update({"n": N, "n_total": N, "power": pw(N, w), "ncp": w * w * N,
                "critical_chi2": float(stats.chi2.isf(alpha, df)),
                "effect": {"name": "w", "value": w}})
    return out


# -------------------------------------------------------------- generic

def generic(*, distribution="t", ncp=None, df=None, df1=None, df2=None,
            alpha=0.05, tails=2) -> dict:
    """Power for a given noncentrality: distribution "t" (ncp, df,
    tails), "f" (ncp = lambda, df1, df2) or "chi2" (ncp = lambda, df)."""
    ncp = float(_need(ncp, "ncp"))
    if distribution == "t":
        p = t_power(ncp, float(_need(df, "df")), alpha, tails)
    elif distribution == "f":
        p = f_power(ncp, float(_need(df1, "df1")), float(_need(df2, "df2")),
                    alpha)
    elif distribution == "chi2":
        p = chi2_power(ncp, float(_need(df, "df")), alpha)
    else:
        raise ValueError(f"unknown distribution: {distribution}")
    return {"kind": "generic", "solve": "power", "distribution": distribution,
            "alpha": alpha, "tails": tails if distribution == "t" else None,
            "ncp": ncp, "df": df, "df1": df1, "df2": df2, "power": p}


# ------------------------------------------------------------ dispatcher

KINDS = {
    "t_one_sample": lambda solve, **p: t_test_one(solve, design="one_sample",
                                                  **p),
    "t_paired": lambda solve, **p: t_test_one(solve, design="paired", **p),
    "t_two_sample": t_test_two,
    "anova_oneway": anova_oneway,
    "f_test": f_test,
    "two_proportions": two_proportions,
    "one_proportion": one_proportion,
    "mcnemar": mcnemar,
    "correlation": correlation,
    "logrank": logrank,
    "chi_square": chi_square,
}


def power_analysis(kind: str, solve: str = "n", **params) -> dict:
    """Dispatch to one design (see KINDS); "generic" ignores solve."""
    if kind == "generic":
        return generic(**params)
    if kind not in KINDS:
        raise ValueError(f"unknown power analysis kind: {kind}")
    return KINDS[kind](solve, **params)


# ------------------------------------------------------- randomisation

def randomization_list(n=None, groups=("A", "B"), *, ratio=None,
                       method: str = "block", block_sizes=None,
                       strata=None, seed=None, id_prefix: str = "",
                       start: int = 1) -> dict:
    """Allocation list for n units (or per stratum).

    method: "simple" (each unit drawn independently with probabilities
    proportional to ratio), "shuffled" (a random permutation of a list
    with the exact allocation ratio, the random allocation rule),
    "block" (permuted blocks; block_sizes, multiples of sum(ratio),
    chosen at random block by block when several are given; default one
    block of 2 x sum(ratio)) or "stratified" (permuted blocks within each
    stratum; strata = [{"name", "n"}]). The list is truncated to n units
    (the last block may be incomplete). seed: integer; when omitted one
    is drawn and reported so the same list can be regenerated."""
    groups = list(groups)
    ratio = [int(r) for r in (ratio or [1] * len(groups))]
    if len(ratio) != len(groups) or min(ratio) < 1:
        raise ValueError("ratio needs one positive integer per group")
    if seed is None:
        seed = int(np.random.SeedSequence().entropy % (2 ** 31 - 1))
    seed = int(seed)
    rng = np.random.default_rng(seed)
    unit = sum(ratio)
    base = [g for g, r in zip(groups, ratio) for _ in range(r)]
    if block_sizes is None:
        block_sizes = [2 * unit]
    block_sizes = [int(b) for b in block_sizes]
    if method in ("block", "stratified") and any(b % unit for b in
                                                 block_sizes):
        raise ValueError(f"block sizes must be multiples of {unit} "
                         "(the sum of the allocation ratio)")

    def blocks_for(count):
        seq, blocks = [], []
        b = 0
        while len(seq) < count:
            size = int(rng.choice(block_sizes))
            blk = list(rng.permutation(base * (size // unit)))
            seq += blk
            blocks += [b + 1] * size
            b += 1
        return seq[:count], blocks[:count]

    rows = []
    if method == "stratified":
        if not strata:
            raise ValueError("stratified randomisation needs strata")
        for s in strata:
            seq, blocks = blocks_for(int(s["n"]))
            rows += [{"stratum": s.get("name"), "block": bl, "group": str(g)}
                     for g, bl in zip(seq, blocks)]
    else:
        n = int(_need(n, "n"))
        if method == "simple":
            prob = np.asarray(ratio, float) / unit
            seq = [groups[i] for i in rng.choice(len(groups), size=n, p=prob)]
            rows = [{"group": str(g)} for g in seq]
        elif method == "shuffled":
            reps = math.ceil(n / unit)
            seq = list(rng.permutation(base * reps))[:n]
            rows = [{"group": str(g)} for g in seq]
        elif method == "block":
            seq, blocks = blocks_for(n)
            rows = [{"block": bl, "group": str(g)}
                    for g, bl in zip(seq, blocks)]
        else:
            raise ValueError(f"unknown method: {method}")
    for i, row in enumerate(rows):
        row["sequence"] = start + i
        row["id"] = f"{id_prefix}{start + i}"
    counts = {g: sum(1 for r in rows if r["group"] == g) for g in groups}
    out = {"method": method, "seed": seed, "groups": groups,
           "ratio": ratio, "n": len(rows), "list": rows, "counts": counts}
    if method in ("block", "stratified"):
        out["block_sizes"] = block_sizes
    if method == "stratified":
        out["counts_by_stratum"] = {
            s.get("name"): {g: sum(1 for r in rows if r["stratum"] ==
                                   s.get("name") and r["group"] == g)
                            for g in groups} for s in strata}
    return out


# --------------------------------------------------------- justification

_TEST_TEXT = {
    "t_two_sample": "a {tails} {welch}t test for two independent groups",
    "t_one_sample": "a {tails} one-sample t test",
    "t_paired": "a {tails} paired t test",
    "anova_oneway": "a one-way ANOVA (F test) across {k} groups",
    "f_test": "an F test with {df1} numerator degrees of freedom",
    "two_proportions": "a {tails} comparison of two proportions ({method})",
    "one_proportion": "a {tails} test of one proportion against "
                      "{p0:g} ({method})",
    "mcnemar": "a {tails} McNemar test ({method})",
    "correlation": "a {tails} test of the correlation against {rho0:g} "
                   "({method})",
    "logrank": "a {tails} log-rank test ({method} method)",
    "chi_square": "a chi-square test with {df} degrees of freedom",
}

_METHOD_TEXT = {
    "z": "normal approximation", "z_cc": "normal approximation with "
    "continuity correction", "arcsine": "arcsine transformation",
    "fisher_exact": "Fisher's exact test", "exact": "exact",
    "connor": "normal approximation", "fisher_z": "Fisher z approximation",
    "t": "t test", "schoenfeld": "Schoenfeld", "freedman": "Freedman",
}


def _effect_text(res):
    e = res.get("effect") or {}
    kind = res["kind"]
    v = e.get("value")
    if kind == "t_two_sample":
        if res.get("welch"):
            return (f"a difference between means of {v:.3g} with SDs "
                    f"{e['sd1']:.3g} and {e['sd2']:.3g}")
        return f"a standardized difference between means of d = {v:.2f}"
    if kind == "t_paired":
        return f"a standardized mean paired difference of d_z = {v:.2f}"
    if kind == "t_one_sample":
        return f"a standardized difference from the reference value of d = {v:.2f}"
    if kind in ("anova_oneway", "f_test"):
        return f"an effect of Cohen's f = {v:.2f}"
    if kind == "two_proportions":
        return f"proportions of {e['p1']:.3g} vs {v:.3g}"
    if kind == "one_proportion":
        return f"a proportion of {v:.3g}"
    if kind == "mcnemar":
        return (f"discordant-pair probabilities of {e['p12']:.3g} and "
                f"{e['p21']:.3g} (odds ratio {v:.3g})")
    if kind == "correlation":
        return f"a correlation of r = {v:.2f}"
    if kind == "logrank":
        return f"a hazard ratio of {v:.2f}"
    if kind == "chi_square":
        return f"an effect of Cohen's w = {v:.2f}"
    return "the specified effect"


def justification(result: dict, *, unit: str = "animals",
                  effect_source: str | None = None,
                  attrition: float | None = None,
                  software: str = "OpenDose") -> dict:
    """Sample-size justification text from a power result: the
    calculation (test, sidedness, alpha, power, effect size and its
    source) and, with attrition (a fraction), the inflated number to
    allocate. ARRIVE 2.0 Essential 10 item 2b; CONSORT 2010 item 7a."""
    kind = result["kind"]
    tails = {1: "one-sided", 2: "two-sided", None: ""}[result.get("tails")]
    fmt = dict(tails=tails, welch="Welch " if result.get("welch") else "",
               k=result.get("k"), df1=result.get("df1"),
               df=result.get("df"), p0=(result.get("effect") or {}).get(
                   "p0", 0.0) or 0.0,
               rho0=result.get("rho0", 0.0) or 0.0,
               method=_METHOD_TEXT.get(result.get("method"),
                                       result.get("method")))
    test = _TEST_TEXT.get(kind, "the planned test").format(**fmt)
    test = test.replace("  ", " ")
    alpha = result["alpha"]
    pw = result["power"]
    effect = _effect_text(result)
    groups = result.get("n_per_group")
    if kind == "logrank":
        if result.get("n_total"):
            size = (f"{result['events']:.0f} events, i.e. "
                    f"{result['n_total']} {unit}")
        else:
            size = f"{math.ceil(result['events'] - 1e-9)} events"
    elif groups and len(set(groups)) == 1:
        size = (f"{groups[0]} {unit} per group ({result['n_total']} in "
                "total)")
    elif groups:
        size = (f"{' and '.join(str(g) for g in groups)} {unit} per group "
                f"({result['n_total']} in total)")
    else:
        size = f"{result['n_total']} {unit}"
    if result["solve"] == "n":
        text = (f"A sample size of {size} was determined a priori to give "
                f"{100 * pw:.0f}% power (target "
                f"{100 * result['target_power']:.0f}%) to detect {effect} "
                f"with {test} at a significance level of {alpha:g}.")
    elif result["solve"] == "power":
        text = (f"With {size}, {test} at a significance level of {alpha:g} "
                f"has {100 * pw:.0f}% power to detect {effect}.")
    else:
        text = (f"With {size}, {test} at a significance level of {alpha:g} "
                f"has {100 * pw:.0f}% power to detect {effect} or larger "
                "(sensitivity analysis).")
    if effect_source:
        text += f" The effect size was based on {effect_source}."
    allocate = None
    if attrition:
        if not 0 <= attrition < 1:
            raise ValueError("attrition must be a fraction below 1")
        if groups:
            allocate = [math.ceil(g / (1 - attrition) - 1e-9) for g in groups]
            per = (str(allocate[0]) if len(set(allocate)) == 1
                   else " and ".join(str(a) for a in allocate))
            text += (f" Allowing for {100 * attrition:g}% attrition, "
                     f"{per} {unit} per group ({sum(allocate)} in total) "
                     "will be allocated.")
        elif result.get("n_total"):
            allocate = [math.ceil(result["n_total"] / (1 - attrition) - 1e-9)]
            text += (f" Allowing for {100 * attrition:g}% attrition, "
                     f"{allocate[0]} {unit} will be enrolled.")
    if software:
        text += f" Calculation performed with {software}."
    return {"text": text, "allocate": allocate}
