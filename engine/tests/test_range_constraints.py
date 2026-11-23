"""Range constraints on built-in models (FEATURE-PLAN P-20): greater
than, less than and between, against engine/tests/reference/
range_constraints.py (scipy least_squares with bounds on the 4PL written
out there). A parameter that ends on its limit is marked "at_bound";
the web says "at its constraint: SE not reliable" in its row."""

import json
from pathlib import Path

import pytest

from opendose import api

HERE = Path(__file__).resolve().parent
REF = json.loads((HERE / "reference" / "range_constraints.json").read_text())

X = [-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5]
ROWS = [
    [101.2, 98.4, 99.6], [97.9, 100.8, 96.5], [95.1, 92.3, 96.8],
    [84.0, 80.2, 86.9], [55.3, 60.8, 52.1], [24.7, 28.9, 21.6],
    [7.9, 3.1, 5.6], [-1.2, 2.4, -3.9], [-4.8, -1.1, -6.3],
]
MODEL = "log_inhibitor_vs_response_4pl"


def _fit(rows=ROWS, x=X, model=MODEL, **options):
    r = api.analyze({"analysis": "dose_response",
                     "data": {"x": x, "datasets": [{"name": "S", "ys": rows}]},
                     "options": {"model": model, "x_is_log": True,
                                 **options}})
    return r["datasets"][0]


@pytest.mark.parametrize("case,bounds", [
    ("free", None),
    ("bottom_gt_0", {"Bottom": [0, None]}),
    ("hill_between", {"HillSlope": [-1, -0.3]}),
    ("bottom_gt_minus_10", {"Bottom": [-10, None]}),
])
def test_matches_scipy_bounded_least_squares(case, bounds):
    ds = _fit(bounds=bounds)
    fit, ref = ds["fit"], REF[case]
    assert fit["goodness"]["df"] == ref["df"]
    assert fit["goodness"]["sy_x"] == pytest.approx(ref["sy_x"], rel=1e-7)
    for name, r in ref["params"].items():
        p = fit["params"][name]
        assert p["value"] == pytest.approx(r["value"], rel=1e-6,
                                           abs=1e-8), name
        assert p["se"] == pytest.approx(r["se"], rel=2e-3), name


def test_acceptance_bottom_greater_than_zero():
    free = _fit()["fit"]["params"]["Bottom"]
    assert free["value"] < 0 and "at_bound" not in free
    fit = _fit(bounds={"Bottom": [0, None]})["fit"]
    b = fit["params"]["Bottom"]
    assert b["value"] == 0.0          # on the limit, not 4e-31
    assert b["at_bound"] == "lower"
    assert fit["bounds"] == {"Bottom": [0.0, None]}
    for name in ("Top", "LogIC50", "HillSlope"):
        assert "at_bound" not in fit["params"][name]


def test_upper_limit_reached_is_marked():
    fit = _fit(bounds={"HillSlope": [-1, -0.3]})["fit"]
    h = fit["params"]["HillSlope"]
    assert h["value"] == -1.0 and h["at_bound"] == "lower"


def test_inactive_limit_equals_free_fit():
    free = _fit()["fit"]["params"]
    fit = _fit(bounds={"Bottom": [-10, None], "Top": [None, 1000]})["fit"]
    for name in ("Bottom", "Top", "LogIC50", "HillSlope"):
        assert fit["params"][name]["value"] == pytest.approx(
            free[name]["value"], rel=1e-7)
        assert "at_bound" not in fit["params"][name]


def test_log_ic50_names_the_midpoint():
    fit = _fit(bounds={"LogIC50": [-6.8, None]})["fit"]
    assert fit["params"]["LogIC50"]["value"] == pytest.approx(-6.8)
    assert fit["params"]["LogIC50"]["at_bound"] == "lower"
    assert fit["bounds"] == {"LogIC50": [-6.8, None]}


def test_response_units_scale_with_the_limit():
    rows = [[v * 1000 for v in r] for r in ROWS]
    fit = _fit(rows=rows, bounds={"Bottom": [0, None]})["fit"]["params"]
    ref = REF["bottom_gt_0"]["params"]
    assert fit["Bottom"]["value"] == 0.0
    assert fit["Top"]["value"] == pytest.approx(1000 * ref["Top"]["value"],
                                                rel=1e-6)
    assert fit["LogIC50"]["value"] == pytest.approx(
        ref["LogIC50"]["value"], rel=1e-7)


@pytest.mark.parametrize("bounds,options,message", [
    ({"Bottom": [5, 1]}, {}, "the lower limit of Bottom (5) must be below "
                             "its upper limit (1)"),
    ({"Bottom": [0, None]}, {"constraints": {"Bottom": 0}},
     "Bottom is held constant and has a range: choose one"),
    ({"Kd": [0, None]}, {}, "unknown parameter"),
    ({"Bottom": [0]}, {}, "needs a lower and an upper limit"),
])
def test_bad_ranges_say_what_to_fix(bounds, options, message):
    ds = _fit(bounds=bounds, **options)
    assert message in ds["error"]


def test_model_range_is_never_widened():
    # Weibull type 1 holds b > 0; a user range of -1 to 5 is 0 to 5
    x = [0, 0, 0.94, 0.94, 1.88, 1.88, 3.75, 3.75, 7.5, 7.5, 15, 15]
    y = [[7.6], [8.0], [7.9], [7.4], [6.5], [6.2], [2.9], [3.2], [1.1],
         [0.9], [0.6], [0.7]]
    r = api.analyze({"analysis": "dose_response",
                     "data": {"x": x, "datasets": [{"name": "S", "ys": y}]},
                     "options": {"model": "weibull1",
                                 "bounds": {"b": [-1, 5]}}})
    fit = r["datasets"][0]["fit"]
    assert fit["bounds"] == {"b": [0.0, 5.0]}
    assert 0 < fit["params"]["b"]["value"] <= 5


def test_robust_and_rout_keep_the_limit():
    rob = _fit(bounds={"Bottom": [0, None]}, fit_method="robust")["fit"]
    assert rob["params"]["Bottom"]["value"] >= 0
    assert rob["params"]["Bottom"]["at_bound"] == "lower"
    rout = _fit(bounds={"Bottom": [0, None]}, rout_q=0.01)["fit"]
    assert rout["params"]["Bottom"]["value"] == 0.0
    assert rout["params"]["Bottom"]["at_bound"] == "lower"
