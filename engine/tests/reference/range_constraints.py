"""Independent reference for range constraints on built-in models
(FEATURE-PLAN P-20). R is not installed here (the plan names R's
nls(algorithm = "port", lower =, upper =)), so the oracle is
scipy.optimize.least_squares with bounds (trust-region reflective), on
the four-parameter logistic written out here without OpenDose code:

    Y = Bottom + (Top - Bottom) / (1 + 10^((LogIC50 - X) * HillSlope))

The data: one inhibition curve, 9 log doses in triplicate, whose free
fit puts Bottom below 0 (the plan's acceptance test). Cases: free (LM);
Bottom > 0 (the limit is active: Bottom ends on 0); HillSlope between
-1 and -0.3 (active at -1); Bottom > -10 (inactive: equals the free
fit). Covariance s^2 (J'J)^-1 at the solution, df = n - 4 (the
parameter on its limit still counted, as Prism and nls(port) do).

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/range_constraints.py
writes range_constraints.json next to this file.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy.optimize import least_squares

HERE = Path(__file__).resolve().parent

X = [-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5]
ROWS = [
    [101.2, 98.4, 99.6], [97.9, 100.8, 96.5], [95.1, 92.3, 96.8],
    [84.0, 80.2, 86.9], [55.3, 60.8, 52.1], [24.7, 28.9, 21.6],
    [7.9, 3.1, 5.6], [-1.2, 2.4, -3.9], [-4.8, -1.1, -6.3],
]
NAMES = ["Bottom", "Top", "LogIC50", "HillSlope"]


def f(x, p):
    bottom, top, logic50, hill = p
    return bottom + (top - bottom) / (1 + 10.0 ** ((logic50 - x) * hill))


def solve(lo=None, hi=None):
    x = np.repeat(np.array(X, float), 3)
    y = np.array(ROWS, float).ravel()
    start = [-5.0, 100.0, -7.0, -1.0]
    if lo is None and hi is None:
        r = least_squares(lambda p: f(x, p) - y, start, method="lm",
                          xtol=1e-15, ftol=1e-15, gtol=1e-15)
    else:
        lo = np.array([-np.inf if v is None else v for v in lo])
        hi = np.array([np.inf if v is None else v for v in hi])
        start = np.clip(start, lo + 1e-3, hi - 1e-3)
        r = least_squares(lambda p: f(x, p) - y, start, bounds=(lo, hi),
                          method="trf", xtol=1e-15, ftol=1e-15, gtol=1e-15,
                          max_nfev=100000)
    p = r.x
    J = np.empty((x.size, 4))
    for i in range(4):
        h = 1e-6 * max(abs(p[i]), 1e-3)
        up, dn = p.copy(), p.copy()
        up[i] += h
        dn[i] -= h
        J[:, i] = (f(x, up) - f(x, dn)) / (2 * h)
    sse = float(r.fun @ r.fun)
    df = x.size - 4
    cov = sse / df * np.linalg.inv(J.T @ J)
    return {"params": {n: {"value": float(v), "se": float(np.sqrt(cov[i, i]))}
                       for i, (n, v) in enumerate(zip(NAMES, p))},
            "ss_res": sse, "df": df, "sy_x": float(np.sqrt(sse / df))}


def main():
    ref = {
        "free": solve(),
        "bottom_gt_0": solve([0, None, None, None], [None] * 4),
        "hill_between": solve([None, None, None, -1.0],
                              [None, None, None, -0.3]),
        "bottom_gt_minus_10": solve([-10, None, None, None], [None] * 4),
    }
    (HERE / "range_constraints.json").write_text(json.dumps(ref, indent=1)
                                                 + "\n")
    print(json.dumps(ref, indent=1))


if __name__ == "__main__":
    main()
