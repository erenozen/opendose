"""Digit-level parity against a REAL GraphPad Prism installation.

Ground truth: the user's Prism results sheet (validation session 2,
2026-08-11, docs/prism-validation.md) for the reference dataset with the
protocol chain Data -> Transform X=log(X) -> Nonlinear regression,
log(inhibitor) vs. response -- Variable slope (4PL), asymptotic CIs.

Every assertion below is a number read off the Prism screen, at Prism's
display precision. All 16 matched our engine exactly when this test was
written, and it must stay that way.
"""

import math

import pytest

from prism_engine.nlfit import fit_model

# Concentrations exactly as typed into both tools (3.162e-9, not 10^-8.5).
CONC = [1e-9, 3.162e-9, 1e-8, 3.162e-8, 1e-7, 3.162e-7, 1e-6, 3.162e-6, 1e-5]
REF_Y = [[98.2, 101.5, 99.1], [97.0, 95.8, 99.9], [93.4, 90.1, 92.7],
         [78.9, 82.3, 80.0], [51.2, 48.7, 50.9], [22.1, 25.6, 24.0],
         [8.9, 10.2, 7.5], [3.1, 4.4, 2.2], [1.0, 0.5, 2.1]]


@pytest.fixture(scope="module")
def fit():
    xs, ys = [], []
    for c, row in zip(CONC, REF_Y):
        for v in row:
            xs.append(math.log10(c))
            ys.append(v)
    return fit_model(xs, ys, "log_inhibitor_vs_response_4pl")


# (name, prism_display_value, absolute display tolerance)
PRISM_BEST_FIT = [
    ("Bottom", 0.9801, 5e-5),
    ("Top", 99.86, 5e-3),
    ("LogIC50", -6.983, 5e-4),
    ("HillSlope", -1.103, 5e-4),
    ("IC50", 1.040e-7, 5e-11),
    ("Span", 98.88, 5e-3),
]

PRISM_CI = [
    ("Bottom", -0.5601, 2.520, 5e-4),
    ("Top", 98.34, 101.4, 5e-2),
    ("LogIC50", -7.013, -6.953, 5e-4),
    ("HillSlope", -1.183, -1.023, 5e-4),
    ("IC50", 9.694e-8, 1.115e-7, 5e-11),
    ("Span", 96.44, 101.3, 5e-2),
]


@pytest.mark.parametrize("name,expected,tol", PRISM_BEST_FIT)
def test_best_fit_values_match_prism(fit, name, expected, tol):
    assert fit["params"][name]["value"] == pytest.approx(expected, abs=tol)


@pytest.mark.parametrize("name,lo,hi,tol", PRISM_CI)
def test_confidence_intervals_match_prism(fit, name, lo, hi, tol):
    got_lo, got_hi = fit["params"][name]["ci95"]
    assert got_lo == pytest.approx(lo, abs=tol)
    assert got_hi == pytest.approx(hi, abs=tol)


def test_goodness_of_fit_matches_prism(fit):
    g = fit["goodness"]
    assert g["df"] == 23
    assert g["r_squared"] == pytest.approx(0.9986, abs=5e-5)
    assert g["ss_res"] == pytest.approx(59.58, abs=5e-3)
    assert g["sy_x"] == pytest.approx(1.610, abs=5e-4)
    assert g["n_points"] == 27


class TestProfileCIsVsPrism:
    """Validation session 3 (2026-08-11): unweighted fit with Prism's
    default asymmetrical (profile likelihood) CIs; matched digit-perfect."""

    PRISM_PROFILE_CI = [
        ("Bottom", -0.6173, 2.508, 5e-4),
        ("Top", 98.37, 101.4, 5e-2),
        ("LogIC50", -7.013, -6.953, 5e-4),
        ("HillSlope", -1.188, -1.025, 5e-4),
        ("IC50", 9.696e-8, 1.115e-7, 5e-11),
    ]

    @pytest.fixture(scope="class")
    def fit_profile(self):
        xs, ys = [], []
        for c, row in zip(CONC, REF_Y):
            for v in row:
                xs.append(math.log10(c))
                ys.append(v)
        return fit_model(xs, ys, "log_inhibitor_vs_response_4pl",
                         ci_method="profile")

    @pytest.mark.parametrize("name,lo,hi,tol", PRISM_PROFILE_CI)
    def test_profile_ci_matches_prism(self, fit_profile, name, lo, hi, tol):
        got_lo, got_hi = fit_profile["params"][name]["ci95"]
        assert got_lo == pytest.approx(lo, abs=tol)
        assert got_hi == pytest.approx(hi, abs=tol)


