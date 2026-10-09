"""Incomplete-curve flags (need incomplete-curve-flags): range_flags on
dose_response, global_model_fit and global_fit results. The flags read
the fit; no fitted number changes (checked against a direct
nlfit.fit_model call)."""

import pytest

from opendose import nlfit, rangeflags
from opendose.api import analyze

CONC = [0.1, 0.3, 1, 3, 10, 30]  # µM, the highest tested is 30
NOISE = [1, -0.5, 0.8, -1, 0.6, -0.4]


def _ys(ic50):
    return [[100 / (1 + x / ic50) + e, 100 / (1 + x / ic50) - e]
            for x, e in zip(CONC, NOISE)]


def _fit(ys, model, constraints=None):
    r = analyze({"analysis": "dose_response",
                 "data": {"x": CONC, "datasets": [{"name": "A", "ys": ys}]},
                 "options": {"model": model, "x_is_log": False,
                             "constraints": constraints or {}}})
    return r["datasets"][0]["fit"]


@pytest.mark.parametrize("model,constraints", [
    ("log_inhibitor_vs_normalized_response", {}),
    ("log_inhibitor_vs_response_4pl", {"Bottom": 0}),
    ("log_inhibitor_vs_response_4pl", {}),
])
def test_curve_that_never_reaches_half_is_reported_above_top_dose(
        model, constraints):
    fl = _fit(_ys(300.0), model, constraints)["range_flags"]
    assert fl["ec50_above_range"] is True
    assert fl["ec50_in_range"] is False and fl["ec50_below_range"] is False
    assert fl["report_as"] == "> 30"
    assert fl["report_relation"] == ">" and fl["report_value"] == 30.0
    assert fl["crosses_half"] is False
    assert fl["x_units"] == "log10"
    assert fl["range_conc"] == [0.1, 30.0]
    if constraints.get("Bottom") == 0:
        assert fl["bottom_defined"] is True
        assert fl["bottom_reason"] == "constrained"
    if model == "log_inhibitor_vs_response_4pl" and not constraints:
        # the bottom plateau is never approached: its CI is huge
        assert fl["bottom_defined"] is False
    assert any("not reached in the range tested" in n for n in fl["notes"])


def test_complete_curve_flags():
    fl = _fit(_ys(1.0), "log_inhibitor_vs_response_4pl")["range_flags"]
    assert fl["ec50_in_range"] is True
    assert fl["ec50_above_range"] is False
    assert fl["ec50_below_range"] is False
    assert fl["top_defined"] is True and fl["bottom_defined"] is True
    assert fl["crosses_half"] is True
    assert fl["report_as"] is None and fl["notes"] == []


def test_curve_already_past_half_at_lowest_dose():
    fl = _fit(_ys(0.002), "log_inhibitor_vs_normalized_response")[
        "range_flags"]
    assert fl["ec50_below_range"] is True
    assert fl["report_as"] == "< 0.1"


def test_flags_do_not_change_fitted_numbers():
    import math
    ys = _ys(300.0)
    fit = _fit(ys, "log_inhibitor_vs_response_4pl")
    xs, yv = [], []
    for x, row in zip(CONC, ys):
        for v in row:
            xs.append(math.log10(x))
            yv.append(v)
    ref = nlfit.fit_model(xs, yv, "log_inhibitor_vs_response_4pl")
    for name, entry in ref["params"].items():
        assert fit["params"][name]["value"] == entry["value"]


def test_linear_x_model_and_no_midpoint_model():
    params = {"Bottom": {"value": 0.0, "ci95": [-1, 1],
                         "constrained": False},
              "Top": {"value": 100.0, "ci95": [95, 105],
                      "constrained": False},
              "EC50": {"value": 50.0, "ci95": [10, 200],
                       "constrained": False}}
    fl = rangeflags.range_flags(params, [1, 2, 5, 10, 20],
                                [2, 4, 9, 17, 29], x_is_log=False)
    assert fl["ec50_above_range"] and fl["report_as"] == "> 20"
    assert fl["x_units"] == "linear"
    assert rangeflags.range_flags({"Slope": {"value": 1}}, [1, 2], [1, 2],
                                  x_is_log=False) is None


def test_global_model_fit_and_global_fit_carry_flags():
    x = [-1, -0.5, 0, 0.5, 1, 1.4771212547196624]
    data = {"x": x, "datasets": [{"name": "complete", "ys": _ys(1.0)},
                                 {"name": "weak", "ys": _ys(300.0)}]}
    for analysis in ("global_model_fit", "global_fit"):
        r = analyze({"analysis": analysis, "data": data,
                     "options": {"model": "log_inhibitor_vs_response_4pl",
                                 "shared": ["Top", "Bottom"]}})
        assert "error" not in r, r.get("error")
        f0 = r["datasets"][0]["range_flags"]
        f1 = r["datasets"][1]["range_flags"]
        assert f0["ec50_in_range"] is True and f0["report_as"] is None
        assert f1["ec50_above_range"] is True and f1["report_as"] == "> 30"
