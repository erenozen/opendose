"""Three-way ANOVA on a grouped table, with multiple comparisons.

Statistics guide, "Entering data for three-way ANOVA": no grouping
variables. Rows are the levels of one factor; data set columns A and B
vs. C and D are the two levels of the second factor; A and C vs. B and D
the two levels of the third; only the first four data set columns are
used; at least two replicates are needed for most cells. That layout is
the default here (data set d -> factor B level d // 2, factor C level
d % 2); any other assignment of data sets to (B, C) levels can be given
explicitly.

"Interpreting results: Three-way ANOVA": the total variation is split
into seven effects (three main effects, three two-way interactions, the
three-way interaction) plus the residual; for each, SS, df, MS, F, P and
the percentage of the total variation. As in opendose.twoway, sums of
squares are Type III from an effect-coded (sum-to-zero) general linear
model: each term's SS is the rise in residual SS when only that term's
columns are dropped from the full model, so balanced and unbalanced
designs are handled alike (identical to the classical sums of squares
when balanced).

Multiple comparisons ("Multiple comparisons tab: Three-way ANOVA",
"Options tab: Multiple comparisons: Three-way ANOVA", and the Prism 8
document "How Prism computes multiple comparisons tests following ANOVA"):
goals
- "all_cells": every cell mean with every other (2x2x2: 28),
- "control": the control cell (A1 by default) with every other (7),
- "one_factor": cells that differ by only one factor (12); optionally
  restricted to one factor ("factor"), i.e. that factor's simple
  effects within each combination of the other two,
- "row1_below": each cell mean in row 1 with the cell just below it (4);
  with more than two rows, every row with the next,
- "row_means" / "row_means_control": marginal row means (all pairs / vs.
  a control row), and likewise "factor_b_means", "factor_c_means".
Every comparison uses MS(Error) = MS(Residual) and DF(Error) =
DF(Residual) of the ANOVA (ordinary three-way ANOVA), one family per
goal. Means are the model's predicted (least-squares) means: cell means,
and unweighted averages of cell means for marginal means, whose SE of a
difference is sqrt(MS * sum(c^2 / n)) (= sqrt(MS (1/N1 + 1/N2)) when
balanced). Tests: Tukey (q = |diff| / (SE / sqrt 2), studentized range
with M = means in the family), Dunnett (control goals; multivariate t),
Bonferroni, Sidak, Holm-Sidak, Fisher's LSD (no correction), or the
FDR methods of opendose.fdr applied to Fisher LSD P values. Each
comparison also carries "p_unadjusted" (the Fisher LSD P: pooled t with
MS(Error) and DF(Error)), "family_size" (the comparisons in the goal's
family) and "method"; the result carries "family" {size, method, label}.

"effect_size" (opendose.effectsize): per effect, partial eta^2 with its
noncentral-F CI, partial omega^2, partial epsilon^2, Cohen's f and
eta^2 = SS / SS_total.
"""

from __future__ import annotations

import math
from itertools import combinations

import numpy as np
from scipy import optimize, stats

from . import effectsize, fdr, studentized
from .moretests import comparison_family
from .twoway import _effect_columns, _ss_resid

PRISM_LAYOUT = [(0, 0), (0, 1), (1, 0), (1, 1)]  # data sets A, B, C, D


