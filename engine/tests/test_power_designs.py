"""Power for more designs (FEATURE-PLAN P-95, opendose.power_designs).

Published values reproduced (to the digits printed):
- Faul, Erdfelder, Lang & Buchner (2007) Behav Res Methods 39:175,
  pp. 182-183, repeated measures, univariate approach:
  Figure 4 scenario (3 groups x 3 measurements, N = 90, rho = 0.3,
  eps = 1, alpha 0.05): within f = 0.2572 -> power .997, critical F
  3.048 on (2, 174), lambda 25.52; interaction f = 0.1532 -> .653;
  between f = 0.1719571 -> .488. Berti et al. example (2 groups, 10
  measurements, N = 20, rho = .5, f = 0.25): between .30, within .95,
  interaction .95. A priori for the within effect at power .95 gives
  the same N = 20 (the plan's acceptance test: same total N and power).
- G*Power 3.1 manual (June 1, 2023): 13.3.1 omnibus R^2 = .10, 5
  predictors, N = 95: lambda 10.555555, critical F 2.316858, df (5, 89),
  power 0.673586; 13.3.3 r^2 = .25, 1 predictor, N = 12: 0.439627;
  14.3.1 f^2 = 0.0714286, 4 of 9 predictors, N = 90, alpha .01:
  0.241297; f^2 = 0.075, 3 of 12, N = 200, alpha .01: lambda 15,
  critical F 3.888052, df (3, 187), power 0.766990. 22.3 Wilcoxon
  signed-rank, A.R.E. method, d = 0.8, N = 11, one-sided: min ARE
  0.7319 (the manual's Laplace value 0.923 is not reproduced: the same
  formula gives 0.9276 with k = 3/2 and 0.7320 with k = 0.864, so the
  printed 0.923 is taken as a misprint; see the validation record).
  29.3 logistic, Hsieh et al. procedure: normal covariate, OR 1.5,
  P = 0.5, power .95: N = 317 (actual 0.950486); binary covariate p1
  .05, p2 .1, pi .5: N = 1437 (actual 0.950068).
- Hsieh, Bloch & Larsen (1998) Stat Med 17:1623, Tables I and II (the
  same two values, as the manual says).
- Borm, Fransen & Lemmens (2007) J Clin Epidemiol 60:1234, Table 1
  (delta 0.6, SD 1.2, alpha .05 power .8 and alpha .01 power .9): the
  two-step method (t-test n times 1 - r^2) gives the published totals;
  the engine's exact ANCOVA n is within one per group of the paper's
  recommended rule ((1 - r^2) n + 1 per group).

Independent checks from engine/tests/reference/power_designs.py
(statsmodels FTestPowerF2, adaptive quadrature, Monte Carlo).
"""

import json
import math
from pathlib import Path

import numpy as np
import pytest
from scipy import stats

from opendose import power as P
from opendose import power_designs as D
from opendose.api import analyze

REF = json.loads((Path(__file__).parent / "reference" /
                  "power_designs.json").read_text())


def mc_ok(engine, mc, reps, k=3.5):
    return abs(engine - mc) <= k * math.sqrt(max(mc * (1 - mc), 1e-4) / reps)


