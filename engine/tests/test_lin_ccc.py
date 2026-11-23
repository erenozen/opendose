"""P-43: Lin's concordance correlation coefficient (methodcomp.lin_ccc)
and its place in the Bland-Altman, Deming and Passing-Bablok results.

Reference values: engine/tests/reference/lin_ccc.py, a transcription of
DescTools::CCC (z-transform CI; the formulas of epiR::epi.ccc), from Lin
(1989, Biometrics 45:255) with Lin (2000, Biometrics 56:324). R is not
installed and pingouin has no CCC.
"""

import json
import math
import os

import pytest

from opendose import api, methodcomp

REF = json.load(open(os.path.join(os.path.dirname(__file__), "reference",
                                  "lin_ccc.json")))
SETS = ("ejection", "giavarina", "deming_e2e")


@pytest.mark.parametrize("name", SETS)
def test_matches_descTools_transcription(name):
    ref = REF[name]
    got = methodcomp.lin_ccc(ref["x"], ref["y"])
    assert got["ccc"] == pytest.approx(ref["ccc"], rel=1e-12)
    assert got["ci"] == pytest.approx(ref["ci"], rel=1e-12)
    assert got["se_z"] == pytest.approx(ref["se_z"], rel=1e-12)
    assert got["pearson_r"] == pytest.approx(ref["r"], rel=1e-12)
    assert got["bias_correction"] == pytest.approx(ref["c_b"], rel=1e-12)
    assert got["n"] == ref["n"]


def test_ci_level():
    ref = REF["ejection"]
    got = methodcomp.lin_ccc(ref["x"], ref["y"], ci_level=0.90)
    assert got["ci"] == pytest.approx(ref["ci90"], rel=1e-12)


def test_display_precision_of_the_bland_altman_template():
    r = methodcomp.lin_ccc(REF["ejection"]["x"], REF["ejection"]["y"])
    assert f"{r['ccc']:.4g}" == "0.6614"
    assert [f"{v:.4g}" for v in r["ci"]] == ["0.509", "0.7736"]


def test_precision_times_accuracy():
    """rho_c = r C_b (Lin 1989): a high r with a slope of 2 gives a low
    CCC (the Deming e2e table)."""
    r = methodcomp.lin_ccc(REF["deming_e2e"]["x"], REF["deming_e2e"]["y"])
    assert r["pearson_r"] > 0.99 and r["ccc"] < 0.45
    assert r["ccc"] == pytest.approx(r["pearson_r"] * r["bias_correction"],
                                     rel=1e-14)


# ---------------------------------------------------------------- edges

@pytest.mark.parametrize("n", [0, 1, 2])
def test_too_few_pairs(n):
    with pytest.raises(ValueError, match="at least 3 pairs"):
        methodcomp.lin_ccc([1.0, 2.0][:n], [1.0, 2.5][:n])


def test_constant_method():
    with pytest.raises(ValueError, match="same value for every sample"):
        methodcomp.lin_ccc([3, 3, 3, 3], [1, 2, 3, 4])


def test_identical_methods_have_no_ci():
    r = methodcomp.lin_ccc([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])
    assert r["ccc"] == 1 and r["ci"] is None
    assert "agree exactly" in r["ci_note"]


def test_uncorrelated_has_no_ci():
    r = methodcomp.lin_ccc([1, 2, 3, 4, 5], [2, 4, 3, 4, 2])
    assert r["ccc"] == 0 and r["ci"] is None and "Pearson's r is 0" in r["ci_note"]


def test_missing_values_drop_the_pair():
    ref = REF["giavarina"]
    a = methodcomp.lin_ccc(ref["x"] + [None, 5.0, float("nan")],
                           ref["y"] + [1.0, None, 3.0])
    assert a["n"] == 30 and a["ccc"] == pytest.approx(ref["ccc"], rel=1e-12)


# ---------------------------------------------------------- invariances

def test_symmetric_in_the_two_methods():
    ref = REF["ejection"]
    a = methodcomp.lin_ccc(ref["x"], ref["y"])
    b = methodcomp.lin_ccc(ref["y"], ref["x"])
    assert b["ccc"] == pytest.approx(a["ccc"], rel=1e-12)
    assert b["ci"] == pytest.approx(a["ci"], rel=1e-12)


@pytest.mark.parametrize("scale,shift", [(1e-12, 0.0), (1e12, 5e12),
                                         (1000.0, -3.0)])
def test_a_unit_change_of_both_methods_leaves_it_unchanged(scale, shift):
    ref = REF["ejection"]
    a = methodcomp.lin_ccc(ref["x"], ref["y"])
    b = methodcomp.lin_ccc([v * scale + shift for v in ref["x"]],
                           [v * scale + shift for v in ref["y"]])
    assert b["ccc"] == pytest.approx(a["ccc"], rel=1e-6)
    assert b["ci"] == pytest.approx(a["ci"], rel=1e-6)


def test_rescaling_one_method_lowers_it():
    ref = REF["ejection"]
    a = methodcomp.lin_ccc(ref["x"], ref["y"])
    b = methodcomp.lin_ccc(ref["x"], [2 * v for v in ref["y"]])
    assert b["pearson_r"] == pytest.approx(a["pearson_r"], rel=1e-12)
    assert b["ccc"] < a["ccc"]


# ------------------------------------------------------------------ api

def _cols(x, y):
    return {"datasets": [{"name": "RV", "ys": [[v] for v in x]},
                         {"name": "IC", "ys": [[v] for v in y]}]}


def test_bland_altman_carries_the_ccc():
    ref = REF["ejection"]
    r = api.analyze({"analysis": "bland_altman_extras",
                     "data": _cols(ref["x"], ref["y"]), "options": {}})
    assert r["ccc"]["ccc"] == pytest.approx(ref["ccc"], rel=1e-12)
    assert r["ccc"]["ci"] == pytest.approx(ref["ci"], rel=1e-12)
    # the existing Bland-Altman numbers are untouched
    assert r["difference"]["bias"] == pytest.approx(0.6021667, abs=1e-7)


def test_bland_altman_ci_level_applies():
    ref = REF["ejection"]
    r = api.analyze({"analysis": "bland_altman_extras",
                     "data": _cols(ref["x"], ref["y"]),
                     "options": {"ci_level": 0.90}})
    assert r["ccc"]["ci"] == pytest.approx(ref["ci90"], rel=1e-12)


def test_deming_and_method_regression_carry_the_ccc():
    ref = REF["deming_e2e"]
    data = {"x": ref["x"], "datasets": [{"name": "Y",
                                         "ys": [[v] for v in ref["y"]]}]}
    d = api.analyze({"analysis": "deming", "data": data, "options": {}})
    assert d["datasets"][0]["ccc"]["ccc"] == pytest.approx(ref["ccc"], rel=1e-12)
    assert d["datasets"][0]["fit"]["slope"]["value"] == pytest.approx(
        1.991, abs=5e-4)
    m = api.analyze({"analysis": "method_regression", "data": data,
                     "options": {}})
    assert m["comparisons"][0]["ccc"]["ci"] == pytest.approx(ref["ci"],
                                                             rel=1e-12)


def test_api_reports_why_it_is_missing():
    r = api.analyze({"analysis": "bland_altman_extras",
                     "data": _cols([2, 2, 2, 2], [1, 2, 3, 4]),
                     "options": {}})
    assert "same value for every sample" in r["ccc"]["error"]
    assert math.isfinite(r["difference"]["bias"])