def cells_from_datasets(datasets, column_levels=None):
    """Grouped table -> cells[i][j][k] (row i, factor B level j, factor C
    level k) = replicate list. datasets[d] = per-row replicate lists.
    column_levels[d] = (b, c) of data set d (None: skip it); default is
    the guide's layout for the first four data sets."""
    if column_levels is None:
        if len(datasets) < 4:
            raise ValueError("three-way ANOVA needs four data set columns "
                             "(A-D) or explicit column_levels")
        column_levels = PRISM_LAYOUT + [None] * (len(datasets) - 4)
    if len(column_levels) != len(datasets):
        raise ValueError("column_levels needs one (b, c) pair per data set")
    used = [(d, lv) for d, lv in enumerate(column_levels) if lv is not None]
    nb = max(int(lv[0]) for _, lv in used) + 1
    nc = max(int(lv[1]) for _, lv in used) + 1
    n_rows = max(len(datasets[d]) for d, _ in used)
    cells = [[[[] for _ in range(nc)] for _ in range(nb)]
             for _ in range(n_rows)]
    owner = {}
    for d, (b, c) in used:
        b, c = int(b), int(c)
        if (b, c) in owner:
            raise ValueError(f"data sets {owner[(b, c)]} and {d} have the "
                             f"same factor levels ({b}, {c})")
        owner[(b, c)] = d
        for i in range(n_rows):
            row = datasets[d][i] if i < len(datasets[d]) else []
            cells[i][b][c] = [float(v) for v in (row or []) if v is not None
                              and not (isinstance(v, float) and math.isnan(v))]
    return cells, owner


def _design(cells):
    ys, ia, ib, ic = [], [], [], []
    for i, plane in enumerate(cells):
        for j, line in enumerate(plane):
            for k, cell in enumerate(line):
                for v in cell:
                    if v is None:
                        continue
                    v = float(v)
                    if math.isnan(v):
                        continue
                    ys.append(v)
                    ia.append(i)
                    ib.append(j)
                    ic.append(k)
    return (np.array(ys), np.array(ia, dtype=int), np.array(ib, dtype=int),
            np.array(ic, dtype=int))


def _products(*blocks):
    cols = [np.ones(blocks[0].shape[0])]
    for blk in blocks:
        cols = [c * blk[:, j] for c in cols for j in range(blk.shape[1])]
    return np.column_stack(cols)


def three_way_anova(cells, *, factor_names=("Rows", "Factor B",
                                            "Factor C")) -> dict:
    """Type III three-way ANOVA. cells[i][j][k] = replicate list."""
    y, ia, ib, ic = _design(cells)
    n = y.size
    a = len(cells)
    b = max(len(plane) for plane in cells)
    c = max(len(line) for plane in cells for line in plane)
    if min(a, b, c) < 2:
        raise ValueError("three-way ANOVA needs >= 2 levels of every factor")
    for name, idx, k in (("row", ia, a), ("factor B", ib, b),
                         ("factor C", ic, c)):
        if np.unique(idx).size < k:
            raise ValueError(f"a {name} level has no data")

    A = _effect_columns(ia, a)
    B = _effect_columns(ib, b)
    C = _effect_columns(ic, c)
    terms = {
        "A": A, "B": B, "C": C,
        "AB": _products(A, B), "AC": _products(A, C), "BC": _products(B, C),
        "ABC": _products(A, B, C),
    }
    intercept = np.ones((n, 1))
    X_full = np.column_stack([intercept] + list(terms.values()))
    rank_full = int(np.linalg.matrix_rank(X_full))
    df_resid = n - rank_full
    if df_resid < 1:
        raise ValueError("not enough replicates: enter two or more values "
                         "for most combinations of conditions")
    ss_resid = _ss_resid(X_full, y)
    ms_resid = ss_resid / df_resid
    ss_total = float(((y - y.mean()) ** 2).sum())

    fa, fb, fc = factor_names
    labels = {"A": fa, "B": fb, "C": fc, "AB": f"{fa} x {fb}",
              "AC": f"{fa} x {fc}", "BC": f"{fb} x {fc}",
              "ABC": f"{fa} x {fb} x {fc}"}
    sources = {}
    for key in ("A", "B", "C", "AB", "AC", "BC", "ABC"):
        X_red = np.column_stack([intercept] + [blk for k2, blk in terms.items()
                                               if k2 != key])
        df = rank_full - int(np.linalg.matrix_rank(X_red))
        ss = max(_ss_resid(X_red, y) - ss_resid, 0.0)
        if df > 0:
            ms = ss / df
            f = ms / ms_resid if ms_resid > 0 else math.inf
            p = float(stats.f.sf(f, df, df_resid))
        else:
            ms = f = p = None
        sources[labels[key]] = {
            "term": key, "ss": float(ss), "df": int(df),
            "ms": None if ms is None else float(ms),
            "F": None if f is None else float(f), "p": p,
            "percent_of_total": (100.0 * ss / ss_total) if ss_total else None,
        }
    sources["residual"] = {
        "term": "residual", "ss": float(ss_resid), "df": int(df_resid),
        "ms": float(ms_resid), "F": None, "p": None,
        "percent_of_total": (100.0 * ss_resid / ss_total) if ss_total else None,
    }

    cell_means = [[[float(np.mean(cell)) if len(cell) else None
                    for cell in line] for line in plane] for plane in cells]
    cell_n = [[[len(cell) for cell in line] for line in plane]
              for plane in cells]
    return {
        "n": int(n), "levels": [a, b, c],
        "factor_names": list(factor_names),
        "type": "III (general linear model, effect coding)",
        "sources": sources, "ss_total": ss_total,
        "cell_means": cell_means, "cell_n": cell_n,
        "effect_size": effectsize.safe(effectsize.factorial_terms, sources,
                                       n_total=int(n), ss_total=ss_total),
    }


