"""Multiplicity corrections (opendose.fdr) and compact letter display
(opendose.letters), cross-checked against statsmodels and published
letter assignments."""

import math
from itertools import combinations

import numpy as np
import pytest
from statsmodels.stats.multitest import multipletests

from opendose import anova, fdr, letters
from opendose.api import analyze

SM = {"bh": "fdr_bh", "by": "fdr_by", "holm_sidak": "holm-sidak",
      "sidak": "sidak", "bonferroni": "bonferroni"}


def _pvalue_sets(seed=7, count=200):
    rng = np.random.default_rng(seed)
    for t in range(count):
        m = int(rng.integers(1, 30))
        p = np.concatenate([rng.uniform(0, 1, m), rng.uniform(0, 0.03, m)])
        p = rng.permutation(p)[:m]
        if t % 5 == 0:
            p = np.round(p, 2)  # ties
        yield p


class TestAgainstStatsmodels:
    @pytest.mark.parametrize("method", list(SM))
    def test_adjusted_and_flags(self, method):
        for p in _pvalue_sets():
            r = fdr.adjust(p, method, alpha=0.05, q=0.05)
            rej, adj, _, _ = multipletests(p, alpha=0.05, method=SM[method])
            assert r["adjusted"] == pytest.approx(list(adj), abs=1e-12)
            assert r["significant"] == [bool(x) for x in rej]
            assert r["discoveries"] == int(rej.sum())

    @pytest.mark.parametrize("q", [0.01, 0.05, 0.1, 0.25])
    def test_bky_discoveries(self, q):
        for p in _pvalue_sets(seed=11):
            r = fdr.adjust(p, "bky", q=q)
            rej = multipletests(p, alpha=q, method="fdr_tsbky")[0]
            assert r["significant"] == [bool(x) for x in rej]
            assert r["discoveries"] == int(rej.sum())

    def test_bky_q_value_is_the_border_q(self):
        # q = the Q at which the comparison is right on the border of
        # being a discovery; independent of the Q entered.
        for p in _pvalue_sets(seed=3, count=120):
            qv = np.array(fdr.adjust(p, "bky", q=0.05)["adjusted"])
            assert list(qv) == fdr.adjust(p, "bky", q=0.2)["adjusted"]
            for i in range(p.size):
                if not 0 < qv[i] < 1:
                    continue
                above = multipletests(p, alpha=qv[i] * (1 + 1e-9),
                                      method="fdr_tsbky")[0]
                below = multipletests(p, alpha=qv[i] * (1 - 1e-9),
                                      method="fdr_tsbky")[0]
                assert above[i] and not below[i]

    def test_q_values_not_below_p(self):
        # guide: "The q values are generally larger than the
        # corresponding P value" (equal at most for the largest P)
        for p in _pvalue_sets(seed=5, count=50):
            for method in ("bh", "by"):
                adj = np.array(fdr.adjust(p, method)["adjusted"])
                assert np.all(adj >= p - 1e-15)


