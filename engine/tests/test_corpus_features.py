"""Analyses added for the external reference corpus, each pinned to the
printed output of R (or drc / scipy) recorded in
docs/validation/datasets/manifest.json.

Fisher's exact test (r x c, one-sided, conditional MLE), expected counts
and standardized residuals, the generalized CMH test, Woolf's test,
Kendall's tau, one-sided correlation bounds, Fligner-Killeen, Holm,
Kaplan-Meier SEs and median CIs, both log-rank statistics, the additive
two-way ANOVA (one value per cell, or on request) and the quantal fit
with an upper asymptote (drc LL.3 binomial)."""

import csv
import math
from pathlib import Path

import numpy as np
import pytest
from scipy import stats

from opendose import api, contingency, correlation, fdr, quantal, survival
from opendose import trend, twoway
from opendose.anova import fligner_killeen
from opendose.nlfit import compare_fits_aicc, compare_fits_f_test

DATA = Path(__file__).resolve().parents[2] / "docs" / "validation" / "datasets"


def _rows(name):
    with open(DATA / name, newline="") as fh:
        return list(csv.DictReader(fh))


def _num(v):
    return None if v in ("", "NA", None) else float(v)


# ------------------------------------------------------ Fisher's exact

JOB = [[1, 3, 10, 6], [2, 3, 10, 7], [1, 6, 14, 12], [0, 1, 9, 11]]
MP6 = [[1, 2, 2, 1, 1, 0, 1], [2, 0, 0, 2, 3, 0, 0], [0, 1, 1, 1, 2, 7, 3],
       [1, 1, 2, 0, 0, 0, 1], [0, 1, 1, 1, 1, 0, 0]]


class TestFisherRxC:
    def test_job_satisfaction_matches_r(self):
        # R: fisher.test(Job) p-value = 0.7827
        assert contingency.fisher_exact_rxc(JOB) == pytest.approx(
            0.7827, abs=5e-5)

    def test_mp6_matches_r(self):
        # R: fisher.test(MP6) p-value = 0.03929
        assert contingency.fisher_exact_rxc(MP6) == pytest.approx(
            0.03929, abs=5e-6)

    def test_transpose_and_permutation_invariant(self):
        p = contingency.fisher_exact_rxc(JOB)
        assert contingency.fisher_exact_rxc(np.array(JOB).T) == \
            pytest.approx(p, rel=1e-12)
        perm = np.array(JOB)[[2, 0, 3, 1]][:, [1, 3, 0, 2]]
        assert contingency.fisher_exact_rxc(perm) == pytest.approx(
            p, rel=1e-12)

    @pytest.mark.parametrize("table", [[[3, 1], [1, 3]], [[2, 10], [15, 3]],
                                       [[0, 5], [6, 1]], [[1, 0], [0, 1]]])
    def test_2x2_equals_scipy(self, table):
        assert contingency.fisher_exact_rxc(table) == pytest.approx(
            stats.fisher_exact(table)[1], rel=1e-12)

    def test_brute_force_3x3(self):
        """Every 3 x 3 table with the margins enumerated directly."""
        t = np.array([[3, 1, 0], [1, 2, 2], [0, 2, 4]])
        r, c = t.sum(1), t.sum(0)
        n = t.sum()
        lf = lambda v: math.lgamma(v + 1)  # noqa: E731

        def logp(x):
            return (sum(lf(v) for v in r) + sum(lf(v) for v in c) - lf(n)
                    - sum(lf(v) for v in np.ravel(x)))
        obs = logp(t)
        total = 0.0
        for a in range(r[0] + 1):
            for b in range(r[0] - a + 1):
                for d in range(r[1] + 1):
                    for e in range(r[1] - d + 1):
                        x = np.array([[a, b, r[0] - a - b],
                                      [d, e, r[1] - d - e],
                                      [c[0] - a - d, c[1] - b - e, 0]])
                        x[2, 2] = r[2] - x[2, 0] - x[2, 1]
                        if np.any(x < 0) or x[:, 2].sum() != c[2]:
                            continue
                        if logp(x) <= obs + math.log1p(1e-7):
                            total += math.exp(logp(x))
        assert contingency.fisher_exact_rxc(t) == pytest.approx(total,
                                                                rel=1e-12)

    def test_work_limit(self):
        with pytest.raises(ValueError, match="too large"):
            contingency.fisher_exact_rxc(JOB, max_work=1000)
        res = contingency.contingency([[762, 327, 468], [484, 239, 477]],
                                      fisher_rxc=False)
        assert "fisher_exact" not in res

    def test_in_the_contingency_analysis(self):
        res = api.analyze({"analysis": "contingency", "data": {"table": JOB},
                           "options": {"fisher_rxc": True}})
        assert res["fisher_exact"]["p"] == pytest.approx(0.7827, abs=5e-5)


