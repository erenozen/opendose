"""Uncertainty carried through Remove baseline and Normalize (P-98).

When a baseline (a blank's mean) or the 0% and 100% references are
themselves means of replicates, they carry an error that every derived
value inherits. This module propagates it to first order (the delta
method; JCGM 100:2008, "Guide to the expression of uncertainty in
measurement" (GUM), section 5.1, equation 10 for uncorrelated inputs):

    var(f) = sum_i (df / dx_i)^2 var(x_i),

with the inputs taken as the individual replicate values, each with the
sample variance of its own row (of its baseline pool for a baseline
taken from rows of the same column). Working on the replicates makes the
correlations exact: a reference row normalized against itself comes out
at exactly 0% with no error, and a baseline row minus its own mean keeps
only the scatter about that mean.

For each output row it reports n, the derived value of the row mean, the
propagated SD of one derived value, the propagated SE of the derived
mean, and the part of that SE that comes from the baseline or the
references alone. The SD and SE differ from the usual SD / sqrt(n)
because every value of a row shares the same baseline error. These are
summaries for reporting, not replicates: a t test or ANOVA on the
derived values ignores the baseline's error, and one on the propagated
SDs treats a shared error as independent. Analysing the raw values with
the control (blank) as a block keeps both straight (Curtis et al. 2018,
"Experimental design and analysis and their reporting II", Br J
Pharmacol 175:987, on normalised data and the variance of the control).

Not propagated (each said in a note): a baseline matched replicate by
replicate (the derived values are already independent differences,
whose own SD includes the baseline's), a baseline smoothed by linear
regression, Normalize with each subcolumn separately (single-value
references), and a baseline or reference with one value (its
uncertainty is unknown).
"""

from __future__ import annotations

import math

import numpy as np

from . import manipulate
from . import normalize as normalize_mod

METHOD = ("first-order (delta method) propagation, GUM (JCGM 100:2008) "
          "section 5.1, over the individual replicate values")
WARNING = ("Propagated SDs and SEs describe each derived value; they are not "
           "replicates. Do not enter them, or the derived values, into a t test "
           "or ANOVA as independent replicates: the baseline's error is shared "
           "by every value. Analyse the raw values with the control (blank) as a "
           "block instead.")


def _var(values: np.ndarray):
    v = values[~np.isnan(values)]
    return float(np.var(v, ddof=1)) if v.size >= 2 else None


def _finite(v):
    return None if v is None or not math.isfinite(v) else float(v)


# ------------------------------------------------------- Remove baseline

def _op(operation: str, v: float, b: float):
    """f(v, b) and its partial derivatives (df/dv, df/db)."""
    if operation == "subtract":
        return v - b, 1.0, -1.0
    if operation == "add":
        return v + b, 1.0, 1.0
    if operation == "multiply":
        return v * b, b, v
    if operation in ("divide", "percent_of_baseline"):
        k = 100.0 if operation == "percent_of_baseline" else 1.0
        return k * v / b, k / b, -k * v / b ** 2
    if operation in ("fraction_difference", "percent_difference"):
        k = 100.0 if operation == "percent_difference" else 1.0
        return k * (v - b) / b, k / b, -k * v / b ** 2
    raise ValueError(f"unknown operation: {operation}")


def _row_result(n, value, var_one, var_mean, var_base):
    sd = None if var_one is None else _finite(math.sqrt(max(var_one, 0.0)))
    se = None if var_mean is None else _finite(math.sqrt(max(var_mean, 0.0)))
    # a row that is its own reference cancels exactly; rounding leaves ~1e-17
    scale = max(abs(value) if value is not None and math.isfinite(value) else 0.0, sd or 0.0)
    if se is not None and se <= 1e-12 * scale:
        se = 0.0
    return {"n": int(n), "value": _finite(value), "sd": sd, "se": se,
            "from_baseline": None if var_base is None else _finite(math.sqrt(max(var_base, 0.0)))}


