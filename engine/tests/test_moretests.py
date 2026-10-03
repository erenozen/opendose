"""Column-data tests added from the statistics guide: two-sample
Kolmogorov-Smirnov, Welch and Brown-Forsythe ANOVA, Games-Howell /
Dunnett T3 / Tamhane T2, Newman-Keuls, Fisher's LSD, Mood's median test,
exact Mann-Whitney / Wilcoxon / Friedman P values, the ratio t tests,
the KS normality test and the descriptive-statistics extras.

References: the GraphPad statistics guide's documented rules and worked
examples (ratio t test Km example; geometric SD example; median CI 96.88%
for n = 6; percentile rank R = P(n + 1)/100), pingouin (welch_anova,
pairwise_gameshowell), statsmodels (anova_oneway, lilliefors), scipy,
and brute-force enumeration of the permutation distributions.
"""

import math
from itertools import combinations, permutations, product

import numpy as np
import pandas as pd
import pytest
from scipy import stats as sps

from opendose import anova, columnstats, exactdist, moretests, repeated, ttests
from opendose.api import analyze

RNG = np.random.default_rng(20261003)
G4 = [RNG.normal(10, 1, 6), RNG.normal(11, 3, 9), RNG.normal(13, 2, 7),
      RNG.normal(10.5, 0.5, 5)]
NAMES = list("ABCD")


def _df(groups=G4):
    return pd.DataFrame({"y": np.concatenate(groups),
                         "g": np.repeat(NAMES[:len(groups)],
                                        [len(g) for g in groups])})


# ------------------------------------------------------- brute-force helpers

def _brute_rank_sum_p(a, b):
    pooled = np.array(list(a) + list(b), float)
    r = sps.rankdata(pooled)
    n, na = pooled.size, len(a)
    e = na * (n + 1) / 2
    obs = abs(r[:na].sum() - e)
    hits = tot = 0
    for c in combinations(range(n), na):
        tot += 1
        hits += abs(r[list(c)].sum() - e) >= obs - 1e-9
    return hits / tot


def _brute_signed_rank_p(d, pratt=False):
    d = np.asarray(d, float)
    if pratt:
        r = sps.rankdata(np.abs(d))
        r, d = r[d != 0], d[d != 0]
    else:
        d = d[d != 0]
        r = sps.rankdata(np.abs(d))
    t_obs = r[d > 0].sum()
    e = r.sum() / 2
    hits = tot = 0
    for signs in product((0, 1), repeat=d.size):
        t = r[np.array(signs, bool)].sum()
        tot += 1
        hits += abs(t - e) >= abs(t_obs - e) - 1e-9
    return hits / tot


def _brute_ks_p(a, b):
    pooled = np.array(list(a) + list(b), float)
    n, na = pooled.size, len(a)
    d_obs = sps.ks_2samp(a, b).statistic
    hits = tot = 0
    for c in combinations(range(n), na):
        mask = np.zeros(n, bool)
        mask[list(c)] = True
        tot += 1
        hits += sps.ks_2samp(pooled[mask], pooled[~mask]).statistic >= \
            d_obs - 1e-12
    return hits / tot


# ------------------------------------------------------------------ KS test

class TestKolmogorovSmirnov:
    def test_exact_matches_scipy_without_ties(self):
        a, b = RNG.normal(size=8), RNG.normal(0.8, 1, 10)
        res = moretests.ks_two_sample(a, b)
        assert res["p_method"] == "exact"
        assert res["D"] == pytest.approx(sps.ks_2samp(a, b).statistic)
        assert res["p"] == pytest.approx(
            sps.ks_2samp(a, b, method="exact").pvalue, rel=1e-10)

    def test_exact_with_ties_is_the_reshuffle_fraction(self):
        a, b = [1, 2, 2, 3, 5], [2, 3, 4, 4, 6, 7]
        res = moretests.ks_two_sample(a, b)
        assert res["ties"] and res["p_method"] == "exact"
        assert res["p"] == pytest.approx(_brute_ks_p(a, b), abs=1e-12)

    @pytest.mark.parametrize("n1,n2,exact", [
        (2, 346, True), (2, 347, False), (3, 69, True), (3, 70, False),
        (4, 32, True), (5, 20, True), (5, 21, False), (6, 15, True),
        (7, 12, True), (8, 10, True), (8, 11, False), (9, 9, True),
        (9, 10, False), (1, 5, False)])
    def test_guide_exact_size_list(self, n1, n2, exact):
        assert moretests.ks_exact_rule(n1, n2) is exact
        assert moretests.ks_exact_rule(n2, n1) is exact

    def test_large_samples_numerical_recipes_approximation(self):
        a, b = RNG.normal(size=40), RNG.normal(0.5, 1, 50)
        res = moretests.ks_two_sample(a, b)
        assert res["p_method"] == "approximate"
        ne = 40 * 50 / 90
        lam = (math.sqrt(ne) + 0.12 + 0.11 / math.sqrt(ne)) * res["D"]
        q = 2 * sum((-1) ** (j - 1) * math.exp(-2 * j * j * lam * lam)
                    for j in range(1, 200))
        assert res["p"] == pytest.approx(q, rel=1e-9)

    def test_invariant_to_monotone_transform(self):
        a, b = np.exp(RNG.normal(size=7)), np.exp(RNG.normal(1, 1, 9))
        r1 = moretests.ks_two_sample(a, b)
        r2 = moretests.ks_two_sample(np.log(a), np.log(b))
        assert r1["D"] == r2["D"] and r1["p"] == r2["p"]


