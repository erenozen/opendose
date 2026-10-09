"""Two-way nested mixed model (value ~ A * B + (1 | unit)) and the
grouping-column mixed model (opendose.mixed_nested).

References:
- The classical balanced nested ANOVA (A, B and A x B tested against the
  mean square of units within cells; variance components from expected
  mean squares), written out by hand below (_classical): for balanced
  data the REML fit with an unbounded unit variance reproduces it
  exactly (Searle, Casella & McCulloch 1992, Variance Components, ch. 4).
  The F, df and P values of the literal data set are pinned at display
  precision as printed by that hand computation.
- opendose.nested.nested_one_way_anova (validated against the GraphPad
  guide's printed examples) when factor B has a single level.
- statsmodels MixedLM (REML), the same model as lme4's
  lmer(value ~ A * B + (1 | unit)), for variance components, cell means
  and their SEs and the Wald F statistics on unbalanced data.
"""

import json
import math
import warnings

import numpy as np
import pytest
from scipy import stats

from opendose import api, nested
from opendose import mixed_nested as mn

# Genotype x treatment, 3 mice per cell, 4 cells (values) per mouse.
DATA = [
    ("WT", "Vehicle", "WV1", [11.4, 11.3, 9.5, 9.7]),
    ("WT", "Vehicle", "WV2", [9.9, 9.3, 10.1, 7.5]),
    ("WT", "Vehicle", "WV3", [11.8, 12.6, 11.7, 11.5]),
    ("WT", "Drug", "WD1", [12.2, 11.2, 11.2, 12.0]),
    ("WT", "Drug", "WD2", [8.2, 10.2, 9.1, 7.8]),
    ("WT", "Drug", "WD3", [9.4, 8.6, 8.3, 9.9]),
    ("KO", "Vehicle", "KV1", [12.3, 11.8, 13.0, 13.3]),
    ("KO", "Vehicle", "KV2", [11.7, 12.2, 10.9, 10.3]),
    ("KO", "Vehicle", "KV3", [12.2, 13.0, 10.6, 11.3]),
    ("KO", "Drug", "KD1", [10.6, 12.4, 12.8, 11.6]),
    ("KO", "Drug", "KD2", [15.8, 15.6, 15.4, 15.9]),
    ("KO", "Drug", "KD3", [12.3, 12.3, 9.9, 12.0]),
]


def _records(data=DATA, drop=()):
    out = []
    for a, b, u, vals in data:
        for k, v in enumerate(vals):
            if (u, k) in drop:
                continue
            out.append({"value": v, "factor_a": a, "factor_b": b,
                        "unit": u, "replicate": k + 1})
    return out


def _classical(data=DATA):
    """Balanced nested ANOVA by hand: a x b cells, n units per cell, r
    values per unit. Returns {term: (F, dfn, dfd, P)}, var_unit, MSE."""
    y = np.array([d[3] for d in data]).reshape(2, 2, 3, 4)
    a, b, n, r = y.shape
    gm = y.mean()
    ma, mb = y.mean(axis=(1, 2, 3)), y.mean(axis=(0, 2, 3))
    cm, um = y.mean(axis=(2, 3)), y.mean(axis=3)
    ss = {"A": b * n * r * ((ma - gm) ** 2).sum(),
          "B": a * n * r * ((mb - gm) ** 2).sum(),
          "AB": n * r * ((cm - ma[:, None] - mb[None, :] + gm) ** 2).sum()}
    df = {"A": a - 1, "B": b - 1, "AB": (a - 1) * (b - 1)}
    ssu = r * ((um - cm[..., None]) ** 2).sum()
    sse = ((y - um[..., None]) ** 2).sum()
    dfu, dfe = a * b * (n - 1), a * b * n * (r - 1)
    msu, mse = ssu / dfu, sse / dfe
    out = {}
    for k in ss:
        f = ss[k] / df[k] / msu
        out[k] = (f, df[k], dfu, float(stats.f.sf(f, df[k], dfu)))
    return out, (msu - mse) / r, mse, math.sqrt(msu / (n * r))


