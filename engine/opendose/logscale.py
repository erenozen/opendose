"""Analysis on the log scale with back-transformed ratios, and a check of
whether the SD grows with the mean.

Method sources:

- GraphPad statistics guide, "Advice: When to transform data to
  logarithms" / "The lognormal distribution": when values are lognormal
  (the SD rises with the mean; ratios, concentrations, fold changes,
  titres), run the t test or ANOVA on the logarithms; the antilog of a
  mean of logs is the geometric mean, and the antilog of a difference
  between mean logs is the ratio of geometric means, with the antilogs
  of its confidence limits as the CI of that ratio. The P value is the
  P of the test on the logs. (The same transform underlies the guide's
  ratio paired t test, opendose.ttests.ratio_paired_t.)
- Bland & Altman (1996), "Transforming data", BMJ 312:770, and "The use
  of transformation when comparing two means", BMJ 312:1153: the log
  transform is indicated when the SD is proportional to the mean (plot
  SD against mean); a difference of means of logs back-transforms to a
  ratio of geometric means with its CI, while the SE of a difference has
  no back-transform.
- Keene (1995), "The log transformation is special", Stat Med 14:811:
  logs are the natural scale for positive, right-skewed data whose
  effects multiply.

Values <= 0 have no logarithm: they are left out of the log-scale
analysis and counted in a warning (never silently).

scale_check: per group mean, SD and CV; the Pearson and Spearman
correlation of SD with mean across groups; the ratio of the largest to
the smallest SD. suggest_log is true when every value is positive and
either (3 or more groups) the Pearson correlation of SD with mean exceeds
0.7, or (2 groups) the larger SD is more than 3 times the smaller and
belongs to the group with the larger mean. These are screening rules
(the guide and Bland & Altman ask the analyst to look at SD vs mean);
the thresholds are reported with the result.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

BASES = {"log10": 10.0, "ln": math.e, "log2": 2.0}

SOURCE = ("GraphPad statistics guide, 'Advice: When to transform data to "
          "logarithms' and 'The lognormal distribution'; Bland & Altman "
          "1996, BMJ 312:770 ('Transforming data') and BMJ 312:1153")


def _base(base: str) -> float:
    if base not in BASES:
        raise ValueError(f"unknown log base: {base!r} (use 'log10', 'ln' "
                         "or 'log2')")
    return BASES[base]


def _log(values, base: str) -> np.ndarray:
    arr = np.asarray(values, dtype=float)
    if base == "log10":
        return np.log10(arr)
    if base == "log2":
        return np.log2(arr)
    return np.log(arr)


def antilog(v, base: str = "log10"):
    """base ** v (None passes through; overflow gives inf)."""
    if v is None:
        return None
    try:
        return float(_base(base) ** float(v))
    except OverflowError:
        return math.inf


def antilog_ci(ci, base: str = "log10"):
    if ci is None:
        return None
    return [antilog(ci[0], base), antilog(ci[1], base)]


def _dropped_text(name, n):
    return (f"{name or 'Data set'}: {n} value{'s' if n != 1 else ''} <= 0 "
            "left out of the log-scale analysis (no logarithm)")


def log_groups(cols, names, base: str = "log10"):
    """Log every column; values <= 0 are left out. Returns (logged
    columns as lists, positive raw columns, {name: n dropped}, warnings)."""
    _base(base)
    logged, raw_pos, dropped, warnings = [], [], {}, []
    for i, (col, name) in enumerate(zip(cols, names)):
        name = name or f"Data set {i + 1}"
        if name in dropped:  # duplicate titles: keep every count
            name = f"{name} ({i + 1})"
        arr = np.asarray([float(v) for v in col], dtype=float)
        keep = arr > 0
        n_drop = int((~keep).sum())
        dropped[name] = n_drop
        if n_drop:
            warnings.append(_dropped_text(name, n_drop))
        logged.append([float(v) for v in _log(arr[keep], base)])
        raw_pos.append([float(v) for v in arr[keep]])
    return logged, raw_pos, dropped, warnings


def log_pairs(va, vb, names, base: str = "log10"):
    """Paired values: pairs where either value is <= 0 are left out."""
    _base(base)
    a = np.asarray(va, dtype=float)
    b = np.asarray(vb, dtype=float)
    keep = (a > 0) & (b > 0)
    n_drop = int((~keep).sum())
    warnings = []
    if n_drop:
        warnings.append(f"{n_drop} pair{'s' if n_drop != 1 else ''} with a "
                        "value <= 0 left out of the log-scale analysis (no "
                        "logarithm)")
    return ([float(v) for v in _log(a[keep], base)],
            [float(v) for v in _log(b[keep], base)],
            [float(v) for v in a[keep]], [float(v) for v in b[keep]],
            n_drop, warnings)


def geometric_means(logged_cols, names, base: str = "log10",
                    ci_level: float = 0.95) -> list:
    """Per group: n, mean and SD of the logs, geometric mean (antilog of
    the mean log), its CI (antilog of mean log +/- t * SD / sqrt(n)) and
    the geometric SD factor (antilog of the SD of the logs)."""
    out = []
    for col, name in zip(logged_cols, names):
        x = np.asarray(col, dtype=float)
        n = int(x.size)
        entry = {"name": name, "n": n, "mean_log": None, "sd_log": None,
                 "geometric_mean": None, "ci": None,
                 "geometric_sd_factor": None}
        if n >= 1:
            m = float(x.mean())
            entry["mean_log"] = m
            entry["geometric_mean"] = antilog(m, base)
        if n >= 2:
            sd = float(x.std(ddof=1))
            half = float(stats.t.ppf((1 + ci_level) / 2, n - 1)) * sd \
                / math.sqrt(n)
            entry["sd_log"] = sd
            entry["ci"] = antilog_ci([m - half, m + half], base)
            entry["geometric_sd_factor"] = antilog(sd, base)
        out.append(entry)
    return out


def ratio_entry(difference, ci, base: str = "log10") -> dict:
    """Back-transform a difference of mean logs (A - B) and its CI to the
    ratio of geometric means A / B and its CI."""
    return {"ratio": antilog(difference, base), "ratio_ci": antilog_ci(ci,
                                                                       base)}


def add_ratios_to_comparisons(block: dict, base: str = "log10") -> dict:
    """Every comparison with a difference (A - B, on the log scale) gets
    ratio = antilog(difference) = geometric mean A / geometric mean B and
    ratio_ci (None where the method gives no CI, e.g. Holm)."""
    for c in (block or {}).get("comparisons", []):
        if c.get("difference") is None:
            continue
        ci = c.get("ci", c.get("ci95"))
        c.update(ratio_entry(c["difference"], ci, base))
        c["ratio_label"] = ("geometric mean ratio ("
                            + c.get("pair", "A vs. B").replace(" vs. ", " / ")
                            + ")")
    return block


def log_scale_block(base: str, dropped: dict, n_pairs_dropped=None) -> dict:
    out = {"base": base, "values_dropped": dropped,
           "n_dropped": (int(n_pairs_dropped) if n_pairs_dropped is not None
                         else int(sum(dropped.values()))),
           "note": (f"Analysed {base} of the values: differences, SEs and "
                    "CIs of differences are on that scale; ratios and "
                    "geometric means are their antilogs; P is the P of "
                    "the test on the logs."),
           "source": SOURCE}
    if n_pairs_dropped is not None:
        out["pairs_dropped"] = int(n_pairs_dropped)
    return out


# --------------------------------------------------------------- scale check

def scale_check(cols, names=None, *, r_threshold: float = 0.7,
                sd_ratio_threshold: float = 3.0) -> dict:
    """Does the SD grow with the mean? See the module docstring."""
    names = names or [f"Group {i + 1}" for i in range(len(cols))]
    groups = []
    all_positive = True
    for col, name in zip(cols, names):
        x = np.asarray([float(v) for v in col if v is not None], dtype=float)
        x = x[np.isfinite(x)]
        if x.size and np.any(x <= 0):
            all_positive = False
        entry = {"name": name, "n": int(x.size),
                 "mean": float(x.mean()) if x.size else None,
                 "sd": float(x.std(ddof=1)) if x.size >= 2 else None}
        groups.append(entry)
    return scale_check_from_stats(groups, all_positive,
                                  r_threshold=r_threshold,
                                  sd_ratio_threshold=sd_ratio_threshold)


def scale_check_from_stats(groups, all_positive: bool, *,
                           r_threshold: float = 0.7,
                           sd_ratio_threshold: float = 3.0) -> dict:
    """scale_check from per-group {name, n, mean, sd} (sd None when n <
    2); all_positive: whether every value is > 0 (for data entered as
    mean, SD and n, the caller can only check the means)."""
    groups = [dict(g) for g in groups]
    for entry in groups:
        entry["cv"] = (entry["sd"] / entry["mean"]
                       if entry["sd"] is not None and entry["mean"]
                       else None)
    usable = [g for g in groups if g["sd"] is not None]
    means = np.array([g["mean"] for g in usable], dtype=float)
    sds = np.array([g["sd"] for g in usable], dtype=float)
    pearson = spearman = None
    if len(usable) >= 3 and np.ptp(means) > 0 and np.ptp(sds) > 0:
        pearson = float(np.corrcoef(means, sds)[0, 1])
        spearman = float(stats.spearmanr(means, sds).statistic)
    sd_ratio = None
    if len(usable) >= 2 and sds.min() > 0:
        sd_ratio = float(sds.max() / sds.min())
    suggest = False
    reason = None
    if len(usable) < 2:
        reason = "needs at least 2 groups with 2 or more values"
    elif not all_positive:
        reason = ("some values are zero or negative, so logarithms are not "
                  "defined for every value")
    elif len(usable) >= 3:
        if pearson is not None and pearson > r_threshold:
            suggest = True
            reason = (f"the SD rises with the mean across {len(usable)} "
                      f"groups (Pearson r = {pearson:.2f} > {r_threshold})")
        else:
            reason = ("the SD does not rise consistently with the mean "
                      f"(Pearson r = {pearson:.2f})" if pearson is not None
                      else "the SDs or means do not vary between groups")
    else:
        hi_sd = int(np.argmax(sds))
        hi_mean = int(np.argmax(means))
        if sd_ratio is not None and sd_ratio > sd_ratio_threshold \
                and hi_sd == hi_mean:
            suggest = True
            reason = (f"the larger mean has a {sd_ratio:.1f}-fold larger SD "
                      f"(> {sd_ratio_threshold:g})")
        else:
            reason = ("the SDs do not differ more than "
                      f"{sd_ratio_threshold:g}-fold in the direction of the "
                      "means")
    text = None
    if suggest:
        text = ("SD grows with the mean: consider analysing the logarithms "
                "(ratios of geometric means with CIs).")
    return {"groups": groups, "pearson_r_sd_mean": pearson,
            "spearman_rho_sd_mean": spearman, "sd_ratio_max_min": sd_ratio,
            "all_positive": all_positive, "suggest_log": suggest,
            "reason": reason, "text": text,
            "rule": {"r_threshold": r_threshold, "min_groups_for_r": 3,
                     "sd_ratio_threshold_two_groups": sd_ratio_threshold},
            "source": ("Bland & Altman 1996, BMJ 312:770 ('Transforming "
                       "data'); GraphPad statistics guide, 'Advice: When to "
                       "transform data to logarithms'")}
