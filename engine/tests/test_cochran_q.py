"""P-45: Cochran's Q for a matched yes/no outcome, with pairwise McNemar
tests (exact binomial P) adjusted by Holm.

Reference values: engine/tests/reference/cochran_q.py (statsmodels
cochrans_q and mcnemar(exact=True), pingouin cochran, statsmodels
multipletests holm). R is not installed.
"""

import json
import os

import numpy as np
import pytest

from opendose import api, trend

REF = json.load(open(os.path.join(os.path.dirname(__file__), "reference",
                                  "cochran_q.json")))


def _payload(rows, names):
    return {"datasets": [{"name": n, "ys": [[r[j]] for r in rows]}
                         for j, n in enumerate(names)]}


def _run(rows, names):
    return api.analyze({"analysis": "cochrans_q", "options": {},
                        "data": _payload(rows, names)})


@pytest.mark.parametrize("key", ["stains", "pingouin_cochran"])
def test_q_and_pairs_match_statsmodels(key):
    ref = REF[key]
    r = _run(ref["data"], ref["names"])
    assert r["Q"] == pytest.approx(ref["Q"], rel=1e-12)
    assert r["Q"] == pytest.approx(ref["Q_pingouin"], rel=1e-12)
    assert r["df"] == ref["df"] == 2
    assert r["p"] == pytest.approx(ref["p"], rel=1e-10)
    cmp = r["comparisons"]
    assert cmp["family"]["size"] == 3
    assert "Holm" in cmp["family"]["label"]
    for got, want in zip(cmp["comparisons"], ref["pairs"]):
        assert got["pair"] == want["pair"]
        assert got["discordant"] == want["discordant"]
        assert got["p_unadjusted"] == pytest.approx(want["p_unadjusted"],
                                                    rel=1e-12)
        assert got["p_adjusted"] == pytest.approx(want["p_adjusted"],
                                                  rel=1e-12)


def test_acceptance_twelve_subjects_three_stains():
    ref = REF["stains"]
    r = _run(ref["data"], ref["names"])
    assert r["n_subjects"] == 12
    assert r["successes"] == [10, 8, 2]
    # subjects 3, 4 and 8 answer the same under every stain
    assert r["n_informative"] == 9


def test_order_of_conditions_does_not_change_q():
    ref = REF["stains"]
    rows = [[r[2], r[0], r[1]] for r in ref["data"]]
    r = _run(rows, ["C", "A", "B"])
    assert r["Q"] == pytest.approx(ref["Q"], rel=1e-12)


def test_uninformative_subjects_do_not_change_q():
    ref = REF["stains"]
    r = _run(ref["data"] + [[1, 1, 1], [0, 0, 0]], ref["names"])
    assert r["Q"] == pytest.approx(ref["Q"], rel=1e-12)
    assert r["n_subjects"] == 14 and r["n_informative"] == 9


def test_missing_values_drop_the_subject_with_a_warning():
    ref = REF["stains"]
    rows = [list(x) for x in ref["data"]] + [[1, None, 0]]
    r = _run(rows, ref["names"])
    assert r["Q"] == pytest.approx(ref["Q"], rel=1e-12)
    assert r["incomplete_subjects"] == [12]
    assert "row 13" in r["warnings"][0]


@pytest.mark.parametrize("rows,msg", [
    ([[1, 0, 2], [0, 1, 1]], "row 1 of Stain C holds 2"),
    ([[1, 0, 0.5], [0, 1, 1]], "row 1 of Stain C holds 0.5"),
    ([[1, 1, 1], [0, 0, 0]], "every subject gave the same answer"),
    ([[1, 0, 1]], "at least 2 subjects"),
])
def test_layout_and_degenerate_tables_say_why(rows, msg):
    r = _run(rows, ["Stain A", "Stain B", "Stain C"])
    assert msg in r["error"]
    assert "division" not in r["error"]


def test_two_conditions_points_to_mcnemar():
    with pytest.raises(ValueError, match="use McNemar's test"):
        trend.cochrans_q([[1, 0], [0, 1]], ["A", "B"])


def test_no_discordant_pair_gives_p_one():
    rows = [[1, 1, 0], [0, 0, 1], [1, 1, 0], [1, 1, 1]]
    r = _run(rows, ["A", "B", "C"])
    ab = r["comparisons"]["comparisons"][0]
    assert ab["discordant"] == [0, 0] and ab["p_unadjusted"] == 1.0


def test_large_n_q_is_finite_and_matches_formula():
    rng = np.random.default_rng(5)
    X = (rng.random((500, 4)) < np.array([0.3, 0.35, 0.4, 0.5])).astype(int)
    r = trend.cochrans_q([list(c) for c in X.T])
    C, R, N, k = X.sum(0), X.sum(1), X.sum(), 4
    q = (k - 1) * (k * (C ** 2).sum() - N ** 2) / (k * N - (R ** 2).sum())
    assert r["Q"] == pytest.approx(q, rel=1e-12)
    assert r["df"] == 3