class TestGuideFacts:
    def test_thresholds_match_guide_table(self):
        n, q = 20, 0.05
        bh = fdr.thresholds(n, "bh", q=q)
        assert bh[0] == pytest.approx(q / n) and bh[-1] == pytest.approx(q)
        harm = sum(1 / i for i in range(1, n + 1))
        by = fdr.thresholds(n, "by", q=q)
        assert by[0] == pytest.approx(q / (n * harm))
        assert by[-1] == pytest.approx(q / harm)
        bky = fdr.thresholds(n, "bky", q=q, n_true=12)
        assert bky[0] == pytest.approx(q / ((1 + q) * 12))
        assert bky[-1] == pytest.approx(q / (1 + q) * n / 12)

    def test_all_p_below_q_all_discoveries(self):
        p = [0.001, 0.02, 0.03, 0.049]
        for method in ("bh", "bky"):
            assert fdr.adjust(p, method, q=0.05)["discoveries"] == 4

    def test_all_p_above_q_no_discoveries(self):
        p = [0.06, 0.2, 0.5]
        for method in ("bh", "by", "bky"):
            assert fdr.adjust(p, method, q=0.05)["discoveries"] == 0

    def test_bky_ntrue_estimate(self):
        p = [0.0001, 0.0004, 0.0019, 0.0095, 0.0201, 0.0278, 0.0298,
             0.0344, 0.0459, 0.3240, 0.4262, 0.5719, 0.6528, 0.7590, 1.0]
        r = fdr.adjust(p, "bky", q=0.05)
        rej = multipletests(p, alpha=0.05, method="fdr_tsbky")[0]
        # first stage (BH at 0.05/1.05) finds 4 -> Ntrue = 11; the second
        # stage (BH at 0.05/1.05 * 15/11) finds 8
        assert r["n_true_null_estimate"] == 11
        assert r["discoveries"] == int(rej.sum()) == 8

    def test_holm_sidak_step_down_rule(self):
        # Prism 8 algorithm document: compare the i-th smallest P with
        # 1 - (1 - alpha)^(1/(K - i + 1)); stop at the first failure.
        p = [0.01, 0.04, 0.03, 0.005, 0.2]
        alpha, k = 0.05, 5
        order = sorted(range(k), key=lambda i: p[i])
        expected = [False] * k
        for step, i in enumerate(order):
            if p[i] <= 1 - (1 - alpha) ** (1 / (k - step)):
                expected[i] = True
            else:
                break
        assert fdr.adjust(p, "holm_sidak", alpha=alpha)["significant"] == expected

    def test_missing_values_left_out(self):
        r = fdr.adjust([0.01, None, float("nan"), 0.04], "bonferroni")
        assert r["n"] == 2 and r["n_omitted"] == 2
        assert r["adjusted"] == [pytest.approx(0.02), None, None,
                                 pytest.approx(0.08)]
        assert r["significant"][1] is None

    def test_none_method(self):
        r = fdr.adjust([0.01, 0.06], "none", alpha=0.05)
        assert r["adjusted"] == [None, None]
        assert r["significant"] == [True, False]

    def test_bad_inputs(self):
        with pytest.raises(ValueError):
            fdr.adjust([0.5, 1.2], "bh")
        with pytest.raises(ValueError):
            fdr.adjust([0.5], "nonsense")

    def test_api_stack_of_p_values(self):
        out = analyze({"analysis": "fdr_adjust",
                       "data": {"p_values": [0.04, 0.001, None, 0.3],
                                "labels": ["a", "b", "c", "d"]},
                       "options": {"method": "bh", "q_percent": 5}})
        assert out["q"] == pytest.approx(0.05)
        assert [r["rank"] for r in out["rows"]] == [2, 1, None, 3]
        assert out["rows"][1]["adjusted"] == pytest.approx(0.003)
        assert out["rows"][0]["adjusted"] == pytest.approx(0.06)
        assert out["discoveries"] == 1
        # column-table form
        out2 = analyze({"analysis": "fdr_adjust",
                        "data": {"datasets": [{"ys": [[0.04], [0.001], [],
                                                      [0.3]]}]},
                        "options": {"method": "bh", "q": 5}})
        assert out2["adjusted"] == out["adjusted"]


# --- compact letter display ---------------------------------------------

# User guide "Compact Letter Display": two-way ANOVA, Tukey, all cells.
# Means relative to "Serum starved:Wild-type cells" from the listed
# differences; "Yes" rows of the table are the significant pairs.
GUIDE_NAMES = ["SS:WT", "SS:GPP5", "SS:GPP7", "NC:WT", "NC:GPP5", "NC:GPP7"]
GUIDE_MEANS = [0.0, 54.9, 42.5, -14.1, -8.5, 4.1]
GUIDE_SIG = {("SS:WT", "SS:GPP5"), ("SS:WT", "SS:GPP7"),
             ("SS:GPP5", "NC:WT"), ("SS:GPP5", "NC:GPP5"),
             ("SS:GPP5", "NC:GPP7"), ("SS:GPP7", "NC:WT"),
             ("SS:GPP7", "NC:GPP5"), ("SS:GPP7", "NC:GPP7"),
             ("NC:WT", "NC:GPP7")}


def _guide_comparisons():
    return [{"pair": f"{a} vs. {b}", "significant": (a, b) in GUIDE_SIG}
            for a, b in combinations(GUIDE_NAMES, 2)]


