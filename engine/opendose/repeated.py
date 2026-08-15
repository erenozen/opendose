"""Repeated-measures analyses: RM one-way ANOVA and Friedman test.

Prism statistics guide:
- "Repeated-measures one-way ANOVA": subjects are rows, treatments are
  columns; SS partitioned into treatment, subject and error;
  F = MS_treatment / MS_error. Prism reports the Geisser-Greenhouse
  epsilon correction by default (no sphericity assumption): epsilon
  multiplies both df before computing P.
- "Friedman test": nonparametric RM alternative (rank within each
  subject); Prism reports the Friedman statistic and Dunn's post test
  with multiplicity-adjusted P values.
"""

from __future__ import annotations

import math
from itertools import combinations

import numpy as np
from scipy import stats


def _complete_matrix(datasets):
    """datasets: list of value-lists (one per treatment). Rows with any
    missing value are dropped (RM analyses need complete subjects)."""
    n_treat = len(datasets)
    n_rows = max(len(d) for d in datasets)
    rows = []
    for r in range(n_rows):
        row = [datasets[t][r] if r < len(datasets[t]) else None
               for t in range(n_treat)]
        if all(v is not None for v in row):
            rows.append([float(v) for v in row])
    if len(rows) < 2:
        raise ValueError("need at least 2 complete subject rows")
    return np.array(rows)  # subjects x treatments


def _gg_epsilon(M):
    """Geisser-Greenhouse epsilon from the sample covariance matrix."""
    S = np.cov(M.T, ddof=1)
    k = S.shape[0]
    mean_diag = np.trace(S) / k
    grand = S.mean()
    row_means = S.mean(axis=1)
    num = (k * (mean_diag - grand)) ** 2
    den = (k - 1) * (np.sum(S * S) - 2 * k * np.sum(row_means ** 2)
                     + k * k * grand * grand)
    if den <= 0:
        return 1.0
    return float(min(max(num / den, 1.0 / (k - 1)), 1.0))


def rm_one_way_anova(datasets, names=None) -> dict:
    M = _complete_matrix(datasets)
    n, k = M.shape  # subjects, treatments
    grand = M.mean()
    ss_total = float(((M - grand) ** 2).sum())
    ss_treat = float(n * ((M.mean(axis=0) - grand) ** 2).sum())
    ss_subject = float(k * ((M.mean(axis=1) - grand) ** 2).sum())
    ss_error = ss_total - ss_treat - ss_subject
    df_treat, df_subj = k - 1, n - 1
    df_error = df_treat * df_subj
    ms_treat = ss_treat / df_treat
    ms_error = ss_error / df_error
    if ms_error > 0:
        f = ms_treat / ms_error
        p_sphericity = float(stats.f.sf(f, df_treat, df_error))
        eps = _gg_epsilon(M)
        p_gg = float(stats.f.sf(f, df_treat * eps, df_error * eps))
    else:  # perfectly additive data: no within-subject error at all
        f, eps = math.inf, 1.0
        p_sphericity = p_gg = 0.0

    return {
        "analysis": "rm_one_way_anova",
        "n_subjects": int(n), "n_treatments": int(k),
        "table": {
            "ss_treatment": ss_treat, "df_treatment": df_treat,
            "ms_treatment": ms_treat,
            "ss_subject": ss_subject, "df_subject": df_subj,
            "ss_error": ss_error, "df_error": df_error,
            "ms_error": ms_error,
            "F": float(f),
            "p_assuming_sphericity": p_sphericity,
            "gg_epsilon": eps,
            "p_geisser_greenhouse": p_gg,
        },
        "r_squared": ss_treat / (ss_treat + ss_error)
        if ss_treat + ss_error > 0 else None,
        "treatment_means": [float(v) for v in M.mean(axis=0)],
        "names": names or [f"Treatment {i}" for i in range(k)],
    }


