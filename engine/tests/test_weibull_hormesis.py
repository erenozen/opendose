"""Weibull (drc W1.4, W2.4) and hormesis (Brain-Cousens BC.5 / BC.4,
Cedergreen-Ritz-Streibig CRS.5 / CRS.4) dose-response models
(FEATURE-PLAN P-19), against engine/tests/reference/weibull_hormesis.py:
an independent scipy least_squares fit of the published formulas whose
log-logistic anchor reproduces drc's published ryegrass output (Ritz et
al. 2015 PLOS ONE 10:e0146021, S1 File, Example 2) to 5 digits.

drc reports standard errors from the Hessian of the residual SS; the
engine (as Prism and R's nls) uses the Gauss-Newton covariance, so SEs
are pinned against the reference's J'J covariance, and the published
drc SEs are checked against the reference's Hessian covariance there.
"""

import json
import math
from pathlib import Path

import numpy as np
import pytest

from opendose import api, equations, nlfit

HERE = Path(__file__).resolve().parent
DATA = json.loads((HERE / "fixtures" / "drc_datasets.json").read_text())
REF = json.loads((HERE / "reference" / "weibull_hormesis.json").read_text())

RYE = (DATA["ryegrass"]["conc"], DATA["ryegrass"]["rootl"])
LET = (DATA["lettuce"]["conc"], DATA["lettuce"]["weight"])

CASES = [
    # engine model, data, reference key, constants
    ("weibull1", RYE, ("ryegrass", "W1.4"), {}),
    ("weibull2", RYE, ("ryegrass", "W2.4"), {}),
    ("weibull1", LET, ("lettuce", "W1.4"), {}),
    ("brain_cousens", LET, ("lettuce", "BC.5"), {}),
    ("brain_cousens_4", LET, ("lettuce", "BC.4"), {}),
    ("cedergreen", LET, ("lettuce", "CRS.5a"), {"alpha": 1.0}),
    ("cedergreen_4", LET, ("lettuce", "CRS.4a"), {"alpha": 1.0}),
]


def _fit(model, data, constraints=None, **options):
    x, y = data
    r = api.analyze({"analysis": "dose_response",
                     "data": {"x": list(x), "datasets": [
                         {"name": "d", "ys": [[v] for v in y]}]},
                     "options": {"model": model,
                                 "constraints": constraints or {},
                                 **options}})
    ds = r["datasets"][0]
    assert "error" not in ds, ds.get("error")
    return ds


@pytest.mark.parametrize("model,data,key,consts", CASES)
def test_matches_independent_least_squares(model, data, key, consts):
    ds = _fit(model, data, consts)
    fit, ref = ds["fit"], REF[key[0]][key[1]]
    assert fit["status"] == "converged"
    # the zero dose stays in: every point is fitted
    assert fit["goodness"]["n_points"] == len(data[0])
    assert fit["goodness"]["df"] == ref["df"]
    assert fit["goodness"]["sy_x"] == pytest.approx(ref["sy_x"], rel=1e-6)
    for name, r in ref["params"].items():
        p = fit["params"][name]
        # an undetermined parameter (CRS.4 f = 0.002, SE 0.63) agrees to
        # 1e-4 of its SE rather than in relative terms
        assert p["value"] == pytest.approx(
            r["value"], rel=2e-5, abs=max(1e-7, 1e-4 * r["se"])), name
        assert p["se"] == pytest.approx(r["se"], rel=2e-3), name
    for pct in equations.ED_LEVELS:
        e, r = fit["params"][f"ED{pct}"], ref[f"ED{pct}"]
        assert e["derived"] is True
        assert e["value"] == pytest.approx(r["value"], rel=2e-5), pct
        assert e["se"] == pytest.approx(r["se"], rel=2e-3), pct
        assert e["ci95"][0] == pytest.approx(r["ci95"][0], rel=2e-3,
                                             abs=1e-4), pct
        assert e["ci95"][1] == pytest.approx(r["ci95"][1], rel=2e-3), pct


