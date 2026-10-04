"""Effect sizes with confidence intervals (opendose.effectsize) and the
effect sizes added to the existing analyses.

References:
- Lakens (2013), "Calculating and reporting effect sizes to facilitate
  cumulative science", Front Psychol 4:863, Table 3 movie ratings:
  d_s = 1.13 with 95% CI [0.16, 2.06] (ESCI, noncentral t), Hedges'
  g_s = 1.08, common-language effect size 0.79, t(18) = 2.52; paired:
  t(9) = 4.74, d_z = 1.50, g_av = 1.08, the within-subject 95% CI
  [0.42, 1.80] Lakens reports from ESCI (the d_av interval of Algina &
  Keselman's approximate method), CL 0.93; F(1, 18) = 6.34 gives
  eta_p^2 = 0.26.
- Cohen (1988): d = 0.5 with equal groups is r = d / sqrt(d^2 + 4) =
  0.243; f = 0.25 is eta^2 = 0.0588; benchmark labels.
- Hedges & Olkin (1985): J(10) = Gamma(5) / (sqrt(5) Gamma(4.5)) =
  0.922745.
- pingouin 0.7 (compute_effsize, compute_esci, mwu RBC/CLES, wilcoxon
  RBC, friedman W, anova np2, rm_anova np2/ng2, mixed_anova np2/ng2),
  scipy (pointbiserialr, contingency.association), statsmodels
  (proportion_effectsize), DABEST's Cliff's delta.
- Exactness of the noncentral-t and noncentral-F intervals checked by
  inversion and by simulated coverage; unbiasedness of Cliff's (1993)
  variance by simulation.
"""

import math

import numpy as np
import pandas as pd
import pingouin as pg
import pytest
from scipy import stats as sps

from opendose import (anova, columnstats, contingency, correlation,
                      effectsize as es, repeated, rowtests, threeway,
                      ttests, twoway)
from opendose.api import analyze

MOVIE_1 = [9, 7, 8, 9, 8, 9, 9, 10, 9, 9]
MOVIE_2 = [9, 6, 7, 8, 7, 9, 8, 8, 8, 7]
RNG = np.random.default_rng(20261004)


# ------------------------------------------------------- Lakens (2013)

class TestLakens2013:
    def test_independent_groups(self):
        r = es.cohens_d(MOVIE_1, MOVIE_2)
        assert round(r["d"], 2) == 1.13
        assert round(r["hedges_g"], 2) == 1.08
        assert [round(v, 2) for v in r["ci_d"]] == [0.16, 2.06]
        assert round(es.cles_parametric(r["d"]), 2) == 0.79
        assert r["interpretation"]["label"] == "large"
        t = ttests.unpaired_t(MOVIE_1, MOVIE_2)
        assert round(t["t"], 2) == 2.52
        assert t["effect_size"]["d"] == pytest.approx(r["d"], rel=1e-12)
        assert t["effect_size"]["ci_d"] == pytest.approx(r["ci_d"])

    def test_paired(self):
        r = es.paired_d(MOVIE_1, MOVIE_2)
        assert r["d_z"] == pytest.approx(1.50, abs=1e-12)
        assert round(r["hedges_g_av"], 2) == 1.08
        assert [round(v, 2) for v in r["ci_d_av"]] == [0.42, 1.80]
        assert round(r["cles_paired"], 2) == 0.93
        assert round(r["correlation"], 3) == 0.726
        t = ttests.paired_t(MOVIE_1, MOVIE_2)
        assert round(t["t"], 2) == 4.74
        assert t["effect_size"]["d_z"] == pytest.approx(1.5)

    def test_eta_squared_from_f(self):
        r = es.from_statistic(F=6.34, df1=1, df2=18)
        assert round(r["partial_eta_squared"], 2) == 0.26
        aov = anova.one_way_anova([MOVIE_1, MOVIE_2])
        assert round(aov["table"]["F"], 2) == 6.34
        assert round(aov["effect_size"]["eta_squared"], 2) == 0.26

    def test_from_t_matches_raw(self):
        t = ttests.unpaired_t(MOVIE_1, MOVIE_2)["t"]
        r = es.from_statistic(t=t, n_a=10, n_b=10)
        assert r["d"] == pytest.approx(es.cohens_d(MOVIE_1, MOVIE_2)["d"])


