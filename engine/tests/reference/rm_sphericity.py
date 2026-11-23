"""Reference values for P-40 (Mauchly's test, the Huynh-Feldt epsilon and
partial omega squared in repeated-measures ANOVA):
engine/tests/test_rm_sphericity.py, the e2e step and the ui-stage fixture.

R is not installed. The oracles:
- pingouin 0.7 `sphericity` (Mauchly's W, chi-square, df, P; the same
  second-order P as R's mauchly.test), `epsilon` (Geisser-Greenhouse,
  Huynh-Feldt, lower bound), `rm_anova` and `mixed_anova` (sums of squares
  and the Geisser-Greenhouse epsilon of the mixed design's pooled
  within-group covariance);
- statsmodels OLS + anova_lm for the one-way design's sums of squares
  (y ~ C(subject) + C(treatment)), independent of pingouin;
- the Huynh-Feldt epsilon of the mixed design with Lecoutre's (1991)
  correction, ((N - g + 1) d GG - 2) / (d (N - g - d GG)), written out
  here from the formula R car::Anova and afex use (pingouin reports only
  GG for a mixed design); for one group it is pingouin.epsilon("hf");
- partial omega squared from the sums of squares above with the formula
  of R effectsize::omega_squared(partial = TRUE) for designs with an
  Error() stratum (effectsize R/eta_squared-main.R, .es_aov_strata):
  (SS_eff - df_eff MS_err) / (SS_eff + [within] SS_err + SS_subj + MS_subj),
  floored at 0 (Olejnik & Algina 2003, Psychol Methods 8:434).

Data: a 10-subject, 4-condition table typed for this test (the plan's
acceptance test); pingouin's rm_anova2 dataset (10 subjects, Time 2 x
Metric 3, both repeated); pingouin's mixed_anova dataset (60 subjects in
2 groups, 3 time points); the 10 x 4 table split into two groups of 5
(typed_mixed).

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/rm_sphericity.py
"""
import json
import os

import numpy as np
import pandas as pd
import pingouin as pg
import statsmodels.formula.api as smf
from scipy import stats
from statsmodels.stats.anova import anova_lm

ONE_WAY = [  # rows = subjects, columns = conditions
    [12.1, 14.3, 15.0, 19.8], [10.4, 11.9, 13.7, 14.2],
    [13.8, 15.1, 18.2, 24.9], [9.7, 10.2, 12.5, 13.1],
    [11.2, 13.8, 14.1, 20.3], [12.9, 13.5, 16.8, 17.0],
    [10.8, 12.7, 13.2, 21.6], [14.2, 15.9, 17.4, 18.1],
    [11.5, 12.0, 15.3, 22.7], [13.1, 14.6, 16.0, 16.4],
]
NAMES = ["Vehicle", "Low", "Mid", "High"]


def omega_p(ss, df, ss_err, df_err, ss_subj, df_subj, within=True):
    ms_err, ms_subj = ss_err / df_err, ss_subj / df_subj
    den = ss + (ss_err if within else 0.0) + ss_subj + ms_subj
    return max(0.0, (ss - df * ms_err) / den)


def lecoutre_hf(gg, d, n, g):
    return min(((n - g + 1) * d * gg - 2) / (d * (n - g - d * gg)), 1.0)


def one_way():
    wide = pd.DataFrame(ONE_WAY, columns=NAMES)
    W, chi2, dof, p = pg.sphericity(wide)[1:]
    gg = pg.epsilon(wide, correction="gg")
    hf = pg.epsilon(wide, correction="hf")
    lb = pg.epsilon(wide, correction="lb")
    long = wide.reset_index().melt(id_vars="index", var_name="cond",
                                   value_name="y")
    fit = smf.ols("y ~ C(index) + C(cond)", data=long).fit()
    tab = anova_lm(fit, typ=1)
    ss_t, df_t = tab.loc["C(cond)", ["sum_sq", "df"]]
    ss_s, df_s = tab.loc["C(index)", ["sum_sq", "df"]]
    ss_e, df_e = tab.loc["Residual", ["sum_sq", "df"]]
    f = (ss_t / df_t) / (ss_e / df_e)
    aov = pg.rm_anova(long, dv="y", within="cond", subject="index",
                      correction=True)
    return {
        "data": ONE_WAY, "names": NAMES,
        "mauchly_W": float(W), "mauchly_chi2": float(chi2),
        "mauchly_df": int(dof), "mauchly_p": float(p),
        "gg": float(gg), "hf": float(hf), "lb": float(lb),
        "hf_lecoutre_g1": lecoutre_hf(gg, 3, 10, 1),
        "F": float(f),
        "p_gg_pingouin": float(aov["p_GG_corr"].iloc[0]),
        "p_hf": float(stats.f.sf(f, df_t * hf, df_e * hf)),
        "partial_omega2": omega_p(ss_t, df_t, ss_e, df_e, ss_s, df_s),
        "partial_eta2": float(ss_t / (ss_t + ss_e)),
    }


