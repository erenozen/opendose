"""Two-way nested mixed model (factor A x factor B with the animal, litter
or culture as a random intercept) and the "grouping column" mixed model
for multiple-variables tables.

Model (lme4 notation, Bates et al. 2015, J Stat Softw 67(1), the
equivalent formula):

    value ~ A * B + (1 | unit)

fixed A, B and A x B in sum-to-zero (effect) coding, one random intercept
per unit, residual scatter of the values within a unit; fitted by REML
with opendose.mixedmodel.fit_reml. Type III Wald F tests of each term
(each term entered last), as opendose.mixedmodel does for the repeated-
measures mixed models.

Sources (cited for the method):

- GraphPad Prism statistics guide, "How Prism performs the nested t test
  and one-way ANOVA" and FAQ 2105: the nested design is a mixed model
  with the main factor fixed and the subcolumns (units) random, SAS PROC
  MIXED; MODEL y = Condition; RANDOM Room*Condition, with containment
  df = units - groups. The guide covers one factor; this module extends
  the same random-unit logic to two crossed fixed factors (SAS: MODEL
  y = A|B; RANDOM unit(A*B)). With B at one level the result equals
  opendose.nested.nested_one_way_anova.
- Aarts E, Verhage M, Veenvliet JV, Dolan CV, van der Sluis S (2014) "A
  solution to dependency: using multilevel analysis to accommodate
  nested data", Nat Neurosci 17:491-496: the intraclass correlation
  ICC = var(unit) / (var(unit) + var(residual)) and the design effect
  1 + (n - 1) ICC (n = values per unit; the mean number when units are
  unequal), with effective sample size N / design effect.
- Lazic SE (2010) "The problem of pseudoreplication in neuroscientific
  studies: is it affecting your analysis?" BMC Neurosci 11:5: the
  experimental unit (animal), not the cell, sets the degrees of freedom.

Denominator degrees of freedom: the containment method, as in the rest of
opendose.mixedmodel (SAS PROC MIXED's default with a RANDOM statement).
A fixed term is "contained" in the unit effect when every unit lies in a
single level of each factor of that term (the unit is nested in it); the
term is then tested against the unit term's rank contribution,
rank([X Z]) - rank(X) (= units - cells when units are nested in the A x
B cells, the classical nested-ANOVA df of "units within cells"). Terms
not contained in the unit (the unit spans their levels, e.g. litters
that hold pups of both treatments) are tested against the residual df
N - rank([X Z]). For a balanced design with units nested in cells the F
tests equal the classical nested ANOVA (A, B and A x B against MS units
within cells) when the unit variance may be negative (the default,
Prism's "analyze as usual"; "zero" bounds it at zero as lme4 does).

Only numpy and scipy are used, so the module runs under Pyodide.
"""

from __future__ import annotations

import math
from itertools import product

import numpy as np
from scipy import stats

from . import mixedmodel as mm
from .moretests import METHOD_NAMES, comparison_family

COMPARISON_METHODS = ("tukey", "dunnett", "bonferroni", "sidak",
                      "holm_sidak", "holm", "fisher")


def _missing(v) -> bool:
    if v is None:
        return True
    if isinstance(v, float) and math.isnan(v):
        return True
    if isinstance(v, str) and not v.strip():
        return True
    return False


def _num(v):
    """float(v) or None (blank / non-numeric)."""
    if _missing(v) or isinstance(v, bool):
        return None
    try:
        out = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(out) or math.isinf(out) else out


def _label(v) -> str:
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def _order(observed, given=None):
    """Level order: the given order (levels not observed are dropped,
    observed levels not listed are appended) else first appearance."""
    seen = []
    for v in observed:
        if v not in seen:
            seen.append(v)
    if not given:
        return seen
    given = [_label(g) for g in given]
    return [g for g in given if g in seen] + [v for v in seen
                                                if v not in given]


# ---------------------------------------------------- multiple comparisons

