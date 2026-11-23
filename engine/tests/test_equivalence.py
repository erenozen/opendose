"""Equivalence and non-inferiority tests (FEATURE-PLAN P-12): the two
one-sided tests (Schuirmann 1987) for unpaired, Welch, paired, one-sample
and log-ratio t tests and for two proportions (score tests).

Reference values: engine/tests/reference/equivalence_tost.py (statsmodels
0.15 ttost_ind / ttost_paired / DescrStatsW.ttost_mean; two proportions by
direct maximisation of the restricted likelihood), stored in
equivalence_tost.json.
"""

import json
import math
from pathlib import Path

import numpy as np
import pytest

from opendose import api, proportions, ttests

REF = json.loads((Path(__file__).parent / "reference" / "equivalence_tost.json")
                 .read_text())


def cols(*groups):
    return {"datasets": [{"name": n, "ys": [[v] for v in g]}
                         for n, g in zip("AB", groups)]}


def run(a, b, eq, **opts):
    return api.analyze({"analysis": "ttest", "data": cols(a, b),
                        "options": {"kind": "unpaired", "equivalence": eq,
                                    **opts}})


def close(got, want, rel=1e-9, abs_=1e-12):
    return got == pytest.approx(want, rel=rel, abs=abs_)


def check_t(e, ref):
    assert close(e["p"], ref["p"])
    assert close(e["test_lower"]["p"], ref["p_lower"])
    assert close(e["test_upper"]["p"], ref["p_upper"])
    assert close(e["test_lower"]["t"], ref["t_lower"])
    assert close(e["test_upper"]["t"], ref["t_upper"])
    assert close(e["df"], ref["df"])
    assert close(e["estimate"], ref["estimate"])
    assert close(e["ci"][0], ref["ci"][0]) and close(e["ci"][1], ref["ci"][1])


def test_acceptance_unpaired_margin_1_and_half():
    acc = REF["acceptance"]
    r = run(acc["a"], acc["b"], {"lower": -1, "upper": 1})
    e = r["equivalence"]
    check_t(e, acc["margin_1"])
    assert e["shown"] and e["kind"] == "equivalence" and e["ci_level"] == 0.9
    # the plan's hand values: 90% CI about -0.24 to 0.64
    assert round(e["ci"][0], 2) == -0.24 and round(e["ci"][1], 2) == 0.64
    e = run(acc["a"], acc["b"], {"lower": -0.5, "upper": 0.5})["equivalence"]
    check_t(e, acc["margin_0.5"])
    assert not e["shown"]
    # the t test itself is untouched by the option
    plain = api.analyze({"analysis": "ttest", "data": cols(acc["a"], acc["b"]),
                         "options": {"kind": "unpaired"}})
    assert plain["p_two_tailed"] == r["p_two_tailed"]
    assert "equivalence" not in plain


def test_welch():
    w = REF["welch"]
    e = run(w["a"], w["b"], {"lower": -1.5, "upper": 1.5},
            welch=True)["equivalence"]
    check_t(e, w)
    assert e["shown"]


def test_paired():
    p = REF["paired"]
    r = api.analyze({"analysis": "ttest", "data": cols(p["a"], p["b"]),
                     "options": {"kind": "paired",
                                 "equivalence": {"lower": -0.25,
                                                 "upper": 0.25}}})
    check_t(r["equivalence"], p)


def test_one_sample():
    o = REF["one_sample"]
    r = api.analyze({"analysis": "column_statistics",
                     "data": {"datasets": [{"name": "X",
                                            "ys": [[v] for v in o["values"]]}]},
                     "options": {"hypothetical": 100.0,
                                 "equivalence": {"lower": -1, "upper": 1}}})
    check_t(r["datasets"][0]["equivalence"], o)


