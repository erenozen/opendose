"""Reference values for the Schild plot (P-49): engine/tests/test_schild_plot.py,
the e2e step in web/scripts/e2e-check.mjs and the ui-stage fixture.

The EC50-shift example: an agonist dose-response curve (X = log10 agonist,
9 doses from 1e-11 to 1e-3 M, duplicates) without antagonist and with five
antagonist concentrations, simulated from the Gaddum/Schild model with
pA2 = 7.5, Schild slope 1, LogEC50 -8, Hill slope 1, Top 100, Bottom 0 and
Gaussian noise (SD 3, numpy seed 2026), rounded to 2 decimals. The rounded
values are the data (schild_example.json), typed into the app as text.

Schild analysis (Arunlakshana & Schild 1959, Br J Pharmacol 14:48):
1. each curve's LogEC50 with Top, Bottom and HillSlope shared (parallel
   curves): here scipy.optimize.least_squares on a model written out
   below, independent of engine/opendose/schild.py and its lsq module;
2. dose ratio DR = 10^(LogEC50(B) - LogEC50(control));
3. ordinary least squares of log10(DR - 1) on log10[B]: statsmodels OLS
   (R is not installed; statsmodels' OLS gives what R's lm prints:
   coefficients, SEs, t-based 95% CIs on n - 2 df, R^2), and the t test of
   slope = 1 (statsmodels t_test).

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/schild_plot.py
"""
import json
import math
import os

import numpy as np
import statsmodels.api as sm
from scipy.optimize import least_squares

TRUTH = {"Top": 100.0, "Bottom": 0.0, "LogEC50": -8.0, "HillSlope": 1.0,
         "pA2": 7.5, "SchildSlope": 1.0}
B = [0.0, 3e-8, 1e-7, 3e-7, 1e-6, 1e-5]
X = [float(v) for v in np.linspace(-11, -3, 9)]


def model(x, b, p):
    antag = 1.0 + (b / 10.0 ** (-p["pA2"])) ** p["SchildSlope"] if b > 0 else 1.0
    log_ec = p["LogEC50"] + math.log10(antag)
    return p["Bottom"] + (p["Top"] - p["Bottom"]) / (1.0 + 10.0 ** ((log_ec - x) * p["HillSlope"]))


rng = np.random.default_rng(2026)
ys = []  # ys[curve][dose] = [rep1, rep2]
for b in B:
    rows = []
    for x in X:
        mu = model(x, b, TRUTH)
        rows.append([round(float(mu + rng.normal(0, 3)), 2) for _ in range(2)])
    ys.append(rows)
names = ["Control" if b == 0 else f"{b:g} M" for b in B]

# 1. parallel curves: shared Top, Bottom, HillSlope; one LogEC50 per curve
xs = np.repeat(X, 2)


def resid(theta):
    top, bottom, hill = theta[:3]
    out = []
    for i in range(len(B)):
        y = np.array(ys[i]).ravel()
        pred = bottom + (top - bottom) / (1.0 + 10.0 ** ((theta[3 + i] - xs) * hill))
        out.append(y - pred)
    return np.concatenate(out)


theta0 = [100.0, 0.0, 1.0] + [-8.0 + math.log10(1 + b / 10 ** -7.5) for b in B]
fit = least_squares(resid, theta0, method="lm", xtol=1e-15, ftol=1e-15, gtol=1e-15)
log_ec50 = [float(v) for v in fit.x[3:]]
J = fit.jac
dfp = xs.size * len(B) - len(theta0)
s2 = float(fit.fun @ fit.fun) / dfp
cov = np.linalg.inv(J.T @ J) * s2
se = [float(v) for v in np.sqrt(np.diag(cov))[3:]]

# 2-3. dose ratios and the Schild regression
dr = [10 ** (le - log_ec50[0]) for le in log_ec50[1:]]
lx = np.log10(B[1:])
ly = np.log10(np.array(dr) - 1.0)
ols = sm.OLS(ly, sm.add_constant(lx)).fit()
ci = ols.conf_int(0.05)
tt = ols.t_test("x1 = 1")
ref = {
    "data": {"x": X, "antagonist": B, "names": names, "ys": ys},
    "truth": TRUTH,
    "parallel": {"top": float(fit.x[0]), "bottom": float(fit.x[1]), "hill": float(fit.x[2]),
                 "log_ec50": log_ec50, "log_ec50_se": se},
    "dose_ratio": dr,
    "log_antagonist": [float(v) for v in lx],
    "log_dr_minus_1": [float(v) for v in ly],
    "ols": {
        "slope": float(ols.params[1]), "intercept": float(ols.params[0]),
        "slope_se": float(ols.bse[1]), "intercept_se": float(ols.bse[0]),
        "slope_ci95": [float(ci[1][0]), float(ci[1][1])],
        "intercept_ci95": [float(ci[0][0]), float(ci[0][1])],
        "r_squared": float(ols.rsquared), "df": int(ols.df_resid),
        "t_slope_1": float(np.asarray(tt.tvalue).ravel()[0]),
        "p_slope_1": float(np.asarray(tt.pvalue).ravel()[0]),
        "pA2_from_plot": float(ols.params[0] / ols.params[1]),
    },
}
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "schild_example.json"), "w") as f:
    json.dump(ref, f, indent=1)
    f.write("\n")
o = ref["ols"]
print(f"log EC50 {np.round(log_ec50, 4)}")
print(f"dose ratios {np.round(dr, 3)}")
print(f"slope {o['slope']:.6f} SE {o['slope_se']:.6f} CI {o['slope_ci95']}")
print(f"intercept {o['intercept']:.6f}; pA2 from plot {o['pA2_from_plot']:.6f}; R2 {o['r_squared']:.6f}")
print(f"t(slope=1) {o['t_slope_1']:.6f} P {o['p_slope_1']:.6f}")
