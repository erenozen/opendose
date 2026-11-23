"""The drawn curve's X range and resolution (FEATURE-PLAN P-52):
dose_response options curve_range and curve_points
(doseresponse.curve_points with x_range).

Validation is by hand evaluation: each drawn y is checked against the
model's equation written out here (Prism's four-parameter logistic,
Y = Bottom + (Top - Bottom) / (1 + 10^((LogIC50 - X) HillSlope)), and
the second-order polynomial), not against the engine's model function.
"""

from __future__ import annotations

import math

import pytest

from opendose import api, doseresponse

# the example dose-response table of e2e-figures (fit_graph.py)
X = [1e-9, 3.162e-9, 1e-8, 3.162e-8, 1e-7, 3.162e-7, 1e-6, 3.162e-6, 1e-5]
Y = [[98.2, 101.5, 99.1], [97.0, 95.8, 99.9], [93.4, 90.1, 92.7],
     [78.9, 82.3, 80.0], [51.2, 48.7, 50.9], [22.1, 25.6, 24.0],
     [8.9, 10.2, 7.5], [3.1, 4.4, 2.2], [1.0, 0.5, 2.1]]


def _fit(**opt):
    r = api.analyze({"analysis": "dose_response",
                     "data": {"x": X, "datasets": [{"name": "A", "ys": Y}]},
                     "options": {"x_is_log": False, **opt}})
    assert "error" not in r, r.get("error")
    return r["datasets"][0]


def _four_pl(p, x):
    return p["Bottom"] + (p["Top"] - p["Bottom"]) / (
        1 + 10 ** ((p["LogXmid"] - x) * p["HillSlope"]))


def test_acceptance_curve_from_log_dose_minus_11():
    """Set the curve range to start at log dose -11: the curve draws
    from -11; each drawn y equals the model at its x."""
    ds = _fit(curve_range=[-11, None])
    c = ds["fit"]["curve"]
    p = ds["fit"]["fitted_values"]
    assert c["x"][0] == -11.0
    assert c["x"][-1] == pytest.approx(math.log10(1e-5) + 0.5)
    assert c["x_range"] == [-11.0, pytest.approx(-4.5)]
    assert c["data_range"] == [pytest.approx(-9.0), pytest.approx(-5.0)]
    assert len(c["x"]) == 202          # 200 points + both ends of the data
    assert all(b > a for a, b in zip(c["x"], c["x"][1:]))
    for x, y in zip(c["x"], c["y"]):
        assert y == pytest.approx(_four_pl(p, x), rel=1e-12, abs=1e-12)
    # both ends of the data are drawn points: the dotted parts join there
    assert pytest.approx(-9.0) in c["x"] and pytest.approx(-5.0) in c["x"]


def test_the_fit_and_its_reported_numbers_do_not_move():
    base = _fit(interpolate_y=[50.0], absolute_ic50_level=50.0,
                bands="confidence")
    wide = _fit(interpolate_y=[50.0], absolute_ic50_level=50.0,
                bands="confidence", curve_range=[-12, -2], curve_points=1000)
    assert wide["fit"]["params"] == base["fit"]["params"]
    assert wide["fit"]["goodness"] == base["fit"]["goodness"]
    assert wide["interpolated_x"] == base["interpolated_x"]
    # bands follow the drawn curve
    assert wide["bands"]["x"] == wide["fit"]["curve"]["x"]
    assert len(wide["fit"]["curve"]["x"]) == 1002
    assert wide["fit"]["curve"]["x"][-1] == -2.0


def test_default_curve_is_unchanged():
    ds = _fit()
    c = ds["fit"]["curve"]
    assert set(c) == {"x", "y"} and len(c["x"]) == 200
    ref = doseresponse.curve_points(ds["fit"], -9.0, math.log10(1e-5))
    assert c["x"] == ref["x"] and c["y"] == ref["y"]
    # points only: same range, 50 points, no data ends inside the padding
    ds = _fit(curve_points=50)
    assert len(ds["fit"]["curve"]["x"]) == 52
    assert ds["fit"]["curve"]["x"][0] == pytest.approx(-9.5)