class TestFisher2x2:
    def test_tea_tasting_one_sided(self):
        # R: fisher.test(TeaTasting, alternative = "greater") p = 0.2429
        fe = contingency.contingency([[3, 1], [1, 3]])["fisher_exact"]
        assert fe["p_greater"] == pytest.approx(0.2429, abs=5e-5)
        assert fe["p_less"] == pytest.approx(
            stats.fisher_exact([[3, 1], [1, 3]], alternative="less")[1])

    def test_convictions_one_sided(self):
        # R: alternative = "less" p-value = 0.0004652
        fe = contingency.contingency([[2, 10], [15, 3]])["fisher_exact"]
        assert fe["p_less"] == pytest.approx(0.0004652, abs=5e-8)

    def test_conditional_mle_and_ci_equal_scipy(self):
        from scipy.stats.contingency import odds_ratio
        for t in ([[3, 1], [1, 3]], [[2, 10], [15, 3]], [[7, 2], [3, 9]]):
            fe = contingency.contingency(t)["fisher_exact"]
            ref = odds_ratio(t, kind="conditional")
            assert fe["odds_ratio_conditional_mle"] == pytest.approx(
                ref.statistic, rel=1e-10)
            ci = ref.confidence_interval(0.95)
            assert fe["ci_conditional"] == pytest.approx(
                [ci.low, ci.high], rel=1e-9)
            g = ref.confidence_interval(0.95, alternative="greater")
            assert fe["ci_conditional_greater"][0] == pytest.approx(
                g.low, rel=1e-9)
        # R prints 6.408309 / 0.04693661 (uniroot tolerance ~1e-4 on the
        # [0, 1] scale): the full-precision roots agree to 2e-6 relative
        fe = contingency.contingency([[3, 1], [1, 3]])["fisher_exact"]
        assert fe["odds_ratio_conditional_mle"] == pytest.approx(6.408309,
                                                                 rel=2e-6)


def test_expected_counts_and_standardized_residuals():
    # R: M <- as.table(rbind(c(762, 327, 468), c(484, 239, 477)));
    # chisq.test(M)$expected / $stdres
    res = contingency.contingency([[762, 327, 468], [484, 239, 477]])
    exp = [[703.6714, 319.6453, 533.6834], [542.3286, 246.3547, 411.3166]]
    std = [[4.5020535, 0.6994517, -5.3159455],
           [-4.5020535, -0.6994517, 5.3159455]]
    assert np.allclose(res["expected"], exp, atol=5e-5)
    assert np.allclose(res["residuals_standardized"], std, atol=5e-8)
    e = np.array(res["expected"])
    o = np.array([[762, 327, 468], [484, 239, 477]])
    assert np.allclose(res["residuals_pearson"], (o - e) / np.sqrt(e))
    assert float(np.sum(np.array(res["residuals_pearson"]) ** 2)) == \
        pytest.approx(res["chi_square"]["chi2"], rel=1e-12)


# ---------------------------------------------------------------- CMH

def test_generalized_cmh_satisfaction():
    # R: mantelhaen.test(Satisfaction): M^2 = 10.2, df = 9, p = 0.3345
    rows = _rows("r-cmh-satisfaction.csv")
    cols = ["V_D", "L_S", "M_S", "V_S"]
    tables = [[[float(r[c]) for c in cols] for r in rows
               if r["gender"] == g] for g in ("Female", "Male")]
    res = trend.cmh_general(tables)
    assert res["cmh_test"]["chi2"] == pytest.approx(10.2, abs=0.05)
    assert res["cmh_test"]["df"] == 9
    assert res["cmh_test"]["p"] == pytest.approx(0.3345, abs=5e-5)
    via_api = api.analyze({"analysis": "cmh", "data": {"tables": tables},
                           "options": {}})
    assert via_api["cmh_test"]["chi2"] == pytest.approx(
        res["cmh_test"]["chi2"])


