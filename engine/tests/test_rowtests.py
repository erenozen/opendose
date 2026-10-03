"""Multiple t tests (one per row) and row means/totals, cross-checked
against opendose.ttests, scipy and statsmodels."""

import math

import numpy as np
import pandas as pd
import pytest
import statsmodels.formula.api as smf
from scipy import stats as sps
from statsmodels.stats.multitest import multipletests

from opendose import fdr, rowtests, ttests, twoway
from opendose.api import analyze

ROWS_A = [[10.1, 11.3, 9.8], [20.5, 22.1, 19.7], [5.2, 4.9, 5.8],
          [7.7, 8.4, 8.0], [15.0, 14.2, 16.1]]
ROWS_B = [[12.4, 13.0, 11.9], [20.9, 21.5, 22.8], [7.9, 8.8, 8.1],
          [7.5, 8.9, 7.1], [11.1, 12.0, 10.2]]
TITLES = ["gene1", "gene2", "gene3", "gene4", "gene5"]


def _run(test, method="none", **kw):
    return rowtests.multiple_t_tests(ROWS_A, ROWS_B, row_titles=TITLES,
                                     test=test, method=method, **kw)


class TestPerRowTests:
    @pytest.mark.parametrize("test,welch", [("unpaired", False),
                                            ("welch", True)])
    def test_unpaired_matches_ttests(self, test, welch):
        r = _run(test)
        for row, a, b in zip(r["rows"], ROWS_A, ROWS_B):
            ref = ttests.unpaired_t(a, b, welch=welch)
            assert row["statistic"] == pytest.approx(ref["t"])
            assert row["df"] == pytest.approx(ref["df"])
            assert row["p"] == pytest.approx(ref["p_two_tailed"])
            assert row["difference"] == pytest.approx(ref["difference"])
            assert row["se_difference"] == pytest.approx(ref["se_difference"])
            assert row["mean_a"] == pytest.approx(ref["mean_a"])
            assert row["statistic_name"] == "t"

    def test_paired_and_ratio_paired(self):
        r = _run("paired")
        for row, a, b in zip(r["rows"], ROWS_A, ROWS_B):
            ref = ttests.paired_t(a, b)
            assert row["p"] == pytest.approx(ref["p_two_tailed"])
            assert row["df"] == ref["df"]
            assert row["difference"] == pytest.approx(ref["mean_difference"])
        r = _run("ratio_paired")
        for row, a, b in zip(r["rows"], ROWS_A, ROWS_B):
            res = sps.ttest_rel(np.log10(a), np.log10(b))
            assert row["p"] == pytest.approx(res.pvalue)
            ratios = np.array(a) / np.array(b)
            assert row["ratio"] == pytest.approx(
                10 ** np.mean(np.log10(ratios)))

    def test_lognormal_unpaired_is_t_on_logs(self):
        for test, eq in (("lognormal_unpaired", True),
                         ("lognormal_welch", False)):
            r = _run(test)
            for row, a, b in zip(r["rows"], ROWS_A, ROWS_B):
                res = sps.ttest_ind(np.log10(a), np.log10(b), equal_var=eq)
                assert row["p"] == pytest.approx(res.pvalue)
                assert row["geometric_mean_a"] == pytest.approx(
                    sps.gmean(a))
                assert row["ratio"] == pytest.approx(sps.gmean(a) / sps.gmean(b))

    def test_nonparametric(self):
        mw, ks, wx = _run("mann_whitney"), _run("kolmogorov_smirnov"), \
            _run("wilcoxon")
        for i, (a, b) in enumerate(zip(ROWS_A, ROWS_B)):
            ref = ttests.mann_whitney(a, b)
            assert mw["rows"][i]["statistic"] == ref["U"]
            assert mw["rows"][i]["p"] == pytest.approx(ref["p_two_tailed"])
            assert mw["rows"][i]["statistic_name"] == "U"
            kr = sps.ks_2samp(a, b)
            assert ks["rows"][i]["statistic"] == pytest.approx(kr.statistic)
            assert ks["rows"][i]["p"] == pytest.approx(kr.pvalue)
            wr = ttests.wilcoxon_matched_pairs(a, b)
            assert wx["rows"][i]["statistic"] == wr["W"]
            assert wx["rows"][i]["p"] == pytest.approx(wr["p_two_tailed"])

    def test_pooled_sd_is_two_way_anova_residual(self):
        r = _run("pooled")
        cells = [[a, b] for a, b in zip(ROWS_A, ROWS_B)]
        aov = twoway.two_way_anova(cells)
        assert r["pooled"]["variance"] == pytest.approx(
            aov["sources"]["residual"]["ms"])
        assert r["pooled"]["df"] == aov["sources"]["residual"]["df"] == 20
        # independent check: cell-means OLS contrast per row
        recs = [(f"{i}_{g}", v) for i, (a, b) in enumerate(zip(ROWS_A, ROWS_B))
                for g, vals in (("a", a), ("b", b)) for v in vals]
        df = pd.DataFrame(recs, columns=["cell", "y"])
        fit = smf.ols("y ~ C(cell) - 1", df).fit()
        names = list(fit.params.index)
        for i, row in enumerate(r["rows"]):
            c = np.zeros(len(names))
            c[names.index(f"C(cell)[{i}_a]")] = 1
            c[names.index(f"C(cell)[{i}_b]")] = -1
            tt = fit.t_test(c)
            assert row["statistic"] == pytest.approx(abs(tt.tvalue.item()))
            assert row["p"] == pytest.approx(tt.pvalue.item())
            assert row["df"] == 20

    def test_pooled_uses_cells_of_rows_that_cannot_be_tested(self):
        a = ROWS_A + [[3.0, 4.0, 5.0]]
        b = ROWS_B + [[None, None]]
        r = rowtests.multiple_t_tests(a, b, test="pooled", method="none")
        assert r["pooled"]["df"] == 22
        assert r["rows"][-1]["p"] is None and "omitted" in r["rows"][-1]
        assert r["n_tests"] == 5 and r["n_omitted"] == 1


