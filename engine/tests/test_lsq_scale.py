"""Solver tolerance and scale-aware covariance (opendose.lsq).

* NIST StRD nonlinear problems: certified estimates and standard errors
  from both NIST starts, to 1e-7 relative (the certified values have 10-11
  significant digits).
* Units: the same dose-response data fitted with X in M and in nM give
  the same EC50 after conversion and the same SE(EC50)/EC50.
* Parameters that sit at zero (Bottom = 0, LogEC50 = 0) still get correct
  SEs: compared with the SEs from an analytic 4PL Jacobian.
* BoxBOD Start 1, which used to run to a degenerate point, now reaches
  the certified solution through the restart; a fit no restart can rescue
  stays "ambiguous".
"""

import importlib.util
import math
import sys
from pathlib import Path

import numpy as np
import pytest

from opendose import lsq
from opendose.api import analyze
from opendose.nlfit import fit_model

_RUNNER = Path(__file__).resolve().parent / "corpus" / "run_corpus.py"
_spec = importlib.util.spec_from_file_location("opendose_run_corpus_lsq",
                                               _RUNNER)
rc = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = rc
_spec.loader.exec_module(rc)


# ------------------------------------------------------------ NIST StRD

@pytest.mark.parametrize("dataset", ["nist-misra1a", "nist-lanczos3",
                                     "nist-thurber", "nist-mgh09",
                                     "nist-hahn1", "nist-boxbod"])
@pytest.mark.parametrize("start", ["start1", "start2"])
def test_nist_certified_values_and_ses(dataset, start):
    entry = rc.entry_by_id(dataset)
    _, rows = rc.read_csv(entry)
    fit = rc._nist_nls_fit(entry, rows, start)
    for ref in entry["reference"]:
        q = ref["quantity"]
        if q in ("df",):
            continue
        if q == "residual_ss":
            ours = fit["goodness"]["ss_res"]
        elif q == "sy_x":
            ours = fit["goodness"]["sy_x"]
        elif q.startswith("se_"):
            ours = fit["params"][q[3:]]["se"]
        else:
            ours = fit["params"][q]["value"]
        assert ours == pytest.approx(ref["value"], rel=1e-7), (dataset, q)
    # Thurber, Lanczos3 and Hahn1 are "ambiguous" by Prism's dependency
    # rule (max dependency 0.99997, 0.9999999, 0.99998 > 0.9999), as before
    assert fit["status"] == ("ambiguous" if dataset in (
        "nist-thurber", "nist-lanczos3", "nist-hahn1") else "converged")


# ------------------------------------------------------------ units

CONC_M = [1e-9, 3.162e-9, 1e-8, 3.162e-8, 1e-7, 3.162e-7, 1e-6, 3.162e-6,
          1e-5]
REF_Y = [[98.2, 101.5, 99.1], [97.0, 95.8, 99.9], [93.4, 90.1, 92.7],
         [78.9, 82.3, 80.0], [51.2, 48.7, 50.9], [22.1, 25.6, 24.0],
         [8.9, 10.2, 7.5], [3.1, 4.4, 2.2], [1.0, 0.5, 2.1]]


def _agonist(scale):
    xs, ys = [], []
    for c, row in zip(CONC_M, REF_Y):
        for v in row:
            xs.append(c * scale)
            ys.append(100.0 - v)
    return xs, ys


@pytest.mark.parametrize("model", ["agonist_vs_response_variable",
                                   "agonist_vs_response"])
def test_ec50_and_relative_se_do_not_depend_on_x_units(model):
    fm = fit_model(*_agonist(1.0), model)          # molar
    fn = fit_model(*_agonist(1e9), model)          # nM
    em, en = fm["params"]["EC50"], fn["params"]["EC50"]
    assert en["value"] == pytest.approx(em["value"] * 1e9, rel=1e-10)
    assert en["se"] / en["value"] == pytest.approx(em["se"] / em["value"],
                                                   rel=1e-10)
    # Top / Bottom do not change with the X units (1e-10 of the Y range)
    for name in ("Top", "Bottom"):
        assert fn["params"][name]["value"] == pytest.approx(
            fm["params"][name]["value"], abs=1e-8)
        assert fn["params"][name]["se"] == pytest.approx(
            fm["params"][name]["se"], rel=1e-8)


# ------------------------------------------------- analytic 4PL Jacobian

def _analytic_4pl_se(x, y, p):
    """SEs of log(agonist) vs response (4PL) from the analytic Jacobian:
    Y = B + (T - B) / (1 + 10^((L - X) H))."""
    x, y = np.asarray(x, float), np.asarray(y, float)
    T, B, L, H = p["Top"], p["Bottom"], p["LogEC50"], p["HillSlope"]
    u = 10.0 ** ((L - x) * H)
    d = 1.0 + u
    ln10 = math.log(10.0)
    J = np.column_stack([
        1.0 / d,                                   # dY/dTop
        1.0 - 1.0 / d,                             # dY/dBottom
        -(T - B) * u * ln10 * H / d ** 2,          # dY/dLogEC50
        -(T - B) * u * ln10 * (L - x) / d ** 2,    # dY/dHillSlope
    ])
    r = y - (B + (T - B) / d)
    s2 = float(r @ r) / (x.size - 4)
    se = np.sqrt(np.diag(np.linalg.inv(J.T @ J)) * s2)
    return dict(zip(["Top", "Bottom", "LogEC50", "HillSlope"], se))


def _log_agonist_data():
    xs, ys = [], []
    for c, row in zip(CONC_M, REF_Y):
        for v in row:
            xs.append(math.log10(c))
            ys.append(100.0 - v)
    return xs, ys


