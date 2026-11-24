"""P-85: aligned rank transform (ART) two-way ANOVA with ART-C contrasts.

Reference values: engine/tests/reference/art_anova.py (R is not
installed). ARTool's Higgins1990Table5 data (Higgins, Blair & Tashtoush
1990, Table 5), engine/tests/fixtures/higgins1990_table5.csv. The aligned
ranks reproduce ARTool's published split-plot reference exactly (F =
23.8326, 122.4017, 5.1180; ARTool tests/testthat/test.anova.art.R), and
the grouped-table (fixed-effects) ANOVA on them is checked against an
own pandas alignment fed to statsmodels OLS anova_lm(typ=3); ART-C
contrasts against statsmodels OLS estimated marginal means with
scipy.stats.studentized_range.
"""

import json
import os

import numpy as np
import pytest

from opendose import api, art

REF = json.load(open(os.path.join(os.path.dirname(__file__), "reference",
                                  "art_anova.json")))
M, F = REF["moisture"], REF["fertilizer"]
CELLS = [[REF["cells"][m][f] for f in F] for m in M]


def _payload(cells=CELLS, rows=M, cols=F):
    return {"row_titles": rows,
            "datasets": [{"name": c, "ys": [cells[i][j] for i in range(len(rows))]}
                         for j, c in enumerate(cols)]}


def _run(options=None, cells=CELLS):
    return api.analyze({"analysis": "two_way_art", "data": _payload(cells),
                        "options": {"row_factor": "Moisture",
                                    "col_factor": "Fertilizer",
                                    "row_names": M, **(options or {})}})


