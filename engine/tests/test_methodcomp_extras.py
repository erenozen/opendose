"""ROC and Bland-Altman extras in opendose.methodcomp.

References:
- pROC (Robin et al. 2011, BMC Bioinformatics 12:77) test suite values
  on its aSAH data (tests/testthat, pROC master): DeLong paired
  roc.test wfns vs s100b Z = 2.20898359144091, p = 0.0271757822291882,
  CI 0.0104061769564846 to 0.174214419249478 (and the wfns-ndka and
  ndka-s100b pairs); unpaired D = 1.43490640926908, p =
  0.152825378808796 (and the others); one-sided p 0.0135878911145941;
  AUCs 0.823678861788618 (wfns) and 0.611957994579946 (ndka); DeLong
  variances; partial AUCs with and without the McClish correction;
  Youden-best s100b threshold 0.205; binormal smoothing of s100b
  (coords at sp 0.5 / 0.9 and se 0.5 / 0.9, best point).
- Bland & Altman (2007), J Biopharm Stat 17:571, Tables 1-3 (cardiac
  ejection fraction RV vs IC, 12 subjects, 60 pairs): true value varies,
  residual MS 0.170714026, subject MS 4.2090856, divisor 4.9818182,
  total variance 0.98133606, SD 0.99062408, bias 0.6021667, limits
  -1.3394565 to 2.5437899; true value constant, within variances
  0.107227795 and 0.137874069, subject-mean differences 0.7092361
  (variance 0.91269114), multiplier 0.7902778, SD 1.0518506, limits
  -1.4594605 to 2.6637939; ignoring subjects SD 0.9610571.
- SimplyAgree vignette output (Caldwell 2022, J Open Source Software
  7:4148) on its reps data (18 complete pairs): Bland-Altman 1999 limits
  at 80% agreement with 90% CIs, -1.1214 (-1.8037, -0.4391) and 1.9980
  (1.3157, 2.6803); MOVER limits at 95% agreement, one-sided 95%:
  -3.0117 and 3.8884 (z-based mean term).
- One-sided normal tolerance factors (NIST/SEMATECH e-Handbook 7.2.6.3;
  Natrella 1963): k = 2.911 (n = 10), 2.396 (n = 20), 2.220 (n = 30)
  for 95% content at 95% confidence -- the exact (Carkeet 2015) limit.
- Zou (2013) MOVER intervals for replicated data checked by simulated
  coverage.
"""

import math

import numpy as np
import pytest
from scipy import stats

from opendose import methodcomp as mc
from opendose.api import analyze

ASAH = """
G,1,0.13,3.01 G,1,0.14,8.54 G,1,0.1,8.09 G,1,0.04,10.42 P,3,0.13,17.4
P,2,0.1,12.75 G,5,0.47,6.0 P,4,0.16,13.2 G,1,0.18,15.54 G,2,0.1,6.01
P,5,0.12,15.96 G,2,0.1,17.86 P,5,0.44,5.18 P,5,0.71,8.9 G,1,0.04,13.41
G,2,0.08,20.75 P,5,0.49,11.6 G,2,0.04,16.11 P,2,0.07,32.37 P,5,0.33,54.82
P,2,0.09,32.41 G,1,0.09,49.94 P,1,0.07,40.34 G,1,0.11,9.47 G,1,0.07,6.29
G,2,0.17,12.53 G,1,0.07,6.54 G,2,0.11,6.3 G,1,0.13,80.3 G,1,0.19,12.8
G,3,0.05,9.8 G,4,0.16,9.81 P,2,0.41,9.85 G,1,0.14,18.21 G,4,0.34,5.03
P,5,0.35,14.04 P,4,0.48,21.93 G,1,0.09,8.02 P,4,0.96,7.42 P,2,0.25,8.38
G,5,0.5,6.59 G,5,0.46,9.63 G,1,0.16,13.12 G,1,0.07,7.96 G,2,0.43,14.34
G,4,0.45,41.43 G,1,0.11,7.63 G,1,0.08,7.06 G,2,0.09,12.59 P,5,0.86,13.56
P,5,0.52,3.87 G,2,0.08,9.44 G,1,0.06,7.66 G,2,0.13,12.98 P,5,2.07,419.19
G,1,0.1,27.19 G,2,0.14,22.27 G,2,0.15,9.95 P,2,0.07,21.22 G,1,0.06,11.73
P,5,0.77,10.4 G,1,0.05,58.83 G,1,0.09,6.39 P,2,0.3,11.09 P,5,0.03,12.22
P,2,0.09,13.67 G,1,0.04,17.21 P,4,0.23,22.63 P,5,0.7,12.9 G,2,0.09,9.7
P,4,0.27,21.57 P,4,0.71,8.23 P,1,0.08,72.57 P,4,0.26,15.54 G,1,0.08,10.51
G,2,0.16,10.6 G,1,0.09,14.57 P,4,0.13,5.19 P,2,0.1,9.63 G,1,0.08,4.61
P,2,0.11,21.48 G,3,0.33,17.3 G,2,0.11,12.71 G,4,0.28,9.44 G,2,0.07,11.07
G,1,0.1,19.46 G,4,0.32,10.83 P,5,0.22,5.37 G,1,0.07,11.97 G,1,0.05,7.75
G,5,0.24,9.83 G,4,0.38,10.55 G,2,0.1,28.49 G,2,0.15,8.53 G,1,0.08,12.57
G,1,0.14,12.9 G,1,0.1,46.83 G,3,0.07,11.68 G,1,0.04,12.67 G,2,0.19,9.01
P,5,0.56,9.57 P,2,0.14,34.06 P,2,0.58,11.72 P,5,0.32,14.26 P,5,0.82,47.61
P,5,0.74,11.67 G,2,0.15,24.58 G,4,0.47,10.33 G,4,0.17,13.87 P,5,0.44,15.89
G,1,0.15,22.43 G,1,0.5,6.79 G,1,0.48,13.45
"""

