"""Parts-of-whole analyses: chi-square goodness of fit, binomial test,
fraction of total with CIs of proportions.

Reference values: the GraphPad statistics guide worked examples (binomial
test 7 of 100 vs 20%; Mendel's peas, P = 0.93; CI of a proportion 6/85 =
0.0263 to 0.1473), scipy (chisquare, binomtest), statsmodels
(proportion_confint), and the Brown-Cai-DasGupta (2001) modified Wilson
limits as coded in R DescTools::BinomCI(method = "modified wilson").
"""

import math

import pytest
from scipy import stats
from statsmodels.stats.proportion import proportion_confint

from opendose import partsofwhole as pw
from opendose.api import analyze


class TestBinomial:
    def test_guide_worked_example(self):
        # 7 events in 100 trials, expected 20%: one-tail P = 0.0003 (the
        # 0.0002769 lower tail), two-tail by the method of small P values
        # = 0.0002769 + 0.00033609 = 0.00061307.
        res = pw.binomial_test(7, 100, 0.2)
        assert res["p_one_tailed"] == pytest.approx(0.00027699, abs=5e-9)
        assert res["p_two_tailed"] == pytest.approx(0.00061307, abs=5e-9)
        assert stats.binom.sf(34, 100, 0.2) == pytest.approx(0.00033609,
                                                             abs=5e-9)

    def test_upper_tail_one_sided(self):
        res = pw.binomial_test(30, 100, 0.2)
        assert res["p_one_tailed"] == pytest.approx(stats.binom.sf(29, 100, 0.2))


class TestChiSquareGoodnessOfFit:
    MENDEL = [315, 108, 101, 32]  # round/yellow, round/green, wrinkled/...

    def test_mendel_guide_example(self):
        res = pw.chisq_goodness_of_fit(self.MENDEL, [9, 3, 3, 1],
                                       categories=["RY", "RG", "WY", "WG"])
        chi2 = stats.chisquare(self.MENDEL,
                               [556 * f for f in (9 / 16, 3 / 16, 3 / 16, 1 / 16)])
        assert res["chi_square"]["chi2"] == pytest.approx(chi2.statistic)
        assert res["chi_square"]["chi2"] == pytest.approx(0.4700, abs=1e-4)
        assert res["chi_square"]["df"] == 3
        assert res["chi_square"]["p"] == pytest.approx(chi2.pvalue)
        assert round(res["chi_square"]["p"], 2) == 0.93  # the guide's value
        first = res["categories"][0]
        assert first["name"] == "RY"
        assert first["expected"] == pytest.approx(312.75)
        assert first["expected_fraction"] == pytest.approx(0.5625)
        assert first["observed_fraction"] == pytest.approx(315 / 556)
        assert first["contribution"] == pytest.approx((315 - 312.75) ** 2 / 312.75)
        assert sum(c["contribution"] for c in res["categories"]) == \
            pytest.approx(res["chi_square"]["chi2"])
        assert "binomial" not in res

    def test_expected_forms_are_equivalent(self):
        as_counts = pw.chisq_goodness_of_fit(
            self.MENDEL, [312.75, 104.25, 104.25, 34.75])
        as_pct = pw.chisq_goodness_of_fit(self.MENDEL, [56.25, 18.75, 18.75, 6.25])
        as_frac = pw.chisq_goodness_of_fit(self.MENDEL,
                                           [0.5625, 0.1875, 0.1875, 0.0625])
        assert as_counts["expected_entered_as"] == "counts"
        assert as_pct["expected_entered_as"] == "percent"
        assert as_frac["expected_entered_as"] == "fraction"
        for r in (as_pct, as_frac):
            assert r["chi_square"]["chi2"] == pytest.approx(
                as_counts["chi_square"]["chi2"])

    def test_two_categories_adds_binomial(self):
        res = pw.chisq_goodness_of_fit([7, 93], [20, 80])
        assert res["recommended"] == "binomial"
        assert res["binomial"]["p_two_tailed"] == pytest.approx(0.00061307,
                                                                abs=5e-9)
        assert res["chi_square"]["p"] == pytest.approx(
            stats.chisquare([7, 93], [20, 80]).pvalue)  # no Yates

    def test_small_expected_warns_and_bad_input(self):
        assert "warning" in pw.chisq_goodness_of_fit([3, 2, 5], [1, 1, 1])
        with pytest.raises(ValueError):
            pw.chisq_goodness_of_fit([1, 2], [1, 2, 3])
        with pytest.raises(ValueError):
            pw.chisq_goodness_of_fit([1, -2], [1, 1])
        with pytest.raises(ValueError):
            pw.chisq_goodness_of_fit([1, 2], [0, 1])


