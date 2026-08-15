"""Correlation, contingency, and two-way ANOVA validation, cross-checked
against statsmodels, scipy, and hand-derived formulas."""

import math

import numpy as np
import pytest
from scipy import stats as sps

from opendose.contingency import contingency
from opendose.correlation import correlate
from opendose.twoway import two_way_anova

X = [1.0, 2, 3, 4, 5, 6, 7, 8]
Y = [2.1, 3.9, 6.2, 8.1, 9.8, 12.3, 13.9, 16.2]


class TestCorrelation:
    def test_pearson_matches_scipy_with_fisher_ci(self):
        r = correlate(X, Y)
        rr, p = sps.pearsonr(X, Y)
        assert r["r"] == pytest.approx(rr)
        assert r["p_two_tailed"] == pytest.approx(p)
        assert r["r_squared"] == pytest.approx(rr * rr)
        z = math.atanh(rr)
        half = 1.959963985 / math.sqrt(8 - 3)
        assert r["ci_r"][0] == pytest.approx(math.tanh(z - half))
        assert r["ci_r"][1] == pytest.approx(math.tanh(z + half))

    def test_spearman(self):
        r = correlate(X, [3, 1, 4, 1, 5, 9, 2, 6.5], method="spearman")
        rs, p = sps.spearmanr(X, [3, 1, 4, 1, 5, 9, 2, 6.5])
        assert r["r"] == pytest.approx(rs)
        assert r["p_two_tailed"] == pytest.approx(p)

    def test_missing_pairs_dropped_then_too_few_raises(self):
        # blanks reduce to 2 complete pairs -> below the minimum of 3
        with pytest.raises(ValueError):
            correlate([1, 2, None, 4], [2.0, 4.1, 6.0, None])
        # with 3 complete pairs it works
        r = correlate([1, 2, None, 4], [2.0, 4.1, None, 8.3])
        assert r["n"] == 3

    def test_too_few_pairs_raises(self):
        with pytest.raises(ValueError):
            correlate([1, 2], [3, 4])


class TestContingency:
    # Classic example: exposure x outcome
    TABLE = [[15, 85], [5, 95]]

    def test_chi_square_and_fisher_match_scipy(self):
        r = contingency(self.TABLE)
        chi2, p, dof, _ = sps.chi2_contingency(self.TABLE, correction=False)
        assert r["chi_square"]["chi2"] == pytest.approx(chi2)
        assert r["chi_square"]["p"] == pytest.approx(p)
        _, p_f = sps.fisher_exact(self.TABLE)
        assert r["fisher_exact"]["p"] == pytest.approx(p_f)

    def test_odds_ratio_woolf_ci_hand_computed(self):
        r = contingency(self.TABLE)
        or_val = (15 * 95) / (85 * 5)
        assert r["odds_ratio"]["value"] == pytest.approx(or_val)
        se = math.sqrt(1 / 15 + 1 / 85 + 1 / 5 + 1 / 95)
        z = 1.959963985
        assert r["odds_ratio"]["ci"][0] == pytest.approx(
            or_val * math.exp(-z * se))
        assert r["odds_ratio"]["ci"][1] == pytest.approx(
            or_val * math.exp(z * se))

    def test_relative_risk_log_ci(self):
        r = contingency(self.TABLE)
        p1, p2 = 15 / 100, 5 / 100
        rr = p1 / p2
        assert r["relative_risk"]["value"] == pytest.approx(rr)
        se = math.sqrt((1 - p1) / 15 + (1 - p2) / 5)
        assert r["relative_risk"]["ci"][1] == pytest.approx(
            rr * math.exp(1.959963985 * se))

    def test_sensitivity_specificity_wilson(self):
        r = contingency(self.TABLE)
        assert r["sensitivity"]["value"] == pytest.approx(0.15)
        assert r["specificity"]["value"] == pytest.approx(0.95)
        lo, hi = r["sensitivity"]["ci"]
        assert lo < 0.15 < hi

    def test_rxc_chi_square(self):
        table = [[10, 20, 30], [20, 25, 15], [30, 15, 10]]
        r = contingency(table)
        chi2, p, dof, _ = sps.chi2_contingency(table, correction=False)
        assert r["chi_square"]["chi2"] == pytest.approx(chi2)
        assert r["chi_square"]["df"] == dof
        assert "odds_ratio" not in r  # 2x2-only outputs absent


