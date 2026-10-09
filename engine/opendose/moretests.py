"""Column-data tests beyond the classic t test / one-way ANOVA set.

GraphPad statistics guide pages whose documented methods this implements:

- "Interpreting results: Kolmogorov-Smirnov test": the two-sample KS
  test compares the two cumulative distributions; D is their largest
  distance; P is exact (ties accounted for, by reshuffling the data)
  for the small group sizes the guide lists -- (2, 2) ... (2, 346),
  (3, 3) ... (3, 69), (4, 4) ... (4, 32), (5, 5) ... (5, 20), (6, 6) ...
  (6, 15), (7, 7) ... (7, 12), (8, 8) ... (8, 10), (9, 9), i.e. when the
  number of ways to choose n1 of the n1 + n2 values is below about
  60,000 -- and otherwise from the large-sample approximation (Lehmann;
  Numerical Recipes). No CI is reported (no parameter is compared), and
  the single P value is what some texts call two-tailed.
- "Welch and Brown-Forsythe ANOVA", "Interpreting results: Welch and
  Brown-Forsythe tests": one-way ANOVA without assuming equal SDs.
  Welch's W with numerator df k - 1 and Welch's denominator df; the
  Brown-Forsythe F* (a test of means, not the Brown-Forsythe test of
  variances) with numerator df k - 1 and Satterthwaite denominator df.
- "How the Dunnett T3, Games and Howell, and Tamhane T2 tests work":
  without equal SDs each comparison uses only the two groups' SDs and
  sizes: t = difference / sqrt(s_i^2/n_i + s_j^2/n_j) with Welch df. The
  three tests share t and df and differ in how P comes from them:
  Games-Howell from the studentized range (k means), Dunnett's T3 from
  the studentized maximum modulus (one modulus per comparison in the
  family; designed for all pairs), Tamhane's T2 from the t distribution
  with the Sidak correction. "Don't correct for multiple comparisons"
  gives Welch t tests ("welch_uncorrected"). T3 and T2 are offered for
  comparisons with a control as well; Games-Howell for all pairs.
- "Newman-Keuls method", "Options tab: Multiple comparisons": the
  step-down studentized-range procedure, offered for compatibility only;
  reports statistical significance but neither CIs nor multiplicity
  adjusted P values.

Every comparisons table also states its family ("Multiple comparisons:
adjusted P values", GraphPad statistics guide; Bender & Lange 2001, J
Clin Epidemiol 54:343): each comparison carries "p_unadjusted" (the
unprotected test of that pair: here the Welch t test with the Welch-
Satterthwaite df; for Newman-Keuls the pooled-variance t test with the
ANOVA's residual MS and df), "family_size" (the number of comparisons the
correction used) and "method"; the result carries a family block
{size, method, label} (comparison_family below, shared by the other
modules' comparisons tables).

Not in the guide (no Prism dialog offers it), provided because it is a
standard companion of the Kruskal-Wallis test:
- Mood's median test: counts above / not above the grand median in each
  group, chi-square test of that 2 x k table (Fisher's exact test as
  well for two groups).
"""

from __future__ import annotations

import math
from itertools import combinations

import numpy as np
from scipy import stats

from . import exactdist, studentized


def _clean(values) -> np.ndarray:
    return np.array([float(v) for v in values
                     if v is not None and not (isinstance(v, float)
                                               and math.isnan(v))],
                    dtype=float)


# ------------------------------------------------- comparison families

METHOD_NAMES = {
    "tukey": "Tukey", "dunnett": "Dunnett", "bonferroni": "Bonferroni",
    "sidak": "Sidak", "holm_sidak": "Holm-Sidak", "holm": "Holm",
    "fisher_lsd": "Fisher's LSD (no correction)",
    "none": "No correction", "newman_keuls": "Newman-Keuls",
    "games_howell": "Games-Howell", "dunnett_t3": "Dunnett T3",
    "tamhane_t2": "Tamhane T2",
    "welch_uncorrected": "Welch t tests (no correction)",
    "dunn_bonferroni": "Dunn (Bonferroni)", "dunn_holm": "Dunn (Holm)",
    "dunn_none": "Dunn (no correction)",
    "bh": "Benjamini-Hochberg FDR", "by": "Benjamini-Yekutieli FDR",
    "bky": "Two-stage Benjamini-Krieger-Yekutieli FDR",
}


def comparison_family(size: int, method: str, scope: str | None = None
                      ) -> dict:
    """The {size, method, label} block that names a comparisons family:
    size = number of comparisons the multiplicity adjustment used,
    method = its id, label e.g. "Tukey, 6 comparisons (all pairs of 4
    means)"."""
    size = int(size)
    name = METHOD_NAMES.get(method, method)
    label = f"{name}, {size} comparison{'' if size == 1 else 's'}"
    if scope:
        label += f" ({scope})"
    return {"size": size, "method": method, "label": label}


