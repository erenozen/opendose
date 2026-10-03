"""REML mixed-model core, RM ANOVA with missing values via the mixed
model, and model-based multiple comparisons.

References:
- statsmodels MixedLM (reml=True, tightly converged with BFGS) for
  variance components, fixed effects and the restricted log likelihood,
  on balanced and unbalanced data, one and three variance components.
- The ANOVA identities that hold for complete balanced data (REML with
  unbounded variances = ANOVA estimators; Wald F = RM ANOVA F), checked
  against opendose.repeated (itself pinned to statsmodels AnovaRM and
  pingouin).
- Pinheiro & Bates (2000) Section 1.2, ergoStool (the data of GraphPad
  FAQ 2103): REML SDs 1.332465 (subject) and 1.100295 (residual),
  F(3, 24) = 22.36 for Type.
- Maxwell, Delaney & Kelley Table 12.1 (GraphPad FAQ 2104): two-way
  design with both factors repeated.
- Exact Dunnett probabilities by numerical integration; scipy.stats
  dunnett and opendose.anova for the comparison procedures.
"""

import json
import math
import warnings

import numpy as np
import pytest
from scipy import integrate, stats

from opendose import anova, api, repeated
from opendose import mixedmodel as mm

pd = pytest.importorskip("pandas")
smf = pytest.importorskip("statsmodels.formula.api")


def _sm_fit(formula, df, groups, **kw):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return smf.mixedlm(formula, df, groups=groups, **kw).fit(
            reml=True, method="bfgs", gtol=1e-12)


def _gls_cov(X, Zs, variances, sigma2):
    V = sigma2 * np.eye(X.shape[0])
    for Z, v in zip(Zs, variances):
        V = V + v * Z @ Z.T
    return np.linalg.inv(X.T @ np.linalg.solve(V, X))


# ------------------------------------------------------------- REML core

class TestRemlCore:
    def _random_intercept_data(self, sizes, seed):
        rng = np.random.default_rng(seed)
        rows = []
        for s, n in enumerate(sizes):
            u = rng.normal(0, 1.5)
            for _ in range(n):
                t = int(rng.integers(0, 3))
                rows.append({"y": 5 + 1.2 * t + u + rng.normal(0, 1),
                             "t": t, "s": s})
        return pd.DataFrame(rows)

    @pytest.mark.parametrize("sizes,seed", [((4,) * 8, 1),
                                            ((2, 5, 3, 7, 4, 6, 3), 2)])
    def test_matches_statsmodels(self, sizes, seed):
        df = self._random_intercept_data(sizes, seed)
        X = np.column_stack([np.ones(len(df)),
                             mm.effect_columns(df.t.to_numpy(), 3)])
        fit = mm.fit_reml(df.y.to_numpy(), X, [("s", df.s.to_numpy())],
                          allow_negative=False)
        sm = _sm_fit("y ~ C(t, Sum)", df, df.s)
        assert fit["converged"]
        assert fit["variance_components"][0]["variance"] == pytest.approx(
            float(sm.cov_re.iloc[0, 0]), rel=1e-6)
        assert fit["residual_variance"] == pytest.approx(sm.scale, rel=1e-6)
        np.testing.assert_allclose(fit["beta"], sm.fe_params.to_numpy(),
                                   rtol=1e-6)
        assert fit["log_likelihood"] == pytest.approx(sm.llf, abs=1e-7)
        # covariance of beta is the documented sigma^2 (X'H^-1 X)^-1
        Z = (df.s.to_numpy()[:, None] == np.unique(df.s)[None, :]).astype(float)
        C = _gls_cov(X, [Z], [float(sm.cov_re.iloc[0, 0])], sm.scale)
        np.testing.assert_allclose(fit["cov_beta"], C, rtol=1e-5)

    def test_gradient_matches_finite_differences(self):
        rng = np.random.default_rng(4)
        n = 40
        s = rng.integers(0, 8, n)
        r = rng.integers(0, 3, n)
        y = rng.normal(size=n) + 0.3 * s
        X = np.column_stack([np.ones(n), mm.effect_columns(rng.integers(0, 2, n), 2)])
        prof = mm._Profile(y, X, [mm._indicator(s), mm._indicator(s * 3 + r)])
        for gam in ([0.5, 0.2], [-0.05, 1.0], [2.0, 0.0]):
            gam = np.array(gam)
            h = 1e-6
            num = [(prof.objective(gam + h * e) - prof.objective(gam - h * e))
                   / (2 * h) for e in np.eye(2)]
            np.testing.assert_allclose(prof.gradient(gam), num, rtol=1e-6,
                                       atol=1e-6)

    def test_negative_variance_equals_anova_estimator(self):
        # balanced RM data with MS_subject < MS_error: unbounded REML gives
        # the (negative) ANOVA estimator, bounded REML stops at zero
        rng = np.random.default_rng(11)
        n, k = 6, 4
        M = 10 + np.arange(k)[None, :] + rng.normal(0, 1, (n, k))
        M = M - M.mean(axis=1, keepdims=True) + M.mean()  # no subject effect
        M[:, 0] += np.linspace(-0.3, 0.3, n)
        rm = repeated.rm_one_way_anova([list(M[:, j]) for j in range(k)])
        t = rm["table"]
        ms_subj = t["ss_subject"] / t["df_subject"]
        expected = (ms_subj - t["ms_error"]) / k
        assert expected < 0
        res = mm.mixed_rm_one_way([list(M[:, j]) for j in range(k)])
        assert res["random_effects"][0]["variance"] == pytest.approx(
            expected, rel=1e-8)
        assert res["random_effects"][0]["sd"] is None
        assert res["fixed_effect"]["F"] == pytest.approx(t["F"], rel=1e-9)
        removed = mm.mixed_rm_one_way([list(M[:, j]) for j in range(k)],
                                      negative_variance="remove")
        assert removed["removed_random_effects"] == ["Subject"]
        # subject factor removed: ordinary one-way ANOVA F and df
        ow = anova.one_way_anova([list(M[:, j]) for j in range(k)])
        assert removed["fixed_effect"]["F"] == pytest.approx(
            ow["table"]["F"], rel=1e-9)
        assert removed["fixed_effect"]["df_den"] == ow["table"]["df_within"]

    def test_rank_deficient_design_rejected(self):
        X = np.column_stack([np.ones(4), np.ones(4)])
        with pytest.raises(ValueError, match="rank deficient"):
            mm.fit_reml([1.0, 2, 3, 4], X, [("s", [0, 0, 1, 1])])


