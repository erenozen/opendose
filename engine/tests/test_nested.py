"""Nested t test and nested one-way ANOVA.

Pinned reference values are the results the GraphPad Prism statistics
guide prints for its own example data:
- "How to: Nested t test" / "Interpreting results: Nested t test":
  Maxwell & Delaney Table 16.4 teaching-method data (unequal subcolumns;
  also GraphPad FAQ 2105). P 0.1477, t 1.792 df 4, F 3.210 (1, 4),
  means 27.48 / 35.63, difference 8.148 +/- 4.548, 95% CI -4.480 to
  20.78, variances 26.63 (within) and 20.26 (among), chi-square 9.004
  (1 df) P 0.0027, goodness of fit df 25 and REML criterion 86.22.
- "Another example of a nested t test": rats, 4 technical replicates.
  P 0.1058, t 2.081 df 4, F 4.332, difference 6.833 +/- 3.283, CI -2.282
  to 15.95, variances 8.500 / 14.04, chi-square 9.244 P 0.0024.
- "Interpreting results: Nested one-way ANOVA": cattle herds. F 43.21
  (2, 6) P 0.0003, variances 2.972 / 0.6458, chi-square 1.089 P 0.2967;
  Dunnett vs. no vector control: -8.667 (-11.42 to -5.912) P 0.0002 and
  -6.250 (-9.005 to -3.495) P 0.0011, SE of difference 0.9623, q 9.007
  and 6.495, DF 6.
- "If P is high, should you pool?": Herd(Treatment) P = 0.1231 (the
  classical nested ANOVA F test of subgroups).
Model fits are also cross-checked against statsmodels MixedLM.
"""

import json
import math
import warnings

import numpy as np
import pytest
from scipy import stats

from opendose import api, nested, ttests, anova

TEACHING = [  # Teaching method A (rooms 1-3), method B (rooms 4-6)
    [[21, 26, 33, 22], [18, 25, 26, 24, 21, 25], [35, 28, 32, 36, 38]],
    [[26, 34, 27], [38, 44, 34, 45, 38], [31, 41, 34, 35, 38, 46]],
]
RATS = [  # Control rats 1-3, treated rats 4-6
    [[18, 23, 22, 19], [19, 16, 13, 14], [23, 26, 27, 22]],
    [[21, 24, 31, 24], [28, 32, 31, 33], [27, 28, 24, 21]],
]
HERDS = [  # Traps + pour-ons, pour-on, no vector control
    [[28, 26, 27, 31], [32, 27, 28, 29], [27, 25, 29, 27]],
    [[25, 24, 27, 23], [26, 28, 29, 27], [25, 26, 24, 23]],
    [[21, 19, 17, 20], [19, 18, 23, 20], [18, 20, 19, 18]],
]


def r4(x):
    """Prism's 4-significant-digit display."""
    return float(f"{x:.4g}")


