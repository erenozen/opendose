"""Interpolation from standard curves + confidence/prediction bands.

Prism references (curve-fitting guide):
- "Interpolating from a standard curve": fit a curve to standards, then
  read unknowns' X from their Y (the ELISA workflow).
- "Confidence and prediction bands": the confidence band shows the
  uncertainty of the curve itself (delta method: variance = g' C g with
  g the gradient of the curve w.r.t. the free parameters); the
  prediction band adds the scatter of individual points (+ Sy.x²).
  Band half-width uses t(0.95, df).
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats
from scipy.optimize import brentq

from . import lsq
from .nlfit import MODELS


def _curve(fit, xs):
    spec = MODELS[fit["model"]]
    return spec.func(np.asarray(xs, float), fit["fitted_values"])


def _gradient(fit, xs):
    """d(curve)/d(free params) by central differences: (n_x, n_free),
    scale-aware steps (lsq.param_gradient: cbrt(eps) max(|p|, SE))."""
    spec = MODELS[fit["model"]]
    names = fit["_cov"]["free_names"]
    base = dict(fit["fitted_values"])
    xs = np.asarray(xs, float)
    if not names:
        return np.zeros((xs.size, 0))
    G = lsq.param_gradient(lambda q: spec.func(xs, q), base, names,
                           np.asarray(fit["_cov"]["matrix"], dtype=float))
    return np.asarray(G, dtype=float).reshape(xs.size, len(names))


def bands(fit, xs, kind: str = "confidence", ci_level: float = 0.95) -> dict:
    """Confidence or prediction band around the fitted curve."""
    xs = np.asarray(xs, float)
    yc = _curve(fit, xs)
    C = np.array(fit["_cov"]["matrix"])
    G = _gradient(fit, xs)
    var_curve = np.einsum("ij,jk,ik->i", G, C, G)
    var_curve = np.clip(var_curve, 0.0, None)
    if kind == "prediction":
        var_curve = var_curve + fit["goodness"]["sy_x"] ** 2
    tcrit = stats.t.ppf((1 + ci_level) / 2, fit["goodness"]["df"])
    half = tcrit * np.sqrt(var_curve)
    return {"x": xs.tolist(), "y": yc.tolist(),
            "lower": (yc - half).tolist(), "upper": (yc + half).tolist()}


def _crossings(fit, level: float, x_lo: float, x_hi: float,
               curve_of=None) -> list[float]:
    f = curve_of or (lambda v: float(_curve(fit, [v])[0]))
    xs = np.linspace(x_lo, x_hi, 512)
    with np.errstate(all="ignore"):
        ys = np.array([f(v) for v in xs], dtype=float) - level
    finite = np.isfinite(ys)
    out = []
    for i in range(len(xs) - 1):
        if not (finite[i] and finite[i + 1]):
            continue
        if ys[i] == 0.0:
            out.append(float(xs[i]))
        elif ys[i] * ys[i + 1] < 0:
            r = float(brentq(lambda v: f(v) - level,
                             xs[i], xs[i + 1], maxiter=100))
            with np.errstate(all="ignore"):
                fr = f(r)
            # a sign change is a crossing only if the curve is ~0 there
            # compared with the two grid values around it; a pole
            # (Bmax*X/(Kd+X) at X = -Kd) also changes sign, but the curve
            # is larger there than at its neighbours, not smaller
            near = max(abs(ys[i]), abs(ys[i + 1]))
            if math.isfinite(fr) and abs(fr - level) <= 1e-6 * near:
                out.append(r)
    return out


def interpolate_x(fit, y_values, x_lo: float, x_hi: float) -> list:
    """X values whose curve Y equals each target (None if no crossing).
    Multiple crossings (non-monotonic curve) return the smallest X,
    matching Prism's convention of reporting the first solution."""
    out = []
    for y in y_values:
        if y is None:
            out.append(None)
            continue
        roots = _crossings(fit, float(y), x_lo, x_hi)
        out.append(roots[0] if roots else None)
    return out


def absolute_ic50(fit, level: float, x_lo: float, x_hi: float,
                  ci_level: float = 0.95) -> dict:
    """Absolute IC50 (Prism: "absolute IC50"): the X where the curve
    crosses a fixed response level (e.g. Y = 50 on a 0-100 scale);
    unlike the relative IC50, which is halfway between Top and Bottom.
    The CI comes from where the confidence band crosses the level."""
    roots = _crossings(fit, level, x_lo, x_hi)
    if not roots:
        return {"level": level, "x": None, "ci": None}
    x0 = roots[0]

    tcrit = stats.t.ppf((1 + ci_level) / 2, fit["goodness"]["df"])
    C = np.array(fit["_cov"]["matrix"])

    def band_edge(sign):
        def f(v):
            yc = float(_curve(fit, [v])[0])
            G = _gradient(fit, [v])
            var = max(float((G @ C @ G.T)[0, 0]), 0.0)
            return yc + sign * tcrit * math.sqrt(var)
        roots_edge = _crossings(fit, level, x_lo, x_hi, curve_of=f)
        return roots_edge[0] if roots_edge else None

    lo_edge, hi_edge = band_edge(+1), band_edge(-1)
    ci = None
    if lo_edge is not None and hi_edge is not None:
        ci = sorted([lo_edge, hi_edge])
    return {"level": level, "x": x0, "ci": ci}


