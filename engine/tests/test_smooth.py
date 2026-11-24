"""Smoothing, interpolating splines, curve operations and spline
standard curves (opendose.smooth, FEATURE-PLAN P-103).

References (engine/tests/reference/smoothing.py writes smoothing.json):
- R's printed smooth.spline output (R source tests/Examples/
  stats-Ex.Rout.save: ?smooth.spline on cars and y18, and
  ?predict.smooth.spline with df = 6.4). R's sgram.f uses 0.333 for 1/3
  in the penalty; an independent B-spline penalised regression with that
  constant reproduces every printed digit, and with 1/3 gives the exact
  values the engine must match.
- statsmodels lowess (frac = f, it = iter, delta = R's 0.01 x range
  passed explicitly). statsmodels differs from R's clowess only where
  R's rules bite (ties taken in on the right, no 0.001 / 0.999 cut-offs,
  at least 2 positive weights): agreement is checked to 1e-7 where each
  local fit has enough distinct points.
- the natural cubic spline by a tridiagonal solve, and Burden & Faires,
  Numerical Analysis (9th ed., 2011), section 3.5: the natural spline
  through e^x at 0, 1, 2, 3;
- PCHIP derivatives written out from Fritsch & Butland (1984);
- Savitzky-Golay by numpy.polyfit of each window; derivatives and
  integrals of polynomials in closed form.
"""

import csv
import json
import math
import os

import numpy as np
import pytest
from scipy.interpolate import make_smoothing_spline
from statsmodels.nonparametric.smoothers_lowess import lowess as sm_lowess

from opendose import smooth
from opendose.api import analyze
from opendose.assay_stdcurve import standard_curve_qc
from opendose.cox import cox_regression

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "reference", "smoothing.json")) as fh:
    REF = json.load(fh)

SPEED = [4, 4, 7, 7, 8, 9, 10, 10, 10, 11, 11, 12, 12, 12, 12, 13, 13, 13,
         13, 14, 14, 14, 14, 15, 15, 15, 16, 16, 17, 17, 17, 18, 18, 18, 18,
         19, 19, 19, 20, 20, 20, 20, 20, 22, 23, 24, 24, 24, 24, 25]
DIST = [2, 10, 4, 22, 16, 10, 18, 26, 34, 17, 28, 14, 20, 24, 28, 26, 34,
        34, 46, 26, 36, 60, 80, 20, 26, 54, 32, 40, 32, 40, 50, 42, 56, 76,
        84, 36, 46, 68, 32, 48, 52, 56, 64, 66, 54, 70, 92, 93, 120, 85]
Y18 = [1, 2, 3, 5, 4, 7, 6, 5, 4, 3, 4, 6, 8, 10, 10, 10, 10, 10]
RP = REF["r_printed"]


def rel(a, b):
    return abs(a - b) / max(abs(b), 1e-300)


# ------------------------------------------------------------ smoothing spline

def test_reference_reproduces_r_printed_output():
    """The independent B-spline smoother with R's 0.333 reproduces R's
    printed smooth.spline output to the digits printed (so the only
    difference between R and the exact smoother is that constant)."""
    c = REF["bspline_c0333"]
    assert round(c["cars_gcv"]["df"], 6) == RP["cars_gcv"]["df"]
    assert round(c["cars_gcv"]["pen_crit"], 3) == RP["cars_gcv"]["pen_crit"]
    assert round(c["cars_gcv"]["gcv"], 4) == RP["cars_gcv"]["gcv"]
    assert [round(v, 4) for v in c["cars_gcv"]["fitted"][:8]] == RP["cars_gcv"]["fitted_head"]
    assert [round(v, 6) for v in c["cars_gcv"]["leverages"][:8]] == RP["cars_gcv"]["lev_head"]
    assert round(c["cars_df64"]["df"], 6) == RP["cars_df64"]["df"]
    # R printed lambda to 7 digits: the last printed digit may move by 1
    np.testing.assert_allclose(c["cars_df64"]["fitted"], RP["cars_df64"]["fitted"], atol=1.5e-6)
    assert round(c["y18_gcv"]["df"], 6) == RP["y18_gcv"]["df"]
    assert round(c["y18_gcv"]["gcv"], 7) == RP["y18_gcv"]["gcv"]


