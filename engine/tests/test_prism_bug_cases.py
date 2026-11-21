"""Reported GraphPad Prism calculation bugs, re-run against OpenDose.

Each test cites the case number of a research note on reported Prism
bugs (Prism release notes 8.0 to 11.2 and the GraphPad knowledge base,
read in November 2026; the note itself is kept outside the repository)
and the GraphPad source that describes the Prism bug. The tests check that OpenDose does not have the
same defect. Expected values are exact only where they are derived by hand
here, taken from a published table, or computed with R (the R code is in a
comment next to the value); otherwise the tests check invariants.

Cases already covered by other test files are not repeated here (#1, #2,
#3, #4, #5, #6, #9, #11, #12, #13, #14, #16).

A test marked xfail(strict=True) records a defect found in OpenDose; its
reason says what is wrong. It is not fixed here.
"""

from __future__ import annotations

import json
import math
import signal
from itertools import combinations

import numpy as np
import pytest
from scipy import stats

from opendose import (anova, api, dunnett, fdr, formulas, interpolate, nlfit,
                      proportions, threeway, ttests)
from opendose import userequation as ue
from opendose.equations import _shift, _shift_log  # EC50-shift equations


def _run(analysis, data, options=None):
    res = api.analyze({"analysis": analysis, "data": data,
                       "options": options or {}})
    assert "error" not in res, res.get("error")
    return res


