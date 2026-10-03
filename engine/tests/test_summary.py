"""Data entered as summary values (mean/SD/SEM/%CV/CI with or without n).

The guides state that analyses of mean, SD (or SEM, %CV) and n give
exactly the raw-data results (statistics guide, "Entering data for a t
test" / "... one-way ANOVA"; FAQ 530; curve-fitting guide "Method tab" >
Replicates; FAQ 2038). So every summary analysis here is checked against
the engine's own raw-data analysis of the replicates the summaries were
computed from, and the curve fit is additionally pinned to the numbers
read off a real Prism results sheet for the raw reference replicates
(validation sessions 2 and 3, see test_prism_parity.py).
"""

import json
import math

import numpy as np
import pytest
from scipy import stats as sps
from scipy.optimize import curve_fit

from opendose import anova, columnstats, summary as S, ttests, twoway
from opendose.api import analyze, analyze_json
from opendose.descriptive import error_bars as raw_error_bars
from opendose.nlfit import fit_model

A = [23.0, 26.0, 24.0, 25.0, 28.0, 27.0]
B = [30.0, 33.0, 29.0, 31.0, 34.0, 32.0, 35.5]
C = [36.0, 34.0, 38.0, 35.0, 39.0]

# Reference dose-response replicates (test_api.REF_Y), concentrations as
# typed into Prism in test_prism_parity.CONC.
CONC = [1e-9, 3.162e-9, 1e-8, 3.162e-8, 1e-7, 3.162e-7, 1e-6, 3.162e-6, 1e-5]
REF_Y = [[98.2, 101.5, 99.1], [97.0, 95.8, 99.9], [93.4, 90.1, 92.7],
         [78.9, 82.3, 80.0], [51.2, 48.7, 50.9], [22.1, 25.6, 24.0],
         [8.9, 10.2, 7.5], [3.1, 4.4, 2.2], [1.0, 0.5, 2.1]]
LOGX = [math.log10(c) for c in CONC]
MEANS = [float(np.mean(r)) for r in REF_Y]
SDS = [float(np.std(r, ddof=1)) for r in REF_Y]
NS = [3] * 9
MODEL = "log_inhibitor_vs_response_4pl"


def msn(values):
    return {"mean": float(np.mean(values)),
            "sd": float(np.std(values, ddof=1)), "n": len(values)}


def raw_xy():
    xs = [x for x, row in zip(LOGX, REF_Y) for _ in row]
    ys = [v for row in REF_Y for v in row]
    return xs, ys


def close(a, b, rel=1e-12, path=""):
    """Recursive comparison of two result dicts."""
    if isinstance(a, dict):
        for k in a:
            if k in b:
                close(a[k], b[k], rel, f"{path}/{k}")
        return
    if isinstance(a, (list, tuple)):
        assert len(a) == len(b), path
        for i, (x, y) in enumerate(zip(a, b)):
            close(x, y, rel, f"{path}[{i}]")
        return
    if a is None or isinstance(a, (bool, str)) or b is None:
        assert a == b, (path, a, b)
        return
    assert b == pytest.approx(a, rel=rel, abs=1e-300), path


# ---------------------------------------------------------------- formats

