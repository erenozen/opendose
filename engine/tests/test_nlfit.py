"""Tests for the general nonlinear engine: model library, weighting,
profile-likelihood CIs, robust/ROUT, and fit comparison."""

import math

import numpy as np
import pytest
from scipy import stats as sps

from opendose.nlfit import (MODELS, aicc, compare_fits_aicc,
                                compare_fits_f_test, fit_model,
                                robust_fit, rout_outliers)


class TestModelLibrary:
    def test_michaelis_menten_exact_recovery(self):
        x = [0.5, 1, 2, 4, 8, 16, 32, 64]
        y = [10.0 * xi / (5.0 + xi) for xi in x]
        fit = fit_model(x, y, "michaelis_menten")
        assert fit["params"]["Vmax"]["value"] == pytest.approx(10.0, rel=1e-6)
        assert fit["params"]["Km"]["value"] == pytest.approx(5.0, rel=1e-6)

    def test_one_phase_decay_and_half_life(self):
        x = list(np.linspace(0, 10, 12))
        k = 0.35
        y = [(100 - 20) * math.exp(-k * xi) + 20 for xi in x]
        fit = fit_model(x, y, "one_phase_decay")
        p = fit["params"]
        assert p["K"]["value"] == pytest.approx(k, rel=1e-6)
        assert p["Y0"]["value"] == pytest.approx(100, rel=1e-6)
        assert p["Plateau"]["value"] == pytest.approx(20, rel=1e-6)
        assert p["HalfLife"]["value"] == pytest.approx(math.log(2) / k, rel=1e-6)
        assert p["HalfLife"]["ci95"] is not None

    def test_one_phase_association(self):
        x = list(np.linspace(0, 20, 10))
        y = [5 + (50 - 5) * (1 - math.exp(-0.25 * xi)) for xi in x]
        fit = fit_model(x, y, "one_phase_association")
        assert fit["params"]["K"]["value"] == pytest.approx(0.25, rel=1e-6)

    def test_exponential_growth_doubling_time(self):
        x = list(np.linspace(0, 5, 8))
        y = [3.0 * math.exp(0.5 * xi) for xi in x]
        fit = fit_model(x, y, "exponential_growth")
        assert fit["params"]["K"]["value"] == pytest.approx(0.5, rel=1e-6)
        assert fit["params"]["DoublingTime"]["value"] == pytest.approx(
            math.log(2) / 0.5, rel=1e-6)

    def test_straight_line_matches_linregress(self):
        rng = np.random.default_rng(5)
        x = np.linspace(0, 10, 15)
        y = 2.5 * x + 1.0 + rng.normal(0, 0.8, 15)
        fit = fit_model(x.tolist(), y.tolist(), "straight_line")
        lr = sps.linregress(x, y)
        assert fit["params"]["Slope"]["value"] == pytest.approx(lr.slope, rel=1e-6)
        assert fit["params"]["Yintercept"]["value"] == pytest.approx(
            lr.intercept, rel=1e-6)
        assert fit["params"]["Slope"]["se"] == pytest.approx(lr.stderr, rel=1e-4)

    def test_registry_metadata(self):
        for spec in MODELS.values():
            assert spec.equation and spec.params and spec.label


class TestWeighting:
    def test_weighted_fit_changes_result_with_heteroscedastic_noise(self):
        # noise proportional to Y: 1/Y2 weighting should recover truth better
        rng = np.random.default_rng(11)
        x = np.linspace(0.5, 50, 20)
        true = 10.0 * x / (5.0 + x)
        y = true * (1 + rng.normal(0, 0.15, x.size))
        unw = fit_model(x.tolist(), y.tolist(), "michaelis_menten")
        wtd = fit_model(x.tolist(), y.tolist(), "michaelis_menten",
                        weighting="1/Y2")
        assert wtd["weighting"] == "1/Y2"
        assert wtd["goodness"]["ss_res_weighted"] is not None
        # both close-ish to truth; weighted must be a valid fit
        assert abs(wtd["params"]["Vmax"]["value"] - 10) < 2.0
        assert abs(unw["params"]["Vmax"]["value"] - 10) < 2.0

    def test_weighted_equals_unweighted_on_perfect_data(self):
        x = [1.0, 2, 4, 8, 16]
        y = [8.0 * xi / (3.0 + xi) for xi in x]
        for w in ("1/Y", "1/Y2", "1/X"):
            fit = fit_model(x, y, "michaelis_menten", weighting=w)
            assert fit["params"]["Vmax"]["value"] == pytest.approx(8.0, rel=1e-5)
            assert fit["params"]["Km"]["value"] == pytest.approx(3.0, rel=1e-5)


