"""Independent reference for bootstrap CIs of fitted parameters
(FEATURE-PLAN P-101).

The plan names R's nlstools::nlsBoot and boot::boot; R is not installed
here, so the oracle is a bootstrap written out in this script with
scipy.optimize.curve_fit (Levenberg-Marquardt) as the fitter, on the
four-parameter logistic written out by hand (no opendose code):

- case resampling: rows drawn with replacement, idx =
  numpy.random.default_rng(seed).integers(0, n, size=(B, n)), the same
  seed stream the engine documents (opendose/fitboot.py); a resample with
  fewer than 4 distinct X values is counted as failed;
- residual resampling: Y* = fitted + r[idx], r the mean-centred
  residuals times sqrt(n / (n - p)) (Davison & Hinkley 1997, chapter 6;
  nlsBoot centres only);
- every resample refitted by curve_fit from the original estimates;
- percentile CI: numpy.quantile (linear, R's type 7) at 2.5% and 97.5%.

With the same seed the resamples are identical to the engine's, so the
two CIs differ only by the optimisers' convergence: the test pins them at
display precision (4 significant digits). Monte Carlo error: the same
bootstrap with seeds 2..21 gives the SD of every CI limit over seeds (the
MC SE of one run); the test also checks the engine's seed-1 CI against the
mean over those seeds within 4 MC SE, which does not depend on sharing
the stream.

Coverage (a property of the engine's method, so this part runs the
engine): data simulated by opendose.simulate.simulate_xy (seeded) from
the 4PL with Top 100, Bottom 0, LogIC50 -7, HillSlope -1 at the
example's 9 concentrations in triplicate with Gaussian SD 5; each data
set fitted and bootstrapped (B = 400); the share of percentile CIs that
contain the true LogIC50 and HillSlope is recorded with its binomial SE.

The data are the app's example (web/src/sheets/xy/sample.ts, the same as
engine/tests/test_api.py REF_Y): 9 concentrations in triplicate, X as
log10(concentration).

Run: PYTHONPATH=engine /home/eren/opendose/.venv/bin/python \
engine/tests/reference/fit_bootstrap.py   (about ten minutes)
writes fit_bootstrap.json next to this file.
"""

from __future__ import annotations

import json
import math
import sys
import warnings
from pathlib import Path

import numpy as np
from scipy.optimize import OptimizeWarning, curve_fit

HERE = Path(__file__).resolve().parent

CONC = [1e-9, 3.162e-9, 1e-8, 3.162e-8, 1e-7, 3.162e-7, 1e-6, 3.162e-6, 1e-5]
ROWS = [[98.2, 101.5, 99.1], [97.0, 95.8, 99.9], [93.4, 90.1, 92.7],
        [78.9, 82.3, 80.0], [51.2, 48.7, 50.9], [22.1, 25.6, 24.0],
        [8.9, 10.2, 7.5], [3.1, 4.4, 2.2], [1.0, 0.5, 2.1]]
NAMES = ["Top", "Bottom", "LogIC50", "HillSlope"]
B = 2000
SEED = 1
MC_SEEDS = list(range(2, 22))


def f4(x, top, bottom, logic50, hill):
    return bottom + (top - bottom) / (1 + 10.0 ** ((logic50 - x) * hill))


def data():
    x = np.repeat([math.log10(c) for c in CONC], 3)
    y = np.array(ROWS, float).ravel()
    return x, y


def fit(x, y, p0):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", OptimizeWarning)
        p, _ = curve_fit(f4, x, y, p0=p0, method="lm", maxfev=20000,
                         xtol=1e-12, ftol=1e-12, gtol=1e-12)
    return p


def values(p):
    top, bottom, logic50, hill = (float(v) for v in p)
    return {"Top": top, "Bottom": bottom, "LogIC50": logic50,
            "HillSlope": hill, "IC50": 10.0 ** logic50,
            "Span": top - bottom}