# ------------------------------------------------- Welch / Brown-Forsythe

class TestUnequalVarianceAnova:
    def test_welch_matches_pingouin_and_statsmodels(self):
        import pingouin as pg
        from statsmodels.stats.oneway import anova_oneway
        res = moretests.welch_anova(G4)
        ref = pg.welch_anova(_df(), dv="y", between="g").iloc[0]
        assert res["W"] == pytest.approx(ref["F"], rel=1e-10)
        assert res["dfn"] == 3
        assert res["dfd"] == pytest.approx(ref["ddof2"], rel=1e-10)
        assert res["p"] == pytest.approx(ref["p_unc"], rel=1e-8)
        sm = anova_oneway(G4, use_var="unequal")
        assert res["W"] == pytest.approx(sm.statistic, rel=1e-10)

    def test_equal_n_brown_forsythe_equals_ordinary_f(self):
        # The guide says W equals the ordinary F with equal sample sizes.
        # With equal n that identity holds for Brown-Forsythe's F* (for
        # any SDs); Welch's W (as computed by pingouin, statsmodels and
        # Welch 1951) is the F-like numerator divided by
        # 1 + 2(k-2)/(k^2-1) Lambda, so W < F even with equal SDs.
        groups = [RNG.normal(3, 1, 6), RNG.normal(5, 2, 6),
                  RNG.normal(4, 0.5, 6)]
        f = anova.one_way_anova(groups)["table"]["F"]
        assert moretests.brown_forsythe_anova(groups)["F"] == \
            pytest.approx(f, rel=1e-12)
        base = np.array([-1.0, 0.0, 1.0, 2.0, -2.0])
        eq = [base + 3, base + 5, base + 4]
        w = moretests.welch_anova(eq)
        lam = 3 * (1 - 1 / 3) ** 2 / 4
        assert w["W"] * (1 + 2 * (3 - 2) / 8 * lam) == pytest.approx(
            anova.one_way_anova(eq)["table"]["F"], rel=1e-12)

    def test_brown_forsythe_means_test(self):
        from statsmodels.stats.oneway import anova_oneway
        res = moretests.brown_forsythe_anova(G4)
        sm = anova_oneway(G4, use_var="bf")
        assert res["F"] == pytest.approx(sm.statistic, rel=1e-10)
        assert res["dfd"] == pytest.approx(sm.df[1], rel=1e-10)
        # the guide: numerator df is k - 1, as in ordinary ANOVA
        assert res["dfn"] == 3
        assert res["p"] == pytest.approx(
            sps.f.sf(res["F"], 3, res["dfd"]), rel=1e-12)

    def test_games_howell_matches_pingouin(self):
        import pingouin as pg
        res = moretests.unequal_variance_comparisons(G4, "games_howell",
                                                     names=NAMES)
        ref = pg.pairwise_gameshowell(_df(), dv="y", between="g")
        for c, (_, row) in zip(res["comparisons"], ref.iterrows()):
            assert c["pair"] == f"{row['A']} vs. {row['B']}"
            assert c["difference"] == pytest.approx(row["diff"], rel=1e-10)
            assert c["df"] == pytest.approx(row["df"], rel=1e-10)
            assert c["p_adjusted"] == pytest.approx(row["pval"], rel=1e-6,
                                                    abs=1e-12)
            assert c["t"] == pytest.approx(abs(row["T"]), rel=1e-10)

    def test_three_tests_share_t_and_df(self):
        out = {m: moretests.unequal_variance_comparisons(G4, m)
               for m in ("games_howell", "dunnett_t3", "tamhane_t2")}
        for a, b, c in zip(*(out[m]["comparisons"] for m in out)):
            assert a["t"] == b["t"] == c["t"]
            assert a["df"] == b["df"] == c["df"]
            # T3 (studentized maximum modulus) is never more conservative
            # than the Sidak-based T2 (Sidak's inequality)
            assert b["p_adjusted"] <= c["p_adjusted"] + 1e-12
            assert b["ci"][1] - b["ci"][0] <= c["ci"][1] - c["ci"][0] + 1e-9

    def test_tamhane_t2_is_sidak_on_welch_t(self):
        res = moretests.unequal_variance_comparisons(G4, "tamhane_t2",
                                                     names=NAMES)
        raw = moretests.unequal_variance_comparisons(G4, "welch_uncorrected",
                                                     names=NAMES)
        for c, r in zip(res["comparisons"], raw["comparisons"]):
            t = sps.ttest_ind(*(G4[NAMES.index(s)] for s in
                                r["pair"].split(" vs. ")), equal_var=False)
            assert r["p_adjusted"] == pytest.approx(t.pvalue, rel=1e-10)
            assert c["p_adjusted"] == pytest.approx(
                1 - (1 - r["p_adjusted"]) ** 6, rel=1e-10)

    def test_t3_versus_control_uses_k_minus_1_moduli(self):
        res = moretests.unequal_variance_comparisons(
            G4, "dunnett_t3", family="control", control_index=0)
        assert res["n_comparisons"] == 3
        c = res["comparisons"][0]
        assert c["p_adjusted"] == pytest.approx(
            exactdist.smm_sf(c["t"], 3, c["df"]), rel=1e-12)

    def test_games_howell_needs_all_pairs(self):
        with pytest.raises(ValueError):
            moretests.unequal_variance_comparisons(G4, "games_howell",
                                                   family="control")

    def test_dispatch_through_anova_and_api(self):
        direct = moretests.unequal_variance_comparisons(G4, "dunnett_t3")
        via = anova.multiple_comparisons(G4, "dunnett_t3")
        assert via == direct
        data = {"x": [], "datasets": [{"name": n, "ys": [[v] for v in g]}
                                      for n, g in zip(NAMES, G4)]}
        res = analyze({"analysis": "anova_unequal_var", "data": data,
                       "options": {"comparisons": "games_howell"}})
        assert res["welch"]["W"] == pytest.approx(
            moretests.welch_anova(G4)["W"])
        assert len(res["multiple_comparisons"]["comparisons"]) == 6
        res = analyze({"analysis": "anova", "data": data,
                       "options": {"comparisons": "dunnett_t3",
                                   "family": "control"}})
        assert res["multiple_comparisons"]["n_comparisons"] == 3