class TestProfileCI:
    def test_profile_brackets_truth_and_close_to_asymptotic_when_wellbehaved(self):
        rng = np.random.default_rng(3)
        x = np.linspace(0.5, 60, 24)
        y = 10.0 * x / (5.0 + x) + rng.normal(0, 0.15, x.size)
        asym = fit_model(x.tolist(), y.tolist(), "michaelis_menten")
        prof = fit_model(x.tolist(), y.tolist(), "michaelis_menten",
                         ci_method="profile")
        for name in ("Vmax", "Km"):
            a_lo, a_hi = asym["params"][name]["ci95"]
            p_lo, p_hi = prof["params"][name]["ci95"]
            v = prof["params"][name]["value"]
            assert p_lo < v < p_hi
            # near-linear problem: profile ~ asymptotic within 25%
            assert abs(p_lo - a_lo) < 0.25 * (a_hi - a_lo)
            assert abs(p_hi - a_hi) < 0.25 * (a_hi - a_lo)

    def test_profile_asymmetric_for_dose_response_logic50(self):
        # sparse noisy data -> asymmetric profile interval
        x = [-9, -8, -7, -6, -5]
        rng = np.random.default_rng(9)
        y = [100 / (1 + 10 ** ((xi + 7) * 1.0)) + rng.normal(0, 4)
             for xi in x]
        prof = fit_model(x, y, "log_inhibitor_vs_response_4pl",
                         constraints={"Top": 100, "Bottom": 0},
                         ci_method="profile")
        lo, hi = prof["params"]["LogIC50"]["ci95"]
        v = prof["params"]["LogIC50"]["value"]
        assert lo < v < hi
        assert math.isfinite(lo) and math.isfinite(hi)


class TestRobustROUT:
    def _data_with_outliers(self):
        x = np.linspace(0.5, 50, 20)
        y = 10.0 * x / (5.0 + x)
        y = y + np.random.default_rng(7).normal(0, 0.08, x.size)
        y[3] += 6.0   # gross outliers
        y[15] -= 5.0
        return x.tolist(), y.tolist()

    def test_robust_resists_outliers(self):
        x, y = self._data_with_outliers()
        ols = fit_model(x, y, "michaelis_menten")
        rob = robust_fit(x, y, "michaelis_menten")
        # robust estimate much closer to truth than OLS
        assert abs(rob["fitted_values"]["Vmax"] - 10.0) < \
            abs(ols["params"]["Vmax"]["value"] - 10.0) + 0.05
        assert abs(rob["fitted_values"]["Km"] - 5.0) < 1.0

    def test_rout_finds_planted_outliers(self):
        x, y = self._data_with_outliers()
        res = rout_outliers(x, y, "michaelis_menten", q=0.01)
        flagged_x = {round(o["x"], 4) for o in res["outliers"]}
        assert round(x[3], 4) in flagged_x
        assert round(x[15], 4) in flagged_x
        assert res["n_outliers"] == 2
        # cleaned fit recovers truth tightly
        assert res["fit"]["params"]["Vmax"]["value"] == pytest.approx(10.0, abs=0.3)

    def test_rout_clean_data_flags_nothing(self):
        x = np.linspace(0.5, 50, 20)
        y = 10.0 * x / (5.0 + x) + np.random.default_rng(8).normal(0, 0.1, 20)
        res = rout_outliers(x.tolist(), y.tolist(), "michaelis_menten", q=0.01)
        assert res["n_outliers"] == 0


