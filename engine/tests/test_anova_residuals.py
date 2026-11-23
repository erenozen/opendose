"""Residual plots for two-way, three-way, repeated-measures, nested and
mixed models (FEATURE-PLAN P-11, second part).

Reference: engine/tests/reference/anova_residuals.py (statsmodels ols
.resid / .resid_pearson, MixedLM by REML .resid; R is not installed),
which writes anova_residuals.json.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from scipy import stats

from opendose import api
from opendose.residuals import linear_model_fitted, model_residuals

REF = json.loads((Path(__file__).resolve().parent / "reference"
                  / "anova_residuals.json").read_text())
D = REF["data"]


def run(kind, data, options=None):
    out = api.analyze({"analysis": kind, "data": data, "options": options or {}})
    assert "error" not in out, out.get("error")
    return out


def grouped(cells):
    return {"datasets": [{"name": f"Set {chr(65 + j)}",
                          "ys": [list(row[j]) for row in cells]}
                         for j in range(len(cells[0]))]}


def check(rc, ref, *, rel=1e-9, abs_=1e-9):
    pts = rc["points"]
    assert [p["residual"] for p in pts] == pytest.approx(ref["resid"], rel=rel, abs=abs_)
    assert [p["standardized"] for p in pts] == pytest.approx(ref["pearson"], rel=rel, abs=abs_)
    osm, _ = stats.probplot(ref["resid"], dist="norm", fit=False)
    order = np.argsort([p["residual"] for p in pts], kind="stable")
    assert [pts[i]["theoretical"] for i in order] == pytest.approx(list(osm), rel=1e-12)


def test_two_way_2x3x4_has_24_cell_mean_residuals():
    """The plan's acceptance test: 2 x 3 grouped table, 4 replicates."""
    out = run("two_way_anova", grouped(D["two_way"]))
    rc = out["residual_diagnostics"]
    assert rc["kind"] == "model" and rc["n_qq"] == 24 and len(rc["points"]) == 24
    assert rc["fitted_label"] == "Fitted value (cell mean)"
    check(rc, REF["two_way"])
    assert rc["df"] == REF["two_way"]["df"] == out["sources"]["residual"]["df"]
    # each fitted value is its cell mean
    cells = D["two_way"]
    first = rc["points"][0]
    assert first["fitted"] == pytest.approx(np.mean(cells[0][0]), rel=1e-12)
    assert first["label"] == "Row 1, Set A, value 1"
    assert [g["group"] for g in rc["groups"]] == ["Set A", "Set B", "Set C"]


@pytest.mark.parametrize("key, additive", [
    ("two_way_additive", True), ("two_way_unbalanced", False),
    ("two_way_unbalanced_additive", True)])
def test_two_way_models_match_statsmodels(key, additive):
    cells = D["two_way_unbalanced"] if "unbalanced" in key else D["two_way"]
    out = run("two_way_anova", grouped(cells), {"model": "additive"} if additive else {})
    rc = out["residual_diagnostics"]
    check(rc, REF[key], rel=1e-8, abs_=1e-10)
    assert rc["df"] == REF[key]["df"]
    assert ("row + column" in rc["fitted_label"]) == additive


def test_two_way_without_replicates_falls_back_to_additive():
    cells = [[[v] for v in row] for row in [[1.0, 2.5, 3.1], [2.2, 3.0, 4.9], [1.4, 2.9, 3.3]]]
    out = run("two_way_anova", grouped(cells))
    rc = out["residual_diagnostics"]
    assert out["model"].startswith("main effects")
    assert "row + column" in rc["fitted_label"] and rc["df"] == 4
    assert rc["n_qq"] == 9


def test_three_way_matches_statsmodels():
    cells = D["three_way"]
    data = {"datasets": [{"name": n, "ys": [list(cells[i][j][k]) for i in range(2)]}
                         for n, (j, k) in zip("ABCD", [(0, 0), (0, 1), (1, 0), (1, 1)])]}
    out = run("three_way_anova", data)
    rc = out["residual_diagnostics"]
    assert rc["n_qq"] == 24
    check(rc, REF["three_way"], rel=1e-8, abs_=1e-10)
    assert rc["df"] == REF["three_way"]["df"] == out["sources"]["residual"]["df"]


def test_rm_one_way_subject_plus_treatment():
    rm = D["rm"]
    data = {"datasets": [{"name": f"T{t + 1}", "ys": [[row[t]] for row in rm]} for t in range(4)]}
    rc = run("residuals_column", data, {"rm": True})
    assert rc["kind"] == "model" and rc["n_qq"] == 24
    check(rc, REF["rm"], rel=1e-8, abs_=1e-10)
    assert rc["df"] == REF["rm"]["df"] == 15
    # a subject with a missing value is left out, as RM ANOVA does
    data["datasets"][1]["ys"][2] = [None]
    rc2 = run("residuals_column", data, {"rm": True})
    assert rc2["n_qq"] == 20 and "row 2, counting from 0" in rc2["warnings"][0]