class TestBalancedEqualsClassicalNestedAnova:
    def setup_method(self):
        self.res = mn.mixed_nested_two_way(
            {"records": _records()},
            {"factor_a_name": "Genotype", "factor_b_name": "Treatment",
             "unit_name": "mice"})

    def test_f_df_p_pinned(self):
        # printed by _classical (hand-written nested ANOVA) on DATA
        pinned = {"Genotype": (6.30811, 1, 8, 0.036281),
                  "Treatment": (0.0706634, 1, 8, 0.797096),
                  "Genotype × Treatment": (1.03525, 1, 8, 0.338710)}
        rows = {r["term"]: r for r in self.res["anova"]}
        for term, (f, dfn, dfd, p) in pinned.items():
            assert rows[term]["f"] == pytest.approx(f, rel=2e-5)
            assert rows[term]["dfn"] == dfn and rows[term]["dfd"] == dfd
            assert rows[term]["p"] == pytest.approx(p, rel=2e-5)

    def test_equals_hand_computation(self):
        hand, var_u, mse, se_cell = _classical()
        rows = {r["term"]: r for r in self.res["anova"]}
        for term, key in (("Genotype", "A"), ("Treatment", "B"),
                          ("Genotype × Treatment", "AB")):
            f, dfn, dfd, p = hand[key]
            assert rows[term]["f"] == pytest.approx(f, rel=1e-7)
            assert rows[term]["dfd"] == dfd
            assert rows[term]["p"] == pytest.approx(p, rel=1e-6)
        vc = self.res["variance_components"]
        assert vc["unit"]["variance"] == pytest.approx(var_u, rel=1e-7)
        assert vc["residual"]["variance"] == pytest.approx(mse, rel=1e-7)
        assert self.res["icc"] == pytest.approx(var_u / (var_u + mse),
                                                rel=1e-7)
        for cell in self.res["cell_means"]:
            assert cell["se"] == pytest.approx(se_cell, rel=1e-7)

    def test_display_values(self):
        # ANOVA estimators of the variance components (printed above)
        vc = self.res["variance_components"]
        assert vc["unit"]["variance"] == pytest.approx(2.28757, rel=1e-5)
        assert vc["residual"]["variance"] == pytest.approx(0.767639, rel=1e-5)
        assert self.res["icc"] == pytest.approx(0.748744, rel=1e-5)
        means = {(c["a"], c["b"]): c for c in self.res["cell_means"]}
        assert means[("WT", "Vehicle")]["mean"] == pytest.approx(10.525)
        assert means[("KO", "Drug")]["mean"] == pytest.approx(13.05)
        assert means[("KO", "Drug")]["se"] == pytest.approx(0.909117, rel=1e-5)
        assert means[("KO", "Drug")]["n_units"] == 3
        assert means[("KO", "Drug")]["n_values"] == 12

    def test_df_come_from_units(self):
        r = self.res
        assert r["n_units"] == 12 and r["n_values"] == 48
        assert r["df"]["units"] == 8          # 12 mice - 4 cells
        assert r["df"]["residual"] == 36      # 48 values - 12 mice
        assert r["design_note"].startswith(
            "df come from 12 mice, not from 48 values")
        # design effect (Aarts et al. 2014): 1 + (4 - 1) ICC
        assert r["design_effect"] == pytest.approx(1 + 3 * r["icc"])
        assert r["effective_n"] == pytest.approx(48 / r["design_effect"])
        assert r["formula"] == "value ~ Genotype * Treatment + (1 | unit)"
        assert r["warnings"] == []

    def test_pseudoreplication_contrast(self):
        # treating the 48 cells as independent gives df 44 and a much
        # smaller P for genotype: the analysis the model exists to avoid
        y = np.array([d[3] for d in DATA]).reshape(2, 2, 12)
        cm = y.mean(axis=2)
        mse = ((y - cm[..., None]) ** 2).sum() / 44
        gm = y.mean()
        f_naive = 24 * ((y.mean(axis=(1, 2)) - gm) ** 2).sum() / mse
        p_naive = stats.f.sf(f_naive, 1, 44)
        rows = {r["term"]: r for r in self.res["anova"]}
        assert p_naive < rows["Genotype"]["p"] / 100


