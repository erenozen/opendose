"""Every comparisons table states its unadjusted P, family size and
method (need `adjusted-vs-raw-labelled`), and Dunn's test after Friedman
on an all-pairs, vs-control or planned-pairs family (needs
`nonparametric-posthoc`, `planned-comparisons-family`).

The unadjusted P values are checked against independent computations:
pooled-variance t tests whose residual MS and df are computed here with
numpy (or statsmodels OLS contrasts), scipy's Welch t test, and the Dunn
(1964) z formula written out by hand. Values are compared at display
precision (rel 1e-6), never bit for bit.
"""

from __future__ import annotations

import math
from itertools import combinations

import numpy as np
import pytest
from scipy import stats

from opendose import mixedmodel as mm
from opendose import moretests, nested, repeated, rowtests, threeway, twoway

REL = 1e-6

G = [[4.1, 5.3, 6.2, 5.0, 4.4], [6.8, 7.4, 8.1, 7.0],
     [5.2, 9.9, 3.1, 7.7, 6.0, 8.8], [10.2, 11.0, 9.1, 12.3]]

TW = [[[3.1, 4.2, 3.8], [5.0, 5.6, 4.9, 5.3], [6.1, 7.0]],
      [[4.0, 4.4, 3.9, 4.6], [7.2, 6.8, 7.9], [6.0, 6.3, 5.7]]]

FR = [[1.2, 2.3, 3.1, 1.9, 2.8, 2.0], [2.2, 2.9, 3.9, 2.0, 3.1, 2.7],
      [3.0, 3.5, 2.8, 3.3, 4.1, 3.8], [1.0, 1.9, 2.5, 1.5, 2.0, 2.2]]

HERDS = [[[28, 26, 27, 31], [32, 27, 28, 29], [27, 25, 29, 27]],
         [[25, 24, 27, 23], [26, 28, 29, 27], [25, 26, 24, 23]],
         [[21, 19, 17, 20], [19, 18, 23, 20], [18, 20, 19, 18]]]


def _three_way_cells():
    rng = np.random.default_rng(7)
    return [[[list(np.round(10 + i + 2 * j + 1.5 * k
                            + rng.normal(0, 1, 3 + (i + j + k) % 2), 3))
              for k in range(2)] for j in range(2)] for i in range(2)]


def _pooled(groups):
    """Within-group MS and df, computed directly."""
    ss = sum(float(np.sum((np.asarray(g) - np.mean(g)) ** 2)) for g in groups)
    df = sum(len(g) for g in groups) - len(groups)
    return ss / df, df


def _t_p(diff, se, df):
    return 2.0 * stats.t.sf(abs(diff) / se, df)


def _check_family_block(block, size, method):
    assert block["size"] == size and isinstance(block["size"], int)
    assert block["method"] == method
    assert isinstance(block["label"], str) and block["label"]
    assert str(size) in block["label"]


def _check_rows(rows, size, method):
    for r in rows:
        assert r["family_size"] == size
        assert r["method"] == method
        if r.get("p_adjusted") is not None and r["p_unadjusted"] is not None:
            # (studentized range with 2 means = t: equal up to rounding)
            assert r["p_unadjusted"] <= r["p_adjusted"] * (1 + 1e-9)


# ------------------------------------------- moretests: unequal variances

class TestUnequalVariance:
    @pytest.mark.parametrize("method,family,size", [
        ("games_howell", "all", 6), ("dunnett_t3", "all", 6),
        ("tamhane_t2", "all", 6), ("welch_uncorrected", "all", 6),
        ("dunnett_t3", "control", 3), ("tamhane_t2", "control", 3)])
    def test_welch_p_unadjusted(self, method, family, size):
        res = moretests.unequal_variance_comparisons(
            G, method, family=family, control_index=1)
        assert len(res["comparisons"]) == size
        _check_rows(res["comparisons"], size, method)
        _check_family_block(res["family_info"], size, method)
        assert res["family"] == family  # pre-existing key unchanged
        for c in res["comparisons"]:
            i, j = c["a_index"], c["b_index"]
            ref = stats.ttest_ind(G[i], G[j], equal_var=False).pvalue
            assert c["p_unadjusted"] == pytest.approx(ref, rel=REL)
        if method == "welch_uncorrected":
            for c in res["comparisons"]:
                assert c["p_unadjusted"] == pytest.approx(c["p_adjusted"],
                                                          rel=1e-12)
        if method == "games_howell":
            assert res["family_info"]["label"] == \
                "Games-Howell, 6 comparisons (all pairs of 4 means)"


