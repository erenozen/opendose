"""Two-way ANOVA (Prism: grouped tables -> Two-way ANOVA).

Prism statistics guide, "Two-way ANOVA": factor A = table rows, factor B =
dataset columns, replicates in subcolumns. Prism reports, for each source
(interaction, row factor, column factor, residual): SS, df, MS, F, P, and
"% of total variation". For unbalanced designs Prism 8+ fits a general
linear model and reports Type III sums of squares, implemented here via
effect-coded (sum-to-zero) regression, comparing the full model against
the model with each term dropped.
"""

from __future__ import annotations

import math
from itertools import combinations

import numpy as np
from scipy import stats


def _design(cells):
    """cells[i][j] = list of replicate values for row i, column j."""
    ys, rows_idx, cols_idx = [], [], []
    for i, row in enumerate(cells):
        for j, cell in enumerate(row):
            for v in cell:
                if v is not None:
                    ys.append(float(v))
                    rows_idx.append(i)
                    cols_idx.append(j)
    return np.array(ys), np.array(rows_idx), np.array(cols_idx)


def _effect_columns(idx, k):
    """Sum-to-zero (effect) coding: k-1 columns."""
    n = idx.size
    cols = np.zeros((n, k - 1))
    for level in range(k - 1):
        cols[idx == level, level] = 1.0
    cols[idx == k - 1, :] = -1.0
    return cols


def _ss_resid(X, y):
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ beta
    return float(resid @ resid)


def two_way_anova(cells, *, row_factor: str = "Rows",
                  col_factor: str = "Columns") -> dict:
    y, ri, ci = _design(cells)
    n = y.size
    a = int(ri.max()) + 1  # rows (factor A levels)
    b = int(ci.max()) + 1  # columns (factor B levels)
    if a < 2 or b < 2:
        raise ValueError("two-way ANOVA needs >= 2 rows and >= 2 dataset columns")

    A = _effect_columns(ri, a)
    B = _effect_columns(ci, b)
    AB = np.column_stack([A[:, i] * B[:, j]
                          for i in range(a - 1) for j in range(b - 1)])
    intercept = np.ones((n, 1))

    X_full = np.column_stack([intercept, A, B, AB])
    df_resid = n - X_full.shape[1]
    if df_resid < 1:
        raise ValueError("not enough replicates for interaction model")
    ss_resid = _ss_resid(X_full, y)
    ms_resid = ss_resid / df_resid
    ss_total = float(((y - y.mean()) ** 2).sum())

    def term_ss(drop_cols):
        X_red = np.column_stack([c for c in drop_cols])
        return _ss_resid(X_red, y) - ss_resid

    sources = {}
    for label, ss, df in [
        ("interaction", term_ss([intercept, A, B]), (a - 1) * (b - 1)),
        (row_factor, term_ss([intercept, B, AB]), a - 1),
        (col_factor, term_ss([intercept, A, AB]), b - 1),
    ]:
        ms = ss / df
        f = ms / ms_resid
        p = float(stats.f.sf(f, df, df_resid))
        sources[label] = {
            "ss": float(ss), "df": int(df), "ms": float(ms),
            "F": float(f), "p": p,
            "percent_of_total": float(100.0 * ss / ss_total) if ss_total else None,
        }
    sources["residual"] = {"ss": ss_resid, "df": int(df_resid),
                           "ms": float(ms_resid), "F": None, "p": None,
                           "percent_of_total": float(100.0 * ss_resid / ss_total)
                           if ss_total else None}

    cell_means = [[(float(np.mean([v for v in cell if v is not None]))
                    if any(v is not None for v in cell) else None)
                   for cell in row] for row in cells]

    return {
        "n": int(n), "rows": a, "cols": b,
        "type": "III (general linear model, effect coding)",
        "sources": sources,
        "cell_means": cell_means,
        "ss_total": ss_total,
    }


def _cell_stats(cells):
    """(means, ns) per cell, ignoring None."""
    means, ns = [], []
    for row in cells:
        m_row, n_row = [], []
        for cell in row:
            vals = [float(v) for v in cell if v is not None]
            m_row.append(float(np.mean(vals)) if vals else None)
            n_row.append(len(vals))
        means.append(m_row)
        ns.append(n_row)
    return means, ns