class TestEqualsNestedOneWay:
    @pytest.mark.parametrize("drop", [(), (("WV1", 0), ("KD2", 3),
                                           ("KD2", 2), ("WD3", 1))])
    def test_single_level_b(self, drop):
        # B = Drug only: three genotype-like groups by using A = cell
        data = [(f"{a}-{b}", "only", u, vals) for a, b, u, vals in DATA]
        recs = _records(data, drop)
        res = mn.mixed_nested_two_way({"records": recs},
                                      {"comparisons": "tukey"})
        groups = []
        for g in ["WT-Vehicle", "WT-Drug", "KO-Vehicle", "KO-Drug"]:
            subs = []
            for a, _, u, vals in data:
                if a == g:
                    subs.append([v for k, v in enumerate(vals)
                                 if (u, k) not in drop])
            groups.append(subs)
        ref = nested.nested_one_way_anova(groups, comparisons="tukey")
        assert len(res["anova"]) == 1
        row = res["anova"][0]
        assert row["f"] == pytest.approx(ref["F"], rel=1e-7)
        assert row["dfd"] == ref["df_den"] == 8
        assert row["p"] == pytest.approx(ref["p"], rel=1e-6)
        vc = res["variance_components"]
        assert vc["unit"]["variance"] == pytest.approx(
            ref["random_effects"]["among_subcolumns"]["variance"], rel=1e-6)
        assert vc["residual"]["variance"] == pytest.approx(
            ref["random_effects"]["within_subcolumns"]["variance"], rel=1e-6)
        for mine, theirs in zip(res["cell_means"], ref["group_means"]):
            assert mine["mean"] == pytest.approx(theirs["mean"], rel=1e-9)
            assert mine["se"] == pytest.approx(theirs["se"], rel=1e-6)
        for mine, theirs in zip(res["comparisons"]["comparisons"],
                                ref["multiple_comparisons"]["comparisons"]):
            assert mine["p_adjusted"] == pytest.approx(theirs["p_adjusted"],
                                                       rel=1e-5)
        assert any("single level" in w for w in res["warnings"])


class TestAgainstStatsmodels:
    """lme4's lmer(value ~ A * B + (1 | unit)) as statsmodels MixedLM."""

    DROP = (("WV1", 0), ("WV1", 1), ("KD2", 3), ("KV3", 2), ("WD2", 0))

    def test_unbalanced(self):
        pd = pytest.importorskip("pandas")
        smf = pytest.importorskip("statsmodels.formula.api")
        recs = _records(drop=self.DROP)
        df = pd.DataFrame(recs)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            sm = smf.mixedlm("value ~ C(factor_a, Sum) * C(factor_b, Sum)",
                             df, groups=df.unit).fit(
                reml=True, method="bfgs", gtol=1e-12)
        res = mn.mixed_nested_two_way(
            {"records": recs}, {"negative_variance": "zero",
                                "levels_a": ["KO", "WT"],
                                "levels_b": ["Drug", "Vehicle"]})
        vc = res["variance_components"]
        assert vc["unit"]["variance"] == pytest.approx(
            float(sm.cov_re.iloc[0, 0]), rel=1e-5)
        assert vc["residual"]["variance"] == pytest.approx(sm.scale, rel=1e-5)
        # cell means and SEs from statsmodels' coefficients (patsy orders
        # levels alphabetically: KO, WT and Drug, Vehicle)
        b = sm.fe_params.to_numpy()
        C = sm.cov_params().to_numpy()[:4, :4]
        for cell in res["cell_means"]:
            sa = 1.0 if cell["a"] == "KO" else -1.0
            sb = 1.0 if cell["b"] == "Drug" else -1.0
            L = np.array([1.0, sa, sb, sa * sb])
            assert cell["mean"] == pytest.approx(float(L @ b), rel=1e-6)
            assert cell["se"] == pytest.approx(math.sqrt(L @ C @ L), rel=1e-4)
        # Wald F (1 df each) = z^2 of the statsmodels coefficient
        # (statsmodels' cov_params comes from its numerical Hessian:
        # agreement to display precision, about 2e-4 relative)
        rows = res["anova"]
        z = b[1:4] / np.sqrt(np.diag(C)[1:4])
        for row, zz in zip(rows, z):
            assert row["f"] == pytest.approx(zz ** 2, rel=1e-3)
            assert row["dfd"] == 8


