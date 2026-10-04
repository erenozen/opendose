"""Power and sample size (opendose.power), randomisation lists and the
sample-size justification sentence.

References (worked examples reproduced to the digits published):
- G*Power 3.1 manual (Faul, Erdfelder, Buchner & Lang; version of June
  1, 2023):
  ch. 3 correlation vs rho0 = 0.60, rho = 0.65, alpha = beta = 0.05,
  two-sided: exact N = 1928 (critical r 0.570748, 0.627920; actual power
  0.950028), Fisher z approximation N = 1929; post hoc rho0 = 0.8,
  rho = 0.3, N = 8: exact 0.482927, approximation 0.422599.
  ch. 4 one proportion, pi0 = 0.65, g = 0.15, N = 20, one-sided: critical
  17, power 0.411449, actual alpha 0.044376.
  ch. 5 McNemar (O'Brien 2002): OR 0.25, p_D 0.4, N = 50, one-sided exact
  power 0.839343 (actual alpha 0.032578); two-sided with alpha option 2,
  N = 50, 75, 100, 125, 150: 0.798241, 0.930639, 0.980441, 0.994839,
  0.998658.
  ch. 10 one-way ANOVA, f = 0.25, 10 groups, power 0.95: N = 390,
  lambda 24.375, critical F 1.904538, actual power 0.952363.
  ch. 11 SPSS example: f = 0.7066856, df 2, 36 groups, N 108: lambda
  53.935690, critical F 3.123907; f = 0.2450722, df 4: power 0.475635;
  f = 0.3288016, df 12: power 0.513442; a priori f = 0.1, df 8, 30
  groups: N = 2283 (actual 0.950078), N = 2310 gives 0.952674; linear
  trend contrast f = 0.475164, N = 20, 4 groups: power 0.514736.
  ch. 16 point biserial, rho = 0.25, one-sided, power 0.95: N = 164
  (critical t 1.654314, actual 0.950308).
  ch. 19 matched pairs, d_z = 0.421637, N = 50: power 0.832114
  (delta 2.981424, critical t 2.009575); d_z = 0.2828427: 0.500352.
  ch. 20 one sample d = 0.625, one-sided, power 0.95: N = 30 (actual
  0.955144); d = 0.1, alpha 0.01, power 0.90: N = 1492 (0.900169).
  ch. 25 generic t, delta = -1.25, df = 24: power 0.224525.
- Faul et al. (2007) Behav Res Methods 39:175: two groups, d = 0.5,
  one-sided alpha 0.05, power 0.95: N = 176 (88 per group, actual
  0.9512).
- Lakens (2013) Front Psychol 4:863: d_s = 1.13, two-sided, power 0.95:
  44 participants; d_z = 1.50: 8 participants.
- R documentation examples: power.t.test(n = 20, delta = 1) power
  0.8689528; power.t.test(power = .90, delta = 1) n = 22.02110 (one-sided
  17.84713); power.prop.test(n = 50, p1 = .5, p2 = .75) power 0.7401659.
  R reports one rejection region only, which differs here by < 1e-6.
- statsmodels 0.14 TTestIndPower, NormalIndPower, FTestAnovaPower,
  GofChisquarePower.
- Schoenfeld (1983) and Freedman (1982) events for HR 0.5, two-sided
  alpha 0.05, power 0.80: 65.3 (66) and 70.6 (71).
"""

import math
from itertools import product

import numpy as np
import pytest
import statsmodels.stats.power as smp
from scipy import integrate, stats as sps
from statsmodels.stats.proportion import proportion_effectsize

from opendose import power as P
from opendose.api import analyze


