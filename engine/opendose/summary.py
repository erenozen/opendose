"""Data entered as summary values ("error values computed elsewhere").

GraphPad Prism user guide, "Replicates and error bars":
- "Entering error values computed elsewhere" (graphing_errorbars_calclated_e):
  the subcolumn formats Mean, SD, N / Mean, SEM, N / Mean, %CV, N /
  Mean & SD / Mean & SEM / Mean & %CV / Mean (or median), +/- error /
  Mean (or median), Upper/Lower limits. %CV = 100*SD/Mean. +/- values
  are distances from the mean; upper/lower limit values are the end
  points of the error bars. Without n, no analysis can use the error
  values ("Prism will only analyze/fit the means").
- "Graphing error bars computed from entered error values": Prism plots
  the error value entered (the SD when %CV was entered); with n it can
  plot SD, SEM or a CI from any of the three n formats.
- "Why do error bars on bar graphs sometimes appear asymmetrical?":
  entered up and down values (limits, +/- errors) may differ, so those
  bars are genuinely asymmetrical.
- "Stacked vs. side-by-side replicates": XY and Grouped tables put
  replicates in side-by-side subcolumns (one row per X or group);
  Column tables stack them. The canonical payload here is side-by-side:
  datasets[i].ys[row] = replicate values.

GraphPad Prism statistics guide and FAQ:
- "Entering data for a t test", "Entering data for one-way ANOVA and
  related tests", FAQ 530 ("ANOVA and t tests with data entered as
  mean, N and SD (or SEM)"): unpaired (and Welch) t tests and ordinary
  one-way ANOVA run from mean, SD (or SEM) and n with exactly the
  results of the raw data; paired, repeated-measures and nonparametric
  tests cannot. Two-way ANOVA also accepts mean/SD/n. To compare
  regression best-fit values, enter the value as the mean, its SE as
  the SEM and df + 1 as N.

GraphPad Prism curve-fitting guide, "Method tab" (Replicates) and FAQ
2038: fitting mean, SD/SEM/%CV and n accounting for SD and n gives the
raw-data fit; "fit the means only" (or any format without n) fits one
point per row. See opendose.nlfit for the fit itself.

The "Mean, 95% CI, N" format (Lower/Upper limit of the CI plus n) is an
addition here. Its SD/SEM come from the CI half-width,
SEM = (upper - lower) / (2 t(0.975, n - 1)), which is exact only for a
symmetric t-based CI of the mean; asymmetric entries are flagged.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

from . import anova, descriptive, ttests, twoway

# ---------------------------------------------------------------- formats

# id -> (menu label, subcolumn labels, carries n)
FORMATS: dict[str, dict] = {
    "replicates": {"label": "Y values (side-by-side replicates)",
                   "subcolumns": None, "has_n": True},
    "mean_sd_n": {"label": "Mean, SD, N",
                  "subcolumns": ["Mean", "SD", "N"], "has_n": True},
    "mean_sem_n": {"label": "Mean, SEM, N",
                   "subcolumns": ["Mean", "SEM", "N"], "has_n": True},
    "mean_cv_n": {"label": "Mean, %CV, N",
                  "subcolumns": ["Mean", "%CV", "N"], "has_n": True},
    "mean_ci_n": {"label": "Mean, 95% CI, N",
                  "subcolumns": ["Mean", "Lower 95% CI", "Upper 95% CI", "N"],
                  "has_n": True},
    "mean_sd": {"label": "Mean & SD",
                "subcolumns": ["Mean", "SD"], "has_n": False},
    "mean_sem": {"label": "Mean & SEM",
                 "subcolumns": ["Mean", "SEM"], "has_n": False},
    "mean_cv": {"label": "Mean & %CV",
                "subcolumns": ["Mean", "%CV"], "has_n": False},
    "mean_pm": {"label": "Mean (or median), +/- error",
                "subcolumns": ["Mean", "+Error", "-Error"], "has_n": False},
    "mean_limits": {"label": "Mean (or median), Upper/Lower limits",
                    "subcolumns": ["Mean", "Upper limit", "Lower limit"],
                    "has_n": False},
}

ERROR_BAR_KINDS = ("sd", "sem", "ci95", "range", "none", "entered")


def _check_format(fmt):
    if fmt not in FORMATS:
        raise ValueError(f"unknown summary format: {fmt}")


def _num(v):
    """float, or None for blank / non-finite cells."""
    if v is None:
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _cell(values, i):
    return _num(values[i]) if values is not None and i < len(values) else None


def _tcrit(n, ci_level=0.95):
    return float(stats.t.ppf((1 + ci_level) / 2, n - 1))


# ---------------------------------------------------------------- conversions

def row_summary(values) -> dict:
    """Mean, SD, SEM, n of one row of replicate values (blanks ignored)."""
    s = descriptive.row_stats([_num(v) for v in values])
    return {"mean": s["mean"], "sd": s["sd"], "sem": s["sem"],
            "n": s["n"] if s["n"] else None, "exact": True}


def from_replicates(rows):
    """Replicate rows -> (means, sds, ns), one entry per row (None where
    not computable: no values, or SD with a single value)."""
    means, sds, ns = [], [], []
    for row in rows:
        s = row_summary(row or [])
        means.append(s["mean"])
        sds.append(s["sd"])
        ns.append(s["n"])
    return means, sds, ns


def to_mean_sd_n(values, fmt: str) -> dict:
    """One row of subcolumn values in format fmt -> mean, SD, SEM, n.

    Returns {mean, sd, sem, n, exact, lo, hi}; sd/sem/n are None when the
    format cannot supply them (no n -> no SEM from SD and vice versa).
    lo/hi are the entered absolute bar ends for the limit, +/- and CI
    formats (None otherwise). exact is False only when the conversion is
    an approximation (an asymmetric 95% CI entry).
    """
    _check_format(fmt)
    if fmt == "replicates":
        out = row_summary(values or [])
        out.update(lo=None, hi=None)
        return out
    mean = _cell(values, 0)
    out = {"mean": mean, "sd": None, "sem": None, "n": None,
           "exact": True, "lo": None, "hi": None}
    if mean is None:
        return out

    has_n = FORMATS[fmt]["has_n"]
    n = None
    if has_n:
        n = _cell(values, len(FORMATS[fmt]["subcolumns"]) - 1)
        if n is not None and n <= 0:
            n = None
        if n is not None and n != round(n):
            raise ValueError(f"N must be a whole number (got {n})")
        n = int(n) if n is not None else None
    out["n"] = n

    err = _cell(values, 1)
    if fmt in ("mean_sd_n", "mean_sd"):
        sd = abs(err) if err is not None else None
        out["sd"] = sd
        if sd is not None and n:
            out["sem"] = sd / math.sqrt(n)
    elif fmt in ("mean_sem_n", "mean_sem"):
        sem = abs(err) if err is not None else None
        out["sem"] = sem
        if sem is not None and n:
            out["sd"] = sem * math.sqrt(n)
    elif fmt in ("mean_cv_n", "mean_cv"):
        if err is not None:
            sd = abs(err) * abs(mean) / 100.0  # %CV = 100 * SD / Mean
            out["sd"] = sd
            if n:
                out["sem"] = sd / math.sqrt(n)
    elif fmt == "mean_ci_n":
        lo, hi = _cell(values, 1), _cell(values, 2)
        if lo is not None and hi is not None:
            lo, hi = min(lo, hi), max(lo, hi)
            out["lo"], out["hi"] = lo, hi
            if n is not None and n >= 2:
                sem = (hi - lo) / 2.0 / _tcrit(n)
                out["sem"] = sem
                out["sd"] = sem * math.sqrt(n)
                scale = max(abs(hi - lo), 1e-300)
                out["exact"] = abs((hi - mean) - (mean - lo)) <= 1e-9 * scale
    elif fmt == "mean_pm":
        plus, minus = _cell(values, 1), _cell(values, 2)
        out["hi"] = mean + abs(plus) if plus is not None else None
        out["lo"] = mean - abs(minus) if minus is not None else None
    elif fmt == "mean_limits":
        out["hi"], out["lo"] = _cell(values, 1), _cell(values, 2)
    return out


def synthetic_replicates(mean, sd, n) -> list[float]:
    """n values whose mean and SD (n - 1 denominator) equal mean and sd.

    Every least-squares quantity depends on replicates only through each
    row's mean, SD and n, so these stand in for the raw values wherever
    an existing routine wants samples (Dunnett's P values, global
    fitting, the replicates test). They are NOT the data: never show
    them, and never feed them to rank or median-based methods.
    """
    n = int(n)
    if n < 1 or mean is None:
        return []
    if n == 1 or not sd:
        return [float(mean)] * n
    v = np.arange(n, dtype=float) - (n - 1) / 2.0
    z = v / v.std(ddof=1)
    return [float(mean + sd * zi) for zi in z]


def error_bar(values, fmt: str, kind: str = "sd", *,
              ci_level: float = 0.95) -> dict:
    """Error bar for one row: {mean, lo, hi, n, kind, requested}.

    kind: 'sd' | 'sem' | 'ci95' | 'range' | 'none' | 'entered'. lo/hi are
    absolute Y values. When the format cannot provide the requested kind
    (no n, or a limits / +/- format) the bar shows what was entered, as
    Prism plots the entered error value (the SD for %CV entries), and
    'kind' says what is drawn. 'range' needs raw replicates. The CI of
    a Mean, 95% CI, N entry is drawn at the entered (possibly
    asymmetrical) limits.
    """
    _check_format(fmt)
    if kind not in ERROR_BAR_KINDS:
        raise ValueError(f"unknown error bar kind: {kind}")
    if fmt == "replicates":
        eff = "sd" if kind == "entered" else kind
        b = descriptive.error_bars([[_num(v) for v in (values or [])]], eff)[0]
        drawn = eff if (b["lo"] is not None or eff == "none") else None
        return {"mean": b["mean"], "lo": b["lo"], "hi": b["hi"],
                "n": b["n"] or None, "kind": drawn, "requested": kind}

    s = to_mean_sd_n(values, fmt)
    mean, n = s["mean"], s["n"]
    out = {"mean": mean, "lo": None, "hi": None, "n": n,
           "kind": None, "requested": kind}
    if mean is None or kind == "none":
        out["kind"] = "none" if mean is not None else None
        return out

    def put(lo, hi, drawn):
        out["lo"], out["hi"], out["kind"] = lo, hi, drawn
        return out

    if fmt == "mean_ci_n" and kind == "ci95" and s["lo"] is not None \
            and ci_level == 0.95:
        return put(s["lo"], s["hi"], "ci95")
    if kind == "sd" and s["sd"] is not None:
        return put(mean - s["sd"], mean + s["sd"], "sd")
    if kind == "sem" and s["sem"] is not None:
        return put(mean - s["sem"], mean + s["sem"], "sem")
    if kind == "ci95" and s["sem"] is not None and n is not None and n >= 2:
        half = _tcrit(n, ci_level) * s["sem"]
        return put(mean - half, mean + half, "ci95")
    # Fall back to what was entered.
    if fmt in ("mean_sd_n", "mean_sd", "mean_cv_n", "mean_cv") \
            and s["sd"] is not None:
        return put(mean - s["sd"], mean + s["sd"], "sd")
    if fmt in ("mean_sem_n", "mean_sem") and s["sem"] is not None:
        return put(mean - s["sem"], mean + s["sem"], "sem")
    if fmt in ("mean_ci_n", "mean_pm", "mean_limits") \
            and (s["lo"] is not None or s["hi"] is not None):
        drawn = "ci95" if fmt == "mean_ci_n" else "entered"
        return put(s["lo"], s["hi"], drawn)
    return out


def error_bars(rows, fmt: str, kind: str = "sd", *,
               ci_level: float = 0.95) -> list[dict]:
    """error_bar for every row; same {mean, lo, hi, n} shape as
    descriptive.error_bars plus 'kind' (drawn) and 'requested'."""
    return [error_bar(r, fmt, kind, ci_level=ci_level) for r in rows]


# ---------------------------------------------------------------- table shape

def _dataset_rows(ds):
    for key in ("rows", "ys", "values"):
        if key in ds and ds[key] is not None:
            return ds[key]
    return []


def expand_summary_table(x, datasets, fmt: str) -> dict:
    """Summary-format table -> the canonical api payload shape.

    datasets: [{"name", "rows": [[subcolumn values] per row]}] ("ys" or
    "values" accepted for "rows"). Returns {"x", "format", "datasets":
    [{"name", "format", "rows", "ys", "mean", "sd", "sem", "n", "lo", "hi",
    "exact"}]}
    where ys[row] = [mean] (or the replicates themselves for format
    'replicates'), so handlers that only understand replicates see the
    means, which is what Prism analyzes when it cannot use the errors.
    Summary-aware handlers switch on the mean/sd/n arrays.
    """
    _check_format(fmt)
    out = []
    for ds in datasets:
        rows = _dataset_rows(ds)
        conv = [to_mean_sd_n(r, fmt) for r in rows]
        if fmt == "replicates":
            ys = [list(r or []) for r in rows]
        else:
            ys = [[c["mean"]] if c["mean"] is not None else [] for c in conv]
        out.append({
            "name": ds.get("name", ""),
            "format": fmt,
            "rows": [list(r) if r is not None else [] for r in rows],
            "ys": ys,
            "mean": [c["mean"] for c in conv],
            "sd": [c["sd"] for c in conv],
            "sem": [c["sem"] for c in conv],
            "n": [c["n"] for c in conv],
            "lo": [c["lo"] for c in conv],
            "hi": [c["hi"] for c in conv],
            "exact": all(c["exact"] for c in conv),
        })
    return {"x": list(x) if x is not None else None, "format": fmt,
            "datasets": out}


def collapse_to_summary(data, fmt: str = "mean_sd_n", *,
                        kind: str = "sd") -> dict:
    """Canonical replicate payload {x, datasets: [{name, ys}]} -> the same
    table in summary format fmt: {x, format, datasets: [{name, rows}]}.

    For 'mean_pm' / 'mean_limits' the error is the requested kind
    ('sd', 'sem', 'ci95' or 'range'). Rows that cannot supply the error
    (fewer than 2 values) keep the mean and leave the error blank.
    """
    _check_format(fmt)
    if fmt == "replicates":
        return {"x": data.get("x"), "format": fmt,
                "datasets": [{"name": ds.get("name", ""),
                              "rows": [list(r) for r in _dataset_rows(ds)]}
                             for ds in data["datasets"]]}
    out = []
    for ds in data["datasets"]:
        if ds.get("format") not in (None, "replicates"):
            raise ValueError(f"dataset {ds.get('name', '')!r} is already in "
                             f"summary format {ds['format']}")
        rows = []
        for r in _dataset_rows(ds):
            s = descriptive.row_stats([_num(v) for v in (r or [])])
            m, sd, sem, n = s["mean"], s["sd"], s["sem"], s["n"]
            if m is None:
                rows.append([None] * len(FORMATS[fmt]["subcolumns"]))
                continue
            if fmt == "mean_sd_n":
                rows.append([m, sd, n])
            elif fmt == "mean_sem_n":
                rows.append([m, sem, n])
            elif fmt == "mean_cv_n":
                rows.append([m, _cv(m, sd), n])
            elif fmt == "mean_ci_n":
                rows.append([m, s["ci95_lo"], s["ci95_hi"], n])
            elif fmt == "mean_sd":
                rows.append([m, sd])
            elif fmt == "mean_sem":
                rows.append([m, sem])
            elif fmt == "mean_cv":
                rows.append([m, _cv(m, sd)])
            else:
                b = descriptive.error_bars([r], kind)[0]
                lo, hi = b["lo"], b["hi"]
                if fmt == "mean_limits":
                    rows.append([m, hi, lo])
                else:
                    rows.append([m, hi - m if hi is not None else None,
                                 m - lo if lo is not None else None])
        out.append({"name": ds.get("name", ""), "rows": rows})
    return {"x": data.get("x"), "format": fmt, "datasets": out}


def _cv(mean, sd):
    if sd is None or mean == 0:
        return None
    return 100.0 * sd / abs(mean)


def _dataset_format(ds, fmt):
    fmt = ds.get("format") or fmt or "replicates"
    _check_format(fmt)
    return fmt


def dataset_summary(ds, fmt: str | None):
    """(means, sds, ns) per row for one api dataset: from the mean/sd/n
    arrays of an expand_summary_table dataset if present, else from
    ds['ys'] (or 'rows') read in format fmt (replicate rows when fmt is
    None or 'replicates')."""
    if "mean" in ds:
        m = list(ds["mean"])
        return (m, list(ds.get("sd") or [None] * len(m)),
                list(ds.get("n") or [None] * len(m)))
    fmt = _dataset_format(ds, fmt)
    conv = [to_mean_sd_n(r, fmt) for r in _dataset_rows(ds)]
    return ([c["mean"] for c in conv], [c["sd"] for c in conv],
            [c["n"] for c in conv])


def fit_inputs(x_col, ds, fmt: str, replicates: str = "account"):
    """(xs, means, fit_model keyword args) for fitting one dataset whose
    rows are in summary format fmt. Formats without n (and
    replicates='means_only') fit the means only; '1/SD2' weighting can
    still use the entered SD (nlfit.fit_model)."""
    means, sds, ns = dataset_summary(ds, fmt)
    xs, ms, ss, nn = [], [], [], []
    for xv, m, s, n in zip(x_col, means, sds, ns):
        if xv is None or m is None:
            continue
        xs.append(float(xv))
        ms.append(float(m))
        ss.append(s)
        nn.append(n)
    has_n = FORMATS[_dataset_format(ds, fmt)]["has_n"]
    kwargs = {"sd": ss, "replicates": replicates}
    if has_n:
        kwargs["n"] = nn
    return xs, ms, kwargs


def replicate_view(x_col, ds, fmt: str):
    """Flat (xs, ys) of synthetic replicates standing for each row's
    mean/SD/n (see synthetic_replicates): least-squares fits of these
    equal the fits of the real replicates. Rows without n contribute
    their mean once."""
    means, sds, ns = dataset_summary(ds, fmt)
    has_n = FORMATS[_dataset_format(ds, fmt)]["has_n"]
    xs, ys = [], []
    for xv, m, s, n in zip(x_col, means, sds, ns):
        if xv is None or m is None:
            continue
        if has_n:
            if not n:
                continue
            vals = synthetic_replicates(m, s, n)
        else:
            vals = [m]
        xs.extend([float(xv)] * len(vals))
        ys.extend(vals)
    return xs, ys


# ---------------------------------------------------------------- analyses

def _group(g, fmt: str = "mean_sd_n") -> dict:
    """Normalize a group to {mean, sd, n}: a dict with mean, n and one of
    sd / sem / cv, or a row of subcolumn values in format fmt."""
    if isinstance(g, dict):
        mean, n = _num(g.get("mean")), _num(g.get("n"))
        if n is not None and n != round(n):
            raise ValueError(f"N must be a whole number (got {n})")
        n = int(n) if n is not None else None
        if g.get("sd") is not None:
            sd = abs(_num(g["sd"]))
        elif g.get("sem") is not None and n:
            sd = abs(_num(g["sem"])) * math.sqrt(n)
        elif g.get("cv") is not None and mean is not None:
            sd = abs(_num(g["cv"])) * abs(mean) / 100.0
        else:
            sd = None
        exact = True
    else:
        s = to_mean_sd_n(g, fmt)
        mean, sd, n, exact = s["mean"], s["sd"], s["n"], s["exact"]
    if mean is None or n is None:
        raise ValueError("analyses need the mean and N of every group "
                         "(the guide: N is essential)")
    return {"mean": float(mean), "sd": sd, "n": int(n), "exact": exact}


def _need_sd(g, min_n=2):
    if g["n"] < min_n:
        raise ValueError(f"each group needs n >= {min_n}")
    if g["sd"] is None:
        raise ValueError("each group needs an SD (or SEM / %CV)")


def unpaired_t_summary(group_a, group_b, *, welch: bool = False,
                       ci_level: float = 0.95, fmt: str = "mean_sd_n") -> dict:
    """Unpaired (or Welch) t test from mean, SD and n per group; the same
    result dict as ttests.unpaired_t."""
    a, b = _group(group_a, fmt), _group(group_b, fmt)
    _need_sd(a)
    _need_sd(b)
    out = ttests._unpaired_from_stats(a["mean"], a["sd"] ** 2, a["n"],
                                      b["mean"], b["sd"] ** 2, b["n"],
                                      welch=welch, ci_level=ci_level)
    out["exact"] = a["exact"] and b["exact"]
    return out


def one_sample_t_summary(group, hypothetical: float, *,
                         ci_level: float = 0.95,
                         fmt: str = "mean_sd_n") -> dict:
    """One-sample t test vs a hypothetical value from mean, SD and n; the
    same result dict as columnstats.one_sample_t."""
    g = _group(group, fmt)
    _need_sd(g)
    n = g["n"]
    sem = g["sd"] / math.sqrt(n)
    diff = g["mean"] - hypothetical
    t_stat = diff / sem
    p = 2 * float(stats.t.sf(abs(t_stat), n - 1))
    tcrit = _tcrit(n, ci_level)
    return {
        "hypothetical": hypothetical,
        "mean": g["mean"],
        "discrepancy": diff,
        "t": float(abs(t_stat)),
        "df": int(n - 1),
        "p_two_tailed": p,
        "ci_discrepancy": [diff - tcrit * sem, diff + tcrit * sem],
        "r_squared": float(t_stat ** 2 / (t_stat ** 2 + (n - 1))),
        "exact": g["exact"],
    }


def _bartlett(sds, ns) -> dict:
    """Bartlett's test from SDs and n (Prism's equal-variance check);
    same formula as scipy.stats.bartlett, which needs raw samples."""
    k = len(ns)
    n_tot = sum(ns)
    v = np.array([s * s for s in sds], dtype=float)
    nm1 = np.array(ns, dtype=float) - 1.0
    if np.any(v <= 0):
        return {"statistic": float("nan"), "p": float("nan")}
    sp2 = float(np.sum(nm1 * v) / (n_tot - k))
    numer = (n_tot - k) * math.log(sp2) - float(np.sum(nm1 * np.log(v)))
    denom = 1.0 + (float(np.sum(1.0 / nm1)) - 1.0 / (n_tot - k)) / (3.0 * (k - 1))
    t = numer / denom
    return {"statistic": float(t), "p": float(stats.chi2.sf(t, k - 1))}


def one_way_anova_summary(groups, names=None, *, comparisons: str | None = None,
                          control_index: int = 0, ci_level: float = 0.95,
                          fmt: str = "mean_sd_n") -> dict:
    """Ordinary one-way ANOVA from mean, SD and n per group: the result
    dict of anova.one_way_anova (+ 'multiple_comparisons' when
    comparisons is 'tukey' | 'dunnett' | 'bonferroni' | 'sidak' |
    'holm_sidak'). Brown-Forsythe needs the raw values (it works on
    deviations from each group median) so it is reported as None;
    Bartlett's test needs only SDs and n and is computed."""
    gs = [_group(g, fmt) for g in groups]
    if len(gs) < 2:
        raise ValueError("one-way ANOVA needs at least 2 non-empty groups")
    for g in gs:
        _need_sd(g)
    k = len(gs)
    ns = [g["n"] for g in gs]
    means = [g["mean"] for g in gs]
    sds = [g["sd"] for g in gs]
    n_total = sum(ns)
    grand_mean = sum(n * m for n, m in zip(ns, means)) / n_total
    ss_between = sum(n * (m - grand_mean) ** 2 for n, m in zip(ns, means))
    ss_within = sum((n - 1) * s * s for n, s in zip(ns, sds))
    names = list(names) if names else [f"Group {i}" for i in range(k)]
    out = {
        "table": anova._anova_table(ss_between, ss_within, k, n_total),
        "group_summaries": [
            {"name": names[i], "n": ns[i], "mean": means[i], "sd": sds[i]}
            for i in range(k)],
        "brown_forsythe": {"F": None, "p": None,
                           "note": "needs raw data (group medians)"},
        "bartlett": _bartlett(sds, ns),
        "exact": all(g["exact"] for g in gs),
    }
    if comparisons:
        out["multiple_comparisons"] = multiple_comparisons_summary(
            gs, comparisons, names=names, control_index=control_index,
            ci_level=ci_level)
    return out


