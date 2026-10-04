"""Standard-curve QC (assay_stdcurve).

The fit is pinned to R's DNase ELISA calibration (Davidian & Giltinan
1995; R datasets::DNase run 1, nls with SSlogis(log(conc)) printed in
R-help 2006-July/109490: Asym 2.34518 (SE 0.07815), xmid 1.48309,
scal 1.04146 (SE 0.03227)), which is the 4PL in log10 X with Bottom held
at 0. Back-calculation and interpolation are checked against
interpolate.interpolate_x / absolute_ic50 and exact synthetic curves;
the acceptance logic against hand-built failing levels (ICH M10 4.2.3).
"""

import math

import numpy as np
import pytest

from opendose import api, assay_stdcurve as sc, interpolate, nlfit

DNASE_CONC = [0.04882812, 0.1953125, 0.390625, 0.78125, 1.5625, 3.125,
              6.25, 12.5]
DNASE_OD = [0.017, 0.018, 0.121, 0.124, 0.206, 0.215, 0.377, 0.374, 0.614,
            0.609, 1.019, 1.001, 1.334, 1.364, 1.73, 1.71]
P = {"Bottom": 0.05, "Top": 2.5, "LogXmid": math.log10(50.0),
     "HillSlope": 1.2}
CONCS = [3.9, 7.8, 15.6, 31.25, 62.5, 125.0, 250.0, 500.0, 1000.0]


def f4(c, p=P):
    return float(nlfit._dr_func(math.log10(c), p))


def _dnase():
    return [{"concentration": c, "signals": DNASE_OD[2 * i:2 * i + 2]}
            for i, c in enumerate(DNASE_CONC)]


def test_dnase_fit_matches_r_sslogis():
    res = sc.standard_curve_qc(_dnase(), constraints={"Bottom": 0})
    p = res["fit"]["params"]
    ln10 = math.log(10)
    assert p["Top"]["value"] == pytest.approx(2.34518, abs=1e-5)
    assert p["Top"]["se"] == pytest.approx(0.07815, abs=1e-5)
    assert p["LogEC50"]["value"] == pytest.approx(1.48309 / ln10, abs=1e-5)
    assert p["LogEC50"]["se"] == pytest.approx(0.08135 / ln10, abs=1e-5)
    # Hill slope = 1/scal (natural-log scale of SSlogis), SE by the delta
    assert p["HillSlope"]["value"] == pytest.approx(1 / 1.04146, rel=1e-5)
    assert p["HillSlope"]["se"] == pytest.approx(0.03227 / 1.04146 ** 2,
                                                 rel=2e-4)
    # lowest standard back-calculates at 55% -> LLOQ moves up one level
    lv = res["standards"]
    assert lv[0]["level_pass"] is False
    assert res["quantification_range"]["lloq"] == DNASE_CONC[1]
    assert res["quantification_range"]["uloq"] == DNASE_CONC[-1]
    assert res["acceptance"]["accepted"] is True       # 7 levels, 14/16


def _exact_standards(reps=2):
    return [{"concentration": c, "signals": [f4(c)] * reps} for c in CONCS]


def test_back_calculation_reproduces_exact_standards():
    res = sc.standard_curve_qc(_exact_standards())
    for lv in res["standards"]:
        for b in lv["back_calculated"]:
            assert b == pytest.approx(lv["concentration"], rel=1e-9)
        assert lv["recovery_pct"] == pytest.approx(100.0, abs=1e-7)
        assert lv["level_pass"] is True
    assert res["acceptance"]["accepted"] is True
    assert res["quantification_range"]["lloq"] == 3.9
    assert res["quantification_range"]["dynamic_range_fold"] == \
        pytest.approx(1000 / 3.9)
    assert [lv["role"] for lv in res["standards"]][0] == "LLOQ"