class TestRepeatedMeasures:
    def test_faul_figure4_within(self):
        r = D.anova_rm("power", effect="within", f=0.2572, k=3, m=3,
                       rho=0.3, n_total=90)
        assert round(r["power"], 3) == 0.997
        assert round(r["critical_f"], 3) == 3.048
        assert (r["df1"], r["df2"]) == (2, 174)
        assert round(r["ncp"], 2) == 25.52

    def test_faul_figure4_interaction_and_between(self):
        assert round(D.anova_rm("power", effect="interaction", f=0.1532,
                                k=3, m=3, rho=0.3, n_total=90)["power"],
                     3) == 0.653
        assert round(D.anova_rm("power", effect="between", f=0.1719571,
                                k=3, m=3, rho=0.3, n_total=90)["power"],
                     3) == 0.488

    def test_berti_example(self):
        got = {e: D.anova_rm("power", effect=e, f=0.25, k=2, m=10, rho=0.5,
                             n_total=20)["power"]
               for e in ("between", "within", "interaction")}
        assert round(got["between"], 2) == 0.30
        assert round(got["within"], 2) == 0.95
        assert round(got["interaction"], 2) == 0.95

    def test_acceptance_a_priori_same_n_and_power(self):
        r = D.anova_rm("n", effect="within", f=0.25, k=2, m=10, rho=0.5,
                       power=0.95)
        assert r["n_total"] == 20 and r["n_per_group"] == [10, 10]
        assert round(r["power"], 2) == 0.95
        below = D.anova_rm("power", effect="within", f=0.25, k=2, m=10,
                           rho=0.5, n_total=18)
        assert below["power"] < 0.95

    def test_monte_carlo_within(self):
        mc = REF["rm_within_mc"]
        r = D.anova_rm("power", effect="within", f=mc["f"], k=mc["k"],
                       m=mc["m"], rho=mc["rho"], n_total=mc["N"])
        assert mc_ok(r["power"], mc["power"], mc["reps"])

    def test_epsilon_lowers_power_and_df(self):
        a = D.anova_rm("power", effect="within", f=0.25, k=1, m=4, rho=0.5,
                       n_total=20)
        b = D.anova_rm("power", effect="within", f=0.25, k=1, m=4, rho=0.5,
                       eps=0.6, n_total=20)
        assert b["power"] < a["power"]
        assert b["df1"] == pytest.approx(3 * 0.6)

    def test_effect_solve_round_trip(self):
        r = D.anova_rm("effect", effect="within", k=1, m=3, rho=0.5,
                       n_total=24, power=0.8)
        back = D.anova_rm("power", effect="within", k=1, m=3, rho=0.5,
                          n_total=24, f=r["effect"]["value"])
        assert back["power"] == pytest.approx(0.8, abs=1e-8)

    @pytest.mark.parametrize("kw,msg", [
        (dict(m=1, rho=0.5), "at least 2 measurements"),
        (dict(m=3, rho=-0.6), "rho must be between"),
        (dict(m=3, rho=1.0), "rho must be between"),
        (dict(m=4, rho=0.5, eps=0.2), "epsilon"),
        (dict(m=3, rho=0.5, effect="between", k=1), "at least 2 groups"),
    ])
    def test_invalid_inputs(self, kw, msg):
        kw = {"effect": "within", "k": 1, **kw}
        with pytest.raises(ValueError, match=msg):
            D.anova_rm("power", f=0.25, n_total=20, **kw)

    def test_n_not_above_groups(self):
        with pytest.raises(ValueError, match="exceed the number of groups"):
            D.anova_rm("power", effect="within", f=0.25, k=3, m=3, rho=0.5,
                       n_total=3)


class TestAncova:
    def test_borm_table1_two_step_method(self):
        # Borm et al. Table 1 (totals): the t-test n from the z formula,
        # rounded up, times the design factor 1 - r^2.
        for alpha, pw, follow, ancova in [
                (0.05, 0.80, 126, {0: 126, .5: 95, .6: 81, .7: 64, .8: 45,
                                   .9: 24}),
                (0.01, 0.90, 240, {0: 240, .5: 180, .6: 154, .7: 122,
                                   .8: 86, .9: 46})]:
            z = stats.norm.isf(alpha / 2) + stats.norm.ppf(pw)
            n_t = math.ceil(2 * z ** 2 * 1.2 ** 2 / 0.6 ** 2)
            assert 2 * n_t == follow
            for r, total in ancova.items():
                # the paper rounds half up (94.5 -> 95)
                assert math.floor(2 * (1 - r * r) * n_t + 0.5) == total

    @pytest.mark.parametrize("alpha,pw", [(0.05, 0.8), (0.01, 0.9)])
    def test_exact_n_within_one_of_borm_rule(self, alpha, pw):
        for r in (0.0, 0.5, 0.6, 0.7, 0.8, 0.9):
            res = D.ancova("n", d=0.5, rho=r, alpha=alpha, power=pw)
            rule = math.ceil(res["n1_design_factor"] - 1e-9)
            assert abs(res["n1"] - rule) <= 1, (r, res["n1"], rule)
            assert res["power"] >= pw
            assert D.ancova("power", d=0.5, rho=r, alpha=alpha,
                            n1=res["n1"] - 1)["power"] < pw

    def test_quadrature_against_adaptive(self):
        for c in REF["ancova_quad"]:
            got = D.ancova_power(c["d"], c["rho"], c["n1"], c["n2"])
            assert got == pytest.approx(c["power"], abs=1e-10)

    @pytest.mark.parametrize("key", ["ancova_mc", "ancova_mc_small"])
    def test_monte_carlo(self, key):
        mc = REF[key]
        got = D.ancova("power", d=mc["d"], rho=mc["rho"], n1=mc["n1"],
                       n2=mc["n2"])["power"]
        assert mc_ok(got, mc["power"], mc["reps"])

    def test_rho_zero_is_t_test_with_one_df_less(self):
        a = D.ancova_power(0.6, 0.0, 20, 20)
        t = P.t_test_two("power", d=0.6, n1=20, n2=20)["power"]
        assert 0 < t - a < 0.02

    def test_sign_and_group_order_invariance(self):
        assert D.ancova_power(0.5, 0.6, 12, 20) == pytest.approx(
            D.ancova_power(-0.5, -0.6, 20, 12), abs=1e-14)

    def test_delta_over_sd_is_unit_free(self):
        a = D.ancova("power", delta=0.6, sd=1.2, rho=0.7, n1=30)["power"]
        b = D.ancova("power", delta=0.6e-9, sd=1.2e-9, rho=0.7,
                     n1=30)["power"]
        c = D.ancova("power", delta=6e11, sd=1.2e12, rho=0.7, n1=30)["power"]
        assert a == pytest.approx(b, abs=1e-12) == pytest.approx(c, abs=1e-12)

    def test_edges(self):
        with pytest.raises(ValueError, match="rho must be between"):
            D.ancova("power", d=0.5, rho=1.0, n1=10)
        with pytest.raises(ValueError, match="at least 5 subjects"):
            D.ancova("power", d=0.5, rho=0.5, n1=2, n2=2)


