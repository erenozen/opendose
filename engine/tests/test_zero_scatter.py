"""Tests with no scatter: every replicate of a group (or a cell) equal.

A t or F statistic divides by the scatter within groups; with none it is
undefined. These cases used to stop with "float division by zero"; each
now gives one sentence that says why and what to check, and the cases
with scatter in at least one group still run (checked against scipy).
"""

import math

import pytest
from scipy import stats

from opendose import api


def _cols(*cols):
    return {"datasets": [{"name": f"G{i + 1}", "ys": [[v] for v in c]}
                         for i, c in enumerate(cols)]}


def _run(analysis, data, **options):
    return api.analyze({"analysis": analysis, "data": data,
                        "options": options})


FLAT_A, FLAT_B = [5.0, 5.0, 5.0], [7.0, 7.0, 7.0]


@pytest.mark.parametrize("options", [
    {"kind": "unpaired"},
    {"kind": "unpaired", "welch": True},
    {"kind": "unpaired", "log_scale": True},
    {"kind": "unpaired", "equivalence": {"lower": -1, "upper": 1}},
])
def test_unpaired_t_without_scatter_says_why(options):
    r = _run("ttest", _cols(FLAT_A, FLAT_B), **options)
    assert "traceback" in r  # an error result, not a crash
    assert r["error"].startswith("The t test is undefined: the values "
                                 "within each group are all the same (SD 0)")
    assert "entered as measured" in r["error"]
    assert "division" not in r["error"]


def test_equal_groups_without_scatter_say_why():
    r = _run("ttest", _cols(FLAT_A, FLAT_A), kind="unpaired")
    assert r["error"].startswith("The t test is undefined")


def test_identical_decimals_count_as_no_scatter():
    # 0.1 three times has a float variance of about 1e-34, not 0: still
    # no scatter, not a t of 1e16
    r = _run("ttest", _cols([0.1] * 3, [0.2] * 3), kind="unpaired")
    assert r["error"].startswith("The t test is undefined")


def test_summary_t_test_with_sd_zero_says_why():
    data = {"datasets": [{"name": "A", "ys": [[5, 0, 3]]},
                         {"name": "B", "ys": [[7, 0, 3]]}]}
    r = _run("ttest_summary", data)
    assert r["error"].startswith("The t test is undefined")


@pytest.mark.parametrize("welch", [False, True])
def test_one_group_without_scatter_still_tests(welch):
    a, b = FLAT_A, [6.0, 7.0, 8.0]
    r = _run("ttest", _cols(a, b), kind="unpaired", welch=welch)
    ref = stats.ttest_ind(a, b, equal_var=not welch)
    assert r["p_two_tailed"] == pytest.approx(ref.pvalue, rel=1e-12)
    assert r["t"] == pytest.approx(abs(ref.statistic), rel=1e-12)
    f = r["f_test_variances"]
    assert f["F"] is None and f["p"] is None
    assert f["note"] == "undefined: one group has SD 0"
    assert (f["dfn"], f["dfd"]) == (2, 2)


def test_scatter_in_both_groups_is_unchanged():
    a, b = [4.0, 5.0, 6.5], [6.0, 7.0, 8.0]
    r = _run("ttest", _cols(a, b), kind="unpaired")
    ref = stats.ttest_ind(a, b)
    assert r["p_two_tailed"] == pytest.approx(ref.pvalue, rel=1e-12)
    va, vb = stats.tvar(a), stats.tvar(b)
    f = r["f_test_variances"]
    assert f["F"] == pytest.approx(va / vb, rel=1e-12)
    assert f["p"] == pytest.approx(2 * stats.f.sf(va / vb, 2, 2), rel=1e-12)
    assert math.isfinite(f["F"])


def _grouped(rows):
    """rows[i][j] = replicates of row i, data set j (a grouped table)."""
    return {"datasets": [{"name": f"B{j + 1}",
                          "ys": [rows[i][j] for i in range(len(rows))]}
                         for j in range(len(rows[0]))]}


FLAT_CELLS = [[[1.0, 1.0, 1.0], [3.0, 3.0, 3.0]],
              [[2.0, 2.0, 2.0], [5.0, 5.0, 5.0]]]


@pytest.mark.parametrize("rows", [
    FLAT_CELLS,
    [[[4.0] * 3, [4.0] * 3], [[4.0] * 3, [4.0] * 3]],          # all equal
    [[[0.1, 0.1], [0.3, 0.3], [0.7, 0.7]],
     [[0.2, 0.2], [0.5, 0.5], [1.1, 1.1]]],                    # decimals
])
@pytest.mark.parametrize("options", [
    {}, {"comparisons": "tukey"},
    {"comparisons": "sidak", "direction": "rows_within_columns"},
])
def test_two_way_anova_without_scatter_says_why(rows, options):
    r = _run("two_way_anova", _grouped(rows), **options)
    assert r["error"].startswith(
        "Two-way ANOVA is undefined: every value equals its fitted value")
    assert "entered as measured" in r["error"]


def test_two_way_summary_with_sd_zero_says_why():
    data = {"datasets": [{"name": "B1", "ys": [[1, 0, 3], [2, 0, 3]]},
                         {"name": "B2", "ys": [[3, 0, 3], [5, 0, 3]]}]}
    r = _run("two_way_anova_summary", data)
    assert r["error"].startswith("Two-way ANOVA is undefined")


def test_additive_model_with_interaction_left_still_tests():
    # no scatter within cells, but the main-effects model leaves the
    # interaction (SS 0.75 on 9 df) as residual, so F is defined:
    # F rows = 6.75 / (0.75 / 9) = 81
    r = _run("two_way_anova", _grouped(FLAT_CELLS), model="additive")
    assert r["sources"]["Rows"]["F"] == pytest.approx(81.0, rel=1e-9)


def test_two_way_with_scatter_in_one_cell_still_tests():
    rows = [[[1.0, 1.0, 1.0], [3.0, 3.0, 3.0]],
            [[2.0, 2.0, 2.0], [5.0, 5.5, 4.5]]]
    r = _run("two_way_anova", _grouped(rows))
    assert r["sources"]["residual"]["ss"] == pytest.approx(0.5, rel=1e-9)
    assert r["sources"]["interaction"]["F"] == pytest.approx(
        0.75 / (0.5 / 8), rel=1e-9)


@pytest.mark.parametrize("analysis,data", [
    ("anova", _cols(FLAT_A, FLAT_B, [9.0, 9.0, 9.0])),
    ("anova_summary", {"datasets": [{"name": n, "ys": [[m, 0, 3]]}
                                    for n, m in (("A", 5), ("B", 7),
                                                 ("C", 9))]}),
])
def test_one_way_anova_without_scatter_says_why(analysis, data):
    r = _run(analysis, data)
    assert r["error"].startswith(
        "One-way ANOVA is undefined: the values within each group are all "
        "the same (SD 0)")


def test_one_way_anova_with_one_flat_group_still_tests():
    groups = [FLAT_A, [6.0, 7.0, 8.0], [9.0, 9.5, 10.0]]
    r = _run("anova", _cols(*groups))
    ref = stats.f_oneway(*groups)
    assert r["table"]["F"] == pytest.approx(ref.statistic, rel=1e-12)
    assert r["table"]["p"] == pytest.approx(ref.pvalue, rel=1e-12)