# ------------------------------------------------ noncentral inversions

class TestNoncentralIntervals:
    @pytest.mark.parametrize("t,df", [(2.5, 18), (-3.1, 7), (0.2, 40),
                                      (12.0, 9), (45.0, 30)])
    def test_t_inversion(self, t, df):
        lo, hi = es.ncp_t_interval(t, df, 0.95)
        assert sps.nct.cdf(t, df, lo) == pytest.approx(0.975, abs=1e-9)
        assert sps.nct.cdf(t, df, hi) == pytest.approx(0.025, abs=1e-9)

    @pytest.mark.parametrize("f,df1,df2", [(6.34, 1, 18), (3.2, 3, 40),
                                           (25.0, 2, 12)])
    def test_f_inversion(self, f, df1, df2):
        lo, hi = es.ncp_f_interval(f, df1, df2, 0.90)
        if lo > 0:
            assert sps.ncf.cdf(f, df1, df2, lo) == pytest.approx(0.95,
                                                                  abs=1e-8)
        assert sps.ncf.cdf(f, df1, df2, hi) == pytest.approx(0.05, abs=1e-8)

    def test_f_lower_limit_truncated(self):
        lo, hi = es.ncp_f_interval(0.5, 2, 20)
        assert lo == 0.0 and hi > 0
        assert es.ncp_f_interval(0.01, 2, 20) == [0.0, 0.0]

    def test_chi2_inversion(self):
        lo, hi = es.ncp_chi2_interval(20.0, 4)
        assert sps.ncx2.cdf(20.0, 4, lo) == pytest.approx(0.975, abs=1e-8)
        assert sps.ncx2.cdf(20.0, 4, hi) == pytest.approx(0.025, abs=1e-8)

    def test_d_interval_coverage(self):
        rng = np.random.default_rng(7)
        hits = 0
        for _ in range(400):
            a, b = rng.normal(0.8, 1, 8), rng.normal(0, 1, 11)
            lo, hi = es.cohens_d(a, b)["ci_d"]
            hits += lo <= 0.8 <= hi
        assert 0.92 <= hits / 400 <= 0.98

    def test_partial_eta_interval_coverage(self):
        rng = np.random.default_rng(11)
        mus = np.array([0.0, 0.5, 1.0])
        sm2 = mus.var()
        true = sm2 / (sm2 + 1.0)
        hits = 0
        for _ in range(300):
            groups = [rng.normal(m, 1, 10) for m in mus]
            ci = anova.one_way_anova(groups)["effect_size"]["ci_eta_squared"]
            hits += ci[0] <= true <= ci[1]
        assert 0.91 <= hits / 300 <= 0.99

    def test_hedges_j(self):
        assert es.hedges_j(10) == pytest.approx(0.922745, abs=1e-6)
        assert es.hedges_j(4000) == pytest.approx(1 - 3 / (4 * 4000 - 1),
                                                  rel=1e-8)


# ------------------------------------------------- against pingouin

