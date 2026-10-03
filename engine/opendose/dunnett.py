"""The Dunnett distribution: max |T_j| for a multivariate t whose
correlation matrix has the one-factor form R_ij = lambda_i * lambda_j.

Dunnett's test compares every group with one control; the GraphPad Prism
statistics guide's multiple-comparisons pages describe its P values and
simultaneous confidence intervals as coming from the multivariate t
distribution of the comparisons (all sharing the pooled SD and its df).

When the comparisons are "each mean minus the same control mean" and the
means are independent (one-way ANOVA) the correlation of comparison i
and j is

    rho_ij = lambda_i * lambda_j,  lambda_i = sqrt(n_i / (n_i + n_0)),

i.e. 1 / sqrt((1 + n_0/n_i)(1 + n_0/n_j)) (Dunnett 1955, J Am Stat Assoc
50:1096). Conditional on the control's standardized deviation z and on
the SD ratio s = sigma_hat / sigma (s^2 ~ chi^2_df / df) the comparisons
are independent, so

    P(max_j |T_j| > c) = E_s E_z [1 - prod_j (1 - q_j(z, s))],
    q_j = Phi((-c s - lambda_j z) / b_j) + Phi((lambda_j z - c s) / b_j),
    b_j = sqrt(1 - lambda_j^2).

Both expectations are evaluated by the trapezoidal rule on the whole
real line (z directly, s through u = log s), which converges
geometrically for these analytic, rapidly decaying integrands. The step
sizes are set from the integrands' Fourier decay so the discretisation
error is below about 1e-15; the result is deterministic (no random
numbers) and the tail is integrated directly, so small P values keep
their relative accuracy. Any other correlation structure falls back to
scipy's quasi-Monte Carlo multivariate t with a fixed random state.

Only numpy and scipy are used, so the module runs under Pyodide.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import optimize, special, stats

# Truncation: probability mass below exp(-46) (relative to the tail
# probability being computed) is dropped from the z and s ranges.
_LOG_TRUNC = 46.0
_QMC_SEED = 12345


def control_lambdas(ns, control_index: int = 0) -> np.ndarray:
    """lambda_i = sqrt(n_i / (n_i + n_0)) for every group i != control:
    the one-factor loadings of 'group minus control' comparisons of
    independent means sharing one residual variance."""
    n0 = float(ns[control_index])
    return np.array([math.sqrt(float(n) / (float(n) + n0))
                     for i, n in enumerate(ns) if i != control_index])


def product_lambdas(R) -> np.ndarray | None:
    """lambda with R_ij = lambda_i lambda_j (i != j) when the correlation
    matrix R has that one-factor form (always for comparisons with a
    common control when the means are independent or compound
    symmetric); None otherwise."""
    R = np.asarray(R, dtype=float)
    m = R.shape[0]
    if m == 1:
        return np.zeros(1)
    if m == 2:
        r = float(R[0, 1])
        lam = math.sqrt(abs(r))
        out = np.array([lam, math.copysign(lam, r)])
        return out if lam < 1 else None
    lam = np.zeros(m)
    for i in range(m):
        j, k = [x for x in range(m) if x != i][:2]
        if abs(R[j, k]) < 1e-12:
            return None
        v = R[i, j] * R[i, k] / R[j, k]
        if v < 0:
            return None
        lam[i] = math.sqrt(v)
    # fix signs relative to the first entry and verify the fit
    for i in range(1, m):
        lam[i] = math.copysign(abs(lam[i]), R[0, i] * lam[0])
    approx = np.outer(lam, lam)
    off = ~np.eye(m, dtype=bool)
    if np.max(np.abs(approx[off] - R[off])) > 1e-9 or np.any(np.abs(lam) >= 1):
        return None
    return lam


def _z_rule(lam, log_keep):
    """Nodes z >= 0 and weights of the trapezoidal rule for E_z[f(z)],
    f even, over |z| <= sqrt(2 log_keep). The integrand's Fourier
    transform decays like exp(-w^2 / (2 (1 + sum alpha_j^2))),
    alpha_j = lambda_j / b_j, so the aliasing error at w = 2 pi / h is
    below exp(-40) for this h."""
    alpha2 = float(np.sum(lam * lam / (1.0 - lam * lam)))
    h = min(0.25, 2.0 * math.pi / math.sqrt(80.0 * (1.0 + alpha2)))
    z_max = math.sqrt(2.0 * log_keep)
    z = np.arange(int(math.ceil(z_max / h)) + 1) * h
    w = 2.0 * h * stats.norm.pdf(z)
    w[0] /= 2.0
    return z, w


def _s_rule(df, log_floor):
    """Nodes s and weights of the trapezoidal rule for E_s[g(s)],
    s = sqrt(chi2_df / df), in u = log s. The density of u is
    proportional to exp(df u - df e^{2u} / 2), analytic in the strip
    |Im u| < pi/4 and Gaussian near its mode with SD 1/sqrt(2 df).
    Nodes where the log density is below log_floor are dropped (towards
    s -> 0, where the tail integrand is near 1) or below the peak minus
    _LOG_TRUNC (towards large s, where it is smaller than at the mode)."""
    if not math.isfinite(df):
        return np.ones(1), np.ones(1)
    df = float(df)
    log_norm = (df / 2.0) * math.log(df / 2.0) + math.log(2.0) \
        - special.gammaln(df / 2.0)

    def logdens(u):  # log density of u = log s (includes ds = s du)
        return log_norm + df * u - df * np.exp(2.0 * u) / 2.0

    peak = float(logdens(0.0))
    cut_lo = min(log_floor, peak - _LOG_TRUNC)
    cut_hi = peak - _LOG_TRUNC
    # logdens is concave in u with its maximum at u = 0
    lo = optimize.brentq(lambda u: float(logdens(u)) - cut_lo,
                         -1.0 - (peak - cut_lo + 1.0) / df * 2.0, 0.0,
                         xtol=1e-6)
    hi = optimize.brentq(lambda u: float(logdens(u)) - cut_hi, 0.0,
                         0.5 * math.log(2.0 + 120.0 / df) + 1.0, xtol=1e-6)
    h = min(0.05, 0.5 / math.sqrt(2.0 * df))
    k_lo, k_hi = int(math.floor(lo / h)), int(math.ceil(hi / h))
    u = np.arange(k_lo, k_hi + 1) * h
    return np.exp(u), h * np.exp(logdens(u))


def sf_one_factor(c, lam, df) -> float:
    """P(max_j |T_j| > c) for a multivariate t with df degrees of freedom
    and correlation lambda_i lambda_j (|lambda_j| < 1)."""
    lam = np.abs(np.asarray(lam, dtype=float))
    c = float(c)
    if not math.isfinite(c):
        return 0.0 if c > 0 else 1.0
    if c <= 0:
        return 1.0
    if lam.size == 1:
        return float(min(2.0 * stats.t.sf(c, df), 1.0))
    b = np.sqrt(1.0 - lam * lam)
    # the single-comparison P is a lower bound for the answer: drop only
    # mass far below it, so tiny P values keep their relative accuracy
    log_p_lb = float(np.log(2.0) + stats.t.logsf(c, df))
    log_keep = max(_LOG_TRUNC, _LOG_TRUNC - log_p_lb)
    z, wz = _z_rule(lam, log_keep)
    s, ws = _s_rule(df, log_p_lb - _LOG_TRUNC)
    lz = z[:, None] * (lam / b)[None, :]            # (nz, m)
    cs = (c * s)[:, None, None] / b[None, None, :]  # (ns, 1, m)
    q = special.ndtr(-cs - lz[None]) + special.ndtr(lz[None] - cs)
    np.clip(q, 0.0, 1.0, out=q)
    with np.errstate(divide="ignore"):
        tail = -np.expm1(np.sum(np.log1p(-q), axis=2))  # (ns, nz)
    val = float(ws @ (tail @ wz))
    return min(max(val, 0.0), 1.0)


def critical_value_one_factor(ci_level, lam, df, xtol: float = 1e-10) -> float:
    """c with P(max_j |T_j| <= c) = ci_level (two-sided simultaneous
    critical value)."""
    lam = np.abs(np.asarray(lam, dtype=float))
    alpha = 1.0 - float(ci_level)
    m = lam.size
    if m == 1:
        return float(stats.t.isf(alpha / 2.0, df))
    # bracketed by the unadjusted and the Bonferroni critical values
    lo = float(stats.t.isf(alpha / 2.0, df))
    hi = float(stats.t.isf(alpha / (2.0 * m), df))

    def f(c):
        return sf_one_factor(c, lam, df) - alpha

    while f(hi) > 0:  # numerical safety; Bonferroni bounds Dunnett
        hi *= 1.05
    while f(lo) < 0:
        lo *= 0.95
    return float(optimize.brentq(f, lo, hi, xtol=xtol,
                                 maxiter=200))


def _qmc_cdf(c, R, df, seed=_QMC_SEED):
    m = R.shape[0]
    dist = stats.multivariate_t(shape=R, df=df, allow_singular=True)
    return float(dist.cdf(np.full(m, c), lower_limit=np.full(m, -c),
                          maxpts=50000 * m, random_state=seed))


def sf(c, R, df) -> float:
    """P(max_j |T_j| > c), T multivariate t with correlation R: exact
    integral for the one-factor form, else quasi-Monte Carlo with a fixed
    random state (deterministic, accurate to about 1e-5)."""
    R = np.asarray(R, dtype=float)
    if R.shape[0] == 1:
        return float(min(2.0 * stats.t.sf(abs(c), df), 1.0))
    lam = product_lambdas(R)
    if lam is not None:
        return sf_one_factor(c, lam, df)
    return min(max(1.0 - _qmc_cdf(c, R, df), 0.0), 1.0)


def cdf(c, R, df) -> float:
    """P(max_j |T_j| <= c)."""
    return 1.0 - sf(c, R, df)


def critical_value(ci_level, R, df) -> float:
    """Two-sided simultaneous critical value for correlation R."""
    R = np.asarray(R, dtype=float)
    m = R.shape[0]
    lam = product_lambdas(R) if m > 1 else np.zeros(1)
    if lam is not None:
        return critical_value_one_factor(ci_level, lam, df)
    alpha = 1.0 - ci_level
    tlo = float(stats.t.ppf(1 - alpha / 2, df))
    thi = float(stats.t.ppf(1 - alpha / (2 * m), df)) + 0.5
    try:
        return float(optimize.brentq(
            lambda c: _qmc_cdf(c, R, df) - ci_level, tlo, thi, xtol=1e-7))
    except ValueError:
        return float(stats.t.ppf(1 - alpha / (2 * m), df))
