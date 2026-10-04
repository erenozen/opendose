"""One-way ANOVA and follow-up multiple comparisons.

Prism statistics guide, "One-way ANOVA (and nonparametric)":
- ANOVA table: SS/df/MS for between (treatment) and within (residual),
  F, P, R squared (eta squared = SS_between / SS_total).
- Equal-variance checks: Brown-Forsythe and Bartlett's tests; also the
  Fligner-Killeen test (not a Prism option; Conover, Johnson & Johnson
  1981, as R's fligner.test: absolute deviations from the group medians,
  ranked, scored a_i = Phi^-1((1 + rank_i/(N+1))/2); chi-square on k-1
  df).
- Multiple comparisons, all using the pooled residual MS and df:
  * Tukey(-Kramer): studentized range q; adjusted P and simultaneous CIs.
    Prism reports q = |mean_i - mean_j| / SE where SE = sqrt(MS_res/2 *
    (1/n_i + 1/n_j)), dividing the range statistic's scale by sqrt(2).
  * Dunnett: every group vs a control (multivariate t distribution,
    evaluated exactly and deterministically by opendose.dunnett).
  * Bonferroni / Sidak: pairwise t with alpha correction.
  * Holm-Sidak: step-down Sidak; Holm: step-down Bonferroni (Holm 1979,
    not a Prism option; R's p.adjust "holm"). No CIs for step-down
    methods.
- Nonparametric: Kruskal-Wallis (tie-corrected H) with Dunn's post test.
  Dunn's z uses the tie-corrected SE the guide gives ("How the Dunn
  method for nonparametric comparisons works"): sqrt([N(N+1) -
  sum(T^3 - T)/(N - 1)] / 12 * (1/n_i + 1/n_j)); corrected (x number of
  comparisons, capped at 1) or uncorrected P.
- Also offered (statistics guide, "Options tab: Multiple comparisons:
  One-way ANOVA"): Fisher's LSD ("Don't correct for multiple
  comparisons": unprotected t tests with the pooled SD and residual df;
  "Prism does not perform a protected Fisher's LSD test") and
  Newman-Keuls (significance only, opendose.moretests). Without equal
  SDs: Games-Howell, Dunnett T3, Tamhane T2 and uncorrected Welch t
  tests (opendose.moretests.unequal_variance_comparisons).
- Effect sizes (opendose.effectsize), under "effect_size": eta^2 with
  its noncentral-F CI, omega^2, epsilon^2 and Cohen's f for the ANOVA;
  epsilon^2_R and eta^2_H for Kruskal-Wallis.
"""

from __future__ import annotations

import math
from itertools import combinations

import numpy as np
from scipy import stats

from . import dunnett, effectsize


def _groups(datasets) -> list[np.ndarray]:
    out = []
    for values in datasets:
        arr = np.array([float(v) for v in values if v is not None], dtype=float)
        out.append(arr)
    return out


def one_way_anova(datasets, names=None) -> dict:
    groups = [g for g in _groups(datasets) if g.size > 0]
    if len(groups) < 2:
        raise ValueError("one-way ANOVA needs at least 2 non-empty groups")
    if any(g.size < 2 for g in groups):
        raise ValueError("every group needs at least 2 values")
    k = len(groups)
    ns = [g.size for g in groups]
    n_total = sum(ns)
    # The sums of squares are shift-invariant. Subtracting one data value
    # first keeps the group means accurate when the data sit far from zero
    # (x - x0 is exact for nearby x by Sterbenz's lemma): without it the
    # between-group SS lost ~1.5 digits on NIST StRD SmLs04 / AtmWtAg.
    shift = groups[0][0]
    shifted = [g - shift for g in groups]
    grand_mean = float(np.concatenate(shifted).mean())

    ss_between = sum(n * (g.mean() - grand_mean) ** 2
                     for n, g in zip(ns, shifted))
    ss_within = sum(((g - g.mean()) ** 2).sum() for g in groups)

    bf_stat, bf_p = stats.levene(*groups, center="median")  # Brown-Forsythe
    try:
        bart_stat, bart_p = stats.bartlett(*groups)
    except ValueError:
        bart_stat = bart_p = float("nan")

    return {
        "fligner_killeen": fligner_killeen(groups),
        "table": _anova_table(ss_between, ss_within, k, n_total),
        "group_summaries": [
            {"name": (names[i] if names else f"Group {i}"),
             "n": int(g.size), "mean": float(g.mean()),
             "sd": float(g.std(ddof=1))}
            for i, g in enumerate(groups)
        ],
        "brown_forsythe": {"F": float(bf_stat), "p": float(bf_p)},
        "bartlett": {"statistic": float(bart_stat), "p": float(bart_p)},
        "effect_size": effectsize.safe(effectsize.one_way, ss_between,
                                       k - 1, ss_within, n_total - k),
    }