class TestPingouin:
    a = RNG.normal(10, 2, 14)
    b = RNG.normal(8.5, 3, 11)

    def test_cohen_and_normal_interval(self):
        d = pg.compute_effsize(self.a, self.b, eftype="cohen")
        r = es.cohens_d(self.a, self.b, ci_method="normal")
        assert r["d"] == pytest.approx(d, rel=1e-12)
        ci = pg.compute_esci(d, nx=14, ny=11, eftype="cohen", decimals=12)
        assert r["ci_d"] == pytest.approx(list(ci), abs=1e-10)

    def test_paired_d_av(self):
        x = RNG.normal(0, 1, 12)
        y = x + RNG.normal(0.6, 0.8, 12)
        d = pg.compute_effsize(x, y, paired=True, eftype="cohen")
        assert es.paired_d(x, y)["d_av"] == pytest.approx(d, rel=1e-12)

    def test_mann_whitney(self):
        ref = pg.mwu(self.a, self.b)
        r = ttests.mann_whitney(self.a, self.b)["effect_size"]
        assert r["rank_biserial"] == pytest.approx(ref["RBC"].iloc[0])
        assert r["cles"] == pytest.approx(ref["CLES"].iloc[0])

    def test_wilcoxon(self):
        x = RNG.normal(0, 1, 15)
        y = x + RNG.normal(0.4, 1, 15)
        ref = pg.wilcoxon(x, y)
        r = ttests.wilcoxon_matched_pairs(x, y)["effect_size"]
        assert r["rank_biserial"] == pytest.approx(ref["RBC"].iloc[0])

    def test_friedman_kendalls_w(self):
        M = RNG.normal(0, 1, (10, 4)) + np.array([0, 0.5, 1.0, 0.2])
        df = pd.DataFrame({"s": np.repeat(range(10), 4),
                           "w": np.tile(range(4), 10), "y": M.ravel()})
        ref = pg.friedman(df, dv="y", within="w", subject="s")
        r = repeated.friedman([M[:, j] for j in range(4)])["effect_size"]
        assert r["kendalls_w"] == pytest.approx(ref["W"].iloc[0])

    def test_rm_one_way(self):
        M = RNG.normal(0, 1, (9, 3)) + np.array([0, 0.7, 0.3])
        df = pd.DataFrame({"s": np.repeat(range(9), 3),
                           "w": np.tile(range(3), 9), "y": M.ravel()})
        np2 = pg.rm_anova(df, dv="y", within="w", subject="s",
                          effsize="np2")["np2"].iloc[0]
        ng2 = pg.rm_anova(df, dv="y", within="w", subject="s",
                          effsize="ng2")["ng2"].iloc[0]
        r = repeated.rm_one_way_anova([M[:, j] for j in range(3)])
        e = r["effect_size"]
        assert e["partial_eta_squared"] == pytest.approx(np2)
        assert e["generalized_eta_squared"] == pytest.approx(ng2)
        assert e["partial_eta_squared"] == pytest.approx(r["r_squared"])

    def test_mixed(self):
        rows, cells = [], [[[], []] for _ in range(3)]
        sid = 0
        for g in range(2):
            for _ in range(6):
                base = RNG.normal(0, 1)
                for t in range(3):
                    v = base + 0.5 * t + 0.4 * g * t + RNG.normal(0, 0.7)
                    rows.append((sid, g, t, v))
                    cells[t][g].append(v)
                sid += 1
        df = pd.DataFrame(rows, columns=["s", "g", "t", "y"])
        ref_p = pg.mixed_anova(df, dv="y", within="t", between="g",
                               subject="s", effsize="np2")
        ref_g = pg.mixed_anova(df, dv="y", within="t", between="g",
                               subject="s", effsize="ng2")
        r = repeated.rm_two_way_mixed(cells)["effect_size"]
        for key, src in (("column_factor", "g"), ("row_factor", "t"),
                         ("interaction", "Interaction")):
            assert r[key]["partial_eta_squared"] == pytest.approx(
                ref_p.set_index("Source").loc[src, "np2"])
            assert r[key]["generalized_eta_squared"] == pytest.approx(
                ref_g.set_index("Source").loc[src, "ng2"])

    def test_both_factors_repeated(self):
        n, a, b = 8, 2, 3
        Y = RNG.normal(0, 1, (a, b, n)) + RNG.normal(0, 1, n)[None, None]
        Y += np.arange(b)[None, :, None] * 0.4
        rows = [(s, i, j, Y[i, j, s]) for i in range(a) for j in range(b)
                for s in range(n)]
        df = pd.DataFrame(rows, columns=["s", "a", "b", "y"])
        ref = pg.rm_anova(df, dv="y", within=["a", "b"], subject="s",
                          effsize="ng2").set_index("Source")
        refp = pg.rm_anova(df, dv="y", within=["a", "b"], subject="s",
                           effsize="np2").set_index("Source")
        cells = [[list(Y[i, j]) for j in range(b)] for i in range(a)]
        r = repeated.rm_two_way_both(cells)["effect_size"]
        for key, src in (("row_factor", "a"), ("column_factor", "b"),
                         ("interaction", "a * b")):
            assert r[key]["generalized_eta_squared"] == pytest.approx(
                ref.loc[src, "ng2"])
            assert r[key]["partial_eta_squared"] == pytest.approx(
                refp.loc[src, "np2"])

    def test_two_way_partial_eta(self):
        cells = [[list(RNG.normal(i + 0.5 * j, 1, 4 + (i + j) % 2))
                  for j in range(3)] for i in range(2)]
        rows = [(i, j, v) for i in range(2) for j in range(3)
                for v in cells[i][j]]
        df = pd.DataFrame(rows, columns=["a", "b", "y"])
        ref = pg.anova(df, dv="y", between=["a", "b"], effsize="np2",
                       ss_type=3).set_index("Source")
        r = twoway.two_way_anova(cells)
        e = r["effect_size"]
        assert e["Rows"]["partial_eta_squared"] == pytest.approx(
            ref.loc["a", "np2"])
        assert e["Columns"]["partial_eta_squared"] == pytest.approx(
            ref.loc["b", "np2"])
        assert e["interaction"]["partial_eta_squared"] == pytest.approx(
            ref.loc["a * b", "np2"])
        # partial omega^2 = df (F - 1) / (df (F - 1) + N)
        for label, src in r["sources"].items():
            if label == "residual":
                continue
            x = src["df"] * (src["F"] - 1)
            assert e[label]["partial_omega_squared"] == pytest.approx(
                x / (x + r["n"]))

    def test_one_way_eta(self):
        groups = [RNG.normal(m, 1, 7) for m in (0, 0.4, 1.1, 0.2)]
        df = pd.DataFrame({"y": np.concatenate(groups),
                           "g": np.repeat(list("ABCD"), 7)})
        ref = pg.anova(df, dv="y", between="g", effsize="n2")
        r = anova.one_way_anova(groups)
        e, t = r["effect_size"], r["table"]
        assert e["eta_squared"] == pytest.approx(ref["n2"].iloc[0])
        F, dfb, dfw = t["F"], t["df_between"], t["df_within"]
        n = dfb + dfw + 1
        assert e["omega_squared"] == pytest.approx(
            (F - 1) * dfb / ((F - 1) * dfb + n))
        assert e["epsilon_squared"] == pytest.approx(
            (F - 1) * dfb / (F * dfb + dfw))
        assert e["cohens_f"] == pytest.approx(
            math.sqrt(e["eta_squared"] / (1 - e["eta_squared"])))


