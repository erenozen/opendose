"""Quantal dose-response (opendose.quantal): probit / logit / cloglog
binomial fits, ECx with Fieller and delta CIs, heterogeneity, natural
response and parallel-line assays.

References:
- Venables & Ripley (2002), "Modern Applied Statistics with S", 4th ed.,
  section 7.2 (MASS::dose.p on the budworm data): glm(SF ~ sex + ldose -
  1, binomial), dose.p(cf = c(1, 3), p = 1:3/4) -> ldose 2.231265
  (SE 0.2499089), 3.263587 (0.2297539), 4.295910 (0.2746874).
- Finney (1971), "Probit Analysis", 3rd ed.: rotenone on Macrosiphoniella
  sanborni (doses 2.6 to 10.2 mg/l), probit slope 4.21 on log10 dose and
  LD50 about 4.85 mg/l (Finney's hand-iterated log LD50 0.687; the
  converged maximum-likelihood value is 0.6853).
- statsmodels GLM Binomial with probit, logit and cloglog links (to
  ~1e-9), and a direct scipy.optimize maximum likelihood for the
  natural-response model.
"""

import math

import numpy as np
import pytest
import statsmodels.api as sm
from scipy import optimize, stats

from opendose.api import analyze
from opendose.quantal import fieller, quantal_fit, quantal_parallel

ROT_DOSE = [10.2, 7.7, 5.1, 3.8, 2.6]
ROT_N = [50, 49, 46, 48, 50]
ROT_R = [44, 42, 24, 16, 6]
LDOSE = [0, 1, 2, 3, 4, 5]
MALE = [1, 4, 9, 13, 18, 20]
FEMALE = [0, 2, 6, 10, 12, 16]

LINKS = {"probit": sm.families.links.Probit(),
         "logit": sm.families.links.Logit(),
         "cloglog": sm.families.links.CLogLog()}


@pytest.mark.parametrize("link", sorted(LINKS))
def test_matches_statsmodels_glm(link):
    res = quantal_fit(ROT_DOSE, ROT_N, ROT_R, link=link)
    y = np.column_stack([ROT_R, np.subtract(ROT_N, ROT_R)])
    X = sm.add_constant(np.log10(ROT_DOSE))
    m = sm.GLM(y, X, family=sm.families.Binomial(LINKS[link])).fit(tol=1e-14)
    p = res["parameters"]
    np.testing.assert_allclose([p["intercept"]["value"], p["slope"]["value"]],
                               m.params, rtol=1e-8)
    np.testing.assert_allclose([p["intercept"]["se"], p["slope"]["se"]],
                               m.bse, rtol=1e-7)
    gof = res["goodness_of_fit"]
    assert gof["pearson_chi2"] == pytest.approx(m.pearson_chi2, rel=1e-7)
    assert gof["deviance"] == pytest.approx(m.deviance, rel=1e-7)
    assert gof["df"] == 3
    assert res["loglik"] == pytest.approx(m.llf - np.sum(
        np.log([math.comb(n, r) for n, r in zip(ROT_N, ROT_R)])), rel=1e-9)


def test_finney_rotenone_probit():
    res = quantal_fit(ROT_DOSE, ROT_N, ROT_R, link="probit",
                      ec_levels=(50, 90))
    assert round(res["parameters"]["slope"]["value"], 2) == 4.21
    ld50 = res["ec"][0]
    assert ld50["x"] == pytest.approx(0.6853, abs=1e-4)
    assert ld50["dose"] == pytest.approx(4.85, abs=0.01)
    assert not res["heterogeneity"]["applied"]  # chi2 1.73 on 3 df
    lo, hi = ld50["dose_ci_fieller"]
    assert lo < ld50["dose"] < hi
    # LD90 = 10^((1.2816 - a)/b)
    a = res["parameters"]["intercept"]["value"]
    b = res["parameters"]["slope"]["value"]
    assert res["ec"][1]["dose"] == pytest.approx(
        10 ** ((stats.norm.ppf(0.9) - a) / b), rel=1e-12)