def fligner_killeen(groups) -> dict:
    """Fligner-Killeen (median-centred) test of equal variances."""
    groups = [np.asarray(g, dtype=float) for g in groups]
    k = len(groups)
    dev = np.concatenate([np.abs(g - np.median(g)) for g in groups])
    n = dev.size
    a = stats.norm.ppf((1.0 + stats.rankdata(dev) / (n + 1)) / 2.0)
    sizes = [g.size for g in groups]
    idx = np.cumsum([0] + sizes)
    sums = np.array([a[idx[i]:idx[i + 1]].sum() for i in range(k)])
    var_a = float(np.var(a, ddof=1))
    if not var_a > 0:
        return {"statistic": None, "df": k - 1, "p": None}
    stat = float((np.sum(sums ** 2 / np.array(sizes)) - n * a.mean() ** 2)
                 / var_a)
    return {"statistic": stat, "df": k - 1,
            "p": float(stats.chi2.sf(stat, k - 1))}


def _anova_table(ss_between, ss_within, k, n_total) -> dict:
    """ANOVA table from the between/within sums of squares. Shared by
    one_way_anova (raw values) and opendose.summary, which computes the
    same sums of squares from entered mean, SD and n (statistics guide,
    "Entering data for one-way ANOVA and related tests")."""
    ss_total = ss_between + ss_within
    df_between, df_within = k - 1, n_total - k
    ms_between = ss_between / df_between
    ms_within = ss_within / df_within
    f = ms_between / ms_within
    p = float(stats.f.sf(f, df_between, df_within))
    return {
        "ss_between": float(ss_between), "df_between": df_between,
        "ms_between": float(ms_between),
        "ss_within": float(ss_within), "df_within": df_within,
        "ms_within": float(ms_within),
        "ss_total": float(ss_total),
        "F": float(f), "p": p,
        "r_squared": float(ss_between / ss_total) if ss_total > 0 else None,
    }


def _pairs_vs_all(k):
    return list(combinations(range(k), 2))


def _pairs_vs_control(k, control):
    return [(i, control) for i in range(k) if i != control]


def multiple_comparisons(datasets, method: str, *, names=None,
                         control_index: int = 0,
                         ci_level: float = 0.95,
                         family: str = "all") -> dict:
    """Post-ANOVA pairwise comparisons using pooled residual variance."""
    from . import moretests  # local import: moretests is a leaf module

    if method in moretests.UNEQUAL_VARIANCE_METHODS:
        return moretests.unequal_variance_comparisons(
            datasets, method, names=names, control_index=control_index,
            family=family, ci_level=ci_level)
    groups = _groups(datasets)
    if any(g.size < 2 for g in groups):
        raise ValueError("every group needs at least 2 values")
    k = len(groups)
    ns = [g.size for g in groups]
    means = [float(g.mean()) for g in groups]
    df_res = sum(ns) - k
    ms_res = sum(((g - g.mean()) ** 2).sum() for g in groups) / df_res
    return _comparisons_from_stats(means, ns, ms_res, df_res, method,
                                   names=names, control_index=control_index,
                                   ci_level=ci_level)


