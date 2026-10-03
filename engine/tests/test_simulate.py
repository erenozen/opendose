"""Simulations and Monte Carlo (statistics guide 'Simulating data and
Monte Carlo simulations'). Fixed seeds; distributional checks are loose,
structural checks exact."""

import math

import numpy as np
import pytest
from scipy import stats

from opendose import nlfit
from opendose.api import analyze
from opendose.simulate import (add_error, extract, monte_carlo,
                               simulate_column, simulate_contingency,
                               simulate_xy, x_series)

DR = {"Bottom": 250, "Top": 5000, "LogXmid": -6, "HillSlope": 0.5}


class TestXSeries:
    def test_guide_example_arithmetic(self):
        # start -9, increment 0.5, stop when X equals or exceeds -3
        xs = x_series({"kind": "arithmetic", "start": -9, "increment": 0.5,
                       "stop": -3})
        assert len(xs) == 13 and xs[0] == -9 and xs[-1] == -3

    def test_stop_not_on_grid_overshoots_once(self):
        xs = x_series({"kind": "arithmetic", "start": 0, "increment": 0.3,
                       "stop": 1})
        assert xs == pytest.approx([0, 0.3, 0.6, 0.9, 1.2])

    def test_geometric_and_count(self):
        assert x_series({"kind": "geometric", "start": 1e-9, "factor": 10,
                         "count": 4}) == pytest.approx([1e-9, 1e-8, 1e-7, 1e-6])
        xs = x_series({"kind": "geometric", "start": 1, "factor": 3,
                       "stop": 100})
        assert xs == [1, 3, 9, 27, 81, 243]

    def test_linear_and_log(self):
        assert x_series({"kind": "linear", "start": 0, "stop": 1,
                         "count": 5}) == [0, 0.25, 0.5, 0.75, 1]
        assert x_series({"kind": "log", "start": 1, "stop": 1000,
                         "count": 4}) == pytest.approx([1, 10, 100, 1000])

    def test_list_and_errors(self):
        assert x_series([1, None, 3]) == [1.0, None, 3.0]
        with pytest.raises(ValueError):
            x_series({"kind": "arithmetic", "start": 0, "increment": 0,
                      "stop": 1})
        with pytest.raises(ValueError):
            x_series({"kind": "log", "start": 0, "stop": 1, "count": 3})


class TestErrors:
    rng = np.random.default_rng(0)

    def test_none(self):
        assert list(add_error([1.0, 2.0], {"kind": "none"}, self.rng)) == [1, 2]

    def test_gaussian_absolute(self):
        y = add_error(np.full(20000, 10.0), {"kind": "gaussian", "sd": 2},
                      np.random.default_rng(1))
        assert y.mean() == pytest.approx(10, abs=0.05)
        assert y.std() == pytest.approx(2, rel=0.03)

    def test_relative_scales_with_y(self):
        rng = np.random.default_rng(2)
        y = add_error(np.full(20000, 200.0), {"kind": "relative",
                                              "percent": 10}, rng)
        assert y.std() == pytest.approx(20, rel=0.03)

    def test_t_has_heavier_tails(self):
        rng = np.random.default_rng(3)
        y = add_error(np.zeros(40000), {"kind": "t", "sd": 1, "df": 3}, rng)
        assert stats.kurtosis(y) > 2  # Gaussian excess kurtosis is 0

    def test_poisson_integer_mean(self):
        rng = np.random.default_rng(4)
        y = add_error(np.array([4.0] * 20000 + [-1.0]), {"kind": "poisson"},
                      rng)
        assert np.all(y[:-1] == np.round(y[:-1]))
        assert y[:-1].mean() == pytest.approx(4, abs=0.05)
        assert y[:-1].var() == pytest.approx(4, rel=0.05)
        assert math.isnan(y[-1])

    def test_binomial_proportion_and_count(self):
        rng = np.random.default_rng(5)
        y = add_error(np.full(20000, 30.0), {"kind": "binomial", "n": 50,
                                             "percent": True}, rng)
        assert y.mean() == pytest.approx(30, abs=0.3)
        k = add_error(np.full(10, 0.5), {"kind": "binomial", "n": 8,
                                         "output": "count"}, rng)
        assert np.all((k >= 0) & (k <= 8) & (k == np.round(k)))

    def test_outliers(self):
        rng = np.random.default_rng(6)
        y = add_error(np.zeros(20000), {"kind": "gaussian", "sd": 1,
                                        "outliers": {"probability": 0.05,
                                                     "sd_multiple": 10,
                                                     "direction": "up"}}, rng)
        assert np.mean(y > 6) == pytest.approx(0.05, abs=0.01)
        assert np.mean(y < -6) == 0


