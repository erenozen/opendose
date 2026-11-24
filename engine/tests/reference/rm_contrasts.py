"""Reference values for P-83 (interaction contrasts in repeated-measures
designs, custom contrasts with Scheffe's adjustment): engine/tests/
test_rm_contrasts.py, the e2e step and the ui-stage fixture.

R is not installed (afex::aov_ez with emmeans::contrast(interaction =
"pairwise") and multcomp::glht not available). The oracles:

- the plan's identity for a 2 x 2 mixed design (genotype between, drug
  within, 6 mice per genotype): the difference of differences is the
  pooled two-sample t test of the per-mouse drug effects
  (scipy.stats.ttest_ind, equal_var=True), and its t^2 the interaction F
  of the mixed ANOVA (pingouin.mixed_anova);
- both factors within subjects (2 x 2, 8 subjects): the one-sample t test
  of the per-subject differences of differences (scipy.stats.ttest_1samp)
  and pingouin.rm_anova's interaction F = t^2;
- a 3 x 2 mixed design (3 times within, 2 groups between): each 2 x 2
  sub-square from statsmodels OLS of the per-subject contrast scores on
  the group (score ~ C(group) - 1 and t_test of the group difference),
  which is the emmeans "multivariate" error term (variance of the scores
  pooled across groups, df = subjects - groups); simple effects likewise;
- custom contrasts after one-way and two-way ANOVA: statsmodels OLS with
  cell-means coding (y ~ C(g) - 1) and results.t_test(c) for the
  estimate, SE, t, unadjusted P and t interval; Scheffe's P = F.sf(t^2 /
  (k - 1), k - 1, df) and interval +- sqrt((k - 1) F_crit) SE from scipy
  (Maxwell & Delaney 2004, ch. 5; Scheffe 1953, Biometrika 40:87).

Data: typed for this test with a fixed seed (below).

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/rm_contrasts.py
"""
import json
import os
import warnings

import numpy as np
import pandas as pd
import pingouin as pg
import statsmodels.formula.api as smf
from scipy import stats

