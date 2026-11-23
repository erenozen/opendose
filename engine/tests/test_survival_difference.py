"""P-28: the difference in survival at a chosen time
(survival_extras.survival_at_times, "differences").

Reference: engine/tests/reference/survival_difference.py (a numpy Kaplan-
Meier with Greenwood SEs written independently, statsmodels SurvfuncRight
as a second oracle, the Klein et al. 2007 complementary log-log test by
hand) on R's survival::lung by sex at 365 days. R and lifelines are not
installed."""

import json
import math
import pathlib

import pytest

from opendose import api, survival_extras as se

REF = json.loads((pathlib.Path(__file__).parent / "reference"
                  / "survival_difference.json").read_text())
M, F = REF["groups"]["Male"], REF["groups"]["Female"]


def lung(times=(365,)):
    return se.survival_at_times([(M["times"], M["events"]),
                                 (F["times"], F["events"])],
                                ["Male", "Female"], list(times))


def test_lung_365_matches_the_references():
    res = lung()
    m, f = (g["at_times"][0] for g in res["groups"])
    assert m["survival"] == pytest.approx(M["statsmodels_survival"], rel=1e-12)
    assert m["se"] == pytest.approx(M["statsmodels_se"], rel=1e-10)
    assert f["survival"] == pytest.approx(F["statsmodels_survival"], rel=1e-12)
    assert f["se"] == pytest.approx(F["statsmodels_se"], rel=1e-10)
    (d,) = res["differences"]
    ref = REF["difference"]
    assert (d["group"], d["reference"], d["time"]) == ("Female", "Male", 365.0)
    assert d["difference"] == pytest.approx(ref["difference"], rel=1e-12)
    assert d["se"] == pytest.approx(ref["se"], rel=1e-10)
    assert d["ci"] == pytest.approx(ref["ci"], rel=1e-10)
    assert d["chi2"] == pytest.approx(ref["chi2"], rel=1e-10)
    assert d["p"] == pytest.approx(ref["p"], rel=1e-9)
    assert d["note"] is None
    # display pins: 19.04 points (4.563 to 33.51), P = 0.01273
    assert f"{d['difference'] * 100:.4g}" == "19.04"
    assert [f"{v * 100:.4g}" for v in d["ci"]] == ["4.563", "33.51"]
    assert f"{d['p']:.4g}" == "0.01273"


def test_symmetry_units_and_several_times():
    res = lung()
    rev = se.survival_at_times([(F["times"], F["events"]),
                                (M["times"], M["events"])],
                               ["Female", "Male"], [365])
    a, b = res["differences"][0], rev["differences"][0]
    # swapping the groups flips the sign; the test is symmetric
    assert b["difference"] == pytest.approx(-a["difference"])
    assert b["ci"] == pytest.approx([-a["ci"][1], -a["ci"][0]])
    assert b["p"] == pytest.approx(a["p"])
    # time in weeks instead of days: the same estimates
    wk = se.survival_at_times([([t / 7 for t in M["times"]], M["events"]),
                               ([t / 7 for t in F["times"]], F["events"])],
                              ["Male", "Female"], [365 / 7])
    assert wk["differences"][0]["p"] == pytest.approx(a["p"], rel=1e-9)
    # one entry per group (vs the first) and per time
    many = lung([180, 365])
    assert [d["time"] for d in many["differences"]] == [180.0, 365.0]
    three = se.survival_at_times([(M["times"], M["events"]),
                                  (F["times"], F["events"]),
                                  (M["times"][:60], M["events"][:60])],
                                 ["Male", "Female", "Early"], [365])
    assert [d["group"] for d in three["differences"]] == ["Female", "Early"]
    assert all(d["reference"] == "Male" for d in three["differences"])


def test_edge_cases():
    # before any event: S = 1 in both groups, no SE, no test, a reason
    d = lung([1])["differences"][0]
    assert d["difference"] == 0 and d["p"] is None and "100%" in d["note"]
    # after a group's last observed time: not estimated, a reason
    d = lung([5000])["differences"][0]
    assert d["difference"] is None and "not estimated" in d["note"]
    # S = 0 in a group: Greenwood SE undefined, no CI or P
    g0 = ([1, 2, 3], [1, 1, 1])
    g1 = ([1, 2, 3, 4], [0, 1, 0, 1])
    d = se.survival_at_times([g0, g1], ["A", "B"], [3])["differences"][0]
    assert d["ci"] is None and d["p"] is None and "undefined" in d["note"]
    # one group: no differences
    assert se.survival_at_times([g1], ["B"], [2])["differences"] == []
    # ties at the chosen time count as events at t (S includes them)
    d = se.survival_at_times([([1, 2, 2, 5, 6], [1, 1, 1, 0, 1]),
                              ([1, 3, 4, 7, 8], [0, 1, 1, 1, 0])],
                             ["A", "B"], [2])["differences"][0]
    assert d["difference"] == pytest.approx(1.0 - 0.4)


def test_through_the_api():
    res = api.analyze({"analysis": "survival_at_time",
                       "data": {"datasets": [
                           {"name": "Male", "ys": [[t, e] for t, e in
                                                   zip(M["times"],
                                                       M["events"])]},
                           {"name": "Female", "ys": [[t, e] for t, e in
                                                     zip(F["times"],
                                                         F["events"])]}]},
                       "options": {"times": [365]}})
    assert "error" not in res, res.get("error")
    assert res["differences"][0]["p"] == pytest.approx(
        REF["difference"]["p"], rel=1e-9)
    assert math.isfinite(res["differences"][0]["chi2"])