class TestStudentizedMaximumModulus:
    def test_one_modulus_is_two_sided_t(self):
        assert exactdist.smm_sf(2.0, 1, 10) == pytest.approx(
            2 * sps.t.sf(2.0, 10), rel=1e-9)
        assert exactdist.smm_ppf(0.95, 1, 7.3) == pytest.approx(
            sps.t.ppf(0.975, 7.3), rel=1e-9)

    def test_infinite_df_limit(self):
        c = exactdist.smm_ppf(0.95, 2, math.inf)
        assert c == pytest.approx(sps.norm.ppf((1 + 0.95 ** 0.5) / 2))
        assert exactdist.smm_cdf(2.3, 3, 1e6) == pytest.approx(
            exactdist.smm_cdf(2.3, 3, math.inf), abs=1e-5)

    def test_table_value_and_monte_carlo(self):
        # Stoline & Ury (1979) table: m = 3, df = 10, alpha = 0.05: 2.83
        assert exactdist.smm_ppf(0.95, 3, 10) == pytest.approx(2.83,
                                                               abs=0.005)
        rng = np.random.default_rng(7)
        z = np.abs(rng.normal(size=(200000, 4))).max(axis=1)
        s = np.sqrt(rng.chisquare(6, 200000) / 6)
        frac = float(np.mean(z / s <= 3.0))
        assert exactdist.smm_cdf(3.0, 4, 6) == pytest.approx(frac, abs=3e-3)


