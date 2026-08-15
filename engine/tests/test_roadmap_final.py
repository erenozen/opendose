"""Final roadmap round: competitive binding / Schild, two-way ANOVA
follow-up comparisons, RM two-way ANOVA, .pzfx import.

Cross-validation: pingouin (mixed ANOVA), statsmodels (fully-RM ANOVA),
exact-recovery simulations for the new nonlinear models, and hand
formulas for the comparison tests.
"""

import base64
import math

import numpy as np
import pytest
from scipy import stats

from opendose import api, pzfx, repeated, schild, twoway
from opendose.nlfit import MODELS, fit_model


# ---------------------------------------------------------- competitive binding

def _simulate(model, params, logx, noise=0.0, seed=0):
    spec = MODELS[model]
    rng = np.random.default_rng(seed)
    x = np.repeat(logx, 3)
    y = spec.func(x, params) + rng.normal(0, noise, x.size)
    return x.tolist(), y.tolist()


class TestCompetitiveBinding:
    LOGX = np.linspace(-10, -4, 10)

    def test_one_site_competition_recovers(self):
        truth = {"Top": 3000.0, "Bottom": 400.0, "LogIC50": -7.2}
        x, y = _simulate("one_site_competition", truth, self.LOGX, noise=20)
        fit = fit_model(x, y, "one_site_competition")
        assert fit["params"]["Top"]["value"] == pytest.approx(3000, rel=0.02)
        assert fit["params"]["Bottom"]["value"] == pytest.approx(400, rel=0.1)
        assert fit["params"]["LogIC50"]["value"] == pytest.approx(-7.2, abs=0.05)
        ic50 = fit["params"]["IC50"]
        assert ic50["value"] == pytest.approx(10 ** -7.2, rel=0.1)
        lo, hi = ic50["ci95"]
        assert lo < ic50["value"] < hi

    def test_fit_ki_cheng_prusoff(self):
        # With hot ligand at its Kd (HotNM=4, HotKdNM=4), IC50 = 2*Ki.
        ki = 1e-8
        ic50 = ki * (1 + 4.0 / 4.0)
        x, y = _simulate("one_site_competition",
                         {"Top": 100.0, "Bottom": 0.0,
                          "LogIC50": math.log10(ic50)},
                         self.LOGX, noise=1.0)
        fit = fit_model(x, y, "one_site_fit_ki",
                        constraints={"HotNM": 4.0, "HotKdNM": 4.0})
        assert fit["params"]["Ki"]["value"] == pytest.approx(ki, rel=0.05)

    def test_fit_ki_requires_constants(self):
        x, y = _simulate("one_site_competition",
                         {"Top": 100.0, "Bottom": 0.0, "LogIC50": -7.0},
                         self.LOGX)
        with pytest.raises(ValueError, match="constants"):
            fit_model(x, y, "one_site_fit_ki")

    def test_two_site_competition_recovers(self):
        truth = {"Top": 100.0, "Bottom": 0.0, "FracHi": 0.4,
                 "LogIC50_HiAff": -8.5, "LogIC50_LoAff": -5.5}
        logx = np.linspace(-11, -3, 17)
        x, y = _simulate("two_site_competition", truth, logx, noise=0.5)
        fit = fit_model(x, y, "two_site_competition")
        p = fit["params"]
        assert p["FracHi"]["value"] == pytest.approx(0.4, abs=0.05)
        assert p["LogIC50_HiAff"]["value"] == pytest.approx(-8.5, abs=0.1)
        assert p["LogIC50_LoAff"]["value"] == pytest.approx(-5.5, abs=0.1)
        assert p["IC50_HiAff"]["value"] == pytest.approx(10 ** -8.5, rel=0.3)