# --------------------------------------------------------- RM one-way

ERGO = [[12, 10, 7, 7, 8, 9, 8, 7, 9],       # T1, subjects 1..9
        [15, 14, 14, 11, 11, 11, 12, 11, 13],
        [12, 13, 13, 10, 8, 11, 12, 8, 10],
        [10, 12, 9, 9, 7, 10, 11, 7, 8]]


class TestMixedRmOneWay:
    def test_ergostool_published(self):
        res = mm.mixed_rm_one_way(ERGO, ["T1", "T2", "T3", "T4"])
        re = res["random_effects"]
        assert re[0]["sd"] == pytest.approx(1.332465, abs=5e-6)
        assert re[1]["sd"] == pytest.approx(1.100295, abs=5e-6)
        fe = res["fixed_effect"]
        assert fe["F"] == pytest.approx(22.36, abs=0.005)
        assert (fe["df_num"], fe["df_den"]) == (3, 24)
        means = [m["mean"] for m in res["estimated_means"]]
        np.testing.assert_allclose(means, [8.555556, 12.444444, 10.777778,
                                           9.222222], atol=1e-6)

    def test_complete_data_equals_rm_anova(self):
        cols = [[54, 23, 45, 54, 45], [43, 34, 65, 77, 46],
                [78, 65, 99, 79, 87], [111, 99, 78, 90, 95]]
        res = mm.mixed_rm_one_way(cols)
        rm = repeated.rm_one_way_anova(cols)["table"]
        fe = res["fixed_effect"]
        assert fe["F"] == pytest.approx(rm["F"], rel=1e-9)
        assert fe["df_den"] == rm["df_error"]
        assert fe["p"] == pytest.approx(rm["p_assuming_sphericity"], rel=1e-8)
        assert res["gg_epsilon"] == pytest.approx(rm["gg_epsilon"], rel=1e-12)
        assert fe["p_geisser_greenhouse"] == pytest.approx(
            rm["p_geisser_greenhouse"], rel=1e-8)
        assert fe["df_num_gg"] == pytest.approx(3 * rm["gg_epsilon"])
        assert fe["df_den_gg"] == pytest.approx(12 * rm["gg_epsilon"])
        assert res["random_effects"][1]["variance"] == pytest.approx(
            rm["ms_error"], rel=1e-9)
        ms_subj = rm["ss_subject"] / rm["df_subject"]
        assert res["random_effects"][0]["variance"] == pytest.approx(
            (ms_subj - rm["ms_error"]) / 4, rel=1e-9)
        assert res["n_missing"] == 0

    def test_missing_values_match_statsmodels(self):
        cols = [list(c) for c in ERGO]
        cols[1][2] = None
        cols[3][0] = None
        cols[0][7] = None
        res = mm.mixed_rm_one_way(cols)
        rows = [{"y": v, "t": t, "s": s} for t, c in enumerate(cols)
                for s, v in enumerate(c) if v is not None]
        df = pd.DataFrame(rows)
        sm = _sm_fit("y ~ C(t, Sum)", df, df.s)
        re = res["random_effects"]
        assert re[0]["variance"] == pytest.approx(
            float(sm.cov_re.iloc[0, 0]), rel=1e-6)
        assert re[1]["variance"] == pytest.approx(sm.scale, rel=1e-6)
        # estimated means = intercept + effects (sum-to-zero coding)
        b = sm.fe_params.to_numpy()
        exp_means = [b[0] + b[1], b[0] + b[2], b[0] + b[3],
                     b[0] - b[1] - b[2] - b[3]]
        np.testing.assert_allclose(
            [m["mean"] for m in res["estimated_means"]], exp_means, rtol=1e-6)
        # Wald F from the GLS covariance at statsmodels' estimates
        X = np.column_stack([np.ones(len(df)),
                             mm.effect_columns(df.t.to_numpy(), 4)])
        Z = (df.s.to_numpy()[:, None] == np.unique(df.s)[None, :]).astype(float)
        C = _gls_cov(X, [Z], [float(sm.cov_re.iloc[0, 0])], sm.scale)
        F = float(b[1:] @ np.linalg.solve(C[1:, 1:], b[1:])) / 3
        assert res["fixed_effect"]["F"] == pytest.approx(F, rel=1e-5)
        # containment (residual) df: N - rank[X Z] = 33 - 4 - 9 + 1
        assert res["fixed_effect"]["df_den"] == 33 - 4 - 9 + 1
        assert res["n_missing"] == 3
        assert res["matching"]["df"] == 1 and res["matching"]["p"] < 0.05

    def test_comparisons_complete_data_equal_pooled_rm(self):
        # no missing values: model SE of a difference = sqrt(2 MS_err / n)
        res = mm.mixed_rm_one_way(ERGO, comparisons="bonferroni")
        ms_err = repeated.rm_one_way_anova(ERGO)["table"]["ms_error"]
        se = math.sqrt(2 * ms_err / 9)
        for c in res["multiple_comparisons"]["comparisons"]:
            assert c["se"] == pytest.approx(se, rel=1e-8)
            t = abs(c["difference"]) / se
            p = min(1.0, 6 * 2 * stats.t.sf(t, 24))
            assert c["p_adjusted"] == pytest.approx(p, rel=1e-6)

    def test_dispatcher(self):
        auto = mm.rm_one_way(ERGO, method="auto")
        assert auto["analysis"] == "rm_one_way_anova"
        cols = [list(c) for c in ERGO]
        cols[0][0] = None
        assert mm.rm_one_way(cols, method="auto")["analysis"] == \
            "mixed_rm_one_way"
        assert mm.rm_one_way(ERGO)["analysis"] == "mixed_rm_one_way"


