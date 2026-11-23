"""Dose-response nonlinear regression (back-compat wrapper).

The general fitting machinery lives in nlfit.py; this module keeps the
original dose-response API used by the JSON layer, tests and examples.
See nlfit.py for the Prism references.
"""

from __future__ import annotations

import math

import numpy as np

from . import nlfit

MODELS = {
    "log_inhibitor_vs_response_4pl": ("inhibitor", True, "LogIC50"),
    "log_inhibitor_vs_response_3pl": ("inhibitor", False, "LogIC50"),
    "log_agonist_vs_response_4pl": ("agonist", True, "LogEC50"),
    "log_agonist_vs_response_3pl": ("agonist", False, "LogEC50"),
}

PARAM_ORDER = ["Top", "Bottom", "LogXmid", "HillSlope"]


def model_curve(x, top, bottom, log_xmid, hill_slope):
    """Y = Bottom + (Top-Bottom)/(1+10^((LogXmid-X)*HillSlope))."""
    return nlfit._dr_func(x, {"Top": top, "Bottom": bottom,
                              "LogXmid": log_xmid, "HillSlope": hill_slope})


def fit_dose_response(x_values, y_values, model: str,
                      constraints: dict | None = None, *,
                      weighting: str = "none",
                      ci_method: str = "asymptotic") -> dict:
    if model not in MODELS:
        raise ValueError(f"unknown model: {model}")
    return nlfit.fit_model(x_values, y_values, model,
                           constraints=constraints, weighting=weighting,
                           ci_method=ci_method)


def curve_points(fit: dict, x_min: float, x_max: float, n: int = 200,
                 x_range=None, data_range=None) -> dict:
    """Dense curve for plotting, padded half an X-unit on each side.

    x_range (P-52, the drawn curve's X range): (start, end) in the fit's
    X units, either None for the padded default; the curve then runs from
    start to end in n evenly spaced points, plus the ends of data_range
    (the X range of the points fitted) when they fall inside it, so the
    part beyond the data can be drawn apart from the part within it.
    Each drawn y is the model at its x; "data_range" is returned with
    such a curve. The default call is unchanged."""
    pad = 0.5 if fit.get("x_is_log") else 0.0
    spec = nlfit.MODELS[fit["model"]]
    if x_range is None:
        xs = np.linspace(x_min - pad, x_max + pad, n)
        ys = spec.func(xs, fit["fitted_values"])
        return {"x": xs.tolist(), "y": ys.tolist()}
    lo = x_min - pad if x_range[0] is None else float(x_range[0])
    hi = x_max + pad if x_range[1] is None else float(x_range[1])
    if not (math.isfinite(lo) and math.isfinite(hi)) or lo >= hi:
        raise ValueError(f"the curve's start (X = {lo:g}) must be below its "
                         f"end (X = {hi:g})")
    xs = np.linspace(lo, hi, n)
    out: dict = {}
    if data_range is not None:
        d_lo, d_hi = float(data_range[0]), float(data_range[1])
        ends = [v for v in (d_lo, d_hi) if lo < v < hi]
        xs = np.unique(np.concatenate([xs, ends]))
        out["data_range"] = [d_lo, d_hi]
    with np.errstate(all="ignore"):
        ys = spec.func(xs, fit["fitted_values"])
    out.update(x=xs.tolist(), y=[float(v) if math.isfinite(v) else None
                                 for v in np.asarray(ys, float)],
               x_range=[lo, hi])
    return out
