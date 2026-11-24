"""P-91: parametric survival (exponential, Weibull and log-normal AFT).

References (engine/tests/reference/parametric_survival.py, which writes
parametric_survival.json):
- an independent censored MLE (scipy.optimize, finite-difference
  Hessian, delta-method percentiles on a numerical gradient);
- lifelines 0.30.3 WeibullAFTFitter / LogNormalAFTFitter;
- the closed form of the exponential model with one group factor;
- published survreg output on survival::lung (Therneau, "The survival
  package" vignette, section 4.1): Weibull ~ age + sex + ph.karno,
  coefficients 5.326344, -0.008910282, 0.3701786, 0.009263843, scale
  0.7551354, loglik -1138.7 (intercept only -1147.5), n = 227.
"""
import csv
import json
import math
import os

import numpy as np
import pytest

from opendose import api
from opendose import parametric_survival as ps

HERE = os.path.dirname(__file__)
REF = json.load(open(os.path.join(HERE, "reference", "parametric_survival.json")))
OV = REF["ovarian_data"]


def _groups():
    g = {1: ([], []), 2: ([], [])}
    for t, e, rx in zip(OV["futime"], OV["fustat"], OV["rx"]):
        g[rx][0].append(t)
        g[rx][1].append(e)
    return [g[1], g[2]], ["rx 1", "rx 2"]


def _payload():
    groups, names = _groups()
    return {"datasets": [{"name": n, "ys": [[t, e] for t, e in zip(*g)]}
                         for n, g in zip(names, groups)]}


@pytest.fixture(scope="module", params=["weibull", "exponential", "lognormal"])
def fitted(request):
    res = api.analyze({"analysis": "parametric_survival", "data": _payload(),
                       "options": {"dist": request.param}})
    return request.param, res


def test_matches_independent_mle(fitted):
    dist, res = fitted
    ref = REF["ovarian"][dist]
    assert res["converged"]
    assert [c["coef"] for c in res["coefficients"]] == pytest.approx(ref["coef"], rel=1e-6)
    assert [c["se"] for c in res["coefficients"]] == pytest.approx(ref["se"], rel=1e-4)
    assert res["scale"]["value"] == pytest.approx(ref["scale"], rel=1e-6)
    assert res["loglik"] == pytest.approx(ref["loglik"], abs=1e-7)
    assert res["loglik_null"] == pytest.approx(ref["loglik_null"], abs=1e-7)
    assert res["lr_test"]["chi2"] == pytest.approx(ref["lr_chi2"], abs=1e-6)
    assert res["aic"] == pytest.approx(ref["aic"], abs=1e-6)
    tr = res["time_ratios"][0]
    assert tr["value"] == pytest.approx(ref["time_ratio"], rel=1e-6)
    assert tr["ci"] == pytest.approx(ref["time_ratio_ci"], rel=1e-4)
    for g in res["groups"]:
        for pc in g["percentiles"]:
            want = ref["percentiles"][g["name"]][str(pc["p"])]
            assert pc["time"] == pytest.approx(want["time"], rel=1e-6)
            assert pc["se_log"] == pytest.approx(want["se_log"], rel=1e-4)
            assert pc["ci"] == pytest.approx(want["ci"], rel=1e-4)
    if ref["log_scale_se"] is not None:
        assert res["scale"]["log_se"] == pytest.approx(ref["log_scale_se"], rel=1e-4)


def test_exponential_matches_closed_form():
    groups, names = _groups()
    res = ps.parametric_survival(groups, names, dist="exponential")
    cf = REF["ovarian"]["exponential_closed_form"]
    assert [c["coef"] for c in res["coefficients"]] == pytest.approx(cf["coef"], rel=1e-10)
    assert [c["se"] for c in res["coefficients"]] == pytest.approx(cf["se"], rel=1e-8)
    medians = [g["percentiles"][1]["time"] for g in res["groups"]]
    assert medians == pytest.approx([cf["median"]["rx 1"], cf["median"]["rx 2"]], rel=1e-10)
    assert res["scale"] == {"value": 1.0, "ci": None, "log_value": 0.0, "log_se": None, "fixed": True}


@pytest.mark.parametrize("dist", ["weibull", "lognormal"])
def test_matches_lifelines(dist):
    groups, names = _groups()
    res = ps.parametric_survival(groups, names, dist=dist)
    ll = REF["ovarian"]["lifelines"][dist]
    assert [c["coef"] for c in res["coefficients"]] == pytest.approx(ll["coef"], rel=2e-5)
    assert res["scale"]["value"] == pytest.approx(ll["scale"], rel=2e-5)
    assert res["loglik"] == pytest.approx(ll["loglik"], abs=1e-8)
    assert [g["percentiles"][1]["time"] for g in res["groups"]] == pytest.approx(ll["median"], rel=2e-5)