class TestLayoutsAndLabels:
    def test_grouped_layout_equals_records(self):
        datasets = []
        for b in ["Vehicle", "Drug"]:
            ys = []
            names = []
            for a in ["WT", "KO"]:
                row = [vals for aa, bb, u, vals in DATA if aa == a and bb == b]
                ys.append(row)
                names.append([u for aa, bb, u, _ in DATA
                              if aa == a and bb == b])
            datasets.append({"name": b, "ys": ys, "unit_names": names})
        grouped = mn.mixed_nested_two_way(
            {"row_titles": ["WT", "KO"], "datasets": datasets}, {})
        long = mn.mixed_nested_two_way({"records": _records()}, {})
        for g, r in zip(grouped["anova"], long["anova"]):
            assert g["f"] == pytest.approx(r["f"], rel=1e-9)
            assert g["dfd"] == r["dfd"]
        assert grouped["n_units"] == 12

    def test_reused_labels_nested_by_default(self):
        data = [(a, b, u[-1], vals) for a, b, u, vals in DATA]  # "1".."3"
        res = mn.mixed_nested_two_way({"records": _records(data)}, {})
        assert res["n_units"] == 12
        assert any("repeat across cells" in w for w in res["warnings"])
        ref = mn.mixed_nested_two_way({"records": _records()}, {})
        assert res["anova"][0]["f"] == pytest.approx(ref["anova"][0]["f"])

    def test_as_given_crossed_units(self):
        # the same three "animals" measured under both treatments:
        # treatment varies within units -> residual df
        data = [(a, b, f"{a}{u[-1]}", vals) for a, b, u, vals in DATA]
        res = mn.mixed_nested_two_way({"records": _records(data)},
                                      {"unit_labels": "as_given"})
        assert res["n_units"] == 6
        rows = {r["term"]: r for r in res["anova"]}
        assert rows["A"]["dfd"] == 4                 # 6 units - 2 genotypes
        assert rows["B"]["dfd"] == res["df"]["residual"]
        assert rows["A × B"]["error_term"] == "residual"
        assert res["unit_nested_in"] == {"A": True, "B": False}
        assert any("more than one level of B" in w for w in res["warnings"])

    def test_negative_variance_warning(self):
        # units identical in mean: between-unit MS below within MS
        data = [("A1", "B1", "u1", [1.0, 3.0]), ("A1", "B1", "u2", [3.0, 1.0]),
                ("A1", "B2", "u3", [2.0, 4.0]), ("A1", "B2", "u4", [4.0, 2.0]),
                ("A2", "B1", "u5", [1.5, 3.5]), ("A2", "B1", "u6", [3.5, 1.4]),
                ("A2", "B2", "u7", [2.0, 4.1]), ("A2", "B2", "u8", [4.0, 2.0])]
        recs = []
        for a, b, u, vals in data:
            recs += [{"value": v, "factor_a": a, "factor_b": b, "unit": u}
                     for v in vals]
        res = mn.mixed_nested_two_way({"records": recs}, {})
        assert res["variance_components"]["unit"]["variance"] < 0
        assert res["icc"] == 0.0 and res["icc_raw"] < 0
        assert any("negative" in w for w in res["warnings"])
        zero = mn.mixed_nested_two_way({"records": recs},
                                       {"negative_variance": "zero"})
        assert zero["variance_components"]["unit"]["variance"] == \
            pytest.approx(0.0, abs=1e-8)

    def test_errors(self):
        recs = [r for r in _records() if r["unit"][:2] != "KD"]
        with pytest.raises(ValueError, match="every cell needs data"):
            mn.mixed_nested_two_way({"records": recs}, {})
        one = [r for r in _records() if r["unit"][-1] == "1"]
        with pytest.raises(ValueError, match="more units than cells"):
            mn.mixed_nested_two_way({"records": one}, {})
        single = [r for r in _records() if r["replicate"] == 1]
        with pytest.raises(ValueError, match="replicate values"):
            mn.mixed_nested_two_way({"records": single}, {})

    def test_blank_values_reported(self):
        recs = _records() + [{"value": None, "factor_a": "WT",
                              "factor_b": "Drug", "unit": "WD1"},
                             {"value": "n/a", "factor_a": "WT",
                              "factor_b": "Drug", "unit": "WD1"}]
        res = mn.mixed_nested_two_way({"records": recs}, {})
        assert res["n_values"] == 48
        assert any("2 records" in w for w in res["warnings"])