class TestNewmanKeuls:
    def test_pooled_t_unadjusted(self):
        ms, df = _pooled(G)
        means = [float(np.mean(g)) for g in G]
        ns = [len(g) for g in G]
        res = moretests.newman_keuls_from_stats(means, ns, ms, df)
        _check_family_block(res["family"], 6, "newman_keuls")
        _check_rows(res["comparisons"], 6, "newman_keuls")
        for c in res["comparisons"]:
            assert c["p_adjusted"] is None
            i, j = c["a_index"], c["b_index"]
            se = math.sqrt(ms * (1 / ns[i] + 1 / ns[j]))
            assert c["p_unadjusted"] == pytest.approx(
                _t_p(means[i] - means[j], se, df), rel=REL)
            # the classic unpaired t test uses only the pair's own SD; the
            # pooled one is a different (more df) test
            assert c["p_unadjusted"] != pytest.approx(
                stats.ttest_ind(G[i], G[j]).pvalue, rel=1e-3)


# -------------------------------------------------------------- two-way

def _tw_cells_ms():
    cells = [v for row in TW for v in row]
    return _pooled(cells)


class TestTwoWay:
    @pytest.mark.parametrize("method", ["tukey", "sidak", "bonferroni"])
    def test_columns_within_rows(self, method):
        res = twoway.two_way_comparisons(TW, method=method)
        ms, df = _tw_cells_ms()
        assert res["ms_residual"] == pytest.approx(ms, rel=1e-10)
        size = 3 if method == "tukey" else 6
        _check_rows(res["comparisons"], size, method)
        assert len(res["families"]) == 2
        for blk in res["families"]:
            _check_family_block(blk, size, method)
        assert res["family"]["size"] == size
        assert res["family"]["per_family"] is (method == "tukey")
        assert res["family"]["n_families"] == 2
        for c in res["comparisons"]:
            i = 0 if c["family"] == "Row 1" else 1
            a, b = [int(s.split()[-1]) - 1 for s in c["pair"].split(" vs. ")]
            x, y = TW[i][a], TW[i][b]
            se = math.sqrt(ms * (1 / len(x) + 1 / len(y)))
            assert c["p_unadjusted"] == pytest.approx(
                _t_p(np.mean(x) - np.mean(y), se, df), rel=REL)
        if method == "bonferroni":
            for c in res["comparisons"]:
                assert c["p_adjusted"] == pytest.approx(
                    min(1.0, 6 * c["p_unadjusted"]), rel=1e-10)

    def test_marginal_column_means_statsmodels(self):
        sm = pytest.importorskip("statsmodels.api")
        # cell-means model y ~ C(cell) - 1; the column marginal is the
        # n-weighted average of its cells (opendose: all values of that
        # column), so the contrast weights are n_ij / n_j.
        y, cell = [], []
        a, b = len(TW), len(TW[0])
        for i in range(a):
            for j in range(b):
                for v in TW[i][j]:
                    y.append(v)
                    cell.append(i * b + j)
        X = np.zeros((len(y), a * b))
        X[np.arange(len(y)), cell] = 1.0
        fit = sm.OLS(np.array(y), X).fit()
        n = np.array([[len(TW[i][j]) for j in range(b)] for i in range(a)])
        res = twoway.two_way_comparisons(TW, direction="column_means",
                                         method="tukey")
        _check_family_block(res["family"], 3, "tukey")
        for c in res["comparisons"]:
            j1, j2 = [int(s.split()[-1]) - 1 for s in c["pair"].split(" vs. ")]
            L = np.zeros(a * b)
            for i in range(a):
                L[i * b + j1] += n[i, j1] / n[:, j1].sum()
                L[i * b + j2] -= n[i, j2] / n[:, j2].sum()
            ref = float(np.asarray(fit.t_test(L).pvalue))
            assert c["p_unadjusted"] == pytest.approx(ref, rel=REL)
            assert c["p_unadjusted"] <= c["p_adjusted"]

    def test_row_means_single_family(self):
        res = twoway.two_way_comparisons(TW, direction="row_means",
                                         method="sidak")
        _check_rows(res["comparisons"], 1, "sidak")
        _check_family_block(res["family"], 1, "sidak")
        # one comparison: Sidak with K = 1 is the unadjusted P
        c = res["comparisons"][0]
        assert c["p_adjusted"] == pytest.approx(c["p_unadjusted"], rel=1e-12)