ASAH_ROWS = [r.split(",") for r in ASAH.split()]


def marker(name, outcome):
    k = {"wfns": 1, "s100b": 2, "ndka": 3}[name]
    return [float(r[k]) for r in ASAH_ROWS if r[0] == outcome]


def poor(name):
    return marker(name, "P")


def good(name):
    return marker(name, "G")


# Bland & Altman (2007) Table 1: (subject, RV, IC); as MethComp::cardiac
EJECTION = [
    (1, 7.83, 6.57), (1, 7.42, 5.62), (1, 7.89, 6.90), (1, 7.12, 6.57),
    (1, 7.88, 6.35), (2, 6.16, 4.06), (2, 7.26, 4.29), (2, 6.71, 4.26),
    (2, 6.54, 4.09), (3, 4.75, 4.71), (3, 5.24, 5.50), (3, 4.86, 5.08),
    (3, 4.78, 5.02), (3, 6.05, 6.01), (3, 5.42, 5.67), (4, 4.21, 4.14),
    (4, 3.61, 4.20), (4, 3.72, 4.61), (4, 3.87, 4.68), (4, 3.92, 5.04),
    (5, 3.13, 3.03), (5, 2.98, 2.86), (5, 2.85, 2.77), (5, 3.17, 2.46),
    (5, 3.09, 2.32), (5, 3.12, 2.43), (6, 5.92, 5.90), (6, 6.42, 5.81),
    (6, 5.92, 5.70), (6, 6.27, 5.76), (7, 7.13, 5.09), (7, 6.62, 4.63),
    (7, 6.58, 4.61), (7, 6.93, 5.09), (8, 4.54, 4.72), (8, 4.81, 4.61),
    (8, 5.11, 4.36), (8, 5.29, 4.20), (8, 5.39, 4.36), (8, 5.57, 4.20),
    (9, 4.48, 3.17), (9, 4.92, 3.12), (9, 3.97, 2.96), (10, 4.22, 4.35),
    (10, 4.65, 4.62), (10, 4.74, 3.16), (10, 4.44, 3.53), (10, 4.50, 3.53),
    (11, 6.78, 7.20), (11, 6.07, 6.09), (11, 6.52, 7.00), (11, 6.42, 7.10),
    (11, 6.41, 7.40), (11, 5.76, 6.80), (12, 5.06, 4.50), (12, 4.72, 4.20),
    (12, 4.90, 3.80), (12, 4.80, 3.80), (12, 4.90, 4.20), (12, 5.10, 4.50),
]
SUBJ = [r[0] for r in EJECTION]
RV = [r[1] for r in EJECTION]
IC = [r[2] for r in EJECTION]

