"""P-82 baseline-adjusted comparison (multivar.ancova) against statsmodels
(engine/tests/reference/ancova.py: ols with the adjusted means at the
mean baseline, anova_lm typ=3 with sum-to-zero coding, and the F test of
the group x baseline interaction), plus edge cases and invariances."""

import json
import pathlib

import pytest

from opendose import api, multivar

REF = json.loads((pathlib.Path(__file__).parent / "reference" / "ancova.json").read_text())


def variables(data, group_kind="categorical"):
    return [{"name": "Group", "values": list(data["group"]), "kind": group_kind},
            {"name": "Baseline", "values": list(data["pre"]), "kind": "continuous"},
            {"name": "Follow-up", "values": list(data["post"]), "kind": "continuous"}]


def run(data, **kw):
    return multivar.ancova(variables(data), "Follow-up", "Group", "Baseline", **kw)


@pytest.mark.parametrize("case", ["two_groups", "three_groups"])
def test_matches_statsmodels(case):
    ref = REF[case]
    r = run(ref["data"])
    assert r["reference_level"] == ref["reference"]
    assert r["baseline_mean"] == pytest.approx(ref["baseline_mean"], rel=1e-12)
    for got, want in zip(r["differences"], ref["differences"]):
        assert got["level"] == want["level"] and got["vs"] == want["vs"]
        for key in ("estimate", "se", "t", "p"):
            assert got[key] == pytest.approx(want[key], rel=1e-9), key
        assert got["ci"] == pytest.approx(want["ci"], rel=1e-9)
        assert got["df"] == ref["df_resid"]
    for got, want in zip(r["adjusted_means"], ref["adjusted_means"]):
        assert got["level"] == want["level"]
        assert got["mean"] == pytest.approx(want["mean"], rel=1e-12)
        assert got["se"] == pytest.approx(want["se"], rel=1e-9)
        assert got["ci"] == pytest.approx(want["ci"], rel=1e-9)
    assert r["baseline_slope"]["estimate"] == pytest.approx(ref["baseline_slope"]["estimate"], rel=1e-10)
    assert r["baseline_slope"]["se"] == pytest.approx(ref["baseline_slope"]["se"], rel=1e-9)
    assert r["baseline_slope"]["p"] == pytest.approx(ref["baseline_slope"]["p"], rel=1e-7)
    t3 = {row["source"]: row for row in r["anova"]}
    for mine, theirs in (("Group", "C(group, Sum)"), ("Baseline", "pre"), ("Residual", "Residual")):
        want = ref["type3"][theirs]
        assert t3[mine]["ss"] == pytest.approx(want["ss"], rel=1e-9)
        assert t3[mine]["df"] == want["df"]
        if want["F"] is not None:
            assert t3[mine]["F"] == pytest.approx(want["F"], rel=1e-9)
            assert t3[mine]["p"] == pytest.approx(want["p"], rel=1e-7)
    es, want = r["equal_slopes"], ref["equal_slopes"]
    assert es["F"] == pytest.approx(want["F"], rel=1e-9)
    assert (es["df1"], es["df2"]) == (want["df1"], want["df2"])
    assert es["p"] == pytest.approx(want["p"], rel=1e-9)
    for got, w in zip(es["slopes"], want["slopes"]):
        assert got["level"] == w["level"]
        assert got["slope"] == pytest.approx(w["slope"], rel=1e-10)
        assert got["se"] == pytest.approx(w["se"], rel=1e-9)
    assert r["goodness"]["r_squared"] == pytest.approx(ref["r_squared"], rel=1e-12)
    assert r["goodness"]["adjusted_r_squared"] == pytest.approx(ref["adjusted_r_squared"], rel=1e-12)


def test_acceptance_two_groups_of_ten():
    """The plan's acceptance test: the answer is the adjusted difference
    with its 95% CI; the equal-slopes check is the group x baseline F test.
    Display precision (4 significant digits) of the statsmodels values."""
    r = run(REF["two_groups"]["data"])
    d = r["differences"][0]
    assert (d["level"], d["vs"]) == ("Treated", "Control")
    assert round(d["estimate"], 3) == -5.663
    assert [round(c, 3) for c in d["ci"]] == [-6.732, -4.595]
    assert r["equal_slopes"]["F"] == pytest.approx(0.3481, abs=5e-5)
    assert (r["equal_slopes"]["df1"], r["equal_slopes"]["df2"]) == (1, 16)
    assert r["equal_slopes"]["p"] == pytest.approx(0.5634, abs=5e-5)
    assert r["n_rows_analyzed"] == 20 and r["warnings"] == []
    assert [g["n"] for g in r["adjusted_means"]] == [10, 10]


def test_unequal_slopes_warn():
    r = run(REF["three_groups"]["data"])
    assert r["equal_slopes"]["p"] < 0.05
    assert len(r["warnings"]) == 1 and "slopes differ" in r["warnings"][0]