def test_ovarian_acceptance_weibull_by_treatment():
    """P-91 acceptance: ovarian as a survival table with a treatment
    column: the Weibull coefficient of rx, the scale and the median per
    group (display precision, 4 significant digits)."""
    res = api.analyze({"analysis": "parametric_survival", "data": _payload(), "options": {}})
    sig = lambda v: float(f"{v:.4g}")  # noqa: E731
    assert sig(res["coefficients"][1]["coef"]) == 0.5593
    assert sig(res["coefficients"][1]["se"]) == 0.5292
    assert sig(res["scale"]["value"]) == 0.8857
    assert sig(res["shape"]) == 1.129
    assert [sig(g["percentiles"][1]["time"]) for g in res["groups"]] == [665.1, 1163.0]
    assert sig(res["time_ratios"][0]["value"]) == 1.749
    # rx 2's 75% time (2150) is past its last follow-up (1227): flagged
    rx2 = res["groups"][1]["percentiles"]
    assert [p["beyond_follow_up"] for p in rx2] == [False, False, True]
    assert any("rx 2: the time by which 75% have had the event is later than the last follow-up (1227)"
               in w for w in res["warnings"])


def _lung():
    with open(os.path.join(HERE, "fixtures", "lung.csv")) as f:
        rows = [r for r in csv.DictReader(f) if r["ph.karno"] != ""]
    t = [float(r["time"]) for r in rows]
    e = [int(r["status"]) - 1 for r in rows]
    X = [[1.0, float(r["age"]), float(r["sex"]), float(r["ph.karno"])] for r in rows]
    return t, e, X


def test_lung_matches_published_survreg():
    t, e, X = _lung()
    pub = REF["lung_weibull"]["published"]
    assert len(t) == pub["n"]
    f = ps.aft_fit(t, e, X, ["(Intercept)", "age", "sex", "ph.karno"], "weibull")
    # survreg's convergence (relative loglik change 1e-9) leaves its
    # printed coefficients within ~4e-5 (relative) of the exact maximum
    assert [c["coef"] for c in f["coefficients"]] == pytest.approx(pub["coef"], rel=1e-4)
    assert f["scale"]["value"] == pytest.approx(pub["scale"], rel=2e-5)
    assert round(f["loglik"], 1) == pub["loglik"]
    null = ps.aft_fit(t, e, [[1.0] for _ in t], ["(Intercept)"], "weibull")
    assert round(null["loglik"], 1) == pub["loglik_null"]
    # and the exact maximum of the independent reference fit
    assert [c["coef"] for c in f["coefficients"]] == pytest.approx(REF["lung_weibull"]["coef"], rel=1e-6)
    assert [c["se"] for c in f["coefficients"]] == pytest.approx(REF["lung_weibull"]["se"], rel=1e-3)


# --------------------------------------------------------------- properties

@pytest.mark.parametrize("scale", [1e-12, 1 / 30.4375, 1e12])
@pytest.mark.parametrize("dist", ["weibull", "lognormal", "exponential"])
def test_time_units_shift_only_the_intercept(scale, dist):
    groups, names = _groups()
    a = ps.parametric_survival(groups, names, dist=dist)
    b = ps.parametric_survival([([t * scale for t in g[0]], g[1]) for g in groups], names, dist=dist)
    assert b["coefficients"][0]["coef"] == pytest.approx(a["coefficients"][0]["coef"] + math.log(scale),
                                                         rel=1e-9, abs=1e-7)
    assert b["coefficients"][1]["coef"] == pytest.approx(a["coefficients"][1]["coef"], abs=1e-7)
    assert b["scale"]["value"] == pytest.approx(a["scale"]["value"], rel=1e-7)
    for ga, gb in zip(a["groups"], b["groups"]):
        for pa, pb in zip(ga["percentiles"], gb["percentiles"]):
            assert pb["time"] == pytest.approx(pa["time"] * scale, rel=1e-6)
    assert b["lr_test"]["chi2"] == pytest.approx(a["lr_test"]["chi2"], abs=1e-6)


def test_swapping_groups_inverts_the_time_ratio():
    groups, names = _groups()
    a = ps.parametric_survival(groups, names)
    b = ps.parametric_survival(groups[::-1], names[::-1])
    assert b["time_ratios"][0]["value"] == pytest.approx(1 / a["time_ratios"][0]["value"], rel=1e-7)
    assert b["time_ratios"][0]["p"] == pytest.approx(a["time_ratios"][0]["p"], rel=1e-6)
    ma = {g["name"]: g["percentiles"][1]["time"] for g in a["groups"]}
    mb = {g["name"]: g["percentiles"][1]["time"] for g in b["groups"]}
    assert mb == pytest.approx(ma, rel=1e-7)


