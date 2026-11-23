"""P-42: Passing-Bablok and Theil-Sen method-comparison regression with
the CUSUM test of linearity (opendose.methodreg, api "method_regression").

Reference values: engine/tests/reference/method_regression.py, an
independent direct implementation of Passing & Bablok (1983) in exact
fractions (with NCSS's +/- inf convention for equal x, so it counts K
differently from the engine and must still give the same line), and
scipy.stats.theilslopes / kendalltau, on Giavarina (2015) Table 1, the
Bland & Altman (2007) ejection fractions and a small set with ties, a
slope of exactly -1 and slopes below -1; and the published
Passing-Bablok line of Giavarina D (2015), "Understanding Bland Altman
analysis", Biochem Med 25:141-151 (Table 1 data; text: "y = 7.08 (-0.30
to 19.84) + 1.06 (1.02 to 1.09) x"). R (mcr) is not installed and mcr's
creatinine data are not available as text: not pinned.
"""

import json
import math
import os

import numpy as np
import pytest

from opendose import api, methodreg

REF = json.load(open(os.path.join(os.path.dirname(__file__), "reference",
                                  "method_regression.json")))
SETS = ("giavarina", "ejection", "ties")


def close(a, b, rel=1e-12):
    return a == pytest.approx(b, rel=rel, abs=1e-12)


@pytest.mark.parametrize("name", SETS)
@pytest.mark.parametrize("level,key", [(0.95, "passing_bablok"),
                                       (0.90, "passing_bablok_90")])
def test_passing_bablok_matches_direct_reference(name, level, key):
    ref = REF[name]
    want = ref[key]
    got = methodreg.passing_bablok(ref["x"], ref["y"], ci_level=level)
    assert close(got["slope"]["value"], want["slope"])
    assert close(got["intercept"]["value"], want["intercept"])
    for g, w in zip(got["slope"]["ci"], want["slope_ci"]):
        assert close(g, w)
    for g, w in zip(got["intercept"]["ci"], want["intercept_ci"]):
        assert close(g, w)
    assert got["n_slopes"] == want["N"]
    assert got["ranks"]["M1"] == want["M1"] and got["ranks"]["M2"] == want["M2"]
    c = got["cusum"]
    assert c["n_above"] == want["cusum"]["n_above"]
    assert c["n_below"] == want["cusum"]["n_below"]
    assert close(c["max_cusum"], want["cusum"]["max_cusum"])
    assert close(c["H"], want["cusum"]["H"])
    assert close(c["p"], want["cusum"]["p"])


def test_giavarina_published_line():
    """Giavarina (2015), p. 147: y = 7.08 (-0.30 to 19.84) + 1.06 (1.02 to
    1.09) x, at the article's printed precision."""
    r = methodreg.passing_bablok(REF["giavarina"]["x"], REF["giavarina"]["y"])
    assert round(r["intercept"]["value"], 2) == 7.08
    assert [round(v, 2) for v in r["intercept"]["ci"]] == [-0.30, 19.84]
    assert round(r["slope"]["value"], 2) == 1.06
    assert [round(v, 2) for v in r["slope"]["ci"]] == [1.02, 1.09]


def test_giavarina_pins_at_display_precision():
    """The values the UI shows for Giavarina (2015) Table 1."""
    r = methodreg.passing_bablok(REF["giavarina"]["x"], REF["giavarina"]["y"])
    assert f"{r['slope']['value']:.4g}" == "1.055"
    assert [f"{v:.4g}" for v in r["slope"]["ci"]] == ["1.02", "1.091"]
    assert f"{r['intercept']['value']:.4g}" == "7.082"
    assert [f"{v:.4g}" for v in r["intercept"]["ci"]] == ["-0.3049", "19.84"]
    assert r["cusum"]["H"] == 1.25 and f"{r['cusum']['p']:.4g}" == "0.08787"
    assert r["cusum"]["linear"] is True


@pytest.mark.parametrize("name", SETS)
def test_theil_sen_matches_scipy(name):
    ref = REF[name]
    got = methodreg.theil_sen(ref["x"], ref["y"])
    assert close(got["slope"]["value"], ref["theil_sen"]["slope"])
    assert close(got["intercept"]["value"], ref["theil_sen"]["intercept"])
    for g, w in zip(got["slope"]["ci"], ref["theil_sen"]["slope_ci"]):
        assert close(g, w)
    assert close(got["kendall"]["tau"], ref["kendall"]["tau"])
    assert close(got["kendall"]["p"], ref["kendall"]["p"])


def test_k_convention_does_not_change_the_line():
    """The reference counts vertical pairs as -inf (below -1, so in K);
    the engine counts them as +inf: same slope, different K."""
    ref = REF["ties"]
    got = methodreg.passing_bablok(ref["x"], ref["y"])
    assert got["k_below_minus_one"] == ref["passing_bablok"]["K"] - 1
    assert close(got["slope"]["value"], ref["passing_bablok"]["slope"])


# ---------------------------------------------------------------- edges

@pytest.mark.parametrize("n", [0, 1, 2])
def test_too_few_pairs(n):
    with pytest.raises(ValueError, match="at least 3 pairs"):
        methodreg.passing_bablok([1.0, 2.0][:n], [1.0, 2.0][:n])
    with pytest.raises(ValueError, match="at least 3 pairs"):
        methodreg.theil_sen([1.0, 2.0][:n], [1.0, 2.0][:n])


def test_missing_values_are_left_out():
    x = REF["giavarina"]["x"] + [None, 3.0, float("nan")]
    y = REF["giavarina"]["y"] + [5.0, None, 2.0]
    a = methodreg.passing_bablok(x, y)
    b = methodreg.passing_bablok(REF["giavarina"]["x"], REF["giavarina"]["y"])
    assert a["n"] == 30 and a["slope"] == b["slope"]