class TestGPowerManual:
    def test_correlation_exact_and_fisher_z(self):
        r = P.correlation("n", rho=0.65, rho0=0.60, power=0.95)
        assert r["n"] == 1928
        assert r["power"] == pytest.approx(0.950028, abs=1e-6)
        assert r["critical_r"] == pytest.approx([0.570748, 0.627920],
                                                abs=1e-6)
        assert P.correlation("n", rho=0.65, rho0=0.60, power=0.95,
                             method="fisher_z")["n"] == 1929
        assert P.correlation("power", rho=0.3, rho0=0.8, n=8)["power"] == \
            pytest.approx(0.482927, abs=1e-6)
        assert P.correlation("power", rho=0.3, rho0=0.8, n=8,
                             method="fisher_z")["power"] == \
            pytest.approx(0.422599, abs=1e-6)

    def test_exact_r_density_integrates_to_one(self):
        val, _ = integrate.quad(
            lambda r: math.exp(P._r_logpdf(r, 0.4, 12)), -1, 1)
        assert val == pytest.approx(1.0, abs=1e-9)
        # rho = 0: r sqrt(n-2)/sqrt(1-r^2) is t with n - 2 df
        x = 0.3
        t = x * math.sqrt(10) / math.sqrt(1 - x * x)
        assert P.r_cdf(x, 0.0, 12) == pytest.approx(sps.t.cdf(t, 10),
                                                    abs=1e-9)

    def test_one_proportion(self):
        r = P.one_proportion("power", p0=0.65, p=0.80, n=20, tails=1)
        assert r["upper_critical"] == 17
        assert r["power"] == pytest.approx(0.411449, abs=1e-6)
        assert r["actual_alpha"] == pytest.approx(0.044376, abs=1e-6)

    def test_mcnemar_obrien(self):
        r = P.mcnemar("power", odds_ratio=0.25, p_discordant=0.4, n=50,
                      tails=1)
        # G*Power truncates the outer sum ("until the values are small
        # enough to be ignored"); the full sum is 1.4e-5 higher.
        assert r["power"] == pytest.approx(0.839343, abs=2e-5)
        assert r["actual_alpha"] == pytest.approx(0.032578, abs=2e-6)
        expected = [0.798241, 0.930639, 0.980441, 0.994839, 0.998658]
        for n, e in zip((50, 75, 100, 125, 150), expected):
            assert P.mcnemar("power", p12=0.08, p21=0.32, n=n,
                             balance="minor_tail")["power"] == \
                pytest.approx(e, abs=1e-6)

    def test_anova_one_way(self):
        r = P.anova_oneway("n", f=0.25, k=10, power=0.95)
        assert r["n_total"] == 390 and r["n_per_group"][0] == 39
        assert r["ncp"] == pytest.approx(24.375)
        assert r["critical_f"] == pytest.approx(1.904538, abs=1e-6)
        assert r["power"] == pytest.approx(0.952363, abs=1e-6)

    def test_f_tests_chapter_11(self):
        r = P.f_test("power", f=0.7066856, df1=2, groups=36, n_total=108)
        assert r["ncp"] == pytest.approx(53.935690, abs=1e-5)
        assert r["critical_f"] == pytest.approx(3.123907, abs=1e-6)
        assert round(r["power"], 5) == 1.0
        assert P.f_test("power", f=0.2450722, df1=4, groups=36,
                        n_total=108)["power"] == pytest.approx(0.475635,
                                                               abs=1e-6)
        assert P.f_test("power", f=0.3288016, df1=12, groups=36,
                        n_total=108)["power"] == pytest.approx(0.513442,
                                                               abs=1e-6)
        r = P.f_test("n", f=0.1, df1=8, groups=30, power=0.95)
        assert r["n_total"] == 2283
        assert r["power"] == pytest.approx(0.950078, abs=1e-6)
        assert r["critical_f"] == pytest.approx(1.942507, abs=1e-6)
        assert P.f_test("power", f=0.1, df1=8, groups=30,
                        n_total=2310)["power"] == pytest.approx(0.952674,
                                                                abs=1e-6)
        assert P.f_test("power", f=0.475164, df1=1, groups=4,
                        n_total=20)["power"] == pytest.approx(0.514736,
                                                              abs=1e-6)

    def test_point_biserial(self):
        r = P.correlation("n", rho=0.25, tails=1, power=0.95, method="t")
        assert r["n"] == 164
        assert r["power"] == pytest.approx(0.950308, abs=1e-6)

    def test_matched_pairs(self):
        r = P.t_test_one("power", d=0.421637, n=50, design="paired")
        assert r["power"] == pytest.approx(0.832114, abs=1e-6)
        assert r["ncp"] == pytest.approx(2.981424, abs=1e-6)
        assert r["critical_t"] == pytest.approx(2.009575, abs=1e-6)
        assert P.t_test_one("power", d=0.2828427, n=50,
                            design="paired")["power"] == \
            pytest.approx(0.500352, abs=1e-6)
        # d_z from the group parameters (sec. 19.1): 0.4 / sqrt(2 - 1.1)
        r = P.t_test_one("power", delta=0.4, sd_a=1, sd_b=1, r=0.55, n=50,
                         design="paired")
        assert r["effect"]["value"] == pytest.approx(0.421637, abs=1e-6)

    def test_one_sample(self):
        r = P.t_test_one("n", d=0.625, power=0.95, tails=1)
        assert r["n"] == 30
        assert r["power"] == pytest.approx(0.955144, abs=1e-6)
        assert r["ncp"] == pytest.approx(3.423266, abs=1e-6)
        r = P.t_test_one("n", d=0.1, power=0.90, alpha=0.01)
        assert r["n"] == 1492
        assert r["power"] == pytest.approx(0.900169, abs=1e-6)

    def test_generic_t(self):
        r = P.generic(distribution="t", ncp=-1.25, df=24)
        assert r["power"] == pytest.approx(0.224525, abs=2e-6)