# --------------------------------------------------------- RM two-way

MD_12_1 = {  # Maxwell, Delaney & Kelley Table 12.1 (angle x noise), 10 S
    (0, 0): [420, 420, 480, 420, 540, 360, 480, 480, 540, 480],
    (0, 1): [480, 360, 660, 480, 480, 360, 540, 540, 480, 540],
    (1, 0): [420, 480, 480, 540, 660, 420, 480, 600, 600, 420],
    (1, 1): [600, 480, 780, 780, 660, 480, 720, 720, 720, 660],
    (2, 0): [480, 480, 540, 540, 540, 360, 600, 660, 540, 540],
    (2, 1): [780, 600, 780, 900, 720, 540, 840, 900, 780, 780],
}


def _md_cells():
    return [[[float(v) for v in MD_12_1[(i, j)]] for j in range(2)]
            for i in range(3)]


def _mixed_cells(ns, a=3, seed=7):
    rng = np.random.default_rng(seed)
    cells = [[[] for _ in ns] for _ in range(a)]
    for j, n in enumerate(ns):
        for _ in range(n):
            off = rng.normal(0, 2)
            for i in range(a):
                cells[i][j].append(float(10 + 3 * i + 2 * j + 0.8 * i * j
                                         + off + rng.normal(0, 1 + 0.3 * i)))
    return cells