def both():
    d = pg.read_dataset("rm_anova2")
    rows, cols = ["Product", "Client", "Action"], ["Pre", "Post"]
    subjects = sorted(d.Subject.unique())
    # cells[row][col] = subject values (subject order fixed)
    cells = [[[float(d[(d.Metric == r) & (d.Time == c)
                       & (d.Subject == s)].Performance.iloc[0])
               for s in subjects] for c in cols] for r in rows]
    aov = pg.rm_anova(d, dv="Performance", within=["Metric", "Time"],
                      subject="Subject", detailed=True)
    by = {s: aov[aov.Source == s].iloc[0] for s in aov.Source}
    out = {"cells": cells, "row_names": rows, "col_names": cols}
    # pingouin's two-way table: SS and the error SS of each term
    ss_subj_total = float(((d.groupby("Subject").Performance.mean()
                            - d.Performance.mean()) ** 2).sum() * 6)
    df_subj = len(subjects) - 1
    for key, src, within in (("row_factor", "Metric", ["Metric"]),
                             ("column_factor", "Time", ["Time"]),
                             ("interaction", "Metric * Time",
                              ["Metric", "Time"])):
        r = by[src]
        spher = pg.sphericity(d, dv="Performance", within=within,
                              subject="Subject")
        gg = pg.epsilon(d, dv="Performance", within=within,
                        subject="Subject", correction="gg")
        hf = pg.epsilon(d, dv="Performance", within=within,
                        subject="Subject", correction="hf")
        ss, df = float(r["SS"]), int(r["ddof1"])
        df_err = int(r["ddof2"])
        ss_err = ss / float(r["F"]) * df_err / df
        out[key] = {
            "gg": float(gg), "hf": float(hf),
            "mauchly_W": None if np.isnan(spher[1]) else float(spher[1]),
            "mauchly_p": float(spher[-1]),
            "F": float(r["F"]),
            "partial_omega2": omega_p(ss, df, ss_err, df_err,
                                      ss_subj_total, df_subj),
        }
    return out


def typed_mixed():
    """The one-way table as a mixed design: subjects 1-5 and 6-10 as two
    groups, the second shifted by +2 (its HF epsilon is below 1, so the
    Lecoutre numerator matters: the 1976 formula gives another value)."""
    rows = []
    for s, vals in enumerate(ONE_WAY):
        g = "A" if s < 5 else "B"
        for t, v in zip(NAMES, vals):
            rows.append({"Subject": s, "Group": g, "Time": t,
                         "Scores": v + (2.0 if g == "B" else 0.0)})
    return pd.DataFrame(rows), NAMES, ["A", "B"]


def mixed(d, times, groups):
    aov = pg.mixed_anova(d, dv="Scores", within="Time", between="Group",
                         subject="Subject", correction=True)
    by = {s: aov[aov.Source == s].iloc[0] for s in aov.Source}
    # cells[time][group] = that group's subjects in a fixed order
    cells = []
    for t in times:
        row = []
        for g in groups:
            sub = d[(d.Time == t) & (d.Group == g)].sort_values("Subject")
            row.append([float(v) for v in sub.Scores])
        cells.append(row)
    n, g_n, k = d.Subject.nunique(), len(groups), len(times)
    gg = float(by["Time"]["eps"])
    # subjects within groups: SS of the subject means around their group
    sm = d.groupby(["Group", "Subject"]).Scores.mean().reset_index()
    sm["gmean"] = sm.groupby("Group").Scores.transform("mean")
    ss_subj = float(((sm.Scores - sm.gmean) ** 2).sum() * k)
    df_subj = n - g_n
    ss_res = float(d.Scores.var(ddof=0) * len(d)) - sum(
        float(by[s]["SS"]) for s in ("Group", "Time", "Interaction")) \
        - ss_subj
    df_res = (k - 1) * (n - g_n)
    out = {"cells": cells, "row_names": times, "col_names": groups,
           "gg": gg, "hf_lecoutre": lecoutre_hf(gg, k - 1, n, g_n),
           "hf_huynh_feldt_1976": min(
               (n * (k - 1) * gg - 2) / ((k - 1) * (n - g_n - (k - 1) * gg)),
               1.0),
           "mauchly_W": float(by["Time"]["W_spher"]),
           "mauchly_p": float(by["Time"]["p_spher"])}
    for key, src, within in (("row_factor", "Time", True),
                             ("interaction", "Interaction", True),
                             ("column_factor", "Group", False)):
        ss, df = float(by[src]["SS"]), int(by[src]["DF1"])
        err = (ss_res, df_res) if within else (ss_subj, df_subj)
        out[key] = {"F": float(by[src]["F"]),
                    "partial_omega2": omega_p(ss, df, *err, ss_subj,
                                              df_subj, within)}
    return out


if __name__ == "__main__":
    ref = {"one_way": one_way(), "both": both(),
           "mixed": mixed(pg.read_dataset("mixed_anova"),
                          ["August", "January", "June"],
                          ["Control", "Meditation"]),
           "mixed_typed": mixed(*typed_mixed())}
    path = os.path.join(os.path.dirname(__file__), "rm_sphericity.json")
    with open(path, "w") as fh:
        json.dump(ref, fh, indent=1)
    print(json.dumps({k: {kk: vv for kk, vv in v.items()
                          if kk not in ("data", "cells")}
                      for k, v in ref.items()}, indent=1))