def test_inside_the_data_draws_no_extension():
    ds = _fit(curve_range=[-8, -6])
    c = ds["fit"]["curve"]
    assert c["x"][0] == -8.0 and c["x"][-1] == -6.0 and len(c["x"]) == 200
    assert c["data_range"] == [pytest.approx(-9.0), pytest.approx(-5.0)]


def test_polynomial_in_raw_units():
    x = [0, 125, 250, 500, 1000, 1500, 2000]
    y = [0.098, 0.214, 0.321, 0.522, 0.876, 1.170, 1.405]
    r = api.analyze({"analysis": "dose_response",
                     "data": {"x": x, "datasets": [{"name": "BCA",
                                                    "ys": [[v] for v in y]}]},
                     "options": {"model": "polynomial_second",
                                 "curve_range": [-500, 2500],
                                 "curve_points": 31}})
    f = r["datasets"][0]["fit"]
    c = f["curve"]
    p = f["fitted_values"]
    # the data ends 0 and 2000 are grid points already: not added twice
    assert c["x"][0] == -500 and c["x"][-1] == 2500 and len(c["x"]) == 31
    assert 0.0 in c["x"] and 2000.0 in c["x"]
    assert c["data_range"] == [0.0, 2000.0]
    for xv, yv in zip(c["x"], c["y"]):
        assert yv == pytest.approx(p["B0"] + p["B1"] * xv + p["B2"] * xv ** 2,
                                   rel=1e-12, abs=1e-14)


@pytest.mark.parametrize("opt, message", [
    ({"curve_range": [-5, -9]}, "start (X = -5) must be below its end"),
    ({"curve_range": [-6, -6]}, "must be below its end"),
    ({"curve_points": 5}, "whole number of points from 10 to 5000"),
    ({"curve_points": 10001}, "whole number of points from 10 to 5000"),
    ({"curve_points": 25.5}, "whole number of points"),
    ({"curve_range": [-3]}, "curve_range must be [start, end]"),
])
def test_bad_options_say_what_to_enter(opt, message):
    r = api.analyze({"analysis": "dose_response",
                     "data": {"x": X, "datasets": [{"name": "A", "ys": Y}]},
                     "options": {"x_is_log": False, **opt}})
    assert message in r["error"]


def test_one_sided_start_beyond_the_default_end():
    """Start above the padded end with no end typed: said per data set."""
    ds = api.analyze({"analysis": "dose_response",
                      "data": {"x": X, "datasets": [{"name": "A", "ys": Y}]},
                      "options": {"x_is_log": False,
                                  "curve_range": [0, None]}})["datasets"][0]
    assert "must be below its end (X = -4.5)" in ds["error"]


def test_far_extension_keeps_finite_values():
    ds = _fit(curve_range=[-30, 10], curve_points=400)
    c = ds["fit"]["curve"]
    p = ds["fit"]["fitted_values"]
    assert all(y is not None and math.isfinite(y) for y in c["y"])
    assert c["y"][0] == pytest.approx(p["Top"], rel=1e-9)
    assert c["y"][-1] == pytest.approx(p["Bottom"], rel=1e-6)


def test_user_equation_takes_the_range():
    r = api.analyze({"analysis": "dose_response",
                     "data": {"x": X, "datasets": [{"name": "A", "ys": Y}]},
                     "options": {"x_is_log": False, "curve_range": [-10, -4],
                                 "user_equation": {
                                     "text": "Y = Bottom + (Top-Bottom)/(1+10^((LogIC50-X)*HillSlope))",
                                     "x_is_log": True,
                                     "rules": {"Top": {"initial": "YMAX"},
                                               "Bottom": {"initial": "YMIN"},
                                               "LogIC50": {"initial": "XMID"},
                                               "HillSlope": {"initial": "-1"}}}}})
    assert "error" not in r, r.get("error")
    c = r["datasets"][0]["fit"]["curve"]
    assert c["x"][0] == -10.0 and c["x"][-1] == -4.0
