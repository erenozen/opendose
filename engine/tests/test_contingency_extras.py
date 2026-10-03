"""Contingency extras (test for trend, McNemar, Bowker, CMH, kappa), the
proportions module (one / two proportions, 2 x 2 effect sizes with the
CI methods Prism offers) and Deming regression.

References:
- GraphPad statistics guide worked examples: McNemar 25 vs 4 discordant
  pairs (OR 6.25, 2.158 to 24.710; chi-square with Yates 13.79, P =
  0.0002; binomial P < 0.0001); Doll & Hill odds ratio 2.974 (Woolf
  1.787 to 4.950); AZT relative risk 0.57 and attributable risk 12%,
  NNT 8.3; CI of a proportion 6/85 (Clopper-Pearson 0.0263 to 0.1473).
- Altman (1991), Practical Statistics for Medical Research, Table 10.10:
  test for trend 8.02 (P = 0.005), overall chi-square 9.29 (5 df).
- Fagerland, Lydersen & Laake (2015), Stat Methods Med Res, Tables 3, 5
  and 6 (Perondi et al. 7/34 vs 1/34) and Newcombe (1998) Stat Med
  17:873, Table II (56/70 vs 48/80; 9/10 vs 3/10).
- NCSS Deming Regression documentation, Example 1 (DemingReg1, lambda =
  4): slope 1.00119422781949, intercept -0.0897448990070444, jackknife
  SEs 0.18718 and 1.72199, 95% CIs 0.56956 to 1.43283 and -4.06065 to
  3.88117.
- statsmodels (StratifiedTable, cohens_kappa, SquareTable, mcnemar,
  confint_proportions_2indep, Table.test_ordinal_association).
"""

import math

import numpy as np
import pytest
from scipy import stats as sps

from opendose import deming, proportions, trend
from opendose.api import analyze

SHOES = np.column_stack([[5, 7, 6, 7, 8, 10], [17, 28, 36, 41, 46, 140]])
STRATA = [[[20, 10], [15, 25]], [[12, 18], [8, 30]], [[30, 5], [20, 12]]]
KAPPA = [[22, 5, 2], [4, 18, 6], [1, 3, 25]]


class TestTrend:
    def test_altman_example(self):
        r = trend.chi_square_trend(SHOES)
        assert r["chi2"] == pytest.approx(8.02, abs=0.005)
        assert r["p"] == pytest.approx(0.005, abs=0.0005)
        assert r["overall_chi_square"]["chi2"] == pytest.approx(9.29,
                                                                abs=0.005)
        assert r["departure_from_trend"]["df"] == 4
        assert r["departure_from_trend"]["chi2"] == pytest.approx(
            r["overall_chi_square"]["chi2"] - r["chi2"])

    def test_relation_to_linear_by_linear(self):
        # Altman's statistic uses N; the Mantel linear-by-linear
        # association statistic uses N - 1
        import statsmodels.api as sm
        ref = sm.stats.Table(SHOES).test_ordinal_association(
            row_scores=np.arange(1, 7.0), col_scores=np.array([1, 0.0]))
        n = SHOES.sum()
        assert trend.chi_square_trend(SHOES)["chi2"] * (n - 1) / n == \
            pytest.approx(ref.zscore ** 2, rel=1e-10)

    def test_transposed_and_scores(self):
        r = trend.chi_square_trend(SHOES.T)
        assert r["orientation"] == "columns"
        assert r["chi2"] == pytest.approx(
            trend.chi_square_trend(SHOES)["chi2"])
        # linear rescaling of the scores leaves the test unchanged
        r2 = trend.chi_square_trend(SHOES, scores=[10, 20, 30, 40, 50, 60])
        assert r2["chi2"] == pytest.approx(r["chi2"])

    def test_api_handler_and_contingency_option(self):
        res = analyze({"analysis": "trend_test",
                       "data": {"table": SHOES.tolist()}})
        assert res["chi2"] == pytest.approx(8.0237, abs=1e-4)
        res = analyze({"analysis": "contingency",
                       "data": {"table": SHOES.tolist()},
                       "options": {"trend": True, "effect_sizes": True}})
        assert res["trend"]["chi2"] == pytest.approx(8.0237, abs=1e-4)
        assert 0 < res["cramers_v"]["value"] < 1