def _floats(obj):
    """Every float anywhere in a nested result."""
    if isinstance(obj, float):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _floats(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            yield from _floats(v)


# ===================================================== two-way RM ANOVA

def _rm_design():
    """4 time points (rows) x 3 groups (columns), 4 subjects per group
    (subcolumn = subject), balanced and complete. Fixed numbers (rounded
    from a seeded simulation) so the expected values below stay put."""
    rng = np.random.default_rng(7)
    a, b, n = 4, 3, 4
    subj = rng.normal(0, 3, (b, n))
    cells = [[[round(float(10 + i * 1.5 + j * 2 + i * j * 0.7 + subj[j, s]
                           + rng.normal(0, 1)), 3) for s in range(n)]
              for j in range(b)] for i in range(a)]
    datasets = [{"name": f"G{j}", "ys": [cells[i][j] for i in range(a)]}
                for j in range(b)]
    return datasets, a, b, n


RM_DATASETS, RM_A, RM_B, RM_N = _rm_design()


def _rm_anova_table():
    res = _run("rm_two_way", {"datasets": RM_DATASETS})
    return res["sources"]


class TestCase18RMTwoWayPostTests:
    """#18. Prism 3-4.02: post tests after two-way RM ANOVA (rows = time
    points, groups in columns) used MS_subject instead of the within-cells
    mean square (SS_subj + SS_res) / (df_subj + df_res) with df = df_subj +
    df_res; the correct results equal the post tests of an ordinary
    two-way ANOVA. GraphPad FAQ 1106,
    https://www.graphpad.com/support/faq/the-results-of-post-tests-after-two-way-repeated-measures-anova-seem-wrong/
    and https://www.graphpad.com/support/faqid/1265/ ."""

    METHODS = ("sidak", "bonferroni", "tukey")

    def _pair(self, method):
        rm = _run("mixed_rm_twoway", {"datasets": RM_DATASETS},
                  {"comparisons": method,
                   "direction": "columns_within_rows"})["multiple_comparisons"]
        ordinary = _run("two_way_anova", {"datasets": RM_DATASETS},
                        {"comparisons": method,
                         "direction": "columns_within_rows"}
                        )["multiple_comparisons"]
        return rm, ordinary

    @pytest.mark.parametrize("method", METHODS)
    def test_between_group_se_is_the_within_cells_mean_square(self, method):
        rm, ordinary = self._pair(method)
        src = _rm_anova_table()
        ms_wc = ((src["subjects"]["ss"] + src["residual"]["ss"])
                 / (src["subjects"]["df"] + src["residual"]["df"]))
        se_expected = math.sqrt(ms_wc * 2.0 / RM_N)
        assert len(rm["comparisons"]) == len(ordinary["comparisons"]) == 12
        for x, y in zip(rm["comparisons"], ordinary["comparisons"]):
            assert x["pair"] == y["pair"]
            assert x["difference"] == pytest.approx(y["difference"], rel=1e-9)
            assert x["se"] == pytest.approx(y["se"], rel=1e-7)
            assert x["se"] == pytest.approx(se_expected, rel=1e-7)
            assert x["family_size"] == y["family_size"]

    @pytest.mark.xfail(strict=True, reason=(
        "#18: mixedmodel.mixed_rm_two_way tests the between-group simple "
        "effects at each row (direction columns_within_rows) on df_int = "
        "the residual df (containment, here 27) instead of the within-cells "
        "df_subj + df_res (here 36) that GraphPad FAQ 1106 gives and the "
        "ordinary two-way ANOVA uses, so the P values and CIs differ (e.g. "
        "Sidak G0 vs G2 at row 1: 0.3973 vs 0.3794) although the SE is right"))
    @pytest.mark.parametrize("method", METHODS)
    def test_between_group_df_and_p_equal_ordinary_two_way(self, method):
        rm, ordinary = self._pair(method)
        src = _rm_anova_table()
        df_wc = src["subjects"]["df"] + src["residual"]["df"]
        assert ordinary["df_residual"] == df_wc == 36
        for x, y in zip(rm["comparisons"], ordinary["comparisons"]):
            assert x["df"] == df_wc
            assert x["p_adjusted"] == pytest.approx(y["p_adjusted"], rel=1e-6)
            assert x["ci"] == pytest.approx(y["ci95"], rel=1e-6)

    def test_within_subject_comparisons_use_ms_residual(self):
        # times compared within one group: the subject effect cancels, so
        # SE = sqrt(2 MS_res / n) on df_res (the RM ANOVA residual)
        src = _rm_anova_table()
        mc = _run("mixed_rm_twoway", {"datasets": RM_DATASETS},
                  {"comparisons": "sidak",
                   "direction": "rows_within_columns"})["multiple_comparisons"]
        se = math.sqrt(2 * src["residual"]["ms"] / RM_N)
        assert len(mc["comparisons"]) == RM_B * math.comb(RM_A, 2)
        for c in mc["comparisons"]:
            assert c["se"] == pytest.approx(se, rel=1e-6)
            assert c["df"] == src["residual"]["df"]


class TestCase15And17RMComparisonsWithoutSphericity:
    """#15. Prism 8.0-8.3: multiple comparisons after two-way RM ANOVA with
    the Geisser-Greenhouse correction were wrong for main-effect
    comparisons and for comparisons within a repeated factor (Prism 8.4
    disabled them). GraphPad FAQ 2172,
    https://www.graphpad.com/support/faq/multiple-comparisons-2-way-RM-ANOVA-no-sphericity/
    #17. Before Prism 10.3.0: RM ANOVA multiple comparisons without
    sphericity did not compute the SEM from only the available paired
    differences. https://www.graphpad.com/updates/prism-10-3-0-release-notes

    OpenDose does not apply GG to two-way RM comparisons (the mixed model
    compares estimated marginal means on containment df); these tests
    check what it reports is internally consistent, and that the one-way
    "per_pair" error uses only each pair's own differences."""

    def test_main_effect_comparisons_use_the_right_error_term(self):
        src = _rm_anova_table()
        n_subj = RM_B * RM_N
        rows = _run("mixed_rm_twoway", {"datasets": RM_DATASETS},
                    {"comparisons": "sidak", "direction": "row_means"}
                    )["multiple_comparisons"]
        # repeated factor (rows): its marginal means differ only within
        # subjects -> sqrt(2 MS_res / N_subjects), df_res
        for c in rows["comparisons"]:
            assert c["se"] == pytest.approx(
                math.sqrt(2 * src["residual"]["ms"] / n_subj), rel=1e-6)
            assert c["df"] == src["residual"]["df"]
        cols = _run("mixed_rm_twoway", {"datasets": RM_DATASETS},
                    {"comparisons": "sidak", "direction": "column_means"}
                    )["multiple_comparisons"]
        # between-subject factor (columns): sqrt(2 MS_subj / (rows * n)),
        # df_subj -- the same as the RM ANOVA's F test for that factor
        for c in cols["comparisons"]:
            assert c["se"] == pytest.approx(
                math.sqrt(2 * src["subjects"]["ms"] / (RM_A * RM_N)),
                rel=1e-6)
            assert c["df"] == src["subjects"]["df"]

    @pytest.mark.parametrize("direction", ["row_means", "column_means",
                                           "columns_within_rows",
                                           "rows_within_columns"])
    @pytest.mark.parametrize("method", ["sidak", "bonferroni", "fisher"])
    def test_p_below_alpha_iff_ci_excludes_zero(self, direction, method):
        mc = _run("mixed_rm_twoway", {"datasets": RM_DATASETS},
                  {"comparisons": method, "direction": direction}
                  )["multiple_comparisons"]
        for c in mc["comparisons"]:
            lo, hi = c["ci"]
            assert lo <= c["difference"] <= hi
            if abs(c["p_adjusted"] - 0.05) > 1e-9:
                assert (c["p_adjusted"] < 0.05) == (lo > 0 or hi < 0)

    def test_per_pair_se_uses_only_that_pairs_differences(self):
        # RM one-way, 6 subjects x 3 treatments, subject 4 incomplete
        a = [10.1, 12.3, 9.8, 11.0, 10.6, 13.2]
        b = [11.4, 13.0, 10.9, None, 11.9, 13.8]
        c = [12.9, 13.1, 12.2, 12.5, 13.4, 15.0]
        data = {"datasets": [{"name": nm, "ys": [[v] for v in vals]}
                             for nm, vals in (("A", a), ("B", b), ("C", c))]}
        res = _run("rm_anova", data,
                   {"comparisons": {"method": "bonferroni",
                                    "error": "per_pair"}})
        assert res["incomplete_subjects"] == [3]
        comps = res["comparisons"]
        assert comps["n_subjects"] == 5
        keep = [i for i in range(6) if i != 3]
        cols = {"A": a, "B": b, "C": c}
        for comp in comps["comparisons"]:
            x, y = comp["pair"].split(" vs. ")
            d = np.array([cols[x][i] - cols[y][i] for i in keep])
            assert comp["difference"] == pytest.approx(d.mean())
            assert comp["se"] == pytest.approx(d.std(ddof=1) / math.sqrt(5))
            assert comp["df"] == 4
            assert comp["family_size"] == 3


# =============================================== two-way ANOVA families

class TestCase19TwoWayFamilySize:
    """#19. Prism 4-5.03: after two-way ANOVA with 3+ columns the family
    size was N_rows instead of N_rows * C(C-1)/2 (all pairs within each
    row) or N_rows * (C-1) (each vs control). GraphPad FAQ 1590,
    https://www.graphpad.com/support/faq/fixed-bug-multiple-comparison-tests-following-two-way-anova-with-three-or-more-columns-fixed-in-504-and-50d/
    (OpenDose's ordinary two-way ANOVA offers all-pairs comparisons only;
    Dunnett vs control is offered by the mixed-model two-way RM.)"""

    @pytest.mark.parametrize("method", ["sidak", "bonferroni"])
    def test_all_pairs_family_counts_every_row(self, method):
        mc = _run("two_way_anova", {"datasets": RM_DATASETS},
                  {"comparisons": method,
                   "direction": "columns_within_rows"})["multiple_comparisons"]
        m = RM_A * math.comb(RM_B, 2)               # 4 rows x 3 pairs = 12
        assert m == 12
        assert mc["family"]["size"] == m
        for c in mc["comparisons"]:
            assert c["family_size"] == m
            p = c["p_unadjusted"]
            want = (1 - (1 - p) ** m) if method == "sidak" else min(p * m, 1)
            assert c["p_adjusted"] == pytest.approx(want, rel=1e-9, abs=1e-15)

    def test_tukey_family_is_the_pairs_within_each_row(self):
        mc = _run("two_way_anova", {"datasets": RM_DATASETS},
                  {"comparisons": "tukey",
                   "direction": "columns_within_rows"})["multiple_comparisons"]
        assert mc["family"]["n_families"] == RM_A
        assert all(c["family_size"] == math.comb(RM_B, 2)
                   for c in mc["comparisons"])

    def test_dunnett_family_is_columns_minus_one_per_row(self):
        mc = _run("mixed_rm_twoway", {"datasets": RM_DATASETS},
                  {"comparisons": "dunnett",
                   "direction": "columns_within_rows"}
                  )["multiple_comparisons"]
        assert len(mc["comparisons"]) == RM_A * (RM_B - 1)
        assert all(c["family_size"] == RM_B - 1 for c in mc["comparisons"])


# ================================================================ Dunnett

class TestCase20DunnettHugeDf:
    """#20. Prism 10.2.0 fixed Dunnett's test with extremely large df
    (adjusted P wrong); 10.0.3 fixed Dunnett after two-way ANOVA.
    https://www.graphpad.com/updates/prism-10-2-0-release-notes ;
    https://www.graphpad.com/updates/prism-1003-release-notes
    With df -> infinity the multivariate t becomes the multivariate
    normal."""

    LAM = dunnett.control_lambdas([10, 10, 10, 10], 0)     # rho = 0.5

    # the t tail differs from the normal tail by about (z^4 + ...)/(4 df)
    @pytest.mark.parametrize("df,rel", [(1e5, 2e-3), (1e6, 2e-4),
                                        (1e9, 1e-6)])
    def test_large_df_approaches_the_normal_limit(self, df, rel):
        for c in (1.5, 2.0, 2.3, 2.8, 3.5):
            assert dunnett.sf_one_factor(c, self.LAM, df) == pytest.approx(
                dunnett.sf_one_factor(c, self.LAM, math.inf), rel=rel)
        assert dunnett.critical_value_one_factor(0.95, self.LAM, df) == \
            pytest.approx(dunnett.critical_value_one_factor(
                0.95, self.LAM, math.inf), rel=1e-4)

    def test_normal_limit_matches_multivariate_normal_and_table(self):
        # independent reference: scipy's multivariate normal, rho = 0.5
        c = dunnett.critical_value_one_factor(0.95, self.LAM, math.inf)
        R = np.full((3, 3), 0.5) + 0.5 * np.eye(3)
        cover = stats.multivariate_normal(mean=np.zeros(3), cov=R).cdf(
            np.full(3, c), lower_limit=np.full(3, -c))
        assert cover == pytest.approx(0.95, abs=2e-4)
        # Dunnett (1964) two-sided table, df = infinity: 2.21 / 2.35 / 2.44
        for k, want in ((2, 2.21), (3, 2.35), (4, 2.44)):
            lam = dunnett.control_lambdas([10] * (k + 1), 0)
            assert dunnett.critical_value_one_factor(
                0.95, lam, math.inf) == pytest.approx(want, abs=0.006)

    def test_anova_dunnett_with_df_one_million(self):
        means, ns = [10.0, 10.01, 10.02, 9.995], [250001] * 4   # t <= 3.6
        res = anova._comparisons_from_stats(means, ns, 4.0, 1_000_000,
                                            "dunnett")
        lam = dunnett.control_lambdas(ns, 0)
        for comp in res["comparisons"]:
            t = abs(comp["difference"]) / math.sqrt(4.0 * 2 / 250001)
            assert math.isfinite(comp["p_adjusted"])
            assert comp["p_adjusted"] == pytest.approx(
                dunnett.sf_one_factor(t, lam, math.inf), rel=1e-3, abs=1e-12)

    @pytest.mark.xfail(strict=True, reason=(
        "#20: dunnett.sf_one_factor sets log_keep = _LOG_TRUNC - "
        "log(2 * t.sf(c, df)); when scipy's t.logsf underflows to -inf "
        "(large df and large t, e.g. t = 40, df = 1e4) log_keep is inf and "
        "_z_rule raises OverflowError ('cannot convert float infinity to "
        "integer'), so one-way ANOVA with Dunnett on 3 x 5000 values "
        "returns an error; the correct adjusted P is ~0 (< 1e-300)"))
    def test_dunnett_with_large_n_and_large_effect(self):
        base = np.tile([-1.5, -0.5, 0.5, 1.5], 1250)          # n = 5000
        data = {"datasets": [{"name": nm, "ys": [[float(v)] for v in base + s]}
                             for nm, s in (("Ctl", 0.0), ("T1", 1.0),
                                           ("T2", 0.2))]}
        res = _run("anova", data, {"comparisons": "dunnett"})
        comps = res["multiple_comparisons"]["comparisons"]
        assert comps[0]["p_adjusted"] < 1e-300
        # T2: t = 0.2 / sqrt(MS_res * 2/5000) = 8.94, P about 1e-18
        assert 0 < comps[1]["p_adjusted"] < 1e-15


# ================================================== FDR "discoveries"

class TestCase22DiscoveriesByQ:
    """#22. Prism 11.0.0-11.0.2: nested one-way ANOVA with FDR decided
    "discoveries" by the individual P instead of the q value.
    https://www.graphpad.com/updates/prism-11-1-0-release-notes
    OpenDose's nested one-way ANOVA has no FDR option (not applicable);
    the same rule is checked where OpenDose does offer FDR after ANOVA
    (three-way ANOVA) and in the stand-alone FDR analysis."""

    def test_three_way_fdr_discoveries_follow_q(self):
        rng = np.random.default_rng(12)
        cells = [[[list(np.round(rng.normal(10 + 1.5 * i + 1.2 * j * k,
                                            1.4, 3), 2))
                   for k in range(2)] for j in range(2)] for i in range(2)]
        for method in ("bh", "bky", "by"):
            mc = threeway.three_way_comparisons(cells, goal="all_cells",
                                                method=method, q=0.05)
            raw = [c["p"] for c in mc["comparisons"]]
            q = [c["p_adjusted"] for c in mc["comparisons"]]
            assert any(p < 0.05 for p in raw)
            for c in mc["comparisons"]:
                if method != "bky":
                    assert c["significant"] == (c["p_adjusted"] <= 0.05)
            assert mc["discoveries"] == sum(c["significant"]
                                            for c in mc["comparisons"])
            if method == "bh":
                # this data set has raw P < 0.05 that are not discoveries
                assert any(p < 0.05 and not c["significant"]
                           for p, c in zip(raw, mc["comparisons"]))
                assert all(qq >= p - 1e-15 for p, qq in zip(raw, q))

    def test_fdr_adjust_uses_q_not_p(self):
        p = [0.001, 0.011, 0.02, 0.03, 0.04, 0.2, 0.5]
        out = fdr.adjust(p, "bh", q=0.05)
        # R: p.adjust(c(.001,.011,.02,.03,.04,.2,.5), "BH")
        #   0.007 0.0385 0.0466666666666667 0.0525 0.056 0.233333333333333 0.5
        assert out["adjusted"] == pytest.approx(
            [0.007, 0.0385, 0.14 / 3, 0.0525, 0.056, 0.7 / 3, 0.5], rel=1e-9)
        # P = 0.03 and 0.04 are below 0.05 but are not discoveries
        assert out["significant"] == [True] * 3 + [False] * 4
        assert out["discoveries"] == 3


# =============================================================== survival

GEHAN_GROUPS = [
    ("A", [(3, 1), (5, 1), (7, 1), (9, 0), (12, 1), (15, 1), (18, 0), (20, 1)]),
    ("B", [(4, 1), (8, 1), (10, 1), (14, 0), (16, 1), (22, 1), (25, 0), (28, 1)]),
    ("C", [(2, 1), (3, 1), (6, 1), (6, 1), (11, 0), (13, 1), (17, 1), (19, 1)]),
]


def _surv_data(groups):
    return {"datasets": [{"name": nm, "ys": [[t, e] for t, e in rows]}
                         for nm, rows in groups]}


class TestCase25Survival:
    """#25. Prism 6 (fixed 6.03): the Gehan-Breslow-Wilcoxon test was wrong
    for 3+ groups. Prism 4: the HR came from log-rank O/E but its CI from
    Mantel-Haenszel, so the HR could fall outside its own CI.
    https://www.graphpad.com/support/faqid/1079/ ,
    https://www.graphpad.com/support/faqid/1226/ ,
    https://www.graphpad.com/support/faqid/2156/

    R's survdiff(rho = 1) is the Peto-Peto test (weights S(t-)), not
    Gehan's (weights = number at risk), so the Gehan reference is computed
    by hand in R:

        gehan <- function(time, event, group) {
          k <- max(group); U <- numeric(k); V <- matrix(0, k, k)
          for (t in sort(unique(time[event == 1]))) {
            n <- sapply(1:k, function(g) sum(time >= t & group == g))
            d <- sapply(1:k, function(g) sum(time == t & event == 1 &
                                              group == g))
            N <- sum(n); D <- sum(d); w <- N
            U <- U + w * (d - D * n / N)
            if (N > 1) V <- V + w^2 * D * (N - D) / (N - 1) *
                (diag(n / N) - outer(n / N, n / N))
          }
          chi2 <- drop(t(U[-k]) %*% solve(V[-k, -k, drop = FALSE]) %*% U[-k])
          c(chi2 = chi2, p = pchisq(chi2, k - 1, lower.tail = FALSE))
        }
        time  <- c(3,5,7,9,12,15,18,20, 4,8,10,14,16,22,25,28,
                   2,3,6,6,11,13,17,19)
        event <- c(1,1,1,0,1,1,0,1, 1,1,1,0,1,1,0,1, 1,1,1,1,0,1,1,1)
        group <- rep(1:3, each = 8)
        gehan(time, event, group)        # 2.129037030766877 0.344893875891292
        i <- group < 3; gehan(time[i], event[i], group[i])
                                         # 0.817891373801917 0.365797400735535
        survdiff(Surv(time, event) ~ group)$chisq      # 3.37109772787177
    """

    def test_gehan_three_groups_matches_hand_computation(self):
        res = _run("survival", _surv_data(GEHAN_GROUPS))
        g = res["gehan_breslow_wilcoxon"]
        assert g["df"] == 2
        assert g["chi2"] == pytest.approx(2.129037030766877, rel=1e-10)
        assert g["p"] == pytest.approx(0.344893875891292, rel=1e-10)
        assert res["logrank"]["chi2_variance"] == pytest.approx(
            3.37109772787177, rel=1e-10)

    def test_gehan_two_groups_matches_hand_computation(self):
        res = _run("survival", _surv_data(GEHAN_GROUPS[:2]))
        g = res["gehan_breslow_wilcoxon"]
        assert g["chi2"] == pytest.approx(0.817891373801917, rel=1e-10)
        assert g["p"] == pytest.approx(0.365797400735535, rel=1e-10)

    @pytest.mark.parametrize("pair", [(0, 1), (0, 2), (1, 2)])
    def test_hazard_ratio_inside_its_own_ci(self, pair):
        groups = [GEHAN_GROUPS[i] for i in pair]
        hr = _run("survival", _surv_data(groups))["hazard_ratio"]
        lo, hi = hr["ci"]
        assert lo < hr["value"] < hi
        # one method for both: the CI is symmetric about ln HR
        assert math.log(hr["value"]) == pytest.approx(
            (math.log(lo) + math.log(hi)) / 2, rel=1e-12)


class TestCase26NoEvents:
    """#26. Prism before 8.2.1 (Mac): the ratio of medians and the hazard
    ratio were reported as +/- infinity. Edge case: a group with no
    events. https://www.graphpad.com/updates/prism-821-release-notes
    (OpenDose reports no ratio of median survival times: that part is not
    applicable.)"""

    CTL = ("ctl", [(t, 1) for t in (2, 4, 6, 8, 10)])
    TX = ("tx", [(t, 0) for t in (3, 5, 7, 9, 11)])

    def test_one_group_without_events(self):
        res = _run("survival", _surv_data([self.CTL, self.TX]))
        assert all(math.isfinite(v) for v in _floats(res["hazard_ratio"])
                   if not isinstance(v, bool))
        hr = res["hazard_ratio"]
        assert hr["ci"][0] < hr["value"] < hr["ci"][1]
        # the median of the group without events is undefined, not inf
        assert res["curves"]["tx"]["median_survival"] is None
        assert res["curves"]["ctl"]["median_survival"] == 6
        assert any("0 events" in w for w in res["warnings"])
        json.loads(api.analyze_json(json.dumps(
            {"analysis": "survival", "data": _surv_data([self.CTL, self.TX])})))

    def test_no_events_at_all(self):
        none = ("ctl", [(t, 0) for t in (2, 4, 6, 8, 10)])
        res = _run("survival", _surv_data([none, self.TX]))
        assert res.get("hazard_ratio") is None
        assert not any(math.isinf(v) for v in _floats(res))
        assert any("0 events" in w for w in res["warnings"])
        out = json.loads(api.analyze_json(json.dumps(
            {"analysis": "survival", "data": _surv_data([none, self.TX])})))
        assert out["logrank"]["p"] is None          # undefined, not 0 or 1


# =================================================== nonlinear regression

def _decay_xy():
    x = np.linspace(0, 10, 11)
    noise = np.array([0.3, -0.2, 0.1, 0.4, -0.3, 0.2, -0.1, 0.05, -0.25,
                      0.15, -0.05])
    return x, 50 * np.exp(-0.4 * x) + noise


class TestCase28Bounds:
    """#28. Prism 8.0.1: with a range constraint (0 <= P <= max) and an
    initial value outside the range, the best fit and R^2 were wrong; also
    a parameter constrained > 0 (or < 0) whose best fit is very close to
    0. https://www.graphpad.com/updates/prism-801-release-notes"""

    @pytest.mark.parametrize("init", [5.0, -3.0, pytest.param(
        1e6, marks=pytest.mark.xfail(strict=True, reason=(
            "#28: nlfit._ols_fit computes the finite-difference scale floor "
            "(lsq.scale_floor) from the raw initial values before _inside "
            "moves the start into the box, so K's step scale is ~1e6 times "
            "the box width; the bounded fit stops early: K = 0.4008216 vs "
            "0.4008160 (SS 0.48088742 vs 0.48088721) while status says "
            "'converged'")))])
    def test_initial_value_outside_the_range(self, init):
        x, y = _decay_xy()
        free = ue.fit_user_equation(x.tolist(), y.tolist(), ue.UserEquation(
            "Y=Y0*exp(-K*X)", rules={"Y0": "YATXMIN", "K": 0.5}))
        eq = ue.UserEquation("Y=Y0*exp(-K*X)",
                             rules={"Y0": "YATXMIN", "K": init},
                             constraints={"K": "between 0 and 1"})
        fit = ue.fit_user_equation(x.tolist(), y.tolist(), eq)
        assert fit["fitted_values"]["K"] == pytest.approx(
            free["fitted_values"]["K"], rel=1e-7)
        assert fit["fitted_values"]["Y0"] == pytest.approx(
            free["fitted_values"]["Y0"], rel=1e-7)
        assert fit["goodness"]["r_squared"] == pytest.approx(
            free["goodness"]["r_squared"], rel=1e-10)

    @pytest.mark.parametrize("init", [5.0, 0.5])
    def test_true_value_at_the_bound(self, init):
        # rising data, decay model constrained K in [0, 1]: the best fit is
        # K = 0 exactly, i.e. Y = Y0 = mean(Y), and R^2 = 0
        x = np.linspace(0, 10, 11)
        y = 10 * np.exp(0.05 * x)
        eq = ue.UserEquation("Y=Y0*exp(-K*X)",
                             rules={"Y0": "YATXMIN", "K": init},
                             constraints={"K": "between 0 and 1"})
        fit = ue.fit_user_equation(x.tolist(), y.tolist(), eq)
        assert 0.0 <= fit["fitted_values"]["K"] < 1e-8
        assert fit["fitted_values"]["Y0"] == pytest.approx(y.mean(), rel=1e-8)
        assert fit["goodness"]["r_squared"] == pytest.approx(0.0, abs=1e-8)
        ss = float(np.sum((y - y.mean()) ** 2))
        assert fit["goodness"]["ss_res"] == pytest.approx(ss, rel=1e-8)

    def test_positive_constraint_with_best_fit_near_zero(self):
        x = np.linspace(0, 10, 11)
        noise = np.array([0.02, -0.01, 0.015, -0.02, 0.01, 0.0, -0.015,
                          0.02, -0.01, 0.005, -0.005])
        y = 20 * np.exp(-2e-3 * x) + noise
        free = ue.fit_user_equation(x.tolist(), y.tolist(), ue.UserEquation(
            "Y=Y0*exp(-K*X)", rules={"Y0": "YATXMIN", "K": 0.5}))
        k_free = free["fitted_values"]["K"]
        assert 0 < k_free < 0.01
        fit = ue.fit_user_equation(x.tolist(), y.tolist(), ue.UserEquation(
            "Y=Y0*exp(-K*X)", rules={"Y0": "YATXMIN", "K": 0.5},
            constraints={"K": ">0"}))
        assert fit["fitted_values"]["K"] == pytest.approx(k_free, rel=1e-6)
        assert fit["goodness"]["r_squared"] == pytest.approx(
            free["goodness"]["r_squared"], rel=1e-10)


AG_X = [-9, -8, -7, -6, -5, -4]
AG_MEANS = [10.4, 13.9, 39.2, 79.0, 97.1, 99.6]
AG_SD = [0.9, 1.6, 4.1, 7.6, 9.9, 10.3]
AG_SUMMARY = [[m, s, 3] for m, s in zip(AG_MEANS, AG_SD)]


class TestCase29WeightingWithRoutAndComparison:
    """#29. Prism 8.0.2: weighting by 1/SD^2 was handled wrongly with
    outlier removal (ROUT) and with model comparison.
    https://www.graphpad.com/updates/prism-802-release-notes
    (ROUT with raw replicates and 1/SD^2 is covered by
    test_rout_weighting.py; here: data entered as mean/SD/n, and the
    extra-sum-of-squares F test / AICc.)"""

    def _fit(self, **opts):
        return _run("dose_response",
                    {"x": AG_X, "datasets": [{"name": "A",
                                              "ys": AG_SUMMARY}]},
                    {"model": "log_agonist_vs_response_4pl", "x_is_log": True,
                     "summary_format": "mean_sd_n", **opts})["datasets"][0]

    def test_rout_on_clean_mean_sd_n_keeps_the_1_over_sd2_weights(self):
        plain = self._fit(weighting="1/SD2")["fit"]
        unweighted = self._fit()["fit"]
        rout = self._fit(weighting="1/SD2", rout_q=0.01)
        assert rout["rout"]["n_outliers"] == 0
        for k in ("Top", "Bottom", "LogEC50", "HillSlope"):
            assert rout["fit"]["params"][k]["value"] == pytest.approx(
                plain["params"][k]["value"], rel=1e-8)
        assert rout["fit"]["goodness"]["ss_res_weighted"] == pytest.approx(
            plain["goodness"]["ss_res_weighted"], rel=1e-8)
        assert plain["params"]["LogEC50"]["value"] != pytest.approx(
            unweighted["params"]["LogEC50"]["value"], rel=1e-4)

    # fixed: api._compare_fits used the unweighted SS (F 0.759 instead of
    # 0.233 with 1/SD^2, 1.207 instead of 0.284 with 1/Y^2)
    @pytest.mark.parametrize("weighting", ["1/SD2", "1/Y2"])
    def test_model_comparison_uses_the_weighted_sum_of_squares(
            self, weighting):
        model_opts = {"weighting": weighting}
        if weighting == "1/SD2":
            data = {"x": AG_X, "datasets": [{"name": "A", "ys": AG_SUMMARY}]}
            model_opts["summary_format"] = "mean_sd_n"
        else:
            data = {"x": AG_X, "datasets": [{"name": "A", "ys": [
                [m * f for f in (0.93, 1.0, 1.07)] for m in AG_MEANS]}]}
        res = _run("compare_fits", data, {
            "x_is_log": True,
            "model_1": {"model": "log_agonist_vs_response_3pl", **model_opts},
            "model_2": {"model": "log_agonist_vs_response_4pl", **model_opts}})
        g1, g2 = res["model_1"]["goodness"], res["model_2"]["goodness"]
        w1, w2 = g1["ss_res_weighted"], g2["ss_res_weighted"]
        assert w1 is not None and w2 is not None
        f = ((w1 - w2) / (g1["df"] - g2["df"])) / (w2 / g2["df"])
        assert res["f_test"]["F"] == pytest.approx(f, rel=1e-6)
        assert res["f_test"]["p"] == pytest.approx(
            stats.f.sf(f, g1["df"] - g2["df"], g2["df"]), rel=1e-6)
        k1 = g1["n_points"] - g1["df"]
        k2 = g2["n_points"] - g2["df"]
        want = nlfit.compare_fits_aicc(w1, k1, w2, k2, g1["n_points"])
        assert res["aicc"]["delta"] == pytest.approx(want["delta"], rel=1e-6)


GF_X = [-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5]
GF_NOISE = [0.8, -0.5, 0.3, -0.9, 0.6, -0.2, 0.4, -0.7, 0.5]


def _gf_datasets():
    def f(lx, le, h=1.2):
        return 100 / (1 + 10 ** ((le - lx) * h))
    return [{"name": nm, "ys": [[f(x, le) + e] for x, e in zip(GF_X, GF_NOISE)]}
            for nm, le in (("A", -7.5), ("B", -6.5), ("C", -7.0))]


GF_EQ = {"text": "Y=Bottom + (Top-Bottom)/(1+10^((LogEC50-X)*HillSlope))",
         "rules": {"Bottom": "YMIN", "Top": "YMAX", "LogEC50": "XATYMID",
                   "HillSlope": 1},
         "constraints": {"Bottom": 0, "Top": 100}, "x_is_log": True,
         "transforms": [{"name": "LogEC80", "expr": "X[80]"},
                        {"name": "LogEC80f",
                         "expr": "LogEC50 + log(80/20)/HillSlope"}]}


class TestCase29ComparisonBasis:
    """After the #29 fix: unweighted comparisons are unchanged, a weighted
    and an unweighted fit are not compared, and the result says which sums
    of squares were used."""

    X = [-9.0, -8.5, -8.0, -7.5, -7.0, -6.5, -6.0, -5.5]
    Y = [[98, 101], [97, 95], [88, 90], [70, 66], [41, 45], [20, 23], [9, 8], [5, 6]]

    def _cmp(self, w1=None, w2=None):
        o1 = {"model": "log_inhibitor_vs_response_3pl", **({"weighting": w1} if w1 else {})}
        o2 = {"model": "log_inhibitor_vs_response_4pl", **({"weighting": w2} if w2 else {})}
        return api.analyze({"analysis": "compare_fits",
                            "data": {"x": self.X, "datasets": [{"name": "A", "ys": self.Y}]},
                            "options": {"x_is_log": True, "model_1": o1, "model_2": o2}})

    def test_unweighted_comparison_uses_the_ordinary_ss(self):
        r = self._cmp()
        assert r["sum_of_squares"] == "unweighted"
        g1, g2 = r["model_1"]["goodness"], r["model_2"]["goodness"]
        ref = nlfit.compare_fits_f_test(g1["ss_res"], g1["df"], g2["ss_res"], g2["df"])
        assert r["f_test"]["F"] == pytest.approx(ref["F"])
        assert "notes" not in r

    def test_weighted_comparison_says_so(self):
        r = self._cmp("1/Y2", "1/Y2")
        assert r["sum_of_squares"] == "weighted"
        assert any("weighted sums of squares" in n for n in r["notes"])

    def test_mixed_weighting_is_refused(self):
        r = self._cmp("1/Y2", None)
        assert "same weighting" in r["error"]


class TestCase31SharedSlopeEC80:
    """#31. Prism 10.6.0: in a global fit with a shared parameter (shared
    Hill slope) and a user equation, X at a given Y (e.g. EC80) was the
    same for every data set.
    https://www.graphpad.com/updates/prism-10-6-0-release-notes"""

    def _user_fit(self):
        return _run("global_model_fit", {"x": GF_X, "datasets": _gf_datasets()},
                    {"user_equation": GF_EQ, "shared": ["HillSlope"]})

    def test_user_equation_ec80_differs_by_data_set(self):
        res = self._user_fit()
        slopes = {d["params"]["HillSlope"]["value"] for d in res["datasets"]}
        assert len(slopes) == 1                      # the slope is shared
        h = slopes.pop()
        ec80 = []
        for d in res["datasets"]:
            p = d["params"]
            want = p["LogEC50"]["value"] + math.log10(4.0) / h
            assert p["LogEC80"]["value"] == pytest.approx(want, abs=1e-8)
            assert p["LogEC80f"]["value"] == pytest.approx(want, abs=1e-10)
            ec80.append(p["LogEC80"]["value"])
        assert min(abs(a - b) for a, b in combinations(ec80, 2)) > 0.4

    def test_builtin_ecanything_differs_by_data_set(self):
        res = _run("global_model_fit", {"x": GF_X, "datasets": _gf_datasets()},
                   {"model": "log_agonist_vs_response_ecanything",
                    "shared": ["HillSlope"], "constraints": {"F": 80}})
        vals = [d["params"]["LogECF"]["value"] for d in res["datasets"]]
        assert len({d["params"]["HillSlope"]["value"]
                    for d in res["datasets"]}) == 1
        assert min(abs(a - b) for a, b in combinations(vals, 2)) > 0.4
        # each data set's ECF is X at 80% of its own Bottom..Top span
        for d in res["datasets"]:
            p = {k: v["value"] for k, v in d["params"].items()}
            le = p["LogECF"] - (1 / p["HillSlope"]) * math.log10(80 / 20)
            y = p["Bottom"] + (p["Top"] - p["Bottom"]) / (
                1 + 10 ** ((le - p["LogECF"]) * p["HillSlope"]))
            assert y == pytest.approx(
                p["Bottom"] + 0.8 * (p["Top"] - p["Bottom"]), rel=1e-10)

    @pytest.mark.xfail(strict=True, reason=(
        "#31: equations.fit_global_model marks a derived value 'shared' when "
        "every parameter in Transform.params is shared; an X[80] "
        "interpolation has no level parameters, so all([]) is True and "
        "LogEC80 is flagged shared=True (the results table labels it "
        "'(shared)') although it depends on each data set's own LogEC50 and "
        "differs between data sets"))
    def test_ec80_interpolation_is_not_labelled_shared(self):
        res = self._user_fit()
        for d in res["datasets"]:
            assert d["params"]["LogEC80"]["shared"] is False


class TestCase34UserEquations:
    """#34. User-defined equations. Prism 9.2.0: the simplifier rewrote
    a^b / a^c wrongly (GraphPad FAQ 2212,
    https://www.graphpad.com/support/faq/same-base-exponent-fraction-bug-fix/
    ). Prism 5.00-5.01: ARCTAN2, BETA, IGAMMA, IGAMMAC, CHISQC and BESSEL*
    had their two arguments swapped inside nonlinear-regression equations
    but not in transforms (FAQ 1384,
    https://www.graphpad.com/support/faq/fixed-bug-some-functions-in-user-defined-equations-used-for-nonlinear-regression-give-wrong-results/
    ). Prism 9.0.1: IF() handled wrongly
    (https://www.graphpad.com/updates/prism-901-release-notes). Prism
    8.0.1: "0/0" used to blank a value gave wrong transform results
    (https://www.graphpad.com/updates/prism-801-release-notes). And
    X/(1-exp(-K*X)) at X = 0, whose limit is 1/K (FAQ 2139,
    https://www.graphpad.com/support/faqid/2139/)."""

    @pytest.mark.parametrize("a,b,c", [(2.0, 3.0, 1.0), (-2.0, 3.0, 1.0),
                                       (0.5, 2.5, 0.7), (10.0, -1.5, 2.0),
                                       (3.0, 2.0, 2.0)])
    def test_same_base_power_fraction(self, a, b, c):
        eq = ue.UserEquation("Y = A^B/A^C + 0*X")
        got = eq.evaluate(np.array([1.0]), {"A": a, "B": b, "C": c})[0]
        assert got == pytest.approx(a ** b / a ** c, rel=1e-13)
        eq2 = ue.UserEquation("Y = X^B/X^C")
        xs = np.array([0.5, 2.0, 7.0])
        assert eq2.evaluate(xs, {"B": b, "C": c}) == pytest.approx(
            xs ** b / xs ** c, rel=1e-13)

    def test_same_base_fraction_with_zero_base_is_blank(self):
        # 0^2 / 0^1 = 0/0: blank, not the simplified 0^(2-1) = 0
        eq = ue.UserEquation("Y = A^B/A^C + 0*X")
        assert math.isnan(eq.evaluate(np.array([1.0]),
                                      {"A": 0.0, "B": 2.0, "C": 1.0})[0])

    # (function, args, value) from the Prism user guide's examples
    # (available_functions_transforms.htm): ARCTAN2 takes (y, x); BESSELJ
    # (n, x); IGAMMA / IGAMMAC (shape, x); CHISQC (x, df) = left tail.
    GUIDE_VALUES = [("ARCTAN2", (1, 0), math.pi / 2), ("ARCTAN2", (0, 1), 0.0),
                    ("ARCTAN2", (1, 1), math.pi / 4),
                    ("BESSELJ", (0, 1), 0.7651976865579666),
                    ("IGAMMA", (1, 1), 1 - math.exp(-1)),
                    ("IGAMMAC", (1, 1), math.exp(-1)),
                    ("CHISQC", (3.841, 1), stats.chi2.cdf(3.841, 1)),
                    ("BETA", (2, 3), 1 / 12)]

    @pytest.mark.parametrize("fn,args,want", GUIDE_VALUES)
    def test_two_argument_functions_documented_order(self, fn, args, want):
        got = float(formulas.evaluate(f"{fn}({args[0]}, {args[1]})"))
        assert got == pytest.approx(want, rel=1e-6, abs=1e-12)

    @pytest.mark.parametrize("fn,p1,x", [
        ("ARCTAN2", 1.0, 2.0), ("ARCTAN2", -2.0, 0.5), ("BETA", 2.0, 3.5),
        ("IGAMMA", 2.0, 0.5), ("IGAMMAC", 2.0, 0.5), ("CHISQC", 3.0, 2.0),
        ("BESSELJ", 1.0, 2.5), ("BESSELY", 1.0, 2.5), ("BESSELI", 1.0, 2.5),
        ("BESSELK", 1.0, 2.5)])
    def test_equation_and_transform_give_the_same_value(self, fn, p1, x):
        # the Prism 5 bug: argument order differed between a fitting
        # equation and a transform
        in_transform = float(formulas.evaluate(f"{fn}({p1}, {x})"))
        eq = ue.UserEquation(f"Y = {fn}(P1, X)")
        in_equation = float(eq.evaluate(np.array([x]), {"P1": p1})[0])
        assert in_equation == pytest.approx(in_transform, rel=1e-14)
        res = _run("formula_transform",
                   {"x": [x], "datasets": [{"name": "A", "ys": [[0.0]]}]},
                   {"y_formula": f"Y = {fn}({p1}, X)"})
        assert res["datasets"][0]["ys"][0][0] == pytest.approx(
            in_transform, rel=1e-14)

    def test_if_with_nested_conditions(self):
        eq = ue.UserEquation("Y = IF(X<1, A, IF(X<2 AND X>=1, B, C))")
        got = eq.evaluate(np.array([0.0, 1.0, 1.5, 2.0, 3.0]),
                          {"A": 1.0, "B": 2.0, "C": 3.0})
        assert got.tolist() == [1.0, 2.0, 2.0, 3.0, 3.0]
        eq2 = ue.UserEquation("Y = IF(X<=0 OR X>=10, 0, IF(NOT(X<5), K, -K))")
        got2 = eq2.evaluate(np.array([-1.0, 0.0, 4.0, 5.0, 9.0, 10.0]),
                            {"K": 7.0})
        assert got2.tolist() == [0.0, 0.0, -7.0, 7.0, 7.0, 0.0]

    def test_zero_over_zero_blanks_a_value_in_a_transform(self):
        res = _run("formula_transform",
                   {"x": [1, 2, 3, 4],
                    "datasets": [{"name": "A", "ys": [[1], [-2], [3], [-4]]}]},
                   {"y_formula": "T = IF(Y<0, 0/0, Y)\nY = T*2 + 1"})
        assert res["datasets"][0]["ys"] == [[3.0], [None], [7.0], [None]]

    def test_x_over_one_minus_exp_at_zero(self):
        k = 0.5
        raw = ue.UserEquation("Y = X/(1-exp(-K*X))")
        got = raw.evaluate(np.array([0.0, 1.0]), {"K": k})
        assert math.isnan(got[0])                    # 0/0: blank, no crash
        assert got[1] == pytest.approx(1 / (1 - math.exp(-k)), rel=1e-14)
        guarded = ue.UserEquation("A1 = 1-exp(-K*X)\nY = IF(A1=0, 1/K, X/A1)")
        got = guarded.evaluate(np.array([0.0, 1e-9, 1.0]), {"K": k})
        assert got[0] == 1 / k                       # the limit (FAQ 2139)
        assert got[1] == pytest.approx(1 / k, rel=1e-6)
        assert got[2] == pytest.approx(1 / (1 - math.exp(-k)), rel=1e-14)
        # and the guarded equation fits data that include X = 0
        x = np.arange(0.0, 8.0)
        safe = np.where(x == 0, 1.0, x)
        y = 3.0 * np.where(x == 0, 1 / 0.7, safe / (1 - np.exp(-0.7 * safe)))
        eq = ue.UserEquation("A1 = 1-exp(-K*X)\nY = S*IF(A1=0, 1/K, X/A1)",
                             rules={"K": 1.0, "S": 1.0})
        fit = ue.fit_user_equation(x.tolist(), y.tolist(), eq)
        assert fit["fitted_values"]["K"] == pytest.approx(0.7, rel=1e-6)
        assert fit["fitted_values"]["S"] == pytest.approx(3.0, rel=1e-6)


class TestCase35AICPreferred:
    """#35. Prism 5.00: the AIC probabilities were right but the preferred
    model was sometimes the one with the lower probability. GraphPad FAQ
    1347, https://www.graphpad.com/support/faq/using-aic-to-compare-different-non-linear-regresson-models-prism-5-seems-to-suggest-that-the-model-with-the-lower-probability-of-being-correct-is-the-the-preferred-model-to-use/"""

    @pytest.mark.parametrize("ss1,k1,ss2,k2,n", [
        (100.0, 3, 80.0, 4, 20), (100.0, 3, 99.0, 4, 20),
        (50.0, 4, 60.0, 3, 12), (10.0, 2, 10.0, 5, 30),
        (1e-3, 4, 2e-3, 3, 9), (7.0, 3, 7.0, 3, 15)])
    def test_preferred_model_has_the_higher_probability(self, ss1, k1, ss2,
                                                         k2, n):
        r = nlfit.compare_fits_aicc(ss1, k1, ss2, k2, n)
        assert r["probability_1"] + r["probability_2"] == pytest.approx(1.0)
        assert r["probability_1"] == pytest.approx(
            1 / (1 + math.exp(-0.5 * (r["aicc_2"] - r["aicc_1"]))))
        if r["probability_1"] != r["probability_2"]:
            pref = 1 if r["probability_1"] > r["probability_2"] else 2
            assert r["prefer"] == pref
            assert (r["aicc_1"] < r["aicc_2"]) == (pref == 1)

    def test_compare_fits_handler(self):
        ys = [[m * f for f in (0.95, 1.0, 1.05)] for m in AG_MEANS]
        res = _run("compare_fits",
                   {"x": AG_X, "datasets": [{"name": "A", "ys": ys}]},
                   {"x_is_log": True,
                    "model_1": {"model": "log_agonist_vs_response_4pl"},
                    "model_2": {"model": "log_agonist_vs_response_3pl"}})
        a = res["aicc"]
        pref = 1 if a["probability_1"] > a["probability_2"] else 2
        assert a["prefer"] == pref


class TestCase36DerivedSE:
    """#36. Prism 6: a derived value P1^P2 with P1 < 1 and P2 > 0 (e.g.
    Kprime = Khalf^h of the allosteric sigmoidal model) got a negative SE
    (sign of the delta-method derivative). GraphPad FAQ 1964,
    https://www.graphpad.com/support/faq/bug-a-negative-standard-error-in-nonlinear-regression-results/"""

    X = [0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 1.0, 2.0, 5.0]
    NOISE = [0.6, -0.4, 0.5, -0.8, 0.3, -0.2, 0.7, -0.5, 0.2]

    def test_allosteric_sigmoidal_kprime(self):
        vmax, h, khalf = 80.0, 2.0, 0.3
        y = [vmax * x ** h / (khalf ** h + x ** h) + e
             for x, e in zip(self.X, self.NOISE)]
        fit = nlfit.fit_model(self.X, y, "allosteric_sigmoidal")
        p = fit["params"]
        kh, hh = p["Khalf"]["value"], p["h"]["value"]
        assert kh < 1 and hh > 0
        kp = p["Kprime"]
        assert kp["value"] == pytest.approx(kh ** hh, rel=1e-10)
        assert kp["se"] is not None and kp["se"] > 0
        # delta method by hand: grad = (h Khalf^(h-1), Khalf^h ln Khalf)
        names = fit["_cov"]["free_names"]
        C = np.array(fit["_cov"]["matrix"])
        g = np.zeros(len(names))
        g[names.index("Khalf")] = hh * kh ** (hh - 1)
        g[names.index("h")] = kh ** hh * math.log(kh)
        assert kp["se"] == pytest.approx(math.sqrt(g @ C @ g), rel=1e-3)
        for name, entry in p.items():
            if entry.get("se") is not None:
                assert entry["se"] >= 0, name

    def test_user_transform_p1_to_the_p2(self):
        x = np.linspace(0, 4, 9)
        y = 0.4 * np.exp(-1.3 * x) + np.array(
            [0.004, -0.003, 0.002, -0.004, 0.001, 0.003, -0.002, 0.001, -0.001])
        eq = ue.UserEquation("Y = P1*exp(-P2*X)",
                             rules={"P1": 0.5, "P2": 1.0},
                             transforms=[{"name": "Pow", "expr": "P1^P2",
                                          "ci": "symmetrical"}])
        fit = ue.fit_user_equation(x.tolist(), y.tolist(), eq)
        pw = fit["params"]["Pow"]
        assert fit["fitted_values"]["P1"] < 1
        assert pw["se"] is not None and pw["se"] > 0
        lo, hi = pw["ci95"]
        assert lo < pw["value"] < hi


class TestCase27ProfileCI:
    """#27. Prism 9.1.1: profile-likelihood CIs wrong for some models;
    9.4.0 (Mac): 4PL inhibitor vs response gave no profile CI after a
    log(X) transform; 8.2.1: no profile CI of a transformed value.
    https://www.graphpad.com/updates/prism-911-release-notes ,
    https://www.graphpad.com/updates/prism-940-release-notes ,
    https://www.graphpad.com/updates/prism-821-release-notes

    Definition (curve-fitting guide, "Asymmetrical (profile likelihood)
    confidence intervals"): at each limit the parameter is held fixed and
    the others refitted, and SS = SS_min * (1 + F(0.95; 1, df) / df)."""

    CONC = [1e-9, 3e-9, 1e-8, 3e-8, 1e-7, 3e-7, 1e-6, 3e-6, 1e-5]
    NOISE = [[1.2, -0.8], [0.5, -1.1], [0.9, -0.4], [-1.3, 0.7], [0.2, -0.6],
             [1.0, -0.9], [-0.5, 0.8], [0.3, -0.2], [-0.7, 0.6]]

    def _ys(self):
        return [[5 + 90 / (1 + 10 ** ((math.log10(c) + 7) * 1.0)) + e
                 for e in n] for c, n in zip(self.CONC, self.NOISE)]

    def test_profile_ci_after_log_transform(self):
        ys = self._ys()
        res = _run("dose_response",
                   {"x": self.CONC, "datasets": [{"name": "A", "ys": ys}]},
                   {"model": "log_inhibitor_vs_response_4pl",
                    "x_is_log": False, "ci_method": "profile"})
        fit = res["datasets"][0]["fit"]
        assert fit["ci_method"] == "profile"
        p = fit["params"]
        for name in ("Top", "Bottom", "LogIC50", "HillSlope", "IC50"):
            lo, hi = p[name]["ci95"]
            assert lo < p[name]["value"] < hi, name
        # IC50's CI is the antilog of LogIC50's profile CI
        assert p["IC50"]["ci95"] == pytest.approx(
            [10 ** v for v in p["LogIC50"]["ci95"]], rel=1e-9)
        # the likelihood criterion at both limits of LogIC50
        xs = [math.log10(c) for c, row in zip(self.CONC, ys) for _ in row]
        yy = [v for row in ys for v in row]
        df = fit["goodness"]["df"]
        ss_min = fit["goodness"]["ss_res"]
        target = ss_min * (1 + stats.f.ppf(0.95, 1, df) / df)
        for limit in p["LogIC50"]["ci95"]:
            held = nlfit.fit_model(xs, yy, "log_inhibitor_vs_response_4pl",
                                   constraints={"LogIC50": limit})
            assert held["goodness"]["ss_res"] == pytest.approx(target,
                                                               rel=1e-4)


class TestCase32InterpolationBeyondTheCurve:
    """#32. Prism 5.02: extrapolating unknowns beyond a nonlinear standard
    curve could give nonsense near a singularity (e.g. Bmax*X/(Kd+X) near
    X = -Kd). GraphPad FAQ 1445,
    https://www.graphpad.com/support/faq/fixed-bug-when-prism-502-or-50b-extrapolates-unknowns-using-a-nonlinear-standard-curve-it-can-rarely-report-nonsense-results/"""

    X = [1.0, 2, 4, 8, 16, 32, 64]
    Y = [100 * v / (5 + v) + e for v, e in
         zip(X, [0.5, -0.4, 0.3, -0.6, 0.2, 0.4, -0.3])]

    def test_y_above_bmax_has_no_x_through_the_api(self):
        res = _run("dose_response",
                   {"x": self.X, "datasets": [{"name": "A", "ys": [
                       [v] for v in self.Y]}]},
                   {"model": "saturation_binding",
                    "interpolate_y": [150.0, 50.0, -10.0]})
        entry = res["datasets"][0]
        p = entry["fit"]["params"]
        bmax, kd = p["Bmax"]["value"], p["Kd"]["value"]
        got = entry["interpolated_x"]
        assert got[0] is None                 # above Bmax: no X
        assert got[1] == pytest.approx(kd * 50 / (bmax - 50), rel=1e-6)
        assert got[2] is None                 # below 0: no X >= 0

    @pytest.mark.xfail(strict=True, reason=(
        "#32 (latent): interpolate._crossings takes every sign change of "
        "curve - level on a 512-point grid as a root and refines it with "
        "brentq, so a pole (Bmax*X/(Kd+X) at X = -Kd) counts as a crossing. "
        "When the search range spans the pole, Y = 50 returns X = -Kd "
        "(-5.0039, the first 'root') instead of 5.0038. Not reachable "
        "through dose_response (range = data range) or the standard-curve "
        "assay (range clipped at 0), only through interpolate_x directly"))
    def test_a_pole_is_not_an_interpolated_x(self):
        fit = nlfit.fit_model(self.X, self.Y, "saturation_binding")
        bmax = fit["params"]["Bmax"]["value"]
        kd = fit["params"]["Kd"]["value"]
        # the standards' range extended by half its width each way
        got = interpolate.interpolate_x(fit, [50.0], -30.5, 95.5)
        assert got[0] == pytest.approx(kd * 50 / (bmax - 50), rel=1e-6)


class TestCase33EC50Shift:
    """#33. Prism 8.4.0: the built-in equation "EC50 shift, X is
    concentration" was wrong. https://www.graphpad.com/updates/prism-840-release-notes
    The concentration form must describe the same curves as the log form
    (EC = EC50Control * EC50Ratio <=> LogEC = LogEC50Control +
    log(EC50Ratio))."""

    @pytest.mark.parametrize("ratio,hill", [(5.0, 1.0), (0.2, 0.8),
                                            (30.0, 1.6)])
    def test_concentration_form_equals_log_form(self, ratio, hill):
        conc = np.logspace(-10, -4, 25)
        p = {"Bottom": 3.0, "Top": 97.0, "HillSlope": hill,
             "EC50Control": 2e-8, "EC50Ratio": ratio}
        plog = dict(p, LogEC50Control=math.log10(2e-8))
        for ds in (0, 1, 2):
            a = _shift(conc, dict(p, _dataset=ds))
            b = _shift_log(np.log10(conc), dict(plog, _dataset=ds))
            assert a == pytest.approx(b, rel=1e-12)
        # data set B is half-maximal at EC50Control * EC50Ratio
        half = _shift(np.array([2e-8 * ratio]), dict(p, _dataset=1))[0]
        assert half == pytest.approx(50.0, rel=1e-12)


# ============================================== nonparametric two-group

class TestCase8MannWhitneyEdges:
    """#8. Prism 6.00-6.05 Mann-Whitney: a one-tailed P of 0.5 was shown as
    1.0, a two-tailed P of 1 as 2.0; overflow when N > 1290 with ties (an
    N^3 term); Pratt's zero method in the Wilcoxon test was wrong. GraphPad
    FAQ 1983, https://www.graphpad.com/support/faq/fixed-bugs-in-the-mann-whitney-test-in-prism-6/"""

    def test_one_tailed_p_of_one_half(self):
        # A = 1, 4, 6; B = 2, 3, 5: U = #(a > b) = 5. Exact null of U for
        # 3 + 3 (counts of U = 0..9: 1 1 2 3 3 3 3 2 1 1, total 20):
        # P(U >= 5) = 10/20 = 0.5, P(U <= 5) = 13/20, two-tailed 1.
        r = ttests.mann_whitney([1, 4, 6], [2, 3, 5])
        assert r["p_method"] == "exact"
        assert r["U"] == 5
        assert r["p_greater"] == pytest.approx(0.5, abs=1e-12)
        assert r["p_less"] == pytest.approx(13 / 20, abs=1e-12)
        assert r["p_two_tailed"] == pytest.approx(1.0, abs=1e-12)
        assert r["p_two_tailed"] <= 1.0

    def test_identical_groups_p_never_above_one(self):
        r = ttests.mann_whitney([1, 2, 3, 3], [1, 2, 3, 3])
        assert 0 < r["p_two_tailed"] <= 1.0
        assert r["p_greater"] <= 1.0 and r["p_less"] <= 1.0

    def test_more_than_1290_values_with_ties(self):
        # R: a <- (0:59) %% 10; b <- 1 + ((0:1299) * 7) %% 10
        #    wilcox.test(a, b, exact = FALSE, correct = TRUE)$p.value
        #    # 0.0122951442705929
        a = [i % 10 for i in range(60)]
        b = [1 + (i * 7) % 10 for i in range(1300)]
        r = ttests.mann_whitney(a, b)
        assert r["p_method"] == "approximate"
        assert r["p_two_tailed"] == pytest.approx(0.0122951442705929,
                                                  rel=1e-9)
        assert all(math.isfinite(v) for v in (r["U"], r["p_greater"],
                                              r["p_less"]))

    def test_pratt_zero_method_by_hand(self):
        # d = 0, 1, -2, 3, 4, 5. Pratt ranks |d| with the zero (ranks 1..6),
        # then drops the zero's rank: positive 2+4+5+6 = 17, negative 3.
        # Null: each of ranks {2,3,4,5,6} positive with probability 1/2
        # (32 equally likely sign patterns); mean 10. Two-sided P =
        # P(T >= 17) + P(T <= 3) = 3/32 + 3/32.
        sums = [sum(r for r, s in zip((2, 3, 4, 5, 6), signs) if s)
                for signs in np.ndindex(*(2,) * 5)]
        assert sum(1 for s in sums if s >= 17) == 3
        r = ttests.signed_rank_test([0, 1, -2, 3, 4, 5], zero_method="pratt")
        assert r["sum_positive_ranks"] == 17
        assert r["sum_negative_ranks"] == -3
        assert r["n_zero_differences"] == 1
        assert r["p"] == pytest.approx(6 / 32, abs=1e-12)
        assert r["p_greater"] == pytest.approx(3 / 32, abs=1e-12)
        # Wilcoxon's method drops the zero first: ranks 1..5, W+ = 13
        w = ttests.signed_rank_test([0, 1, -2, 3, 4, 5], zero_method="wilcox")
        assert w["sum_positive_ranks"] == 13


# ======================================================= proportions

class TestCase10RiskDifference:
    """#10. Prism 9.2.0: a negative lower limit of the CI of the difference
    between proportions (attributable risk) was shown as 0; when that CI
    contains 0 the NNT CI must not be shown as an ordinary interval.
    GraphPad FAQ 2220, https://www.graphpad.com/support/faq/attributable-risk-ci-bug-920/
    Reference values: Newcombe (1998) Stat Med 17:873, Table II, example
    (d) 5/56 vs 0/29: method 10 (score) -0.0381 to 0.1926, method 11 (with
    continuity correction) -0.0667 to 0.2037; example (a) 56/70 vs 48/80:
    0.0524 to 0.3339 and 0.0428 to 0.3422."""

    def test_newcombe_table_values(self):
        assert proportions.difference_ci(5, 56, 0, 29, method="newcombe") == \
            pytest.approx([-0.0381, 0.1926], abs=5e-5)
        assert proportions.difference_ci(5, 56, 0, 29,
                                         method="newcombe_cc") == \
            pytest.approx([-0.0667, 0.2037], abs=5e-5)
        assert proportions.difference_ci(56, 70, 48, 80,
                                         method="newcombe_cc") == \
            pytest.approx([0.0428, 0.3422], abs=5e-5)

    def test_negative_lower_limit_kept_and_nnt_flagged(self):
        res = _run("contingency", {"table": [[30, 170], [28, 172]]},
                   {"effect_sizes": True})
        eff = res["effect_sizes"]
        lo, hi = eff["difference"]["ci"]
        assert lo < 0 < hi
        assert eff["difference"]["value"] == pytest.approx(0.01)
        nnt = eff["nnt"]
        assert nnt["ci_includes_infinity"] is True
        # the two reciprocals straddle infinity (NNT-harm to NNT-benefit),
        # never a finite interval that would exclude the "no effect" value
        assert nnt["ci"][0] < 0 < nnt["ci"][1]
        assert nnt["ci"] == pytest.approx([1 / lo, 1 / hi])

    def test_nnt_ci_ordinary_when_difference_ci_excludes_zero(self):
        eff = _run("contingency", {"table": [[56, 14], [48, 32]]},
                   {"effect_sizes": True})["effect_sizes"]
        lo, hi = eff["difference"]["ci"]
        assert 0 < lo < hi
        assert eff["nnt"]["ci_includes_infinity"] is False
        assert eff["nnt"]["ci"] == pytest.approx([1 / lo, 1 / hi])


class TestCase40FisherLargeCounts:
    """#40. Prism 10.0.3: no P from Fisher's exact test with large counts;
    11.2.0: the Baptista-Pike odds-ratio CI fell back to a less accurate
    method for large counts (8.2.0 switched to Woolf above N = 100,000).
    https://www.graphpad.com/updates/prism-1003-release-notes ,
    https://www.graphpad.com/updates/prism-11-2-0-release-notes"""

    TABLE = [[150000, 149000], [150500, 148000]]

    def test_p_value_with_counts_near_a_million(self):
        # R: fisher.test(matrix(c(150000,150500,149000,148000), 2))$p.value
        # equals scipy.stats.fisher_exact (sum of small P); 0.0519969535...
        res = _run("contingency", {"table": self.TABLE})
        p = res["fisher_exact"]["p"]
        assert p == pytest.approx(stats.fisher_exact(self.TABLE)[1], rel=1e-9)
        assert 0.05 < p < 0.055
        big = _run("contingency", {"table": [[500000, 480000],
                                             [300000, 310000]]})
        assert 0 < big["fisher_exact"]["p"] < 1e-100

    @pytest.mark.xfail(strict=True, raises=TimeoutError, reason=(
        "#40: proportions.baptista_pike_ci scans outward in fixed 0.02 "
        "log-OR steps until 10 log units past the last accepted value "
        "(~500+ steps per side), each step evaluating the noncentral "
        "hypergeometric pmf over the whole support (~3e5 values here), so "
        "the default contingency effect sizes take ~40 s for N ~ 6e5 "
        "(much longer under Pyodide); the P value itself is fast"))
    def test_odds_ratio_ci_for_large_counts_is_fast_and_close_to_woolf(self):
        def _timeout(signum, frame):
            raise TimeoutError("Baptista-Pike CI took more than 3 s")
        old = signal.signal(signal.SIGALRM, _timeout)
        signal.alarm(3)
        try:
            bp = proportions.odds_ratio(self.TABLE)
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old)
        woolf = proportions.odds_ratio(self.TABLE, method="woolf")
        assert bp["ci"] == pytest.approx(woolf["ci"], rel=1e-3)


