"""Matched designs with no scatter: paired and ratio paired t tests, RM
one-way and RM two-way ANOVA, and the qPCR statistics that use them.

With every pair (subject) shifted by the same amount the t or F
statistic divides by zero. These used to report a limit (t or F
infinite, P = 0), or F near 1e15 when identical decimals left rounding
noise; like the unpaired and two-way cases (test_zero_scatter.py) they
now say the statistic is undefined, and data with scatter still run
(checked against scipy and pingouin).
"""

import math
import warnings

import numpy as np
import pingouin as pg
import pandas as pd
import pytest
from scipy import stats

from opendose import api, assay_qpcr, repeated, ttests


def _cols(*cols):
    return {"datasets": [{"name": f"G{i + 1}", "ys": [[v] for v in c]}
                         for i, c in enumerate(cols)]}


def _run(analysis, data, **options):
    return api.analyze({"analysis": analysis, "data": data,
                        "options": options})


A = [5.0, 6.0, 9.0, 7.5]


@pytest.mark.parametrize("b", [
    [v + 2 for v in A],                  # every difference 2
    [v + 0.1 for v in [0.2, 0.7, 1.3]],  # decimals: rounding noise only
])
def test_paired_t_without_scatter_says_why(b):
    a = A if len(b) == len(A) else [0.2, 0.7, 1.3]
    r = _run("ttest", _cols(a, b), kind="paired")
    assert r["error"].startswith(
        "The paired t test is undefined: every pair has the same difference")
    assert "traceback" in r and "inf" not in r["error"]


def test_ratio_paired_t_without_scatter_says_why():
    r = _run("ttest", _cols(A, [2 * v for v in A]), kind="ratio_paired")
    assert r["error"].startswith("The ratio paired t test is undefined: "
                                 "every pair has the same ratio")


def test_paired_t_with_scatter_matches_scipy():
    b = [7.0, 8.5, 10.0, 9.0]
    r = ttests.paired_t(A, b)
    ref = stats.ttest_rel(A, b)
    assert r["t"] == pytest.approx(abs(ref.statistic), rel=1e-12)
    assert r["p_two_tailed"] == pytest.approx(ref.pvalue, rel=1e-12)


@pytest.mark.parametrize("cols", [
    [[1.0, 2.0, 3.0], [2.0, 3.0, 4.0], [4.0, 5.0, 6.0]],        # additive
    [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6], [0.7, 0.8, 0.9]],        # decimals
    [[4.0, 4.0, 4.0]] * 3,                                       # all equal
])
def test_rm_one_way_without_scatter_says_why(cols):
    r = _run("rm_anova", _cols(*cols))
    assert r["error"].startswith(
        "Repeated-measures ANOVA is undefined: every subject's values "
        "differ by the same amounts")
    assert "residual is 0" in r["error"]


def test_rm_one_way_with_scatter_matches_pingouin():
    cols = [[1.0, 2.0, 3.0, 5.0], [2.5, 3.0, 4.6, 6.1], [4.0, 5.2, 6.1, 8.3]]
    r = repeated.rm_one_way_anova(cols)
    long = pd.DataFrame([{"s": s, "c": c, "y": cols[c][s]}
                         for c in range(3) for s in range(4)])
    ref = pg.rm_anova(long, dv="y", within="c", subject="s")
    assert r["table"]["F"] == pytest.approx(float(ref["F"].iloc[0]),
                                            rel=1e-10)


def _grouped(rows):
    return {"datasets": [{"name": f"B{j + 1}",
                          "ys": [rows[i][j] for i in range(len(rows))]}
                         for j in range(len(rows[0]))]}


# rows[i][j] = subject values of row i, column j
FLAT_BOTH = [[[1.0, 2.0, 3.0], [3.0, 4.0, 5.0]],
             [[2.0, 3.0, 4.0], [5.0, 6.0, 7.0]]]
