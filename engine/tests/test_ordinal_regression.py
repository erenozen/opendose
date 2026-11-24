"""P-88 ordinal (proportional-odds) regression (ordinal.ordinal_regression)
against statsmodels' OrderedModel and an independent partial
proportional-odds likelihood (engine/tests/reference/ordinal_regression.py),
the fit ordinal::clm prints for the wine data in its vignette, the
two-level case (logistic regression), invariances and the refusals."""

import csv
import json
import math
import pathlib
import random

import pytest

from opendose import api, multivar, ordinal

HERE = pathlib.Path(__file__).parent
REF = json.loads((HERE / "reference" / "ordinal_regression.json").read_text())


def wine(extra=()):
    with open(HERE / "fixtures" / "wine.csv") as fh:
        rows = list(csv.DictReader(fh))
    out = [{"name": "rating", "values": [float(r["rating"]) for r in rows], "kind": "continuous"},
           {"name": "temp", "values": [r["temp"] for r in rows], "kind": "categorical"},
           {"name": "contact", "values": [r["contact"] for r in rows], "kind": "categorical"}]
    if "judge" in extra:
        out.append({"name": "judge", "values": [r["judge"] for r in rows], "kind": "categorical"})
    if "bottle" in extra:
        out.append({"name": "bottle", "values": [float(r["bottle"]) for r in rows],
                    "kind": "continuous"})
    return out


def histology():
    d = REF["histology"]["data"]
    return [{"name": "Score", "values": d["score"], "kind": "continuous"},
            {"name": "Group", "values": d["group"], "kind": "categorical"},
            {"name": "Experiment", "values": d["experiment"], "kind": "categorical"}]


def test_wine_matches_ordered_model_and_the_independent_nominal_fit():
    ref = REF["wine"]
    r = ordinal.ordinal_regression(wine(), "rating", ["temp", "contact"])
    assert [c["name"] for c in r["coefficients"]] == ["temp[warm]", "contact[yes]"]
    assert r["levels"] == ["1", "2", "3", "4", "5"] and r["level_counts"] == [5, 22, 26, 12, 7]
    for j, c in enumerate(r["coefficients"]):
        assert c["estimate"] == pytest.approx(ref["beta"][j], rel=1e-7)
        assert c["se"] == pytest.approx(ref["beta_se"][j], rel=1e-5)
        assert c["ci"] == pytest.approx(ref["profile_ci"][j], abs=1e-7)
        assert c["odds_ratio"] == pytest.approx(math.exp(ref["beta"][j]), rel=1e-7)
    for j, t in enumerate(r["thresholds"]):
        assert t["estimate"] == pytest.approx(ref["thresholds"][j], rel=1e-7)
        assert t["se"] == pytest.approx(ref["threshold_se"][j], rel=1e-5)
    assert r["log_likelihood"] == pytest.approx(ref["llf"], rel=1e-10)
    assert r["null_log_likelihood"] == pytest.approx(ref["null_llf"], rel=1e-12)
    assert r["likelihood_ratio_test"]["G"] == pytest.approx(2 * (ref["llf"] - ref["null_llf"]), rel=1e-8)
    for t, ll in zip(r["term_tests"], ref["drop1_llf"]):
        assert t["LR"] == pytest.approx(2 * (ref["llf"] - ll), rel=1e-7)
    po = {t["term"]: t for t in r["proportional_odds"]["tests"]}
    for term in ("temp", "contact"):
        assert po[term]["df"] == 3
        assert po[term]["log_likelihood"] == pytest.approx(ref["nominal"][term]["llf"], abs=1e-6)
        assert po[term]["p"] == pytest.approx(ref["nominal"][term]["p"], abs=1e-6)
    assert r["proportional_odds"]["any_violation"] is False and r["warnings"] == []


