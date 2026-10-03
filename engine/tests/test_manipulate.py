"""Data manipulations: transform concentrations, remove baseline,
transpose, prune, fraction of total (user guide 'Transforming,
normalizing, etc.' pages)."""

import math

import pytest

from opendose.api import analyze
from opendose.manipulate import (fraction_of_total, proportion_ci,
                                 prune_rows, remove_baseline,
                                 transform_concentrations, transpose)

DS = [{"name": "A", "ys": [[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]},
      {"name": "B", "ys": [[10.0, 20.0], [30.0, 40.0], [50.0, 60.0]]}]
X = [1.0, 2.0, 3.0]


class TestTransformConcentrations:
    def test_log_leaves_zero_blank_by_default(self):
        out = transform_concentrations([0, 1e-9, 1e-6, -1])
        assert out["x"][0] is None and out["x"][3] is None
        assert out["x"][1:3] == pytest.approx([-9, -6])
        assert out["zero_replacement"] is None

    def test_auto_zero_two_log_units_below_lowest(self):
        # guide example: data 1e-9..1e-3 M -> substitute 1e-11 for zero
        out = transform_concentrations([0, 1e-9, 1e-6, 1e-3], zero="auto")
        assert out["zero_replacement"] == pytest.approx(1e-11)
        assert out["x"] == pytest.approx([-11, -9, -6, -3])

    def test_zero_value_units_then_log(self):
        # value replaces zero in original units, then units, then log
        out = transform_concentrations([0, 1, 1000], zero="value",
                                       zero_value=0.01, units="divide",
                                       factor=1e9)
        assert out["x"] == pytest.approx([-11, -9, -6])

    def test_natural_log_and_no_log(self):
        assert transform_concentrations([math.e], log="ln")["x"] == \
            pytest.approx([1.0])
        assert transform_concentrations([2, None], units="multiply",
                                        factor=3, log=None)["x"] == [6.0, None]

    def test_bad_options(self):
        with pytest.raises(ValueError):
            transform_concentrations([1], zero="value")
        with pytest.raises(ValueError):
            transform_concentrations([1], log="log7")


class TestRemoveBaseline:
    def test_baseline_column_mean_of_replicates(self):
        out = remove_baseline(X, DS, baseline="column", baseline_dataset=0)
        assert [d["name"] for d in out["datasets"]] == ["B"]
        assert out["datasets"][0]["ys"] == [[8.5, 18.5], [26.5, 36.5],
                                            [44.5, 54.5]]

    def test_baseline_column_each_replicate(self):
        out = remove_baseline(X, DS, replicates="each")
        assert out["datasets"][0]["ys"][0] == [9.0, 18.0]

    def test_first_row_and_operations(self):
        base = {"first_row": 1.5, "last_row": 5.5}
        for mode, b in base.items():
            out = remove_baseline(X, DS[:1], baseline=mode, operation="divide")
            assert out["datasets"][0]["ys"][1] == pytest.approx([3 / b, 4 / b])
        out = remove_baseline(X, DS[:1], baseline="first_row",
                              operation="percent_difference")
        assert out["datasets"][0]["ys"][0] == pytest.approx(
            [100 * (1 - 1.5) / 1.5, 100 * (2 - 1.5) / 1.5])

    def test_mean_of_first_and_last_k_rows(self):
        rows = [[2.0], [4.0], [100.0], [6.0], [8.0]]
        ds = [{"name": "A", "ys": rows}]
        x = [1, 2, 3, 4, 5]
        b = remove_baseline(x, ds, baseline="first_rows", k=2)
        assert b["datasets"][0]["ys"][2] == [97.0]
        b = remove_baseline(x, ds, baseline="last_rows", k=2)
        assert b["datasets"][0]["ys"][2] == [93.0]
        b = remove_baseline(x, ds, baseline="first_last_rows", k=2)
        assert b["datasets"][0]["ys"][2] == [95.0]

    def test_each_subcolumn_uses_own_first_row(self):
        out = remove_baseline(X, DS[:1], baseline="first_row",
                              replicates="each")
        assert out["datasets"][0]["ys"][2] == [4.0, 4.0]

    def test_value_and_add_multiply(self):
        out = remove_baseline(X, DS[:1], baseline="value", value=1,
                              operation="add")
        assert out["datasets"][0]["ys"][0] == [2.0, 3.0]
        out = remove_baseline(X, DS, operation="multiply")
        assert out["datasets"][0]["ys"][0] == [15.0, 30.0]

    def test_alternate_pairs(self):
        four = DS + [{"name": "C", "ys": [[0, 0], [0, 0], [0, 0]]},
                     {"name": "D", "ys": [[1, 1], [1, 1], [1, 1]]}]
        out = remove_baseline(X, four, baseline="alternate")
        assert [d["name"] for d in out["datasets"]] == ["A", "C"]
        assert out["datasets"][1]["ys"][0] == [-1.0, -1.0]
        out = remove_baseline(X, four, baseline="alternate",
                              pairs="baseline_first")
        assert [d["name"] for d in out["datasets"]] == ["B", "D"]

    def test_linear_baseline_fills_missing_rows(self):
        # nonspecific = 2*X measured only at rows 1 and 3
        ns = {"name": "NS", "ys": [[2.0], [None], [6.0]]}
        tot = {"name": "Total", "ys": [[12.0], [14.0], [16.0]]}
        out = remove_baseline(X, [ns, tot], linear_baseline=True)
        assert [r[0] for r in out["datasets"][0]["ys"]] == pytest.approx(
            [10.0, 10.0, 10.0])
        assert out["baseline_lines"][0]["slope"] == pytest.approx(2.0)

    def test_divide_by_zero_blank(self):
        ds = [{"name": "B0", "ys": [[0.0]]}, {"name": "T", "ys": [[5.0]]}]
        out = remove_baseline([1], ds, operation="divide")
        assert out["datasets"][0]["ys"] == [[None]]

    def test_unknown_operation(self):
        with pytest.raises(ValueError):
            remove_baseline(X, DS, operation="sqrt")


class TestTranspose:
    def test_rows_become_datasets(self):
        out = transpose(X, DS, row_titles=["r1", None, "r3"])
        assert [d["name"] for d in out["datasets"]] == ["r1", "2", "r3"]
        assert out["row_titles"] == ["A", "B"]
        assert out["x"] == [1.0, 2.0]
        assert out["datasets"][0]["ys"] == [[1.0, 2.0], [10.0, 20.0]]

    def test_means_and_numbered_titles(self):
        out = transpose(X, DS, column_titles="numbers", replicates="mean")
        assert [d["name"] for d in out["datasets"]] == ["Row 1", "Row 2",
                                                        "Row 3"]
        assert out["datasets"][2]["ys"] == [[5.5], [55.0]]

    def test_double_transpose_roundtrip(self):
        once = transpose(X, DS)
        twice = transpose(once["x"], once["datasets"],
                          row_titles=once["row_titles"])
        assert [d["ys"] for d in twice["datasets"]] == [d["ys"] for d in DS]
        assert [d["name"] for d in twice["datasets"]] == ["A", "B"]


class TestPrune:
    X10 = [float(i) for i in range(1, 11)]
    D10 = [{"name": "A", "ys": [[float(i), float(10 * i)] for i in range(1, 11)]}]

    def test_x_range(self):
        out = prune_rows(self.X10, self.D10, x_min=3, x_max=5)
        assert out["x"] == [3.0, 4.0, 5.0]
        assert out["datasets"][0]["ys"][0] == [3.0, 30.0]

    def test_keep_every_kth(self):
        out = prune_rows(self.X10, self.D10, mode="keep_every", k=3)
        assert out["x"] == [1.0, 4.0, 7.0, 10.0]
        out = prune_rows(self.X10, self.D10, mode="keep_every", k=3, start=2)
        assert out["x"] == [2.0, 5.0, 8.0]

    def test_average_keep_replicates(self):
        out = prune_rows(self.X10, self.D10, mode="average", k=4)
        assert out["x"] == [2.5, 6.5, 9.5]
        assert out["datasets"][0]["ys"][0] == [2.5, 25.0]
        assert out["kept_rows"][-1] == [8, 9]
        out = prune_rows(self.X10, self.D10, mode="average", k=4,
                         partial="drop")
        assert len(out["x"]) == 2

    def test_average_mean_of_replicates(self):
        out = prune_rows(self.X10, self.D10, mode="average", k=2,
                         average="mean")
        assert out["datasets"][0]["ys"][0] == [(1 + 2 + 10 + 20) / 4]

    def test_range_then_decimate_with_blank_x(self):
        x = [1.0, None, 3.0, 4.0, 5.0]
        ds = [{"name": "A", "ys": [[1.0], [2.0], [3.0], [4.0], [5.0]]}]
        out = prune_rows(x, ds, x_min=2, mode="keep_every", k=2,
                         row_titles=list("abcde"))
        assert out["x"] == [3.0, 5.0]
        assert out["row_titles"] == ["c", "e"]


class TestFractionOfTotal:
    TABLE = [{"name": "A", "ys": [[6.0], [79.0]]},
             {"name": "B", "ys": [[1.0], [3.0]]}]

    def test_column_row_grand(self):
        col = fraction_of_total(self.TABLE)
        assert col["datasets"][0]["ys"] == [[pytest.approx(6 / 85)],
                                            [pytest.approx(79 / 85)]]
        row = fraction_of_total(self.TABLE, divide_by="row", as_percent=True)
        assert row["datasets"][1]["ys"][0][0] == pytest.approx(100 / 7)
        grand = fraction_of_total(self.TABLE, divide_by="grand")
        total = sum(v[0] for d in grand["datasets"] for v in d["ys"])
        assert total == pytest.approx(1.0)
        assert grand["grand_total"] == 89

    def test_all_layouts_have_no_ci(self):
        out = fraction_of_total(self.TABLE, divide_by="all", ci=True)
        assert set(out["layouts"]) == {"column", "row", "grand"}
        assert "ci_lower" not in out["layouts"]["column"][0]

    def test_ci_guide_example_clopper_pearson(self):
        # statistics guide: 6 dead of 85 cells -> 0.0706, 95% CI
        # 0.0263 to 0.1473 (the exact Clopper-Pearson interval)
        out = fraction_of_total(self.TABLE, ci=True, ci_method="clopper_pearson")
        a = out["datasets"][0]
        assert a["ys"][0][0] == pytest.approx(0.0706, abs=1e-4)
        assert a["ci_lower"][0] == pytest.approx(0.0263, abs=1e-4)
        assert a["ci_upper"][0] == pytest.approx(0.1473, abs=1e-4)

    def test_blank_cells_skip_totals(self):
        out = fraction_of_total([{"name": "A", "ys": [[1.0], [None], [3.0]]}])
        assert out["datasets"][0]["ys"] == [[0.25], [None], [0.75]]

    def test_rejects_subcolumns(self):
        with pytest.raises(ValueError):
            fraction_of_total(DS)


class TestProportionCI:
    def test_wilson_matches_statsmodels(self):
        from statsmodels.stats.proportion import proportion_confint
        for k, n in [(6, 85), (10, 20), (40, 50)]:
            lo, hi = proportion_ci(k, n, method="wilson")
            elo, ehi = proportion_confint(k, n, method="wilson")
            assert lo == pytest.approx(elo) and hi == pytest.approx(ehi)
            lo, hi = proportion_ci(k, n, method="clopper_pearson")
            elo, ehi = proportion_confint(k, n, method="beta")
            assert lo == pytest.approx(elo) and hi == pytest.approx(ehi)

    def test_wilson_brown_poisson_ends(self):
        # Brown et al. (2001): lower limit theta_x / n with theta_1 = 0.051,
        # theta_2 = 0.355, theta_3 = 0.818 (95%)
        assert proportion_ci(1, 20)[0] == pytest.approx(0.0513 / 20, rel=1e-2)
        assert proportion_ci(2, 40)[0] == pytest.approx(0.3554 / 40, rel=1e-2)
        assert proportion_ci(3, 60)[0] == pytest.approx(0.8177 / 60, rel=1e-2)
        # k = 3 with n <= 50 keeps Wilson
        assert proportion_ci(3, 30) == pytest.approx(
            proportion_ci(3, 30, method="wilson"))
        lo, hi = proportion_ci(19, 20)
        assert hi == pytest.approx(1 - 0.0513 / 20, rel=1e-3)
        assert proportion_ci(0, 10)[0] == 0.0
        assert proportion_ci(10, 10)[1] == 1.0


class TestApi:
    def _run(self, analysis, options, data=None):
        res = analyze({"analysis": analysis,
                       "data": data or {"x": X, "datasets": DS},
                       "options": options})
        assert "error" not in res, res.get("error")
        return res

    def test_handlers(self):
        r = self._run("transform_concentrations", {"zero": "auto"},
                      {"x": [0, 1e-6, 1e-4], "datasets": DS})
        assert r["x"] == pytest.approx([-8, -6, -4])
        r = self._run("remove_baseline", {"baseline": "column"})
        assert r["datasets"][0]["name"] == "B"
        r = self._run("transpose", {})
        assert len(r["datasets"]) == 3
        r = self._run("prune_rows", {"mode": "keep_every", "k": 2})
        assert r["x"] == [1.0, 3.0]
        r = self._run("fraction_of_total_table",
                      {"divide_by": "column", "ci": True},
                      {"x": [1, 2], "datasets": TestFractionOfTotal.TABLE})
        assert r["datasets"][0]["ci_lower"][0] is not None