# --- multiple comparisons -------------------------------------------------

def _dunnett_mvt(rho, df):
    return stats.multivariate_t(shape=rho, df=df,
                                seed=np.random.default_rng(12345))


def _dunnett(tabs, rho, df, alpha):
    """Two-sided Dunnett adjusted P values for |t| values and the
    critical value at family-wise alpha (multivariate t, as
    scipy.stats.dunnett)."""
    k = len(tabs)
    if k == 1:
        p = [2.0 * float(stats.t.sf(tabs[0], df))]
        return p, float(stats.t.ppf(1 - alpha / 2, df))
    p = []
    for t in tabs:
        x = np.full(k, t)
        p.append(min(max(1.0 - float(_dunnett_mvt(rho, df).cdf(
            x, lower_limit=-x)), 0.0), 1.0))

    def coverage(cval):
        x = np.full(k, cval)
        return float(_dunnett_mvt(rho, df).cdf(x, lower_limit=-x)) - (1 - alpha)

    lo = float(stats.t.ppf(1 - alpha / 2, df))
    hi = float(stats.t.ppf(1 - alpha / (2 * k), df)) + 0.5
    try:
        crit = optimize.brentq(coverage, lo * 0.99, hi, xtol=1e-6)
    except ValueError:
        crit = None
    return p, crit


