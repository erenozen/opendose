"""Pairwise comparisons of rows after an r x c test (FEATURE-PLAN P-14),
against scipy per pair and statsmodels multipletests
(engine/tests/reference/pairwise_proportions.py)."""

import json
from pathlib import Path

import pytest

from opendose import api, contingency

REF = json.loads((Path(__file__).parent / "reference"
                  / "pairwise_proportions.json").read_text())


def run(case, method="holm", test="auto"):
    return api.analyze({"analysis": "contingency",
                        "data": {"table": case["table"]},
                        "options": {"pairwise": {"method": method,
                                                 "test": test},
                                    "row_names": case["rows"]}})


@pytest.mark.parametrize("name", ["acceptance", "four", "three_by_three"])
@pytest.mark.parametrize("method", ["holm", "bh", "bonferroni"])
def test_against_scipy_and_multipletests(name, method):
    ref = REF[name]
    pw = run(ref, method)["pairwise_rows"]
    comps = pw["comparisons"]
    assert [c["pair"] for c in comps] == ref["pairs"]
    assert [c["test"] for c in comps] == ref["tests"]
    for c, raw, adj in zip(comps, ref["p_raw"], ref[f"p_{method}"]):
        assert c["p_unadjusted"] == pytest.approx(raw, rel=1e-9)
        assert c["p_adjusted"] == pytest.approx(adj, rel=1e-9)
        assert c["family_size"] == len(ref["pairs"])
    assert pw["family"]["size"] == len(ref["pairs"])


def test_acceptance_verdicts():
    """WT 18/20, Het 15/20, KO 5/20: WT vs KO and Het vs KO stay below
    0.05 after Holm, WT vs Het does not; 3 comparisons, Holm."""
    pw = run(REF["acceptance"])["pairwise_rows"]
    sig = {c["pair"]: c["significant"] for c in pw["comparisons"]}
    assert sig == {"WT vs. Het": False, "WT vs. KO": True, "Het vs. KO": True}
    assert pw["family"]["label"] == "Holm, 3 comparisons (all pairs of 3 rows)"
    wt_het = pw["comparisons"][0]
    assert wt_het["test"] == "fisher"
    assert wt_het["reason"] == "an expected count below 5"
    assert pw["comparisons"][1]["yates"] is True


def test_forced_tests_and_invariance():
    ref = REF["acceptance"]
    fisher = run(ref, test="fisher")["pairwise_rows"]
    assert {c["test"] for c in fisher["comparisons"]} == {"fisher"}
    assert all(c["reason"] == "chosen" for c in fisher["comparisons"])
    chi = run(ref, test="chi_square")["pairwise_rows"]
    assert {c["test"] for c in chi["comparisons"]} == {"chi_square"}
    # swapping the outcome columns changes no P value
    swapped = {"rows": ref["rows"], "table": [r[::-1] for r in ref["table"]]}
    a = run(ref)["pairwise_rows"]["comparisons"]
    b = run(swapped)["pairwise_rows"]["comparisons"]
    assert [x["p_adjusted"] for x in a] == pytest.approx(
        [x["p_adjusted"] for x in b], rel=1e-12)
    # reversing the rows: the same pairs, the same P values
    rev = {"rows": ref["rows"][::-1], "table": ref["table"][::-1]}
    by = {frozenset(c["pair"].split(" vs. ")): c["p_adjusted"]
          for c in run(rev)["pairwise_rows"]["comparisons"]}
    for c in a:
        assert by[frozenset(c["pair"].split(" vs. "))] == pytest.approx(
            c["p_adjusted"], rel=1e-12)


def test_edge_cases():
    # two rows: no pairwise block (the main test is the comparison)
    r = api.analyze({"analysis": "contingency",
                     "data": {"table": [[5, 5], [3, 7]]},
                     "options": {"pairwise": {"method": "holm"}}})
    assert "pairwise_rows" not in r
    # a row of zeros: that pair is not tested and the family shrinks
    pw = contingency.pairwise_rows([[10, 2], [0, 0], [3, 9]],
                                   row_names=["A", "Empty", "C"])
    untested = [c for c in pw["comparisons"] if c["p_unadjusted"] is None]
    assert len(untested) == 2 and all("no test" in c["note"] for c in untested)
    assert pw["family"]["size"] == 1
    # every count in one outcome for a pair: not testable either
    pw = contingency.pairwise_rows([[10, 0], [8, 0], [3, 9]])
    assert pw["comparisons"][0]["p_unadjusted"] is None
    assert pw["comparisons"][1]["p_unadjusted"] is not None
    # all rows identical: P = 1 throughout
    pw = contingency.pairwise_rows([[10, 10]] * 3)
    assert all(c["p_adjusted"] == pytest.approx(1.0)
               for c in pw["comparisons"])
    # large counts (1e6 scale) stay finite
    pw = contingency.pairwise_rows([[500000, 500000], [500500, 499500],
                                    [400000, 600000]])
    assert all(0 <= c["p_adjusted"] <= 1 for c in pw["comparisons"])
    with pytest.raises(ValueError):
        contingency.pairwise_rows([[1, 2], [3, 4]])
    with pytest.raises(ValueError):
        contingency.pairwise_rows([[1, 2], [3, 4], [1.5, 2]])
    with pytest.raises(ValueError):
        contingency.pairwise_rows([[1, 2], [3, 4], [5, 6]], method="tukey")
