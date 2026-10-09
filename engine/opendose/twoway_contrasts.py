"""Interaction contrasts (difference of differences) and simple effects
after a two-way ANOVA.

Method sources:

- GraphPad statistics guide, "Interpreting results: Two-way ANOVA"
  (interaction): the interaction asks whether the effect of one factor is
  the same at every level of the other. In a 2 x 2 design that is one
  number, the difference of differences
      (A2 - A1 in column 2) - (A2 - A1 in column 1)
    = m22 - m12 - m21 + m11,
  whose t test with the pooled residual (SE = sqrt(MS_res * sum 1/n_ij),
  df = df_res) is the interaction F test (t^2 = F; for an unbalanced 2 x
  2 design the Type III interaction tests exactly this cell-mean
  contrast). In larger designs every 2 x 2 sub-square (two row levels,
  two column levels) gives one such interaction contrast (Maxwell &
  Delaney 2004, Designing Experiments and Analyzing Data, 2nd ed., ch. 7,
  "interaction contrasts"); these are reported unadjusted.
- Gelman & Stern (2006), "The difference between 'significant' and 'not
  significant' is not itself statistically significant", Am Stat 60:328,
  and Nieuwenhuis, Forstmann & Wagenmakers (2011), Nat Neurosci 14:1105:
  to claim that an effect differs between groups, test the difference of
  the effects (the interaction), not two separate tests.
- Simple effects (Maxwell & Delaney 2004, ch. 7; Kirk 2013, Experimental
  Design, 4th ed., sec. 9.6): the effect of the column factor within one
  row level, F = [sum_j n_ij (m_ij - m_i.)^2 / (b - 1)] / MS_res on
  (b - 1, df_res) with m_i. the n-weighted mean of that row, and each
  pair of columns within the row as a t test with the pooled residual.
  P values here are unadjusted (labelled so); the corrected families are
  in two_way_anova's multiple_comparisons.

The error term is the pooled within-cell residual of the full
(interaction) model. When the ANOVA itself was fitted as main effects
only (additive) the contrasts still use the within-cell residual, which
is stated in a note; with one value per cell there is no within-cell
residual and nothing is computed (the result says why).
"""

from __future__ import annotations

import math
from itertools import combinations

from scipy import stats

SOURCE = ("GraphPad statistics guide, 'Interpreting results: Two-way "
          "ANOVA' (interaction); Gelman & Stern 2006, Am Stat 60:328; "
          "Maxwell & Delaney 2004, ch. 7 (interaction contrasts, simple "
          "effects)")

EXPLAINER = ("To ask whether the effect of one factor differs between the "
             "levels of the other, look at the interaction: the difference "
             "of the two effects with its CI. One effect being 'significant' "
             "and the other 'not significant' does not show that they differ "
             "(Gelman & Stern 2006).")


def cell_summaries(cells):
    """(means, ns, ss_within, df_within) of cells[row][col] = values."""
    means, ns = [], []
    ss_within, n_total, n_cells = 0.0, 0, 0
    for row in cells:
        m_row, n_row = [], []
        for cell in row:
            vals = [float(v) for v in cell if v is not None]
            n = len(vals)
            if n:
                m = math.fsum(vals) / n
                ss_within += math.fsum((v - m) ** 2 for v in vals)
                n_total += n
                n_cells += 1
                m_row.append(m)
            else:
                m_row.append(None)
            n_row.append(n)
        means.append(m_row)
        ns.append(n_row)
    return means, ns, ss_within, n_total - n_cells


def _t_entry(diff, se, df, ci_level):
    if se > 0:
        t = diff / se
        p = 2.0 * float(stats.t.sf(abs(t), df))
    else:
        t = math.inf if diff else math.nan
        p = 0.0 if diff else math.nan
    half = float(stats.t.ppf((1 + ci_level) / 2, df)) * se
    return {"difference": float(diff), "se": float(se), "t": float(t),
            "df": float(df), "ci": [float(diff - half), float(diff + half)],
            "p": p}