class TestSimulateXY:
    X = {"kind": "arithmetic", "start": -9, "increment": 0.5, "stop": -3}

    def test_shape_and_ideal_curve_reuse_registry(self):
        sim = simulate_xy("log_agonist_vs_response_4pl", DR, x=self.X,
                          replicates=3, n_datasets=2, seed=1)
        assert len(sim["x"]) == 13 and len(sim["datasets"]) == 2
        assert all(len(r) == 3 for r in sim["datasets"][0]["ys"])
        ideal = nlfit.MODELS["log_agonist_vs_response_4pl"].func(
            np.array(sim["x"]), DR)
        assert sim["datasets"][0]["ideal"] == pytest.approx(list(ideal))
        assert [d["name"] for d in sim["datasets"]] == ["Data Set A",
                                                        "Data Set B"]

    def test_no_error_equals_ideal(self):
        sim = simulate_xy("michaelis_menten", {"Vmax": 10, "Km": 2},
                          x=[0, 2, 4], seed=0)
        assert [r[0] for r in sim["datasets"][0]["ys"]] == pytest.approx(
            [0, 5, 20 / 3])

    def test_seed_reproducible(self):
        kw = dict(x=self.X, replicates=2,
                  error={"kind": "gaussian", "sd": 200})
        a = simulate_xy("log_agonist_vs_response_4pl", DR, seed=42, **kw)
        b = simulate_xy("log_agonist_vs_response_4pl", DR, seed=42, **kw)
        c = simulate_xy("log_agonist_vs_response_4pl", DR, seed=43, **kw)
        assert a["datasets"] == b["datasets"]
        assert a["datasets"] != c["datasets"]
        assert a["seed"] == 42

    def test_unseeded_reports_seed(self):
        sim = simulate_xy("michaelis_menten", {"Vmax": 1, "Km": 1}, x=[1])
        assert isinstance(sim["seed"], int)

    def test_per_dataset_params(self):
        sim = simulate_xy("log_agonist_vs_response_4pl",
                          [DR, {"LogXmid": -5}], x=[-6, -5], n_datasets=2,
                          seed=0)
        assert sim["datasets"][0]["ideal"][0] == pytest.approx(2625)
        assert sim["datasets"][1]["ideal"][1] == pytest.approx(2625)

    def test_missing_params_and_unknown_model(self):
        with pytest.raises(ValueError, match="HillSlope"):
            simulate_xy("log_agonist_vs_response_4pl",
                        {"Bottom": 0, "Top": 1, "LogXmid": 0}, x=[0])
        with pytest.raises(ValueError):
            simulate_xy("nope", {}, x=[0])

    def test_fit_recovers_parameters(self):
        sim = simulate_xy("log_agonist_vs_response_4pl", DR,
                          x={"kind": "arithmetic", "start": -9,
                             "increment": 0.25, "stop": -3},
                          replicates=3, error={"kind": "gaussian", "sd": 50},
                          seed=11)
        res = analyze({"analysis": "dose_response",
                       "data": {"x": sim["x"], "datasets": sim["datasets"]},
                       "options": {"model": "log_agonist_vs_response_4pl"}})
        p = res["datasets"][0]["fit"]["params"]
        assert p["LogEC50"]["value"] == pytest.approx(-6, abs=0.15)
        assert p["Top"]["value"] == pytest.approx(5000, rel=0.05)


class TestSimulateColumn:
    def test_structure_and_moments(self):
        sim = simulate_column([{"name": "Ctrl", "n": 5000, "mean": 10},
                               {"name": "Trt", "n": 3000, "mean": 20}],
                              error={"kind": "gaussian", "sd": 3}, seed=1)
        a, b = sim["datasets"]
        assert a["name"] == "Ctrl" and len(a["ys"]) == 5000
        assert len(b["ys"]) == 3000 and len(sim["x"]) == 5000
        va = np.array([r[0] for r in a["ys"]])
        assert va.mean() == pytest.approx(10, abs=0.15)
        assert va.std(ddof=1) == pytest.approx(3, rel=0.05)

    def test_random_means(self):
        sim = simulate_column([{"n": 1}] * 2000, error={"kind": "none"},
                              random_means={"mean": 50, "sd": 5}, seed=2)
        mus = np.array([d["population_mean"] for d in sim["datasets"]])
        assert mus.mean() == pytest.approx(50, abs=0.4)
        assert mus.std() == pytest.approx(5, rel=0.08)
        assert sim["datasets"][0]["ys"][0][0] == sim["datasets"][0][
            "population_mean"]


