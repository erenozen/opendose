"""Flow event-count and gated-percentage calculator (FEATURE-PLAN P-50).

Pinned to engine/tests/reference/flow_events.py: Roederer (2008,
Cytometry A 73:384) worked in exact fractions, and the Wilson interval
from statsmodels proportion_confint and scipy binomtest (which agree).
"""

import json
from pathlib import Path

import pytest

from opendose import api

REF = json.loads((Path(__file__).parent / "reference"
                  / "flow_events.json").read_text())


def run(data, **options):
    return api.analyze({"analysis": "flow_events", "data": data,
                        "options": options})


def test_acceptance_100_positive_events_100000_in_all():
    r = run({"target_cv": 10, "frequency": 0.1})
    assert r["plan"]["positive_events"] == 100
    assert r["plan"]["total_events"] == 100000
    assert r["plan"]["achieved_cv_pct"] == pytest.approx(10.0)
    assert r["observed"] is None


@pytest.mark.parametrize("p", REF["plans"], ids=lambda p: f"{p['target_cv_pct']}%")
def test_plans_match_exact_fractions(p):
    r = run({"target_cv": p["target_cv_pct"], "frequency": p["frequency_pct"]})
    assert r["plan"]["positive_events"] == p["positive_events"]
    assert r["plan"]["total_events"] == p["total_events"]


def test_acceptance_120_of_50000_wilson():
    ref = REF["observed"][0]
    o = run({"positive": 120, "total": 50000})["observed"]
    assert o["percent"] == pytest.approx(0.24, rel=1e-12)
    assert o["ci_pct"] == pytest.approx(ref["ci_pct"], rel=1e-10)
    assert [round(v, 4) for v in o["ci_pct"]] == [0.2008, 0.2869]
    assert o["count_cv_pct"] == pytest.approx(ref["count_cv_pct"], rel=1e-12)


@pytest.mark.parametrize("i", [1, 2, 3])
def test_edges_none_all_and_another_level(i):
    ref = REF["observed"][i]
    level = 0.99 if i == 3 else 0.95
    o = run({"positive": ref["positive"], "total": ref["total"]},
            ci_level=level)["observed"]
    assert o["ci_pct"] == pytest.approx(ref["ci_pct"], abs=1e-10)
    if ref["count_cv_pct"] is None:
        assert o["count_cv_pct"] is None          # 0 events: no CV
        assert o["ci_pct"][0] == 0.0
    if ref["positive"] == ref["total"]:
        assert o["ci_pct"][1] == 100.0


@pytest.mark.parametrize("data,part,words", [
    ({"target_cv": 0, "frequency": 1}, "plan", "target CV above 0%"),
    ({"target_cv": 100, "frequency": 1}, "plan", "below 100%"),
    ({"target_cv": 10}, "plan", "expected frequency"),
    ({"target_cv": 10, "frequency": 0}, "plan", "expected frequency"),
    ({"target_cv": 10, "frequency": 150}, "plan", "at most 100%"),
    ({"positive": 5}, "observed", "parent gate"),
    ({"positive": 5, "total": 0}, "observed", "parent gate"),
    ({"positive": 5, "total": 2.5}, "observed", "parent gate"),
    ({"positive": 6, "total": 5}, "observed", "from 0 to the parent"),
    ({"positive": -1, "total": 5}, "observed", "from 0 to the parent"),
    ({"positive": "x", "total": 5}, "observed", "from 0 to the parent"),
])
def test_invalid_inputs_say_what_to_enter(data, part, words):
    r = run(data)
    assert words in r[part]["error"]


def test_frequency_scale_and_extreme_counts():
    # halving the frequency doubles the events; the positive count stays
    a = run({"target_cv": 10, "frequency": 0.2})["plan"]
    b = run({"target_cv": 10, "frequency": 0.1})["plan"]
    assert a["positive_events"] == b["positive_events"] == 100
    assert b["total_events"] == 2 * a["total_events"]
    # 1e12 events: the Wilson interval of 1e6 positives stays tight
    o = run({"positive": 1e6, "total": 1e12})["observed"]
    assert o["percent"] == pytest.approx(1e-4)
    assert o["ci_pct"][0] < 1e-4 < o["ci_pct"][1]