# --------------------------------------------- equal-SD comparisons added

class TestFisherLsdAndNewmanKeuls:
    G = [[4.1, 5.0, 4.6, 5.3], [6.2, 5.8, 6.9, 6.0, 6.4],
         [5.1, 4.8, 5.6, 5.0], [7.9, 8.4, 7.2, 8.0]]

    def _pooled(self):
        groups = [np.array(g) for g in self.G]
        df = sum(g.size for g in groups) - len(groups)
        ms = sum(((g - g.mean()) ** 2).sum() for g in groups) / df
        return groups, ms, df

    def test_fisher_lsd_is_unprotected_pooled_t(self):
        groups, ms, df = self._pooled()
        res = anova.multiple_comparisons(self.G, "fisher_lsd")
        for c, (i, j) in zip(res["comparisons"], combinations(range(4), 2)):
            se = math.sqrt(ms * (1 / groups[i].size + 1 / groups[j].size))
            t = abs(groups[i].mean() - groups[j].mean()) / se
            assert c["statistic"] == pytest.approx(t)
            assert c["p_adjusted"] == pytest.approx(2 * sps.t.sf(t, df))
            half = sps.t.ppf(0.975, df) * se
            assert c["ci"][1] - c["ci"][0] == pytest.approx(2 * half)

    def test_newman_keuls_two_groups_equals_tukey(self):
        g = self.G[:2]
        snk = anova.multiple_comparisons(g, "newman_keuls")["comparisons"][0]
        tk = anova.multiple_comparisons(g, "tukey")["comparisons"][0]
        assert snk["statistic"] == pytest.approx(tk["statistic"])
        assert snk["significant"] == (tk["p_adjusted"] < 0.05)
        assert snk["ci"] is None and snk["p_adjusted"] is None

    def test_newman_keuls_step_down(self):
        groups, ms, df = self._pooled()
        res = anova.multiple_comparisons(self.G, "newman_keuls")
        tukey = anova.multiple_comparisons(self.G, "tukey")
        means = [g.mean() for g in groups]
        order = sorted(range(4), key=lambda i: means[i])
        for c, t, (i, j) in zip(res["comparisons"], tukey["comparisons"],
                                combinations(range(4), 2)):
            span = abs(order.index(i) - order.index(j)) + 1
            assert c["steps"] == span
            assert c["q_critical"] == pytest.approx(
                sps.studentized_range.ppf(0.95, span, df))
            assert c["statistic"] == pytest.approx(t["statistic"])
            # SNK is at least as powerful as Tukey
            if t["p_adjusted"] < 0.05:
                assert c["significant"]
        # the closest pair of means here is A vs C (spanning 2 means)
        ac = res["comparisons"][1]
        assert ac["pair"] == "Group 0 vs. Group 2" and not ac["significant"]

    def test_newman_keuls_from_summary_path(self):
        groups, ms, df = self._pooled()
        res = anova._comparisons_from_stats(
            [g.mean() for g in groups], [g.size for g in groups], ms, df,
            "newman_keuls")
        assert res == anova.multiple_comparisons(self.G, "newman_keuls")


# ------------------------------------------------------------- median test

class TestMedianTest:
    def test_against_scipy(self):
        g = [[1, 3, 5, 7, 9, 11], [2, 4, 6, 8, 20, 22, 24], [10, 12, 14, 30]]
        res = moretests.median_test(g)
        stat, p, med, tbl = sps.median_test(*g, correction=False)
        assert res["grand_median"] == med
        assert res["table"]["above"] == tbl[0].tolist()
        assert res["chi_square"]["chi2"] == pytest.approx(stat)
        assert res["chi_square"]["p"] == pytest.approx(p)

    def test_two_groups_adds_fisher(self):
        res = moretests.median_test([[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]])
        assert res["fisher_exact"]["p"] == pytest.approx(
            sps.fisher_exact([[0, 5], [5, 0]])[1])
        assert "chi_square_yates" in res


# --------------------------------------------------- exact nonparametric P

