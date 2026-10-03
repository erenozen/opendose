"""Three-way ANOVA (Type III) and its multiple comparisons, cross-checked
against statsmodels anova_lm(typ=3) and the one-way post tests."""

import numpy as np
import pandas as pd
import pytest
import statsmodels.formula.api as smf
from scipy import stats as sps
from statsmodels.stats.anova import anova_lm

from opendose import anova, fdr, threeway
from opendose.api import analyze

SM_TERMS = {
    "A": "C(a, Sum)", "B": "C(b, Sum)", "C": "C(c, Sum)",
    "A x B": "C(a, Sum):C(b, Sum)", "A x C": "C(a, Sum):C(c, Sum)",
    "B x C": "C(b, Sum):C(c, Sum)",
    "A x B x C": "C(a, Sum):C(b, Sum):C(c, Sum)", "residual": "Residual",
}


def _cells(a, b, c, nrep, seed):
    rng = np.random.default_rng(seed)
    return [[[list(np.round(rng.normal(10 + i + 2 * j * k + 0.7 * i * k,
                                       1.5, nrep), 2))
              for k in range(c)] for j in range(b)] for i in range(a)]


def _unbalance(cells):
    cells[0][0][0] = cells[0][0][0][:1]
    cells[1][1][0] = cells[1][1][0][:2]
    cells[-1][0][1] = cells[-1][0][1] + [14.2, 9.9]
    return cells


def _statsmodels(cells):
    rows = [(i, j, k, v) for i, p in enumerate(cells)
            for j, line in enumerate(p) for k, cell in enumerate(line)
            for v in cell]
    df = pd.DataFrame(rows, columns=["a", "b", "c", "y"])
    fit = smf.ols("y ~ C(a, Sum) * C(b, Sum) * C(c, Sum)", df).fit()
    return anova_lm(fit, typ=3), fit


@pytest.mark.parametrize("cells", [
    _cells(2, 2, 2, 3, 1),                 # balanced 2x2x2 (guide layout)
    _cells(3, 2, 2, 4, 2),                 # balanced, 3 rows
    _unbalance(_cells(3, 2, 2, 3, 3)),     # unbalanced
    _unbalance(_cells(2, 3, 2, 4, 4)),     # unbalanced, 3 levels of B
])
def test_matches_statsmodels_type3(cells):
    r = threeway.three_way_anova(cells, factor_names=("A", "B", "C"))
    table, _ = _statsmodels(cells)
    for key, lab in SM_TERMS.items():
        src = r["sources"][key]
        assert src["ss"] == pytest.approx(table.loc[lab, "sum_sq"], rel=1e-9)
        assert src["df"] == table.loc[lab, "df"]
        if key != "residual":
            assert src["F"] == pytest.approx(table.loc[lab, "F"], rel=1e-9)
            assert src["p"] == pytest.approx(table.loc[lab, "PR(>F)"],
                                             rel=1e-7)
    assert list(r["sources"]) == list(SM_TERMS)


def test_balanced_percentages_sum_to_100():
    r = threeway.three_way_anova(_cells(2, 2, 2, 3, 5))
    assert sum(s["percent_of_total"] for s in r["sources"].values()) == \
        pytest.approx(100.0)


def test_single_values_rejected():
    with pytest.raises(ValueError):
        threeway.three_way_anova(_cells(2, 2, 2, 1, 6))


def test_guide_data_layout():
    # A&B vs C&D = factor B; A&C vs B&D = factor C; only A-D used.
    ds = [[[1, 2]], [[3, 4]], [[5, 6]], [[7, 8]], [[99, 99]]]
    cells, owner = threeway.cells_from_datasets(ds)
    assert cells[0][0][0] == [1, 2]   # A
    assert cells[0][0][1] == [3, 4]   # B
    assert cells[0][1][0] == [5, 6]   # C
    assert cells[0][1][1] == [7, 8]   # D
    assert owner == {(0, 0): 0, (0, 1): 1, (1, 0): 2, (1, 1): 3}