# ================================================= one-way ANOVA edges

BLANK_GROUP = {"datasets": [
    {"name": "A", "ys": [[1], [2], [3]]},
    {"name": "B", "ys": [[None], [None]]},
    {"name": "C", "ys": [[4], [5], [6.5]]},
    {"name": "D", "ys": [[2], [3], [3.5]]}]}
WITHOUT_BLANK = {"datasets": [d for d in BLANK_GROUP["datasets"]
                              if d["name"] != "B"]}


class TestCase45AllBlankGroup:
    """#45. Prism 4-5.01: when one selected column was entirely excluded,
    one-way ANOVA post tests made phantom comparisons ("0.0 to 0.0") that
    inflated the family size. GraphPad FAQ 1399,
    https://www.graphpad.com/support/faq/post-tests-following-one-way-anova-are-incorrect-when-one-column-is-entirely-excluded/
    The all-blank group must be dropped: results equal the analysis
    without it."""

    def test_anova_table_ignores_the_blank_group(self):
        a = _run("anova", BLANK_GROUP)["table"]
        b = _run("anova", WITHOUT_BLANK)["table"]
        assert a["df_between"] == 2
        assert a["F"] == pytest.approx(b["F"]) and a["p"] == pytest.approx(
            b["p"])

    def test_group_summaries_keep_their_names(self):
        # fixed: was 'B' with C's data, 'C' with D's, D missing
        got = [(g["name"], g["n"], g["mean"]) for g in
               _run("anova", BLANK_GROUP)["group_summaries"]]
        assert got == [("A", 3, 2.0), ("C", 3, pytest.approx(31 / 6)),
                       ("D", 3, pytest.approx(17 / 6))]

    @pytest.mark.parametrize("method", ["tukey", "bonferroni", "dunnett"])
    def test_post_tests_drop_the_blank_group(self, method):
        # fixed: the blank column used to reach multiple_comparisons
        got = _run("anova", BLANK_GROUP, {"comparisons": method})
        want = _run("anova", WITHOUT_BLANK, {"comparisons": method})
        g, w = got["multiple_comparisons"], want["multiple_comparisons"]
        assert [c["pair"] for c in g["comparisons"]] == \
            [c["pair"] for c in w["comparisons"]]
        assert g["family"]["size"] == w["family"]["size"]
        for x, y in zip(g["comparisons"], w["comparisons"]):
            assert x["p_adjusted"] == pytest.approx(y["p_adjusted"])


    def test_the_results_say_which_group_was_left_out(self):
        w = _run("anova", BLANK_GROUP)["warnings"]
        assert any("B has no values and was left out of the analysis" in x
                   for x in w)

    def test_kruskal_wallis_drops_the_blank_group(self):
        got = _run("anova", BLANK_GROUP, {"kind": "nonparametric"})
        want = _run("anova", WITHOUT_BLANK, {"kind": "nonparametric"})
        assert got["p"] is not None and got["p"] == pytest.approx(want["p"])
        assert got["H"] == pytest.approx(want["H"])

    def test_a_control_after_the_blank_group_is_renumbered(self):
        # control D is index 3 with B present, index 2 without
        got = _run("anova", BLANK_GROUP, {"comparisons": "dunnett", "control_index": 3})
        want = _run("anova", WITHOUT_BLANK, {"comparisons": "dunnett", "control_index": 2})
        assert [c["pair"] for c in got["multiple_comparisons"]["comparisons"]] == \
            [c["pair"] for c in want["multiple_comparisons"]["comparisons"]]
        assert all(c["pair"].endswith("vs. D") for c in got["multiple_comparisons"]["comparisons"])

    def test_a_blank_control_group_is_an_error_not_a_silent_switch(self):
        res = api.analyze({"analysis": "anova", "data": BLANK_GROUP,
                           "options": {"comparisons": "dunnett", "control_index": 1}})
        assert "control group (B) has no values" in res["error"]

    def test_planned_pairs_are_renumbered_and_pairs_with_the_blank_dropped(self):
        # pairs by the original indices: A-B (B blank) and C-D
        got = _run("anova", BLANK_GROUP, {"comparisons": "sidak", "comparisons_family": "pairs",
                                          "pairs": [[0, 1], [2, 3]]})
        pairs = [c["pair"] for c in got["multiple_comparisons"]["comparisons"]]
        assert pairs == ["C vs. D"]
        assert any("Planned comparisons involving B were dropped" in x for x in got["warnings"])


