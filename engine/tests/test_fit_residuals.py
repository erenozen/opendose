"""Residual plots for curve fits and linear regression (FEATURE-PLAN
P-11, first part): the residual_check each fitted data set carries.

References (engine/tests/reference/fit_residuals.py, which writes
fit_residuals.json): scipy curve_fit on NIST StRD Misra1a and MGH09 and
on the dose-response example; statsmodels WLS (1/X^2 weights) and OLS on
a straight line. R is not installed; the standardized residual is the
definition of R's residuals(nls, type = "pearson") (weighted residual /
Sy.x), which statsmodels calls resid_pearson.
"""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import numpy as np
import pytest
from scipy import stats

from opendose import api
from opendose.nlfit import fit_model
from opendose.residuals import POINTS_MAX_N, fit_residuals

HERE = Path(__file__).resolve().parent
REF = json.loads((HERE / "reference" / "fit_residuals.json").read_text())
DATA = HERE.parents[1] / "docs" / "validation" / "datasets"

CONC_M = [1e-9, 3.162e-9, 1e-8, 3.162e-8, 1e-7, 3.162e-7, 1e-6, 3.162e-6, 1e-5]
REF_Y = [[98.2, 101.5, 99.1], [97.0, 95.8, 99.9], [93.4, 90.1, 92.7],
         [78.9, 82.3, 80.0], [51.2, 48.7, 50.9], [22.1, 25.6, 24.0],
         [8.9, 10.2, 7.5], [3.1, 4.4, 2.2], [1.0, 0.5, 2.1]]


def _nist_rows(name):
    with open(DATA / f"nist-{name}.csv", newline="") as fh:
        rows = list(csv.DictReader(fh))
    return [float(r["x"]) for r in rows], [float(r["y"]) for r in rows]


def _check(rc, ref, *, rel=1e-6, abs_=1e-9):
    pts = rc["points"]
    assert len(pts) == len(ref["raw"])
    assert [p["x"] for p in pts] == pytest.approx(ref["x"])
    assert [p["raw_residual"] for p in pts] == pytest.approx(ref["raw"], rel=rel, abs=abs_)
    assert [p["residual"] for p in pts] == pytest.approx(ref["plotted"], rel=rel, abs=abs_)
    assert [p["standardized"] for p in pts] == pytest.approx(ref["pearson"], rel=rel, abs=abs_)
    assert rc["pooled_sd"] == pytest.approx(ref["sy_x"], rel=rel)
    # QQ positions: Filliben medians of each residual's rank (scipy probplot)
    osm, _ = stats.probplot(ref["plotted"], dist="norm", fit=False)
    order = np.argsort(np.array([p["residual"] for p in pts]), kind="stable")
    assert [pts[i]["theoretical"] for i in order] == pytest.approx(list(osm), rel=1e-12)


@pytest.mark.parametrize("name, eq, start", [
    ("misra1a", "Y = b1*(1-exp(-b2*x))", {"b1": 500.0, "b2": 0.0001}),
    ("mgh09", "Y = b1*(x^2+x*b2) / (x^2+x*b3+b4)",
     {"b1": 25.0, "b2": 39.0, "b3": 41.5, "b4": 39.0}),
])
def test_nist_residuals_match_scipy_curve_fit(name, eq, start):
    x, y = _nist_rows(name)
    res = api.analyze({"analysis": "dose_response",
                       "data": {"x": x, "datasets": [{"name": name, "ys": [[v] for v in y]}]},
                       "options": {"user_equation": {"text": eq, "rules": start}}})
    ds = res["datasets"][0]
    rc = ds["residual_check"]
    assert rc["kind"] == "fit" and rc["weighted"] is False
    _check(rc, REF[name], rel=1e-5, abs_=1e-8)
    # the plotted residuals are those of the reported fit: SS and Sy.x
    ss = sum(p["raw_residual"] ** 2 for p in rc["points"])
    assert ss == pytest.approx(ds["fit"]["goodness"]["ss_res"], rel=1e-10)
    assert rc["pooled_sd"] == pytest.approx(ds["fit"]["goodness"]["sy_x"], rel=1e-10)
    assert "_residuals" not in ds["fit"]


