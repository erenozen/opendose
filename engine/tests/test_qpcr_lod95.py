"""qPCR LoD95 from a hit-rate dilution series (FEATURE-PLAN P-29).

Pinned to engine/tests/reference/lod95_probit.py: statsmodels
GLM(Binomial(probit)) on log10 quantity (the oracle for R's
glm(binomial(probit))), with Fieller's interval solved by hand from the
statsmodels covariance.
"""

import json
from pathlib import Path

import pytest

from opendose import api, assay_qpcr as q

REF = json.loads((Path(__file__).parent / "reference"
                  / "lod95_probit.json").read_text())
D = REF["data"]


def _series(quantity=D["quantity"], n=D["n"], detected=D["detected"], scale=1.0):
    pts = []
    for qv, nn, d in zip(quantity, n, detected):
        pts += [{"quantity": qv * scale, "cq": 33.5}] * d
        pts += [{"quantity": qv * scale, "cq": "Undetermined"}] * (nn - d)
    return pts


def test_lod95_matches_statsmodels_probit_and_hand_fieller():
    r = q.lod95_from_series(_series())
    assert r["status"] == "ok"
    assert r["fit"]["intercept"] == pytest.approx(REF["intercept"], rel=1e-6)
    assert r["fit"]["slope"] == pytest.approx(REF["slope"], rel=1e-6)
    assert r["fit"]["heterogeneity_applied"] is False
    assert r["lod95"] == pytest.approx(REF["lod95"], rel=1e-6)
    assert r["ci"] == pytest.approx(REF["ci_fieller"], rel=1e-5)
    assert r["ci_delta"] == pytest.approx(REF["ci_delta"], rel=1e-5)
    assert round(r["lod95"], 2) == 26.17
    assert [round(v, 2) for v in r["ci"]] == [15.0, 76.6]
    assert [x["detected"] for x in r["levels"]] == list(reversed(D["detected"]))


def test_api_lod95_only_for_hit_rate_series():
    recs = [{"sample": s, "group": g, "target": t, "cq": c}
            for s, g in (("A1", "A"), ("A2", "A"), ("B1", "B"), ("B2", "B"))
            for t, c in (("GAPDH", 18 + 0.1 * len(s)), ("IL6", 25 + (0.3 if s[1] == "1" else 0)))]
    efficiency = [{"quantity": qv, "cq": 20 + i} for i, qv in
                  enumerate([1000, 100, 10, 1]) for _ in range(3)]
    res = api.analyze({"analysis": "qpcr",
                       "data": {"records": recs,
                                "dilution_series": {"IL6": _series(),
                                                    "GAPDH": efficiency}},
                       "options": {"reference_genes": ["GAPDH"]}})
    assert list(res["lod95"]) == ["IL6"]
    assert res["lod95"]["IL6"]["lod95"] == pytest.approx(REF["lod95"], rel=1e-6)
    plain = api.analyze({"analysis": "qpcr", "data": {"records": recs},
                         "options": {"reference_genes": ["GAPDH"]}})
    assert "lod95" not in plain


def test_quantity_units_scale_the_lod():
    r = q.lod95_from_series(_series(scale=1e-6))
    assert r["lod95"] == pytest.approx(REF["lod95"] * 1e-6, rel=1e-6)
    assert r["ci"] == pytest.approx([v * 1e-6 for v in REF["ci_fieller"]], rel=1e-5)


def test_order_of_wells_does_not_matter():
    a = q.lod95_from_series(_series())
    b = q.lod95_from_series(list(reversed(_series())))
    assert a["lod95"] == pytest.approx(b["lod95"], rel=1e-12)


@pytest.mark.parametrize("detected,status,words", [
    ([12] * 8, "no_partial_level", "below the lowest quantity tested (1)"),
    ([0] * 8, "no_partial_level", "above the highest quantity tested (1000)"),
    ([12, 12, 12, 12, 0, 0, 0, 0], "no_partial_level", "between 10 and 20"),
])
def test_no_partial_level_perfect_separation(detected, status, words):
    r = q.lod95_from_series(_series(detected=detected))
    assert r["status"] == status and r["lod95"] is None
    assert words in r["note"]


def test_too_few_levels_and_empty():
    r = q.lod95_from_series(_series(quantity=[10, 1], n=[4, 4], detected=[3, 1]))
    assert r["status"] == "too_few_levels" and "2 given" in r["note"]
    r = q.lod95_from_series([])
    assert r["status"] == "too_few_levels" and "0 given" in r["note"]


def test_falling_hit_rate_is_refused():
    r = q.lod95_from_series(_series(detected=list(reversed(D["detected"]))))
    assert r["lod95"] is None and r["status"] == "not_increasing"


def test_lod_beyond_the_series_is_flagged():
    # only the top of the curve tested: the 95% point lies above it
    r = q.lod95_from_series(_series(quantity=[4, 2, 1], n=[12] * 3,
                                    detected=[8, 5, 2]))
    assert r["status"] == "extrapolated" and r["lod95"] > 4
    assert "outside the quantities tested (1 to 4)" in r["note"]
