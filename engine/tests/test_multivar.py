"""Multiple-variables analyses: correlation matrix, multiple linear
regression, logistic regression, PCA, descriptive statistics and the
select/transform helpers.

Cross-validation: statsmodels (OLS, Logit, GLM with offset, VIF, Type III
ANOVA), pandas (pairwise correlation), scipy (permutation test), sklearn
(ROC AUC, breast-cancer data), numpy SVD. Published reference values:
NIST StRD Longley certified regression results; Spector & Mazzeo (1980)
logit estimates as tabulated by Greene, Econometric Analysis; the
eigenvector coefficients printed in the GraphPad statistics guide page
"Eigenvectors" (Wisconsin breast-cancer data, 10 "mean" features).
"""

import math

import numpy as np
import pandas as pd
import pytest
import statsmodels.api as sm
import statsmodels.formula.api as smf
from scipy import stats
from statsmodels.stats.outliers_influence import variance_inflation_factor

from opendose import columnstats, multivar
from opendose.api import analyze


def _vars(**cols):
    return [{"name": k, "values": list(v)} for k, v in cols.items()]


@pytest.fixture(scope="module")
def mixed():
    rng = np.random.default_rng(7)
    n = 80
    x1 = rng.normal(size=n)
    x2 = rng.normal(size=n) + 0.6 * x1
    g = rng.choice(["ctrl", "low", "high"], n)
    g[0] = "ctrl"
    y = (1 + 2 * x1 - x2 + 1.5 * (g == "low") + 0.8 * x1 * (g == "high")
         + rng.normal(size=n))
    eta = -0.3 + 1.1 * x1 - 0.8 * x2 + 0.7 * (g == "high")
    yb = (rng.random(n) < 1 / (1 + np.exp(-eta))).astype(float)
    x2_missing = x2.astype(object)
    x2_missing[5] = None
    x2_missing[17] = None
    variables = _vars(y=y.tolist(), yb=yb.tolist(), x1=x1.tolist(),
                      x2=list(x2_missing), g=g.tolist())
    df = pd.DataFrame({"y": y, "yb": yb, "x1": x1,
                       "x2": [np.nan if v is None else v for v in x2_missing],
                       "g": g}).dropna()
    return variables, df


# ------------------------------------------------------------- table parsing

class TestTable:
    def test_kind_inference_and_blanks(self):
        t = multivar.parse_table([
            {"name": "a", "values": [1, "2.5", None, "", float("nan")]},
            {"name": "b", "values": ["x", "y", None, "x", 3]},
            {"name": "c", "values": [1, 0], "kind": "categorical"},
        ])
        assert t[0]["kind"] == "continuous"
        assert t[0]["values"] == [1.0, 2.5, None, None, None]
        assert t[1]["kind"] == "categorical"
        assert t[1]["values"] == ["x", "y", None, "x", "3"]
        assert t[2]["values"] == ["1", "0", None, None, None]  # padded

    def test_descriptive(self):
        vals = [3.1, 4.5, None, 2.2, 8.0, 5.5]
        res = multivar.describe_variables(_vars(a=vals,
                                                b=["m", "f", "f", None, "m", "f"]))
        a, b = res["variables"]
        ref = columnstats.describe([v for v in vals if v is not None])
        assert a["n_missing"] == 1
        assert a["mean"] == pytest.approx(ref["mean"])
        assert a["sd"] == pytest.approx(ref["sd"])
        assert b["n"] == 5
        assert b["levels"] == [
            {"level": "m", "count": 2, "fraction": 0.4},
            {"level": "f", "count": 3, "fraction": 0.6}]


# ---------------------------------------------------------- correlation matrix