class TestNestedTTestGuideExamples:
    def test_teaching_methods_unequal_subcolumns(self):
        res = nested.nested_t_test(TEACHING)
        assert round(res["p"], 4) == 0.1477
        assert r4(res["t"]) == 1.792 and res["df"] == 4
        assert r4(res["F"]) == 3.210
        assert (res["df_num"], res["df_den"]) == (1, 4)
        means = [m["mean"] for m in res["group_means"]]
        assert [r4(m) for m in means] == [27.48, 35.63]
        assert r4(res["difference"]) == 8.148
        assert r4(res["se_difference"]) == 4.548
        assert r4(res["ci"][0]) == -4.480 and r4(res["ci"][1]) == 20.78
        # The guide's screenshot of this example (an older results layout)
        # prints 26.63 (SD 5.160) on the "within subcolumns" row and 20.26
        # (SD 4.501) on the "among" row. The numbers match; the row labels
        # there are swapped: the pooled within-room variance of these data
        # is 20.21, and the guide's balanced rat example (within = MS
        # within = 8.500 exactly) fixes which component is which.
        re = res["random_effects"]
        assert r4(re["within_subcolumns"]["variance"]) == 20.26
        assert r4(re["within_subcolumns"]["sd"]) == 4.501
        assert r4(re["among_subcolumns"]["variance"]) == 26.63
        assert r4(re["among_subcolumns"]["sd"]) == 5.160
        sd = res["subcolumns_differ"]
        assert r4(sd["chi_square"]) == 9.004 and sd["df"] == 1
        assert round(sd["p"], 4) == 0.0027
        gof = res["goodness_of_fit"]
        assert gof["df"] == 25
        assert r4(gof["reml_criterion"]) == 86.22
        assert res["data_analyzed"] == {"n_treatments": 2,
                                        "n_subcolumns": 6, "n_values": 29}

    def test_rats_equal_subcolumns(self):
        res = nested.nested_t_test(RATS, names=["Control", "Treated"])
        assert round(res["p"], 4) == 0.1058
        assert r4(res["t"]) == 2.081 and res["df"] == 4
        assert r4(res["F"]) == 4.332
        assert r4(res["difference"]) == 6.833
        assert r4(res["se_difference"]) == 3.283
        assert r4(res["ci"][0]) == -2.282 and r4(res["ci"][1]) == 15.95
        assert [r4(m["mean"]) for m in res["group_means"]] == [20.17, 27.00]
        re = res["random_effects"]
        assert r4(re["within_subcolumns"]["variance"]) == 8.500
        assert r4(re["within_subcolumns"]["sd"]) == 2.915
        assert r4(re["among_subcolumns"]["variance"]) == 14.04
        assert r4(re["among_subcolumns"]["sd"]) == 3.747
        assert r4(res["subcolumns_differ"]["chi_square"]) == 9.244
        assert round(res["subcolumns_differ"]["p"], 4) == 0.0024
        assert res["comparison"] == "Treated - Control"

    def test_options_swap_and_ci_level(self):
        base = nested.nested_t_test(RATS)
        swapped = nested.nested_t_test(RATS, swap=True)
        assert swapped["difference"] == pytest.approx(-base["difference"])
        assert swapped["p"] == pytest.approx(base["p"])
        wide = nested.nested_t_test(RATS, ci_level=0.99)
        half = stats.t.ppf(0.995, 4) * base["se_difference"]
        assert wide["ci"][1] - wide["difference"] == pytest.approx(half)


