"""Interpolated unknowns with inverse-prediction intervals (FEATURE-PLAN
P-22): interpolate.interpolate_unknown and the dose_response option
interpolate_unknowns.

References (engine/tests/reference/interpolate_unknowns.py, which writes
interpolate_unknowns.json; R is not installed):
- an own implementation of investr's inversion intervals on statsmodels
  OLS fits (straight line, BCA quadratic) and a scipy curve_fit
  (nasturtium), sharing no code with the engine;
- Graybill's closed-form inversion interval for a straight line,
  Greenwell & Schubert Kabban (2014) The R Journal 6(1):90-100, eq. 2;
- the paper's published nasturtium example (Section 3.1, and the investr
  README): invest(mod, y0 = c(309, 296, 419), interval = "inversion"):
  estimate 2.263854, interval 1.772244 to 2.969355.
"""

from __future__ import annotations

import json
import pathlib

import numpy as np
import pytest

from opendose import api, interpolate, nlfit

REF = json.loads((pathlib.Path(__file__).parent / "reference"
                  / "interpolate_unknowns.json").read_text())


def _table(case, unknowns, reps=1):
    """Standards then one row per unknown with X left blank."""
    x = list(case["x"]) + [None] * len(unknowns)
    rows = [[float(v)] * reps for v in case["y"]] + [[float(u)] * reps
                                                     for u in unknowns]
    return {"x": x, "datasets": [{"name": "A", "ys": rows}]}


def _fit(case, model, unknowns, **opt):
    r = api.analyze({"analysis": "dose_response",
                     "data": _table(case, unknowns),
                     "options": {"model": model, "interpolate_unknowns": True,
                                 **opt}})
    return r["datasets"][0]


def _close(a, b, rel):
    assert a is not None and b is not None
    assert a == pytest.approx(b, rel=rel, abs=1e-12)


# ---------------------------------------------------------------- BCA

def test_bca_quadratic_three_unknowns_match_the_reference():
    """Acceptance: 7 standards fitted with a quadratic, 3 unknown rows with
    Y only: each X with its 95% CI (and prediction interval)."""
    bca = REF["bca"]
    ds = _fit(bca, "polynomial_second", bca["unknowns"])
    items = ds["interpolation"]["items"]
    assert [i["source"] for i in items] == ["row"] * 3
    assert [i["row"] for i in items] == [7, 8, 9]
    for got, ref in zip(items, bca["results"][:3]):
        assert got["position"] == "within"
        assert got["y"] == ref["y"] and got["m"] == 1
        _close(got["x"], ref["x"], 1e-7)
        for k in ("ci", "pi"):
            _close(got[k][0], ref[k][0], 1e-6)
            _close(got[k][1], ref[k][1], 1e-6)
    # display precision, as the results table prints them
    assert [f"{i['x']:.4g}" for i in items] == ["373", "811.4", "1574"]
    assert [f"{i['ci'][0]:.4g} to {i['ci'][1]:.4g}" for i in items] == [
        "368.6 to 377.3", "804.5 to 818.4", "1565 to 1583"]
    ir = ds["interpolation"]
    assert ir["data_range"] == [0.0, 2000.0]
    assert ir["search_range"] == [-1000.0, 3000.0]
    assert ir["prediction"] is True and ir["x_is_log"] is False
    # the unknowns are not part of the fit; the warning says what they are
    assert ds["fit"]["goodness"]["n_points"] == 7
    assert any("read as unknowns" in w for w in ds["warnings"])


def test_bca_edges_extrapolated_or_out_of_reach():
    """Unknowns outside the standards are flagged, never silently
    reported: above the top standard and below the blank are
    "extrapolated"; a Y the curve never reaches has no X."""
    bca = REF["bca"]
    ds = _fit(bca, "polynomial_second", [], interpolate_y=bca["edges"])
    items = ds["interpolation"]["items"]
    assert [i["source"] for i in items] == ["typed"] * 3
    refs = bca["results"][3:]
    for got, ref in zip(items[:2], refs[:2]):
        assert got["position"] == "extrapolated" == ref["position"]
        _close(got["x"], ref["x"], 1e-7)
        _close(got["ci"][0], ref["ci"][0], 1e-6)
        _close(got["pi"][1], ref["pi"][1], 1e-6)
    assert items[2]["position"] == "none" and items[2]["x"] is None
    assert items[2]["side"] == "above" and "ci" not in items[2]
    # interpolated_x keeps its old meaning (search within the curve range)
    assert ds["interpolated_x"][2] is None


# ---------------------------------------------------------------- line

