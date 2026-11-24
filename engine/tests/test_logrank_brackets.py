"""Log-rank brackets on a Kaplan-Meier graph (FEATURE-PLAN P-111) draw
the adjusted P values of the survival analysis' pairwise log-rank tests;
the graph adds no number. This pins them for the 3-group table of the
e2e step (Holm, the acceptance test) against engine/tests/reference/
logrank_brackets.py (the Peto log-rank written out with numpy and scipy,
cross-checked by statsmodels' survdiff; R is not installed)."""

import json
from pathlib import Path

import pytest

from opendose import api

HERE = Path(__file__).resolve().parent
REF = json.loads((HERE / "reference" / "logrank_brackets.json").read_text())


def _data():
    return {"datasets": [{"name": name, "ys": [[t, e] for t, e in zip(g["time"], g["event"])]}
                         for name, g in REF["groups"].items()]}


def _pairwise(correction="holm", statistic="peto"):
    return api.analyze({"analysis": "survival_pairwise", "data": _data(),
                        "options": {"family": "all", "correction": correction,
                                    "statistic": statistic}})


def test_pairwise_logrank_holm_matches_the_reference():
    r = _pairwise()
    assert r["correction"] == "holm"
    got = {(c["a"], c["b"]): c for c in r["comparisons"]}
    for ref in REF["comparisons"]:
        c = got[(ref["a"], ref["b"])]
        assert c["chi2_peto"] == pytest.approx(ref["chi2_peto"], rel=1e-9)
        assert c["p_unadjusted"] == pytest.approx(ref["p_peto"], rel=1e-9)
        assert c["p_adjusted"] == pytest.approx(ref["p_holm"], rel=1e-9)
        # the variance form agrees with statsmodels' survdiff
        assert c["chi2_variance"] == pytest.approx(ref["chi2_variance"], rel=1e-9)


def test_bracket_labels_of_the_e2e_step():
    """GraphPad stars the brackets show: ns, *, ns (Holm)."""
    def stars(p):
        return ("****" if p <= 1e-4 else "***" if p <= 1e-3 else "**" if p <= 1e-2
                else "*" if p <= 0.05 else "ns")
    assert [stars(c["p_holm"]) for c in REF["comparisons"]] == ["ns", "*", "ns"]
    assert [round(c["p_holm"], 4) for c in REF["comparisons"]] == [0.1753, 0.0209, 0.0687]
