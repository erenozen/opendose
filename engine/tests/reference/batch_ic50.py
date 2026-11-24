"""Five plate files for "Run on many files" (FEATURE-PLAN P-78), and the
IC50 of each of the four good ones by an independent least-squares fit.

The files (web/e2e-fixtures/batch/plate1.csv ... plate5.csv) are in the
layout of the built-in template "96-well SRB plate: IC50": nine half-log
concentrations from 1 nM to 10 µM (in M) in the first column, three
replicate columns. The responses are simulated (seeded): Y = 100 / (1 +
10^((log10 IC50 - log10 X) * h)) with h = -1 (log(inhibitor) vs.
response) plus N(0, 2) noise, rounded to 0.1. plate5.csv is malformed (an
instrument's error page, no numbers), so the run names it with its error.

Reference: scipy.optimize.curve_fit (Levenberg-Marquardt, the same
least-squares problem: every replicate a point, unweighted) on
Y = Bottom + (Top - Bottom) / (1 + 10^((LogIC50 - X) * HillSlope)), X =
log10(concentration): the "log(inhibitor) vs. response, variable slope"
model of the GraphPad Curve Fitting Guide. It shares no code with the
engine (opendose/doseresponse.py). IC50 = 10^LogIC50, reported at 4
significant digits, as the results tables print it.

Run from the repository root:
    PYTHONPATH=engine /home/eren/opendose/.venv/bin/python engine/tests/reference/batch_ic50.py
It writes the fixtures and engine/tests/reference/batch_ic50.json.
"""

from __future__ import annotations

import json
import pathlib

import numpy as np
from scipy.optimize import curve_fit

ROOT = pathlib.Path(__file__).resolve().parents[3]
FIX = ROOT / "web" / "e2e-fixtures" / "batch"
X = ["1e-9", "3.162e-9", "1e-8", "3.162e-8", "1e-7", "3.162e-7", "1e-6", "3.162e-6", "1e-5"]
TRUE_IC50 = {"plate1": 1e-7, "plate2": 3e-7, "plate3": 4e-8, "plate4": 6e-7}


def responses(ic50: float, seed: int) -> list[list[float]]:
    rng = np.random.default_rng(seed)
    lx = np.log10([float(v) for v in X])
    y = 100 / (1 + 10 ** ((np.log10(ic50) - lx) * -1.0))
    return [[round(float(v + rng.normal(0, 2)), 1) for _ in range(3)] for v in y]


def four_pl(x, bottom, top, log_ic50, hill):
    return bottom + (top - bottom) / (1 + 10 ** ((log_ic50 - x) * hill))


def fit(rows: list[list[float]]) -> dict:
    xs = np.repeat(np.log10([float(v) for v in X]), 3)
    ys = np.array(rows, dtype=float).ravel()
    p, _ = curve_fit(four_pl, xs, ys, p0=[0, 100, -7, -1], maxfev=20000)
    return {"LogIC50": float(p[2]), "IC50": float(10 ** p[2]), "HillSlope": float(p[3]),
            "Top": float(p[1]), "Bottom": float(p[0])}


def main() -> None:
    FIX.mkdir(parents=True, exist_ok=True)
    out = {}
    for i, (name, ic50) in enumerate(TRUE_IC50.items()):
        rows = responses(ic50, 100 + i)
        lines = ["Concentration (M),Rep 1,Rep 2,Rep 3"]
        lines += [",".join([x, *(f"{v:g}" for v in r)]) for x, r in zip(X, rows)]
        (FIX / f"{name}.csv").write_text("\n".join(lines) + "\n")
        f = fit(rows)
        out[name] = {"rows": rows, **f, "IC50_4sig": f"{f['IC50']:.4g}"}
    (FIX / "plate5.csv").write_text("Plate reader error report\nStatus: lamp failure\nNo data were read\n")
    path = pathlib.Path(__file__).with_suffix(".json")
    path.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({k: v["IC50_4sig"] for k, v in out.items()}))


if __name__ == "__main__":
    main()
