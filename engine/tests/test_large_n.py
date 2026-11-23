"""Large-n paths of the default XY and column analyses (FEATURE-PLAN P-10).

- linregress.runs_test: up to RUNS_EXACT_INT_MAX_N nonzero residuals the
  exact P is summed in big integers, unchanged (bit-identical); above it
  the same exact distribution is summed in floating point. Reference
  values from engine/tests/reference/large_tables.py (brute force,
  fractions and 60-digit decimals; nothing from opendose).
- diagnostics.replicates_test groups equal X by sorting instead of one
  pass over X per distinct value: the result is identical to the old loop.
- columnstats Anderson-Darling P: the D'Agostino-Stephens formula turns
  upward (and overflows) at large A2*; the P is bounded there.
- residuals.column_residuals withholds its per-value points above
  POINTS_MAX_N (a 204 MB answer at 1,000,000 values) and says so; every
  other number is the one computed with the points.
"""

import json
import math
import time
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction
from pathlib import Path

import numpy as np
import pytest

from opendose import api, columnstats, linregress, residuals
from opendose.diagnostics import replicates_test
from opendose.linregress import runs_test
from opendose.nlfit import fit_model

REF = json.loads((Path(__file__).parent / "reference"
                  / "large_tables.json").read_text())


def _reference_signs():
    """The sign sequences of the reference script, in its order."""
    rng = np.random.default_rng(20261123)
    out = {}
    for n, share in [(2000, 0.5), (2001, 0.5), (2001, 0.1), (3000, 0.3)]:
        out[f"n{n}_share{share}"] = np.where(rng.random(n) < share, 1, -1).tolist()
    for n, share in [(200_000, 0.5), (500_000, 0.5), (500_000, 0.1)]:
        out[f"n{n}_share{share}"] = np.where(rng.random(n) < share, 1, -1).tolist()
    stay = rng.random(200_000) < 0.503
    signs, s = [], 1
    for keep in stay:
        s = s if keep else -s
        signs.append(s)
    out["n200000_persist0.503"] = signs
    return out


SIGNS = _reference_signs()


def _most_runs(n1, n2):
    return 2 * min(n1, n2) + (n1 != n2)


def _arrangement(n1, n2, r):
    """n1 plus and n2 minus signs in exactly r runs."""
    for first, other in ((1, -1), (-1, 1)):
        k_first, k_other = (r + 1) // 2, r // 2
        n_first, n_other = (n1, n2) if first == 1 else (n2, n1)
        if 1 <= k_first <= n_first and k_other <= n_other and (k_other >= 1 or n_other == 0):
            a = [n_first - k_first + 1] + [1] * (k_first - 1)
            b = [n_other - k_other + 1] + [1] * (k_other - 1) if k_other else []
            seq = []
            for i in range(k_first):
                seq += [first] * a[i]
                if i < k_other:
                    seq += [other] * b[i]
            return seq
    raise AssertionError((n1, n2, r))