class TestRankTests:
    def test_gpower_signed_rank_min_are(self):
        r = D.wilcoxon_signed_rank("power", d=0.8, n=11, parent="min_are",
                                   tails=1)
        assert math.floor(r["power"] * 1e4) / 1e4 == 0.7319

    def test_laplace_value_of_the_formula(self):
        # The A.R.E. formula of manual 24.5 with k = 3/2 (see docstring).
        r = D.wilcoxon_signed_rank("power", d=0.8, n=11, parent="laplace",
                                   tails=1)
        expect = P.t_power(0.8 * math.sqrt(16.5), 15.5, 0.05, 1)
        assert r["power"] == pytest.approx(expect, abs=1e-12)

    def test_uniform_parent_is_the_t_test(self):
        mw = D.mann_whitney("power", d=0.5, n1=20, parent="uniform")
        t = P.t_test_two("power", d=0.5, n1=20, n2=20)
        assert mw["power"] == pytest.approx(t["power"], abs=1e-12)
        sr = D.wilcoxon_signed_rank("power", d=0.5, n=15, parent="uniform")
        t1 = P.t_test_one("power", d=0.5, n=15)
        assert sr["power"] == pytest.approx(t1["power"], abs=1e-12)

    def test_normal_parent_against_simulation(self):
        mc = REF["rank_mc"]
        mw = D.mann_whitney("power", d=0.6, n1=30)["power"]
        sr = D.wilcoxon_signed_rank("power", d=0.5, n=25)["power"]
        # A.R.E. is asymptotic: within 0.015 of the simulated power
        assert abs(mw - mc["mw_normal_n30_d0.6"]) < 0.015
        assert abs(sr - mc["sr_normal_n25_d0.5"]) < 0.015

    def test_laplace_parent_is_optimistic_at_small_n(self):
        # Documented limitation: the A.R.E. overstates the power for a
        # heavy-tailed parent at n = 30 per group (by about 0.05).
        mc = REF["rank_mc"]["mw_laplace_n30_d0.6"]
        got = D.mann_whitney("power", d=0.6, n1=30, parent="laplace")["power"]
        assert 0 < got - mc < 0.07

    def test_a_priori_and_manual_are(self):
        r = D.mann_whitney("n", d=0.5, power=0.8)
        assert r["n1"] == 67 and r["power"] >= 0.8
        assert D.mann_whitney("power", d=0.5, n1=66)["power"] < 0.8
        m = D.mann_whitney("power", d=0.5, n1=20, are=3 / math.pi)
        assert m["power"] == pytest.approx(
            D.mann_whitney("power", d=0.5, n1=20)["power"], abs=1e-14)
        assert m["parent"] == "manual"

    def test_bad_parent(self):
        with pytest.raises(ValueError, match="unknown parent"):
            D.mann_whitney("power", d=0.5, n1=10, parent="cauchy")


