"""Multiple comparisons after repeated-measures one-way ANOVA.

Method sources:

- GraphPad statistics guide, "Multiple comparisons after repeated
  measures ANOVA" (stat_multiple_comparisons_after_rep.htm), following
  Maxwell & Delaney (2004), Designing Experiments and Analyzing Data, 2nd
  ed., pp. 552-555:
  * assuming sphericity, every comparison uses the mean square residual
    of the RM ANOVA table (a pooled error term): SE of a difference
    sqrt(2 MS_error / n), df = (n - 1)(k - 1). This is error="pooled"
    (the default), and equals emmeans on aov(y ~ treatment +
    Error(subject/treatment)).
  * not assuming sphericity (Geisser-Greenhouse), "for each comparison
    of two groups, it uses only the data in those two groups
    (essentially performing a paired t test)": SE = SD of the paired
    differences / sqrt(n), df = n - 1. This is error="per_pair".
  Option pooled_df="gg" instead keeps the pooled error and multiplies
  its df by the Geisser-Greenhouse epsilon (a common compromise, e.g.
  SPSS/afex "GG-corrected" df); it is not what the guide describes and
  is labelled as such.
- Methods (as for ordinary one-way ANOVA, opendose.anova): Tukey
  (studentized range, q = |difference| / (SE / sqrt 2)), Dunnett (each
  treatment vs. a control or baseline, multivariate t), Sidak,
  Bonferroni, Holm (Holm 1979), Holm-Sidak and Fisher's LSD (no
  correction); families "all", "control" (each vs. the control /
  baseline) or "pairs" for the single-step and step-down corrections.
- per_pair with Tukey or Dunnett: each pair has its own SE, so the
  statistics are not exactly studentized-range / multivariate-t
  distributed. Tukey uses the studentized range with df = n - 1; Dunnett
  uses the multivariate t with df = n - 1 and the correlation of the
  paired differences (sample covariance of the repeated measures). Both
  are approximations and the result says so (Maxwell & Delaney recommend
  Bonferroni/Sidak with separate error terms).
"""

from __future__ import annotations

import math
from itertools import combinations

import numpy as np
from scipy import stats

from . import anova, dunnett, studentized
from .repeated import _complete_matrix, _gg_epsilon

METHODS = ("tukey", "dunnett", "sidak", "bonferroni", "holm", "holm_sidak",
           "fisher_lsd")

SOURCE = ("GraphPad statistics guide, 'Multiple comparisons after repeated "
          "measures ANOVA'; Maxwell & Delaney 2004, pp. 552-555")


def _family_pairs(k, method, family, control, pairs):
    if method == "tukey":
        return list(combinations(range(k), 2)), "all"
    if method == "dunnett":
        return [(i, int(control)) for i in range(k) if i != int(control)], \
            "control"
    fam = family or "all"
    return anova.planned_pairs(k, fam, control, pairs), fam


def rm_comparisons(datasets, names=None, method: str = "tukey", *,
                   control: int = 0, family: str = "all", pairs=None,
                   error: str = "pooled", pooled_df: str = "uncorrected",
                   ci_level: float = 0.95) -> dict:
    """Comparisons among the treatment means of an RM one-way design.
    datasets: one value list per treatment, index = subject; subjects
    with a missing value are left out (as in the RM ANOVA)."""
    if method not in METHODS:
        raise ValueError(f"unknown multiple-comparisons method: {method} "
                         f"(use {', '.join(METHODS)})")
    if error not in ("pooled", "per_pair"):
        raise ValueError("error must be 'pooled' or 'per_pair'")
    if pooled_df not in ("uncorrected", "gg"):
        raise ValueError("pooled_df must be 'uncorrected' or 'gg'")
    M = _complete_matrix(datasets)
    n, k = M.shape
    if k < 2:
        raise ValueError("need at least 2 treatments")
    names = list(names) if names else [f"Treatment {i}" for i in range(k)]
    control = int(control)
    if not 0 <= control < k:
        raise ValueError(f"control index {control} is out of range "
                         f"(0..{k - 1})")
    means = [float(v) for v in M.mean(axis=0)]
    eps = _gg_epsilon(M) if k > 2 else 1.0
    notes = []
    if error == "pooled":
        out = _pooled(M, means, names, method, control, family, pairs,
                      pooled_df, eps, ci_level, notes)
    else:
        out = _per_pair(M, means, names, method, control, family, pairs,
                        ci_level, notes)
    out.update({"error": error, "n_subjects": int(n), "n_treatments": int(k),
                "gg_epsilon": float(eps), "means": means, "names": names,
                "ci_level": ci_level, "notes": notes, "source": SOURCE})
    return out


