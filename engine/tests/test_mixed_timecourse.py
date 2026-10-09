"""Time-course mixed models (opendose.mixed_timecourse).

References (each number's origin is given where it is used):
- SAS/STAT User's Guide, PROC MIXED, Example "Repeated Measures"
  (support.sas.com/documentation/cdl/en/statug/67523/HTML/default/
  statug_mixed_examples02.htm): Potthoff & Roy (1964) dental growth data
  (11 girls, 16 boys, ages 8-14), METHOD=ML, MODEL y = Gender Age
  Gender*Age, REPEATED / TYPE=UN and TYPE=CS. Printed covariance
  parameters, fit statistics, fixed effects and Type 3 tests are pasted
  below.
- nlme's own regression test tests/missing.Rout.save (CRAN nlme, R 3.4.3
  output, options(digits = 3)): gls(follicles ~ sin(2*pi*Time) +
  cos(2*pi*Time), Ovary, correlation = corAR1(form = ~ 1 | Mare),
  na.action = na.exclude) after Ovary[c(1, 272), 2] <- NA: Phi 0.75,
  coefficients 12.13 / -2.68 / -0.86, SEs 0.657 / 0.644 / 0.690,
  residual SE 4.58, logLik -775. The Ovary data (Pinheiro & Bates 2000)
  are pasted below from the Rdatasets CSV export of nlme::Ovary.
- statsmodels MixedLM (REML) with re_formula="~time" for random slopes
  (importorskip).
- opendose.mixedmodel.mixed_rm_two_way (mixed design) for compound
  symmetry, which must be the same model.
- Closed forms: with complete data, a saturated group x time mean and an
  unstructured covariance, the REML estimate of the covariance is the
  pooled within-group sample covariance (divisor subjects - groups;
  the multivariate linear model, Anderson 2003 section 8.2).
- A dense REML written out in the test (error contrasts K'y, K an
  orthonormal basis of the null space of X'; Harville 1974 Biometrika
  61:383) maximized with Nelder-Mead, for AR(1) with a random
  intercept and missing values.
"""

import json
import math
import warnings

import numpy as np
import pytest
from scipy import linalg, optimize

from opendose import api, mixedmodel
from opendose import mixed_timecourse as mt

# Potthoff & Roy (1964), as listed in the SAS example: person, gender,
# distance at ages 8, 10, 12, 14.
PR = """1 F 21.0 20.0 21.5 23.0
2 F 21.0 21.5 24.0 25.5
3 F 20.5 24.0 24.5 26.0
4 F 23.5 24.5 25.0 26.5
5 F 21.5 23.0 22.5 23.5
6 F 20.0 21.0 21.0 22.5
7 F 21.5 22.5 23.0 25.0
8 F 23.0 23.0 23.5 24.0
9 F 20.0 21.0 22.0 21.5
10 F 16.5 19.0 19.0 19.5
11 F 24.5 25.0 28.0 28.0
12 M 26.0 25.0 29.0 31.0
13 M 21.5 22.5 23.0 26.5
14 M 23.0 22.5 24.0 27.5
15 M 25.5 27.5 26.5 27.0
16 M 20.0 23.5 22.5 26.0
17 M 24.5 25.5 27.0 28.5
18 M 22.0 22.0 24.5 26.5
19 M 24.0 21.5 24.5 25.5
20 M 23.0 20.5 31.0 26.0
21 M 27.5 28.0 31.0 31.5
22 M 23.0 23.0 23.5 25.0
23 M 21.5 23.5 24.0 28.0
24 M 17.0 24.5 26.0 29.5
25 M 22.5 25.5 25.5 26.0
26 M 23.0 24.5 26.0 30.0
27 M 22.0 21.5 23.5 25.0"""
AGES = (8, 10, 12, 14)


def pr_records(drop=()):
    out = []
    for line in PR.splitlines():
        p = line.split()
        for age, v in zip(AGES, p[2:]):
            if (int(p[0]), age) in drop:
                continue
            out.append({"subject": p[0], "group": p[1], "time": age,
                        "value": float(v)})
    return out