class TestNestedAnovaGuideExample:
    NAMES = ["Traps + pour-ons", "Pour-on", "Group C"]

    def test_main_results(self):
        res = nested.nested_one_way_anova(HERDS, names=self.NAMES)
        assert r4(res["F"]) == 43.21
        assert (res["df_num"], res["df_den"]) == (2, 6)
        assert round(res["p"], 4) == 0.0003
        re = res["random_effects"]
        assert r4(re["within_subcolumns"]["variance"]) == 2.972
        assert r4(re["within_subcolumns"]["sd"]) == 1.724
        assert r4(re["among_subcolumns"]["variance"]) == 0.6458
        assert r4(re["among_subcolumns"]["sd"]) == 0.8036
        assert re["within_subcolumns"]["percent_of_total"] + \
            re["among_subcolumns"]["percent_of_total"] == pytest.approx(100)
        sd = res["subcolumns_differ"]
        assert r4(sd["chi_square"]) == 1.089
        assert round(sd["p"], 4) == 0.2967
        assert sd["significant_05"] is False
        assert res["data_analyzed"] == {"n_treatments": 3,
                                        "n_subcolumns": 9, "n_values": 36}

    def test_classical_subgroup_f_test(self):
        table = nested.nested_one_way_anova(HERDS)["nested_anova_table"]
        sub = table["subgroups_within_groups"]
        assert (sub["df"], table["within_subgroups"]["df"]) == (6, 27)
        assert round(sub["p"], 4) == 0.1231
        # balanced: the classical groups F equals the mixed-model F
        assert table["groups"]["F"] == pytest.approx(43.205, rel=1e-9)

    def test_dunnett_vs_control(self):
        res = nested.nested_one_way_anova(
            HERDS, names=self.NAMES, comparisons="dunnett", control_index=2)
        mc = res["multiple_comparisons"]
        assert mc["df"] == 6 and mc["n_comparisons_per_family"] == 2
        c1, c2 = mc["comparisons"]
        assert c1["pair"] == "Group C vs. Traps + pour-ons"
        assert r4(c1["difference"]) == -8.667
        assert [r4(v) for v in c1["ci"]] == [-11.42, -5.912]
        assert round(c1["p_adjusted"], 4) == 0.0002
        assert r4(c1["se"]) == 0.9623 and r4(c1["statistic"]) == 9.007
        assert (r4(c1["mean_1"]), r4(c1["mean_2"])) == (19.33, 28.00)
        assert r4(c2["difference"]) == -6.250
        assert [r4(v) for v in c2["ci"]] == [-9.005, -3.495]
        assert round(c2["p_adjusted"], 4) == 0.0011
        assert r4(c2["statistic"]) == 6.495

    @pytest.mark.parametrize("method", ["tukey", "sidak", "holm_sidak",
                                        "bonferroni"])
    def test_balanced_comparisons_equal_anova_of_means(self, method):
        # no missing values: nested ANOVA = one-way ANOVA of subcolumn
        # means (guide's technical note), comparisons included
        means = [[float(np.mean(s)) for s in g] for g in HERDS]
        ref = anova.multiple_comparisons(means, method)["comparisons"]
        res = nested.nested_one_way_anova(HERDS, comparisons=method)
        for o, r in zip(res["multiple_comparisons"]["comparisons"], ref):
            assert o["difference"] == pytest.approx(r["difference"], rel=1e-9)
            assert o["p_adjusted"] == pytest.approx(r["p_adjusted"], rel=1e-6)


    @pytest.mark.parametrize("control", [0, 2])
    def test_balanced_dunnett_equals_anova_of_means(self, control):
        # Both paths now evaluate the same exact Dunnett integral
        # (opendose.dunnett): nested via the model covariance (one-factor
        # correlation 0.5), anova via n per group, so they agree to
        # rounding (~1e-13 here), not just to quasi-Monte Carlo noise.
        # Sign convention differs: mixed-model comparisons are
        # control - group (Prism's nested table), anova's group - control.
        means = [[float(np.mean(s)) for s in g] for g in HERDS]
        ref = anova.multiple_comparisons(means, "dunnett",
                                         control_index=control)
        res = nested.nested_one_way_anova(HERDS, comparisons="dunnett",
                                          control_index=control)
        for o, r in zip(res["multiple_comparisons"]["comparisons"],
                        ref["comparisons"]):
            assert o["difference"] == pytest.approx(-r["difference"],
                                                    rel=1e-9)
            assert o["statistic"] == pytest.approx(r["statistic"], rel=1e-9)
            assert o["p_adjusted"] == pytest.approx(r["p_adjusted"],
                                                    rel=1e-10)
            half_o = (o["ci"][1] - o["ci"][0]) / 2
            half_r = (r["ci"][1] - r["ci"][0]) / 2
            assert half_o == pytest.approx(half_r, rel=1e-10)