def test_ryegrass_w14_acceptance_values():
    """The plan's acceptance test, at display precision (5 digits)."""
    fit = _fit("weibull1", RYE)["fit"]
    p = fit["params"]
    assert f"{p['b']['value']:.5g}" == "2.3933"
    assert f"{p['c']['value']:.5g}" == "0.66045"
    assert f"{p['d']['value']:.5g}" == "7.8059"
    assert f"{p['e']['value']:.5g}" == "3.6001"
    assert f"{p['b']['se']:.4g}" == "0.4396"
    assert f"{p['ED50']['value']:.5g}" == "3.0889"
    assert [f"{v:.5g}" for v in p["ED50"]["ci95"]] == ["2.7232", "3.4547"]
    # e is the inflection point, not the ED50: they differ
    assert abs(p["e"]["value"] - p["ED50"]["value"]) > 0.5
    assert fit["notes"][0].startswith("ED10, ED50 and ED90: the "
                                      "concentration at which")
    assert "e is the inflection point, not the ED50" in fit["notes"][0]


def test_log_logistic_anchor_reproduces_published_drc():
    """drc LL.3 on ryegrass is [Inhibitor] vs. response (variable slope)
    with Bottom = 0 (HillSlope = -b, IC50 = e): the estimates equal the
    values Ritz et al. (2015) print (S1 File, Example 2), with the zero
    dose kept in."""
    pub = DATA["published"]["ryegrass_LL3"]
    fit = _fit("inhibitor_vs_response_variable", RYE, {"Bottom": 0})["fit"]
    p = fit["params"]
    assert p["IC50"]["value"] == pytest.approx(pub["e"][0], abs=6e-6)
    assert -p["HillSlope"]["value"] == pytest.approx(pub["b"][0], abs=6e-6)
    assert p["Top"]["value"] == pytest.approx(pub["d"][0], abs=6e-6)
    assert fit["goodness"]["sy_x"] == pytest.approx(pub["residual_se"],
                                                    abs=6e-8)
    assert fit["goodness"]["df"] == pub["df"]
    # Gauss-Newton SEs (Prism, nls) = the reference's J'J covariance
    ref = REF["ryegrass"]["LL3"]["params"]
    assert p["IC50"]["se"] == pytest.approx(ref["e"]["se"], rel=1e-4)


def test_published_drc_standard_errors_come_from_the_hessian():
    ref = REF["ryegrass"]["LL3"]
    pub = DATA["published"]["ryegrass_LL3"]
    for k in ("b", "d", "e"):
        assert ref["params"][k]["se_drc"] == pytest.approx(pub[k][1],
                                                           abs=6e-6)
    assert ref["ED10"]["ci95_drc"][0] == pytest.approx(pub["ED10"][2],
                                                       abs=6e-6)


@pytest.mark.parametrize("model,kind", [("weibull1", 1), ("weibull2", 2)])
def test_weibull_ed_solves_the_curve(model, kind):
    fit = _fit(model, RYE)["fit"]
    v = fit["fitted_values"]
    spec = nlfit.MODELS[model]
    for pct in equations.ED_LEVELS:
        ed = fit["params"][f"ED{pct}"]["value"]
        y = float(spec.func(np.array([ed]), v)[0])
        level = v["d"] + pct / 100 * (v["c"] - v["d"])
        assert y == pytest.approx(level, rel=1e-10)


def test_hormesis_ed_is_past_the_peak():
    fit = _fit("brain_cousens", LET)["fit"]
    v = fit["fitted_values"]
    spec = nlfit.MODELS["brain_cousens"]
    xs = np.logspace(-3, 3, 4001)
    peak = xs[int(np.argmax(spec.func(xs, v)))]
    assert v["f"] > 0 and spec.func(np.array([peak]), v)[0] > v["d"]
    for pct in equations.ED_LEVELS:
        ed = fit["params"][f"ED{pct}"]["value"]
        assert ed > peak
        level = v["d"] + pct / 100 * (v["c"] - v["d"])
        assert spec.func(np.array([ed]), v)[0] == pytest.approx(level,
                                                                rel=1e-9)