def pr_sas_design():
    """SAS's parameterization of Gender Age Gender*Age (M reference)."""
    recs = pr_records()
    y = np.array([r["value"] for r in recs])
    f = np.array([1.0 if r["group"] == "F" else 0.0 for r in recs])
    age = np.array([float(r["time"]) for r in recs])
    X = np.column_stack([np.ones(y.size), f, age, age * f])
    subj = np.array([int(r["subject"]) - 1 for r in recs])
    pos = np.array([AGES.index(r["time"]) for r in recs])
    return y, X, subj, pos


class TestSasPotthoffRoyML:
    """Values printed in the SAS example (METHOD=ML)."""

    def test_unstructured(self):
        y, X, subj, pos = pr_sas_design()
        fit = mt.fit_structured(y, X, subj, pos, "unstructured", method="ml")
        # Covariance Parameter Estimates, UN(i,j)
        sas = [[5.1192, 2.4409, 3.6105, 2.5222],
               [2.4409, 3.9279, 2.7175, 3.0624],
               [3.6105, 2.7175, 5.9798, 3.8235],
               [2.5222, 3.0624, 3.8235, 4.6180]]
        np.testing.assert_allclose(fit["implied_covariance"], sas, atol=1e-4)
        # Fit Statistics: -2 Log Likelihood 419.5, AIC 447.5, BIC 465.6
        assert fit["minus2_log_likelihood"] == pytest.approx(419.5, abs=0.05)
        assert fit["aic"] == pytest.approx(447.5, abs=0.05)
        assert fit["bic"] == pytest.approx(465.6, abs=0.05)
        # Solution for Fixed Effects: estimates and standard errors
        np.testing.assert_allclose(fit["beta"],
                                   [15.8423, 1.5831, 0.8268, -0.3504],
                                   atol=1e-4)
        np.testing.assert_allclose(np.sqrt(np.diag(fit["cov_beta"])),
                                   [0.9356, 1.4658, 0.07911, 0.1239],
                                   rtol=5e-4)

    def test_unstructured_type3_via_handler(self):
        res = mt.mixed_timecourse(
            {"records": pr_records()},
            {"covariance": "unstructured", "time_as": "linear",
             "center_time": False, "method": "ml"})
        rows = {r["term"]: r for r in res["anova"]}
        # Type 3 Tests: Gender 1.17, Age 110.54, Age*Gender 7.99, all on
        # 1 and 25 df (TYPE=UN: between-subject df for every term)
        assert rows["Group"]["f"] == pytest.approx(1.17, abs=0.006)
        assert rows["Time"]["f"] == pytest.approx(110.54, abs=0.006)
        assert rows["Group × Time"]["f"] == pytest.approx(7.99, abs=0.006)
        assert {r["dfd"] for r in res["anova"]} == {25}
        assert rows["Group × Time"]["p"] == pytest.approx(0.0091, abs=6e-5)

    def test_compound_symmetry(self):
        y, X, subj, pos = pr_sas_design()
        fit = mt.fit_structured(y, X, subj, pos, "cs", method="ml")
        # CS 3.0306, Residual 1.8746
        assert fit["params"]["subject_variance"] == pytest.approx(3.0306,
                                                                  abs=1e-4)
        assert fit["params"]["residual_variance"] == pytest.approx(1.8746,
                                                                   abs=1e-4)
        assert fit["minus2_log_likelihood"] == pytest.approx(428.6, abs=0.05)
        assert fit["aic"] == pytest.approx(440.6, abs=0.05)
        assert fit["bic"] == pytest.approx(448.4, abs=0.05)
        np.testing.assert_allclose(fit["beta"],
                                   [16.3406, 1.0321, 0.7844, -0.3048],
                                   atol=1e-4)
        np.testing.assert_allclose(np.sqrt(np.diag(fit["cov_beta"])),
                                   [0.9631, 1.5089, 0.07654, 0.1199],
                                   rtol=5e-4)
        res = mt.mixed_timecourse(
            {"records": pr_records()},
            {"covariance": "cs", "time_as": "linear", "center_time": False,
             "method": "ml"})
        rows = {r["term"]: r for r in res["anova"]}
        # Gender 0.47 (1, 25), Age 111.10 (1, 79), Age*Gender 6.46 (1, 79)
        assert rows["Group"]["f"] == pytest.approx(0.47, abs=0.006)
        assert rows["Time"]["f"] == pytest.approx(111.10, abs=0.006)
        assert rows["Group × Time"]["f"] == pytest.approx(6.46, abs=0.006)
        assert (rows["Group"]["dfd"], rows["Time"]["dfd"],
                rows["Group × Time"]["dfd"]) == (25, 79, 79)
        assert rows["Group × Time"]["p"] == pytest.approx(0.0130, abs=6e-5)