def remove_baseline(x, datasets, *, baseline="column", baseline_dataset=0, k=1,
                    value=None, value_sd=None, value_n=None, operation="subtract",
                    replicates="mean", pairs="total_first", linear_baseline=False) -> dict:
    """Propagated uncertainty of manipulate.remove_baseline's output,
    one entry per output data set (same order): {"rows": [{n, value, sd,
    se, from_baseline} | None], "notes": [...]}, or {"rows": None,
    "notes": [why not]}. value_sd / value_n: the SD and number of
    replicates behind a typed baseline (its SE is value_sd / sqrt(value_n));
    without them a typed baseline is exact."""
    n_rows = len(x)
    grids = [manipulate._grid(ds.get("ys"), n_rows) for ds in datasets]
    if baseline == "column":
        jobs = [(i, baseline_dataset) for i in range(len(grids)) if i != baseline_dataset]
    elif baseline == "alternate":
        jobs = []
        for i in range(0, len(grids) - 1, 2):
            t, b = (i, i + 1) if pairs == "total_first" else (i + 1, i)
            jobs.append((t, b))
    else:
        jobs = [(i, None) for i in range(len(grids))]

    out = []
    for idx, b_idx in jobs:
        g = grids[idx]
        if replicates == "each" and baseline != "value":
            out.append({"rows": None, "notes": [
                "Each replicate has its own baseline: the derived values are independent "
                "differences whose own SD already includes the baseline's scatter."]})
            continue
        if linear_baseline and baseline in ("column", "alternate"):
            out.append({"rows": None, "notes": [
                "The baseline is a fitted line: its uncertainty is not propagated."]})
            continue
        rows, notes = [], []
        if baseline == "value":
            if value is None:
                raise ValueError("baseline='value' needs value")
            b_val = float(value)
            if value_sd is not None and value_n is not None:
                if float(value_sd) < 0 or int(value_n) < 1:
                    raise ValueError("the baseline's SD must be 0 or more and its n 1 or more")
                var_b = float(value_sd) ** 2 / int(value_n)
            else:
                var_b = 0.0
                notes.append("The typed baseline is taken as exact (no SD and n given).")
        for r in range(n_rows):
            y = g[r][~np.isnan(g[r])]
            if not y.size:
                rows.append(None)
                continue
            m = float(y.mean())
            s2 = _var(g[r])
            if baseline in ("column", "alternate"):
                pool = grids[b_idx][r]
                pool = pool[~np.isnan(pool)]
                if not pool.size:
                    rows.append(None)
                    continue
                b_val = float(pool.mean())
                sb2 = _var(pool)
                var_b = None if sb2 is None else sb2 / pool.size
                in_pool = False
            elif baseline != "value":
                base_rows = manipulate._baseline_rows(n_rows, baseline, k)
                pool = g[base_rows, :].ravel()
                pool = pool[~np.isnan(pool)]
                b_val = float(pool.mean())
                sb2 = _var(pool)
                var_b = None if sb2 is None else sb2 / pool.size
                in_pool = r in base_rows
            else:
                in_pool = False
            val, dv, db = _op(operation, m, b_val)
            if var_b is None:
                rows.append(_row_result(y.size, val, None, None, None))
                continue
            var_base = db ** 2 * var_b
            if in_pool:
                # this row's values are part of the baseline pool: every
                # value of the pool has the pool's variance, and the row's
                # own values enter both v and b
                S = pool.size
                own = y.size
                # one derived value y_j: d/dy_j = dv + db / S; other pool values db / S
                var_one = (dv + db / S) ** 2 * sb2 + (S - 1) * (db / S) ** 2 * sb2
                # the row mean: d/dy_j (own) = dv / own + db / S, others db / S
                var_mean = own * (dv / own + db / S) ** 2 * sb2 + (S - own) * (db / S) ** 2 * sb2
                rows.append(_row_result(own, val, var_one, var_mean, var_base))
                continue
            var_one = None if s2 is None else dv ** 2 * s2 + var_base
            var_mean = None if s2 is None else dv ** 2 * s2 / y.size + var_base
            rows.append(_row_result(y.size, val, var_one, var_mean, var_base))
        if any(r is not None and r["sd"] is None for r in rows):
            notes.append("Rows with one value have no SD of their own: only the baseline's "
                         "share of the error is given.")
        if baseline != "value" and any(
                r is not None and r["from_baseline"] is None for r in rows):
            notes.append("Rows whose baseline has one value: its uncertainty is unknown.")
        out.append({"rows": rows, "notes": notes})
    return {"method": METHOD, "warning": WARNING, "datasets": out}