class TestTwoWayANOVA:
    def _balanced_cells(self):
        # 2 rows (factor A) x 3 columns (factor B), 4 replicates
        rng = np.random.default_rng(42)
        effects_a = [0.0, 3.0]
        effects_b = [0.0, 2.0, 4.0]
        cells = []
        for i in range(2):
            row = []
            for j in range(3):
                row.append(list(10 + effects_a[i] + effects_b[j]
                                + rng.normal(0, 1.0, 4)))
            cells.append(row)
        return cells

    def test_balanced_matches_statsmodels(self):
        import pandas as pd
        import statsmodels.api as sm
        from statsmodels.formula.api import ols
        cells = self._balanced_cells()
        ours = two_way_anova(cells)

        rows = []
        for i, row in enumerate(cells):
            for j, cell in enumerate(row):
                for v in cell:
                    rows.append({"y": v, "A": f"a{i}", "B": f"b{j}"})
        df = pd.DataFrame(rows)
        model = ols("y ~ C(A, Sum) * C(B, Sum)", data=df).fit()
        table = sm.stats.anova_lm(model, typ=3)

        assert ours["sources"]["Rows"]["F"] == pytest.approx(
            table.loc["C(A, Sum)", "F"], rel=1e-6)
        assert ours["sources"]["Columns"]["F"] == pytest.approx(
            table.loc["C(B, Sum)", "F"], rel=1e-6)
        assert ours["sources"]["interaction"]["F"] == pytest.approx(
            table.loc["C(A, Sum):C(B, Sum)", "F"], rel=1e-6)
        assert ours["sources"]["residual"]["df"] == int(table.loc["Residual", "df"])

    def test_unbalanced_type3_matches_statsmodels(self):
        import pandas as pd
        import statsmodels.api as sm
        from statsmodels.formula.api import ols
        cells = self._balanced_cells()
        cells[0][0] = cells[0][0][:2]   # unbalance two cells
        cells[1][2] = cells[1][2][:3]
        ours = two_way_anova(cells)

        rows = []
        for i, row in enumerate(cells):
            for j, cell in enumerate(row):
                for v in cell:
                    rows.append({"y": v, "A": f"a{i}", "B": f"b{j}"})
        df = pd.DataFrame(rows)
        model = ols("y ~ C(A, Sum) * C(B, Sum)", data=df).fit()
        table = sm.stats.anova_lm(model, typ=3)
        assert ours["sources"]["Rows"]["ss"] == pytest.approx(
            table.loc["C(A, Sum)", "sum_sq"], rel=1e-6)
        assert ours["sources"]["Columns"]["ss"] == pytest.approx(
            table.loc["C(B, Sum)", "sum_sq"], rel=1e-6)
        assert ours["sources"]["interaction"]["ss"] == pytest.approx(
            table.loc["C(A, Sum):C(B, Sum)", "sum_sq"], rel=1e-6)

    def test_percent_of_total_sums_reasonably(self):
        ours = two_way_anova(self._balanced_cells())
        total_pct = sum(s["percent_of_total"] for s in ours["sources"].values())
        assert total_pct == pytest.approx(100.0, abs=1.0)

    def test_detects_main_effects(self):
        ours = two_way_anova(self._balanced_cells())
        assert ours["sources"]["Rows"]["p"] < 0.001      # A effect = 3
        assert ours["sources"]["Columns"]["p"] < 0.001   # B effect = 4
        assert ours["sources"]["interaction"]["p"] > 0.01  # no interaction
