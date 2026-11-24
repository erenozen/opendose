"""Parameter covariance, correlation and the joint confidence region of two
parameters (FEATURE-PLAN P-102), against engine/tests/reference/
fit_region.py: scipy curve_fit's covariance with the 4PL's analytic
Jacobian, cov2cor by hand, the profile region of LogIC50 and HillSlope
from the exact (linear) profile sum of squares along the same rays and on
a grid, and Beale's region of Michaelis-Menten on R's Puromycin data on a
grid. R (vcov, cov2cor, nlstools::nlsContourRSS) is not installed."""

import json
import math
from pathlib import Path

import numpy as np
import pytest

from opendose import api, fitregion, nlfit

HERE = Path(__file__).resolve().parent
REF = json.loads((HERE / "reference" / "fit_region.json").read_text())

CONC = [1e-9, 3.162e-9, 1e-8, 3.162e-8, 1e-7, 3.162e-7, 1e-6, 3.162e-6, 1e-5]
ROWS = [[98.2, 101.5, 99.1], [97.0, 95.8, 99.9], [93.4, 90.1, 92.7],
        [78.9, 82.3, 80.0], [51.2, 48.7, 50.9], [22.1, 25.6, 24.0],
        [8.9, 10.2, 7.5], [3.1, 4.4, 2.2], [1.0, 0.5, 2.1]]
MODEL = "log_inhibitor_vs_response_4pl"
PURO_CONC = [0.02, 0.02, 0.06, 0.06, 0.11, 0.11, 0.22, 0.22, 0.56, 0.56,
             1.10, 1.10]
PURO_RATE = [76, 47, 97, 107, 123, 139, 159, 152, 191, 201, 207, 200]


def _fit(region=None, conc=CONC, rows=ROWS, model=MODEL, **options):
    opts = {"model": model, "x_is_log": False, **options}
    if region:
        opts["joint_region"] = region
    r = api.analyze({"analysis": "dose_response",
                     "data": {"x": conc, "datasets": [{"name": "Drug A",
                                                       "ys": rows}]},
                     "options": opts})
    assert "error" not in r, r.get("error")
    d = r["datasets"][0]
    assert "error" not in d, d.get("error")
    return d["fit"]


@pytest.fixture(scope="module")
def region_fit():
    return _fit(["LogIC50", "HillSlope"])


def _area(xs, ys):
    x, y = np.asarray(xs), np.asarray(ys)
    return 0.5 * abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))


def test_covariance_matches_scipy_and_gives_the_ses_exactly():
    fit = _fit()
    cov = fit["covariance"]
    ref = REF["four_pl"]
    assert cov["params"] == ["Top", "Bottom", "LogIC50", "HillSlope"]
    C = np.array(cov["matrix"])
    np.testing.assert_allclose(C, np.array(ref["covariance"]), rtol=2e-6,
                               atol=1e-12)
    np.testing.assert_allclose(C, np.array(ref["scipy_pcov"]), rtol=2e-6,
                               atol=1e-12)
    np.testing.assert_allclose(np.array(cov["correlation"]),
                               np.array(ref["correlation"]), atol=1e-7)
    # the SEs reported are the square roots of this diagonal, to the bit
    for i, name in enumerate(cov["params"]):
        assert fit["params"][name]["se"] == math.sqrt(C[i, i])
    assert np.allclose(C, C.T)
    # displayed (4 significant digits) correlations of the example
    R = np.array(cov["correlation"])
    assert [round(R[2, 3], 4), round(R[0, 3], 4), round(R[1, 3], 4)] == [
        0.0095, 0.6008, -0.6060]


def test_constants_are_left_out_of_the_matrix():
    fit = _fit(constraints={"Bottom": 0})
    assert fit["covariance"]["params"] == ["Top", "LogIC50", "HillSlope"]
    fit = _fit(model="log_inhibitor_vs_response_3pl")
    assert fit["covariance"]["params"] == ["Top", "Bottom", "LogIC50"]


def test_robust_fit_has_no_covariance():
    fit = _fit(fit_method="robust")
    assert "covariance" not in fit