class TestMixedRmTwoWay:
    def test_both_repeated_complete_equals_anova(self):
        cells = _md_cells()
        res = mm.mixed_rm_two_way(cells, design="both")
        ref = repeated.rm_two_way_both(cells)["sources"]
        fe = res["fixed_effects"]
        for key in ("row_factor", "column_factor", "interaction"):
            assert fe[key]["F"] == pytest.approx(ref[key]["F"], rel=1e-8)
            assert fe[key]["df_den"] == ref[key]["error_df"]
            assert fe[key]["p"] == pytest.approx(ref[key]["p"], rel=1e-6)
        # published (Maxwell & Delaney): F(2,18)=40.72, F(1,9)=33.77,
        # F(2,18)=45.31
        assert fe["row_factor"]["F"] == pytest.approx(40.72, abs=0.005)
        assert fe["column_factor"]["F"] == pytest.approx(33.77, abs=0.005)
        assert fe["interaction"]["F"] == pytest.approx(45.31, abs=0.005)
        assert res["goodness_of_fit"]["converged"]

    def test_both_repeated_missing_matches_statsmodels(self):
        cells = _md_cells()
        cells[0][0][3] = None
        cells[1][1][5] = None
        cells[2][0][7] = None
        res = mm.mixed_rm_two_way(cells, design="both")
        rows = [{"y": v, "A": i, "B": j, "S": s}
                for i in range(3) for j in range(2)
                for s, v in enumerate(cells[i][j]) if v is not None]
        df = pd.DataFrame(rows)
        sm = _sm_fit("y ~ C(A, Sum) * C(B, Sum)", df, df.S, re_formula="1",
                     vc_formula={"SA": "0 + C(A)", "SB": "0 + C(B)"})
        re = {r["name"]: r["variance"] for r in res["random_effects"]}
        assert re["Subject"] == pytest.approx(float(sm.cov_re.iloc[0, 0]),
                                              rel=1e-5)
        assert re["Subject x Row"] == pytest.approx(sm.vcomp[0], rel=1e-5)
        assert re["Subject x Column"] == pytest.approx(sm.vcomp[1], rel=1e-5)
        assert re["Residual"] == pytest.approx(sm.scale, rel=1e-5)
        assert res["goodness_of_fit"]["log_likelihood"] == pytest.approx(
            sm.llf, abs=1e-6)
        assert res["goodness_of_fit"]["converged"]
        # containment df: S x A keeps all 30 cells -> 18; S x B -> 9;
        # residual N - rank[X Z] = 57 - 42
        fe = res["fixed_effects"]
        assert fe["row_factor"]["df_den"] == 18
        assert fe["column_factor"]["df_den"] == 9
        assert fe["interaction"]["df_den"] == 57 - 42
        assert res["n_missing"] == 3

    def test_mixed_design_complete_equal_groups_equals_anova(self):
        cells = _mixed_cells((5, 5, 5))
        res = mm.mixed_rm_two_way(cells, design="mixed")
        ref = repeated.rm_two_way_mixed(cells)
        for key in ("row_factor", "column_factor", "interaction"):
            f, r = res["fixed_effects"][key], ref["sources"][key]
            assert f["F"] == pytest.approx(r["F"], rel=1e-8)
            assert f["df_den"] == r_df(ref, key)
            assert f["p"] == pytest.approx(r["p"], rel=1e-6)
        assert res["gg_epsilon"]["row_factor"] == pytest.approx(
            ref["gg_epsilon"], rel=1e-12)
        assert res["fixed_effects"]["row_factor"]["p_geisser_greenhouse"] == \
            pytest.approx(ref["sources"]["row_factor"]["p_geisser_greenhouse"],
                          rel=1e-6)

    def test_mixed_design_unequal_groups_type_iii(self):
        # unequal group sizes: column factor and interaction still equal
        # the split-plot ANOVA; the row factor is the Type III test
        # (unweighted marginal means), checked against a direct GLS Wald F
        cells = _mixed_cells((6, 4, 5))
        res = mm.mixed_rm_two_way(cells, design="mixed")
        ref = repeated.rm_two_way_mixed(cells)["sources"]
        fe = res["fixed_effects"]
        assert fe["column_factor"]["F"] == pytest.approx(
            ref["column_factor"]["F"], rel=1e-8)
        assert fe["interaction"]["F"] == pytest.approx(
            ref["interaction"]["F"], rel=1e-8)
        self._check_against_statsmodels(cells, res)

    def test_mixed_design_missing_matches_statsmodels(self):
        cells = _mixed_cells((6, 4, 5))
        cells[0][1][2] = None
        cells[2][0][0] = None
        cells[1][2][4] = None
        res = mm.mixed_rm_two_way(cells, design="mixed")
        self._check_against_statsmodels(cells, res)
        assert res["fixed_effects"]["column_factor"]["df_den"] == 15 - 3
        # N - rank[X Z] = 42 - (9 + 15 subjects - 3 absorbed by group)
        assert res["fixed_effects"]["row_factor"]["df_den"] == 42 - 21

    def _check_against_statsmodels(self, cells, res):
        rows = [{"y": v, "r": i, "c": j, "s": j * 100 + s}
                for i in range(len(cells)) for j in range(len(cells[0]))
                for s, v in enumerate(cells[i][j]) if v is not None]
        df = pd.DataFrame(rows)
        sm = _sm_fit("y ~ C(r, Sum) * C(c, Sum)", df, df.s)
        v_s, v_e = float(sm.cov_re.iloc[0, 0]), sm.scale
        assert res["random_effects"][0]["variance"] == pytest.approx(
            v_s, rel=1e-5)
        assert res["random_effects"][1]["variance"] == pytest.approx(
            v_e, rel=1e-5)
        X = sm.model.exog
        Z = (df.s.to_numpy()[:, None] == np.unique(df.s)[None, :]).astype(float)
        C = _gls_cov(X, [Z], [v_s], v_e)
        b = sm.fe_params.to_numpy()
        names = list(sm.fe_params.index)

        def wald(pred):
            idx = [i for i, nm in enumerate(names) if pred(nm)]
            return float(b[idx] @ np.linalg.solve(C[np.ix_(idx, idx)],
                                                  b[idx])) / len(idx)

        fe = res["fixed_effects"]
        assert fe["row_factor"]["F"] == pytest.approx(
            wald(lambda nm: nm.startswith("C(r") and ":" not in nm), rel=1e-5)
        assert fe["column_factor"]["F"] == pytest.approx(
            wald(lambda nm: nm.startswith("C(c") and ":" not in nm), rel=1e-5)
        assert fe["interaction"]["F"] == pytest.approx(
            wald(lambda nm: ":" in nm), rel=1e-5)

    def test_gg_epsilon_both_repeated(self):
        pg = pytest.importorskip("pingouin")
        rng = np.random.default_rng(3)
        a, b, n = 2, 4, 8
        subj, slope = rng.normal(0, 2, n), rng.normal(0, 1, n)
        cells = [[[float(10 + 2 * i + 3 * j + subj[s] + 0.5 * slope[s] * j
                         + rng.normal(0, 1 + 0.4 * j)) for s in range(n)]
                  for j in range(b)] for i in range(a)]
        res = mm.mixed_rm_two_way(cells, design="both")
        df = pd.DataFrame([{"y": cells[i][j][s], "A": i, "B": j, "S": s}
                           for i in range(a) for j in range(b)
                           for s in range(n)])
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            aov = pg.rm_anova(data=df, dv="y", within=["A", "B"],
                              subject="S", correction=True)
        eps = dict(zip(aov["Source"], aov["eps"]))
        assert res["gg_epsilon"]["row_factor"] == pytest.approx(1.0)
        assert res["gg_epsilon"]["column_factor"] == pytest.approx(
            eps["B"], rel=1e-9)
        assert res["gg_epsilon"]["interaction"] == pytest.approx(
            eps["A * B"], rel=1e-9)
        fe = res["fixed_effects"]
        assert fe["column_factor"]["F"] == pytest.approx(
            float(aov.loc[aov.Source == "B", "F"].iloc[0]), rel=1e-8)

    def test_gg_epsilon_basis_invariant(self):
        rng = np.random.default_rng(5)
        A = rng.normal(size=(12, 12))
        S = A @ A.T
        C = np.kron(mm.orthonormal_contrasts(3), mm.orthonormal_contrasts(4))
        Q, _ = np.linalg.qr(rng.normal(size=(6, 6)))
        assert mm.gg_epsilon(S, C) == pytest.approx(mm.gg_epsilon(S, C @ Q),
                                                    rel=1e-12)
        # one factor: equals the double-centering formula in repeated.py
        S4 = S[:4, :4]
        assert mm.gg_epsilon(S4, mm.orthonormal_contrasts(4)) == \
            pytest.approx(repeated._gg_epsilon_from_cov(S4), rel=1e-12)

    def test_comparisons_and_dispatch(self):
        cells = _mixed_cells((5, 5))
        cells[1][0][1] = None
        res = mm.mixed_rm_two_way(cells, comparisons="sidak",
                                  direction="columns_within_rows",
                                  row_names=["t0", "t1", "t2"],
                                  col_names=["ctl", "drug"])
        mc = res["multiple_comparisons"]
        assert mc["n_comparisons"] == 3
        assert {c["family"] for c in mc["comparisons"]} == {"t0", "t1", "t2"}
        for c in mc["comparisons"]:
            p = 1 - (1 - c["p_unadjusted"]) ** 3
            assert c["p_adjusted"] == pytest.approx(min(p, 1.0), rel=1e-9)
            assert c["df"] == res["fixed_effects"]["interaction"]["df_den"]
        marg = mm.mixed_rm_two_way(cells, comparisons="tukey",
                                   direction="row_means")
        assert marg["multiple_comparisons"]["comparisons"][0]["df"] == \
            marg["fixed_effects"]["row_factor"]["df_den"]
        complete = _mixed_cells((5, 5))
        assert mm.rm_two_way(complete, method="auto")["analysis"] == \
            "rm_two_way_mixed"
        assert mm.rm_two_way(cells, method="auto")["analysis"] == \
            "mixed_rm_two_way"

    def test_empty_cell_rejected(self):
        cells = _mixed_cells((3, 3))
        cells[0][1] = [None, None, None]
        with pytest.raises(ValueError, match="cell"):
            mm.mixed_rm_two_way(cells)