class TestMannWhitneyExactRule:
    def test_no_ties_exact_up_to_100(self):
        a, b = RNG.normal(size=40), RNG.normal(0.4, 1, 60)
        res = ttests.mann_whitney(a, b)
        assert res["p_method"] == "exact"
        assert res["p_two_tailed"] == pytest.approx(
            sps.mannwhitneyu(a, b, method="exact").pvalue, rel=1e-9)

    def test_ties_exact_shuffle_distribution(self):
        a, b = [1, 2, 2, 3, 5, 5], [2, 3, 4, 5, 6, 6, 7]
        res = ttests.mann_whitney(a, b)
        assert res["p_method"] == "exact"
        assert res["p_two_tailed"] == pytest.approx(_brute_rank_sum_p(a, b),
                                                    abs=1e-12)

    def test_ties_moderate_samples(self):
        a = np.round(RNG.normal(size=30), 1)
        b = np.round(RNG.normal(0.3, 1, 35), 1)
        res = ttests.mann_whitney(a, b)
        assert res["p_method"] == "exact"
        # close to (but not equal to) the tie-corrected normal approximation
        approx = sps.mannwhitneyu(a, b, method="asymptotic").pvalue
        assert res["p_two_tailed"] == pytest.approx(approx, abs=0.02)

    def test_large_samples_use_the_approximation(self):
        a, b = RNG.normal(size=101), RNG.normal(size=120)
        res = ttests.mann_whitney(a, b)
        assert res["p_method"] == "approximate"
        assert res["p_two_tailed"] == pytest.approx(
            sps.mannwhitneyu(a, b, method="asymptotic").pvalue)

    def test_u_and_hodges_lehmann_ci(self):
        a, b = [1.2, 3.4, 2.2, 5.1, 4.4, 3.3, 2.9], [3.1, 4.5, 6.2, 5.5,
                                                     4.9, 7.1]
        res = ttests.mann_whitney(a, b)
        assert res["U_smaller"] == min(res["U"], 42 - res["U"])
        d = np.sort(np.subtract.outer(a, b).ravel())
        k = 7  # P(U <= 6) = 0.0175 <= 0.025 < P(U <= 7)
        assert res["ci_hodges_lehmann"] == [d[k - 1], d[d.size - k]]
        dist = exactdist.rank_sum_null(2 * np.arange(1, 14), 6)[::2]
        cdf_u = np.cumsum(dist[21:])
        assert res["ci_actual_level"] == pytest.approx(1 - 2 * cdf_u[k - 1])
        assert cdf_u[k - 1] <= 0.025 < cdf_u[k]


class TestWilcoxonExactRule:
    def test_no_ties_matches_scipy_exact(self):
        a, b = RNG.normal(size=60), RNG.normal(0.3, 1, 60)
        res = ttests.wilcoxon_matched_pairs(a, b)
        assert res["p_method"] == "exact"
        assert res["p_two_tailed"] == pytest.approx(
            sps.wilcoxon(a, b, method="exact").pvalue, rel=1e-9)

    def test_ties_and_zeros_wilcox_vs_pratt(self):
        a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        b = [1.5, 2.5, 2, 5, 5, 8, 9, 7.5, 9, 12]
        d = np.subtract(a, b)
        w = ttests.wilcoxon_matched_pairs(a, b)
        p = ttests.wilcoxon_matched_pairs(a, b, zero_method="pratt")
        assert w["n_zero_differences"] == 2
        assert w["p_two_tailed"] == pytest.approx(_brute_signed_rank_p(d),
                                                  abs=1e-12)
        assert p["p_two_tailed"] == pytest.approx(
            _brute_signed_rank_p(d, pratt=True), abs=1e-12)
        assert w["p_method"] == p["p_method"] == "exact"
        # Prism reports the two rank sums and W = their sum
        assert p["W"] == p["sum_positive_ranks"] + p["sum_negative_ranks"]

    def test_200_pairs_use_the_approximation(self):
        d = RNG.normal(0.1, 1, 200)
        res = ttests.wilcoxon_matched_pairs(d, np.zeros(200))
        assert res["p_method"] == "approximate"
        assert res["p_two_tailed"] == pytest.approx(
            sps.wilcoxon(d, method="asymptotic", correction=False).pvalue,
            rel=1e-9)

    def test_ci_of_median_difference(self):
        d = np.array([1.5, -0.4, 2.2, 3.1, 0.8, 1.9, -1.0, 2.7, 0.3])
        res = ttests.wilcoxon_matched_pairs(d, np.zeros(9))
        walsh = np.sort([(d[i] + d[j]) / 2 for i in range(9)
                         for j in range(i, 9)])
        # n = 9: P(T+ <= 5) = 0.0195 <= 0.025 < P(T+ <= 6) -> k = 6
        assert res["ci_median"] == [walsh[5], walsh[-6]]
        assert res["ci_actual_level"] == pytest.approx(1 - 2 * 10 / 512)

    def test_one_sample_signed_rank(self):
        vals = [3.1, 4.5, 2.2, 5.0, 3.0, 6.1, 4.4, 3.0, 2.8]
        res = columnstats.wilcoxon_signed_rank(vals, 3.0)
        d = np.array(vals) - 3.0
        assert res["n_zero_differences"] == 2
        assert res["p_two_tailed"] == pytest.approx(_brute_signed_rank_p(d),
                                                    abs=1e-12)
        pr = columnstats.wilcoxon_signed_rank(vals, 3.0, zero_method="pratt")
        assert pr["p_two_tailed"] == pytest.approx(
            _brute_signed_rank_p(d, pratt=True), abs=1e-12)