class TestComparisons:
    def _res(self, method, scope=None):
        opts = {"comparisons": method}
        if scope:
            opts["comparison_scope"] = scope
        return mn.mixed_nested_two_way({"records": _records()}, opts)

    def test_sidak_within_genotype(self):
        res = self._res("sidak")
        comps = res["comparisons"]["comparisons"]
        assert len(comps) == 2       # Vehicle vs Drug within WT and KO
        hand, var_u, mse, se_cell = _classical()
        for c in comps:
            se = math.sqrt(2) * se_cell
            assert c["se"] == pytest.approx(se, rel=1e-7)
            t = abs(c["difference"]) / se
            p = 2 * stats.t.sf(t, 8)
            assert c["p_unadjusted"] == pytest.approx(p, rel=1e-6)
            assert c["p_adjusted"] == pytest.approx(1 - (1 - p) ** 2,
                                                    rel=1e-6)
        assert res["comparisons"]["family"]["size"] == 2

    def test_holm_all_cells(self):
        res = self._res("holm", "cells")
        comps = res["comparisons"]["comparisons"]
        assert len(comps) == 6
        raw = sorted(c["p_unadjusted"] for c in comps)
        expect, running = [], 0.0
        for k, p in enumerate(raw):
            running = max(running, min((6 - k) * p, 1.0))
            expect.append(running)
        got = sorted(c["p_adjusted"] for c in comps)
        np.testing.assert_allclose(got, expect, rtol=1e-12)
        assert all(c["method"] == "holm" and c["ci"] is None for c in comps)

    def test_tukey_marginal(self):
        res = self._res("tukey", "a_means")
        comps = res["comparisons"]["comparisons"]
        assert len(comps) == 1
        # with 2 means Tukey = t test on the A df
        row = {r["term"]: r for r in res["anova"]}["A"]
        assert comps[0]["p_adjusted"] == pytest.approx(row["p"], rel=1e-5)

    def test_unknown_scope(self):
        with pytest.raises(ValueError):
            self._res("sidak", "rows")


