"""Relative potency from parallel curves, with equivalence (FEATURE-PLAN
P-100; opendose.relpotency, api handler relative_potency).

Acceptance: drc's S.alba data (Christensen, Teicher & Streibig 2003;
engine/tests/fixtures/s_alba.json), bentazone as the reference and
glyphosate as the test sample. R is not installed and no EDcomp output
for S.alba is published, so the parallelism F test, the potency ratio
(EDcomp's e_1 / e_2) with its delta-method SE and Fieller CI, and the
equivalence CIs come from reference/relative_potency.py: drc's LL.4
parameterisation (e itself, not log10 e) fitted with scipy
least_squares, Fieller's interval as the roots of its quadratic. The one
published S.alba output, drc's fit with common lower and upper limits
(drc reference page for S.alba, summary(S.alba.LL.4.1)), pins the
global fitting itself: estimates to the 6 printed decimals.
"""

import json
import math
from pathlib import Path

import numpy as np
import pytest

from opendose import api, equations, relpotency

HERE = Path(__file__).parent
DATA = json.loads((HERE / "fixtures" / "s_alba.json").read_text())
REF = json.loads((HERE / "reference" / "relative_potency.json").read_text())
XS = sorted(set(DATA["Bentazone"]["dose"]))


def _ys(h, scale=1.0):
    return [[v for d, v in zip(DATA[h]["dose"], DATA[h]["drymatter"]) if d == x]
            for x in XS]


def _data(order=("Bentazone", "Glyphosate"), xscale=1.0):
    return {"x": [x * xscale for x in XS],
            "datasets": [{"name": h, "ys": _ys(h)} for h in order]}


def _run(model="log_logistic_4pl_conc", data=None, **opts):
    return api.analyze({"analysis": "relative_potency", "data": data or _data(),
                        "options": {"model": model, "x_is_log": False, **opts}})


def test_published_drc_fit_with_common_limits():
    """drc's printed S.alba fit (common c, d; separate b, e): the global
    fitting reproduces every printed estimate and the residual SE."""
    pub = DATA["published_fit"]
    sets = [{"name": h, "x": DATA[h]["dose"], "y": DATA[h]["drymatter"]}
            for h in ("Bentazone", "Glyphosate")]
    with np.errstate(all="ignore"):
        g = equations.fit_global_model(sets, "inhibitor_vs_response_variable",
                                       shared=["Bottom", "Top"])
    b, gl = g["datasets"]
    for name, entry in (("Bentazone", b), ("Glyphosate", gl)):
        p = entry["params"]
        assert p["IC50"]["value"] == pytest.approx(pub["e"][name][0], abs=2e-5)
        # drc's b is opendose's -HillSlope (Y falls with dose)
        assert -p["HillSlope"]["value"] == pytest.approx(pub["b"][name][0], abs=2e-6)
    assert b["params"]["Bottom"]["value"] == pytest.approx(pub["c"][0], abs=1e-6)
    assert b["params"]["Top"]["value"] == pytest.approx(pub["d"][0], abs=1e-6)
    assert g["goodness"]["sy_x"] == pytest.approx(pub["residual_se"], abs=1e-6)
    assert g["goodness"]["df"] == pub["df"]
    # drc's printed SEs are the observed-information ones; the reference
    # reproduces them, and opendose's Gauss-Newton (J'J) SEs match the
    # reference's J'J values
    cd = REF["fits"]["common_cd"]
    obs = dict(zip(cd["names"], cd["se_observed"]))
    assert obs["e_B"] == pytest.approx(pub["e"]["Bentazone"][1], rel=1e-5)
    assert obs["b_G"] == pytest.approx(pub["b"]["Glyphosate"][1], rel=1e-5)
    jtj = dict(zip(cd["names"], cd["se_jtj"]))
    assert b["params"]["IC50"]["se"] == pytest.approx(jtj["e_B"], rel=1e-4)
    assert gl["params"]["HillSlope"]["se"] == pytest.approx(jtj["b_G"], rel=1e-4)


@pytest.mark.parametrize("model", ["log_logistic_4pl_conc",
                                   "inhibitor_vs_response_variable"])