def multiple_comparisons_summary(groups, method: str, *, names=None,
                                 control_index: int = 0,
                                 ci_level: float = 0.95,
                                 fmt: str = "mean_sd_n") -> dict:
    """anova.multiple_comparisons from mean, SD and n per group."""
    gs = [_group(g, fmt) for g in groups]
    for g in gs:
        _need_sd(g)
    ns = [g["n"] for g in gs]
    means = [g["mean"] for g in gs]
    df_res = sum(ns) - len(gs)
    ms_res = sum((g["n"] - 1) * g["sd"] ** 2 for g in gs) / df_res
    samples = None
    if method == "dunnett":
        samples = [np.array(synthetic_replicates(g["mean"], g["sd"], g["n"]))
                   for g in gs]
    return anova._comparisons_from_stats(
        means, ns, ms_res, df_res, method, names=names,
        control_index=control_index, ci_level=ci_level,
        dunnett_samples=samples)


def _cells(cells, fmt):
    """cells[i][j] (row i, dataset j) -> list of (i, j, mean, sd, n) for
    every cell with data."""
    out = []
    for i, row in enumerate(cells):
        for j, c in enumerate(row):
            if c is None:
                continue
            if isinstance(c, dict):
                if _num(c.get("mean")) is None or not _num(c.get("n")):
                    continue
            else:
                probe = to_mean_sd_n(c, fmt)
                if probe["mean"] is None or not probe["n"]:
                    continue
            g = _group(c, fmt)
            if g["n"] < 1:
                continue
            if g["n"] > 1 and g["sd"] is None:
                raise ValueError("every cell with n > 1 needs an SD")
            out.append((i, j, g["mean"], g["sd"] or 0.0, g["n"]))
    if not out:
        raise ValueError("no cells with data")
    return out


