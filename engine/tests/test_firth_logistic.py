"""P-89 Firth's logistic regression (multivar.logistic_regression(firth=
True)) against an independent implementation of the penalized likelihood
(engine/tests/reference/firth_logistic.py, scipy.optimize), the published
bias-reduced fit of Heinze & Schemper's endometrial data (brglm2 README),
and the closed form of a 2x2 table (add 1/2 to every cell); plus the
separation refusal that offers it."""

import csv
import json
import math
import pathlib

import pytest

from opendose import api, multivar

HERE = pathlib.Path(__file__).parent
REF = json.loads((HERE / "reference" / "firth_logistic.json").read_text())


def endometrial():
    with open(HERE / "fixtures" / "endometrial.csv") as fh:
        rows = list(csv.DictReader(fh))
    return [{"name": k, "values": [float(r[k]) for r in rows], "kind": "continuous"}
            for k in ("NV", "PI", "EH", "HG")]


def dose_vars():
    d = REF["dose_study"]["data"]
    return [{"name": "Group", "values": d["group"], "kind": "categorical"},
            {"name": "Response", "values": d["response"], "kind": "continuous"}]


def test_endometrial_matches_the_oracle_and_the_published_fit():
    ref = REF["endometrial"]
    r = multivar.logistic_regression(endometrial(), "HG", ["NV", "PI", "EH"], firth=True)
    assert r["method"] == "firth" and r["separation"] in ("complete", "quasi-complete")
    for j, c in enumerate(r["coefficients"]):
        assert c["estimate"] == pytest.approx(ref["estimates"][j], rel=1e-7, abs=1e-9)
        assert c["se"] == pytest.approx(ref["se"][j], rel=1e-6)
        assert c["ci"] == pytest.approx(ref["profile_ci"][j], abs=2e-6)
        assert c["chi2"] == pytest.approx(ref["chi2"][j], rel=1e-6)
        assert c["p"] == pytest.approx(ref["p"][j], rel=1e-5)
        assert c["odds_ratio"] == pytest.approx(math.exp(ref["estimates"][j]), rel=1e-7)
    assert r["penalized_log_likelihood"] == pytest.approx(ref["penalized_loglik"], rel=1e-10)
    assert r["likelihood_ratio_test"]["chi2"] == pytest.approx(ref["lr_test"]["chi2"], rel=1e-6)
    # brglm2 README (Kosmidis), summary of the bias-reduced fit, 5 decimals
    assert [round(c["estimate"], 5) for c in r["coefficients"]] == [3.77456, 2.92927, -0.03475, -2.60416]
    assert [round(c["se"], 5) for c in r["coefficients"]] == [1.48869, 1.55076, 0.03958, 0.77602]


def test_acceptance_two_group_dose_study_all_treated_respond():
    """Every treated animal responds: ML is refused for separation (with the
    kind the app keys its offer on); Firth gives a finite odds ratio, 45 =
    (10.5 x 7.5) / (0.5 x 3.5), with a profile penalized-likelihood CI."""
    payload = {"analysis": "logistic_regression", "data": {"variables": dose_vars()},
               "options": {"outcome": "Response", "predictors": ["Group"]}}
    refused = api.analyze(payload)
    assert refused["error"].startswith("Quasi-perfect separation") or refused["error"].startswith("Perfect")
    assert refused["error_kind"] == "separation"
    r = api.analyze({**payload, "options": {**payload["options"], "firth": True}})
    ref = REF["dose_study"]
    c = r["coefficients"][1]
    assert c["name"] == "Group[Treated]"
    assert c["odds_ratio"] == pytest.approx(45.0, rel=1e-9)
    assert c["odds_ratio_ci"] == pytest.approx(ref["odds_ratio_ci"][1], rel=1e-6)
    assert [round(v, 4) for v in c["odds_ratio_ci"]] == [3.8451, 6439.2964]
    assert c["p"] == pytest.approx(ref["p"][1], rel=1e-6)
    assert r["analysed_rows"]["n_used"] == 20
    assert (r["n_ones"], r["n_zeros"]) == (13, 7)


def test_firth_without_separation_is_close_to_ml_and_shrunk():
    """No separation: the Firth estimates lie between 0 and the ML ones."""
    v = [{"name": "Dose", "values": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "kind": "continuous"},
         {"name": "Y", "values": [0, 0, 1, 0, 0, 1, 1, 0, 1, 1], "kind": "continuous"}]
    ml = multivar.logistic_regression(v, "Y", ["Dose"])
    fi = multivar.logistic_regression(v, "Y", ["Dose"], firth=True)
    b_ml, b_fi = ml["coefficients"][1]["estimate"], fi["coefficients"][1]["estimate"]
    assert 0 < b_fi < b_ml
    assert fi["separation"] is None
    # one continuous predictor: X at 50% = -b0 / b1, for the fitted curve
    c = fi["coefficients"]
    assert fi["x_at_50_percent"] == pytest.approx(-c[0]["estimate"] / c[1]["estimate"], rel=1e-12)


def test_firth_wald_option_and_order_invariance():
    v = dose_vars()
    w = multivar.logistic_regression(v, "Response", ["Group"], firth=True, ci_method="wald")
    c = w["coefficients"][1]
    assert c["ci"] == pytest.approx([c["estimate"] - 1.959963984540054 * c["se"],
                                     c["estimate"] + 1.959963984540054 * c["se"]], rel=1e-9)
    rev = [{**x, "values": x["values"][::-1]} for x in v]
    a = multivar.logistic_regression(v, "Response", ["Group"], firth=True,
                                     reference_levels={"Group": "Control"})
    b = multivar.logistic_regression(rev, "Response", ["Group"], firth=True,
                                     reference_levels={"Group": "Control"})
    assert b["coefficients"][1]["odds_ratio"] == pytest.approx(a["coefficients"][1]["odds_ratio"], rel=1e-9)


def test_other_refusals_carry_no_kind():
    r = api.analyze({"analysis": "logistic_regression", "data": {"variables": dose_vars()},
                     "options": {"outcome": "Response", "predictors": ["Nope"]}})
    assert "error" in r and "error_kind" not in r
