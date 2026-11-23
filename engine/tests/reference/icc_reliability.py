"""Reference values for P-44 (reliability ICC): engine/tests/test_icc.py,
the e2e step and the ui-stage fixture.

R is not installed (psych::ICC, irr::icc not available). The oracles:
- the printed values of Shrout & Fleiss (1979), Psychol Bull 86:420-428:
  their example of 6 targets rated by 4 judges (the data below) and their
  table of the six estimates, ICC(1,1) = .17, ICC(2,1) = .29,
  ICC(3,1) = .71, ICC(1,4) = .44, ICC(2,4) = .62, ICC(3,4) = .91, from
  the mean squares BMS = 11.24, WMS = 6.26, JMS = 32.49, EMS = 1.02;
- pingouin 0.7 intraclass_corr (its own two-way ANOVA, McGraw & Wong 1996
  F-based CIs), unrounded (pingouin.options["round"] = None; its CIs stay
  rounded to 2 decimals), on the same data and on pingouin's "icc"
  dataset (8 wines rated by 4 judges);
- the CIs at full precision from McGraw & Wong (1996, Psychol Methods
  1:30-46) Table 7 transcribed below, with the mean squares from a
  statsmodels two-way ANOVA: cases 1 and 3 from F_L = F / F(1 - a/2; df1,
  df2) and F_U = F x F(1 - a/2; df2, df1); case 2A (absolute agreement)
  with a = k rho / (n (1 - rho)), b = 1 + k rho (n - 1) / (n (1 - rho)),
  v = (a MSC + b MSE)^2 / ((a MSC)^2 / (k - 1) + (b MSE)^2 / ((n - 1)
  (k - 1))) and L = n (MSR - F* MSE) / (F* (k MSC + (k n - k - n) MSE)
  + n MSR), F* = F(1 - a/2; n - 1, v), U likewise with F(1 - a/2; v, n - 1).

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/icc_reliability.py
"""
import json
import os

import pandas as pd
import pingouin as pg
import statsmodels.formula.api as smf
from scipy import stats
from statsmodels.stats.anova import anova_lm

HERE = os.path.dirname(__file__)

# Shrout & Fleiss (1979): rows = targets 1-6, columns = judges 1-4.
SHROUT_FLEISS = [[9, 2, 5, 8], [6, 1, 3, 2], [8, 4, 6, 8],
                 [7, 1, 2, 6], [10, 5, 6, 9], [6, 2, 4, 7]]
PUBLISHED = {"ICC1": 0.17, "ICC2": 0.29, "ICC3": 0.71,
             "ICC1k": 0.44, "ICC2k": 0.62, "ICC3k": 0.91}
PUBLISHED_MS = {"between_targets": 11.24, "within_targets": 6.26,
                "between_raters": 32.49, "residual": 1.02}
KEYS = {"ICC(1,1)": "ICC1", "ICC(A,1)": "ICC2", "ICC(C,1)": "ICC3",
        "ICC(1,k)": "ICC1k", "ICC(A,k)": "ICC2k", "ICC(C,k)": "ICC3k"}


def pingouin_icc(matrix):
    long = pd.DataFrame([{"target": i, "rater": j, "score": float(v)}
                         for i, row in enumerate(matrix)
                         for j, v in enumerate(row)])
    t = pg.intraclass_corr(data=long, targets="target", raters="rater",
                           ratings="score")
    return {KEYS[r.Type]: {"value": float(r.ICC), "F": float(r.F),
                           "df1": int(r.df1), "df2": int(r.df2),
                           "p": float(r.pval),
                           "ci": [float(c) for c in r.CI95]}
            for r in t.itertuples()}


def mcgraw_wong(matrix, level=0.95):
    n, k = len(matrix), len(matrix[0])
    long = pd.DataFrame([{"t": f"t{i}", "r": f"r{j}", "y": float(v)}
                         for i, row in enumerate(matrix)
                         for j, v in enumerate(row)])
    tab = anova_lm(smf.ols("y ~ C(t) + C(r)", data=long).fit())
    msr = tab.loc["C(t)", "mean_sq"]
    msc = tab.loc["C(r)", "mean_sq"]
    mse = tab.loc["Residual", "mean_sq"]
    msw = (tab.loc["C(r)", "sum_sq"] + tab.loc["Residual", "sum_sq"]) / (n * (k - 1))
    al = 1 - level
    q = stats.f.ppf

    def bounds(fobs, d1, d2):
        return fobs / q(1 - al / 2, d1, d2), fobs * q(1 - al / 2, d2, d1)
    fl1, fu1 = bounds(msr / msw, n - 1, n * (k - 1))
    fl3, fu3 = bounds(msr / mse, n - 1, (n - 1) * (k - 1))
    rho = (msr - mse) / (msr + (k - 1) * mse + k * (msc - mse) / n)
    a = k * rho / (n * (1 - rho))
    b = 1 + k * rho * (n - 1) / (n * (1 - rho))
    v = (a * msc + b * mse) ** 2 / ((a * msc) ** 2 / (k - 1)
                                    + (b * mse) ** 2 / ((n - 1) * (k - 1)))
    fs_l = q(1 - al / 2, n - 1, v)
    fs_u = q(1 - al / 2, v, n - 1)
    lo2 = n * (msr - fs_l * mse) / (fs_l * (k * msc + (k * n - k - n) * mse) + n * msr)
    hi2 = n * (fs_u * msr - mse) / (k * msc + (k * n - k - n) * mse + n * fs_u * msr)
    single = lambda fl, fu: [(fl - 1) / (fl + k - 1), (fu - 1) / (fu + k - 1)]
    average = lambda fl, fu: [1 - 1 / fl, 1 - 1 / fu]
    sb = lambda r: r * k / (1 + (k - 1) * r)    # Spearman-Brown to k raters
    return {"ms": {"between_targets": msr, "between_raters": msc,
                   "residual": mse, "within_targets": msw},
            "df_satterthwaite": v,
            "ci": {"ICC1": single(fl1, fu1), "ICC1k": average(fl1, fu1),
                   "ICC3": single(fl3, fu3), "ICC3k": average(fl3, fu3),
                   "ICC2": [lo2, hi2], "ICC2k": [sb(lo2), sb(hi2)]}}


def main():
    pg.options["round"] = None
    wine = pg.read_dataset("icc")
    wide = wine.pivot_table(index="Wine", columns="Judge", values="Scores")
    wine_matrix = [[float(v) for v in row] for row in wide.to_numpy()]
    ref = {
        "shrout_fleiss": {"matrix": SHROUT_FLEISS, "published": PUBLISHED,
                          "published_ms": PUBLISHED_MS,
                          "pingouin": pingouin_icc(SHROUT_FLEISS),
                          "mcgraw_wong": mcgraw_wong(SHROUT_FLEISS),
                          "mcgraw_wong_90": mcgraw_wong(SHROUT_FLEISS, 0.90)},
        "wine": {"matrix": wine_matrix, "judges": [str(c) for c in wide.columns],
                 "pingouin": pingouin_icc(wine_matrix),
                 "mcgraw_wong": mcgraw_wong(wine_matrix)},
    }
    with open(os.path.join(HERE, "icc_reliability.json"), "w") as fh:
        json.dump(ref, fh, indent=1)
    for k, v in ref.items():
        print(k, json.dumps(v["pingouin"], indent=None)[:900])
        print("  McGraw-Wong", v["mcgraw_wong"])


if __name__ == "__main__":
    main()
