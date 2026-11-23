"""Two event rates compared (FEATURE-PLAN P-47): the exact conditional
test, the rate ratio with its exact CI and each rate's exact CI, against
statsmodels (engine/tests/reference/event_rates.py) and the example
printed on R's ?poisson.test help page."""

import json
from pathlib import Path

import pytest

from opendose import api, rates

REF = json.loads((Path(__file__).parent / "reference" / "event_rates.json")
                 .read_text())


def run(x1, t1, x2, t2, **opts):
    return api.analyze({"analysis": "rate_compare",
                        "data": {"groups": [
                            {"name": "One", "events": x1, "exposure": t1},
                            {"name": "Two", "events": x2, "exposure": t2}]},
                        "options": opts})


@pytest.mark.parametrize("name", ["acceptance", "r_help", "small"])
def test_against_statsmodels(name):
    ref = REF[name]
    r = run(ref["x1"], ref["t1"], ref["x2"], ref["t2"])
    for key in ("p_two_tailed", "p_greater", "p_less", "rate_ratio"):
        assert r[key] == pytest.approx(ref[key], rel=1e-9), key
    for got, want in zip(r["ratio_ci"], ref["ratio_ci"]):
        assert got == pytest.approx(want, rel=1e-8)
    for g, key in zip(r["groups"], ("rate1_ci", "rate2_ci")):
        assert g["ci"] == pytest.approx(ref[key], rel=1e-9)


def test_r_help_page_example():
    """poisson.test(c(11, 6 + 8 + 7), c(800, 1083 + 1050 + 878)) prints
    p-value = 0.07967, rate ratio 1.971488, 95% CI 0.8584264 4.2772659."""
    p = REF["r_help_printed"]
    r = run(11, 800, 21, 3011)
    assert round(r["p_two_tailed"], 5) == p["p_two_tailed"]
    assert round(r["rate_ratio"], 6) == p["rate_ratio"]
    assert [round(v, 7) for v in r["ratio_ci"]] == p["ratio_ci"]


def test_acceptance_display():
    r = run(23, 10, 41, 12)
    assert r["names"] == ["One", "Two"]
    assert round(r["rate_ratio"], 4) == 0.6732
    assert [round(v, 4) for v in r["ratio_ci"]] == [0.3856, 1.1485]
    assert round(r["p_two_tailed"], 4) == 0.1335


def test_invariance():
    base = run(23, 10, 41, 12)
    # exposure units: hours to minutes leaves the ratio and P unchanged,
    # the rates scale by 1/60
    m = run(23, 600, 41, 720)
    assert m["p_two_tailed"] == pytest.approx(base["p_two_tailed"], rel=1e-12)
    assert m["rate_ratio"] == pytest.approx(base["rate_ratio"], rel=1e-12)
    assert m["groups"][0]["rate"] == pytest.approx(
        base["groups"][0]["rate"] / 60, rel=1e-12)
    for k in (1e-12, 1e12):
        s = run(23, 10 * k, 41, 12 * k)
        assert s["ratio_ci"] == pytest.approx(base["ratio_ci"], rel=1e-9)
    # swapping the groups inverts the ratio and its CI, same two-sided P
    sw = run(41, 12, 23, 10)
    assert sw["rate_ratio"] == pytest.approx(1 / base["rate_ratio"])
    assert sw["ratio_ci"][0] == pytest.approx(1 / base["ratio_ci"][1])
    assert sw["p_two_tailed"] == pytest.approx(base["p_two_tailed"])
    assert sw["p_greater"] == pytest.approx(base["p_less"])


def test_edge_cases():
    # no events at all: rates and CIs, no ratio, no P, said why
    r = run(0, 5, 0, 7)
    assert r["p_two_tailed"] is None and r["rate_ratio"] is None
    assert "no events" in r["test"]
    assert r["groups"][0]["ci"][0] == 0.0 and r["groups"][0]["ci"][1] > 0
    # zero events in group 2: the ratio is unbounded above
    r = run(5, 1, 0, 1)
    assert r["rate_ratio"] is None and r["ratio_ci"][1] is None
    assert r["ratio_ci"][0] > 0 and r["p_two_tailed"] < 0.1
    # zero events in group 1: ratio 0, its CI from 0
    r = run(0, 1, 6, 1)
    assert r["rate_ratio"] == 0 and r["ratio_ci"][0] == 0
    # equal rates: P = 1
    assert run(10, 2, 20, 4)["p_two_tailed"] == pytest.approx(1.0)
    for bad in ((1.5, 1, 2, 1), (-1, 1, 2, 1), (1, 0, 2, 1), (1, -2, 2, 1),
                (None, 1, 2, 1)):
        with pytest.raises(ValueError):
            rates.compare_rates(*bad)
    r = api.analyze({"analysis": "rate_compare", "data": {"groups": [
        {"events": 1, "exposure": 1}]}, "options": {}})
    assert "two groups" in r["error"]