def _comparisons_from_stats(means, ns, ms_res, df_res, method: str, *,
                            names=None, control_index: int = 0,
                            ci_level: float = 0.95,
                            dunnett_samples=None) -> dict:
    """Multiple comparisons from group means, n and the pooled residual
    MS/df: every test here depends on the data only through these.
    Dunnett's P values and simultaneous CIs come from the exact
    (deterministic) Dunnett distribution of opendose.dunnett, which also
    depends only on these. dunnett_samples is accepted for backward
    compatibility and ignored."""
    k = len(means)
    names = names or [f"Group {i}" for i in range(k)]
    alpha = 1 - ci_level
    comparisons = []

    if method == "dunnett":
        # Each group minus the control: t = diff / SE with the pooled
        # residual MS; the k-1 statistics are jointly multivariate t with
        # correlation lambda_i lambda_j, lambda_i = sqrt(n_i/(n_i+n_0)).
        # P = P(max |T| > |t|); CI = diff +/- c * SE with c the two-sided
        # simultaneous critical value (root of the exact integral).
        c0 = control_index
        others = [i for i in range(k) if i != c0]
        lam = dunnett.control_lambdas(ns, c0)
        ccrit = dunnett.critical_value_one_factor(ci_level, lam, df_res)
        for i in others:
            diff = means[i] - means[c0]
            se = math.sqrt(ms_res * (1 / ns[i] + 1 / ns[c0]))
            if se > 0:
                t = abs(diff) / se
                p_adj = dunnett.sf_one_factor(t, lam, df_res)
            else:  # no residual scatter
                t = math.inf if diff != 0 else math.nan
                p_adj = 0.0 if diff != 0 else math.nan
            comparisons.append({
                "pair": f"{names[i]} vs. {names[c0]}",
                "difference": diff,
                "ci": [diff - ccrit * se, diff + ccrit * se],
                "statistic": t,
                "p_adjusted": p_adj,
                "significant_05": bool(p_adj < 0.05),
            })
        return {"method": method, "df": df_res, "comparisons": comparisons}

    if method == "tukey":
        for i, j in _pairs_vs_all(k):
            diff = means[i] - means[j]
            se = math.sqrt(ms_res / 2 * (1 / ns[i] + 1 / ns[j]))
            q = abs(diff) / se
            p_adj = float(stats.studentized_range.sf(q, k, df_res))
            q_crit = float(stats.studentized_range.ppf(ci_level, k, df_res))
            comparisons.append({
                "pair": f"{names[i]} vs. {names[j]}",
                "difference": diff,
                "ci": [diff - q_crit * se, diff + q_crit * se],
                "statistic": q,
                "p_adjusted": min(p_adj, 1.0),
                "significant_05": bool(p_adj < 0.05),
            })
        return {"method": method, "df": df_res, "comparisons": comparisons}

    if method in ("bonferroni", "sidak", "holm_sidak", "holm"):
        pairs = _pairs_vs_all(k)
        m = len(pairs)
        raw = []
        for i, j in pairs:
            diff = means[i] - means[j]
            se = math.sqrt(ms_res * (1 / ns[i] + 1 / ns[j]))
            t = abs(diff) / se
            p_unadj = 2 * float(stats.t.sf(t, df_res))
            raw.append((i, j, diff, se, t, p_unadj))

        if method == "holm":
            # Holm (1979) step-down Bonferroni: P_adj_i = (m - rank) p,
            # made monotone (R's p.adjust(method = "holm"))
            order = sorted(range(m), key=lambda idx: raw[idx][5])
            adj = [0.0] * m
            running_max = 0.0
            for rank, idx in enumerate(order):
                running_max = max(running_max, (m - rank) * raw[idx][5])
                adj[idx] = min(running_max, 1.0)
        elif method == "holm_sidak":
            # Step-down: rank ascending; P_adj_i = 1-(1-p)^(m-rank), with
            # monotonicity enforcement (Prism's Holm-Sidak).
            order = sorted(range(m), key=lambda idx: raw[idx][5])
            adj = [0.0] * m
            running_max = 0.0
            for rank, idx in enumerate(order):
                p_adj = 1 - (1 - raw[idx][5]) ** (m - rank)
                running_max = max(running_max, p_adj)
                adj[idx] = min(running_max, 1.0)
        elif method == "sidak":
            adj = [min(1 - (1 - p) ** m, 1.0) for *_, p in raw]
        else:
            adj = [min(p * m, 1.0) for *_, p in raw]

        # CIs use the alpha-corrected critical t (not defined for the
        # step-down Holm method; Prism likewise omits CIs there).
        tcrit = None
        if method in ("bonferroni", "sidak"):
            alpha_per = (alpha / m if method == "bonferroni"
                         else 1 - (1 - alpha) ** (1 / m))
            tcrit = float(stats.t.ppf(1 - alpha_per / 2, df_res))

        for (i, j, diff, se, t, _), p_adj in zip(raw, adj):
            comparisons.append({
                "pair": f"{names[i]} vs. {names[j]}",
                "difference": diff,
                "ci": ([diff - tcrit * se, diff + tcrit * se]
                       if tcrit is not None else None),
                "statistic": t,
                "p_adjusted": p_adj,
                "significant_05": bool(p_adj < 0.05),
            })
        return {"method": method, "df": df_res, "comparisons": comparisons}

    if method == "fisher_lsd":
        # Unprotected Fisher's LSD: t tests with the pooled residual SD
        # and df, no correction for multiple comparisons.
        tcrit = float(stats.t.ppf(1 - alpha / 2, df_res))
        for i, j in _pairs_vs_all(k):
            diff = means[i] - means[j]
            se = math.sqrt(ms_res * (1 / ns[i] + 1 / ns[j]))
            t = abs(diff) / se if se > 0 else (math.inf if diff else math.nan)
            p = 2 * float(stats.t.sf(t, df_res)) if t == t else math.nan
            comparisons.append({
                "pair": f"{names[i]} vs. {names[j]}",
                "difference": diff,
                "ci": [diff - tcrit * se, diff + tcrit * se],
                "statistic": t,
                "p_adjusted": p,  # individual P (no correction)
                "significant_05": bool(p < 0.05),
            })
        return {"method": method, "df": df_res, "comparisons": comparisons}

    if method == "newman_keuls":
        from . import moretests
        return moretests.newman_keuls_from_stats(
            means, ns, ms_res, df_res, names=names, alpha=alpha)

    raise ValueError(f"unknown multiple-comparisons method: {method}")


