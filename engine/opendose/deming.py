"""Deming (Model II) linear regression.

GraphPad curve fitting guide, "Deming regression" (Key concepts, How to,
Q&A, Analysis checklist), and GraphPad knowledgebase FAQ 1690 ("How Prism
computes the SE and CI of the slope and intercept in Deming regression")
and FAQ 2230 (SE of Y at a chosen X):

- Both X and Y are measured with error. Either X and Y have equal
  uncertainty (Deming then minimizes the sum of squared perpendicular
  distances: orthogonal regression) or the SD of the X error and the SD
  of the Y error are entered; only lambda = (SD_X error / SD_Y error)^2
  is used ("If you know lambda ... enter the square root of lambda as
  the SD of the X values, and enter 1.0 as the SD of the Y error").
- The SD of a method's error can be estimated from duplicates (Strike,
  eq. 8.15): SD = sqrt(sum(d_i^2) / N), d_i = difference between the
  duplicates of sample i, N = number of measurements (twice the number
  of samples). duplicate_sd().
- Slope b = [Syy - d Sxx + sqrt((Syy - d Sxx)^2 + 4 d Sxy^2)] / (2 Sxy)
  with d = 1 / lambda = var(Y error) / var(X error); intercept
  a = mean(Y) - b mean(X).
- FAQ 1690: r = Sxy^2 / (Sxx Syy); SE(slope) = sqrt(b^2 (1 - r) /
  (r (n - 2))); SE(intercept) = SE(slope) sqrt(sum(X_i^2) / n); CIs with
  the critical t for n - 2 df. Prism reports a P value testing slope = 0
  and does not report R^2 (Q&A).
- FAQ 2230: the SE and CI of Y at X = x0 are those of the intercept after
  subtracting x0 from every X value: SE(slope) sqrt(sum((X_i - x0)^2) /
  n) (x0 = 0 gives the intercept).

Options beyond Prism (labelled as such in the result): jackknife SEs
(Linnet 1990, the method used by most method-comparison software), and a
test of the line of identity (slope = 1, intercept = 0).
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats


def duplicate_sd(first, second) -> float:
    """SD of a method's error from duplicate measurements (guide, "How to:
    Deming regression"): sqrt(sum(d_i^2) / N), N = number of measurements
    (twice the number of samples), d_i = difference between duplicates."""
    pairs = [(float(a), float(b)) for a, b in zip(first, second)
             if a is not None and b is not None]
    if not pairs:
        raise ValueError("no complete duplicate pairs")
    d2 = sum((a - b) ** 2 for a, b in pairs)
    return math.sqrt(d2 / (2 * len(pairs)))


def _fit(x, y, delta):
    xm, ym = x.mean(), y.mean()
    sxx = float(((x - xm) ** 2).sum())
    syy = float(((y - ym) ** 2).sum())
    sxy = float(((x - xm) * (y - ym)).sum())
    if sxy == 0:
        raise ValueError("X and Y are uncorrelated; the Deming slope is "
                         "undefined")
    u = syy - delta * sxx
    slope = (u + math.sqrt(u * u + 4 * delta * sxy * sxy)) / (2 * sxy)
    return slope, float(ym - slope * xm), sxx, syy, sxy


def deming(x, y, *, sd_x=None, sd_y=None, lam=None, ci_level: float = 0.95,
           x0: float = 0.0, se_method: str = "prism",
           compare_identity: bool = False) -> dict:
    """Deming regression of y on x.

    Error ratio: lam = (SD_X error / SD_Y error)^2 directly, or sd_x and
    sd_y; with neither, X and Y have equal uncertainty (lambda = 1,
    orthogonal regression). se_method: "prism" (FAQ 1690 formulas) or
    "jackknife" (Linnet)."""
    pts = [(float(a), float(b)) for a, b in zip(x, y)
           if a is not None and b is not None
           and math.isfinite(float(a)) and math.isfinite(float(b))]
    n = len(pts)
    if n < 3:
        raise ValueError("Deming regression needs at least 3 points")
    xa = np.array([p[0] for p in pts])
    ya = np.array([p[1] for p in pts])
    if lam is None:
        if sd_x is not None and sd_y is not None:
            if not (float(sd_x) > 0 and float(sd_y) > 0):
                raise ValueError("the SDs of the X and Y errors must be "
                                 "positive")
            lam = (float(sd_x) / float(sd_y)) ** 2
        elif sd_x is None and sd_y is None:
            lam = 1.0
        else:
            raise ValueError("enter both SDs (X error and Y error)")
    lam = float(lam)
    if not lam > 0:
        raise ValueError("lambda must be positive")
    delta = 1.0 / lam
    slope, intercept, sxx, syy, sxy = _fit(xa, ya, delta)
    df = n - 2
    tcrit = float(stats.t.ppf((1 + ci_level) / 2, df))

    if se_method == "prism":
        r = sxy * sxy / (sxx * syy)
        se_slope = (math.sqrt(slope * slope * (1 - r) / (r * df))
                    if r < 1 else 0.0)

        def se_at(xv):
            return se_slope * math.sqrt(float(((xa - xv) ** 2).sum()) / n)
        se_int = se_at(0.0)
        se_y0 = se_at(float(x0))
    elif se_method == "jackknife":
        loo = []
        for i in range(n):
            keep = np.arange(n) != i
            b_i, a_i, *_ = _fit(xa[keep], ya[keep], delta)
            loo.append((b_i, a_i, a_i + b_i * float(x0)))
        loo = np.array(loo)
        full = np.array([slope, intercept, intercept + slope * float(x0)])
        pseudo = n * full - (n - 1) * loo
        se_slope, se_int, se_y0 = (pseudo.std(axis=0, ddof=1)
                                   / math.sqrt(n)).tolist()
    else:
        raise ValueError(f"unknown SE method: {se_method}")

    def entry(value, se):
        return {"value": float(value), "se": float(se),
                "ci": [float(value - tcrit * se), float(value + tcrit * se)]}

    t_slope = slope / se_slope if se_slope > 0 else math.inf
    out = {
        "test": "deming",
        "n": n, "df": df, "lambda": lam,
        "error_model": ("equal" if sd_x is None and sd_y is None
                        and lam == 1.0 else "ratio"),
        "se_method": se_method, "ci_level": ci_level,
        "slope": entry(slope, se_slope),
        "y_intercept": entry(intercept, se_int),
        "x_intercept": (-intercept / slope) if slope != 0 else None,
        "y_at_x0": {"x0": float(x0), **entry(intercept + slope * float(x0),
                                             se_y0)},
        "slope_test": {"t": abs(t_slope), "df": df,
                       "p": float(2 * stats.t.sf(abs(t_slope), df))},
        "equation": f"Y = {slope:.6g}*X + {intercept:.6g}",
    }
    if compare_identity:
        t1 = (slope - 1) / se_slope if se_slope > 0 else math.inf
        t0 = intercept / se_int if se_int > 0 else math.inf
        out["identity_test"] = {
            "slope_vs_1": {"t": abs(t1), "df": df,
                           "p": float(2 * stats.t.sf(abs(t1), df))},
            "intercept_vs_0": {"t": abs(t0), "df": df,
                               "p": float(2 * stats.t.sf(abs(t0), df))},
            "note": "not a Prism option; t tests with the SEs above"}
    return out