@pytest.mark.parametrize("case,lam", [("cars_at_r_lambda", RP["cars_gcv"]["lambda"]),
                                      ("cars_at_r_lambda64", RP["cars_df64"]["lambda"])])
def test_spline_at_fixed_lambda_matches_exact_reference(case, lam):
    ux, ybar, w = smooth.collapse_ties(np.array(SPEED, float), np.array(DIST, float))
    t = (ux - ux[0]) / (ux[-1] - ux[0])
    m = smooth._Reinsch(t, ybar, w)
    ref = REF["bspline_exact"][case]
    assert m.df(lam) == pytest.approx(ref["df"], rel=1e-8)
    np.testing.assert_allclose(m.fitted(lam), ref["fitted"], rtol=1e-8, atol=1e-8)
    np.testing.assert_allclose(m.leverages(lam), ref["leverages"], rtol=1e-7, atol=1e-9)
    # the same function scipy's make_smoothing_spline returns
    s = make_smoothing_spline(t, ybar, w=w, lam=lam)
    np.testing.assert_allclose(s(t), m.fitted(lam), rtol=1e-9, atol=1e-9)
    # and R's printed values to within the 0.333 penalty quirk
    r = RP["cars_gcv"] if case == "cars_at_r_lambda" else RP["cars_df64"]
    assert rel(m.df(lam), r["df"]) < 2e-4


def test_gcv_choice_cars():
    r = smooth.smoothing_spline(SPEED, DIST)
    ref = REF["bspline_exact"]["cars_gcv"]
    assert r["chosen_by"] == "gcv"
    assert rel(r["lambda"], ref["lambda"]) < 1e-3
    assert r["df"] == pytest.approx(ref["df"], abs=1e-4)
    assert r["gcv"] == pytest.approx(ref["gcv"], rel=1e-7)
    # R: lambda 0.1112206, df 2.635278, GCV 244.1044
    assert rel(r["lambda"], RP["cars_gcv"]["lambda"]) < 1e-3
    assert rel(r["df"], RP["cars_gcv"]["df"]) < 2e-4
    assert round(r["gcv"], 3) == round(RP["cars_gcv"]["gcv"], 3)
    assert r["n"] == 50 and r["n_x"] == 19


def test_gcv_choice_y18():
    r = smooth.smoothing_spline(list(range(1, 19)), Y18)
    ref = REF["bspline_exact"]["y18_gcv"]
    assert rel(r["lambda"], ref["lambda"]) < 1e-3
    assert r["df"] == pytest.approx(ref["df"], abs=1e-4)
    # R: df 8.494168, GCV 0.7155391
    assert rel(r["df"], RP["y18_gcv"]["df"]) < 1e-4
    assert rel(r["gcv"], RP["y18_gcv"]["gcv"]) < 1e-4


def test_df_mode_hits_the_target():
    r = smooth.smoothing_spline(SPEED, DIST, df=6.4)
    assert r["df"] == pytest.approx(6.4, abs=1e-9)
    assert r["chosen_by"] == "df"
    # R's df = 6.4 search stops at df 6.400884 with lambda 0.0008526606
    assert rel(r["lambda"], RP["cars_df64"]["lambda"]) < 1e-3
    with pytest.raises(smooth.SmoothError, match="more than 2 and less than the 19"):
        smooth.smoothing_spline(SPEED, DIST, df=19)
    with pytest.raises(smooth.SmoothError):
        smooth.smoothing_spline(SPEED, DIST, df=2)


def test_spline_curve_passes_through_fitted_values():
    r = smooth.smoothing_spline(SPEED, DIST)
    cx, cy = np.array(r["curve"]["x"]), np.array(r["curve"]["y"])
    for xv, g in zip(r["x"], r["fitted"]):
        assert cy[np.searchsorted(cx, xv)] == pytest.approx(g, abs=1e-9)


