"""Test for linear trend after one-way ANOVA (statistics guide, "How the
test for trend works"): the between-group SS split into a linear part
(1 df) and nonlinear variation (k - 2 df), both tested against the
within-group mean square; R^2 = SS_linear / SS_total and the alerting R^2
= SS_linear / SS_between."""

import numpy as np
import pytest
from scipy import stats

from opendose import anova, api

RNG = np.random.default_rng(5)
GROUPS = [RNG.normal(10 + 1.5 * i + (0.8 if i == 2 else 0), 2, n)
          for i, n in enumerate([6, 8, 5, 7])]


def test_partition_matches_regressions_on_the_raw_data():
    t = anova.linear_trend(GROUPS, list("ABCD"))
    y = np.concatenate(GROUPS)
    code = np.concatenate([[i + 1.0] * g.size for i, g in enumerate(GROUPS)])
    ss_total = float(((y - y.mean()) ** 2).sum())
    reg = stats.linregress(code, y)
    # SS explained by a straight line in the code = SS_linear; same slope
    assert t["linear"]["ss"] == pytest.approx(reg.rvalue ** 2 * ss_total,
                                              rel=1e-10)
    assert t["slope"] == pytest.approx(reg.slope, rel=1e-10)
    one = anova.one_way_anova(GROUPS)["table"]
    assert t["linear"]["ss"] + t["nonlinear"]["ss"] == pytest.approx(
        one["ss_between"], rel=1e-10)
    ms_w = one["ss_within"] / one["df_within"]
    assert t["within"]["ms"] == pytest.approx(ms_w, rel=1e-12)
    assert t["linear"]["F"] == pytest.approx(t["linear"]["ss"] / ms_w)
    assert t["linear"]["p"] == pytest.approx(
        stats.f.sf(t["linear"]["F"], 1, one["df_within"]))
    assert t["nonlinear"]["df"] == 2
    assert t["nonlinear"]["F"] == pytest.approx(
        t["nonlinear"]["ss"] / 2 / ms_w)
    assert t["r_squared"] == pytest.approx(t["linear"]["ss"] / ss_total)
    assert t["r_squared_alerting"] == pytest.approx(
        t["linear"]["ss"] / one["ss_between"])
    assert t["r_squared_alerting"] >= t["r_squared"]


def test_equal_groups_slope_is_the_regression_of_the_means():
    g = [RNG.normal(5 - 0.7 * i, 1, 6) for i in range(5)]
    t = anova.linear_trend(g)
    means = [x.mean() for x in g]
    assert t["slope"] == pytest.approx(
        stats.linregress(range(1, 6), means).slope, rel=1e-10)
    assert t["slope"] < 0


def test_perfectly_linear_means_leave_no_nonlinear_variation():
    base = np.array([-1.0, 0.0, 1.0])
    g = [base + 2.0 * i for i in range(4)]
    t = anova.linear_trend(g)
    assert t["slope"] == pytest.approx(2.0)
    assert t["nonlinear"]["ss"] == pytest.approx(0.0, abs=1e-12)
    assert t["r_squared_alerting"] == pytest.approx(1.0)


def test_api_option_and_too_few_groups():
    data = {"datasets": [{"name": n, "ys": [[v] for v in g]}
                         for n, g in zip("ABCD", GROUPS)]}
    off = api.analyze({"analysis": "anova", "data": data,
                       "options": {"kind": "parametric"}})
    assert "trend" not in off
    on = api.analyze({"analysis": "anova", "data": data,
                      "options": {"kind": "parametric", "trend": True}})
    assert on["trend"]["names"] == list("ABCD")
    assert on["table"] == off["table"]
    with pytest.raises(ValueError):
        anova.linear_trend(GROUPS[:2])