# ----------------------------------------------- two-sample Kolmogorov-Smirnov

# Largest second group size for which the guide lists an exact P value,
# by the smaller group size.
KS_EXACT_SIZES = {2: 346, 3: 69, 4: 32, 5: 20, 6: 15, 7: 12, 8: 10, 9: 9}


def ks_exact_rule(n1: int, n2: int) -> bool:
    small, large = min(n1, n2), max(n1, n2)
    return large <= KS_EXACT_SIZES.get(small, -1)


def ks_two_sample(values_a, values_b, *, method: str = "auto") -> dict:
    """Two-sample Kolmogorov-Smirnov test. method: "auto" (the guide's
    rule), "exact" or "asymptotic"."""
    a, b = _clean(values_a), _clean(values_b)
    n1, n2 = a.size, b.size
    if n1 < 1 or n2 < 1:
        raise ValueError("each group needs at least 1 value")
    if method not in ("auto", "exact", "asymptotic"):
        raise ValueError(f"unknown method: {method}")
    d_num = exactdist.ks_d_numerator(a, b)
    d = d_num / float(n1 * n2)
    exact = (ks_exact_rule(n1, n2) if method == "auto"
             else method == "exact")
    if exact:
        p = exactdist.ks_2samp_exact_p(a, b)
    else:
        p = exactdist.ks_2samp_asymptotic_p(d, n1, n2)
    return {
        "test": "kolmogorov_smirnov",
        "D": d, "p": p,
        "p_method": "exact" if exact else "approximate",
        "n_a": int(n1), "n_b": int(n2),
        "median_a": float(np.median(a)), "median_b": float(np.median(b)),
        "ties": bool(exactdist.has_ties(np.concatenate([a, b]))),
    }


# ----------------------------------------------- Welch / Brown-Forsythe ANOVA

def _group_stats(groups):
    ns = np.array([g.size for g in groups], dtype=float)
    means = np.array([g.mean() for g in groups])
    variances = np.array([g.var(ddof=1) for g in groups])
    return ns, means, variances


def welch_anova(datasets) -> dict:
    """Welch's (1951) heteroscedastic one-way ANOVA: W, df, P."""
    groups = [_clean(g) for g in datasets]
    groups = [g for g in groups if g.size > 0]
    k = len(groups)
    if k < 2:
        raise ValueError("Welch ANOVA needs at least 2 non-empty groups")
    if any(g.size < 2 for g in groups):
        raise ValueError("every group needs at least 2 values")
    ns, means, variances = _group_stats(groups)
    if np.any(variances <= 0):
        raise ValueError("Welch ANOVA needs a nonzero SD in every group")
    w = ns / variances
    sw = w.sum()
    mw = float((w * means).sum() / sw)
    a = float((w * (means - mw) ** 2).sum() / (k - 1))
    lam = float(((1 - w / sw) ** 2 / (ns - 1)).sum())
    b = 1 + 2 * (k - 2) / (k * k - 1.0) * lam
    stat = a / b
    df1, df2 = k - 1, (k * k - 1.0) / (3.0 * lam)
    return {"W": stat, "dfn": df1, "dfd": df2,
            "p": float(stats.f.sf(stat, df1, df2)),
            "weighted_mean": mw}


def brown_forsythe_anova(datasets) -> dict:
    """Brown & Forsythe (1974) F* test of equal means without assuming
    equal variances (numerator df k - 1, as the guide states)."""
    groups = [_clean(g) for g in datasets]
    groups = [g for g in groups if g.size > 0]
    k = len(groups)
    if k < 2:
        raise ValueError("Brown-Forsythe ANOVA needs at least 2 groups")
    if any(g.size < 2 for g in groups):
        raise ValueError("every group needs at least 2 values")
    ns, means, variances = _group_stats(groups)
    n = ns.sum()
    grand = float((ns * means).sum() / n)
    num = float((ns * (means - grand) ** 2).sum())
    terms = (1 - ns / n) * variances
    den = float(terms.sum())
    if not den > 0:
        raise ValueError("Brown-Forsythe ANOVA needs a nonzero SD")
    stat = num / den
    c = terms / den
    df2 = 1.0 / float((c ** 2 / (ns - 1)).sum())
    df1 = k - 1
    return {"F": stat, "dfn": df1, "dfd": df2,
            "p": float(stats.f.sf(stat, df1, df2))}