def test_straight_line_matches_graybill_closed_form():
    line = REF["line"]
    ds = _fit(line, "straight_line", line["unknowns"])
    for got, ref, gb in zip(ds["interpolation"]["items"], line["results"],
                            line["graybill"]):
        _close(got["x"], gb["x"], 1e-9)
        for k in ("ci", "pi"):
            _close(got[k][0], gb[k][0], 1e-6)
            _close(got[k][1], gb[k][1], 1e-6)
            _close(got[k][0], ref[k][0], 1e-6)


# ---------------------------------------------------------------- published

def _nasturtium_fit():
    n = REF["nasturtium"]["data"]
    return nlfit.fit_model([float(v) for v in n["conc"]],
                           [float(v) for v in n["weight"]],
                           "inhibitor_vs_response_variable",
                           constraints={"Bottom": 0.0})


def test_nasturtium_matches_the_published_investr_example():
    """theta1/(1 + exp(theta2 + theta3 log x)) is [Inhibitor] vs. response
    (variable slope) with Bottom = 0: Top = theta1, HillSlope = -theta3."""
    fit = _nasturtium_fit()
    res = interpolate.interpolate_unknown(fit, [309, 296, 419], 0.0, 4.0)
    pub = REF["nasturtium"]["published"]
    assert res["m"] == 3 and res["y"] == pytest.approx(341.3333333)
    assert res["x"] == pytest.approx(pub["estimate"], abs=5e-6)
    assert res["pi"][0] == pytest.approx(pub["lower"], abs=5e-6)
    assert res["pi"][1] == pytest.approx(pub["upper"], abs=2e-5)
    ref = REF["nasturtium"]["mean_of_three"]
    _close(res["pi"][1], ref["pi"][1], 1e-6)
    _close(res["ci"][0], ref["ci"][0], 1e-6)
    _close(res["ci"][1], ref["ci"][1], 1e-6)
    one = interpolate.interpolate_unknown(fit, [309.0], 0.0, 4.0)
    ref1 = REF["nasturtium"]["single"]
    _close(one["x"], ref1["x"], 1e-6)
    for k in ("ci", "pi"):
        _close(one[k][0], ref1[k][0], 1e-6)
        _close(one[k][1], ref1[k][1], 1e-6)
    # the CI (curve only) sits inside the prediction interval
    assert one["pi"][0] < one["ci"][0] < one["x"] < one["ci"][1] < one["pi"][1]


# ---------------------------------------------------------------- edges

def test_log_x_model_reports_concentrations():
    x = [1e-9, 3e-9, 1e-8, 3e-8, 1e-7, 3e-7, 1e-6, 3e-6]
    y = [98, 95, 87, 70, 45, 22, 10, 5]
    data = {"x": x + [None], "datasets": [{"name": "A", "ys": [[v] for v in y]
                                           + [[50.0]]}]}
    r = api.analyze({"analysis": "dose_response", "data": data,
                     "options": {"x_is_log": False,
                                 "interpolate_unknowns": True}})
    ds = r["datasets"][0]
    it = ds["interpolation"]["items"][0]
    assert ds["interpolation"]["x_is_log"] is True
    assert it["x_conc"] == pytest.approx(10 ** it["x"], rel=1e-12)
    assert it["ci_conc"] == pytest.approx([10 ** v for v in it["ci"]], rel=1e-12)
    assert it["pi_conc"][0] < it["ci_conc"][0] < it["x_conc"] < it["ci_conc"][1]
    # the curve at the interpolated X is the unknown's Y
    p = ds["fit"]["fitted_values"]
    yx = nlfit.MODELS[ds["fit"]["model"]].func(np.array([it["x"]]), p)[0]
    assert yx == pytest.approx(50.0, abs=1e-8)


def test_unit_changes_scale_x_and_leave_y_free():
    """X in mg/mL instead of µg/mL: X and its limits scale by 1/1000;
    Y (absorbance) times 10: the same X."""
    bca = REF["bca"]
    base = _fit(bca, "polynomial_second", bca["unknowns"])["interpolation"]
    scaled = dict(bca, x=[v / 1000 for v in bca["x"]])
    sx = _fit(scaled, "polynomial_second", bca["unknowns"])["interpolation"]
    ys = dict(bca, y=[v * 10 for v in bca["y"]])
    sy = _fit(ys, "polynomial_second", [u * 10 for u in bca["unknowns"]])
    for a, b, c in zip(base["items"], sx["items"], sy["interpolation"]["items"]):
        assert b["x"] == pytest.approx(a["x"] / 1000, rel=1e-6)
        assert b["ci"] == pytest.approx([v / 1000 for v in a["ci"]], rel=1e-5)
        assert c["x"] == pytest.approx(a["x"], rel=1e-6)
        assert c["pi"] == pytest.approx(a["pi"], rel=1e-5)