def test_acceptance_s_alba_parallelism_and_potency(model):
    r = _run(model)
    f, ref_f = r["f_test"], REF["parallelism_f"]
    assert (f["dfn"], f["dfd"]) == (ref_f["dfn"], ref_f["dfd"]) == (3, 60)
    assert f["F"] == pytest.approx(ref_f["F"], rel=1e-5)
    assert f["p"] == pytest.approx(ref_f["p"], rel=1e-4)
    # F(3, 60) = 2.747, P = 0.0507: no evidence against parallelism at 0.05
    assert round(f["F"], 3) == 2.747 and r["parallel_by_f"] is True
    pot, ref_p = r["potency"], REF["potency_jtj"]
    assert pot["ratio"] == pytest.approx(ref_p["ratio"], rel=1e-6)
    assert pot["ci"] == pytest.approx(ref_p["fieller_ci"], rel=1e-5)
    assert pot["se_delta"] == pytest.approx(ref_p["se_delta"], rel=1e-5)
    assert pot["df"] == 63
    # 0.4254 (95% CI 0.3497 to 0.5161): bentazone's ED50 is 0.43 x glyphosate's
    assert [round(v, 4) for v in [pot["ratio"], *pot["ci"]]] == [0.4254, 0.3497, 0.5161]
    if model == "log_logistic_4pl_conc":
        assert pot["ci_log"] == pytest.approx(ref_p["log_ci"], rel=1e-5)


def test_equivalence_cis_and_verdicts():
    eq_ref = REF["equivalence_90"]
    margins = {"Top": {"lower": -0.5, "upper": 0.5},
               "Bottom": {"lower": -0.6, "upper": 0.6},
               "HillSlope": {"lower": 0.8, "upper": 1.25}}
    r = _run(margins=margins)
    rows = {p["name"]: p for p in r["equivalence"]["parameters"]}
    assert r["equivalence"]["level"] == 0.9 and r["equivalence"]["df"] == 60
    assert rows["Top"]["estimate"] == pytest.approx(eq_ref["Top"]["difference"], rel=1e-5)
    assert rows["Top"]["ci"] == pytest.approx(eq_ref["Top"]["ci"], rel=1e-5, abs=1e-6)
    assert rows["Bottom"]["ci"] == pytest.approx(eq_ref["Bottom"]["ci"], rel=1e-5, abs=1e-6)
    assert rows["HillSlope"]["kind"] == "ratio"
    assert rows["HillSlope"]["estimate"] == pytest.approx(eq_ref["HillSlope"]["ratio"], rel=1e-5)
    assert rows["HillSlope"]["ci"] == pytest.approx(eq_ref["HillSlope"]["ci"], rel=1e-5)
    # the slope ratio 0.53 (90% CI 0.29 to 0.93) is outside 0.8 to 1.25:
    # the F test passes (P = 0.051) but equivalence is not shown
    assert rows["Top"]["equivalent"] and rows["Bottom"]["equivalent"]
    assert not rows["HillSlope"]["equivalent"]
    assert r["equivalence"]["verdict"] == "not_shown"
    assert _run()["equivalence"]["verdict"] == "not_set"
    # Top inside its margin, the others not set: not judged yet; one
    # margin missed is enough to say equivalence is not shown
    assert _run(margins={"Top": margins["Top"]})["equivalence"]["verdict"] == "incomplete"
    assert _run(margins={"HillSlope": margins["HillSlope"]})["equivalence"]["verdict"] == "not_shown"
    wide = dict(margins, HillSlope={"lower": 0.25, "upper": 4})
    assert _run(margins=wide)["equivalence"]["verdict"] == "equivalent"


def test_swapping_reference_and_test_inverts_the_ratio():
    a = _run()["potency"]
    b = _run(reference=1, test=0)["potency"]
    assert b["ratio"] == pytest.approx(1 / a["ratio"], rel=1e-6)
    # Fieller's set for 1 / rho is the reciprocal of the set for rho
    assert b["ci"] == pytest.approx([1 / a["ci"][1], 1 / a["ci"][0]], rel=1e-5)


def test_dose_units_do_not_change_the_ratio():
    a = _run()
    b = _run(data=_data(xscale=1e-6))
    assert b["potency"]["ratio"] == pytest.approx(a["potency"]["ratio"], rel=1e-5)
    assert b["potency"]["ci"] == pytest.approx(a["potency"]["ci"], rel=1e-4)
    assert b["f_test"]["F"] == pytest.approx(a["f_test"]["F"], rel=1e-5)


def _synthetic(shift=0.5, slope_b=1.0, seed=3, sd=2.0):
    rng = np.random.default_rng(seed)
    x = np.linspace(-9, -4, 11)
    out = []
    for log_ec, h in ((-6.5, 1.0), (-6.5 + shift, slope_b)):
        y = 5 + 95 / (1 + 10 ** ((log_ec - x) * h))
        out.append([[float(v + rng.normal(0, sd)), float(v + rng.normal(0, sd))] for v in y])
    return {"x": x.tolist(), "datasets": [{"name": "Reference", "ys": out[0]},
                                          {"name": "Test", "ys": out[1]}]}