class TestRunsTest:
    def test_brute_force_small_n(self):
        """Every (n1, n2, r) of the brute-force enumeration: the big-integer
        path is exact, and the floating-point path agrees to 1e-12."""
        for b in REF["brute"]:
            assert linregress._runs_p_float(b["n1"], b["n2"], b["r"]) == \
                pytest.approx(b["p"], rel=1e-12)
            if b["r"] > _most_runs(b["n1"], b["n2"]):
                assert b["p"] == 1.0
                continue
            seq = _arrangement(b["n1"], b["n2"], b["r"])
            rt = runs_test(seq)
            assert (rt["n_runs"], rt["n_positive"], rt["n_negative"]) == \
                (b["r"], b["n1"], b["n2"])
            assert rt["p"] == b["p"]
            assert rt["p_method"] == "exact"

    def test_float_path_forced_on_small_n(self, monkeypatch):
        monkeypatch.setattr(linregress, "RUNS_EXACT_INT_MAX_N", 0)
        for b in REF["brute"]:
            if b["r"] > _most_runs(b["n1"], b["n2"]):
                continue
            rt = runs_test(_arrangement(b["n1"], b["n2"], b["r"]))
            assert rt["p_method"] == "exact_float"
            assert rt["p"] == pytest.approx(b["p"], rel=1e-12)

    def test_threshold(self):
        assert linregress.RUNS_EXACT_INT_MAX_N == 2000
        at, above = REF["moderate"][0], REF["moderate"][1]
        assert at["n_positive"] + at["n_negative"] == 2000
        rt = runs_test(SIGNS[at["name"]])
        assert rt["p_method"] == "exact"
        assert rt["p"] == at["p"]          # bit-identical to Fraction
        rt = runs_test(SIGNS[above["name"]])
        assert rt["p_method"] == "exact_float"
        assert rt["p"] == pytest.approx(above["p"], rel=1e-12)

    def test_exact_below_threshold_is_the_fraction(self):
        """Below the threshold P is float(Fraction(count, C(N, n1)))."""
        rng = np.random.default_rng(5)
        for n in (7, 40, 333, 2000):
            signs = np.where(rng.random(n) < 0.4, 1, -1).tolist()
            rt = runs_test(signs)
            n1, n2, r = rt["n_positive"], rt["n_negative"], rt["n_runs"]
            count = 0
            for j in range(2, r + 1):
                if j % 2 == 0:
                    k = j // 2
                    count += 2 * math.comb(n1 - 1, k - 1) * math.comb(n2 - 1, k - 1)
                else:
                    k = (j - 1) // 2
                    count += (math.comb(n1 - 1, k) * math.comb(n2 - 1, k - 1)
                              + math.comb(n1 - 1, k - 1) * math.comb(n2 - 1, k))
            assert rt["p"] == min(float(Fraction(count, math.comb(n1 + n2, n1))), 1.0)

    @pytest.mark.parametrize("case", REF["moderate"][1:] + REF["large"],
                             ids=lambda c: c["name"])
    def test_float_path_against_reference(self, case):
        t0 = time.perf_counter()
        rt = runs_test(SIGNS[case["name"]])
        assert time.perf_counter() - t0 < 10  # linear: about 0.2 s at 500,000
        assert (rt["n_runs"], rt["n_positive"], rt["n_negative"]) == \
            (case["n_runs"], case["n_positive"], case["n_negative"])
        assert rt["p_method"] == "exact_float"
        assert rt["p"] == pytest.approx(case["p"], rel=1e-12)

    def test_pinned_large_values(self):
        """Display-precision pins from the reference (60-digit decimals)."""
        got = {c["name"]: runs_test(SIGNS[c["name"]])["p"] for c in REF["large"]}
        assert f"{got['n500000_share0.5']:.4g}" == "0.5546"
        assert f"{got['n500000_share0.1']:.4g}" == "0.2747"
        assert f"{got['n200000_persist0.503']:.4g}" == "0.0006995"

    def test_normal_approximation_is_not_close_enough(self):
        """Why the engine does not use the Wald-Wolfowitz normal
        approximation: with one sign at 10% it misses the exact P in the
        third significant digit, at N = 2,001 and at N = 500,000."""
        for name in ("n2001_share0.1", "n500000_share0.1"):
            c = next(x for x in REF["moderate"] + REF["large"] if x["name"] == name)
            ww = c["wald_wolfowitz"]
            assert ww["z"] == pytest.approx(ww["z_statsmodels"], rel=1e-12)
            assert f"{ww['p_lower_continuity']:.4g}" != f"{c['p']:.4g}"

    def test_edge_cases(self):
        assert runs_test([]) == {"n_runs": 0, "n_positive": 0, "n_negative": 0, "p": None}
        assert runs_test([1])["p"] is None
        assert runs_test([-1, -1])["p"] is None                # all one sign
        assert runs_test([0, 0, 0])["n_runs"] == 0             # zeros dropped
        two = runs_test([1, -1])
        assert (two["n_runs"], two["p"]) == (2, 1.0)           # R = 2 always
        assert runs_test([0, 1, 0, -1]) == two
        big_same = runs_test([1] * 500_000)
        assert big_same["p"] is None and big_same["n_runs"] == 1
        # the most runs possible: P = 1 on both paths
        alt = [1, -1] * 1000 + [1]
        assert runs_test(alt)["p"] == pytest.approx(1.0, abs=1e-12)
        assert runs_test([1, -1] * 1000)["p"] == 1.0
        # two runs among 2,001: far below any float (P = 2 / C(2001, 1000))
        sep = runs_test([1] * 1000 + [-1] * 1001)
        assert sep["p_method"] == "exact_float" and sep["p"] == 0.0
        # one sign alone in a long sequence: P(R <= 2) = 2 / N exactly
        lone = runs_test([-1] * 2500 + [1])
        assert lone["n_runs"] == 2
        assert lone["p"] == pytest.approx(2 / 2501, rel=1e-12)

    def test_invariant_to_swapping_signs_and_reversing(self):
        s = SIGNS["n200000_share0.5"]
        p = runs_test(s)["p"]
        assert runs_test([-v for v in s])["p"] == pytest.approx(p, rel=1e-12)
        assert runs_test(s[::-1])["p"] == pytest.approx(p, rel=1e-12)