class TestFriedmanExact:
    def test_exact_with_ties_matches_enumeration(self):
        M = np.array([[0, -1, 0], [-2, 2, 1], [0, 1, 0], [-1, 1, 0]], float)
        obs = sps.friedmanchisquare(*M.T).statistic
        hits = tot = 0
        for combo in product(*[list(permutations(r)) for r in M]):
            q = sps.friedmanchisquare(*np.array(combo).T).statistic
            tot += 1
            hits += q >= obs - 1e-9
        res = repeated.friedman([M[:, j].tolist() for j in range(3)],
                                exact=True)
        assert res["p_method"] == "exact"
        assert res["p"] == pytest.approx(hits / tot, abs=1e-12)

    @pytest.mark.parametrize("n,k,exact", [(11, 3, True), (12, 3, False),
                                           (6, 4, True), (7, 4, False),
                                           (2, 7, True), (2, 8, False)])
    def test_guide_size_rule(self, n, k, exact):
        # exact unless (k!)^n > 10^9; the guide's example: 3 treatments
        # and 12 rows give 6^12 = 2.2e9 -> approximate
        assert exactdist.friedman_exact_feasible(n, k) is exact

    def test_default_keeps_chi_square(self):
        M = RNG.normal(size=(5, 3))
        cols = [M[:, j].tolist() for j in range(3)]
        assert "p_method" not in repeated.friedman(cols)
        assert repeated.friedman(cols)["p"] == pytest.approx(
            sps.friedmanchisquare(*M.T).pvalue)


# --------------------------------------------------------------- ratio t

class TestRatioTTests:
    def test_guide_km_example(self):
        # Treated / Control Km: geometric mean ratio 2.02 (1.88 to 2.16),
        # P = 0.0005; the ordinary paired t: CI -0.72 to 9.72, P = 0.07
        treated, control = [8.7, 4.9, 13.1], [4.2, 2.5, 6.5]
        r = ttests.ratio_paired_t(treated, control)
        assert r["geometric_mean_ratio"] == pytest.approx(2.02, abs=0.005)
        assert r["ci_ratio"][0] == pytest.approx(1.88, abs=0.005)
        assert r["ci_ratio"][1] == pytest.approx(2.16, abs=0.005)
        assert r["p_two_tailed"] == pytest.approx(0.0005, abs=0.00005)
        p = ttests.paired_t(treated, control)
        assert p["ci_difference"][0] == pytest.approx(-0.72, abs=0.005)
        assert p["ci_difference"][1] == pytest.approx(9.72, abs=0.005)
        assert p["p_two_tailed"] == pytest.approx(0.07, abs=0.005)

    def test_ratio_t_rejects_nonpositive(self):
        with pytest.raises(ValueError):
            ttests.ratio_paired_t([1, 2, 0], [1, 2, 3])

    def test_one_sample_ratio_t_is_t_on_logs(self):
        vals = [1.2, 1.5, 0.9, 2.0, 1.7]
        r = columnstats.one_sample_ratio_t(vals, 1.1)
        ref = sps.ttest_1samp(np.log10(vals), math.log10(1.1))
        assert r["p_two_tailed"] == pytest.approx(ref.pvalue)
        assert r["ratio"] == pytest.approx(sps.gmean(vals) / 1.1)
        assert r["geometric_sd_ratio"] == pytest.approx(
            10 ** np.log10(vals).std(ddof=1))

    def test_api_ratio_paired_and_ks_kinds(self):
        data = {"x": [], "datasets": [
            {"name": "Treated", "ys": [[8.7], [4.9], [13.1]]},
            {"name": "Control", "ys": [[4.2], [2.5], [6.5]]}]}
        res = analyze({"analysis": "ttest", "data": data,
                       "options": {"kind": "ratio_paired"}})
        assert res["test"] == "ratio_paired_t"
        assert res["names"] == ["Treated", "Control"]
        res = analyze({"analysis": "ttest", "data": data,
                       "options": {"kind": "kolmogorov_smirnov"}})
        assert res["test"] == "kolmogorov_smirnov"
        assert res["D"] == pytest.approx(2 / 3)


