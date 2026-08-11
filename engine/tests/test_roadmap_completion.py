"""Tests for the roadmap-completion batch: interpolation/bands, global
fit, linear regression, new models, diagnostics, survival, RM analyses,
ROC, Bland-Altman, column ROUT. Cross-validated against closed-form
results, scipy/statsmodels/lifelines-free hand computations, and
published formulas."""

import math

import numpy as np
import pytest
from scipy import stats as sps

from prism_engine.api import analyze
from prism_engine.diagnostics import fit_diagnostics
from prism_engine.globalfit import fit_global
from prism_engine.interpolate import absolute_ic50, bands, interpolate_x
from prism_engine.linregress import linear_bands, linear_regression, runs_test
from prism_engine.methodcomp import bland_altman, roc_curve, rout_column
from prism_engine.nlfit import fit_model
from prism_engine.repeated import friedman, rm_one_way_anova
from prism_engine.survival import compare_survival, km_curve


class TestInterpolation:
    @pytest.fixture(scope="class")
    def fit(self):
        x = [-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5]
        y = [100 / (1 + 10 ** (xi + 7)) for xi in x]
        return fit_model(x, y, "log_inhibitor_vs_response_4pl")

    def test_interpolate_recovers_known_x(self, fit):
        # Y=50 must interpolate to exactly LogIC50=-7 on this exact curve
        got = interpolate_x(fit, [50.0, 90.0, None], -9, -5)
        assert got[0] == pytest.approx(-7.0, abs=1e-6)
        # Y=90: 90 = 100/(1+10^(x+7)) -> x = -7 + log10(1/9)
        assert got[1] == pytest.approx(-7 - math.log10(9), abs=1e-6)
        assert got[2] is None

    def test_out_of_range_returns_none(self, fit):
        assert interpolate_x(fit, [150.0], -9, -5) == [None]

    def test_bands_contain_curve_and_widen_for_prediction(self, fit):
        xs = np.linspace(-9, -5, 20)
        cb = bands(fit, xs, "confidence")
        pb = bands(fit, xs, "prediction")
        for i in range(20):
            assert cb["lower"][i] <= cb["y"][i] <= cb["upper"][i]
            assert pb["upper"][i] - pb["lower"][i] >= \
                cb["upper"][i] - cb["lower"][i]

    def test_absolute_ic50(self):
        # curve from 100 to 20: relative IC50 at Y=60, absolute at Y=50
        x = [-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5]
        rng = np.random.default_rng(4)
        y = [20 + 80 / (1 + 10 ** (xi + 7)) + rng.normal(0, 1) for xi in x]
        fit = fit_model(x, y, "log_inhibitor_vs_response_4pl")
        res = absolute_ic50(fit, 50.0, -9, -5)
        # analytic: 50 = 20+80/(1+10^(x+7)) -> 10^(x+7) = 80/30-1
        expect = -7 + math.log10(80 / 30 - 1)
        assert res["x"] == pytest.approx(expect, abs=0.1)
        assert res["ci"][0] < res["x"] < res["ci"][1]


class TestGlobalFit:
    def _make(self, logic50s, top=100.0, bottom=0.0, noise=0.0, seed=0):
        rng = np.random.default_rng(seed)
        x = [-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5]
        out = []
        for i, lic in enumerate(logic50s):
            y = [bottom + (top - bottom) / (1 + 10 ** ((xi - lic)))
                 + (rng.normal(0, noise) if noise else 0) for xi in x]
            out.append({"name": f"d{i}", "x": x, "y": y})
        return out

    def test_shared_top_bottom_recovers_truth(self):
        ds = self._make([-7.5, -6.5], noise=1.0, seed=3)
        res = fit_global(ds, "log_inhibitor_vs_response_4pl",
                         shared=["Top", "Bottom", "HillSlope"])
        d0, d1 = res["datasets"]
        assert d0["params"]["Top"]["shared"] is True
        assert d0["params"]["Top"]["value"] == d1["params"]["Top"]["value"]
        assert d0["params"]["LogIC50"]["value"] == pytest.approx(-7.5, abs=0.1)
        assert d1["params"]["LogIC50"]["value"] == pytest.approx(-6.5, abs=0.1)
        assert d0["params"]["LogIC50"]["value"] != d1["params"]["LogIC50"]["value"]
        # df = 18 points - 5 free params (Top,Bottom,Hill shared + 2 LogIC50)
        assert res["goodness"]["df"] == 18 - 5

    def test_global_equals_separate_when_nothing_shared(self):
        ds = self._make([-7.0], noise=1.0, seed=5)
        glob = fit_global(ds, "log_inhibitor_vs_response_4pl", shared=[])
        sep = fit_model(ds[0]["x"], ds[0]["y"],
                        "log_inhibitor_vs_response_4pl")
        assert glob["datasets"][0]["params"]["LogIC50"]["value"] == \
            pytest.approx(sep["params"]["LogIC50"]["value"], abs=1e-5)