class TestConversions:
    def test_format_labels_follow_the_guide(self):
        assert S.FORMATS["mean_sd_n"]["subcolumns"] == ["Mean", "SD", "N"]
        assert S.FORMATS["mean_limits"]["subcolumns"] == [
            "Mean", "Upper limit", "Lower limit"]
        assert {f for f, d in S.FORMATS.items() if not d["has_n"]} == {
            "mean_sd", "mean_sem", "mean_cv", "mean_pm", "mean_limits"}

    def test_sd_sem_cv_with_n_are_exact(self):
        m, sd, n = 50.0, 4.0, 4
        a = S.to_mean_sd_n([m, sd, n], "mean_sd_n")
        b = S.to_mean_sd_n([m, sd / 2.0, n], "mean_sem_n")
        c = S.to_mean_sd_n([m, 8.0, n], "mean_cv_n")  # %CV = 100*SD/Mean
        for r in (a, b, c):
            assert r["mean"] == 50.0 and r["n"] == 4 and r["exact"]
            assert r["sd"] == pytest.approx(4.0, rel=1e-15)
            assert r["sem"] == pytest.approx(2.0, rel=1e-15)

    def test_without_n_sem_and_sd_are_not_interconvertible(self):
        a = S.to_mean_sd_n([10.0, 2.0], "mean_sd")
        assert a["sd"] == 2.0 and a["sem"] is None and a["n"] is None
        b = S.to_mean_sd_n([10.0, 2.0], "mean_sem")
        assert b["sem"] == 2.0 and b["sd"] is None
        c = S.to_mean_sd_n([-10.0, 20.0], "mean_cv")
        assert c["sd"] == pytest.approx(2.0)  # |CV| * |mean| / 100

    def test_ci_entry_round_trips_from_replicates(self):
        row = [12.1, 15.3, 13.9, 14.4]
        rs = S.row_summary(row)
        lo, hi = raw_error_bars([row], "ci95")[0]["lo"], \
            raw_error_bars([row], "ci95")[0]["hi"]
        c = S.to_mean_sd_n([rs["mean"], lo, hi, 4], "mean_ci_n")
        assert c["exact"]
        assert c["sd"] == pytest.approx(rs["sd"], rel=1e-12)
        assert c["sem"] == pytest.approx(rs["sem"], rel=1e-12)

    def test_asymmetric_ci_is_flagged_approximate(self):
        c = S.to_mean_sd_n([10.0, 8.0, 13.0, 5], "mean_ci_n")
        assert not c["exact"]
        assert c["sem"] == pytest.approx(2.5 / sps.t.ppf(0.975, 4))

    def test_from_replicates_matches_descriptive(self):
        rows = [[1.0, 2.0, 4.0], [5.0, None, 7.0], [3.0], []]
        means, sds, ns = S.from_replicates(rows)
        assert means == [pytest.approx(7 / 3), 6.0, 3.0, None]
        assert sds[0] == pytest.approx(np.std([1, 2, 4], ddof=1))
        assert sds[2] is None and ns == [3, 2, 1, None]

    def test_synthetic_replicates_reproduce_mean_and_sd(self):
        for n in (2, 3, 7):
            v = S.synthetic_replicates(4.2, 1.7, n)
            assert len(v) == n
            assert np.mean(v) == pytest.approx(4.2, rel=1e-14)
            assert np.std(v, ddof=1) == pytest.approx(1.7, rel=1e-14)


class TestErrorBars:
    def test_n_formats_can_plot_sd_sem_or_ci(self):
        row = [10.0, 2.0, 4]
        sd = S.error_bar(row, "mean_sd_n", "sd")
        sem = S.error_bar(row, "mean_sd_n", "sem")
        ci = S.error_bar(row, "mean_sd_n", "ci95")
        assert (sd["lo"], sd["hi"], sd["kind"]) == (8.0, 12.0, "sd")
        assert (sem["lo"], sem["hi"], sem["kind"]) == (9.0, 11.0, "sem")
        half = sps.t.ppf(0.975, 3) * 1.0
        assert ci["hi"] == pytest.approx(10.0 + half)

    def test_matches_bars_from_the_replicates(self):
        row = [12.1, 15.3, 13.9, 14.4]
        rs = S.row_summary(row)
        for kind in ("sd", "sem", "ci95"):
            want = raw_error_bars([row], kind)[0]
            got = S.error_bar([rs["mean"], rs["sem"], 4], "mean_sem_n", kind)
            assert got["lo"] == pytest.approx(want["lo"], rel=1e-13)
            assert got["hi"] == pytest.approx(want["hi"], rel=1e-13)

    def test_without_n_the_entered_error_is_plotted(self):
        # Guide: "Prism will plot the error value you entered. If you
        # entered %CV, Prism will plot the SD."
        a = S.error_bar([10.0, 2.0], "mean_sd", "sem")
        assert (a["lo"], a["hi"], a["kind"], a["requested"]) == \
            (8.0, 12.0, "sd", "sem")
        b = S.error_bar([10.0, 1.0], "mean_sem", "ci95")
        assert (b["lo"], b["hi"], b["kind"]) == (9.0, 11.0, "sem")
        c = S.error_bar([10.0, 30.0], "mean_cv", "sem")
        assert (c["lo"], c["hi"], c["kind"]) == (7.0, 13.0, "sd")
        d = S.error_bar([10.0, 2.0, 4], "mean_sd_n", "range")
        assert d["kind"] == "sd"  # range needs the replicates

    def test_plus_minus_and_limits_can_be_asymmetrical(self):
        pm = S.error_bar([10.0, 3.0, 1.0], "mean_pm", "sd")
        assert (pm["lo"], pm["hi"], pm["kind"]) == (9.0, 13.0, "entered")
        lim = S.error_bar([10.0, 14.0, 9.5], "mean_limits", "sem")
        assert (lim["lo"], lim["hi"], lim["kind"]) == (9.5, 14.0, "entered")
        # median with quartiles typed into a limits table is plotted as is
        ci = S.error_bar([10.0, 8.0, 13.0, 5], "mean_ci_n", "ci95")
        assert (ci["lo"], ci["hi"]) == (8.0, 13.0)

    def test_replicates_and_blanks(self):
        r = S.error_bar([1.0, 3.0, None], "replicates", "range")
        assert (r["lo"], r["hi"], r["kind"]) == (1.0, 3.0, "range")
        assert S.error_bar([None, 1.0, 3], "mean_sd_n", "sd")["mean"] is None
        assert S.error_bar([5.0, 1.0, 3], "mean_sd_n", "none")["lo"] is None


