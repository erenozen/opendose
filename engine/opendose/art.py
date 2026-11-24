"""Nonparametric two-way ANOVA by the aligned rank transform (ART).

Method:
- Wobbrock JO, Findlater L, Gergle D & Higgins JJ (2011), "The aligned
  rank transform for nonparametric factorial analyses using only ANOVA
  procedures", Proc. CHI 2011, 143-146; Higgins JJ & Tashtoush S (1994),
  "An aligned rank transform test for interaction", Nonlinear World
  1:201-211; Higgins JJ, Blair RC & Tashtoush S (1990), "The aligned rank
  transform procedure", Proc. Conf. Applied Statistics in Agriculture,
  Kansas State University, 185-195 (its Table 5 is the worked example).
  For each effect (row factor, column factor, interaction) the response
  is aligned: residual (value - its cell mean) plus that effect's
  estimate (row mean - grand mean; column mean - grand mean; cell mean -
  row mean - column mean + grand mean). The aligned values are ranked
  (average ranks for ties) and the full factorial ANOVA (the Type III
  general linear model of opendose.twoway) is run on the ranks; only the
  effect the ranks were aligned for is read from that table. As in R's
  ARTool (Kay, Elkin, Higgins & Wobbrock), the means are means of the
  observations and the aligned values are rounded to 8 decimals before
  ranking, so that values equal up to floating-point error tie (here in
  units of the values' leading power of ten, which is ARTool's rounding
  for values between 1 and 10 and keeps the ties the same in any unit).
- Contrasts: ART-C (Elkin LA, Kay M, Higgins JJ & Wobbrock JO 2021, "An
  aligned rank transform procedure for multifactor contrast tests", Proc.
  UIST 2021, 754-768). Levels of one factor: the ranks aligned for that
  factor's main effect, the factorial linear model on them, and pairwise
  differences of that factor's estimated marginal means (equal weight to
  every level of the other factor), t on the model's residual df. Cells
  (the interaction): the factors are combined into one factor, whose
  aligned values are the values minus the grand mean, so the ranks are
  the ranks of the values; pairwise differences of the cells' mean ranks.
  P values are Tukey-adjusted (studentized range over the number of
  means compared, as ARTool's art.con through emmeans) or Holm-adjusted.
  Estimates are differences of mean ranks: they say which way and how
  strongly levels differ, not by how much in the data's units.

When a log transform is the better route: the ART tests hypotheses about
ranks, not means, and gives no estimate in the data's units. For
positive, right-skewed data whose SD grows with the mean (concentrations,
titres, expression levels), the two-way ANOVA on log-transformed values
keeps the interaction on a ratio scale with geometric means and ratios
with CIs (Bland & Altman 1996, BMJ 312:770; GraphPad statistics guide,
"Advice: When to transform data to logarithms"); keep the ART for
ordinal scores and outcomes no transform makes Gaussian (Wobbrock et al.
2011, section "Limitations").

Every cell needs at least two values, and no cell may be empty: with an
empty cell the interaction (and the alignment, which needs every cell
mean) is not defined. Unequal numbers of values per cell are allowed;
the result says so (the alignment then uses observation-weighted
margins, as ARTool does).
"""

from __future__ import annotations

import math
from itertools import combinations

import numpy as np
from scipy import stats

from . import studentized, twoway
from .anova import adjust_p

SOURCE = ("Wobbrock, Findlater, Gergle & Higgins 2011, The aligned rank "
          "transform for nonparametric factorial analyses using only ANOVA "
          "procedures, Proc. CHI 2011:143-146; Higgins & Tashtoush 1994, "
          "Nonlinear World 1:201")
CONTRAST_SOURCE = ("Elkin, Kay, Higgins & Wobbrock 2021, An aligned rank "
                   "transform procedure for multifactor contrast tests, "
                   "Proc. UIST 2021:754-768")
LOG_NOTE = (
    "The aligned rank transform tests ranks, so it gives no estimate in "
    "the data's units. For positive data whose SD grows with the mean "
    "(concentrations, titres, expression levels), a two-way ANOVA on the "
    "logarithms is often the better route: it keeps the interaction on a "
    "ratio scale and reports geometric means and ratios with CIs (Bland & "
    "Altman 1996, BMJ 312:770). Keep the aligned rank transform for scores "
    "and outcomes no transform makes Gaussian.")

ROUND_DIGITS = 8  # ARTool: -floor(log10(sqrt(.Machine$double.eps)))


