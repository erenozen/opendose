"""Reference values for P-85 (aligned rank transform two-way ANOVA):
engine/tests/test_art.py, the e2e step and the ui-stage fixture.

R is not installed (ARTool not available). The oracles:

1. The data: ARTool's Higgins1990Table5 (Higgins, Blair & Tashtoush
   1990, Table 5: dry matter of plants in 12 trays, 4 moisture levels x 4
   fertilizers, trays nested in moisture), read from ARTool's
   data/Higgins1990Table5.RData (github.com/mjskay/ARTool) and copied
   into engine/tests/fixtures/higgins1990_table5.csv.
2. An own align-and-rank implementation in pandas (groupby means of the
   observations, round to 8 decimals, scipy.stats.rankdata average ties:
   ARTool's R/art.R and R/internal.R), then statsmodels OLS with
   sum-to-zero contrasts and anova_lm(typ=3) on the ranks: the fixed-
   effects ART ANOVA of the grouped table (Moisture rows x Fertilizer
   columns, the 3 trays as replicates).
3. The same aligned ranks in ARTool's published split-plot model
   (art(DryMatter ~ Moisture*Fertilizer + Error(Tray)); reference values
   in ARTool's tests/testthat/test.anova.art.R, "matches results of the
   original ARTool"): F = 23.8326 (3, 8), 122.4017 (3, 24), 5.1180
   (9, 24); P = 0.0002, < 0.0001, 0.0006. Reproducing these from the
   ranks below shows the alignment and ranking match ARTool exactly.
4. ART-C contrasts (Elkin et al. 2021): statsmodels OLS on the aligned
   ranks (rank ~ C(M, Sum) * C(F, Sum); cells: rank(DryMatter) ~ C(cell))
   with the estimated marginal means' pairwise differences, SE from the
   OLS covariance, Tukey P from scipy.stats.studentized_range.

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/art_anova.py
"""
import json
import math
import os
from itertools import combinations

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from scipy import stats
from statsmodels.stats.anova import anova_lm

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "..", "fixtures", "higgins1990_table5.csv")

ARTOOL_SPLIT_PLOT = {  # tests/testthat/test.anova.art.R (ARTool)
    "Moisture": {"F": 23.8326, "df": 3, "df_res": 8, "p": 0.0002},
    "Fertilizer": {"F": 122.4017, "df": 3, "df_res": 24, "p": 0.0},
    "Moisture:Fertilizer": {"F": 5.1180, "df": 9, "df_res": 24, "p": 0.0006},
}


def align(df):
    y = df["DryMatter"]
    g = y.mean()
    m_a = df.groupby("Moisture")["DryMatter"].transform("mean")
    m_b = df.groupby("Fertilizer")["DryMatter"].transform("mean")
    m_ab = df.groupby(["Moisture", "Fertilizer"])["DryMatter"].transform("mean")
    resid = y - m_ab
    al = {"Moisture": resid + (m_a - g), "Fertilizer": resid + (m_b - g),
          "Moisture:Fertilizer": resid + (m_ab - m_a - m_b + g)}
    return {k: stats.rankdata(np.round(v.values, 8), method="average")
            for k, v in al.items()}


def fixed_anova(df, ranks):
    out = {}
    for term, r in ranks.items():
        d = df.assign(r=r)
        fit = smf.ols("r ~ C(Moisture, Sum) * C(Fertilizer, Sum)", d).fit()
        tab = anova_lm(fit, typ=3)
        key = {"Moisture": "C(Moisture, Sum)",
               "Fertilizer": "C(Fertilizer, Sum)",
               "Moisture:Fertilizer": "C(Moisture, Sum):C(Fertilizer, Sum)"}[term]
        out[term] = {"F": float(tab.loc[key, "F"]),
                     "df": int(tab.loc[key, "df"]),
                     "df_res": int(tab.loc["Residual", "df"]),
                     "p": float(tab.loc[key, "PR(>F)"]),
                     "ss": float(tab.loc[key, "sum_sq"])}
    return out


