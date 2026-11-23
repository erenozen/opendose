"""Multiple Poisson regression (multivar.poisson_regression) against R's
glm(family = poisson) (R 4.x; profile CIs from confint, which interpolates
the profile with a spline, hence the looser CI tolerance), and the
goodness-of-fit definitions of the curve-fitting guide ("Goodness of fit
from multiple regression": pseudo R2 = (LLfit - LLo) / (LLmax - LLo),
deviance = 2(LLmax - LLfit))."""

import json
import math
import pathlib

import numpy as np
import pytest

from opendose import api, multivar

# Dobson (1990), the example of R's ?glm
COUNTS = [18, 17, 15, 20, 10, 20, 25, 13, 12]
OUTCOME = ["1", "2", "3"] * 3
TREATMENT = ["1"] * 3 + ["2"] * 3 + ["3"] * 3


def dobson(**kw):
    v = [{"name": "counts", "values": COUNTS},
         {"name": "outcome", "values": OUTCOME, "kind": "categorical"},
         {"name": "treatment", "values": TREATMENT, "kind": "categorical"}]
    return multivar.poisson_regression(v, "counts", ["outcome", "treatment"],
                                       **kw)


def test_dobson_matches_r_glm():
    r = dobson()
    est = {c["name"]: c for c in r["coefficients"]}
    ref = {  # name: (estimate, z, P, profile CI)
        "Intercept": (3.04452243772, 17.8147832703, 5.42676746191e-71,
                      (2.695821501763, 3.3665558134154)),
        "outcome[2]": (-0.454255272278, 2.24688911359, 2.46471146278e-02,
                       (-0.857701838165, -0.0625584001078)),
        "outcome[3]": (-0.292987124681, 1.52009734505, 1.28486511788e-01,
                       (-0.675369597414, 0.0824408934873)),
        "treatment[2]": (0.0, 0.0, 1.0, (-0.393254829528, 0.393254829528)),
        "treatment[3]": (0.0, 0.0, 1.0, (-0.393254829528, 0.393254829528)),
    }
    assert set(est) == set(ref)
    for name, (b, z, p, ci) in ref.items():
        c = est[name]
        assert c["estimate"] == pytest.approx(b, abs=1e-9)
        assert c["z"] == pytest.approx(z, rel=1e-5, abs=1e-9)
        assert c["p"] == pytest.approx(p, rel=1e-4)
        assert c["ci"] == pytest.approx(list(ci), abs=2e-5)
        assert c["rate_ratio"] == pytest.approx(math.exp(b), rel=1e-9)
    # equal totals per treatment: SE of each treatment effect is exactly
    # sqrt(1/50 + 1/50) = 0.2 (R's IRLS reports 0.199999998)
    assert est["treatment[2]"]["se"] == pytest.approx(0.2, abs=1e-9)
    # exactly 0 (not -2.6e-18 rounding noise), so the app shows 0, z 0, RR 1
    for name in ("treatment[2]", "treatment[3]"):
        assert est[name]["estimate"] == 0.0 and est[name]["z"] == 0.0
        assert est[name]["rate_ratio"] == 1.0
    assert r["deviance"] == pytest.approx(5.129141077, abs=1e-8)
    assert r["null_deviance"] == pytest.approx(10.5814458638, abs=1e-8)
    assert r["log_likelihood"] == pytest.approx(-23.380659201, abs=1e-8)
    assert r["model_comparison"]["selected"]["aic"] == pytest.approx(
        56.761318402, abs=1e-8)
    assert r["dispersion"]["pearson_chi2"] == pytest.approx(5.17320162107,
                                                             abs=1e-8)
    assert r["deviance_df"] == 4
    assert r["dispersion"]["phi"] == pytest.approx(5.17320162107 / 4,
                                                    abs=1e-8)


def test_goodness_of_fit_follows_the_guide():
    r = dobson()
    llmax, llfit, ll0 = (r["max_log_likelihood"], r["log_likelihood"],
                         r["null_log_likelihood"])
    assert r["deviance"] == pytest.approx(2 * (llmax - llfit))
    assert r["null_deviance"] == pytest.approx(2 * (llmax - ll0))
    assert r["pseudo_r_squared"] == pytest.approx(
        (llfit - ll0) / (llmax - ll0))
    lrt = r["likelihood_ratio_test"]
    assert lrt["G"] == pytest.approx(10.5814458638 - 5.129141077, abs=1e-8)
    assert lrt["df"] == 4