def test_ed_beyond_the_doses_tested_is_said():
    notes = _fit("brain_cousens_4", LET)["fit"]["notes"]
    assert notes[1].startswith("ED90 (1.01e+04) lies above the highest "
                               "concentration tested (100)")


def test_unit_change_scales_x_parameters():
    base = _fit("weibull1", RYE)["fit"]["params"]
    milli = _fit("weibull1", ([v * 1000 for v in RYE[0]], RYE[1]))
    p = milli["fit"]["params"]
    for name in ("e", "ED10", "ED50", "ED90"):
        assert p[name]["value"] == pytest.approx(1000 * base[name]["value"],
                                                 rel=1e-6)
    for name in ("b", "c", "d"):
        assert p[name]["value"] == pytest.approx(base[name]["value"],
                                                 rel=1e-6)


def test_response_scaling_scales_c_and_d_only():
    base = _fit("brain_cousens", LET)["fit"]["params"]
    p = _fit("brain_cousens", (LET[0], [10 * v for v in LET[1]]))["fit"][
        "params"]
    for name in ("c", "d", "f"):
        assert p[name]["value"] == pytest.approx(10 * base[name]["value"],
                                                 rel=1e-5)
    for name in ("b", "e", "ED50"):
        assert p[name]["value"] == pytest.approx(base[name]["value"],
                                                 rel=1e-5)


def test_cedergreen_needs_alpha():
    r = api.analyze({"analysis": "dose_response",
                     "data": {"x": LET[0], "datasets": [
                         {"name": "d", "ys": [[v] for v in LET[1]]}]},
                     "options": {"model": "cedergreen"}})
    assert "needs experimental constants" in r["datasets"][0]["error"]
    assert "alpha" in r["datasets"][0]["error"]


@pytest.mark.parametrize("model", ["weibull1", "weibull2", "brain_cousens"])
def test_flat_data_does_not_crash(model):
    x = [0, 0, 1, 1, 10, 10, 100, 100]
    r = api.analyze({"analysis": "dose_response",
                     "data": {"x": x, "datasets": [
                         {"name": "d", "ys": [[5.0]] * len(x)}]},
                     "options": {"model": model}})
    ds = r["datasets"][0]
    # either a sentence or an ambiguous fit, never a traceback
    assert "error" in ds or ds["fit"]["status"] == "ambiguous"


def test_too_few_points_says_so():
    r = api.analyze({"analysis": "dose_response",
                     "data": {"x": [0, 1, 10, 100], "datasets": [
                         {"name": "d", "ys": [[5.0], [4.0], [2.0], [1.0]]}]},
                     "options": {"model": "brain_cousens"}})
    assert r["datasets"][0]["error"].startswith("not enough data points")


def test_listed_in_one_family_after_the_dose_response_families():
    lm = api.analyze({"analysis": "list_models", "data": {}, "options": {}})
    fams = lm["families"]
    i = fams.index(equations.FAM_HORMESIS)
    assert fams[i - 1] == "Dose-response - Special, X is concentration"
    ids = [m["id"] for m in lm["models"]
           if m["family"] == equations.FAM_HORMESIS]
    assert ids == ["weibull1", "weibull2", "brain_cousens", "brain_cousens_4",
                   "cedergreen", "cedergreen_4"]
    ced = next(m for m in lm["models"] if m["id"] == "cedergreen")
    assert ced["required_constants"] == ["alpha"]
    assert "ED50" in ced["derived"]


def test_ed_closed_form_matches_definition():
    p = {"b": 2.0, "c": 1.0, "d": 9.0, "e": 3.0}
    assert equations._ed_weibull(1, 50)(p) == pytest.approx(
        3.0 * math.log(2) ** 0.5)
    q = dict(p, b=-2.0)
    assert equations._ed_weibull(2, 50)(q) == pytest.approx(
        3.0 * math.log(2) ** -0.5)