NOISY_BOTH = [[[0.1, 0.2, 0.3], [0.3, 0.4, 0.5]],
              [[0.2, 0.3, 0.4], [0.5, 0.6, 0.7]],
              [[0.7, 0.8, 0.9], [1.1, 1.2, 1.3]]]


@pytest.mark.parametrize("design", ["both", "mixed"])
@pytest.mark.parametrize("rows", [FLAT_BOTH, NOISY_BOTH])
def test_rm_two_way_without_any_scatter_says_why(design, rows):
    r = _run("rm_two_way", _grouped(rows), design=design)
    if design == "mixed":
        # subjects differ (1, 2, 3 within each group): the column factor
        # is still tested; the row and interaction F are undefined
        assert "error" not in r, r.get("error")
        for key in ("row_factor", "interaction"):
            s = r["sources"][key]
            assert s["F"] is None and s["p"] is None
            assert "no scatter" in s["note"]
        assert math.isfinite(r["sources"]["column_factor"]["F"])
    else:
        assert r["error"].startswith(
            "Two-way repeated-measures ANOVA is undefined")


def test_noisy_decimals_no_longer_give_f_near_1e15():
    r = _run("rm_two_way", _grouped(NOISY_BOTH), design="mixed")
    for s in r["sources"].values():
        assert s.get("F") is None or s["F"] < 1e6


def test_rm_two_way_with_scatter_matches_pingouin():
    rows = [[[1.0, 2.2, 3.1], [3.4, 4.0, 5.9]],
            [[2.3, 3.0, 4.8], [5.1, 6.9, 7.2]]]
    r = _run("rm_two_way", _grouped(rows), design="both")
    long = pd.DataFrame([{"s": s, "a": i, "b": j, "y": rows[i][j][s]}
                         for i in range(2) for j in range(2)
                         for s in range(3)])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        ref = pg.rm_anova(long, dv="y", within=["a", "b"], subject="s")
    assert r["sources"]["row_factor"]["F"] == pytest.approx(
        float(ref["F"].iloc[0]), rel=1e-10)


# ------------------------------------------------------------------ qPCR

def _qpcr_records(groups, paired):
    out = []
    for g, dcqs in groups.items():
        for i, d in enumerate(dcqs):
            s = f"{g}{i}"
            extra = {"pair": f"E{i}"} if paired else {}
            out.append({"sample": s, "group": g, "target": "T",
                        "cq": 20 + d, **extra})
            out.append({"sample": s, "group": g, "target": "R",
                        "cq": 20.0, **extra})
    return out


@pytest.mark.parametrize("paired", [False, True])
@pytest.mark.parametrize("groups", [
    {"C": [5, 5, 5], "A": [3, 3, 3]},
    {"C": [5, 5, 5], "A": [3, 3, 3], "B": [4, 4, 4]},
    {"C": [5.1, 5.1, 5.1], "A": [3.3, 3.3, 3.3], "B": [4.7, 4.7, 4.7]},
])
def test_qpcr_identical_dcq_gives_a_note_not_a_test(paired, groups):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        r = assay_qpcr.qpcr_analysis(_qpcr_records(groups, paired),
                                     reference_genes=["R"], calibrator="C")
    st = r["per_target"][0]
    assert st["statistics"] is None
    assert "undefined" in st["statistics_note"]
    # zero SD is a valid summary: the fold changes are still reported
    folds = {g["group"]: g for g in st["groups"]}
    assert folds["A"]["sd_dcq"] == 0.0
    assert folds["A"]["fold_change"] == pytest.approx(2 ** 2, rel=1e-9) \
        if groups["A"][0] == 3 else True


def test_qpcr_through_the_api_has_no_raw_error():
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        r = api.analyze({"analysis": "qpcr", "data": {
            "records": _qpcr_records({"C": [5, 5, 5], "A": [3, 3, 3]}, True)},
            "options": {"reference_genes": ["R"], "calibrator": "C"}})
    assert "error" not in r
    note = r["per_target"][0]["statistics_note"]
    assert note.startswith("The paired t test is undefined")
    assert "division" not in note