class TestEC50Shift:
    def _datasets(self, pa2=7.5, slope=1.0, noise=1.0):
        truth = {"Top": 100.0, "Bottom": 0.0, "LogEC50": -8.0,
                 "HillSlope": 1.0, "pA2": pa2, "SchildSlope": slope}
        rng = np.random.default_rng(1)
        datasets, antag = [], []
        for b in (0.0, 1e-7, 1e-6, 1e-5):
            x = np.repeat(np.linspace(-11, -3, 9), 2)
            y = schild.shift_func(x, b, truth) + rng.normal(0, noise, x.size)
            datasets.append({"name": f"B={b:g}", "x": x.tolist(),
                             "y": y.tolist()})
            antag.append(b)
        return datasets, antag

    def test_recovers_pa2(self):
        datasets, antag = self._datasets()
        fit = schild.fit_ec50_shift(datasets, antag)
        p = fit["params"]
        assert p["pA2"]["value"] == pytest.approx(7.5, abs=0.1)
        assert p["SchildSlope"]["value"] == pytest.approx(1.0, abs=0.1)
        assert p["LogEC50"]["value"] == pytest.approx(-8.0, abs=0.1)
        assert p["EC50"]["value"] == pytest.approx(1e-8, rel=0.3)
        # KB = 10^-pA2 with a flipped CI
        kb = p["KB"]
        assert kb["value"] == pytest.approx(10 ** -7.5, rel=0.3)
        assert kb["ci95"][0] < kb["value"] < kb["ci95"][1]
        # dose ratio grows with antagonist
        drs = [d["dose_ratio"] for d in fit["datasets"]]
        assert drs == sorted(drs)
        assert drs[0] == 1.0

    def test_constrained_schild_slope(self):
        datasets, antag = self._datasets(slope=1.0)
        fit = schild.fit_ec50_shift(datasets, antag,
                                    constraints={"SchildSlope": 1.0})
        assert fit["params"]["SchildSlope"]["constrained"]
        assert fit["params"]["pA2"]["value"] == pytest.approx(7.5, abs=0.1)

    def test_api_handler(self):
        datasets, antag = self._datasets()
        # api form: shared x column, one replicate row per point
        xs = datasets[0]["x"]
        payload = {
            "analysis": "ec50_shift",
            "data": {"x": xs,
                     "datasets": [{"name": d["name"],
                                   "ys": [[v] for v in d["y"]]}
                                  for d in datasets]},
            "options": {"antagonist": antag},
        }
        result = api.analyze(payload)
        assert "error" not in result
        assert result["params"]["pA2"]["value"] == pytest.approx(7.5, abs=0.15)
        assert len(result["datasets"][0]["curve"]["x"]) == 200


# ------------------------------------------------- two-way ANOVA comparisons

class TestTwoWayComparisons:
    # 2 rows x 3 columns, 4 replicates: clear column effect
    CELLS = [
        [[10.0, 11.0, 9.5, 10.5], [14.0, 15.0, 13.5, 14.5], [10.2, 10.8, 9.8, 11.2]],
        [[20.0, 21.0, 19.5, 20.5], [25.0, 26.0, 24.5, 25.5], [20.1, 20.9, 19.6, 21.4]],
    ]

    def test_tukey_within_rows_matches_hand_formula(self):
        result = twoway.two_way_comparisons(
            self.CELLS, direction="columns_within_rows", method="tukey",
            col_names=["A", "B", "C"])
        base = twoway.two_way_anova(self.CELLS)
        mse = base["sources"]["residual"]["ms"]
        dfe = base["sources"]["residual"]["df"]
        first = result["comparisons"][0]  # row 1: A vs B
        diff = np.mean(self.CELLS[0][0]) - np.mean(self.CELLS[0][1])
        se = math.sqrt(mse * (1 / 4 + 1 / 4))
        q = abs(diff) / (se / math.sqrt(2))
        assert first["difference"] == pytest.approx(diff)
        assert first["statistic"] == pytest.approx(q)
        assert first["p_adjusted"] == pytest.approx(
            float(stats.studentized_range.sf(q, 3, dfe)))
        assert first["significant_05"]
        assert result["n_comparisons"] == 6  # 2 rows x C(3,2)

    def test_bonferroni_total_family(self):
        result = twoway.two_way_comparisons(
            self.CELLS, direction="columns_within_rows", method="bonferroni")
        base = twoway.two_way_anova(self.CELLS)
        mse = base["sources"]["residual"]["ms"]
        dfe = base["sources"]["residual"]["df"]
        first = result["comparisons"][0]
        t = abs(first["difference"]) / math.sqrt(mse / 2)
        p0 = 2 * stats.t.sf(t, dfe)
        assert first["p_adjusted"] == pytest.approx(min(p0 * 6, 1.0))

    def test_sidak_geq_unadjusted_and_main_effects(self):
        sid = twoway.two_way_comparisons(self.CELLS, method="sidak")
        for c in sid["comparisons"]:
            lo, hi = c["ci95"]
            assert lo < c["difference"] < hi
        main = twoway.two_way_comparisons(
            self.CELLS, direction="column_means", method="tukey",
            col_names=["A", "B", "C"])
        assert main["n_comparisons"] == 3
        # column B is ~4.5 above A and C everywhere -> significant
        ab = next(c for c in main["comparisons"] if c["pair"] == "A vs. B")
        assert ab["significant_05"]

    def test_rows_within_columns(self):
        result = twoway.two_way_comparisons(
            self.CELLS, direction="rows_within_columns", method="tukey")
        assert result["n_comparisons"] == 3  # 3 columns x C(2,2)
        assert all(c["significant_05"] for c in result["comparisons"])