def test_generalized_cmh_reduces_to_mantel_haenszel_for_2x2():
    tables = [[[10, 5], [3, 12]], [[8, 8], [4, 9]], [[6, 2], [5, 5]]]
    g = trend.cmh_general(tables)["cmh_test"]["chi2"]
    mh = trend.cmh(tables)["cmh_test"]["chi2"]
    assert g == pytest.approx(mh, rel=1e-12)


def test_woolf_and_aggregate_ucb_admissions():
    rows = _rows("r-cmh-ucbadmissions.csv")
    tables = []
    for d in "ABCDEF":
        sub = {r["gender"]: r for r in rows if r["dept"] == d}
        tables.append([[float(sub["Male"]["admitted"]),
                        float(sub["Female"]["admitted"])],
                       [float(sub["Male"]["rejected"]),
                        float(sub["Female"]["rejected"])]])
    res = trend.cmh(tables, correction=True)
    # R datasets::UCBAdmissions example: woolf(UCBAdmissions) 0.003427200
    assert res["woolf"]["p"] == pytest.approx(0.0034272, abs=5e-8)
    assert res["aggregate_table"] == [[1198, 557], [1493, 1278]]


# ----------------------------------------------------------- Kendall

def _tuna():
    rows = _rows("r-hw-tuna-correlation.csv")
    return ([float(r["hunter_L"]) for r in rows],
            [float(r["panel_score"]) for r in rows])


class TestKendall:
    def test_tuna_matches_r(self):
        # R: cor.test(x, y, method = "kendall", alternative = "greater")
        k = correlation.correlate(*_tuna(), method="kendall")
        assert k["tau"] == pytest.approx(0.4444444, abs=5e-8)
        assert k["T"] == 26
        assert k["p_type"] == "exact"
        assert k["p_greater"] == pytest.approx(0.05972, abs=5e-6)
        na = k["normal_approximation"]   # exact = FALSE
        assert na["z"] == pytest.approx(1.6681, abs=5e-5)
        assert na["p_greater"] == pytest.approx(0.04765, abs=5e-6)

    def test_exact_equals_scipy(self):
        rng = np.random.default_rng(4)
        x, y = rng.normal(size=12), rng.normal(size=12)
        k = correlation.kendall(x, y)
        ref = stats.kendalltau(x, y, method="exact")
        assert k["tau"] == pytest.approx(ref.statistic, rel=1e-12)
        assert k["p_two_tailed"] == pytest.approx(ref.pvalue, rel=1e-10)

    def test_ties_use_tie_corrected_normal_approximation(self):
        x = [1, 2, 2, 3, 4, 4, 5, 6, 7, 7]
        y = [2, 1, 3, 3, 5, 4, 6, 6, 8, 7]
        k = correlation.kendall(x, y)
        ref = stats.kendalltau(x, y, method="asymptotic")
        assert k["p_type"] == "approximate"
        assert k["tau"] == pytest.approx(ref.statistic, rel=1e-12)
        assert k["p_two_tailed"] == pytest.approx(ref.pvalue, rel=1e-10)


def test_one_sided_pearson_bound_and_p():
    # R: cor.test(x, y, alternative = "g"): t = 1.8411, p = 0.05409,
    # 95 percent CI -0.02223023 to 1
    r = correlation.correlate(*_tuna())
    assert r["t"] == pytest.approx(1.8411, abs=5e-5)
    assert r["p_greater"] == pytest.approx(0.05409, abs=5e-6)
    assert r["ci_r_greater"] == pytest.approx([-0.02223023, 1.0], abs=5e-9)
    assert r["p_greater"] + r["p_less"] == pytest.approx(1.0)


def test_spearman_one_sided_exact():
    # R: cor.test(x, y, method = "spearm", alternative = "g"): S = 48,
    # p-value = 0.0484
    r = correlation.correlate(*_tuna(), method="spearman")
    assert r["S"] == pytest.approx(48)
    assert r["p_greater"] == pytest.approx(0.0484, abs=5e-5)


# ------------------------------------------------ Fligner-Killeen, Holm