# SimplyAgree data(reps), rows with both x and y
REPS_X = [7.83, 7.42, 7.89, 7.12, 6.16, 7.26, 6.71, 4.75, 5.24, 4.86, 4.78,
          6.05, 5.42, 4.21, 3.61, 3.72, 3.87, 3.92]
REPS_Y = [6.57, 5.62, 6.9, 6.57, 4.06, 4.29, 4.26, 4.71, 5.5, 5.08, 5.02,
          6.01, 5.67, 4.14, 4.2, 4.61, 4.68, 5.04]


class TestRocCompare:
    @pytest.mark.parametrize("a,b,z,p,lo,hi", [
        ("wfns", "s100b", 2.20898359144091, 0.0271757822291882,
         0.0104061769564846, 0.174214419249478),
        ("wfns", "ndka", 2.79777591868904, 0.00514557970691098,
         0.0634011709339876, 0.3600405634833566),
        ("ndka", "s100b", -1.39077002573558, 0.164295175223054,
         -0.2876917446341914, 0.0488706064228094),
    ])
    def test_paired_delong_proc(self, a, b, z, p, lo, hi):
        r = mc.roc_compare(poor(a), good(a), poor(b), good(b))
        assert r["statistic"] == pytest.approx(z, rel=1e-10)
        assert r["p"] == pytest.approx(p, rel=1e-10)
        assert r["ci"] == pytest.approx([lo, hi], rel=1e-10)
        rev = mc.roc_compare(poor(b), good(b), poor(a), good(a))
        assert rev["statistic"] == pytest.approx(-z, rel=1e-10)

    @pytest.mark.parametrize("a,b,d,p", [
        ("wfns", "s100b", 1.43490640926908, 0.152825378808796),
        ("wfns", "ndka", 3.10125096778969, 0.00220950791756457),
        ("ndka", "s100b", -1.55995743389685, 0.120192832430845),
    ])
    def test_unpaired_delong_proc(self, a, b, d, p):
        r = mc.roc_compare(poor(a), good(a), poor(b), good(b), paired=False)
        assert r["statistic"] == pytest.approx(d, rel=1e-10)
        assert r["p"] == pytest.approx(p, rel=1e-10)

    def test_one_sided_and_identical(self):
        args = (poor("wfns"), good("wfns"), poor("s100b"), good("s100b"))
        gt = mc.roc_compare(*args, alternative="greater")
        lt = mc.roc_compare(*args, alternative="less")
        assert gt["p"] == pytest.approx(0.0135878911145941, rel=1e-10)
        assert lt["p"] == pytest.approx(0.986412108885406, rel=1e-10)
        up = mc.roc_compare(*args, paired=False, alternative="greater")
        assert up["p"] == pytest.approx(0.076412689404398, rel=1e-10)
        same = mc.roc_compare(poor("wfns"), good("wfns"), poor("wfns"),
                              good("wfns"))
        assert same["statistic"] == 0 and same["p"] == 1.0

    def test_aucs_and_variances_match_proc(self):
        r = mc.roc_compare(poor("wfns"), good("wfns"), poor("ndka"),
                           good("ndka"))
        assert r["auc"] == pytest.approx([0.823678861788618,
                                          0.611957994579946], rel=1e-12)
        assert r["se"][0] ** 2 == pytest.approx(0.00146991470882363, rel=1e-10)
        assert r["se"][1] ** 2 == pytest.approx(0.0031908105493913, rel=1e-10)
        s = mc.roc_curve(poor("s100b"), good("s100b"))
        assert s["auc"]["se"] ** 2 == pytest.approx(0.00266868245717244,
                                                    rel=1e-10)
        ci = mc.roc_curve(poor("ndka"), good("ndka"))["auc"]["ci"]
        assert ci == pytest.approx([0.501244999271703, 0.722670989888189],
                                   rel=1e-10)

    def test_direct_delong_cross_check(self):
        """Brute-force DeLong (structural components by explicit loops)."""
        rng = np.random.default_rng(3)
        p1, n1 = rng.normal(1, 1, 30), rng.normal(0, 1, 40)
        p2 = p1 * 0.5 + rng.normal(0.4, 1, 30)
        n2 = n1 * 0.5 + rng.normal(0, 1, 40)

        def psi(x, y):
            return 1.0 if x > y else (0.5 if x == y else 0.0)
        V = []
        for P, N in ((p1, n1), (p2, n2)):
            v10 = np.array([np.mean([psi(x, y) for y in N]) for x in P])
            v01 = np.array([np.mean([psi(x, y) for x in P]) for y in N])
            V.append((v10, v01))
        s10 = np.cov([V[0][0], V[1][0]])
        s01 = np.cov([V[0][1], V[1][1]])
        S = s10 / 30 + s01 / 40
        d = V[0][0].mean() - V[1][0].mean()
        z = d / math.sqrt(S[0, 0] + S[1, 1] - 2 * S[0, 1])
        r = mc.roc_compare(list(p1), list(n1), list(p2), list(n2))
        assert r["statistic"] == pytest.approx(z, rel=1e-12)

    def test_paired_needs_aligned_subjects(self):
        with pytest.raises(ValueError, match="same subjects"):
            mc.roc_compare([1, 2, 3], [0, 1], [1, 2], [0, 1])