class TestMcNemar:
    def test_guide_example(self):
        r = trend.mcnemar([[13, 25], [4, 92]])
        assert r["odds_ratio"]["value"] == 6.25
        assert r["odds_ratio"]["ci"][0] == pytest.approx(2.158, abs=5e-4)
        assert r["odds_ratio"]["ci"][1] == pytest.approx(24.710, abs=5e-4)
        assert r["chi_square_yates"]["chi2"] == pytest.approx(13.79,
                                                              abs=0.005)
        assert r["chi_square_yates"]["p"] == pytest.approx(0.0002, abs=5e-5)
        # the guide says "less than 0.0001" for the binomial test; the
        # exact two-sided value is 0.000104 (one-sided 0.000052)
        assert r["binomial"]["p_two_tailed"] == pytest.approx(1.0372e-4,
                                                              abs=5e-8)
        assert r["binomial"]["p_one_tailed"] < 0.0001

    def test_against_statsmodels(self):
        from statsmodels.stats.contingency_tables import mcnemar
        t = np.array([[13, 25], [4, 92]])
        r = trend.mcnemar(t)
        assert r["binomial"]["p_two_tailed"] == pytest.approx(
            mcnemar(t, exact=True).pvalue)
        assert r["chi_square"]["chi2"] == pytest.approx(
            mcnemar(t, exact=False, correction=False).statistic)

    def test_bowker_for_larger_tables(self):
        from statsmodels.stats.contingency_tables import SquareTable
        b = np.array([[10, 5, 2], [3, 20, 4], [6, 1, 15]])
        r = analyze({"analysis": "mcnemar", "data": {"table": b.tolist()}})
        ref = SquareTable(b).symmetry()
        assert r["test"] == "bowker"
        assert r["chi2"] == pytest.approx(ref.statistic)
        assert r["df"] == ref.df and r["p"] == pytest.approx(ref.pvalue)

    def test_no_discordant_pairs(self):
        r = trend.mcnemar([[5, 0], [0, 7]])
        assert r["odds_ratio"] is None and "note" in r


class TestCMH:
    def test_against_statsmodels(self):
        from statsmodels.stats.contingency_tables import StratifiedTable
        st = StratifiedTable([np.array(t) for t in STRATA])
        r = trend.cmh(STRATA)
        assert r["odds_ratio"]["value"] == pytest.approx(st.oddsratio_pooled)
        lo, hi = st.oddsratio_pooled_confint()
        assert r["odds_ratio"]["ci"] == pytest.approx([lo, hi])
        assert r["cmh_test"]["chi2"] == pytest.approx(
            st.test_null_odds(correction=False).statistic)
        rc = trend.cmh(STRATA, correction=True)
        assert rc["cmh_test"]["chi2"] == pytest.approx(
            st.test_null_odds(correction=True).statistic)
        assert r["breslow_day"]["chi2"] == pytest.approx(
            st.test_equal_odds(adjust=False).statistic)
        assert r["breslow_day"]["chi2_tarone"] == pytest.approx(
            st.test_equal_odds(adjust=True).statistic)
        assert r["relative_risk"]["value"] == pytest.approx(
            st.riskratio_pooled)

    def test_single_stratum_reduces_to_woolf_and_katz(self):
        t = [[20, 10], [15, 25]]
        r = trend.cmh([t])
        woolf = proportions.odds_ratio(t, method="woolf")
        katz = proportions.relative_risk(t, method="katz")
        assert r["odds_ratio"]["ci"] == pytest.approx(woolf["ci"])
        assert r["relative_risk"]["ci"] == pytest.approx(katz["ci"])

    def test_api(self):
        res = analyze({"analysis": "cmh",
                       "data": {"tables": STRATA,
                                "strata_names": ["x", "y", "z"]}})
        assert res["n_strata"] == 3 and res["strata"][1]["name"] == "y"


