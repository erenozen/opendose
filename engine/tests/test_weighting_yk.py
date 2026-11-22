"""Weighting by 1/Y^K for any K (Prism: "Weight by 1/Y^K").

K = 1 and K = 2 reproduce the existing 1/Y and 1/Y^2 fits exactly; the
weights are 1/|Y|^K of the predicted curve (Prism's "Math theory of
weighting": weights from the predicted Y, iteratively reweighted), so at
convergence the fit satisfies the weighted normal equations with the
weights of its own curve."""

import numpy as np
import pytest

from opendose import api, globalfit, nlfit

X = np.log10([1e-9, 3e-9, 1e-8, 3e-8, 1e-7, 3e-7, 1e-6, 3e-6]).tolist()
RNG = np.random.default_rng(7)
TRUE = 5 + 95 / (1 + 10 ** ((X[0] * 0 + np.array(X) - (-7.3)) * -1.1))
Y = (TRUE * (1 + RNG.normal(0, 0.06, len(X)))).tolist()


def _fit(w, **kw):
    return nlfit.fit_model(X, Y, "log_agonist_vs_response_4pl", weighting=w, **kw)


def _values(f):
    return {k: v["value"] for k, v in f["params"].items() if v.get("value") is not None}


def test_k1_and_k2_match_the_existing_weightings_exactly():
    assert _values(_fit("1/Y^1")) == _values(_fit("1/Y"))
    assert _values(_fit("1/Y^2")) == _values(_fit("1/Y2"))
    assert _values(_fit("1/Y^2.0")) == _values(_fit("1/Y2"))


def test_weights_are_one_over_abs_y_to_the_k():
    y = np.array([0.5, 2.0, -4.0])
    w = nlfit._weights(np.zeros(3), y, "1/Y^1.5")
    assert w == pytest.approx(np.abs(y) ** -1.5)
    assert nlfit.y_power("1/Y^0.75") == 0.75
    assert nlfit.y_power("1/Y") == 1 and nlfit.y_power("1/Y2") == 2
    assert nlfit.y_power("1/X") is None and nlfit.y_power("none") is None
    assert nlfit.y_weighted("1/Y^3") and not nlfit.y_weighted("1/X2")


def test_k_between_one_and_two_satisfies_the_weighted_normal_equations():
    f = _fit("1/Y^1.5")
    spec = nlfit.MODELS["log_agonist_vs_response_4pl"]
    names = list(spec.params)
    p = {n: float(f["fitted_values"][n]) for n in names}
    x, y = np.array(X), np.array(Y)
    yhat = spec.func(x, p)
    w = np.abs(yhat) ** -1.5
    # d/dtheta of sum w (y - f)^2 with w frozen at the fitted curve: zero
    for n in names:
        h = 1e-6 * max(1.0, abs(p[n]))
        dp = dict(p, **{n: p[n] + h})
        dm = dict(p, **{n: p[n] - h})
        dfd = (spec.func(x, dp) - spec.func(x, dm)) / (2 * h)
        g = float(np.sum(w * (y - yhat) * dfd))
        scale = float(np.sum(np.abs(w * (y - yhat) * dfd))) + 1e-300
        assert abs(g) / scale < 1e-5, n
    # and it lies between the 1/Y and 1/Y^2 fits for this data's EC50
    ec = [_values(_fit(w_))["LogEC50"] for w_ in ("1/Y", "1/Y^1.5", "1/Y2")]
    assert min(ec[0], ec[2]) - 1e-9 <= ec[1] <= max(ec[0], ec[2]) + 1e-9
    assert f["weighting"] == "1/Y^1.5"


def test_invalid_k_is_refused():
    for bad in ("1/Y^0", "1/Y^11", "1/Y^abc", "1/Y^", "1/Y^-1"):
        assert not nlfit.valid_weighting(bad)
        with pytest.raises(ValueError, match="unknown weighting"):
            _fit(bad)
    assert nlfit.valid_weighting("1/Y^10") and nlfit.valid_weighting("1/Y^0.5")


def test_api_and_global_fit_take_1_over_y_k():
    res = api.analyze({"analysis": "dose_response",
                       "data": {"x": X, "datasets": [{"name": "A", "ys": [[v] for v in Y]}]},
                       "options": {"model": "log_agonist_vs_response_4pl", "weighting": "1/Y^1.5"}})
    ds = res["datasets"][0]
    assert ds["fit"]["weighting"] == "1/Y^1.5"
    assert ds["fit"]["params"]["LogEC50"]["value"] == pytest.approx(
        _values(_fit("1/Y^1.5"))["LogEC50"], rel=1e-9)
    data = [{"name": "A", "x": X, "y": Y}, {"name": "B", "x": X, "y": [v * 1.02 for v in Y]}]
    g15 = globalfit.fit_global(data, "log_agonist_vs_response_4pl", ["HillSlope"], weighting="1/Y^1.5")
    g1 = globalfit.fit_global(data, "log_agonist_vs_response_4pl", ["HillSlope"], weighting="1/Y")
    g1k = globalfit.fit_global(data, "log_agonist_vs_response_4pl", ["HillSlope"], weighting="1/Y^1")
    assert str(g1) == str(g1k)            # K = 1 is 1/Y exactly
    assert str(g15) != str(g1)            # and K = 1.5 is a different fit