class TestLinearRegression:
    X = [1.0, 2, 3, 4, 5, 6, 7, 8]
    Y = [2.1, 3.9, 6.2, 8.1, 9.8, 12.3, 13.9, 16.2]

    def test_matches_scipy(self):
        r = linear_regression(self.X, self.Y)
        lr = sps.linregress(self.X, self.Y)
        assert r["slope"]["value"] == pytest.approx(lr.slope)
        assert r["y_intercept"]["value"] == pytest.approx(lr.intercept)
        assert r["slope"]["se"] == pytest.approx(lr.stderr)
        assert r["r_squared"] == pytest.approx(lr.rvalue ** 2)
        assert r["f_nonzero_slope"]["p"] == pytest.approx(lr.pvalue)
        assert r["x_intercept"] == pytest.approx(
            -lr.intercept / lr.slope)

    def test_ci_hand_check(self):
        r = linear_regression(self.X, self.Y)
        tcrit = sps.t.ppf(0.975, 6)
        assert r["slope"]["ci95"][1] - r["slope"]["value"] == \
            pytest.approx(tcrit * r["slope"]["se"])

    def test_runs_test_exact_small_case(self):
        # alternating signs -> maximum runs -> P = 1 (no evidence)
        rt = runs_test([1, -1, 1, -1, 1, -1])
        assert rt["n_runs"] == 6
        assert rt["p"] == pytest.approx(1.0)
        # fully separated signs -> 2 runs -> P = 2/C(6,3) = 0.1
        rt2 = runs_test([1, 1, 1, -1, -1, -1])
        assert rt2["n_runs"] == 2
        assert rt2["p"] == pytest.approx(2 / 20)

    def test_linear_bands_closed_form(self):
        b = linear_bands(self.X, self.Y, [4.5], kind="confidence")
        x = np.array(self.X)
        r = linear_regression(self.X, self.Y)
        sxx = ((x - x.mean()) ** 2).sum()
        half = sps.t.ppf(0.975, 6) * r["sy_x"] * math.sqrt(
            1 / 8 + (4.5 - x.mean()) ** 2 / sxx)
        assert b["upper"][0] - b["y"][0] == pytest.approx(half)


class TestNewModels:
    def test_two_phase_decay_recovery(self):
        x = np.linspace(0, 20, 30)
        y = 10 + 60 * 0.7 * np.exp(-1.2 * x) + 60 * 0.3 * np.exp(-0.1 * x)
        fit = fit_model(x.tolist(), y.tolist(), "two_phase_decay")
        p = fit["params"]
        assert p["Plateau"]["value"] == pytest.approx(10, abs=0.5)
        assert p["Y0"]["value"] == pytest.approx(70, abs=0.5)
        ks = sorted([p["KFast"]["value"], p["KSlow"]["value"]])
        assert ks[0] == pytest.approx(0.1, abs=0.02)
        assert ks[1] == pytest.approx(1.2, abs=0.2)

    def test_polynomial_matches_polyfit(self):
        rng = np.random.default_rng(6)
        x = np.linspace(-3, 3, 20)
        y = 1 + 2 * x - 0.5 * x ** 2 + rng.normal(0, 0.3, 20)
        fit = fit_model(x.tolist(), y.tolist(), "polynomial_second")
        coefs = np.polyfit(x, y, 2)
        assert fit["params"]["B2"]["value"] == pytest.approx(coefs[0], rel=1e-4)
        assert fit["params"]["B1"]["value"] == pytest.approx(coefs[1], rel=1e-4)
        assert fit["params"]["B0"]["value"] == pytest.approx(coefs[2], rel=1e-4)