# ------------------------------------------------------ normality and stats

class TestKsNormality:
    def test_dallal_wilkinson_matches_statsmodels(self):
        from statsmodels.stats.diagnostic import lilliefors
        rng = np.random.default_rng(5)
        for n in (20, 60, 150):
            x = np.exp(rng.normal(0, 0.8, n))
            r = columnstats.ks_normality(x)
            d, p = lilliefors(x, pvalmethod="approx")
            assert r["KS"] == pytest.approx(d, rel=1e-12)
            if p <= 0.1:
                assert r["p"] == pytest.approx(p, rel=1e-10)

    def test_large_p_reported_as_greater_than_010(self):
        r = columnstats.ks_normality([1, 2, 3, 4, 5, 6, 7.5, 8, 9, 11])
        assert r["p"] is None and r["p_summary"] == "P>0.10"
        assert r["passed_alpha_05"] is True

    def test_opt_in_and_minimum_n(self):
        vals = RNG.normal(size=12).tolist()
        assert "kolmogorov_smirnov" not in columnstats.normality_tests(vals)
        sel = columnstats.normality_tests(vals, ["shapiro_wilk", "ks"])
        assert set(sel) == {"shapiro_wilk", "kolmogorov_smirnov"}
        assert columnstats.normality_tests([1, 2, 3, 4],
                                           ["ks"]) == {}
        with pytest.raises(ValueError):
            columnstats.ks_normality([1, 2, 3, 4])


class TestDescriptiveExtras:
    def test_percentile_rule(self):
        # R = P(n + 1)/100: 68 values, 25th percentile at rank 17.25
        vals = list(range(1, 69))
        assert columnstats.percentile(vals, 25) == pytest.approx(17.25)
        # 90th / 10th percentile of six values: largest / smallest value
        six = [3, 9, 1, 7, 5, 11]
        assert columnstats.percentile(six, 90) == 11
        assert columnstats.percentile(six, 10) == 1
        assert columnstats.percentile(six, 50) == np.median(six)
        assert columnstats.percentile(six, 25, method="linear") == \
            np.percentile(six, 25)

    def test_describe_percentile_option(self):
        vals = [1, 2, 4, 8, 16, 32, 64]
        d = columnstats.describe(vals, percentile_method="prism")
        assert d["percentile25"] == 2 and d["percentile75"] == 32
        assert columnstats.describe(vals)["percentile25"] == 3

    def test_median_ci_guide_example(self):
        # n = 6: the guide reports 96.88% confidence, limits = extremes
        r = columnstats.median_ci([23, 31, 35, 40, 47, 54])
        assert r["actual_level"] == pytest.approx(0.96875)
        assert r["ci"] == [23, 54]
        assert columnstats.median_ci([1, 2, 3, 4, 5])["ci"] is None

    def test_median_ci_binomial_ranks(self):
        vals = RNG.normal(size=25)
        r = columnstats.median_ci(vals)
        k = r["rank_lower"]
        assert 1 - 2 * sps.binom.cdf(k - 1, 25, 0.5) >= 0.95
        assert 1 - 2 * sps.binom.cdf(k, 25, 0.5) < 0.95
        s = np.sort(vals)
        assert r["ci"] == [s[k - 1], s[25 - k]]

    def test_geometric_sd_factor_guide_example(self):
        vals = [12.6, 501.2, 7.9, 9.7, 83.1, 19.0, 190.5, 245.5]
        e = columnstats.descriptive_extras(vals)
        # the guide prints 49.55 and 5.15 (data shown to 1 decimal)
        assert e["geometric_mean"] == pytest.approx(49.55, rel=0.005)
        assert e["geometric_sd_factor"] == pytest.approx(5.15, abs=0.005)

    def test_harmonic_quadratic_mode_trimmed(self):
        vals = [2.0, 4.0, 4.0, 5.0, 10.0]
        e = columnstats.descriptive_extras(vals, trim_k=1)
        assert e["harmonic_mean"] == pytest.approx(sps.hmean(vals))
        assert e["quadratic_mean"] == pytest.approx(
            math.sqrt(np.mean(np.square(vals))))
        lo, hi = e["ci_harmonic_mean"]
        assert lo < e["harmonic_mean"] < hi
        assert e["mode"] == 4.0 and e["mode_count"] == 2
        assert e["trimmed_mean"] == pytest.approx(13 / 3)
        assert e["winsorized_mean"] == pytest.approx((4 + 4 + 4 + 5 + 5) / 5)
        assert columnstats.descriptive_extras([1, 2, 3])["mode"] is None

    def test_column_statistics_options_via_api(self):
        data = {"x": [], "datasets": [
            {"name": "A", "ys": [[v] for v in (1, 2, 3, 4, 5, 6, 7.5, 9)]}]}
        res = analyze({"analysis": "column_statistics", "data": data,
                       "options": {"hypothetical": 3, "ratio_t": True,
                                   "extras": True,
                                   "normality_tests": ["ks", "shapiro_wilk"],
                                   "zero_method": "pratt"}})
        ds = res["datasets"][0]
        assert set(ds["normality"]) == {"kolmogorov_smirnov", "shapiro_wilk"}
        assert ds["wilcoxon"]["zero_method"] == "pratt"
        assert "one_sample_ratio_t" in ds and "extras" in ds
        plain = analyze({"analysis": "column_statistics", "data": data,
                         "options": {"hypothetical": 3}})["datasets"][0]
        assert "one_sample_ratio_t" not in plain and "extras" not in plain