def compare_means(entries, pairs, ms_error, df_error, method: str, *,
                  alpha: float = 0.05, q: float = 0.05,
                  control=None) -> dict:
    """Pairwise comparisons from (LS) means sharing one MS/df.

    entries[i] = {"label", "mean", "vf"} with vf = Var(mean) / MS (1/n
    for a cell mean). pairs = [(i, j)], difference = mean_i - mean_j.
    method: tukey | dunnett | bonferroni | sidak | holm_sidak | none
    (Fisher LSD) | bh | by | bky. Dunnett needs every pair to share the
    control entry index `control` as j.
    """
    m_raw = method
    method = "tukey" if method == "tukey" else (
        "dunnett" if method == "dunnett" else fdr.canonical_method(method))
    K = len(pairs)
    M = len({i for pr in pairs for i in pr})
    rows = []
    for i, j in pairs:
        diff = entries[i]["mean"] - entries[j]["mean"]
        se = math.sqrt(ms_error * (entries[i]["vf"] + entries[j]["vf"]))
        t = abs(diff) / se if se > 0 else math.inf
        rows.append({"pair": f"{entries[i]['label']} vs. {entries[j]['label']}",
                     "mean_1": entries[i]["mean"], "mean_2": entries[j]["mean"],
                     "difference": diff, "se": se, "t": t,
                     "p": 2.0 * float(stats.t.sf(t, df_error))})
    out = {"method": method, "n_comparisons": K, "n_means": M,
           "ms_error": float(ms_error), "df_error": int(df_error),
           "alpha": alpha, "q": q if method in fdr.FDR_METHODS else None}
    method_id = "fisher_lsd" if method == "none" else method
    for r in rows:
        r["p_unadjusted"] = r["p"]
        r["family_size"] = K
        r["method"] = method_id
    if method == "tukey":
        scope = f"studentized range over {M} means"
    elif method == "dunnett":
        scope = f"each of {K} means vs. a control"
    else:
        scope = f"{M} means"
    out["family"] = comparison_family(K, method_id, scope)
    if K == 0:
        out["comparisons"] = rows
        return out

    if method == "tukey":
        qcrit = studentized.ppf(1 - alpha, M, df_error)
        p_all = studentized.sf(np.array([r["t"] * math.sqrt(2.0)
                                         for r in rows]), M, df_error)
        for r, p_adj in zip(rows, p_all):
            qs = r["t"] * math.sqrt(2.0)
            r["statistic"] = qs
            r["p_adjusted"] = min(float(p_adj), 1.0)
            half = qcrit * r["se"] / math.sqrt(2.0)
            r["ci"] = [r["difference"] - half, r["difference"] + half]
            r["significant"] = bool(r["p_adjusted"] < alpha)
    elif method == "dunnett":
        if control is None or any(j != control for _, j in pairs):
            raise ValueError("Dunnett's test compares every mean with one "
                             "control")
        v0 = entries[control]["vf"]
        vs = [entries[i]["vf"] for i, _ in pairs]
        rho = np.array([[1.0 if a == b else
                         v0 / math.sqrt((vs[a] + v0) * (vs[b] + v0))
                         for b in range(K)] for a in range(K)])
        padj, crit = _dunnett([r["t"] for r in rows], rho, df_error, alpha)
        for r, p in zip(rows, padj):
            r["statistic"] = r["t"]
            r["p_adjusted"] = p
            r["ci"] = ([r["difference"] - crit * r["se"],
                        r["difference"] + crit * r["se"]]
                       if crit is not None else None)
            r["significant"] = bool(p < alpha)
    else:
        fam = fdr.adjust([r["p"] for r in rows], method, alpha=alpha, q=q)
        tcrit = None
        if method == "bonferroni":
            tcrit = float(stats.t.ppf(1 - alpha / (2 * K), df_error))
        elif method == "sidak":
            a1 = -math.expm1(math.log1p(-alpha) / K)
            tcrit = float(stats.t.ppf(1 - a1 / 2, df_error))
        elif method == "none":
            tcrit = float(stats.t.ppf(1 - alpha / 2, df_error))
        for r, adj, flag in zip(rows, fam["adjusted"], fam["significant"]):
            r["statistic"] = r["t"]
            r["p_adjusted"] = adj
            r["significant"] = flag
            r["ci"] = ([r["difference"] - tcrit * r["se"],
                        r["difference"] + tcrit * r["se"]]
                       if tcrit is not None else None)
        out["discoveries"] = fam["discoveries"]
    for r in rows:
        del r["t"]
    out["requested_method"] = m_raw
    out["comparisons"] = rows
    return out


def _cell_label(cell_labels, row_names, b_names, c_names, i, j, k):
    if cell_labels is not None:
        return cell_labels[i][j][k]
    return f"{row_names[i]}:{b_names[j]}:{c_names[k]}"