def _to_fixed3(v):
    return str(Decimal(v).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP))


def test_e2e_xy_linear_regression():
    """The XY table web/scripts/e2e-large.mjs pastes (500,000 rows): the
    slope against statsmodels OLS and the runs test against the reference."""
    ref = REF["e2e_xy"]
    n, seed = ref["rows"], 11
    for _ in range(2 * n):
        seed = (seed * 16807) % 2147483647
    xs, ys = [], []
    for i in range(n):
        seed = (seed * 16807) % 2147483647
        xs.append(float(_to_fixed3(i / 1000)))
        ys.append(float(_to_fixed3(2 + 0.5 * i / 1000 + seed / 2147483647)))
    t0 = time.perf_counter()
    r = api.analyze({"analysis": "linear_regression",
                     "data": {"x": xs, "datasets": [{"name": "Y", "ys": [[v] for v in ys]}]},
                     "options": {}})
    assert time.perf_counter() - t0 < 30
    fit = r["datasets"][0]["fit"]
    assert fit["slope"]["value"] == pytest.approx(ref["slope"], rel=1e-9)
    assert fit["y_intercept"]["value"] == pytest.approx(ref["intercept"], rel=1e-9)
    rt = fit["runs_test"]
    assert (rt["n_runs"], rt["n_positive"], rt["n_negative"]) == \
        (ref["n_runs"], ref["n_positive"], ref["n_negative"])
    assert rt["p"] == pytest.approx(ref["p"], rel=1e-10)
    assert f"{rt['p']:.4g}" == "0.3926"


def test_e2e_column_t_test():
    """The column table e2e-large.mjs pastes first (500,000 rows, two
    groups): the unpaired t test against scipy's ttest_ind."""
    ref = REF["e2e_column"]
    seed, a, b = 11, [], []
    for _ in range(ref["rows"]):
        seed = (seed * 16807) % 2147483647
        a.append(float(_to_fixed3(10 + 3 * seed / 2147483647)))
        seed = (seed * 16807) % 2147483647
        b.append(float(_to_fixed3(10.4 + 3 * seed / 2147483647)))
    r = api.analyze({"analysis": "ttest", "options": {"kind": "unpaired"},
                     "data": {"datasets": [{"name": "A", "ys": [[v] for v in a]},
                                           {"name": "B", "ys": [[v] for v in b]}]}})
    assert r["difference"] == pytest.approx(ref["difference"], rel=1e-9)
    assert r["se_difference"] == pytest.approx(ref["se_difference"], rel=1e-9)
    assert r["t"] == pytest.approx(abs(ref["t"]), rel=1e-9)   # the engine reports |t|
    assert r["df"] == ref["df"]
    assert r["p_two_tailed"] == ref["p_two_tailed"] == 0.0   # below the smallest double