def _cells_arrays(cells):
    """cells[i][j] = values -> (y, row index, column index, a, b), with a
    clear error for an empty cell or a cell with one value."""
    a = len(cells)
    b = max((len(r) for r in cells), default=0)
    if a < 2 or b < 2:
        raise ValueError("The aligned rank transform needs at least 2 rows "
                         "and 2 data set columns")
    empty, single = [], []
    for i in range(a):
        for j in range(b):
            cell = cells[i][j] if j < len(cells[i]) else []
            vals = [v for v in (cell or []) if v is not None
                    and not (isinstance(v, float) and math.isnan(v))]
            if not vals:
                empty.append((i, j))
            elif len(vals) < 2:
                single.append((i, j))
    if empty:
        raise ValueError(
            f"The aligned rank transform needs values in every cell; "
            f"{len(empty)} cell{'s are' if len(empty) > 1 else ' is'} empty "
            f"(row {empty[0][0] + 1}, column {empty[0][1] + 1}"
            f"{' and others' if len(empty) > 1 else ''}). Enter the missing "
            "cells or leave out the empty row or column: with an empty "
            "cell the interaction is not defined.")
    if single:
        raise ValueError(
            "The aligned rank transform needs at least 2 values in every "
            f"cell (row {single[0][0] + 1}, column {single[0][1] + 1} has "
            "one): the alignment uses each value's distance from its cell "
            "mean.")
    y, ri, ci = twoway._design(cells)
    if float(np.ptp(y)) == 0.0:
        raise ValueError("The aligned rank transform is undefined: every "
                         "value is the same, so there is nothing to rank.")
    return y, ri, ci, a, b


def _means(y, ri, ci, a, b):
    grand = float(y.mean())
    row = np.array([y[ri == i].mean() for i in range(a)])
    col = np.array([y[ci == j].mean() for j in range(b)])
    cell = np.array([[y[(ri == i) & (ci == j)].mean() for j in range(b)]
                     for i in range(a)])
    return grand, row, col, cell


def aligned_responses(y, ri, ci, a, b) -> dict:
    """{"row", "col", "interaction"}: the values aligned for each effect
    (Wobbrock et al. 2011, steps 1-3)."""
    grand, row, col, cell = _means(y, ri, ci, a, b)
    resid = y - cell[ri, ci]
    return {
        "row": resid + (row[ri] - grand),
        "col": resid + (col[ci] - grand),
        "interaction": resid + (cell[ri, ci] - row[ri] - col[ci] + grand),
    }


def aligned_ranks(aligned: np.ndarray) -> np.ndarray:
    """Average ranks of the aligned values rounded to 8 decimals, as
    ARTool does, in units of the values' leading power of ten: for values
    whose largest aligned magnitude is between 1 and 10 that is exactly
    ARTool's rounding, and data in other units (1e-12 or 1e12) keep the
    same ties instead of all rounding to 0 or keeping noise."""
    aligned = np.asarray(aligned, dtype=float)
    top = float(np.max(np.abs(aligned))) if aligned.size else 0.0
    unit = 10.0 ** math.floor(math.log10(top)) if top > 0 else 1.0
    return stats.rankdata(np.round(aligned / unit, ROUND_DIGITS),
                          method="average")


def _sources_on(r, ri, ci, n):
    ss_total = float(((r - r.mean()) ** 2).sum())
    return twoway._type3_table(r, ri, ci, n, ss_total, twoway._ss_resid,
                               row_factor="row", col_factor="col")


def art_two_way(cells, *, row_factor: str = "Rows",
                col_factor: str = "Columns") -> dict:
    """ART ANOVA of a two-way layout. cells[i][j] = values of row i,
    column j. Returns {"sources": {row_factor, col_factor, "interaction":
    {F, df, df_residual, p, ss, ms}}, "n", "rows", "cols", "balanced",
    "cell_n", "alignment_check", "type", "method", "source", "log_note",
    "note"?}."""
    y, ri, ci, a, b = _cells_arrays(cells)
    n = int(y.size)
    aligned = aligned_responses(y, ri, ci, a, b)
    labels = {"row": row_factor, "col": col_factor,
              "interaction": "interaction"}
    sources, check = {}, {}
    for key, al in aligned.items():
        t = _sources_on(aligned_ranks(al), ri, ci, n)
        src = t["sources"][labels[key] if key == "interaction" else key]
        res = t["sources"]["residual"]
        sources[labels[key]] = {"F": src["F"], "df": src["df"],
                                "df_residual": res["df"], "p": src["p"],
                                "ss": src["ss"], "ms": src["ms"],
                                "ss_residual": res["ss"]}
        # ARTool's check: on the aligned (unranked) values, every effect
        # other than the one aligned for is ~0 and the values sum to ~0
        raw = _sources_on(al, ri, ci, n)["sources"]
        others = [k for k in ("row", "col", "interaction") if k != key]
        check[labels[key]] = {
            "sum": float(al.sum()),
            "max_other_F": float(max(raw[o]["F"] for o in others)),
        }
    counts = [[int(((ri == i) & (ci == j)).sum()) for j in range(b)]
              for i in range(a)]
    balanced = len({c for row in counts for c in row}) == 1
    out = {
        "analysis": "two_way_art",
        "method": "Aligned rank transform (ART) ANOVA",
        "type": "III (general linear model on the aligned ranks)",
        "n": n, "rows": a, "cols": b, "cell_n": counts, "balanced": balanced,
        "sources": sources, "alignment_check": check,
        "source": SOURCE, "log_note": LOG_NOTE,
    }
    if not balanced:
        out["note"] = ("The cells hold unequal numbers of values: the "
                       "alignment uses means of the observations (as R's "
                       "ARTool), and the ANOVA on the ranks is Type III.")
    return out


