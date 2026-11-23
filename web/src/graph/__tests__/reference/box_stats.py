"""Reference box statistics for graph/__tests__/boxStats.test.ts and the
box-plot step of scripts/e2e-figures.mjs.

R is not installed here, so the oracle is numpy: percentile(method="linear")
is Hyndman & Fan definition 7 (R quantile(type = 7)) and
percentile(method="weibull") is definition 6 (R quantile(type = 6)); see the
numpy.percentile documentation, which lists both by their H&F numbers. The
script also checks that the engine's columnstats.percentile(method="prism")
equals definition 6 on every data set below, which is the claim the column
statistics make ("rank (n + 1)p").

Tukey whiskers: the most extreme values within 1.5 x IQR of the box
(Tukey 1977; what R's boxplot.stats draws, though R takes the box from
Tukey's hinges, fivenum(), not from a percentile definition).

Run from the repository root:
  PYTHONPATH=engine /home/eren/opendose/.venv/bin/python \
    web/src/graph/__tests__/reference/box_stats.py
"""
import json

import numpy as np

from opendose.columnstats import percentile as engine_percentile

DATA = {
    "acceptance": [1, 2, 3, 4, 5, 6, 7, 8, 9, 100],
    "odd": [3.1, 0.4, 2.2, 9.9, 5.0, 4.4, 1.7],
    "ties": [2, 2, 2, 2, 5, 5, 9],
    "two": [4.0, 6.0],
}
METHODS = {"linear": "linear", "prism": "weibull"}


def box(values, method, rule):
    a = np.sort(np.asarray(values, dtype=float))
    q = lambda p: float(np.percentile(a, p, method=METHODS[method]))  # noqa: E731
    q1, med, q3 = q(25), q(50), q(75)
    if rule == "tukey":
        lo, hi = q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
        lf, uf = float(a[a >= lo].min()), float(a[a <= hi].max())
    elif rule == "minmax":
        lf, uf = float(a[0]), float(a[-1])
    else:
        p = {"p10_90": (10, 90), "p5_95": (5, 95), "p2_5_97_5": (2.5, 97.5)}[rule]
        lf, uf = min(q(p[0]), q1), max(q(p[1]), q3)
    return {"q1": q1, "median": med, "q3": q3, "lowerfence": lf, "upperfence": uf}


out = {}
for name, values in DATA.items():
    for p in (2.5, 5, 10, 25, 50, 75, 90, 95, 97.5):
        eng = engine_percentile(values, p, method="prism")
        ref = float(np.percentile(values, p, method="weibull"))
        assert abs(eng - ref) < 1e-12, (name, p, eng, ref)
    out[name] = {m: {r: box(values, m, r) for r in
                     ("tukey", "minmax", "p10_90", "p5_95", "p2_5_97_5")}
                 for m in METHODS}
print(json.dumps(out, indent=1))
