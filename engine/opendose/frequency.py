"""Frequency distributions (histograms), relative and cumulative, with an
optional Gaussian fit.

Statistics guide, "How to: Frequency distribution":
- "A point on the border goes with the bin holding the larger values": a
  bin covers [lower edge, upper edge).
- "All values too small to fit in the first bin are omitted from the
  analysis. You can also enter an upper limit to omit larger values."
- Cumulative: "each bin contains the number of values that fall within or
  below that bin. By definition, the last bin contains the total number
  of values." An exact cumulative distribution has no bins: "each value is
  plotted individually".
- Relative frequencies: the fraction or percent of the values in each bin
  (percent cumulative values are percentiles).
- Replicates: each value into its bin, or only the mean of each row's
  replicates.
GraphPad FAQ 1660, the automatic bin width: per data set, 1 + log2(n) bins
(Sturges) over its range; the mean of those widths, rounded down to a
"nice-looking value i.e. value whose last digit (in scientific notation)
ends with 0, 2, or 5"; with integer data, rounded down to an integer (at
least 1). Read here as two significant figures with the second rounded
down to 0, 2 or 5 (3.7 -> 3.5, 4.4 -> 4.2, 9.9 -> 9.5); the FAQ lists no
other values. The default center of the first bin is not documented:
here the multiple of the bin width that puts the smallest value in the
first bin.
Fits ("Fitting a Gaussian distribution to a frequency distribution";
curve-fitting guide, "Equation: Cumulative Gaussian distribution"): a
Gaussian (Amplitude, Mean, SD) to the counts at the bin centers, which
"depend to some degree on which value you picked for bin width, so we
recommend fitting the cumulative distribution"; the cumulative Gaussian
(Mean, SD) to the exact cumulative percent at each value.
"""

from __future__ import annotations

import math

import numpy as np

from . import nlfit
from . import equations  # noqa: F401  (registers the Gaussian models)


def nice_floor(w: float) -> float:
    """Round a positive width down to two significant figures whose second
    digit is 0, 2 or 5 (FAQ 1660)."""
    if not (w > 0 and math.isfinite(w)):
        raise ValueError("bin width must be positive")
    exp = math.floor(math.log10(w)) - 1
    scaled = w / 10.0 ** exp                       # 10 <= scaled < 100
    tens, units = divmod(int(math.floor(scaled + 1e-9)), 10)
    units = 5 if units >= 5 else 2 if units >= 2 else 0
    # rounded to the digits kept, so 0.95 is not 0.9500000000000001
    return round((tens * 10 + units) * 10.0 ** exp, max(0, -exp))


def auto_bin_width(columns) -> float:
    """GraphPad FAQ 1660: mean over data sets of range / (1 + log2 n),
    rounded down to a nice value; integers -> whole number (>= 1)."""
    widths = []
    every = []
    for c in columns:
        v = np.asarray(c, float)
        v = v[np.isfinite(v)]
        if v.size < 2:
            continue
        every.append(v)
        rng = float(v.max() - v.min())
        if rng > 0:
            widths.append(rng / (1.0 + math.log2(v.size)))
    if not widths:
        return 1.0
    w = nice_floor(float(np.mean(widths)))
    all_int = all(np.all(np.equal(np.mod(v, 1), 0)) for v in every)
    if all_int:
        w = max(math.floor(w), 1)
    return float(w)


def _clean(values):
    out = []
    for v in values:
        if v is None:
            continue
        f = float(v)
        if math.isfinite(f):
            out.append(f)
    return np.array(out, float)


