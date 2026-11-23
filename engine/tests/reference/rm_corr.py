"""Reference values for P-27 (repeated-measures correlation):
engine/tests/test_rm_corr.py, the e2e step and the ui-stage fixture.

Data: Bland & Altman (1995, BMJ 310:446) intramural pH and PaCO2, 47
observations of 8 subjects, as shipped in pingouin's datasets
(pingouin.read_dataset("rm_corr")).

R is not installed (rmcorr not available). The oracles:
- pingouin 0.7 rm_corr (r, df, P, 95% CI by Fisher's z);
- statsmodels OLS of PaCO2 ~ C(Subject) + pH with anova_lm (type II):
  r_rm = sign(slope) sqrt(SS_pH / (SS_pH + SS_residual)), the definition
  of Bakdash & Marusich (2017, Front Psychol 8:456), and the slope;
- the published values: r_rm = -0.507, df = 38, 95% CI -0.71 to -0.23
  (Bakdash & Marusich 2017, the Bland & Altman example).

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/rm_corr.py
"""
import json
import math
import os

import pingouin as pg
import statsmodels.formula.api as smf
from statsmodels.stats.anova import anova_lm


def main():
    d = pg.read_dataset("rm_corr")
    pr = pg.rm_corr(data=d, x="pH", y="PacO2", subject="Subject")
    fit = smf.ols("PacO2 ~ C(Subject) + pH", data=d).fit()
    tab = anova_lm(fit, typ=2)
    ss_x, ss_res = tab.loc["pH", "sum_sq"], tab.loc["Residual", "sum_sq"]
    slope = float(fit.params["pH"])
    r_ancova = math.copysign(math.sqrt(ss_x / (ss_x + ss_res)), slope)
    ref = {
        "subject": [int(v) for v in d.Subject], "x": [float(v) for v in d.pH],
        "y": [float(v) for v in d.PacO2],
        "r": float(pr["r"].iloc[0]), "df": int(pr["dof"].iloc[0]),
        "p": float(pr["pval"].iloc[0]),
        "ci": [float(v) for v in pr["CI95"].iloc[0]],
        "r_ancova": r_ancova, "slope": slope,
        "df_ancova": int(tab.loc["Residual", "df"]),
        "published": {"r": -0.507, "df": 38, "ci": [-0.71, -0.23]},
    }
    path = os.path.join(os.path.dirname(__file__), "rm_corr.json")
    with open(path, "w") as fh:
        json.dump(ref, fh, indent=1)
    print({k: v for k, v in ref.items() if k not in ("subject", "x", "y")})


if __name__ == "__main__":
    main()