def two_way_comparisons(cells, *, direction: str = "columns_within_rows",
                        method: str = "tukey",
                        row_names=None, col_names=None) -> dict:
    """Prism's two-way ANOVA follow-up tests.

    direction:
    - "columns_within_rows": within each row, compare every pair of
      column (dataset) means, i.e. Prism's "Compare each cell mean with the
      other cell mean in that row".
    - "rows_within_columns": the transpose.
    - "column_means" / "row_means": compare marginal (main effect) means.

    method: "tukey" (studentized range, family = the means being
    compared), or "sidak"/"bonferroni" (t tests corrected for the TOTAL
    number of comparisons, as Prism does).

    All tests share the two-way ANOVA's pooled residual: MS_residual and
    df_residual from the full interaction model (Prism statistics guide,
    "How Prism computes multiple comparisons after two-way ANOVA").
    """
    base = two_way_anova(cells)
    ms_resid = base["sources"]["residual"]["ms"]
    df_resid = base["sources"]["residual"]["df"]
    means, ns = _cell_stats(cells)
    a, b = base["rows"], base["cols"]
    row_names = row_names or [f"Row {i + 1}" for i in range(a)]
    col_names = col_names or [f"Column {j + 1}" for j in range(b)]

    # (family label, [(name_1, mean_1, n_1), ...]) per family
    if direction == "columns_within_rows":
        families = [(row_names[i],
                     [(col_names[j], means[i][j], ns[i][j]) for j in range(b)])
                    for i in range(a)]
    elif direction == "rows_within_columns":
        families = [(col_names[j],
                     [(row_names[i], means[i][j], ns[i][j]) for i in range(a)])
                    for j in range(b)]
    elif direction == "column_means":
        col_vals = [[v for row in cells for v in row[j] if v is not None]
                    for j in range(b)]
        families = [("Column main effect",
                     [(col_names[j], float(np.mean(col_vals[j])),
                       len(col_vals[j])) for j in range(b)])]
    elif direction == "row_means":
        row_vals = [[v for cell in cells[i] for v in cell if v is not None]
                    for i in range(a)]
        families = [("Row main effect",
                     [(row_names[i], float(np.mean(row_vals[i])),
                       len(row_vals[i])) for i in range(a)])]
    else:
        raise ValueError(f"unknown direction: {direction}")

    total_comparisons = sum(
        len(list(combinations([e for e in fam if e[1] is not None], 2)))
        for _, fam in families)

    comparisons = []
    for fam_label, fam in families:
        entries = [e for e in fam if e[1] is not None and e[2] > 0]
        k = len(entries)
        for (n1, m1, c1), (n2, m2, c2) in combinations(entries, 2):
            diff = m1 - m2
            se = math.sqrt(ms_resid * (1.0 / c1 + 1.0 / c2))
            if method == "tukey":
                q = abs(diff) / (se / math.sqrt(2.0))
                p_adj = float(stats.studentized_range.sf(q, k, df_resid))
                qcrit = float(stats.studentized_range.ppf(0.95, k, df_resid))
                half = qcrit * se / math.sqrt(2.0)
                statistic = q
            else:
                t = abs(diff) / se
                p0 = 2.0 * float(stats.t.sf(t, df_resid))
                m = max(total_comparisons, 1)
                if method == "sidak":
                    p_adj = float(1.0 - (1.0 - min(p0, 1.0)) ** m)
                    alpha_per = 1.0 - (1.0 - 0.05) ** (1.0 / m)
                    half = float(stats.t.ppf(1 - alpha_per / 2, df_resid)) * se
                elif method == "bonferroni":
                    p_adj = min(p0 * m, 1.0)
                    half = float(stats.t.ppf(1 - 0.05 / (2 * m), df_resid)) * se
                else:
                    raise ValueError(f"unknown method: {method}")
                statistic = t
            comparisons.append({
                "family": fam_label,
                "pair": f"{n1} vs. {n2}",
                "difference": float(diff),
                "se": float(se),
                "ci95": [float(diff - half), float(diff + half)],
                "statistic": float(statistic),
                "p_adjusted": min(float(p_adj), 1.0),
                "significant_05": bool(p_adj < 0.05),
            })

    return {"method": method, "direction": direction,
            "ms_residual": float(ms_resid), "df_residual": int(df_resid),
            "n_comparisons": len(comparisons),
            "comparisons": comparisons}