class TestComparisons:
    CELLS = _cells(2, 2, 2, 3, 7)

    @pytest.mark.parametrize("method", ["tukey", "bonferroni", "sidak",
                                        "holm_sidak"])
    def test_all_cells_equal_one_way_post_tests(self, method):
        # the full factorial model is the cell-means model, so comparing
        # all cells is the one-way post test with the same MS/df
        flat = [c for p in self.CELLS for line in p for c in line]
        mine = threeway.three_way_comparisons(self.CELLS, goal="all_cells",
                                              method=method)
        ref = anova.multiple_comparisons(flat, method)
        assert mine["n_comparisons"] == len(ref["comparisons"]) == 28
        for x, y in zip(mine["comparisons"], ref["comparisons"]):
            assert x["difference"] == pytest.approx(y["difference"])
            assert x["statistic"] == pytest.approx(y["statistic"])
            assert x["p_adjusted"] == pytest.approx(y["p_adjusted"])
            if y["ci"] is not None:
                assert x["ci"] == pytest.approx(y["ci"])

    def test_dunnett_matches_scipy(self):
        flat = [c for p in self.CELLS for line in p for c in line]
        mine = threeway.three_way_comparisons(self.CELLS, goal="control",
                                              method="dunnett")
        ref = sps.dunnett(*flat[1:], control=flat[0],
                          rng=np.random.default_rng(1))
        assert mine["n_comparisons"] == 7
        for x, p, t in zip(mine["comparisons"], ref.pvalue, ref.statistic):
            assert x["statistic"] == pytest.approx(abs(t))
            assert x["p_adjusted"] == pytest.approx(p, abs=2e-3)

    def test_family_sizes_from_guide(self):
        # 2x2x2: 28 all pairs, 7 vs control, 12 differ by one factor,
        # 4 row-1 cells vs the cell just below
        counts = {g: threeway.three_way_comparisons(
            self.CELLS, goal=g, method="sidak")["n_comparisons"]
            for g in ("all_cells", "control", "one_factor", "row1_below")}
        assert counts == {"all_cells": 28, "control": 7, "one_factor": 12,
                          "row1_below": 4}
        r = threeway.three_way_comparisons(self.CELLS, goal="one_factor",
                                           factor="b", method="sidak")
        assert r["n_comparisons"] == 4
        for comp in r["comparisons"]:
            l1, l2 = comp["pair"].split(" vs. ")
            assert l1.split(":")[0] == l2.split(":")[0]
            assert l1.split(":")[2] == l2.split(":")[2]

    def test_fisher_and_fdr_use_lsd_p_values(self):
        lsd = threeway.three_way_comparisons(self.CELLS, goal="one_factor",
                                             method="none")
        p = np.array([c["p"] for c in lsd["comparisons"]])
        aov = threeway.three_way_anova(self.CELLS)
        dfe = aov["sources"]["residual"]["df"]
        for c in lsd["comparisons"]:
            assert c["p"] == pytest.approx(
                2 * sps.t.sf(abs(c["difference"]) / c["se"], dfe))
            assert c["significant"] == (c["p"] < 0.05)
        bh = threeway.three_way_comparisons(self.CELLS, goal="one_factor",
                                            method="bh", q=0.1)
        assert [c["p_adjusted"] for c in bh["comparisons"]] == \
            pytest.approx(list(fdr.bh(p)))

    def test_marginal_means_balanced(self):
        r = threeway.three_way_comparisons(self.CELLS, goal="factor_b_means",
                                           method="none")
        vals = [[v for p in self.CELLS for v in p[j][0] + p[j][1]]
                for j in range(2)]
        aov = threeway.three_way_anova(self.CELLS)
        ms = aov["sources"]["residual"]["ms"]
        comp = r["comparisons"][0]
        assert comp["difference"] == pytest.approx(np.mean(vals[0])
                                                   - np.mean(vals[1]))
        assert comp["se"] == pytest.approx(np.sqrt(ms * (1 / 12 + 1 / 12)))

    def test_two_level_marginal_test_equals_main_effect_unbalanced(self):
        # with 2 levels, comparing least-squares marginal means is the
        # Type III main-effect test: t^2 = F
        cells = _unbalance(_cells(3, 2, 2, 3, 8))
        aov = threeway.three_way_anova(cells)
        for goal, src in (("factor_b_means", "Factor B"),
                          ("factor_c_means", "Factor C")):
            r = threeway.three_way_comparisons(cells, goal=goal,
                                               method="none", anova=aov)
            c = r["comparisons"][0]
            assert (c["statistic"]) ** 2 == pytest.approx(
                aov["sources"][src]["F"])
            assert c["p"] == pytest.approx(aov["sources"][src]["p"])

    def test_row_means_tukey_three_rows(self):
        cells = _cells(3, 2, 2, 3, 9)
        r = threeway.three_way_comparisons(cells, goal="row_means",
                                           method="tukey")
        assert r["n_comparisons"] == 3 and r["n_means"] == 3
        ctrl = threeway.three_way_comparisons(cells, goal="row_means_control",
                                              method="dunnett", control_row=0)
        assert [c["pair"] for c in ctrl["comparisons"]] == [
            "Row 2 vs. Row 1", "Row 3 vs. Row 1"]

    def test_dunnett_needs_control_goal(self):
        with pytest.raises(ValueError):
            threeway.three_way_comparisons(self.CELLS, goal="all_cells",
                                           method="dunnett")