def bootstrap(x, y, est, method, seed, b=B):
    n = x.size
    idx = np.random.default_rng(seed).integers(0, n, size=(b, n))
    yhat = f4(x, *est)
    r = y - yhat
    r = (r - r.mean()) * math.sqrt(n / (n - 4))
    rows, failed = [], 0
    for k in range(b):
        if method == "case":
            xb, yb = x[idx[k]], y[idx[k]]
            if np.unique(xb).size < 4:
                failed += 1
                continue
        else:
            xb, yb = x, yhat + r[idx[k]]
        try:
            p = fit(xb, yb, est)
        except RuntimeError:
            failed += 1
            continue
        if not np.all(np.isfinite(p)):
            failed += 1
            continue
        rows.append(values(p))
    out = {"converged": len(rows), "failed": failed, "ci95": {}}
    for name in rows[0]:
        arr = np.array([r_[name] for r_ in rows])
        lo, hi = np.quantile(arr, [0.025, 0.975])
        out["ci95"][name] = [float(lo), float(hi)]
        out.setdefault("se", {})[name] = float(arr.std(ddof=1))
    return out


def coverage(method, m=200, b=400):
    sys.path.insert(0, str(HERE.parents[1]))
    from opendose import fitboot, nlfit, simulate
    truth = {"Top": 100.0, "Bottom": 0.0, "LogIC50": -7.0, "HillSlope": -1.0}
    x = [math.log10(c) for c in CONC]
    hits = {"LogIC50": 0, "HillSlope": 0}
    asym = {"LogIC50": 0, "HillSlope": 0}
    used = 0
    for s in range(m):
        sim = simulate.simulate_xy(
            "log_inhibitor_vs_response_4pl",
            {"Top": 100, "Bottom": 0, "LogXmid": -7, "HillSlope": -1},
            x=x, replicates=3, error={"kind": "gaussian", "sd": 5},
            seed=1000 + s)
        xs = [xv for xv, row in zip(sim["x"], sim["datasets"][0]["ys"])
              for _ in row]
        ys = [v for row in sim["datasets"][0]["ys"] for v in row]
        fitted = nlfit.fit_model(xs, ys, "log_inhibitor_vs_response_4pl")
        if fitted["status"] != "converged":
            continue
        used += 1
        setup = nlfit.fit_setup(xs, ys, "log_inhibitor_vs_response_4pl")
        res = fitboot.FitBootstrap(setup, fitted["fitted_values"],
                                   method=method, resamples=b,
                                   seed=s).run()
        for name in hits:
            lo, hi = res["params"][name]["ci95"]
            hits[name] += lo <= truth[name] <= hi
            alo, ahi = fitted["params"][name]["ci95"]
            asym[name] += alo <= truth[name] <= ahi
    return {"datasets": used, "resamples": b,
            "coverage": {k: v / used for k, v in hits.items()},
            "binomial_se": math.sqrt(0.95 * 0.05 / used),
            "asymptotic_coverage": {k: v / used for k, v in asym.items()}}


def main():
    x, y = data()
    est = fit(x, y, [101.5, 0.5, -7.0, -1.0])
    ref = {"estimates": values(est), "resamples": B, "seed": SEED}
    for method in ("case", "residual"):
        main_run = bootstrap(x, y, est, method, SEED)
        runs = [bootstrap(x, y, est, method, s) for s in MC_SEEDS]
        mc = {}
        for name in main_run["ci95"]:
            lims = np.array([r_["ci95"][name] for r_ in runs])
            mc[name] = {"mean": lims.mean(axis=0).tolist(),
                        "mc_se": lims.std(axis=0, ddof=1).tolist()}
        ref[method] = {**main_run, "mc_seeds": MC_SEEDS, "mc": mc}
        print(method, json.dumps(main_run["ci95"], indent=1), flush=True)
    ref["coverage"] = {m: coverage(m) for m in ("case", "residual")}
    print(json.dumps(ref["coverage"], indent=1))
    (HERE / "fit_bootstrap.json").write_text(json.dumps(ref, indent=1)
                                             + "\n")


if __name__ == "__main__":
    main()