class TestFamily:
    @pytest.mark.parametrize("method", ["bonferroni", "sidak", "holm_sidak",
                                        "bh", "by"])
    def test_corrections_match_statsmodels(self, method):
        r = _run("unpaired", method=method, alpha=0.05, q=0.05)
        p = [row["p"] for row in r["rows"]]
        sm = {"bh": "fdr_bh", "by": "fdr_by", "holm_sidak": "holm-sidak"}
        rej, adj, _, _ = multipletests(p, alpha=0.05,
                                       method=sm.get(method, method))
        assert [row["p_adjusted"] for row in r["rows"]] == pytest.approx(
            list(adj))
        assert [row["significant"] for row in r["rows"]] == list(rej)

    def test_bky_default_and_discoveries(self):
        r = rowtests.multiple_t_tests(ROWS_A, ROWS_B, q=0.05)
        assert r["method"] == "bky" and r["flag_label"] == "Discovery?"
        p = [row["p"] for row in r["rows"]]
        rej = multipletests(p, alpha=0.05, method="fdr_tsbky")[0]
        assert [row["significant"] for row in r["rows"]] == list(rej)
        assert r["n_flagged"] == int(rej.sum())
        flagged = [i for i in range(5) if rej[i]]
        assert sorted(r["flagged_rows"]) == flagged
        ps = [r["rows"][i]["p"] for i in r["flagged_rows"]]
        assert ps == sorted(ps)

    def test_no_correction_uses_alpha(self):
        r = _run("unpaired", method="none", alpha=0.05)
        assert r["flag_label"] == "Below threshold?"
        for row in r["rows"]:
            assert row["significant"] == (row["p"] < 0.05)
            assert row["p_adjusted"] is None
            assert row["neg_log10_p"] == pytest.approx(-math.log10(row["p"]))
            assert row["s_value"] == pytest.approx(-math.log2(row["p"]))

    def test_rows_that_cannot_be_computed_are_not_counted(self):
        a = ROWS_A + [[1.0], [2.0, 2.0]]
        b = ROWS_B + [[1.5, 2.5], [3.0, 3.0]]
        r = rowtests.multiple_t_tests(a, b, test="unpaired",
                                      method="bonferroni")
        assert r["n_tests"] == 5 and r["n_omitted"] == 2
        assert r["rows"][5]["p_adjusted"] is None
        p = [row["p"] for row in r["rows"][:5]]
        assert r["rows"][0]["p_adjusted"] == pytest.approx(min(p[0] * 5, 1))

    def test_welch_with_one_constant_group(self):
        r = rowtests.multiple_t_tests([[1.0, 2.0, 3.0]], [[5.0, 5.0, 5.0]],
                                      test="welch", method="none")
        row = r["rows"][0]
        assert row["df"] == pytest.approx(2.0)
        assert row["p"] == pytest.approx(sps.ttest_1samp([1, 2, 3], 5).pvalue)

    def test_swap_direction(self):
        r1, r2 = _run("unpaired"), _run("unpaired", swap=True)
        for x, y in zip(r1["rows"], r2["rows"]):
            assert y["difference"] == pytest.approx(-x["difference"])
            assert y["p"] == x["p"]
        assert r2["direction"] == "B - A"

    def test_lognormal_rejects_nonpositive(self):
        r = rowtests.multiple_t_tests([[1.0, 2.0], [0.0, 1.0]],
                                      [[2.0, 3.0], [1.0, 2.0]],
                                      test="lognormal_unpaired", method="none")
        assert r["rows"][1]["p"] is None and r["n_tests"] == 1

    def test_api_handler(self):
        data = {"row_titles": TITLES,
                "datasets": [{"name": "Control", "ys": ROWS_A},
                             {"name": "Treated", "ys": ROWS_B}]}
        out = analyze({"analysis": "multiple_row_tests", "data": data,
                       "options": {"test": "unpaired", "method": "bh",
                                   "q_percent": 1}})
        assert "error" not in out, out.get("traceback")
        assert out["q"] == pytest.approx(0.01)
        assert out["names"] == ["Control", "Treated"]
        assert out["rows"][2]["row"] == "gene3"
        adj = fdr.bh(np.array([row["p"] for row in out["rows"]]))
        assert [row["p_adjusted"] for row in out["rows"]] == pytest.approx(
            list(adj))