# ------------------------------------------------------------ RM two-way ANOVA

class TestRMTwoWay:
    def _mixed_data(self, ns=(5, 5)):
        rng = np.random.default_rng(7)
        a = 3  # repeated levels (rows)
        cells = [[[] for _ in ns] for _ in range(a)]
        for j, n in enumerate(ns):
            for s in range(n):
                subj_offset = rng.normal(0, 2)
                for i in range(a):
                    val = 10 + 3 * i + 2 * j + 0.8 * i * j \
                        + subj_offset + rng.normal(0, 1)
                    cells[i][j].append(float(val))
        return cells

    @pytest.mark.parametrize("ns", [(5, 5), (6, 4), (4, 5, 6)])
    def test_mixed_matches_pingouin(self, ns):
        pg = pytest.importorskip("pingouin")
        import pandas as pd
        cells = self._mixed_data(ns)
        rows_df = []
        subj_id = 0
        for j, n in enumerate(ns):
            for s in range(n):
                for i in range(len(cells)):
                    rows_df.append({"subject": subj_id + s, "group": j,
                                    "time": i, "y": cells[i][j][s]})
            subj_id += n
        df = pd.DataFrame(rows_df)
        expected = pg.mixed_anova(data=df, dv="y", within="time",
                                  subject="subject", between="group")
        result = repeated.rm_two_way_mixed(cells)
        src = result["sources"]
        exp = {r["Source"]: r for _, r in expected.iterrows()}
        assert src["column_factor"]["F"] == pytest.approx(
            exp["group"]["F"], rel=1e-9)
        assert src["row_factor"]["F"] == pytest.approx(
            exp["time"]["F"], rel=1e-9)
        assert src["interaction"]["F"] == pytest.approx(
            exp["Interaction"]["F"], rel=1e-9)
        assert src["column_factor"]["p"] == pytest.approx(
            exp["group"]["p_unc"], rel=1e-9)
        assert src["row_factor"]["p"] == pytest.approx(
            exp["time"]["p_unc"], rel=1e-9)
        assert result["gg_epsilon"] == pytest.approx(
            exp["time"]["eps"], rel=1e-6)

    def test_both_within_matches_statsmodels(self):
        sm = pytest.importorskip("statsmodels.stats.anova")
        import pandas as pd
        rng = np.random.default_rng(3)
        a, b, n = 3, 2, 6
        cells = [[[float(10 + 2 * i + 3 * j + rng.normal(0, 1.5)
                         + rng.normal(0, 2))  # noise + subject-ish jitter
                   for _ in range(n)] for j in range(b)] for i in range(a)]
        # rebuild with a true subject effect, consistent per subject
        subj_eff = rng.normal(0, 2, n)
        cells = [[[float(10 + 2 * i + 3 * j + 0.5 * i * j + subj_eff[s]
                         + rng.normal(0, 1))
                   for s in range(n)] for j in range(b)] for i in range(a)]
        rows_df = [{"subject": s, "A": i, "B": j, "y": cells[i][j][s]}
                   for i in range(a) for j in range(b) for s in range(n)]
        df = pd.DataFrame(rows_df)
        expected = sm.AnovaRM(df, "y", "subject",
                              within=["A", "B"]).fit().anova_table
        result = repeated.rm_two_way_both(cells)
        src = result["sources"]
        assert src["row_factor"]["F"] == pytest.approx(
            expected.loc["A", "F Value"], rel=1e-9)
        assert src["column_factor"]["F"] == pytest.approx(
            expected.loc["B", "F Value"], rel=1e-9)
        assert src["interaction"]["F"] == pytest.approx(
            expected.loc["A:B", "F Value"], rel=1e-9)
        assert src["interaction"]["p"] == pytest.approx(
            expected.loc["A:B", "Pr > F"], rel=1e-9)

    def test_api_rm_two_way(self):
        cells = self._mixed_data((5, 5))
        payload = {
            "analysis": "rm_two_way",
            "data": {"x": [None] * 3,
                     "datasets": [
                         {"name": f"G{j}",
                          "ys": [[cells[i][j][s] for s in range(5)]
                                 for i in range(3)]}
                         for j in range(2)]},
            "options": {"design": "mixed"},
        }
        result = api.analyze(payload)
        assert "error" not in result
        assert result["analysis"] == "rm_two_way_mixed"
        assert result["sources"]["row_factor"]["p"] < 0.001


# ----------------------------------------------------------------- .pzfx import

