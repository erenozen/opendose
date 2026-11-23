"""P-27: repeated-measures correlation (Bakdash & Marusich 2017).

Reference values: engine/tests/reference/rm_corr.py (pingouin 0.7
rm_corr and a statsmodels ANCOVA on the Bland & Altman 1995 pH / PaCO2
data; the published r_rm = -0.507, df = 38, 95% CI -0.71 to -0.23).
R is not installed.
"""

import json
import os

import numpy as np
import pytest
from scipy import stats

from opendose import api, correlation

REF = json.load(open(os.path.join(os.path.dirname(__file__), "reference",
                                  "rm_corr.json")))


def _payload(x, y):
    return {"datasets": [{"name": "pH", "ys": [[v] for v in x]},
                         {"name": "PaCO2", "ys": [[v] for v in y]}]}


def _run(x, y, labels, **opt):
    return api.analyze({"analysis": "correlation", "data": _payload(x, y),
                        "options": {"dataset_a": 0, "dataset_b": 1,
                                    "subject_labels": labels, **opt}})


def test_bland_altman_matches_pingouin_and_the_ancova():
    r = _run(REF["x"], REF["y"], [str(s) for s in REF["subject"]])
    assert r["method"] == "rm_corr"
    assert r["r"] == pytest.approx(REF["r"], rel=1e-9)
    assert r["r"] == pytest.approx(REF["r_ancova"], rel=1e-9)
    assert r["df"] == REF["df"] == REF["df_ancova"] == 38
    assert r["p_two_tailed"] == pytest.approx(REF["p"], rel=1e-8)
    assert r["slope"] == pytest.approx(REF["slope"], rel=1e-9)
    # pingouin and the paper give the CI to 2 decimals
    assert r["ci_r"] == pytest.approx(REF["ci"], abs=0.005)
    assert r["ci_r"] == pytest.approx(REF["published"]["ci"], abs=0.005)
    assert round(r["r"], 3) == REF["published"]["r"]
    assert (r["n"], r["n_subjects"]) == (47, 8)
    assert "within subjects" in r["scope"]


def test_ignoring_subjects_gives_a_different_answer():
    plain = api.analyze({"analysis": "correlation",
                         "data": _payload(REF["x"], REF["y"]),
                         "options": {"dataset_a": 0, "dataset_b": 1}})
    assert plain["df"] == 45 and plain["r"] != pytest.approx(REF["r"],
                                                             abs=0.01)


def test_subject_labels_are_text_and_order_free():
    x, y, s = REF["x"], REF["y"], REF["subject"]
    labels = [f"Donor {chr(64 + v)}" for v in s]
    perm = np.random.default_rng(1).permutation(len(x))
    r = _run([x[i] for i in perm], [y[i] for i in perm],
             [labels[i] for i in perm])
    assert r["r"] == pytest.approx(REF["r"], rel=1e-9)


def test_units_and_swap_x_y():
    x, y, s = REF["x"], REF["y"], [str(v) for v in REF["subject"]]
    a = correlation.rm_corr(x, y, s)
    b = correlation.rm_corr([v * 1e6 for v in x], [v * 1e-9 + 3 for v in y],
                            s)
    c = correlation.rm_corr(y, x, s)
    assert b["r"] == pytest.approx(a["r"], rel=1e-9)
    assert c["r"] == pytest.approx(a["r"], rel=1e-12)
    assert c["p_two_tailed"] == pytest.approx(a["p_two_tailed"], rel=1e-9)


def test_missing_values_and_single_pair_subjects_are_left_out():
    x, y, s = list(REF["x"]), list(REF["y"]), [str(v) for v in REF["subject"]]
    r = _run(x + [7.3, None], y + [40.0, 41.0], s + ["99", "1"])
    assert r["r"] == pytest.approx(REF["r"], rel=1e-9)
    assert r["subjects_single_pair"] == ["99"]
    assert any("single XY pair" in w for w in r["warnings"])
    assert any("1 XY pair with a missing value" in w for w in r["warnings"])


def test_blank_subject_cells_are_left_out():
    x, y, s = REF["x"], REF["y"], [str(v) for v in REF["subject"]]
    r = _run(x + [7.0], y + [50.0], s + [""])
    assert r["r"] == pytest.approx(REF["r"], rel=1e-9)
    assert r["pairs_left_out"] == 1


@pytest.mark.parametrize("x,y,s,msg", [
    ([1.0, 2.0, 3.0], [2.0, 1.0, 4.0], ["a", "a", "a"], "at least 2 subjects"),
    ([1.0, 1.0, 2.0, 2.0, 3.0, 3.0], [1.0, 2.0, 3.0, 5.0, 2.0, 1.0],
     ["a", "a", "b", "b", "c", "c"], "does not vary within any subject"),
])
def test_edge_cases_say_why(x, y, s, msg):
    r = _run(x, y, s)
    assert msg in r["error"]


def test_perfect_within_subject_line():
    # each subject on its own line of slope 2: r = 1, P = 0
    x = [1.0, 2.0, 3.0, 1.0, 2.0, 3.0]
    y = [5.0, 7.0, 9.0, 0.0, 2.0, 4.0]
    r = correlation.rm_corr(x, y, ["a"] * 3 + ["b"] * 3)
    assert r["r"] == 1.0 and r["p_two_tailed"] == 0.0 and r["ci_r"] is None
    assert r["slope"] == pytest.approx(2.0)


def test_t_and_p_follow_df():
    r = correlation.rm_corr(REF["x"], REF["y"],
                            [str(v) for v in REF["subject"]])
    t = r["r"] * np.sqrt(38 / (1 - r["r"] ** 2))
    assert r["p_two_tailed"] == pytest.approx(2 * stats.t.sf(abs(t), 38),
                                              rel=1e-12)
