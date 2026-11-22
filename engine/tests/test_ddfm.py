"""Kenward-Roger and Satterthwaite denominator df (opendose.ddfm).

References: R 4.6.1, lme4 + lmerTest + pbkrtest (fixtures/
ddfm_r_reference.json; five of 180 random unbalanced datasets with
missing values that agreed with R, one-way RM, two-way 'mixed' and
'both' designs):
    options(contrasts = c("contr.sum", "contr.poly"))
    m <- lmer(y ~ f1 + (1 | subj))                       # one-way
    m <- lmer(y ~ f1 * f2 + (1 | subj))                  # mixed
    m <- lmer(y ~ f1 * f2 + (1 | subj) + (1 | subj:f1) + (1 | subj:f2))
    anova(m, type = 3, ddf = "Kenward-Roger")            # F, DenDF
    contestMD(m, <the term's rows of the identity>, ddf = "Satterthwaite")
    contest1D(m, L, ddf = "Kenward-Roger" | "Satterthwaite")
fitted with lmerControl(optimizer = "bobyqa", optCtrl = list(rhobeg =
2e-3, rhoend = 1e-12, maxfun = 1e5)): lme4's default stops slightly
short of the REML optimum (dataset 35: criterion 159.0048681180 vs
159.0048680832), which moves F by ~1e-4. With it, all 180 datasets
agree to ~1e-7 (Satterthwaite: analytic Hessian here, numerical in
lmerTest).
"""

import json
import math
from pathlib import Path

import numpy as np
import pytest

from opendose import api, ddfm
from opendose import mixedmodel as mm

REF = json.loads((Path(__file__).parent / "fixtures"
                  / "ddfm_r_reference.json").read_text())


def _model(entry):
    rows = entry["rows"]
    y = np.array([r[0] for r in rows])
    f1 = np.array([r[1] for r in rows])
    f2 = np.array([r[2] for r in rows])
    s = np.array([r[3] for r in rows])
    if entry["design"] == "one":
        k = f1.max() + 1
        X = np.column_stack([np.ones(y.size), mm.effect_columns(f1, k)])
        terms = {"treat": list(range(1, k))}
        cells = {str(i): np.concatenate([[1.0], mm.effect_row(i, k)])
                 for i in range(k)}
        res = [("Subject", s)]
    else:
        a, b = f1.max() + 1, f2.max() + 1
        A, B = mm.effect_columns(f1, a), mm.effect_columns(f2, b)
        X = np.column_stack([np.ones(y.size), A, B, mm._interaction(A, B)])
        terms = {"r": list(range(1, a)), "c": list(range(a, a + b - 1)),
                 "r:c": list(range(a + b - 1, X.shape[1]))}
        cells = {}
        for i in range(a):
            for j in range(b):
                ar, br = mm.effect_row(i, a), mm.effect_row(j, b)
                cells[f"{i}_{j}"] = np.concatenate(
                    [[1.0], ar, br, np.outer(ar, br).ravel()])
        res = [("Subject", s)]
        if entry["design"] == "both":
            res += [("Subject x Row", s * a + f1), ("Subject x Column", s * b + f2)]
    fit = mm.fit_reml(y, X, res)
    return ddfm.Ddf(fit), X, terms, cells


@pytest.mark.parametrize("key", sorted(REF))
def test_matches_r(key):
    entry = REF[key]
    D, X, terms, cells = _model(entry)
    for term, (f_kr, df_kr, f_st, df_st, _df_st_anova) in entry["tests"].items():
        L = np.eye(X.shape[1])[terms[term]]
        kr, st = D.kenward_roger(L), D.satterthwaite(L)
        assert kr["F"] == pytest.approx(f_kr, rel=1e-5, abs=1e-8)
        assert kr["df_den"] == pytest.approx(df_kr, rel=1e-5)
        assert st["F"] == pytest.approx(f_st, rel=1e-5, abs=1e-8)
        assert st["df_den"] == pytest.approx(df_st, rel=1e-5)
    for a, b, est, se_kr, df_kr, se_st, df_st in entry["contrasts"]:
        l = cells[a] - cells[b]
        s1, d1 = D.kenward_roger_1d(l)
        s2, d2 = D.satterthwaite_1d(l)
        assert float(l @ D.beta) == pytest.approx(est, rel=1e-5, abs=1e-6)
        assert s1 == pytest.approx(se_kr, rel=1e-5)
        assert d1 == pytest.approx(df_kr, rel=1e-5)
        assert s2 == pytest.approx(se_st, rel=1e-5)
        assert d2 == pytest.approx(df_st, rel=1e-5)


