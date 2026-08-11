"""Goodness-of-fit diagnostics for nonlinear regression.

Prism references (curve-fitting guide, "Diagnostics tab"):
- Replicates test (lack-of-fit): partitions the residual SS into pure
  error (within-replicate scatter) and lack of fit (curve vs replicate
  means); F = (SS_lof/df_lof)/(SS_pe/df_pe). A small P means the curve
  systematically misses the data.
- Runs test on residuals ordered by X (same combinatorics as linear
  regression's runs test).
- Normality of residuals (Shapiro-Wilk).
"""

from __future__ import annotations

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

    ss_pe = 0.0
    n_distinct = 0
    for xv in np.unique(x):
        grp = y[x == xv]
        n_distinct += 1
        if grp.size > 1:
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