def rm_two_way_mixed(cells, *, row_names=None, col_names=None) -> dict:
    """Mixed-design ("RM by rows") two-way ANOVA.

    Prism statistics guide, "Two-way ANOVA with repeated measures":
    columns (datasets) are independent groups of subjects; rows are the
    repeated factor; subcolumn s of a column is subject s of that group,
    measured at every row. Between-subjects factor tested against
    subjects-within-groups; the repeated factor and interaction against
    the within-subject residual. Matches pingouin.mixed_anova.

    cells[row][col] = list of subject values (subject = index in list).
    Subjects missing any row are dropped (complete-case, like Prism <8).
    """
    a = len(cells)               # repeated (row) levels
    b = len(cells[0])            # groups (columns)
    # subjects[j] = matrix rows x n_j
    subjects = []
    for j in range(b):
        n_sub = max(len(cells[i][j]) for i in range(a))
        cols = []
        for s in range(n_sub):
            vals = [cells[i][j][s] if s < len(cells[i][j]) else None
                    for i in range(a)]
            if all(v is not None for v in vals):
                cols.append([float(v) for v in vals])
        if len(cols) < 2:
            raise ValueError("need >= 2 complete subjects per group")
        subjects.append(np.array(cols).T)  # rows x subjects
    ns = [m.shape[1] for m in subjects]
    n_subj = sum(ns)
    all_vals = np.concatenate([m.ravel() for m in subjects])
    gm = float(all_vals.mean())
    ss_total = float(((all_vals - gm) ** 2).sum())

    subj_means = np.concatenate([m.mean(axis=0) for m in subjects])
    ss_between_subj = a * float(((subj_means - gm) ** 2).sum())
    group_means = [float(m.mean()) for m in subjects]
    ss_group = a * float(sum(n * (g - gm) ** 2
                             for n, g in zip(ns, group_means)))
    ss_subj_within = ss_between_subj - ss_group

    # cell (row x group) and row marginal means, weighted by group sizes
    cell_means = np.array([[float(subjects[j][i].mean()) for j in range(b)]
                           for i in range(a)])
    row_means = np.array([
        float(np.concatenate([subjects[j][i] for j in range(b)]).mean())
        for i in range(a)])
    ss_row = n_subj * float(((row_means - gm) ** 2).sum())
    ss_inter = float(sum(ns[j] * (cell_means[i, j] - row_means[i]
                                  - group_means[j] + gm) ** 2
                         for i in range(a) for j in range(b)))
    ss_within_subj = ss_total - ss_between_subj
    ss_error = ss_within_subj - ss_row - ss_inter

    df_group, df_subj = b - 1, n_subj - b
    df_row = a - 1
    df_inter = (a - 1) * (b - 1)
    df_error = (a - 1) * (n_subj - b)
    ms = {"group": ss_group / df_group, "subj": ss_subj_within / df_subj,
          "row": ss_row / df_row, "inter": ss_inter / df_inter,
          "error": ss_error / df_error if df_error else math.nan}

    def source(ss, df, msq, err_ms, err_df):
        f = msq / err_ms if err_ms > 0 else math.inf
        return {"ss": float(ss), "df": int(df), "ms": float(msq),
                "F": float(f),
                "p": float(stats.f.sf(f, df, err_df)) if err_ms > 0 else 0.0,
                "percent_of_total": float(100 * ss / ss_total)
                if ss_total else None}

    # GG epsilon from the covariance of the subjects' row-vectors
    # (all subjects stacked, the definition pingouin/most texts use)
    stacked = np.concatenate([m.T for m in subjects], axis=0)  # subj x rows
    eps = _gg_epsilon_from_cov(np.cov(stacked.T, ddof=1)) if a > 1 else 1.0

    row_src = source(ss_row, df_row, ms["row"], ms["error"], df_error)
    inter_src = source(ss_inter, df_inter, ms["inter"], ms["error"], df_error)
    if ms["error"] > 0:
        row_src["p_geisser_greenhouse"] = float(
            stats.f.sf(row_src["F"], df_row * eps, df_error * eps))
        inter_src["p_geisser_greenhouse"] = float(
            stats.f.sf(inter_src["F"], df_inter * eps, df_error * eps))

    return {
        "analysis": "rm_two_way_mixed",
        "design": "columns are groups, rows are repeated measures",
        "n_subjects": int(n_subj), "rows": a, "cols": b,
        "group_sizes": ns,
        "gg_epsilon": float(eps),
        "sources": {
            "interaction": inter_src,
            "row_factor": row_src,
            "column_factor": source(ss_group, df_group, ms["group"],
                                    ms["subj"], df_subj),
            "subjects": {"ss": float(ss_subj_within), "df": int(df_subj),
                         "ms": float(ms["subj"]), "F": None, "p": None,
                         "percent_of_total": float(
                             100 * ss_subj_within / ss_total)
                         if ss_total else None},
            "residual": {"ss": float(ss_error), "df": int(df_error),
                         "ms": float(ms["error"]), "F": None, "p": None,
                         "percent_of_total": float(100 * ss_error / ss_total)
                         if ss_total else None},
        },
        "cell_means": cell_means.tolist(),
        "row_names": row_names or [f"Row {i + 1}" for i in range(a)],
        "col_names": col_names or [f"Column {j + 1}" for j in range(b)],
    }


def _gg_epsilon_from_cov(S):
    k = S.shape[0]
    mean_diag = np.trace(S) / k
    grand = S.mean()
    row_means = S.mean(axis=1)
    num = (k * (mean_diag - grand)) ** 2
    den = (k - 1) * (np.sum(S * S) - 2 * k * np.sum(row_means ** 2)
                     + k * k * grand * grand)
    if den <= 0:
        return 1.0
    return float(min(max(num / den, 1.0 / (k - 1)), 1.0))


