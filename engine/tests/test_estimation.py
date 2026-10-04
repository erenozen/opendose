"""Estimation statistics (opendose.estimation): BCa bootstrap CIs and
permutation P values shaped for Gardner-Altman and Cumming plots.

References:
- DABEST-python tutorial ("Basics", acclab.github.io/DABEST-python):
  data from np.random.seed(9999) and scipy norm.rvs; documented output
  "The unpaired mean difference between Control 1 and Test 1 is 0.48
  [95%CI 0.205, 0.774]. The p-value of the two-sided permutation t-test
  is 0.001" and "The unpaired Hedges' g between Control 1 and Test 1 is
  1.03 [95%CI 0.317, 1.62]".
- DABEST-python 2025.10.20 run on the same data (random_seed 12345,
  5000 resamples): shared control Test 2 -0.541558 [-0.914646,
  -0.206434] P 0.0042, Test 3 0.173997 [-0.272731, 0.646751] P 0.479;
  paired mean difference 0.480290 [0.241038, 0.748531]; paired Hedges'
  g 1.025525 [0.409142, 1.568398]; sequential Test 1 -> Test 2
  -1.021848 [-1.353514, -0.709260], Test 2 -> Test 3 0.715555
  [0.152922, 1.200993] P 0.022. Bootstrap limits agree within Monte
  Carlo error (different random streams), point estimates exactly.
- scipy.stats.bootstrap(method="BCa") as an independent BCa
  implementation; Welch's t interval as the analytic limit for large
  normal samples; brute-force enumeration of permutation
  distributions.
"""

import math
from itertools import combinations, product

import numpy as np
import pytest
from scipy import stats as sps

from opendose import estimation as est
from opendose.api import analyze


def _dabest_data():
    rs = np.random.RandomState(9999)  # same stream as np.random.seed
    spec = [(3, 0.4), (3.5, 0.75), (3.25, 0.4), (3.5, 0.5), (2.5, 0.6),
            (3, 0.75), (3.5, 0.75), (3.25, 0.4), (3.25, 0.4)]
    vals = [sps.norm.rvs(loc=m, scale=s, size=20, random_state=rs)
            for m, s in spec]
    names = ["Control 1", "Control 2", "Control 3", "Test 1", "Test 2",
             "Test 3", "Test 4", "Test 5", "Test 6"]
    return dict(zip(names, vals))


D = _dabest_data()


class TestDabestTutorial:
    def test_documented_two_group(self):
        r = est.estimation([D["Control 1"], D["Test 1"]],
                           ["Control 1", "Test 1"],
                           effects=["mean_diff", "hedges_g"])
        md, g = r["comparisons"][0]["effects"]
        assert round(md["difference"], 2) == 0.48
        assert md["ci"] == pytest.approx([0.205, 0.774], abs=0.03)
        assert md["permutation"]["p"] < 0.005
        assert round(g["difference"], 2) == 1.03
        assert g["ci"] == pytest.approx([0.317, 1.62], abs=0.06)
        assert r["plot"]["kind"] == "gardner_altman"
        assert r["plot"]["reference_mean"] == pytest.approx(
            D["Control 1"].mean())

    def test_shared_control(self):
        r = est.estimation([D["Control 1"], D["Test 1"], D["Test 2"],
                            D["Test 3"]],
                           ["Control 1", "Test 1", "Test 2", "Test 3"])
        assert r["design"] == "shared_control"
        assert r["plot"]["kind"] == "cumming"
        ref = {"Test 1": (0.480290, [0.205161, 0.773647], 0.001),
               "Test 2": (-0.541558, [-0.914646, -0.206434], 0.0042),
               "Test 3": (0.173997, [-0.272731, 0.646751], 0.479)}
        for comp in r["comparisons"]:
            diff, ci, p = ref[comp["test"]]
            e = comp["effects"][0]
            assert e["difference"] == pytest.approx(diff, abs=1e-6)
            assert e["ci"] == pytest.approx(ci, abs=0.035)
            assert e["permutation"]["p"] == pytest.approx(p, abs=0.03)

    def test_paired(self):
        r = est.estimation([D["Control 1"], D["Test 1"]], paired=True,
                           effects=["mean_diff", "hedges_g"])
        md, g = r["comparisons"][0]["effects"]
        assert md["difference"] == pytest.approx(0.480290, abs=1e-6)
        assert md["ci"] == pytest.approx([0.241038, 0.748531], abs=0.03)
        assert g["difference"] == pytest.approx(1.025525, abs=1e-6)
        assert g["ci"] == pytest.approx([0.409142, 1.568398], abs=0.06)

    def test_sequential(self):
        r = est.estimation([D["Control 1"], D["Test 1"], D["Test 2"],
                            D["Test 3"]], design="repeated_sequential")
        assert r["paired"]
        c = r["comparisons"]
        assert c[1]["effects"][0]["difference"] == pytest.approx(-1.021848,
                                                                 abs=1e-6)
        assert c[1]["effects"][0]["ci"] == pytest.approx(
            [-1.353514, -0.709260], abs=0.035)
        assert c[2]["effects"][0]["ci"] == pytest.approx(
            [0.152922, 1.200993], abs=0.05)
        assert c[2]["effects"][0]["permutation"]["p"] == pytest.approx(
            0.022, abs=0.012)


