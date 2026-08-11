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

from .nlfit import MODELS


def _curve(fit, xs):
    spec = MODELS[fit["model"]]
    return spec.func(np.asarray(xs, float), fit["fitted_values"])


def _gradient(fit, xs):
    """d(curve)/d(free params) by central differences: (n_x, n_free)."""
    spec = MODELS[fit["model"]]
    names = fit["_cov"]["free_names"]
    base = dict(fit["fitted_values"])
    xs = np.asarray(xs, float)
    G = np.zeros((xs.size, len(names)))
    for j, name in enumerate(names):
        h = max(abs(base[name]) * 1e-6, 1e-8)
        up, dn = dict(base), dict(base)
        up[name] += h
        dn[name] -= h
        G[:, j] = (spec.func(xs, up) - spec.func(xs, dn)) / (2 * h)
    return G


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
    ys = np.array([f(v) for v in xs]) - level
    out = []
    for i in range(len(xs) - 1):
        if ys[i] == 0.0:
            out.append(float(xs[i]))
        elif ys[i] * ys[i + 1] < 0:
            out.append(float(brentq(lambda v: f(v) - level,
                                    xs[i], xs[i + 1], maxiter=100)))
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
