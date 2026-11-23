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