# ------------------------------------------------------------------ ART-C

def _emm_contrasts(r, ri, ci, a, b, factor: str, names, method, ci_level):
    """Pairwise differences of estimated marginal means (rows, columns
    or cells) of ranks r under the factorial linear model."""
    n = r.size
    counts = np.array([[((ri == i) & (ci == j)).sum() for j in range(b)]
                       for i in range(a)], dtype=float)
    cm = np.array([[r[(ri == i) & (ci == j)].mean() for j in range(b)]
                   for i in range(a)])
    resid = r - cm[ri, ci]
    df = n - a * b
    mse = float(resid @ resid) / df
    if factor == "row":
        k = a
        means = cm.mean(axis=1)
        w = [np.outer(np.eye(a)[i], np.ones(b) / b) for i in range(a)]
    elif factor == "col":
        k = b
        means = cm.mean(axis=0)
        w = [np.outer(np.ones(a) / a, np.eye(b)[j]) for j in range(b)]
    else:
        k = a * b
        means = cm.ravel()
        w = [np.eye(k)[m].reshape(a, b) for m in range(k)]
    pairs = list(combinations(range(k), 2))
    rows = []
    for i, j in pairs:
        c = w[i] - w[j]
        diff = float(means[i] - means[j])
        se = math.sqrt(mse * float((c ** 2 / counts).sum()))
        t = diff / se if se > 0 else math.inf
        rows.append({"pair": f"{names[i]} vs. {names[j]}", "a_index": i,
                     "b_index": j, "difference": diff, "se": se, "t": t,
                     "df": int(df),
                     "p_unadjusted": float(2 * stats.t.sf(abs(t), df))})
    m = len(rows)
    if method == "tukey":
        qcrit = studentized.ppf(ci_level, k, df)
        for row in rows:
            q = abs(row["t"]) * math.sqrt(2.0)
            row["p_adjusted"] = min(float(studentized.sf(np.array([q]), k,
                                                         df)[0]), 1.0)
            half = qcrit * row["se"] / math.sqrt(2.0)
            row["ci"] = [row["difference"] - half, row["difference"] + half]
    elif method in ("holm", "bonferroni", "none"):
        adj = adjust_p([row["p_unadjusted"] for row in rows], method)
        tcrit = None
        if method == "bonferroni":
            tcrit = float(stats.t.ppf(1 - (1 - ci_level) / (2 * m), df))
        elif method == "none":
            tcrit = float(stats.t.ppf(1 - (1 - ci_level) / 2, df))
        for row, p in zip(rows, adj):
            row["p_adjusted"] = p
            row["ci"] = ([row["difference"] - tcrit * row["se"],
                          row["difference"] + tcrit * row["se"]]
                         if tcrit is not None else None)
    else:
        raise ValueError(f"unknown ART-C adjustment: {method} (use 'tukey', "
                         "'holm', 'bonferroni' or 'none')")
    for row in rows:
        row["significant_05"] = bool(row["p_adjusted"] < 0.05)
        row["family_size"] = m
        row["method"] = method
    return {"means": [float(v) for v in means], "df": int(df), "mse": mse,
            "comparisons": rows, "n_means": k}


def art_contrasts(cells, factor: str, *, method: str = "tukey",
                  row_names=None, col_names=None,
                  ci_level: float = 0.95) -> dict:
    """ART-C pairwise contrasts (Elkin et al. 2021) of the levels of the
    row factor ("row"), the column factor ("col") or of the cells
    ("cells"). Differences are of mean ranks."""
    if factor not in ("row", "col", "cells"):
        raise ValueError("ART-C contrasts compare 'row', 'col' or 'cells'")
    y, ri, ci, a, b = _cells_arrays(cells)
    row_names = list(row_names or [f"Row {i + 1}" for i in range(a)])
    col_names = list(col_names or [f"Column {j + 1}" for j in range(b)])
    if factor == "cells":
        # the combined factor's aligned values are y - grand mean
        r = aligned_ranks(y - y.mean())
        names = [f"{rn}:{cn}" for rn in row_names for cn in col_names]
    else:
        r = aligned_ranks(aligned_responses(y, ri, ci, a, b)[factor])
        names = row_names if factor == "row" else col_names
    out = _emm_contrasts(r, ri, ci, a, b, factor, names, method, ci_level)
    label = {"tukey": "Tukey", "holm": "Holm", "bonferroni": "Bonferroni",
             "none": "no correction"}[method]
    m = len(out["comparisons"])
    scope = {"row": f"all pairs of {a} rows", "col": f"all pairs of {b} "
             "columns", "cells": f"all pairs of {a * b} cells"}[factor]
    out.update(factor=factor, names=names, ci_level=ci_level,
               family={"size": m, "method": method,
                       "label": f"{label}, {m} comparison"
                                f"{'s' if m != 1 else ''} ({scope})"},
               estimate="difference of mean aligned ranks",
               source=CONTRAST_SOURCE)
    return out