def split_plot(df, ranks):
    """Balanced split plot on each term's aligned ranks: Moisture against
    Tray(Moisture), Fertilizer and the interaction against the within-tray
    residual (R's aov with Error(Tray))."""
    out = {}
    for term, r in ranks.items():
        d = df.assign(r=r)
        g = d["r"].mean()
        mA = d.groupby("Moisture")["r"].transform("mean")
        mB = d.groupby("Fertilizer")["r"].transform("mean")
        mAB = d.groupby(["Moisture", "Fertilizer"])["r"].transform("mean")
        mT = d.groupby("Tray")["r"].transform("mean")
        ss_a = float(((mA - g) ** 2).sum())
        ss_tray = float(((mT - mA) ** 2).sum())
        ss_b = float(((mB - g) ** 2).sum())
        ss_ab = float(((mAB - mA - mB + g) ** 2).sum())
        ss_within = float(((d["r"] - mT) ** 2).sum()) - ss_b - ss_ab
        if term == "Moisture":
            f, df1, df2 = (ss_a / 3) / (ss_tray / 8), 3, 8
        elif term == "Fertilizer":
            f, df1, df2 = (ss_b / 3) / (ss_within / 24), 3, 24
        else:
            f, df1, df2 = (ss_ab / 9) / (ss_within / 24), 9, 24
        out[term] = {"F": f, "df": df1, "df_res": df2,
                     "p": float(stats.f.sf(f, df1, df2))}
    return out


def emm_pairs(d, formula, factor_cols, levels, k_tukey):
    """Pairwise differences of equally weighted marginal means of ranks
    from an OLS fit (cell-means coding), Tukey-adjusted."""
    d = d.assign(cell=d["Moisture"] + ":" + d["Fertilizer"])
    fit = smf.ols("r ~ 0 + C(cell)", d).fit()
    names = [n[len("C(cell)["):-1] for n in fit.params.index]
    beta, cov = fit.params.values, fit.cov_params().values
    df_res = fit.df_resid

    def weights(level):
        w = np.zeros(len(names))
        sel = [i for i, nm in enumerate(names)
               if level == nm or level in nm.split(":")[factor_cols]] \
            if factor_cols is not None else [names.index(level)]
        w[sel] = 1.0 / len(sel)
        return w
    rows = []
    for a, b in combinations(levels, 2):
        c = weights(a) - weights(b)
        diff = float(c @ beta)
        se = float(math.sqrt(c @ cov @ c))
        t = diff / se
        q = abs(t) * math.sqrt(2)
        rows.append({"pair": f"{a} vs. {b}", "difference": diff, "se": se,
                     "t": t, "df": int(df_res),
                     "p_unadjusted": float(2 * stats.t.sf(abs(t), df_res)),
                     "p_tukey": float(stats.studentized_range.sf(q, k_tukey,
                                                                 df_res))})
    return rows


def main():
    df = pd.read_csv(DATA)
    ranks = align(df)
    moist = sorted(df["Moisture"].unique())
    fert = sorted(df["Fertilizer"].unique())
    cells_ = [f"{m}:{f}" for m in moist for f in fert]
    con_m = emm_pairs(df.assign(r=ranks["Moisture"]), None, 0, moist, 4)
    con_f = emm_pairs(df.assign(r=ranks["Fertilizer"]), None, 1, fert, 4)
    rcell = stats.rankdata(np.round((df["DryMatter"] - df["DryMatter"].mean())
                                    .values, 8), method="average")
    con_c = emm_pairs(df.assign(r=rcell), None, None, cells_, 16)
    out = {
        "source": "ARTool Higgins1990Table5 (Higgins, Blair & Tashtoush 1990, Table 5)",
        "moisture": moist, "fertilizer": fert,
        "cells": {m: {f: [float(v) for v in df[(df.Moisture == m)
                                                 & (df.Fertilizer == f)]
                                          .sort_values("Tray")["DryMatter"]]
                      for f in fert} for m in moist},
        "ranks": {k: [float(v) for v in r] for k, r in ranks.items()},
        "fixed": fixed_anova(df, ranks),
        "split_plot": split_plot(df, ranks),
        "artool_split_plot": ARTOOL_SPLIT_PLOT,
        "artc_moisture": con_m, "artc_fertilizer": con_f,
        "artc_cells_first": con_c[:5],
        "artc_cells_count": len(con_c),
    }
    with open(os.path.join(HERE, "art_anova.json"), "w") as f:
        json.dump(out, f, indent=1)
    for k, v in out["fixed"].items():
        print(f"fixed {k}: F({v['df']}, {v['df_res']}) = {v['F']:.6g}, "
              f"P = {v['p']:.6g}")
    for k, v in out["split_plot"].items():
        print(f"split plot {k}: F = {v['F']:.4f} (ARTool "
              f"{ARTOOL_SPLIT_PLOT[k]['F']}), P = {v['p']:.4f}")
    for r in con_m:
        print("ART-C", r["pair"], f"{r['difference']:.4f}",
              f"Tukey P = {r['p_tukey']:.4g}")


if __name__ == "__main__":
    main()