class TestRocCutoffAndPartial:
    def test_youden_best_threshold(self):
        r = mc.roc_cutoffs(poor("s100b"), good("s100b"))
        best = r["optimal"]
        assert best["threshold"] == pytest.approx(0.205)
        assert best["specificity"] == pytest.approx(0.8055555555555556)
        assert best["sensitivity"] == pytest.approx(0.6341463414634146)
        assert best["lr_positive"] == pytest.approx(
            best["sensitivity"] / (1 - best["specificity"]))
        assert best["lr_negative"] == pytest.approx(
            (1 - best["sensitivity"]) / best["specificity"])
        lo, hi = best["sensitivity_ci"]
        assert lo < best["sensitivity"] < hi
        # the full table covers every pROC threshold (-inf ... inf)
        assert len(r["thresholds"]) == len(set(poor("s100b") + good("s100b"))) + 1

    def test_weighted_cutoffs(self):
        pos, neg = poor("s100b"), good("s100b")
        base = mc.roc_cutoffs(pos, neg)
        costly_fn = mc.roc_cutoffs(pos, neg, cost_ratio=5, prevalence=0.5)
        # missing a case costs more: lower threshold, higher sensitivity
        assert costly_fn["optimal"]["threshold"] <= base["optimal"]["threshold"]
        assert costly_fn["optimal"]["sensitivity"] >= \
            base["optimal"]["sensitivity"]
        r = costly_fn["weight_r"]
        assert r == pytest.approx(0.2)
        best = max(costly_fn["thresholds"],
                   key=lambda t: t["sensitivity"] + r * t["specificity"])
        assert best["threshold"] == costly_fn["optimal"]["threshold"]
        top = mc.roc_cutoffs(pos, neg, method="closest_topleft")
        crit = [(1 - t["sensitivity"]) ** 2 + (1 - t["specificity"]) ** 2
                for t in top["thresholds"]]
        assert top["optimal"]["threshold"] == \
            top["thresholds"][int(np.argmin(crit))]["threshold"]

    def test_bootstrap_ci_is_reproducible(self):
        a = mc.roc_cutoffs(poor("s100b"), good("s100b"), bootstrap=200, seed=1)
        b = mc.roc_cutoffs(poor("s100b"), good("s100b"), bootstrap=200, seed=1)
        assert a["bootstrap"] == b["bootstrap"]
        lo, hi = a["bootstrap"]["threshold_ci"]
        assert lo <= 0.205 <= hi
        lo, hi = a["bootstrap"]["sensitivity_ci"]
        assert 0 <= lo <= hi <= 1

    def test_lower_values_abnormal(self):
        r = mc.roc_cutoffs([-v for v in poor("s100b")],
                           [-v for v in good("s100b")],
                           higher_is_abnormal=False)
        assert r["optimal"]["threshold"] == pytest.approx(-0.205)
        assert r["optimal"]["sensitivity"] == pytest.approx(0.6341463414634146)

    @pytest.mark.parametrize("name,limits,focus,correct,expect", [
        ("wfns", (1, .9), "specificity", False, 0.0334417344173442),
        ("wfns", (.9, .8), "specificity", False, 0.0598373983739837),
        ("wfns", (.5, 0), "specificity", False, 0.488134475939354),
        ("ndka", (1, .9), "specificity", False, 0.0107046070460705),
        ("ndka", (.9, .8), "specificity", False, 0.0277777777777778),
        ("wfns", (1, 0), "specificity", False, 0.823678861788618),
        ("wfns", (1, .9), "sensitivity", False, 0.0400999322493225),
        ("wfns", (.9, .8), "sensitivity", False, 0.0609953703703703),
        ("ndka", (.5, 0), "sensitivity", False, 0.428523035230352),
        ("wfns", (1, .9), "specificity", True, 0.649693339038653),
        ("wfns", (.5, 0), "specificity", True, 0.952537903757416),
        ("ndka", (.9, .8), "specificity", True, 0.575163398692811),
        ("wfns", (1, .9), "sensitivity", True, 0.68473648552275),
        ("ndka", (.9, .8), "sensitivity", True, 0.554439662043679),
        ("ndka", (1, 0), "sensitivity", True, 0.611957994579946),
    ])
    def test_partial_auc_proc(self, name, limits, focus, correct, expect):
        r = mc.roc_partial_auc(poor(name), good(name), limits=limits,
                               focus=focus, correct=correct)
        got = r["corrected"] if correct else r["partial_auc"]
        assert got == pytest.approx(expect, rel=1e-10)

    def test_partial_auc_correction_undefined_below_diagonal(self):
        r = mc.roc_partial_auc(poor("ndka"), good("ndka"), limits=(1, .9),
                               focus="sensitivity", correct=True)
        assert r["partial_auc"] == pytest.approx(0.0037940379403794)
        assert r["corrected"] is None and "warning" in r

    def test_binormal_smoothing_proc(self):
        fit = mc.roc_binormal(poor("s100b"), good("s100b"))
        # pROC's smooth(r.s100b) best point on its 512-point grid
        assert fit["best"]["specificity"] == pytest.approx(0.750857175922901,
                                                           rel=1e-10)
        assert fit["best"]["sensitivity"] == pytest.approx(0.608610567514677,
                                                           rel=1e-10)
        # coords() interpolates the grid; the analytic curve agrees to 2e-6
        assert mc.binormal_sensitivity(fit, 0.5) == pytest.approx(
            0.79774939210378937, abs=2e-6)
        assert mc.binormal_sensitivity(fit, 0.9) == pytest.approx(
            0.41207187155396763, abs=2e-6)
        assert mc.binormal_specificity(fit, 0.5) == pytest.approx(
            0.84418934548477731, abs=2e-6)
        assert mc.binormal_specificity(fit, 0.9) == pytest.approx(
            0.29332202419872122, abs=2e-6)
        assert fit["auc_trapezoid"] == pytest.approx(fit["auc"], abs=1e-5)