def test_replicates_and_blanks_in_unknown_rows():
    bca = REF["bca"]
    data = _table(bca, [], reps=2)
    data["x"] += [None, None, None]
    data["datasets"][0]["ys"] += [[0.42, None], [None, None], [0.75, 1.21]]
    r = api.analyze({"analysis": "dose_response", "data": data,
                     "options": {"model": "polynomial_second",
                                 "interpolate_unknowns": True}})
    items = r["datasets"][0]["interpolation"]["items"]
    assert [(i["row"], i["sub"]) for i in items] == [(7, 0), (9, 0), (9, 1)]
    assert [i["y"] for i in items] == [0.42, 0.75, 1.21]
    assert any("3 Y values in rows without an X value read as unknowns" in w
               for w in r["datasets"][0]["warnings"])


def test_off_by_default_and_without_unknown_rows():
    bca = REF["bca"]
    r = api.analyze({"analysis": "dose_response",
                     "data": _table(bca, bca["unknowns"]),
                     "options": {"model": "polynomial_second"}})
    ds = r["datasets"][0]
    assert "interpolation" not in ds
    assert any("left out of the fit" in w for w in ds["warnings"])
    ds = _fit(bca, "polynomial_second", [])
    assert "interpolation" not in ds


def test_weighted_fit_gives_no_prediction_interval():
    bca = REF["bca"]
    data = _table(bca, [0.42])
    data["x"][0] = 1.0   # 1/X weighting needs X > 0
    r = api.analyze({"analysis": "dose_response", "data": data,
                     "options": {"model": "polynomial_second",
                                 "weighting": "1/X",
                                 "interpolate_unknowns": True}})
    ir = r["datasets"][0]["interpolation"]
    assert ir["prediction"] is False
    assert ir["items"][0]["pi"] is None and ir["items"][0]["ci"][0] is not None


def test_robust_fit_skips_interpolation():
    bca = REF["bca"]
    r = api.analyze({"analysis": "dose_response",
                     "data": _table(bca, bca["unknowns"]),
                     "options": {"model": "polynomial_second",
                                 "fit_method": "robust",
                                 "interpolate_unknowns": True}})
    ds = r["datasets"][0]
    assert ds["robust_skipped"] == ["interpolate_unknowns"]
    assert "interpolation" not in ds


def test_two_crossings_report_the_first_inside_and_count_them():
    """A parabola through the standards reaches Y twice inside them: the
    smaller X is reported (Prism's first solution) and both counted."""
    x = [0, 1, 2, 3, 4, 5, 6]
    y = [1.0, 6.0, 9.0, 10.0, 9.0, 6.0, 1.0]
    data = {"x": x, "datasets": [{"name": "A", "ys": [[v] for v in y]}]}
    fit = nlfit.fit_model(x, y, "polynomial_second")
    res = interpolate.interpolate_unknown(fit, [6.0], 0.0, 6.0)
    assert res["crossings"] == 2 and res["x"] == pytest.approx(1.0, abs=1e-6)
    r = api.analyze({"analysis": "dose_response", "data": data,
                     "options": {"model": "polynomial_second",
                                 "interpolate_y": [6.0]}})
    assert r["datasets"][0]["interpolation"]["items"][0]["crossings"] == 2


def test_open_limit_when_the_band_never_closes():
    """A perfect line (Sy.x = 0) has a zero-width band; a noisy, nearly
    flat line has a CI that does not close within the range searched:
    that side is None, never an invented limit."""
    x = [1, 2, 3, 4, 5, 6]
    flat = [5.0, 5.4, 4.7, 5.3, 4.9, 5.2]
    fit = nlfit.fit_model(x, flat, "straight_line")
    y0 = fit["fitted_values"]["Yintercept"] + fit["fitted_values"]["Slope"] * 3.5
    res = interpolate.interpolate_unknown(fit, [y0], 1.0, 6.0)
    assert res["position"] == "within"
    assert None in res["ci"]
    exact = nlfit.fit_model(x, [2.0 * v + 1 for v in x], "straight_line")
    res = interpolate.interpolate_unknown(exact, [8.0], 1.0, 6.0)
    assert res["x"] == pytest.approx(3.5, abs=1e-9)
    assert res["ci"][0] == pytest.approx(3.5, abs=1e-6)
    assert res["ci"][1] == pytest.approx(3.5, abs=1e-6)


def test_degenerate_range_has_no_x():
    fit = _nasturtium_fit()
    res = interpolate.interpolate_unknown(fit, [300.0], 2.0, 2.0)
    assert res["x"] is None and res["position"] == "none"