def test_exposure_offset_matches_r():
    y = [3, 7, 2, 11, 5, 9, 4, 14, 6, 1, 8, 12]
    x = [0.2, 1.1, 0.4, 2.3, 0.9, 1.8, 0.6, 2.9, 1.2, 0.1, 1.5, 2.6]
    t = [1.5, 2, 1, 2.5, 1.2, 2, 1.8, 3, 1.4, 1, 2.2, 2.4]
    r = api.analyze({"analysis": "poisson_regression",
                     "data": {"variables": [{"name": "y", "values": y},
                                            {"name": "x", "values": x},
                                            {"name": "t", "values": t}]},
                     "options": {"outcome": "y", "predictors": ["x"],
                                 "exposure": "t"}})
    b0, b1 = r["coefficients"]
    assert b0["estimate"] == pytest.approx(0.811458068411, abs=1e-8)
    assert b1["estimate"] == pytest.approx(0.298428843389, abs=1e-8)
    assert b1["se"] == pytest.approx(0.123289108362, rel=1e-5)
    assert b1["p"] == pytest.approx(0.01549656663306, rel=1e-4)
    assert b1["ci"] == pytest.approx([0.0592484700201, 0.543831311066],
                                     abs=2e-5)
    assert r["deviance"] == pytest.approx(2.90406079564, abs=1e-8)
    assert r["null_deviance"] == pytest.approx(8.90524206968, abs=1e-8)
    assert r["log_likelihood"] == pytest.approx(-22.8945590661, abs=1e-8)
    assert r["dispersion"]["pearson_chi2"] == pytest.approx(2.79418698538,
                                                             abs=1e-8)
    # predicted counts include the exposure
    assert r["predicted"][0] == pytest.approx(
        1.5 * math.exp(0.811458068411 + 0.298428843389 * 0.2), rel=1e-7)


def test_wald_intervals_are_symmetric():
    c = dobson(ci_method="wald")["coefficients"][1]
    z = 1.959963984540054
    assert c["ci"] == pytest.approx([c["estimate"] - z * c["se"],
                                     c["estimate"] + z * c["se"]])


def test_overdispersion_is_flagged():
    rng = np.random.default_rng(3)
    x = np.repeat(np.arange(10.0), 4)
    y = rng.negative_binomial(2, 2 / (2 + np.exp(1 + 0.2 * x)))
    r = multivar.poisson_regression(
        [{"name": "y", "values": y.astype(float).tolist()},
         {"name": "x", "values": x.tolist()}], "y", ["x"])
    assert r["dispersion"]["phi"] > 1.5
    assert any("overdispersion" in w for w in r["warnings"])
    assert not dobson()["warnings"]


@pytest.mark.parametrize("y,msg", [
    ([1.5, 2, 3, 4, 5, 6], "actual counts"),
    ([-1, 2, 3, 4, 5, 6], "actual counts"),
    ([0, 0, 0, 0, 0, 0], "every count is 0"),
])
def test_counts_only(y, msg):
    with pytest.raises(ValueError, match=msg):
        multivar.poisson_regression(
            [{"name": "y", "values": y},
             {"name": "x", "values": [1, 2, 3, 4, 5, 6]}], "y", ["x"])


@pytest.mark.parametrize("y,bad", [([0, 0, 0, 4, 6, 5], "g = a"),
                                   ([4, 6, 5, 0, 0, 0], "g = b")])
def test_group_with_only_zero_counts_is_an_error(y, bad):
    # the reference level (a) and a dummy level (b) are both caught
    with pytest.raises(ValueError, match=bad):
        multivar.poisson_regression(
            [{"name": "y", "values": y},
             {"name": "g", "values": list("aaabbb"), "kind": "categorical"}],
            "y", ["g"])


def test_exposure_must_be_positive():
    with pytest.raises(ValueError, match="positive"):
        multivar.poisson_regression(
            [{"name": "y", "values": [1, 2, 3, 4, 5, 6]},
             {"name": "x", "values": [1, 2, 3, 4, 5, 6]},
             {"name": "t", "values": [1, 1, 0, 1, 1, 1]}], "y", ["x"],
            exposure="t")


# P-46: quasi-Poisson standard errors. Oracle: statsmodels GLM(Poisson,
# scale="X2", use_t=True), engine/tests/reference/quasi_poisson.py (R is
# not installed). Data: Ames TA98 revertants (Margolin et al. 1981, the
# overdispersed example of Breslow 1984, Pearson chi2 46.3 on 15 df).
QREF = json.loads((pathlib.Path(__file__).parent / "reference"
                   / "quasi_poisson.json").read_text())


def ames(rows=None, scale=1.0, **kw):
    d = QREF["data"]
    rows = rows or range(len(d["dose"]))
    v = [{"name": "Revertants", "values": [d["revertants"][i] for i in rows]},
         {"name": "log(Dose + 10)",
          "values": [d["log_dose_plus_10"][i] for i in rows]},
         {"name": "Dose", "values": [d["dose"][i] * scale for i in rows]}]
    return multivar.poisson_regression(
        v, "Revertants", ["log(Dose + 10)", "Dose"], **kw)