# ------------------------------------------------------- association

class TestAssociation:
    def test_cramers_v_scipy(self):
        tab = [[12, 5, 9], [7, 15, 4], [3, 6, 14]]
        r = es.phi_cramers_v(tab)
        assert r["cramers_v"] == pytest.approx(
            sps.contingency.association(tab, method="cramer"))
        lo, hi = r["ci_cramers_v"]
        assert lo < r["cramers_v"] < hi
        assert r["cramers_v_corrected"] < r["cramers_v"]

    def test_phi_signed(self):
        r = es.phi_cramers_v([[10, 20], [30, 5]])
        a, b, c, d = 10, 20, 30, 5
        phi = (a * d - b * c) / math.sqrt((a + b) * (c + d) * (a + c)
                                          * (b + d))
        assert r["phi"] == pytest.approx(phi)
        assert r["cramers_v"] == pytest.approx(abs(phi))

    def test_bias_correction_reduces_bias(self):
        rng = np.random.default_rng(3)
        raw, corr = [], []
        for _ in range(200):
            t = rng.multinomial(60, [1 / 12] * 12).reshape(3, 4)
            if (t.sum(0) == 0).any() or (t.sum(1) == 0).any():
                continue
            r = es.phi_cramers_v(t)
            raw.append(r["cramers_v"])
            corr.append(r["cramers_v_corrected"])
        assert np.mean(corr) < 0.5 * np.mean(raw)

    def test_bootstrap_ci(self):
        r = es.phi_cramers_v([[20, 10], [8, 25]], ci_method="bootstrap",
                             n_boot=500, seed=1)
        assert r["ci_cramers_v"][0] < r["cramers_v"] < r["ci_cramers_v"][1]

    def test_point_biserial(self):
        a, b = RNG.normal(1, 1, 9), RNG.normal(0, 1, 12)
        r = es.point_biserial(a, b)
        x = np.r_[np.ones(9), np.zeros(12)]
        assert r["r"] == pytest.approx(sps.pointbiserialr(
            x, np.r_[a, b]).statistic)
        t = ttests.unpaired_t(a, b)
        assert r["r"] ** 2 == pytest.approx(t["r_squared"])

    def test_cohen_d_to_r(self):
        # Cohen (1988) eq. 2.2.6: equal groups, r = d / sqrt(d^2 + 4)
        r = es.from_statistic(t=0.5 / math.sqrt(2 / 10000), n_a=10000,
                              n_b=10000)
        assert r["d"] == pytest.approx(0.5)
        assert 0.5 / math.sqrt(0.5 ** 2 + 4) == pytest.approx(0.2425,
                                                               abs=1e-4)

    def test_r_squared_interval(self):
        assert es.r_squared_interval([-0.2, 0.5]) == [0.0, 0.25]
        assert es.r_squared_interval([0.3, 0.6]) == pytest.approx([0.09,
                                                                   0.36])
        c = correlation.correlate([1, 2, 3, 4, 5, 6], [2, 1, 4, 3, 7, 8])
        assert c["effect_size"]["ci_r_squared"] == pytest.approx(
            es.r_squared_interval(c["ci_r"]))

    def test_cohens_h(self):
        from statsmodels.stats.proportion import proportion_effectsize
        r = es.cohens_h(0.65, 0.45, 40, 50)
        assert r["cohens_h"] == pytest.approx(proportion_effectsize(0.65,
                                                                    0.45))
        assert r["interpretation"]["label"] == "small"

    def test_cohens_w(self):
        r = es.cohens_w([30, 20, 50], [1, 1, 2])
        p1 = np.array([0.3, 0.2, 0.5])
        p0 = np.array([0.25, 0.25, 0.5])
        assert r["cohens_w"] == pytest.approx(
            math.sqrt(np.sum((p1 - p0) ** 2 / p0)))


