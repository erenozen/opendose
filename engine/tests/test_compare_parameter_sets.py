"""One parameter across three or more curves (compare_params.
compare_parameter_sets; GraphPad curve-fitting guide, "Compare tab: Do the
best-fit values of selected parameters differ between data sets?"): the
shared-vs-separate extra-sum-of-squares F test with DFn = k - 1, checked
against an independent least-squares fit of the shared model, plus the
Holm-adjusted pairwise follow-up."""

import numpy as np
import pytest
from scipy import optimize, stats

from opendose import api, compare_params as cp

MODEL = "log_inhibitor_vs_response_4pl"
X = np.repeat(np.linspace(-9, -4, 8), 3)


def _curve(rng, logic50, top=100.0, bottom=0.0, hill=1.0):
    y = bottom + (top - bottom) / (1 + 10 ** ((logic50 - X) * hill))
    return (y + rng.normal(0, 4, X.size)).tolist()


def _sets(logs, seed=8):
    rng = np.random.default_rng(seed)
    return [{"name": f"S{i}", "x": X.tolist(), "y": _curve(rng, v)}
            for i, v in enumerate(logs)]


def _f4(x, top, bottom, logx, hill):
    return bottom + (top - bottom) / (1 + 10 ** ((logx - x) * hill))


def test_f_test_matches_an_independent_shared_fit():
    sets = _sets([-6.5, -6.0, -6.45])
    r = cp.compare_parameter_sets(sets, MODEL, "logIC50")
    k = len(sets)
    # shared: one LogIC50 + (Top, Bottom, Hill) per set, by plain least squares
    xs = [np.asarray(s["x"]) for s in sets]
    ys = [np.asarray(s["y"]) for s in sets]

    def resid(p):
        out = []
        for i in range(k):
            top, bottom, hill = p[1 + 3 * i: 4 + 3 * i]
            out.append(ys[i] - _f4(xs[i], top, bottom, p[0], hill))
        return np.concatenate(out)

    start = np.r_[-6.3, np.tile([100.0, 0.0, 1.0], k)]
    ss_sh = float(np.sum(optimize.least_squares(
        resid, start, xtol=1e-14, ftol=1e-14, gtol=1e-14).fun ** 2))
    ss_sep = 0.0
    for x, y in zip(xs, ys):
        p, _ = optimize.curve_fit(_f4, x, y, p0=[100, 0, -6.3, 1],
                                  maxfev=20000)
        ss_sep += float(np.sum((y - _f4(x, *p)) ** 2))
    n = sum(x.size for x in xs)
    dfn, dfd = k - 1, n - 4 * k
    F = ((ss_sh - ss_sep) / dfn) / (ss_sep / dfd)
    f = r["f_test"]
    assert (f["dfn"], f["dfd"]) == (dfn, dfd)
    assert f["ss_shared"] == pytest.approx(ss_sh, rel=1e-6)
    assert f["ss_separate"] == pytest.approx(ss_sep, rel=1e-6)
    assert f["F"] == pytest.approx(F, rel=1e-5)
    assert f["p"] == pytest.approx(stats.f.sf(F, dfn, dfd), rel=1e-4)
    assert f["p"] < 0.001 and r["aicc"]["preferred"] == "separate"


def test_two_sets_reduce_to_compare_parameter():
    sets = _sets([-6.5, -6.0])
    many = cp.compare_parameter_sets(sets, MODEL, "logIC50")
    two = cp.compare_parameter(sets[0], sets[1], MODEL, "logIC50")
    assert many["f_test"]["F"] == two["f_test"]["F"]
    assert many["f_test"]["p"] == two["f_test"]["p"]
    pair = many["pairwise"][0]
    assert pair["p"] == two["difference"]["p"] == pair["p_holm"]
    assert pair["ratio"] == pytest.approx(two["ratio"]["value"])
    assert pair["ratio_ci"] == pytest.approx(two["ratio"]["ci"])


def test_pairwise_follow_up_is_holm_adjusted():
    r = cp.compare_parameter_sets(_sets([-6.5, -6.0, -6.45]), MODEL,
                                  "logIC50")
    pairs = r["pairwise"]
    assert [(d["a"], d["b"]) for d in pairs] == [("S0", "S1"), ("S0", "S2"),
                                                 ("S1", "S2")]
    raw = [d["p"] for d in pairs]
    order = np.argsort(raw)
    expect = np.maximum.accumulate([min(1, (3 - i) * raw[j])
                                    for i, j in enumerate(order)])
    for i, j in enumerate(order):
        assert pairs[j]["p_holm"] == pytest.approx(expect[i])
    # S0 and S2 have nearly the same IC50; S1 differs from both
    assert pairs[1]["p_holm"] > 0.05
    assert pairs[0]["p_holm"] < 0.001 and pairs[2]["p_holm"] < 0.001


def test_holm_by_hand():
    assert cp._holm([0.01, 0.04, 0.03]) == pytest.approx([0.03, 0.06, 0.06])
    assert cp._holm([0.5, 0.9]) == pytest.approx([1.0, 1.0])


def test_same_ic50_is_not_rejected():
    r = cp.compare_parameter_sets(_sets([-6.3, -6.3, -6.3, -6.3], seed=3),
                                  MODEL, "logIC50")
    assert r["f_test"]["dfn"] == 3
    assert r["f_test"]["p"] > 0.05


def test_api_routes_three_or_more_data_sets():
    sets = _sets([-6.5, -6.0, -6.45])
    data = {"x": X.tolist(), "datasets": [
        {"name": s["name"], "ys": [[v] for v in s["y"]]} for s in sets]}
    r = api.analyze({"analysis": "compare_parameter", "data": data,
                     "options": {"model": MODEL, "parameter": "logIC50",
                                 "datasets": [0, 1, 2]}})
    assert r["mode"] == "sets" and r["n_sets"] == 3
    assert r["f_test"]["dfn"] == 2
    two = api.analyze({"analysis": "compare_parameter", "data": data,
                       "options": {"model": MODEL, "parameter": "logIC50"}})
    assert "mode" not in two and two["dataset_names"] == ["S0", "S1"]
    bad = api.analyze({"analysis": "compare_parameter", "data": data,
                       "options": {"model": MODEL, "parameter": "logIC50",
                                   "datasets": [0, 1, 1]}})
    assert "once" in bad["error"]


def test_constant_parameter_cannot_be_compared():
    with pytest.raises(ValueError, match="constant"):
        cp.compare_parameter_sets(_sets([-6.5, -6.0, -6.4]), MODEL,
                                  "HillSlope",
                                  constraints={"HillSlope": 1.0})