def test_interpolation_and_ci_equal_interpolate_module():
    rng = np.random.default_rng(5)
    stds = [{"concentration": c,
             "signals": [f4(c) * (1 + rng.normal(0, 0.03)) for _ in range(3)]}
            for c in CONCS]
    unk = [{"name": "U", "signals": [f4(42.0), f4(42.0) * 1.03],
            "dilution": 5}]
    res = sc.standard_curve_qc(stds, unk)
    xs = [math.log10(s["concentration"]) for s in stds for _ in range(3)]
    ys = [v for s in stds for v in s["signals"]]
    fit = nlfit.fit_model(xs, ys, "log_agonist_vs_response_4pl")
    lo, hi = min(xs), max(xs)
    pad = (hi - lo) / 2
    u = res["unknowns"][0]
    mean_sig = float(np.mean(unk[0]["signals"]))
    ref = interpolate.interpolate_x(fit, [mean_sig], lo - pad, hi + pad)[0]
    assert u["concentration"] == pytest.approx(10 ** ref, rel=1e-12)
    ab = interpolate.absolute_ic50(fit, mean_sig, lo - pad, hi + pad)
    assert u["concentration_ci"] == pytest.approx(
        [10 ** ab["ci"][0], 10 ** ab["ci"][1]], rel=1e-8)
    assert u["corrected"] == pytest.approx(5 * u["concentration"])
    assert u["corrected_ci"] == pytest.approx(
        [5 * v for v in u["concentration_ci"]])
    assert u["status"] == "ok" and u["flags"] == []


def test_acceptance_failures_and_range_end_rules():
    # shape parameters held at the truth and 10 replicates at the good
    # levels, so the biased levels keep (nearly) their bias
    cons = {"Top": 2.5, "Bottom": 0.05, "LogXmid": math.log10(50.0)}
    stds = _exact_standards(reps=10)
    stds[0]["signals"] = [f4(3.9 * 1.22)] * 2    # +22%: passes at the LLOQ
    stds[1]["signals"] = [f4(7.8 * 1.22)] * 2    # +22%: fails inside
    res = sc.standard_curve_qc(stds, constraints=cons)
    lv = res["standards"]
    assert lv[0]["accuracy_limit_pct"] == 25 and lv[0]["level_pass"] is True
    assert lv[1]["accuracy_limit_pct"] == 20 and lv[1]["level_pass"] is False
    assert res["quantification_range"]["lloq"] == 3.9
    assert res["quantification_range"]["rejected_inside_range"] == [7.8]
    assert any("refits without" in w for w in res["warnings"])
    # a failing LLOQ standard: the next level becomes the LLOQ
    stds[0]["signals"] = [f4(3.9 * 1.3)] * 2
    stds[1]["signals"] = [f4(7.8)] * 10
    res = sc.standard_curve_qc(stds, constraints=cons)
    assert res["standards"][0]["level_pass"] is False
    assert res["quantification_range"]["lloq"] == 7.8
    # excluding it refits without it
    stds[0]["exclude"] = True
    res = sc.standard_curve_qc(stds, constraints=cons)
    assert res["standards"][0]["excluded"] == "excluded by the user"
    assert res["acceptance"]["n_levels"] == 8
    # many biased levels: run rejected on both M10 counts
    stds2 = _exact_standards()
    for k in (1, 3, 5):
        stds2[k]["signals"] = [f4(CONCS[k] * 1.6)] * 2
    acc = sc.standard_curve_qc(stds2)["acceptance"]
    assert acc["accepted"] is False
    assert acc["n_pass"] < 0.75 * acc["n_standards"]
    assert acc["n_levels_pass"] < 6
    assert len(acc["reasons"]) == 2


def test_unknown_flags_lloq_uloq_extrapolated_and_cv():
    stds = _exact_standards()
    stds[0]["signals"] = [f4(3.9) * 1.5, f4(3.9) * 0.6]   # imprecise LLOQ
    unk = [
        {"name": "low", "signals": [f4(5.0)] * 2},
        {"name": "high", "signals": [f4(1500.0)] * 2},
        {"name": "below", "signals": [0.01]},
        {"name": "noisy", "signals": [f4(100.0), f4(100.0) * 1.4]},
        {"name": "fine", "signals": [f4(80.0)] * 2, "dilution": 10},
    ]
    res = sc.standard_curve_qc(stds, unk, cv_limit=20)
    by = {u["name"]: u for u in res["unknowns"]}
    assert res["quantification_range"]["lloq"] == 7.8
    assert by["low"]["status"] == "<LLOQ" and by["low"]["reportable"] is None
    assert by["low"]["lloq_corrected"] == 7.8
    assert by["high"]["status"] == ">ULOQ"
    assert "extrapolated" in by["high"]["flags"]
    assert by["below"]["status"] == "<LLOQ"
    assert "outside_curve" in by["below"]["flags"]
    assert "high_cv" in by["noisy"]["flags"]
    assert by["fine"]["reportable"] == pytest.approx(800.0, rel=1e-3)
    samples = {s["name"]: s for s in res["samples"]}
    assert samples["fine"]["mean"] == pytest.approx(by["fine"]["corrected"])


