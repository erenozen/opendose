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
from scipy.optimize import least_squares

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
    for seed in seeds:
        try:
            res = least_squares(residuals, [seed[p] for p in free],
                                method="lm", max_nfev=40000)
        except (RuntimeError, ValueError):
            continue
        if not np.all(np.isfinite(res.x)):
            continue
        if best is None or res.cost < best.cost - 1e-12:
            best = res
    if best is None:
        raise ValueError("EC50 shift fit did not converge")
    res = best
    theta = res.x
    ss = float(2 * res.cost)
    s2 = ss / df
    try:
        cov = np.linalg.inv(res.jac.T @ res.jac) * s2
        se_vec = np.sqrt(np.clip(np.diag(cov), 0.0, None))
    except np.linalg.LinAlgError:
        se_vec = np.full(len(free), np.nan)
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