def test_spline_invariances():
    base = smooth.smoothing_spline(SPEED, DIST)
    # X affine change: X is scaled to [0, 1], so nothing changes
    xs = [1000.0 + 0.001 * v for v in SPEED]
    moved = smooth.smoothing_spline(xs, DIST)
    assert moved["lambda"] == pytest.approx(base["lambda"], rel=1e-6)
    np.testing.assert_allclose(moved["fitted"], base["fitted"], rtol=1e-5)
    # Y in other units: the fit scales, lambda and df do not change
    for k in (1e-12, 1e12):
        sc = smooth.smoothing_spline(SPEED, [k * v for v in DIST])
        assert sc["df"] == pytest.approx(base["df"], rel=1e-6)
        np.testing.assert_allclose(np.array(sc["fitted"]) / k, base["fitted"], rtol=1e-6)
    # order of the points does not matter
    perm = np.random.default_rng(3).permutation(len(SPEED))
    sh = smooth.smoothing_spline([SPEED[i] for i in perm], [DIST[i] for i in perm])
    np.testing.assert_allclose(sh["fitted"], base["fitted"], rtol=1e-7)


def test_spline_edge_cases():
    with pytest.raises(smooth.SmoothError, match="at least 4 distinct X"):
        smooth.smoothing_spline([1, 2, 3, 3], [1, 2, 3, 4])
    with pytest.raises(smooth.SmoothError, match="at least 4 distinct X"):
        smooth.smoothing_spline([], [])
    # all Y equal: the fit is that constant
    flat = smooth.smoothing_spline([1, 2, 3, 4, 5, 6], [7.0] * 6)
    np.testing.assert_allclose(flat["fitted"], 7.0, atol=1e-9)
    # a straight line is reproduced whatever lambda
    line = smooth.smoothing_spline([0, 1, 2, 3, 5, 8], [2 * v + 1 for v in [0, 1, 2, 3, 5, 8]])
    np.testing.assert_allclose(line["fitted"], [1, 3, 5, 7, 11, 17], atol=1e-7)
    # missing values are dropped
    r = smooth.smoothing_spline([1, 2, None, 4, 5, 6, 7], [1, 3, 2, None, 5, 4, 6])
    assert r["n"] == 5
    with pytest.raises(smooth.SmoothError, match="at most 500"):
        smooth.smoothing_spline(list(range(501)), list(range(501)))


# ------------------------------------------------------------ LOWESS

def test_lowess_matches_statsmodels_on_cars():
    lw = REF["lowess"]
    x, y = np.array(SPEED, float), np.array(DIST, float)
    d = lw["delta_cars"]
    np.testing.assert_allclose(smooth.lowess_sorted(x, y, 2 / 3, 3, d), lw["cars_f23"], atol=1e-7)
    np.testing.assert_allclose(smooth.lowess_sorted(x, y, 0.2, 3, d), lw["cars_f02"], atol=1e-7)
    np.testing.assert_allclose(smooth.lowess_sorted(x, y, 2 / 3, 0, d), lw["cars_f23_it0"],
                               atol=1e-9)
    # R's default delta is 1% of the X range
    np.testing.assert_allclose(smooth.lowess_sorted(x, y), lw["cars_f23"], atol=1e-7)
    # pinned: lowess(cars)$y begins 4.965459 4.965459 13.124495 13.124495 15.858633
    assert [round(v, 6) for v in smooth.lowess_sorted(x, y)[:5]] == \
        [4.965459, 4.965459, 13.124495, 13.124495, 15.858633]


def test_lowess_matches_statsmodels_random_with_outlier():
    lw = REF["lowess"]
    fit = smooth.lowess_sorted(np.array(lw["random_x"]), np.array(lw["random_y"]), 0.3, 3, 0.0)
    np.testing.assert_allclose(fit, lw["random_f03_it3_delta0"], atol=1e-7)