class TestKappa:
    @pytest.mark.parametrize("weights", [None, "linear", "quadratic"])
    def test_against_statsmodels(self, weights):
        from statsmodels.stats.inter_rater import cohens_kappa
        r = trend.kappa(KAPPA, weights=weights)
        ref = cohens_kappa(np.array(KAPPA), wt=weights)
        assert r["kappa"] == pytest.approx(ref.kappa, rel=1e-12)
        assert r["se"] == pytest.approx(ref.std_kappa, rel=1e-10)
        assert r["se_null"] == pytest.approx(ref.std_kappa0, rel=1e-10)
        assert r["p"] == pytest.approx(ref.pvalue_two_sided, rel=1e-8)

    def test_perfect_agreement_and_api(self):
        r = trend.kappa([[10, 0], [0, 15]])
        assert r["kappa"] == 1.0 and r["strength"] == "very good"
        res = analyze({"analysis": "kappa", "data": {"table": KAPPA},
                       "options": {"weights": "linear"}})
        assert res["weights"] == "linear" and res["ci"][0] < res["kappa"]


class TestProportions:
    PERONDI = [[7, 27], [1, 33]]

    def test_published_intervals(self):
        # Fagerland, Lydersen & Laake (2015), Tables 3, 5 and 6
        lo, hi = proportions.difference_ci(7, 34, 1, 34, method="newcombe")
        assert (round(lo, 3), round(hi, 2)) == (0.019, 0.34)
        lo, hi = proportions.koopman_ci(7, 34, 1, 34)
        assert (round(lo, 2), round(hi)) == (1.22, 43)  # paper: 1.21, 43
        k = proportions.relative_risk(self.PERONDI, method="katz")["ci"]
        assert (round(k[0], 2), round(k[1])) == (0.91, 54)
        w = proportions.odds_ratio(self.PERONDI, method="woolf")["ci"]
        assert (round(w[0], 2), round(w[1])) == (0.99, 74)
        bp = proportions.baptista_pike_ci(self.PERONDI)
        assert (round(bp[0], 2), round(bp[1])) == (1.00, 195)
        mp = proportions.baptista_pike_ci(self.PERONDI, midp=True)
        assert (round(mp[0], 2), round(mp[1])) == (1.33, 99)

    def test_koopman_matches_statsmodels_score_ratio(self):
        from statsmodels.stats.proportion import confint_proportions_2indep
        for x1, n1, x2, n2 in [(7, 34, 1, 34), (15, 40, 9, 45),
                               (3, 12, 8, 13)]:
            ref = confint_proportions_2indep(x1, n1, x2, n2, method="score",
                                             compare="ratio",
                                             correction=False)
            assert proportions.koopman_ci(x1, n1, x2, n2) == pytest.approx(
                list(ref), rel=1e-7)

    def test_newcombe_1998_table_ii(self):
        lo, hi = proportions.difference_ci(56, 70, 48, 80, method="newcombe")
        assert (round(lo, 4), round(hi, 4)) == (0.0524, 0.3339)
        lo, hi = proportions.difference_ci(56, 70, 48, 80,
                                           method="newcombe_cc")
        assert (round(lo, 4), round(hi, 4)) == (0.0428, 0.3422)
        lo, hi = proportions.difference_ci(9, 10, 3, 10, method="newcombe_cc")
        assert (round(lo, 4), round(hi, 4)) == (0.1013, 0.8387)

    def test_baptista_pike_is_exact_inversion(self):
        # at each limit the BP P value (sum of probabilities no larger
        # than the observed table's) equals alpha
        t = [[12, 5], [6, 14]]
        lo, hi = proportions.baptista_pike_ci(t)

        def pval(theta):
            return proportions._bp_pvalue(math.log(theta), 12, 17, 20, 18,
                                          False)
        # P(theta) is a step function of theta: inside the limits it
        # exceeds alpha, just outside it does not
        assert pval(lo * (1 + 1e-6)) > 0.05 >= pval(lo * (1 - 1e-6))
        assert pval(hi * (1 - 1e-6)) > 0.05 >= pval(hi * (1 + 1e-6))
        for th in np.exp(np.linspace(math.log(lo), math.log(hi), 50)[1:-1]):
            assert pval(th) > 0.05
        # symmetric tables give reciprocal limits
        a = proportions.baptista_pike_ci([[0, 10], [5, 5]])
        b = proportions.baptista_pike_ci([[10, 0], [5, 5]])
        assert a[0] == 0.0 and b[1] == math.inf
        assert a[1] == pytest.approx(1 / b[0], rel=1e-8)

    def test_guide_examples(self):
        doll_hill = proportions.odds_ratio([[688, 650], [21, 59]],
                                           method="woolf")
        assert doll_hill["value"] == pytest.approx(2.974, abs=5e-4)
        # guide: 1.787 to 4.950 (Woolf with z = 1.96 or 1.95996 gives
        # 4.9494; the guide's last digit differs by 6e-4)
        assert doll_hill["ci"] == pytest.approx([1.787, 4.950], abs=1e-3)
        azt = proportions.two_by_two_effects([[76, 399], [129, 332]])
        assert azt["relative_risk"]["value"] == pytest.approx(0.57, abs=0.005)
        assert azt["difference"]["value"] == pytest.approx(-0.12, abs=0.005)
        assert abs(azt["nnt"]["value"]) == pytest.approx(8.3, abs=0.05)
        assert proportions.one_proportion(
            6, 85, ci_method="clopper_pearson")["ci"] == pytest.approx(
            [0.0263, 0.1473], abs=5e-5)

    def test_diagnostic_measures(self):
        # rows = condition present / absent, columns = test + / -
        d = proportions.diagnostic_measures([[90, 10], [30, 170]])
        assert d["sensitivity"]["value"] == 0.9
        assert d["specificity"]["value"] == 0.85
        assert d["positive_predictive_value"]["value"] == 0.75
        assert d["negative_predictive_value"]["value"] == 170 / 180
        assert d["likelihood_ratio"]["value"] == pytest.approx(0.9 / 0.15)
        lo, hi = d["likelihood_ratio"]["ci"]
        assert lo < 6 < hi
        alt = proportions.diagnostic_measures([[90, 30], [10, 170]],
                                              layout="rows_test")
        assert alt["sensitivity"] == d["sensitivity"]

    def test_phi(self):
        t = [[20, 10], [15, 25]]
        chi2 = sps.chi2_contingency(t, correction=False)[0]
        phi = proportions.two_by_two_effects(t)["phi"]
        assert abs(phi) == pytest.approx(math.sqrt(chi2 / 70))

    def test_two_proportions_and_api(self):
        r = proportions.compare_two_proportions(7, 34, 1, 34)
        assert r["fisher_exact"]["p"] == pytest.approx(0.054, abs=5e-4)
        chi2 = sps.chi2_contingency(self.PERONDI, correction=False)[0]
        assert r["z_test"]["chi2"] == pytest.approx(chi2)
        chi2y = sps.chi2_contingency(self.PERONDI, correction=True)[0]
        assert r["z_test_yates"]["chi2"] == pytest.approx(chi2y)
        res = analyze({"analysis": "proportion_test",
                       "data": {"groups": [{"successes": 7, "trials": 34},
                                           {"successes": 1, "trials": 34}]},
                       "options": {"or_ci": "baptista_pike_midp",
                                   "diff_ci": "newcombe"}})
        assert res["odds_ratio"]["ci"][0] == pytest.approx(1.33, abs=0.005)
        assert res["difference_ci"]["ci"][0] == pytest.approx(0.0189,
                                                              abs=1e-4)
        res = analyze({"analysis": "proportion_test",
                       "data": {"successes": 7, "trials": 100},
                       "options": {"p0": 0.2}})
        assert res["binomial_test"]["p_two_tailed"] == pytest.approx(
            0.00061307, abs=5e-9)

    def test_contingency_effect_sizes_option(self):
        res = analyze({"analysis": "contingency",
                       "data": {"table": self.PERONDI},
                       "options": {"effect_sizes": True}})
        eff = res["effect_sizes"]
        assert eff["odds_ratio"]["ci_method"] == "baptista_pike"
        assert eff["relative_risk"]["ci_method"] == "koopman"
        assert eff["difference"]["ci_method"] == "newcombe_cc"
        plain = analyze({"analysis": "contingency",
                         "data": {"table": self.PERONDI}})
        assert "effect_sizes" not in plain


