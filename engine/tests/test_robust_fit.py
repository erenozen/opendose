"""Robust nonlinear regression as a fitting method (curve-fitting guide,
"Robust nonlinear regression"): best-fit values only, no SE, CI, bands or
dependency; not combined with weighting, ROUT or mean/SD/n. Also the
constraints the robust step must honour (it is ROUT's first step too):
LogEC50 / LogIC50 under their model name LogXmid, and the 3PL slopes."""

import numpy as np
import pytest

from opendose import api, nlfit

M = "log_agonist_vs_response_4pl"
X = [-9, -8, -7, -6, -5, -4]
RNG = np.random.default_rng(1)


def _y(lx):
    return 10 + 90 / (1 + 10 ** ((-6.5 - lx) * 1.0))


YS = [[_y(v) + RNG.normal(0, 3) for _ in range(3)] for v in X]
YS[2][1] += 60.0                                       # one gross outlier
XS = [v for v in X for _ in range(3)]
YY = [v for r in YS for v in r]


def _fit(**opts):
    return api.analyze({"analysis": "dose_response",
                        "data": {"x": X, "datasets": [{"name": "A", "ys": YS}]},
                        "options": {"model": M, "x_is_log": True, **opts}})


def test_robust_fit_resists_the_outlier_and_reports_values_only():
    ls = _fit()["datasets"][0]["fit"]
    rb = _fit(fit_method="robust")["datasets"][0]["fit"]
    assert rb["fit_method"] == "robust"
    assert abs(rb["params"]["LogEC50"]["value"] + 6.5) < abs(
        ls["params"]["LogEC50"]["value"] + 6.5)
    for name, p in rb["params"].items():
        assert p["se"] is None and p["ci95"] is None, name
    assert rb["params"]["EC50"]["value"] == pytest.approx(
        10 ** rb["params"]["LogEC50"]["value"])
    assert rb["params"]["Span"]["value"] == pytest.approx(
        rb["params"]["Top"]["value"] - rb["params"]["Bottom"]["value"])
    assert rb["goodness"]["r_squared"] is None
    assert rb["goodness"]["rsdr"] > 0
    raw = nlfit.robust_fit(XS, YY, M)
    assert rb["params"]["Top"]["value"] == pytest.approx(
        raw["fitted_values"]["Top"])


def test_least_squares_extras_are_skipped_and_listed():
    d = _fit(fit_method="robust", bands="confidence",
             interpolate_y=[50])["datasets"][0]
    assert d["robust_skipped"] == ["bands", "interpolate_y"]
    assert "bands" not in d and "interpolated_x" not in d


@pytest.mark.parametrize("opts,msg", [
    ({"weighting": "1/Y2"}, "not weighted"),
    ({"rout_q": 0.01}, "not both"),
    ({"fit_method": "lorentz"}, "unknown fit_method"),
])
def test_combinations_robust_cannot_do_are_errors(opts, msg):
    o = {"fit_method": "robust", **opts}
    assert msg in _fit(**o)["error"]


def test_robust_step_honours_renamed_and_3pl_constraints():
    f = nlfit.robust_fit(XS, YY, M, constraints={"LogEC50": -6.0})
    assert f["fitted_values"]["LogXmid"] == -6.0
    f = nlfit.robust_fit(XS, YY, "log_agonist_vs_response_3pl")
    assert f["fitted_values"]["HillSlope"] == 1.0
    r = nlfit.robust_model_fit(XS, YY, M, constraints={"LogEC50": -6.0})
    assert r["params"]["LogEC50"] == {"value": -6.0, "se": None,
                                      "ci95": None, "constrained": True}