class TestCorrelationMatrix:
    def _data(self):
        rng = np.random.default_rng(3)
        a = rng.normal(size=30)
        b = a + rng.normal(size=30)
        c = rng.normal(size=30) - 0.5 * a
        a = a.astype(object)
        c = c.astype(object)
        a[2] = None
        c[[4, 9]] = None
        return a, b, c

    def test_pearson_pairwise_matches_pandas_and_scipy(self):
        a, b, c = self._data()
        res = multivar.correlation_matrix(_vars(a=a, b=b, c=c))
        df = pd.DataFrame({"a": a, "b": b, "c": c}).astype(float)
        ref = df.corr()  # pandas uses pairwise-complete observations
        for i, ni in enumerate("abc"):
            for j, nj in enumerate("abc"):
                assert res["r"][i][j] == pytest.approx(ref.loc[ni, nj])
        assert res["n"] == [[29, 29, 27], [29, 30, 28], [27, 28, 28]]
        pair = df[["a", "c"]].dropna()
        r, p = stats.pearsonr(pair.a, pair.c)
        assert res["p"][0][2] == pytest.approx(p)
        z, half = math.atanh(r), 1.959963985 / math.sqrt(len(pair) - 3)
        assert res["ci_lo"][0][2] == pytest.approx(math.tanh(z - half))
        assert res["ci_hi"][2][0] == pytest.approx(math.tanh(z + half))
        assert res["r_squared"][0][2] == pytest.approx(r * r)
        assert res["p"][1][1] is None and res["r"][1][1] == 1.0

    def test_listwise_uses_same_rows_everywhere(self):
        a, b, c = self._data()
        res = multivar.correlation_matrix(_vars(a=a, b=b, c=c),
                                          missing="listwise")
        df = pd.DataFrame({"a": a, "b": b, "c": c}).astype(float).dropna()
        assert all(v == 27 for row in res["n"] for v in row)
        assert res["r"][0][1] == pytest.approx(df.a.corr(df.b))

    def test_one_tailed_halves_p(self):
        a, b, c = self._data()
        two = multivar.correlation_matrix(_vars(a=a, b=b))
        one = multivar.correlation_matrix(_vars(a=a, b=b), tails=1)
        assert one["p"][0][1] == pytest.approx(two["p"][0][1] / 2)

    def test_spearman_large_n_is_approximate(self):
        a, b, c = self._data()
        res = multivar.correlation_matrix(_vars(b=b, c=c), method="spearman")
        pair = pd.DataFrame({"b": b, "c": c}).astype(float).dropna()
        rs, p = stats.spearmanr(pair.b, pair.c)
        assert res["r"][0][1] == pytest.approx(rs)
        assert res["p"][0][1] == pytest.approx(p)
        assert res["p_type"][0][1] == "approximate"

    def test_spearman_small_n_exact_permutation_with_ties(self):
        x = [1.0, 2, 3, 4, 5, 6, 7, 8]
        y = [2.0, 1, 4, 3, 3, 7, 8, 6]  # a tie in y
        res = multivar.correlation_matrix(_vars(x=x, y=y), method="spearman")
        rx = stats.rankdata(x)

        def rs(yy, axis=-1):  # Pearson r of the ranks, vectorised
            ry = stats.rankdata(yy, axis=axis)
            ry = ry - ry.mean(axis=axis, keepdims=True)
            cx = rx - rx.mean()
            return (ry @ cx) / np.sqrt((ry ** 2).sum(axis=axis) * (cx @ cx))

        ref = stats.permutation_test(
            (y,), rs, permutation_type="pairings", n_resamples=np.inf,
            vectorized=True, alternative="two-sided")
        assert res["p_type"][0][1] == "exact"
        assert res["r"][0][1] == pytest.approx(stats.spearmanr(x, y).statistic)
        assert res["p"][0][1] == pytest.approx(ref.pvalue)

    def test_needs_two_continuous(self):
        with pytest.raises(ValueError):
            multivar.correlation_matrix(_vars(a=[1, 2, 3], b=["x", "y", "z"]))


# ----------------------------------------------------- multiple regression

LONGLEY_CERTIFIED = {  # NIST StRD, Longley (1967), certified values
    "Intercept": (-3482258.63459582, 890420.383607373),
    "GNPDEFL": (15.0618722713733, 84.9149257747669),
    "GNP": (-0.358191792925910e-01, 0.334910077722432e-01),
    "UNEMP": (-2.02022980381683, 0.488399681651699),
    "ARMED": (-1.03322686717359, 0.214274163161675),
    "POP": (-0.511041056535807e-01, 0.226073200069370),
    "YEAR": (1829.15146461355, 455.478499142212),
}


