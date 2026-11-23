"""Reference values for P-42 (Passing-Bablok and Theil-Sen regression):
engine/tests/test_method_regression.py, the e2e step and the ui-stage
fixture.

R is not installed, so mcr::mcreg(method.reg = "PaBa") could not be run,
and mcr's creatinine example data are not available as text (only as
data/creatinine.rda in the package, which this machine cannot read):
the plan's creatinine acceptance values are NOT pinned. Instead:

- Passing-Bablok: an independent direct implementation below, written
  from Passing & Bablok (1983, J Clin Chem Clin Biochem 21:709-720) as
  restated in the NCSS documentation chapter "Passing-Bablok Regression
  for Method Comparison" (procedure 313): every pairwise slope as an
  exact fraction of the decimals as typed (fractions.Fraction("4.86"), so
  "S = -1" and "S < -1" are exact comparisons), the pairs taken in the data's own order with
  "x_i = x_j, y_i > y_j -> +inf, y_i < y_j -> -inf" exactly as NCSS
  states it (the engine orders the points first and uses +inf only),
  the median shifted by K, the CI ranks M1 = round((N - C) / 2),
  M2 = N - M1 + 1, the intercept and its CI as medians of y - b x.
  The CUSUM linearity test follows NCSS's steps 1-6 (scores
  sqrt(n_neg / n_pos) and -sqrt(n_pos / n_neg), order by
  D = (y + x / b - a) / sqrt(1 + 1 / b^2), H = max |cusum| /
  sqrt(n_neg + 1)); P from scipy.stats.kstwobign.
- Theil-Sen: scipy.stats.theilslopes (method "separate"), Kendall's tau:
  scipy.stats.kendalltau.

Data:
- GIAVARINA: Giavarina D (2015), "Understanding Bland Altman analysis",
  Biochem Med 25:141-151, Table 1 (30 samples, method A and method B), as
  shipped in pingouin's datasets (pingouin.read_dataset("blandaltman")).
  The article prints its Passing-Bablok line: "y = 7.08 (-0.30 to 19.84)
  + 1.06 (1.02 to 1.09) x" (checked in the test; the direct
  implementation below reproduces it).
- EJECTION: Bland & Altman (2007), J Biopharm Stat 17:571, Table 1
  (RV and IC ejection fraction, 60 pairs; ties in both methods).
- TIES: a small hand-made set with repeated method-1 values (vertical
  pairs), a slope of exactly -1 and slopes below -1.

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/method_regression.py
"""
import json
import math
import os
from fractions import Fraction

import numpy as np
import pingouin as pg
from scipy import stats

HERE = os.path.dirname(__file__)


def ejection():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "mce", os.path.join(HERE, "..", "test_methodcomp_extras.py"))
    src = open(spec.origin).read()
    start = src.index("EJECTION = [")
    ns = {}
    exec(src[start:src.index("]\n", start) + 2], ns)
    return [r[1] for r in ns["EJECTION"]], [r[2] for r in ns["EJECTION"]]


TIES_X = [1.0, 2.0, 2.0, 2.5, 3.0, 4.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]
TIES_Y = [1.2, 1.9, 2.6, 2.5, 2.0, 4.1, 3.6, 5.3, 5.9, 7.4, 7.7, 9.6, 9.8]


def _median(v):
    s = sorted(v)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def passing_bablok_direct(x, y, level=0.95):
    n = len(x)
    # the decimals as typed (Fraction("4.86")), not their binary values
    fx = [Fraction(repr(v)) for v in x]
    fy = [Fraction(repr(v)) for v in y]
    inf = float("inf")
    slopes = []          # (sort key, float value)
    for i in range(n):
        for j in range(i + 1, n):
            dx, dy = fx[i] - fx[j], fy[i] - fy[j]
            if dx == 0:
                if dy == 0:
                    continue             # 0/0: omitted
                slopes.append((inf if dy > 0 else -inf,
                               inf if dy > 0 else -inf))
                continue
            s = dy / dx
            if s == -1:
                continue                 # omitted
            slopes.append((s, float(s)))
    slopes.sort(key=lambda t: t[0])
    big_n = len(slopes)
    k = sum(1 for s, _ in slopes if s < -1)
    vals = [v for _, v in slopes]
    if big_n % 2:
        b = vals[(big_n + 1) // 2 + k - 1]
    else:
        b = (vals[big_n // 2 + k - 1] + vals[big_n // 2 + k]) / 2
    z = stats.norm.ppf((1 + level) / 2)
    c = z * math.sqrt(n * (n - 1) * (2 * n + 5) / 18)
    m1 = int(math.floor((big_n - c) / 2 + 0.5))
    m2 = big_n - m1 + 1
    lo, hi = vals[m1 + k - 1], vals[m2 + k - 1]
    a = _median([yy - b * xx for xx, yy in zip(x, y)])
    a_lo = _median([yy - hi * xx for xx, yy in zip(x, y)])
    a_hi = _median([yy - lo * xx for xx, yy in zip(x, y)])
    return {"slope": b, "slope_ci": [lo, hi], "intercept": a,
            "intercept_ci": [a_lo, a_hi], "N": big_n, "K": k,
            "M1": m1, "M2": m2, "cusum": cusum(x, y, a, b)}


def cusum(x, y, a, b):
    res = [yy - a - b * xx for xx, yy in zip(x, y)]
    npos = sum(1 for r in res if r > 0)
    nneg = sum(1 for r in res if r < 0)
    score = [math.sqrt(nneg / npos) if r > 0 else
             (-math.sqrt(npos / nneg) if r < 0 else 0.0) for r in res]
    d = [(yy + xx / b - a) / math.sqrt(1 + 1 / b ** 2)
         for xx, yy in zip(x, y)]
    order = sorted(range(len(x)), key=lambda i: d[i])
    run, mx = 0.0, 0.0
    for i in order:
        run += score[i]
        mx = max(mx, abs(run))
    h = mx / math.sqrt(nneg + 1)
    return {"n_above": npos, "n_below": nneg, "max_cusum": mx, "H": h,
            "p": float(stats.kstwobign.sf(h))}


def oracle(x, y):
    ts = stats.theilslopes(y, x, 0.95, method="separate")
    kt = stats.kendalltau(x, y)
    return {
        "x": x, "y": y,
        "passing_bablok": passing_bablok_direct(x, y),
        "passing_bablok_90": passing_bablok_direct(x, y, 0.90),
        "theil_sen": {"slope": float(ts.slope),
                      "intercept": float(ts.intercept),
                      "slope_ci": [float(ts.low_slope),
                                   float(ts.high_slope)]},
        "kendall": {"tau": float(kt.statistic), "p": float(kt.pvalue)},
    }


def main():
    d = pg.read_dataset("blandaltman")
    rv, ic = ejection()
    ref = {
        "giavarina": oracle([float(v) for v in d["A"]],
                            [float(v) for v in d["B"]]),
        "ejection": oracle(rv, ic),
        "ties": oracle(TIES_X, TIES_Y),
    }
    with open(os.path.join(HERE, "method_regression.json"), "w") as fh:
        json.dump(ref, fh, indent=1)
    for k, v in ref.items():
        print(k, {kk: vv for kk, vv in v.items() if kk not in ("x", "y")})


if __name__ == "__main__":
    main()
