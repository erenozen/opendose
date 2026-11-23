"""Independent reference for the residuals of curve fits and linear
regression (FEATURE-PLAN P-11, first part). R is not installed here, so
the oracles are scipy and statsmodels:

- NIST StRD Misra1a and MGH09 (docs/validation/datasets): scipy
  curve_fit from the NIST Start 2 values; residual = y - f(x) at its
  optimum, and the standardized ("pearson") residual divided by
  sqrt(SS / (n - p)), as R's residuals(nls, type = "pearson").
- The dose-response example (web/src/sheets/xy/sample.ts, 9 doses x 3
  replicates): log(inhibitor) vs response, variable slope (4PL), by
  scipy curve_fit with its own 4PL function.
- A weighted straight line with 1/X^2 weights (fixed weights, so the
  weighted least-squares fit is the same however it is computed):
  statsmodels WLS; plotted residual = sqrt(w) (y - yhat), statsmodels'
  wresid, and resid_pearson = wresid / sqrt(scale).
- Simple linear regression: statsmodels OLS resid and resid_pearson.

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/fit_residuals.py
writes fit_residuals.json next to this file.
"""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import numpy as np
import statsmodels.api as sm
from scipy.optimize import curve_fit

HERE = Path(__file__).resolve().parent
DATA = HERE.parents[2] / "docs" / "validation" / "datasets"

CONC_M = [1e-9, 3.162e-9, 1e-8, 3.162e-8, 1e-7, 3.162e-7, 1e-6, 3.162e-6, 1e-5]
REF_Y = [[98.2, 101.5, 99.1], [97.0, 95.8, 99.9], [93.4, 90.1, 92.7],
         [78.9, 82.3, 80.0], [51.2, 48.7, 50.9], [22.1, 25.6, 24.0],
         [8.9, 10.2, 7.5], [3.1, 4.4, 2.2], [1.0, 0.5, 2.1]]


def nist(name):
    with open(DATA / f"nist-{name}.csv", newline="") as fh:
        rows = list(csv.DictReader(fh))
    return (np.array([float(r["x"]) for r in rows]),
            np.array([float(r["y"]) for r in rows]))


def pack(x, y, fitted, n_params, weights=None):
    raw = y - fitted
    plotted = raw * np.sqrt(weights) if weights is not None else raw
    s = math.sqrt(float(plotted @ plotted) / (y.size - n_params))
    return {"x": x.tolist(), "y": y.tolist(), "raw": raw.tolist(),
            "plotted": plotted.tolist(), "pearson": (plotted / s).tolist(),
            "sy_x": s}


def misra1a():
    x, y = nist("misra1a")
    f = lambda x, b1, b2: b1 * (1 - np.exp(-b2 * x))  # noqa: E731
    p, _ = curve_fit(f, x, y, p0=[250.0, 0.0005], xtol=1e-15, ftol=1e-15,
                     gtol=1e-15, maxfev=100000)
    return pack(x, y, f(x, *p), 2)


def mgh09():
    x, y = nist("mgh09")
    f = lambda x, b1, b2, b3, b4: b1 * (x**2 + x * b2) / (x**2 + x * b3 + b4)  # noqa: E731
    p, _ = curve_fit(f, x, y, p0=[0.25, 0.39, 0.415, 0.39], xtol=1e-15,
                     ftol=1e-15, gtol=1e-15, maxfev=100000)
    return pack(x, y, f(x, *p), 4)


def example_4pl():
    x = np.repeat(np.log10(CONC_M), 3)
    y = np.array(REF_Y, float).ravel()
    f = lambda x, top, bottom, logic50, hill: (  # noqa: E731
        bottom + (top - bottom) / (1 + 10 ** ((logic50 - x) * hill)))
    p, _ = curve_fit(f, x, y, p0=[100.0, 0.0, -7.0, -1.0], xtol=1e-15,
                     ftol=1e-15, gtol=1e-15, maxfev=100000)
    out = pack(x, y, f(x, *p), 4)
    out["params"] = dict(zip(["Top", "Bottom", "LogIC50", "HillSlope"],
                             map(float, p)))
    return out


LINE_X = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0, 15.0]
LINE_Y = [2.3, 4.1, 6.4, 7.7, 10.6, 11.8, 16.9, 19.2, 25.3, 29.1]


def weighted_line():
    x, y = np.array(LINE_X), np.array(LINE_Y)
    w = 1.0 / x**2
    fit = sm.WLS(y, sm.add_constant(x), weights=w).fit()
    out = pack(x, y, fit.fittedvalues, 2, weights=w)
    assert np.allclose(out["plotted"], fit.wresid, rtol=1e-12, atol=1e-12)
    assert np.allclose(out["pearson"], fit.resid_pearson, rtol=1e-12)
    out["weights"] = w.tolist()
    return out


def ols_line():
    x, y = np.array(LINE_X), np.array(LINE_Y)
    fit = sm.OLS(y, sm.add_constant(x)).fit()
    out = pack(x, y, fit.fittedvalues, 2)
    assert np.allclose(out["raw"], fit.resid, rtol=1e-12, atol=1e-12)
    assert np.allclose(out["pearson"], fit.resid_pearson, rtol=1e-12)
    return out


def main():
    ref = {"misra1a": misra1a(), "mgh09": mgh09(), "example_4pl": example_4pl(),
           "weighted_line": weighted_line(), "ols_line": ols_line()}
    (HERE / "fit_residuals.json").write_text(json.dumps(ref, indent=1) + "\n")


if __name__ == "__main__":
    main()