class TestTableShape:
    def test_expand_carries_means_and_summaries(self):
        t = S.expand_summary_table([1, 2], [{"name": "A", "rows": [
            [10.0, 2.0, 3], [None, None, None]]}], "mean_sd_n")
        ds = t["datasets"][0]
        assert ds["ys"] == [[10.0], []]
        assert ds["mean"] == [10.0, None] and ds["n"] == [3, None]
        assert ds["sem"][0] == pytest.approx(2.0 / math.sqrt(3))

    @pytest.mark.parametrize("fmt", ["mean_sd_n", "mean_sem_n", "mean_cv_n",
                                     "mean_ci_n"])
    def test_collapse_then_expand_round_trip(self, fmt):
        data = {"x": LOGX, "datasets": [{"name": "Drug A", "ys": REF_Y}]}
        col = S.collapse_to_summary(data, fmt)
        back = S.expand_summary_table(col["x"], col["datasets"], fmt)
        ds = back["datasets"][0]
        assert ds["exact"]
        np.testing.assert_allclose(ds["mean"], MEANS, rtol=1e-14)
        np.testing.assert_allclose(ds["sd"], SDS, rtol=1e-12)
        assert ds["n"] == NS

    def test_collapse_limits_formats(self):
        data = {"x": [0], "datasets": [{"name": "a", "ys": [[1.0, 2.0, 6.0]]}]}
        lim = S.collapse_to_summary(data, "mean_limits", kind="range")
        assert lim["datasets"][0]["rows"] == [[3.0, 6.0, 1.0]]
        pm = S.collapse_to_summary(data, "mean_pm", kind="range")
        assert pm["datasets"][0]["rows"] == [[3.0, 3.0, 2.0]]


# ---------------------------------------------------------------- statistics

class TestTTests:
    @pytest.mark.parametrize("welch", [False, True])
    def test_unpaired_equals_raw_data(self, welch):
        close(ttests.unpaired_t(A, B, welch=welch),
              S.unpaired_t_summary(msn(A), msn(B), welch=welch))

    def test_sem_and_cv_entry_equal_sd_entry(self):
        a, b = msn(A), msn(B)
        ref = S.unpaired_t_summary(a, b)
        sem = S.unpaired_t_summary(
            [a["mean"], a["sd"] / math.sqrt(a["n"]), a["n"]],
            [b["mean"], b["sd"] / math.sqrt(b["n"]), b["n"]], fmt="mean_sem_n")
        cv = S.unpaired_t_summary(
            {"mean": a["mean"], "cv": 100 * a["sd"] / a["mean"], "n": a["n"]},
            {"mean": b["mean"], "cv": 100 * b["sd"] / b["mean"], "n": b["n"]})
        close(ref, sem, rel=1e-12)
        close(ref, cv, rel=1e-12)

    def test_one_sample_equals_raw_data(self):
        close(columnstats.one_sample_t(A, 20.0),
              S.one_sample_t_summary(msn(A), 20.0), rel=1e-12)

    def test_n_is_essential(self):
        with pytest.raises(ValueError):
            S.unpaired_t_summary([10.0, 2.0], [12.0, 2.0], fmt="mean_sd")