# ----------------------------------------------------- nonparametric

class TestNonparametric:
    def test_cliffs_delta_dabest_and_brute(self):
        a = [1.2, 3.4, 2.2, 5.0, 4.4, 2.2]
        b = [0.5, 2.2, 1.9, 3.0, 0.7]
        r = es.cliffs_delta(a, b)
        gt = sum(x > y for x in a for y in b)
        lt = sum(x < y for x in a for y in b)
        assert r["cliffs_delta"] == pytest.approx((gt - lt) / 30)
        u = sps.mannwhitneyu(a, b).statistic
        assert r["cles"] == pytest.approx(u / 30)
        assert r["ci_cliffs_delta"][0] < r["cliffs_delta"] < \
            r["ci_cliffs_delta"][1]

    def test_cliff_variance_unbiased(self):
        rng = np.random.default_rng(5)
        deltas, variances = [], []
        for _ in range(1500):
            a, b = rng.normal(0.5, 1, 7), rng.normal(0, 1, 9)
            r = es.cliffs_delta(a, b)
            deltas.append(r["cliffs_delta"])
            variances.append(r["se_cliffs_delta"] ** 2)
        assert np.mean(variances) == pytest.approx(np.var(deltas, ddof=1),
                                                   rel=0.08)

    def test_complete_separation(self):
        r = es.cliffs_delta([5, 6, 7, 8], [1, 2, 3])
        assert r["cliffs_delta"] == 1.0
        assert r["ci_cliffs_delta"][1] == 1.0 and r["ci_cliffs_delta"][0] < 1

    def test_kruskal_epsilon(self):
        groups = [RNG.normal(m, 1, 8) for m in (0, 0.5, 1.5)]
        r = anova.kruskal_wallis(groups)
        n = 24
        assert r["effect_size"]["epsilon_squared"] == pytest.approx(
            r["H"] / (n - 1))
        assert r["effect_size"]["eta_squared_h"] == pytest.approx(
            (r["H"] - 3 + 1) / (n - 3))

    def test_rank_biserial_one_sample(self):
        x = [1.5, -0.5, 2.0, 3.1, 0.4, -1.2, 2.2]
        r = columnstats.wilcoxon_signed_rank(x, 0.0)["effect_size"]
        ranks = sps.rankdata(np.abs(x))
        rp = ranks[np.array(x) > 0].sum()
        rm = ranks[np.array(x) < 0].sum()
        assert r["rank_biserial"] == pytest.approx((rp - rm) / (rp + rm))