def r_df(ref, key):
    """Denominator df of the split-plot ANOVA for each source."""
    src = ref["sources"]
    if key == "column_factor":
        return src["subjects"]["df"]
    return src["residual"]["df"]


# ------------------------------------------------ multiple comparisons

def _exact_equicorrelated(t, m, rho, df):
    a, b = math.sqrt(rho), math.sqrt(1 - rho)

    def inner(s):
        def f(z):
            return stats.norm.pdf(z) * (stats.norm.cdf((t * s + a * z) / b)
                                        - stats.norm.cdf((-t * s + a * z) / b)) ** m
        return integrate.quad(f, -10, 10, epsabs=1e-14, limit=200)[0]

    def dens(s):
        return stats.chi.pdf(s * math.sqrt(df), df) * math.sqrt(df)

    return 1 - integrate.quad(lambda s: inner(s) * dens(s), 0, np.inf,
                              epsabs=1e-14, limit=200)[0]


class TestModelComparisons:
    def _one_way(self, seed=0, sizes=(5, 7, 4, 9)):
        rng = np.random.default_rng(seed)
        groups = [list(rng.normal(mu, 1, n))
                  for n, mu in zip(sizes, (0, 1, 1.5, 0.3))]
        k = len(groups)
        means = np.array([np.mean(g) for g in groups])
        df = sum(len(g) for g in groups) - k
        ms = sum(((np.array(g) - np.mean(g)) ** 2).sum() for g in groups) / df
        cov = np.diag([ms / len(g) for g in groups])
        return groups, means, cov, df

    @pytest.mark.parametrize("method", ["tukey", "bonferroni", "sidak",
                                        "holm_sidak"])
    def test_independent_means_equal_anova_module(self, method):
        groups, means, cov, df = self._one_way()
        ours = mm.compare_estimates(means, cov, df, method)
        ref = anova.multiple_comparisons(groups, method)["comparisons"]
        for o, r in zip(ours, ref):
            assert o["difference"] == pytest.approx(r["difference"], rel=1e-12)
            assert o["statistic"] == pytest.approx(r["statistic"], rel=1e-10)
            assert o["p_adjusted"] == pytest.approx(r["p_adjusted"], rel=1e-9)
            if r["ci"] is None:
                assert o["ci"] is None
            else:
                np.testing.assert_allclose(o["ci"], r["ci"], rtol=1e-9)

    def test_fisher_lsd_is_unadjusted(self):
        groups, means, cov, df = self._one_way()
        for c in mm.compare_estimates(means, cov, df, "fisher"):
            assert c["p_adjusted"] == c["p_unadjusted"]
            half = stats.t.ppf(0.975, df) * c["se"]
            assert c["ci"][1] - c["difference"] == pytest.approx(half)

    def test_dunnett_vs_scipy(self):
        groups, means, cov, df = self._one_way()
        ours = mm.compare_estimates(means, cov, df, "dunnett",
                                    control_index=0)
        ref = stats.dunnett(*[np.array(g) for g in groups[1:]],
                            control=np.array(groups[0]))
        ci = ref.confidence_interval(0.95)
        for j, c in enumerate(ours):
            # ours: control - treatment (Prism's direction)
            assert c["difference"] == pytest.approx(
                means[0] - means[j + 1], rel=1e-12)
            assert c["p_adjusted"] == pytest.approx(ref.pvalue[j], abs=2e-4)
            assert -c["ci"][1] == pytest.approx(ci.low[j], abs=2e-3)

    def test_dunnett_exact_equicorrelated(self):
        # balanced: correlation 0.5, exact P by 2-D integration
        est = np.array([19.333, 28.0, 25.583])
        se2 = 0.9622504486493675 ** 2 / 2
        cov = np.eye(3) * se2
        res = mm.compare_estimates(est, cov, 6, "dunnett", control_index=0)
        for c in res:
            exact = _exact_equicorrelated(c["statistic"], 2, 0.5, 6)
            assert c["p_adjusted"] == pytest.approx(exact, rel=1e-6)

    def test_dunnett_general_correlation_falls_back_to_qmc(self):
        rng = np.random.default_rng(9)
        A = rng.normal(size=(5, 5))
        cov = A @ A.T + np.eye(5)
        est = rng.normal(size=5) * 3
        res = mm.compare_estimates(est, cov, 20, "dunnett")
        assert all(0 <= c["p_adjusted"] <= 1 for c in res)
        assert all(c["p_adjusted"] >= c["p_unadjusted"] - 1e-9 for c in res)


