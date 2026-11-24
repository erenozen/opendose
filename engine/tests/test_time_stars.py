"""Stars at each time point (FEATURE-PLAN P-105) draw the P values of the
two-way ANOVA's Sidak comparisons within each row; the graph adds no
number of its own. This pins those P values for the tumour-growth table
of the e2e step against engine/tests/reference/time_stars.py
(statsmodels OLS with the interaction, pooled residual, Sidak over the 4
comparisons)."""

import json
from pathlib import Path

import pytest

from opendose import api

HERE = Path(__file__).resolve().parent
REF = json.loads((HERE / "reference" / "time_stars.json").read_text())


def _run():
    data = {"datasets": [
        {"name": "Vehicle", "ys": [[float(v) for v in r] for r in REF["vehicle"]]},
        {"name": "Drug", "ys": [[float(v) for v in r] for r in REF["drug"]]}]}
    return api.analyze({"analysis": "two_way_anova", "data": data, "options": {
        "row_factor": "Day", "col_factor": "Treatment", "comparisons": "sidak",
        "direction": "columns_within_rows", "row_names": REF["days"]}})


def test_sidak_within_rows_matches_statsmodels():
    r = _run()
    mc = r["multiple_comparisons"]
    assert r["sources"]["residual"]["ms"] == pytest.approx(REF["ms_residual"], rel=1e-10)
    assert r["sources"]["residual"]["df"] == REF["df_residual"]
    by_day = {c["family"]: c for c in mc["comparisons"]}
    for ref in REF["comparisons"]:
        c = by_day[ref["day"]]
        assert c["pair"] == "Vehicle vs. Drug"
        assert c["family_size"] == 4
        assert c["p_unadjusted"] == pytest.approx(ref["p"], rel=1e-8, abs=1e-300)
        # Sidak for 4: 1 - (1 - p)^4; below 1e-12 the engine's subtraction
        # rounds to 0, which still reads as P < 0.0001 (four stars)
        if ref["p_sidak"] > 1e-12:
            assert c["p_adjusted"] == pytest.approx(ref["p_sidak"], rel=1e-8)
        else:
            assert c["p_adjusted"] < 1e-12


def test_star_of_each_day():
    """The GraphPad stars the e2e step reads: ns, *, ***, ****."""
    def stars(p):
        return ("****" if p <= 1e-4 else "***" if p <= 1e-3 else "**" if p <= 1e-2
                else "*" if p <= 0.05 else "ns")
    by_day = {c["family"]: c for c in _run()["multiple_comparisons"]["comparisons"]}
    assert [stars(by_day[d]["p_adjusted"]) for d in REF["days"]] == \
        [c["stars"] for c in REF["comparisons"]] == ["ns", "*", "***", "****"]