class TestTost:
    def test_other_integration_order_and_simulation(self):
        for c in REF["tost"]:
            got = D.tost("power", n1=c["n1"], n2=c["n2"], lower=c["lower"],
                         upper=c["upper"], theta=c["theta"], sd=c["sd"],
                         alpha=c["alpha"])["power"]
            assert got == pytest.approx(c["power_by_d"], abs=1e-9)
            assert mc_ok(got, c["power_mc"], c["mc_reps"])

    def test_paired(self):
        c = REF["tost_paired"]
        got = D.tost("power", design="paired", n=c["n"], lower=c["lower"],
                     upper=c["upper"], sd=c["sd"])["power"]
        assert got == pytest.approx(c["power_by_d"], abs=1e-9)
        one = D.tost("power", design="one_sample", n=c["n"],
                     lower=c["lower"], upper=c["upper"], sd=c["sd"])["power"]
        assert one == got

    def test_wide_upper_margin_is_one_sided_t_test(self):
        # With U far away TOST is the one-sided t test against L.
        import statsmodels.stats.power as smp
        got = D.tost("power", n1=20, lower=-0.5, upper=1e6, sd=1.0)["power"]
        ref = smp.TTestIndPower().power(effect_size=0.5, nobs1=20, ratio=1,
                                        alpha=0.05, alternative="larger")
        assert got == pytest.approx(ref, abs=1e-8)

    def test_a_priori_and_effect(self):
        r = D.tost("n", margin=0.5, sd=0.5, power=0.8)
        assert r["power"] >= 0.8
        assert D.tost("power", n1=r["n1"] - 1, margin=0.5,
                      sd=0.5)["power"] < 0.8
        e = D.tost("effect", n1=20, sd=0.5, power=0.8)
        back = D.tost("power", n1=20, margin=e["effect"]["value"], sd=0.5)
        assert back["power"] == pytest.approx(0.8, abs=1e-7)

    def test_scale_invariance_and_reflection(self):
        base = D.tost("power", n1=15, lower=-0.4, upper=0.6, theta=0.1,
                      sd=0.5)["power"]
        for s in (1e-12, 1e12):
            got = D.tost("power", n1=15, lower=-0.4 * s, upper=0.6 * s,
                         theta=0.1 * s, sd=0.5 * s)["power"]
            assert got == pytest.approx(base, abs=1e-9)
        refl = D.tost("power", n1=15, lower=-0.6, upper=0.4, theta=-0.1,
                      sd=0.5)["power"]
        assert refl == pytest.approx(base, abs=1e-12)

    def test_power_tends_to_zero_at_small_n(self):
        assert D.tost("power", n1=2, margin=0.1, sd=1.0)["power"] < 0.01

    @pytest.mark.parametrize("kw,msg", [
        (dict(margin=0.5, theta=0.6), "inside the equivalence margins"),
        (dict(lower=0.5, upper=-0.5), "lower margin must be below"),
        (dict(margin=0.5, sd=0.0), "SD must be positive"),
    ])
    def test_invalid(self, kw, msg):
        with pytest.raises(ValueError, match=msg):
            D.tost("power", n1=10, **kw)


class TestRegression:
    def test_gpower_manual_omnibus(self):
        r = D.regression_r2("power", r2=0.10, predictors=5, n_total=95)
        assert round(r["ncp"], 6) == 10.555556
        assert round(r["critical_f"], 6) == 2.316858
        assert (r["df1"], r["df2"]) == (5, 89)
        assert round(r["power"], 6) == 0.673586
        assert round(D.regression_r2("power", r2=0.25, predictors=1,
                                     n_total=12)["power"], 6) == 0.439627

    def test_gpower_manual_increase(self):
        r = D.regression_r2("power", f2=0.075, predictors=12, tested=3,
                            n_total=200, alpha=0.01)
        assert round(r["ncp"], 6) == 15.0
        assert round(r["critical_f"], 6) == 3.888052
        assert r["df2"] == 187
        assert round(r["power"], 6) == 0.766990
        assert round(D.regression_r2("power", f2=0.0714286, predictors=9,
                                     tested=4, n_total=90,
                                     alpha=0.01)["power"], 6) == 0.241297

    def test_statsmodels(self):
        ref = REF["regression"]
        assert D.regression_r2("power", r2=0.10, predictors=5,
                               n_total=95)["power"] == pytest.approx(
            ref["omnibus_p5_n95_r2_0.10"], abs=1e-10)
        assert D.regression_r2("power", f2=0.075, predictors=12, tested=3,
                               n_total=200, alpha=0.01)["power"] == \
            pytest.approx(ref["increase_q3_p12_n200_f2_0.075_a0.01"],
                          abs=1e-10)
        assert D.regression_r2("n", f2=0.15, predictors=3,
                               power=0.8)["n_total"] == \
            ref["a_priori_p3_f2_0.15_power0.8"]

    def test_r2_change_input(self):
        a = D.regression_r2("power", r2_change=0.06, r2_full=0.2,
                            predictors=12, tested=3, n_total=200, alpha=0.01)
        assert a["effect"]["value"] == pytest.approx(0.075)

    def test_edges(self):
        with pytest.raises(ValueError, match="at least the number"):
            D.regression_r2("power", r2=0.1, predictors=5, n_total=6)
        with pytest.raises(ValueError, match="between 0 and 1"):
            D.regression_r2("power", r2=1.0, predictors=2, n_total=20)
        with pytest.raises(ValueError, match="tested predictors"):
            D.regression_r2("power", f2=0.1, predictors=2, tested=3,
                            n_total=20)