class TestDiagnostics:
    def test_replicates_test_flags_wrong_model(self):
        # sigmoid data fitted with a straight line -> lack of fit
        rng = np.random.default_rng(7)
        x = np.repeat(np.linspace(-9, -5, 9), 3)
        y = 100 / (1 + 10 ** (x + 7)) + rng.normal(0, 1.0, x.size)
        line = fit_model(x.tolist(), y.tolist(), "straight_line")
        diag = fit_diagnostics(x.tolist(), y.tolist(), line)
        assert diag["replicates_test"]["evidence_of_inadequate_model"] is True
        # correct model -> no evidence
        good = fit_model(x.tolist(), y.tolist(),
                         "log_inhibitor_vs_response_4pl")
        diag2 = fit_diagnostics(x.tolist(), y.tolist(), good)
        assert diag2["replicates_test"]["p"] > 0.05
        assert diag2["residual_normality"]["passed_alpha_05"] is True


class TestSurvival:
    # Classic textbook example (Motulsky, Intuitive Biostatistics style)
    T_A = [6, 13, 21, 30, 31, 37, 38, 47, 49, 50]
    E_A = [1, 1, 1, 1, 0, 1, 1, 1, 0, 1]
    T_B = [10, 21, 33, 40, 45, 46, 50, 52, 53, 55]
    E_B = [1, 1, 1, 1, 0, 1, 1, 1, 1, 0]

    def test_km_estimator_hand_check(self):
        km = km_curve([5, 10, 15], [1, 1, 0])
        # S(5) = 2/3; S(10) = 2/3 * 1/2 = 1/3; 15 censored
        surv = {p["time"]: p["survival"] for p in km["points"]}
        assert surv[5] == pytest.approx(2 / 3)
        assert surv[10] == pytest.approx(1 / 3)
        assert km["n_censored"] == 1
        assert km["median_survival"] == 10

    def test_km_with_censoring(self):
        km = km_curve([5, 8, 10], [1, 0, 1])
        # S(5)=2/3; at t=10 at-risk=1 -> S=2/3*0 = 0
        surv = {p["time"]: p["survival"] for p in km["points"]}
        assert surv[5] == pytest.approx(2 / 3)
        assert surv[10] == pytest.approx(0.0)

    def test_logrank_identical_groups_ns(self):
        res = compare_survival([(self.T_A, self.E_A), (self.T_A, self.E_A)])
        assert res["logrank"]["p"] > 0.99
        assert res["hazard_ratio"]["value"] == pytest.approx(1.0, abs=0.01)

    def test_logrank_detects_difference(self):
        short_t = [1, 2, 2, 3, 4, 4, 5, 6]
        long_t = [10, 12, 14, 15, 16, 18, 20, 22]
        ones = [1] * 8
        res = compare_survival([(short_t, ones), (long_t, ones)],
                               names=["short", "long"])
        assert res["logrank"]["p"] < 0.001
        assert res["hazard_ratio"]["value"] > 1
        assert res["gehan_breslow_wilcoxon"]["p"] < 0.001
        assert res["curves"]["short"]["median_survival"] < \
            res["curves"]["long"]["median_survival"]


class TestRepeatedMeasures:
    # subjects x treatments with a clear treatment effect (noise added so
    # the within-subject error term is nonzero)
    D = [[10.0, 11.2, 9.1, 12.3, 10.2, 11.1],   # treatment A
         [13.4, 13.9, 12.2, 15.1, 13.0, 14.2],  # treatment B
         [16.1, 17.3, 14.8, 18.2, 16.4, 16.9]]  # treatment C

    def _datasets(self):
        return self.D  # each dataset = one treatment column

    def test_rm_anova_hand_ss(self):
        res = rm_one_way_anova(self._datasets())
        t = res["table"]
        M = np.array(self.D).T  # subjects x treatments
        grand = M.mean()
        ss_treat = M.shape[0] * ((M.mean(axis=0) - grand) ** 2).sum()
        assert t["ss_treatment"] == pytest.approx(ss_treat)
        assert t["p_geisser_greenhouse"] < 0.001
        assert t["p_assuming_sphericity"] < 0.001
        assert 1 / (M.shape[1] - 1) <= t["gg_epsilon"] <= 1.0

    def test_rm_anova_matches_statsmodels(self):
        import pandas as pd
        from statsmodels.stats.anova import AnovaRM
        rows = []
        for t_idx, treat in enumerate(self.D):
            for s_idx, v in enumerate(treat):
                rows.append({"subject": s_idx, "treatment": t_idx, "y": v})
        df = pd.DataFrame(rows)
        sm_res = AnovaRM(df, "y", "subject", within=["treatment"]).fit()
        ours = rm_one_way_anova(self._datasets())
        assert ours["table"]["F"] == pytest.approx(
            float(sm_res.anova_table["F Value"].iloc[0]), rel=1e-6)

    def test_friedman_matches_scipy(self):
        res = friedman(self._datasets())
        stat, p = sps.friedmanchisquare(*self.D)
        assert res["statistic"] == pytest.approx(stat)
        assert res["p"] == pytest.approx(p)
        assert len(res["dunns"]["comparisons"]) == 3