class TestBca:
    def test_matches_scipy_bca(self):
        rng = np.random.default_rng(3)
        c, t = rng.normal(5, 1.5, 15), rng.gamma(4, 1.4, 18)

        def stat(x, y, axis=-1):
            return np.mean(y, axis=axis) - np.mean(x, axis=axis)

        ref = sps.bootstrap((c, t), stat, method="BCa", n_resamples=50000,
                            random_state=0, vectorized=True)
        r = est.bootstrap_effect(c, t, n_boot=50000, seed=1)
        width = r["ci"][1] - r["ci"][0]
        assert r["ci"][0] == pytest.approx(ref.confidence_interval.low,
                                           abs=0.03 * width)
        assert r["ci"][1] == pytest.approx(ref.confidence_interval.high,
                                           abs=0.03 * width)

    def test_large_sample_matches_welch(self):
        rng = np.random.default_rng(8)
        c, t = rng.normal(0, 1, 300), rng.normal(0.3, 1.4, 250)
        r = est.bootstrap_effect(c, t, n_boot=20000, seed=2)
        w = sps.ttest_ind(t, c, equal_var=False).confidence_interval()
        se = math.sqrt(c.var(ddof=1) / 300 + t.var(ddof=1) / 250)
        assert r["ci"][0] == pytest.approx(w.low, abs=0.1 * se)
        assert r["ci"][1] == pytest.approx(w.high, abs=0.1 * se)

    def test_acceleration_formula(self):
        jack = np.array([1.0, 2.0, 4.0, 7.0])
        m = jack.mean()
        a = np.sum((m - jack) ** 3) / (6 * np.sum((m - jack) ** 2) ** 1.5)
        boot = np.linspace(-1, 9, 1001)
        r = est.bca_interval(boot, 3.0, jack)
        assert r["acceleration"] == pytest.approx(a)
        z0 = sps.norm.ppf((np.sum(boot < 3) + 0.5 * np.sum(boot == 3))
                          / boot.size)
        assert r["bias_correction"] == pytest.approx(z0)

    def test_reproducible_and_seeded(self):
        a = est.bootstrap_effect(D["Control 1"], D["Test 2"], seed=5)
        b = est.bootstrap_effect(D["Control 1"], D["Test 2"], seed=5)
        c = est.bootstrap_effect(D["Control 1"], D["Test 2"], seed=6)
        assert a["ci"] == b["ci"] and a["ci"] != c["ci"]

    def test_distribution_summary(self):
        r = est.bootstrap_effect(D["Control 1"], D["Test 1"], seed=1)
        pct = list(r["bootstrap"]["percentiles"].values())
        assert pct == sorted(pct)
        kde = r["bootstrap"]["kde"]
        area = np.trapezoid(kde["density"], kde["x"])
        assert area == pytest.approx(1.0, abs=0.02)

    def test_effect_values(self):
        c, t = D["Control 1"], D["Test 1"]
        sp = math.sqrt((19 * c.var(ddof=1) + 19 * t.var(ddof=1)) / 38)
        d = (t.mean() - c.mean()) / sp
        assert est.effect_value(c, t, "cohens_d") == pytest.approx(d)
        gt = np.sum(t[:, None] > c[None, :])
        lt = np.sum(t[:, None] < c[None, :])
        assert est.effect_value(c, t, "cliffs_delta") == pytest.approx(
            (gt - lt) / 400)
        assert est.effect_value(c, t, "median_diff", paired=True) == \
            pytest.approx(np.median(t - c))