def _two_way_base(cell_list, row_factor, col_factor):
    ri = np.array([c[0] for c in cell_list])
    ci = np.array([c[1] for c in cell_list])
    m = np.array([c[2] for c in cell_list], dtype=float)
    w = np.array([c[4] for c in cell_list], dtype=float)
    ss_within = float(sum((c[4] - 1) * c[3] ** 2 for c in cell_list))
    n_obs = int(w.sum())
    grand = float(np.sum(w * m) / w.sum())
    ss_total = float(np.sum(w * (m - grand) ** 2) + ss_within)
    sw = np.sqrt(w)

    def ss_resid(X, y):
        beta, *_ = np.linalg.lstsq(X * sw[:, None], y * sw, rcond=None)
        r = y - X @ beta
        return float(np.sum(w * r * r) + ss_within)

    return twoway._type3_table(m, ri, ci, n_obs, ss_total, ss_resid,
                               row_factor=row_factor, col_factor=col_factor)


def two_way_anova_summary(cells, *, row_factor: str = "Rows",
                          col_factor: str = "Columns",
                          fmt: str = "mean_sd_n") -> dict:
    """Two-way ANOVA from mean, SD and n per cell (cells[row][dataset]).

    Same Type III general-linear-model table as twoway.two_way_anova: the
    residual SS of any model constant within cells is the within-cell SS
    plus the n-weighted SS of the cell means about the model, so this
    equals the raw-data analysis for any n pattern. (FAQ 530 warns that
    Prism's own mean/SD/n two-way results are only approximate when n
    varies erratically between cells; with equal or systematically
    varying n they are identical.)"""
    cl = _cells(cells, fmt)
    out = _two_way_base(cl, row_factor, col_factor)
    a, b = out["rows"], out["cols"]
    means = [[None] * b for _ in range(a)]
    for i, j, m, _, _ in cl:
        means[i][j] = m
    out["cell_means"] = means
    return out