class TestCase46DunnLargeN:
    """#46. Prism <= 4.03: Dunn's test after Kruskal-Wallis overflowed at
    total N >= 1291 (and counted blanks / excluded values in n). GraphPad
    FAQ 667, https://www.graphpad.com/support/faq/bugs-in-dunns-multiple-comparisons-test-following-the-kruskal-wallis-test/

    R (Dunn's z by its formula, tie-corrected):
        g0 <- (0:499) %% 6; g1 <- ((0:499) * 5) %% 7
        g2 <- 1 + ((0:499) * 3) %% 6
        x <- c(g0, g1, g2); g <- rep(1:3, each = 500)
        kruskal.test(x, g)$statistic             # 21.4687233563272
        r <- rank(x); N <- length(x); tt <- table(x)
        tie <- sum(tt^3 - tt) / (12 * (N - 1)); mr <- tapply(r, g, mean)
        z <- abs(mr[i] - mr[j]) / sqrt((N*(N+1)/12 - tie) * (1/500 + 1/500))
        # 1-2: z 4.05227095400767  P(Bonferroni x3) 0.000152168618243218
        # 1-3: z 0.0804048677659179 P 1
        # 2-3: z 3.97186608624176  P 0.000213935418504897
    """

    def test_n_1500_with_ties(self):
        g0 = [i % 6 for i in range(500)]
        g1 = [(i * 5) % 7 for i in range(500)]
        g2 = [1 + (i * 3) % 6 for i in range(500)]
        data = {"datasets": [{"name": nm, "ys": [[v] for v in g]}
                             for nm, g in (("G0", g0), ("G1", g1),
                                           ("G2", g2))]}
        blanks = json.loads(json.dumps(data))
        blanks["datasets"][0]["ys"] += [[None]] * 40     # blanks not counted
        for d in (data, blanks):
            res = _run("anova", d, {"kind": "nonparametric"})
            assert res["H"] == pytest.approx(21.4687233563272, rel=1e-10)
            want = {"G0 vs. G1": (4.05227095400767, 0.000152168618243218),
                    "G0 vs. G2": (0.0804048677659179, 1.0),
                    "G1 vs. G2": (3.97186608624176, 0.000213935418504897)}
            comps = res["dunns"]["comparisons"]
            assert len(comps) == 3
            for c in comps:
                z, p = want[c["pair"]]
                assert c["statistic"] == pytest.approx(z, rel=1e-10)
                assert c["p_adjusted"] == pytest.approx(p, rel=1e-8)
            assert [s["n"] for s in res["group_summaries"]] == [500] * 3


