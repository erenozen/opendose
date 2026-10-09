"""Tests for opendose.residuals.column_residuals (residual diagnostics)."""

import json
import math

import numpy as np
import pytest
from scipy import stats

from opendose.residuals import LARGE_N, SMALL_N, column_residuals

# R's PlantGrowth data (datasets package), weight by group.
PLANT = [
    [4.17, 5.58, 5.18, 6.11, 4.50, 4.61, 5.17, 4.53, 5.33, 5.14],   # ctrl
    [4.81, 4.17, 4.41, 3.59, 5.87, 3.83, 6.03, 4.89, 4.32, 4.69],   # trt1
    [6.31, 5.12, 5.54, 5.50, 5.37, 5.29, 4.92, 6.15, 5.80, 5.26],   # trt2
]
NAMES = ["ctrl", "trt1", "trt2"]


def _res(points):
    return np.array([p["residual"] for p in points])


def test_residuals_sum_to_zero_per_group_and_fitted_is_mean():
    r = column_residuals(PLANT, NAMES)
    for gi, g in enumerate(PLANT):
        pts = [p for p in r["points"] if p["group_index"] == gi]
        assert len(pts) == len(g)
        assert abs(sum(p["residual"] for p in pts)) < 1e-12
        for p in pts:
            assert p["group"] == NAMES[gi]
            assert p["fitted"] == pytest.approx(np.mean(g), abs=1e-12)
            assert p["value"] == g[p["index"]]
            assert p["residual"] == pytest.approx(p["value"] - p["fitted"],
                                                  abs=1e-12)
    assert r["n_total"] == 30 and r["df"] == 27 and r["paired"] is False
    assert r["dropped"] == [] and r["warnings"] == []
    json.dumps(r)


def test_standardized_scale():
    r = column_residuals(PLANT, NAMES)
    z = np.array([p["standardized"] for p in r["points"]])
    assert np.sum(z ** 2) / r["df"] == pytest.approx(1.0, abs=1e-12)
    for p in r["points"]:
        assert p["standardized"] == pytest.approx(p["residual"] / r["pooled_sd"])


def test_plantgrowth_against_r():
    # R:  fit <- aov(weight ~ group, data = PlantGrowth)
    #     shapiro.test(residuals(fit))   # W = 0.96607, p-value = 0.4379
    #     summary(lm(weight ~ group, data = PlantGrowth))
    #     # Residual standard error: 0.6234 on 27 degrees of freedom
    r = column_residuals(PLANT, NAMES)
    assert r["shapiro"]["W"] == pytest.approx(0.96607, abs=5e-6)
    assert r["shapiro"]["p"] == pytest.approx(0.4379, abs=5e-5)
    assert r["pooled_sd"] == pytest.approx(0.6234, abs=5e-5)
    assert r["df"] == 27


def test_shapiro_equals_scipy_on_residuals():
    r = column_residuals(PLANT, NAMES)
    w, p = stats.shapiro(_res(r["points"]))
    assert r["shapiro"]["W"] == pytest.approx(float(w), rel=1e-12)
    assert r["shapiro"]["p"] == pytest.approx(float(p), rel=1e-12)
    assert r["shapiro"]["n"] == 30


def test_shapiro_wilk_1965_example():
    # Shapiro & Wilk (1965) Biometrika 52:591-611, worked example: weights
    # of 11 men; W = 0.79. W is location invariant, so the residuals of a
    # single group give the same W as the raw values.
    weights = [148, 154, 158, 160, 161, 162, 166, 170, 182, 195, 236]
    r = column_residuals([weights])
    assert round(r["shapiro"]["W"], 2) == 0.79


def test_theoretical_matches_probplot_distinct():
    r = column_residuals(PLANT, NAMES)
    res = _res(r["points"])
    # make sure the residuals are distinct for this check
    assert len(np.unique(np.round(res, 12))) == res.size
    osm = stats.probplot(np.sort(res), dist="norm")[0][0]
    by_rank = sorted(r["points"], key=lambda p: p["residual"])
    got = np.array([p["theoretical"] for p in by_rank])
    np.testing.assert_allclose(got, osm, rtol=0, atol=1e-12)
    # osr (scipy's ordered values) pair up with the theoretical quantiles
    osr = stats.probplot(res, dist="norm")[0][1]
    np.testing.assert_allclose([p["residual"] for p in by_rank], osr,
                               atol=1e-12)


def test_ties_get_distinct_stable_ranks():
    # Residuals: group 0 -> [-1, 1], group 1 -> [-1, 1]; ties across groups.
    r = column_residuals([[1, 3], [5, 7]])
    theo = [p["theoretical"] for p in r["points"]]
    assert len(set(theo)) == 4
    osm = stats.probplot([0, 1, 2, 3])[0][0]
    # stable order: group 0 row 0 (-1), group 1 row 0 (-1), group 0 row 1, group 1 row 1
    assert theo == pytest.approx([osm[0], osm[2], osm[1], osm[3]], abs=1e-12)


