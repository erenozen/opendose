"""Global (shared-parameter) nonlinear regression.

Prism reference: curve-fitting guide, "Global nonlinear regression";
fit a family of datasets at once, with chosen parameters shared (one
value for all datasets) and the rest individual. The classic uses:
shared Top/Bottom across dose-response curves, or shared Bottom in
competition binding. Prism reports one column per dataset plus a
"global (shared)" column, and a pooled goodness of fit.

Statistics use the pooled residual: df = N_total - (number of distinct
fitted parameters); SEs from the combined Jacobian, 95% CIs t-based,
matching the asymptotic method validated for single fits.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats
from scipy.optimize import least_squares

from .nlfit import MODELS, _clean_xy, _weights


def fit_global(datasets, model: str, shared: list[str], *,
               constraints: dict | None = None,
               weighting: str = "none") -> dict:
    """datasets: [{"name": str, "x": [...], "y": [...]}, ...]
    shared: parameter names with one common value across datasets.
    constraints: {param: value} fixed for every dataset."""
    if model not in MODELS:
        raise ValueError(f"unknown model: {model}")
    spec = MODELS[model]
    constraints = {k: float(v) for k, v in (constraints or {}).items()}
    for name in shared:
        if name not in spec.params:
            raise ValueError(f"unknown shared parameter: {name}")

    data = []
    for ds in datasets:
        x, y = _clean_xy(ds["x"], ds["y"])
        if x.size == 0:
            raise ValueError(f"dataset {ds.get('name', '')!r} has no data")
        data.append((ds.get("name", ""), x, y))
    n_sets = len(data)
    n_total = sum(x.size for _, x, _ in data)

    # Parameter layout: shared params once, individual params per dataset.
    layout: list[tuple[str, int | None]] = []  # (param, dataset index|None)
    for p in spec.params:
        if p in constraints:
            continue
        if p in shared:
            layout.append((p, None))
        else:
            layout.extend((p, i) for i in range(n_sets))
    n_free = len(layout)
    df = n_total - n_free
    if df < 1:
        raise ValueError("not enough data points for the free parameters")

    def params_for(theta, i):
        p = dict(constraints)
        for (name, owner), v in zip(layout, theta):
            if owner is None or owner == i:
                p[name] = v
        return p

    def residuals(theta):
        parts = []
        for i, (_, x, y) in enumerate(data):
            yhat = spec.func(x, params_for(theta, i))
            w = _weights(x, yhat if weighting in ("1/Y", "1/Y2") else x,
                         weighting)
            parts.append((y - yhat) * np.sqrt(w))
        return np.concatenate(parts)

    theta0 = []
    inits = [spec.initials(x, y) for _, x, y in data]
    for name, owner in layout:
        if owner is None:
            theta0.append(float(np.mean([init[name] for init in inits])))
        else:
            theta0.append(inits[owner][name])

    res = least_squares(residuals, theta0, method="lm", max_nfev=40000)
    if not res.success and res.status <= 0:
        raise ValueError("global fit did not converge")
    theta = res.x
    wss = float(2 * res.cost)
    s2 = wss / df
    try:
        cov = np.linalg.inv(res.jac.T @ res.jac) * s2
        se_vec = np.sqrt(np.clip(np.diag(cov), 0.0, None))
    except np.linalg.LinAlgError:
        se_vec = np.full(n_free, np.nan)
    tcrit = float(stats.t.ppf(0.975, df))

    def entry(idx):
        v, se = float(theta[idx]), float(se_vec[idx])
        return {"value": v, "se": se,
                "ci95": [v - tcrit * se, v + tcrit * se],
                "constrained": False,
                "shared": layout[idx][1] is None}

    per_dataset = []
    for i, (name, x, y) in enumerate(data):
        params = {}
        for idx, (pname, owner) in enumerate(layout):
            if owner is None or owner == i:
                display = pname
                if pname == "LogXmid":
                    display = ("LogIC50" if "IC50" in spec.equation
                               else "LogEC50")
                params[display] = entry(idx)
        for pname, v in constraints.items():
            params[pname] = {"value": v, "se": None, "ci95": None,
                             "constrained": True, "shared": False}
        # derived linear-space midpoint
        fitted = params_for(theta, i)
        if "LogXmid" in spec.params and "LogXmid" not in constraints:
            label = "IC50" if "IC50" in spec.equation else "EC50"
            idx = next(j for j, (n2, o2) in enumerate(layout)
                       if n2 == "LogXmid" and (o2 is None or o2 == i))
            lo, hi = entry(idx)["ci95"]
            params[label] = {"value": 10.0 ** fitted["LogXmid"], "se": None,
                            "ci95": [10.0 ** lo, 10.0 ** hi],
                            "constrained": False, "derived": True,
                            "shared": layout[idx][1] is None}
        yhat = spec.func(x, fitted)
        ss = float(np.sum((y - yhat) ** 2))
        ss_tot = float(np.sum((y - y.mean()) ** 2))
        per_dataset.append({
            "name": name,
            "params": params,
            "fitted_values": fitted,
            "ss_res": ss,
            "r_squared": 1 - ss / ss_tot if ss_tot > 0 else None,
            "n_points": int(x.size),
        })

    return {
        "model": model,
        "label": spec.label,
        "equation": spec.equation,
        "shared": list(shared),
        "datasets": per_dataset,
        "goodness": {
            "df": df, "n_points": n_total,
            "ss_res": float(sum(d["ss_res"] for d in per_dataset)),
            "sy_x": math.sqrt(wss / df),
            "n_parameters": n_free,
        },
        "x_is_log": spec.x_is_log,
    }