# ============================================== frequency distribution

class TestCase47FrequencyLastBinEdge:
    """#47. Prism 6.00-6.0b: with bins centred 5 and 15 (width 10, so the
    last bin is [10, 20)), a value of exactly 20 was put into an extra,
    unlabelled third bin; the fix: 20 "would simply not fit either bin".
    GraphPad FAQ 1822, https://www.graphpad.com/support/faq/bug-extra-row-in-frequency-distribution-results/
    Bins include the lower edge and exclude the upper edge (statistics
    guide: "a point on the border goes with the bin holding the larger
    values")."""

    VALUES = [[1], [5], [10], [12], [15], [19.99], [20]]

    def test_border_value_goes_to_the_higher_bin(self):
        res = _run("frequency_distribution",
                   {"datasets": [{"name": "A", "ys": self.VALUES}]},
                   {"bin_width": 10, "first_center": 5})
        # no upper limit: 20 opens the bin [20, 30), centred 25, labelled
        assert res["centers"] == [5.0, 15.0, 25.0]
        assert res["datasets"][0]["counts"] == [2, 4, 1]

    @pytest.mark.xfail(strict=True, reason=(
        "#47: frequency.frequency_distribution with upper_limit = 20 (the "
        "upper edge of the bin centred 15) keeps the value 20 (only values "
        "> upper_limit are omitted) and adds a third bin [20, 30) centred "
        "25 for it, the extra-bin result of Prism 6.0; per FAQ 1822 the "
        "bins should stop at [10, 20) with 20 left out (n_omitted_above)"))
    def test_value_on_the_upper_limit_does_not_open_an_extra_bin(self):
        res = _run("frequency_distribution",
                   {"datasets": [{"name": "A", "ys": self.VALUES}]},
                   {"bin_width": 10, "first_center": 5, "upper_limit": 20})
        assert res["centers"] == [5.0, 15.0]
        assert res["datasets"][0]["counts"] == [2, 4]
        assert res["datasets"][0]["n_omitted_above"] == 1


