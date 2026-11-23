"""Schild plot of the EC50-shift (Gaddum/Schild) fit, P-49.

Reference: engine/tests/reference/schild_plot.py (scipy least_squares for
the parallel-curve EC50s, statsmodels OLS for the regression of
log10(DR - 1) on log10[B]; Arunlakshana & Schild 1959, Br J Pharmacol
14:48). The global Gaddum/Schild fit stays the estimator of pA2 and KB.
"""
import json
import math
from pathlib import Path

import pytest

from opendose import api, schild

REF = json.loads((Path(__file__).parent / "reference" / "schild_example.json").read_text())
D = REF["data"]


def payload(antagonist=None, names=None, ys=None, constraints=None):
    ys = ys if ys is not None else D["ys"]
    return {"analysis": "ec50_shift",
            "data": {"x": D["x"], "datasets": [
                {"name": n, "ys": rows} for n, rows in zip(names or D["names"], ys)]},
            "options": {"antagonist": antagonist if antagonist is not None else D["antagonist"],
                        "constraints": constraints or {}}}


@pytest.fixture(scope="module")
def result():
    r = api.analyze(payload())
    assert "error" not in r
    return r


def test_each_curve_ec50_matches_the_independent_parallel_fit(result):
    sp = result["schild_plot"]
    assert "error" not in sp
    logs = [sp["control_log_ec50"]] + [p["log_ec50"] for p in sp["points"]]
    for got, want in zip(logs, REF["parallel"]["log_ec50"]):
        assert got == pytest.approx(want, abs=1e-7)
    for p, want in zip(sp["points"], REF["parallel"]["log_ec50_se"][1:]):
        assert p["log_ec50_se"] == pytest.approx(want, rel=1e-4)
    assert sp["shared"]["HillSlope"] == pytest.approx(REF["parallel"]["hill"], rel=1e-6)
    for p, dr, ly in zip(sp["points"], REF["dose_ratio"], REF["log_dr_minus_1"]):
        assert p["included"]
        assert p["dose_ratio"] == pytest.approx(dr, rel=1e-6)
        assert p["log_dr_minus_1"] == pytest.approx(ly, abs=1e-6)


def test_regression_matches_statsmodels_ols(result):
    reg = result["schild_plot"]["regression"]
    o = REF["ols"]
    assert reg["n"] == 5 and reg["df"] == o["df"] == 3
    # printed values: slope 1.050 (95% CI 0.946 to 1.155), pA2 from the plot 7.425
    assert reg["slope"] == pytest.approx(o["slope"], rel=1e-6)
    assert round(reg["slope"], 3) == 1.050
    assert reg["intercept"] == pytest.approx(o["intercept"], rel=1e-6)
    assert reg["slope_se"] == pytest.approx(o["slope_se"], rel=1e-5)
    assert reg["intercept_se"] == pytest.approx(o["intercept_se"], rel=1e-5)
    for a, b in zip(reg["slope_ci95"], o["slope_ci95"]):
        assert a == pytest.approx(b, rel=1e-5)
    assert [round(v, 3) for v in reg["slope_ci95"]] == [0.946, 1.155]
    for a, b in zip(reg["intercept_ci95"], o["intercept_ci95"]):
        assert a == pytest.approx(b, rel=1e-5)
    assert reg["r_squared"] == pytest.approx(o["r_squared"], rel=1e-8)
    assert reg["t_slope_1"] == pytest.approx(o["t_slope_1"], rel=1e-4)
    assert reg["p_slope_1"] == pytest.approx(o["p_slope_1"], rel=1e-4)
    assert reg["slope_ci_includes_1"] is True
    assert reg["pA2_from_plot"] == pytest.approx(o["pA2_from_plot"], rel=1e-6)


def test_the_global_fit_is_unchanged_and_stays_the_estimator(result):
    # pA2 and KB as fit_ec50_shift gives them, with or without the plot
    gd = [{"name": n, "x": [x for x in D["x"] for _ in range(2)],
           "y": [v for row in rows for v in row]} for n, rows in zip(D["names"], D["ys"])]
    direct = schild.fit_ec50_shift(gd, D["antagonist"])
    for k in ("pA2", "SchildSlope", "LogEC50", "KB"):
        assert result["params"][k]["value"] == direct["params"][k]["value"]
    # the plot's own pA2 is a display: close to the fit's, not the same
    assert result["params"]["pA2"]["value"] == pytest.approx(7.5, abs=0.15)


