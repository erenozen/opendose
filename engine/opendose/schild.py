"""Gaddum/Schild EC50-shift analysis.

Prism curve-fitting guide, "Gaddum/Schild EC50 shift": a family of
agonist dose-response curves, each measured at a different fixed
antagonist concentration B (a data-set constant), fit globally:

    EC50 = 10^LogEC50
    Antag = 1 + (B / 10^(-pA2))^SchildSlope
    LogEC = log(EC50 * Antag)
    Y = Bottom + (Top - Bottom) / (1 + 10^((LogEC - X)*HillSlope))

All parameters (Top, Bottom, HillSlope, LogEC50, pA2, SchildSlope) are
shared across the datasets; only B differs. X is log10(agonist).
Constraining SchildSlope = 1 gives the classic Schild model where
pA2 = -log10(KB).
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats
from . import lsq
from .nlfit import _clean_xy

PARAMS = ["Top", "Bottom", "LogEC50", "HillSlope", "pA2", "SchildSlope"]

EQUATION = ("EC50=10^LogEC50; Antag=1+(B/10^(-pA2))^SchildSlope; "
            "LogEC=log(EC50*Antag); "
            "Y=Bottom + (Top-Bottom)/(1+10^((LogEC-X)*HillSlope))")


def shift_func(x, b, p):
    """Model curve for antagonist concentration b (linear units)."""
    x = np.asarray(x, dtype=float)
    antag = 1.0 + (b / 10.0 ** (-p["pA2"])) ** p["SchildSlope"] if b > 0 else 1.0
    log_ec = p["LogEC50"] + math.log10(antag)
    return p["Bottom"] + (p["Top"] - p["Bottom"]) / (
        1.0 + 10.0 ** ((log_ec - x) * p["HillSlope"]))


def fit_ec50_shift(datasets, antagonist, *, constraints=None) -> dict:
    """datasets: [{"name", "x", "y"}, ...] with X = log10(agonist);
    antagonist: linear concentration B for each dataset (>= one zero/control
    curve recommended). constraints: {param: value} fixed globally."""
    if len(datasets) != len(antagonist):
        raise ValueError("need one antagonist concentration per dataset")
    if len(datasets) < 2:
        raise ValueError("EC50 shift needs at least 2 curves")
    constraints = {k: float(v) for k, v in (constraints or {}).items()}
    for name in constraints:
        if name not in PARAMS:
            raise ValueError(f"unknown parameter: {name}")

    data = []
    for ds, b in zip(datasets, antagonist):
        x, y = _clean_xy(ds["x"], ds["y"])
        if x.size == 0:
            raise ValueError(f"dataset {ds.get('name', '')!r} has no data")
        data.append((ds.get("name", ""), x, y, float(b)))
    n_total = sum(x.size for _, x, _, _ in data)

    free = [p for p in PARAMS if p not in constraints]
    if "SchildSlope" in free and len({b for *_, b in data if b > 0}) < 2:
        # one dose ratio is one point on the Schild plot: pA2 and the
        # slope trade off exactly, and the fit runs off to an overflow
        raise ValueError(
            "One antagonist concentration cannot define a free Schild "
            "slope: a single dose ratio fits any slope with a matching "
            "pA2. Fix the Schild slope at 1, or add curves at two or more "
            "antagonist concentrations.")
    df = n_total - len(free)
    if df < 1:
        raise ValueError("not enough data points for the free parameters")

    all_y = np.concatenate([y for _, _, y, _ in data])
    bs = [b for _, _, _, b in data]
    nonzero = [b for b in bs if b > 0]
    init = {"Top": float(all_y.max()), "Bottom": float(all_y.min()),
            "LogEC50": float(np.median(data[0][1])),
            "HillSlope": 1.0,
            "pA2": -math.log10(min(nonzero)) if nonzero else 6.0,
            "SchildSlope": 1.0}
    init.update(constraints)

    def make_params(theta):
        p = dict(constraints)
        p.update(dict(zip(free, theta)))
        return p

    def residuals(theta):
        p = make_params(theta)
        return np.concatenate([y - shift_func(x, b, p)
                               for _, x, y, b in data])

    best = None
    seeds = [init]
    for shift in (-1.0, 1.0, -2.0, 2.0):  # multi-start on pA2
        if "pA2" in free:
            seeds.append(dict(init, pA2=init["pA2"] + shift))
    all_x = np.concatenate([x for _, x, _, _ in data])
    for seed in seeds:
        # finite-difference scales (lsq module docstring)
        floor = lsq.scale_floor(free, [seed[p] for p in free], all_x, all_y)
        try:
            with np.errstate(all="ignore"):
                res = lsq.solve(residuals, [seed[p] for p in free], floor,
                                max_nfev=40000)
        except (RuntimeError, ValueError):
            continue
        if not np.all(np.isfinite(res.x)):
            continue
        if best is None or res.cost < best[0].cost - 1e-12:
            best = (res, floor)
    if best is None:
        raise ValueError("EC50 shift fit did not converge")
    res, floor = best
    with np.errstate(all="ignore"):
        theta, J = lsq.polish(residuals, res.x, floor)
        f = residuals(theta)
    ss = float(f @ f)
    s2 = ss / df
    cov = lsq.covariance(J, s2)
    se_vec = np.sqrt(np.clip(np.diag(cov), 0.0, None))
    tcrit = float(stats.t.ppf(0.975, df))
    fitted = make_params(theta)

    params = {}
    for name in PARAMS:
        if name in constraints:
            params[name] = {"value": constraints[name], "se": None,
                            "ci95": None, "constrained": True, "shared": True}
        else:
            i = free.index(name)
            v, se = float(theta[i]), float(se_vec[i])
            params[name] = {"value": v, "se": se,
                            "ci95": [v - tcrit * se, v + tcrit * se],
                            "constrained": False, "shared": True}

    derived = {}
    for log_name, lin_name in (("LogEC50", "EC50"), ("pA2", "KB")):
        entry = params[log_name]
        if log_name == "LogEC50":
            value = 10.0 ** entry["value"]
            ci = ([10.0 ** entry["ci95"][0], 10.0 ** entry["ci95"][1]]
                  if entry["ci95"] else None)
        else:  # KB = 10^(-pA2); CI flips
            value = 10.0 ** (-entry["value"])
            ci = ([10.0 ** (-entry["ci95"][1]), 10.0 ** (-entry["ci95"][0])]
                  if entry["ci95"] else None)
        derived[lin_name] = {"value": value, "se": None, "ci95": ci,
                             "constrained": False, "derived": True,
                             "shared": True}

    per_dataset = []
    for name, x, y, b in data:
        yhat = shift_func(x, b, fitted)
        ss_d = float(np.sum((y - yhat) ** 2))
        ss_tot = float(np.sum((y - y.mean()) ** 2))
        antag = 1.0 + (b / 10.0 ** (-fitted["pA2"])) ** fitted["SchildSlope"] \
            if b > 0 else 1.0
        log_ec = fitted["LogEC50"] + math.log10(antag)
        per_dataset.append({
            "name": name, "antagonist": b,
            "log_ec50_observed": log_ec,
            "ec50_observed": 10.0 ** log_ec,
            "dose_ratio": antag,
            "ss_res": ss_d,
            "r_squared": 1 - ss_d / ss_tot if ss_tot > 0 else None,
            "n_points": int(x.size),
        })

    return {
        "model": "ec50_shift",
        "label": "EC50 shift (Gaddum/Schild)",
        "equation": EQUATION,
        "params": {**params, **derived},
        "param_order": PARAMS + list(derived),
        "fitted_values": fitted,
        "datasets": per_dataset,
        "goodness": {"df": df, "n_points": n_total, "ss_res": ss,
                     "sy_x": math.sqrt(ss / df),
                     "n_parameters": len(free)},
        "x_is_log": True,
    }


# ---------------------------------------------------------------- Schild plot

SHARED_SHAPE = ["Top", "Bottom", "HillSlope"]


def parallel_log_ec50(data, start, constraints=None):
    """Each curve's own LogEC50 with Top, Bottom and HillSlope shared (the
    parallel-shift assumption of a Schild analysis; Arunlakshana &
    Schild 1959). data: [(name, x, y, b)], X = log10(agonist); start:
    fitted values of the global Gaddum/Schild fit (initial values);
    constraints: Top / Bottom / HillSlope held at a value. Returns
    (log_ec50 per curve, its SE per curve, shared values)."""
    constraints = {k: float(v) for k, v in (constraints or {}).items()
                   if k in SHARED_SHAPE}
    shape = [p for p in SHARED_SHAPE if p not in constraints]
    k = len(data)
    n_total = sum(x.size for _, x, _, _ in data)
    if n_total - len(shape) - k < 1:
        raise ValueError("not enough data points to fit each curve's EC50")

    def unpack(theta):
        p = dict(constraints)
        p.update(dict(zip(shape, theta[:len(shape)])))
        return p, theta[len(shape):]

    def residuals(theta):
        p, logs = unpack(theta)
        out = []
        for (_, x, y, _), le in zip(data, logs):
            out.append(y - (p["Bottom"] + (p["Top"] - p["Bottom"]) / (
                1.0 + 10.0 ** ((le - x) * p["HillSlope"]))))
        return np.concatenate(out)

    def start_log(b):
        antag = 1.0 + (b / 10.0 ** (-start["pA2"])) ** start["SchildSlope"] \
            if b > 0 else 1.0
        return start["LogEC50"] + math.log10(antag)

    theta0 = [start[p] for p in shape] + [start_log(b) for *_, b in data]
    names = shape + ["LogEC50"] * k
    all_x = np.concatenate([x for _, x, _, _ in data])
    all_y = np.concatenate([y for _, _, y, _ in data])
    floor = lsq.scale_floor(names, theta0, all_x, all_y)
    with np.errstate(all="ignore"):
        res = lsq.solve(residuals, theta0, floor, max_nfev=40000)
        if not np.all(np.isfinite(res.x)):
            raise ValueError("the curve-by-curve EC50 fit did not converge")
        theta, J = lsq.polish(residuals, res.x, floor)
        f = residuals(theta)
    df = n_total - len(theta)
    cov = lsq.covariance(J, float(f @ f) / df)
    se = np.sqrt(np.clip(np.diag(cov), 0.0, None))
    p, logs = unpack(theta)
    return ([float(v) for v in logs], [float(v) for v in se[len(shape):]],
            {q: float(p[q]) for q in SHARED_SHAPE})


def schild_regression(log_b, y):
    """Ordinary least squares of y = log10(DR - 1) on log10[B]: slope,
    intercept, their SEs and t-based 95% CIs (df = n - 2), r^2, the t
    test of slope = 1 (a competitive antagonist's Schild slope), and the
    X intercept read off the line: log KB, so the plot's own estimate of
    pA2 is intercept / slope."""
    x = np.asarray(log_b, dtype=float)
    y = np.asarray(y, dtype=float)
    n = x.size
    sxx = float(np.sum((x - x.mean()) ** 2)) if n else 0.0
    if n < 2 or sxx <= 0:
        raise ValueError("A Schild plot needs at least 2 different antagonist "
                         "concentrations with a dose ratio above 1")
    slope = float(np.sum((x - x.mean()) * (y - y.mean())) / sxx)
    intercept = float(y.mean() - slope * x.mean())
    resid = y - (intercept + slope * x)
    df = n - 2
    out = {"n": int(n), "df": int(df), "slope": slope, "intercept": intercept,
           "pA2_from_plot": intercept / slope if slope != 0 else None}
    syy = float(np.sum((y - y.mean()) ** 2))
    out["r_squared"] = 1.0 - float(resid @ resid) / syy if syy > 0 else None
    if df < 1:
        out.update(slope_se=None, slope_ci95=None, intercept_se=None,
                   intercept_ci95=None, t_slope_1=None, p_slope_1=None,
                   slope_ci_includes_1=None)
        return out
    s2 = float(resid @ resid) / df
    se_b = math.sqrt(s2 / sxx)
    se_a = math.sqrt(s2 * (1.0 / n + x.mean() ** 2 / sxx))
    t = float(stats.t.ppf(0.975, df))
    ci = [slope - t * se_b, slope + t * se_b]
    out.update(slope_se=se_b, slope_ci95=ci, intercept_se=se_a,
               intercept_ci95=[intercept - t * se_a, intercept + t * se_a],
               t_crit=t)
    if se_b > 0:
        tt = (slope - 1.0) / se_b
        out.update(t_slope_1=tt, p_slope_1=float(2 * stats.t.sf(abs(tt), df)))
    else:
        out.update(t_slope_1=None, p_slope_1=None)
    out["slope_ci_includes_1"] = bool(ci[0] <= 1.0 <= ci[1])
    return out


def schild_plot(datasets, antagonist, fitted, constraints=None) -> dict:
    """The Schild plot of an EC50-shift data set (Arunlakshana & Schild
    1959, Br J Pharmacol 14:48): each curve's EC50 from a fit with shared
    Top, Bottom and HillSlope (parallel_log_ec50), the dose ratio
    DR = EC50(B) / EC50(control), and the straight line of log10(DR - 1)
    against log10[B] (schild_regression), with its slope's 95% CI read
    against 1. A display of the data: pA2 and KB stay those of the global
    Gaddum/Schild fit (fit_ec50_shift), which uses every point at once.
    (The global fit's own dose ratios are implied by its pA2 and slope and
    would fall on its line exactly, so the plot does not use them.)

    datasets, antagonist, constraints: as fit_ec50_shift; fitted: its
    fitted_values (initial values here). Needs exactly one control curve
    (B = 0). Curves whose dose ratio is 1 or less have no log(DR - 1) and
    are listed with the reason."""
    data = []
    for ds, b in zip(datasets, antagonist):
        x, y = _clean_xy(ds["x"], ds["y"])
        data.append((ds.get("name", ""), x, y, float(b)))
    if any(d[3] < 0 for d in data):
        return {"error": "Antagonist concentrations cannot be negative"}
    controls = [i for i, d in enumerate(data) if d[3] == 0]
    if len(controls) != 1:
        return {"error": "A Schild plot needs exactly one curve without antagonist "
                         "(concentration 0) to take the dose ratios from"
                         + ("" if controls else "; enter 0 for the control curve")}
    try:
        logs, ses, shape = parallel_log_ec50(data, fitted, constraints)
    except (ValueError, RuntimeError) as e:
        return {"error": f"Could not fit each curve's EC50 for the Schild plot: {e}"}
    c = controls[0]
    points = []
    for i, (name, _, _, b) in enumerate(data):
        if i == c:
            continue
        dr = 10.0 ** (logs[i] - logs[c])
        pt = {"name": name, "antagonist": b, "log_antagonist": math.log10(b),
              "log_ec50": logs[i], "log_ec50_se": ses[i], "dose_ratio": dr,
              "included": dr > 1.0}
        if dr > 1.0:
            pt["log_dr_minus_1"] = math.log10(dr - 1.0)
        else:
            pt["reason"] = ("dose ratio of 1 or less: the curve is not shifted "
                            "right, so log(DR - 1) is undefined")
        points.append(pt)
    used = [p for p in points if p["included"]]
    out = {"control": data[c][0], "control_log_ec50": logs[c],
           "control_log_ec50_se": ses[c], "shared": shape, "points": points}
    try:
        out["regression"] = schild_regression(
            [p["log_antagonist"] for p in used], [p["log_dr_minus_1"] for p in used])
    except ValueError as e:
        out["error"] = str(e)
    return out