class TestPublishedExamples:
    def test_faul_2007(self):
        r = P.t_test_two("n", d=0.5, power=0.95, tails=1)
        assert r["n_per_group"] == [88, 88] and r["n_total"] == 176
        assert round(r["power"], 4) == 0.9514
        assert r["critical_t"] == pytest.approx(1.6536, abs=1e-4)

    def test_lakens_2013(self):
        assert P.t_test_two("n", d=1.13, power=0.95)["n_total"] == 44
        assert P.t_test_one("n", d=1.50, power=0.95,
                            design="paired")["n"] == 8

    def test_r_power_t_test(self):
        assert P.t_test_two("power", d=1, n1=20)["power"] == \
            pytest.approx(0.8689528, abs=1e-6)
        assert P.t_test_two("n", d=1, power=0.9)["n1_exact"] == \
            pytest.approx(22.02110, abs=1e-4)
        assert P.t_test_two("n", d=1, power=0.9, tails=1)["n1_exact"] == \
            pytest.approx(17.84713, abs=1e-4)

    def test_r_power_prop_test(self):
        r = P.two_proportions("power", p1=0.5, p2=0.75, n1=50)
        assert r["power"] == pytest.approx(0.7401659, abs=1e-7)


class TestStatsmodels:
    def test_t_unequal_allocation(self):
        ref = smp.TTestIndPower().solve_power(effect_size=0.5, alpha=0.05,
                                              power=0.8, ratio=2)
        r = P.t_test_two("n", d=0.5, power=0.8, ratio=2)
        assert r["n1_exact"] == pytest.approx(ref, rel=1e-6)
        assert r["n_per_group"] == [48, 96]

    def test_arcsine(self):
        h = proportion_effectsize(0.75, 0.5)
        ref = smp.NormalIndPower().solve_power(effect_size=h, alpha=0.05,
                                               power=0.9)
        r = P.two_proportions("n", p1=0.5, p2=0.75, power=0.9,
                              method="arcsine")
        assert r["n1_exact"] == pytest.approx(ref, rel=1e-6)
        ref_p = smp.NormalIndPower().power(effect_size=h, nobs1=40,
                                           alpha=0.05, ratio=1.5)
        assert P.two_proportions("power", p1=0.5, p2=0.75, n1=40, n2=60,
                                 method="arcsine")["power"] == \
            pytest.approx(ref_p, rel=1e-9)

    def test_anova(self):
        ref = smp.FTestAnovaPower().solve_power(effect_size=0.25, alpha=0.05,
                                                power=0.8, k_groups=4)
        r = P.anova_oneway("n", f=0.25, k=4, power=0.8, equal_n=False)
        assert r["n_total_exact"] == pytest.approx(ref, rel=1e-6)

    def test_chi_square(self):
        ref = smp.GofChisquarePower().solve_power(effect_size=0.3,
                                                  alpha=0.05, power=0.8,
                                                  n_bins=2)
        r = P.chi_square("n", w=0.3, df=1, power=0.8)
        assert r["n_exact"] == pytest.approx(ref, rel=1e-6)
        assert r["n"] == 88
        assert P.chi_square("power", w=0.3, df=4, n=100)["power"] == \
            pytest.approx(smp.GofChisquarePower().power(
                effect_size=0.3, nobs=100, alpha=0.05, n_bins=5), rel=1e-9)


