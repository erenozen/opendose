"""Comparing slopes and intercepts of linear regression lines (FEATURE-PLAN
P-13), against statsmodels OLS (engine/tests/reference/compare_lines.py:
anova_lm of y ~ x + g vs y ~ x * g, and y ~ x vs y ~ x + g)."""

import json
from pathlib import Path

import pytest

from opendose import api, linregress

REF = json.loads((Path(__file__).parent / "reference" / "compare_lines.json")
                 .read_text())


def xy(d):
    names = [k for k in d if k != "x"]
    return {"x": d["x"], "datasets": [{"name": n, "ys": [[v] for v in d[n]]}
                                      for n in names]}


def run(d, **opts):
    return api.analyze({"analysis": "linear_regression", "data": xy(d),
                        "options": {"compare_lines": True, **opts}})


def close(a, b, rel=1e-9):
    return a == pytest.approx(b, rel=rel, abs=1e-12)


@pytest.mark.parametrize("case", ["parallel", "diverging", "three"])
def test_against_statsmodels(case):
    ref = REF[case]
    c = run(ref["data"])["compare_lines"]
    assert close(c["slopes_test"]["F"], ref["slopes_F"])
    assert close(c["slopes_test"]["p"], ref["slopes_p"])
    assert [c["slopes_test"]["dfn"], c["slopes_test"]["dfd"]] == ref["slopes_df"]
    assert close(c["intercepts_test"]["F"], ref["intercepts_F"])
    assert close(c["intercepts_test"]["p"], ref["intercepts_p"], rel=1e-7)
    assert [c["intercepts_test"]["dfn"],
            c["intercepts_test"]["dfd"]] == ref["intercepts_df"]
    cs = c["common_slope"]
    assert close(cs["value"], ref["common_slope"])
    assert close(cs["se"], ref["common_slope_se"])
    assert close(cs["ci"][0], ref["common_slope_ci"][0])
    assert close(cs["ci"][1], ref["common_slope_ci"][1])
    assert close(c["pooled_line"]["slope"], ref["pooled_slope"])
    assert close(c["pooled_line"]["y_intercept"], ref["pooled_intercept"],
                 rel=1e-6)
    if "slope_difference" in ref:
        sd = c["slope_difference"]
        assert close(sd["value"], ref["slope_difference"])
        assert close(sd["se"], ref["slope_difference_se"])
        assert close(sd["ci"][0], ref["slope_difference_ci"][0])
        assert close(sd["ci"][1], ref["slope_difference_ci"][1])
        # t^2 = F (Zar 18.1)
        assert close(sd["t"] ** 2, c["slopes_test"]["F"])


def test_verdicts_and_meaning_of_the_intercept_test():
    par = run(REF["parallel"]["data"])["compare_lines"]
    assert not par["slopes_differ"] and par["intercepts_meaningful"]
    assert par["intercepts_differ"]
    div = run(REF["diverging"]["data"])["compare_lines"]
    assert div["slopes_differ"] and not div["intercepts_meaningful"]


def test_off_by_default_and_fits_unchanged():
    d = xy(REF["parallel"]["data"])
    plain = api.analyze({"analysis": "linear_regression", "data": d,
                         "options": {}})
    assert "compare_lines" not in plain
    with_c = run(REF["parallel"]["data"])
    assert plain["datasets"] == with_c["datasets"]


def test_invariance():
    d = REF["parallel"]["data"]
    base = run(d)["compare_lines"]
    # data set order: same F tests, slope difference negated
    swapped = {"x": d["x"], "Treated": d["Treated"], "Control": d["Control"]}
    sw = run(swapped)["compare_lines"]
    assert close(sw["slopes_test"]["F"], base["slopes_test"]["F"])
    assert close(sw["intercepts_test"]["F"], base["intercepts_test"]["F"])
    assert close(sw["slope_difference"]["value"],
                 -base["slope_difference"]["value"])
    # units: Y x 1000 and X x 1e-6 leave every F and P unchanged, the
    # common slope scales by 1e9
    for ky, kx in ((1000.0, 1e-6), (1e-12, 1.0), (1e12, 1e3)):
        scaled = {"x": [v * kx for v in d["x"]],
                  "Control": [v * ky for v in d["Control"]],
                  "Treated": [v * ky for v in d["Treated"]]}
        s = run(scaled)["compare_lines"]
        assert close(s["slopes_test"]["p"], base["slopes_test"]["p"], 1e-6)
        assert close(s["intercepts_test"]["F"], base["intercepts_test"]["F"],
                     1e-6)
        assert close(s["common_slope"]["value"],
                     base["common_slope"]["value"] * ky / kx, 1e-6)


def test_edge_cases():
    d = REF["parallel"]["data"]
    # one data set: nothing to compare, no block
    one = api.analyze({"analysis": "linear_regression",
                       "data": {"x": d["x"], "datasets": [
                           {"name": "Control", "ys": [[v] for v in d["Control"]]}]},
                       "options": {"compare_lines": True}})
    assert "compare_lines" not in one
    # two points in a line
    short = {"x": [1, 2, 3, 4], "A": [1.0, 2.1, 2.9, 4.2],
             "B": [2.0, 3.1, None, None]}
    c = run(short)["compare_lines"]
    assert "at least 3 XY pairs" in c["unavailable"]
    # every X equal in a line
    flat = {"x": [1, 1, 1, 2, 3], "A": [1.0, 2.0, 3.0, None, None],
            "B": [1.0, 2.0, 3.0, 4.0, 5.0]}
    assert "identical" in run(flat)["compare_lines"]["unavailable"]
    # through a fixed point: not compared
    c = run(d, through_point=[0, 0])["compare_lines"]
    assert "through a point" in c["unavailable"]
    # perfectly straight, parallel lines: the separate fits leave no
    # residual, so the slope F is undefined (said, not NaN) and P is None
    exact = {"x": [1, 2, 3, 4], "A": [1.0, 2.0, 3.0, 4.0],
             "B": [3.0, 4.0, 5.0, 6.0]}
    c = run(exact)["compare_lines"]
    assert c["slopes_test"]["F"] is None and c["slopes_test"]["p"] is None
    assert not c["slopes_differ"]
    with pytest.raises(ValueError):
        linregress.compare_lines([([1, 2, 3], [1, 2, 3], "A")])