class TestSimulateContingency:
    def test_prospective_row_totals_fixed(self):
        sim = simulate_contingency("prospective", row_totals=[100, 80],
                                   outcome_probabilities=[0.3, 0.6], seed=1)
        t = np.array(sim["table"])
        assert t.shape == (2, 2)
        assert list(t.sum(axis=1)) == [100, 80]
        assert sim["row_titles"] == ["Row 1", "Row 2"]

    def test_experimental_total_split_equally(self):
        sim = simulate_contingency("experimental", total=101,
                                   outcome_probabilities=[0.5, 0.5], seed=1)
        assert list(np.sum(sim["table"], axis=1)) == [51, 50]

    def test_case_control_column_totals_fixed(self):
        sim = simulate_contingency("case_control", column_totals=[50, 70],
                                   exposure_probabilities=[0.7, 0.2], seed=3)
        assert list(np.sum(sim["table"], axis=0)) == [50, 70]

    def test_cross_sectional_grand_total(self):
        sim = simulate_contingency("cross_sectional", total=500,
                                   cell_probabilities=[[0.1, 0.2],
                                                       [0.3, 0.4]], seed=4)
        assert int(np.sum(sim["table"])) == 500
        sim2 = simulate_contingency("cross_sectional", total=200,
                                    row_probabilities=[0.5, 0.5],
                                    outcome_probabilities=[[0.2, 0.8],
                                                           [0.5, 0.5]], seed=4)
        assert int(np.sum(sim2["table"])) == 200

    def test_proportions_loose(self):
        sim = simulate_contingency("prospective", row_totals=[20000, 20000],
                                   outcome_probabilities=[0.3, 0.6], seed=5)
        t = np.array(sim["table"])
        assert t[0, 0] / 20000 == pytest.approx(0.3, abs=0.01)
        assert t[1, 0] / 20000 == pytest.approx(0.6, abs=0.01)

    def test_bad_probabilities(self):
        with pytest.raises(ValueError):
            simulate_contingency("prospective", row_totals=[10, 10],
                                 outcome_probabilities=[[0.5, 0.6], [1, 0]])


class TestExtract:
    R = {"datasets": [{"name": "A", "fit": {"params": {
        "HillSlope": {"value": 1.0, "ci95": [0.5, 1.5]}}}}], "p": 0.01}

    def test_paths(self):
        assert extract(self.R, "p") == 0.01
        assert extract(self.R, "datasets.0.fit.params.HillSlope.ci95.1") == 1.5
        assert extract(self.R, "datasets[0].fit.params.HillSlope.value") == 1.0
        assert extract(self.R, "datasets.A.fit.params.HillSlope.value") == 1.0
        assert extract(self.R, "datasets.3.fit") is None
        assert extract(self.R, "nope.x") is None