class TestReplicatesTest:
    @staticmethod
    def _loop(x, y, fit):
        """The original computation (one mask over X per distinct X)."""
        x, y = np.asarray(x, float), np.asarray(y, float)
        ss_pe, n_distinct = 0.0, 0
        for xv in np.unique(x):
            grp = y[x == xv]
            n_distinct += 1
            if grp.size > 1:
                ss_pe += float(np.sum((grp - grp.mean()) ** 2))
        return ss_pe, n_distinct

    def test_identical_to_the_loop(self):
        rng = np.random.default_rng(9)
        xs = [
            np.repeat(np.linspace(-9, -5, 9), 3),
            rng.integers(0, 7, 60).astype(float),                 # unsorted ties
            np.array([0.0, -0.0, 0.0, 1.0, 1.0, 2.0, -0.0]),      # signed zeros
            rng.normal(size=50),                                   # no replicates
            np.array([1.0, 1.0, 2.0, 2.0, 3.0, 3.0]) * 1e12,
            np.array([1.0, np.nan, 2.0, 2.0, np.nan, 3.0, 3.0]),  # missing X
        ]
        for x in xs:
            y = 3 * np.nan_to_num(x) + rng.normal(size=x.size)
            fit = fit_model(np.nan_to_num(x).tolist(), y.tolist(), "straight_line")
            got = replicates_test(x, y, fit)
            ss_pe, n_distinct = self._loop(x, y, fit)
            k = x.size - fit["goodness"]["df"]
            if got is None:
                assert x.size - n_distinct < 1 or n_distinct - k < 1
            else:
                assert got["ss_pure_error"] == ss_pe        # bit-identical
                assert got["df_pure_error"] == x.size - n_distinct

    def test_large_n_is_fast(self):
        n = 200_000
        x = np.arange(n) / 1000.0
        y = 0.5 * x + np.random.default_rng(1).random(n)
        fit = fit_model(x[:1000].tolist(), y[:1000].tolist(), "straight_line")
        fit = dict(fit, goodness=dict(fit["goodness"], df=n - 2))
        t0 = time.perf_counter()
        assert replicates_test(x, y, fit) is None   # no replicates: no test
        assert time.perf_counter() - t0 < 5         # was ~10 s (quadratic)


class TestAndersonDarlingLargeA:
    def test_bounded_and_noted(self):
        # 200,000 uniform values: A2 near 2,000, past the formula's turn
        vals = (10 + 3 * np.random.default_rng(11).random(200_000)).tolist()
        ad = columnstats.normality_tests(vals)["anderson_darling"]
        assert ad["A2"] > columnstats.AD_P_TURN
        turn = columnstats.AD_P_TURN
        assert ad["p"] == pytest.approx(math.exp(1.2937 - 5.709 * turn + 0.0186 * turn ** 2))
        assert 0 < ad["p"] < 1e-189
        assert ad["passed_alpha_05"] is False
        assert "beyond the range" in ad["note"]

    def test_unchanged_below_the_turn(self):
        for a in (0.1, 0.3, 0.5, 0.7, 5.0, 13.0, 100.0, 153.0):
            n = 10 ** 6   # makes the A2* correction negligible
            expected = (math.exp(1.2937 - 5.709 * a + 0.0186 * a * a) if a >= 0.6
                        else columnstats._anderson_darling_p(a, n))
            assert columnstats._anderson_darling_p(a, n) == pytest.approx(expected, rel=1e-5)
        p_turn = columnstats._anderson_darling_p(columnstats.AD_P_TURN, 10 ** 12)
        for a in (154.0, 500.0, 5000.0):
            assert columnstats._anderson_darling_p(a, 10 ** 12) == pytest.approx(p_turn, rel=1e-9)

    def test_column_statistics_runs_at_500k(self):
        vals = (10 + 3 * np.random.default_rng(3).random(500_000)).tolist()
        r = api.analyze({"analysis": "column_statistics",
                         "data": {"datasets": [{"name": "A", "ys": [[v] for v in vals]}]},
                         "options": {}})
        assert "error" not in r
        d = r["datasets"][0]
        assert d["descriptive"]["n"] == 500_000
        assert d["descriptive"]["mean"] == pytest.approx(np.mean(vals), rel=1e-12)
        assert d["normality"]["dagostino_pearson"]["p"] < 1e-10
        assert "note" in d["normality"]["shapiro_wilk"]   # n above 5,000