def test_region_boundary_matches_the_exact_profile_along_each_ray(region_fit):
    jr = region_fit["joint_region"]
    ref = REF["four_pl"]
    assert jr["params"] == ["LogIC50", "HillSlope"]
    assert jr["df"] == [2, 23]
    assert jr["f_crit"] == pytest.approx(3.4221, abs=1e-4)
    assert jr["f_crit"] == pytest.approx(ref["f_crit"], rel=1e-12)
    assert jr["ss_min"] == pytest.approx(ref["ss_min"], rel=1e-9)
    assert jr["threshold"] == pytest.approx(ref["threshold"], rel=1e-9)
    assert not jr["open"] and jr["rays"] == 72
    pts = list(zip(jr["contour"]["x"][:-1], jr["contour"]["y"][:-1]))
    assert (jr["contour"]["x"][-1], jr["contour"]["y"][-1]) == pts[0]
    want = ref["region"]["boundary"]
    span = (np.ptp([p[0] for p in want]), np.ptp([p[1] for p in want]))
    for (a, b), (ra, rb) in zip(pts, want):
        assert abs(a - ra) <= 1e-4 * span[0] and abs(b - rb) <= 1e-4 * span[1]


def test_region_area_matches_the_grid(region_fit):
    jr = region_fit["joint_region"]
    ref = REF["four_pl"]["region"]
    area = _area(jr["contour"]["x"][:-1], jr["contour"]["y"][:-1])
    # 72-gon inscribed in a smooth convex curve: about 0.13% short of it;
    # the 600 x 600 grid counts the area to ~0.3%
    assert area == pytest.approx(ref["grid_area"], rel=0.01)
    # displayed bounds of the region (4 significant digits)
    xs, ys = jr["contour"]["x"], jr["contour"]["y"]
    assert [float(f"{v:.4g}") for v in (min(xs), max(xs), min(ys), max(ys))] \
        == [-7.021, -6.944, -1.212, -1.005]


def test_region_is_wider_than_each_one_parameter_ci(region_fit):
    """The joint 95% region (F with 2 df) reaches past each parameter's
    own 95% CI (t, 1 df) in that parameter's direction."""
    jr = region_fit["joint_region"]
    lo, hi = region_fit["params"]["LogIC50"]["ci95"]
    assert min(jr["contour"]["x"]) < lo and max(jr["contour"]["x"]) > hi
    lo, hi = region_fit["params"]["HillSlope"]["ci95"]
    assert min(jr["contour"]["y"]) < lo and max(jr["contour"]["y"]) > hi
    # the ellipse is the linear approximation through the same rays
    ex = np.array(jr["ellipse"]["x"])
    assert abs((ex.max() + ex.min()) / 2 - jr["estimate"][0]) < 1e-9


def test_two_parameter_model_is_beales_region():
    fit = _fit(["Vmax", "Km"], conc=PURO_CONC,
               rows=[[v] for v in PURO_RATE], model="michaelis_menten")
    jr = fit["joint_region"]
    ref = REF["michaelis_menten"]
    assert jr["threshold"] == pytest.approx(ref["threshold"], rel=1e-8)
    assert jr["f_crit"] == pytest.approx(4.1028, abs=1e-4)
    area = _area(jr["contour"]["x"][:-1], jr["contour"]["y"][:-1])
    assert area == pytest.approx(ref["grid_area"], rel=0.01)
    xs, ys = jr["contour"]["x"], jr["contour"]["y"]
    cell = ref["grid_cell"]
    assert abs(min(xs) - ref["vmax_range"][0]) <= 2 * cell[0]
    assert abs(max(xs) - ref["vmax_range"][1]) <= 2 * cell[0]
    assert abs(min(ys) - ref["km_range"][0]) <= 2 * cell[1]
    assert abs(max(ys) - ref["km_range"][1]) <= 2 * cell[1]
    assert jr["refits"] == 0  # nothing left to refit


def test_stepped_region_reports_progress():
    payload = {"analysis": "dose_response",
               "data": {"x": CONC, "datasets": [{"name": "A", "ys": ROWS}]},
               "options": {"model": MODEL, "x_is_log": False,
                           "joint_region": ["LogIC50", "HillSlope"],
                           "ci_method": "bootstrap",
                           "bootstrap": {"resamples": 200}}}
    job = api.StepJob(json.dumps(payload))
    seen = []
    while (p := job.step()) is not None:
        seen.append(json.loads(p))
    total = 200 + fitregion.RAYS
    assert seen[-1] == {"done": total, "total": total, "what": "region"}
    assert {s["what"] for s in seen} == {"bootstrap", "region"}
    out = json.loads(job.result())["datasets"][0]["fit"]
    assert out["ci_method"] == "bootstrap" and not out["joint_region"]["open"]