def test_fligner_killeen_insect_sprays():
    rows = _rows("r-insectsprays.csv")
    groups = [[float(r[c]) for r in rows] for c in "ABCDEF"]
    fk = fligner_killeen(groups)
    # R: fligner.test(count ~ spray): med chi-squared = 14.483, df = 5,
    # p-value = 0.01282
    assert fk["statistic"] == pytest.approx(14.483, abs=5e-4)
    assert fk["df"] == 5
    assert fk["p"] == pytest.approx(0.01282, abs=5e-6)
    ref = stats.fligner(*groups, center="median")
    assert fk["statistic"] == pytest.approx(ref.statistic, rel=1e-12)


def test_holm_adjustment_matches_statsmodels():
    from statsmodels.stats.multitest import multipletests
    p = [0.01, 0.04, 0.03, 0.005, 0.2, 0.6]
    ours = fdr.adjust(p, "holm")["adjusted"]
    assert ours == pytest.approx(list(multipletests(p, method="holm")[1]))
    assert fdr.adjust(p, "bonferroni_holm")["method"] == "holm"


def test_holm_pairwise_t_airquality():
    # R: pairwise.t.test(Ozone, Month) (pooled SD, Holm)
    rows = _rows("r-airquality-ozone.csv")
    months = ["May", "Jun", "Jul", "Aug", "Sep"]
    data = {"datasets": [{"name": mth, "ys": [[_num(r[mth])] for r in rows]}
                         for mth in months]}
    res = api.analyze({"analysis": "anova", "data": data,
                       "options": {"comparisons": "holm"}})
    got = {c["pair"]: c["p_adjusted"]
           for c in res["multiple_comparisons"]["comparisons"]}
    assert got["May vs. Jul"] == pytest.approx(0.00026, abs=5e-6)
    assert got["Jun vs. Jul"] == pytest.approx(0.05113, abs=5e-6)
    assert got["Jun vs. Aug"] == pytest.approx(0.04987, abs=5e-6)
    assert got["Jul vs. Sep"] == pytest.approx(0.00488, abs=5e-6)
    assert got["May vs. Jun"] == 1.0


# ------------------------------------------------------------ survival

def _aml():
    rows = _rows("surv-aml.csv")
    groups = []
    for g in ("Maintained", "Nonmaintained"):
        sub = [r for r in rows if r["group"] == g]
        groups.append(([float(r["time_weeks"]) for r in sub],
                       [int(float(r["status"])) for r in sub]))
    return groups


def test_kaplan_meier_standard_errors_aml():
    # R: summary(survfit(Surv(time, status) ~ x, data = aml)) std.err
    c = survival.km_curve(*_aml()[0])
    se = {p["time"]: p["se"] for p in c["points"]}
    for t, ref in ((9, 0.0867), (13, 0.1163), (18, 0.1397), (23, 0.1526),
                   (31, 0.1642), (34, 0.1627), (48, 0.1535)):
        assert se[t] == pytest.approx(ref, abs=5e-5)


def test_median_survival_ci_brookmeyer_crowley():
    # R survfit (log band): aml Maintained 0.95LCL 18 (UCL NA),
    # Nonmaintained 8 (NA)
    m, nm = (survival.km_curve(*g) for g in _aml())
    assert m["median_ci_log"]["lower"] == 18
    assert m["median_ci_log"]["upper"] is None
    assert nm["median_ci_log"]["lower"] == 8
    assert nm["median_ci_log"]["upper"] is None
    # lung: survfit(Surv(time, status) ~ 1) median 310, CI 285 to 363
    rows = _rows("surv-lung.csv")
    c = survival.km_curve([float(r["time_days"]) for r in rows],
                          [int(float(r["event"])) for r in rows])
    assert c["median_survival"] == 310
    assert (c["median_ci_log"]["lower"], c["median_ci_log"]["upper"]) == \
        (285, 363)
    lo, hi = c["median_ci"]["lower"], c["median_ci"]["upper"]
    assert lo <= 310 <= hi                      # log-log band


def test_logrank_both_forms():
    res = survival.compare_survival(_aml(), ["M", "N"])
    lr = res["logrank"]
    # Peto form (what the engine always reported, Prism) and the variance
    # form of R's survdiff (Chisq= 3.4, p= 0.07)
    assert lr["chi2"] == pytest.approx(3.1351719856, rel=1e-9)
    assert lr["chi2_variance"] == pytest.approx(3.3963887, rel=1e-7)
    assert lr["p_variance"] == pytest.approx(
        stats.chi2.sf(lr["chi2_variance"], 1))
    assert "Peto" in lr["method"] and "survdiff" in lr["method"]