def test_lowess_input_order_and_missing():
    x = [3, None, 1, 2, 5, 4, 6, 8, 7, 9]
    y = [2.0, 5.0, 1.0, None, 4.0, 3.0, 6.5, 8.0, 7.2, 9.1]
    out = smooth.lowess(x, y)
    assert out[1] is None and out[3] is None
    keep = [i for i in range(10) if x[i] is not None and y[i] is not None]
    xs = np.array([x[i] for i in keep], float)
    ys = np.array([y[i] for i in keep], float)
    o = np.argsort(xs)
    ref = sm_lowess(ys, xs, frac=2 / 3, it=3, delta=0.01 * np.ptp(xs))[:, 1]
    np.testing.assert_allclose([out[keep[k]] for k in o], ref, atol=1e-7)


def test_lowess_properties():
    x = np.linspace(0, 10, 40)
    np.testing.assert_allclose(smooth.lowess_sorted(x, 3 * x - 2), 3 * x - 2, atol=1e-9)
    rng = np.random.default_rng(7)
    y = np.sin(x) + rng.normal(0, 0.2, 40)
    base = smooth.lowess_sorted(x, y)
    for k in (1e-12, 1e12):
        np.testing.assert_allclose(smooth.lowess_sorted(x, k * y) / k, base, rtol=1e-7, atol=1e-9)
        np.testing.assert_allclose(smooth.lowess_sorted(k * x + 5 * k, y), base, rtol=1e-7,
                                   atol=1e-9)
    # all Y equal; n = 0, 1, 2
    np.testing.assert_allclose(smooth.lowess_sorted(x, np.full(40, 4.0)), 4.0)
    assert smooth.lowess_sorted([], []).size == 0
    assert smooth.lowess_sorted([1.0], [5.0]).tolist() == [5.0]
    np.testing.assert_allclose(smooth.lowess_sorted([1.0, 2.0], [5.0, 7.0]), [5.0, 7.0])
    # all X tied: the mean of Y
    np.testing.assert_allclose(smooth.lowess_sorted([2.0] * 4, [1.0, 2.0, 3.0, 6.0], 1.0, 0),
                               3.0)
    with pytest.raises(smooth.SmoothError):
        smooth.lowess([1, 2], [1, 2], f=0)


def test_cox_schoenfeld_smooth_is_the_engine_lowess():
    rows = list(csv.DictReader(open(os.path.join(HERE, "fixtures", "lung.csv"))))
    time = [float(r["time"]) for r in rows]
    event = [r["status"] == "2" for r in rows]
    r = cox_regression(time, event, {"age": [float(r["age"]) for r in rows],
                                     "sex": [float(r["sex"]) for r in rows]})
    sch = r["schoenfeld"]
    tt = sch["transformed_time"]
    res = np.array(sch["residuals"])
    assert len(sch["smooth"]) == 2 and len(sch["smooth"][0]) == len(tt) == 165
    for j in range(2):
        assert sch["smooth"][j] == smooth.lowess(tt, res[:, j].tolist())
        o = np.argsort(tt, kind="stable")
        ref = sm_lowess(res[o, j], np.array(tt)[o], frac=2 / 3, it=3,
                        delta=0.01 * np.ptp(tt))[:, 1]
        np.testing.assert_allclose(np.array(sch["smooth"][j])[o], ref, atol=1e-6)
    assert len(sch["smooth_scaled"]) == 2


# ------------------------------------------------------------ interpolating curves

def test_natural_spline_and_pchip_and_linear():
    ip = REF["interp"]
    for method, key in (("natural_spline", "natural"), ("pchip", "pchip"), ("linear", "linear")):
        r = smooth.fit_smooth(ip["x"], ip["y"], method, curve_points=35)
        assert r["interpolating"] and r["no_model_ci"]
        f = smooth._interpolant(method, np.array(ip["x"]), np.array(ip["y"]))
        np.testing.assert_allclose(f(np.array(ip["at"])), ip[key], atol=1e-10)
        cx = np.array(r["curve"]["x"])
        np.testing.assert_allclose(np.array(r["curve"]["y"])[np.searchsorted(cx, ip["x"])],
                                   ip["y"], atol=1e-12)