# -------------------------------------------------------------- Normalize

def normalize(datasets, *, zero_mode="smallest", zero_value=None, hundred_mode="largest",
              hundred_value=None, as_percent=True, subcolumns="mean") -> dict:
    """Propagated uncertainty of Normalize with 0% and 100% from the row
    means (normalize.normalize_dataset, subcolumns 'mean'): one entry per
    data set, as remove_baseline. A reference taken from a row (first,
    last, smallest, largest) carries that row's SE; the sum carries the
    SEs of all rows; a typed reference is exact. A reference chosen as the
    smallest or largest row is a selected value, biased toward the
    extreme; a note says so."""
    scale = 100.0 if as_percent else 1.0
    out = []
    for ds in datasets:
        grid = np.array([normalize_mod._col_to_array(r) for r in ds.get("ys") or []], dtype=float)
        if subcolumns == "separate":
            out.append({"rows": None, "notes": [
                "Each subcolumn is normalized to its own single values: there is no "
                "replicate error to propagate."]})
            continue
        if grid.size == 0 or np.all(np.isnan(grid)):
            out.append({"rows": [], "notes": []})
            continue
        n = np.sum(~np.isnan(grid), axis=1)
        means = np.array([np.nan if c == 0 else np.nanmean(row) for row, c in zip(grid, n)])
        s2 = np.array([np.nan if c < 2 else np.nanvar(row, ddof=1) for row, c in zip(grid, n)])
        Z = normalize_mod._zero_value(means, zero_mode, zero_value)
        H = normalize_mod._hundred_value(means, hundred_mode, hundred_value)
        D = H - Z
        rz = normalize_mod._ref_row(means, zero_mode)
        rh = normalize_mod._ref_row(means, hundred_mode)
        ok = ~np.isnan(means)
        dZ = np.zeros(len(means))
        dH = np.zeros(len(means))
        if rz is not None:
            dZ[rz] = 1.0
        if hundred_mode == "sum":
            dH[ok] = 1.0
        elif rh is not None:
            dH[rh] = 1.0
        notes = []
        refs_needed = (dZ != 0) | (dH != 0)
        if np.any(refs_needed & ok & np.isnan(s2)):
            notes.append("A reference row has one value: its uncertainty is unknown, so "
                         "nothing is propagated.")
            out.append({"rows": [None if not c else _row_result(c, scale * (m - Z) / D, None, None, None)
                                 for c, m in zip(n, means)], "notes": notes})
            continue
        if zero_mode == "smallest" or hundred_mode == "largest":
            notes.append("The smallest or largest row mean was picked as a reference: a value "
                         "selected for being extreme tends to sit further out than its row's "
                         "true mean, which the propagated error does not include.")
        rows = []
        for r in range(len(means)):
            if not ok[r]:
                rows.append(None)
                continue
            m = means[r]
            val = scale * (m - Z) / D
            fZ = scale * (m - H) / D ** 2   # df/dZ
            fH = -scale * (m - Z) / D ** 2  # df/dH
            # gradient over each row mean from the references, per replicate (/ n_k)
            c = (fZ * dZ + fH * dH) / np.where(n > 0, n, 1)
            ref_part = np.nansum(np.where(ok, n * c ** 2 * s2, 0.0))
            own_d = scale / D
            if np.isnan(s2[r]):
                rows.append(_row_result(n[r], val, None, None, ref_part))
                continue
            rest = ref_part - n[r] * c[r] ** 2 * s2[r]
            var_mean = rest + n[r] * (c[r] + own_d / n[r]) ** 2 * s2[r]
            var_one = rest + (own_d + c[r]) ** 2 * s2[r] + (n[r] - 1) * c[r] ** 2 * s2[r]
            rows.append(_row_result(n[r], val, var_one, var_mean, ref_part))
        if any(r is not None and r["sd"] is None for r in rows):
            notes.append("Rows with one value have no SD of their own: only the references' "
                         "share of the error is given.")
        out.append({"rows": rows, "notes": notes})
    return {"method": METHOD, "warning": WARNING, "datasets": out}
