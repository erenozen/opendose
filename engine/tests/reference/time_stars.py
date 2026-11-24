"""Independent reference for stars at each time point (FEATURE-PLAN
P-105): a tumour-growth grouped table (rows = days, data sets = Vehicle
and Drug, 5 mice each) under the ordinary two-way ANOVA with Sidak
comparisons within each row. The oracle is statsmodels: OLS with
C(day) * C(group), the pooled residual mean square and df of that full
model, a t test of Drug against Vehicle at each day, and Sidak's
adjustment for the 4 comparisons of the family, 1 - (1 - p)^4 (Prism's
"correct for all comparisons", GraphPad Statistics Guide, "How Prism
computes multiple comparisons after two-way ANOVA").

Stars in the GraphPad style (report/pformat.ts): ns P > 0.05, * <= 0.05,
** <= 0.01, *** <= 0.001, **** <= 0.0001.

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/time_stars.py
writes time_stars.json next to this file.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from scipy import stats

HERE = Path(__file__).resolve().parent

DAYS = ["Day 0", "Day 7", "Day 14", "Day 21"]
VEHICLE = [[102, 98, 105, 95, 100], [180, 165, 172, 190, 176],
           [310, 290, 335, 300, 322], [520, 480, 545, 505, 530]]
DRUG = [[101, 97, 99, 103, 96], [150, 141, 156, 148, 152],
        [268, 276, 262, 289, 277], [300, 340, 285, 320, 310]]


def stars(p):
    if p <= 0.0001:
        return "****"
    if p <= 0.001:
        return "***"
    if p <= 0.01:
        return "**"
    if p <= 0.05:
        return "*"
    return "ns"


def main():
    rows = []
    for d, day in enumerate(DAYS):
        for g, vals in (("Vehicle", VEHICLE[d]), ("Drug", DRUG[d])):
            rows += [{"day": day, "group": g, "y": float(v)} for v in vals]
    df = pd.DataFrame(rows)
    fit = smf.ols("y ~ C(day) * C(group)", data=df).fit()
    mse, dfr = float(fit.mse_resid), float(fit.df_resid)
    out = []
    for d, day in enumerate(DAYS):
        v, g = np.mean(VEHICLE[d]), np.mean(DRUG[d])
        se = np.sqrt(mse * (1 / len(VEHICLE[d]) + 1 / len(DRUG[d])))
        p = 2 * stats.t.sf(abs(v - g) / se, dfr)
        p_adj = -np.expm1(len(DAYS) * np.log1p(-p))
        out.append({"day": day, "difference": float(v - g), "p": float(p),
                    "p_sidak": float(p_adj), "stars": stars(p_adj)})
    ref = {"days": DAYS, "vehicle": VEHICLE, "drug": DRUG,
           "ms_residual": mse, "df_residual": dfr, "comparisons": out}
    (HERE / "time_stars.json").write_text(json.dumps(ref, indent=1) + "\n")
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
