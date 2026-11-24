"""P-86 binomial regression (positives out of counted, multivar.
binomial_regression) and negative binomial regression (multivar.
negative_binomial_regression) against statsmodels (engine/tests/
reference/count_glms.py) and the published maximum-likelihood negative
binomial fit of the Ames TA98 data (Kenne Pagui, Salvan & Sartori 2020,
Table 2, as printed in the brglm2 negativeBinomial vignette), plus edge
cases and invariances."""

import csv
import json
import math
import pathlib

import pytest

from opendose import api, multivar

HERE = pathlib.Path(__file__).parent
REF = json.loads((HERE / "reference" / "count_glms.json").read_text())


def dish_vars(data):
    return [{"name": "Experiment", "values": list(data["experiment"]), "kind": "categorical"},
            {"name": "Group", "values": list(data["group"]), "kind": "categorical"},
            {"name": "Positive", "values": list(data["positive"]), "kind": "continuous"},
            {"name": "Counted", "values": list(data["counted"]), "kind": "continuous"}]


def binom(data, **kw):
    return multivar.binomial_regression(dish_vars(data), "Positive", "Counted",
                                        ["Group", "Experiment"], **kw)


@pytest.mark.parametrize("case", ["dishes", "dishes_overdispersed"])
def test_binomial_matches_statsmodels(case):
    ref = REF[case]
    r = binom(ref["data"])
    assert [c["name"] for c in r["coefficients"]] == [
        "Intercept", "Group[Treated]", "Experiment[E2]", "Experiment[E3]"]
    for j, c in enumerate(r["coefficients"]):
        assert c["estimate"] == pytest.approx(ref["estimates"][j], rel=1e-8, abs=1e-10)
        assert c["se"] == pytest.approx(ref["se"][j], rel=1e-7)
        assert c["z"] == pytest.approx(ref["z"][j], rel=1e-6)
        assert c["p"] == pytest.approx(ref["p"][j], rel=1e-5, abs=1e-14)
        assert c["ci"] == pytest.approx(ref["profile_ci"][j], abs=2e-7)
        assert c["odds_ratio"] == pytest.approx(math.exp(ref["estimates"][j]), rel=1e-8)
    assert r["deviance"] == pytest.approx(ref["deviance"], rel=1e-8, abs=1e-10)
    assert r["null_deviance"] == pytest.approx(ref["null_deviance"], rel=1e-9)
    assert r["log_likelihood"] == pytest.approx(ref["llf"], rel=1e-10)
    assert r["null_log_likelihood"] == pytest.approx(ref["llf_null"], rel=1e-10)
    assert r["model_comparison"]["selected"]["aic"] == pytest.approx(ref["aic"], rel=1e-10)
    assert r["dispersion"]["pearson_chi2"] == pytest.approx(ref["pearson_chi2"], rel=1e-7)
    assert r["dispersion"]["phi"] == pytest.approx(ref["phi"], rel=1e-7)
    terms = {t["term"]: t for t in r["term_tests"]}
    for term, want in ref["term_lrt"].items():
        got = terms[term.capitalize()]
        assert got["deviance_drop"] == pytest.approx(want["drop"], rel=1e-7)
        assert got["df"] == want["df"]
        assert got["p"] == pytest.approx(want["p"], rel=1e-6)


def test_quasibinomial_matches_statsmodels_scale_x2():
    ref = REF["dishes_overdispersed"]
    r = binom(ref["data"], quasi=True)
    q = ref["quasi"]
    assert r["family"] == "quasibinomial" and r["ci_method"] == "wald_t"
    assert r["dispersion"]["phi"] == pytest.approx(q["phi"], rel=1e-7)
    for j, c in enumerate(r["coefficients"]):
        assert c["se"] == pytest.approx(q["se"][j], rel=1e-7)
        assert c["t"] == pytest.approx(q["t"][j], rel=1e-6)
        assert c["p"] == pytest.approx(q["p"][j], rel=1e-5)
        assert c["ci"] == pytest.approx(q["ci"][j], rel=1e-6)
        assert c["df"] == 14
    terms = {t["term"]: t for t in r["term_tests"]}
    for term, want in q["terms"].items():
        got = terms[term.capitalize()]
        assert got["F"] == pytest.approx(want["F"], rel=1e-6)
        assert (got["df"], got["df2"]) == (want["df1"], want["df2"])
        assert got["p"] == pytest.approx(want["p"], rel=1e-6)
    assert r["f_test"]["F"] == pytest.approx(q["f_test"]["F"], rel=1e-6)
    assert r["f_test"]["p"] == pytest.approx(q["f_test"]["p"], rel=1e-6)
    assert "model_comparison" not in r