def test_natural_spline_burden_faires():
    x = np.arange(4.0)
    f = smooth._interpolant("natural_spline", x, np.exp(x))
    bf = REF["interp"]["burden_faires_coef"]
    # scipy's PPoly rows are d, c, b, a
    for row, key in zip(f.c, ("d", "c", "b", "a")):
        np.testing.assert_allclose(row, bf[key], atol=6e-6)


def test_interpolating_curve_through_replicate_means():
    r = smooth.fit_smooth([1, 1, 2, 3, 3], [2.0, 4.0, 5.0, 6.0, 8.0], "natural_spline")
    assert r["fitted"] == [3.0, 5.0, 7.0]
    assert "mean Y at each X" in " ".join(r["notes"])
    with pytest.raises(smooth.SmoothError, match="at least 2 distinct X"):
        smooth.fit_smooth([2, 2], [1.0, 3.0], "pchip")
    with pytest.raises(smooth.SmoothError, match="No points"):
        smooth.fit_smooth([None], [1.0], "linear")


def test_pchip_keeps_monotone_data_monotone():
    x = [0.0, 1.0, 2.0, 3.0, 4.0]
    y = [0.0, 0.1, 0.2, 5.0, 5.1]
    r = smooth.fit_smooth(x, y, "pchip")
    assert np.all(np.diff(r["curve"]["y"]) >= -1e-12)
    nat = smooth.fit_smooth(x, y, "natural_spline")
    assert np.any(np.diff(nat["curve"]["y"]) < 0)       # the cubic overshoots


# ------------------------------------------------------------ curve operations

def test_savitzky_golay_matches_window_polyfits():
    sg = REF["savgol"]
    for key, k, order in (("k2_o2", 2, 2), ("k3_o0", 3, 0), ("k3_o4", 3, 4)):
        r = smooth.curve_operation(sg["x"], sg["y"], "smooth", neighbours=k, order=order)
        np.testing.assert_allclose(r["y"], sg[key], atol=1e-10)
        assert not r["notes"]


def test_derivative_and_integral():
    c = REF["calculus"]
    d = smooth.curve_operation(c["x"], c["y_quadratic"], "derivative")
    np.testing.assert_allclose(d["y"][1:-1], c["derivative_interior"], atol=1e-12)
    i = smooth.curve_operation(c["x"], c["y_linear"], "integral")
    np.testing.assert_allclose(i["y"], c["integral_linear"], atol=1e-12)
    # units: Y x 1000 scales both; X in other units scales the derivative
    # by 1/k and the integral by k
    d2 = smooth.curve_operation([10 * v for v in c["x"]], c["y_quadratic"], "derivative")
    np.testing.assert_allclose(np.array(d2["y"]) * 10, d["y"], rtol=1e-12)
    i2 = smooth.curve_operation([10 * v for v in c["x"]], c["y_linear"], "integral")
    np.testing.assert_allclose(np.array(i2["y"]) / 10, i["y"], rtol=1e-12)


def test_curve_operation_edges():
    with pytest.raises(smooth.SmoothError, match="at least 5 distinct X"):
        smooth.curve_operation([1, 2, 3], [1, 2, 3], "smooth", neighbours=2)
    with pytest.raises(smooth.SmoothError, match="from 0 to 4"):
        smooth.curve_operation(list(range(9)), list(range(9)), "smooth", neighbours=2, order=5)
    with pytest.raises(smooth.SmoothError, match="at least 2 distinct X"):
        smooth.curve_operation([1], [1], "derivative")
    assert smooth.curve_operation([4], [2], "integral")["y"] == [0.0]
    r = smooth.curve_operation([0, 1, 1, 2, 3, 5, 6, 7], [0, 1, 3, 4, 5, 6, 7, 8], "smooth",
                               neighbours=1, order=0)
    assert any("averaged" in n for n in r["notes"])
    assert any("not equally spaced" in n for n in r["notes"])


# ------------------------------------------------------------ API

