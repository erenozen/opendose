"""The studentized range distribution (Tukey's HSD and its relatives).

Q = R / s, where R is the range of k independent N(0, 1) variables and
s^2 ~ chi^2_df / df is independent of R. scipy.stats.studentized_range
computes it accurately but slowly (about 25 ms per tail probability and
300 ms per quantile at k = 9, df = 180, so a 9-group Tukey test took
over 10 s natively and much longer under WebAssembly); this module
evaluates the same double integral deterministically and vectorised.

Tail of the range. With a = Q(z) = 1 - Phi(z) and b = Phi(z + w) - Phi(z),

    P(R > w) = k * Int phi(z) [a^(k-1) - b^(k-1)] dz
             = k * Int phi(z) a^(k-1) [-expm1((k-1) log1p(-Q(z+w)/Q(z)))] dz,

(the integral of k phi(z) a^(k-1) is 1), a sum of positive terms with
no cancellation, evaluated in logarithms (scipy.special.log_ndtr) so
that tail probabilities far below 1e-300 do not underflow on the way.

Studentization. With u = log s, the density of u is
C exp(df u - df e^(2u) / 2), log C = (df/2) log df - (df/2 - 1) log 2
- lgamma(df/2), and

    P(Q > q) = Int f(u) P(R > q e^u) du.

Both integrals are over the whole real line of analytic, rapidly
decaying integrands, so the trapezoidal rule converges geometrically
(as in opendose.dunnett). The ranges are cut where the integrand is
below e^-46 of the result (the u range from a lower bound of the tail,
P(Q > q) >= P(s <= 1) P(R > q) >= Q(q / sqrt 2) / 2); the steps are a
fraction of the integrands' widths (the inner integral over z = -w/2
+ [-11, 11]; the outer one located by two coarse passes, then sampled
at a fifth of its width at the peak).

Accuracy (engine/tests/test_performance.py): for k = 2, where
P(Q > q) = 2 P(T_df > q / sqrt 2) exactly, 1e-13 relative for every df
and tail probabilities down to 1e-60; halving every step changes no
result by more than 3e-13; scipy agrees to 1e-10 for df <= 30, where its
own integration is accurate, and drifts at large df (to 1e-7 relative at
df = 1000, and it returns 0 in the far tail). Speed: about 3 ms per tail
probability natively (k = 9, df = 180), 60 ms per quantile.

Only numpy and scipy.special are used, so the module runs under Pyodide.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import special

_LOG_TRUNC = 46.0
_H_Z = 0.16           # step of the inner (normal) integral
_U_STEPS = 5.0        # steps per width of the outer integrand at its peak
_N_COARSE = 49        # points of the passes that locate the outer integrand
_DF_INF = 1e10         # above this, s = 1 (the range distribution itself)


def _log_range_sf(w, k: int) -> np.ndarray:
    """log P(R > w) for the range of k standard normals (array w; 0 for
    w <= 0). The integrand is at most k(k-1) phi(z) Q(z + w), which is
    below e^-121 of its peak (at z = -w/2) for |z + w/2| > 11, so each w
    is integrated over z = -w/2 + [-11, 11]."""
    w = np.asarray(w, dtype=float)
    out = np.zeros(w.shape)
    pos = w > 0
    if not np.any(pos):
        return out
    wp = w[pos]
    fin = np.isfinite(wp)
    res = np.full(wp.shape, -math.inf)
    if np.any(fin):
        wf = wp[fin][:, None]
        t = np.arange(-11.0, 11.0 + _H_Z / 2, _H_Z)[None, :]
        z = -wf / 2.0 + t        # each w on its own shifted grid
        lq_z = special.log_ndtr(-z)
        lq_zw = special.log_ndtr(-(z + wf))
        r = np.minimum(np.exp(lq_zw - lq_z), 1.0)      # Q(z+w)/Q(z)
        with np.errstate(divide="ignore", invalid="ignore"):
            frac = -np.expm1((k - 1) * np.log1p(-r))
            lt = (math.log(k) - 0.5 * math.log(2 * math.pi) - 0.5 * z * z
                  + (k - 1) * lq_z + np.log(frac))
        m = np.max(lt, axis=1, keepdims=True)
        with np.errstate(invalid="ignore"):
            tot = np.log(np.sum(np.exp(lt - m), axis=1) * _H_Z) + m[:, 0]
        res[fin] = np.where(np.isfinite(m[:, 0]), tot, -math.inf)
    out[pos] = res
    return out


def _log_density_const(nu: float) -> float:
    """log C' = log C - df/2 of the density of u = log s (module
    docstring), via Stirling's series for large df so that no terms of
    size df cancel: with x = df/2, log C' = log(2) + log(x)/2
    - log(2 pi)/2 - stirlerr(x), lgamma(x) = (x - 1/2) log x - x
    + log(2 pi)/2 + stirlerr(x)."""
    x = nu / 2.0
    if x < 20.0:
        return (x * math.log(nu) - (x - 1.0) * math.log(2.0)
                - math.lgamma(x) - x)
    x2 = x * x
    stirlerr = (1.0 / 12.0 - (1.0 / 360.0 - (1.0 / 1260.0 - (1.0 / 1680.0)
                / x2) / x2) / x2) / x
    return math.log(2.0) + 0.5 * math.log(x) - 0.5 * math.log(2 * math.pi) \
        - stirlerr


def logsf(q, k: int, df: float) -> np.ndarray:
    """log P(Q > q) for the studentized range with k means and df
    degrees of freedom (q array-like)."""
    k = int(k)
    q = np.atleast_1d(np.asarray(q, dtype=float))
    out = np.zeros_like(q)
    if k < 2 or not df > 0:  # undefined (scipy also returns NaN)
        return np.full_like(q, math.nan)
    out[np.isnan(q)] = math.nan
    if df >= _DF_INF:
        pos = q > 0
        out[pos] = _log_range_sf(q[pos], k)
        return np.minimum(out, 0.0)
    nu = float(df)
    log_c = _log_density_const(nu)

    def log_fu(u):
        # log C + (df/2)(2u - e^(2u)) = log C' - (df/2)(expm1(2u) - 2u),
        # C' = C e^(-df/2): no cancellation between terms of size df
        u = np.asarray(u, dtype=float)
        return log_c - (nu / 2) * (np.expm1(2 * u) - 2 * u)

    for i, qv in enumerate(q):
        if not qv > 0:
            continue
        if not math.isfinite(qv):
            out[i] = -math.inf
            continue
        floor = math.log(0.5) + float(special.log_ndtr(-qv / math.sqrt(2.0))) \
            - _LOG_TRUNC
        # ends: where the density alone (P(R > .) <= 1) is below e^floor
        # (log f(u) increases on u < 0 and decreases on u > 0)
        u_lo = -0.5
        while log_fu(u_lo) > floor:
            u_lo *= 2.0
        u_hi = 0.5
        while log_fu(u_hi) > floor:
            u_hi += 0.5
        # coarse pass to locate the integrand, then the fine grid only
        # where it is within e^-46 of its maximum
        coarse = np.linspace(u_lo, u_hi, _N_COARSE)
        gc = log_fu(coarse) + _log_range_sf(qv * np.exp(coarse), k)
        imax = int(np.argmax(gc))
        gmax = float(gc[imax])
        for _ in range(2):  # locate, then tighten the band once
            keep = np.nonzero(gc > gmax - _LOG_TRUNC - 4.0)[0]
            a = coarse[max(keep[0] - 1, 0)]
            b = coarse[min(keep[-1] + 1, coarse.size - 1)]
            if _ == 0:
                coarse = np.linspace(a, b, _N_COARSE)
                gc = log_fu(coarse) + _log_range_sf(qv * np.exp(coarse), k)
                imax = int(np.argmax(gc))
                gmax = float(gc[imax])
        # width of the integrand at its peak u*: the density contributes
        # curvature 2 df e^(2u), the factor P(R > q e^u) ~ exp(-q^2
        # e^(2u) / 4) at most q^2 e^(2u) / 2 (more where it is not yet in
        # its tail); the step is a fraction of 1/sqrt of the sum, taken at
        # the largest u of the coarse cell holding the peak
        u_star = min(coarse[min(imax + 1, coarse.size - 1)], b)
        width = 1.0 / math.sqrt((2.0 * nu + qv * qv) * math.exp(2 * u_star))
        h = min(width, 1.0) / _U_STEPS
        u = np.arange(a, b + h, h)
        g = log_fu(u) + _log_range_sf(qv * np.exp(u), k)
        m = float(np.max(g))
        out[i] = m + math.log(float(np.sum(np.exp(g - m))) * h)
    return np.minimum(out, 0.0)


def sf(q, k: int, df: float):
    """P(Q > q); a float for scalar q, else an array."""
    res = np.exp(logsf(q, k, df))
    return float(res[0]) if np.ndim(q) == 0 else res


def cdf(q, k: int, df: float):
    """P(Q <= q) (as 1 - sf; use sf for upper-tail probabilities)."""
    res = -np.expm1(logsf(q, k, df))
    return float(res[0]) if np.ndim(q) == 0 else res


def ppf(p: float, k: int, df: float) -> float:
    """The quantile q with P(Q <= q) = p (0 < p < 1), by bracketing and
    bisection-safeguarded secant iterations on log sf."""
    if int(k) < 2 or not df > 0 or p != p:
        return math.nan
    if not 0.0 < p < 1.0:
        if p == 0.0:
            return 0.0
        if p == 1.0:
            return math.inf
        raise ValueError("p must be in [0, 1]")
    target = math.log1p(-p)

    def g(qv):
        return float(logsf(qv, k, df)[0]) - target

    # bracket outward from the normal-theory (df = infinity) value of
    # the k = 2 case, sqrt(2) z_(1 - (1-p)/2), scaled up for k > 2
    from scipy.optimize import brentq
    z = float(special.ndtri(1.0 - (1.0 - p) / 2.0))
    lo = max(math.sqrt(2.0) * z, 1e-3)
    hi = lo * 1.25
    if g(lo) < 0:
        while g(lo) < 0:
            hi, lo = lo, lo / 1.25
            if lo < 1e-12:
                return 0.0
    else:
        while g(hi) > 0:
            lo, hi = hi, hi * 1.25
            if hi > 1e6:
                return math.inf
    return float(brentq(g, lo, hi, xtol=1e-13, rtol=8 * np.finfo(float).eps,
                        maxiter=200))
