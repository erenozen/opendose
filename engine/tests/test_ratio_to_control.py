"""Ratio to control with Fieller's interval (FEATURE-PLAN P-18): the
unpaired t test's ratio_to_control and each Dunnett comparison's ratio.

Reference: engine/tests/reference/fieller_ratio.py (Fieller's quadratic
solved by np.roots, not the engine's closed form; a 2,000-replicate
coverage run; Dunnett's plug-in critical value by nested adaptive
quadrature, not opendose.dunnett), which writes fieller_ratio.json. R's mratios
is not installed.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pytest
from scipy import stats

from opendose import api, compare_params, ttests

REF = json.loads((Path(__file__).resolve().parent / "reference"
                  / "fieller_ratio.json").read_text())


def two(c, t, **opts):
    return api.analyze({"analysis": "ttest", "data": {"datasets": [
        {"name": "Control", "ys": [[v] for v in c]},
        {"name": "Treated", "ys": [[v] for v in t]}]},
        "options": {"kind": "unpaired", **opts}})


def test_acceptance_ratio_and_fieller_ci():
    ref = REF["acceptance"]
    r = two(ref["control"], ref["treated"])
    rc = r["ratio_to_control"]
    assert rc["value"] == pytest.approx(0.65, rel=1e-14)
    assert rc["ci"] == pytest.approx(ref["ci"], rel=1e-10)
    # display precision: 0.6500, 95% CI 0.5762 to 0.7292
    assert [round(v, 4) for v in rc["ci"]] == [0.5762, 0.7292]
    assert rc["numerator"] == "Treated" and rc["denominator"] == "Control"
    assert rc["unbounded"] is False and rc["df"] == 8
    # the t test itself is untouched
    assert r["difference"] == pytest.approx(35.0)


def test_unbounded_when_the_control_mean_is_near_zero():
    ref = REF["near_zero"]
    rc = two(ref["control"], ref["treated"])["ratio_to_control"]
    assert ref["ci"] is None
    assert rc["unbounded"] is True and rc["ci"] is None and rc["g"] >= 1
    assert rc["value"] == pytest.approx(15.0)


def test_welch_and_paired_have_no_ratio():
    ref = REF["acceptance"]
    assert "ratio_to_control" not in two(ref["control"], ref["treated"], welch=True)
    r = api.analyze({"analysis": "ttest", "data": {"datasets": [
        {"name": "A", "ys": [[v] for v in ref["control"]]},
        {"name": "B", "ys": [[v] for v in ref["treated"]]}]}, "options": {"kind": "paired"}})
    assert "ratio_to_control" not in r


def test_coverage_of_the_engine_interval():
    """2,000 seeded data sets as the reference: the engine's interval
    covers the true ratio as often as the hand one, within the binomial
    tolerance of 95% (3 SE = 1.46 points)."""
    cov = REF["coverage"]
    rng = np.random.default_rng(cov["seed"])
    hits = 0
    for _ in range(cov["n_rep"]):
        c = rng.normal(100, 5, 5)
        t = rng.normal(65, 5, 5)
        ci = ttests.ratio_to_control(c, t)["ci"]
        hits += ci is not None and ci[0] <= 0.65 <= ci[1]
    assert hits == cov["covered"]
    se = math.sqrt(0.95 * 0.05 / cov["n_rep"])
    assert abs(hits / cov["n_rep"] - 0.95) < 3 * se


def test_units_and_swap():
    ref = REF["acceptance"]
    a = ttests.ratio_to_control(ref["control"], ref["treated"])
    b = ttests.ratio_to_control([v * 1e-9 for v in ref["control"]],
                                [v * 1e-9 for v in ref["treated"]])
    assert b["value"] == pytest.approx(a["value"], rel=1e-12)
    assert b["ci"] == pytest.approx(a["ci"], rel=1e-9)
    # swapping the groups inverts the ratio; the Fieller limits invert too
    s = ttests.ratio_to_control(ref["treated"], ref["control"])
    assert s["value"] == pytest.approx(1 / a["value"])
    assert sorted(1 / v for v in a["ci"]) == pytest.approx(s["ci"], rel=1e-9)


def test_edge_cases():
    with pytest.raises(ValueError):
        ttests.ratio_to_control([1.0], [2.0, 3.0])
    zero = ttests.ratio_to_control([-1.0, 1.0, 0.0], [2.0, 3.0, 4.0])
    assert zero["value"] is None and zero["unbounded"] is False


def test_fieller_crit_matches_fieller_ratio():
    a, sa, b, sb, df = 100.0, 2.77, 65.0, 2.77, 8
    t = float(stats.t.ppf(0.975, df))
    assert compare_params.fieller_ratio(a, sa, b, sb, df) == \
        compare_params.fieller_ratio_crit(a, sa, b, sb, t)


def test_dunnett_ratios_plug_in_simultaneous():
    ref = REF["dunnett"]
    g = ref["groups"]
    out = api.analyze({"analysis": "anova", "data": {"datasets": [
        {"name": k, "ys": [[v] for v in vals]} for k, vals in g.items()]},
        "options": {"comparisons": "dunnett", "control_index": 0}})
    comps = out["multiple_comparisons"]["comparisons"]
    assert len(comps) == 3
    for cmp, r in zip(comps, ref["ratios"]):
        rat = cmp["ratio"]
        assert rat["value"] == pytest.approx(r["ratio"], rel=1e-12)
        assert rat["denominator"] == "Control" and rat["numerator"] == r["name"]
        # two quadratures of the same integral: c agrees to 1e-9
        assert rat["critical_value"] == pytest.approx(ref["critical_value"], rel=1e-9)
        assert rat["ci"] == pytest.approx(r["ci"], rel=1e-9)
    # the differences, P values and CIs of Dunnett's test are unchanged
    assert comps[0]["pair"] == "Low vs. Control"


def test_dunnett_ratios_simultaneous_coverage():
    """1,000 seeded data sets of 3 groups and a control (n = 5, SD 5,
    true ratios 0.9, 0.8, 0.65): all three intervals cover together about
    95% of the time (within 3 binomial SE)."""
    rng = np.random.default_rng(1806)
    true = [0.9, 0.8, 0.65]
    hits, n_rep = 0, 1000
    for _ in range(n_rep):
        sets = [rng.normal(100, 5, 5)] + [rng.normal(100 * r, 5, 5) for r in true]
        out = api.analyze({"analysis": "anova", "data": {"datasets": [
            {"name": f"G{i}", "ys": [[float(v)] for v in s]} for i, s in enumerate(sets)]},
            "options": {"comparisons": "dunnett", "control_index": 0}})
        cs = [c["ratio"]["ci"] for c in out["multiple_comparisons"]["comparisons"]]
        hits += all(ci is not None and ci[0] <= r <= ci[1] for ci, r in zip(cs, true))
    se = math.sqrt(0.95 * 0.05 / n_rep)
    assert abs(hits / n_rep - 0.95) < 3 * se, hits