def test_wine_matches_the_published_clm_fit():
    """Christensen, "Cumulative link models for ordinal regression with the
    R package ordinal" (CRAN vignette clm_article), sections 4.1 and 4.2:
    summary(fm1), drop1(fm1), confint(fm1) and nominal_test(fm1) for
    rating ~ temp + contact on the wine data."""
    r = ordinal.ordinal_regression(wine(), "rating", ["temp", "contact"])
    assert [round(c["estimate"], 4) for c in r["coefficients"]] == [2.5031, 1.5278]
    assert [round(c["se"], 4) for c in r["coefficients"]] == [0.5287, 0.4766]
    assert [round(c["z"], 3) for c in r["coefficients"]] == [4.735, 3.205]
    assert [round(t["estimate"], 4) for t in r["thresholds"]] == [-1.3444, 1.2508, 3.4669, 5.0064]
    assert [round(t["se"], 4) for t in r["thresholds"]] == [0.5171, 0.4379, 0.5978, 0.7309]
    assert [t["name"] for t in r["thresholds"]] == ["1|2", "2|3", "3|4", "4|5"]
    assert round(r["log_likelihood"], 3) == -86.492 and round(r["aic"], 2) == 184.98
    assert [round(t["LR"], 3) for t in r["term_tests"]] == [26.928, 11.043]
    assert [round(t["aic"], 2) for t in r["term_tests"]] == [209.91, 194.03]
    # clm's confint interpolates the profile with a spline: agreement to 5e-5
    assert r["coefficients"][0]["ci"] == pytest.approx([1.5097627, 3.595225], abs=5e-5)
    assert r["coefficients"][1]["ci"] == pytest.approx([0.6157925, 2.492404], abs=5e-5)
    po = r["proportional_odds"]["tests"]
    assert [round(t["log_likelihood"], 3) for t in po] == [-84.904, -86.209]
    assert [round(t["LR"], 4) for t in po] == [3.1750, 0.5667]
    assert [round(t["p"], 4) for t in po] == [0.3654, 0.9040]
    assert round(r["condition_number_hessian"]) == 27 and r["iterations"] <= 8


def test_judge_as_a_block_matches_ordered_model():
    ref = REF["wine_judge"]
    r = ordinal.ordinal_regression(wine(["judge"]), "rating", ["temp", "contact", "judge"])
    assert [c["name"] for c in r["coefficients"]] == ref["columns"]
    for j, c in enumerate(r["coefficients"]):
        assert c["estimate"] == pytest.approx(ref["beta"][j], rel=1e-6)
        assert c["se"] == pytest.approx(ref["beta_se"][j], rel=1e-4)
    assert [t["estimate"] for t in r["thresholds"]] == pytest.approx(ref["thresholds"], rel=1e-6)
    assert r["log_likelihood"] == pytest.approx(ref["llf"], rel=1e-10)
    assert r["reference_levels"] == {"temp": "cold", "contact": "no", "judge": "1"}
    assert [t["df"] for t in r["term_tests"]] == [1, 1, 8]


def test_histology_example_through_the_api():
    ref = REF["histology"]
    r = api.analyze({"analysis": "ordinal_regression", "data": {"variables": histology()},
                     "options": {"outcome": "Score", "predictors": ["Group", "Experiment"],
                                 "reference_levels": {"Group": "Vehicle"}}})
    assert "error" not in r, r.get("error")
    assert r["analysis"] == "ordinal_regression"
    assert [c["name"] for c in r["coefficients"]] == ref["columns"]
    for j, c in enumerate(r["coefficients"]):
        assert c["estimate"] == pytest.approx(ref["beta"][j], rel=1e-7)
        assert c["se"] == pytest.approx(ref["beta_se"][j], rel=1e-5)
    drug = r["coefficients"][0]
    assert drug["ci"] == pytest.approx(ref["profile_ci"][0], abs=1e-7)
    # displayed in the e2e step and ui-stage: odds ratio 0.01825 (0.002086 to 0.1006)
    assert f"{drug['odds_ratio']:.4g}" == "0.01825"
    assert [f"{v:.4g}" for v in drug["odds_ratio_ci"]] == ["0.002086", "0.1006"]
    for t, ll in zip(r["term_tests"], ref["drop1_llf"]):
        assert t["LR"] == pytest.approx(2 * (ref["llf"] - ll), rel=1e-7)
    group = r["proportional_odds"]["tests"][0]
    assert group["term"] == "Group"
    assert group["LR"] == pytest.approx(ref["nominal_group"]["LR"], abs=1e-6)
    assert r["analysed_rows"]["n_used"] == 36 and r["analysed_rows"]["dropped"] == []