# ------------------------------------------------------ two-way ANOVA

def test_one_value_per_cell_fits_the_additive_model():
    # R: summary(aov(Speed ~ Run + Expt, data = morley))
    rows = _rows("r-morley.csv")
    expts = [f"Expt {i}" for i in range(1, 6)]
    cells = [[[float(r[e])] for e in expts] for r in rows]
    res = twoway.two_way_anova(cells)
    assert res["model"] == "main effects only (additive)"
    assert "one value per cell" in res["note"]
    assert "interaction" not in res["sources"]
    src = res["sources"]
    assert src["Rows"]["df"] == 19 and src["Columns"]["df"] == 4
    assert src["residual"]["df"] == 76
    assert src["Rows"]["F"] == pytest.approx(1.105, abs=5e-4)
    assert src["Rows"]["p"] == pytest.approx(0.36321, abs=5e-6)
    assert src["Columns"]["F"] == pytest.approx(4.378, abs=5e-4)
    assert src["Columns"]["p"] == pytest.approx(0.00307, abs=5e-6)


def test_additive_model_on_request_warpbreaks():
    # R: summary(aov(breaks ~ wool + tension, data = warpbreaks))
    rows = _rows("r-warpbreaks.csv")
    cells = [[[float(r["breaks"]) for r in rows
               if r["tension"] == t and r["wool"] == w] for w in "AB"]
             for t in "LMH"]
    res = twoway.two_way_anova(cells, additive=True)
    src = res["sources"]
    assert src["Columns"]["F"] == pytest.approx(3.339, abs=5e-4)
    assert src["Rows"]["p"] == pytest.approx(0.00138, abs=5e-6)
    assert src["residual"]["df"] == 50
    full = twoway.two_way_anova(cells)
    assert full["model"] == "full (with interaction)"
    assert "interaction" in full["sources"]


# ------------------------------------------- quantal, upper asymptote

def _earthworms():
    rows = _rows("drc-earthworms.csv")
    return ([float(r["dose"]) for r in rows], [float(r["total"]) for r in rows],
            [float(r["number"]) for r in rows])


def test_ll3_binomial_is_the_maximum_likelihood_fit():
    """drc LL.3 (binomial): p = d / (1 + exp(b (ln x - ln e))). The
    engine's fit is the exact MLE (an independent Nelder-Mead maximisation
    agrees); drc's printed estimates (b 1.505679, d 0.604929, e 0.292428)
    are 1e-4 short of it, and its observed-information SEs (0.338992,
    0.0858, 0.083895) agree to that level."""
    from scipy.optimize import minimize
    d, n, r = (np.array(v) for v in _earthworms())
    f = quantal.quantal_fit(d, n, r, link="logit", dose_transform="ln",
                            upper_asymptote="estimate",
                            information="observed", heterogeneity="never")
    b = -f["parameters"]["slope"]["value"]
    u = f["parameters"]["upper_asymptote"]["value"]
    e = f["ec"][0]["dose"]

    def nll(t):
        with np.errstate(divide="ignore"):
            p = t[1] / (1 + np.exp(t[0] * (np.log(d) - math.log(t[2]))))
        p = np.where(d == 0, t[1], p)
        return -float(np.sum(r * np.log(p) + (n - r) * np.log1p(-p)))
    ref = minimize(nll, [1.5, 0.6, 0.3], method="Nelder-Mead",
                   options={"xatol": 1e-11, "fatol": 1e-13,
                            "maxiter": 20000}).x
    assert [b, u, e] == pytest.approx(list(ref), rel=1e-6)
    assert [b, u, e] == pytest.approx([1.505679, 0.604929, 0.292428],
                                      rel=2e-4)
    assert f["parameters"]["slope"]["se"] == pytest.approx(0.338992,
                                                           rel=2e-4)
    assert f["parameters"]["upper_asymptote"]["se"] == pytest.approx(
        0.0858, rel=1e-3)
    assert f["ec"][0]["dose"] * f["ec"][0]["se_x"] == pytest.approx(
        0.083895, rel=2e-4)


