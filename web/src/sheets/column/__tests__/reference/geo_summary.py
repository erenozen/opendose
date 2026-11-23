"""Reference values for the geometric summaries of the column graphs
(graphSettings.ts summaryOf "geo_sd" / "geo_ci", P-25) and for the median
with IQR a rank test's graph defaults to (P-26).

R is not installed here, so the oracle is numpy and scipy:
- geometric mean exp(mean(log x)) = scipy.stats.gmean, geometric SD
  exp(std(log x, ddof=1)) (scipy.stats.gstd uses ddof=1 too; both are
  checked to agree), "x/÷": the bar ends g * s and g / s (Limpert & Stahel
  2011, PLoS ONE 6:e21403);
- 95% CI: exp(mean(l) -/+ t(0.975, n-1) * sd(l) / sqrt(n)), the t interval
  of the logs (scipy.stats.t.ppf) back-transformed;
- median and quartiles: numpy.percentile(method="linear") (Hyndman & Fan
  definition 7, the column statistics' default) and method="weibull"
  (definition 6, the "prism" method), as graph/boxStats.ts computes them.

Run from the repository root:
  /home/eren/opendose/.venv/bin/python \
    web/src/sheets/column/__tests__/reference/geo_summary.py
"""
import json
import math
import os

import numpy as np
from scipy import stats

HERE = os.path.dirname(os.path.abspath(__file__))

rng = np.random.default_rng(25)
CASES = {
    # the acceptance test: fold changes 0.5, 1, 2, 4
    "fold": [0.5, 1, 2, 4],
    "fold_x10": [5, 10, 20, 40],
    "one": [3.0],
    "equal": [2.0, 2.0, 2.0],
    "tiny": [1e-12, 3e-12, 9e-12],
    "huge": [1e12, 3e12, 9e12],
    "lognormal": [round(float(v), 4) for v in rng.lognormal(1.0, 0.6, 9)],
}


def geo(x):
    x = np.asarray(x, float)
    lx = np.log(x)
    n = len(x)
    g = float(np.exp(lx.mean()))
    s = float(np.exp(lx.std(ddof=1))) if n > 1 else 1.0
    assert math.isclose(g, float(stats.gmean(x)), rel_tol=1e-12)
    if n > 1 and len(set(x.tolist())) > 1:
        assert math.isclose(s, float(stats.gstd(x)), rel_tol=1e-12)
    if n > 1:
        h = float(stats.t.ppf(0.975, n - 1)) * float(lx.std(ddof=1)) / math.sqrt(n)
    else:
        h = 0.0
    return {"gmean": g, "gsd": s, "upper": g * s, "lower": g / s,
            "ci": [float(np.exp(lx.mean() - h)), float(np.exp(lx.mean() + h))]}


def quartiles(x):
    out = {}
    for m in ("linear", "weibull"):
        q = np.percentile(np.asarray(x, float), [25, 50, 75], method=m)
        out[m] = [float(v) for v in q]
    return out


def main():
    out = {k: {"values": v, **geo(v), "quartiles": quartiles(v)} for k, v in CASES.items()}
    # the example column table (sheets/column/index.ts columnSample):
    # median and IQR a rank test's graph defaults to (P-26)
    example = {
        "Control": [23.1, 25.4, 21.8, 24.9, 22.6, 26.0],
        "Treated A": [28.4, 30.2, 27.1, 31.5, 29.0, 28.8],
        "Treated B": [35.2, 33.9, 37.4, 34.1, 36.6, 35.8],
    }
    for name, v in example.items():
        out[f"example {name}"] = {"values": v, "quartiles": quartiles(v)}
    with open(os.path.join(HERE, "geo_summary.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1, sort_keys=True)
        fh.write("\n")
    for k, v in out.items():
        print(k, {kk: vv for kk, vv in v.items() if kk != "values"})


if __name__ == "__main__":
    main()