class TestCompareFits:
    def test_f_test_prefers_4pl_when_slope_differs_from_one(self):
        x = [-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5]
        y = [100 / (1 + 10 ** ((-7 - xi) * -0.5)) for xi in x]  # hill=-0.5
        f4 = fit_model(x, y, "log_inhibitor_vs_response_4pl",
                       constraints={"Top": 100, "Bottom": 0})
        f3 = fit_model(x, y, "log_inhibitor_vs_response_3pl",
                       constraints={"Top": 100, "Bottom": 0})
        cmp = compare_fits_f_test(f3["goodness"]["ss_res"], f3["goodness"]["df"],
                                  f4["goodness"]["ss_res"], f4["goodness"]["df"])
        assert cmp["prefer_complex"] is True
        assert cmp["p"] < 1e-6

    def test_f_test_no_preference_when_simple_is_true(self):
        rng = np.random.default_rng(21)
        x = [-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5] * 3
        y = [100 / (1 + 10 ** (xi + 7)) + rng.normal(0, 2) for xi in x]
        f4 = fit_model(x, y, "log_inhibitor_vs_response_4pl",
                       constraints={"Top": 100, "Bottom": 0})
        f3 = fit_model(x, y, "log_inhibitor_vs_response_3pl",
                       constraints={"Top": 100, "Bottom": 0})
        cmp = compare_fits_f_test(f3["goodness"]["ss_res"], f3["goodness"]["df"],
                                  f4["goodness"]["ss_res"], f4["goodness"]["df"])
        assert cmp["p"] > 0.05

    def test_aicc_formula(self):
        # hand check: n=20, ss=40, k=3 (+1 for variance -> K=4)
        got = aicc(40.0, 20, 3)
        k = 4
        expect = 20 * math.log(2.0) + 2 * k + 2 * k * (k + 1) / (20 - k - 1)
        assert got == pytest.approx(expect)

    def test_aicc_comparison_probabilities_sum_to_one(self):
        cmp = compare_fits_aicc(50.0, 2, 45.0, 4, 20)
        assert cmp["probability_1"] + cmp["probability_2"] == pytest.approx(1.0)


class TestSpanVsPrism:
    """Validation session 1 (docs/prism-validation.md): the user's Prism
    run on the normalized reference data reported Span 99.27 with CI
    96.83 to 101.7; our Span (full-covariance SE) must reproduce it."""

    def test_span_matches_prism_screenshot(self):
        from opendose.normalize import normalize_dataset
        x_log = [-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5]
        ref_y = [[98.2, 101.5, 99.1], [97.0, 95.8, 99.9], [93.4, 90.1, 92.7],
                 [78.9, 82.3, 80.0], [51.2, 48.7, 50.9], [22.1, 25.6, 24.0],
                 [8.9, 10.2, 7.5], [3.1, 4.4, 2.2], [1.0, 0.5, 2.1]]
        norm = normalize_dataset(ref_y, zero_mode="value", zero_value=0.0,
                                 hundred_mode="largest", subcolumns="mean")
        xs, ys = [], []
        for xv, row in zip(x_log, norm):
            for v in row:
                xs.append(xv)
                ys.append(v)
        fit = fit_model(xs, ys, "log_inhibitor_vs_response_4pl")
        span = fit["params"]["Span"]
        assert span["value"] == pytest.approx(99.27, abs=0.01)
        assert span["ci95"][0] == pytest.approx(96.83, abs=0.01)
        assert span["ci95"][1] == pytest.approx(101.7, abs=0.05)

    def test_span_with_constrained_bottom(self):
        x = [-9, -8, -7, -6, -5]
        y = [100 / (1 + 10 ** (xi + 7)) for xi in x]
        fit = fit_model(x, y, "log_inhibitor_vs_response_4pl",
                        constraints={"Bottom": 0.0})
        span = fit["params"]["Span"]
        assert span["value"] == pytest.approx(fit["params"]["Top"]["value"])
        assert span["se"] == pytest.approx(fit["params"]["Top"]["se"])