class TestProportionsExact:
    def test_fisher_power_brute_force(self):
        n1, n2, p1, p2 = 7, 8, 0.2, 0.75
        total = 0.0
        for x1, x2 in product(range(n1 + 1), range(n2 + 1)):
            p = sps.fisher_exact([[x1, n1 - x1], [x2, n2 - x2]]).pvalue
            if p <= 0.05:
                total += (sps.binom.pmf(x1, n1, p1)
                          * sps.binom.pmf(x2, n2, p2))
        r = P.two_proportions("power", p1=p1, p2=p2, n1=n1, n2=n2,
                              method="fisher_exact")
        assert r["power"] == pytest.approx(total, abs=1e-12)

    def test_fisher_a_priori_is_smallest(self):
        r = P.two_proportions("n", p1=0.2, p2=0.7, power=0.8,
                              method="fisher_exact")
        n = r["n1"]
        assert r["power"] >= 0.8
        below = [P.two_proportions("power", p1=0.2, p2=0.7, n1=k,
                                   method="fisher_exact")["power"]
                 for k in range(2, n)]
        assert max(below) < 0.8

    def test_continuity_correction(self):
        # Fleiss, Tytun & Ury (1980): n' = n/4 (1 + sqrt(1 + 4/(n D)))^2
        n = P.two_proportions("n", p1=0.5, p2=0.75, power=0.9)["n1_exact"]
        r = P.two_proportions("n", p1=0.5, p2=0.75, power=0.9,
                              method="z_cc")
        assert r["n1_exact"] == pytest.approx(
            n / 4 * (1 + math.sqrt(1 + 4 / (n * 0.25))) ** 2, rel=1e-8)

    def test_mcnemar_exact_brute_force(self):
        n, p12, p21 = 12, 0.1, 0.3
        p11 = p22 = 0.3
        total = 0.0
        for a12 in range(n + 1):
            for a21 in range(n + 1 - a12):
                rest = n - a12 - a21
                prob = (math.factorial(n) / (math.factorial(a12)
                        * math.factorial(a21) * math.factorial(rest))
                        * p12 ** a12 * p21 ** a21 * (p11 + p22) ** rest)
                m = a12 + a21
                if m == 0:
                    continue
                cdf = sps.binom.cdf(np.arange(m + 1), m, 0.5)
                cl = max([c for c in range(m + 1) if cdf[c] <= 0.025],
                         default=None)
                sf = sps.binom.sf(np.arange(m + 1) - 1, m, 0.5)
                cu = min([c for c in range(m + 1) if sf[c] <= 0.025],
                         default=None)
                if (cl is not None and a12 <= cl) or \
                        (cu is not None and a12 >= cu):
                    total += prob
        r = P.mcnemar("power", p12=p12, p21=p21, n=n)
        assert r["power"] == pytest.approx(total, abs=1e-12)


class TestSurvival:
    def test_events(self):
        s = P.logrank("n", hr=0.5, power=0.8)
        assert s["events_exact"] == pytest.approx(65.35, abs=0.01)
        assert s["events"] == 66
        f = P.logrank("n", hr=0.5, power=0.8, method="freedman")
        assert f["events_exact"] == pytest.approx(70.64, abs=0.01)
        assert f["events"] == 71

    def test_event_probability(self):
        lam, a, fu = 0.05, 24.0, 12.0
        num, _ = integrate.quad(lambda u: 1 - math.exp(-lam * (a + fu - u)),
                                0, a)
        assert P.event_probability(lam, a, fu) == pytest.approx(num / a)
        assert P.event_probability(lam, a, fu, "simpson") == \
            pytest.approx(num / a, abs=1e-3)

    def test_subjects_and_round_trip(self):
        r = P.logrank("n", hr=0.7, power=0.8, median_control=12,
                      accrual=24, followup=12)
        assert r["n_total"] == math.ceil(r["n_exact"] / 2) * 2
        back = P.logrank("power", hr=0.7, n=r["n_total"], median_control=12,
                         accrual=24, followup=12)
        assert back["power"] >= 0.8
        sens = P.logrank("effect", events=r["events_exact"], power=0.8)
        assert sens["effect"]["value"] == pytest.approx(0.7, abs=1e-8)

    def test_unequal_allocation(self):
        # Schoenfeld with p1 p2 = 2/9 for 2:1 allocation
        r = P.logrank("n", hr=0.6, power=0.9, ratio=2)
        z = sps.norm.isf(0.025) + sps.norm.ppf(0.9)
        assert r["events_exact"] == pytest.approx(
            z ** 2 / (2 / 9 * math.log(0.6) ** 2))