def test_blank_zero_standard_and_other_models():
    stds = [{"concentration": 0, "signals": [0.10, 0.12]}] + [
        {"concentration": c, "signals": [0.11 + 0.002 * c] * 2}
        for c in (10, 20, 40, 80, 160, 320)]
    lin = sc.standard_curve_qc(stds, [{"name": "u", "signals": [0.31]}],
                               model="linear", blank="zero_standard")
    assert lin["blank"] == pytest.approx(0.11)
    assert lin["fit"]["params"]["Slope"]["value"] == pytest.approx(0.002)
    assert lin["unknowns"][0]["concentration"] == pytest.approx(
        (0.31 - 0.11) / 0.002)
    # log-log: straight line of log10 signal on log10 concentration
    ll = [{"concentration": c, "signals": [0.02 * c ** 0.8] * 2}
          for c in (1, 3, 10, 30, 100, 300)]
    res = sc.standard_curve_qc(ll, [{"name": "u", "signals": [0.02 * 50 ** 0.8]}],
                               model="loglog")
    assert res["fit"]["params"]["Slope"]["value"] == pytest.approx(0.8)
    assert res["unknowns"][0]["concentration"] == pytest.approx(50, rel=1e-9)
    # 5PL with weighting 1/Y^2 on exact asymmetric data
    p5 = {"Bottom": 0.05, "Top": 2.4, "LogEC50": 1.7, "HillSlope": 1.1,
          "S": 0.6}
    f5 = nlfit.MODELS["asymmetric_5pl_log"].func
    s5 = [{"concentration": c,
           "signals": [float(f5(np.array([math.log10(c)]), p5)[0])] * 2}
          for c in CONCS]
    r5 = sc.standard_curve_qc(s5, model="5pl", weighting="1/Y2")
    for lv in r5["standards"]:
        assert lv["recovery_pct"] == pytest.approx(100, abs=1e-5)


def test_parallelism_f_test_and_dilution_cv():
    rng = np.random.default_rng(1)
    stds = [{"concentration": c,
             "signals": [f4(c) * (1 + rng.normal(0, 0.02)) for _ in range(2)]}
            for c in CONCS]
    dils = [2, 4, 8, 16, 32, 64]
    par = [{"name": "P", "dilution": d,
            "signals": [f4(400 / d) * (1 + rng.normal(0, 0.02))
                        for _ in range(2)]} for d in dils]
    shallow = dict(P, HillSlope=0.5)
    non = [{"name": "N", "dilution": d,
            "signals": [f4(400 / d, shallow) * (1 + rng.normal(0, 0.02))
                        for _ in range(2)]} for d in dils]
    res = sc.standard_curve_qc(stds, par + non)
    pr = {p["name"]: p for p in res["parallelism"]}
    assert pr["P"]["f_test"]["p"] > 0.05
    assert pr["P"]["f_test"]["parallel_at_05"] is True
    assert pr["P"]["cv_pass"] is True
    assert pr["P"]["f_test"]["concentration_from_shift"] == pytest.approx(
        400, rel=0.05)
    assert pr["N"]["f_test"]["p"] < 1e-6
    assert pr["N"]["cv_pct"] > 30 and pr["N"]["cv_pass"] is False
    ft = pr["P"]["f_test"]
    assert (ft["dfn"], ft["dfd"]) == (3, 18 + 12 - 8)
    assert ft["F"] == pytest.approx(
        ((ft["ss_parallel"] - ft["ss_separate"]) / ft["dfn"])
        / (ft["ss_separate"] / ft["dfd"]))


def test_api_stdcurve_qc():
    res = api.analyze({"analysis": "stdcurve_qc",
                       "data": {"standards": _dnase(),
                                "unknowns": [{"name": "s", "signals": [0.5],
                                              "dilution": 2}]},
                       "options": {"constraints": {"Bottom": 0}}})
    assert "error" not in res, res.get("error")
    assert res["fit"]["params"]["Bottom"]["constrained"] is True
    assert res["unknowns"][0]["status"] == "ok"
    assert len(res["curve"]["x"]) == 200 and res["curve"]["x_is_log"]
