"""Exact Dunnett distribution (opendose.dunnett) and Dunnett's test.

Pinned reference values:
- Two-sided critical values of Dunnett's t for comparing k treatments
  with one control, equal group sizes (correlation 0.5), as printed in
  Dunnett's tables (C. W. Dunnett 1955, J Am Stat Assoc 50:1096-1121,
  two-sided table; revised two-sided values in C. W. Dunnett 1964,
  Biometrics 20:482-491), two decimals. alpha = 0.05 for df = 5, 10, 20,
  60 and k = 1..9 (e.g. df 20, k 3 -> 2.54) and alpha = 0.01 for df 20.
- scipy's multivariate t CDF (the quasi-Monte Carlo routine that
  scipy.stats.dunnett itself uses) run with 10^6 points, and
  scipy.stats.dunnett with its default settings (P to ~1e-4, its CI
  limits to ~1e-2 between seeds).
- An independent nested adaptive quadrature of the same 2-D integral
  (scipy.integrate.quad over z inside quad over s).
"""

import math
import warnings

import numpy as np
import pytest
from scipy import integrate, stats

from opendose import anova, dunnett

RHO_HALF = math.sqrt(0.5)

# Dunnett's two-sided tables, k = 1..9 treatments
TABLE_05 = {
    5: [2.57, 3.03, 3.29, 3.48, 3.62, 3.73, 3.82, 3.90, 3.97],
    10: [2.23, 2.57, 2.76, 2.89, 2.99, 3.07, 3.14, 3.19, 3.24],
    20: [2.09, 2.38, 2.54, 2.65, 2.73, 2.80, 2.86, 2.90, 2.95],
    60: [2.00, 2.27, 2.41, 2.51, 2.58, 2.64, 2.69, 2.73, 2.77],
}
TABLE_01_DF20 = [2.85, 3.13, 3.29, 3.40, 3.48, 3.55, 3.60, 3.65, 3.69]


def _groups(seed=3, sizes=(6, 4, 9, 7), shifts=(0, 0, 2.5, 1.2)):
    rng = np.random.default_rng(seed)
    return [rng.normal(10 + s, 2, n) for n, s in zip(sizes, shifts)]


def _quad_sf(c, lam, df):
    """Independent reference: nested adaptive quadrature (z inside s) of
    the tail integrand, scalar math only."""
    lam = [float(x) for x in lam]
    b = [math.sqrt(1 - x * x) for x in lam]
    sq2 = math.sqrt(2.0)

    def inner(s):
        cs = c * s

        def f(z):
            log_keep = 0.0
            for lj, bj in zip(lam, b):
                q = 0.5 * math.erfc((cs + lj * z) / bj / sq2) \
                    + 0.5 * math.erfc((cs - lj * z) / bj / sq2)
                log_keep += math.log1p(-min(q, 1.0)) if q < 1 else -math.inf
            return math.exp(-z * z / 2) / math.sqrt(2 * math.pi) \
                * -math.expm1(log_keep)
        return integrate.quad(f, -12, 12, epsabs=1e-16, epsrel=1e-11,
                              limit=200)[0]

    log_norm = (df / 2) * math.log(df / 2) + math.log(2) - math.lgamma(df / 2)

    def dens(s):
        return math.exp(log_norm + (df - 1) * math.log(s) - df * s * s / 2) \
            if s > 0 else 0.0

    return integrate.quad(lambda s: inner(s) * dens(s), 0, np.inf,
                          epsabs=1e-16, epsrel=1e-10, limit=200)[0]


class TestCriticalValues:
    @pytest.mark.parametrize("df", sorted(TABLE_05))
    def test_dunnett_table_two_sided_05(self, df):
        for k, expected in enumerate(TABLE_05[df], start=1):
            c = dunnett.critical_value_one_factor(
                0.95, np.full(k, RHO_HALF), df)
            assert round(c, 2) == expected, (df, k, c)

    def test_dunnett_table_two_sided_01_df20(self):
        for k, expected in enumerate(TABLE_01_DF20, start=1):
            c = dunnett.critical_value_one_factor(
                0.99, np.full(k, RHO_HALF), 20)
            assert round(c, 2) == expected, (k, c)

    def test_critical_value_inverts_sf(self):
        lam = dunnett.control_lambdas([6, 4, 9, 7])
        c = dunnett.critical_value_one_factor(0.95, lam, 22)
        assert dunnett.sf_one_factor(c, lam, 22) == pytest.approx(0.05,
                                                                  abs=1e-13)

    def test_single_comparison_is_t(self):
        lam = dunnett.control_lambdas([5, 8])
        assert dunnett.critical_value_one_factor(0.95, lam, 11) == \
            pytest.approx(stats.t.ppf(0.975, 11), rel=1e-14)
        assert dunnett.sf_one_factor(2.3, lam, 11) == \
            pytest.approx(2 * stats.t.sf(2.3, 11), rel=1e-14)