class TestSensitivity:
    @pytest.mark.parametrize("fn,kw,key", [
        (P.t_test_two, {"n1": 20}, "d"),
        (P.t_test_one, {"n": 15}, "d"),
        (P.anova_oneway, {"n": 10, "k": 4}, "f"),
        (P.chi_square, {"n": 120, "df": 2}, "w"),
        (P.correlation, {"n": 40, "method": "fisher_z"}, "rho"),
    ])
    def test_round_trip(self, fn, kw, key):
        r = fn("effect", power=0.8, **kw)
        e = r["effect"]["value"]
        back = fn("power", **{key: e}, **kw)
        assert back["power"] == pytest.approx(0.8, abs=1e-7)

    def test_two_proportions_detectable_p2(self):
        r = P.two_proportions("effect", p1=0.3, n1=80, power=0.8)
        assert r["effect"]["value"] > 0.3
        assert r["power"] == pytest.approx(0.8, abs=1e-8)

    def test_welch(self):
        r = P.t_test_two("power", delta=1.0, sd1=1.0, sd2=2.0, n1=20, n2=30,
                         welch=True)
        se = math.sqrt(1 / 20 + 4 / 30)
        df = (1 / 20 + 4 / 30) ** 2 / ((1 / 20) ** 2 / 19 + (4 / 30) ** 2 / 29)
        tc = sps.t.isf(0.025, df)
        ref = sps.nct.sf(tc, df, 1 / se) + sps.nct.cdf(-tc, df, 1 / se)
        assert r["power"] == pytest.approx(ref)


class TestRandomization:
    def test_blocks_balanced_and_reproducible(self):
        r = P.randomization_list(24, ["Vehicle", "Drug"], block_sizes=[4, 6],
                                 seed=42)
        assert r["counts"] == {"Vehicle": 12, "Drug": 12}
        again = P.randomization_list(24, ["Vehicle", "Drug"],
                                     block_sizes=[4, 6], seed=42)
        assert again["list"] == r["list"]
        for b in set(x["block"] for x in r["list"]):
            grp = [x["group"] for x in r["list"] if x["block"] == b]
            if len(grp) in (4, 6):
                assert grp.count("Vehicle") == grp.count("Drug")

    def test_ratio_and_stratified(self):
        r = P.randomization_list(groups=["A", "B", "C"], ratio=[2, 1, 1],
                                 method="stratified",
                                 strata=[{"name": "male", "n": 8},
                                         {"name": "female", "n": 12}],
                                 block_sizes=[4], seed=3)
        assert r["counts_by_stratum"]["male"] == {"A": 4, "B": 2, "C": 2}
        assert r["counts_by_stratum"]["female"] == {"A": 6, "B": 3, "C": 3}

    def test_simple_and_shuffled(self):
        s = P.randomization_list(10, method="shuffled", seed=1)
        assert s["counts"] == {"A": 5, "B": 5}
        r = P.randomization_list(1000, method="simple", seed=1)
        assert abs(r["counts"]["A"] - 500) < 70
        auto = P.randomization_list(6)
        assert isinstance(auto["seed"], int)
        with pytest.raises(ValueError):
            P.randomization_list(10, block_sizes=[3])


class TestJustification:
    def test_sentence(self):
        r = P.t_test_two("n", d=0.8, power=0.8)
        j = P.justification(r, unit="mice", effect_source="a pilot study",
                            attrition=0.1)
        assert "26 mice per group (52 in total)" in j["text"]
        assert "two-sided" in j["text"] and "0.05" in j["text"]
        assert "d = 0.80" in j["text"] and "a pilot study" in j["text"]
        assert j["allocate"] == [29, 29]

    def test_api(self):
        r = analyze({"analysis": "power", "data": {},
                     "options": {"kind": "logrank", "solve": "n", "hr": 0.5,
                                 "power": 0.8, "p_event": 0.6,
                                 "justification": {"unit": "patients"}}})
        assert "error" not in r, r.get("error")
        assert r["events"] == 66
        assert "patients" in r["justification"]["text"]
        g = analyze({"analysis": "power", "data": {},
                     "options": {"kind": "generic", "distribution": "f",
                                 "ncp": 10, "df1": 2, "df2": 30}})
        assert 0 < g["power"] < 1
        bad = analyze({"analysis": "power", "data": {},
                       "options": {"kind": "t_two_sample", "solve": "n"}})
        assert "error" in bad
        rz = analyze({"analysis": "randomize", "data": {},
                      "options": {"n": 12, "seed": 7}})
        assert rz["counts"] == {"A": 6, "B": 6}