def test_api_reports_analysed_rows_and_drops_incomplete_rows():
    data = REF["two_groups"]["data"]
    v = variables(data)
    v[1]["values"][3] = None          # a missing baseline
    v[2]["values"][15] = ""           # a missing follow-up
    r = api.analyze({"analysis": "ancova", "data": {"variables": v},
                     "options": {"outcome": "Follow-up", "group": "Group", "baseline": "Baseline"}})
    assert r["analysis"] == "ancova"
    assert r["analysed_rows"]["n_used"] == 18 and r["analysed_rows"]["n_rows"] == 20
    assert [x["row"] for x in r["analysed_rows"]["dropped"]] == [4, 16]
    assert [g["n"] for g in r["adjusted_means"]] == [9, 9]


def test_reference_level_flips_the_sign_only():
    a = run(REF["two_groups"]["data"])
    b = run(REF["two_groups"]["data"], reference_level="Treated")
    da, db = a["differences"][0], b["differences"][0]
    assert (db["level"], db["vs"]) == ("Control", "Treated")
    assert db["estimate"] == pytest.approx(-da["estimate"], rel=1e-12)
    assert db["se"] == pytest.approx(da["se"], rel=1e-12)
    assert db["p"] == pytest.approx(da["p"], rel=1e-10)
    assert b["equal_slopes"]["p"] == pytest.approx(a["equal_slopes"]["p"], rel=1e-10)


def test_row_order_does_not_matter():
    data = REF["three_groups"]["data"]
    order = list(range(len(data["group"])))[::-1]
    shuffled = {k: [v[i] for i in order] for k, v in data.items()}
    a = run(data, reference_level="A")
    b = run(shuffled, reference_level="A")
    assert b["levels"] == ["A", "C", "B"]    # levels in order of appearance
    other = {x["level"]: x for x in b["differences"]}
    for x in a["differences"]:
        assert x["estimate"] == pytest.approx(other[x["level"]]["estimate"], rel=1e-10)
        assert x["p"] == pytest.approx(other[x["level"]]["p"], rel=1e-8)
    assert a["equal_slopes"]["F"] == pytest.approx(b["equal_slopes"]["F"], rel=1e-9)


def test_units_scale_and_shift():
    """Outcome x c scales the difference by c; baseline x c or + c leaves
    it (and every P) unchanged."""
    data = REF["two_groups"]["data"]
    base = run(data)["differences"][0]
    for c in (1e-12, 1e12):
        scaled = run({**data, "post": [v * c for v in data["post"]]})["differences"][0]
        assert scaled["estimate"] == pytest.approx(base["estimate"] * c, rel=1e-8)
        assert scaled["p"] == pytest.approx(base["p"], rel=1e-6)
        pre = run({**data, "pre": [v * c for v in data["pre"]]})["differences"][0]
        assert pre["estimate"] == pytest.approx(base["estimate"], rel=1e-8)
        assert pre["p"] == pytest.approx(base["p"], rel=1e-6)
    shifted = run({**data, "pre": [v + 1000 for v in data["pre"]]})
    assert shifted["differences"][0]["estimate"] == pytest.approx(base["estimate"], rel=1e-9)


def test_numeric_group_column_is_read_as_levels():
    data = REF["two_groups"]["data"]
    coded = {**data, "group": [1 if g == "Control" else 2 for g in data["group"]]}
    r = multivar.ancova(variables(coded, group_kind="continuous"), "Follow-up", "Group", "Baseline")
    assert r["levels"] == ["1", "2"]
    assert r["differences"][0]["estimate"] == pytest.approx(
        run(data)["differences"][0]["estimate"], rel=1e-12)


@pytest.mark.parametrize("mutate, message", [
    (lambda d: {**d, "group": ["Control"] * 20}, "only one level"),
    (lambda d: {**d, "pre": [50] * 20}, "same value in every row"),
    (lambda d: {**d, "pre": [40] * 10 + [60] * 10}, "same within each group"),
    (lambda d: {**d, "post": [7] * 20}, "no residual"),
    (lambda d: {k: v[:1] + v[10:11] for k, v in d.items()}, "more rows"),
    (lambda d: {**d, "post": [None] * 20}, "no rows"),
])
def test_edge_cases_explain_themselves(mutate, message):
    with pytest.raises(ValueError, match=message):
        run(mutate(REF["two_groups"]["data"]))


def test_three_rows_fit_but_slopes_cannot_be_checked():
    """n = 2 + 1: the shared-slope model fits; the equal-slopes check says
    why it is missing rather than failing."""
    d = REF["two_groups"]["data"]
    small = {k: v[:2] + v[10:12] for k, v in d.items()}
    r = run(small)
    assert r["n_rows_analyzed"] == 4 and r["goodness"]["df"] == 1
    assert "error" in r["equal_slopes"]


def test_variable_roles_are_checked():
    v = variables(REF["two_groups"]["data"])
    with pytest.raises(ValueError, match="three different"):
        multivar.ancova(v, "Follow-up", "Group", "Follow-up")
    with pytest.raises(ValueError, match="must be a numeric"):
        multivar.ancova(v, "Group", "Follow-up", "Baseline")
    with pytest.raises(ValueError, match="unknown variable"):
        multivar.ancova(v, "Follow-up", "Arm", "Baseline")
    with pytest.raises(ValueError, match="reference level"):
        multivar.ancova(v, "Follow-up", "Group", "Baseline", reference_level="Sham")