def _check_against_analytic(xs, ys, fit):
    p = {k: fit["params"][k]["value"]
         for k in ("Top", "Bottom", "LogEC50", "HillSlope")}
    se = _analytic_4pl_se(xs, ys, p)
    for k, v in se.items():
        assert fit["params"][k]["se"] == pytest.approx(v, rel=1e-8), k


def test_4pl_ses_match_analytic_jacobian():
    xs, ys = _log_agonist_data()
    fit = fit_model(xs, ys, "log_agonist_vs_response_4pl")
    _check_against_analytic(xs, ys, fit)


def test_bottom_at_zero_still_has_correct_se():
    xs, ys = _log_agonist_data()
    first = fit_model(xs, ys, "log_agonist_vs_response_4pl")
    shift = first["params"]["Bottom"]["value"]
    ys0 = [v - shift for v in ys]     # the refit has Bottom = 0
    fit = fit_model(xs, ys0, "log_agonist_vs_response_4pl")
    assert abs(fit["params"]["Bottom"]["value"]) < 1e-9
    _check_against_analytic(xs, ys0, fit)
    assert fit["params"]["Bottom"]["se"] == pytest.approx(
        first["params"]["Bottom"]["se"], rel=1e-8)


def test_logec50_at_zero_still_has_correct_se():
    xs, ys = _log_agonist_data()
    first = fit_model(xs, ys, "log_agonist_vs_response_4pl")
    shift = first["params"]["LogEC50"]["value"]
    xs0 = [v - shift for v in xs]     # the refit has LogEC50 = 0
    fit = fit_model(xs0, ys, "log_agonist_vs_response_4pl")
    assert abs(fit["params"]["LogEC50"]["value"]) < 1e-9
    _check_against_analytic(xs0, ys, fit)
    assert fit["params"]["LogEC50"]["se"] == pytest.approx(
        first["params"]["LogEC50"]["se"], rel=1e-8)


# ------------------------------------------------------------ the rule

def test_scale_floor_rule():
    x = [1e-9, 1e-8, 1e-7, 1e-6]
    y = [0.0, 10.0, 60.0, 100.0]
    s = lsq.scale_floor(["Top", "Bottom", "EC50", "HillSlope", "K", "b1"],
                        [100.0, 0.0, 0.0, 1.0, 0.0, 0.0], x, y)
    assert s[0] == 100.0                      # |p0| and the Y range
    assert s[1] == 100.0                      # Y-like: the Y range
    assert s[2] == pytest.approx(5.5e-8)      # X-like: median |X|
    assert s[3] == 1.0                        # slopes: 1
    assert s[4] == pytest.approx(1 / 5.5e-8)  # rates: 1 / X scale
    assert s[5] == 0.0                        # no role, no start
    # the step: c * max(|p|, s), 1 only when everything is zero
    h = lsq.steps(np.array([0.0, 2e-7, 0.0]), np.array([100.0, 5.5e-8, 0]),
                  1.0)
    assert list(h) == [100.0, 2e-7, 1.0]


def test_solver_tolerances():
    assert lsq.TOL == {"ftol": 1e-12, "xtol": 1e-12, "gtol": 1e-12}


# ------------------------------------------------------------ BoxBOD

def _boxbod(x, y, rules):
    r = analyze({"analysis": "dose_response",
                 "data": {"x": x, "datasets": [{"name": "y",
                                                "ys": [[v] for v in y]}]},
                 "options": {"user_equation": {
                     "text": "Y = b1*(1-exp(-b2*x))", "rules": rules}}})
    return r["datasets"][0]["fit"]


def test_degenerate_fit_triggers_restart():
    """BoxBOD Start 1 converges to b2 -> 110 (the curve is the mean of
    Y, no better than a horizontal line); the restart finds the certified
    solution."""
    fit = _boxbod([1, 2, 3, 5, 7, 10], [109, 149, 149, 191, 213, 224],
                  {"b1": 1.0, "b2": 1.0})
    assert fit["status"] == "converged"
    assert fit["params"]["b1"]["value"] == pytest.approx(213.80940889,
                                                         rel=1e-8)
    assert fit["params"]["b2"]["value"] == pytest.approx(0.54723748542,
                                                         rel=1e-8)


def test_degenerate_fit_stays_ambiguous_when_restart_fails():
    """Flat data: the best this model can do is the horizontal line at
    the mean (b2 -> infinity); no start does better."""
    fit = _boxbod([1, 2, 3, 5, 7, 10], [5.0, 5.1, 4.9, 5.05, 4.95, 5.0],
                  {"b1": 1.0, "b2": 1.0})
    assert fit["status"] == "ambiguous"


def test_derived_ses_and_bands_do_not_depend_on_x_units():
    """Delta-method SEs of transforms and the confidence band use the
    scale-aware step cbrt(eps) max(|p|, SE) (the old absolute floor 1e-8
    was 10 % of an EC50 of 1e-7 M)."""
    from opendose import interpolate
    fm = fit_model(*_agonist(1.0), "agonist_vs_response_variable")
    fn = fit_model(*_agonist(1e9), "agonist_vs_response_variable")
    assert fn["params"]["LogEC50"]["se"] == pytest.approx(
        fm["params"]["LogEC50"]["se"], rel=1e-9)
    xs = np.array([3e-9, 1e-7, 2e-6])
    bm = interpolate.bands(fm, xs)
    bn = interpolate.bands(fn, xs * 1e9)
    half_m = np.array(bm["upper"]) - np.array(bm["y"])
    half_n = np.array(bn["upper"]) - np.array(bn["y"])
    assert half_n == pytest.approx(half_m, rel=1e-8)
