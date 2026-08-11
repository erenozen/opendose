import numpy as np
import pytest

from prism_engine.doseresponse import fit_dose_response, model_curve


def make_4pl(x, top, bottom, log_ic50, hill):
    return model_curve(np.array(x), top, bottom, log_ic50, hill)


LOG_X = [-9.0, -8.5, -8.0, -7.5, -7.0, -6.5, -6.0, -5.5, -5.0]


class TestExactRecovery:
    """Noise-free data must recover generating parameters near-exactly."""

    def test_inhibitor_4pl(self):
        y = make_4pl(LOG_X, top=100.0, bottom=5.0, log_ic50=-7.2, hill=-0.8)
        fit = fit_dose_response(LOG_X, y, "log_inhibitor_vs_response_4pl")
        p = fit["params"]
        assert p["Top"]["value"] == pytest.approx(100.0, abs=1e-6)
        assert p["Bottom"]["value"] == pytest.approx(5.0, abs=1e-6)
        assert p["LogIC50"]["value"] == pytest.approx(-7.2, abs=1e-8)
        assert p["HillSlope"]["value"] == pytest.approx(-0.8, abs=1e-8)
        assert p["IC50"]["value"] == pytest.approx(10 ** -7.2, rel=1e-8)
        assert fit["goodness"]["r_squared"] == pytest.approx(1.0, abs=1e-12)

    def test_agonist_4pl(self):
        y = make_4pl(LOG_X, top=95.0, bottom=2.0, log_ic50=-7.0, hill=1.3)
        fit = fit_dose_response(LOG_X, y, "log_agonist_vs_response_4pl")
        p = fit["params"]
        assert p["LogEC50"]["value"] == pytest.approx(-7.0, abs=1e-8)
        assert p["HillSlope"]["value"] == pytest.approx(1.3, abs=1e-8)

    def test_3pl_fixes_hillslope(self):
        y = make_4pl(LOG_X, top=100.0, bottom=0.0, log_ic50=-7.0, hill=-1.0)
        fit = fit_dose_response(LOG_X, y, "log_inhibitor_vs_response_3pl")
        p = fit["params"]
        assert p["HillSlope"]["value"] == -1.0
        assert p["HillSlope"]["constrained"] is True
        assert p["LogIC50"]["value"] == pytest.approx(-7.0, abs=1e-8)
        # 3 free params -> df = n - 3
        assert fit["goodness"]["df"] == len(LOG_X) - 3


class TestConstraints:
    def test_bottom_constant_zero(self):
        y = make_4pl(LOG_X, top=100.0, bottom=0.0, log_ic50=-7.0, hill=-1.1)
        fit = fit_dose_response(LOG_X, y, "log_inhibitor_vs_response_4pl",
                                constraints={"Bottom": 0.0})
        p = fit["params"]
        assert p["Bottom"]["value"] == 0.0
        assert p["Bottom"]["constrained"] is True
        assert p["LogIC50"]["value"] == pytest.approx(-7.0, abs=1e-8)
        assert fit["goodness"]["df"] == len(LOG_X) - 3


class TestStatistics:
    """Statistical outputs on noisy data with replicates."""

    def _noisy_fit(self):
        rng = np.random.default_rng(42)
        xs, ys = [], []
        for xv in LOG_X:
            true = make_4pl([xv], 100.0, 5.0, -7.2, -1.0)[0]
            for _ in range(3):  # triplicates, each an individual point
                xs.append(xv)
                ys.append(true + rng.normal(0, 3.0))
        return fit_dose_response(xs, ys, "log_inhibitor_vs_response_4pl"), xs

    def test_df_counts_every_replicate(self):
        fit, xs = self._noisy_fit()
        assert fit["goodness"]["n_points"] == 27
        assert fit["goodness"]["df"] == 27 - 4

    def test_params_within_ci(self):
        fit, _ = self._noisy_fit()
        p = fit["params"]
        lo, hi = p["LogIC50"]["ci95"]
        assert lo < -7.2 < hi
        assert lo < p["LogIC50"]["value"] < hi

    def test_ic50_ci_is_asymmetric_transform_of_log_ci(self):
        fit, _ = self._noisy_fit()
        p = fit["params"]
        log_lo, log_hi = p["LogIC50"]["ci95"]
        lin_lo, lin_hi = p["IC50"]["ci95"]
        assert lin_lo == pytest.approx(10 ** log_lo, rel=1e-12)
        assert lin_hi == pytest.approx(10 ** log_hi, rel=1e-12)

    def test_r_squared_reasonable(self):
        fit, _ = self._noisy_fit()
        assert 0.95 < fit["goodness"]["r_squared"] < 1.0


class TestValidationAgainstIndependentImplementation:
    """Cross-check SEs against a from-scratch computation of the
    asymptotic covariance (finite-difference Jacobian), so a scipy
    misuse can't silently produce wrong uncertainties."""

    def test_se_matches_manual_jacobian(self):
        rng = np.random.default_rng(7)
        y = make_4pl(LOG_X, 100.0, 0.0, -7.0, -1.0) + rng.normal(0, 2.0, len(LOG_X))
        fit = fit_dose_response(LOG_X, y, "log_inhibitor_vs_response_4pl")
        fv = fit["fitted_values"]
        theta = np.array([fv["Top"], fv["Bottom"], fv["LogXmid"], fv["HillSlope"]])

        def resid(t):
            return np.asarray(y) - model_curve(np.array(LOG_X), *t)

        eps = 1e-6
        J = np.zeros((len(LOG_X), 4))
        for j in range(4):
            d = np.zeros(4)
            d[j] = eps
            J[:, j] = (resid(theta + d) - resid(theta - d)) / (2 * eps)
        dof = len(LOG_X) - 4
        s2 = float(resid(theta) @ resid(theta)) / dof
        cov = np.linalg.inv(J.T @ J) * s2
        manual_se = np.sqrt(np.diag(cov))

        p = fit["params"]
        got = [p["Top"]["se"], p["Bottom"]["se"],
               p["LogIC50"]["se"], p["HillSlope"]["se"]]
        assert got == pytest.approx(manual_se, rel=1e-3)


def test_insufficient_points_raises():
    with pytest.raises(ValueError, match="not enough data points"):
        fit_dose_response([-8, -7, -6], [90, 50, 10],
                          "log_inhibitor_vs_response_4pl")
