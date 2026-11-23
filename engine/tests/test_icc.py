"""P-44: reliability ICC, the six Shrout-Fleiss forms with McGraw-Wong
F-based CIs (opendose.icc, api "icc").

Reference values: engine/tests/reference/icc_reliability.py: the values
Shrout & Fleiss (1979, Psychol Bull 86:420) print for their 6 targets x 4
judges, pingouin 0.7 intraclass_corr, and McGraw & Wong (1996) Table 7
transcribed with a statsmodels ANOVA (full-precision CIs). R (psych, irr)
is not installed.
"""

import json
import os

import numpy as np
import pytest

from opendose import api, icc

REF = json.load(open(os.path.join(os.path.dirname(__file__), "reference",
                                  "icc_reliability.json")))
FORMS = ("ICC1", "ICC2", "ICC3", "ICC1k", "ICC2k", "ICC3k")


def by_form(r):
    return {f["form"]: f for f in r["forms"]}


def test_shrout_fleiss_published_table():
    """Shrout & Fleiss (1979): .17, .29, .71, .44, .62, .91 and the mean
    squares 11.24, 6.26, 32.49, 1.02."""
    ref = REF["shrout_fleiss"]
    r = icc.icc(ref["matrix"])
    got = by_form(r)
    for k in FORMS:
        assert round(got[k]["value"], 2) == ref["published"][k]
    for k, v in ref["published_ms"].items():
        assert round(r["mean_squares"][k], 2) == v


@pytest.mark.parametrize("name", ["shrout_fleiss", "wine"])
def test_matches_pingouin(name):
    ref = REF[name]
    got = by_form(icc.icc(ref["matrix"]))
    for k in FORMS:
        want = ref["pingouin"][k]
        g = got[k]
        assert g["value"] == pytest.approx(want["value"], rel=1e-10)
        assert g["F"] == pytest.approx(want["F"], rel=1e-10)
        assert (g["df1"], g["df2"]) == (want["df1"], want["df2"])
        assert g["p"] == pytest.approx(want["p"], rel=1e-8)
        # pingouin rounds its CIs to 2 decimals
        assert [round(c, 2) for c in g["ci"]] == want["ci"]


@pytest.mark.parametrize("name,level,key", [
    ("shrout_fleiss", 0.95, "mcgraw_wong"), ("wine", 0.95, "mcgraw_wong"),
    ("shrout_fleiss", 0.90, "mcgraw_wong_90")])
def test_cis_match_mcgraw_wong_table_7(name, level, key):
    ref = REF[name]
    r = icc.icc(ref["matrix"], ci_level=level)
    got = by_form(r)
    for k in FORMS:
        assert got[k]["ci"] == pytest.approx(ref[key]["ci"][k], rel=1e-9)
    for k, v in ref[key]["ms"].items():
        assert r["mean_squares"][k] == pytest.approx(v, rel=1e-10)
    assert r["satterthwaite_df"] == pytest.approx(ref[key]["df_satterthwaite"],
                                                  rel=1e-10)


def test_display_precision_of_the_default_form():
    r = by_form(icc.icc(REF["shrout_fleiss"]["matrix"]))["ICC2"]
    assert f"{r['value']:.4g}" == "0.2898"
    assert [f"{v:.4g}" for v in r["ci"]] == ["0.01879", "0.7611"]
    assert f"{r['F']:.4g}" == "11.03" and (r["df1"], r["df2"]) == (5, 15)


# ---------------------------------------------------------------- edges

def test_too_few_targets_or_raters():
    with pytest.raises(ValueError, match="at least 2 targets"):
        icc.icc([])
    with pytest.raises(ValueError, match="at least 2 targets"):
        icc.icc([[1, 2, 3]])
    with pytest.raises(ValueError, match="at least 2 raters"):
        icc.icc([[1], [2], [3]])


def test_all_equal_and_no_target_variation():
    with pytest.raises(ValueError, match="every rating is the same"):
        icc.icc([[5, 5], [5, 5], [5, 5]])
    with pytest.raises(ValueError, match="no variation between targets"):
        icc.icc([[1, 2], [2, 1], [1, 2]])