# ================================================================ others

class TestCase23NestedTTestCI:
    """#23. Prism 10.6.0: the nested t test's mean-difference CI was wrong
    with missing values. https://www.graphpad.com/updates/prism-10-6-0-release-notes
    R (nlme, REML; unequal subcolumns after the missing values):
        y <- c(3.1,2.9,3.4, 2.5,2.7, 3.8,3.6,4.0, 4.2,4.6,4.4, 5.1,4.9,5.3,
               3.9,4.3)
        g <- factor(rep(c("Ctl","Tx"), c(8,8)))
        s <- factor(rep(1:6, c(3,2,3,3,3,2)))
        m <- lme(y ~ g, random = ~1 | s, method = "REML")
        summary(m)$tTable["gTx", ]   # 1.35436092725210 0.455407029463027
                                     # DF 4  t 2.97395700907172
                                     # p 0.0409833080760566
        intervals(m, which = "fixed")  # 0.089948309426811 2.61877354507739
    """

    def test_difference_ci_with_missing_values(self):
        data = {"groups": [
            {"name": "Ctl", "subgroups": [[3.1, 2.9, 3.4, None], [2.5, 2.7],
                                          [3.8, 3.6, 4.0]]},
            {"name": "Tx", "subgroups": [[4.2, 4.6, None, 4.4],
                                         [5.1, 4.9, 5.3], [3.9, 4.3]]}]}
        r = _run("nested_ttest", data)
        assert r["df"] == 4
        assert r["difference"] == pytest.approx(1.35436092725210, rel=1e-6)
        assert r["se_difference"] == pytest.approx(0.455407029463027,
                                                   rel=1e-5)
        assert r["p"] == pytest.approx(0.0409833080760566, rel=1e-5)
        assert r["ci"] == pytest.approx([0.089948309426811, 2.61877354507739],
                                        rel=1e-5)
        tcrit = stats.t.ppf(0.975, 4)
        assert r["ci"] == pytest.approx(
            [r["difference"] - tcrit * r["se_difference"],
             r["difference"] + tcrit * r["se_difference"]], rel=1e-12)
        means = {g["name"]: g["mean"] for g in r["group_means"]}
        assert means["Tx"] - means["Ctl"] == pytest.approx(r["difference"])