class TestUnstructuredClosedForm:
    def test_pooled_covariance(self):
        res = mt.mixed_timecourse({"records": pr_records()},
                                  {"covariance": "unstructured"})
        Y = np.array([[float(v) for v in line.split()[2:]]
                      for line in PR.splitlines()])
        g = np.array([line.split()[1] for line in PR.splitlines()])
        R = np.vstack([Y[g == k] - Y[g == k].mean(axis=0) for k in "FM"])
        S = R.T @ R / (27 - 2)
        np.testing.assert_allclose(res["covariance"]["implied_covariance"],
                                   S, rtol=1e-5)
        # saturated mean: estimated means are the raw cell means
        for row in res["group_at_time"]:
            assert row["mean"] == pytest.approx(row["raw_mean"], rel=1e-9)
        assert res["fit"]["n_covariance_parameters"] == 10


class TestCsEqualsMixedRm:
    @pytest.mark.parametrize("drop", [(), ((3, 10), (14, 12), (20, 8),
                                           (25, 14), (26, 10))])
    def test_same_model(self, drop):
        recs = pr_records(drop)
        res = mt.mixed_timecourse({"records": recs}, {"covariance": "cs"})
        # cells[time][group] = subject values (None = missing)
        lines = PR.splitlines()
        cells = []
        for age in AGES:
            row = []
            for sex in "FM":
                row.append([None if (int(p.split()[0]), age) in drop
                            else float(p.split()[2 + AGES.index(age)])
                            for p in lines if p.split()[1] == sex])
            cells.append(row)
        ref = mixedmodel.mixed_rm_two_way(cells, design="mixed")
        rows = {r["term"]: r for r in res["anova"]}
        for mine, key in (("Time", "row_factor"), ("Group", "column_factor"),
                          ("Group × Time", "interaction")):
            theirs = ref["fixed_effects"][key]
            assert rows[mine]["f"] == pytest.approx(theirs["F"], rel=1e-6)
            assert rows[mine]["dfd"] == int(theirs["df_den"])
            assert rows[mine]["p"] == pytest.approx(theirs["p"], rel=1e-5)
        sv = res["covariance"]["parameters"]["subject_variance"]
        assert sv == pytest.approx(ref["random_effects"][0]["variance"],
                                   rel=1e-6)
        means = {(r["time"], r["group"]): r["mean"]
                 for r in res["group_at_time"]}
        for i, age in enumerate(AGES):
            for j, sex in enumerate("FM"):
                assert means[(str(age), sex)] == pytest.approx(
                    ref["cell_means"][i][j], rel=1e-7)