def _balanced_one_way(n=8, k=4, seed=1):
    rng = np.random.default_rng(seed)
    u = rng.normal(0, 2, n)
    return [[float(10 + t + u[s] + rng.normal()) for s in range(n)]
            for t in range(k)]


@pytest.mark.parametrize("ddf", ["kenward_roger", "satterthwaite"])
def test_balanced_one_way_equals_containment(ddf):
    data = _balanced_one_way()
    a = mm.mixed_rm_one_way(data, comparisons="tukey")
    b = mm.mixed_rm_one_way(data, comparisons="tukey", ddf=ddf)
    assert b["fixed_effect"]["F"] == pytest.approx(a["fixed_effect"]["F"], rel=1e-9)
    assert b["fixed_effect"]["df_den"] == pytest.approx(21.0, rel=1e-8)
    for x, y in zip(a["multiple_comparisons"]["comparisons"],
                    b["multiple_comparisons"]["comparisons"]):
        assert y["se"] == pytest.approx(x["se"], rel=1e-9)
        assert y["df"] == pytest.approx(x["df"], rel=1e-8)
        assert y["p_adjusted"] == pytest.approx(x["p_adjusted"], rel=1e-6)
    assert b["ddf"] == ddf and "Geisser-Greenhouse" in b["sphericity_note"]
    assert "p_geisser_greenhouse" not in b["fixed_effect"]


def _mixed_cells(seed=4, a=3, b=2, n=5, missing=()):
    rng = np.random.default_rng(seed)
    u = rng.normal(0, 1.5, (b, n))
    cells = [[[float(5 + i + 2 * j + u[j, s] + rng.normal()) for s in range(n)]
              for j in range(b)] for i in range(a)]
    for i, j, s in missing:
        cells[i][j][s] = None
    return cells


def test_balanced_two_way_mixed_f_tests_equal_containment():
    cells = _mixed_cells()
    a = mm.mixed_rm_two_way(cells)
    b = mm.mixed_rm_two_way(cells, ddf="kenward_roger")
    for term in ("row_factor", "column_factor", "interaction"):
        assert b["fixed_effects"][term]["F"] == pytest.approx(
            a["fixed_effects"][term]["F"], rel=1e-9)
        assert b["fixed_effects"][term]["df_den"] == pytest.approx(
            a["fixed_effects"][term]["df_den"], rel=1e-8)


def test_unbalanced_two_way_gives_each_comparison_its_own_df():
    cells = _mixed_cells(missing=[(0, 0, 1), (2, 1, 3), (1, 1, 0)])
    for ddf in ("kenward_roger", "satterthwaite"):
        res = mm.mixed_rm_two_way(cells, comparisons="sidak", ddf=ddf,
                                  direction="columns_within_rows")
        dfs = [c["df"] for c in res["multiple_comparisons"]["comparisons"]]
        assert len(set(round(d, 6) for d in dfs)) > 1
        assert all(math.isfinite(d) and d > 0 for d in dfs)
        assert res["df_method"] == ddfm.LABELS[ddf]


def test_api_options_and_errors():
    data = {"datasets": [{"name": n, "ys": [[v] for v in col]}
                         for n, col in zip("ABC", [[1.0, 2.1, 2.9, None, 4.2],
                                                   [2.2, 3.1, 4.0, 4.4, 5.1],
                                                   [2.0, None, 3.6, 4.1, 5.5]])]}
    out = api.analyze({"analysis": "mixed_rm_oneway", "data": data,
                       "options": {"ddf": "kenward_roger", "comparisons": "tukey"}})
    assert out["ddf"] == "kenward_roger"
    assert out["multiple_comparisons"]["df"] is None
    assert all("df" in m for m in out["estimated_means"])
    bad = api.analyze({"analysis": "mixed_rm_oneway", "data": data,
                       "options": {"ddf": "bogus"}})
    assert "ddf must be one of" in bad["error"]


def test_method_of():
    assert ddfm.method_of(None) == "containment"
    with pytest.raises(ValueError):
        ddfm.method_of("residual")
