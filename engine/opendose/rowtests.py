"""Analyses that run once per row of a grouped table.

Multiple t tests (and nonparametric tests), one per row. Statistics
guide: "How to: Multiple t tests", "Options for multiple t tests" and
"Interpreting results: Multiple t tests".
- Two data set columns; one test per row, replicates in subcolumns. For
  paired tests subcolumn Yk of column A is matched with subcolumn Yk of
  column B.
- Tests offered (seven, by pairing x distribution):
  unpaired Gaussian: Welch's unequal-variance t ("welch"), an ordinary
  t test with one SD per row ("unpaired"), or one SD pooled across all
  rows and both columns ("pooled": "Prism therefore computes one pooled
  SD, as it would by doing two-way ANOVA. This gives you more degrees of
  freedom"); the pooled variance is the within-cell sum of squares of
  every non-empty cell over its degrees of freedom sum(n - 1), which for
  a complete table equals two-way ANOVA's MS residual;
  unpaired lognormal: the same three on log10 values, comparing
  geometric means ("lognormal_welch", "lognormal_unpaired",
  "lognormal_pooled"); paired Gaussian: paired t ("paired"); paired
  lognormal: ratio t test on log10(A/B) ("ratio_paired"); unpaired
  nonparametric: Mann-Whitney ("mann_whitney") or Kolmogorov-Smirnov
  ("kolmogorov_smirnov"); paired nonparametric: Wilcoxon matched-pairs
  signed rank ("wilcoxon").
- Deciding which rows to flag: FDR (recommended; Q with the BKY, BH or
  BY method, flag "Discovery?", q value per row) or statistical
  significance (Holm-Sidak, Sidak, Bonferroni or no correction, flag
  "Below threshold?", multiplicity adjusted P per row); see opendose.fdr.
- Rows where no test can be computed (too few values, zero SD) are
  reported but left out of the family ("What is n?").
- Options tab: the direction of the difference (A - B, or B - A with
  swap) and the -log10(P) and -log2(P) ("S value") transforms used by
  the volcano plot.

Row means and totals. Statistics guide: "Row means and totals".
- Totals, means (SD, SEM, %CV or CI, with N), medians (quartiles,
  min/max or percentiles) or geometric means (geometric SD or CI).
- For a row of several data sets with subcolumns, the summary is
  computed from each data set's own mean (median, total ...) on that row:
  {2, 3, 4}, {4, 6}, {7, 8, 9} -> data set means 3, 5, 8 -> Mean 5.333,
  SD 2.517, N 3 (the guide's example). Option scope="all_values" treats
  every replicate as independent (5.375, 2.504 in the example; the guide
  notes Prism does not do this by default), and scope="dataset" gives one
  summary per row within each data set.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

from . import fdr, ttests

UNPAIRED_TESTS = ("welch", "unpaired", "pooled", "lognormal_welch",
                  "lognormal_unpaired", "lognormal_pooled",
                  "mann_whitney", "kolmogorov_smirnov")
PAIRED_TESTS = ("paired", "ratio_paired", "wilcoxon")
TESTS = UNPAIRED_TESTS + PAIRED_TESTS


def _clean(values):
    return [float(v) for v in (values or [])
            if v is not None and not (isinstance(v, float) and math.isnan(v))]


def _paired(values_a, values_b):
    a, b = [], []
    for x, y in zip(values_a or [], values_b or []):
        if x is None or y is None:
            continue
        x, y = float(x), float(y)
        if math.isnan(x) or math.isnan(y):
            continue
        a.append(x)
        b.append(y)
    return a, b


def _log10_all(values, what="values"):
    if any(v <= 0 for v in values):
        raise ValueError(f"lognormal test needs positive {what}")
    return [math.log10(v) for v in values]


def _pooled_variance(rows_a, rows_b, log: bool):
    """Pooled within-cell variance over every non-empty cell of both
    columns and all rows (statistics guide: one pooled SD 'for both data
    set columns for all rows')."""
    ss, df = 0.0, 0
    for col in (rows_a, rows_b):
        for cell in col:
            vals = _clean(cell)
            if log:
                vals = [math.log10(v) for v in vals if v > 0]
            if len(vals) >= 2:
                arr = np.array(vals)
                ss += float(((arr - arr.mean()) ** 2).sum())
                df += len(vals) - 1
    if df < 1:
        raise ValueError("pooled SD needs at least one cell with 2 values")
    return ss / df, df


def _row_test(a_raw, b_raw, test, pooled):
    """One row's test. Returns the row dict (difference = A - B)."""
    if test in PAIRED_TESTS:
        a, b = _paired(a_raw, b_raw)
    else:
        a, b = _clean(a_raw), _clean(b_raw)
    out = {"n_a": len(a), "n_b": len(b)}

    if test in ("welch", "unpaired", "lognormal_welch", "lognormal_unpaired"):
        lognormal = test.startswith("lognormal")
        xa = np.array(_log10_all(a) if lognormal else a)
        xb = np.array(_log10_all(b) if lognormal else b)
        na, nb = xa.size, xb.size
        if na < 2 or nb < 2:
            raise ValueError("each group needs at least 2 values")
        va, vb = float(xa.var(ddof=1)), float(xb.var(ddof=1))
        # Same formulas as ttests.unpaired_t, without its F test (which
        # is undefined when one group's SD is zero).
        if test.endswith("welch"):
            se2 = va / na + vb / nb
            df = (se2 ** 2 / ((va / na) ** 2 / (na - 1)
                              + (vb / nb) ** 2 / (nb - 1))
                  if se2 > 0 else float("nan"))
        else:
            df = na + nb - 2
            se2 = ((na - 1) * va + (nb - 1) * vb) / df * (1 / na + 1 / nb)
        out.update(_t_fields(float(xa.mean()), float(xb.mean()),
                             math.sqrt(se2), df, lognormal))
    elif test in ("pooled", "lognormal_pooled"):
        lognormal = test == "lognormal_pooled"
        if len(a) < 1 or len(b) < 1:
            raise ValueError("each group needs at least 1 value")
        xa = _log10_all(a) if lognormal else a
        xb = _log10_all(b) if lognormal else b
        ms, df = pooled
        se = math.sqrt(ms * (1.0 / len(xa) + 1.0 / len(xb)))
        out.update(_t_fields(float(np.mean(xa)), float(np.mean(xb)), se, df,
                             lognormal))
    elif test in ("paired", "ratio_paired"):
        lognormal = test == "ratio_paired"
        xa = _log10_all(a) if lognormal else a
        xb = _log10_all(b) if lognormal else b
        r = ttests.paired_t(xa, xb)
        if not r["se_difference"] > 0:
            raise ValueError("the SD of the paired differences is zero")
        out.update(_t_fields(float(np.mean(xa)), float(np.mean(xb)),
                             r["se_difference"], r["df"], lognormal))
        out["n_pairs"] = r["n_pairs"]
    elif test == "mann_whitney":
        r = ttests.mann_whitney(a, b)
        out.update({"median_a": r["median_a"], "median_b": r["median_b"],
                    "difference": r["median_a"] - r["median_b"],
                    "hodges_lehmann": r["hodges_lehmann_difference"],
                    "statistic_name": "U", "statistic": r["U"],
                    "df": None, "p": r["p_two_tailed"]})
    elif test == "kolmogorov_smirnov":
        if len(a) < 1 or len(b) < 1:
            raise ValueError("each group needs at least 1 value")
        res = stats.ks_2samp(a, b, alternative="two-sided", method="auto")
        med_a, med_b = float(np.median(a)), float(np.median(b))
        out.update({"median_a": med_a, "median_b": med_b,
                    "difference": med_a - med_b,
                    "statistic_name": "D", "statistic": float(res.statistic),
                    "df": None, "p": float(res.pvalue)})
    elif test == "wilcoxon":
        r = ttests.wilcoxon_matched_pairs(a, b)
        out.update({"median_a": float(np.median(a)),
                    "median_b": float(np.median(b)),
                    "difference": r["median_difference"],
                    "statistic_name": "W", "statistic": r["W"],
                    "df": None, "p": r["p_two_tailed"], "n_pairs": len(a)})
    else:
        raise ValueError(f"unknown test: {test}")
    if not (out["p"] == out["p"]):
        raise ValueError("P value could not be computed")
    return out


def _t_fields(mean_a, mean_b, se, df, lognormal):
    if not se > 0:
        raise ValueError("the SD of the replicates is zero")
    diff = mean_a - mean_b
    t = diff / se
    p = 2.0 * float(stats.t.sf(abs(t), df))
    out = {"difference": diff, "se_difference": se,
           "statistic_name": "t", "statistic": abs(t), "df": df, "p": p}
    if lognormal:
        # t, df and P come from the log10 scale; report geometric means,
        # their ratio, and the difference between geometric means.
        out.update({"geometric_mean_a": 10.0 ** mean_a,
                    "geometric_mean_b": 10.0 ** mean_b,
                    "ratio": 10.0 ** diff, "log10_difference": diff,
                    "difference": 10.0 ** mean_a - 10.0 ** mean_b})
    else:
        out.update({"mean_a": mean_a, "mean_b": mean_b})
    return out


def multiple_t_tests(rows_a, rows_b, *, row_titles=None, names=None,
                     test: str = "welch", method: str = "bky",
                     alpha: float = 0.05, q: float = 0.05,
                     swap: bool = False) -> dict:
    """One two-group test per row, then a multiplicity decision across
    rows. rows_a[i] / rows_b[i] = replicate list of row i in data set
    column A / B (None = missing). method/alpha/q as opendose.fdr.adjust.
    """
    if test not in TESTS:
        raise ValueError(f"unknown test: {test}")
    method = fdr.canonical_method(method)
    n_rows = max(len(rows_a), len(rows_b))
    rows_a = list(rows_a) + [[]] * (n_rows - len(rows_a))
    rows_b = list(rows_b) + [[]] * (n_rows - len(rows_b))
    titles = list(row_titles or [])
    titles += [f"Row {i + 1}" for i in range(len(titles), n_rows)]
    names = list(names or ["A", "B"])

    pooled = None
    if test in ("pooled", "lognormal_pooled"):
        pooled = _pooled_variance(rows_a, rows_b, test == "lognormal_pooled")

    rows = []
    for i in range(n_rows):
        entry = {"row": titles[i], "index": i}
        try:
            entry.update(_row_test(rows_a[i], rows_b[i], test, pooled))
        except (ValueError, ZeroDivisionError, FloatingPointError) as exc:
            entry.update({"omitted": str(exc), "p": None})
        rows.append(entry)

    if swap:
        for e in rows:
            if e.get("p") is None:
                continue
            e["difference"] = -e["difference"]
            if "ratio" in e:
                e["ratio"] = 1.0 / e["ratio"]
                e["log10_difference"] = -e["log10_difference"]
            if "hodges_lehmann" in e:
                e["hodges_lehmann"] = -e["hodges_lehmann"]

    family = fdr.adjust([e.get("p") for e in rows], method,
                        alpha=alpha, q=q)
    for e, adj, flag in zip(rows, family["adjusted"], family["significant"]):
        e["p_adjusted"] = adj
        e["significant"] = flag
        p = e.get("p")
        e["neg_log10_p"] = (None if p is None
                            else -math.log10(p) if p > 0 else math.inf)
        e["s_value"] = (None if p is None
                        else -math.log2(p) if p > 0 else math.inf)

    flagged = sorted((e for e in rows if e.get("significant")),
                     key=lambda e: e["p"])
    return {
        "test": test, "names": names,
        "direction": f"{names[1]} - {names[0]}" if swap
                     else f"{names[0]} - {names[1]}",
        "method": method, "approach": family["approach"],
        "flag_label": ("Discovery?" if family["approach"] == "fdr"
                       else "Below threshold?"),
        "alpha": family["alpha"], "q": family["q"],
        "n_tests": family["n"], "n_omitted": family["n_omitted"],
        "n_flagged": family["discoveries"],
        "n_true_null_estimate": family["n_true_null_estimate"],
        "pooled": ({"variance": pooled[0], "sd": math.sqrt(pooled[0]),
                    "df": pooled[1],
                    "scale": "log10" if test == "lognormal_pooled" else "linear"}
                   if pooled else None),
        "rows": rows,
        "flagged_rows": [e["index"] for e in flagged],
    }


# --- Row means and totals -------------------------------------------------

def _summary_value(vals, calculate):
    arr = np.asarray(vals, dtype=float)
    if calculate == "total":
        return float(arr.sum())
    if calculate == "mean":
        return float(arr.mean())
    if calculate == "median":
        return float(np.median(arr))
    if calculate == "geometric_mean":
        if np.any(arr <= 0):
            return None
        return float(10.0 ** np.log10(arr).mean())
    raise ValueError(f"unknown calculation: {calculate}")


_ERRORS = {
    "total": ("none",),
    "mean": ("none", "sd", "sem", "cv", "ci"),
    "median": ("none", "quartiles", "minmax", "percentiles"),
    "geometric_mean": ("none", "geometric_sd", "ci"),
}


def _summarize(vals, calculate, error, ci_level, percentile):
    """Summary of one set of values: {"value", "n", error fields, "lower",
    "upper"} (lower/upper = the error bar ends, when defined)."""
    n = len(vals)
    out = {"n": n, "value": None}
    if n == 0:
        return out
    arr = np.asarray(vals, dtype=float)
    out["value"] = _summary_value(arr, calculate)
    if error == "none" or out["value"] is None:
        return out
    if calculate == "mean":
        if n < 2:
            return out
        sd = float(arr.std(ddof=1))
        sem = sd / math.sqrt(n)
        m = out["value"]
        if error == "sd":
            out.update({"sd": sd, "lower": m - sd, "upper": m + sd})
        elif error == "sem":
            out.update({"sem": sem, "lower": m - sem, "upper": m + sem})
        elif error == "cv":
            out["cv_percent"] = 100.0 * sd / abs(m) if m != 0 else None
            out["sd"] = sd
        elif error == "ci":
            h = float(stats.t.ppf((1 + ci_level) / 2, n - 1)) * sem
            out.update({"ci": [m - h, m + h], "lower": m - h, "upper": m + h})
    elif calculate == "median":
        if error == "quartiles":
            lo, hi = np.percentile(arr, [25, 75])
        elif error == "minmax":
            lo, hi = arr.min(), arr.max()
        else:
            pct = float(percentile)
            lo, hi = np.percentile(arr, [min(pct, 100 - pct),
                                         max(pct, 100 - pct)])
        out.update({"lower": float(lo), "upper": float(hi)})
    elif calculate == "geometric_mean":
        if n < 2:
            return out
        logs = np.log10(arr)
        lm, lsd = float(logs.mean()), float(logs.std(ddof=1))
        if error == "geometric_sd":
            gsd = 10.0 ** lsd
            out.update({"geometric_sd": gsd,
                        "lower": out["value"] / gsd,
                        "upper": out["value"] * gsd})
        else:
            h = float(stats.t.ppf((1 + ci_level) / 2, n - 1)) * lsd / math.sqrt(n)
            ci = [10.0 ** (lm - h), 10.0 ** (lm + h)]
            out.update({"ci": ci, "lower": ci[0], "upper": ci[1]})
    return out


def row_means(datasets, *, row_titles=None, names=None,
              calculate: str = "mean", error: str = "sd",
              scope: str = "row", ci_level: float = 0.95,
              percentile: float = 10.0) -> dict:
    """Row means / medians / geometric means / totals of a grouped table.

    datasets[d][i] = replicate list for data set d, row i. scope:
    "row" (each data set's own summary first, then across data sets; the
    guide's behaviour), "all_values" (all replicates of the row pooled)
    or "dataset" (one summary per row within each data set)."""
    if calculate not in _ERRORS:
        raise ValueError(f"unknown calculation: {calculate}")
    if error not in _ERRORS[calculate]:
        raise ValueError(f"error '{error}' is not offered for {calculate}")
    if scope not in ("row", "all_values", "dataset"):
        raise ValueError(f"unknown scope: {scope}")
    n_rows = max((len(ds) for ds in datasets), default=0)
    titles = list(row_titles or [])
    titles += [f"Row {i + 1}" for i in range(len(titles), n_rows)]
    names = list(names or [f"Data set {d + 1}" for d in range(len(datasets))])

    def cell(d, i):
        return _clean(datasets[d][i]) if i < len(datasets[d]) else []

    base = {"calculate": calculate, "error_type": error, "scope": scope,
            "row_titles": titles}
    if scope == "dataset":
        return {**base, "datasets": [
            {"name": names[d],
             "rows": [_summarize(cell(d, i), calculate, error, ci_level,
                                 percentile) for i in range(n_rows)]}
            for d in range(len(datasets))]}

    rows = []
    for i in range(n_rows):
        if scope == "all_values":
            vals = [v for d in range(len(datasets)) for v in cell(d, i)]
        else:
            vals = []
            for d in range(len(datasets)):
                c = cell(d, i)
                if c:
                    v = _summary_value(c, calculate)
                    if v is not None:
                        vals.append(v)
        s = _summarize(vals, calculate, error, ci_level, percentile)
        s["row"] = titles[i]
        rows.append(s)
    return {**base, "rows": rows}