class TestMultipleRegression:
    def test_longley_nist_certified(self):
        d = sm.datasets.longley.load_pandas().data
        res = multivar.multiple_regression(
            [{"name": c, "values": d[c].tolist()} for c in d.columns],
            "TOTEMP", ["GNPDEFL", "GNP", "UNEMP", "ARMED", "POP", "YEAR"])
        for coef in res["coefficients"]:
            est, se = LONGLEY_CERTIFIED[coef["name"]]
            assert coef["estimate"] == pytest.approx(est, rel=1e-7)
            assert coef["se"] == pytest.approx(se, rel=1e-7)
        g = res["goodness"]
        assert g["sy_x"] == pytest.approx(304.854073561965, rel=1e-9)
        assert g["r_squared"] == pytest.approx(0.995479004577296, rel=1e-10)
        assert res["overall_test"]["F"] == pytest.approx(330.285339234588,
                                                         rel=1e-8)
        assert g["df"] == 9

    def test_matches_statsmodels_with_categorical_and_interaction(self, mixed):
        variables, df = mixed
        res = multivar.multiple_regression(
            variables, "y", ["x1", "x2", "g"], interactions=[["x1", "g"]])
        assert res["reference_levels"] == {"g": "ctrl"}
        m = smf.ols("y ~ x1 + x2 + C(g, Treatment('ctrl'))"
                    " + x1:C(g, Treatment('ctrl'))", df).fit()
        names = {
            "Intercept": "Intercept", "x1": "x1", "x2": "x2",
            "g[low]": "C(g, Treatment('ctrl'))[T.low]",
            "g[high]": "C(g, Treatment('ctrl'))[T.high]",
            "x1:g[low]": "x1:C(g, Treatment('ctrl'))[T.low]",
            "x1:g[high]": "x1:C(g, Treatment('ctrl'))[T.high]",
        }
        ci = m.conf_int()
        for c in res["coefficients"]:
            ref = names[c["name"]]
            assert c["estimate"] == pytest.approx(m.params[ref])
            assert c["se"] == pytest.approx(m.bse[ref])
            assert c["t"] == pytest.approx(abs(m.tvalues[ref]))
            assert c["p"] == pytest.approx(m.pvalues[ref])
            assert c["ci"][0] == pytest.approx(ci.loc[ref, 0])
            assert c["ci"][1] == pytest.approx(ci.loc[ref, 1])
        g = res["goodness"]
        assert res["n_rows_analyzed"] == 78 and res["n_rows_skipped"] == 2
        assert g["r_squared"] == pytest.approx(m.rsquared)
        assert g["adjusted_r_squared"] == pytest.approx(m.rsquared_adj)
        assert g["multiple_r"] == pytest.approx(math.sqrt(m.rsquared))
        assert g["sum_of_squares"] == pytest.approx(m.ssr)
        assert g["sy_x"] == pytest.approx(math.sqrt(m.mse_resid))
        assert g["rmse"] == pytest.approx(math.sqrt(m.ssr / (m.nobs - 1)))
        n, k = 78, 7
        kk = k + 1
        assert g["aicc"] == pytest.approx(
            n * math.log(m.ssr / n) + 2 * kk + 2 * kk * (kk + 1) / (n - kk - 1))
        assert res["overall_test"]["F"] == pytest.approx(m.fvalue)
        assert res["overall_test"]["p"] == pytest.approx(m.f_pvalue)
        anova = {row["source"]: row for row in res["anova"]}
        assert anova["Regression"]["ss"] == pytest.approx(m.ess)
        assert anova["Total"]["df"] == 77

        # term tests = statsmodels Type III (treatment coding, drop columns)
        a3 = sm.stats.anova_lm(m, typ=3)
        lookup = {"x1": "x1", "x2": "x2", "g": "C(g, Treatment('ctrl'))",
                  "x1:g": "x1:C(g, Treatment('ctrl'))"}
        for t in res["term_tests"]:
            row = a3.loc[lookup[t["term"]]]
            assert t["ss"] == pytest.approx(row["sum_sq"])
            assert t["df"] == row["df"]
            assert t["F"] == pytest.approx(row["F"])
            assert t["p"] == pytest.approx(row["PR(>F)"])

        # predicted / residuals aligned to table rows, blank where skipped
        assert res["predicted"][5] is None and res["residuals"][17] is None
        assert res["residuals"][0] == pytest.approx(m.resid[0])
        assert res["predicted"][0] == pytest.approx(m.fittedvalues[0])

    def test_vif_matches_statsmodels(self, mixed):
        variables, df = mixed
        res = multivar.multiple_regression(variables, "y", ["x1", "x2", "g"])
        exog = sm.add_constant(pd.get_dummies(df[["x1", "x2", "g"]])
                               .drop(columns="g_ctrl").astype(float))
        cols = list(exog.columns)
        names = {"x1": "x1", "x2": "x2", "g[low]": "g_low", "g[high]": "g_high"}
        for c in res["coefficients"][1:]:
            j = cols.index(names[c["name"]])
            assert c["vif"] == pytest.approx(
                variance_inflation_factor(exog.values, j))
            assert c["r2_with_others"] == pytest.approx(1 - 1 / c["vif"])

    def test_reference_level_option_and_residual_normality(self, mixed):
        variables, df = mixed
        res = multivar.multiple_regression(variables, "y", ["x1", "g"],
                                           reference_levels={"g": "high"})
        assert [c["name"] for c in res["coefficients"]] == [
            "Intercept", "x1", "g[ctrl]", "g[low]"]
        full = pd.DataFrame({v["name"]: v["values"] for v in variables})
        m = smf.ols("y ~ x1 + C(g, Treatment('high'))", full).fit()
        assert res["n_rows_analyzed"] == 80  # x2 blanks do not matter here
        assert res["coefficients"][3]["estimate"] == pytest.approx(
            m.params["C(g, Treatment('high'))[T.low]"])
        resid = [v for v in res["residuals"] if v is not None]
        assert res["normality_of_residuals"]["shapiro_wilk"]["W"] == \
            pytest.approx(stats.shapiro(resid).statistic)

    def test_errors(self, mixed):
        variables, _ = mixed
        dup = variables + [{"name": "x1copy",
                            "values": [2 * v for v in variables[2]["values"]]}]
        with pytest.raises(ValueError, match="linearly dependent"):
            multivar.multiple_regression(dup, "y", ["x1", "x1copy"])
        with pytest.raises(ValueError, match="continuous"):
            multivar.multiple_regression(variables, "g", ["x1"])
        with pytest.raises(ValueError, match="interaction"):
            multivar.multiple_regression(variables, "y", ["x1"],
                                         interactions=[["x1", "x2"]])