def test_parallel_synthetic_curves_recover_the_shift():
    r = _run("log_agonist_vs_response_4pl", data=_synthetic(), x_is_log=True,
             margins={"Top": {"lower": -10, "upper": 10},
                      "Bottom": {"lower": -10, "upper": 10},
                      "HillSlope": {"lower": 0.8, "upper": 1.25}})
    pot = r["potency"]
    # true ratio EC50_ref / EC50_test = 10^-0.5; the CI covers it
    assert pot["ci"][0] < 10 ** -0.5 < pot["ci"][1]
    assert pot["ratio"] == pytest.approx(10 ** pot["log_ratio"], rel=1e-12)
    assert r["equivalence"]["verdict"] == "equivalent"
    assert r["f_test"]["p"] > 0.05


def test_non_parallel_curves_fail_the_f_test():
    r = _run("log_agonist_vs_response_4pl", data=_synthetic(slope_b=3.0, sd=1.0),
             x_is_log=True)
    assert r["f_test"]["p"] < 0.001 and r["parallel_by_f"] is False


def test_three_parameter_model_and_only_potency_free():
    r = _run("log_agonist_vs_response_3pl", data=_synthetic(), x_is_log=True)
    assert r["f_test"]["dfn"] == 2          # Top and Bottom; the slope is fixed
    names = [p["name"] for p in r["equivalence"]["parameters"]]
    assert names == ["Top", "Bottom"]
    held = _run("log_agonist_vs_response_4pl", data=_synthetic(), x_is_log=True,
                constraints={"Top": 100, "Bottom": 5, "HillSlope": 1})
    assert held["f_test"] is None and held["notes"]
    assert held["equivalence"]["parameters"] == []


def test_fieller_with_covariance_against_the_quadratic_roots():
    rng = np.random.default_rng(1)
    for _ in range(50):
        a, b = rng.uniform(1, 5), rng.uniform(-3, 3)
        sa, sb = rng.uniform(0.05, 0.6), rng.uniform(0.05, 0.6)
        rho_ab = rng.uniform(-0.9, 0.9)
        vaa, vbb, vab = sa * sa, sb * sb, rho_ab * sa * sb
        t = 2.1
        r = relpotency.fieller_cov(a, b, vaa, vbb, vab, t)
        A, B, C = a * a - t * t * vaa, -2 * (a * b - t * t * vab), b * b - t * t * vbb
        if A <= 0:
            assert r["ci"] is None
            continue
        roots = sorted(np.real(np.roots([A, B, C])))
        assert r["ci"] == pytest.approx(roots, rel=1e-9, abs=1e-12)
    # an EC50 not clearly different from zero: unbounded
    assert relpotency.fieller_cov(1.0, 2.0, 0.5, 0.1, 0.0, 2.0)["ci"] is None
    assert relpotency.fieller_cov(0.0, 2.0, 0.5, 0.1, 0.0, 2.0)["value"] is None


@pytest.mark.parametrize("opts,msg", [
    ({"reference": 0, "test": 0}, "two different data sets"),
    ({"reference": 0, "test": 5}, "needs two data sets"),
    ({"model": "competitive_inhibition"}, "global model"),
    ({"model": "straight_line"}, "no EC50 or IC50"),
    ({"constraints": {"LogEC50": 1.5}}, "held constant"),
    ({"margins": {"Top": {"lower": 1, "upper": -1}}}, "lower limit below"),
    ({"margins": {"HillSlope": {"lower": 0, "upper": 2}}}, "must be above 0"),
])
def test_clear_errors(opts, msg):
    r = _run(**opts)
    assert "error" in r and msg in r["error"], r.get("error")


def test_one_data_set_and_too_few_points():
    one = {"x": XS, "datasets": [{"name": "Bentazone", "ys": _ys("Bentazone")}]}
    assert "needs two data sets" in _run(data=one)["error"]
    tiny = {"x": [1, 10, 100], "datasets": [{"name": "A", "ys": [[3], [2], [1]]},
                                            {"name": "B", "ys": [[3], [2.5], [1]]}]}
    r = _run(data=tiny)
    assert "error" in r and "could not fit" in r["error"]


def test_same_names_are_told_apart():
    d = _data()
    d["datasets"][1]["name"] = "Bentazone"
    r = _run(data=d)
    assert (r["reference"], r["test"]) == ("Bentazone (reference)", "Bentazone (test)")
    assert math.isfinite(r["potency"]["ratio"])