def test_paired_with_missing_value():
    a = [10.0, 12.0, None, 9.0, 14.0, 11.0]
    b = [8.0, 11.5, 7.0, 9.5, float("nan"), 7.0]
    r = column_residuals([a, b], ["before", "after"], paired=True)
    assert r["paired"] is True
    assert [d["index"] for d in r["dropped"]] == [2, 4]
    assert r["dropped"][0]["missing_in"] == ["before"]
    assert r["dropped"][1]["missing_in"] == ["after"]
    assert any("rows 2, 4" in w for w in r["warnings"])
    rows = [0, 1, 3, 5]
    d = np.array([a[i] - b[i] for i in rows])   # first minus second
    assert [p["index"] for p in r["points"]] == rows
    assert all(p["group"] == "difference" for p in r["points"])
    np.testing.assert_allclose(_res(r["points"]), d - d.mean(), atol=1e-12)
    np.testing.assert_allclose([p["value"] for p in r["points"]], d, atol=1e-12)
    assert r["points"][0]["fitted"] == pytest.approx(d.mean())
    assert r["pooled_sd"] == pytest.approx(d.std(ddof=1))
    assert r["df"] == 3
    w, p = stats.shapiro(d - d.mean())
    assert r["shapiro"]["W"] == pytest.approx(float(w), rel=1e-12)
    assert r["difference_direction"] == "before minus after"


def test_paired_sign_matches_paired_t():
    from opendose.ttests import paired_t
    a, b = [3.0, 5.0, 4.0, 8.0], [1.0, 2.0, 4.5, 3.0]
    r = column_residuals([a, b], paired=True)
    assert r["points"][0]["fitted"] == pytest.approx(
        paired_t(a, b)["mean_difference"])


def test_paired_needs_two_columns_and_a_pair():
    with pytest.raises(ValueError):
        column_residuals([[1, 2], [3, 4], [5, 6]], paired=True)
    with pytest.raises(ValueError):
        column_residuals([[1, None], [None, 2]], paired=True)


def test_advice_changes_with_n():
    rng = np.random.default_rng(1)
    texts = {}
    for n in (2, 10, 50, 300):
        r = column_residuals([list(rng.normal(size=n))])
        assert r["advice"]["n_total"] == n
        assert "Dundee" in r["advice"]["source"]
        texts[n] = r["advice"]["text"]
    assert len(set(texts.values())) == 4
    assert "little power" in texts[10]
    assert "central limit" in texts[300]
    assert "QQ plot first" in texts[50]
    assert SMALL_N == 20 and LARGE_N == 100
    assert column_residuals([list(range(SMALL_N))])["advice"]["text"] == \
        column_residuals([list(range(LARGE_N - 1))])["advice"]["text"].replace(
            str(LARGE_N - 1), str(SMALL_N))


def test_single_value_group_does_not_raise():
    r = column_residuals([[4.0, 5.0, 7.0, 6.0], [9.0], [1.0, 2.0, 2.5]],
                         ["A", "B", "C"])
    single = [p for p in r["points"] if p["group"] == "B"]
    assert len(single) == 1
    assert single[0]["residual"] == 0.0
    assert single[0]["standardized"] is None
    assert single[0]["theoretical"] is None
    assert any("B: only one value" in w and "0 by construction" in w
               for w in r["warnings"])
    # df = N - k counts the single-value group as one value and one mean
    assert r["n_total"] == 8 and r["df"] == 5 and r["n_qq"] == 7
    others = [p for p in r["points"] if p["group"] != "B"]
    w, p = stats.shapiro(_res(others))
    assert r["shapiro"]["W"] == pytest.approx(float(w), rel=1e-12)
    z = np.array([p["standardized"] for p in others])
    assert np.sum(z ** 2) / r["df"] == pytest.approx(1.0, abs=1e-12)
    json.dumps(r)


def test_all_single_values_degenerate_but_no_raise():
    r = column_residuals([[1.0], [2.0], [None]])
    assert r["pooled_sd"] is None and r["df"] == 0
    assert r["shapiro"] is None
    assert all(p["standardized"] is None and p["theoretical"] is None
               for p in r["points"])
    assert any("Group 2" in w for w in r["warnings"])
    assert r["dropped"] == [{"group": "Group 2", "index": 0,
                             "reason": "missing value"}]


def test_missing_values_reported_unpaired():
    r = column_residuals([[1.0, None, 3.0, float("nan"), 2.0],
                          [4.0, float("inf"), 6.0, 5.5]], ["x", "y"])
    assert [(d["group"], d["index"]) for d in r["dropped"]] == \
        [("x", 1), ("x", 3), ("y", 1)]
    assert r["dropped"][2]["reason"] == "not a finite number"
    assert any(w.startswith("x: 2 missing") and "rows 1, 3" in w
               for w in r["warnings"])
    assert [p["index"] for p in r["points"] if p["group"] == "x"] == [0, 2, 4]


def test_constant_residuals_and_nothing_usable():
    r = column_residuals([[2.0, 2.0, 2.0], [5.0, 5.0]])
    assert r["shapiro"] is None and r["pooled_sd"] == 0.0
    assert all(p["standardized"] is None for p in r["points"])
    assert all(p["theoretical"] is not None for p in r["points"])
    assert r["warnings"]
    with pytest.raises(ValueError):
        column_residuals([[None, float("nan")], []])
    with pytest.raises(ValueError):
        column_residuals([])


def test_results_are_plain_python_types():
    r = column_residuals(PLANT, NAMES)
    for p in r["points"]:
        for key in ("value", "fitted", "residual", "standardized", "theoretical"):
            assert type(p[key]) is float and math.isfinite(p[key])
        assert type(p["index"]) is int and type(p["group_index"]) is int
    assert type(r["shapiro"]["W"]) is float and type(r["df"]) is int
