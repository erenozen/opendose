"""Area under the curve (Prism: XY analyses -> Area under the curve).

Prism statistics guide, "Area under the curve": the area is the
trapezoid rule over the XY points (X need not be equally spaced),
Delta X * ((Y1 + Y2) / 2 - baseline) per pair of adjacent points, with
no smoothing and no extrapolation beyond the first or last X. Where the
curve crosses the horizontal baseline the crossing X is found by linear
interpolation, which splits the curve into regions; each region's peak
is its highest (or, for regions below the baseline, lowest) data point.
Peaks whose height is less than a set percentage (default 10%) of the
distance from the minimum to the maximum Y are ignored, and so are peaks
defined by too few points. The guide's three totals:
- total area: every region, above and below the baseline, counted or
  not (here the sum of their absolute areas);
- total peak area: the regions counted as peaks;
- net area: area of counted peaks above the baseline minus those below
  (when peaks below the baseline are considered).
The signed trapezoid integral over the whole X range is also returned.

With replicate Y values (or mean, SD and n), the SE of the AUC follows
the method the guide cites (Gagnon & Peterson 1998; Bailer 1988): AUC =
sum c_i * mean_i with trapezoid weights c_i, so Var(AUC) = sum c_i^2 *
SD_i^2 / n_i, and the CI is AUC +/- z * SE (z, as the guide states). A
baseline taken from the data (first or last value) is folded into the
weights. Two AUCs are compared by Bailer's z test and by the guide's
recipe (an unpaired t test from AUC, SE and df = points - X values);
three or more by Bailer's chi-square and the matching one-way ANOVA.
When each subcolumn is a separate experiment the guide's advice applies
instead: one AUC per subcolumn, then a t test or ANOVA on those values.

subject_auc computes one AUC per subject from long-format data (for
example tumour volume by animal and day) and returns them as a column
table for the usual group comparison.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

_BASELINES = ("zero", "value", "first", "last", "mean_first_last")


def _points(x, ys, mean=None, sd=None, n=None):
    """Sorted (x, mean, sd, n) rows from replicate rows or summary data."""
    rows = []
    if mean is not None:
        for i, xv in enumerate(x):
            m = mean[i] if i < len(mean) else None
            if xv is None or m is None:
                continue
            s = sd[i] if sd is not None and i < len(sd) else None
            k = n[i] if n is not None and i < len(n) else None
            rows.append((float(xv), float(m),
                         None if s is None else float(s),
                         None if k is None else float(k)))
    else:
        for xv, row in zip(x, ys):
            if xv is None:
                continue
            vals = [float(v) for v in (row or []) if v is not None]
            if not vals:
                continue
            arr = np.array(vals)
            rows.append((float(xv), float(arr.mean()),
                         float(arr.std(ddof=1)) if arr.size > 1 else None,
                         float(arr.size)))
    if len(rows) < 2:
        raise ValueError("area under the curve needs at least two points")
    rows.sort(key=lambda r: r[0])
    return rows


def _baseline_value(kind, value, y):
    if kind not in _BASELINES:
        raise ValueError(f"baseline must be one of {_BASELINES}")
    if kind == "zero":
        return 0.0
    if kind == "value":
        if value is None:
            raise ValueError("baseline 'value' needs baseline_value")
        return float(value)
    if kind == "first":
        return float(y[0])
    if kind == "last":
        return float(y[-1])
    return float((y[0] + y[-1]) / 2)


def _trapezoid_weights(x):
    k = x.size
    c = np.zeros(k)
    dx = np.diff(x)
    c[:-1] += dx / 2
    c[1:] += dx / 2
    return c


def _regions(x, y, base):
    """Split the polyline at baseline crossings -> list of regions, each
    with its sign, X limits, absolute area and data-point indices."""
    d = y - base
    sign = np.sign(d)
    regions = []
    cur = None
    if sign[0] != 0:
        cur = {"sign": int(sign[0]), "x_start": float(x[0]), "area": 0.0,
               "points": [0]}
    for i in range(1, x.size):
        x0, x1, d0, d1 = x[i - 1], x[i], d[i - 1], d[i]
        s0, s1 = sign[i - 1], sign[i]
        if s0 != 0 and s1 == s0:
            cur["area"] += abs(d0 + d1) * (x1 - x0) / 2
        elif s0 != 0 and s1 == -s0:
            xc = x0 + (x1 - x0) * d0 / (d0 - d1)
            cur["area"] += abs(d0) * (xc - x0) / 2
            cur["x_end"] = float(xc)
            regions.append(cur)
            cur = {"sign": int(s1), "x_start": float(xc),
                   "area": abs(d1) * (x1 - xc) / 2, "points": []}
        elif s0 != 0:  # back onto the baseline
            cur["area"] += abs(d0) * (x1 - x0) / 2
            cur["x_end"] = float(x1)
            regions.append(cur)
            cur = None
        elif s1 != 0:  # leaving the baseline
            cur = {"sign": int(s1), "x_start": float(x0),
                   "area": abs(d1) * (x1 - x0) / 2, "points": []}
        if s1 != 0:
            cur["points"].append(i)
    if cur is not None:
        cur["x_end"] = float(x[-1])
        regions.append(cur)
    return regions


def area_under_curve(x, ys=None, *, mean=None, sd=None, n=None,
                     baseline: str = "zero", baseline_value=None,
                     peak_direction: str = "positive",
                     min_peak_height_pct: float = 10.0,
                     min_peak_points: int = 0,
                     ci_level: float = 0.95) -> dict:
    """AUC of one data set. ys: replicate rows (row-major, None = blank);
    or mean / sd / n per row (summary data)."""
    if peak_direction not in ("positive", "negative", "both"):
        raise ValueError("peak_direction must be 'positive', 'negative' or "
                         "'both'")
    rows = _points(x, ys, mean, sd, n)
    xs = np.array([r[0] for r in rows])
    ym = np.array([r[1] for r in rows])
    base = _baseline_value(baseline, baseline_value, ym)

    c = _trapezoid_weights(xs)
    span = xs[-1] - xs[0]
    # baseline from the data is a linear function of the means as well
    cw = c.copy()
    if baseline == "first":
        cw[0] -= span
    elif baseline == "last":
        cw[-1] -= span
    elif baseline == "mean_first_last":
        cw[0] -= span / 2
        cw[-1] -= span / 2
    net_full = float(np.sum(c * (ym - base)))

    regions = _regions(xs, ym, base)
    yrange = float(ym.max() - ym.min())
    threshold = min_peak_height_pct / 100.0 * yrange
    peaks = []
    total = pos = neg = 0.0
    for r in regions:
        idx = r["points"]
        if r["sign"] > 0:
            j = idx[int(np.argmax(ym[idx]))]
            pos += r["area"]
        else:
            j = idx[int(np.argmin(ym[idx]))]
            neg += r["area"]
        total += r["area"]
        height = abs(ym[j] - base)
        wanted = (peak_direction == "both"
                  or (peak_direction == "positive" and r["sign"] > 0)
                  or (peak_direction == "negative" and r["sign"] < 0))
        counted = (wanted and height >= threshold
                   and len(idx) >= int(min_peak_points))
        peaks.append({"direction": "above" if r["sign"] > 0 else "below",
                      "x_start": r["x_start"], "x_end": r["x_end"],
                      "peak_x": float(xs[j]), "peak_y": float(ym[j]),
                      "height": float(height), "n_points": len(idx),
                      "area": float(r["area"]), "counted": bool(counted)})
    peak_area = sum(p["area"] for p in peaks if p["counted"])
    for p in peaks:
        p["fraction"] = p["area"] / peak_area if p["counted"] and peak_area \
            else None
    net_peaks = sum(p["area"] * (1 if p["direction"] == "above" else -1)
                    for p in peaks if p["counted"])

    sds = [r[2] for r in rows]
    ns = [r[3] for r in rows]
    se = None
    df = None
    if any(s is not None and k for s, k in zip(sds, ns)):
        var = sum(w * w * (s * s) / k for w, s, k in zip(cw, sds, ns)
                  if s is not None and k)
        se = math.sqrt(var)
        n_points = sum(k for k in ns if k)
        df = int(n_points - len(rows))
    z = float(stats.norm.ppf((1 + ci_level) / 2))
    out = {
        "analysis": "auc",
        "baseline": base, "baseline_kind": baseline,
        "n_x": len(rows), "x_range": [float(xs[0]), float(xs[-1])],
        "area": net_full,
        "se": se,
        "ci": [net_full - z * se, net_full + z * se] if se is not None else None,
        "df": df,
        "total_area": float(total),
        "area_above": float(pos), "area_below": float(neg),
        "total_peak_area": float(peak_area),
        "net_peak_area": float(net_peaks) if peak_direction == "both" else None,
        "n_peaks": sum(1 for p in peaks if p["counted"]),
        "peak_threshold": threshold,
        "peaks": peaks,
        "points": {"x": xs.tolist(), "y": ym.tolist()},
    }
    return out


def _summary_anova(means, ses, dfs):
    """One-way ANOVA from (mean, SE, df) per group with n = df + 1 and
    SD = SE * sqrt(n) (the guide's recipe for comparing AUCs)."""
    ns = np.array(dfs, dtype=float) + 1
    means = np.array(means, dtype=float)
    sds = np.array(ses, dtype=float) * np.sqrt(ns)
    grand = np.sum(ns * means) / ns.sum()
    ssb = float(np.sum(ns * (means - grand) ** 2))
    ssw = float(np.sum((ns - 1) * sds ** 2))
    dfb, dfw = len(means) - 1, int(ns.sum() - len(means))
    F = (ssb / dfb) / (ssw / dfw)
    return {"F": F, "dfn": dfb, "dfd": dfw, "p": float(stats.f.sf(F, dfb, dfw))}


def compare_aucs(results, names=None) -> dict:
    """Compare AUCs that carry an SE (Bailer 1988; Prism guide recipe)."""
    names = names or [f"Data set {i + 1}" for i in range(len(results))]
    use = [(nm, r) for nm, r in zip(names, results)
           if r.get("se") is not None and r.get("df") is not None]
    if len(use) < 2:
        raise ValueError("comparing AUCs needs at least two data sets with "
                         "replicates (an SE)")
    a = np.array([r["area"] for _, r in use])
    se = np.array([r["se"] for _, r in use])
    dfs = [r["df"] for _, r in use]
    out = {"names": [nm for nm, _ in use]}
    if len(use) == 2:
        diff = float(a[0] - a[1])
        sed = float(math.sqrt(se[0] ** 2 + se[1] ** 2))
        zst = diff / sed
        out["bailer_z"] = {"difference": diff, "se": sed, "z": zst,
                           "p": float(2 * stats.norm.sf(abs(zst)))}
        n1, n2 = dfs[0] + 1, dfs[1] + 1
        sd1, sd2 = se[0] * math.sqrt(n1), se[1] * math.sqrt(n2)
        res = stats.ttest_ind_from_stats(a[0], sd1, n1, a[1], sd2, n2,
                                         equal_var=True)
        out["t_test"] = {"t": float(res.statistic), "df": int(n1 + n2 - 2),
                         "p": float(res.pvalue), "difference": diff}
    w = 1 / se ** 2
    abar = float(np.sum(w * a) / np.sum(w))
    q = float(np.sum(w * (a - abar) ** 2))
    out["bailer_chi2"] = {"chi2": q, "df": len(use) - 1,
                          "p": float(stats.chi2.sf(q, len(use) - 1))}
    if len(use) >= 2:
        out["anova"] = _summary_anova(a, se, dfs)
    return out


def _group_test(groups, names, equal_var=True):
    vals = [np.asarray(g, dtype=float) for g in groups]
    if len(vals) == 2:
        res = stats.ttest_ind(vals[0], vals[1], equal_var=equal_var)
        df = (vals[0].size + vals[1].size - 2) if equal_var else None
        if not equal_var:
            v1, v2 = vals[0].var(ddof=1) / vals[0].size, vals[1].var(ddof=1) / vals[1].size
            df = (v1 + v2) ** 2 / (v1 ** 2 / (vals[0].size - 1) + v2 ** 2 / (vals[1].size - 1))
        return {"test": "unpaired t test" if equal_var else "Welch t test",
                "t": float(res.statistic), "df": float(df),
                "p": float(res.pvalue),
                "difference": float(vals[0].mean() - vals[1].mean()),
                "names": names}
    res = stats.f_oneway(*vals)
    k = len(vals)
    N = sum(v.size for v in vals)
    return {"test": "one-way ANOVA", "F": float(res.statistic),
            "dfn": k - 1, "dfd": N - k, "p": float(res.pvalue),
            "names": names}


def _describe(vals, ci_level):
    v = np.asarray(vals, dtype=float)
    k = v.size
    mean = float(v.mean())
    sd = float(v.std(ddof=1)) if k > 1 else None
    sem = sd / math.sqrt(k) if sd is not None else None
    if sem is not None:
        t = float(stats.t.ppf((1 + ci_level) / 2, k - 1))
        ci = [mean - t * sem, mean + t * sem]
    else:
        ci = None
    return {"n": k, "mean": mean, "sd": sd, "sem": sem, "ci": ci}


def auc_per_replicate(x, ys, *, ci_level=0.95, **kw) -> dict:
    """One AUC per subcolumn (each subcolumn a separate experiment)."""
    width = max((len(r) for r in ys if r), default=0)
    per = []
    for j in range(width):
        col = [[row[j]] if row and j < len(row) and row[j] is not None else []
               for row in ys]
        try:
            per.append(area_under_curve(x, col, ci_level=ci_level, **kw)["area"])
        except ValueError:
            per.append(None)
    vals = [v for v in per if v is not None]
    if not vals:
        raise ValueError("no subcolumn has two or more points")
    return {"per_replicate": per, **_describe(vals, ci_level)}


def analyze_datasets(x, datasets, *, replicates: str = "within",
                     equal_var: bool = True, ci_level: float = 0.95,
                     **kw) -> dict:
    """AUC per data set, plus a comparison when there are two or more.
    replicates: "within" (subcolumns are replicates of one experiment,
    Gagnon SE) or "experiments" (one AUC per subcolumn)."""
    out = []
    for ds in datasets:
        entry = {"name": ds.get("name", "")}
        try:
            if replicates == "experiments":
                entry.update(auc_per_replicate(x, ds["ys"], ci_level=ci_level,
                                               **kw))
            elif "mean" in ds:
                entry.update(area_under_curve(x, mean=ds["mean"],
                                              sd=ds.get("sd"), n=ds.get("n"),
                                              ci_level=ci_level, **kw))
            else:
                entry.update(area_under_curve(x, ds["ys"], ci_level=ci_level,
                                              **kw))
        except ValueError as exc:
            entry["error"] = str(exc)
        out.append(entry)
    result = {"analysis": "auc", "replicates": replicates, "datasets": out}
    ok = [e for e in out if "error" not in e]
    if len(ok) >= 2:
        try:
            if replicates == "experiments":
                groups = [[v for v in e["per_replicate"] if v is not None]
                          for e in ok]
                if all(len(g) >= 2 for g in groups):
                    result["comparison"] = _group_test(
                        groups, [e["name"] for e in ok], equal_var)
            else:
                result["comparison"] = compare_aucs(ok, [e["name"] for e in ok])
        except ValueError:
            pass
    return result


def subject_auc(subjects, groups, times, values, *, baseline: str = "zero",
                baseline_value=None, per_time: bool = False,
                equal_var: bool = True, ci_level: float = 0.95) -> dict:
    """Per-subject trapezoid AUC from long-format rows (subject, group,
    time, value). baseline: "zero" | "value" | "first" (the subject's
    first value). per_time divides by the subject's time span (a mean
    level, comparable when follow-up differs)."""
    if baseline not in ("zero", "value", "first"):
        raise ValueError("baseline must be 'zero', 'value' or 'first'")
    data: dict = {}
    order = []
    for s, g, t, v in zip(subjects, groups, times, values):
        if s is None or t is None or v is None:
            continue
        key = str(s)
        if key not in data:
            data[key] = {"group": "" if g is None else str(g), "pts": []}
            order.append(key)
        data[key]["pts"].append((float(t), float(v)))
    if not data:
        raise ValueError("no complete rows")
    rows = []
    group_order = []
    for key in order:
        rec = data[key]
        pts = sorted(rec["pts"])
        if rec["group"] not in group_order:
            group_order.append(rec["group"])
        if len(pts) < 2:
            rows.append({"subject": key, "group": rec["group"], "auc": None,
                         "n_points": len(pts)})
            continue
        t = np.array([p[0] for p in pts])
        y = np.array([p[1] for p in pts])
        base = 0.0 if baseline == "zero" else (
            float(baseline_value) if baseline == "value" else float(y[0]))
        a = float(np.sum(np.diff(t) * ((y[1:] + y[:-1]) / 2 - base)))
        if per_time:
            a = a / float(t[-1] - t[0]) if t[-1] > t[0] else None
        rows.append({"subject": key, "group": rec["group"], "auc": a,
                     "n_points": len(pts), "t_first": float(t[0]),
                     "t_last": float(t[-1]), "baseline": base})
    datasets = []
    summaries = []
    for g in group_order:
        vals = [r["auc"] for r in rows if r["group"] == g and r["auc"] is not None]
        datasets.append({"name": g, "ys": [[v] for v in vals]})
        if vals:
            summaries.append({"group": g, **_describe(vals, ci_level)})
    out = {"analysis": "subject_auc", "baseline": baseline,
           "per_time": per_time, "subjects": rows,
           "table": {"datasets": datasets}, "groups": summaries}
    usable = [d for d in datasets if len(d["ys"]) >= 2]
    if len(usable) >= 2:
        out["comparison"] = _group_test([[v[0] for v in d["ys"]] for d in usable],
                                        [d["name"] for d in usable], equal_var)
    return out