class TestDeming:
    X = [7, 8.3, 10.5, 9, 5.1, 8.2, 10.2, 10.3, 7.1, 5.9]
    Y = [7.9, 8.2, 9.6, 9, 6.5, 7.3, 10.2, 10.6, 6.3, 5.2]

    def test_ncss_example(self):
        r = deming.deming(self.X, self.Y, sd_x=math.sqrt(0.032),
                          sd_y=math.sqrt(0.008), se_method="jackknife")
        assert r["lambda"] == pytest.approx(4.0)
        assert r["slope"]["value"] == pytest.approx(1.00119422781949,
                                                    rel=1e-12)
        assert r["y_intercept"]["value"] == pytest.approx(
            -0.0897448990070444, rel=1e-10)
        assert r["slope"]["se"] == pytest.approx(0.18718, abs=5e-6)
        assert r["y_intercept"]["se"] == pytest.approx(1.72199, abs=5e-6)
        assert r["slope"]["ci"] == pytest.approx([0.56956, 1.43283],
                                                 abs=5e-6)
        assert r["y_intercept"]["ci"] == pytest.approx([-4.06065, 3.88117],
                                                       abs=5e-6)

    def test_prism_faq_standard_errors(self):
        r = deming.deming(self.X, self.Y, lam=4.0)
        x, y = np.array(self.X), np.array(self.Y)
        n = x.size
        rr = (((x - x.mean()) * (y - y.mean())).sum() ** 2
              / ((x - x.mean()) ** 2).sum() / ((y - y.mean()) ** 2).sum())
        b = r["slope"]["value"]
        se_b = math.sqrt(b * b * (1 - rr) / (rr * (n - 2)))
        assert r["slope"]["se"] == pytest.approx(se_b)
        assert r["y_intercept"]["se"] == pytest.approx(
            se_b * math.sqrt((x ** 2).sum() / n))
        t = sps.t.ppf(0.975, n - 2)
        assert r["slope"]["ci"] == pytest.approx([b - t * se_b, b + t * se_b])
        # the slope test equals the test of the Pearson correlation
        assert r["slope_test"]["p"] == pytest.approx(sps.pearsonr(x, y)[1])

    def test_y_at_x0_equals_intercept_after_shifting_x(self):
        r = deming.deming(self.X, self.Y, x0=8.0)
        shifted = deming.deming(np.array(self.X) - 8.0, self.Y)
        assert r["y_at_x0"]["value"] == pytest.approx(
            shifted["y_intercept"]["value"])
        assert r["y_at_x0"]["se"] == pytest.approx(
            shifted["y_intercept"]["se"])

    def test_equal_errors_is_orthogonal_regression(self):
        r = deming.deming(self.X, self.Y)
        w, v = np.linalg.eigh(np.cov(self.X, self.Y))
        assert r["slope"]["value"] == pytest.approx(v[1, 1] / v[0, 1])
        assert r["error_model"] == "equal"

    def test_lambda_from_sds_and_duplicates(self):
        a = deming.deming(self.X, self.Y, sd_x=0.5, sd_y=2.0)
        b = deming.deming(self.X, self.Y, lam=0.0625)
        assert a["slope"]["value"] == pytest.approx(b["slope"]["value"])
        # rescaling Y by sqrt(lambda) turns it into orthogonal regression
        c = deming.deming(self.X, np.array(self.Y) * 0.25)
        assert a["slope"]["value"] == pytest.approx(c["slope"]["value"] / 0.25)
        assert deming.duplicate_sd([1, 2, 3], [1.5, 2, 2]) == pytest.approx(
            math.sqrt((0.25 + 0 + 1) / 6))

    def test_api(self):
        data = {"x": self.X,
                "datasets": [{"name": "B", "ys": [[v] for v in self.Y]},
                             {"name": "bad", "ys": [[1.0]] * 10}]}
        res = analyze({"analysis": "deming", "data": data,
                       "options": {"lambda": 4, "compare_identity": True}})
        fit = res["datasets"][0]["fit"]
        assert fit["slope"]["value"] == pytest.approx(1.00119422781949)
        assert "identity_test" in fit and len(fit["curve"]["x"]) == 200
        assert "error" in res["datasets"][1]