# nlme::Ovary (Pinheiro & Bates 2000), 308 rows: Mare -> (Time, follicles)
OVARY = {
    1: (
        "-0.1363636 -0.0909091 -0.04545455 0 0.04545455 0.0909091 0.1363636 "
        "0.1818182 0.2272727 0.2727273 0.3181818 0.3636364 0.4090909 "
        "0.4545455 0.5 0.5454545 0.5909091 0.6363636 0.6818182 0.7272727 "
        "0.7727273 0.8181818 0.8636364 0.9090909 0.9545455 1 1.045455 "
        "1.090909 1.136364",
        "20 15 19 16 13 10 12 14 13 20 22 15 18 17 14 18 14 16 17 18 18 17 "
        "14 12 12 14 10 11 16"),
    2: (
        "-0.15 -0.1 -0.05 0 0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 "
        "0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1 1.05 1.1 1.15",
        "6 6 8 7 16 10 13 9 7 6 8 8 6 8 7 9 6 4 5 8 11 13 10 6 7 6 5"),
    3: (
        "-0.1578947 -0.1052632 -0.05263158 0 0.05263158 0.1052632 0.1578947 "
        "0.2105263 0.2631579 0.3157895 0.3684211 0.4210526 0.4736842 "
        "0.5263158 0.5789474 0.631579 0.6842105 0.7368421 0.7894737 "
        "0.8421053 0.8947368 0.9473684 1 1.052632 1.105263 1.157895",
        "13 11 10 6 8 6 9 9 10 8 14 13 14 16 20 21 25 23 19 22 16 21 19 20 "
        "17 24"),
    4: (
        "-0.1363636 -0.0909091 -0.04545455 0 0.04545455 0.0909091 0.1363636 "
        "0.1818182 0.2272727 0.2727273 0.3181818 0.3636364 0.4090909 "
        "0.4545455 0.5 0.5454545 0.5909091 0.6363636 0.6818182 0.7272727 "
        "0.7727273 0.8181818 0.8636364 0.9090909 0.9545455 1 1.045455 "
        "1.090909 1.136364",
        "9 9 7 6 7 6 1 1 1 5 6 3 5 3 6 8 6 5 6 8 11 14 8 9 10 7 7 6 11"),
    5: (
        "-0.1363636 -0.0909091 -0.04545455 0 0.04545455 0.0909091 0.1363636 "
        "0.1818182 0.2272727 0.2727273 0.3181818 0.3636364 0.4090909 "
        "0.4545455 0.5 0.5454545 0.5909091 0.6363636 0.6818182 0.7272727 "
        "0.7727273 0.8181818 0.8636364 0.9090909 0.9545455 1 1.045455 "
        "1.090909 1.136364",
        "10 12 12 17 9 10 3 12 13 9 4 7 4 12 14 12 15 17 15 13 18 19 13 9 "
        "12 8 10 5 14"),
    6: (
        "-0.1363636 -0.0909091 -0.04545455 0 0.04545455 0.0909091 0.1363636 "
        "0.1818182 0.2272727 0.2727273 0.3181818 0.3636364 0.4090909 "
        "0.4545455 0.5 0.5454545 0.5909091 0.6363636 0.6818182 0.7272727 "
        "0.7727273 0.8181818 0.8636364 0.9090909 0.9545455 1 1.045455 "
        "1.090909 1.136364",
        "16 17 13 17 15 9 8 5 9 8 8 13 14 13 14 14 11 17 21 21 21 20 17 18 "
        "22 10 11 11 12"),
    7: (
        "-0.15 -0.1 -0.05 0 0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 "
        "0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1 1.05 1.1 1.15",
        "18 13 14 12 11 8 5 8 10 11 10 12 10 9 12 14 16 13 11 13 13 11 11 8 "
        "14 4 7"),
    8: (
        "-0.125 -0.08333333 -0.04166667 0 0.04166667 0.08333333 0.125 "
        "0.1666667 0.2083333 0.25 0.2916667 0.3333333 0.375 0.4166667 "
        "0.4583333 0.5 0.5416667 0.5833333 0.625 0.6666667 0.7083333 0.75 "
        "0.7916667 0.8333333 0.875 0.9166667 0.9583333 1 1.041667 1.083333 "
        "1.125",
        "13 9 15 15 12 8 10 6 9 8 10 6 8 13 12 12 15 21 25 21 21 24 20 20 "
        "18 20 20 19 12 7 8"),
    9: (
        "-0.1666667 -0.1111111 -0.05555556 0 0.05555556 0.1111111 0.1666667 "
        "0.2222222 0.2777778 0.3333333 0.3888889 0.4444444 0.5 0.5555556 "
        "0.6111111 0.6666667 0.7222222 0.7777778 0.8333333 0.8888889 "
        "0.9444444 1 1.055556 1.111111 1.166667",
        "10 14 12 10 7 12 10 8 10 15 15 12 19 15 16 15 17 14 16 15 11 10 7 "
        "4 8"),
    10: (
        "-0.1363636 -0.0909091 -0.04545455 0 0.04545455 0.0909091 0.1363636 "
        "0.1818182 0.2272727 0.2727273 0.3181818 0.3636364 0.4090909 "
        "0.4545455 0.5 0.5454545 0.5909091 0.6363636 0.6818182 0.7272727 "
        "0.7727273 0.8181818 0.8636364 0.9090909 0.9545455 1 1.045455 "
        "1.090909 1.136364",
        "11 16 15 12 11 6 11 12 11 16 15 11 7 14 20 22 23 21 21 23 22 22 17 "
        "17 17 17 14 12 11"),
    11: (
        "-0.15 -0.1 -0.05 0 0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 "
        "0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1 1.05 1.1 1.15",
        "9 8 8 8 8 6 7 8 10 10 14 13 8 8 8 9 16 12 10 12 12 9 6 9 7 5 5"),
}