def _pooled(M, means, names, method, control, family, pairs, pooled_df,
            eps, ci_level, notes):
    n, k = M.shape
    grand = M.mean()
    ss_total = float(((M - grand) ** 2).sum())
    ss_treat = float(n * ((M.mean(axis=0) - grand) ** 2).sum())
    ss_subject = float(k * ((M.mean(axis=1) - grand) ** 2).sum())
    ss_error = ss_total - ss_treat - ss_subject
    df_error = (n - 1) * (k - 1)
    ms_error = ss_error / df_error
    df = df_error * eps if pooled_df == "gg" else df_error
    if pooled_df == "gg":
        notes.append(f"Pooled error with df multiplied by the Geisser-"
                     f"Greenhouse epsilon ({eps:.4g}): df = {df:.4g}. The "
                     "statistics guide instead computes each comparison "
                     "from its own two columns when sphericity is not "
                     "assumed (error = 'per_pair').")
    else:
        notes.append("Pooled error term (mean square residual of the RM "
                     "ANOVA), which assumes sphericity; without that "
                     "assumption the guide uses each pair's own paired "
                     "differences (error = 'per_pair').")
    planned = method not in ("tukey", "dunnett") and family not in (None,
                                                                    "all")
    res = anova._comparisons_from_stats(
        means, [n] * k, ms_error, df, method, names=names,
        control_index=control, ci_level=ci_level,
        comparisons_family=family if planned else None,
        pairs=pairs if planned else None)
    fam_pairs, fam = _family_pairs(k, method, family, control, pairs)
    se = math.sqrt(2.0 * ms_error / n)
    for c, (i, j) in zip(res["comparisons"], fam_pairs):
        c["se"] = se
        c["df"] = float(df)
        c["a_index"], c["b_index"] = int(i), int(j)
        if method == "tukey":
            c["q"] = c["statistic"]
    res.update({"ms_error": float(ms_error), "df_error": int(df_error),
                "df": float(df), "pooled_df": pooled_df})
    return res


def _per_pair(M, means, names, method, control, family, pairs, ci_level,
              notes):
    n, k = M.shape
    df = n - 1
    fam_pairs, fam = _family_pairs(k, method, family, control, pairs)
    m = len(fam_pairs)
    rows = []
    for i, j in fam_pairs:
        d = M[:, i] - M[:, j]
        diff = float(d.mean())
        se = float(d.std(ddof=1)) / math.sqrt(n)
        t = abs(diff) / se if se > 0 else (math.inf if diff else math.nan)
        p = (2.0 * float(stats.t.sf(t, df)) if math.isfinite(t)
             else (0.0 if t == math.inf else math.nan))
        rows.append({"i": i, "j": j, "diff": diff, "se": se, "t": t,
                     "p": p})
    alpha = 1.0 - ci_level
    half = [None] * m
    if method == "tukey":
        notes.append("Tukey with each pair's own SE: studentized range with "
                     "df = n - 1 (an approximation; the statistics are not "
                     "exactly studentized-range distributed).")
        q = np.array([r["t"] * math.sqrt(2.0) for r in rows])
        p_adj = [min(float(v), 1.0) for v in studentized.sf(q, k, df)]
        qcrit = studentized.ppf(ci_level, k, df)
        half = [qcrit * r["se"] / math.sqrt(2.0) for r in rows]
        stat = [float(v) for v in q]
    elif method == "dunnett":
        notes.append("Dunnett with each pair's own SE: multivariate t with "
                     "df = n - 1 and the sample correlation of the paired "
                     "differences (an approximation).")
        D = np.column_stack([M[:, r["i"]] - M[:, r["j"]] for r in rows])
        C = np.atleast_2d(np.cov(D.T, ddof=1))
        sd = np.sqrt(np.diag(C))
        if np.all(sd > 0):
            R = C / np.outer(sd, sd)
            p_adj = [dunnett.sf(r["t"], R, df) if math.isfinite(r["t"])
                     else 0.0 for r in rows]
            ccrit = dunnett.critical_value(ci_level, R, df)
            half = [ccrit * r["se"] for r in rows]
        else:  # a difference without scatter: fall back to Sidak
            notes.append("A paired difference has no scatter; Dunnett "
                         "replaced by the Sidak correction.")
            p_adj = anova.adjust_p([r["p"] for r in rows], "sidak")
        stat = [r["t"] for r in rows]
    else:
        corr = {"bonferroni": "bonferroni", "sidak": "sidak",
                "holm": "holm", "holm_sidak": "holm_sidak",
                "fisher_lsd": "none"}[method]
        p_adj = anova.adjust_p([r["p"] for r in rows], corr)
        tcrit = None
        if method == "bonferroni":
            tcrit = float(stats.t.ppf(1 - alpha / (2 * m), df))
        elif method == "sidak":
            a_per = 1 - (1 - alpha) ** (1 / m)
            tcrit = float(stats.t.ppf(1 - a_per / 2, df))
        elif method == "fisher_lsd":
            tcrit = float(stats.t.ppf(1 - alpha / 2, df))
        if tcrit is not None:
            half = [tcrit * r["se"] for r in rows]
        stat = [r["t"] for r in rows]
    comps = []
    for r, pa, h, st in zip(rows, p_adj, half, stat):
        entry = {"pair": f"{names[r['i']]} vs. {names[r['j']]}",
                 "a_index": int(r["i"]), "b_index": int(r["j"]),
                 "difference": r["diff"], "se": r["se"],
                 "ci": ([r["diff"] - h, r["diff"] + h] if h is not None
                        else None),
                 "statistic": float(st), "t": float(r["t"]),
                 "df": float(df), "p_unadjusted": float(r["p"]),
                 "p_adjusted": float(pa),
                 "significant_05": bool(pa < 0.05),
                 "family_size": m, "method": method}
        if method == "tukey":
            entry["q"] = float(st)
        comps.append(entry)
    ctrl_name = names[control] if fam == "control" else None
    return {"method": method, "df": float(df), "comparisons": comps,
            "family": anova.family_block(method, m, k, fam, ctrl_name)}