class TestMonteCarlo:
    SIM = {"kind": "column", "groups": [{"name": "A", "n": 10, "mean": 0},
                                        {"name": "B", "n": 10, "mean": 1}],
           "error": {"kind": "gaussian", "sd": 1}}
    TTEST = {"analysis": "ttest", "options": {"kind": "unpaired"}}

    def test_power_of_unpaired_t(self):
        mc = monte_carlo(self.SIM, self.TTEST, 400,
                         {"p": "p_two_tailed", "diff": "difference"}, seed=9,
                         hit={"name": "p", "op": "lt", "value": 0.05})
        # analytic power, n = 10/group, effect 1 SD, alpha 0.05: ~0.56
        df = 18
        nc = 1 / math.sqrt(2 / 10)
        crit = stats.t.ppf(0.975, df)
        power = stats.nct.sf(crit, df, nc) + stats.nct.cdf(-crit, df, nc)
        assert mc["hits"]["fraction"] == pytest.approx(power, abs=0.07)
        assert mc["n_repeats"] == 400 and mc["n_failed"] == 0
        assert len(mc["values"]["p"]) == 400
        lo, hi = mc["hits"]["ci95"]
        assert lo < mc["hits"]["fraction"] < hi
        # difference = mean_a - mean_b ~ -1, SD ~ sqrt(2/10)
        d = mc["tabulated"]["diff"]
        assert d["mean"] == pytest.approx(-1, abs=0.06)
        assert d["sd"] == pytest.approx(math.sqrt(0.2), rel=0.12)
        assert d["percentiles"]["2.5"] < d["median"] < d["percentiles"]["97.5"]

    def test_same_seed_same_values(self):
        a = monte_carlo(self.SIM, self.TTEST, 20, "t", seed=3)
        b = monte_carlo(self.SIM, self.TTEST, 20, "t", seed=3)
        c = monte_carlo(self.SIM, self.TTEST, 20, "t", seed=4)
        assert a["values"] == b["values"] != c["values"]

    def test_ci_contains_true_value_dose_response(self):
        sim = {"kind": "xy", "model": "log_agonist_vs_response_4pl",
               "params": DR,
               "x": {"kind": "arithmetic", "start": -9, "increment": 0.5,
                     "stop": -3},
               "replicates": 3, "error": {"kind": "gaussian", "sd": 200}}
        mc = monte_carlo(
            sim, {"analysis": "dose_response",
                  "options": {"model": "log_agonist_vs_response_4pl"}},
            40, {"lo": "datasets.0.fit.params.HillSlope.ci95.0",
                 "hi": "datasets.0.fit.params.HillSlope.ci95.1"},
            seed=1, hit={"op": "contains", "lower": "lo", "upper": "hi",
                         "value": 0.5})
        assert mc["hits"]["n_decided"] + mc["hits"]["n_undecided"] == 40
        assert mc["hits"]["fraction"] >= 0.8

    def test_contingency_and_failures_are_counted(self):
        sim = {"kind": "contingency", "design": "prospective",
               "row_totals": [30, 30], "outcome_probabilities": [0.2, 0.6]}
        mc = monte_carlo(sim, {"analysis": "contingency", "options": {}},
                         15, {"p": "fisher_exact.p", "bad": "no.such.path"},
                         seed=2, hit={"all": [{"name": "p", "op": "lt",
                                               "value": 0.05}]})
        assert mc["tabulated"]["bad"]["n"] == 0
        bad = monte_carlo(sim, {"analysis": "no_such_analysis"}, 3, "p",
                          seed=2)
        assert bad["n_failed"] == 3 and bad["errors"]

    def test_repeat_cap(self):
        from opendose import simulate as sim_mod
        old = sim_mod.MAX_REPEATS
        sim_mod.MAX_REPEATS = 5
        try:
            mc = monte_carlo(self.SIM, self.TTEST, 50, "t", seed=1)
        finally:
            sim_mod.MAX_REPEATS = old
        assert mc["n_repeats"] == 5 and mc["capped"]


class TestApi:
    def test_simulate_handlers(self):
        r = analyze({"analysis": "simulate_xy", "data": {}, "options": {
            "model": "log_inhibitor_vs_response_4pl",
            "params": {"Top": 100, "Bottom": 0, "LogXmid": -7,
                       "HillSlope": -1},
            "x": {"kind": "arithmetic", "start": -9, "increment": 1,
                  "count": 5},
            "replicates": 2, "error": {"kind": "relative", "percent": 5},
            "seed": 3}})
        assert "error" not in r and len(r["datasets"][0]["ys"]) == 5
        r2 = analyze({"analysis": "simulate_xy",
                      "data": {"x": [1, 2], "datasets": [
                          {"name": "A", "ys": [[1, 3], [10, None]]}]},
                      "options": {"source": "table", "replicates": 4,
                                  "seed": 1}})
        assert r2["datasets"][0]["ideal"] == [2.0, 10.0]
        assert len(r2["datasets"][0]["ys"][0]) == 4
        r = analyze({"analysis": "simulate_column", "data": {}, "options": {
            "groups": [{"n": 3, "mean": 1}], "seed": 1}})
        assert len(r["datasets"][0]["ys"]) == 3
        r = analyze({"analysis": "simulate_contingency", "data": {},
                     "options": {"design": "prospective",
                                 "row_totals": [5, 5],
                                 "outcome_probabilities": [0.5, 0.5],
                                 "seed": 1}})
        assert np.sum(r["table"]) == 10

    def test_monte_carlo_handler(self):
        r = analyze({"analysis": "monte_carlo", "data": {}, "options": {
            "simulation": TestMonteCarlo.SIM,
            "analysis": TestMonteCarlo.TTEST, "n_repeats": 10,
            "tabulate": ["p_two_tailed"], "seed": 1,
            "hit": {"name": "p_two_tailed", "op": "lt", "value": 0.05}}})
        assert "error" not in r
        assert r["tabulated"]["p_two_tailed"]["n"] == 10
        assert 0 <= r["hits"]["fraction"] <= 1