class TestAr1:
    def test_nlme_gls_ovary(self):
        # Ovary[c(1, 272), 2] <- NA; na.exclude drops those two rows and
        # corAR1(form = ~ 1 | Mare) uses the order within each mare
        mares, t, y = [], [], []
        k = 0
        for mare, (times, foll) in OVARY.items():
            for tv, fv in zip(times.split(), foll.split()):
                k += 1
                if k in (1, 272):
                    continue
                mares.append(mare)
                t.append(float(tv))
                y.append(float(fv))
        mares, t, y = np.array(mares), np.array(t), np.array(y)
        pos = np.zeros(y.size, int)
        for m in np.unique(mares):
            pos[mares == m] = np.arange((mares == m).sum())
        X = np.column_stack([np.ones(y.size), np.sin(2 * np.pi * t),
                             np.cos(2 * np.pi * t)])
        fit = mt.fit_structured(y, X, mares - 1, pos, "ar1",
                                random_intercept=False)
        assert y.size == 306
        assert fit["params"]["rho"] == pytest.approx(0.75, abs=0.005)
        np.testing.assert_allclose(fit["beta"], [12.13, -2.68, -0.86],
                                   atol=0.005)
        np.testing.assert_allclose(np.sqrt(np.diag(fit["cov_beta"])),
                                   [0.657, 0.644, 0.690], atol=5e-4)
        assert math.sqrt(fit["sigma2"]) == pytest.approx(4.58, abs=0.005)
        assert fit["log_likelihood"] == pytest.approx(-775, abs=0.5)

    @staticmethod
    def _sim(seed=4, drop=8):
        rng = np.random.default_rng(seed)
        recs = []
        T = 6
        for s in range(14):
            grp = "KO" if s % 2 else "WT"
            u = rng.normal(0, 1.0)
            e = np.zeros(T)
            e[0] = rng.normal()
            for j in range(1, T):
                e[j] = 0.6 * e[j - 1] + math.sqrt(1 - 0.36) * rng.normal()
            for j in range(T):
                recs.append({"subject": f"m{s}", "group": grp, "time": j * 15,
                             "value": 5 + 0.3 * j * (grp == "KO") + u + e[j]})
        idx = rng.choice(len(recs), size=drop, replace=False)
        return [r for i, r in enumerate(recs) if i not in set(idx)]

    def test_random_intercept_against_dense_reml(self):
        recs = self._sim()
        res = mt.mixed_timecourse({"records": recs}, {"covariance": "ar1"})
        d = mt.summarise_records([(r["subject"], r["group"], r["time"],
                                   r["value"]) for r in recs])
        X, _, _ = mt._design(d, "factor", True, None)
        y, subj, pos = d["y"], d["subject"], d["time_index"]
        K = linalg.null_space(X.T)
        z = K.T @ y
        same = subj[:, None] == subj[None, :]
        lag = np.abs(pos[:, None] - pos[None, :])

        def nll(theta):
            s2, g, rho = math.exp(theta[0]), math.exp(theta[1]), \
                math.tanh(theta[2])
            V = np.where(same, s2 * rho ** lag + g, 0.0)
            M = K.T @ V @ K
            sign, logdet = np.linalg.slogdet(M)
            return 0.5 * (logdet + z @ np.linalg.solve(M, z))

        best = None
        for start in ([0.0, 0.0, 0.5], [0.5, -1.0, 0.2], [-0.5, 0.5, 0.8]):
            r = optimize.minimize(nll, start, method="Nelder-Mead",
                                  options={"xatol": 1e-10, "fatol": 1e-12,
                                           "maxiter": 20000,
                                           "maxfev": 20000})
            if best is None or r.fun < best.fun:
                best = r
        s2, g, rho = math.exp(best.x[0]), math.exp(best.x[1]), \
            math.tanh(best.x[2])
        par = res["covariance"]["parameters"]
        assert par["rho"] == pytest.approx(rho, rel=1e-4)
        assert par["residual_variance"] == pytest.approx(s2, rel=1e-4)
        assert par["subject_variance"] == pytest.approx(g, rel=1e-4)
        assert res["n_values"] == 76 and res["n_missing"] == 8
        assert res["fit"]["n_covariance_parameters"] == 3
        assert any("between-within" in w for w in res["warnings"])

    def test_unequal_spacing_warning(self):
        recs = self._sim(drop=0)
        for r in recs:
            r["time"] = {0: 0, 15: 15, 30: 30, 45: 60, 60: 90,
                         75: 120}[r["time"]]
        res = mt.mixed_timecourse({"records": recs}, {"covariance": "ar1"})
        assert any("unequally spaced" in w for w in res["warnings"])


