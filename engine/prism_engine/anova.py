"""One-way ANOVA and follow-up multiple comparisons.

Prism statistics guide, "One-way ANOVA (and nonparametric)":
- ANOVA table: SS/df/MS for between (treatment) and within (residual),
  F, P, R squared (eta squared = SS_between / SS_total).
- Equal-variance checks: Brown-Forsythe and Bartlett's tests.
- Multiple comparisons, all using the pooled residual MS and df:
  * Tukey(-Kramer): studentized range q; adjusted P and simultaneous CIs.
    Prism reports q = |mean_i - mean_j| / SE where SE = sqrt(MS_res/2 *
    (1/n_i + 1/n_j)), dividing the range statistic's scale by sqrt(2).
  * Dunnett: every group vs a control (multivariate t distribution).
  * Bonferroni / Sidak: pairwise t with alpha correction.
  * Holm-Sidak: step-down Sidak.
- Nonparametric: Kruskal-Wallis (tie-corrected H) with Dunn's post test.
"""

from __future__ import annotations

import math
from itertools import combinations

import numpy as np
from scipy import stats


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
    grand_mean = float(np.concatenate(groups).mean())

    ss_between = sum(n * (g.mean() - grand_mean) ** 2 for n, g in zip(ns, groups))
    ss_within = sum(((g - g.mean()) ** 2).sum() for g in groups)
    ss_total = ss_between + ss_within
    df_between, df_within = k - 1, n_total - k
    ms_between = ss_between / df_between
    ms_within = ss_within / df_within
    f = ms_between / ms_within
    p = float(stats.f.sf(f, df_between, df_within))

    bf_stat, bf_p = stats.levene(*groups, center="median")  # Brown-Forsythe
    try:
        bart_stat, bart_p = stats.bartlett(*groups)
    except ValueError:
        bart_stat = bart_p = float("nan")

    return {
        "table": {
            "ss_between": float(ss_between), "df_between": df_between,
            "ms_between": float(ms_between),
            "ss_within": float(ss_within), "df_within": df_within,
            "ms_within": float(ms_within),
            "ss_total": float(ss_total),
            "F": float(f), "p": p,
            "r_squared": float(ss_between / ss_total) if ss_total > 0 else None,
        },
        "group_summaries": [
            {"name": (names[i] if names else f"Group {i}"),
             "n": int(g.size), "mean": float(g.mean()),
             "sd": float(g.std(ddof=1))}
            for i, g in enumerate(groups)
        ],
        "brown_forsythe": {"F": float(bf_stat), "p": float(bf_p)},
        "bartlett": {"statistic": float(bart_stat), "p": float(bart_p)},
    }


def _pairs_vs_all(k):
    return list(combinations(range(k), 2))


def _pairs_vs_control(k, control):
    return [(i, control) for i in range(k) if i != control]


def multiple_comparisons(datasets, method: str, *, names=None,
                         control_index: int = 0,
                         ci_level: float = 0.95) -> dict:
    """Post-ANOVA pairwise comparisons using pooled residual variance."""
    groups = _groups(datasets)
    if any(g.size < 2 for g in groups):
        raise ValueError("every group needs at least 2 values")
    k = len(groups)
    ns = [g.size for g in groups]
    means = [float(g.mean()) for g in groups]
    df_res = sum(ns) - k
    ms_res = sum(((g - g.mean()) ** 2).sum() for g in groups) / df_res
    names = names or [f"Group {i}" for i in range(k)]
    alpha = 1 - ci_level

    comparisons = []

    if method == "dunnett":
        others = [i for i in range(k) if i != control_index]
        res = stats.dunnett(*[groups[i] for i in others],
                            control=groups[control_index])
        ci = res.confidence_interval(ci_level)
        for j, i in enumerate(others):
            diff = means[i] - means[control_index]
            comparisons.append({
                "pair": f"{names[i]} vs. {names[control_index]}",
                "difference": diff,
                "ci": [float(ci.low[j]), float(ci.high[j])],
                "statistic": float(abs(res.statistic[j])),
                "p_adjusted": float(res.pvalue[j]),
                "significant_05": bool(res.pvalue[j] < 0.05),
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

    if method in ("bonferroni", "sidak", "holm_sidak"):
        pairs = _pairs_vs_all(k)
        m = len(pairs)
        raw = []
        for i, j in pairs:
            diff = means[i] - means[j]
            se = math.sqrt(ms_res * (1 / ns[i] + 1 / ns[j]))
            t = abs(diff) / se
            p_unadj = 2 * float(stats.t.sf(t, df_res))
            raw.append((i, j, diff, se, t, p_unadj))

        if method == "holm_sidak":
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

    raise ValueError(f"unknown multiple-comparisons method: {method}")


def kruskal_wallis(datasets, names=None, *, dunns: bool = True) -> dict:
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
        out["dunns"] = _dunns(groups, names)
    return out


def _dunns(groups, names) -> dict:
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
        p_adj = min(2 * float(stats.norm.sf(z)) * m, 1.0)
        comparisons.append({
            "pair": f"{names[i]} vs. {names[j]}",
            "mean_rank_difference": mean_ranks[i] - mean_ranks[j],
            "statistic": z,
            "p_adjusted": p_adj,
            "significant_05": bool(p_adj < 0.05),
        })
    return {"method": "dunns", "comparisons": comparisons}
