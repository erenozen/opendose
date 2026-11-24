"""Assay precision and recovery from a run x replicate (x day) design:
repeatability (within-run), between-run, between-day and within-
laboratory (total) variance components with SD, CV and confidence
intervals, the repeatability coefficient, and recovery against a nominal
concentration with chosen acceptance limits.

Variance components: ANOVA (method of moments) estimators of the nested
random model y = mu + day + run(day) + e (CLSI EP05-A3, "Evaluation of
Precision of Quantitative Measurement Procedures", 3rd ed., 2014,
section 5 and appendix; Searle, Casella & McCulloch 1992, Variance
Components, ch. 5, the unbalanced nested expected mean squares), with
Type I (sequential) sums of squares as R's VCA::anovaVCA computes them
(Schuetzenmeister & Dufey, VCA package, CRAN). For unbalanced data the
coefficients of the expected mean squares are

    E[MS_error] = s2_e
    E[MS_run]   = s2_e + k1 s2_run
    E[MS_day]   = s2_e + k2 s2_run + k3 s2_day,

k1 = (N - sum_d sum_r n_dr^2 / n_d) / (R - D), k2 = (sum_d sum_r
n_dr^2 / n_d - sum_dr n_dr^2 / N) / (D - 1), k3 = (N - sum_d n_d^2 /
N) / (D - 1). Without days the model is the one-way random model, n0 =
(N - sum n_r^2 / N) / (R - 1). A negative estimate is reported as zero
(VCA's default) and the result says so.

Confidence intervals (as VCA::VCAinference, which follows EP05-A3):
repeatability and total by the chi-square distribution, the total on
Satterthwaite's df 2 V_total^2 / var(V_total); between-run and between-
day by the Wald interval V +- z SE(V), truncated at zero. var(V) comes
from the linear combination of independent mean squares with
var(MS_k) = 2 MS_k^2 / df_k. SD and CV intervals are the square roots of
the variance interval (CV = 100 SD / mean).

Repeatability coefficient: 1.96 sqrt(2) s_w, the difference two
measurements of the same sample in one run stay within for 95% of pairs
(Bland & Altman 1996, "Measurement error", BMJ 313:744).

Recovery: mean measured / nominal x 100 with its t interval from the
run means, and the bias; accepted when the mean is within the chosen
limits of nominal and the within-run and total CVs are at most the
chosen CV limit (ICH M10, "Bioanalytical method validation", 2022,
section 3.2.5: +-15% and 15% CV, +-20% and 20% at the LLOQ).

Only numpy and scipy are used, so the module runs under Pyodide.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

SOURCES = ("CLSI EP05-A3 (2014); Searle, Casella & McCulloch 1992, ch. 5; "
           "VCA (Schuetzenmeister & Dufey); Bland & Altman 1996, BMJ "
           "313:744; ICH M10 (2022) section 3.2.5")


def _label(v) -> str:
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def _num(v):
    if v is None or isinstance(v, bool):
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def _missing(v) -> bool:
    return v is None or (isinstance(v, str) and not v.strip()) or (
        isinstance(v, float) and math.isnan(v))


def variance_components(values, runs, days=None, *, ci_level=0.95) -> dict:
    """ANOVA estimators, SD, CV and CIs of a run (x day) design. values,
    runs (and days) aligned; run labels are read within their day (run 1
    of two days is two runs)."""
    y = np.asarray(values, float)
    n = y.size
    three = days is not None
    d_lab = [_label(d) for d in days] if three else ["."] * n
    r_lab = [(d, _label(r)) for d, r in zip(d_lab, runs)]
    day_levels = list(dict.fromkeys(d_lab))
    run_levels = list(dict.fromkeys(r_lab))
    D, R = len(day_levels), len(run_levels)
    di = np.array([day_levels.index(d) for d in d_lab])
    ri = np.array([run_levels.index(r) for r in r_lab])
    run_day = np.array([day_levels.index(r[0]) for r in run_levels])
    n_r = np.bincount(ri, minlength=R).astype(float)
    n_d = np.bincount(di, minlength=D).astype(float)
    mean = float(y.mean())
    if R < 2:
        raise ValueError("need at least 2 runs")
    if n - R < 1:
        raise ValueError("need replicates within a run: each run holds one "
                         "value, so repeatability cannot be estimated")
    if three and D < 2:
        raise ValueError("need at least 2 days (or leave the day out)")
    if three and R - D < 1:
        raise ValueError("need more runs than days: with one run per day "
                         "the between-run and between-day variation cannot "
                         "be told apart (leave the day out)")
    run_mean = np.bincount(ri, weights=y, minlength=R) / n_r
    day_mean = np.bincount(di, weights=y, minlength=D) / n_d
    ss_e = float(((y - run_mean[ri]) ** 2).sum())
    df_e = n - R
    ms_e = ss_e / df_e
    sum_r2 = float((n_r ** 2).sum())
    if three:
        ss_run = float((n_r * (run_mean - day_mean[run_day]) ** 2).sum())
        ss_day = float((n_d * (day_mean - mean) ** 2).sum())
        df_run, df_day = R - D, D - 1
        ms_run, ms_day = ss_run / df_run, ss_day / df_day
        s_in = float(sum((n_r[run_day == d] ** 2).sum() / n_d[d] for d in range(D)))
        k1 = (n - s_in) / df_run
        k2 = (s_in - sum_r2 / n) / df_day
        k3 = (n - float((n_d ** 2).sum()) / n) / df_day
        # V = A @ MS  (rows: error, run, day)
        A = np.array([[1.0, 0.0, 0.0],
                      [-1.0 / k1, 1.0 / k1, 0.0],
                      [(k2 / k1 - 1.0) / k3, -k2 / (k1 * k3), 1.0 / k3]])
        ms = np.array([ms_e, ms_run, ms_day])
        dfs = np.array([df_e, df_run, df_day], float)
        names = ["repeatability", "between_run", "between_day"]
        table = [
            {"source": "between days", "df": df_day, "ss": ss_day, "ms": ms_day},
            {"source": "between runs (within days)", "df": df_run,
             "ss": ss_run, "ms": ms_run},
            {"source": "within runs (error)", "df": df_e, "ss": ss_e, "ms": ms_e},
        ]
        coef = {"k1": k1, "k2": k2, "k3": k3}
    else:
        ss_run = float((n_r * (run_mean - mean) ** 2).sum())
        df_run = R - 1
        ms_run = ss_run / df_run
        n0 = (n - sum_r2 / n) / df_run
        A = np.array([[1.0, 0.0], [-1.0 / n0, 1.0 / n0]])
        ms = np.array([ms_e, ms_run])
        dfs = np.array([df_e, df_run], float)
        names = ["repeatability", "between_run"]
        table = [
            {"source": "between runs", "df": df_run, "ss": ss_run, "ms": ms_run},
            {"source": "within runs (error)", "df": df_e, "ss": ss_e, "ms": ms_e},
        ]
        coef = {"n0": n0}
    raw = A @ ms
    cov_ms = np.diag(2.0 * ms ** 2 / dfs)
    cov_v = A @ cov_ms @ A.T
    z = float(stats.norm.ppf(0.5 + ci_level / 2))
    alpha = 1.0 - ci_level
    warnings = []
    comps = {}
    for k, nm in enumerate(names):
        v_raw = float(raw[k])
        v = max(v_raw, 0.0)
        se = math.sqrt(max(cov_v[k, k], 0.0))
        if nm == "repeatability":
            lo = df_e * v / stats.chi2.ppf(1 - alpha / 2, df_e)
            hi = df_e * v / stats.chi2.ppf(alpha / 2, df_e)
            method = f"chi-square on {df_e} df"
        else:
            lo, hi = max(v_raw - z * se, 0.0), max(v_raw + z * se, 0.0)
            method = "Wald (V ± z SE), truncated at 0"
        comps[nm] = {"variance": v, "variance_raw": v_raw, "se": se,
                     "negative": v_raw < 0, "ci_method": method,
                     "variance_ci": [float(lo), float(hi)]}
        if v_raw < 0:
            what = nm.replace("_", "-")
            warnings.append(
                f"The {what} variance is estimated as negative "
                f"({v_raw:.4g}): the runs{' and days' if three else ''} "
                "differ less than the scatter within runs predicts. It is "
                "reported as 0 (its CV is 0); the total uses 0.")
    # total (within-laboratory) precision: the sum of the components kept
    keep = np.array([1.0 if comps[nm]["variance_raw"] >= 0 else 0.0
                     for nm in names])
    w = keep @ A
    v_tot = float(sum(comps[nm]["variance"] for nm in names))
    var_tot = float(w @ cov_ms @ w)
    df_tot = 2.0 * v_tot ** 2 / var_tot if var_tot > 0 else float(df_e)
    comps["total"] = {
        "variance": v_tot, "variance_raw": v_tot, "se": math.sqrt(var_tot),
        "negative": False, "df_satterthwaite": df_tot,
        "ci_method": f"chi-square on Satterthwaite's {df_tot:.4g} df",
        "variance_ci": [float(df_tot * v_tot / stats.chi2.ppf(1 - alpha / 2, df_tot)),
                        float(df_tot * v_tot / stats.chi2.ppf(alpha / 2, df_tot))]}
    for nm, c in comps.items():
        c["sd"] = math.sqrt(c["variance"])
        c["sd_ci"] = [math.sqrt(max(b, 0.0)) for b in c["variance_ci"]]
        if mean != 0:
            c["cv_percent"] = 100.0 * c["sd"] / abs(mean)
            c["cv_ci"] = [100.0 * b / abs(mean) for b in c["sd_ci"]]
        else:
            c["cv_percent"] = None
            c["cv_ci"] = None
        c["percent_of_total"] = 100.0 * c["variance"] / v_tot if v_tot > 0 else None
    if mean == 0:
        warnings.append("The mean is 0, so no CV is given.")
    elif mean < 0:
        warnings.append("The mean is negative: CVs use its absolute value.")
    sw = comps["repeatability"]["sd"]
    rc = float(stats.norm.ppf(0.975)) * math.sqrt(2.0) * sw
    return {"n": int(n), "n_runs": int(R), "n_days": int(D) if three else None,
            "mean": mean, "design": "day / run / replicate" if three
            else "run / replicate",
            "anova": table, "coefficients": coef, "components": comps,
            "repeatability_coefficient": rc,
            "run_means": [float(m) for m in run_mean],
            "run_labels": [r[1] if not three else f"{r[0]} / {r[1]}"
                           for r in run_levels],
            "ci_level": ci_level, "warnings": warnings}


def recovery(values, runs, nominal, *, ci_level=0.95, limit_percent=15.0,
             cv_limit=15.0, cvs=None) -> dict:
    """Mean recovery against the nominal concentration (ICH M10 accuracy)
    with a t interval from the run means, the bias, and the acceptance
    verdicts for the chosen limits."""
    nominal = float(nominal)
    if not nominal > 0:
        raise ValueError("the nominal concentration must be above 0")
    y = np.asarray(values, float)
    labels = [_label(r) for r in runs]
    levels = list(dict.fromkeys(labels))
    means = np.array([y[[i for i, l in enumerate(labels) if l == lv]].mean()
                      for lv in levels])
    k = means.size
    rec = 100.0 * float(y.mean()) / nominal
    out = {"nominal": nominal, "mean": float(y.mean()), "recovery_percent": rec,
           "bias_percent": rec - 100.0, "limit_percent": float(limit_percent),
           "cv_limit_percent": float(cv_limit),
           "per_run_recovery": [100.0 * float(m) / nominal for m in means]}
    if k >= 2:
        se = float(means.std(ddof=1)) / math.sqrt(k)
        t = float(stats.t.ppf(0.5 + ci_level / 2, k - 1))
        m = float(means.mean())
        out["recovery_ci"] = [100.0 * (m - t * se) / nominal,
                              100.0 * (m + t * se) / nominal]
        out["ci_from"] = f"the {k} run means (t on {k - 1} df)"
    else:
        out["recovery_ci"] = None
    acc_ok = abs(rec - 100.0) <= limit_percent
    out["accuracy_accepted"] = bool(acc_ok)
    if cvs is not None:
        within, total = cvs
        out["precision_accepted"] = bool(
            within is not None and total is not None
            and within <= cv_limit and total <= cv_limit)
        out["accepted"] = bool(acc_ok and out["precision_accepted"])
    return out


def precision_study(data, options=None) -> dict:
    """data: {"samples": [{"name", "values", "runs", "days"?, "nominal"?}]}
    or {"records": [{"value", "run", "day"?, "sample"?, "nominal"?}]}.
    options: ci_level, recovery_limit (percent, default 15), cv_limit
    (percent, default 15), use_days (default True when days are given)."""
    options = options or {}
    ci = float(options.get("ci_level", 0.95))
    lim = float(options.get("recovery_limit", 15.0))
    cvl = float(options.get("cv_limit", 15.0))
    samples = data.get("samples")
    if samples is None:
        recs = data.get("records") or []
        by = {}
        for r in recs:
            nm = _label(r.get("sample")) if not _missing(r.get("sample")) else "Sample"
            s = by.setdefault(nm, {"name": nm, "values": [], "runs": [],
                                   "days": [], "nominal": None})
            s["values"].append(r.get("value"))
            s["runs"].append(r.get("run"))
            s["days"].append(r.get("day"))
            if _num(r.get("nominal")) is not None:
                s["nominal"] = _num(r.get("nominal"))
        samples = list(by.values())
    out = []
    for s in samples:
        name = str(s.get("name") or f"Sample {len(out) + 1}")
        vals = s.get("values") or []
        runs = s.get("runs") or []
        days = s.get("days")
        use_days = (options.get("use_days", True) and days is not None
                    and any(not _missing(d) for d in days))
        y, rr, dd = [], [], []
        dropped = 0
        for i, v in enumerate(vals):
            x = _num(v)
            r = runs[i] if i < len(runs) else None
            d = days[i] if use_days and i < len(days) else "."
            if x is None or _missing(r) or (use_days and _missing(d)):
                if not _missing(v):
                    dropped += 1
                continue
            y.append(x)
            rr.append(r)
            dd.append(d)
        entry = {"name": name, "nominal": _num(s.get("nominal"))}
        try:
            vc = variance_components(y, rr, dd if use_days else None, ci_level=ci)
        except ValueError as exc:
            entry["error"] = str(exc)
            out.append(entry)
            continue
        if dropped:
            vc["warnings"].insert(0, f"{dropped} value{'s' if dropped > 1 else ''} "
                                     "without a number, a run or a day left out.")
        entry.update(vc)
        if entry["nominal"] is not None:
            c = vc["components"]
            try:
                entry["recovery"] = recovery(
                    y, [f"{d}/{r}" for d, r in zip(dd, rr)], entry["nominal"],
                    ci_level=ci, limit_percent=lim, cv_limit=cvl,
                    cvs=(c["repeatability"].get("cv_percent"),
                         c["total"].get("cv_percent")))
            except ValueError as exc:
                entry["recovery"] = {"error": str(exc)}
        out.append(entry)
    if not out:
        raise ValueError("no samples")
    return {"analysis": "precision_study", "samples": out, "ci_level": ci,
            "recovery_limit_percent": lim, "cv_limit_percent": cvl,
            "method": ("ANOVA estimators of the nested random model (Type I "
                       "sums of squares); CIs as CLSI EP05-A3 / VCA"),
            "sources": SOURCES}
