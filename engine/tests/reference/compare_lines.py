"""Independent reference for comparing slopes and intercepts of linear
regression lines (FEATURE-PLAN P-13). R is not installed and the worked
example of Zar (Biostatistical Analysis, 5th ed. 2010, sec. 18.1-18.2,
pp. 363-371) could not be obtained (no copy of the book; no reproduction
of its data found), so the oracle is statsmodels 0.15 OLS (formula API):

- slopes: anova_lm(ols("y ~ x + C(g)"), ols("y ~ x * C(g)")), the F test
  of the interaction (R's anova(lm(y ~ x + g), lm(y ~ x * g)));
- intercepts: anova_lm(ols("y ~ x"), ols("y ~ x + C(g)"));
- common slope: the x coefficient of y ~ x + C(g) with its SE and 95% CI;
- slope difference (two lines): the x:C(g) coefficient of y ~ x * C(g)
  (line 2 minus line 1, negated here to be line 1 - line 2), its SE, CI;
- pooled line: ols("y ~ x") on all points.

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/compare_lines.py
writes compare_lines.json next to this file.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import statsmodels.formula.api as smf
from statsmodels.stats.anova import anova_lm

HERE = Path(__file__).resolve().parent

# Two parallel-ish lines (slopes not shown to differ, intercepts differ)
PARALLEL = {
    "x": [1, 2, 3, 4, 5, 6, 7, 8],
    "Control": [3.1, 5.2, 6.8, 9.1, 11.0, 12.7, 15.2, 16.9],
    "Treated": [6.0, 7.7, 10.1, 11.8, 14.2, 15.9, 17.8, 20.1],
}
# Two lines whose slopes differ
DIVERGING = {
    "x": [0, 2, 4, 6, 8, 10],
    "A": [1.2, 2.9, 5.1, 7.2, 8.8, 11.1],
    "B": [0.8, 4.1, 8.2, 11.9, 16.2, 19.7],
}
# Three lines with a missing value (X 5 in line "C"), slopes alike
THREE = {
    "x": [1, 2, 3, 4, 5, 6],
    "A": [2.0, 4.1, 5.9, 8.2, 9.9, 12.1],
    "B": [2.9, 5.2, 6.8, 9.1, 11.2, 12.8],
    "C": [1.1, 3.0, 5.2, 6.9, None, 11.0],
}


def frame(d):
    rows = []
    for g in [k for k in d if k != "x"]:
        for x, y in zip(d["x"], d[g]):
            if y is not None:
                rows.append({"x": float(x), "y": float(y), "g": g})
    return pd.DataFrame(rows)


def case(d):
    df = frame(d)
    groups = [k for k in d if k != "x"]
    df["g"] = pd.Categorical(df["g"], categories=groups)
    full = smf.ols("y ~ x * C(g)", df).fit()
    common = smf.ols("y ~ x + C(g)", df).fit()
    single = smf.ols("y ~ x", df).fit()
    a1 = anova_lm(common, full)
    a2 = anova_lm(single, common)
    ci = common.conf_int().loc["x"].tolist()
    out = {
        "data": d,
        "slopes_F": float(a1["F"].iloc[1]), "slopes_p": float(a1["Pr(>F)"].iloc[1]),
        "slopes_df": [float(a1["df_diff"].iloc[1]), float(a1["df_resid"].iloc[1])],
        "intercepts_F": float(a2["F"].iloc[1]), "intercepts_p": float(a2["Pr(>F)"].iloc[1]),
        "intercepts_df": [float(a2["df_diff"].iloc[1]), float(a2["df_resid"].iloc[1])],
        "common_slope": float(common.params["x"]),
        "common_slope_se": float(common.bse["x"]), "common_slope_ci": ci,
        "pooled_slope": float(single.params["x"]),
        "pooled_intercept": float(single.params["Intercept"]),
    }
    if len(groups) == 2:
        key = f"x:C(g)[T.{groups[1]}]"
        lo, hi = full.conf_int().loc[key].tolist()
        out["slope_difference"] = -float(full.params[key])
        out["slope_difference_se"] = float(full.bse[key])
        out["slope_difference_ci"] = [-hi, -lo]
    return out


def main():
    ref = {"parallel": case(PARALLEL), "diverging": case(DIVERGING),
           "three": case(THREE)}
    (HERE / "compare_lines.json").write_text(json.dumps(ref, indent=1) + "\n")


if __name__ == "__main__":
    main()