class TestOneWay:
    GROUPS = [A, B, C]
    NAMES = ["A", "B", "C"]

    def test_table_and_bartlett_equal_raw_data(self):
        raw = anova.one_way_anova(self.GROUPS, self.NAMES)
        got = S.one_way_anova_summary([msn(g) for g in self.GROUPS],
                                      self.NAMES)
        close(raw["table"], got["table"], rel=1e-12)
        close(raw["group_summaries"], got["group_summaries"], rel=1e-12)
        close(raw["bartlett"], got["bartlett"], rel=1e-10)
        assert got["brown_forsythe"]["F"] is None  # needs group medians

    @pytest.mark.parametrize("method", ["tukey", "bonferroni", "sidak",
                                        "holm_sidak"])
    def test_post_tests_equal_raw_data(self, method):
        close(anova.multiple_comparisons(self.GROUPS, method, names=self.NAMES),
              S.multiple_comparisons_summary([msn(g) for g in self.GROUPS],
                                             method, names=self.NAMES),
              rel=1e-12)

    def test_dunnett(self):
        # Tightened: Dunnett's P values and CIs used to come from scipy's
        # randomized multivariate-t integration (unseeded; P wobbled by
        # ~1e-4 and CI limits by up to ~0.2 between runs, so this test
        # allowed abs=1e-3 on P and rel=0.1 on the CI half-width). They
        # now come from the exact deterministic integral in
        # opendose.dunnett, which depends only on means, n and the pooled
        # SD, so summary data reproduce the raw-data results to rounding.
        raw = anova.multiple_comparisons(self.GROUPS, "dunnett",
                                         names=self.NAMES)
        got = S.multiple_comparisons_summary(
            [msn(g) for g in self.GROUPS], "dunnett", names=self.NAMES)
        close(raw, got, rel=1e-10)
        for r, g in zip(raw["comparisons"], got["comparisons"]):
            assert g["ci"][0] < g["difference"] < g["ci"][1]

    def test_dunnett_one_way_summary_path(self):
        raw = anova.multiple_comparisons(self.GROUPS, "dunnett",
                                         names=self.NAMES, control_index=1)
        got = S.one_way_anova_summary(
            [msn(g) for g in self.GROUPS], self.NAMES,
            comparisons="dunnett", control_index=1)["multiple_comparisons"]
        close(raw, got, rel=1e-10)


class TestTwoWay:
    # Erratic n per cell, the case FAQ 530 singles out.
    CELLS = [[A[:3], B[:4], C[:2]], [A[3:], B[4:], C[2:]]]

    def summary_cells(self):
        return [[msn(c) for c in row] for row in self.CELLS]

    def test_type_iii_table_equals_raw_data(self):
        raw = twoway.two_way_anova(self.CELLS)
        got = S.two_way_anova_summary(self.summary_cells())
        close(raw, got, rel=1e-10)

    @pytest.mark.parametrize("direction", ["columns_within_rows",
                                           "rows_within_columns",
                                           "column_means", "row_means"])
    @pytest.mark.parametrize("method", ["tukey", "sidak", "bonferroni"])
    def test_comparisons_equal_raw_data(self, direction, method):
        close(twoway.two_way_comparisons(self.CELLS, direction=direction,
                                         method=method),
              S.two_way_comparisons_summary(self.summary_cells(),
                                            direction=direction,
                                            method=method), rel=1e-10)


# ---------------------------------------------------------------- curve fit

@pytest.fixture(scope="module")
def raw():
    return fit_model(*raw_xy(), MODEL)


@pytest.fixture(scope="module")
def fit():
    return fit_model(LOGX, MEANS, MODEL, sd=SDS, n=NS)


@pytest.fixture(scope="module")
def means_only():
    return fit_model(LOGX, MEANS, MODEL, sd=SDS, n=NS,
                     replicates="means_only")