class TestLetters:
    def test_guide_example(self):
        r = letters.compact_letters(GUIDE_NAMES, _guide_comparisons(),
                                    means=GUIDE_MEANS)
        got = {g["name"]: g["letters"] for g in r["groups"]}
        # guide: GPP5 and GPP7 (serum starved) share "A"; serum-starved
        # wild type has "B" and "C"; normal-culture wild type "C";
        # normal-culture GPP7 "B".
        assert got["SS:GPP5"] == "A" and got["SS:GPP7"] == "A"
        assert got["SS:WT"] == "BC"
        assert got["NC:WT"] == "C"
        assert got["NC:GPP7"] == "B"
        assert got["NC:GPP5"] == "BC"
        assert r["letters"][0] == {"letter": "A",
                                   "groups": ["SS:GPP5", "SS:GPP7"]}

    def test_agricolae_sweetpotato_tukey(self):
        # agricolae (de Mendiburu) HSD.test example, data(sweetpotato),
        # aov(yield ~ virus): MSerror 22.489, MSD 12.39967; groups
        # oo "a", ff "ab", cc "bc", fc "c".
        data = {"cc": [28.5, 21.7, 23.0], "fc": [14.9, 10.6, 13.1],
                "ff": [41.8, 39.2, 28.0], "oo": [38.2, 40.4, 32.1]}
        names = list(data)
        mc = anova.multiple_comparisons(list(data.values()), "tukey",
                                        names=names)
        from scipy import stats
        msd = stats.studentized_range.ppf(0.95, 4, 8) * math.sqrt(
            22.48917 / 3)
        assert msd == pytest.approx(12.39967, abs=1e-4)
        r = letters.compact_letters(names, mc["comparisons"],
                                    means=[np.mean(v) for v in data.values()],
                                    labels="lower")
        got = {g["name"]: g["letters"] for g in r["groups"]}
        assert got == {"oo": "a", "ff": "ab", "cc": "bc", "fc": "c"}
        assert r["order"] == ["oo", "ff", "cc", "fc"]

    def test_no_differences_one_letter(self):
        r = letters.letters_from_matrix(["x", "y", "z"],
                                        [[False] * 3 for _ in range(3)])
        assert [g["letters"] for g in r["groups"]] == ["A", "A", "A"]

    def test_all_different(self):
        sig = [[i != j for j in range(4)] for i in range(4)]
        r = letters.letters_from_matrix(list("wxyz"), sig,
                                        means=[1, 4, 3, 2])
        got = {g["name"]: g["letters"] for g in r["groups"]}
        assert got == {"x": "A", "y": "B", "z": "C", "w": "D"}

    def test_labels_and_order(self):
        sig = [[False, True], [True, False]]
        r = letters.letters_from_matrix(["lo", "hi"], sig, means=[1, 2],
                                        labels="numbers", order="ascending")
        assert [g["letters"] for g in r["groups"]] == ["1", "2"]
        r = letters.letters_from_matrix(["lo", "hi"], sig, means=[1, 2],
                                        labels="lower")
        assert [g["letters"] for g in r["groups"]] == ["b", "a"]

    def test_many_letters_beyond_z(self):
        k = 30
        sig = [[i != j for j in range(k)] for i in range(k)]
        r = letters.letters_from_matrix([f"g{i}" for i in range(k)], sig)
        tags = [g["letters"] for g in r["groups"]]
        assert tags[25] == "Z" and tags[26] == "AA" and len(set(tags)) == k

    def test_p_values_with_alpha_and_names_containing_vs(self):
        names = ["a vs. b", "c"]
        comps = [{"pair": "a vs. b vs. c", "p_adjusted": 0.03}]
        r = letters.compact_letters(names, comps, alpha=0.05)
        assert [g["letters"] for g in r["groups"]] == ["A", "B"]
        r = letters.compact_letters(names, comps, alpha=0.01)
        assert [g["letters"] for g in r["groups"]] == ["A", "A"]

    @pytest.mark.parametrize("seed", range(40))
    def test_property_sharing_iff_not_significant(self, seed):
        rng = np.random.default_rng(seed)
        k = int(rng.integers(2, 10))
        dens = rng.uniform(0.1, 0.9)
        sig = [[False] * k for _ in range(k)]
        for i, j in combinations(range(k), 2):
            sig[i][j] = sig[j][i] = bool(rng.uniform() < dens)
        means = list(rng.normal(size=k))
        for sweep in (True, False):
            r = letters.letters_from_matrix([str(i) for i in range(k)], sig,
                                            means=means, sweep=sweep)
            sets = [set(g["letters"]) for g in r["groups"]]
            assert all(sets)
            for i, j in combinations(range(k), 2):
                assert bool(sets[i] & sets[j]) == (not sig[i][j])
            # letter -> groups listing agrees with the per-group strings
            for entry in r["letters"]:
                for name in entry["groups"]:
                    assert entry["letter"] in sets[int(name)]

    def test_sweep_never_adds_letters(self):
        rng = np.random.default_rng(99)
        for _ in range(30):
            k = 7
            sig = [[False] * k for _ in range(k)]
            for i, j in combinations(range(k), 2):
                sig[i][j] = sig[j][i] = bool(rng.uniform() < 0.5)
            a = letters.letters_from_matrix(list("abcdefg"), sig, sweep=True)
            b = letters.letters_from_matrix(list("abcdefg"), sig, sweep=False)
            assert (sum(len(g["letters"]) for g in a["groups"])
                    <= sum(len(g["letters"]) for g in b["groups"]))

    def test_api(self):
        out = analyze({"analysis": "compact_letters",
                       "data": {"groups": GUIDE_NAMES, "means": GUIDE_MEANS,
                                "comparisons": _guide_comparisons()},
                       "options": {}})
        assert out["analysis"] == "compact_letters"
        assert out["groups"][0]["letters"] == "BC"