def three_way_comparisons(cells, *, goal: str = "all_cells",
                          method: str = "tukey", alpha: float = 0.05,
                          q: float = 0.05, control=(0, 0, 0),
                          control_row: int = 0, factor=None,
                          row_names=None, b_names=None, c_names=None,
                          cell_labels=None, anova=None) -> dict:
    """Multiple comparisons after three-way ANOVA (see module docstring).
    control = (row, b, c) of the control cell; factor = "a" | "b" | "c"
    restricts goal "one_factor" to that factor."""
    base = anova or three_way_anova(cells)
    ms = base["sources"]["residual"]["ms"]
    dfe = base["sources"]["residual"]["df"]
    a, b, c = base["levels"]
    row_names = row_names or [f"Row {i + 1}" for i in range(a)]
    b_names = b_names or [f"B{j + 1}" for j in range(b)]
    c_names = c_names or [f"C{k + 1}" for k in range(c)]
    means, ns = base["cell_means"], base["cell_n"]

    def cell_entries():
        idx, ents = {}, []
        for i in range(a):
            for j in range(b):
                for k in range(c):
                    if ns[i][j][k] > 0:
                        idx[(i, j, k)] = len(ents)
                        ents.append({"label": _cell_label(
                            cell_labels, row_names, b_names, c_names, i, j, k),
                            "mean": means[i][j][k], "vf": 1.0 / ns[i][j][k],
                            "cell": [i, j, k]})
        return idx, ents

    def marginal_entries(axis, names):
        levels = (a, b, c)[axis]
        ents = []
        for lv in range(levels):
            sel = [(i, j, k) for i in range(a) for j in range(b)
                   for k in range(c) if (i, j, k)[axis] == lv]
            if any(ns[i][j][k] == 0 for i, j, k in sel):
                raise ValueError("marginal (least-squares) means need data "
                                 "in every cell")
            w = 1.0 / len(sel)
            ents.append({"label": names[lv],
                         "mean": float(sum(means[i][j][k] for i, j, k in sel) * w),
                         "vf": float(sum(w * w / ns[i][j][k] for i, j, k in sel))})
        return ents

    ctrl = None
    if goal in ("all_cells", "control", "one_factor", "row1_below"):
        idx, ents = cell_entries()
        keys = list(idx)
        if goal == "all_cells":
            pairs = [(idx[u], idx[v]) for u, v in combinations(keys, 2)]
        elif goal == "control":
            control = tuple(int(x) for x in control)
            if control not in idx:
                raise ValueError("the control cell has no data")
            ctrl = idx[control]
            pairs = [(idx[u], ctrl) for u in keys if u != control]
        elif goal == "one_factor":
            axes = None
            if factor is not None:
                axes = {"a": 0, "rows": 0, "b": 1, "c": 2}.get(
                    str(factor).lower(), factor)
                if axes not in (0, 1, 2):
                    raise ValueError(f"unknown factor: {factor}")
            pairs = []
            for u, v in combinations(keys, 2):
                diff_axes = [ax for ax in range(3) if u[ax] != v[ax]]
                if len(diff_axes) == 1 and (axes is None or diff_axes[0] == axes):
                    pairs.append((idx[u], idx[v]))
        else:
            pairs = [(idx[(i, j, k)], idx[(i + 1, j, k)])
                     for i in range(a - 1) for j in range(b) for k in range(c)
                     if (i, j, k) in idx and (i + 1, j, k) in idx]
    elif goal in ("row_means", "row_means_control", "factor_b_means",
                  "factor_c_means"):
        axis = {"row_means": 0, "row_means_control": 0,
                "factor_b_means": 1, "factor_c_means": 2}[goal]
        ents = marginal_entries(axis, (row_names, b_names, c_names)[axis])
        if goal == "row_means_control":
            ctrl = int(control_row)
            pairs = [(i, ctrl) for i in range(len(ents)) if i != ctrl]
        else:
            pairs = list(combinations(range(len(ents)), 2))
    else:
        raise ValueError(f"unknown comparison goal: {goal}")

    if method == "dunnett" and ctrl is None:
        raise ValueError("Dunnett's test needs a control goal")
    res = compare_means(ents, pairs, ms, dfe, method, alpha=alpha, q=q,
                        control=ctrl)
    res["goal"] = goal
    res["means"] = [{k: v for k, v in e.items() if k != "vf"} for e in ents]
    return res
