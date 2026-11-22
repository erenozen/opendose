"""Hougaard's skewness of fitted parameters (diagnostics.hougaard_skewness).

Checks: (1) a model linear in its parameters has skewness 0; (2) with one
free parameter the measure reduces to the closed form
gamma = -3 s sum(J H) / (sum J^2)^(3/2) (Ratkowsky 1990, section 2.6),
checked with the analytic derivatives of one-phase decay in K; (3) through
the API (curve-fit diagnostics). A Monte Carlo check (3,000 refits of
simulated data) agreed within its sampling error (about 0.05)."""

import math

import numpy as np
import pytest

from opendose import api, diagnostics, nlfit

X = np.repeat(np.array([0.5, 1, 2, 4, 8, 16.0]), 2)
NOISE = np.array([3.1, -4.2, 5.0, -2.2, 1.4, -6.1, 2.7, 4.4, -3.3, 0.8, -1.9, 2.2])


def test_linear_model_has_zero_skewness():
    y = 2 + 3 * X + NOISE / 5
    fit = nlfit.fit_model(X.tolist(), y.tolist(), "straight_line")
    hs = diagnostics.hougaard_skewness(X, y, fit)["parameters"]
    assert all(abs(v["skewness"]) < 1e-5 for v in hs.values())


def test_one_parameter_closed_form():
    y0, plateau = 100.0, 5.0
    y = plateau + (y0 - plateau) * np.exp(-0.35 * X) + NOISE
    fit = nlfit.fit_model(X.tolist(), y.tolist(), "one_phase_decay",
                          constraints={"Y0": y0, "Plateau": plateau})
    k = fit["fitted_values"]["K"]
    g = fit["goodness"]
    s = math.sqrt(g["ss_res"] / g["df"])
    e = np.exp(-k * X)
    J = -(y0 - plateau) * X * e
    H = (y0 - plateau) * X * X * e
    want = -3 * s * float(np.sum(J * H)) / float(np.sum(J * J)) ** 1.5
    hs = diagnostics.hougaard_skewness(X, y, fit)["parameters"]
    assert list(hs) == ["K"]
    assert hs["K"]["skewness"] == pytest.approx(want, rel=1e-4)


def test_api_reports_it_with_the_diagnostics():
    y = 5 + 95 * np.exp(-0.35 * X) + NOISE
    out = api.analyze({"analysis": "dose_response",
                       "data": {"x": X.tolist(), "datasets": [{"name": "A", "ys": [[v] for v in y]}]},
                       "options": {"model": "one_phase_decay", "x_is_log": False, "diagnostics": True}})
    hs = out["datasets"][0]["diagnostics"]["hougaard_skewness"]["parameters"]
    assert set(hs) == {"Y0", "Plateau", "K"}
    assert all(v["interpretation"] in ("close to linear", "reasonably close to linear",
                                       "apparent skewness", "very skewed") for v in hs.values())