# --------------------------------------------------------- labels

class TestInterpretation:
    @pytest.mark.parametrize("value,scale,label", [
        (0.1, "d", "negligible"), (0.5, "d", "medium"), (-0.85, "d", "large"),
        (0.05, "eta2", "small"), (0.3, "cles", "medium"),
        (0.2, "odds_ratio", "medium"), (0.5, "cliffs_delta", "large"),
        (0.29, "r", "small")])
    def test_labels(self, value, scale, label):
        r = es.interpret(value, scale)
        assert r["label"] == label
        assert "Cohen" in r["source"] or "Vargha" in r["source"] or \
            "Romano" in r["source"] or "Chen" in r["source"]

    def test_eta_from_f(self):
        # Cohen (1988): f = 0.25 corresponds to eta^2 = 0.0588
        assert 0.25 ** 2 / (1 + 0.25 ** 2) == pytest.approx(0.0588, abs=1e-4)


# ---------------------------------------- added to existing analyses

class TestExistingAnalyses:
    def test_welch_uses_average_sd(self):
        a, b = [1.0, 2.0, 3.0, 4.0, 5.0], [2.0, 4.0, 6.0, 8.0, 11.0, 14.0]
        r = ttests.unpaired_t(a, b, welch=True)
        e = r["effect_size"]
        assert e["standardizer"] == "average"
        sd = math.sqrt((np.var(a, ddof=1) + np.var(b, ddof=1)) / 2)
        assert e["d"] == pytest.approx((np.mean(a) - np.mean(b)) / sd)
        assert e["ci_d"][0] < e["d"] < e["ci_d"][1]
        # existing keys untouched
        assert r["t"] == pytest.approx(abs(sps.ttest_ind(
            a, b, equal_var=False).statistic))

    def test_degenerate_effect_is_none(self):
        r = ttests.paired_t([1, 2, 3], [0, 1, 2])
        assert r["effect_size"] is None or not math.isfinite(
            r["effect_size"]["d_z"]) or r["effect_size"]["ci_d_z"] is None

    def test_one_sample(self):
        x = [4.1, 5.3, 6.0, 5.5, 4.8, 6.4]
        r = columnstats.one_sample_t(x, 4.0)["effect_size"]
        assert r["d"] == pytest.approx((np.mean(x) - 4) / np.std(x, ddof=1))

    def test_ratio_t_on_logs(self):
        r = ttests.ratio_paired_t([8.7, 4.9, 13.1], [4.2, 2.5, 6.5])
        assert r["effect_size"]["scale"] == "log10"
        assert r["geometric_mean_ratio"] == pytest.approx(2.02, abs=0.005)

    def test_contingency(self):
        r = contingency.contingency([[15, 5], [6, 14]])
        e = r["effect_size"]
        assert e["phi"] == pytest.approx(math.sqrt(r["chi_square"]["chi2"]
                                                   / 40))
        assert e["odds_ratio_interpretation"]["label"] in (
            "medium", "large")
        big = contingency.contingency([[10, 4, 6], [3, 12, 5]])
        assert "phi" in big["effect_size"]

    def test_three_way(self):
        cells = [[[list(RNG.normal(i + j + 0.5 * k, 1, 3)) for k in range(2)]
                  for j in range(2)] for i in range(2)]
        r = threeway.three_way_anova(cells)
        e = r["effect_size"]
        assert set(e) == {k for k in r["sources"] if k != "residual"}
        for k, v in e.items():
            s = r["sources"][k]
            assert v["partial_eta_squared"] == pytest.approx(
                s["ss"] / (s["ss"] + r["sources"]["residual"]["ss"]))
            assert v["eta_squared"] == pytest.approx(s["ss"] / r["ss_total"])

    def test_row_tests(self):
        rows_a = [[1, 2, 3, 4], [5, 6, 7], [1, 1, 1]]
        rows_b = [[2, 3, 5, 6], [5, 5, 6], [2, 2, 2]]
        r = rowtests.multiple_t_tests(rows_a, rows_b, test="unpaired")
        e = r["rows"][0]["effect_size"]
        assert e["measure"] == "cohens_d"
        assert e["value"] == pytest.approx(es.cohens_d(rows_a[0],
                                                       rows_b[0])["d"])
        assert e["hedges_g"] == pytest.approx(es.cohens_d(
            rows_a[0], rows_b[0])["hedges_g"])
        s = rowtests.multiple_t_tests(rows_a, rows_b, test="unpaired",
                                      swap=True)
        assert s["rows"][0]["effect_size"]["value"] == pytest.approx(
            -e["value"])
        p = rowtests.multiple_t_tests(rows_a, rows_b, test="paired")
        assert p["rows"][0]["effect_size"]["measure"] == "cohens_d_z"
        m = rowtests.multiple_t_tests(rows_a, rows_b, test="mann_whitney")
        assert m["rows"][0]["effect_size"]["measure"] == "cliffs_delta"