def test_log_ratio_unpaired_and_ratio_paired():
    lu = REF["log_unpaired"]
    e = run(lu["a"], lu["b"], {"lower": 0.8, "upper": 1.25, "scale": "ratio"},
            log_scale=True)["equivalence"]
    check_t(e, lu)
    assert close(e["ratio"], lu["ratio"])
    assert close(e["ci_ratio"][0], lu["ci_ratio"][0])
    assert close(e["ci_ratio"][1], lu["ci_ratio"][1])
    lp = REF["log_paired"]
    r = api.analyze({"analysis": "ttest", "data": cols(lp["a"], lp["b"]),
                     "options": {"kind": "ratio_paired",
                                 "equivalence": {"lower": 0.8, "upper": 1.25,
                                                 "scale": "ratio"}}})
    check_t(r["equivalence"], lp)
    assert close(r["equivalence"]["ratio"], lp["ratio"])
    # the paired t test on the log scale gives the same test
    r2 = api.analyze({"analysis": "ttest", "data": cols(lp["a"], lp["b"]),
                      "options": {"kind": "paired", "log_scale": True,
                                  "equivalence": {"lower": 0.8, "upper": 1.25,
                                                  "scale": "ratio"}}})
    assert close(r2["equivalence"]["p"], lp["p"])


def test_noninferiority_one_margin():
    ni = REF["noninferiority"]
    e = run(ni["a"], ni["b"], {"lower": -0.5, "upper": None})["equivalence"]
    assert e["kind"] == "noninferiority" and e["test_upper"] is None
    assert close(e["p"], ni["p"]) and close(e["test_lower"]["t"], ni["t"])
    assert e["shown"]


def test_two_proportions_score_tost():
    for c in REF["proportions"]:
        k1, n1, k2, n2 = c["counts"]
        m = c["margin"]
        e = proportions.tost_two_proportions(k1, n1, k2, n2, -m, m)
        # the reference maximises the likelihood numerically (xatol 1e-13)
        assert close(e["test_lower"]["z"], c["z_lower"], rel=1e-7)
        assert close(e["test_upper"]["z"], c["z_upper"], rel=1e-7)
        assert close(e["p"], c["p"], rel=1e-7)
        assert close(e["ci"][0], c["ci"][0], rel=1e-7)
        assert close(e["ci"][1], c["ci"][1], rel=1e-7)
    r = api.analyze({"analysis": "proportion_test",
                     "data": {"groups": [{"successes": 45, "trials": 50},
                                         {"successes": 43, "trials": 50}]},
                     "options": {"equivalence": {"lower": -0.1,
                                                 "upper": 0.1}}})
    assert close(r["equivalence"]["p"], REF["proportions"][0]["p"], rel=1e-7)
    assert not r["equivalence"]["shown"]


def test_schuirmann_identity_random():
    """P_TOST < alpha exactly when the 1 - 2 alpha CI is inside the
    margins, and P_TOST is the larger one-sided P."""
    rng = np.random.default_rng(12)
    for _ in range(200):
        a = rng.normal(10, rng.uniform(0.2, 2), rng.integers(3, 12))
        b = rng.normal(10 + rng.normal(0, 0.5), rng.uniform(0.2, 2),
                       rng.integers(3, 12))
        m = float(rng.uniform(0.1, 2))
        for welch in (False, True):
            e = run(list(a), list(b), {"lower": -m, "upper": m},
                    welch=welch)["equivalence"]
            assert e["p"] == max(e["test_lower"]["p"], e["test_upper"]["p"])
            inside = -m < e["ci"][0] and e["ci"][1] < m
            assert e["shown"] == inside
    for _ in range(100):
        n1, n2 = (int(v) for v in rng.integers(5, 80, 2))
        k1, k2 = int(rng.integers(0, n1 + 1)), int(rng.integers(0, n2 + 1))
        m = float(rng.uniform(0.05, 0.4))
        e = proportions.tost_two_proportions(k1, n1, k2, n2, -m, m)
        inside = -m < e["ci"][0] and e["ci"][1] < m
        assert e["shown"] == inside