def test_constant_method_is_refused():
    with pytest.raises(ValueError, match="same value for every sample"):
        methodreg.passing_bablok([2, 2, 2, 2], [1, 2, 3, 4])
    with pytest.raises(ValueError, match="same value for every sample"):
        methodreg.passing_bablok([1, 2, 3, 4], [5, 5, 5, 5])
    with pytest.raises(ValueError, match="same value of method 1"):
        methodreg.theil_sen([2, 2, 2, 2], [1, 2, 3, 4])


def test_negative_correlation_is_refused():
    with pytest.raises(ValueError, match="assumes a positive correlation"):
        methodreg.passing_bablok([1, 2, 3, 4, 5], [5, 4.1, 3, 2.2, 1])


def test_perfect_agreement():
    x = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]
    r = methodreg.passing_bablok(x, x)
    assert r["slope"]["value"] == 1 and r["intercept"]["value"] == 0
    assert r["slope"]["ci"] == [1, 1]
    assert r["cusum"]["H"] is None and "not defined" in r["cusum"]["unavailable"]


def test_ci_unavailable_with_three_pairs():
    r = methodreg.passing_bablok([1.0, 2.0, 3.0], [1.1, 2.3, 2.9])
    assert r["slope"]["ci"] is None and r["intercept"]["ci"] is None
    assert "too few pairs" in r["ci_note"]


def test_size_limit():
    x = np.arange(methodreg.MAX_POINTS + 1, dtype=float)
    with pytest.raises(ValueError, match="limited to 3000 pairs"):
        methodreg.passing_bablok(x, x)


# ------------------------------------------------------- invariances

@pytest.mark.parametrize("scale", [1e-12, 1e12, 1000.0])
def test_unit_change_scales_the_intercept_only(scale):
    ref = REF["giavarina"]
    x = [v * scale for v in ref["x"]]
    y = [v * scale for v in ref["y"]]
    a = methodreg.passing_bablok(ref["x"], ref["y"])
    b = methodreg.passing_bablok(x, y)
    assert b["slope"]["value"] == pytest.approx(a["slope"]["value"], rel=1e-9)
    assert b["intercept"]["value"] == pytest.approx(
        a["intercept"]["value"] * scale, rel=1e-9)
    t = methodreg.theil_sen(x, y)
    assert t["slope"]["value"] == pytest.approx(
        methodreg.theil_sen(ref["x"], ref["y"])["slope"]["value"], rel=1e-9)


def test_row_order_does_not_matter():
    ref = REF["ejection"]
    perm = np.random.default_rng(7).permutation(len(ref["x"]))
    a = methodreg.passing_bablok(ref["x"], ref["y"])
    b = methodreg.passing_bablok([ref["x"][i] for i in perm],
                                 [ref["y"][i] for i in perm])
    for k in ("slope", "intercept"):
        assert a[k] == b[k]


@pytest.mark.parametrize("name", SETS)
def test_swapping_methods_inverts_the_slope(name):
    """Passing-Bablok is symmetric in the two methods: the CI limits of
    the swapped fit are the reciprocals (the point estimate too, up to
    the averaging of two middle slopes when N is even)."""
    ref = REF[name]
    a = methodreg.passing_bablok(ref["x"], ref["y"])
    b = methodreg.passing_bablok(ref["y"], ref["x"])
    assert 1 / b["slope"]["value"] == pytest.approx(a["slope"]["value"], rel=1e-6)
    assert [1 / v for v in b["slope"]["ci"]][::-1] == pytest.approx(
        a["slope"]["ci"], rel=1e-12)


# --------------------------------------------------------------- api

def test_api_xy_table_with_replicates_and_beside_deming():
    ref = REF["giavarina"]
    data = {"x": ref["x"], "datasets": [{"name": "Method B",
                                         "ys": [[v] for v in ref["y"]]}]}
    r = api.analyze({"analysis": "method_regression", "data": data,
                     "options": {}})
    c = r["comparisons"][0]
    assert c["name"] == "Method B" and c["n"] == 30
    assert close(c["passing_bablok"]["slope"]["value"],
                 ref["passing_bablok"]["slope"])
    assert close(c["theil_sen"]["slope"]["value"], ref["theil_sen"]["slope"])
    dem = api.analyze({"analysis": "deming", "data": data, "options": {}})
    assert c["deming"]["slope"] == dem["datasets"][0]["fit"]["slope"]
    assert c["points"] == {"x": ref["x"], "y": ref["y"]}
    # replicates pair with their row's X
    rep = {"x": [1.0, 2.0, 3.0, 4.0],
           "datasets": [{"name": "B", "ys": [[1.1, 0.9], [2.2, None],
                                              [2.8, 3.1], [4.2, 3.9]]}]}
    c2 = api.analyze({"analysis": "method_regression", "data": rep,
                      "options": {}})["comparisons"][0]
    assert c2["n"] == 7
    assert c2["points"]["x"] == [1.0, 1.0, 2.0, 3.0, 3.0, 4.0, 4.0]


def test_api_two_columns_and_errors_per_method():
    r = api.analyze({"analysis": "method_regression",
                     "data": {"a": [1, 2, None, 4, 5], "b": [5, 4, 3, None, 1],
                              "names": ["A", "B"]}, "options": {}})
    c = r["comparisons"][0]
    assert c["name"] == "B" and c["x_name"] == "A" and c["n"] == 3
    assert "positive correlation" in c["passing_bablok"]["error"]
    assert "slope" in c["theil_sen"]