class TestFitFromMeanSDN:
    """Prism's results sheet for the 27 raw replicates (validation
    sessions 2-3). The guide: entering mean, SD and n and accounting for
    them gives "exactly the same results ... as you would have gotten had
    you entered raw data", so the same displayed digits must come out."""


    @pytest.mark.parametrize("name,expected,tol", [
        ("Bottom", 0.9801, 5e-5), ("Top", 99.86, 5e-3),
        ("LogIC50", -6.983, 5e-4), ("HillSlope", -1.103, 5e-4),
        ("IC50", 1.040e-7, 5e-11), ("Span", 98.88, 5e-3)])
    def test_best_fit_matches_prism_raw_sheet(self, fit, name, expected, tol):
        assert fit["params"][name]["value"] == pytest.approx(expected, abs=tol)

    @pytest.mark.parametrize("name,lo,hi,tol", [
        ("Bottom", -0.5601, 2.520, 5e-4), ("Top", 98.34, 101.4, 5e-2),
        ("LogIC50", -7.013, -6.953, 5e-4), ("HillSlope", -1.183, -1.023, 5e-4),
        ("IC50", 9.694e-8, 1.115e-7, 5e-11), ("Span", 96.44, 101.3, 5e-2)])
    def test_cis_match_prism_raw_sheet(self, fit, name, lo, hi, tol):
        assert fit["params"][name]["ci95"] == pytest.approx([lo, hi], abs=tol)

    def test_goodness_and_df_count_every_replicate(self, fit):
        g = fit["goodness"]
        assert g["df"] == 23 and g["n_points"] == 27
        assert g["r_squared"] == pytest.approx(0.9986, abs=5e-5)
        assert g["ss_res"] == pytest.approx(59.58, abs=5e-3)
        assert g["sy_x"] == pytest.approx(1.610, abs=5e-4)
        assert fit["replicates"] == {"mode": "account", "n_rows": 9,
                                     "n_points": 27}

    def test_equals_replicate_fit(self, raw, fit):
        # Same objective up to a constant; differences are the optimizer's
        # stopping tolerance only.
        for name, p in raw["params"].items():
            q = fit["params"][name]
            assert q["value"] == pytest.approx(p["value"], rel=1e-5)
            if p["se"] is not None:
                assert q["se"] == pytest.approx(p["se"], rel=1e-5)
        for key in ("df", "n_points"):
            assert fit["goodness"][key] == raw["goodness"][key]
        for key in ("ss_res", "sy_x", "r_squared"):
            assert fit["goodness"][key] == pytest.approx(
                raw["goodness"][key], rel=1e-9)

    @pytest.mark.parametrize("name,expected,tol", [
        ("Bottom", 0.3122, 5e-4), ("Top", 101.4, 1e-1),
        ("LogIC50", -7.002, 5e-4), ("HillSlope", -1.023, 5e-4)])
    def test_weighted_1_over_y2_matches_prism(self, name, expected, tol):
        fit = fit_model(LOGX, MEANS, MODEL, sd=SDS, n=NS, weighting="1/Y2")
        assert fit["params"][name]["value"] == pytest.approx(expected, abs=tol)
        g = fit["goodness"]
        assert g["r_squared_weighted"] == pytest.approx(0.9422, abs=5e-5)
        assert g["ss_res_weighted"] == pytest.approx(1.232, abs=5e-4)
        assert g["sy_x"] == pytest.approx(0.2314, abs=5e-5)

    @pytest.mark.parametrize("name,lo,hi,tol", [
        ("Bottom", -0.6173, 2.508, 5e-4), ("LogIC50", -7.013, -6.953, 5e-4),
        ("HillSlope", -1.188, -1.025, 5e-4)])
    def test_profile_cis_match_prism(self, name, lo, hi, tol):
        fit = fit_model(LOGX, MEANS, MODEL, sd=SDS, n=NS, ci_method="profile")
        assert fit["params"][name]["ci95"] == pytest.approx([lo, hi], abs=tol)

    def test_sem_entry_gives_the_same_fit(self, fit):
        sems = [s / math.sqrt(3) for s in SDS]
        out = analyze({"analysis": "dose_response",
                       "data": {"x": CONC, "datasets": [{
                           "name": "A",
                           "ys": [[m, e, 3] for m, e in zip(MEANS, sems)]}]},
                       "options": {"model": MODEL, "x_is_log": False,
                                   "summary_format": "mean_sem_n"}})
        f = out["datasets"][0]["fit"]
        assert f["goodness"]["df"] == 23
        assert f["params"]["LogIC50"]["value"] == pytest.approx(-6.983, abs=5e-4)
        assert f["params"]["HillSlope"]["ci95"] == pytest.approx(
            [-1.183, -1.023], abs=5e-4)


