"""Independent reference for the residuals of two-way, three-way,
repeated-measures, nested and mixed models (FEATURE-PLAN P-11, second
part). R is not installed here, so the oracle is statsmodels:

- two-way with interaction: ols("y ~ C(A) * C(B)").resid (R's
  residuals(aov(y ~ A * B))), on a 2 x 3 table with 4 replicates (the
  plan's acceptance test: 24 cell-mean residuals) and on an unbalanced
  copy; main effects only: ols("y ~ C(A) + C(B)").resid.
- three-way: ols("y ~ C(A) * C(B) * C(C)").resid on 2 x 2 x 2 x 3.
- repeated-measures one-way, 6 subjects x 4 treatments:
  ols("y ~ C(subject) + C(treatment)").resid (the AnovaRM model).
- mixed repeated measures (one value missing) and nested (subcolumns
  within groups): MixedLM by REML, .resid = value - fixed effects -
  predicted random effects (conditional residuals, R's residuals(lmer)),
  standardized by sqrt(.scale).
The standardized residual of the OLS models is statsmodels'
resid_pearson (resid / sqrt(MS residual)).

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/anova_residuals.py
writes anova_residuals.json next to this file.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf

HERE = Path(__file__).resolve().parent

# cells[row][column] = replicates (2 rows x 3 data sets x 4 replicates)
TWO_WAY = [
    [[12.1, 13.4, 11.8, 12.9], [15.2, 14.8, 16.1, 15.5], [18.4, 17.2, 19.0, 18.1]],
    [[10.2, 11.5, 9.8, 10.9], [14.9, 13.1, 15.8, 14.0], [22.3, 20.8, 23.5, 21.1]],
]
# unbalanced: a value removed from two cells
TWO_WAY_UNBAL = [
    [[12.1, 13.4, 11.8], [15.2, 14.8, 16.1, 15.5], [18.4, 17.2, 19.0, 18.1]],
    [[10.2, 11.5, 9.8, 10.9], [14.9, 13.1], [22.3, 20.8, 23.5, 21.1]],
]
# cells[i][j][k] = replicates
THREE_WAY = [
    [[[5.1, 5.6, 4.9], [6.2, 6.8, 6.0]], [[7.4, 7.0, 7.9], [9.1, 8.7, 9.6]]],
    [[[4.2, 4.8, 4.5], [5.9, 6.3, 5.4]], [[8.8, 8.1, 9.3], [12.2, 11.6, 12.9]]],
]
# RM[subject][treatment]
RM = [[45.0, 50.1, 55.3, 58.2], [42.1, 46.0, 52.8, 55.0], [50.3, 53.9, 60.2, 61.8],
      [38.7, 44.2, 47.1, 51.9], [47.5, 49.8, 57.6, 60.1], [44.0, 47.3, 51.0, 57.4]]
# nested: groups -> subcolumns -> values
NESTED = [
    [[23.1, 24.5, 22.8, 25.0], [26.2, 27.1, 25.4], [21.9, 23.0, 22.4, 24.1]],
    [[29.8, 31.2, 30.5], [27.4, 28.9, 28.1, 29.6], [32.0, 33.4, 31.1, 32.7]],
]


def two_way(cells, formula):
    rows = [(i, j, v) for i, r in enumerate(cells) for j, c in enumerate(r) for v in c]
    d = pd.DataFrame(rows, columns=["A", "B", "y"])
    fit = smf.ols(formula, d).fit()
    return {"resid": fit.resid.tolist(), "pearson": fit.resid_pearson.tolist(),
            "df": int(fit.df_resid)}


def three_way():
    rows = [(i, j, k, v) for i, a in enumerate(THREE_WAY) for j, b in enumerate(a)
            for k, c in enumerate(b) for v in c]
    d = pd.DataFrame(rows, columns=["P", "Q", "R", "y"])
    fit = smf.ols("y ~ C(P) * C(Q) * C(R)", d).fit()
    return {"resid": fit.resid.tolist(), "pearson": fit.resid_pearson.tolist(),
            "df": int(fit.df_resid)}


def rm():
    rows = [(s, t, v) for s, r in enumerate(RM) for t, v in enumerate(r)]
    d = pd.DataFrame(rows, columns=["subject", "treatment", "y"])
    fit = smf.ols("y ~ C(subject) + C(treatment)", d).fit()
    return {"resid": fit.resid.tolist(), "pearson": fit.resid_pearson.tolist(),
            "df": int(fit.df_resid)}


def mixed_rm():
    # treatment-major order (the engine's), subject 3 missing treatment 2
    rows = [(s, t, RM[s][t]) for t in range(4) for s in range(6) if (s, t) != (2, 1)]
    d = pd.DataFrame(rows, columns=["subject", "treatment", "y"])
    fit = smf.mixedlm("y ~ C(treatment)", d, groups=d["subject"]).fit(reml=True)
    sd = float(np.sqrt(fit.scale))
    return {"resid": fit.resid.tolist(), "pearson": (fit.resid / sd).tolist(),
            "residual_sd": sd}


def nested():
    rows, sid = [], 0
    for g, subs in enumerate(NESTED):
        for vals in subs:
            for v in vals:
                rows.append((g, sid, v))
            sid += 1
    d = pd.DataFrame(rows, columns=["group", "sub", "y"])
    fit = smf.mixedlm("y ~ C(group)", d, groups=d["sub"]).fit(reml=True)
    sd = float(np.sqrt(fit.scale))
    return {"resid": fit.resid.tolist(), "pearson": (fit.resid / sd).tolist(),
            "residual_sd": sd}


def main():
    ref = {
        "two_way": two_way(TWO_WAY, "y ~ C(A) * C(B)"),
        "two_way_additive": two_way(TWO_WAY, "y ~ C(A) + C(B)"),
        "two_way_unbalanced": two_way(TWO_WAY_UNBAL, "y ~ C(A) * C(B)"),
        "two_way_unbalanced_additive": two_way(TWO_WAY_UNBAL, "y ~ C(A) + C(B)"),
        "three_way": three_way(), "rm": rm(), "mixed_rm": mixed_rm(), "nested": nested(),
        "data": {"two_way": TWO_WAY, "two_way_unbalanced": TWO_WAY_UNBAL,
                 "three_way": THREE_WAY, "rm": RM, "nested": NESTED},
    }
    (HERE / "anova_residuals.json").write_text(json.dumps(ref, indent=1) + "\n")


if __name__ == "__main__":
    main()