class TestCase39PoissonZeros:
    """#39. Prism 10.3.0: Poisson regression could not fit data with zeros
    in Y. https://www.graphpad.com/updates/prism-10-3-0-release-notes
    R: x <- 0:11; y <- c(0,0,1,0,2,1,3,0,4,5,3,7)
       f <- glm(y ~ x, family = poisson,
                control = glm.control(epsilon = 1e-15, maxit = 100))
       coef(f)                    # -1.206621748304486 0.281243165141969
       sqrt(diag(vcov(f)))        #  0.6377009480779341 0.0727036262534517
    (R's default epsilon = 1e-8 stops one IRLS step early: SE 0.07270352.)
    """

    def test_fits_counts_with_zeros(self):
        x = list(range(12))
        y = [0, 0, 1, 0, 2, 1, 3, 0, 4, 5, 3, 7]
        res = _run("poisson_regression",
                   {"variables": [{"name": "y", "values": y},
                                  {"name": "x", "values": x}]},
                   {"outcome": "y", "predictors": ["x"]})
        est = {c["name"]: c for c in res["coefficients"]}
        assert est["Intercept"]["estimate"] == pytest.approx(
            -1.206621748304486, rel=1e-8)
        assert est["x"]["estimate"] == pytest.approx(0.281243165141969,
                                                     rel=1e-8)
        assert est["x"]["se"] == pytest.approx(0.0727036262534517, rel=1e-7)
        assert est["Intercept"]["se"] == pytest.approx(0.6377009480779341,
                                                       rel=1e-7)