def kruskal_wallis(datasets, names=None, *, dunns: bool = True,
                   dunn_corrected: bool = True) -> dict:
    groups = _groups(datasets)
    if len(groups) < 2:
        raise ValueError("Kruskal-Wallis needs at least 2 groups")
    h, p = stats.kruskal(*groups)
    names = names or [f"Group {i}" for i in range(len(groups))]
    out = {
        "H": float(h), "p": float(p),
        "group_summaries": [
            {"name": names[i], "n": int(g.size), "median": float(np.median(g))}
            for i, g in enumerate(groups)
        ],
    }
    if dunns:
        out["dunns"] = _dunns(groups, names, corrected=dunn_corrected)
    out["effect_size"] = effectsize.safe(
        effectsize.kruskal_wallis, float(h), int(sum(g.size for g in groups)),
        len(groups))
    return out


def _dunns(groups, names, corrected: bool = True) -> dict:
    """Dunn's post test with tie correction; multiplicity-adjusted P via
    Bonferroni (Prism reports multiplicity-adjusted P values)."""
    all_values = np.concatenate(groups)
    n_total = all_values.size
    ranks = stats.rankdata(all_values)
    # mean rank per group
    idx = 0
    mean_ranks = []
    for g in groups:
        mean_ranks.append(float(ranks[idx:idx + g.size].mean()))
        idx += g.size
    # tie correction term
    _, counts = np.unique(all_values, return_counts=True)
    tie_term = float(((counts ** 3 - counts).sum()) / (12 * (n_total - 1)))
    pairs = _pairs_vs_all(len(groups))
    m = len(pairs)
    comparisons = []
    for i, j in pairs:
        se = math.sqrt((n_total * (n_total + 1) / 12 - tie_term)
                       * (1 / groups[i].size + 1 / groups[j].size))
        z = abs(mean_ranks[i] - mean_ranks[j]) / se
        p_adj = min(2 * float(stats.norm.sf(z)) * (m if corrected else 1),
                    1.0)
        comparisons.append({
            "pair": f"{names[i]} vs. {names[j]}",
            "mean_rank_difference": mean_ranks[i] - mean_ranks[j],
            "statistic": z,
            "p_adjusted": p_adj,
            "significant_05": bool(p_adj < 0.05),
        })
    if not corrected:
        return {"method": "dunns", "corrected": False,
                "comparisons": comparisons}
    return {"method": "dunns", "comparisons": comparisons}