class TestFitMeansOnly:
    """'Fit means only' (or a format without n): one point per row, so
    df = rows - K. With equal n and no weighting the best-fit values
    equal the replicate fit's (the replicate SS is n x the means' SS plus
    a constant), but SEs, CIs, df and SS differ: the guide warns the CIs
    "tend to be wider" because the fit sees fewer points."""


    def test_same_as_fitting_the_means_as_data(self, means_only):
        plain = fit_model(LOGX, MEANS, MODEL)
        assert means_only["params"] == plain["params"]
        assert means_only["goodness"] == plain["goodness"]
        assert means_only["replicates"]["mode"] == "means_only"

    def test_relationship_to_the_replicate_fit(self, raw, means_only):
        g, gr = means_only["goodness"], raw["goodness"]
        assert (g["df"], g["n_points"]) == (5, 9)
        for name in ("Bottom", "Top", "LogIC50", "HillSlope"):
            assert means_only["params"][name]["value"] == pytest.approx(
                raw["params"][name]["value"], rel=1e-5)
        within = sum((n - 1) * s * s for n, s in zip(NS, SDS))
        assert gr["ss_res"] == pytest.approx(3 * g["ss_res"] + within,
                                             rel=1e-8)
        for name in ("LogIC50", "HillSlope"):
            w_m = np.diff(means_only["params"][name]["ci95"])[0]
            w_r = np.diff(raw["params"][name]["ci95"])[0]
            assert w_m > 1.2 * w_r

    def test_formats_without_n_fit_the_means(self):
        out = analyze({"analysis": "dose_response",
                       "data": {"x": LOGX, "datasets": [{
                           "name": "A",
                           "ys": [[m, s] for m, s in zip(MEANS, SDS)]}]},
                       "options": {"model": MODEL,
                                   "summary_format": "mean_sd"}})
        f = out["datasets"][0]["fit"]
        assert f["goodness"]["df"] == 5
        assert f["replicates"]["mode"] == "means_only"


class TestWeightBySD:
    def test_matches_independent_weighted_least_squares(self):
        # Every replicate weighted by 1/SD^2 of its row: scipy curve_fit
        # with sigma = row SD (relative sigma) is the independent check.
        xs, ys = raw_xy()
        sig = [s for s in SDS for _ in range(3)]

        def f(x, bottom, top, logic50, hill):
            return bottom + (top - bottom) / (1 + 10 ** ((logic50 - x) * hill))
        popt, pcov = curve_fit(f, np.array(xs), np.array(ys),
                               p0=[1, 100, -7, -1], sigma=np.array(sig))
        fit = fit_model(LOGX, MEANS, MODEL, sd=SDS, n=NS, weighting="1/SD2")
        names = ["Bottom", "Top", "LogIC50", "HillSlope"]
        for i, name in enumerate(names):
            assert fit["params"][name]["value"] == pytest.approx(popt[i],
                                                                 rel=1e-5)
            assert fit["params"][name]["se"] == pytest.approx(
                math.sqrt(pcov[i, i]), rel=1e-4)
        assert fit["goodness"]["df"] == 23

    def test_raw_replicates_use_their_own_sd(self):
        a = fit_model(*raw_xy(), MODEL, weighting="1/SD2")
        b = fit_model(LOGX, MEANS, MODEL, sd=SDS, n=NS, weighting="1/SD2")
        close(a["params"], b["params"], rel=1e-9)

    def test_zero_sd_is_rejected(self):
        with pytest.raises(ValueError):
            fit_model(LOGX, MEANS, MODEL, sd=[0.0] + SDS[1:], n=NS,
                      weighting="1/SD2")