class TestResidualPointsWithheld:
    @staticmethod
    def _groups(n, seed=4):
        rng = np.random.default_rng(seed)
        return [(10 + rng.normal(size=n)).tolist(), (11 + 2 * rng.normal(size=n)).tolist()]

    def test_same_numbers_without_the_points(self, monkeypatch):
        g = self._groups(30_000)                       # 60,000 values
        monkeypatch.setattr(residuals, "POINTS_MAX_N", 10 ** 9)
        full = residuals.column_residuals(g, ["A", "B"])
        monkeypatch.setattr(residuals, "POINTS_MAX_N", 50_000)
        lean = residuals.column_residuals(g, ["A", "B"])
        assert len(full["points"]) == 60_000 and "unavailable" not in full
        assert lean["points"] == [] and lean["points_withheld"] is True
        assert "up to 50,000 values" in lean["unavailable"]
        assert "number 60,000" in lean["unavailable"]
        for k in ("groups", "shapiro", "shapiro_note", "pooled_sd", "df", "n_total",
                  "n_qq", "dropped", "warnings", "note", "advice"):
            assert lean[k] == full[k], k                # bit-identical

    def test_paired_and_single_value_groups(self, monkeypatch):
        g = self._groups(60_000)
        monkeypatch.setattr(residuals, "POINTS_MAX_N", 10 ** 9)
        full = residuals.column_residuals(g, ["A", "B"], paired=True)
        g3 = g + [[5.0]]
        full3 = residuals.column_residuals(g3, ["A", "B", "C"])
        monkeypatch.setattr(residuals, "POINTS_MAX_N", 50_000)
        lean = residuals.column_residuals(g, ["A", "B"], paired=True)
        lean3 = residuals.column_residuals(g3, ["A", "B", "C"])
        for a, b in ((lean, full), (lean3, full3)):
            assert a["points"] == [] and a["points_withheld"]
            for k in ("shapiro", "pooled_sd", "df", "n_qq", "warnings"):
                assert a[k] == b[k], k
        assert lean3["n_qq"] == 120_000                 # the single value is left out

    def test_at_the_limit_points_are_kept(self):
        g = self._groups(25_000)                        # exactly 50,000
        r = residuals.column_residuals(g, ["A", "B"])
        assert len(r["points"]) == 50_000 and "points_withheld" not in r

    def test_api_answer_stays_small_at_1m_values(self):
        g = self._groups(500_000)
        t0 = time.perf_counter()
        out = api.analyze_json(json.dumps({
            "analysis": "residuals_column",
            "data": {"datasets": [{"name": "A", "ys": [[v] for v in g[0]]},
                                  {"name": "B", "ys": [[v] for v in g[1]]}]},
            "options": {}}))
        assert len(out) < 20_000                        # was 204 MB
        assert time.perf_counter() - t0 < 30
        r = json.loads(out)
        assert r["n_total"] == 1_000_000 and r["shapiro"]["n"] == 1_000_000
        assert "number 1,000,000" in r["unavailable"]