def test_observed_information_is_the_negative_hessian():
    d, n, r = (np.array(v) for v in _earthworms())
    f = quantal.quantal_fit(d, n, r, link="probit", dose_transform="ln",
                            upper_asymptote="estimate",
                            information="observed", heterogeneity="never")
    cov = np.array(f["covariance"])
    x = np.log(np.where(d > 0, d, 1.0))
    theta = np.array([f["parameters"]["intercept"]["value"],
                      f["parameters"]["slope"]["value"],
                      f["parameters"]["upper_asymptote"]["value"]])

    def ll(t):
        p = t[2] * np.where(d > 0, stats.norm.cdf(t[0] + t[1] * x),
                            1.0 if t[1] < 0 else 0.0)
        return float(np.sum(r * np.log(p) + (n - r) * np.log1p(-p)))
    h = 1e-4
    H = np.zeros((3, 3))
    for i in range(3):
        for j in range(3):
            ei, ej = np.eye(3)[i] * h, np.eye(3)[j] * h
            H[i, j] = (ll(theta + ei + ej) - ll(theta + ei - ej)
                       - ll(theta - ei + ej) + ll(theta - ei - ej)) / (4 * h * h)
    assert np.allclose(np.linalg.inv(-H), cov, rtol=1e-5)


def test_fixed_upper_asymptote_and_default_unchanged():
    d, n, r = (np.array(v) for v in _earthworms())
    f = quantal.quantal_fit(d, n, r, link="logit", dose_transform="ln",
                            upper_asymptote=0.5, information="observed",
                            heterogeneity="never")
    # drc m2 (d fixed 0.5): b 1.646689 (estimates at the exact MLE)
    assert -f["parameters"]["slope"]["value"] == pytest.approx(1.646689,
                                                               abs=1e-6)
    assert f["upper_asymptote_used"] == 0.5
    keep = d > 0
    g = quantal.quantal_fit(d[keep], n[keep], r[keep], link="logit",
                            dose_transform="ln")
    assert g["upper_asymptote_used"] == 1.0 and g["information"] == "expected"


# --------------------------------------------- model comparison, exact

def test_model_comparison_with_an_exact_fit():
    f = compare_fits_f_test(10.0, 6, 0.0, 5)
    assert f["F"] == math.inf and f["p"] == 0.0 and f["prefer_complex"]
    a = compare_fits_aicc(10.0, 2, 0.0, 3, 9)
    assert a["prefer"] == 2 and a["probability_2"] == 1.0
    big = compare_fits_aicc(1e-300, 2, 1.0, 3, 50)   # delta ~ +1e4
    assert big["probability_1"] == 1.0


# -------------------------------------- weights inside the objective

def test_weighted_ss_minimised_directly_puromycin():
    """R's Puromycin example minimises sum((rate - pred)^2 / pred) with
    nls (Vm 206.83 (9.22), K 0.054611 (0.00798)); weight_source
    "objective". Prism's 1/Y weighting (the default IRLS fixed point)
    gives a different estimate (Vmax 207.78)."""
    from opendose.nlfit import fit_model
    rows = _rows("r-puromycin.csv")
    xs, ys = [], []
    for r in rows:
        for c in ("treated_1", "treated_2"):
            if _num(r[c]) is not None:
                xs.append(float(r["conc_ppm"]))
                ys.append(float(r[c]))
    f = fit_model(xs, ys, "michaelis_menten", weighting="1/Y",
                  weight_source="objective")
    p = f["params"]
    assert p["Vmax"]["value"] == pytest.approx(206.83, abs=5e-3)
    assert p["Km"]["value"] == pytest.approx(0.054611, abs=5e-7)
    assert p["Vmax"]["se"] == pytest.approx(9.22, abs=5e-3)
    assert p["Km"]["se"] == pytest.approx(0.00798, abs=5e-6)
    irls = fit_model(xs, ys, "michaelis_menten", weighting="1/Y")
    assert irls["params"]["Vmax"]["value"] == pytest.approx(207.78, abs=0.01)
    with pytest.raises(ValueError, match="raw replicates"):
        fit_model([1, 2, 3, 4], [1, 2, 3, 3.5], "michaelis_menten",
                  weighting="1/Y", weight_source="objective",
                  sd=[0.1] * 4, n=[3] * 4)