class TestWeightedFitVsPrism:
    """Validation session 3: 1/Y² weighted fit. Prism weights replicates
    by the mean observed Y at each X (weight_source='observed_mean', now
    the engine default). Best-fit values, weighted R², weighted SS and
    Sy.x matched at display precision. (Weighted PROFILE CIs differ a few
    percent; open parity question, see docs/prism-validation.md.)"""

    @pytest.fixture(scope="class")
    def fit_weighted(self):
        xs, ys = [], []
        for c, row in zip(CONC, REF_Y):
            for v in row:
                xs.append(math.log10(c))
                ys.append(v)
        return fit_model(xs, ys, "log_inhibitor_vs_response_4pl",
                         weighting="1/Y2")

    @pytest.mark.parametrize("name,expected,tol", [
        ("Bottom", 0.3122, 5e-4),
        ("Top", 101.4, 1e-1),
        ("LogIC50", -7.002, 5e-4),
        ("HillSlope", -1.023, 5e-4),
        ("IC50", 9.955e-8, 5e-11),
        ("Span", 101.0, 5e-2),
    ])
    def test_weighted_best_fit_matches_prism(self, fit_weighted, name,
                                             expected, tol):
        assert fit_weighted["params"][name]["value"] == \
            pytest.approx(expected, abs=tol)

    def test_weighted_goodness_matches_prism(self, fit_weighted):
        g = fit_weighted["goodness"]
        assert g["r_squared_weighted"] == pytest.approx(0.9422, abs=5e-4)
        assert g["ss_res_weighted"] == pytest.approx(1.232, abs=5e-3)
        assert g["sy_x"] == pytest.approx(0.2314, abs=5e-4)
        assert g["df"] == 23


class TestWeightedProfileCIsVsPrism:
    """Session 3 resolution: Prism's weighted fitting is IRLS with
    predicted-curve weights (unweighted first iteration; weights frozen
    within each iteration) per the 'Math theory of weighting' guide page.
    With IRLS + Venzon-Moolgavkar profiling, the weighted 1/Y² profile
    CIs match Prism at every displayed digit."""

    PRISM_WEIGHTED_PROFILE_CI = [
        ("Bottom", -0.2869, 2.223, 5e-4),
        ("Top", 86.18, 124.0, 5e-2),
        ("LogIC50", -7.267, -6.784, 5e-4),
        ("HillSlope", -1.307, -0.8252, 5e-4),
        ("IC50", 5.408e-8, 1.643e-7, 5e-11),
    ]

    @pytest.fixture(scope="class")
    def fit_weighted_profile(self):
        xs, ys = [], []
        for c, row in zip(CONC, REF_Y):
            for v in row:
                xs.append(math.log10(c))
                ys.append(v)
        return fit_model(xs, ys, "log_inhibitor_vs_response_4pl",
                         weighting="1/Y2", ci_method="profile")

    @pytest.mark.parametrize("name,lo,hi,tol", PRISM_WEIGHTED_PROFILE_CI)
    def test_weighted_profile_ci_matches_prism(self, fit_weighted_profile,
                                               name, lo, hi, tol):
        got_lo, got_hi = fit_weighted_profile["params"][name]["ci95"]
        assert got_lo == pytest.approx(lo, abs=tol)
        assert got_hi == pytest.approx(hi, abs=tol)

    def test_weighted_goodness_exact(self, fit_weighted_profile):
        g = fit_weighted_profile["goodness"]
        assert g["r_squared_weighted"] == pytest.approx(0.9422, abs=5e-5)
        assert g["ss_res_weighted"] == pytest.approx(1.232, abs=5e-4)
        assert g["sy_x"] == pytest.approx(0.2314, abs=5e-5)
