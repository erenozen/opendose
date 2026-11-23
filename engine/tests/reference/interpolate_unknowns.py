"""Reference values for interpolated unknowns with inverse-prediction
intervals (FEATURE-PLAN P-22; engine: interpolate.interpolate_unknown).

R's investr::invest (Greenwell & Schubert Kabban 2014, The R Journal
6(1):90-100) is the method the plan names; R is not installed, so this
script is an own implementation of investr's inversion intervals that
shares no code with the engine:

- the fits: statsmodels OLS for the straight line and the quadratic,
  scipy.optimize.curve_fit for the nonlinear model;
- Var(f(x)): statsmodels' get_prediction().se_mean for OLS, an analytic
  gradient through curve_fit's covariance for the nonlinear model;
- the limits: brentq from the estimate outward on
      (ybar0 - f(x))^2 - t^2 (var_new + Var f(x)) = 0,
  var_new = 0 and t(n - p) for the CI (investr mean.response = TRUE),
  var_new = s^2/m and t(n + m - p - 1) for the prediction interval
  (investr's default; invest.nls: var.pooled = sigma(object)^2, crit =
  qt((level + 1) / 2, n + m - p - 1));
- the straight line also through the closed form of Graybill's inversion
  interval, Greenwell & Schubert Kabban eq. 2 (1/m -> 0 for the mean
  response), as a third check.

Published check: the paper's nasturtium example (Section 3.1; the same
numbers in the investr README): nls(weight ~ theta1/(1 + exp(theta2 +
theta3 * log(conc)))), invest(mod, y0 = c(309, 296, 419), interval =
"inversion") -> estimate 2.263854, interval 1.772244 to 2.969355. The
nasturtium data are the drc package's (Rdatasets csv/drc/nasturtium.csv,
42 rows). This script reproduces those values and the engine test pins
them.

Run from the repository root:
    python engine/tests/reference/interpolate_unknowns.py
Writes engine/tests/reference/interpolate_unknowns.json.
"""

from __future__ import annotations

import json
import pathlib

import numpy as np
import statsmodels.api as sm
from scipy import stats
from scipy.optimize import brentq, curve_fit

HERE = pathlib.Path(__file__).resolve().parent
LEVEL = 0.95

# BCA protein assay (Pierce kit standards, µg/mL) against A562, fitted
# with a second-order polynomial; three unknown wells with Y only, then
# three edge cases: above the top standard (extrapolated), below the
# blank (extrapolated) and beyond every value the curve reaches.
BCA = {"x": [0, 125, 250, 500, 1000, 1500, 2000],
       "y": [0.098, 0.214, 0.321, 0.522, 0.876, 1.170, 1.405],
       "unknowns": [0.42, 0.75, 1.21],
       "edges": [1.55, 0.05, 3.0]}

# A straight-line calibration (concentration against signal).
LINE = {"x": [1, 2, 3, 4, 5, 6, 7, 8],
        "y": [2.9, 5.2, 7.1, 8.8, 11.2, 13.1, 14.8, 17.2],
        "unknowns": [6.0, 12.5]}

NASTURTIUM = {
    "conc": [0] * 6 + [0.025] * 6 + [0.075] * 6 + [0.25] * 6 + [0.75] * 6
    + [2] * 6 + [4] * 6,
    "weight": [920, 889, 866, 930, 992, 1017, 919, 878, 882, 854, 851, 850,
               870, 825, 953, 834, 810, 875, 880, 834, 795, 837, 834, 810,
               693, 690, 722, 738, 563, 591, 429, 395, 435, 412, 273, 257,
               200, 244, 209, 225, 128, 221],
    "y0": [309, 296, 419],
    "published": {"estimate": 2.263854, "lower": 1.772244,
                  "upper": 2.969355},
}


def limits(f, var_fit, eta, x0, lo, hi, var_new, crit):
    """Limits of {x: (eta - f(x))^2 <= crit^2 (var_new + var_fit(x))}
    nearest x0, searched outward on a fine grid within [lo, hi]."""
    h = lambda v: (eta - f(v)) ** 2 - crit ** 2 * (var_new + var_fit(v))
    out = []
    for grid in (np.linspace(x0, lo, 4001), np.linspace(x0, hi, 4001)):
        prev, found = grid[0], None
        for v in grid[1:]:
            if h(v) > 0:
                found = brentq(h, min(prev, v), max(prev, v), xtol=1e-14)
                break
            prev = v
        out.append(found)
    return out