class TestROCAndBlandAltman:
    def test_roc_auc_equals_mannwhitney_relation(self):
        rng = np.random.default_rng(8)
        patients = rng.normal(3, 1, 40).tolist()
        controls = rng.normal(0, 1, 50).tolist()
        res = roc_curve(patients, controls)
        u = sps.mannwhitneyu(patients, controls, alternative="two-sided")
        auc_mw = u.statistic / (40 * 50)
        assert res["auc"]["value"] == pytest.approx(auc_mw)
        assert res["auc"]["p_vs_05"] < 1e-6
        assert 0.9 < res["auc"]["value"] <= 1.0
        # sensitivity/specificity endpoints
        sens = [p["sensitivity"] for p in res["points"]]
        assert min(sens) == 0.0 and max(sens) == 1.0

    def test_roc_random_data_auc_half(self):
        rng = np.random.default_rng(9)
        a = rng.normal(0, 1, 60).tolist()
        b = rng.normal(0, 1, 60).tolist()
        res = roc_curve(a, b)
        assert res["auc"]["ci"][0] < 0.5 < res["auc"]["ci"][1]

    def test_bland_altman_hand_check(self):
        a = [10.0, 12, 11, 14, 13]
        b = [9.5, 12.5, 10.5, 13.0, 13.5]
        res = bland_altman(a, b)
        d = np.array(a) - np.array(b)
        assert res["bias"]["value"] == pytest.approx(d.mean())
        assert res["sd_of_differences"] == pytest.approx(d.std(ddof=1))
        z = sps.norm.ppf(0.975)
        assert res["loa_upper"]["value"] == pytest.approx(
            d.mean() + z * d.std(ddof=1))
        assert len(res["points"]) == 5


class TestColumnROUT:
    def test_finds_planted_outlier(self):
        vals = [10.0, 10.5, 9.8, 10.2, 9.9, 10.1, 10.3, 25.0]
        res = rout_column(vals, q=0.01)
        assert res["outliers"] == [25.0]
        assert 25.0 not in res["cleaned"]

    def test_clean_data_no_outliers(self):
        rng = np.random.default_rng(10)
        vals = rng.normal(50, 2, 20).tolist()
        assert rout_column(vals)["outliers"] == []


