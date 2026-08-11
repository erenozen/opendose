"""Dose-response nonlinear regression (back-compat wrapper).

The general fitting machinery lives in nlfit.py; this module keeps the
original dose-response API used by the JSON layer, tests and examples.
See nlfit.py for the Prism references.
"""

from __future__ import annotations

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


def curve_points(fit: dict, x_min: float, x_max: float, n: int = 200) -> dict:
    """Dense curve for plotting, padded half an X-unit on each side."""
    pad = 0.5 if fit.get("x_is_log") else 0.0
    xs = np.linspace(x_min - pad, x_max + pad, n)
    spec = nlfit.MODELS[fit["model"]]
    ys = spec.func(xs, fit["fitted_values"])
    return {"x": xs.tolist(), "y": ys.tolist()}