def _holm(entries):
    """Holm (Bonferroni step-down) adjustment over all entries together
    (in place). Holm 1979, Scand J Statist 6:65-70."""
    m = len(entries)
    order = sorted(range(m), key=lambda i: entries[i]["p_unadjusted"])
    running = 0.0
    for rank, i in enumerate(order):
        p_adj = min((m - rank) * entries[i]["p_unadjusted"], 1.0)
        running = max(running, p_adj)
        entries[i]["p_adjusted"] = running
        entries[i]["significant_05"] = bool(running < 0.05)
        entries[i]["ci"] = None   # step-down: no simultaneous intervals
        entries[i]["method"] = "holm"
        entries[i]["family_size"] = m


def family_comparisons(fit, families, method: str, *, ci_level=0.95,
                       control_index: int = 0, scope_label: str = "") -> dict:
    """Comparisons of model-estimated means in one or several families.

    families: list of (family name, L rows (k x p), mean names, df).
    tukey / dunnett adjust within each family; bonferroni, sidak,
    holm_sidak, holm and fisher count every comparison in every family
    (as mixedmodel.mixed_rm_two_way does, following Prism's two-way
    convention). Returns {method, scope, n_comparisons, comparisons,
    family, families}."""
    if method not in COMPARISON_METHODS:
        raise ValueError(f"unknown multiple-comparisons method: {method}")
    base = "fisher" if method == "holm" else method
    sizes = [(L.shape[0] - 1 if method == "dunnett"
              else L.shape[0] * (L.shape[0] - 1) // 2)
             for _, L, _, _ in families]
    total = sum(sizes)
    comps, blocks = [], []
    for name, L, names, df in families:
        if L.shape[0] < 2:
            continue
        est, cov = mm.estimate(fit, L)
        part = mm.compare_estimates(
            est, cov, df, base, names=names, control_index=control_index,
            ci_level=ci_level, n_family_total=total, family=name)
        comps.extend(part)
        blk = mm.comparisons_family(base, L.shape[0], part, names,
                                    control_index)
        blocks.append({"name": name, "n_means": int(L.shape[0]),
                       "n_comparisons": len(part), "df": float(df), **blk})
    if method == "holm":
        _holm(comps)
        for blk in blocks:
            blk.update(comparison_family(total, "holm",
                                         "all comparisons together"))
    per_family = method in ("tukey", "dunnett")
    method_id = "fisher_lsd" if method == "fisher" else method
    if per_family:
        size = max((b["size"] for b in blocks), default=0)
        label = (blocks[0]["label"] if len(blocks) == 1 else
                 f"{METHOD_NAMES[method_id]}, comparisons within each of "
                 f"{len(blocks)} separate families")
        family = {"size": size, "method": method_id, "label": label,
                  "n_families": len(blocks), "per_family": True}
    else:
        scope = (f"all {len(blocks)} families corrected together"
                 if len(blocks) > 1 else
                 f"all pairs of {blocks[0]['n_means']} means" if blocks
                 else "no comparisons")
        family = {**comparison_family(total, method_id, scope),
                  "n_families": len(blocks), "per_family": False}
    return {"method": method_id, "scope": scope_label,
            "n_comparisons": len(comps), "comparisons": comps,
            "family": family, "families": blocks}


# ------------------------------------------------------------ the model

def _term_label(names):
    return " × ".join(names)


def fit_unit_model(y, factors, units, *, unit_names=None,
                   negative_variance: str = "allow",
                   ci_level: float = 0.95, comparisons=None,
                   comparison_scope=None, control_index: int = 0,
                   unit_word: str = "units") -> dict:
    """Fit value ~ factors (one or two, with interaction) + (1 | unit).

    y: values; factors: list of (name, codes (0-based int array), level
    names); units: unit codes (0-based int array, one per value; unit
    labels are taken as given: the same code is the same unit wherever it
    appears). Factors with a single level are left out of the model.
    """
    if negative_variance not in ("allow", "zero"):
        raise ValueError("negative_variance must be 'allow' or 'zero'")
    y = np.asarray(y, dtype=float)
    units = np.asarray(units, dtype=int)
    warnings = []
    active = [(n, np.asarray(c, dtype=int), lv) for n, c, lv in factors
              if len(lv) >= 2]
    dropped = [n for n, _, lv in factors if len(lv) < 2]
    if dropped:
        warnings.append(
            f"{', '.join(dropped)} has a single level and is left out of "
            "the model.")
    if not active:
        raise ValueError("need at least one factor with two or more levels")
    if len(active) > 2:
        raise ValueError("at most two factors")
    n = y.size
    _, units = np.unique(units, return_inverse=True)
    n_units = int(units.max()) + 1
    unit_names = list(unit_names) if unit_names is not None else [
        f"Unit {i + 1}" for i in range(n_units)]

    # design: intercept, effect-coded main effects, interaction
    blocks = [np.ones((n, 1))]
    terms = []
    col = 1
    for name, codes, lv in active:
        E = mm.effect_columns(codes, len(lv))
        blocks.append(E)
        terms.append({"name": name, "factors": [name],
                      "cols": list(range(col, col + E.shape[1]))})
        col += E.shape[1]
    if len(active) == 2:
        AB = mm._interaction(blocks[1], blocks[2])
        blocks.append(AB)
        terms.append({"name": _term_label([active[0][0], active[1][0]]),
                      "factors": [active[0][0], active[1][0]],
                      "cols": list(range(col, col + AB.shape[1]))})
    X = np.column_stack(blocks)

    # every cell needs data
    levels = [lv for _, _, lv in active]
    present = set(zip(*[c.tolist() for _, c, _ in active]))
    missing_cells = [cell for cell in product(*[range(len(lv)) for lv in levels])
                     if cell not in present]
    if missing_cells:
        txt = ", ".join(" / ".join(levels[f][i] for f, i in enumerate(cell))
                        for cell in missing_cells[:5])
        raise ValueError(f"every cell needs data; empty: {txt}")
    if n_units < 2:
        raise ValueError("need at least 2 units")

    Z = mm._indicator(units)
    df_unit = int(mm.rank_contribution(X, [Z], 0))
    df_res = int(n - mm._rank(np.column_stack([X, Z])))
    if df_res < 1:
        raise ValueError("no residual degrees of freedom: each unit needs "
                         "replicate values (otherwise analyse the unit "
                         "values with ordinary ANOVA)")
    if df_unit < 1:
        raise ValueError(f"need more {unit_word} than cells (each cell "
                         "holds a single unit, so the unit-to-unit "
                         "variation cannot be estimated)")
    fit = mm.fit_reml(y, X, [("Unit", units)],
                      allow_negative=negative_variance == "allow")

    # containment: is each unit within a single level of each factor?
    nested_in = {}
    for name, codes, lv in active:
        per_unit = [set(codes[units == u].tolist()) for u in range(n_units)]
        span = sum(1 for s in per_unit if len(s) > 1)
        nested_in[name] = span == 0
        if span:
            warnings.append(
                f"{span} of {n_units} {unit_word} hold values from more "
                f"than one level of {name}: {name} varies within "
                f"{unit_word}, so its tests use the residual df "
                f"({df_res}), not the {unit_word} df.")
    anova = []
    for t in terms:
        contained = all(nested_in[f] for f in t["factors"])
        t["df"] = df_unit if contained else df_res
        t["contained"] = contained
        w = mm.wald_f(fit, t["cols"], t["df"])
        anova.append({"term": t["name"], "f": w["F"], "dfn": w["df_num"],
                      "dfd": int(t["df"]), "p": w["p"],
                      "significant_05": bool(w["p"] is not None
                                             and w["p"] < 0.05),
                      "error_term": (f"{unit_word} within cells"
                                     if contained else "residual")})

    # estimated cell means and equal-weight marginal means
    def cell_row(cell):
        rows = [mm.effect_row(i, len(levels[f])) for f, i in enumerate(cell)]
        parts = [np.ones(1)] + rows
        if len(rows) == 2:
            parts.append(np.outer(rows[0], rows[1]).ravel())
        return np.concatenate(parts)

    cells = list(product(*[range(len(lv)) for lv in levels]))
    Lcell = np.array([cell_row(c) for c in cells])
    cell_df = terms[-1]["df"]
    est, cov = mm.estimate(fit, Lcell)
    tcrit = float(stats.t.ppf(0.5 + ci_level / 2, cell_df))
    cell_means = []
    codes_all = [c for _, c, _ in active]
    for k, cell in enumerate(cells):
        sel = np.all([codes_all[f] == i for f, i in enumerate(cell)], axis=0)
        se = math.sqrt(max(cov[k, k], 0.0))
        entry = {"mean": float(est[k]), "se": se,
                 "ci": [float(est[k] - tcrit * se), float(est[k] + tcrit * se)],
                 "df": int(cell_df),
                 "n_units": int(np.unique(units[sel]).size),
                 "n_values": int(sel.sum()),
                 "raw_mean": float(y[sel].mean())}
        entry["a"] = levels[0][cell[0]]
        entry["b"] = levels[1][cell[1]] if len(cell) == 2 else None
        cell_means.append(entry)

    marg_L = []
    marginal = {}
    for f, (name, _, lv) in enumerate(active):
        rows = []
        for i in range(len(lv)):
            idx = [k for k, c in enumerate(cells) if c[f] == i]
            rows.append(Lcell[idx].mean(axis=0))
        Lm = np.array(rows)
        marg_L.append(Lm)
        e, c = mm.estimate(fit, Lm)
        dfm = terms[f]["df"]
        tq = float(stats.t.ppf(0.5 + ci_level / 2, dfm))
        marginal[name] = [{"level": lv[i], "mean": float(e[i]),
                           "se": math.sqrt(max(c[i, i], 0.0)),
                           "ci": [float(e[i] - tq * math.sqrt(max(c[i, i], 0))),
                                  float(e[i] + tq * math.sqrt(max(c[i, i], 0)))],
                           "df": int(dfm)} for i in range(len(lv))]

    # variance components, ICC, design effect (Aarts et al. 2014)
    var_u = fit["variance_components"][0]["variance"]
    var_e = fit["residual_variance"]
    total = var_u + var_e
    icc_raw = var_u / total if total > 0 else None
    icc = max(icc_raw, 0.0) if icc_raw is not None else None
    if var_u < 0:
        warnings.append(
            f"The variance between {unit_word} is estimated as negative "
            f"({var_u:.4g}): {unit_word} differ less than the scatter "
            "within them predicts. It is kept (Prism's 'analyze as "
            "usual', which reproduces the classical nested ANOVA); the "
            "ICC is reported as 0. Use negative_variance='zero' to bound "
            "it at zero as lme4 does.")
    m_bar = n / n_units
    design_effect = 1.0 + (m_bar - 1.0) * icc if icc is not None else None
    var_block = {
        "unit": {"variance": var_u,
                 "sd": math.sqrt(var_u) if var_u >= 0 else None,
                 "percent_of_total": 100.0 * var_u / total if total > 0 else None},
        "residual": {"variance": var_e, "sd": math.sqrt(var_e),
                     "percent_of_total": 100.0 * var_e / total if total > 0 else None},
    }
    lr = mm.likelihood_ratio_random(fit)

    # per-unit summaries (for plotting unit means over the values)
    unit_rows = []
    for u in range(n_units):
        sel = units == u
        vals = y[sel]
        cell = tuple(int(codes_all[f][sel][0]) for f in range(len(active)))
        sd = float(vals.std(ddof=1)) if vals.size > 1 else None
        unit_rows.append({
            "unit": unit_names[u],
            "a": levels[0][cell[0]],
            "b": levels[1][cell[1]] if len(cell) == 2 else None,
            "n": int(vals.size), "mean": float(vals.mean()), "sd": sd})

    out = {
        "anova": anova,
        "variance_components": var_block,
        "icc": icc, "icc_raw": icc_raw,
        "design_effect": design_effect,
        "mean_values_per_unit": m_bar,
        "effective_n": (n / design_effect
                        if design_effect and design_effect > 0 else None),
        "units_differ": {**lr, "significant_05": bool(lr["p"] < 0.05),
                         "test": "likelihood ratio (REML fit with vs. "
                                 "without the random unit effect)"},
        "n_units": n_units, "n_values": int(n),
        "n_cells": len(cells),
        "cell_means": cell_means,
        "marginal_means": marginal,
        "units": unit_rows,
        "unit_nested_in": nested_in,
        "df": {"units": df_unit, "residual": df_res},
        "goodness_of_fit": {
            "reml_criterion": fit["reml_criterion"],
            "log_likelihood": fit["log_likelihood"],
            "aic": fit["aic"], "bic": fit["bic"],
            "converged": fit["converged"]},
        "df_method": ("containment: terms nested in units use the units' "
                      "rank contribution (units - cells), others the "
                      "residual df"),
        "factor_names": [nm for nm, _, _ in active],
        "levels": {nm: list(lv) for nm, _, lv in active},
        "comparisons": None,
    }
    if not fit["converged"]:
        warnings.append("The REML optimizer did not fully converge; treat "
                        "the variance components with caution.")

    if comparisons:
        names_cell = [" / ".join(levels[f][i] for f, i in enumerate(c))
                      for c in cells]
        two = len(active) == 2
        scope = comparison_scope or ("b_within_a" if two else "a_means")
        if not two and scope in ("b_within_a", "a_within_b", "b_means"):
            scope = "a_means"   # one factor in the model: its means
        fams = []
        if scope == "cells":
            fams.append(("All cells", Lcell, names_cell, cell_df))
        elif scope in ("b_within_a", "a_within_b") and two:
            outer, inner = (0, 1) if scope == "b_within_a" else (1, 0)
            for i in range(len(levels[outer])):
                idx = [k for k, c in enumerate(cells) if c[outer] == i]
                fams.append((f"{active[outer][0]}: {levels[outer][i]}",
                             Lcell[idx],
                             [levels[inner][cells[k][inner]] for k in idx],
                             cell_df))
        elif scope in ("a_means", "b_means"):
            f = 0 if scope == "a_means" or not two else 1
            fams.append((f"{active[f][0]} (marginal means)", marg_L[f],
                         list(levels[f]), terms[f]["df"]))
        else:
            raise ValueError(f"unknown comparison_scope: {scope}")
        out["comparisons"] = family_comparisons(
            fit, fams, comparisons, ci_level=ci_level,
            control_index=control_index, scope_label=scope)
    out["warnings"] = warnings
    out["_fit"] = fit
    return out


def _design_note(res, unit_word):
    n_u, n_v = res["n_units"], res["n_values"]
    df = res["df"]["units"]
    return (f"df come from {n_u} {unit_word}, not from {n_v} values: "
            f"terms nested in {unit_word} are tested on {df} df "
            f"({n_u} {unit_word} - {res['n_cells']} cells).")


def _strip(res):
    res.pop("_fit", None)
    return res


# ------------------------------------------------------------- layouts

def records_from_grouped(data, options=None):
    """Grouped-table layout -> long records. Rows = factor A levels
    (data.row_titles or options.row_names), data sets = factor B levels,
    subcolumns = units; ds["ys"][row][subcolumn] is either one number or
    a list of replicate values from that unit. Optional ds["unit_names"]
    [row][subcolumn] labels the units (default "Unit k")."""
    options = options or {}
    dsets = data["datasets"]
    n_rows = max((len(ds.get("ys") or []) for ds in dsets), default=0)
    titles = list(data.get("row_titles") or options.get("row_names") or [])
    titles = [(_label(t) if not _missing(t) else f"Row {i + 1}")
              for i, t in enumerate(titles[:n_rows])]
    titles += [f"Row {i + 1}" for i in range(len(titles), n_rows)]
    recs = []
    for d, ds in enumerate(dsets):
        bname = _label(ds.get("name") or f"Data set {d + 1}")
        unames = ds.get("unit_names") or []
        for r, row in enumerate(ds.get("ys") or []):
            for s, cell in enumerate(row or []):
                label = None
                if r < len(unames) and unames[r] and s < len(unames[r]):
                    label = unames[r][s]
                label = _label(label) if not _missing(label) else f"Unit {s + 1}"
                vals = cell if isinstance(cell, (list, tuple)) else [cell]
                for rep, v in enumerate(vals):
                    recs.append({"value": v, "factor_a": titles[r],
                                 "factor_b": bname, "unit": label,
                                 "replicate": rep + 1})
    return recs


def _records(data, keys):
    """data.records (list of dicts) or column arrays data[key]."""
    if data.get("records") is not None:
        return list(data["records"])
    if all(k in data for k in keys[:1]):
        n = len(data[keys[0]])
        return [{k: (data[k][i] if k in data and data[k] is not None
                     and i < len(data[k]) else None) for k in keys}
                for i in range(n)]
    raise ValueError("data needs records, column arrays or datasets")


def mixed_nested_two_way(data, options=None) -> dict:
    """Two-way nested mixed model: value ~ A * B + (1 | unit).

    data: {"records": [{value, factor_a, factor_b, unit, replicate?}]}
    (or column arrays {"value", "factor_a", "factor_b", "unit"}), or the
    grouped-table layout {"datasets": [{"name": B level, "ys": [[unit
    values (number or list of replicates) per subcolumn] per row],
    "unit_names"?}], "row_titles": [A levels]}.

    options: factor_a_name ("A"), factor_b_name ("B"), levels_a,
    levels_b (orders), unit_name ("animals"), unit_labels ("within_cell":
    the same label in two cells is two different units, as in a nested
    design | "as_given": the same label is the same unit wherever it
    appears), negative_variance ("allow" | "zero"), ci_level,
    comparisons (tukey | dunnett | bonferroni | sidak | holm_sidak |
    holm | fisher), comparison_scope ("b_within_a" | "a_within_b" |
    "cells" | "a_means" | "b_means"), control_index.
    """
    options = options or {}
    if data.get("datasets") is not None and data.get("records") is None:
        recs = records_from_grouped(data, options)
    else:
        recs = _records(data, ["value", "factor_a", "factor_b", "unit",
                               "replicate"])
    a_name = options.get("factor_a_name") or "A"
    b_name = options.get("factor_b_name") or "B"
    unit_word = options.get("unit_name") or "units"
    warnings = []
    ys, a_lab, b_lab, u_lab = [], [], [], []
    dropped = 0
    for r in recs:
        v = _num(r.get("value"))
        u = r.get("unit")
        a = r.get("factor_a", "")
        b = r.get("factor_b", "")
        if v is None or _missing(u):
            if not (_missing(r.get("value")) and _missing(u)):
                dropped += 1
            continue
        if _missing(a):
            a = ""
        if _missing(b):
            b = ""
        ys.append(v)
        a_lab.append(_label(a) if a != "" else "All")
        b_lab.append(_label(b) if b != "" else "All")
        u_lab.append(_label(u))
    if dropped:
        warnings.append(f"{dropped} record{'s' if dropped > 1 else ''} "
                        "without a numeric value or a unit left out.")
    if not ys:
        raise ValueError("no values")
    lv_a = _order(a_lab, options.get("levels_a"))
    lv_b = _order(b_lab, options.get("levels_b"))
    ai = np.array([lv_a.index(v) for v in a_lab])
    bi = np.array([lv_b.index(v) for v in b_lab])
    mode = options.get("unit_labels", "within_cell")
    if mode not in ("within_cell", "as_given"):
        raise ValueError("unit_labels must be 'within_cell' or 'as_given'")
    if mode == "within_cell":
        keys = list(zip(a_lab, b_lab, u_lab))
        cells_of = {}
        for a, b, u in keys:
            cells_of.setdefault(u, set()).add((a, b))
        reused = [u for u, s in cells_of.items() if len(s) > 1]
        if reused:
            warnings.append(
                f"Unit labels repeat across cells ({', '.join(reused[:3])}"
                f"{'...' if len(reused) > 3 else ''}): each cell's units "
                "are treated as different units (nested design). If the "
                "same unit was measured in several cells, that is a "
                "repeated-measures design: set unit_labels='as_given'.")
        key_order = _order(keys)
        names = [k[2] if k[2] not in reused else f"{k[2]} ({k[0]} / {k[1]})"
                 for k in key_order]
        index = {k: i for i, k in enumerate(key_order)}
        ui = np.array([index[k] for k in keys])
    else:
        names = _order(u_lab)
        ui = np.array([names.index(u) for u in u_lab])
    res = fit_unit_model(
        np.array(ys), [(a_name, ai, lv_a), (b_name, bi, lv_b)], ui,
        unit_names=names,
        negative_variance=options.get("negative_variance", "allow"),
        ci_level=options.get("ci_level", 0.95),
        comparisons=options.get("comparisons"),
        comparison_scope=options.get("comparison_scope"),
        control_index=options.get("control_index", 0),
        unit_word=unit_word)
    active = res["factor_names"]
    formula = (f"value ~ {' * '.join(active)} + (1 | unit)")
    out = {"analysis": "mixed_nested_two_way",
           "method": ("Linear mixed model, REML, random intercept per "
                      "unit; Type III Wald F tests"),
           "formula": formula,
           "unit_labels": mode,
           **_strip(res)}
    out["design_note"] = _design_note(out, unit_word)
    out["warnings"] = warnings + out["warnings"]
    return out


def mixed_grouping(variables, outcome, factors, grouping, options=None
                   ) -> dict:
    """Multiple-variables table: outcome ~ factors (one or two, with
    their interaction) + (1 | grouping). variables: [{"name", "values"}]
    rows aligned. Factor values are categories (numbers are read as
    labels); the grouping column's labels are taken as given (lme4's
    (1 | grouping)); the containment df follow from the data (a factor
    whose levels all sit within single groups is tested on the groups'
    df, one that varies within groups on the residual df)."""
    options = options or {}
    factors = list(factors or [])
    if not 1 <= len(factors) <= 2:
        raise ValueError("mixed_grouping takes one or two factors")
    cols = {v.get("name"): v.get("values") or [] for v in variables}
    for name in [outcome, grouping, *factors]:
        if name not in cols:
            raise ValueError(f"no variable named {name!r}")
    if grouping in factors or outcome in factors or outcome == grouping:
        raise ValueError("outcome, factors and grouping must be different "
                         "columns")
    n = max(len(c) for c in cols.values())

    def at(name, i):
        c = cols[name]
        return c[i] if i < len(c) else None

    ys, fl, gl = [], [[] for _ in factors], []
    dropped = 0
    for i in range(n):
        v = _num(at(outcome, i))
        g = at(grouping, i)
        fv = [at(f, i) for f in factors]
        if v is None or _missing(g) or any(_missing(x) for x in fv):
            if not all(_missing(at(nm, i))
                       for nm in [outcome, grouping, *factors]):
                dropped += 1
            continue
        ys.append(v)
        gl.append(_label(g))
        for k, x in enumerate(fv):
            fl[k].append(_label(x))
    warnings = []
    if dropped:
        warnings.append(f"{dropped} row{'s' if dropped > 1 else ''} with a "
                        "blank or non-numeric outcome, factor or grouping "
                        "value left out.")
    if not ys:
        raise ValueError("no complete rows")
    level_opts = options.get("levels") or {}
    fac = []
    for k, name in enumerate(factors):
        lv = _order(fl[k], level_opts.get(name))
        fac.append((name, np.array([lv.index(x) for x in fl[k]]), lv))
    groups = _order(gl)
    gi = np.array([groups.index(g) for g in gl])
    unit_word = options.get("unit_name") or f"{grouping} groups"
    res = fit_unit_model(
        np.array(ys), fac, gi, unit_names=groups,
        negative_variance=options.get("negative_variance", "allow"),
        ci_level=options.get("ci_level", 0.95),
        comparisons=options.get("comparisons"),
        comparison_scope=options.get("comparison_scope"),
        control_index=options.get("control_index", 0),
        unit_word=unit_word)
    out = {"analysis": "mixed_grouping",
           "method": ("Linear mixed model, REML, random intercept per "
                      "group; Type III Wald F tests"),
           "formula": (f"{outcome} ~ {' * '.join(res['factor_names'])} "
                       f"+ (1 | {grouping})"),
           "outcome": outcome, "grouping": grouping,
           **_strip(res)}
    out["design_note"] = _design_note(out, unit_word)
    if not all(out["unit_nested_in"].values()):
        out["design_note"] += (" Factors that vary within groups are "
                               f"tested on the residual df "
                               f"({out['df']['residual']}).")
    out["warnings"] = warnings + out["warnings"]
    return out