def test_api_smooth_xy():
    data = {"x": [1, 2, 3, 4, 5, 6, None],
            "datasets": [{"name": "A", "ys": [[1, 1.2], [2, 2.1], [2.5, None], [4, 4.4],
                                              [5.1, 4.9], [6, 6.3], [9, 9]]},
                         {"name": "B", "ys": [[1], [None], [None], [None], [None], [None],
                                              [None]]}]}
    r = analyze({"analysis": "smooth_xy", "data": data,
                 "options": {"method": "smoothing_spline"}})
    assert r["no_model_ci"] is True and "no model-based confidence interval" in r["note"]
    a = r["datasets"][0]["fit"]
    assert a["n"] == 11 and a["n_x"] == 6
    assert "at least 2 distinct X" in r["datasets"][1]["error"]
    lw = analyze({"analysis": "smooth_xy", "data": data,
                  "options": {"method": "lowess", "span": 0.5, "iterations": 2}})
    f = lw["datasets"][0]["fit"]
    xs, ys = [], []
    for xv, row in zip(data["x"], data["datasets"][0]["ys"]):
        for v in row:
            if xv is not None and v is not None:
                xs.append(xv)
                ys.append(v)
    ref = sm_lowess(ys, xs, frac=0.5, it=2, delta=0.05)
    first = [int(np.flatnonzero(ref[:, 0] == v)[0]) for v in f["x"]]
    np.testing.assert_allclose(f["fitted"], ref[first, 1], atol=1e-7)
    assert f["points_per_fit"] == 5
    assert "unknown smoothing method" in analyze(
        {"analysis": "smooth_xy", "data": data, "options": {"method": "loess"}})["error"]


def test_api_curve_ops_maps_rows_back():
    data = {"x": [3, 1, 2, None, 4, 5],
            "datasets": [{"name": "A", "ys": [[3, 3], [1, None], [2, 2], [7, 7], [None], [5]]}]}
    r = analyze({"analysis": "curve_ops", "data": data, "options": {"op": "integral"}})
    rows = r["datasets"][0]["rows"]
    # increasing X 1, 2, 3, 5 with Y = X: area X^2/2 - 1/2
    assert rows == [4.0, 0.0, 1.5, None, None, 12.0]
    d = analyze({"analysis": "curve_ops", "data": data, "options": {"op": "derivative"}})
    assert d["datasets"][0]["rows"] == pytest.approx([1.0, 1.0, 1.0, None, None, 1.0])
    s = analyze({"analysis": "curve_ops", "data": data,
                 "options": {"op": "smooth", "neighbours": 3}})
    assert "at least 7 distinct X" in s["datasets"][0]["error"]


# ------------------------------------------------------------ standard curves

STDS = [{"concentration": c, "signals": s} for c, s in [
    (0, [0.05, 0.06]), (15.6, [0.11, 0.12]), (31.25, [0.18, 0.19]), (62.5, [0.32, 0.30]),
    (125, [0.55, 0.57]), (250, [0.98, 1.02]), (500, [1.62, 1.66]), (1000, [2.35, 2.31])]]
UNK = [{"name": "A", "signals": [0.75, 0.77], "dilution": 2},
       {"name": "B", "signals": [3.0]}, {"name": "C", "signals": [0.07]}]


@pytest.mark.parametrize("model", ["spline", "point_to_point"])
def test_spline_standard_curve_interpolates_without_ci(model):
    r = standard_curve_qc(STDS, UNK, model=model, blank="zero_standard")
    assert r["no_model_ci"] is True and r["fit"]["no_model_ci"] is True
    assert r["fit"]["params"] == {} and r["weighting"] == "none"
    blank = 0.055
    levels = [(math.log10(s["concentration"]), np.mean(s["signals"]) - blank)
              for s in STDS if s["concentration"] > 0]
    kind = "spline" if model == "spline" else "point_to_point"
    curve = smooth.InterpolatingCurve(kind, [a for a, _ in levels], [b for _, b in levels])
    a = r["unknowns"][0]
    assert a["status"] == "ok" and a["concentration_ci"] is None and a["corrected_ci"] is None
    # reading the curve at the answer gives the unknown's signal back
    assert float(curve(math.log10(a["concentration"]))) == pytest.approx(0.76 - blank, abs=1e-9)
    assert a["corrected"] == pytest.approx(2 * a["concentration"])
    assert r["unknowns"][1]["status"] == ">ULOQ"      # above the top standard: not extrapolated
    assert r["unknowns"][2]["status"] == "<LLOQ"
    assert any("no model-based confidence interval" in w for w in r["warnings"])
    # point to point: linear between the two levels around 0.705
    if model == "point_to_point":
        (x0, y0), (x1, y1) = levels[3], levels[4]
        want = 10 ** (x0 + (x1 - x0) * (0.705 - y0) / (y1 - y0))
        assert a["concentration"] == pytest.approx(want, rel=1e-12)


