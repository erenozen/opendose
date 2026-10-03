"""Nested t test and nested one-way ANOVA.

GraphPad Prism statistics guide pages whose documented method this module
implements (cited for the method only):

- "How Prism performs the nested t test and one-way ANOVA"
  (stat_technical-notes.htm): a mixed effects model with the main factor
  (data set columns) fixed and the nested factor (subcolumns) random.
  With no missing values the result equals a t test / one-way ANOVA of
  the subcolumn means (true only when the subcolumn variance is allowed
  to be negative, which is therefore the default here). FAQ 2105 gives the
  equivalent SAS code: PROC MIXED METHOD=REML; MODEL y = Condition;
  RANDOM Room*Condition (containment df = subcolumns - columns).
- "Interpreting results: Nested t test", "Another example of a nested t
  test": P from t (= sqrt F, DFn = 1), difference between means (B - A)
  +/- SEM with its CI (90/95/99% selectable; "swap direction" option),
  the variance and SD within and among subcolumns, "Do the subcolumns
  differ?" as a chi-square (1 df) likelihood-ratio test, and goodness of
  fit (df = N - fixed parameters - variance parameters, and the REML
  criterion, which on the guide's example equals -log restricted
  likelihood: 86.22 for the Maxwell & Delaney Table 16.4 data).
- "Interpreting results: Nested one-way ANOVA": F, DFn, DFd and P for the
  columns, the same random-effects and subcolumn results, and multiple
  comparisons "done as they are for one-way ANOVA" but from the model
  (Dunnett example: SE of difference from the model, DF = subcolumns -
  columns).
- "If P is high, should you pool?": the classical hierarchical ANOVA F
  test of subgroups within groups (MS subgroups / MS within; the guide's
  herd example gives P = 0.1231), reported here as a secondary table.
- "Example of a nested design with three treatments": the data layout
  (groups = data sets, subgroups = subcolumns, replicates stacked).

Validated against the guide's three printed examples (teaching methods,
rats, cattle herds) and statsmodels MixedLM (tests/test_nested.py). Note:
the guide's screenshot of the teaching example prints the two variance
numbers on swapped rows (within 26.63 / among 20.26); the pooled within-
room variance of those data is 20.21 and the balanced rat example (within
= MS within exactly) confirms the assignment used here.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

from . import mixedmodel as mm


def _clean_groups(groups):
    """groups: list of groups, each a list of subgroups (value lists).
    Drops missing values and empty subgroups."""
    out = []
    for g in groups:
        subs = []
        for sub in g:
            vals = [float(v) for v in sub
                    if v is not None and not (isinstance(v, float)
                                              and math.isnan(v))]
            if vals:
                subs.append(vals)
        out.append(subs)
    return out


def _fit(groups, negative_variance):
    k = len(groups)
    if k < 2:
        raise ValueError("need at least 2 groups (data sets)")
    if any(len(g) == 0 for g in groups):
        raise ValueError("every group needs at least one subcolumn with data")
    y, gi, si, sub_index = [], [], [], []
    sid = 0
    for g, subs in enumerate(groups):
        for s, vals in enumerate(subs):
            for v in vals:
                y.append(v)
                gi.append(g)
                si.append(sid)
                sub_index.append(s)
            sid += 1
    n_sub = sid
    if n_sub - k < 1:
        raise ValueError("need more subcolumns than groups "
                         "(at least one group with 2 or more subcolumns)")
    y = np.array(y)
    gi = np.array(gi)
    si = np.array(si)
    if y.size - n_sub < 1:
        raise ValueError("need replicate values within subcolumns")
    X = np.column_stack([np.ones(y.size), mm.effect_columns(gi, k)])
    allow = negative_variance == "allow"
    if negative_variance not in ("allow", "zero"):
        raise ValueError("negative_variance must be 'allow' or 'zero'")
    fit = mm.fit_reml(y, X, [("Subcolumn", si)], allow_negative=allow)
    df = mm.rank_contribution(X, fit["_Zs"], 0)  # subcolumns - groups
    return {"fit": fit, "X": X, "y": y, "gi": gi, "si": si,
            "sub_index": np.array(sub_index), "df": df, "k": k,
            "n_sub": n_sub}


def _hierarchical_anova(groups):
    """Classical nested ANOVA table (Type I / hierarchical SS)."""
    allv = np.concatenate([np.concatenate(g) for g in groups])
    gm = allv.mean()
    ss_g = ss_s = ss_w = 0.0
    for g in groups:
        gv = np.concatenate(g)
        ss_g += gv.size * (gv.mean() - gm) ** 2
        for s in g:
            s = np.asarray(s)
            ss_s += s.size * (s.mean() - gv.mean()) ** 2
            ss_w += float(((s - s.mean()) ** 2).sum())
    a = len(groups)
    n_sub = sum(len(g) for g in groups)
    df_g, df_s, df_w = a - 1, n_sub - a, allv.size - n_sub
    ms_g, ms_s = ss_g / df_g, ss_s / df_s
    ms_w = ss_w / df_w if df_w else math.nan
    f_s = ms_s / ms_w if ms_w > 0 else math.inf
    f_g = ms_g / ms_s if ms_s > 0 else math.inf
    ss_t = float(((allv - gm) ** 2).sum())
    return {
        "groups": {"ss": float(ss_g), "df": df_g, "ms": float(ms_g),
                   "F": float(f_g),
                   "p": float(stats.f.sf(f_g, df_g, df_s))},
        "subgroups_within_groups": {
            "ss": float(ss_s), "df": df_s, "ms": float(ms_s),
            "F": float(f_s), "p": float(stats.f.sf(f_s, df_s, df_w))},
        "within_subgroups": {"ss": float(ss_w), "df": df_w,
                             "ms": float(ms_w)},
        "total": {"ss": ss_t, "df": int(allv.size - 1)},
        "note": ("Hierarchical (Type I) sums of squares. The F for groups "
                 "against subgroups is exact only for equal subcolumn "
                 "sizes; the mixed model result is the primary test."),
    }


def _common(groups_raw, names, subgroup_names, negative_variance, ci_level):
    groups = _clean_groups(groups_raw)
    m = _fit(groups, negative_variance)
    fit, k, df = m["fit"], m["k"], m["df"]
    names = names or [f"Group {chr(65 + i)}" for i in range(k)]

    L = np.array([np.concatenate([[1.0], mm.effect_row(t, k)])
                  for t in range(k)])
    emm, emm_cov = mm.estimate(fit, L)
    tcrit = float(stats.t.ppf(0.5 + ci_level / 2, df))
    means = []
    for t in range(k):
        se = math.sqrt(emm_cov[t, t])
        means.append({"name": names[t], "mean": float(emm[t]), "se": se,
                      "ci": [float(emm[t] - tcrit * se),
                             float(emm[t] + tcrit * se)],
                      "n_subcolumns": len(groups[t]),
                      "n_values": int(sum(len(s) for s in groups[t]))})

    comp = fit["variance_components"][0]
    var_among = comp["variance"]
    var_within = fit["residual_variance"]
    total = var_among + var_within
    random_effects = {
        "within_subcolumns": {
            "sd": math.sqrt(var_within), "variance": var_within,
            "percent_of_total": (100.0 * var_within / total
                                 if total > 0 else None)},
        "among_subcolumns": {
            "sd": math.sqrt(var_among) if var_among >= 0 else None,
            "variance": var_among,
            "percent_of_total": (100.0 * var_among / total
                                 if total > 0 else None)},
    }
    lr = mm.likelihood_ratio_random(fit)

    subgroup_summaries = []
    for g, subs in enumerate(groups):
        for s, vals in enumerate(subs):
            arr = np.asarray(vals)
            sd = float(arr.std(ddof=1)) if arr.size > 1 else None
            label = None
            if subgroup_names and g < len(subgroup_names) and \
                    subgroup_names[g] and s < len(subgroup_names[g]):
                label = subgroup_names[g][s]
            subgroup_summaries.append({
                "group": names[g], "subgroup": label or f"Subcolumn {s + 1}",
                "n": int(arr.size), "mean": float(arr.mean()), "sd": sd,
                "sem": sd / math.sqrt(arr.size) if sd is not None else None})

    common = {
        "group_means": means,
        "random_effects": random_effects,
        "subcolumns_differ": {
            **lr, "significant_05": bool(lr["p"] < 0.05),
            "test": "likelihood ratio (REML fit with vs. without the "
                    "random subcolumn effect)"},
        "goodness_of_fit": {
            "df": int(fit["n"] - fit["p"] - fit["n_cov_params"]),
            "reml_criterion": fit["reml_criterion"] / 2.0,
            "minus_2_log_restricted_likelihood": fit["reml_criterion"],
            "aic": fit["aic"], "bic": fit["bic"],
            "converged": fit["converged"]},
        "nested_anova_table": _hierarchical_anova(groups),
        "subgroup_summaries": subgroup_summaries,
        "residuals": {
            "group": [int(v) for v in m["gi"]],
            "subcolumn": [int(v) for v in m["sub_index"]],
            "value": [float(v) for v in m["y"]],
            "fitted": [float(v) for v in fit["fitted"]],
            "residual": [float(v) for v in fit["residuals"]]},
        "data_analyzed": {"n_treatments": k, "n_subcolumns": m["n_sub"],
                          "n_values": int(m["y"].size)},
        "df_method": "containment (subcolumns - columns)",
        "names": names,
    }
    return m, emm, emm_cov, common


def nested_t_test(groups, *, names=None, subgroup_names=None,
                  ci_level: float = 0.95, swap: bool = False,
                  negative_variance: str = "allow") -> dict:
    """Nested t test: two groups, each with subcolumns of replicates.

    groups: [[subcol values, ...], [subcol values, ...]].
    Difference reported as B - A (swap=True gives A - B), with SEM,
    t, df, two-tailed P, F (= t^2, DFn 1) and the CI.
    """
    if len(groups) != 2:
        raise ValueError("the nested t test compares exactly 2 groups")
    m, emm, cov, common = _common(groups, names, subgroup_names,
                                  negative_variance, ci_level)
    df = m["df"]
    a, b = (1, 0) if swap else (0, 1)
    diff = float(emm[b] - emm[a])
    se = math.sqrt(cov[0, 0] + cov[1, 1] - 2 * cov[0, 1])
    t = diff / se
    p = float(2 * stats.t.sf(abs(t), df))
    tcrit = float(stats.t.ppf(0.5 + ci_level / 2, df))
    names = common["names"]
    return {
        "analysis": "nested_t_test",
        "comparison": f"{names[b]} - {names[a]}",
        "t": float(abs(t)), "df": int(df),
        "F": float(t * t), "df_num": 1, "df_den": int(df),
        "p": p, "significant_05": bool(p < 0.05),
        "tails": "two",
        "difference": diff, "se_difference": se,
        "ci": [diff - tcrit * se, diff + tcrit * se],
        "ci_level": ci_level,
        **common,
    }


def nested_one_way_anova(groups, *, names=None, subgroup_names=None,
                         comparisons=None, control_index: int = 0,
                         ci_level: float = 0.95,
                         negative_variance: str = "allow") -> dict:
    """Nested one-way ANOVA: three or more groups with subcolumns.

    comparisons: None | tukey | dunnett | bonferroni | sidak | holm_sidak
    | fisher, on the model's estimated group means with the model's SE of
    each difference and df = subcolumns - columns.
    """
    if len(groups) < 2:
        raise ValueError("need at least 2 groups")
    m, emm, cov, common = _common(groups, names, subgroup_names,
                                  negative_variance, ci_level)
    k, df = m["k"], m["df"]
    test = mm.wald_f(m["fit"], range(1, k), df, epsilon=None)
    out = {
        "analysis": "nested_one_way_anova",
        "F": test["F"], "df_num": test["df_num"], "df_den": int(df),
        "p": test["p"], "significant_05": bool(test["p"] < 0.05),
        **common,
    }
    if comparisons:
        out["multiple_comparisons"] = {
            "method": comparisons, "df": int(df),
            "n_comparisons_per_family": (k - 1 if comparisons == "dunnett"
                                         else k * (k - 1) // 2),
            "comparisons": mm.compare_estimates(
                emm, cov, df, comparisons, names=common["names"],
                control_index=control_index, ci_level=ci_level)}
    return out