def test_acceptance_odds_ratio_for_group_with_experiment_as_block():
    """3 experiments x 2 groups with positives and totals: the odds ratio
    for group with its CI, experiment as a block (its own LR test), and
    the dispersion check (display precision of the statsmodels values)."""
    r = binom(REF["dishes"]["data"])
    g = r["coefficients"][1]
    assert g["name"] == "Group[Treated]"
    assert round(g["odds_ratio"], 3) == 3.196
    assert [round(c, 3) for c in g["odds_ratio_ci"]] == [2.127, 4.881]
    assert {t["term"] for t in r["term_tests"]} == {"Group", "Experiment"}
    assert r["dispersion"]["df"] == 2
    assert round(r["dispersion"]["phi"], 4) == 0.0272
    assert r["warnings"] == []
    assert r["total_positive"] == 137 and r["total_counted"] == 605


def test_overdispersed_dishes_warn():
    r = binom(REF["dishes_overdispersed"]["data"])
    assert r["dispersion"]["phi"] == pytest.approx(4.772, abs=5e-4)
    assert len(r["warnings"]) == 1 and "overdispersion" in r["warnings"][0]


def test_binomial_wald_option_and_api():
    ref = REF["dishes"]
    r = api.analyze({"analysis": "binomial_regression",
                     "data": {"variables": dish_vars(ref["data"])},
                     "options": {"outcome": "Positive", "totals": "Counted",
                                 "predictors": ["Group", "Experiment"], "ci_method": "wald"}})
    assert r["analysis"] == "binomial_regression"
    for j, c in enumerate(r["coefficients"]):
        assert c["ci"] == pytest.approx(ref["wald_ci"][j], rel=1e-7)
    assert r["analysed_rows"]["n_used"] == 6


def test_binomial_row_order_and_group_order_invariance():
    data = REF["dishes"]["data"]
    rev = {k: v[::-1] for k, v in data.items()}
    a = binom(data, reference_levels={"Group": "Control", "Experiment": "E1"})
    b = binom(rev, reference_levels={"Group": "Control", "Experiment": "E1"})
    assert b["coefficients"][1]["odds_ratio"] == pytest.approx(a["coefficients"][1]["odds_ratio"], rel=1e-9)
    flip = binom(data, reference_levels={"Group": "Treated"})
    assert flip["coefficients"][1]["odds_ratio"] == pytest.approx(1 / a["coefficients"][1]["odds_ratio"], rel=1e-9)
    assert flip["coefficients"][1]["ci"] == pytest.approx(
        [-a["coefficients"][1]["ci"][1], -a["coefficients"][1]["ci"][0]], abs=1e-7)


def test_binomial_missing_totals_drop_the_row():
    v = dish_vars(REF["dishes"]["data"])
    v[3]["values"][2] = None
    r = api.analyze({"analysis": "binomial_regression", "data": {"variables": v},
                     "options": {"outcome": "Positive", "totals": "Counted",
                                 "predictors": ["Group", "Experiment"]}})
    assert r["n_rows_analyzed"] == 5
    assert r["analysed_rows"]["dropped"] == [{"row": 3, "blank": ["Counted"], "not_number": []}]


@pytest.mark.parametrize("patch, message", [
    ({"positive": [12, 31, 18, 40, 9, 95]}, "positives out of a total of 90"),
    ({"counted": [100, 100, 0, 115, 80, 90]}, "total is 0"),
    ({"positive": [12.5, 31, 18, 40, 9, 27]}, "whole counts"),
    ({"positive": [0, 31, 0, 40, 0, 27]}, "Group = Control has no positives"),
    ({"positive": [12, 100, 18, 115, 9, 90]}, "Group = Treated has only positives"),
    ({"positive": [0] * 6}, "no row has any positives"),
    ({"positive": [100, 100, 120, 115, 80, 90]}, "every one counted is positive"),
])
def test_binomial_edge_cases_explain_themselves(patch, message):
    with pytest.raises(ValueError, match=message):
        binom({**REF["dishes"]["data"], **patch})


def test_binomial_separation_on_a_continuous_predictor():
    v = [{"name": "Dose", "values": [1, 2, 3, 4, 5, 6], "kind": "continuous"},
         {"name": "Positive", "values": [0, 0, 0, 5, 8, 9], "kind": "continuous"},
         {"name": "Counted", "values": [10, 10, 10, 10, 10, 10], "kind": "continuous"}]
    # rows 4-6 below the total: no separation, so this fits ...
    multivar.binomial_regression(v, "Positive", "Counted", ["Dose"])
    v[1]["values"] = [0, 0, 0, 10, 10, 10]
    with pytest.raises(ValueError, match="separation"):
        multivar.binomial_regression(v, "Positive", "Counted", ["Dose"])


def test_binomial_too_few_rows():
    small = {k: v[:2] for k, v in REF["dishes"]["data"].items()}
    with pytest.raises(ValueError, match="more rows"):
        multivar.binomial_regression(dish_vars(small), "Positive", "Counted", ["Group"])


# ---------------------------------------------------------------- negative binomial

def ames_vars(ref):
    return [{"name": "Dose", "values": ref["data"]["dose"], "kind": "continuous"},
            {"name": "log(Dose + 10)", "values": ref["data"]["log_dose_plus_10"], "kind": "continuous"},
            {"name": "Revertants", "values": ref["data"]["revertants"], "kind": "continuous"}]


