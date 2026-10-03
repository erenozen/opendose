"""Data manipulations: transform concentrations, remove baseline, transpose,
prune rows, fraction of total.

GraphPad Prism user guide references (publicly documented behaviour):

- "Transforming concentrations" (user-guide/transforming_concentrations.htm):
  optionally substitute a tiny concentration for X = 0 before taking logs
  (the guide's example: data from 1e-9 to 1e-3 M -> use 1e-11 for zero,
  i.e. two log units below the lowest nonzero value); otherwise log(0)
  is left blank. Multiply or divide every X by a constant to change units.
  Transform to base-10 or natural logarithms.
- "Remove baseline and column math" (user-guide/using_removebaseline.htm):
  the baseline is (a) the value or mean of replicates in the first row,
  the last row, or the mean of a number of first and/or last rows of the
  same column, or (b) the value (or mean of replicates) in the same row of
  a baseline column -- one column for all others, or every other column
  baseline vs. total -- optionally replaced by a linear regression of the
  baseline values against X (intercept not forced through the origin);
  calculations: subtract, divide, fractional or percentage difference,
  and add/multiply two columns.
- "Transpose" (user-guide/using_transpose.htm): each row of Y values
  becomes one data set (first row -> first data set); titles chosen in the
  dialog.
- "Prune" (user-guide/using_pruning_rows.htm): produce a smaller table by
  keeping only a range of X values and/or decimating rows (keep one row,
  skip K) or averaging groups of rows.
- "Fraction of total" (user-guide/fractions_of_total.htm): divide each
  value by its column total, row total, or the grand total (or show all
  three); only for tables without subcolumns; optional confidence
  intervals of the proportions for count data, by Clopper-Pearson, Wilson,
  or the Wilson/Brown hybrid (recommended) -- statistics guide "Three
  methods for computing the CI of a proportion"
  (statistics/stat_three_methods_for_computing_th.htm). CIs are not
  offered for the 'all three totals' layout.

Every function takes the API table shape (x column + datasets with
replicate rows, None = blank) and returns plain lists.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

# ------------------------------------------------------------ helpers


def _f(v):
    return math.nan if v is None else float(v)


def _grid(rows, n_rows=None) -> np.ndarray:
    rows = rows or []
    width = max((len(r) for r in rows), default=1) or 1
    n = len(rows) if n_rows is None else n_rows
    g = np.full((n, width), np.nan)
    for i, r in enumerate(rows[:n]):
        for j, v in enumerate(r):
            if v is not None:
                g[i, j] = float(v)
    return g


def _out(v):
    if v is None:
        return None
    v = float(v)
    return v if math.isfinite(v) else None


def _rows_out(g: np.ndarray) -> list:
    return [[_out(v) for v in row] for row in g]


def _row_means(g: np.ndarray) -> np.ndarray:
    cnt = np.sum(~np.isnan(g), axis=1)
    with np.errstate(all="ignore"):
        return np.where(cnt > 0, np.nansum(g, axis=1) / np.maximum(cnt, 1),
                        np.nan)


def _nanmean(a) -> float:
    a = np.asarray(a, dtype=float)
    a = a[~np.isnan(a)]
    return float(a.mean()) if a.size else math.nan


def _fmt_title(v) -> str:
    if v is None:
        return ""
    v = float(v)
    return str(int(v)) if v == int(v) and abs(v) < 1e15 else f"{v:.6g}"


# ------------------------------------------------ transform concentrations


def transform_concentrations(x, *, zero: str = "blank", zero_value=None,
                             units: str | None = None, factor=None,
                             log: str | None = "log10") -> dict:
    """X transforms for concentrations, applied in the dialog's order:
    substitute for X = 0, change units, then take logarithms.

    zero: 'blank'  - leave 0 alone (its log becomes blank / skipped)
          'value'  - replace 0 by zero_value (in the ORIGINAL units)
          'auto'   - replace 0 by (smallest positive X)/100, two log units
                     below the lowest concentration (the guide's example)
    units: None | 'multiply' | 'divide' by factor
    log: None | 'log10' | 'ln'
    Returns {"x", "zero_replacement"}; non-positive X give blank logs.
    """
    vals = [_f(v) for v in x]
    replacement = None
    if zero == "value":
        if zero_value is None:
            raise ValueError("zero='value' needs zero_value")
        replacement = float(zero_value)
    elif zero == "auto":
        pos = [v for v in vals if not math.isnan(v) and v > 0]
        if pos:
            replacement = min(pos) / 100.0
    elif zero != "blank":
        raise ValueError(f"unknown zero handling: {zero}")
    if replacement is not None:
        vals = [replacement if v == 0 else v for v in vals]
    if units:
        if factor is None or float(factor) == 0:
            raise ValueError("changing units needs a nonzero factor")
        k = float(factor)
        if units == "multiply":
            vals = [v * k for v in vals]
        elif units == "divide":
            vals = [v / k for v in vals]
        else:
            raise ValueError(f"unknown units operation: {units}")
    if log:
        fn = {"log10": math.log10, "ln": math.log}.get(log)
        if fn is None:
            raise ValueError(f"unknown log base: {log}")
        vals = [fn(v) if v > 0 else math.nan for v in vals]
    return {"x": [_out(v) for v in vals], "zero_replacement": replacement}


# ------------------------------------------------------- remove baseline

_OPERATIONS = {
    "subtract": lambda v, b: v - b,
    "divide": lambda v, b: v / b,
    "fraction_difference": lambda v, b: (v - b) / b,
    "percent_difference": lambda v, b: 100.0 * (v - b) / b,
    "percent_of_baseline": lambda v, b: 100.0 * v / b,
    "add": lambda v, b: v + b,
    "multiply": lambda v, b: v * b,
}
OPERATIONS = sorted(_OPERATIONS)


def _row_baseline(g, mode, k, replicates):
    """Baseline from rows of the same column -> broadcastable array."""
    n = g.shape[0]
    k = max(1, int(k))
    if mode == "first_row":
        idx = [0]
    elif mode == "last_row":
        idx = [n - 1]
    elif mode == "first_rows":
        idx = list(range(min(k, n)))
    elif mode == "last_rows":
        idx = list(range(max(0, n - k), n))
    elif mode == "first_last_rows":
        idx = sorted(set(range(min(k, n))) | set(range(max(0, n - k), n)))
    else:
        raise ValueError(f"unknown baseline: {mode}")
    sub = g[idx, :]
    if replicates == "each":
        return np.array([_nanmean(sub[:, j]) for j in range(g.shape[1])])[None, :]
    return np.asarray(_nanmean(sub))


def _linear_baseline(x, base_grid):
    xs = np.repeat(x[:, None], base_grid.shape[1], axis=1).ravel()
    ys = base_grid.ravel()
    ok = ~np.isnan(xs) & ~np.isnan(ys)
    if ok.sum() < 2 or np.ptp(xs[ok]) == 0:
        raise ValueError("linear baseline needs baseline values at two or "
                         "more distinct X values")
    slope, intercept = np.polyfit(xs[ok], ys[ok], 1)
    return (intercept + slope * x)[:, None], {"slope": float(slope),
                                              "intercept": float(intercept)}


def remove_baseline(x, datasets, *, baseline: str = "column",
                    baseline_dataset: int = 0, k: int = 1, value=None,
                    operation: str = "subtract", replicates: str = "mean",
                    pairs: str = "total_first",
                    linear_baseline: bool = False) -> dict:
    """Remove a baseline from every value.

    baseline:
      'column'         - data set `baseline_dataset` holds the baseline for
                         every other data set, row by row (per-row baseline)
      'alternate'      - every other data set: pairs (A,B), (C,D), ...;
                         pairs='total_first' means A=total, B=baseline,
                         'baseline_first' means A=baseline, B=total
      'first_row' | 'last_row' | 'first_rows' | 'last_rows' |
      'first_last_rows' - rows of the same column (k = number of rows)
      'value'          - a constant you enter
    replicates: 'mean' - baseline is the mean of the baseline replicates
                'each' - replicate j uses baseline subcolumn j
    linear_baseline: (column / alternate only) replace the baseline by its
      linear regression on X, filling rows with no baseline measured.
    operation: subtract | divide | fraction_difference |
      percent_difference | percent_of_baseline | add | multiply.
    Baseline data sets are dropped from the output.
    """
    if operation not in _OPERATIONS:
        raise ValueError(f"unknown operation: {operation} "
                         f"(choose from {', '.join(OPERATIONS)})")
    op = _OPERATIONS[operation]
    x_arr = np.array([_f(v) for v in x])
    n = len(x_arr)
    grids = [_grid(ds.get("ys"), n) for ds in datasets]
    names = [ds.get("name", "") for ds in datasets]
    jobs = []  # (output index source, total grid, baseline grid or None)
    if baseline == "column":
        if not 0 <= baseline_dataset < len(grids):
            raise ValueError("baseline_dataset is out of range")
        base = grids[baseline_dataset]
        jobs = [(i, grids[i], base) for i in range(len(grids))
                if i != baseline_dataset]
    elif baseline == "alternate":
        if len(grids) % 2:
            raise ValueError("'every other data set' needs an even number "
                             "of data sets")
        for i in range(0, len(grids), 2):
            t, b = (i, i + 1) if pairs == "total_first" else (i + 1, i)
            jobs.append((t, grids[t], grids[b]))
    elif baseline in ("first_row", "last_row", "first_rows", "last_rows",
                      "first_last_rows", "value"):
        jobs = [(i, g, None) for i, g in enumerate(grids)]
    else:
        raise ValueError(f"unknown baseline: {baseline}")

    out, fits = [], []
    with np.errstate(all="ignore"):
        for idx, g, base in jobs:
            fit = None
            if base is not None:
                if linear_baseline:
                    b, fit = _linear_baseline(x_arr, base)
                elif replicates == "each":
                    b = np.full_like(g, np.nan)
                    w = min(g.shape[1], base.shape[1])
                    b[:, :w] = base[:, :w]
                else:
                    b = _row_means(base)[:, None]
            elif baseline == "value":
                if value is None:
                    raise ValueError("baseline='value' needs value")
                b = np.asarray(float(value))
            else:
                b = _row_baseline(g, baseline, k, replicates)
            res = op(g, b)
            res = np.where(np.isfinite(res), res, np.nan)
            out.append({"name": names[idx], "ys": _rows_out(res)})
            fits.append(fit)
    result = {"x": [_out(v) for v in x_arr], "datasets": out}
    if linear_baseline and baseline in ("column", "alternate"):
        result["baseline_lines"] = fits
    return result


# --------------------------------------------------------------- transpose


def transpose(x, datasets, *, row_titles=None,
              column_titles: str = "row_titles",
              replicates: str = "keep") -> dict:
    """Each row of Y values becomes one data set (row 1 -> data set 1).

    New rows are the original data sets (their names become row titles;
    X becomes 1, 2, 3, ...). column_titles chooses the new data-set
    names: 'row_titles' (fall back to X when a row has no title), 'x'
    (the X value), or 'numbers' ('Row 1', ...).
    replicates: 'keep' - each cell keeps its replicate values
                'mean' - each cell becomes the mean of its replicates.
    """
    n = len(x)
    grids = [_grid(ds.get("ys"), n) for ds in datasets]
    titles = []
    for r in range(n):
        t = None
        if column_titles == "row_titles" and row_titles and r < len(row_titles):
            t = row_titles[r] or None
        if t is None and column_titles in ("row_titles", "x") \
                and x[r] is not None:
            t = _fmt_title(x[r])
        titles.append(t if t is not None else f"Row {r + 1}")
    new = []
    for r in range(n):
        ys = []
        for g in grids:
            cell = g[r]
            if replicates == "mean":
                ys.append([_out(_nanmean(cell))])
            else:
                ys.append([_out(v) for v in cell])
        new.append({"name": titles[r], "ys": ys})
    return {"x": [float(i + 1) for i in range(len(datasets))],
            "row_titles": [ds.get("name", "") for ds in datasets],
            "datasets": new}


# -------------------------------------------------------------- prune rows


def prune_rows(x, datasets, *, x_min=None, x_max=None, mode: str = "none",
               k: int = 2, start: int = 1, average: str = "keep_replicates",
               partial: str = "keep", row_titles=None) -> dict:
    """Make a smaller table.

    1. Range: keep only rows with x_min <= X <= x_max (either bound may be
       None; rows with blank X are dropped when a bound is set).
    2. mode 'keep_every': keep one row, skip k-1 (rows start, start+k, ...;
       start is 1-based).  mode 'average': replace each group of k
       consecutive rows by one row whose X is the mean X and whose Y is
       the mean of each replicate subcolumn (average='keep_replicates') or
       the mean of every value in the group (average='mean').  An
       incomplete last group is averaged too unless partial='drop'.
    Returns {"x", "datasets", "kept_rows" (0-based source rows per output
    row), "row_titles"?}.
    """
    k = max(1, int(k))
    n = len(x)
    x_arr = np.array([_f(v) for v in x])
    grids = [_grid(ds.get("ys"), n) for ds in datasets]
    rows = list(range(n))
    if x_min is not None or x_max is not None:
        lo = -math.inf if x_min is None else float(x_min)
        hi = math.inf if x_max is None else float(x_max)
        rows = [r for r in rows if not math.isnan(x_arr[r])
                and lo <= x_arr[r] <= hi]
    if mode == "none":
        groups = [[r] for r in rows]
    elif mode == "keep_every":
        s = max(1, int(start)) - 1
        groups = [[r] for r in rows[s::k]]
    elif mode == "average":
        groups = [rows[i:i + k] for i in range(0, len(rows), k)]
        if partial == "drop":
            groups = [g for g in groups if len(g) == k]
    else:
        raise ValueError(f"unknown prune mode: {mode}")

    new_x = []
    out = [[] for _ in grids]
    with np.errstate(all="ignore"):
        for grp in groups:
            new_x.append(_out(_nanmean(x_arr[grp])) if mode == "average"
                         else _out(x_arr[grp[0]]))
            for d, g in enumerate(grids):
                block = g[grp, :]
                if mode != "average":
                    out[d].append([_out(v) for v in datasets[d]["ys"][grp[0]]]
                                  if grp[0] < len(datasets[d].get("ys") or [])
                                  else [])
                elif average == "mean":
                    out[d].append([_out(_nanmean(block))])
                else:
                    out[d].append([_out(_nanmean(block[:, j]))
                                   for j in range(block.shape[1])])
    result = {"x": new_x,
              "datasets": [{"name": ds.get("name", ""), "ys": ys}
                           for ds, ys in zip(datasets, out)],
              "kept_rows": groups}
    if row_titles is not None and mode != "average":
        result["row_titles"] = [row_titles[g[0]] if g[0] < len(row_titles)
                                else None for g in groups]
    return result


# -------------------------------------------------------- fraction of total


def proportion_ci(k: int, n: int, ci_level: float = 0.95,
                  method: str = "wilson_brown") -> list:
    """Confidence interval of a proportion k/n.

    method: 'clopper_pearson' (exact), 'wilson' (no continuity
    correction), or 'wilson_brown' (Wilson, but the lower limit uses
    Brown's Poisson approximation when k = 1 or 2, or k = 3 and n > 50;
    the upper limit symmetrically when k = n-1, n-2, or n-3 with n > 50).
    """
    k, n = int(round(k)), int(round(n))
    if n <= 0 or k < 0 or k > n:
        return [None, None]
    alpha = 1.0 - ci_level
    if method == "clopper_pearson":
        lo = 0.0 if k == 0 else float(stats.beta.ppf(alpha / 2, k, n - k + 1))
        hi = 1.0 if k == n else float(stats.beta.ppf(1 - alpha / 2, k + 1,
                                                     n - k))
        return [lo, hi]
    z = float(stats.norm.ppf(1 - alpha / 2))
    p = k / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    lo, hi = max(0.0, center - half), min(1.0, center + half)
    if method == "wilson":
        return [lo, hi]
    if method != "wilson_brown":
        raise ValueError(f"unknown CI method: {method}")
    if k == 0:
        lo = 0.0
    if k == n:
        hi = 1.0

    def poisson_lower(x):
        # Brown, Cai & DasGupta (2001): lambda with P(Poisson >= x) = alpha
        return 0.5 * float(stats.chi2.ppf(alpha, 2 * x)) / n

    if k in (1, 2) or (k == 3 and n > 50):
        lo = poisson_lower(k)
    m = n - k
    if m in (1, 2) or (m == 3 and n > 50):
        hi = 1.0 - poisson_lower(m)
    return [lo, hi]


def fraction_of_total(datasets, *, divide_by: str = "column",
                      as_percent: bool = False, ci: bool = False,
                      ci_method: str = "wilson_brown",
                      ci_level: float = 0.95) -> dict:
    """Divide each value by its column total, row total, or grand total.

    datasets: [{"name", "ys": [[v], [v], ...]}] -- one value per row (the
    analysis is only for tables without subcolumns). Blank cells stay
    blank and do not count toward totals.
    divide_by: 'column' | 'row' | 'grand' | 'all' ('all' returns the three
    layouts together and, as documented, no confidence intervals).
    ci: confidence intervals of each proportion (only meaningful for
    counts; values are rounded to integers for the CI).
    """
    if divide_by not in ("column", "row", "grand", "all"):
        raise ValueError(f"unknown divide_by: {divide_by}")
    for ds in datasets:
        if any(len(r) > 1 for r in ds.get("ys") or []):
            raise ValueError("fraction of total works only on tables "
                             "without subcolumns")
    n_rows = max((len(ds.get("ys") or []) for ds in datasets), default=0)
    m = np.full((n_rows, len(datasets)), np.nan)
    for j, ds in enumerate(datasets):
        for i, r in enumerate(ds.get("ys") or []):
            if r and r[0] is not None:
                m[i, j] = float(r[0])
    scale = 100.0 if as_percent else 1.0
    col_tot = np.nansum(m, axis=0)
    row_tot = np.nansum(m, axis=1)
    grand = float(np.nansum(m))
    names = [ds.get("name", "") for ds in datasets]

    def layout(kind):
        denom = {"column": col_tot[None, :], "row": row_tot[:, None],
                 "grand": np.asarray(grand)}[kind]
        with np.errstate(all="ignore"):
            frac = m / denom
        frac = np.where(np.isfinite(frac), frac, np.nan)
        entry = {"datasets": [{"name": names[j],
                               "ys": [[_out(frac[i, j] * scale)]
                                      for i in range(n_rows)]}
                              for j in range(len(names))]}
        if ci and divide_by != "all":
            dn = np.broadcast_to(denom, m.shape)
            lows, highs = [], []
            for j in range(len(names)):
                lo_col, hi_col = [], []
                for i in range(n_rows):
                    if np.isnan(m[i, j]):
                        lo_col.append(None)
                        hi_col.append(None)
                        continue
                    lo, hi = proportion_ci(m[i, j], dn[i, j], ci_level,
                                           ci_method)
                    lo_col.append(None if lo is None else lo * scale)
                    hi_col.append(None if hi is None else hi * scale)
                lows.append(lo_col)
                highs.append(hi_col)
            for j, ds in enumerate(entry["datasets"]):
                ds["ci_lower"] = lows[j]
                ds["ci_upper"] = highs[j]
        return entry

    result = {"divide_by": divide_by, "as_percent": as_percent,
              "column_totals": [_out(v) for v in col_tot],
              "row_totals": [_out(v) for v in row_tot],
              "grand_total": _out(grand)}
    if divide_by == "all":
        result["layouts"] = {k: layout(k)["datasets"]
                             for k in ("column", "row", "grand")}
    else:
        result.update(layout(divide_by))
        if ci:
            result["ci_method"] = ci_method
            result["ci_level"] = ci_level
    return result
