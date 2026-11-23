"""Independent reference for initial values (FEATURE-PLAN P-21). R is
not installed here (the plan names R's nls), so the oracle is
scipy.optimize.least_squares (Levenberg-Marquardt, as nls's Gauss-Newton
reaches the same least-squares point) on the four-parameter logistic
written out here, from two starts:

- the rule start, computed here by hand from the rules documented for
  log(inhibitor) vs. response (nlfit._dr_initials): Top = YMAX, Bottom =
  YMIN, LogIC50 = the X of the value nearest (YMAX + YMIN) / 2,
  HillSlope = -1;
- the same start with LogIC50 = -5 (the plan's "type a different start
  for LogIC50").

The data are the app's example (web/src/sheets/xy/sample.ts, the same as
engine/tests/test_api.py REF_Y): 9 concentrations in triplicate, X as
log10(concentration).

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/initial_values.py
writes initial_values.json next to this file.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from scipy.optimize import least_squares

HERE = Path(__file__).resolve().parent

CONC = [1e-9, 3.162e-9, 1e-8, 3.162e-8, 1e-7, 3.162e-7, 1e-6, 3.162e-6, 1e-5]
ROWS = [[98.2, 101.5, 99.1], [97.0, 95.8, 99.9], [93.4, 90.1, 92.7],
        [78.9, 82.3, 80.0], [51.2, 48.7, 50.9], [22.1, 25.6, 24.0],
        [8.9, 10.2, 7.5], [3.1, 4.4, 2.2], [1.0, 0.5, 2.1]]
NAMES = ["Top", "Bottom", "LogIC50", "HillSlope"]


def f(x, p):
    top, bottom, logic50, hill = p
    return bottom + (top - bottom) / (1 + 10.0 ** ((logic50 - x) * hill))


def data():
    x = np.repeat([math.log10(c) for c in CONC], 3)
    y = np.array(ROWS, float).ravel()
    return x, y


def rule_start(x, y):
    top, bottom = float(y.max()), float(y.min())
    half = (top + bottom) / 2
    idx = int(np.argmin(np.abs(y - half)))
    return [top, bottom, float(x[idx]), -1.0]


def fit(start):
    x, y = data()
    r = least_squares(lambda p: f(x, p) - y, start, method="lm",
                      xtol=1e-15, ftol=1e-15, gtol=1e-15)
    sse = float(r.fun @ r.fun)
    J = r.jac
    cov = sse / (x.size - 4) * np.linalg.inv(J.T @ J)
    return {"start": dict(zip(NAMES, map(float, start))),
            "params": {n: {"value": float(v), "se": float(np.sqrt(cov[i, i]))}
                       for i, (n, v) in enumerate(zip(NAMES, r.x))},
            "ss_res": sse, "nfev": int(r.nfev)}


def main():
    x, y = data()
    rule = rule_start(x, y)
    typed = list(rule)
    typed[2] = -5.0
    ref = {"rule_start": fit(rule), "typed_logic50": fit(typed)}
    (HERE / "initial_values.json").write_text(json.dumps(ref, indent=1)
                                              + "\n")
    print(json.dumps(ref, indent=1))


if __name__ == "__main__":
    main()