# ------------------------------------------------------- logistic regression

class TestLogisticRegression:
    def test_spector_mazzeo_published_estimates(self):
        d = sm.datasets.spector.load_pandas().data
        res = multivar.logistic_regression(
            [{"name": c, "values": d[c].tolist()} for c in d.columns],
            "GRADE", ["GPA", "TUCE", "PSI"], ci_method="wald")
        est = {c["name"]: (c["estimate"], c["se"]) for c in res["coefficients"]}
        # Greene, Econometric Analysis (Spector & Mazzeo 1980 data), logit
        assert est["Intercept"][0] == pytest.approx(-13.021, abs=5e-4)
        assert est["GPA"][0] == pytest.approx(2.826, abs=5e-4)
        assert est["TUCE"][0] == pytest.approx(0.095, abs=5e-4)
        assert est["PSI"][0] == pytest.approx(2.379, abs=5e-4)
        assert est["Intercept"][1] == pytest.approx(4.931, abs=5e-4)
        assert est["GPA"][1] == pytest.approx(1.263, abs=5e-4)
        assert est["PSI"][1] == pytest.approx(1.065, abs=5e-4)
        assert res["log_likelihood"] == pytest.approx(-12.890, abs=5e-4)

    def test_matches_statsmodels_logit(self, mixed):
        variables, df = mixed
        res = multivar.logistic_regression(variables, "yb", ["x1", "x2", "g"],
                                           ci_method="wald")
        exog = sm.add_constant(pd.get_dummies(df[["x1", "x2", "g"]])
                               .drop(columns="g_ctrl").astype(float))
        m = sm.Logit(df.yb.values, exog).fit(disp=0, tol=1e-12)
        names = {"Intercept": "const", "x1": "x1", "x2": "x2",
                 "g[low]": "g_low", "g[high]": "g_high"}
        ci = m.conf_int()
        for c in res["coefficients"]:
            ref = names[c["name"]]
            assert c["estimate"] == pytest.approx(m.params[ref], rel=1e-7)
            assert c["se"] == pytest.approx(m.bse[ref], rel=1e-6)
            assert c["z"] == pytest.approx(abs(m.tvalues[ref]), rel=1e-6)
            assert c["p"] == pytest.approx(m.pvalues[ref], rel=1e-6)
            assert c["ci"][0] == pytest.approx(ci.loc[ref, 0], rel=1e-6)
            assert c["odds_ratio"] == pytest.approx(math.exp(m.params[ref]))
            assert c["odds_ratio_ci"][1] == pytest.approx(
                math.exp(ci.loc[ref, 1]), rel=1e-6)
        n = m.nobs
        assert res["log_likelihood"] == pytest.approx(m.llf)
        assert res["null_log_likelihood"] == pytest.approx(m.llnull)
        assert res["likelihood_ratio_test"]["G"] == pytest.approx(m.llr)
        assert res["likelihood_ratio_test"]["df"] == 4
        assert res["likelihood_ratio_test"]["p"] == pytest.approx(m.llr_pvalue)
        assert res["model_comparison"]["selected"]["aic"] == pytest.approx(m.aic)
        k = 5
        assert res["model_comparison"]["selected"]["aicc"] == pytest.approx(
            m.aic + 2 * k * (k + 1) / (n - k - 1))
        pr = res["pseudo_r_squared"]
        assert pr["mcfadden"] == pytest.approx(m.prsquared)
        cs = 1 - math.exp(2 * (m.llnull - m.llf) / n)
        assert pr["cox_snell"] == pytest.approx(cs)
        assert pr["nagelkerke"] == pytest.approx(
            cs / (1 - math.exp(2 * m.llnull / n)))
        p = m.predict()
        y = df.yb.values
        assert pr["tjur"] == pytest.approx(p[y == 1].mean() - p[y == 0].mean())

        pp = [v for v in res["predicted_probability"] if v is not None]
        assert pp == pytest.approx(p.tolist(), rel=1e-6)
        assert res["predicted_probability"][5] is None

        from sklearn.metrics import roc_auc_score
        assert res["roc"]["auc"]["value"] == pytest.approx(roc_auc_score(y, p))

        cl = res["classification"]
        pred = p > 0.5
        assert cl["observed_1_predicted_1"] == int(np.sum(pred & (y == 1)))
        assert cl["observed_0_predicted_0"] == int(np.sum(~pred & (y == 0)))
        assert cl["percent_correct"] == pytest.approx(
            100 * np.mean(pred == (y == 1)))
        assert cl["positive_predictive_power"] == pytest.approx(
            100 * np.sum(pred & (y == 1)) / np.sum(pred))

    def test_profile_likelihood_ci_hits_chi_square_cutoff(self, mixed):
        """At each profile limit, the likelihood-ratio statistic of the
        model with that coefficient fixed (fitted independently by
        statsmodels GLM with an offset) equals chi2(0.95, 1) = 3.8415."""
        variables, df = mixed
        res = multivar.logistic_regression(variables, "yb", ["x1", "x2"])
        exog = sm.add_constant(df[["x1", "x2"]])
        full = sm.Logit(df.yb.values, exog).fit(disp=0)
        q = stats.chi2.ppf(0.95, 1)
        for j, name in enumerate(["const", "x1", "x2"]):
            lo, hi = res["coefficients"][j]["ci"]
            wald = full.conf_int().loc[name]
            assert lo == pytest.approx(wald[0], abs=0.25)  # close to Wald
            for b in (lo, hi):
                sub = sm.GLM(df.yb.values, exog.drop(columns=name),
                             family=sm.families.Binomial(),
                             offset=b * exog[name].values).fit(tol=1e-12)
                assert 2 * (full.llf - sub.llf) == pytest.approx(q, abs=1e-6)
            assert res["coefficients"][j]["odds_ratio_ci"][0] == \
                pytest.approx(math.exp(lo))

    def test_hosmer_lemeshow_by_hand(self, mixed):
        variables, df = mixed
        res = multivar.logistic_regression(variables, "yb", ["x1", "x2"])
        m = sm.Logit(df.yb.values, sm.add_constant(df[["x1", "x2"]])).fit(disp=0)
        p = m.predict()
        y = df.yb.values
        order = np.argsort(p, kind="stable")
        sizes = [8] * 8 + [7] * 2  # 78 rows in 10 near-equal groups
        chi2, start = 0.0, 0
        for size in sizes:
            idx = order[start:start + size]
            start += size
            o, e = y[idx].sum(), p[idx].sum()
            chi2 += (o - e) ** 2 / e + ((size - o) - (size - e)) ** 2 / (size - e)
        hl = res["hosmer_lemeshow"]
        assert hl["df"] == 8
        assert hl["statistic"] == pytest.approx(chi2, rel=1e-6)
        assert hl["p"] == pytest.approx(stats.chi2.sf(chi2, 8), rel=1e-5)
        assert [g["n"] for g in hl["groups"]] == sizes

    def test_text_outcome_and_simple_logistic_x50(self):
        hours = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 1.75, 2, 2.25, 2.5, 2.75, 3,
                 3.25, 3.5, 4, 4.25, 4.5, 4.75, 5, 5.5]
        passed = [0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1]
        text = ["fail" if v == 0 else "pass" for v in passed]
        res = multivar.logistic_regression(
            _vars(hours=hours, result=text), "result", ["hours"])
        assert res["outcome_coding"] == {"fail": 0.0, "pass": 1.0}
        # the classic Wikipedia "hours studied" example
        assert res["coefficients"][0]["estimate"] == pytest.approx(-4.0777, abs=1e-4)
        assert res["coefficients"][1]["estimate"] == pytest.approx(1.5046, abs=1e-4)
        assert res["coefficients"][1]["se"] == pytest.approx(0.6287, abs=1e-4)
        assert res["coefficients"][1]["p"] == pytest.approx(0.0167, abs=1e-4)
        assert res["x_at_50_percent"] == pytest.approx(4.0777 / 1.5046, rel=1e-4)
        flipped = multivar.logistic_regression(
            _vars(hours=hours, result=text), "result", ["hours"],
            outcome_positive="fail")
        assert flipped["coefficients"][1]["estimate"] == pytest.approx(-1.5046,
                                                                       abs=1e-4)

    def test_separation_detected(self):
        x = [1.0, 2, 3, 4, 5, 6, 7, 8]
        with pytest.raises(ValueError, match="^Perfect separation"):
            multivar.logistic_regression(
                _vars(x=x, y=[0, 0, 0, 0, 1, 1, 1, 1]), "y", ["x"])
        with pytest.raises(ValueError, match="^Quasi-perfect separation"):
            multivar.logistic_regression(
                _vars(x=[1.0, 2, 3, 4, 4, 5, 6, 7], y=[0, 0, 0, 0, 1, 1, 1, 1]),
                "y", ["x"])
        ok = multivar.logistic_regression(
            _vars(x=x, y=[0, 0, 1, 0, 1, 0, 1, 1]), "y", ["x"])
        assert ok["coefficients"][1]["estimate"] > 0

    def test_bad_outcome(self):
        with pytest.raises(ValueError, match="0 and 1"):
            multivar.logistic_regression(_vars(x=[1, 2, 3], y=[0, 1, 2]),
                                         "y", ["x"])
        with pytest.raises(ValueError, match="two levels"):
            multivar.logistic_regression(
                _vars(x=[1, 2, 3], y=["a", "b", "c"]), "y", ["x"])