# ---------------------------------------------------------------- api

class TestApi:
    def test_mixed_rm_oneway_payload(self):
        datasets = [{"name": f"T{t + 1}",
                     "ys": [[v] for v in col]} for t, col in enumerate(ERGO)]
        datasets[2]["ys"][4] = [None]
        payload = {"analysis": "mixed_rm_oneway",
                   "data": {"x": [None] * 9, "datasets": datasets},
                   "options": {"comparisons": "tukey"}}
        out = json.loads(api.analyze_json(json.dumps(payload)))
        assert "error" not in out, out.get("traceback")
        assert out["analysis"] == "mixed_rm_one_way"
        assert out["n_missing"] == 1
        assert len(out["multiple_comparisons"]["comparisons"]) == 6

    def test_mixed_rm_twoway_payload(self):
        cells = _mixed_cells((5, 5))
        cells[2][1][3] = None
        payload = {
            "analysis": "mixed_rm_twoway",
            "data": {"x": [None] * 3, "datasets": [
                {"name": f"G{j}", "ys": [cells[i][j] for i in range(3)]}
                for j in range(2)]},
            "options": {"design": "mixed", "comparisons": "bonferroni",
                        "direction": "rows_within_columns"}}
        out = json.loads(api.analyze_json(json.dumps(payload)))
        assert "error" not in out, out.get("traceback")
        assert out["analysis"] == "mixed_rm_two_way"
        assert out["col_names"] == ["G0", "G1"]
        assert out["fixed_effects"]["row_factor"]["p"] < 0.001
        both = dict(payload, options={"design": "both"})
        out = json.loads(api.analyze_json(json.dumps(both)))
        assert "error" not in out, out.get("traceback")
        assert out["design"] == "both"
