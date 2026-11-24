"""Independent reference for comparing global models (FEATURE-PLAN P-99).

R is not installed, so `anova(nls_a, nls_b)` on an indicator-coded
global model is reproduced here with scipy: every model is written out
as ONE regression over the stacked data (the inhibitor concentration I
enters as a covariate column, so the "data sets" are just the rows with
the same I), fitted with scipy.optimize.least_squares from several
starts (not opendose.lsq / equations.fit_global_model), and compared
with the extra-sum-of-squares F test and AICc written out by hand
(Motulsky & Christopoulos 2004, Fitting Models to Biological Data Using
Linear and Nonlinear Regression, Oxford UP, ch. 22 (F) and ch. 23
(AICc: N ln(SS/N) + 2K + 2K(K + 1)/(N - K - 1), K = parameters + 1)).

Data:
- vmkmki: Michaelis-Menten kinetics with an inhibitor, 6 substrate x 6
  inhibitor concentrations in duplicate (72 rows), from the R package
  nlstools (Baty F, Ritz C, Charles S, Brutsche M, Flandrois J-P,
  Delignette-Muller M-L 2015, "A toolbox for nonlinear regression in R:
  the package nlstools", J Stat Softw 66(5):1-21; data "provided by the
  French research unit INRA UMR1233", help page ?michaelisdata). The
  values below were read from nlstools 2.0-1's data/vmkmki.rda. Neither
  the package nor the paper prints fitted values or a model comparison
  for these data, so every number here is this script's.
- a synthetic mixed-inhibition data set (Alpha = 3, seeded noise) on
  which the mixed model's optimum is interior (on vmkmki it runs to the
  uncompetitive limit Alpha -> 0).

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/compare_global_models.py
writes compare_global_models.json next to this file.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from scipy import optimize, stats

HERE = Path(__file__).resolve().parent

S = [200.0] * 12 + [100.0] * 12 + [50.0] * 12 + [25.0] * 12 + [12.5] * 12 + [0.0] * 12
I = [0.0, 0.0, 6.25, 6.25, 12.5, 12.5, 25.0, 25.0, 50.0, 50.0, 100.0, 100.0] * 6
V = [18.1, 18.8, 17.7, 18.1, 16.4, 17.6, 13.7, 15.5, 11.0, 12.7, 8.2, 7.7,
     15.4, 17.6, 15.6, 16.7, 16.2, 15.7, 12.8, 14.1, 11.3, 11.3, 7.6, 7.8,
     14.7, 13.7, 13.5, 13.4, 12.7, 12.9, 11.2, 10.9, 9.9, 9.2, 7.8, 7.9,
     7.2, 10.4, 7.8, 10.3, 8.3, 10.8, 9.5, 8.7, 6.0, 7.8, 5.5, 6.6,
     5.9, 7.7, 7.1, 7.7, 6.7, 6.8, 6.6, 6.9, 5.6, 4.9, 4.9, 5.5,
     0.0] + [0.0] * 11


# the four inhibition models, parameters on a log scale where they must
# stay positive (an unconstrained reparameterisation: same optimum)
def competitive(t, s, i):
    vmax, km, ki = t[0], np.exp(t[1]), np.exp(t[2])
    return vmax * s / (km * (1 + i / ki) + s)


def noncompetitive(t, s, i):
    vmax, km, ki = t[0], np.exp(t[1]), np.exp(t[2])
    return vmax / (1 + i / ki) * s / (km + s)


def uncompetitive(t, s, i):
    vmax, km, aki = t[0], np.exp(t[1]), np.exp(t[2])
    f = 1 + i / aki
    return (vmax / f) * s / (km / f + s)


def mixed(t, s, i):
    vmax, km, ki, alpha = t[0], np.exp(t[1]), np.exp(t[2]), np.exp(t[3])
    vapp = vmax / (1 + i / (alpha * ki))
    kapp = km * (1 + i / ki) / (1 + i / (alpha * ki))
    return vapp * s / (kapp + s)


MODELS = {"competitive_inhibition": (competitive, 3),
          "noncompetitive_inhibition": (noncompetitive, 3),
          "uncompetitive_inhibition": (uncompetitive, 3),
          "mixed_model_inhibition": (mixed, 4)}


def fit(name, s, i, v):
    f, k = MODELS[name]
    s, i, v = map(np.asarray, (s, i, v))

    def resid(t):
        with np.errstate(all="ignore"):
            r = v - f(t, s, i)
        return np.where(np.isfinite(r), r, 1e6)
    best = None
    for vmax in (15.0, 20.0, 30.0):
        for lkm in (math.log(5), math.log(20), math.log(60)):
            for lki in (math.log(5), math.log(30), math.log(150)):
                starts = [[vmax, lkm, lki]] if k == 3 else [
                    [vmax, lkm, lki, la] for la in (-6.0, -2.0, 0.0, 1.0, 3.0)]
                for t0 in starts:
                    r = optimize.least_squares(resid, t0, method="lm",
                                               xtol=1e-15, ftol=1e-15,
                                               gtol=1e-15, max_nfev=20000)
                    ss = float(r.fun @ r.fun)
                    if best is None or ss < best[0]:
                        best = (ss, r.x)
    return {"ss": best[0], "df": len(v) - k, "k": k, "n": len(v),
            "theta": [float(x) for x in best[1]]}


def aicc(ss, n, k_params):
    k = k_params + 1
    return n * math.log(ss / n) + 2 * k + 2 * k * (k + 1) / (n - k - 1)


def compare(a, b):
    """a = the simpler model (more df), b = the more complex one."""
    out = {}
    if a["df"] > b["df"]:
        dfn, dfd = a["df"] - b["df"], b["df"]
        f = max(((a["ss"] - b["ss"]) / dfn) / (b["ss"] / dfd), 0.0)
        out["F"] = f
        out["dfn"], out["dfd"] = dfn, dfd
        out["p"] = float(stats.f.sf(f, dfn, dfd))
    a1, a2 = aicc(a["ss"], a["n"], a["k"]), aicc(b["ss"], b["n"], b["k"])
    out.update({"aicc_1": a1, "aicc_2": a2, "delta": a2 - a1,
                "probability_1": 1 / (1 + math.exp(-0.5 * (a2 - a1)))})
    return out


def synthetic():
    rng = np.random.default_rng(20261124)
    s_levels = [2.0, 5.0, 10.0, 20.0, 50.0, 100.0, 200.0]
    i_levels = [0.0, 10.0, 30.0, 90.0]
    s, i = [], []
    for il in i_levels:
        for sl in s_levels:
            s += [sl, sl]
            i += [il, il]
    t = [50.0, math.log(25.0), math.log(15.0), math.log(3.0)]
    v = mixed(t, np.asarray(s), np.asarray(i)) + rng.normal(0, 1.2, len(s))
    return s, i, [round(float(x), 3) for x in v]


def main():
    out = {"vmkmki": {"S": S, "I": I, "v": V, "fits": {}, "comparisons": {}},
           "synthetic": {}}
    fits = {m: fit(m, S, I, V) for m in MODELS}
    out["vmkmki"]["fits"] = fits
    for simple in ("competitive_inhibition", "noncompetitive_inhibition",
                   "uncompetitive_inhibition"):
        out["vmkmki"]["comparisons"][f"{simple}|mixed_model_inhibition"] = \
            compare(fits[simple], fits["mixed_model_inhibition"])
    out["vmkmki"]["comparisons"]["competitive_inhibition|noncompetitive_inhibition"] = \
        compare(fits["competitive_inhibition"], fits["noncompetitive_inhibition"])
    s, i, v = synthetic()
    sf = {m: fit(m, s, i, v) for m in ("competitive_inhibition", "mixed_model_inhibition")}
    out["synthetic"] = {"S": s, "I": i, "v": v, "fits": sf,
                        "comparison": compare(sf["competitive_inhibition"],
                                              sf["mixed_model_inhibition"])}
    (HERE / "compare_global_models.json").write_text(json.dumps(out, indent=1) + "\n")
    for k, c in out["vmkmki"]["comparisons"].items():
        print(k, {kk: round(vv, 6) if isinstance(vv, float) else vv for kk, vv in c.items()})
    print("synthetic", out["synthetic"]["comparison"])


if __name__ == "__main__":
    main()
