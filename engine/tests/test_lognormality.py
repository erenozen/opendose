"""Lognormality (GraphPad statistics guide, "Testing for lognormality" and
"Comparing normal and lognormal distributions"): the normality tests on
the logarithms, and normal vs lognormal maximum-likelihood fits with
likelihoods normalised to sum to 1, which are the Akaike weights of the
two fits (Burnham & Anderson 2002, sec. 6.7.2)."""

import math

import numpy as np
import pytest
from scipy import stats

from opendose import api, columnstats as cs

RNG = np.random.default_rng(4)
X = RNG.lognormal(1.0, 0.8, 25)


def test_likelihoods_are_scipy_maximum_likelihood_fits():
    r = cs.normal_vs_lognormal(X)
    s, _, scale = stats.lognorm.fit(X, floc=0)
    assert r["loglik_lognormal"] == pytest.approx(
        stats.lognorm.logpdf(X, s, loc=0, scale=scale).sum(), rel=1e-10)
    mu, sd = stats.norm.fit(X)
    assert r["loglik_normal"] == pytest.approx(
        stats.norm.logpdf(X, mu, sd).sum(), rel=1e-12)
    # normalised likelihoods = Akaike weights (two parameters each)
    aic = np.array([4 - 2 * r["loglik_normal"], 4 - 2 * r["loglik_lognormal"]])
    w = np.exp(-0.5 * (aic - aic.min()))
    assert r["p_lognormal"] == pytest.approx(w[1] / w.sum(), rel=1e-12)
    assert r["p_normal"] + r["p_lognormal"] == pytest.approx(1.0)
    assert r["p_lognormal"] > 0.99


def test_normal_data_favour_the_normal_fit():
    r = cs.normal_vs_lognormal(RNG.normal(50, 2, 40))
    assert r["p_normal"] > 0.5


def test_lognormality_tests_are_the_normality_tests_of_the_logs():
    r = cs.lognormality(X, ["shapiro_wilk", "kolmogorov_smirnov"])
    assert set(r["tests"]) == {"shapiro_wilk", "kolmogorov_smirnov"}
    assert r["tests"]["shapiro_wilk"]["p"] == pytest.approx(
        stats.shapiro(np.log(X)).pvalue, rel=1e-9)
    assert r["tests"] == cs.normality_tests(np.log10(X),
                                            ["shapiro_wilk",
                                             "kolmogorov_smirnov"])


def test_zero_or_negative_values_are_not_tested():
    r = cs.lognormality([1.0, 2.0, 0.0, 3.0, 5.0])
    assert r["tests"] is None and "zero or negative" in r["not_run"]
    assert "error" in r["comparison"]
    assert "error" in cs.normal_vs_lognormal([2.0, 2.0, 2.0])
    assert "error" in cs.normal_vs_lognormal([1.0, 2.0])


def test_extreme_separation_does_not_overflow():
    x = np.concatenate([np.full(30, 1e-6), [1e6]]) * RNG.uniform(1, 1.01, 31)
    r = cs.normal_vs_lognormal(x)
    assert math.isfinite(r["p_lognormal"]) and 0 <= r["p_lognormal"] <= 1


def test_api_option_off_by_default():
    data = {"datasets": [{"name": "A", "ys": [[v] for v in X]}]}
    off = api.analyze({"analysis": "column_statistics", "data": data,
                       "options": {}})
    assert "lognormality" not in off["datasets"][0]
    on = api.analyze({"analysis": "column_statistics", "data": data,
                      "options": {"lognormality": True}})
    lg = on["datasets"][0]["lognormality"]
    assert lg["comparison"]["p_lognormal"] > 0.99
    assert set(lg["tests"]) == set(on["datasets"][0]["normality"])