def ols_case(case, degree):
    x = np.asarray(case["x"], float)
    y = np.asarray(case["y"], float)
    X = np.vander(x, degree + 1, increasing=True)
    res = sm.OLS(y, X).fit()
    n, p = len(x), degree + 1
    s2 = res.scale
    f = lambda v: float(np.polyval(res.params[::-1], v))
    var_fit = lambda v: float(res.get_prediction(
        np.vander([v], degree + 1, increasing=True)).se_mean[0] ** 2)
    lo, hi = x.min(), x.max()
    s_lo, s_hi = lo - (hi - lo) / 2, hi + (hi - lo) / 2
    out = []
    for y0 in case["unknowns"] + case.get("edges", []):
        coefs = res.params[::-1].copy()
        coefs[-1] -= y0
        roots = sorted(r.real for r in np.roots(coefs)
                       if abs(r.imag) < 1e-12 and s_lo <= r.real <= s_hi)
        inside = [r for r in roots if lo <= r <= hi]
        if not roots:
            out.append({"y": y0, "x": None, "position": "none"})
            continue
        x0 = inside[0] if inside else min(
            roots, key=lambda r: max(lo - r, r - hi))
        ci = limits(f, var_fit, y0, x0, s_lo, s_hi, 0.0,
                    stats.t.ppf((1 + LEVEL) / 2, n - p))
        pi = limits(f, var_fit, y0, x0, s_lo, s_hi, s2,
                    stats.t.ppf((1 + LEVEL) / 2, n - p))
        out.append({"y": y0, "x": x0,
                    "position": "within" if inside else "extrapolated",
                    "ci": ci, "pi": pi})
    return {"params": res.params.tolist(), "sy_x": float(np.sqrt(s2)),
            "df": n - p, "results": out}


def graybill_line(case):
    """Greenwell & Schubert Kabban (2014) eq. 2, m = 1 (prediction) and
    1/m -> 0 (mean response); t on n + m - 3 = n - 2 df."""
    x = np.asarray(case["x"], float)
    y = np.asarray(case["y"], float)
    n = len(x)
    b1, b0 = np.polyfit(x, y, 1)
    s = np.sqrt(np.sum((y - b0 - b1 * x) ** 2) / (n - 2))
    sxx = np.sum((x - x.mean()) ** 2)
    t = stats.t.ppf((1 + LEVEL) / 2, n - 2)
    g = t ** 2 * s ** 2 / (b1 ** 2 * sxx)
    out = []
    for y0 in case["unknowns"]:
        x0 = (y0 - b0) / b1
        res = {"y": y0, "x": x0}
        for key, inv_m in (("pi", 1.0), ("ci", 0.0)):
            rad = (t * s / b1) * np.sqrt((x0 - x.mean()) ** 2 / sxx
                                         + (1 - g) * (inv_m + 1 / n))
            a = x0 + ((x0 - x.mean()) * g - rad) / (1 - g)
            b = x0 + ((x0 - x.mean()) * g + rad) / (1 - g)
            res[key] = sorted([a, b])
        out.append(res)
    return out


def nasturtium(y0s):
    x = np.asarray(NASTURTIUM["conc"], float)
    w = np.asarray(NASTURTIUM["weight"], float)

    def f(v, t1, t2, t3):
        v = np.asarray(v, float)
        out = np.full(v.shape, t1)
        pos = v > 0
        out[pos] = t1 / (1 + np.exp(t2 + t3 * np.log(v[pos])))
        return out

    p, C = curve_fit(f, x, w, p0=[1000, -1, 1], xtol=1e-14, ftol=1e-14)
    n, k = len(w), 3
    s2 = float(np.sum((w - f(x, *p)) ** 2) / (n - k))

    def grad(v):
        t1, t2, t3 = p
        e = np.exp(t2 + t3 * np.log(v))
        d = 1 + e
        return np.array([1 / d, -t1 * e / d ** 2, -t1 * e * np.log(v) / d ** 2])

    fv = lambda v: float(f([v], *p)[0])
    var_fit = lambda v: float(grad(v) @ C @ grad(v))
    eta, m = float(np.mean(y0s)), len(y0s)
    x0 = brentq(lambda v: fv(v) - eta, 0.1, 4.0, xtol=1e-14)
    lo, hi = 0.0 - 2.0, 4.0 + 2.0
    pi = limits(fv, var_fit, eta, x0, 1e-9, hi, s2 / m,
                stats.t.ppf((1 + LEVEL) / 2, n + m - k - 1))
    ci = limits(fv, var_fit, eta, x0, 1e-9, hi, 0.0,
                stats.t.ppf((1 + LEVEL) / 2, n - k))
    return {"params": p.tolist(), "y0": list(y0s), "x": x0, "pi": pi,
            "ci": ci, "search": [lo, hi]}


def main():
    out = {
        "bca": {**BCA, **ols_case(BCA, 2)},
        "line": {**LINE, **ols_case(LINE, 1), "graybill": graybill_line(LINE)},
        "nasturtium": {"data": {k: NASTURTIUM[k] for k in ("conc", "weight")},
                       "published": NASTURTIUM["published"],
                       "mean_of_three": nasturtium(NASTURTIUM["y0"]),
                       "single": nasturtium([309.0])},
    }
    (HERE / "interpolate_unknowns.json").write_text(
        json.dumps(out, indent=1) + "\n")
    for u in out["bca"]["results"]:
        print("BCA", u)
    for a, b in zip(out["line"]["results"], out["line"]["graybill"]):
        print("line", a["x"], a["ci"], a["pi"], "| Graybill", b["ci"], b["pi"])
    print("nasturtium", out["nasturtium"]["mean_of_three"]["x"],
          out["nasturtium"]["mean_of_three"]["pi"], NASTURTIUM["published"])


if __name__ == "__main__":
    main()