class TestBlandAltmanExtras:
    def test_bland_altman_2007_ignoring_subjects(self):
        r = mc.bland_altman_extras(RV, IC, z=1.96)
        d = r["difference"]
        assert d["sd"] == pytest.approx(0.9610571, abs=5e-8)
        # the paper multiplies the rounded bias and SD
        assert d["loa_lower"] == pytest.approx(-1.2815052, abs=2e-7)
        assert d["loa_upper"] == pytest.approx(2.4858386, abs=2e-7)

    def test_simplyagree_approximate_and_mover(self):
        r = mc.bland_altman_extras(REPS_X, REPS_Y, agreement=0.8,
                                   ci_level=0.90)
        d = r["difference"]
        assert round(d["bias"], 4) == 0.4383
        assert [round(v, 4) for v in d["bias_ci"]] == [-0.0607, 0.9374]
        assert round(d["loa_lower"], 4) == -1.1214
        assert round(d["loa_upper"], 4) == 1.9980
        ap = d["loa_ci"]["approximate"]
        assert [round(v, 4) for v in ap["lower"]] == [-1.8037, -0.4391]
        assert [round(v, 4) for v in ap["upper"]] == [1.3157, 2.6803]
        r = mc.bland_altman_extras(REPS_X, REPS_Y, ci_level=0.90,
                                   mover_mean="z")
        d = r["difference"]
        assert round(d["sd"], 3) == 1.217
        assert (round(d["loa_lower"], 3), round(d["loa_upper"], 3)) == \
            (-1.947, 2.824)
        mv = d["loa_ci"]["mover"]
        assert round(mv["lower"][0], 4) == -3.0117
        assert round(mv["upper"][1], 4) == 3.8884

    @pytest.mark.parametrize("n,k", [(10, 2.911), (20, 2.396), (30, 2.220)])
    def test_exact_limit_is_the_tolerance_factor(self, n, k):
        rng = np.random.default_rng(n)
        d = rng.normal(0, 1, n)
        z = stats.norm.ppf(0.95)
        r = mc.bland_altman_extras(list(d), [0.0] * n, z=z, ci_level=0.90,
                                   variants=("difference",), regression=False)
        blk = r["difference"]
        upper_bound = blk["loa_ci"]["exact"]["upper"][1]
        assert round((upper_bound - blk["bias"]) / blk["sd"], 3) == k
        lower_bound = blk["loa_ci"]["exact"]["lower"][0]
        assert (blk["bias"] - lower_bound) / blk["sd"] == pytest.approx(
            (upper_bound - blk["bias"]) / blk["sd"])

    def test_exact_and_mover_coverage(self):
        rng = np.random.default_rng(11)
        n, reps = 15, 1500
        hits = {"exact": 0, "mover": 0, "approximate": 0}
        true_upper = 1.959963984540054
        for _ in range(reps):
            d = rng.normal(0, 1, n)
            blk = mc._ba_block(d, d, 0.95, 0.95)
            for k in hits:
                lo, hi = blk["loa_ci"][k]["upper"]
                hits[k] += lo <= true_upper <= hi
        assert abs(hits["exact"] / reps - 0.95) < 0.015
        assert abs(hits["mover"] / reps - 0.95) < 0.02

    def test_variants_and_regression(self):
        a = [10, 20, 30, 40, 50, 60, 70, 80.0]
        b = [9, 18.5, 27, 37, 45, 55, 62, 71.0]
        r = mc.bland_altman_extras(a, b)
        ratio = r["ratio"]
        lr = np.log(a) - np.log(b)
        assert ratio["ratio_bias"] == pytest.approx(math.exp(lr.mean()))
        assert ratio["ratio_loa"][1] == pytest.approx(
            math.exp(lr.mean() + stats.norm.ppf(0.975) * lr.std(ddof=1)))
        pct = r["percent"]
        p = 100 * (np.array(a) - b) / ((np.array(a) + b) / 2)
        assert pct["bias"] == pytest.approx(p.mean())
        pb = r["proportional_bias"]
        avg = (np.array(a) + b) / 2
        res = stats.linregress(avg, np.array(a) - b)
        assert pb["slope"] == pytest.approx(res.slope)
        assert pb["slope_p"] == pytest.approx(res.pvalue)
        assert pb["slope_p"] < 0.001
        assert "shapiro_wilk" in r["normality"]
        assert "dagostino_pearson" in r["normality"]
        neg = mc.bland_altman_extras([-1, 2, 3], [1, 2, 4])
        assert "error" in neg["ratio"]