def interaction_contrasts(means, ns, ms_res, df_res, *, row_names, col_names,
                          ci_level: float = 0.95, rows=None, cols=None,
                          max_contrasts: int = 200) -> dict:
    """Every 2 x 2 interaction contrast (or only those within the given
    row / column index lists)."""
    a, b = len(means), len(means[0]) if means else 0
    row_idx = list(rows) if rows is not None else list(range(a))
    col_idx = list(cols) if cols is not None else list(range(b))
    for i in row_idx:
        if not 0 <= int(i) < a:
            raise ValueError(f"interaction row index {i} out of range")
    for j in col_idx:
        if not 0 <= int(j) < b:
            raise ValueError(f"interaction column index {j} out of range")
    n_squares = (len(row_idx) * (len(row_idx) - 1) // 2
                 * len(col_idx) * (len(col_idx) - 1) // 2)
    out = {"ms_residual": float(ms_res), "df_residual": float(df_res),
           "ci_level": ci_level, "n_contrasts": 0, "contrasts": [],
           "p_adjustment": "none (each contrast is its own question)",
           "explainer": EXPLAINER, "source": SOURCE, "notes": []}
    if n_squares > max_contrasts:
        out["notes"].append(
            f"{n_squares} 2 x 2 sub-squares exceed the limit of "
            f"{max_contrasts}: none computed; choose two rows and two "
            "columns (options.interaction_rows / interaction_cols)")
        out["withheld"] = True
        return out
    for i1, i2 in combinations(row_idx, 2):
        for j1, j2 in combinations(col_idx, 2):
            cellv = [means[i1][j1], means[i2][j1], means[i1][j2],
                     means[i2][j2]]
            if any(v is None for v in cellv):
                out["notes"].append(
                    f"{row_names[i1]}/{row_names[i2]} x {col_names[j1]}/"
                    f"{col_names[j2]}: an empty cell, contrast not "
                    "estimable")
                continue
            e1 = means[i2][j1] - means[i1][j1]
            e2 = means[i2][j2] - means[i1][j2]
            se = math.sqrt(ms_res * (1 / ns[i1][j1] + 1 / ns[i2][j1]
                                     + 1 / ns[i1][j2] + 1 / ns[i2][j2]))
            entry = {
                "rows": [row_names[i1], row_names[i2]],
                "cols": [col_names[j1], col_names[j2]],
                "row_indices": [int(i1), int(i2)],
                "col_indices": [int(j1), int(j2)],
                "label": (f"({row_names[i2]} - {row_names[i1]}) in "
                          f"{col_names[j2]} minus ({row_names[i2]} - "
                          f"{row_names[i1]}) in {col_names[j1]}"),
                "effect_in_col_1": float(e1),
                "effect_in_col_2": float(e2),
                **_t_entry(e2 - e1, se, df_res, ci_level),
            }
            entry["F"] = entry["t"] ** 2 if math.isfinite(entry["t"]) \
                else entry["t"]
            out["contrasts"].append(entry)
    out["n_contrasts"] = len(out["contrasts"])
    if a == 2 and b == 2 and out["contrasts"]:
        out["contrasts"][0]["equals_interaction_test"] = True
        out["notes"].append("2 x 2 design: this contrast's t^2 is the "
                            "interaction F and its P the interaction P")
    return out


def simple_effects(means, ns, ms_res, df_res, *, row_names, col_names,
                   direction: str = "columns_within_rows",
                   ci_level: float = 0.95) -> list:
    """Simple effects of the column factor within each row
    ("columns_within_rows") or of the row factor within each column
    ("rows_within_columns"): an F test plus every pairwise difference,
    all with the pooled residual and unadjusted P."""
    a, b = len(means), len(means[0]) if means else 0
    if direction == "columns_within_rows":
        fams = [(row_names[i], [(col_names[j], means[i][j], ns[i][j])
                                for j in range(b)]) for i in range(a)]
    elif direction == "rows_within_columns":
        fams = [(col_names[j], [(row_names[i], means[i][j], ns[i][j])
                                for i in range(a)]) for j in range(b)]
    else:
        raise ValueError(f"unknown simple-effects direction: {direction}")
    out = []
    for label, entries in fams:
        ent = [e for e in entries if e[1] is not None and e[2] > 0]
        k = len(ent)
        block = {"within": label, "direction": direction, "n_levels": k,
                 "F": None, "dfn": k - 1, "dfd": float(df_res), "p": None,
                 "differences": [], "p_label": "unadjusted"}
        if k >= 2:
            n_tot = sum(e[2] for e in ent)
            wmean = sum(e[1] * e[2] for e in ent) / n_tot
            ss = sum(e[2] * (e[1] - wmean) ** 2 for e in ent)
            if ms_res > 0:
                f = ss / (k - 1) / ms_res
                block["F"] = float(f)
                block["p"] = float(stats.f.sf(f, k - 1, df_res))
            for (n1, m1, c1), (n2, m2, c2) in combinations(ent, 2):
                se = math.sqrt(ms_res * (1 / c1 + 1 / c2))
                block["differences"].append(
                    {"pair": f"{n2} - {n1}", "first": n2, "second": n1,
                     **_t_entry(m2 - m1, se, df_res, ci_level),
                     "p_label": "unadjusted"})
        out.append(block)
    return out


def contrasts_block(cells, base_result, *, row_names, col_names,
                    ci_level: float = 0.95, rows=None, cols=None,
                    max_contrasts: int = 200) -> dict:
    """{interaction_contrasts, simple_effects,
    simple_effects_rows_within_columns} for a two_way_anova result
    (twoway.two_way_anova) of cells[row][col]."""
    means, ns, ss_w, df_w = cell_summaries(cells)
    return contrasts_from_stats(means, ns, ss_w, df_w, base_result,
                                row_names=row_names, col_names=col_names,
                                ci_level=ci_level, rows=rows, cols=cols,
                                max_contrasts=max_contrasts)


def summary_cell_stats(cell_list):
    """(means, ns, ss_within, df_within) from opendose.summary's cell
    list [(row, col, mean, sd, n)] (data entered as mean, SD and n)."""
    a = max(c[0] for c in cell_list) + 1
    b = max(c[1] for c in cell_list) + 1
    means = [[None] * b for _ in range(a)]
    ns = [[0] * b for _ in range(a)]
    ss_w, n_tot = 0.0, 0
    for i, j, m, sd, n in cell_list:
        means[i][j], ns[i][j] = float(m), int(n)
        if sd is not None and n > 1:
            ss_w += (n - 1) * float(sd) ** 2
        n_tot += int(n)
    return means, ns, ss_w, n_tot - len(cell_list)


def contrasts_from_stats(means, ns, ss_w, df_w, base_result, *, row_names,
                         col_names, ci_level: float = 0.95, rows=None,
                         cols=None, max_contrasts: int = 200) -> dict:
    """contrasts_block from cell means, n and the within-cell SS / df."""
    full = base_result.get("model", "").startswith("full")
    if any(n == 0 for row in ns for n in row):
        full = False  # empty cells: use the within-cell residual directly
    notes = []
    if full:
        ms_res = base_result["sources"]["residual"]["ms"]
        df_res = base_result["sources"]["residual"]["df"]
    elif df_w >= 1:
        ms_res, df_res = ss_w / df_w, df_w
        notes.append("The contrasts and simple effects use the pooled "
                     "within-cell residual (the full-model error term), "
                     "not the residual of the ANOVA table (main effects "
                     "only, or empty cells).")
    else:
        why = ("one value per cell: there is no within-cell residual to "
               "test an interaction contrast or a simple effect against")
        return {"interaction_contrasts": {"withheld": True, "contrasts": [],
                                          "n_contrasts": 0,
                                          "notes": [why],
                                          "explainer": EXPLAINER,
                                          "source": SOURCE},
                "simple_effects": None,
                "simple_effects_rows_within_columns": None,
                "contrast_notes": [why]}
    ic = interaction_contrasts(means, ns, ms_res, df_res,
                               row_names=row_names, col_names=col_names,
                               ci_level=ci_level, rows=rows, cols=cols,
                               max_contrasts=max_contrasts)
    ic["notes"] = notes + ic["notes"]
    ic["error_term"] = ("pooled within-cell residual (full model)"
                        if full or notes else "residual")
    return {
        "interaction_contrasts": ic,
        "simple_effects": simple_effects(
            means, ns, ms_res, df_res, row_names=row_names,
            col_names=col_names, direction="columns_within_rows",
            ci_level=ci_level),
        "simple_effects_rows_within_columns": simple_effects(
            means, ns, ms_res, df_res, row_names=row_names,
            col_names=col_names, direction="rows_within_columns",
            ci_level=ci_level),
        "contrast_notes": notes,
    }
