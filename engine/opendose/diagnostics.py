"""Goodness-of-fit diagnostics for nonlinear regression.

Prism references (curve-fitting guide, "Diagnostics tab"):
- Replicates test (lack-of-fit): partitions the residual SS into pure
  error (within-replicate scatter) and lack of fit (curve vs replicate
  means); F = (SS_lof/df_lof)/(SS_pe/df_pe). A small P means the curve
  systematically misses the data.
- Runs test on residuals ordered by X (same combinatorics as linear
  regression's runs test).
- Normality of residuals (Shapiro-Wilk).
- Hougaard's measure of skewness of each fitted parameter (Hougaard
  1985; Ratkowsky 1990, Handbook of Nonlinear Regression Models, section
  2.6): gamma_i = -s^4 sum_jkl L_ij L_ik L_il (W_jkl + W_kjl + W_ljk) /
  (s^2 L_ii)^(3/2), L = (J'J)^-1, W_jkl = sum_u J_uj H_ukl, J and H the
  first and second derivatives of the model at the fit (central
  differences), s^2 = SS residual / df. |gamma| < 0.1: the estimate
  behaves almost as in a linear model; 0.1-0.25 reasonably close;
  > 0.25 apparent skewness; > 1 very skewed (Ratkowsky's guide).
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

from .linregress import runs_test
from .nlfit import MODELS


def replicates_test(x, y, fit) -> dict | None:
    """Requires replicates (multiple Y at the same X)."""
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    spec = MODELS[fit["model"]]
    yhat = spec.func(x, fit["fitted_values"])

    # Groups of equal X as contiguous runs of a stable sort, so each group
    # holds its Y values in entry order, exactly as y[x == xv] does, in
    # O(n log n) rather than one pass over all of X per distinct value.
    # (No X, or a missing X (NaN), keeps the original loop: np.unique makes
    # all NaNs one value whose mask x == nan selects nothing.)
    ss_pe = 0.0
    if x.size == 0 or np.isnan(x).any():
        n_distinct = 0
        for xv in np.unique(x):
            grp = y[x == xv]
            n_distinct += 1
            if grp.size > 1:
                ss_pe += float(np.sum((grp - grp.mean()) ** 2))
    else:
        order = np.argsort(x, kind="stable")
        xs, ys = x[order], y[order]
        starts = np.flatnonzero(np.concatenate(([True], xs[1:] != xs[:-1])))
        ends = np.append(starts[1:], xs.size)
        n_distinct = int(starts.size)
        many = ends - starts > 1
        for a, b in zip(starts[many], ends[many]):
            grp = ys[a:b]
            ss_pe += float(np.sum((grp - grp.mean()) ** 2))
    n = x.size
    k_params = n - fit["goodness"]["df"]
    df_pe = n - n_distinct
    df_lof = n_distinct - k_params
    if df_pe < 1 or df_lof < 1:
        return None
    ss_res = float(np.sum((y - yhat) ** 2))
    ss_lof = max(ss_res - ss_pe, 0.0)
    f = (ss_lof / df_lof) / (ss_pe / df_pe) if ss_pe > 0 else float("inf")
    p = float(stats.f.sf(f, df_lof, df_pe))
    return {"ss_lack_of_fit": ss_lof, "df_lack_of_fit": df_lof,
            "ss_pure_error": ss_pe, "df_pure_error": df_pe,
            "F": float(f), "p": p,
            "evidence_of_inadequate_model": bool(p < 0.05)}


def fit_diagnostics(x, y, fit) -> dict:
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    spec = MODELS[fit["model"]]
    order = np.argsort(x, kind="stable")
    resid = (y - spec.func(x, fit["fitted_values"]))[order]

    out: dict = {"replicates_test": replicates_test(x, y, fit),
                 "runs_test": runs_test(np.sign(resid).tolist())}
    if resid.size >= 3:
        w, p = stats.shapiro(resid)
        out["residual_normality"] = {"test": "shapiro_wilk", "W": float(w),
                                     "p": float(p),
                                     "passed_alpha_05": bool(p > 0.05)}
    else:
        out["residual_normality"] = None
    return out


def _skew_label(g: float) -> str:
    a = abs(g)
    return ("close to linear" if a < 0.1 else "reasonably close to linear" if a < 0.25
            else "apparent skewness" if a <= 1 else "very skewed")


def hougaard_skewness(x, y, fit) -> dict | None:
    """Hougaard's skewness of each fitted (free) parameter; see the
    module docstring. None for weighted fits (not computed) or when the
    model has no free parameter."""
    if fit.get("weighting", "none") not in (None, "none"):
        return None
    x = np.asarray(x, float)
    spec = MODELS[fit["model"]]
    vals = dict(fit["fitted_values"])
    free = [k for k, v in (fit.get("params") or {}).items()
            if k in vals and not v.get("constrained") and not v.get("derived")]
    if not free:
        return None
    p = len(free)
    th = np.array([float(vals[k]) for k in free])
    h = 1e-4 * np.maximum(np.abs(th), 1e-3)

    def f(t):
        q = dict(vals)
        q.update(dict(zip(free, t)))
        return np.asarray(spec.func(x, q), float)

    f0 = f(th)
    E = np.eye(p)
    J = np.column_stack([(f(th + h[j] * E[j]) - f(th - h[j] * E[j])) / (2 * h[j]) for j in range(p)])
    H = np.zeros((x.size, p, p))
    for k in range(p):
        H[:, k, k] = (f(th + h[k] * E[k]) - 2 * f0 + f(th - h[k] * E[k])) / (h[k] ** 2)
        for l_ in range(k + 1, p):
            d = (f(th + h[k] * E[k] + h[l_] * E[l_]) - f(th + h[k] * E[k] - h[l_] * E[l_])
                 - f(th - h[k] * E[k] + h[l_] * E[l_]) + f(th - h[k] * E[k] - h[l_] * E[l_])) / (4 * h[k] * h[l_])
            H[:, k, l_] = H[:, l_, k] = d
    try:
        L = np.linalg.inv(J.T @ J)
    except np.linalg.LinAlgError:
        return None
    g = fit["goodness"]
    s2 = float(g["ss_res"]) / float(g["df"]) if g.get("df") else math.nan
    W = np.einsum("uj,ukl->jkl", J, H)
    S = W + W.transpose(1, 0, 2) + W.transpose(2, 1, 0)   # W_jkl + W_kjl + W_ljk
    out = {}
    for i, name in enumerate(free):
        num = float(np.einsum("j,k,l,jkl->", L[i], L[i], L[i], S))
        gam = -s2 * s2 * num / (s2 * L[i, i]) ** 1.5 if L[i, i] > 0 and s2 > 0 else math.nan
        out[name] = {"skewness": gam, "interpretation": _skew_label(gam) if math.isfinite(gam) else None}
    return {"parameters": out, "method": "Hougaard (1985); thresholds from Ratkowsky (1990)"}