# ------------------------------------------------------------------------ PCA

@pytest.fixture(scope="module")
def breast_cancer():
    from sklearn.datasets import load_breast_cancer
    d = load_breast_cancer()
    names = ["Radius", "Texture", "Perimeter", "Area", "Smoothness",
             "Compactness", "Concavity", "Concave points", "Symmetry",
             "Fractal dimension"]
    return names, d.data[:, :10]


class TestPCA:
    def test_guide_eigenvector_example(self, breast_cancer):
        names, data = breast_cancer
        res = multivar.pca([{"name": nm, "values": data[:, j].tolist()}
                            for j, nm in enumerate(names)])
        ev = np.array(res["eigenvectors"])
        # GraphPad statistics guide, "Eigenvectors": PC1 = -0.364 Radius
        # - 0.154 Texture - 0.376 Perimeter ...; PC2 = 0.314 Radius +
        # 0.147 Texture + 0.285 Perimeter ...
        assert np.round(ev[:3, 0], 3).tolist() == [-0.364, -0.154, -0.376]
        assert np.round(ev[:3, 1], 3).tolist() == [0.314, 0.147, 0.285]
        assert sum(res["eigenvalues"]) == pytest.approx(10)
        assert res["eigenvalues"][:3] == pytest.approx([5.4786, 2.5187, 0.8806],
                                                       abs=1e-4)
        # parallel analysis keeps PCs above the simulated 95th percentile
        assert res["selection"] == "parallel_analysis"
        assert res["n_selected"] == 2
        pa = res["parallel_analysis"]
        assert pa["upper"][1] < res["eigenvalues"][1]
        assert pa["upper"][2] > res["eigenvalues"][2]
        assert pa["lower"][0] < pa["mean"][0] < pa["upper"][0]

    def test_matches_svd_and_definitions(self):
        rng = np.random.default_rng(11)
        data = rng.normal(size=(40, 4)) @ rng.normal(size=(4, 4)) + [1, 5, -2, 10]
        cols = data.astype(object)
        cols[3, 2] = None  # row 3 dropped
        res = multivar.pca([{"name": f"v{j}", "values": list(cols[:, j])}
                            for j in range(4)], selection="all")
        kept = np.delete(data, 3, axis=0)
        z = (kept - kept.mean(0)) / kept.std(0, ddof=1)
        _, s, vt = np.linalg.svd(z, full_matrices=False)
        lam = s ** 2 / (len(z) - 1)
        assert res["eigenvalues"] == pytest.approx(lam.tolist())
        ev = np.array(res["eigenvectors"])
        assert np.abs(ev) == pytest.approx(np.abs(vt.T))
        assert res["proportion_of_variance"] == pytest.approx((lam / 4).tolist())
        assert res["cumulative_proportion"][-1] == pytest.approx(1.0)
        scores = np.array([r for r in res["scores"] if r is not None])
        assert res["scores"][3] is None
        assert scores == pytest.approx(z @ ev)
        # loadings = eigenvector * sqrt(eigenvalue) = corr(variable, PC)
        load = np.array(res["loadings"])
        for j in range(4):
            for k in range(4):
                assert load[j, k] == pytest.approx(
                    np.corrcoef(kept[:, j], scores[:, k])[0, 1], abs=1e-9)
        contrib = np.array(res["contribution_of_variables"])
        assert contrib.sum(axis=0) == pytest.approx(np.ones(4))
        cases = np.array([r for r in res["contribution_of_cases"] if r])
        assert cases.sum(axis=0) == pytest.approx(np.ones(4))

    def test_centered_pca(self):
        rng = np.random.default_rng(5)
        data = rng.normal(size=(30, 3)) * [1, 10, 0.1]
        res = multivar.pca([{"name": f"v{j}", "values": data[:, j].tolist()}
                            for j in range(3)], standardize=False,
                           selection="kaiser")
        c = data - data.mean(0)
        lam = np.sort(np.linalg.eigvalsh(np.cov(c, rowvar=False)))[::-1]
        assert res["eigenvalues"] == pytest.approx(lam.tolist())
        scores = np.array(res["scores"])
        corr = np.array(res["correlation_variables_pcs"])
        assert corr[1, 0] == pytest.approx(
            np.corrcoef(data[:, 1], scores[:, 0])[0, 1])
        assert res["n_selected"] == int(np.sum(lam > lam.mean()))

    def test_selection_rules_and_seed(self, breast_cancer):
        names, data = breast_cancer
        variables = [{"name": nm, "values": data[:, j].tolist()}
                     for j, nm in enumerate(names)]
        assert multivar.pca(variables, selection="kaiser")["n_selected"] == 2
        # 54.8%, 80.0%, 88.8% cumulative
        assert multivar.pca(variables, selection="variance",
                            variance_threshold=75)["n_selected"] == 2
        assert multivar.pca(variables, selection="variance",
                            variance_threshold=85)["n_selected"] == 3
        assert multivar.pca(variables, selection="number",
                            n_components=4)["n_selected"] == 4
        a = multivar.pca(variables, n_simulations=50, seed=3)
        b = multivar.pca(variables, n_simulations=50, seed=3)
        c = multivar.pca(variables, n_simulations=50, seed=4)
        assert a["parallel_analysis"]["upper"] == b["parallel_analysis"]["upper"]
        assert a["parallel_analysis"]["upper"] != c["parallel_analysis"]["upper"]