def test_mass_dose_p_budworm():
    res = quantal_parallel(
        [{"name": "M", "dose": LDOSE, "n": [20] * 6, "responders": MALE},
         {"name": "F", "dose": LDOSE, "n": [20] * 6, "responders": FEMALE}],
        link="logit", dose_transform="none", ec_levels=(25, 50, 75))
    female = res["groups"][1]
    # R's glm stops IRLS at a relative deviance change of 1e-8, so its
    # SEs carry ~1e-7 of convergence noise in the last printed digit
    expect = [(2.231265, 0.2499089), (3.263587, 0.2297539),
              (4.295910, 0.2746874)]
    for e, (x, se) in zip(female["ec"], expect):
        assert round(e["x"], 6) == x
        assert e["se_x"] == pytest.approx(se, abs=1e-7)
    # same model through statsmodels: sexF, sexM, ldose
    sex = np.repeat([0, 1], 6)
    X = np.column_stack([sex == 0, sex == 1, LDOSE * 2]).astype(float)
    resp = np.array(FEMALE + MALE)
    m = sm.GLM(np.column_stack([resp, 20 - resp]), X,
               family=sm.families.Binomial()).fit(tol=1e-14)
    assert female["intercept"]["value"] == pytest.approx(m.params[0], rel=1e-8)
    assert res["groups"][0]["intercept"]["value"] == pytest.approx(
        m.params[1], rel=1e-8)
    assert res["slope"]["value"] == pytest.approx(m.params[2], rel=1e-8)
    # relative potency: log ratio = (a_F - a_M) / b, Fieller contains delta pt
    pot = res["relative_potency"][0]
    assert pot["group"] == "F" and pot["reference"] == "M"
    assert pot["log_potency"] == pytest.approx(
        (m.params[0] - m.params[1]) / m.params[2], rel=1e-8)
    lo, hi = pot["log_ci_fieller"]
    assert lo < pot["log_potency"] < hi
    # parallelism LR test: separate slopes vs common slope
    sep = sm.GLM(np.column_stack([resp, 20 - resp]),
                 np.column_stack([X[:, :2], X[:, :2] * X[:, 2:3]]),
                 family=sm.families.Binomial()).fit(tol=1e-14)
    assert res["parallelism"]["chi2"] == pytest.approx(
        m.deviance - sep.deviance, rel=1e-6)
    assert res["parallelism"]["df"] == 1


def test_fieller_endpoints_invert_the_t_test():
    res = quantal_fit(ROT_DOSE, ROT_N, ROT_R, link="logit")
    cov = np.array(res["covariance"])
    a = res["parameters"]["intercept"]["value"]
    b = res["parameters"]["slope"]["value"]
    z = stats.norm.ppf(0.975)
    for theta in res["ec"][0]["x_ci_fieller"]:
        var = cov[0, 0] + 2 * theta * cov[0, 1] + theta ** 2 * cov[1, 1]
        assert abs(-a - theta * b) / math.sqrt(var) == pytest.approx(z, rel=1e-9)
    # small g: Fieller and delta nearly agree
    ec = res["ec"][0]
    assert ec["g"] < 0.1
    np.testing.assert_allclose(ec["x_ci_fieller"], ec["x_ci_delta"], atol=0.02)
    assert fieller(1.0, 0.1, 1.0, 0.0, 1.0, 1.96) is None  # g >= 1


def test_heterogeneity_correction():
    dose = [1, 2, 4, 8, 16, 32]
    n = [40] * 6
    r = [2, 14, 9, 30, 22, 39]  # deliberately overdispersed
    res = quantal_fit(dose, n, r, link="probit")
    gof = res["goodness_of_fit"]
    assert gof["p_pearson"] < 0.05
    het = res["heterogeneity"]
    assert het["applied"]
    assert het["factor"] == pytest.approx(gof["pearson_chi2"] / 4)
    assert het["critical_value"] == pytest.approx(stats.t.ppf(0.975, 4))
    plain = quantal_fit(dose, n, r, link="probit", heterogeneity="never")
    assert res["parameters"]["slope"]["se"] == pytest.approx(
        plain["parameters"]["slope"]["se"] * math.sqrt(het["factor"]))
    assert res["parameters"]["slope"]["value"] == pytest.approx(
        plain["parameters"]["slope"]["value"])