class TestApiNonparametricOptions:
    DATA = {"x": [], "datasets": [
        {"name": "A", "ys": [[10.0], [11], [9], [12]]},
        {"name": "B", "ys": [[13.0], [14], [12], [15]]},
        {"name": "C", "ys": [[16.0], [17], [15], [18]]}]}

    def test_friedman_exact_option(self):
        res = analyze({"analysis": "rm_anova", "data": self.DATA,
                       "options": {"kind": "nonparametric", "exact": True}})
        # every subject ranks A < B < C, the largest possible statistic:
        # reached only when all 4 rows share one of the 6 orderings,
        # so P = 6 / 6^4
        assert res["p_method"] == "exact"
        assert res["p"] == pytest.approx(6 / 6 ** 4)

    def test_dunn_uncorrected(self):
        cor = analyze({"analysis": "anova", "data": self.DATA,
                       "options": {"kind": "nonparametric"}})
        unc = analyze({"analysis": "anova", "data": self.DATA,
                       "options": {"kind": "nonparametric",
                                   "dunn_corrected": False}})
        for c, u in zip(cor["dunns"]["comparisons"],
                        unc["dunns"]["comparisons"]):
            assert c["p_adjusted"] == pytest.approx(
                min(3 * u["p_adjusted"], 1.0))

    def test_ks_and_median_handlers(self):
        res = analyze({"analysis": "ks_test", "data": self.DATA,
                       "options": {"dataset_a": 0, "dataset_b": 2}})
        assert res["D"] == 1.0 and res["p_method"] == "exact"
        assert res["p"] == pytest.approx(2 / math.comb(8, 4))
        res = analyze({"analysis": "median_test", "data": self.DATA})
        assert res["chi_square"]["df"] == 2

    def test_dunn_tie_correction_matches_guide_formula(self):
        g = [[1, 2, 2, 3, 3], [3, 4, 4, 5], [5, 5, 6, 7, 7, 8]]
        res = anova.kruskal_wallis(g)
        allv = np.concatenate([np.array(x, float) for x in g])
        n = allv.size
        r = sps.rankdata(allv)
        _, t = np.unique(allv, return_counts=True)
        mr = [r[:5].mean(), r[5:9].mean(), r[9:].mean()]
        se = math.sqrt((n * (n + 1) - (t ** 3 - t).sum() / (n - 1)) / 12
                       * (1 / 5 + 1 / 4))
        z = abs(mr[0] - mr[1]) / se
        assert res["dunns"]["comparisons"][0]["statistic"] == pytest.approx(z)
        assert res["dunns"]["comparisons"][0]["p_adjusted"] == \
            pytest.approx(min(1.0, 3 * 2 * sps.norm.sf(z)))
