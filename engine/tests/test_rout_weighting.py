"""ROUT keeps the fit options asked for: the outliers are found with the
unweighted robust fit, and the cleaned data are then fitted with the
chosen weighting and CI method. (The weighting and the CI method were
dropped before, so ROUT with 1/Y^2 weighting returned the unweighted fit
and profile CIs became asymptotic.)"""

import numpy as np
import pytest

from opendose import api, nlfit

M = "log_agonist_vs_response_4pl"
X = [-9, -8, -7, -6, -5, -4]
RNG = np.random.default_rng(1)


def _y(lx):
    return 10 + 90 / (1 + 10 ** ((-6.5 - lx) * 1.0))


YS = [[_y(v) + RNG.normal(0, 1 + 0.1 * _y(v)) for _ in range(3)] for v in X]


def _fit(ys, **opts):
    r = api.analyze({"analysis": "dose_response",
                     "data": {"x": X, "datasets": [{"name": "A", "ys": ys}]},
                     "options": {"model": M, "x_is_log": True, **opts}})
    return r["datasets"][0]


@pytest.mark.parametrize("weighting", ["none", "1/Y2", "1/SD2"])
def test_rout_without_outliers_equals_the_plain_fit(weighting):
    plain = _fit(YS, weighting=weighting)["fit"]
    rout = _fit(YS, weighting=weighting, rout_q=0.01)
    assert rout["rout"]["n_outliers"] == 0
    for k in ("Top", "Bottom", "LogEC50", "HillSlope"):
        assert rout["fit"]["params"][k]["value"] == pytest.approx(
            plain["params"][k]["value"], rel=1e-9)


def test_rout_keeps_profile_intervals():
    rout = _fit(YS, ci_method="profile", rout_q=0.01)["fit"]
    plain = _fit(YS, ci_method="profile")["fit"]
    assert rout["ci_method"] == "profile"
    assert rout["params"]["LogEC50"]["ci95"] == pytest.approx(
        plain["params"]["LogEC50"]["ci95"], rel=1e-9)


def test_cleaned_fit_uses_the_weighting():
    ys = [list(r) for r in YS]
    ys[2][1] += 60.0                                   # a gross outlier
    res = _fit(ys, weighting="1/Y2", rout_q=0.01)
    assert res["rout"]["n_outliers"] >= 1
    out = {(o["x"], o["y"]) for o in res["rout"]["outliers"]}
    xs = [x for x, r in zip(X, ys) for _ in r]
    yy = [v for r in ys for v in r]
    keep = [(a, b) for a, b in zip(xs, yy) if (float(a), float(b)) not in out]
    ref = nlfit.fit_model([a for a, _ in keep], [b for _, b in keep], M,
                          weighting="1/Y2")
    unweighted = nlfit.fit_model([a for a, _ in keep], [b for _, b in keep], M)
    got = res["fit"]["params"]["LogEC50"]["value"]
    assert got == pytest.approx(ref["params"]["LogEC50"]["value"], rel=1e-9)
    assert got != pytest.approx(unweighted["params"]["LogEC50"]["value"],
                                rel=1e-6)
