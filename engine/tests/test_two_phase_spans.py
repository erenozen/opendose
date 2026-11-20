"""SpanFast and SpanSlow of the two-phase models (curve-fitting guide,
"Equation: Two phase decay" / "... association": SpanFast = span *
PercentFast * .01, SpanSlow = span * (100 - PercentFast) * .01), reported
with delta-method SEs from the fit's covariance."""

import numpy as np
import pytest

from opendose import nlfit

X = np.linspace(0, 10, 25)


@pytest.mark.parametrize("model,true,span_sign", [
    ("two_phase_decay", {"Y0": 100, "Plateau": 5, "PercentFast": 70,
                         "KFast": 2.0, "KSlow": 0.2}, 1),
    ("two_phase_association", {"Y0": 5, "Plateau": 100, "PercentFast": 30,
                               "KFast": 2.0, "KSlow": 0.2}, -1),
])
def test_spans_are_the_equation_s_and_have_delta_method_ses(model, true,
                                                            span_sign):
    rng = np.random.default_rng(3)
    y = nlfit.MODELS[model].func(X, true) + rng.normal(0, 0.8, X.size)
    f = nlfit.fit_model(X, y, model)
    P = f["params"]
    span = span_sign * (P["Y0"]["value"] - P["Plateau"]["value"])
    frac = P["PercentFast"]["value"] / 100
    assert P["SpanFast"]["value"] == pytest.approx(span * frac, rel=1e-12)
    assert P["SpanSlow"]["value"] == pytest.approx(span * (1 - frac), rel=1e-12)
    assert P["SpanFast"]["value"] + P["SpanSlow"]["value"] == pytest.approx(
        span, rel=1e-12)
    if model == "two_phase_decay":
        # an original registry entry (no transforms): values only
        assert P["SpanFast"]["se"] is None and P["SpanFast"]["ci95"] is None
        return
    # delta method from the covariance of the free parameters
    names = f["_cov"]["free_names"]
    C = np.array(f["_cov"]["matrix"])
    g = np.zeros(len(names))
    g[names.index("Y0")] = span_sign * frac
    g[names.index("Plateau")] = -span_sign * frac
    g[names.index("PercentFast")] = span / 100
    assert P["SpanFast"]["se"] == pytest.approx(float(np.sqrt(g @ C @ g)),
                                                rel=1e-4)
    true_span = span_sign * (true["Y0"] - true["Plateau"])
    lo, hi = P["SpanFast"]["ci95"]
    assert lo < true_span * true["PercentFast"] / 100 < hi