class TestNewAPIsEndToEnd:
    def test_survival_api(self):
        res = analyze({
            "analysis": "survival",
            "data": {"x": [], "datasets": [
                {"name": "Control", "ys": [[6, 1], [13, 1], [21, 1], [30, 0]]},
                {"name": "Treated", "ys": [[20, 1], [30, 1], [40, 0], [50, 1]]},
            ]},
            "options": {},
        })
        assert "logrank" in res
        assert "Control" in res["curves"]

    def test_global_fit_api(self):
        x = [1e-9, 1e-8, 1e-7, 1e-6, 1e-5]
        def ys(lic):
            return [[100 / (1 + 10 ** (math.log10(c) - lic))] for c in x]
        res = analyze({
            "analysis": "global_fit",
            "data": {"x": x, "datasets": [
                {"name": "A", "ys": ys(-7.5)}, {"name": "B", "ys": ys(-6.5)},
            ]},
            "options": {"model": "log_inhibitor_vs_response_4pl",
                        "x_is_log": False,
                        "shared": ["Top", "Bottom", "HillSlope"]},
        })
        assert res["datasets"][0]["params"]["LogIC50"]["value"] == \
            pytest.approx(-7.5, abs=0.05)
        assert "curve" in res["datasets"][0]

    def test_linear_regression_api(self):
        res = analyze({
            "analysis": "linear_regression",
            "data": {"x": [1, 2, 3, 4, 5],
                     "datasets": [{"name": "d", "ys": [[2.0], [4.1], [5.9],
                                                       [8.2], [9.9]]}]},
            "options": {"bands": "confidence"},
        })
        fit = res["datasets"][0]["fit"]
        assert fit["slope"]["value"] == pytest.approx(2.0, abs=0.1)
        assert "bands" in fit

    def test_interpolation_and_diagnostics_api(self):
        x = [1e-9, 3.162e-9, 1e-8, 3.162e-8, 1e-7, 3.162e-7, 1e-6]
        ys = [[100 / (1 + c / 1e-7) + i * 0.01] for i, c in enumerate(x)]
        res = analyze({
            "analysis": "dose_response",
            "data": {"x": x, "datasets": [{"name": "d", "ys": ys}]},
            "options": {"model": "log_inhibitor_vs_response_4pl",
                        "x_is_log": False,
                        "constraints": {"Top": 100, "Bottom": 0},
                        "interpolate_y": [50.0],
                        "bands": "confidence",
                        "diagnostics": True},
        })
        entry = res["datasets"][0]
        assert entry["interpolated_x"][0] == pytest.approx(-7.0, abs=0.05)
        assert "bands" in entry
        assert "runs_test" in entry["diagnostics"]

    def test_rm_and_roc_and_ba_apis(self):
        data = {"x": [], "datasets": [
            {"name": "A", "ys": [[10.0], [11], [9], [12]]},
            {"name": "B", "ys": [[13.0], [14], [12], [15]]},
            {"name": "C", "ys": [[16.0], [17], [15], [18]]},
        ]}
        rm = analyze({"analysis": "rm_anova", "data": data, "options": {}})
        assert rm["table"]["p_geisser_greenhouse"] < 0.01
        fr = analyze({"analysis": "rm_anova", "data": data,
                      "options": {"kind": "nonparametric"}})
        assert fr["analysis"] == "friedman"
        roc = analyze({"analysis": "roc", "data": data,
                       "options": {"patients": 2, "controls": 0}})
        assert roc["auc"]["value"] == 1.0
        ba = analyze({"analysis": "bland_altman", "data": data,
                      "options": {"dataset_a": 0, "dataset_b": 1}})
        assert ba["bias"]["value"] == pytest.approx(-3.0)


class TestSurvivalVsStatsmodels:
    """Cross-validate log-rank and Gehan-Breslow against statsmodels'
    independent implementation (survdiff weight_type=None / 'gb')."""

    T1 = [6, 13, 21, 30, 31, 37, 38, 47, 49, 50]
    E1 = [1, 1, 1, 1, 0, 1, 1, 1, 0, 1]
    T2 = [10, 21, 33, 40, 45, 46, 50, 52, 53, 55]
    E2 = [1, 1, 1, 1, 0, 1, 1, 1, 1, 0]

    def _sm(self, weight_type=None):
        from statsmodels.duration.survfunc import survdiff
        time = np.array(self.T1 + self.T2, dtype=float)
        status = np.array(self.E1 + self.E2)
        group = np.array([0] * 10 + [1] * 10)
        return survdiff(time, status, group, weight_type=weight_type)

    def test_gehan_breslow_matches_statsmodels(self):
        res = compare_survival([(self.T1, self.E1), (self.T2, self.E2)])
        chi2_sm, p_sm = self._sm("gb")
        assert res["gehan_breslow_wilcoxon"]["chi2"] == \
            pytest.approx(float(chi2_sm), rel=1e-6)
        assert res["gehan_breslow_wilcoxon"]["p"] == \
            pytest.approx(float(p_sm), abs=1e-9)

    def test_logrank_variance_form_matches_statsmodels(self):
        # Prism reports the Peto (O-E)^2/E form; the variance-based form
        # (which statsmodels uses) must match our covariance machinery.
        from prism_engine.survival import (_quadratic_form_chi2,
                                           _weighted_logrank)
        O, E, V, k = _weighted_logrank(
            [(self.T1, self.E1), (self.T2, self.E2)], lambda N: 1.0)
        chi2 = _quadratic_form_chi2(O, E, V, k)
        chi2_sm, _ = self._sm(None)
        assert chi2 == pytest.approx(float(chi2_sm), rel=1e-6)