class TestBlandAltmanRepeated:
    def test_true_value_varies_bland_altman_2007(self):
        r = mc.bland_altman_repeated(SUBJ, RV, IC, z=1.96)
        assert r["n_subjects"] == 12 and r["n_pairs"] == 60
        # Stata ANOVA output (single-precision artefacts ~3e-8)
        assert r["ms_residual"] == pytest.approx(0.170714026, abs=5e-8)
        assert r["ms_subjects"] == pytest.approx(4.2090856, rel=2e-7)
        assert r["divisor"] == pytest.approx(4.9818182, abs=1e-7)
        assert r["var_total"] == pytest.approx(0.98133606, abs=1e-7)
        assert r["sd"] == pytest.approx(0.99062408, abs=1e-7)
        assert r["bias"] == pytest.approx(0.6021667, abs=1e-7)
        assert r["loa_lower"] == pytest.approx(-1.3394565, abs=1e-6)
        assert r["loa_upper"] == pytest.approx(2.5437899, abs=1e-6)
        lo, hi = r["loa_ci"]["upper"]
        assert lo < r["loa_upper"] < hi

    def test_true_value_constant_bland_altman_2007(self):
        r = mc.bland_altman_repeated(SUBJ, RV, IC, true_value="constant",
                                     z=1.96)
        assert r["var_within_a"] == pytest.approx(0.107227795, abs=5e-8)
        assert r["var_within_b"] == pytest.approx(0.137874069, abs=5e-8)
        assert r["mean_of_subject_differences"] == pytest.approx(0.7092361,
                                                                 abs=1e-7)
        assert r["var_subject_differences"] == pytest.approx(0.91269114,
                                                             rel=2e-7)
        assert r["multiplier_a"] == pytest.approx(0.7902778, abs=1e-7)
        assert r["var_total"] == pytest.approx(1.1063897, abs=1e-7)
        assert r["sd"] == pytest.approx(1.0518506, abs=1e-7)
        assert r["bias"] == pytest.approx(0.6021667, abs=1e-7)
        assert r["loa_lower"] == pytest.approx(-1.4594605, abs=1e-6)
        assert r["loa_upper"] == pytest.approx(2.6637939, abs=1e-6)

    def test_constant_allows_unequal_replicates(self):
        subj_a = [1, 1, 1, 2, 2, 3, 3, 3, 4, 4]
        a = [5.0, 5.2, 4.9, 6.1, 6.0, 7.2, 7.0, 7.1, 4.0, 4.2]
        subj_b = [1, 1, 2, 2, 2, 3, 4, 4]
        b = [4.6, 4.8, 5.9, 5.7, 5.8, 6.9, 3.7, 3.9]
        subjects = subj_a + subj_b
        va = a + [None] * len(b)
        vb = [None] * len(a) + b
        r = mc.bland_altman_repeated(subjects, va, vb, true_value="constant")
        assert r["n_a"] == 10 and r["n_b"] == 8
        assert r["multiplier_b"] == pytest.approx(1 - np.mean([1 / 2, 1 / 3,
                                                                1, 1 / 2]))

    def test_zou_mover_coverage_varies(self):
        rng = np.random.default_rng(5)
        n_subj, sb, sw, reps = 15, 0.8, 0.5, 600
        true_upper = 0.3 + 1.959963984540054 * math.sqrt(sb ** 2 + sw ** 2)
        hits = 0
        for _ in range(reps):
            subj, a, b = [], [], []
            for s in range(n_subj):
                u = rng.normal(0.3, sb)
                for _ in range(rng.integers(2, 6)):
                    subj.append(s)
                    a.append(u + rng.normal(0, sw))
                    b.append(0.0)
            r = mc.bland_altman_repeated(subj, a, b)
            lo, hi = r["loa_ci"]["upper"]
            hits += lo <= true_upper <= hi
        assert 0.91 <= hits / reps <= 0.99