# ---- unknowns read off the curve, with inverse-prediction intervals ----
#
# Interpolating an unknown is inverse prediction (calibration): the X at
# which the fitted curve equals the unknown's Y, and the set of X values
# the data cannot tell apart from it. Two intervals, both by inverting a
# band around the curve (Graybill 1976, Theory and Application of the
# Linear Model, section 6.9; Seber & Wild 1989, Nonlinear Regression,
# section 5.12; Greenwell & Schubert Kabban 2014, "investr: An R package
# for inverse estimation", The R Journal 6(1):90-100, eqs. 2, 6 and 7):
#
# - the 95% CI ("mean response", investr mean.response = TRUE): every X
#   where the curve's confidence band reaches the unknown's Y,
#       (y0 - f(x))^2 <= t^2(n - p) Var(f(x)),
#   the uncertainty of the curve alone. This is the band crossing of the
#   GraphPad curve-fitting guide ("Interpolating from a standard curve")
#   and of assay_stdcurve.StandardCurve.ci.
# - the 95% prediction interval (investr's default inversion interval):
#   the same with the scatter of the unknown's own reading added,
#       (ybar0 - f(x))^2 <= t^2(n + m - p - 1) (s^2/m + Var(f(x))),
#   for the mean ybar0 of m readings; s^2 = Sy.x^2, the fit's residual
#   variance, as investr's invest.nls (sigma(object)^2).
#
# Var(f(x)) = g' C g, the delta method of bands() (exact for models
# linear in their parameters: lines, polynomials). Each limit is the
# nearest X on each side of the estimate where the inequality turns,
# found on a 1024-step grid and refined with brentq (investr: uniroot
# from the estimate outward); a side that does not turn within the range
# searched is open (None), never a made-up limit.

SEARCH_FRACTION = 0.5   # the standards' X range, extended by half of it each way


def _inverse_limits(fit, eta, x0, lo, hi, var_new, crit):
    """[lower, upper] of {x : (eta - f(x))^2 <= crit^2 (Var f(x) + var_new)}
    around x0, each None when it does not close within [lo, hi]."""
    C = np.asarray(fit["_cov"]["matrix"], dtype=float)

    def g_arr(xs):
        xs = np.atleast_1d(np.asarray(xs, float))
        with np.errstate(all="ignore"):
            yc = _curve(fit, xs)
            G = _gradient(fit, xs)
            var = np.clip(np.einsum("ij,jk,ik->i", G, C, G), 0.0, None)
            return (eta - yc) ** 2 - crit ** 2 * (var + var_new)

    def g(v):
        return float(g_arr([v])[0])

    grid = np.linspace(lo, hi, 1025)
    vals = g_arr(grid)

    def side(direction):
        idx = (np.nonzero(grid < x0)[0][::-1] if direction < 0
               else np.nonzero(grid > x0)[0])
        prev = x0
        for i in idx:
            v = vals[i]
            if not math.isfinite(v):
                return None
            if v > 0:
                if g(prev) >= 0:   # a band of no width (Sy.x = 0)
                    return float(prev)
                a, b = (grid[i], prev) if direction < 0 else (prev, grid[i])
                return float(brentq(g, a, b, maxiter=200))
            prev = float(grid[i])
        return None

    return [side(-1), side(+1)]


def interpolate_unknown(fit, ys, data_lo: float, data_hi: float, *,
                        ci_level: float = 0.95,
                        prediction: bool = True) -> dict:
    """X of an unknown (the mean of the readings `ys`) read off the curve.

    Returns {"y", "m", "x", "position", "crossings", "ci", "pi"}:
    position "within" (the X lies inside the standards' range [data_lo,
    data_hi]), "extrapolated" (outside it, but where the curve still
    reaches the Y within the range extended by half its width each way),
    or "none" (no X: the Y is "above" or "below" every value the curve
    takes there, given as "side"). Several crossings: the first inside
    the standards (else the one nearest them) is reported and
    "crossings" counts them. ci / pi are [lower, upper] in the fit's X
    units, either limit None when the band does not close within the
    range searched; absent without a covariance (robust fits), pi None
    when prediction is False (weighted or summary-data fits, where Sy.x
    is not the scatter of one reading)."""
    vals = [float(v) for v in ys]
    m = len(vals)
    eta = float(np.mean(vals))
    width = float(data_hi - data_lo)
    out: dict = {"y": eta, "m": m}
    if not (math.isfinite(width) and width > 0):
        out.update(x=None, position="none", side=None, crossings=0)
        return out
    s_lo = data_lo - SEARCH_FRACTION * width
    s_hi = data_hi + SEARCH_FRACTION * width
    roots = _crossings(fit, eta, s_lo, s_hi)
    out["crossings"] = len(roots)
    tol = 1e-9 * width
    inside = [r for r in roots if data_lo - tol <= r <= data_hi + tol]
    if inside:
        x0, position = inside[0], "within"
    elif roots:
        x0 = min(roots, key=lambda r: max(data_lo - r, r - data_hi))
        position = "extrapolated"
    else:
        with np.errstate(all="ignore"):
            yc = _curve(fit, np.linspace(s_lo, s_hi, 512))
        yc = yc[np.isfinite(yc)]
        out.update(x=None, position="none", crossings=0,
                   side=("above" if yc.size and eta > yc.max() else
                         "below" if yc.size and eta < yc.min() else None))
        return out
    out.update(x=float(x0), position=position)
    if not fit.get("_cov"):
        return out
    df = fit["goodness"]["df"]
    q = (1 + ci_level) / 2
    out["ci"] = _inverse_limits(fit, eta, x0, s_lo, s_hi, 0.0,
                                float(stats.t.ppf(q, df)))
    out["pi"] = None
    if prediction:
        s2 = float(fit["goodness"]["sy_x"]) ** 2
        out["pi"] = _inverse_limits(fit, eta, x0, s_lo, s_hi, s2 / m,
                                    float(stats.t.ppf(q, df + m - 1)))
    return out