def _example(options=None):
    return api.analyze({"analysis": "dose_response",
                        "data": {"x": CONC_M, "datasets": [{"name": "Drug A", "ys": REF_Y}]},
                        "options": {"model": "log_inhibitor_vs_response_4pl",
                                    "x_is_log": False, **(options or {})}})


def test_dose_response_example_4pl():
    ds = _example()["datasets"][0]
    rc = ds["residual_check"]
    ref = REF["example_4pl"]
    assert rc["n_qq"] == 27 and len(rc["points"]) == 27
    _check(rc, ref, rel=1e-5, abs_=1e-7)
    assert ds["fit"]["params"]["LogIC50"]["value"] == pytest.approx(
        ref["params"]["LogIC50"], rel=1e-7)
    # pinned at display precision from the scipy reference
    assert round(rc["pooled_sd"], 4) == round(ref["sy_x"], 4) == 1.6095
    sw = stats.shapiro(ref["plotted"])
    assert rc["shapiro"]["W"] == pytest.approx(sw.statistic, rel=1e-6)
    assert rc["shapiro"]["p"] == pytest.approx(sw.pvalue, rel=1e-5)


def test_weighted_line_matches_statsmodels_wls():
    ref = REF["weighted_line"]
    fit = fit_model(ref["x"], ref["y"], "straight_line", weighting="1/X2")
    r = fit["_residuals"]
    assert r["weights"] == pytest.approx(ref["weights"], rel=1e-14)
    rc = fit_residuals(r["x"], r["y"], r["fitted"], n_params=r["n_params"],
                       weights=r["weights"])
    assert rc["weighted"] is True and rc["residual_label"] == "Weighted residual"
    _check(rc, ref, rel=1e-6)
    # the weighted SS the fit minimised, and its Sy.x
    assert sum(p["residual"] ** 2 for p in rc["points"]) == pytest.approx(
        fit["goodness"]["ss_res_weighted"], rel=1e-9)
    assert rc["pooled_sd"] == pytest.approx(fit["goodness"]["sy_x"], rel=1e-9)


def test_weighted_by_predicted_y_uses_final_curve_weights():
    """1/Y^2 weighting from the predicted Y: the weighted SS of the
    residuals equals the fit's weighted SS (weights of the final curve)."""
    ds = _example({"weighting": "1/Y2"})["datasets"][0]
    rc = ds["residual_check"]
    assert rc["weighted"] is True
    wss = sum(p["residual"] ** 2 for p in rc["points"])
    assert wss == pytest.approx(ds["fit"]["goodness"]["ss_res_weighted"], rel=1e-6)
    for p in rc["points"]:
        assert p["residual"] == pytest.approx(p["raw_residual"] / abs(p["fitted"]), rel=1e-12)


def test_linear_regression_matches_statsmodels_ols():
    ref = REF["ols_line"]
    res = api.analyze({"analysis": "linear_regression",
                       "data": {"x": ref["x"], "datasets": [{"name": "A", "ys": [[v] for v in ref["y"]]}]},
                       "options": {}})
    rc = res["datasets"][0]["residual_check"]
    _check(rc, ref, rel=1e-9, abs_=1e-12)
    assert rc["df"] == 8


def test_line_through_point_has_one_parameter():
    res = api.analyze({"analysis": "linear_regression",
                       "data": {"x": [1, 2, 3, 4], "datasets": [{"name": "A", "ys": [[1.1], [1.9], [3.2], [3.9]]}]},
                       "options": {"through_point": [0, 0]}})
    ds = res["datasets"][0]
    rc = ds["residual_check"]
    assert rc["df"] == 3
    assert rc["pooled_sd"] == pytest.approx(ds["fit"]["sy_x"], rel=1e-12)


