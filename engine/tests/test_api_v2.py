"""API-level tests for the newer analyses (generic models, compare fits,
correlation, contingency, two-way ANOVA): the payload shapes the web app
sends."""

import numpy as np
import pytest

from prism_engine.api import analyze


def test_michaelis_menten_through_api():
    x = [0.5, 1, 2, 4, 8, 16, 32, 64]
    ys = [[10.0 * xi / (5.0 + xi)] for xi in x]
    res = analyze({
        "analysis": "dose_response",
        "data": {"x": x, "datasets": [{"name": "enzyme", "ys": ys}]},
        "options": {"model": "michaelis_menten"},
    })
    fit = res["datasets"][0]["fit"]
    assert fit["params"]["Vmax"]["value"] == pytest.approx(10, rel=1e-5)
    assert fit["param_order"][0] == "Vmax"
    # curve has no log padding for linear-X models
    assert min(fit["curve"]["x"]) == pytest.approx(0.5)


def test_rout_through_api():
    x = list(np.linspace(0.5, 50, 20))
    y = [10.0 * xi / (5.0 + xi) for xi in x]
    y[4] += 8.0
    res = analyze({
        "analysis": "dose_response",
        "data": {"x": x, "datasets": [{"name": "d", "ys": [[v] for v in y]}]},
        "options": {"model": "michaelis_menten", "rout_q": 0.01},
    })
    entry = res["datasets"][0]
    assert entry["rout"]["n_outliers"] == 1
    assert entry["fit"]["params"]["Vmax"]["value"] == pytest.approx(10, abs=0.2)


def test_compare_fits_through_api():
    x = [-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5]
    y = [[100 / (1 + 10 ** ((-7 - xi) * -0.6))] for xi in x]
    res = analyze({
        "analysis": "compare_fits",
        "data": {"x": x, "datasets": [{"name": "d", "ys": y}]},
        "options": {
            "x_is_log": True,
            "model_1": {"model": "log_inhibitor_vs_response_3pl",
                        "constraints": {"Top": 100, "Bottom": 0}},
            "model_2": {"model": "log_inhibitor_vs_response_4pl",
                        "constraints": {"Top": 100, "Bottom": 0}},
        },
    })
    assert res["f_test"]["prefer_complex"] is True
    assert res["aicc"]["prefer"] == 2


def test_correlation_through_api():
    res = analyze({
        "analysis": "correlation",
        "data": {"x": [], "datasets": [
            {"name": "A", "ys": [[1.0], [2.0], [3.0], [4.0]]},
            {"name": "B", "ys": [[2.1], [3.9], [6.2], [8.1]]},
        ]},
        "options": {"method": "pearson"},
    })
    assert res["r"] > 0.99
    assert res["names"] == ["A", "B"]


def test_contingency_through_api():
    res = analyze({
        "analysis": "contingency",
        "data": {"table": [[15, 85], [5, 95]]},
        "options": {},
    })
    assert res["fisher_exact"]["p"] < 0.05
    assert res["odds_ratio"]["value"] == pytest.approx((15 * 95) / (85 * 5))


def test_two_way_anova_through_api():
    rng = np.random.default_rng(1)
    def cell(mu):
        return list(mu + rng.normal(0, 1, 3))
    res = analyze({
        "analysis": "two_way_anova",
        "data": {"x": ["low", "high"], "datasets": [
            {"name": "ctrl", "ys": [cell(10), cell(12)]},
            {"name": "drug", "ys": [cell(15), cell(22)]},
        ]},
        "options": {"row_factor": "Dose", "col_factor": "Treatment"},
    })
    assert res["sources"]["Treatment"]["p"] < 0.01
    assert res["sources"]["Dose"]["p"] < 0.05
    assert "interaction" in res["sources"]


def test_weighting_through_api():
    x = [1.0, 2, 4, 8, 16]
    ys = [[8.0 * xi / (3.0 + xi)] for xi in x]
    res = analyze({
        "analysis": "dose_response",
        "data": {"x": x, "datasets": [{"name": "d", "ys": ys}]},
        "options": {"model": "michaelis_menten", "weighting": "1/Y2"},
    })
    fit = res["datasets"][0]["fit"]
    assert fit["weighting"] == "1/Y2"
    assert fit["params"]["Km"]["value"] == pytest.approx(3.0, rel=1e-4)