# ------------------------------------------------------------ three-way

class TestThreeWay:
    CELLS = _three_way_cells()

    @pytest.mark.parametrize("goal,size", [
        ("all_cells", 28), ("control", 7), ("one_factor", 12),
        ("row1_below", 4)])
    @pytest.mark.parametrize("method", ["tukey", "bonferroni", "sidak",
                                        "holm_sidak", "none"])
    def test_cell_goals(self, goal, size, method):
        if method == "none":
            mid = "fisher_lsd"
        else:
            mid = method
        res = threeway.three_way_comparisons(self.CELLS, goal=goal,
                                             method=method)
        flat = [self.CELLS[i][j][k] for i in range(2) for j in range(2)
                for k in range(2)]
        ms, df = _pooled(flat)
        assert res["ms_error"] == pytest.approx(ms, rel=1e-10)
        _check_family_block(res["family"], size, mid)
        _check_rows(res["comparisons"], size, mid)
        lookup = {f"Row {i + 1}:B{j + 1}:C{k + 1}": self.CELLS[i][j][k]
                  for i in range(2) for j in range(2) for k in range(2)}
        for c in res["comparisons"]:
            x, y = [lookup[s] for s in c["pair"].split(" vs. ")]
            se = math.sqrt(ms * (1 / len(x) + 1 / len(y)))
            assert c["p_unadjusted"] == pytest.approx(
                _t_p(np.mean(x) - np.mean(y), se, df), rel=REL)
            assert c["p_unadjusted"] == c["p"]

    def test_dunnett_control(self):
        res = threeway.three_way_comparisons(self.CELLS, goal="control",
                                             method="dunnett")
        _check_family_block(res["family"], 7, "dunnett")
        _check_rows(res["comparisons"], 7, "dunnett")

    def test_marginal_means_statsmodels(self):
        sm = pytest.importorskip("statsmodels.api")
        y, cell = [], []
        for i in range(2):
            for j in range(2):
                for k in range(2):
                    for v in self.CELLS[i][j][k]:
                        y.append(v)
                        cell.append(i * 4 + j * 2 + k)
        X = np.zeros((len(y), 8))
        X[np.arange(len(y)), cell] = 1.0
        fit = sm.OLS(np.array(y), X).fit()
        res = threeway.three_way_comparisons(self.CELLS, goal="factor_b_means",
                                             method="tukey")
        _check_family_block(res["family"], 1, "tukey")
        # LS means of factor B: unweighted average of the 4 cells at each level
        L = np.zeros(8)
        for i in range(2):
            for k in range(2):
                L[i * 4 + 0 * 2 + k] += 0.25
                L[i * 4 + 1 * 2 + k] -= 0.25
        ref = float(np.asarray(fit.t_test(L).pvalue))
        c = res["comparisons"][0]
        assert c["p_unadjusted"] == pytest.approx(ref, rel=REL)
        assert c["p_unadjusted"] <= c["p_adjusted"]

    def test_fdr_method_labelled(self):
        res = threeway.three_way_comparisons(self.CELLS, goal="all_cells",
                                             method="bh")
        _check_family_block(res["family"], 28, "bh")
        assert "Benjamini-Hochberg" in res["family"]["label"]


# ------------------------------------------------------- multiple t tests

RA = [[1.0, 2.1, 1.7], [3.0, 3.3, 2.9], [5.0, 4.0, 6.0], [2.0, 2.2], [1.0]]
RB = [[2.0, 2.9, 3.1], [3.1, 3.5, 3.0], [8.0, 9.0, 7.5], [2.4, 2.0, 2.6],
      [2.0, 3.0]]


class TestRowTests:
    @pytest.mark.parametrize("method", ["holm_sidak", "bonferroni", "sidak",
                                        "holm", "none", "bky"])
    def test_welch_rows(self, method):
        res = rowtests.multiple_t_tests(RA, RB, test="welch", method=method)
        # row 5 has one value in A: left out of the family of 4
        _check_family_block(res["family"], 4, method)
        assert "1 row left out" in res["family"]["label"]
        for r in res["rows"]:
            assert r["family_size"] == 4 and r["method"] == method
            if r["index"] == 4:
                assert r["p_unadjusted"] is None
                continue
            ref = stats.ttest_ind(RA[r["index"]], RB[r["index"]],
                                  equal_var=False).pvalue
            assert r["p_unadjusted"] == pytest.approx(ref, rel=REL)
            if method in ("holm_sidak", "bonferroni", "sidak", "holm"):
                assert r["p_unadjusted"] <= r["p_adjusted"]

    def test_pooled_rows(self):
        res = rowtests.multiple_t_tests(RA, RB, test="pooled",
                                        method="bonferroni")
        cells = [c for c in RA + RB if len(c) >= 2]
        ms, df = _pooled(cells)
        _check_family_block(res["family"], 5, "bonferroni")
        for r in res["rows"]:
            x, y = RA[r["index"]], RB[r["index"]]
            se = math.sqrt(ms * (1 / len(x) + 1 / len(y)))
            assert r["p_unadjusted"] == pytest.approx(
                _t_p(np.mean(x) - np.mean(y), se, df), rel=REL)
            assert r["p_adjusted"] == pytest.approx(
                min(1.0, 5 * r["p_unadjusted"]), rel=1e-10)