class TestRandomSlope:
    def test_against_statsmodels(self):
        pd = pytest.importorskip("pandas")
        smf = pytest.importorskip("statsmodels.formula.api")
        recs = pr_records()
        res = mt.mixed_timecourse(
            {"records": recs},
            {"covariance": "random_slope", "time_as": "linear",
             "center_time": False})
        df = pd.DataFrame(recs)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            sm = smf.mixedlm("value ~ C(group, Sum) * time", df,
                             groups=df.subject, re_formula="~time").fit(
                reml=True, method=["nm", "bfgs"], maxiter=5000)
        par = res["covariance"]["parameters"]
        G = sm.cov_re.to_numpy()
        assert par["intercept_variance"] == pytest.approx(G[0, 0], rel=1e-3)
        assert par["slope_variance"] == pytest.approx(G[1, 1], rel=1e-3)
        assert par["intercept_slope_covariance"] == pytest.approx(G[0, 1],
                                                                  rel=1e-3)
        assert par["residual_variance"] == pytest.approx(sm.scale, rel=1e-4)
        np.testing.assert_allclose(res["fixed_effects"]["estimates"],
                                   sm.fe_params.to_numpy(), rtol=1e-6)
        assert res["fit"]["reml_loglik"] == pytest.approx(sm.llf, abs=1e-5)
        assert res["fit"]["reml_loglik"] >= sm.llf - 1e-7

    def test_centering_does_not_change_the_fit(self):
        a = mt.mixed_timecourse({"records": pr_records()},
                                {"covariance": "random_slope",
                                 "time_as": "linear"})
        b = mt.mixed_timecourse({"records": pr_records()},
                                {"covariance": "random_slope",
                                 "time_as": "linear", "center_time": False})
        assert a["fit"]["reml_loglik"] == pytest.approx(
            b["fit"]["reml_loglik"], abs=1e-6)
        ra = {r["term"]: r for r in a["anova"]}
        rb = {r["term"]: r for r in b["anova"]}
        assert ra["Group × Time"]["f"] == pytest.approx(
            rb["Group × Time"]["f"], rel=1e-5)
        assert a["time_centre"] == 11.0