class TestCase41CoxLargeRiskRange:
    """#41. Prism 11.2.0: Cox regression failed to converge or crashed
    "for data with large differences in predicted risk over time".
    https://www.graphpad.com/updates/prism-11-2-0-release-notes
    R (survival):
        tm <- c(1,2,2,3,4,5,5,6,7,8,8,9,10,11,12,12,13,14,15,16)
        ev <- c(1,1,1,1,0,1,1,1,1,1,1,0,1,1,1,1,1,1,0,1)
        z  <- c(10,9.5,9,8,8.5,7,7.5,6,5,5.5,4,3,3.5,2,2.5,1,9.8,0.5,0,
                1.5) * 10
        coxph(Surv(tm, ev) ~ z, ties = m)     # coef, se:
        # breslow 0.02184333813513513 0.00745489285455702
        # efron   0.02183422159868665 0.00741337040803413
        # exact   0.02510358470890535 0.00849292326558245
    """

    TM = [1, 2, 2, 3, 4, 5, 5, 6, 7, 8, 8, 9, 10, 11, 12, 12, 13, 14, 15, 16]
    EV = [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1]
    Z = [v * 10 for v in (10, 9.5, 9, 8, 8.5, 7, 7.5, 6, 5, 5.5, 4, 3, 3.5,
                          2, 2.5, 1, 9.8, 0.5, 0, 1.5)]
    REF = {"breslow": (0.02184333813513513, 0.00745489285455702),
           "efron": (0.02183422159868665, 0.00741337040803413),
           "exact": (0.02510358470890535, 0.00849292326558245)}

    @pytest.mark.parametrize("ties", ["breslow", "efron", "exact"])
    def test_matches_r_coxph(self, ties):
        res = _run("cox", {"time": self.TM, "event": self.EV,
                           "covariates": {"z": self.Z}}, {"ties": ties})
        c = next(c for c in res["coefficients"] if c["name"] == "z")
        coef, se = self.REF[ties]
        assert c["coef"] == pytest.approx(coef, rel=1e-6)
        assert c["se"] == pytest.approx(se, rel=1e-5)


class TestCase43GoodnessOfFit:
    """#43. Prism 8.4.0: the observed-vs-expected binomial P differed from
    Prism 7; Prism 6.0a (Mac) ran a binomial test instead of chi-square
    with 3+ categories. https://www.graphpad.com/updates/prism-840-release-notes ,
    https://www.graphpad.com/support/faq/Bug-chi-square/ (FAQ 1814)
    R: chisq.test(c(30,45,25), p = c(1,2,1)/4)$p.value  # 0.472366552741015
       binom.test(18, 25)$p.value                       # 0.0432852506637574
       chisq.test(c(18,7), p = c(.5,.5))$p.value        # 0.0278068950269972
    """

    def test_three_categories_use_chi_square(self):
        r = _run("chisq_goodness_of_fit",
                 {"datasets": [{"name": "A", "values": [30, 45, 25]}]},
                 {"expected": [1, 2, 1], "expected_as": "counts"})
        assert r["recommended"] == "chi_square"
        assert "binomial" not in r
        assert r["chi_square"]["df"] == 2
        assert r["chi_square"]["p"] == pytest.approx(0.472366552741015,
                                                     rel=1e-10)

    def test_two_categories_binomial_matches_r(self):
        r = _run("chisq_goodness_of_fit",
                 {"datasets": [{"name": "A", "values": [18, 7]}]},
                 {"expected": [50, 50], "expected_as": "percent"})
        assert r["binomial"]["p_two_tailed"] == pytest.approx(
            0.0432852506637574, rel=1e-10)
        assert r["chi_square"]["p"] == pytest.approx(0.0278068950269972,
                                                     rel=1e-10)


class TestCase49PairingEffective:
    """#49. Prism 6.00-6.0b: the paired t test's "Was the pairing
    effective?" conclusion was backwards (it asked P > 0.05). GraphPad FAQ
    1830, https://www.graphpad.com/support/faq/bug-how-effective-was-the-pairing-conclusion-is-backwards-in-prism-6/
    OpenDose reports the pairing correlation r and its P (no yes/no
    wording in the engine): strongly correlated pairs give r > 0 and a
    small P; uncorrelated pairs a large P."""

    def test_effective_pairing_gives_small_p(self):
        a = [10.0, 14.0, 9.0, 20.0, 16.0, 12.0, 18.0, 11.0]
        b = [v + 1.0 + d for v, d in zip(a, (0.2, -0.1, 0.3, 0.0, -0.2, 0.1,
                                             -0.3, 0.2))]
        pc = ttests.paired_t(a, b)["pairing_correlation"]
        r, p = stats.pearsonr(a, b)
        assert pc["r"] == pytest.approx(r) and pc["r"] > 0.99
        assert pc["p"] == pytest.approx(p) and pc["p"] < 1e-6

    def test_ineffective_pairing_gives_large_p(self):
        a = [10.0, 14.0, 9.0, 20.0, 16.0, 12.0, 18.0, 11.0]
        b = [15.0, 13.0, 17.0, 14.0, 12.0, 16.0, 13.5, 15.5]
        pc = ttests.paired_t(a, b)["pairing_correlation"]
        assert pc["p"] > 0.05