def test_spline_standard_curve_never_inverts_two_ways():
    stds = [{"concentration": c, "signals": [s]} for c, s in
            [(1, 0.1), (10, 1.0), (100, 0.8), (1000, 2.0)]]
    r = standard_curve_qc(stds, [{"name": "X", "signals": [0.9]}], model="spline")
    u = r["unknowns"][0]
    assert u["status"] == "ambiguous" and u["concentration"] is None
    assert any("read two or more concentrations" in w for w in r["warnings"])


def test_spline_parallelism_has_no_f_test():
    unk = [{"name": "S", "signals": [0.9], "dilution": 1}, {"name": "S", "signals": [0.47],
                                                           "dilution": 2}]
    r = standard_curve_qc(STDS, unk, model="spline", blank="zero_standard")
    p = r["parallelism"][0]
    assert p["f_test"] is None and "no parameters" in p["f_test_note"]
    assert p["cv_pct"] is not None


def test_spline_standard_curve_on_concentration_scale_and_invariance():
    lin = standard_curve_qc(STDS, UNK, model="spline", blank="zero_standard", log_x=False)
    assert lin["log_x"] is False and lin["unknowns"][0]["status"] == "ok"
    # concentrations in other units scale the answer and nothing else
    scaled = [{"concentration": 1000 * s["concentration"], "signals": s["signals"]} for s in STDS]
    r1 = standard_curve_qc(STDS, UNK, model="spline", blank="zero_standard")
    r2 = standard_curve_qc(scaled, UNK, model="spline", blank="zero_standard")
    assert r2["unknowns"][0]["concentration"] == pytest.approx(
        1000 * r1["unknowns"][0]["concentration"], rel=1e-9)


def test_kit_elisa_spline_matches_reference():
    """The example ELISA (stdcurve/sample.ts) with the 7.81 standard left
    out, read off the spline and the straight lines: e2e-assays asserts
    these numbers on the results sheet (S1 47.6 pg/mL, 95.2 after 1:2)."""
    std = [(1000, [2.343, 2.267]), (500, [2.074, 2.083]), (250, [1.541, 1.566]),
           (125, [1.142, 1.13]), (62.5, [0.724, 0.71]), (31.25, [0.451, 0.451]),
           (15.63, [0.282, 0.288]), (7.81, [0.236, 0.202])]
    stds = [{"concentration": 0, "signals": [0.063, 0.058]}] + [
        {"concentration": c, "signals": s, **({"exclude": True} if c == 7.81 else {})}
        for c, s in std]
    unk = [{"name": "S1", "signals": [0.603, 0.581], "dilution": 2},
           {"name": "S4", "signals": [1.307, 1.257], "dilution": 2}]
    kit = REF["kit_elisa"]
    for model in ("spline", "point_to_point"):
        r = analyze({"analysis": "stdcurve_qc", "data": {"standards": stds, "unknowns": unk},
                     "options": {"model": model, "blank": "zero_standard"}})
        assert r["no_model_ci"] is True
        for u in r["unknowns"]:
            want = kit[u["name"]][model]
            assert len(want) == 1
            assert u["concentration"] == pytest.approx(want[0], rel=1e-9)
            assert u["corrected"] == pytest.approx(2 * want[0], rel=1e-9)
            assert u["concentration_ci"] is None
    assert round(kit["S1"]["spline"][0], 2) == 47.60