PZFX_SAMPLE = """<?xml version="1.0" encoding="UTF-8"?>
<GraphPadPrismFile xmlns="http://graphpad.com/prism/Prism.htm"
                   PrismXMLVersion="5.00">
<Created><OriginalVersion CreatedByProgram="GraphPad Prism"/></Created>
<TableSequence><Ref ID="Table0" Selected="1"/><Ref ID="Table1"/></TableSequence>
<Table ID="Table0" XFormat="numbers" YFormat="replicates" Replicates="2"
       TableType="XY" EVFormat="AsteriskAfterNumber">
<Title>Dose response</Title>
<XColumn Width="81" Subcolumns="1" Decimals="2">
<Title>log[Dose]</Title>
<Subcolumn><d>-9</d><d>-8</d><d>-7</d><d>-6</d></Subcolumn>
</XColumn>
<YColumn Width="122" Decimals="1" Subcolumns="2">
<Title>Control</Title>
<Subcolumn><d>98.1</d><d>75.2</d><d>30.4</d><d>5.5</d></Subcolumn>
<Subcolumn><d>101.3</d><d Excluded="1">120.9</d><d>28.8</d><d/></Subcolumn>
</YColumn>
<YColumn Width="122" Decimals="1" Subcolumns="2">
<Title>Treated</Title>
<Subcolumn><d>99.0</d><d>90.1</d><d>60.3</d><d>20.2</d></Subcolumn>
<Subcolumn><d>97.5</d><d>88.8</d><d>58.7</d><d>21.6</d></Subcolumn>
</YColumn>
</Table>
<Table ID="Table1" XFormat="none" YFormat="replicates" Replicates="1"
       TableType="OneWay">
<Title>Groups</Title>
<YColumn Width="81" Subcolumns="1">
<Title>Placebo</Title>
<Subcolumn><d>3.1</d><d>4.2</d><d>2.9</d></Subcolumn>
</YColumn>
<YColumn Width="81" Subcolumns="1">
<Title>Drug</Title>
<Subcolumn><d>6.5</d><d>7.1</d></Subcolumn>
</YColumn>
</Table>
</GraphPadPrismFile>
"""


class TestPzfx:
    def test_parses_tables(self):
        result = pzfx.parse_pzfx(PZFX_SAMPLE)
        assert len(result["tables"]) == 2
        t0 = result["tables"][0]
        assert t0["title"] == "Dose response"
        assert t0["table_type"] == "XY"
        assert t0["x"] == [-9.0, -8.0, -7.0, -6.0]
        assert t0["x_title"] == "log[Dose]"
        assert [d["name"] for d in t0["datasets"]] == ["Control", "Treated"]
        control = t0["datasets"][0]["ys"]
        assert control[0] == [98.1, 101.3]
        assert control[1] == [75.2, None]      # Excluded="1" -> None
        assert control[3] == [5.5, None]       # empty <d/> -> None
        t1 = result["tables"][1]
        assert t1["table_type"] == "OneWay"
        assert t1["x"] is None
        # ragged columns padded to the table's row count
        assert t1["datasets"][1]["ys"] == [[6.5], [7.1], [None]]

    def test_rejects_non_pzfx(self):
        with pytest.raises(ValueError, match="not a"):
            pzfx.parse_pzfx("<html><body>nope</body></html>")
        with pytest.raises(ValueError, match="not a valid"):
            pzfx.parse_pzfx("just text")

    def test_api_base64_roundtrip(self):
        b64 = base64.b64encode(PZFX_SAMPLE.encode()).decode()
        result = api.analyze({"analysis": "pzfx_import",
                              "data": {"pzfx_b64": b64}, "options": {}})
        assert "error" not in result
        assert result["tables"][0]["title"] == "Dose response"

    def test_imported_table_fits(self):
        """End-to-end: parse the pzfx XY table and fit it."""
        table = pzfx.parse_pzfx(PZFX_SAMPLE)["tables"][0]
        payload = {
            "analysis": "dose_response",
            "data": {"x": table["x"], "datasets": table["datasets"]},
            "options": {"model": "log_inhibitor_vs_response_4pl"},
        }
        result = api.analyze(payload)
        assert "error" not in result
        for entry in result["datasets"]:
            assert "fit" in entry, entry.get("error")


# --------------------------------------------- two-way comparisons via the API

def test_api_two_way_with_comparisons():
    cells = TestTwoWayComparisons.CELLS
    payload = {
        "analysis": "two_way_anova",
        "data": {"x": [None, None],
                 "datasets": [{"name": n, "ys": [cells[0][j], cells[1][j]]}
                              for j, n in enumerate(["A", "B", "C"])]},
        "options": {"comparisons": "tukey"},
    }
    result = api.analyze(payload)
    assert "error" not in result
    mc = result["multiple_comparisons"]
    assert mc["method"] == "tukey"
    assert mc["n_comparisons"] == 6
    assert mc["comparisons"][0]["family"] == "Row 1"