def test_mixed_rm_conditional_residuals_match_mixedlm():
    rm = D["rm"]
    data = {"datasets": [{"name": f"T{t + 1}", "ys": [[None if (s, t) == (2, 1) else rm[s][t]]
                                                      for s in range(6)]} for t in range(4)]}
    out = run("mixed_rm_oneway", data, {"method": "mixed"})
    rc = out["residual_check"]
    assert "residuals" not in out
    assert rc["n_qq"] == 23
    # REML optimum by different optimizers: agree to 1e-5 of the scale
    check(rc, REF["mixed_rm"], rel=1e-4, abs_=1e-4)
    assert rc["pooled_sd"] == pytest.approx(REF["mixed_rm"]["residual_sd"], rel=1e-4)
    assert "Conditional residuals" in rc["note"]


def test_mixed_rm_complete_data_uses_rm_anova_residuals():
    rm = D["rm"]
    data = {"datasets": [{"name": f"T{t + 1}", "ys": [[row[t]] for row in rm]} for t in range(4)]}
    out = run("mixed_rm_oneway", data, {"method": "auto"})
    check(out["residual_check"], REF["rm"], rel=1e-8, abs_=1e-10)


def test_nested_conditional_residuals_match_mixedlm():
    groups = [{"name": n, "subgroups": subs} for n, subs in zip(["Control", "Treated"], D["nested"])]
    for kind in ("nested_ttest", "nested_anova"):
        out = run(kind, {"groups": groups})
        rc = out["residual_diagnostics"]
        assert rc["n_qq"] == sum(len(s) for g in D["nested"] for s in g)
        check(rc, REF["nested"], rel=1e-4, abs_=1e-4)
        assert rc["pooled_sd"] == pytest.approx(REF["nested"]["residual_sd"], rel=1e-5)
        assert rc["points"][0]["label"] == "Control, subcolumn 1"


# ------------------------------------------------------------ edge cases

def test_single_value_cells_are_left_out_of_the_qq_plot():
    cells = [[[1.0, 1.4], [2.0]], [[3.1, 2.9], [4.0, 4.4]]]
    rc = run("two_way_anova", grouped(cells))["residual_diagnostics"]
    single = [p for p in rc["points"] if p["theoretical"] is None]
    assert len(single) == 1 and single[0]["residual"] == 0.0
    assert rc["n_qq"] == 6 and "alone in its cell" in rc["warnings"][0]


def test_all_values_equal_within_cells():
    # (two-way ANOVA itself stops on this table: the residual MS is 0)
    y = [2.0, 2.0, 3.0, 3.0, 1.0, 1.0, 5.0, 5.0]
    codes = [[0, 0, 0, 0, 1, 1, 1, 1], [0, 0, 1, 1, 0, 0, 1, 1]]
    rc = model_residuals(y, linear_model_fitted(y, codes), df=4, group_index=codes[1],
                         group_names=["A", "B"], fitted_label="Fitted value (cell mean)", note="")
    assert "Every residual is 0" in rc["warnings"][0]
    assert all(p["standardized"] is None for p in rc["points"])
    assert rc["shapiro"] is None


def test_residuals_never_cost_the_analysis():
    rc = api._model_residuals(lambda: 1 / 0)
    assert "could not be computed" in rc["unavailable"]


@pytest.mark.parametrize("scale", [1e-12, 1e12])
def test_units_scale_the_residuals_only(scale):
    cells = D["two_way"]
    a = run("two_way_anova", grouped(cells))["residual_diagnostics"]
    b = run("two_way_anova", grouped([[[v * scale for v in c] for c in r] for r in cells]))
    b = b["residual_diagnostics"]
    for p, q in zip(a["points"], b["points"]):
        assert q["residual"] == pytest.approx(p["residual"] * scale, rel=1e-8)
        assert q["standardized"] == pytest.approx(p["standardized"], rel=1e-8)


def test_permuting_data_sets_permutes_the_residuals():
    cells = D["two_way"]
    swapped = [[r[2], r[0], r[1]] for r in cells]
    a = run("two_way_anova", grouped(cells))["residual_diagnostics"]
    b = run("two_way_anova", grouped(swapped))["residual_diagnostics"]
    ra = sorted(round(p["residual"], 10) for p in a["points"])
    rb = sorted(round(p["residual"], 10) for p in b["points"])
    assert ra == rb
    assert a["shapiro"]["W"] == pytest.approx(b["shapiro"]["W"], rel=1e-12)


def test_linear_model_fitted_additive_equals_two_way_means_when_balanced():
    y = np.array([1.0, 2.0, 3.0, 4.5, 5.0, 7.0])
    a = np.array([0, 0, 0, 1, 1, 1])
    b = np.array([0, 1, 2, 0, 1, 2])
    f = linear_model_fitted(y, [a, b], interaction=False)
    m = y.reshape(2, 3)
    expect = m.mean(1, keepdims=True) + m.mean(0, keepdims=True) - m.mean()
    assert f == pytest.approx(expect.ravel(), rel=1e-12)
    rc = model_residuals(y, f, df=2, group_index=b, group_names=["x", "y", "z"],
                         fitted_label="Fitted value", note="")
    assert rc["df"] == 2 and len(rc["groups"]) == 3