def test_needs_exactly_one_control_curve():
    no_ctrl = api.analyze(payload(antagonist=[1e-9] + D["antagonist"][1:]))
    assert "exactly one curve without antagonist" in no_ctrl["schild_plot"]["error"]
    assert "enter 0 for the control curve" in no_ctrl["schild_plot"]["error"]
    assert "pA2" in no_ctrl["params"]  # the fit itself still runs
    two = api.analyze(payload(antagonist=[0.0, 0.0] + D["antagonist"][2:]))
    assert "exactly one curve" in two["schild_plot"]["error"]


def test_a_curve_not_shifted_right_is_listed_with_the_reason():
    # the 3e-8 M curve replaced by the control's values: DR about 1
    ys = [D["ys"][0], D["ys"][0]] + D["ys"][2:]
    sp = api.analyze(payload(ys=ys))["schild_plot"]
    first = sp["points"][0]
    if first["dose_ratio"] <= 1:
        assert first["included"] is False and "log(DR - 1) is undefined" in first["reason"]
        assert "log_dr_minus_1" not in first
        assert sp["regression"]["n"] == 4
    else:  # noise put it a hair above 1: kept, with a large negative log(DR - 1)
        assert first["included"] and first["log_dr_minus_1"] < -1


def test_two_points_give_a_line_without_a_ci_and_one_point_none():
    sel = [0, 3, 5]
    sp = api.analyze(payload(antagonist=[D["antagonist"][i] for i in sel],
                             names=[D["names"][i] for i in sel],
                             ys=[D["ys"][i] for i in sel]))["schild_plot"]
    reg = sp["regression"]
    assert reg["n"] == 2 and reg["df"] == 0 and reg["slope_ci95"] is None
    assert reg["slope_ci_includes_1"] is None
    # one antagonist curve (the global fit needs SchildSlope = 1 to be identified)
    sel = [0, 5]
    sp = api.analyze(payload(antagonist=[D["antagonist"][i] for i in sel],
                             names=[D["names"][i] for i in sel],
                             ys=[D["ys"][i] for i in sel],
                             constraints={"SchildSlope": 1.0}))["schild_plot"]
    assert "at least 2 different antagonist concentrations" in sp["error"]
    assert "regression" not in sp


def test_negative_concentration_is_refused():
    sp = schild.schild_plot([{"x": [1], "y": [1]}] * 2, [0.0, -1.0],
                            {"LogEC50": 0, "pA2": 1, "SchildSlope": 1, "Top": 1,
                             "Bottom": 0, "HillSlope": 1})
    assert sp["error"] == "Antagonist concentrations cannot be negative"


def test_units_and_order_invariance():
    o = REF["ols"]
    # the same concentrations in nM: slope unchanged, intercept moves by slope × 9
    nm = api.analyze(payload(antagonist=[b * 1e9 for b in D["antagonist"]]))["schild_plot"]["regression"]
    assert nm["slope"] == pytest.approx(o["slope"], rel=1e-5)
    assert nm["intercept"] == pytest.approx(o["intercept"] - 9 * o["slope"], rel=1e-5)
    assert nm["pA2_from_plot"] == pytest.approx(o["pA2_from_plot"] - 9, rel=1e-5)
    # curves in another order: the same line
    order = [3, 0, 5, 1, 4, 2]
    sp = api.analyze(payload(antagonist=[D["antagonist"][i] for i in order],
                             names=[D["names"][i] for i in order],
                             ys=[D["ys"][i] for i in order]))["schild_plot"]
    assert sp["regression"]["slope"] == pytest.approx(o["slope"], rel=1e-6)
    assert sp["control"] == "Control"


def test_regression_by_formula_on_a_known_line():
    # exact line y = 1.0 x + 7.5 (slope 1, pA2 7.5): no residual, CI collapses on 1
    xs = [-8.0, -7.0, -6.0]
    r = schild.schild_regression(xs, [x + 7.5 for x in xs])
    assert r["slope"] == pytest.approx(1.0) and r["pA2_from_plot"] == pytest.approx(7.5)
    assert r["slope_ci95"][0] == pytest.approx(1.0) and r["slope_ci_includes_1"]
    assert r["t_slope_1"] is None or math.isfinite(r["t_slope_1"])
