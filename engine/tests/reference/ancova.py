"""Reference values for P-82 (baseline-adjusted comparison, ANCOVA):
engine/tests/test_ancova.py, the e2e step and the ui-stage fixture.

R is not installed (lm + emmeans + car::Anova not available). The oracle
is statsmodels:
- ols("post ~ C(group) + pre"): the adjusted difference (the group
  coefficient), its SE, t, P and 95% CI; R squared;
- the adjusted means (emmeans' estimated marginal means): the model's
  prediction for each group at the mean baseline of the analysed rows,
  get_prediction().summary_frame() for its SE and CI;
- anova_lm(typ=3) of ols("post ~ C(group, Sum) + pre") (car::Anova(type =
  3) with sum-to-zero contrasts) for the type III table;
- the equal-slopes check: anova_lm(main, ols("post ~ C(group) * pre")),
  the F test of the group x baseline interaction, and the slope of each
  group from the interaction model.
Vickers & Altman 2001 (BMJ 323:1123) frame the analysis.

Data: two groups of 10 (the plan's acceptance test), baseline and
follow-up of a continuous score, made up for this test; a three-group
set (unequal sizes, unequal slopes) for the multi-group paths.

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/ancova.py
"""
import json
import os

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from statsmodels.stats.anova import anova_lm

TWO = {
    "group": ["Control"] * 10 + ["Treated"] * 10,
    "pre": [52, 48, 61, 55, 44, 58, 50, 63, 47, 56,
            54, 60, 45, 51, 49, 62, 57, 46, 53, 59],
    "post": [50, 47, 57, 54, 45, 55, 49, 60, 44, 55,
             45, 52, 40, 43, 44, 53, 48, 39, 47, 50],
}
THREE = {
    "group": ["A"] * 7 + ["B"] * 6 + ["C"] * 8,
    "pre": [10.2, 12.5, 9.8, 14.1, 11.0, 13.3, 10.9,
            11.8, 13.9, 10.1, 12.2, 15.0, 9.5,
            12.0, 10.4, 13.6, 11.1, 14.8, 9.9, 12.7, 13.0],
    "post": [11.0, 13.1, 10.2, 15.0, 11.9, 13.8, 11.5,
             10.9, 12.0, 9.8, 11.1, 12.9, 9.6,
             16.2, 12.1, 18.0, 13.5, 19.9, 11.2, 16.4, 17.1],
}


def fit(data):
    df = pd.DataFrame(data)
    main = smf.ols("post ~ C(group) + pre", df).fit()
    inter = smf.ols("post ~ C(group) * pre", df).fit()
    typ3 = anova_lm(smf.ols("post ~ C(group, Sum) + pre", df).fit(), typ=3)
    slopes_test = anova_lm(main, inter)
    levels = sorted(df["group"].unique())
    ref = levels[0]
    xbar = float(df["pre"].mean())
    pred = main.get_prediction(pd.DataFrame({"group": levels, "pre": [xbar] * len(levels)}))
    frame = pred.summary_frame(alpha=0.05)
    ci = main.conf_int(alpha=0.05)
    diffs = []
    for lev in levels[1:]:
        name = f"C(group)[T.{lev}]"
        diffs.append({"level": lev, "vs": ref, "estimate": float(main.params[name]),
                      "se": float(main.bse[name]), "t": float(abs(main.tvalues[name])),
                      "p": float(main.pvalues[name]),
                      "ci": [float(ci.loc[name, 0]), float(ci.loc[name, 1])]})
    slopes = []
    for lev in levels:
        name = "pre" if lev == ref else f"C(group)[T.{lev}]:pre"
        c = np.zeros(len(inter.params))
        c[list(inter.params.index).index("pre")] = 1.0
        if lev != ref:
            c[list(inter.params.index).index(name)] = 1.0
        slopes.append({"level": lev, "slope": float(c @ inter.params.values),
                       "se": float(np.sqrt(c @ inter.cov_params().values @ c))})
    return {
        "data": data, "reference": ref, "baseline_mean": xbar, "df_resid": float(main.df_resid),
        "adjusted_means": [{"level": lev, "mean": float(frame["mean"].iloc[i]),
                            "se": float(frame["mean_se"].iloc[i]),
                            "ci": [float(frame["mean_ci_lower"].iloc[i]),
                                   float(frame["mean_ci_upper"].iloc[i])]}
                           for i, lev in enumerate(levels)],
        "differences": diffs,
        "baseline_slope": {"estimate": float(main.params["pre"]), "se": float(main.bse["pre"]),
                           "p": float(main.pvalues["pre"])},
        "type3": {row: {"ss": float(typ3.loc[row, "sum_sq"]), "df": float(typ3.loc[row, "df"]),
                        "F": float(typ3.loc[row, "F"]) if row != "Residual" else None,
                        "p": float(typ3.loc[row, "PR(>F)"]) if row != "Residual" else None}
                  for row in ("C(group, Sum)", "pre", "Residual")},
        "equal_slopes": {"F": float(slopes_test["F"].iloc[1]),
                         "df1": float(slopes_test["df_diff"].iloc[1]),
                         "df2": float(slopes_test["df_resid"].iloc[1]),
                         "p": float(slopes_test["Pr(>F)"].iloc[1]),
                         "slopes": slopes},
        "r_squared": float(main.rsquared),
        "adjusted_r_squared": float(main.rsquared_adj),
    }


def main():
    out = {"two_groups": fit(TWO), "three_groups": fit(THREE)}
    path = os.path.join(os.path.dirname(__file__), "ancova.json")
    with open(path, "w") as fh:
        json.dump(out, fh, indent=2)
    two = out["two_groups"]
    print(json.dumps({"difference": two["differences"], "adjusted_means": two["adjusted_means"],
                      "equal_slopes": two["equal_slopes"]}, indent=1))


if __name__ == "__main__":
    main()