# ------------------------------------------------------ Friedman / Dunn

def _dunn_hand(datasets):
    """Mean ranks within subjects and the Dunn (1964) z for Friedman:
    z = |R_i - R_j| / sqrt(k (k + 1) / (6 n)), P = erfc(z / sqrt 2)."""
    M = np.array(datasets, dtype=float).T          # subjects x treatments
    n, k = M.shape
    ranks = np.array([stats.rankdata(row) for row in M])
    R = ranks.mean(axis=0)
    se = math.sqrt(k * (k + 1) / (6.0 * n))

    def zp(i, j):
        z = abs(R[i] - R[j]) / se
        return z, math.erfc(z / math.sqrt(2.0))
    return R, zp


class TestFriedmanDunn:
    def test_defaults_unchanged(self):
        # values recorded from repeated.friedman(FR) before this change
        before = [(-1.1666666666666665, 1.5652475842498526, 0.705149208579835),
                  (-1.6666666666666665, 2.2360679774997894, 0.15208391206480965),
                  (0.8333333333333333, 1.1180339887498947, 1.0),
                  (-0.5, 0.6708203932499369, 1.0),
                  (1.9999999999999998, 2.6832815729997472, 0.043742148549213856),
                  (2.5, 3.3541019662496847, 0.004777380945544855)]
        res = repeated.friedman(FR)
        assert res["statistic"] == pytest.approx(13.8, rel=1e-9)
        assert res["p"] == pytest.approx(0.003190421907797298, rel=1e-9)
        assert res["dunns"]["method"] == "dunns"
        comps = res["dunns"]["comparisons"]
        assert len(comps) == 6
        for c, (d, z, p) in zip(comps, before):
            assert c["mean_rank_difference"] == pytest.approx(d, rel=1e-12)
            assert c["statistic"] == pytest.approx(z, rel=1e-12)
            assert c["p_adjusted"] == pytest.approx(p, rel=1e-12)
        _check_family_block(res["dunns"]["family"], 6, "dunn_bonferroni")
        _check_rows(comps, 6, "dunn_bonferroni")
        assert "dunns" not in repeated.friedman(FR, dunns=False)

    def test_all_pairs_hand_formula(self):
        R, zp = _dunn_hand(FR)
        res = repeated.friedman(FR)
        for c in res["dunns"]["comparisons"]:
            z, p = zp(c["a_index"], c["b_index"])
            assert c["statistic"] == pytest.approx(z, rel=REL)
            assert c["p_unadjusted"] == pytest.approx(p, rel=REL)
            assert c["p_adjusted"] == pytest.approx(min(1.0, 6 * p), rel=REL)
            assert c["mean_rank_difference"] == pytest.approx(
                R[c["a_index"]] - R[c["b_index"]], rel=REL)

    def test_control_family_k_minus_1_multiplier(self):
        all_pairs = {(c["a_index"], c["b_index"]): c
                     for c in repeated.friedman(FR)["dunns"]["comparisons"]}
        res = repeated.friedman(FR, dunn_family="control", control=2)
        comps = res["dunns"]["comparisons"]
        assert [(c["a_index"], c["b_index"]) for c in comps] == \
            [(0, 2), (1, 2), (3, 2)]
        _check_family_block(res["dunns"]["family"], 3, "dunn_bonferroni")
        _check_rows(comps, 3, "dunn_bonferroni")
        for c in comps:
            ref = all_pairs[tuple(sorted((c["a_index"], c["b_index"])))]
            assert c["statistic"] == pytest.approx(ref["statistic"], rel=1e-12)
            assert c["p_unadjusted"] == pytest.approx(ref["p_unadjusted"],
                                                      rel=1e-12)
            assert c["p_adjusted"] == pytest.approx(
                min(1.0, 3 * ref["p_unadjusted"]), rel=1e-12)

    def test_holm_against_statsmodels(self):
        multipletests = pytest.importorskip(
            "statsmodels.stats.multitest").multipletests
        res = repeated.friedman(FR, dunn_correction="holm")
        comps = res["dunns"]["comparisons"]
        _check_family_block(res["dunns"]["family"], 6, "dunn_holm")
        _check_rows(comps, 6, "dunn_holm")
        _, ref, _, _ = multipletests([c["p_unadjusted"] for c in comps],
                                     method="holm")
        for c, r in zip(comps, ref):
            assert c["p_adjusted"] == pytest.approx(r, rel=REL)
        # hand: smallest raw P times 6
        R, zp = _dunn_hand(FR)
        assert min(c["p_adjusted"] for c in comps) == pytest.approx(
            6 * zp(2, 3)[1], rel=REL)

    def test_planned_pairs(self):
        R, zp = _dunn_hand(FR)
        res = repeated.friedman(FR, dunn_family="pairs",
                                pairs=[[1, 3], [0, 2]])
        comps = res["dunns"]["comparisons"]
        assert [c["pair"] for c in comps] == [
            "Treatment 1 vs. Treatment 3", "Treatment 0 vs. Treatment 2"]
        _check_family_block(res["dunns"]["family"], 2, "dunn_bonferroni")
        for c in comps:
            z, p = zp(c["a_index"], c["b_index"])
            assert c["p_unadjusted"] == pytest.approx(p, rel=REL)
            assert c["p_adjusted"] == pytest.approx(min(1.0, 2 * p), rel=REL)
        # orientation follows the pair as given
        rev = repeated.friedman(FR, dunn_family="pairs", pairs=[[3, 1]])
        c = rev["dunns"]["comparisons"][0]
        assert c["mean_rank_difference"] == pytest.approx(R[3] - R[1])
        assert c["p_adjusted"] == pytest.approx(zp(1, 3)[1], rel=REL)

    def test_no_correction(self):
        res = repeated.friedman(FR, dunn_correction="none")
        _check_family_block(res["dunns"]["family"], 6, "dunn_none")
        for c in res["dunns"]["comparisons"]:
            assert c["p_adjusted"] == c["p_unadjusted"]

    @pytest.mark.parametrize("kwargs,msg", [
        ({"dunn_family": "pairs", "pairs": [[0, 4]]}, "outside"),
        ({"dunn_family": "pairs", "pairs": [[1, 1]]}, "itself"),
        ({"dunn_family": "pairs", "pairs": [[0, 1], [1, 0]]}, "more than once"),
        ({"dunn_family": "pairs", "pairs": []}, "non-empty"),
        ({"dunn_family": "pairs", "pairs": [[0, 1, 2]]}, r"\[i, j\]"),
        ({"dunn_family": "control", "control": 9}, "control"),
        ({"dunn_family": "some"}, "Dunn family"),
        ({"dunn_correction": "tukey"}, "Dunn correction"),
    ])
    def test_validation(self, kwargs, msg):
        with pytest.raises(ValueError, match=msg):
            repeated.friedman(FR, **kwargs)