def two_way_comparisons_summary(cells, *, direction: str = "columns_within_rows",
                                method: str = "tukey", row_names=None,
                                col_names=None,
                                fmt: str = "mean_sd_n") -> dict:
    """twoway.two_way_comparisons from mean, SD and n per cell."""
    cl = _cells(cells, fmt)
    base = _two_way_base(cl, "Rows", "Columns")
    a, b = base["rows"], base["cols"]
    means = [[None] * b for _ in range(a)]
    ns = [[0] * b for _ in range(a)]
    for i, j, m, _, n in cl:
        means[i][j], ns[i][j] = m, n

    def marginal(sel):
        tot = sum(c[4] for c in cl if sel(c))
        return sum(c[4] * c[2] for c in cl if sel(c)) / tot, tot

    return twoway._comparisons_core(
        base, means, ns,
        lambda j: marginal(lambda c: c[1] == j),
        lambda i: marginal(lambda c: c[0] == i),
        direction=direction, method=method,
        row_names=row_names, col_names=col_names)


# ---------------------------------------------------------------- payloads

def payload_format(data, options) -> str:
    """The table format of an api payload: options.summary_format,
    options.format or data.format (default 'mean_sd_n')."""
    fmt = (options.get("summary_format") or options.get("format")
           or data.get("format") or "mean_sd_n")
    _check_format(fmt)
    return fmt