class TestRowMeans:
    GUIDE = [[[2, 3, 4]], [[4, 6]], [[7, 8, 9]]]  # 3 data sets, 1 row

    def test_guide_example_dataset_means_first(self):
        r = rowtests.row_means(self.GUIDE, calculate="mean", error="sd")
        row = r["rows"][0]
        assert row["value"] == pytest.approx(5.333, abs=5e-4)
        assert row["sd"] == pytest.approx(2.517, abs=5e-4)
        assert row["n"] == 3

    def test_guide_example_all_values(self):
        r = rowtests.row_means(self.GUIDE, calculate="mean", error="sd",
                               scope="all_values")
        row = r["rows"][0]
        assert row["value"] == pytest.approx(5.375)
        assert row["sd"] == pytest.approx(2.504, abs=5e-4)
        assert row["n"] == 8

    def test_per_dataset(self):
        r = rowtests.row_means(self.GUIDE, calculate="mean", error="sem",
                               scope="dataset")
        assert [d["rows"][0]["value"] for d in r["datasets"]] == \
            pytest.approx([3, 5, 8])
        assert r["datasets"][1]["rows"][0]["sem"] == pytest.approx(1.0)

    def test_totals_medians_geometric(self):
        assert rowtests.row_means(self.GUIDE, calculate="total",
                                  error="none")["rows"][0]["value"] == 43
        med = rowtests.row_means(self.GUIDE, calculate="median",
                                 error="minmax")["rows"][0]
        assert med["value"] == 5 and med["lower"] == 3 and med["upper"] == 8
        q = rowtests.row_means([[[1, 2, 3, 4, 5]]], calculate="median",
                               error="quartiles", scope="all_values")["rows"][0]
        assert (q["lower"], q["upper"]) == (2, 4)
        g = rowtests.row_means(self.GUIDE, calculate="geometric_mean",
                               error="geometric_sd")["rows"][0]
        dsg = [sps.gmean(v[0]) for v in self.GUIDE]
        assert g["value"] == pytest.approx(sps.gmean(dsg))
        assert g["geometric_sd"] == pytest.approx(
            10 ** np.std(np.log10(dsg), ddof=1))

    def test_ci_cv_and_missing(self):
        data = [[[1.0, None], [None]], [[3.0], [5.0, 7.0]]]
        r = rowtests.row_means(data, calculate="mean", error="ci")
        assert r["rows"][0]["n"] == 2 and r["rows"][0]["value"] == 2.0
        half = sps.t.ppf(0.975, 1) * 1.0
        assert r["rows"][0]["ci"] == pytest.approx([2 - half, 2 + half])
        assert r["rows"][1]["n"] == 1 and "ci" not in r["rows"][1]
        cv = rowtests.row_means(self.GUIDE, calculate="mean", error="cv")
        assert cv["rows"][0]["cv_percent"] == pytest.approx(
            100 * 2.5166 / 5.3333, rel=1e-3)

    def test_bad_combination(self):
        with pytest.raises(ValueError):
            rowtests.row_means(self.GUIDE, calculate="total", error="sd")

    def test_api_handler(self):
        out = analyze({"analysis": "row_means",
                       "data": {"datasets": [{"name": "A", "ys": [[2, 3, 4]]},
                                             {"name": "B", "ys": [[4, 6]]},
                                             {"name": "C", "ys": [[7, 8, 9]]}],
                                "row_titles": ["r1"]},
                       "options": {"calculate": "mean", "error": "sd"}})
        assert "error" not in out and out["error_type"] == "sd"
        assert out["rows"][0]["row"] == "r1"
        assert out["rows"][0]["value"] == pytest.approx(16 / 3)