class TestLogistic:
    def test_hsieh_normal_covariate(self):
        r = D.logistic("n", odds_ratio=1.5, p0=0.5, power=0.95)
        assert r["n_total"] == 317
        assert round(r["power"], 6) == 0.950486
        assert round(r["critical_z"], 6) == 1.959964

    def test_hsieh_binary_covariate(self):
        r = D.logistic("n", p1=0.1, p0=0.05, covariate="binary",
                       x_prop=0.5, power=0.95)
        assert r["n_total"] == 1437
        assert round(r["power"], 6) == 0.950068

    def test_simulation_of_the_wald_test(self):
        mc = REF["logistic_binary_mc"]
        # the approximation is close to the simulated power (G*Power's own
        # simulation gave 0.953 at this N)
        assert abs(mc["power"] - 0.95) < 0.015

    def test_other_covariates_inflate_n(self):
        a = D.logistic("n", odds_ratio=1.5, p0=0.5, power=0.95)
        b = D.logistic("n", odds_ratio=1.5, p0=0.5, power=0.95, r2_other=0.1)
        assert b["n_exact"] == pytest.approx(a["n_exact"] / 0.9)

    def test_odds_ratio_symmetry(self):
        a = D.logistic("power", odds_ratio=1.5, p0=0.3, n=200)["power"]
        b = D.logistic("power", odds_ratio=1 / 1.5, p0=0.3, n=200)["power"]
        assert a == pytest.approx(b, abs=1e-14)

    def test_effect_round_trip(self):
        e = D.logistic("effect", p0=0.3, n=200, power=0.8)
        assert D.logistic("power", odds_ratio=e["effect"]["value"], p0=0.3,
                          n=200)["power"] == pytest.approx(0.8, abs=1e-9)

    @pytest.mark.parametrize("kw,msg", [
        (dict(odds_ratio=1.0, p0=0.3), "not 1"),
        (dict(odds_ratio=1.5, p0=1.0), "event rate must be between"),
        (dict(odds_ratio=1.5, p0=0.3, covariate="binary", x_prop=1.0),
         "proportion with X = 1"),
        (dict(odds_ratio=1.5, p0=0.3, r2_other=1.0), "other covariates"),
    ])
    def test_invalid(self, kw, msg):
        with pytest.raises(ValueError, match=msg):
            D.logistic("n", power=0.8, **kw)


class TestThroughTheApi:
    @pytest.mark.parametrize("kind,opts", [
        ("anova_rm", dict(f=0.25, k=2, m=10, rho=0.5)),
        ("ancova", dict(d=0.5, rho=0.7)),
        ("mann_whitney", dict(d=0.5)),
        ("wilcoxon_signed_rank", dict(d=0.5, parent="laplace")),
        ("tost", dict(margin=0.5, sd=0.5)),
        ("regression_r2", dict(r2=0.1, predictors=3)),
        ("logistic", dict(odds_ratio=2, p0=0.1, covariate="binary")),
    ])
    def test_handler_and_justification(self, kind, opts):
        r = analyze({"analysis": "power", "data": {},
                     "options": {"kind": kind, "solve": "n", "power": 0.8,
                                 **opts, "justification": {
                                     "unit": "mice", "attrition": 0.1}}})
        assert "error" not in r, r
        text = r["justification"]["text"]
        assert "determined a priori" in text and "mice" in text
        assert "(s)" not in text and "None" not in text

    def test_errors_are_messages(self):
        r = analyze({"analysis": "power", "data": {},
                     "options": {"kind": "tost", "solve": "n", "power": 0.8,
                                 "margin": 0.5, "theta": 0.7}})
        assert "inside the equivalence margins" in r["error"]

    def test_power_curve_points_are_finite(self):
        for n in range(3, 60, 7):
            for kind, o in [("ancova", dict(d=0.5, rho=0.5, n1=n)),
                            ("tost", dict(margin=0.5, sd=0.5, n1=n)),
                            ("mann_whitney", dict(d=0.5, n1=n))]:
                r = P.power_analysis(kind, "power", **o)
                assert np.isfinite(r["power"]) and 0 <= r["power"] <= 1