def test_two_levels_is_logistic_regression():
    """With two levels logit P(Y <= 1) = theta - x'beta, so beta is the
    logistic slope for the higher level and theta minus its intercept."""
    ref = REF["two_levels"]
    v = wine()
    v[0] = {"name": "rating", "values": [1.0 if x >= 3 else 0.0 for x in v[0]["values"]],
            "kind": "continuous"}
    r = ordinal.ordinal_regression(v, "rating", ["temp", "contact"])
    assert [c["estimate"] for c in r["coefficients"]] == pytest.approx(ref["beta"], rel=1e-7)
    assert [c["se"] for c in r["coefficients"]] == pytest.approx(ref["se"], rel=1e-6)
    assert r["thresholds"][0]["estimate"] == pytest.approx(-ref["intercept"], rel=1e-7)
    assert r["log_likelihood"] == pytest.approx(ref["llf"], rel=1e-10)
    lg = multivar.logistic_regression(v, "rating", ["temp", "contact"])
    for c, c_lg in zip(r["coefficients"], lg["coefficients"][1:]):
        assert c["ci"] == pytest.approx(c_lg["ci"], abs=1e-6)
    assert r["proportional_odds"]["tests"] == []  # nothing to test with one threshold


def test_invariances():
    base = ordinal.ordinal_regression(wine(["bottle"]), "rating", ["temp", "bottle"])
    # row order
    v = wine(["bottle"])
    idx = list(range(72))
    random.Random(3).shuffle(idx)
    perm = [{**c, "values": [c["values"][i] for i in idx]} for c in v]
    r = ordinal.ordinal_regression(perm, "rating", ["temp", "bottle"])
    assert [c["estimate"] for c in r["coefficients"]] == pytest.approx(
        [c["estimate"] for c in base["coefficients"]], rel=1e-9)
    # units of a continuous predictor: the slope scales, tests do not move
    for k in (1e-12, 1e3, 1e12):
        v = wine(["bottle"])
        v[3] = {**v[3], "values": [x * k for x in v[3]["values"]]}
        r = ordinal.ordinal_regression(v, "rating", ["temp", "bottle"])
        assert r["coefficients"][1]["estimate"] * k == pytest.approx(
            base["coefficients"][1]["estimate"], rel=1e-6)
        assert r["coefficients"][1]["p"] == pytest.approx(base["coefficients"][1]["p"], rel=1e-6)
        assert r["log_likelihood"] == pytest.approx(base["log_likelihood"], rel=1e-10)
    # relabelled scores (1-5 to 10-50): same fit; reversed scale: signs flip
    v = wine()
    v[0] = {**v[0], "values": [10 * x for x in v[0]["values"]]}
    r = ordinal.ordinal_regression(v, "rating", ["temp", "contact"])
    w = ordinal.ordinal_regression(wine(), "rating", ["temp", "contact"])
    assert r["log_likelihood"] == pytest.approx(w["log_likelihood"], rel=1e-12)
    assert r["thresholds"][0]["name"] == "10|20"
    v = wine()
    v[0] = {**v[0], "values": [-x for x in v[0]["values"]]}
    r = ordinal.ordinal_regression(v, "rating", ["temp", "contact"])
    assert [c["estimate"] for c in r["coefficients"]] == pytest.approx(
        [-c["estimate"] for c in w["coefficients"]], rel=1e-8)
    assert [t["estimate"] for t in r["thresholds"]] == pytest.approx(
        [-t["estimate"] for t in reversed(w["thresholds"])], rel=1e-8)
    # text levels with their order give the numeric fit
    names = {1: "none", 2: "mild", 3: "moderate", 4: "marked", 5: "severe"}
    v = wine()
    v[0] = {"name": "rating", "values": [names[int(x)] for x in v[0]["values"]],
            "kind": "categorical"}
    r = ordinal.ordinal_regression(v, "rating", ["temp", "contact"],
                                   outcome_order=list(names.values()))
    assert r["log_likelihood"] == pytest.approx(w["log_likelihood"], rel=1e-12)
    assert r["thresholds"][0]["name"] == "none|mild"


def test_wald_intervals():
    r = ordinal.ordinal_regression(wine(), "rating", ["temp", "contact"], ci_method="wald")
    c = r["coefficients"][0]
    assert c["ci"] == pytest.approx([c["estimate"] - 1.959963985 * c["se"],
                                     c["estimate"] + 1.959963985 * c["se"]], rel=1e-8)
    with pytest.raises(ValueError, match="unknown CI method"):
        ordinal.ordinal_regression(wine(), "rating", ["temp"], ci_method="bogus")


def test_missing_values_drop_the_row():
    v = wine()
    v[0]["values"][0] = None
    v[1]["values"][5] = ""
    r = api.analyze({"analysis": "ordinal_regression", "data": {"variables": v},
                     "options": {"outcome": "rating", "predictors": ["temp", "contact"]}})
    assert r["n_rows_analyzed"] == 70 and r["n_rows_skipped"] == 2
    assert [d["row"] for d in r["analysed_rows"]["dropped"]] == [1, 6]