class TestGrouping:
    def _vars(self, litter_spans=False):
        rng = np.random.default_rng(5)
        out, treat, litter, sex = [], [], [], []
        for lit in range(8):
            u = rng.normal(0, 1.0)
            for pup in range(5):
                if litter_spans:
                    t = "Drug" if pup % 2 else "Vehicle"
                else:
                    t = "Drug" if lit % 2 else "Vehicle"
                s = "F" if pup < 2 else "M"
                out.append(round(20 + (t == "Drug") * 1.2 + u
                                 + rng.normal(0, 0.8), 2))
                treat.append(t)
                litter.append(f"L{lit + 1}")
                sex.append(s)
        return [{"name": "weight", "values": out},
                {"name": "treatment", "values": treat},
                {"name": "sex", "values": sex},
                {"name": "litter", "values": litter}]

    def test_litter_nested_in_treatment(self):
        res = mn.mixed_grouping(self._vars(), "weight", ["treatment"],
                                "litter")
        assert res["anova"][0]["dfd"] == 6      # 8 litters - 2 treatments
        assert res["formula"] == "weight ~ treatment + (1 | litter)"
        assert res["n_units"] == 8

    def test_litter_spans_treatment_matches_statsmodels(self):
        pd = pytest.importorskip("pandas")
        smf = pytest.importorskip("statsmodels.formula.api")
        v = self._vars(litter_spans=True)
        res = mn.mixed_grouping(v, "weight", ["treatment", "sex"], "litter",
                                {"negative_variance": "zero"})
        rows = {r["term"]: r for r in res["anova"]}
        # both factors vary within litters: residual df
        assert rows["treatment"]["dfd"] == res["df"]["residual"] == 40 - 8 - 3
        df = pd.DataFrame({x["name"]: x["values"] for x in v})
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            sm = smf.mixedlm("weight ~ C(treatment, Sum) * C(sex, Sum)", df,
                             groups=df.litter).fit(reml=True, method="bfgs",
                                                   gtol=1e-12)
        assert res["variance_components"]["unit"]["variance"] == \
            pytest.approx(float(sm.cov_re.iloc[0, 0]), rel=1e-5)
        b = sm.fe_params.to_numpy()
        se = np.sqrt(np.diag(sm.cov_params().to_numpy()))
        for row, k in (("treatment", 1), ("sex", 2),
                       ("treatment × sex", 3)):
            assert rows[row]["f"] == pytest.approx((b[k] / se[k]) ** 2,
                                                   rel=1e-3)

    def test_grouping_equals_nested_handler(self):
        recs = _records()
        variables = [{"name": "y", "values": [r["value"] for r in recs]},
                     {"name": "geno", "values": [r["factor_a"] for r in recs]},
                     {"name": "drug", "values": [r["factor_b"] for r in recs]},
                     {"name": "mouse", "values": [r["unit"] for r in recs]}]
        g = mn.mixed_grouping(variables, "y", ["geno", "drug"], "mouse")
        n = mn.mixed_nested_two_way({"records": recs}, {})
        for a, b in zip(g["anova"], n["anova"]):
            assert a["f"] == pytest.approx(b["f"], rel=1e-9)
            assert a["dfd"] == b["dfd"]

    def test_bad_names(self):
        with pytest.raises(ValueError, match="no variable"):
            mn.mixed_grouping(self._vars(), "weight", ["dose"], "litter")
        with pytest.raises(ValueError, match="one or two"):
            mn.mixed_grouping(self._vars(), "weight", [], "litter")


class TestApi:
    def test_nested_handler_json(self):
        out = json.loads(api.analyze_json(json.dumps({
            "analysis": "mixed_nested_two_way",
            "data": {"records": _records()},
            "options": {"factor_a_name": "Genotype",
                        "factor_b_name": "Treatment",
                        "unit_name": "mice", "comparisons": "sidak"}})))
        assert "error" not in out, out.get("traceback")
        assert out["analysis"] == "mixed_nested_two_way"
        assert {r["term"] for r in out["anova"]} == {
            "Genotype", "Treatment", "Genotype × Treatment"}
        for key in ("variance_components", "icc", "n_units", "n_values",
                    "cell_means", "comparisons", "warnings", "design_note"):
            assert key in out
        assert set(out["cell_means"][0]) >= {"a", "b", "mean", "se", "ci",
                                             "n_units"}

    def test_grouping_handler(self):
        recs = _records()
        out = api.analyze({
            "analysis": "mixed_grouping",
            "data": {"variables": [
                {"name": "y", "values": [r["value"] for r in recs]},
                {"name": "geno", "values": [r["factor_a"] for r in recs]},
                {"name": "mouse", "values": [r["unit"] for r in recs]}]},
            "options": {"outcome": "y", "factors": ["geno"],
                        "grouping": "mouse", "comparisons": "tukey"}})
        assert "error" not in out, out.get("traceback")
        assert out["analysis"] == "mixed_grouping"
        assert out["anova"][0]["dfd"] == 10      # 12 mice - 2 genotypes
