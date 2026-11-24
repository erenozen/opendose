"""Independent reference values for dose-series planning (FEATURE-PLAN
P-97, opendose.doseplan).

No shared code with the engine:
- the expected covariance from scipy.optimize.curve_fit (MINPACK's
  finite-difference Jacobian) fitted to the noise-free planned curve with
  sigma = the planned SD and absolute_sigma=True: at the exact data the
  optimum is the truth and pcov = (J'J / sigma^2)^-1, the expected
  information the engine builds from its analytic derivatives;
- a Monte Carlo with scipy curve_fit (not the app's fitter): simulated
  wells, a 4PL fit from the true values as the start, the 95% CI of
  LogIC50 as estimate +/- t(0.975, n - 4) SE; coverage of the true
  LogIC50 and the median CI width.

The plan's acceptance case: 8 half-log concentrations around an expected
IC50 of 1 uM (log10 -1.75 to 1.75 in uM), Hill slope -1, plateaus 100
and 0, SD 5 per well, triplicates; and the same series shifted 1.5 log
units up, so the top plateau (low concentrations) is missed.

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/doseplan.py
writes doseplan.json next to this file (about a minute).
"""

from __future__ import annotations

import json
import math
import warnings
from pathlib import Path

import numpy as np
from scipy import optimize, stats

HERE = Path(__file__).resolve().parent


def f4(x, top, bottom, logic50, hill):
    return bottom + (top - bottom) / (1 + 10.0 ** ((logic50 - x) * hill))


def expected(logd, reps, truth, sd):
    x = np.repeat(logd, reps)
    y = f4(x, *truth)
    popt, pcov = optimize.curve_fit(f4, x, y, p0=truth, sigma=np.full(x.size,
                                                                     sd),
                                    absolute_sigma=True)
    se = math.sqrt(pcov[2, 2])
    t = stats.t.isf(0.025, x.size - 4)
    return {"se_log_ic50": se, "log_width": 2 * t * se,
            "fold_width": 10 ** (2 * t * se)}


def monte_carlo(logd, reps, truth, sd, n_sim, seed):
    rng = np.random.default_rng(seed)
    x = np.repeat(logd, reps)
    t = stats.t.isf(0.025, x.size - 4)
    covered = ok = 0
    widths = []
    for _ in range(n_sim):
        y = f4(x, *truth) + rng.normal(0, sd, x.size)
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                popt, pcov = optimize.curve_fit(f4, x, y, p0=truth,
                                                maxfev=20000)
        except RuntimeError:
            continue
        se = math.sqrt(pcov[2, 2]) if np.isfinite(pcov[2, 2]) else math.inf
        if not math.isfinite(se):
            continue
        ok += 1
        lo, hi = popt[2] - t * se, popt[2] + t * se
        covered += lo <= truth[2] <= hi
        widths.append(hi - lo)
    return {"n_sim": n_sim, "n_ci": ok, "coverage": covered / ok,
            "median_log_width": float(np.median(widths))}


def main():
    truth = (100.0, 0.0, 0.0, -1.0)
    centred = np.arange(-1.75, 1.76, 0.5)
    shifted = centred + 1.5
    out = {"truth": {"top": 100, "bottom": 0, "log_ic50": 0, "hill": -1},
           "sd": 5.0, "replicates": 3,
           "centred": {"log_doses": centred.tolist(),
                       **expected(centred, 3, truth, 5.0),
                       "mc": monte_carlo(centred, 3, truth, 5.0, 4000, 1)},
           "shifted": {"log_doses": shifted.tolist(),
                       **expected(shifted, 3, truth, 5.0)},
           "rising": {"log_doses": centred.tolist(),
                      **expected(centred, 2, (80.0, 10.0, 0.0, 1.5), 4.0)}}
    (HERE / "doseplan.json").write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