# ------------------------------------------- mixed model / RM comparisons

def _rm_complete():
    return [[10.0, 12.0, 11.5, 9.0, 13.0, 10.5],
            [12.5, 14.0, 12.9, 11.0, 15.5, 12.0],
            [13.0, 15.5, 14.0, 13.5, 16.0, 14.5]]


class TestMixedModel:
    @pytest.mark.parametrize("method,size", [
        ("tukey", 3), ("dunnett", 2), ("bonferroni", 3), ("sidak", 3),
        ("holm_sidak", 3), ("fisher", 3)])
    def test_one_way_complete_matches_rm_error(self, method, size):
        data = _rm_complete()
        Y = np.array(data).T                      # subjects x treatments
        n, k = Y.shape
        resid = Y - Y.mean(axis=1, keepdims=True) - Y.mean(axis=0) + Y.mean()
        df = (n - 1) * (k - 1)
        ms = float((resid ** 2).sum()) / df
        res = mm.mixed_rm_one_way(data, comparisons=method)
        mc = res["multiple_comparisons"]
        mid = "fisher_lsd" if method == "fisher" else method
        _check_family_block(mc["family"], size, mid)
        _check_rows(mc["comparisons"], size, mid)
        means = Y.mean(axis=0)
        for c in mc["comparisons"]:
            i, j = [int(s.split()[-1]) for s in c["pair"].split(" vs. ")]
            se = math.sqrt(2 * ms / n)
            assert c["p_unadjusted"] == pytest.approx(
                _t_p(means[i] - means[j], se, df), rel=REL)

    def test_two_way_mixed_row_means_and_families(self):
        rng = np.random.default_rng(3)
        a, b, n = 3, 2, 4
        cells = [[[] for _ in range(b)] for _ in range(a)]
        for j in range(b):
            for _ in range(n):
                off = rng.normal(0, 2)
                for i in range(a):
                    cells[i][j].append(float(np.round(
                        10 + 3 * i + 2 * j + off + rng.normal(0, 1), 3)))
        # independent residual MS: y ~ subject(group) + row + row x group
        y, cols = [], []
        for j in range(b):
            for s in range(n):
                for i in range(a):
                    y.append(cells[i][j][s])
                    x = np.zeros(b * n + (a - 1) + (a - 1) * (b - 1))
                    x[j * n + s] = 1.0
                    if i > 0:
                        x[b * n + i - 1] = 1.0
                        if j > 0:
                            x[b * n + (a - 1) + (i - 1) * (b - 1) + j - 1] = 1.0
                    cols.append(x)
        X, y = np.array(cols), np.array(y)
        beta = np.linalg.lstsq(X, y, rcond=None)[0]
        df = y.size - np.linalg.matrix_rank(X)
        ms = float(((y - X @ beta) ** 2).sum()) / df
        res = mm.mixed_rm_two_way(cells, design="mixed",
                                  comparisons="bonferroni",
                                  direction="row_means")
        mc = res["multiple_comparisons"]
        _check_family_block(mc["family"], 3, "bonferroni")
        _check_rows(mc["comparisons"], 3, "bonferroni")
        rmeans = [np.mean([np.mean(cells[i][j]) for j in range(b)])
                  for i in range(a)]
        for c in mc["comparisons"]:
            i, j = [int(s.split()[-1]) - 1 for s in c["pair"].split(" vs. ")]
            se = math.sqrt(2 * ms / (b * n))
            assert c["p_unadjusted"] == pytest.approx(
                _t_p(rmeans[i] - rmeans[j], se, df), rel=REL)

        # per-row Tukey families vs one Bonferroni family over all rows
        tk = mm.mixed_rm_two_way(cells, design="mixed", comparisons="tukey")
        mc = tk["multiple_comparisons"]
        assert len(mc["families"]) == 3 and mc["family"]["per_family"]
        _check_rows(mc["comparisons"], 1, "tukey")
        bf = mm.mixed_rm_two_way(cells, design="mixed",
                                 comparisons="bonferroni")
        mc = bf["multiple_comparisons"]
        _check_family_block(mc["family"], 3, "bonferroni")
        _check_rows(mc["comparisons"], 3, "bonferroni")
        for c in mc["comparisons"]:
            assert c["p_unadjusted"] == pytest.approx(
                2 * stats.t.sf(abs(c["difference"]) / c["se"], c["df"]),
                rel=REL)
            assert c["p_adjusted"] == pytest.approx(
                min(1.0, 3 * c["p_unadjusted"]), rel=1e-10)


class TestNested:
    @pytest.mark.parametrize("method,size", [
        ("tukey", 3), ("dunnett", 2), ("holm_sidak", 3), ("fisher", 3)])
    def test_equals_anova_of_subcolumn_means(self, method, size):
        # balanced nested design: the comparisons equal those of an
        # ordinary one-way ANOVA on the subcolumn means
        sub = [[float(np.mean(s)) for s in g] for g in HERDS]
        ms, df = _pooled(sub)
        res = nested.nested_one_way_anova(HERDS, comparisons=method,
                                          names=["G 0", "G 1", "G 2"])
        mc = res["multiple_comparisons"]
        mid = "fisher_lsd" if method == "fisher" else method
        _check_family_block(mc["family"], size, mid)
        _check_rows(mc["comparisons"], size, mid)
        for c in mc["comparisons"]:
            i, j = [int(s.split()[-1]) for s in c["pair"].split(" vs. ")]
            se = math.sqrt(ms * (1 / 3 + 1 / 3))
            assert c["p_unadjusted"] == pytest.approx(
                _t_p(np.mean(sub[i]) - np.mean(sub[j]), se, df), rel=REL)