def groups_from_payload(data, fmt: str, row: int | None = None):
    """Column-analysis groups from an api payload -> (groups, names).

    data["groups"] = [{"name", "mean", "sd" | "sem" | "cv", "n"}], or
    data["datasets"] = [{"name", "rows": [[subcolumns]]}] with one group
    per dataset taken from `row` (default: the first row holding a mean;
    the guides enter summary data for t tests and one-way ANOVA on one
    row of a grouped table). Format 'replicates' summarizes the stacked
    values of each dataset instead.
    """
    if data.get("groups") is not None:
        gs = list(data["groups"])
        return gs, [g.get("name", f"Group {i}") for i, g in enumerate(gs)]
    groups, names = [], []
    for ds in data["datasets"]:
        rows = _dataset_rows(ds)
        name = ds.get("name", "")
        if fmt == "replicates":
            s = row_summary([v for r in rows for v in (r or [])])
            groups.append({"mean": s["mean"], "sd": s["sd"], "n": s["n"]})
        elif row is not None:
            groups.append(rows[row] if row < len(rows) else [])
        else:
            first = next((r for r in rows if r and _num(r[0]) is not None), [])
            groups.append(first)
        names.append(name)
    return groups, names


def cells_from_payload(data, fmt: str):
    """Two-way cells[row][dataset] from data["datasets"][j]["rows"][row]
    (subcolumn values in format fmt; 'replicates' rows are summarized)."""
    sets = [_dataset_rows(ds) for ds in data["datasets"]]
    n_rows = max((len(r) for r in sets), default=0)
    cells = []
    for i in range(n_rows):
        row = []
        for rows in sets:
            r = rows[i] if i < len(rows) else None
            if r is not None and fmt == "replicates":
                s = row_summary(r)
                r = ({"mean": s["mean"], "sd": s["sd"], "n": s["n"]}
                     if s["mean"] is not None else None)
            row.append(r)
        cells.append(row)
    return cells, "mean_sd_n" if fmt == "replicates" else fmt


def dataset_error_bars(ds, fmt: str, kind: str = "sd", *,
                       ci_level: float = 0.95) -> list[dict]:
    """error_bars for one api dataset: its ys rows read in format fmt, or
    (for an expand_summary_table dataset) its entered rows' format, or
    its mean/sd/n arrays."""
    if "mean" in ds:
        own = ds.get("format")
        if own and own != "replicates" and ds.get("rows") is not None:
            return error_bars(ds["rows"], own, kind, ci_level=ci_level)
        rows = [[m, s, n] for m, s, n in zip(
            ds["mean"], ds.get("sd") or [None] * len(ds["mean"]),
            ds.get("n") or [None] * len(ds["mean"]))]
        return error_bars(rows, "mean_sd_n", kind, ci_level=ci_level)
    return error_bars(_dataset_rows(ds), _dataset_format(ds, fmt), kind,
                      ci_level=ci_level)
