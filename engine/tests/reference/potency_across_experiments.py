"""Independent reference for potency across experiments (FEATURE-PLAN P-08).

Run from the repository root:

    /home/eren/opendose/.venv/bin/python engine/tests/reference/potency_across_experiments.py

It writes engine/tests/reference/potency_across_experiments.json, which
engine/tests/test_potency.py reads (the e2e step in web/scripts/
e2e-check.mjs types the same table and asserts the same numbers at display
precision). Nothing here imports opendose: the fits use
scipy.optimize.curve_fit on the four-parameter logistic in log10
concentration, written out below, and the summary uses scipy.stats.t, with
scipy.stats.ttest_1samp and pingouin's ttest as cross-checks of the
interval. (R and drc are not installed; this is the Python oracle used in
their place.)

The dataset (the plan's acceptance test): 8 concentrations, 3 independent
experiments of 3 wells each, true IC50 50, 100 and 200 nM (Top 100,
Bottom 0, Hill slope 1), Gaussian noise SD 4 from numpy's default_rng(808),
rounded to one decimal so the e2e test can type the same strings.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pingouin as pg
from scipy import optimize, stats

OUT = Path(__file__).with_suffix(".json")

X_TEXT = ["1e-9", "3e-9", "1e-8", "3e-8", "1e-7", "3e-7", "1e-6", "3e-6"]
TRUE_LOG_IC50 = [math.log10(5e-8), math.log10(1e-7), math.log10(2e-7)]
WELLS = 3
SEED = 808
NOISE_SD = 4.0


def four_pl(logx, top, bottom, log_ic50, hill):
    """Y = Bottom + (Top - Bottom) / (1 + 10^((logX - logIC50) * hill)),
    hill > 0 for a falling (inhibitor) curve."""
    return bottom + (top - bottom) / (1.0 + 10.0 ** ((logx - log_ic50) * hill))


def dataset():
    rng = np.random.default_rng(SEED)
    logx = np.log10([float(v) for v in X_TEXT])
    rows = []  # rows x (experiments * wells), experiment-major subcolumns
    for lx in logx:
        row = []
        for li in TRUE_LOG_IC50:
            mu = four_pl(lx, 100.0, 0.0, li, 1.0)
            row += [round(float(mu + rng.normal(0.0, NOISE_SD)), 1) for _ in range(WELLS)]
        rows.append(row)
    return logx, rows


def fit_experiment(logx, rows, e):
    xs, ys = [], []
    for lx, row in zip(logx, rows):
        for v in row[e * WELLS:(e + 1) * WELLS]:
            xs.append(lx)
            ys.append(v)
    xs, ys = np.asarray(xs), np.asarray(ys)
    p0 = [ys.max(), ys.min(), float(np.median(xs)), 1.0]
    popt, pcov = optimize.curve_fit(four_pl, xs, ys, p0=p0, maxfev=20000)
    df = xs.size - 4
    se = np.sqrt(np.diag(pcov))
    t = stats.t.ppf(0.975, df)
    return {"top": popt[0], "bottom": popt[1], "log_ic50": popt[2], "hill": popt[3],
            "log_ic50_ci95": [popt[2] - t * se[2], popt[2] + t * se[2]],
            "df": int(df), "n_points": int(xs.size)}


def summary(logs, log10_molar=0.0):
    v = np.asarray(logs)
    n = v.size
    mean, sd = v.mean(), v.std(ddof=1)
    t = stats.t.ppf(0.975, n - 1)
    lo, hi = mean - t * sd / math.sqrt(n), mean + t * sd / math.sqrt(n)
    # cross-checks of the interval: scipy's one-sample t test and pingouin
    ci_scipy = stats.ttest_1samp(v, 0.0).confidence_interval(0.95)
    ci_pg = pg.ttest(v, 0.0, confidence=0.95)["CI95"].iloc[0]
    assert abs(ci_scipy.low - lo) < 1e-12 and abs(ci_scipy.high - hi) < 1e-12
    assert abs(ci_pg[0] - lo) < 1e-2 and abs(ci_pg[1] - hi) < 1e-2  # pingouin rounds
    return {"n": int(n), "df": int(n - 1), "mean_log": mean, "sd_log": sd,
            "t_crit": t, "ci95_log": [lo, hi],
            "geomean": 10 ** mean, "geomean_ci95": [10 ** lo, 10 ** hi],
            "p_mean": -(mean + log10_molar),
            "p_ci95": [-(hi + log10_molar), -(lo + log10_molar)],
            "ci_scipy_ttest_1samp": [float(ci_scipy.low), float(ci_scipy.high)],
            "ci_pingouin": [float(ci_pg[0]), float(ci_pg[1])]}


def main():
    logx, rows = dataset()
    fits = [fit_experiment(logx, rows, e) for e in range(len(TRUE_LOG_IC50))]
    logs = [f["log_ic50"] for f in fits]
    out = {
        "x": X_TEXT,
        "rows": rows,
        "experiments_of_subcolumn": [e for e in range(len(TRUE_LOG_IC50))
                                     for _ in range(WELLS)],
        "experiments": [{"name": f"Experiment {e + 1}", "ic50": 10 ** f["log_ic50"], **f}
                        for e, f in enumerate(fits)],
        "summary": summary(logs),
        # permuting the experiments changes nothing; scaling X by 10^k
        # shifts the mean logIC50 by k and leaves SD and CI width alone
        "invariance": {"permuted": summary(logs[::-1]),
                       "x_times_1e3": summary([v + 3 for v in logs])},
        "two_experiments": summary(logs[:2]),
    }
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    s = out["summary"]
    for e in out["experiments"]:
        print(f"{e['name']}: logIC50 {e['log_ic50']:.4f}  IC50 {e['ic50']:.4g} M")
    print(f"mean logIC50 {s['mean_log']:.4f}  SD {s['sd_log']:.4f}  95% CI "
          f"{s['ci95_log'][0]:.4f} to {s['ci95_log'][1]:.4f} "
          f"(t = {s['t_crit']:.4f}, df {s['df']})")
    print(f"pIC50 {s['p_mean']:.4f}  95% CI {s['p_ci95'][0]:.4f} to {s['p_ci95'][1]:.4f}")
    print(f"geometric-mean IC50 {s['geomean']:.4g} M  95% CI "
          f"{s['geomean_ci95'][0]:.4g} to {s['geomean_ci95'][1]:.4g}")


if __name__ == "__main__":
    main()