class TestHandlerFeatures:
    def test_model_comparison(self):
        res = mt.mixed_timecourse({"records": pr_records()},
                                  {"covariance": "ar1",
                                   "compare_covariances": True})
        mc = res["model_comparison"]
        kinds = [r["kind"] for r in mc["rows"]]
        assert sorted(kinds) == ["ar1", "cs", "random_slope", "unstructured"]
        assert mc["rows"][0]["best"] and mc["rows"][0]["delta_aic"] == 0
        assert mc["best"] == mc["rows"][0]["kind"]
        aics = [r["aic"] for r in mc["rows"]]
        assert aics == sorted(aics)
        un = next(r for r in mc["rows"] if r["kind"] == "unstructured")
        assert un["n_parameters"] == 10
        assert un["aic"] == pytest.approx(un["minus2_log_likelihood"] + 20)

    def test_group_differences_sidak(self):
        res = mt.mixed_timecourse({"records": pr_records()}, {})
        diffs = res["group_difference_at_time"]
        assert diffs["n_comparisons"] == 4
        assert diffs["family"]["size"] == 4
        for c in diffs["comparisons"]:
            p = c["p_unadjusted"]
            assert c["p_adjusted"] == pytest.approx(1 - (1 - p) ** 4,
                                                    rel=1e-9)
            assert c["time"] in {"8", "10", "12", "14"}
        none = mt.mixed_timecourse({"records": pr_records()},
                                   {"comparisons": None})
        assert none["group_difference_at_time"] is None

    def test_grouped_layout_and_column_arrays(self):
        lines = PR.splitlines()
        datasets = []
        for sex in "FM":
            subs = [p.split() for p in lines if p.split()[1] == sex]
            datasets.append({
                "name": sex,
                "ys": [[float(s[2 + i]) for s in subs] for i in range(4)],
                "subject_names": [s[0] for s in subs]})
        grouped = mt.mixed_timecourse({"x": list(AGES), "datasets": datasets},
                                      {"covariance": "cs"})
        recs = pr_records()
        cols = mt.mixed_timecourse(
            {k: [r[k] for r in recs]
             for k in ("subject", "group", "time", "value")},
            {"covariance": "cs"})
        for a, b in zip(grouped["anova"], cols["anova"]):
            assert a["f"] == pytest.approx(b["f"], rel=1e-9)
        assert grouped["n_subjects"] == 27

    def test_unstructured_warning_many_times(self):
        rng = np.random.default_rng(1)
        recs = [{"subject": s, "group": "A" if s < 10 else "B", "time": t,
                 "value": float(rng.normal())}
                for s in range(20) for t in range(7)]
        res = mt.mixed_timecourse({"records": recs},
                                  {"covariance": "unstructured"})
        assert any("28 parameters" in w for w in res["warnings"])

    def test_baseline_covariate(self):
        res = mt.mixed_timecourse({"records": pr_records()},
                                  {"covariance": "cs",
                                   "baseline_covariate": True})
        terms = {r["term"]: r for r in res["anova"]}
        assert "Baseline" in terms
        assert terms["Baseline"]["dfd"] == 27 - 3    # between-subject df
        assert res["times"] == ["10", "12", "14"]
        assert "baseline_note" in res

    def test_duplicate_time_error(self):
        recs = pr_records() + [{"subject": "1", "group": "F", "time": 8,
                                "value": 20.0}]
        with pytest.raises(ValueError, match="more than one value"):
            mt.mixed_timecourse({"records": recs}, {})

    def test_reused_subject_labels(self):
        recs = pr_records()
        for r in recs:
            n = int(r["subject"])
            r["subject"] = str(n - 11 if n > 11 else n)   # 1.. per group
        res = mt.mixed_timecourse({"records": recs}, {})
        assert res["n_subjects"] == 27
        assert any("more than one group" in w for w in res["warnings"])

    def test_linear_needs_numeric_time(self):
        recs = [{"subject": s, "group": "A", "time": t, "value": 1.0 + i}
                for i, (s, t) in enumerate([(1, "pre"), (1, "post"),
                                            (2, "pre"), (2, "post")])]
        with pytest.raises(ValueError, match="numeric"):
            mt.mixed_timecourse({"records": recs}, {"time_as": "linear"})

    def test_include_auc_and_auc_handler(self):
        recs = pr_records()
        res = mt.mixed_timecourse({"records": recs}, {"include_auc": True})
        assert res["auc"]["analysis"] == "subject_auc"
        assert len(res["auc"]["subjects"]) == 27
        # the same column arrays feed the existing auc handler
        out = api.analyze({"analysis": "auc", "data": {
            k: [r[k] for r in recs]
            for k in ("subject", "group", "time", "value")}, "options": {}})
        assert out["analysis"] == "subject_auc"
        first = next(s for s in out["subjects"] if s["subject"] == "1")
        # trapezoid 8..14 of 21, 20, 21.5, 23
        assert first["auc"] == pytest.approx(
            2 * ((21 + 20) / 2 + (20 + 21.5) / 2 + (21.5 + 23) / 2))
        assert res["auc"]["comparison"] == out["comparison"]


