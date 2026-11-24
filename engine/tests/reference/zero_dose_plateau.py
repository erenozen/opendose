"""Independent reference for the per-curve zero-dose plateau (FEATURE-PLAN
P-104). The plan names R `drc` with fixed c / d; R is not installed here,
so the oracle is the same fit written out with scipy: the four-parameter
logistic of Prism's log(inhibitor) vs. response, with Top held at the
mean of that data set's own zero-dose wells and Bottom, LogIC50 and
HillSlope fitted by scipy.optimize.least_squares (Levenberg-Marquardt),
the standard errors from sigma^2 (J'J)^-1 with n - 3 degrees of freedom.
In drc terms this is LL.4 with d (the upper limit) fixed per curve,
fixed = c(NA, NA, d_i, NA), on log10 doses.

Two data sets in triplicate; the first row is the vehicle (dose 0),
whose wells sit at different levels in the two sets (as two plates with
different controls), so one shared Top would fit neither.

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/zero_dose_plateau.py
writes zero_dose_plateau.json next to this file.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from scipy.optimize import least_squares

HERE = Path(__file__).resolve().parent

X = [0, 1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4]
SETS = {
    "Drug A": [[98.0, 101.0, 103.0], [97.5, 99.0, 100.2], [90.1, 92.4, 88.7],
               [70.2, 66.8, 72.5], [31.0, 35.2, 29.4], [10.4, 12.9, 9.8],
               [6.1, 4.9, 7.3]],
    "Drug B": [[84.0, 88.5, 86.1], [85.2, 82.7, 84.9], [83.0, 80.6, 84.4],
               [76.1, 73.9, 78.0], [58.2, 55.0, 60.3], [30.1, 27.7, 33.6],
               [14.2, 12.8, 16.5]],
}
NAMES = ["Bottom", "LogIC50", "HillSlope"]


def f(x, top, p):
    bottom, logic50, hill = p
    return bottom + (top - bottom) / (1 + 10.0 ** ((logic50 - x) * hill))


def fit(rows):
    vehicle = rows[0]
    top = float(np.mean(vehicle))
    x = np.repeat([math.log10(c) for c in X[1:]], 3)
    y = np.array(rows[1:], float).ravel()
    half = (top + y.min()) / 2
    start = [float(y.min()), float(x[int(np.argmin(np.abs(y - half)))]), -1.0]
    r = least_squares(lambda p: f(x, top, p) - y, start, method="lm",
                      xtol=1e-15, ftol=1e-15, gtol=1e-15)
    sse = float(r.fun @ r.fun)
    df = x.size - 3
    cov = sse / df * np.linalg.inv(r.jac.T @ r.jac)
    out = {"Top": {"value": top, "n_values": len(vehicle)}}
    for i, n in enumerate(NAMES):
        out[n] = {"value": float(r.x[i]), "se": float(math.sqrt(cov[i, i]))}
    out["IC50"] = 10 ** float(r.x[1])
    out["ss_res"] = sse
    out["df"] = df
    return out


def main():
    ref = {"x": X, "sets": SETS,
           "fits": {name: fit(rows) for name, rows in SETS.items()}}
    (HERE / "zero_dose_plateau.json").write_text(json.dumps(ref, indent=1)
                                                 + "\n")
    print(json.dumps(ref["fits"], indent=1))


if __name__ == "__main__":
    main()