# ------------------------------------------------------------- API

class TestApi:
    data = {"datasets": [{"name": "Movie 1", "ys": [[v] for v in MOVIE_1]},
                         {"name": "Movie 2", "ys": [[v] for v in MOVIE_2]}]}

    def test_two_group_bundle(self):
        r = analyze({"analysis": "effect_size", "data": self.data})
        assert r["measure"] == "two_group"
        assert round(r["cohens_d"]["d"], 2) == 1.13
        assert r["names"] == ["Movie 1", "Movie 2"]
        assert r["cliffs_delta"]["cliffs_delta"] == pytest.approx(0.57)

    def test_paired_and_summary(self):
        r = analyze({"analysis": "effect_size", "data": self.data,
                     "options": {"measure": "paired"}})
        assert r["d_z"] == pytest.approx(1.5)
        s = analyze({"analysis": "effect_size", "data": {"summary": [
            {"mean": 8.7, "sd": np.std(MOVIE_1, ddof=1), "n": 10},
            {"mean": 7.7, "sd": np.std(MOVIE_2, ddof=1), "n": 10}]}})
        assert round(s["d"], 2) == 1.13

    def test_table_statistic_bootstrap(self):
        t = analyze({"analysis": "effect_size",
                     "data": {"table": [[12, 5], [4, 13]]}})
        assert t["measure"] == "association" and 0 < t["cramers_v"] < 1
        f = analyze({"analysis": "effect_size",
                     "data": {"statistic": {"F": 6.34, "df1": 1, "df2": 18}}})
        assert round(f["partial_eta_squared"], 2) == 0.26
        b = analyze({"analysis": "effect_size", "data": self.data,
                     "options": {"measure": "cohens_d",
                                 "ci_method": "bootstrap", "n_boot": 2000}})
        assert b["ci_d"][0] < b["d"] < b["ci_d"][1]
        assert "bootstrap" in b["ci_method"]

    def test_anova_kruskal_kendall(self):
        data = {"datasets": [{"name": n, "ys": [[v] for v in vals]}
                             for n, vals in (("A", [1, 2, 3, 4]),
                                             ("B", [3, 4, 5, 6]),
                                             ("C", [5, 7, 8, 9]))]}
        for m in ("anova", "kruskal", "kendalls_w"):
            r = analyze({"analysis": "effect_size", "data": data,
                         "options": {"measure": m}})
            assert "error" not in r, r.get("error")

    def test_handlers_carry_effect_sizes(self):
        r = analyze({"analysis": "ttest", "data": self.data,
                     "options": {"kind": "mann_whitney"}})
        assert "cliffs_delta" in r["effect_size"]
        r = analyze({"analysis": "contingency",
                     "data": {"table": [[12, 5], [4, 13]]}})
        assert "cramers_v" in r["effect_size"]