class TestNestedEquivalencesAndStatsmodels:
    @pytest.mark.parametrize("seed", [0, 1, 2])
    def test_balanced_equals_t_test_of_subcolumn_means(self, seed):
        rng = np.random.default_rng(seed)
        groups = [[list(rng.normal(10 + g + 0.4 * rng.normal(), 1.0, 4))
                   for _ in range(4)] for g in range(2)]
        res = nested.nested_t_test(groups)
        means = [[float(np.mean(s)) for s in g] for g in groups]
        ref = ttests.unpaired_t(means[1], means[0])
        assert res["t"] == pytest.approx(abs(ref["t"]), rel=1e-8)
        assert res["df"] == ref["df"]
        assert res["p"] == pytest.approx(ref["p_two_tailed"], rel=1e-7)

    def test_negative_variance_policy(self):
        # replicates more variable than subcolumn means: the among-
        # subcolumn variance estimate is negative ("allow", which keeps
        # the t test of means equivalence) or zero ("zero")
        groups = [[[1, 9, 5], [2, 8, 5.5], [1.5, 9.5, 4]],
                  [[3, 11, 7], [2, 12, 6.5], [4, 10, 7]]]
        allow = nested.nested_t_test(groups)
        assert allow["random_effects"]["among_subcolumns"]["variance"] < 0
        assert allow["random_effects"]["among_subcolumns"]["sd"] is None
        means = [[float(np.mean(s)) for s in g] for g in groups]
        ref = ttests.unpaired_t(means[1], means[0])
        assert allow["p"] == pytest.approx(ref["p_two_tailed"], rel=1e-7)
        assert allow["subcolumns_differ"]["chi_square"] == 0
        assert allow["subcolumns_differ"]["p"] == 1.0
        zero = nested.nested_t_test(groups, negative_variance="zero")
        assert zero["random_effects"]["among_subcolumns"]["variance"] == 0
        assert zero["subcolumns_differ"]["chi_square"] == 0

    @pytest.mark.parametrize("seed", [3, 4])
    def test_unbalanced_matches_statsmodels(self, seed):
        pd = pytest.importorskip("pandas")
        smf = pytest.importorskip("statsmodels.formula.api")
        rng = np.random.default_rng(seed)
        groups, rows, sid = [], [], 0
        for g in range(3):
            subs = []
            for _ in range(int(rng.integers(2, 5))):
                u = rng.normal(0, 1.5)
                vals = list(10 + 2 * g + u
                            + rng.normal(0, 1, int(rng.integers(2, 7))))
                subs.append(vals)
                rows += [{"y": v, "g": g, "s": sid} for v in vals]
                sid += 1
            groups.append(subs)
        df = pd.DataFrame(rows)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            sm = smf.mixedlm("y ~ C(g, Sum)", df, groups=df.s).fit(
                reml=True, method="bfgs", gtol=1e-12)
        res = nested.nested_one_way_anova(groups, negative_variance="zero")
        re = res["random_effects"]
        assert re["among_subcolumns"]["variance"] == pytest.approx(
            float(sm.cov_re.iloc[0, 0]), rel=1e-5)
        assert re["within_subcolumns"]["variance"] == pytest.approx(
            sm.scale, rel=1e-5)
        b = sm.fe_params.to_numpy()
        np.testing.assert_allclose(
            [m["mean"] for m in res["group_means"]],
            [b[0] + b[1], b[0] + b[2], b[0] - b[1] - b[2]], rtol=1e-6)
        assert res["goodness_of_fit"]["minus_2_log_restricted_likelihood"] \
            == pytest.approx(-2 * sm.llf, abs=1e-6)
        assert res["df_den"] == sid - 3

    def test_missing_values_and_empty_subcolumns_ignored(self):
        groups = [[[21, 26, None, 33, 22], [18, 25, 26, 24, 21, 25],
                   [35, 28, 32, 36, 38], []],
                  [[26, 34, 27], [38, 44, 34, 45, 38],
                   [31, 41, 34, 35, 38, 46]]]
        res = nested.nested_t_test(groups)
        assert round(res["p"], 4) == 0.1477

    def test_errors(self):
        with pytest.raises(ValueError):
            nested.nested_t_test(HERDS)
        with pytest.raises(ValueError):
            nested.nested_one_way_anova([[[1, 2]], [[3, 4]]])


class TestNestedApi:
    def test_payloads(self):
        payload = {"analysis": "nested_ttest", "data": {"groups": [
            {"name": "Teaching method A", "subgroups": TEACHING[0],
             "subgroup_names": ["Room 1", "Room 2", "Room 3"]},
            {"name": "Teaching method B", "subgroups": TEACHING[1]}]},
            "options": {}}
        out = json.loads(api.analyze_json(json.dumps(payload)))
        assert "error" not in out, out.get("traceback")
        assert out["analysis"] == "nested_t_test"
        assert round(out["p"], 4) == 0.1477
        assert out["subgroup_summaries"][0]["subgroup"] == "Room 1"
        assert len(out["residuals"]["residual"]) == 29

        payload = {"analysis": "nested_anova", "data": {"groups": [
            {"name": n, "subgroups": g} for n, g in
            zip(["Traps + pour-ons", "Pour-on", "Group C"], HERDS)]},
            "options": {"comparisons": "dunnett", "control_index": 2}}
        out = json.loads(api.analyze_json(json.dumps(payload)))
        assert "error" not in out, out.get("traceback")
        assert round(out["p"], 4) == 0.0003
        assert math.isclose(
            out["multiple_comparisons"]["comparisons"][0]["difference"],
            -8.6667, abs_tol=1e-4)