def test_invariance_units_and_group_order():
    acc = REF["acceptance"]
    base = run(acc["a"], acc["b"], {"lower": -1, "upper": 1})["equivalence"]
    for k in (1e-12, 1000.0, 1e12):
        e = run([v * k for v in acc["a"]], [v * k for v in acc["b"]],
                {"lower": -k, "upper": k})["equivalence"]
        assert close(e["p"], base["p"], rel=1e-6)
        assert close(e["ci"][0] / k, base["ci"][0], rel=1e-6)
    # B vs A with the margins mirrored: the same two tests, swapped
    sw = run(acc["b"], acc["a"], {"lower": -1, "upper": 1})["equivalence"]
    assert close(sw["p"], base["p"])
    assert close(sw["test_lower"]["p"], base["test_upper"]["p"])
    assert close(sw["ci"][0], -base["ci"][1])
    # proportions: swapping the groups mirrors the interval
    p1 = proportions.tost_two_proportions(45, 50, 43, 50, -0.1, 0.1)
    p2 = proportions.tost_two_proportions(43, 50, 45, 50, -0.1, 0.1)
    assert close(p1["p"], p2["p"], rel=1e-9)
    assert close(p1["ci"][0], -p2["ci"][1], rel=1e-9)


def test_edge_cases():
    # n = 1 in a group: the t test is withheld and so is the TOST
    r = run([1.0], [1.0, 2.0], {"lower": -1, "upper": 1})
    assert r["p_two_tailed"] is None and "equivalence" not in r
    # n = 2 per group works
    r = run([1.0, 1.2], [1.1, 1.3], {"lower": -1, "upper": 1})
    assert r["equivalence"]["df"] == 2
    # every difference equal (paired): SE 0, so the paired t test stops
    # with its sentence before any TOST, as the unpaired t test does on
    # SD 0 in both groups (test_zero_scatter_matched.py)
    def paired(a, b):
        return api.analyze({"analysis": "ttest", "data": cols(a, b),
                            "options": {"kind": "paired", "equivalence":
                                        {"lower": -1, "upper": 1}}})
    for a in ([5.0] * 4, [7.0] * 4):
        r = paired(a, [5.0] * 4)
        assert r["error"].startswith("The paired t test is undefined")
        assert "equivalence" not in r
    assert ttests.tost(1.0, 0.0, 5, -1, 1)["p"] == 1.0   # on the margin
    # missing values are left out as in the t test
    r = run([10.8, None, 10.55, 10.5], [10.6, 10.55, None, 10.3],
            {"lower": -1, "upper": 1})
    assert r["n_a"] == 3 and r["equivalence"]["df"] == 4
    # margins in the wrong order, a ratio margin on a difference test,
    # a difference margin on a log test, a rank test
    acc = REF["acceptance"]
    bad = run(acc["a"], acc["b"], {"lower": 1, "upper": -1})["equivalence"]
    assert "lower margin" in bad["unavailable"]
    bad = run(acc["a"], acc["b"], {"lower": 0.8, "upper": 1.25,
                                   "scale": "ratio"})["equivalence"]
    assert "ratio" in bad["unavailable"]
    bad = run(acc["a"], acc["b"], {"lower": -1, "upper": 1},
              log_scale=True)["equivalence"]
    assert "ratio" in bad["unavailable"]
    bad = api.analyze({"analysis": "ttest", "data": cols(acc["a"], acc["b"]),
                       "options": {"kind": "mann_whitney",
                                   "equivalence": {"lower": -1, "upper": 1}}})
    assert "rank test" in bad["equivalence"]["unavailable"]
    bad = run(acc["a"], acc["b"], {"lower": 0, "upper": 1.25,
                                   "scale": "ratio"}, log_scale=True)
    assert "positive" in bad["equivalence"]["unavailable"]
    with pytest.raises(ValueError):
        ttests.tost(0.1, 0.2, 10, None, None)
    # proportions: zero events in both groups, every event in one
    e = proportions.tost_two_proportions(0, 10, 0, 12, -0.3, 0.3)
    assert e["estimate"] == 0 and e["ci"][0] < 0 < e["ci"][1]
    assert math.isfinite(e["p"])
    e = proportions.tost_two_proportions(20, 20, 0, 20, -0.5, 0.5)
    assert e["ci"][1] == 1.0 and not e["shown"]
    with pytest.raises(ValueError):
        proportions.tost_two_proportions(5, 10, 5, 10, -1.5, 0.5)
    r = api.analyze({"analysis": "proportion_test",
                     "data": {"groups": [{"successes": 4, "trials": 10},
                                         {"successes": 5, "trials": 10}]},
                     "options": {"equivalence": {"lower": 0.8, "upper": 1.2,
                                                 "scale": "ratio"}}})
    assert "difference" in r["equivalence"]["unavailable"]