class TestDistribution:
    @pytest.mark.parametrize("ns,df,c", [
        ([6, 4, 9, 7], 22, 1.2), ([6, 4, 9, 7], 22, 2.6),
        ([3, 3, 3], 6, 3.0), ([2, 40, 40], 79, 2.2),
        ([8, 8, 8, 8], 28, 7.0)])
    def test_against_independent_quadrature(self, ns, df, c):
        lam = dunnett.control_lambdas(ns)
        ours = dunnett.sf_one_factor(c, lam, df)
        assert ours == pytest.approx(_quad_sf(c, lam, df), rel=1e-8)

    def test_against_scipy_multivariate_t_many_points(self):
        ns = [6, 4, 9, 7]
        df = sum(ns) - len(ns)
        lam = dunnett.control_lambdas(ns)
        R = np.outer(lam, lam)
        np.fill_diagonal(R, 1.0)
        mvt = stats.multivariate_t(shape=R, df=df)
        for c in (0.5, 1.7, 2.6):
            ref = 1 - mvt.cdf(np.full(3, c), lower_limit=np.full(3, -c),
                              maxpts=10 ** 6, random_state=1)
            assert dunnett.sf_one_factor(c, lam, df) == pytest.approx(
                ref, abs=2e-6)

    def test_small_tail_keeps_relative_accuracy(self):
        # the tail is integrated directly, so tiny P values are resolved
        # (the [8, 8, 8, 8], c = 7 case above, P ~ 1e-7, is matched to
        # rel 1e-8); far out they sit just under the Bonferroni sum
        lam = dunnett.control_lambdas([8, 8, 8, 8])
        prev = 1.0
        for c in (8.0, 12.0, 20.0, 40.0):
            p = dunnett.sf_one_factor(c, lam, 28)
            bonf = 3 * 2 * stats.t.sf(c, 28)
            assert 0.95 * bonf < p <= bonf
            assert p < prev
            prev = p

    def test_non_one_factor_falls_back_to_seeded_qmc(self):
        rng = np.random.default_rng(9)
        A = rng.normal(size=(4, 4))
        cov = A @ A.T + np.eye(4)
        d = np.sqrt(np.diag(cov))
        R = cov / np.outer(d, d)
        assert dunnett.product_lambdas(R) is None
        p1, p2 = dunnett.sf(2.2, R, 15), dunnett.sf(2.2, R, 15)
        assert p1 == p2 and 0 < p1 < 1

    def test_product_lambdas_roundtrip(self):
        lam = dunnett.control_lambdas([3, 7, 5, 12, 4])
        R = np.outer(lam, lam)
        np.fill_diagonal(R, 1.0)
        np.testing.assert_allclose(np.abs(dunnett.product_lambdas(R)), lam,
                                   rtol=1e-12)
        assert dunnett.sf(2.4, R, 26) == dunnett.sf_one_factor(2.4, lam, 26)


class TestOneWayAnovaDunnett:
    def test_deterministic_bit_identical(self):
        g = _groups()
        runs = [anova.multiple_comparisons(g, "dunnett", control_index=1)
                for _ in range(3)]
        assert runs[0] == runs[1] == runs[2]

    def test_against_scipy_dunnett(self):
        g = _groups()
        ours = anova.multiple_comparisons(g, "dunnett")["comparisons"]
        with warnings.catch_warnings():
            # scipy's CI root finding warns it did not converge
            warnings.simplefilter("ignore")
            ref = stats.dunnett(*g[1:], control=g[0], rng=0)
            ci = ref.confidence_interval(0.95)
        for j, c in enumerate(ours):
            assert c["difference"] == pytest.approx(g[j + 1].mean()
                                                    - g[0].mean(), rel=1e-12)
            assert c["statistic"] == pytest.approx(abs(ref.statistic[j]),
                                                   rel=1e-12)
            assert c["p_adjusted"] == pytest.approx(ref.pvalue[j], abs=1e-4)
            assert c["ci"][0] == pytest.approx(ci.low[j], abs=1e-2)
            assert c["ci"][1] == pytest.approx(ci.high[j], abs=1e-2)

    def test_ci_uses_simultaneous_critical_value(self):
        g = _groups(sizes=(6, 6, 6, 6))
        res = anova.multiple_comparisons(g, "dunnett")
        df = res["df"]
        crit = dunnett.critical_value_one_factor(
            0.95, np.full(3, RHO_HALF), df)
        ms = sum(((x - x.mean()) ** 2).sum() for x in g) / df
        se = math.sqrt(ms * (2 / 6))
        for c in res["comparisons"]:
            assert (c["ci"][1] - c["ci"][0]) / 2 == pytest.approx(
                crit * se, rel=1e-12)
        # balanced, df 20, k = 3: Dunnett's table 2.54
        assert df == 20 and round(crit, 2) == 2.54