warnings.simplefilter("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))


def mixed_2x2():
    rng = np.random.default_rng(83)
    rows = []
    for g, shift in (("WT", 0.0), ("KO", 3.0)):
        for s in range(6):
            base = 20 + rng.normal(0, 3)
            veh = base + rng.normal(0, 1.2)
            drug = base + 4 + shift + rng.normal(0, 1.2)
            rows.append({"subject": f"{g}{s + 1}", "genotype": g,
                         "Vehicle": round(veh, 2), "Drug": round(drug, 2)})
    d = pd.DataFrame(rows)
    d["effect"] = d["Drug"] - d["Vehicle"]
    wt, ko = d[d.genotype == "WT"]["effect"], d[d.genotype == "KO"]["effect"]
    t = stats.ttest_ind(ko, wt, equal_var=True)
    df = len(d) - 2
    sp2 = (((wt - wt.mean()) ** 2).sum() + ((ko - ko.mean()) ** 2).sum()) / df
    se = np.sqrt(sp2 * (1 / len(wt) + 1 / len(ko)))
    diff = ko.mean() - wt.mean()
    half = stats.t.ppf(0.975, df) * se
    long = d.melt(id_vars=["subject", "genotype"], value_vars=["Vehicle", "Drug"],
                  var_name="drug", value_name="y")
    aov = pg.mixed_anova(data=long, dv="y", within="drug", between="genotype", subject="subject")
    inter = aov[aov.Source == "Interaction"].iloc[0]
    # simple effects: the drug effect in each genotype (OLS of the scores)
    m = smf.ols("effect ~ C(genotype, Treatment('WT')) - 1", d).fit()
    simple = {g: {"difference": float(m.params.iloc[i]), "se": float(m.bse.iloc[i]),
                  "p": float(m.pvalues.iloc[i])}
              for i, g in enumerate(["KO", "WT"] if m.params.index[0].endswith("[KO]") else ["WT", "KO"])}
    # genotype difference at each drug level (pooled across genotypes)
    between = {}
    for lev in ("Vehicle", "Drug"):
        mm = smf.ols(f"{lev} ~ C(genotype, Treatment('WT'))", d).fit()
        between[lev] = {"difference": float(mm.params.iloc[1]), "se": float(mm.bse.iloc[1]),
                        "p": float(mm.pvalues.iloc[1])}
    return {"records": d[["subject", "genotype", "Vehicle", "Drug"]].to_dict("records"),
            "difference": float(diff), "se": float(se), "t": float(t.statistic), "df": df,
            "p": float(t.pvalue), "ci": [float(diff - half), float(diff + half)],
            "effect_wt": float(wt.mean()), "effect_ko": float(ko.mean()),
            "interaction_F_pingouin": float(inter.F), "interaction_p_pingouin": float(inter["p_unc"]),
            "drug_within_genotype": simple, "genotype_within_drug": between}


def both_2x2():
    rng = np.random.default_rng(84)
    rows = []
    for s in range(8):
        base = 10 + rng.normal(0, 2)
        cell = {}
        for a, ea in (("Light", 0), ("Dark", 1.5)):
            for b, eb in (("Pre", 0), ("Post", 2.0)):
                cell[(a, b)] = base + ea + eb + (1.2 if (a, b) == ("Dark", "Post") else 0) + rng.normal(0, 0.8)
        rows.append({"subject": f"S{s + 1}", **{f"{a}|{b}": round(v, 2) for (a, b), v in cell.items()}})
    d = pd.DataFrame(rows)
    dd = (d["Dark|Post"] - d["Light|Post"]) - (d["Dark|Pre"] - d["Light|Pre"])
    t = stats.ttest_1samp(dd, 0)
    long = d.melt(id_vars="subject", var_name="cell", value_name="y")
    long[["light", "time"]] = long["cell"].str.split("|", expand=True)
    aov = pg.rm_anova(data=long, dv="y", within=["light", "time"], subject="subject")
    inter = aov[aov.Source == "light * time"].iloc[0]
    se = dd.std(ddof=1) / np.sqrt(len(dd))
    half = stats.t.ppf(0.975, len(dd) - 1) * se
    return {"records": d.to_dict("records"), "difference": float(dd.mean()), "se": float(se),
            "t": float(t.statistic), "df": len(dd) - 1, "p": float(t.pvalue),
            "ci": [float(dd.mean() - half), float(dd.mean() + half)],
            "interaction_F_pingouin": float(inter.F), "interaction_p_pingouin": float(inter["p_unc"])}


def mixed_3x2():
    rng = np.random.default_rng(85)
    rows = []
    for g, slope in (("Control", 1.0), ("Treated", 2.5)):
        for s in range(5 if g == "Control" else 7):
            base = 50 + rng.normal(0, 5)
            rows.append({"subject": f"{g[0]}{s + 1}", "group": g,
                         **{f"T{t}": round(base + slope * t * 2 + rng.normal(0, 1.5), 2) for t in range(3)}})
    d = pd.DataFrame(rows)
    out = []
    for i1, i2 in ((0, 1), (0, 2), (1, 2)):
        d["score"] = d[f"T{i2}"] - d[f"T{i1}"]
        m = smf.ols("score ~ C(group, Treatment('Control'))", d).fit()
        ci = m.conf_int().iloc[1]
        out.append({"rows": [f"T{i1}", f"T{i2}"], "difference": float(m.params.iloc[1]),
                    "se": float(m.bse.iloc[1]), "t": float(m.tvalues.iloc[1]),
                    "df": float(m.df_resid), "p": float(m.pvalues.iloc[1]),
                    "ci": [float(ci.iloc[0]), float(ci.iloc[1])]})
    return {"records": d[["subject", "group", "T0", "T1", "T2"]].to_dict("records"), "contrasts": out}


def oneway_custom():
    rng = np.random.default_rng(86)
    groups = {"Vehicle": rng.normal(10, 2, 6), "Drug A": rng.normal(13, 2, 5),
              "Drug B": rng.normal(14, 2, 7)}
    d = pd.DataFrame([{"g": g, "y": round(float(v), 3)} for g, vs in groups.items() for v in vs])
    d["g"] = pd.Categorical(d["g"], categories=list(groups))
    m = smf.ols("y ~ C(g) - 1", d).fit()
    k, df = 3, m.df_resid
    out = []
    for name, c in (("Drugs vs vehicle", [-2, 1, 1]), ("A vs B", [0, 1, -1])):
        tt = m.t_test(np.array([c], float))
        est, se, t = float(tt.effect[0]), float(tt.sd[0, 0]), float(tt.tvalue[0, 0])
        ci = tt.conf_int()[0]
        fstat = t * t / (k - 1)
        half = np.sqrt((k - 1) * stats.f.ppf(0.95, k - 1, df)) * se
        out.append({"name": name, "coefficients": c, "estimate": est, "se": se, "t": t,
                    "df": float(df), "p_planned": float(tt.pvalue), "ci_planned": [float(ci[0]), float(ci[1])],
                    "F_scheffe": fstat, "p_scheffe": float(stats.f.sf(fstat, k - 1, df)),
                    "ci_scheffe": [est - half, est + half]})
    aov = smf.ols("y ~ C(g)", d).fit()
    from statsmodels.stats.anova import anova_lm
    a = anova_lm(aov)
    return {"groups": {g: [round(float(v), 3) for v in vs] for g, vs in groups.items()},
            "contrasts": out, "anova_F": float(a.F.iloc[0]), "anova_p": float(a["PR(>F)"].iloc[0])}


def twoway_custom():
    rng = np.random.default_rng(87)
    rows = []
    for r in ("WT", "KO"):
        for c, e in (("Vehicle", 0), ("Drug", 3)):
            for _ in range(4):
                rows.append({"row": r, "col": c,
                             "y": round(float(10 + e + (2 if r == "KO" and c == "Drug" else 0)
                                              + rng.normal(0, 1.5)), 3)})
    d = pd.DataFrame(rows)
    d["cell"] = pd.Categorical(d["row"] + " / " + d["col"],
                               categories=["WT / Vehicle", "WT / Drug", "KO / Vehicle", "KO / Drug"])
    m = smf.ols("y ~ C(cell) - 1", d).fit()
    c = [1, -1, -1, 1]
    tt = m.t_test(np.array([c], float))
    est, se, t = float(tt.effect[0]), float(tt.sd[0, 0]), float(tt.tvalue[0, 0])
    k, df = 4, m.df_resid
    f = t * t / (k - 1)
    half = np.sqrt((k - 1) * stats.f.ppf(0.95, k - 1, df)) * se
    return {"records": d[["row", "col", "y"]].to_dict("records"), "coefficients": c,
            "estimate": est, "se": se, "t": t, "df": float(df), "p_planned": float(tt.pvalue),
            "F_scheffe": f, "p_scheffe": float(stats.f.sf(f, k - 1, df)),
            "ci_scheffe": [est - half, est + half]}


if __name__ == "__main__":
    out = {"mixed_2x2": mixed_2x2(), "both_2x2": both_2x2(), "mixed_3x2": mixed_3x2(),
           "oneway_custom": oneway_custom(), "twoway_custom": twoway_custom()}
    with open(os.path.join(HERE, "rm_contrasts.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk not in ("records", "groups")}
                      for k, v in out.items()}, indent=1))