def anova_unequal_variances(datasets, names=None, *, comparisons=None,
                            control_index: int = 0, family: str = "all",
                            ci_level: float = 0.95) -> dict:
    """One-way ANOVA without assuming equal SDs: Welch and
    Brown-Forsythe, plus optional multiple comparisons (games_howell,
    dunnett_t3, tamhane_t2, welch_uncorrected)."""
    groups = [_clean(g) for g in datasets]
    names = list(names or [f"Group {i}" for i in range(len(groups))])
    out = {
        "welch": welch_anova(groups),
        "brown_forsythe": brown_forsythe_anova(groups),
        "group_summaries": [
            {"name": names[i], "n": int(g.size), "mean": float(g.mean()),
             "sd": float(g.std(ddof=1)) if g.size > 1 else None}
            for i, g in enumerate(groups)],
    }
    if comparisons:
        out["multiple_comparisons"] = unequal_variance_comparisons(
            groups, comparisons, names=names, control_index=control_index,
            family=family, ci_level=ci_level)
    return out


# ------------------------------------ comparisons without equal variances

UNEQUAL_VARIANCE_METHODS = ("games_howell", "dunnett_t3", "tamhane_t2",
                            "welch_uncorrected")


def unequal_variance_comparisons(datasets, method: str, *, names=None,
                                 control_index: int = 0,
                                 family: str = "all",
                                 ci_level: float = 0.95) -> dict:
    """Pairwise comparisons that use only each pair's own SDs (Welch t
    and df). family: "all" pairs or "control" (each vs control_index)."""
    if method not in UNEQUAL_VARIANCE_METHODS:
        raise ValueError(f"unknown multiple-comparisons method: {method}")
    if family not in ("all", "control"):
        raise ValueError(f"unknown comparison family: {family}")
    if method == "games_howell" and family != "all":
        raise ValueError("Games-Howell compares every pair of means")
    groups = [_clean(g) for g in datasets]
    if any(g.size < 2 for g in groups):
        raise ValueError("every group needs at least 2 values")
    k = len(groups)
    names = list(names or [f"Group {i}" for i in range(k)])
    ns, means, variances = _group_stats(groups)
    if family == "all":
        pairs = list(combinations(range(k), 2))
    else:
        pairs = [(i, control_index) for i in range(k) if i != control_index]
    m = len(pairs)
    alpha = 1.0 - ci_level
    comparisons = []
    for i, j in pairs:
        diff = float(means[i] - means[j])
        vi, vj = variances[i] / ns[i], variances[j] / ns[j]
        se = math.sqrt(vi + vj)
        df = ((vi + vj) ** 2 / (vi ** 2 / (ns[i] - 1) + vj ** 2 / (ns[j] - 1))
              if se > 0 else float("nan"))
        t = abs(diff) / se if se > 0 else (math.inf if diff else math.nan)
        entry = {"pair": f"{names[i]} vs. {names[j]}", "difference": diff,
                 "se": se, "t": t, "df": float(df)}
        if not (se > 0 and df == df):
            entry.update({"statistic": t, "ci": None,
                          "p_adjusted": math.nan, "significant_05": False,
                          "significant": False,
                          "note": "both groups have zero SD",
                          "p_unadjusted": math.nan, "family_size": m,
                          "method": method, "a_index": i, "b_index": j})
            comparisons.append(entry)
            continue
        if method == "games_howell":
            q = t * math.sqrt(2.0)
            p = studentized.sf(q, k, df)
            crit = studentized.ppf(ci_level, k, df) / math.sqrt(2.0)
            entry["statistic"] = q
        elif method == "dunnett_t3":
            p = exactdist.smm_sf(t, m, df)
            crit = exactdist.smm_ppf(ci_level, m, df)
            entry["statistic"] = t
        elif method == "tamhane_t2":
            p_raw = 2 * float(stats.t.sf(t, df))
            p = 1 - (1 - p_raw) ** m
            crit = float(stats.t.ppf(1 - (1 - (1 - alpha) ** (1.0 / m)) / 2,
                                     df))
            entry["statistic"] = t
        else:  # welch_uncorrected
            p = 2 * float(stats.t.sf(t, df))
            crit = float(stats.t.ppf(1 - alpha / 2, df))
            entry["statistic"] = t
        p = float(min(max(p, 0.0), 1.0))
        entry.update({"ci": [diff - crit * se, diff + crit * se],
                      "p_adjusted": p,
                      "significant_05": bool(p < 0.05),
                      "significant": bool(p < alpha)})
        # the unprotected Welch t test of this pair (same t and df)
        entry.update({"p_unadjusted": float(2 * stats.t.sf(t, df)),
                      "family_size": m, "method": method,
                      "a_index": i, "b_index": j})
        comparisons.append(entry)
    scope = (f"all pairs of {k} means" if family == "all" else
             f"each of {k - 1} groups vs. {names[control_index]}")
    # "family" (the "all"/"control" choice) predates this block, so the
    # {size, method, label} block is "family_info" here.
    return {"method": method, "family": family, "n_comparisons": m,
            "ci_level": ci_level, "comparisons": comparisons,
            "family_info": comparison_family(m, method, scope)}