class TestPermutation:
    def test_exact_unpaired_brute_force(self):
        c, t = [1.1, 2.3, 0.7, 1.9], [2.8, 3.1, 1.5, 4.0, 2.2]
        pooled = np.array(c + t)
        obs = abs(np.mean(t) - np.mean(c))
        hits = tot = 0
        for idx in combinations(range(9), 4):
            m = np.zeros(9, bool)
            m[list(idx)] = True
            tot += 1
            hits += abs(pooled[~m].mean() - pooled[m].mean()) >= obs - 1e-12
        r = est.permutation_test(c, t, n_permutations=5000)
        assert r["exact"] and r["n_permutations"] == 126
        assert r["p"] == pytest.approx(hits / tot)

    def test_exact_paired_sign_flips(self):
        c = np.array([3.0, 4.1, 2.2, 5.0, 3.3, 4.4])
        t = c + np.array([0.5, 1.2, -0.3, 0.9, 0.4, 1.5])
        d = t - c
        obs = abs(d.mean())
        hits = sum(abs((d * s).mean()) >= obs - 1e-12
                   for s in product((1, -1), repeat=6))
        r = est.permutation_test(c, t, paired=True)
        assert r["exact"] and r["p"] == pytest.approx(hits / 64)

    def test_monte_carlo(self):
        r = est.permutation_test(D["Control 1"], D["Test 3"],
                                 n_permutations=4000)
        assert not r["exact"]
        ref = sps.permutation_test(
            (D["Test 3"], D["Control 1"]),
            lambda x, y, axis: np.mean(x, axis=axis) - np.mean(y, axis=axis),
            n_resamples=20000, random_state=0, vectorized=True).pvalue
        assert r["p"] == pytest.approx(ref, abs=0.03)


class TestDesigns:
    def test_multi_two_group(self):
        r = est.estimation([D["Control 1"], D["Test 1"], D["Control 2"],
                            D["Test 2"]],
                           ["C1", "T1", "C2", "T2"], design="multi_two_group",
                           permutation=False)
        assert [(c["control"], c["test"]) for c in r["comparisons"]] == \
            [("C1", "T1"), ("C2", "T2")]
        assert "permutation" not in r["comparisons"][0]["effects"][0]

    def test_baseline_and_cliffs_skipped_when_paired(self):
        r = est.estimation([D["Control 1"], D["Test 1"], D["Test 2"]],
                           design="repeated_baseline",
                           effects=["mean_diff", "cliffs_delta"],
                           n_boot=1000, n_permutations=500)
        assert all(len(c["effects"]) == 1 for c in r["comparisons"])
        assert r["plot"]["paired_lines"]

    def test_missing_values(self):
        r = est.estimation([[1, 2, None, 4, 5], [2, 3, 4, None, 7]],
                           paired=True, n_boot=500, n_permutations=100)
        assert r["comparisons"][0]["n_control"] == 3

    def test_api(self):
        data = {"datasets": [
            {"name": "Control 1", "ys": [[v] for v in D["Control 1"]]},
            {"name": "Test 1", "ys": [[v] for v in D["Test 1"]]}]}
        r = analyze({"analysis": "estimation", "data": data,
                     "options": {"effects": ["mean_diff", "cliffs_delta"],
                                 "n_boot": 2000}})
        assert "error" not in r, r.get("error")
        assert r["groups"][0]["n"] == 20
        assert len(r["comparisons"][0]["effects"]) == 2
        bad = analyze({"analysis": "estimation", "data": data,
                       "options": {"n_boot": 10 ** 6}})
        assert "error" in bad