def frequency_distribution(columns, names=None, *, bin_width=None,
                           first_center=None, upper_limit=None,
                           cumulative=False, relative=None, exact=False,
                           fit=None) -> dict:
    """columns: lists of values per data set (missing = None). relative:
    None (counts) | "fraction" | "percent". exact: exact cumulative
    distribution, no bins (cumulative implied). fit: None | "gaussian"
    (counts or relative, not cumulative) | "cumulative_gaussian" (exact
    cumulative percent)."""
    if relative not in (None, "fraction", "percent"):
        raise ValueError("relative must be None, 'fraction' or 'percent'")
    if fit not in (None, "gaussian", "cumulative_gaussian"):
        raise ValueError("fit must be None, 'gaussian' or "
                         "'cumulative_gaussian'")
    cols = [_clean(c) for c in columns]
    names = list(names) if names else [f"Data set {i + 1}"
                                       for i in range(len(cols))]
    if not any(c.size for c in cols):
        raise ValueError("no values")
    if upper_limit is not None:
        upper_limit = float(upper_limit)
    out = {"analysis": "frequency_distribution", "names": names,
           "relative": relative, "warnings": []}
    if exact:
        if fit == "gaussian":
            raise ValueError("fit a Gaussian to a binned distribution; an "
                             "exact cumulative distribution takes the "
                             "cumulative Gaussian")
        sets = []
        for name, c in zip(names, cols):
            keep = c if upper_limit is None else c[c <= upper_limit]
            xs = np.sort(keep)
            n = xs.size
            # ties: the cumulative count at a value counts every equal value
            last = np.searchsorted(xs, xs, side="right").astype(float)
            sets.append({"name": name, "n": int(n),
                         "n_omitted_above": int(c.size - keep.size),
                         "x": xs.tolist(),
                         "cumulative": last.tolist(),
                         "cumulative_percent": (100.0 * last / n).tolist()
                         if n else []})
        out.update({"exact": True, "cumulative": True, "datasets": sets})
        if fit == "cumulative_gaussian":
            out["fits"] = [_fit(s["x"], s["cumulative_percent"],
                                "cumulative_gaussian_percent")
                           for s in sets]
            # each cumulative point contains all the values below it, so the
            # points are not independent and least-squares standard errors
            # and confidence intervals come out far too narrow: dropped
            for f in out["fits"]:
                f.pop("ci_method", None)
                for p in (f.get("params") or {}).values():
                    for k in ("se", "ci95", "ci", "ci_low", "ci_high"):
                        p.pop(k, None)
            out["warnings"].append(
                "No confidence intervals for the cumulative fit: each "
                "cumulative point includes every smaller value, so the "
                "points are not independent and least-squares intervals "
                "would be too narrow.")
        return out
    if fit == "cumulative_gaussian":
        raise ValueError("the cumulative Gaussian is fitted to the exact "
                         "cumulative distribution (exact=True)")
    if fit == "gaussian" and cumulative:
        raise ValueError("fit the Gaussian to the (non-cumulative) "
                         "histogram")
    auto = bin_width is None
    w = auto_bin_width(cols) if auto else float(bin_width)
    if not w > 0:
        raise ValueError("bin width must be positive")
    lo_all = min(float(c.min()) for c in cols if c.size)
    hi_all = max(float(c.max()) for c in cols if c.size)
    if upper_limit is not None:
        hi_all = min(hi_all, upper_limit)
    if first_center is None:
        c0 = round(lo_all / w) * w
        if lo_all < c0 - w / 2:
            c0 -= w
    else:
        c0 = float(first_center)
    start = c0 - w / 2
    n_bins = max(int(math.floor((hi_all - start) / w)) + 1, 1)
    if n_bins > 100000:
        raise ValueError(f"{n_bins} bins: choose a larger bin width")
    # 12 significant figures: 24.2, not 24.200000000000003
    centers = np.array([float(f"{c:.12g}") for c in c0 + w * np.arange(n_bins)])
    sets = []
    for name, c in zip(names, cols):
        keep = c[c >= start]
        below = int(c.size - keep.size)
        above = 0
        if upper_limit is not None:
            above = int(np.sum(keep > upper_limit))
            keep = keep[keep <= upper_limit]
        idx = np.floor((keep - start) / w).astype(int)  # border -> higher bin
        counts = np.bincount(idx, minlength=n_bins)[:n_bins].astype(float)
        n_in = float(counts.sum())
        y = np.cumsum(counts) if cumulative else counts
        if relative == "fraction":
            y = y / n_in if n_in else y
        elif relative == "percent":
            y = 100.0 * y / n_in if n_in else y
        sets.append({"name": name, "n": int(c.size), "n_binned": int(n_in),
                     "n_omitted_below": below, "n_omitted_above": above,
                     "counts": counts.astype(int).tolist(),
                     "y": y.tolist()})
    out.update({
        "exact": False, "cumulative": bool(cumulative),
        "bin_width": w, "bin_width_auto": auto,
        "centers": centers.tolist(),
        "lower_edges": [float(f"{c - w / 2:.12g}") for c in centers],
        "upper_edges": [float(f"{c + w / 2:.12g}") for c in centers],
        "datasets": sets,
    })
    if any(s["n_omitted_below"] for s in sets):
        out["warnings"].append("Values below the first bin were left out "
                               "(see n_omitted_below).")
    if fit == "gaussian":
        out["fits"] = [_fit(out["centers"], s["y"], "gaussian")
                       for s in sets]
        out["warnings"].append("A Gaussian fitted to a histogram depends on "
                               "the bin width; the guide recommends fitting "
                               "the cumulative distribution.")
    return out


def _fit(x, y, model):
    if len(x) < 4:
        return {"model": model, "error": "too few points to fit"}
    try:
        f = nlfit.fit_model(list(map(float, x)), list(map(float, y)), model)
    except (ValueError, RuntimeError) as exc:
        return {"model": model, "error": str(exc)}
    f.pop("_cov", None)
    return f