def test_quasi_poisson_matches_statsmodels_scale_x2():
    p, q = ames(), ames(quasi=True)
    assert q["family"] == "quasipoisson" and p["family"] == "poisson"
    assert q["dispersion"]["phi"] == pytest.approx(QREF["phi"], rel=1e-9)
    assert round(q["dispersion"]["phi"], 3) == 3.085
    assert q["dispersion"]["pearson_chi2"] == pytest.approx(46.2707, abs=1e-4)
    for j, c in enumerate(q["coefficients"]):
        # same estimates; SE grows by exactly sqrt(phi)
        assert c["estimate"] == pytest.approx(QREF["estimates"][j], rel=1e-7)
        assert c["estimate"] == p["coefficients"][j]["estimate"]
        assert c["se"] == pytest.approx(QREF["quasi_se"][j], rel=1e-7)
        assert c["se"] == pytest.approx(
            p["coefficients"][j]["se"] * math.sqrt(QREF["phi"]), rel=1e-12)
        assert c["t"] == pytest.approx(QREF["quasi_t"][j], rel=1e-7)
        assert c["df"] == 15
        assert c["p"] == pytest.approx(QREF["quasi_p"][j], rel=1e-6)
        assert c["ci"] == pytest.approx(QREF["quasi_ci"][j], rel=1e-7)
        assert c["rate_ratio_ci"] == pytest.approx(
            QREF["quasi_rate_ratio_ci"][j], rel=1e-7)
        assert "z" not in c
    # display precision pins (statsmodels): SE of log(Dose + 10) 0.1001,
    # P 0.006030; Dose P 0.03274
    assert f"{q['coefficients'][1]['se']:.4g}" == "0.1001"
    assert f"{q['coefficients'][1]['p']:.4g}" == "0.00603"
    assert f"{q['coefficients'][2]['p']:.4g}" == "0.03274"
    f = q["f_test"]
    assert f["F"] == pytest.approx(QREF["f_test"]["F"], rel=1e-7)
    assert (f["df1"], f["df2"]) == (2, 15)
    assert f["p"] == pytest.approx(QREF["f_test"]["p"], rel=1e-6)
    assert q["ci_method"] == "wald_t" and "model_comparison" not in q
    assert q["dispersion"]["se_factor"] == pytest.approx(
        math.sqrt(QREF["phi"]))
    # the overdispersion warning belongs to the Poisson fit only
    assert any("overdispersion" in w for w in p["warnings"])
    assert not q["warnings"]


def test_quasi_poisson_invariances():
    q = ames(quasi=True)
    # permuting the rows changes nothing
    r = ames(rows=list(range(18))[::-1], quasi=True)
    for a, b in zip(q["coefficients"], r["coefficients"]):
        assert a["se"] == pytest.approx(b["se"], rel=1e-9)
        assert a["p"] == pytest.approx(b["p"], rel=1e-9)
    # dose in mg instead of ug: the slope and its SE scale by 1000, t and P
    # stay the same
    m = ames(scale=1e-3, quasi=True)
    assert m["coefficients"][2]["se"] == pytest.approx(
        q["coefficients"][2]["se"] * 1000, rel=1e-6)
    assert m["coefficients"][2]["p"] == pytest.approx(
        q["coefficients"][2]["p"], rel=1e-6)


def test_quasi_poisson_edge_cases():
    # counts that equal their fitted values: phi = 0, refused with a reason
    with pytest.raises(ValueError, match="phi = 0"):
        multivar.poisson_regression(
            [{"name": "y", "values": [3, 3, 5, 5]},
             {"name": "g", "values": list("aabb"), "kind": "categorical"}],
            "y", ["g"], quasi=True)
    # underdispersed counts: SEs shrink by sqrt(phi) < 1 (as R's
    # quasipoisson), and no overdispersion warning either way
    r = multivar.poisson_regression(
        [{"name": "y", "values": [10, 11, 10, 20, 21, 20]},
         {"name": "g", "values": list("aaabbb"), "kind": "categorical"}],
        "y", ["g"], quasi=True)
    assert r["dispersion"]["phi"] < 1 and not r["warnings"]
    # the API passes the option through
    res = api.analyze({"analysis": "poisson_regression",
                       "data": {"variables": [
                           {"name": "Revertants",
                            "values": QREF["data"]["revertants"]},
                           {"name": "Dose", "values": QREF["data"]["dose"]}]},
                       "options": {"outcome": "Revertants",
                                   "predictors": ["Dose"], "quasi": True}})
    assert "error" not in res, res.get("error")
    assert res["family"] == "quasipoisson"