def _nll(theta, link, x, n, r, active, c_fixed=None):
    a, b = theta[0], theta[1]
    c = theta[2] if c_fixed is None else c_fixed
    eta = a + b * x
    F = {"probit": stats.norm.cdf, "logit": stats.logistic.cdf}[link](eta)
    mu = np.clip(c + (1 - c) * np.where(active, F, 0.0), 1e-12, 1 - 1e-12)
    return -np.sum(r * np.log(mu) + (n - r) * np.log1p(-mu))


def test_natural_response_estimated_matches_direct_mle():
    dose = [0, 1, 2, 4, 8, 16, 32]
    n = [50] * 7
    r = [6, 8, 11, 17, 29, 41, 47]
    res = quantal_fit(dose, n, r, link="probit", natural_response="estimate")
    x = np.log10(np.where(np.array(dose) > 0, dose, 1.0))
    active = np.array(dose) > 0
    opt = optimize.minimize(_nll, [-1.5, 2.0, 0.1],
                            args=("probit", x, np.array(n), np.array(r), active),
                            method="Nelder-Mead",
                            options={"xatol": 1e-10, "fatol": 1e-12,
                                     "maxiter": 20000})
    p = res["parameters"]
    np.testing.assert_allclose(
        [p["intercept"]["value"], p["slope"]["value"],
         p["natural_response"]["value"]], opt.x, atol=2e-5)
    assert res["table"][0]["x"] is None
    # Abbott's correction of the observed proportions uses C-hat
    c = p["natural_response"]["value"]
    assert res["table"][3]["abbott_corrected"] == pytest.approx(
        (17 / 50 - c) / (1 - c))


def test_fixed_abbott_rate_matches_direct_mle():
    dose = [1, 2, 4, 8, 16]
    n = [40] * 5
    r = [7, 10, 18, 27, 36]
    res = quantal_fit(dose, n, r, link="logit", natural_response=0.1)
    x = np.log10(dose)
    opt = optimize.minimize(_nll, [-1.0, 2.0],
                            args=("logit", x, np.array(n), np.array(r),
                                  np.ones(5, bool), 0.1),
                            method="Nelder-Mead",
                            options={"xatol": 1e-10, "fatol": 1e-12})
    p = res["parameters"]
    np.testing.assert_allclose([p["intercept"]["value"], p["slope"]["value"]],
                               opt.x, atol=2e-5)
    assert res["natural_response_used"] == 0.1


def test_errors_and_curve():
    with pytest.raises(ValueError, match="dose 0"):
        quantal_fit([0, 1, 2], [10, 10, 10], [1, 5, 9])
    with pytest.raises(ValueError, match="between 0 and n"):
        quantal_fit([1, 2], [10, 10], [11, 5])
    res = quantal_fit(ROT_DOSE, ROT_N, ROT_R, curve_points=11)
    assert len(res["curve"]["x"]) == 11
    assert all(lo <= p <= hi for lo, p, hi in
               zip(res["curve"]["lower"], res["curve"]["p"],
                   res["curve"]["upper"]))


def test_api_quantal():
    res = analyze({"analysis": "quantal", "data": {
        "dose": ROT_DOSE, "n": ROT_N, "responders": ROT_R},
        "options": {"link": "probit", "ec_levels": [50, 90]}})
    assert "error" not in res, res.get("error")
    assert res["ec"][0]["dose"] == pytest.approx(4.845, abs=1e-3)
    res = analyze({"analysis": "quantal", "data": {"groups": [
        {"name": "M", "dose": LDOSE, "n": [20] * 6, "responders": MALE},
        {"name": "F", "dose": LDOSE, "n": [20] * 6, "responders": FEMALE}]},
        "options": {"link": "logit", "dose_transform": "none",
                    "parallel": True, "ec_levels": [50]}})
    assert "error" not in res, res.get("error")
    assert round(res["groups"][1]["ec"][0]["x"], 6) == 3.263587
    res = analyze({"analysis": "quantal", "data": {"groups": [
        {"name": "M", "dose": LDOSE, "n": [20] * 6, "responders": MALE},
        {"name": "F", "dose": LDOSE, "n": [20] * 6, "responders": FEMALE}]},
        "options": {"link": "logit", "dose_transform": "none"}})
    assert [g["name"] for g in res["datasets"]] == ["M", "F"]