def _payload(cells, names=("A", "B", "C", "D")):
    order = [(0, 0), (0, 1), (1, 0), (1, 1)]
    return {"row_titles": ["Male", "Female"],
            "datasets": [{"name": n, "ys": [cells[i][j][k] for i in range(2)]}
                         for n, (j, k) in zip(names, order)]}


def test_api_handler_layouts_agree():
    cells = _cells(2, 2, 2, 3, 10)
    out = analyze({"analysis": "three_way_anova", "data": _payload(cells),
                   "options": {"factor_names": ["Sex", "Treatment", "Dose"],
                               "comparisons": "tukey", "goal": "all_cells"}})
    assert "error" not in out, out.get("traceback")
    assert list(out["sources"])[:3] == ["Sex", "Treatment", "Dose"]
    assert out["cell_labels"][0][0][0] == "Male:A"
    assert out["b_level_names"] == ["A/B", "C/D"]
    assert out["multiple_comparisons"]["n_comparisons"] == 28
    assert out["multiple_comparisons"]["comparisons"][0]["pair"] == \
        "Male:A vs. Male:B"
    blocks = {"row_titles": ["Male", "Female"], "blocks": [
        {"name": "Low", "datasets": [
            {"name": "Control", "ys": [cells[i][0][0] for i in range(2)]},
            {"name": "Treated", "ys": [cells[i][1][0] for i in range(2)]}]},
        {"name": "High", "datasets": [
            {"name": "Control", "ys": [cells[i][0][1] for i in range(2)]},
            {"name": "Treated", "ys": [cells[i][1][1] for i in range(2)]}]}]}
    out2 = analyze({"analysis": "three_way_anova", "data": blocks,
                    "options": {}})
    assert "error" not in out2, out2.get("traceback")
    assert out2["c_level_names"] == ["Low", "High"]
    for key in ("ss", "df", "p"):
        assert [s[key] for s in out2["sources"].values()] == pytest.approx(
            [s[key] for s in out["sources"].values()])
    # explicit column_levels reproduce the default layout
    out3 = analyze({"analysis": "three_way_anova", "data": _payload(cells),
                    "options": {"column_levels": [[0, 0], [0, 1], [1, 0],
                                                  [1, 1]]}})
    assert out3["sources"]["residual"]["ss"] == pytest.approx(
        out["sources"]["residual"]["ss"])