class TestApi:
    def test_roc_compare_and_cutoff(self):
        data = {"datasets": [{"name": "s100b Poor", "ys": [[v] for v in poor("s100b")]},
                             {"name": "s100b Good", "ys": [[v] for v in good("s100b")]},
                             {"name": "wfns Poor", "ys": [[v] for v in poor("wfns")]},
                             {"name": "wfns Good", "ys": [[v] for v in good("wfns")]}]}
        res = analyze({"analysis": "roc_compare", "data": data,
                       "options": {"curves": [[2, 3], [0, 1]], "paired": True}})
        assert "error" not in res, res.get("error")
        assert res["statistic"] == pytest.approx(2.20898359144091, rel=1e-10)
        res = analyze({"analysis": "roc_cutoff", "data": data,
                       "options": {"patients": 0, "controls": 1,
                                   "partial_auc": {"limits": [1, 0.9]},
                                   "binormal": True}})
        assert "error" not in res, res.get("error")
        assert res["optimal"]["threshold"] == pytest.approx(0.205)
        assert "partial_auc" in res and "binormal" in res

    def test_bland_altman_extras_and_existing_output_unchanged(self):
        data = {"datasets": [{"name": "RV", "ys": [[v] for v in RV]},
                             {"name": "IC", "ys": [[v] for v in IC]}]}
        base = analyze({"analysis": "bland_altman", "data": data,
                        "options": {}})
        assert set(base) == {"analysis", "n", "bias", "sd_of_differences",
                             "loa_lower", "loa_upper", "points", "names"}
        ext = analyze({"analysis": "bland_altman_extras", "data": data,
                       "options": {"z": 1.96}})
        assert "error" not in ext, ext.get("error")
        assert ext["difference"]["sd"] == pytest.approx(0.9610571, abs=5e-8)
        rep = analyze({"analysis": "bland_altman_extras", "data": {
            "subjects": SUBJ, "a": RV, "b": IC},
            "options": {"repeated": "varies", "z": 1.96}})
        assert "error" not in rep, rep.get("error")
        assert rep["sd"] == pytest.approx(0.99062408, abs=1e-7)