def test_ranks_match_the_reference_alignment():
    y, ri, ci, a, b = art._cells_arrays(CELLS)
    al = art.aligned_responses(y, ri, ci, a, b)
    # the engine's observation order is row, column, replicate; the
    # reference's is the data file's (tray, moisture, fertilizer)
    order = [(m, f, k) for m in M for f in F for k in range(3)]
    idx = {}
    for t in range(12):
        for f in F:
            idx[(M[t // 3], f, t % 3)] = len(idx)
    ref_order = [idx[o] for o in order]
    for key, ref_key in (("row", "Moisture"), ("col", "Fertilizer"),
                         ("interaction", "Moisture:Fertilizer")):
        got = art.aligned_ranks(al[key])
        want = np.array(REF["ranks"][ref_key])[ref_order]
        assert got == pytest.approx(want, abs=1e-12), key


def test_split_plot_of_the_ranks_reproduces_artool():
    ref, got = REF["artool_split_plot"], REF["split_plot"]
    for term in ref:
        assert round(got[term]["F"], 4) == ref[term]["F"]
        assert round(got[term]["p"], 4) == ref[term]["p"]


def test_acceptance_higgins_fixed_effects_match_statsmodels():
    r = _run()
    assert "error" not in r, r.get("error")
    s = r["sources"]
    for name, key in (("Moisture", "Moisture"), ("Fertilizer", "Fertilizer"),
                      ("interaction", "Moisture:Fertilizer")):
        ref = REF["fixed"][key]
        assert s[name]["F"] == pytest.approx(ref["F"], rel=1e-10)
        assert s[name]["p"] == pytest.approx(ref["p"], rel=1e-8)
        assert s[name]["df"] == ref["df"]
        assert s[name]["df_residual"] == ref["df_res"] == 32
    # display precision (the e2e and the independent check)
    assert f"{s['Moisture']['F']:.4g}" == "41.52"
    assert f"{s['Fertilizer']['F']:.4g}" == "69.46"
    assert f"{s['interaction']['F']:.4g}" == "2.939"
    assert f"{s['interaction']['p']:.4g}" == "0.01168"
    assert r["balanced"] is True and "note" not in r
    assert "logarithms" in r["log_note"] and "Wobbrock" in r["source"]


def test_alignment_check_other_effects_vanish():
    r = _run()
    for term, chk in r["alignment_check"].items():
        assert abs(chk["sum"]) < 1e-9, term
        assert chk["max_other_F"] < 1e-20, term


@pytest.mark.parametrize("factor,key,k", [("row", "artc_moisture", 4),
                                          ("col", "artc_fertilizer", 4)])
def test_art_c_main_effect_contrasts_match_statsmodels(factor, key, k):
    c = art.art_contrasts(CELLS, factor, row_names=M, col_names=F)
    assert c["n_means"] == k and c["df"] == 32
    assert len(c["comparisons"]) == len(REF[key]) == 6
    for got, ref in zip(c["comparisons"], REF[key]):
        assert got["pair"] == ref["pair"]
        assert got["difference"] == pytest.approx(ref["difference"], rel=1e-10)
        assert got["se"] == pytest.approx(ref["se"], rel=1e-10)
        assert got["p_unadjusted"] == pytest.approx(ref["p_unadjusted"], rel=1e-8)
        assert got["p_adjusted"] == pytest.approx(ref["p_tukey"], rel=1e-4,
                                                  abs=1e-12)


def test_art_c_cells_contrasts_match_statsmodels():
    c = art.art_contrasts(CELLS, "cells", row_names=M, col_names=F)
    assert c["n_means"] == 16
    assert len(c["comparisons"]) == REF["artc_cells_count"] == 120
    for got, ref in zip(c["comparisons"], REF["artc_cells_first"]):
        assert got["pair"] == ref["pair"]
        assert got["difference"] == pytest.approx(ref["difference"], rel=1e-10)
        assert got["p_adjusted"] == pytest.approx(ref["p_tukey"], rel=1e-4,
                                                  abs=1e-12)
    assert c["family"]["label"] == "Tukey, 120 comparisons (all pairs of 16 cells)"


def test_art_c_holm_is_holm_of_the_unadjusted():
    from statsmodels.stats.multitest import multipletests
    c = art.art_contrasts(CELLS, "row", method="holm", row_names=M)
    raw = [x["p_unadjusted"] for x in c["comparisons"]]
    want = multipletests(raw, method="holm")[1]
    assert [x["p_adjusted"] for x in c["comparisons"]] == pytest.approx(
        list(want), rel=1e-12)
    assert all(x["ci"] is None for x in c["comparisons"])


def test_api_adds_contrasts():
    r = _run({"contrasts": "row", "contrasts_method": "tukey"})
    cc = r["art_contrasts"]
    assert cc["factor"] == "row" and len(cc["comparisons"]) == 6
    assert cc["comparisons"][0]["pair"] == "m1 vs. m2"


def test_invariant_to_monotone_transforms_and_units():
    """A positive scale factor or a shift leaves every aligned value's
    order, so every rank and F, unchanged (a nonlinear monotone transform
    does not: the alignment uses means)."""
    base = _run()["sources"]
    for f in (lambda v: v * 1e-12, lambda v: v * 1e12 + 5, lambda v: v + 1e3):
        cells = [[[f(v) for v in c] for c in row] for row in CELLS]
        got = _run(cells=cells)["sources"]
        for term in base:
            assert got[term]["F"] == pytest.approx(base[term]["F"], rel=1e-9)


def test_swapping_rows_and_columns_swaps_the_main_effects():
    t = [[CELLS[i][j] for i in range(4)] for j in range(4)]
    r = api.analyze({"analysis": "two_way_art", "data": _payload(t, F, M),
                     "options": {"row_factor": "Fertilizer",
                                 "col_factor": "Moisture"}})
    base = _run()["sources"]
    assert r["sources"]["Fertilizer"]["F"] == pytest.approx(base["Fertilizer"]["F"], rel=1e-10)
    assert r["sources"]["Moisture"]["F"] == pytest.approx(base["Moisture"]["F"], rel=1e-10)
    assert r["sources"]["interaction"]["F"] == pytest.approx(base["interaction"]["F"], rel=1e-10)


def test_permuting_replicates_changes_nothing():
    cells = [[list(reversed(c)) for c in row] for row in CELLS]
    base, got = _run()["sources"], _run(cells=cells)["sources"]
    for term in base:
        assert got[term]["F"] == pytest.approx(base[term]["F"], rel=1e-12)


def test_ties_get_average_ranks():
    cells = [[[1, 1, 2], [3, 3, 3.5]], [[2, 2, 2.5], [5, 5, 6]]]
    r = api.analyze({"analysis": "two_way_art", "data": _payload(
        cells, ["a", "b"], ["x", "y"]), "options": {}})
    assert "error" not in r
    assert all(np.isfinite(s["F"]) for s in r["sources"].values())


def test_empty_cell_is_refused_with_a_message():
    cells = [[list(c) for c in row] for row in CELLS]
    cells[2][1] = []
    r = _run(cells=cells)
    assert "needs values in every cell" in r["error"]
    assert "row 3, column 2" in r["error"]


def test_one_value_in_a_cell_is_refused():
    cells = [[list(c) for c in row] for row in CELLS]
    cells[0][0] = [3.3]
    assert "at least 2 values in every cell" in _run(cells=cells)["error"]


def test_unbalanced_without_empty_cells_runs_with_a_note():
    cells = [[list(c) for c in row] for row in CELLS]
    cells[0][0] = cells[0][0][:2]
    r = _run(cells=cells)
    assert r["balanced"] is False and "unequal numbers" in r["note"]


def test_all_values_equal_gives_a_message():
    cells = [[[5.0, 5.0], [5.0, 5.0]], [[5.0, 5.0], [5.0, 5.0]]]
    r = api.analyze({"analysis": "two_way_art", "data": _payload(
        cells, ["a", "b"], ["x", "y"]), "options": {}})
    assert "every value is the same" in r["error"]


def test_one_row_or_column_is_refused():
    r = api.analyze({"analysis": "two_way_art", "data": _payload(
        [[[1, 2], [3, 4]]], ["a"], ["x", "y"]), "options": {}})
    assert "at least 2 rows" in r["error"]