def test_score_gaps_are_named_not_hidden():
    v = wine()
    v[0] = {**v[0], "values": [x if x < 4 else x + 1 for x in v[0]["values"]]}  # 1,2,3,5,6
    r = ordinal.ordinal_regression(v, "rating", ["temp", "contact"])
    assert r["levels"] == ["1", "2", "3", "5", "6"]
    assert r["warnings"] and "No analysed row has the score 4" in r["warnings"][0]


def _err(variables, **options):
    r = api.analyze({"analysis": "ordinal_regression", "data": {"variables": variables},
                     "options": options})
    assert "error" in r
    return r


def test_refusals_have_a_sentence():
    # one level
    v = [{"name": "S", "values": [2.0] * 6}, {"name": "G", "values": list("aaabbb")}]
    assert "only one level" in _err(v, outcome="S", predictors=["G"])["error"]
    # declared level with no rows
    v = [{"name": "S", "values": ["low", "mid", "low", "mid", "mid", "low"], "kind": "categorical"},
         {"name": "G", "values": list("aaabbb")}]
    assert "no row has the outcome level 'high'" in _err(
        v, outcome="S", predictors=["G"], outcome_order=["low", "mid", "high"])["error"]
    # text levels without an order
    assert "give their order" in _err(v, outcome="S", predictors=["G"])["error"]
    # more parameters than rows
    v = [{"name": "S", "values": [0.0, 1.0, 2.0, 3.0]}, {"name": "x", "values": [1.0, 2.0, 3.0, 5.0]}]
    assert "more rows" in _err(v, outcome="S", predictors=["x"])["error"]
    # one group
    v = [{"name": "S", "values": [0.0, 1.0, 2.0, 1.0, 0.0, 2.0]}, {"name": "G", "values": list("aaaaaa")}]
    assert "only one level" in _err(v, outcome="S", predictors=["G"])["error"]
    # n = 0 complete rows
    v = [{"name": "S", "values": [None, None]}, {"name": "G", "values": ["a", "b"]}]
    assert "no rows with complete data" in _err(v, outcome="S", predictors=["G"])["error"]


def test_separation_is_refused():
    # complete: every b scores above every a
    v = [{"name": "S", "values": [0.0, 1.0, 0.0, 1.0, 2.0, 3.0, 2.0, 3.0]},
         {"name": "G", "values": list("aaaabbbb")}]
    r = _err(v, outcome="S", predictors=["G"])
    assert r["error_kind"] == "separation" and r["error"].startswith("Separation: the predictors")
    assert "rank test" in r["error"]
    # quasi-complete: the groups meet only at score 1
    v = [{"name": "S", "values": [0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 2.0, 2.0]},
         {"name": "G", "values": list("aaaabbbb")}]
    r = _err(v, outcome="S", predictors=["G"])
    assert r["error_kind"] == "separation" and r["error"].startswith("Separation")
    # the wine data (empty cells, but overlapping) is not separated
    assert ordinal.detect_separation(*_wine_coded()) is None


def _wine_coded():
    import numpy as np
    t = multivar.parse_table(wine())
    d = multivar._design(t, "rating", ["temp", "contact"])
    _, y, _ = ordinal._code_levels(multivar._by_name(t)["rating"], d["rows"])
    return y, 5, d["X"][:, 1:]


def test_proportional_odds_violation_is_flagged():
    # b spreads to both ends of the scale, a stays in the middle: the
    # effect is negative at the low cut points and positive at the high ones
    a = [1, 2, 2, 2, 2, 2, 2, 3, 1, 2, 2, 2, 2, 2, 3, 2, 2, 2, 1, 3]
    b = [0, 0, 0, 4, 4, 4, 0, 4, 1, 3, 0, 4, 0, 4, 0, 4, 2, 0, 4, 4]
    v = [{"name": "S", "values": [float(x) for x in a + b]},
         {"name": "G", "values": ["a"] * 20 + ["b"] * 20}]
    r = ordinal.ordinal_regression(v, "S", ["G"])
    po = r["proportional_odds"]
    assert po["any_violation"] is True and po["tests"][0]["p"] < 0.001
    assert any("proportional-odds check rejects" in w for w in r["warnings"])