def check_nb(r, ref, ci_abs=1e-6):
    assert r["theta"] == pytest.approx(ref["theta"], rel=1e-6)
    for j, c in enumerate(r["coefficients"]):
        assert c["estimate"] == pytest.approx(ref["glm_estimates"][j], rel=1e-6, abs=1e-9)
        assert c["se"] == pytest.approx(ref["se"][j], rel=1e-5)
        assert c["z"] == pytest.approx(ref["z"][j], rel=1e-5)
        assert c["p"] == pytest.approx(ref["p"][j], rel=1e-4)
        assert c["ci"] == pytest.approx(ref["profile_ci"][j], abs=ci_abs)
    assert r["log_likelihood"] == pytest.approx(ref["llf"], rel=1e-9)
    assert r["null_log_likelihood"] == pytest.approx(ref["llf_null"], rel=1e-8)
    assert r["likelihood_ratio_test"]["G"] == pytest.approx(ref["lr_test"]["G"], rel=1e-5)
    assert r["likelihood_ratio_test"]["p"] == pytest.approx(ref["lr_test"]["p"], rel=1e-4)
    assert r["vs_poisson"]["LR"] == pytest.approx(ref["vs_poisson"]["LR"], rel=1e-6)
    assert r["vs_poisson"]["p"] == pytest.approx(ref["vs_poisson"]["p"], rel=1e-5)
    assert r["aic"] == pytest.approx(ref["aic"], rel=1e-9)
    assert r["dispersion"]["phi"] == pytest.approx(ref["pearson_phi"], rel=1e-6)


def test_negbin_ames_matches_statsmodels_and_the_published_fit():
    ref = REF["ames"]
    r = multivar.negative_binomial_regression(ames_vars(ref), "Revertants", ["Dose", "log(Dose + 10)"])
    check_nb(r, ref)
    # Kenne Pagui, Salvan & Sartori 2020, Table 2 (ML), 4 decimals
    est = [round(c["estimate"], 4) for c in r["coefficients"]]
    se = [round(c["se"], 4) for c in r["coefficients"]]
    assert est == [2.1976, -0.0010, 0.3125]
    assert se == [0.3246, 0.0004, 0.0879]
    assert round(r["alpha"], 4) == 0.0488


def test_negbin_quine_matches_statsmodels():
    ref = REF["quine"]
    with open(HERE / "fixtures" / "quine.csv") as fh:
        rows = list(csv.DictReader(fh))
    v = [{"name": k, "values": [r[k] for r in rows], "kind": "categorical"}
         for k in ("Eth", "Sex", "Age", "Lrn")]
    v.append({"name": "Days", "values": [float(r["Days"]) for r in rows], "kind": "continuous"})
    r = api.analyze({"analysis": "negative_binomial_regression", "data": {"variables": v},
                     "options": {"outcome": "Days", "predictors": ["Eth", "Sex", "Age", "Lrn"]}})
    assert [c["name"] for c in r["coefficients"]] == ref["names"]
    check_nb(r, ref, ci_abs=1e-5)
    assert round(r["theta"], 4) == 1.2749


def test_negbin_exposure_offset_scales_the_intercept_only():
    ref = REF["ames"]
    v = ames_vars(ref) + [{"name": "Plates", "values": [2.0] * 18, "kind": "continuous"}]
    a = multivar.negative_binomial_regression(ames_vars(ref), "Revertants", ["Dose", "log(Dose + 10)"])
    b = multivar.negative_binomial_regression(v, "Revertants", ["Dose", "log(Dose + 10)"], exposure="Plates")
    assert b["coefficients"][0]["estimate"] == pytest.approx(a["coefficients"][0]["estimate"] - math.log(2), abs=1e-7)
    assert b["coefficients"][2]["estimate"] == pytest.approx(a["coefficients"][2]["estimate"], abs=1e-7)
    assert b["theta"] == pytest.approx(a["theta"], rel=1e-6)


def test_negbin_refuses_counts_without_overdispersion():
    v = [{"name": "Group", "values": ["A"] * 6 + ["B"] * 6, "kind": "categorical"},
         {"name": "Count", "values": [10, 10, 11, 10, 9, 10, 20, 21, 20, 19, 20, 20], "kind": "continuous"}]
    with pytest.raises(ValueError, match="use Poisson regression"):
        multivar.negative_binomial_regression(v, "Count", ["Group"])


@pytest.mark.parametrize("counts, message", [
    ([0, 0, 0, 0, 0, 0, 3, 8, 1, 12, 0, 5], "every count in Group = A is 0"),
    ([1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "actual counts"),
    ([0] * 12, "every count is 0"),
])
def test_negbin_edge_cases(counts, message):
    v = [{"name": "Group", "values": ["A"] * 6 + ["B"] * 6, "kind": "categorical"},
         {"name": "Count", "values": counts, "kind": "continuous"}]
    with pytest.raises(ValueError, match=message):
        multivar.negative_binomial_regression(v, "Count", ["Group"])