def rm_two_way_both(cells, *, row_names=None, col_names=None) -> dict:
    """Fully repeated two-way ANOVA: every subject measured at every
    row x column combination; subcolumn index = subject, consistent
    across all datasets. Each factor is tested against its own
    factor-by-subject interaction (matches statsmodels AnovaRM with two
    within-subject factors)."""
    a = len(cells)
    b = len(cells[0])
    n = min(len(cells[i][j]) for i in range(a) for j in range(b))
    if n < 2:
        raise ValueError("need >= 2 subjects with complete data")
    Y = np.empty((a, b, n))
    for i in range(a):
        for j in range(b):
            vals = cells[i][j][:n]
            if any(v is None for v in vals):
                raise ValueError("fully-RM design needs complete data")
            Y[i, j, :] = [float(v) for v in vals]

    gm = Y.mean()
    m_i, m_j, m_s = Y.mean(axis=(1, 2)), Y.mean(axis=(0, 2)), Y.mean(axis=(0, 1))
    m_ij = Y.mean(axis=2)
    m_is = Y.mean(axis=1)
    m_js = Y.mean(axis=0)

    ss_a = n * b * float(((m_i - gm) ** 2).sum())
    ss_b = n * a * float(((m_j - gm) ** 2).sum())
    ss_subj = a * b * float(((m_s - gm) ** 2).sum())
    ss_ab = n * float(((m_ij - m_i[:, None] - m_j[None, :] + gm) ** 2).sum())
    ss_as = b * float(((m_is - m_i[:, None] - m_s[None, :] + gm) ** 2).sum())
    ss_bs = a * float(((m_js - m_j[:, None] - m_s[None, :] + gm) ** 2).sum())
    ss_total = float(((Y - gm) ** 2).sum())
    ss_abs = ss_total - ss_a - ss_b - ss_ab - ss_subj - ss_as - ss_bs

    df_a, df_b, df_s = a - 1, b - 1, n - 1
    df_ab = df_a * df_b
    df_as, df_bs, df_abs = df_a * df_s, df_b * df_s, df_a * df_b * df_s

    def test(ss, df, ss_err, df_err):
        msq, mse = ss / df, ss_err / df_err
        f = msq / mse if mse > 0 else math.inf
        return {"ss": float(ss), "df": int(df), "ms": float(msq),
                "error_ss": float(ss_err), "error_df": int(df_err),
                "F": float(f),
                "p": float(stats.f.sf(f, df, df_err)) if mse > 0 else 0.0,
                "percent_of_total": float(100 * ss / ss_total)
                if ss_total else None}

    return {
        "analysis": "rm_two_way_both",
        "design": "both factors repeated (every subject in every cell)",
        "n_subjects": int(n), "rows": a, "cols": b,
        "sources": {
            "interaction": test(ss_ab, df_ab, ss_abs, df_abs),
            "row_factor": test(ss_a, df_a, ss_as, df_as),
            "column_factor": test(ss_b, df_b, ss_bs, df_bs),
            "subjects": {"ss": float(ss_subj), "df": int(df_s),
                         "ms": float(ss_subj / df_s), "F": None, "p": None,
                         "percent_of_total": float(100 * ss_subj / ss_total)
                         if ss_total else None},
        },
        "cell_means": m_ij.tolist(),
        "row_names": row_names or [f"Row {i + 1}" for i in range(a)],
        "col_names": col_names or [f"Column {j + 1}" for j in range(b)],
    }


def friedman(datasets, names=None, *, dunns: bool = True) -> dict:
    M = _complete_matrix(datasets)
    n, k = M.shape
    stat, p = stats.friedmanchisquare(*[M[:, j] for j in range(k)])
    names = names or [f"Treatment {i}" for i in range(k)]
    ranks = np.apply_along_axis(stats.rankdata, 1, M)
    rank_sums = ranks.sum(axis=0)
    out = {
        "analysis": "friedman",
        "statistic": float(stat), "p": float(p),
        "n_subjects": int(n),
        "rank_sums": [float(v) for v in rank_sums],
        "names": names,
    }
    if dunns:
        # Dunn's for Friedman: z = |R_i - R_j| / sqrt(k(k+1)/(6n)),
        # comparing mean ranks; Bonferroni-adjusted P (Prism reports
        # multiplicity-adjusted P values).
        mean_ranks = rank_sums / n
        pairs = list(combinations(range(k), 2))
        m = len(pairs)
        se = math.sqrt(k * (k + 1) / (6.0 * n))
        comparisons = []
        for i, j in pairs:
            z = abs(mean_ranks[i] - mean_ranks[j]) / se
            p_adj = min(2 * float(stats.norm.sf(z)) * m, 1.0)
            comparisons.append({
                "pair": f"{names[i]} vs. {names[j]}",
                "mean_rank_difference": float(mean_ranks[i] - mean_ranks[j]),
                "statistic": float(z),
                "p_adjusted": p_adj,
                "significant_05": bool(p_adj < 0.05),
            })
        out["dunns"] = {"method": "dunns", "comparisons": comparisons}
    return out