# ------------------------------------------------------ select & transform

class TestRearrange:
    VARS = _vars(dose=[1, 10, 100, None, 1000],
                 group=["a", "b", "a", "b", "c"],
                 resp=[2.0, 4.0, 6.0, 8.0, -1.0])

    def test_filter_select_transform(self):
        res = multivar.rearrange(
            self.VARS, select=["logdose", "group"],
            filters=[{"variable": "group", "op": "in", "value": ["a", "b"]},
                     {"variable": "dose", "op": "not_missing"}],
            transforms=[{"variable": "dose", "func": "log",
                         "new_name": "logdose"}])
        assert res["rows"] == [0, 1, 2]
        assert res["variables"][0]["values"] == pytest.approx([0.0, 1.0, 2.0])
        assert res["variables"][1]["values"] == ["a", "b", "a"]

    def test_transforms(self):
        vals = [2.0, 4.0, 6.0, 8.0, -1.0]
        out = {f: multivar.rearrange(self.VARS, select=["resp"], transforms=[
            {"variable": "resp", "func": f}])["variables"][0]["values"]
            for f in ("ln", "sqrt", "square", "reciprocal", "zscore", "rank",
                      "center")}
        assert out["ln"][:4] == pytest.approx(np.log(vals[:4]).tolist())
        assert out["ln"][4] is None and out["sqrt"][4] is None
        assert out["square"] == pytest.approx([v * v for v in vals])
        assert out["reciprocal"] == pytest.approx([1 / v for v in vals])
        assert out["zscore"] == pytest.approx(stats.zscore(vals, ddof=1).tolist())
        assert out["rank"] == [2.0, 3.0, 4.0, 5.0, 1.0]
        assert out["center"] == pytest.approx((np.array(vals) - 3.8).tolist())

    def test_numeric_filter_or(self):
        res = multivar.rearrange(self.VARS, combine="or", filters=[
            {"variable": "resp", "op": ">=", "value": 6},
            {"variable": "group", "op": "==", "value": "c"}])
        assert res["rows"] == [2, 3, 4]
        res = multivar.rearrange(self.VARS, filters=[
            {"variable": "resp", "op": "between", "value": [3, 7]}])
        assert res["rows"] == [1, 2]