# ---- edge cases: a message, never a crash ----

@pytest.mark.parametrize("pair,msg", [
    (["LogIC50", "LogIC50"], "two different parameters"),
    (["LogIC50", "Slope"], "unknown parameter: Slope"),
])
def test_bad_pairs_are_refused(pair, msg):
    fit = _fit(pair)
    assert msg in fit["joint_region"]["error"]
    assert "covariance" in fit  # the fit itself is unaffected


def test_constant_parameter_has_no_region():
    fit = _fit(["LogIC50", "HillSlope"], model="log_inhibitor_vs_response_3pl")
    assert "held constant" in fit["joint_region"]["error"]


def test_pair_must_be_two_names():
    r = api.analyze({"analysis": "dose_response",
                     "data": {"x": CONC, "datasets": [{"name": "A",
                                                       "ys": ROWS}]},
                     "options": {"model": MODEL, "x_is_log": False,
                                 "joint_region": ["LogIC50"]}})
    assert "two parameters" in r["error"]


def test_rout_and_robust_fits_say_why():
    assert "ROUT" in _fit(["LogIC50", "HillSlope"],
                          rout_q=0.01)["joint_region"]["error"]
    assert "robust" in _fit(["LogIC50", "HillSlope"],
                            fit_method="robust")["joint_region"]["error"]


def test_open_region_is_reported_open():
    # Michaelis-Menten measured only well below Km: the data fix the
    # initial slope Vmax/Km but not Vmax and Km apart, so the region runs
    # off along that ridge without closing
    x = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4]
    y = [3.46, 14.08, 13.38, 16.14, 19.58, 22.07, 24.34, 27.99]
    fit = _fit(["Vmax", "Km"], conc=x, rows=[[v] for v in y],
               model="michaelis_menten")
    jr = fit["joint_region"]
    assert fit["status"] == "converged"
    assert jr["open"] and None in jr["contour"]["x"]
    assert any(v is not None for v in jr["contour"]["x"])


def test_range_constraint_cuts_the_region():
    fit = _fit(["Bottom", "Top"], bounds={"Bottom": [0.5, None]})
    jr = fit["joint_region"]
    assert min(v for v in jr["contour"]["x"] if v is not None) >= 0.5 - 1e-6


def test_weighted_and_summary_fits_have_regions():
    fit = _fit(["LogIC50", "HillSlope"], weighting="1/Y2")
    assert not fit["joint_region"].get("error")
    means = [[float(np.mean(r)), float(np.std(r, ddof=1)), 3] for r in ROWS]
    s = _fit(["LogIC50", "HillSlope"], rows=means, summary_format="mean_sd_n")
    raw = _fit(["LogIC50", "HillSlope"])
    # mean/SD/n fits exactly as the replicates: the same region
    np.testing.assert_allclose(s["joint_region"]["contour"]["x"],
                               raw["joint_region"]["contour"]["x"], rtol=1e-6)


def test_units_shift_the_region_of_log_ic50():
    a = _fit(["LogIC50", "HillSlope"])["joint_region"]
    b = _fit(["LogIC50", "HillSlope"],
             conc=[c * 1e9 for c in CONC])["joint_region"]
    np.testing.assert_allclose(np.array(b["contour"]["x"]),
                               np.array(a["contour"]["x"]) + 9, atol=1e-6)
    np.testing.assert_allclose(b["contour"]["y"], a["contour"]["y"],
                               atol=1e-6)


def test_covariance_block_handles_a_singular_matrix():
    spec = nlfit.MODELS[MODEL]
    out = fitregion.covariance_block(spec, {"free_names": ["Top", "Bottom"],
                                            "matrix": [[1.0, 0.0],
                                                       [0.0, 0.0]]})
    assert out["correlation"] == [[1.0, None], [None, None]]
    assert fitregion.covariance_block(spec, None) is None