class TestApi:
    def test_json_round_trip(self):
        out = json.loads(api.analyze_json(json.dumps({
            "analysis": "mixed_timecourse",
            "data": {"records": pr_records()},
            "options": {"covariance": "ar1", "compare_covariances": True}})))
        assert "error" not in out, out.get("traceback")
        assert out["analysis"] == "mixed_timecourse"
        for key in ("anova", "covariance", "fit", "group_at_time",
                    "group_difference_at_time", "model_comparison",
                    "warnings"):
            assert key in out
        assert out["covariance"]["kind"] == "ar1"
        assert set(out["covariance"]["parameters"]) == {
            "rho", "residual_variance", "subject_variance"}
        assert set(out["group_at_time"][0]) >= {"time", "group", "mean",
                                                "se", "ci"}

    def test_unknown_covariance(self):
        out = api.analyze({"analysis": "mixed_timecourse",
                           "data": {"records": pr_records()},
                           "options": {"covariance": "toeplitz"}})
        assert "unknown covariance" in out["error"]


class TestCore:
    @staticmethod
    def _data():
        rng = np.random.default_rng(0)
        recs = []
        for s in range(30):
            g = ["WT", "KO", "HET"][s % 3]
            u, e = rng.normal(0, 2), 0.0
            for j in range(6):
                e = 0.5 * e + rng.normal()
                if rng.random() < 0.12:
                    continue
                recs.append({"subject": s, "group": g, "time": j * 15,
                             "value": 100 + u + (g == "KO") * j + e})
        return recs

    @pytest.mark.parametrize("kind,ri", [("cs", True), ("ar1", True),
                                         ("ar1", False), ("unstructured", True),
                                         ("random_slope", True)])
    @pytest.mark.parametrize("method", ["reml", "ml"])
    def test_analytic_gradient(self, kind, ri, method):
        d = mt.summarise_records([(r["subject"], r["group"], r["time"],
                                   r["value"]) for r in self._data()])
        X, _, _ = mt._design(d, "factor", True, None)
        prof = mt._Structured(d["y"], X, d["subject"], d["time_index"], kind,
                              level_times=np.array(d["time_values"], float),
                              random_intercept=ri, method=method)
        x = {"cs": [0.7], "ar1": [0.6, 0.3] if ri else [0.3],
             "unstructured": [0.1 * (k % 3) - 0.05 for k in
                              range(len(prof.bounds))],
             "random_slope": [0.1, 0.01, -3.0]}[kind]
        x = np.array(x, float)
        fd = np.zeros_like(x)
        for k in range(x.size):
            e = np.zeros_like(x)
            e[k] = 1e-6
            fd[k] = (prof.f(x + e) - prof.f(x - e)) / 2e-6
        np.testing.assert_allclose(prof.grad(x), fd, rtol=1e-4, atol=1e-4)

    def test_unstructured_contains_the_others(self):
        res = mt.mixed_timecourse({"records": self._data()},
                                  {"compare_covariances": True})
        rows = {r["kind"]: r for r in res["model_comparison"]["rows"]}
        un = rows["unstructured"]["minus2_log_likelihood"]
        for k in ("cs", "ar1", "random_slope"):
            assert un <= rows[k]["minus2_log_likelihood"] + 1e-6
        assert all(r["converged"] for r in rows.values())