# ------------------------------------------------------------------ via API

class TestAPI:
    def test_all_multivar_handlers(self, mixed):
        variables, _ = mixed
        data = {"variables": variables}
        r = analyze({"analysis": "multivar_descriptive", "data": data})
        assert r["variables"][0]["n"] == 80
        r = analyze({"analysis": "correlation_matrix", "data": data,
                     "options": {"method": "spearman"}})
        assert r["names"] == ["y", "yb", "x1", "x2"]
        r = analyze({"analysis": "multiple_regression", "data": data,
                     "options": {"outcome": "y", "predictors": ["x1", "g"],
                                 "interactions": [["x1", "g"]]}})
        assert "error" not in r and len(r["coefficients"]) == 6
        r = analyze({"analysis": "logistic_regression", "data": data,
                     "options": {"outcome": "yb", "predictors": ["x1"]}})
        assert "error" not in r and "x_at_50_percent" in r
        r = analyze({"analysis": "pca", "data": data,
                     "options": {"variables": ["y", "x1", "x2"],
                                 "selection": "kaiser"}})
        assert r["names"] == ["y", "x1", "x2"]
        r = analyze({"analysis": "mv_rearrange", "data": data,
                     "options": {"select": ["g"], "filters": [
                         {"variable": "g", "op": "==", "value": "low"}]}})
        assert set(r["variables"][0]["values"]) == {"low"}

    def test_correlation_matrix_from_column_table(self):
        r = analyze({"analysis": "correlation_matrix", "data": {"datasets": [
            {"name": "A", "ys": [[1.0], [2.0], [3.0], [4.0]]},
            {"name": "B", "ys": [[2.0], [4.1], [5.9], [8.2]]}]}})
        assert r["r"][0][1] == pytest.approx(
            stats.pearsonr([1, 2, 3, 4], [2, 4.1, 5.9, 8.2]).statistic)

    def test_logistic_xy_payload_and_errors_are_reported(self):
        r = analyze({"analysis": "logistic_regression",
                     "data": {"x": [1, 2, 3, 4], "y": [0, 0, 1, 1]}})
        assert "separation" in r["error"]