def test_rout_on_summary_rows_refits_with_sd_and_n():
    out = analyze({"analysis": "dose_response",
                   "data": {"x": LOGX, "datasets": [{
                       "name": "A",
                       "ys": [[m, s, 3] for m, s in zip(MEANS, SDS)]}]},
                   "options": {"model": MODEL, "summary_format": "mean_sd_n",
                               "rout_q": 0.01}})
    ds = out["datasets"][0]
    # Detection sees the 9 means; each flagged row drops its n = 3 points
    # and the cleaned rows are fit accounting for SD and n.
    k = ds["rout"]["n_outliers"]
    assert k < 9
    assert ds["fit"]["goodness"]["n_points"] == 3 * (9 - k)
    assert ds["fit"]["goodness"]["df"] == 3 * (9 - k) - 4
    assert ds["fit"]["replicates"]["mode"] == "account"


# ---------------------------------------------------------------- api

def summary_payload(analysis, rows_by_dataset, fmt="mean_sd_n", **options):
    return {"analysis": analysis,
            "data": {"format": fmt, "datasets": [
                {"name": n, "rows": r} for n, r in rows_by_dataset]},
            "options": options}


class TestApi:
    def test_summary_convert(self):
        out = analyze(summary_payload(
            "summary_convert", [("A", [[10.0, 2.0, 4], [5.0, 1.0, 1]])],
            error_bars="sem"))
        assert "error" not in out
        assert out["subcolumns"] == ["Mean", "SD", "N"]
        r0 = out["datasets"][0]["rows"][0]
        assert (r0["sd"], r0["sem"], r0["n"]) == (2.0, 1.0, 4)
        bar = out["datasets"][0]["bars"][0]
        assert (bar["lo"], bar["hi"], bar["kind"]) == (9.0, 11.0, "sem")
        assert out["canonical"]["datasets"][0]["ys"] == [[10.0], [5.0]]
        json.loads(analyze_json(json.dumps(summary_payload(
            "summary_convert", [("A", [[10.0, 2.0, 4]])]))))

    def test_summary_convert_collapse(self):
        out = analyze({"analysis": "summary_convert",
                       "data": {"format": "replicates", "datasets": [
                           {"name": "A", "rows": [A]}]},
                       "options": {"collapse_to": "mean_sem_n"}})
        row = out["collapsed"]["datasets"][0]["rows"][0]
        assert row[0] == pytest.approx(np.mean(A))
        assert row[1] == pytest.approx(np.std(A, ddof=1) / math.sqrt(6))

    def test_ttest_summary_equals_raw_ttest(self):
        a, b = msn(A), msn(B)
        out = analyze(summary_payload(
            "ttest_summary", [("A", [[a["mean"], a["sd"], a["n"]]]),
                              ("B", [[b["mean"], b["sd"], b["n"]]])],
            welch=True))
        raw = analyze({"analysis": "ttest",
                       "data": {"x": [None], "datasets": [
                           {"name": "A", "ys": [[v] for v in A]},
                           {"name": "B", "ys": [[v] for v in B]}]},
                       "options": {"welch": True}})
        assert out["names"] == ["A", "B"]
        close({k: raw[k] for k in raw if k != "analysis"},
              {k: out[k] for k in raw if k != "analysis"}, rel=1e-12)
        bad = analyze(summary_payload("ttest_summary", [("A", [[1, 1, 3]]),
                                                        ("B", [[2, 1, 3]])],
                                      kind="paired"))
        assert "error" in bad

    def test_one_sample_via_groups(self):
        out = analyze({"analysis": "ttest_summary",
                       "data": {"groups": [{"name": "A", **msn(A)}]},
                       "options": {"kind": "one_sample", "hypothetical": 20}})
        assert out["p_two_tailed"] == pytest.approx(
            columnstats.one_sample_t(A, 20)["p_two_tailed"], rel=1e-12)

    def test_anova_summary(self):
        rows = [(n, [[g["mean"], g["sd"], g["n"]]])
                for n, g in zip("ABC", map(msn, (A, B, C)))]
        out = analyze(summary_payload("anova_summary", rows,
                                      comparisons="tukey"))
        raw = anova.one_way_anova([A, B, C], list("ABC"))
        close(raw["table"], out["table"], rel=1e-12)
        assert len(out["multiple_comparisons"]["comparisons"]) == 3

    def test_two_way_anova_summary(self):
        cells = TestTwoWay.CELLS
        datasets = []
        for j, name in enumerate("ABC"):
            datasets.append((name, [[msn(cells[i][j])["mean"],
                                     msn(cells[i][j])["sd"] / math.sqrt(
                                         len(cells[i][j])),
                                     len(cells[i][j])] for i in range(2)]))
        out = analyze(summary_payload("two_way_anova_summary", datasets,
                                      fmt="mean_sem_n", comparisons="sidak"))
        raw = analyze({"analysis": "two_way_anova",
                       "data": {"x": [0, 1], "datasets": [
                           {"name": n, "ys": [cells[0][j], cells[1][j]]}
                           for j, n in enumerate("ABC")]},
                       "options": {"comparisons": "sidak"}})
        close(raw["sources"], out["sources"], rel=1e-10)
        close(raw["multiple_comparisons"], out["multiple_comparisons"],
              rel=1e-10)

    def test_dose_response_summary_format_and_bars(self):
        out = analyze({"analysis": "dose_response",
                       "data": {"x": CONC, "datasets": [{
                           "name": "A",
                           "ys": [[m, s, 3] for m, s in zip(MEANS, SDS)]}]},
                       "options": {"model": MODEL, "x_is_log": False,
                                   "summary_format": "mean_sd_n",
                                   "error_bars": "sem", "diagnostics": True}})
        ds = out["datasets"][0]
        assert ds["fit"]["params"]["LogIC50"]["value"] == pytest.approx(
            -6.983, abs=5e-4)
        bars = ds["points"]["bars"]
        raw_bars = raw_error_bars(REF_Y, "sem")
        assert [b["hi"] for b in bars] == pytest.approx(
            [b["hi"] for b in raw_bars], rel=1e-13)
        rt = ds["diagnostics"]["replicates_test"]
        raw_rt = analyze({"analysis": "dose_response",
                          "data": {"x": CONC, "datasets": [{
                              "name": "A", "ys": REF_Y}]},
                          "options": {"model": MODEL, "x_is_log": False,
                                      "diagnostics": True}})
        raw_rt = raw_rt["datasets"][0]["diagnostics"]["replicates_test"]
        assert rt["ss_pure_error"] == pytest.approx(raw_rt["ss_pure_error"],
                                                    rel=1e-12)
        assert rt["F"] == pytest.approx(raw_rt["F"], rel=1e-5)

    def test_dose_response_from_expanded_table(self):
        t = S.expand_summary_table(
            CONC, [{"name": "A", "rows": [[m, s, 3]
                                          for m, s in zip(MEANS, SDS)]}],
            "mean_sd_n")
        out = analyze({"analysis": "dose_response", "data": t,
                       "options": {"model": MODEL, "x_is_log": False,
                                   "summary_format": "mean_sd_n"}})
        assert out["datasets"][0]["fit"]["goodness"]["df"] == 23
        # a handler that only knows replicates sees the means
        plain = analyze({"analysis": "dose_response", "data": t,
                         "options": {"model": MODEL, "x_is_log": False}})
        assert plain["datasets"][0]["fit"]["goodness"]["df"] == 5

    def test_global_fit_summary_equals_replicates(self):
        rows = [[m, s, 3] for m, s in zip(MEANS, SDS)]
        shifted = [[v + 1.0 for v in r] for r in REF_Y]
        rows2 = [[float(np.mean(r)), float(np.std(r, ddof=1)), 3]
                 for r in shifted]
        opts = {"model": MODEL, "x_is_log": False, "shared": ["HillSlope"]}
        raw = analyze({"analysis": "global_fit",
                       "data": {"x": CONC, "datasets": [
                           {"name": "A", "ys": REF_Y},
                           {"name": "B", "ys": shifted}]},
                       "options": opts})
        summ = analyze({"analysis": "global_fit",
                        "data": {"x": CONC, "datasets": [
                            {"name": "A", "ys": rows},
                            {"name": "B", "ys": rows2}]},
                        "options": {**opts, "summary_format": "mean_sd_n"}})
        assert summ["goodness"]["df"] == raw["goodness"]["df"]
        assert summ["goodness"]["sy_x"] == pytest.approx(
            raw["goodness"]["sy_x"], rel=1e-6)
        for a, b in zip(raw["datasets"], summ["datasets"]):
            for name, p in a["params"].items():
                # optimizer stopping tolerance (Bottom sits near zero)
                assert b["params"][name]["value"] == pytest.approx(
                    p["value"], rel=1e-5, abs=1e-4)