def test_robust_and_summary_fits_say_why_there_are_none():
    rob = _example({"fit_method": "robust"})["datasets"][0]["residual_check"]
    assert "Lorentzian" in rob["unavailable"]
    summ = api.analyze({"analysis": "dose_response",
                        "data": {"x": CONC_M, "datasets": [{"name": "A", "ys": [
                            [float(np.mean(r)), float(np.std(r, ddof=1)), 3] for r in REF_Y]}]},
                        "options": {"model": "log_inhibitor_vs_response_4pl", "x_is_log": False,
                                    "summary_format": "mean_sd_n"}})
    assert "individual values" in summ["datasets"][0]["residual_check"]["unavailable"]


def test_rout_residuals_leave_the_outliers_out():
    ys = [list(r) for r in REF_Y]
    ys[4][1] = 95.0  # a planted outlier at the midpoint
    ds = api.analyze({"analysis": "dose_response",
                      "data": {"x": CONC_M, "datasets": [{"name": "A", "ys": ys}]},
                      "options": {"model": "log_inhibitor_vs_response_4pl",
                                  "x_is_log": False, "rout_q": 0.01}})["datasets"][0]
    assert ds["rout"]["n_outliers"] == 1
    rc = ds["residual_check"]
    assert rc["n_qq"] == 26 and "ROUT" in rc["note"]


# ------------------------------------------------------------ edge cases

def test_perfect_fit_and_no_df():
    rc = fit_residuals([1, 2, 3], [2, 4, 6], [2, 4, 6], n_params=2)
    assert all(p["standardized"] is None for p in rc["points"])
    assert rc["shapiro"] is None and "equal" in rc["shapiro_note"]
    rc = fit_residuals([1, 2], [2, 4], [2, 4], n_params=2)
    assert rc["pooled_sd"] is None and "degrees of freedom" in rc["warnings"][0]
    assert "Shapiro-Wilk needs at least 3" in rc["shapiro_note"]


@pytest.mark.parametrize("scale", [1e-12, 1e12])
def test_units_scale_residuals_and_keep_standardized(scale):
    ref = REF["ols_line"]
    a = fit_residuals(ref["x"], ref["y"], np.array(ref["y"]) - np.array(ref["raw"]), n_params=2)
    b = fit_residuals(ref["x"], np.array(ref["y"]) * scale,
                      (np.array(ref["y"]) - np.array(ref["raw"])) * scale, n_params=2)
    for p, q in zip(a["points"], b["points"]):
        assert q["residual"] == pytest.approx(p["residual"] * scale, rel=1e-9)
        assert q["standardized"] == pytest.approx(p["standardized"], rel=1e-9)
        assert q["theoretical"] == p["theoretical"]


def test_large_fit_withholds_points():
    n = POINTS_MAX_N + 1
    x = np.arange(n, dtype=float)
    rng = np.random.default_rng(1)
    y = 2 * x + rng.normal(size=n)
    rc = fit_residuals(x, y, 2 * x, n_params=2)
    assert rc["points"] == [] and rc["points_withheld"] is True
    assert "50,000" in rc["unavailable"]
    assert rc["shapiro"]["n"] == n


def test_permuting_points_permutes_residuals():
    ref = REF["ols_line"]
    order = [3, 0, 9, 1, 7, 2, 8, 4, 6, 5]
    f = np.array(ref["y"]) - np.array(ref["raw"])
    a = fit_residuals(ref["x"], ref["y"], f, n_params=2)
    b = fit_residuals([ref["x"][i] for i in order], [ref["y"][i] for i in order],
                      f[order], n_params=2)
    for j, i in enumerate(order):
        assert b["points"][j]["theoretical"] == pytest.approx(a["points"][i]["theoretical"])
        assert b["points"][j]["standardized"] == pytest.approx(a["points"][i]["standardized"])
    assert math.isclose(a["shapiro"]["W"], b["shapiro"]["W"], rel_tol=1e-12)