def test_perfect_agreement_and_a_constant_offset():
    same = icc.icc([[1, 1], [2, 2], [4, 4], [7, 7]])
    assert all(f["value"] == 1 for f in same["forms"])
    shifted = by_form(icc.icc([[1, 3], [2, 4], [4, 6], [7, 9]]))
    assert shifted["ICC3"]["value"] == 1 and shifted["ICC3k"]["value"] == 1
    assert shifted["ICC2"]["value"] < 1 and shifted["ICC2k"]["value"] < 1
    assert shifted["ICC2"]["ci"] is None


def test_incomplete_rows_are_left_out_and_listed():
    m = [row[:] for row in REF["shrout_fleiss"]["matrix"]] + [[3, None, 4, 5],
                                                              [None] * 4]
    r = icc.icc(m)
    assert r["n_targets"] == 6 and r["incomplete_rows"] == [6]
    out = api.analyze({"analysis": "icc", "data": {"datasets": [
        {"name": f"J{j + 1}", "ys": [[row[j]] for row in m]} for j in range(4)]},
        "options": {}})
    assert "1 incomplete target row (row 7) left out" in out["warnings"][0]
    assert out["names"] == ["J1", "J2", "J3", "J4"]


def test_negative_icc_is_reported_as_is():
    r = by_form(icc.icc([[1, 9], [9, 1], [2, 8], [8, 3]]))
    assert r["ICC1"]["value"] < 0


def test_api_refuses_two_ratings_in_one_cell():
    out = api.analyze({"analysis": "icc", "data": {"datasets": [
        {"name": "A", "ys": [[1, 2], [3, None]]},
        {"name": "B", "ys": [[1, None], [3, None]]}]}, "options": {}})
    assert "one rating per cell" in out["error"]


def test_mean_squares_equal_the_two_way_anova():
    from opendose import twoway
    m = REF["wine"]["matrix"]
    src = twoway.two_way_anova([[[v] for v in row] for row in m],
                               additive=True)["sources"]
    ms = icc.icc(m)["mean_squares"]
    assert ms["between_targets"] == pytest.approx(src["Rows"]["ms"], rel=1e-12)
    assert ms["between_raters"] == pytest.approx(src["Columns"]["ms"], rel=1e-12)
    assert ms["residual"] == pytest.approx(src["residual"]["ms"], rel=1e-12)


# ---------------------------------------------------------- invariances

@pytest.mark.parametrize("scale,shift", [(1e-12, 0.0), (1e12, 3e12),
                                         (10.0, -7.0)])
def test_unit_change_leaves_every_form_unchanged(scale, shift):
    m = REF["shrout_fleiss"]["matrix"]
    a = by_form(icc.icc(m))
    b = by_form(icc.icc([[v * scale + shift for v in row] for row in m]))
    for k in FORMS:
        assert b[k]["value"] == pytest.approx(a[k]["value"], rel=1e-6)
        assert b[k]["ci"] == pytest.approx(a[k]["ci"], rel=1e-6)


def test_order_of_targets_and_raters_does_not_matter():
    m = np.array(REF["wine"]["matrix"])
    rng = np.random.default_rng(3)
    p = m[rng.permutation(m.shape[0])][:, rng.permutation(m.shape[1])]
    a = by_form(icc.icc(m.tolist()))
    b = by_form(icc.icc(p.tolist()))
    for k in FORMS:
        assert b[k]["value"] == pytest.approx(a[k]["value"], rel=1e-12)


def test_api_column_table():
    m = REF["shrout_fleiss"]["matrix"]
    out = api.analyze({"analysis": "icc", "data": {"datasets": [
        {"name": f"Judge {j + 1}", "ys": [[row[j]] for row in m]}
        for j in range(4)]}, "options": {"ci_level": 0.9}})
    assert out["default"] == "ICC2" and out["k_raters"] == 4
    assert by_form(out)["ICC2"]["ci"] == pytest.approx(
        REF["shrout_fleiss"]["mcgraw_wong_90"]["ci"]["ICC2"], rel=1e-9)