def test_weibull_percentiles_follow_the_survival_function():
    """S(t_p) = 1 - p for the fitted Weibull: exp(-(t/lambda)^(1/sigma))."""
    groups, names = _groups()
    res = ps.parametric_survival(groups, names, percentiles=[0.1, 0.5, 0.9])
    b0 = res["coefficients"][0]["coef"]
    s = res["scale"]["value"]
    for pc in res["groups"][0]["percentiles"]:
        surv = math.exp(-((pc["time"] / math.exp(b0)) ** (1 / s)))
        assert surv == pytest.approx(1 - pc["p"], abs=1e-12)


# --------------------------------------------------------------- edge cases

def _analyze(datasets, **options):
    return api.analyze({"analysis": "parametric_survival", "data": {"datasets": datasets},
                        "options": options})


def test_a_group_without_events_is_refused_with_a_reason():
    r = _analyze([{"name": "A", "ys": [[1, 1], [2, 1], [3, 0]]},
                  {"name": "B", "ys": [[4, 0], [5, 0]]}])
    assert "no events in B" in r["error"] and "not reached" in r["error"]


def test_no_events_at_all():
    r = _analyze([{"name": "A", "ys": [[1, 0], [2, 0]]}])
    assert "no events in A" in r["error"]


def test_time_zero_is_refused_with_a_next_step():
    r = _analyze([{"name": "A", "ys": [[0, 1], [2, 1], [3, 0]]}])
    assert "greater than 0" in r["error"] and "small positive time" in r["error"]


def test_all_events_at_one_time_cannot_give_a_scale():
    r = _analyze([{"name": "A", "ys": [[5, 1], [5, 1], [5, 1]]}])
    assert "same time" in r["error"]
    # the exponential has no scale to estimate: it fits
    r = _analyze([{"name": "A", "ys": [[5, 1], [5, 1], [5, 1]]}], dist="exponential")
    assert r["groups"][0]["percentiles"][1]["time"] == pytest.approx(5 * math.log(2))


def test_one_event_one_subject():
    r = _analyze([{"name": "A", "ys": [[7, 1]]}], dist="exponential")
    assert r["coefficients"][0]["coef"] == pytest.approx(math.log(7))
    assert r["lr_test"] is None
    assert any("1 event;" in w for w in r["warnings"])
    r = _analyze([{"name": "A", "ys": [[7, 1]]}])
    assert "too few" in r["error"]


def test_bad_rows_left_out_with_warnings():
    groups, names = _groups()
    ds = _payload()["datasets"]
    ds[0]["ys"] = ds[0]["ys"] + [[100, 2], [None, 1], [50, None]]
    r = _analyze(ds)
    assert r["n"] == 26
    w = " ".join(r["warnings"])
    assert "event code 2 is not 1 (event) or 0 (censored)" in w
    assert "missing time" in w and "missing event code" in w


def test_bad_options():
    r = _analyze(_payload()["datasets"], dist="gamma")
    assert "unknown distribution" in r["error"]
    r = _analyze(_payload()["datasets"], percentiles=[0.5, 1.2])
    assert "between 0 and 1" in r["error"]


def test_distribution_comparison_lists_all_three():
    groups, names = _groups()
    r = ps.parametric_survival(groups, names, dist="lognormal")
    assert [c["dist"] for c in r["compare"]] == ["weibull", "exponential", "lognormal"]
    aic = {c["dist"]: c["aic"] for c in r["compare"]}
    for d in aic:
        assert aic[d] == pytest.approx(REF["ovarian"][d]["aic"], abs=1e-6)


def test_three_groups_and_reference():
    rng = np.random.default_rng(3)
    groups = []
    for scale in (10, 20, 40):
        t = rng.weibull(1.5, 40) * scale
        c = rng.uniform(0, 60, 40)
        groups.append((list(np.minimum(t, c)), [int(a <= b) for a, b in zip(t, c)]))
    r = ps.parametric_survival(groups, ["Low", "Mid", "High"])
    assert r["converged"] and r["lr_test"]["df"] == 2
    assert [x["group"] for x in r["time_ratios"]] == ["Mid", "High"]
    assert all(x["reference"] == "Low" for x in r["time_ratios"])
    assert 1.4 < r["time_ratios"][0]["value"] < 3 and 2.8 < r["time_ratios"][1]["value"] < 6
    assert 0.5 < r["scale"]["value"] < 0.9  # 1 / shape 1.5 = 0.667