# -------------------------------------------------------------- Newman-Keuls

def newman_keuls_from_stats(means, ns, ms_res, df_res, *, names=None,
                            alpha: float = 0.05) -> dict:
    """Student-Newman-Keuls step-down test on all pairs of means.

    Means are ordered; a pair spanning r means (r = 2..k) is significant
    when q = |difference| / sqrt(MS_res/2 (1/n_i + 1/n_j)) reaches the
    studentized-range critical value for r means and df_res, and no
    wider range containing it was found not significant."""
    k = len(means)
    names = list(names or [f"Group {i}" for i in range(k)])
    order = sorted(range(k), key=lambda g: means[g])
    results = {}
    nonsig_ranges = []  # (lo, hi) positions found not significant
    for span in range(k, 1, -1):
        qcrit = studentized.ppf(1 - alpha, span, df_res)
        for lo in range(0, k - span + 1):
            hi = lo + span - 1
            gi, gj = order[lo], order[hi]
            se = math.sqrt(ms_res / 2.0 * (1.0 / ns[gi] + 1.0 / ns[gj]))
            diff = means[gj] - means[gi]
            q = diff / se if se > 0 else (math.inf if diff else 0.0)
            covered = any(a <= lo and hi <= b for a, b in nonsig_ranges)
            significant = (not covered) and q >= qcrit
            if not significant:
                nonsig_ranges.append((lo, hi))
            results[frozenset((gi, gj))] = {
                "statistic": q, "steps": span, "q_critical": qcrit,
                "significant": bool(significant),
                "tested": not covered}
    comparisons = []
    n_pairs = k * (k - 1) // 2
    for i, j in combinations(range(k), 2):
        r = results[frozenset((i, j))]
        # unprotected pooled-variance t test of this pair (residual MS, df)
        se_t = math.sqrt(ms_res * (1.0 / ns[i] + 1.0 / ns[j]))
        d_ij = means[i] - means[j]
        t_ij = abs(d_ij) / se_t if se_t > 0 else (math.inf if d_ij else 0.0)
        comparisons.append({
            "pair": f"{names[i]} vs. {names[j]}",
            "difference": means[i] - means[j],
            "ci": None, "p_adjusted": None,
            "statistic": r["statistic"], "steps": r["steps"],
            "q_critical": r["q_critical"], "tested": r["tested"],
            "significant": r["significant"],
            "significant_05": (r["significant"] if abs(alpha - 0.05) < 1e-12
                               else None),
            "p_unadjusted": float(2.0 * stats.t.sf(t_ij, df_res)),
            "family_size": n_pairs, "method": "newman_keuls",
            "a_index": i, "b_index": j,
        })
    return {"method": "newman_keuls", "df": df_res, "alpha": alpha,
            "comparisons": comparisons,
            "ordered_groups": [names[g] for g in order],
            "family": comparison_family(
                n_pairs, "newman_keuls",
                f"all pairs of {k} means; significance only, no adjusted "
                f"P values")}


# ------------------------------------------------------------ median test

def median_test(datasets, names=None) -> dict:
    """Mood's median test (values equal to the grand median count as
    'not above')."""
    groups = [_clean(g) for g in datasets]
    if len(groups) < 2 or any(g.size < 1 for g in groups):
        raise ValueError("the median test needs at least 2 non-empty groups")
    names = list(names or [f"Group {i}" for i in range(len(groups))])
    grand = float(np.median(np.concatenate(groups)))
    above = np.array([int(np.sum(g > grand)) for g in groups])
    below = np.array([int(g.size) for g in groups]) - above
    table = np.vstack([above, below]).astype(float)
    out = {"test": "median_test", "grand_median": grand,
           "table": {"above": above.tolist(), "not_above": below.tolist()},
           "group_summaries": [
               {"name": names[i], "n": int(g.size),
                "median": float(np.median(g)), "above": int(above[i]),
                "not_above": int(below[i])}
               for i, g in enumerate(groups)]}
    if np.any(table.sum(axis=1) == 0):
        out.update({"chi_square": None,
                    "note": "every value falls on one side of the median"})
        return out
    chi2, p, dof, expected = stats.chi2_contingency(table, correction=False)
    out["chi_square"] = {"chi2": float(chi2), "df": int(dof), "p": float(p)}
    if np.any(expected < 5):
        out["warning"] = ("some expected counts are below 5; the "
                          "chi-square P value is only approximate")
    if len(groups) == 2:
        chi2_y, p_y, _, _ = stats.chi2_contingency(table, correction=True)
        out["chi_square_yates"] = {"chi2": float(chi2_y), "p": float(p_y)}
        out["fisher_exact"] = {
            "p": float(stats.fisher_exact(table.astype(int))[1])}
    return out