def _desc_tools_modified_wilson(x, n, level=0.95):
    """Independent transcription of DescTools .binomci.wilson_mod."""
    alpha = 1 - level
    lo, hi = proportion_confint(x, n, alpha=alpha, method="wilson")
    if (n <= 50 and x in (1, 2)) or (n >= 51 and x in (1, 2, 3)):
        lo = 0.5 * stats.chi2.ppf(alpha, 2 * x) / n
    if (n <= 50 and x in (n - 1, n - 2)) or (n >= 51 and x in (n - 1, n - 2, n - 3)):
        hi = 1 - 0.5 * stats.chi2.ppf(alpha, 2 * (n - x)) / n
    return lo, hi


class TestProportionCI:
    def test_guide_example_6_of_85_clopper_pearson(self):
        lo, hi = pw.proportion_ci(6, 85, method="clopper_pearson")
        assert lo == pytest.approx(0.0263, abs=5e-5)
        assert hi == pytest.approx(0.1473, abs=5e-5)
        ref = proportion_confint(6, 85, method="beta")
        assert (lo, hi) == pytest.approx(ref)

    @pytest.mark.parametrize("x,n", [(0, 20), (6, 85), (20, 20), (13, 40)])
    def test_wilson_matches_statsmodels(self, x, n):
        assert pw.proportion_ci(x, n, method="wilson") == pytest.approx(
            list(proportion_confint(x, n, method="wilson")))

    @pytest.mark.parametrize("x,n", [(1, 20), (2, 20), (3, 20), (3, 60),
                                     (19, 20), (18, 20), (57, 60), (30, 60),
                                     (0, 30), (30, 30)])
    def test_wilson_brown_matches_modified_wilson(self, x, n):
        got = pw.proportion_ci(x, n)
        assert got == pytest.approx(list(_desc_tools_modified_wilson(x, n)))
        if x not in (1, 2, 3, n - 1, n - 2, n - 3):
            assert got == pytest.approx(pw.proportion_ci(x, n, method="wilson"))

    def test_wilson_brown_lower_limit_value(self):
        # x = 1, n = 20: lower limit = chi2_0.05(df 2) / 40
        lo, _ = pw.proportion_ci(1, 20)
        assert lo == pytest.approx(-2 * math.log(0.95) / 40)


class TestFractionOfTotal:
    COLS = [[10, 20, None, 70], [5, 5, 10, 30]]

    def test_column_row_grand(self):
        col = pw.fraction_of_total(self.COLS)
        assert col["fractions"][0] == pytest.approx([0.1, 0.2, None, 0.7])
        assert col["column_totals"] == [100, 50]
        row = pw.fraction_of_total(self.COLS, divide_by="row", as_percent=True)
        assert row["fractions"][0][0] == pytest.approx(100 * 10 / 15)
        assert row["fractions"][1][2] == pytest.approx(100.0)
        grand = pw.fraction_of_total(self.COLS, divide_by="grand")
        assert grand["grand_total"] == 150
        assert grand["fractions"][1][3] == pytest.approx(0.2)

    def test_ci_and_counts_only(self):
        res = pw.fraction_of_total([[6, 79]], ci=True,
                                   ci_method="clopper_pearson", as_percent=True)
        assert res["ci_lo"][0][0] == pytest.approx(2.63, abs=5e-3)
        assert res["ci_hi"][0][0] == pytest.approx(14.73, abs=5e-3)
        wb = pw.fraction_of_total([[1, 19]], ci=True)
        assert [wb["ci_lo"][0][0], wb["ci_hi"][0][0]] == pytest.approx(
            list(_desc_tools_modified_wilson(1, 20)))
        with pytest.raises(ValueError):
            pw.fraction_of_total([[1.5, 2]], ci=True)


class TestAPI:
    def test_chisq_goodness_of_fit_payload(self):
        r = analyze({"analysis": "chisq_goodness_of_fit",
                     "data": {"datasets": [{"name": "Peas", "ys": [
                         [315], [108], [101], [32]]}],
                              "row_titles": ["RY", "RG", "WY", "WG"]},
                     "options": {"expected": [56.25, 18.75, 18.75, 6.25]}})
        assert r["name"] == "Peas"
        assert r["categories"][3]["name"] == "WG"
        assert r["chi_square"]["p"] == pytest.approx(0.9254, abs=1e-4)

    def test_fraction_of_total_payloads(self):
        r = analyze({"analysis": "fraction_of_total",
                     "data": {"datasets": [{"name": "A", "ys": [[1], [3]]},
                                           {"name": "B", "values": [2, 2]}]},
                     "options": {"divide_by": "grand", "ci": True}})
        assert r["names"] == ["A", "B"]
        assert r["fractions"][0] == pytest.approx([0.125, 0.375])
        assert r["ci_lo"][0][0] is not None
        r = analyze({"analysis": "fraction_of_total",
                     "data": {"table": [[1, 2], [3, 4]]},
                     "options": {"divide_by": "row"}})
        assert r["fractions"] == [[pytest.approx(1 / 3), pytest.approx(3 / 7)],
                                  [pytest.approx(2 / 3), pytest.approx(4 / 7)]]
