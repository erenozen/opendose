"""Nested designs: animals x cells (FEATURE-PLAN P-96,
opendose.nested_power and simulate.simulate_nested).

Hand check (Aarts et al. 2014, Nat Neurosci 17:491; Kish 1965): ICC 0.3,
10 cells per animal: design effect 1 + 9 x 0.3 = 3.7; a difference of
0.5 total SD at 80% power needs 62.79 cells per group if cells were
independent (normal approximation), i.e. 62.79 x 3.7 / 10 = 23.23
animals per group; the exact t test on animal means needs 24.23, so 25
animals per group (the t distribution's small-sample correction, about
0.7 animal at every effect size).

Independent Monte Carlo (engine/tests/reference/nested_power.py: plain
Python random.gauss cells, scipy ttest_ind / mannwhitneyu / dunnett on
the animal means) and the app's own nested t test (nested.py, REML mixed
model with containment df), which equals the t test on animal means for
a balanced design.
"""

import json
import math
from pathlib import Path

import numpy as np
import pytest
from scipy import stats

from opendose import nested_power as NP
from opendose import simulate as S
from opendose.api import analyze

REF = json.loads((Path(__file__).parent / "reference" /
                  "nested_power.json").read_text())
SB, SW = math.sqrt(0.3), math.sqrt(0.7)


def within(engine, mc, reps, k=3.5):
    return abs(engine - mc) <= k * math.sqrt(mc * (1 - mc) / reps)


class TestDesignEffect:
    def test_acceptance_icc_03_ten_cells(self):
        h = REF["design_effect_hand_check"]
        r = NP.nested_design("n", delta=0.5, sd_total=1.0, icc=0.3, m=10,
                             power=0.8)
        assert r["design_effect"] == pytest.approx(h["design_effect"])
        assert r["icc"] == pytest.approx(0.3)
        assert r["sd_unit_mean"] ** 2 == pytest.approx(h["var_unit_mean"])
        assert r["n"] == 25 and r["n_per_group"] == [25, 25]
        assert r["power"] >= 0.8
        # the design-effect formula from the naive cell count agrees
        assert r["n_design_effect"] == pytest.approx(23.59, abs=0.01)
        assert h["n_animals_normal"] == pytest.approx(23.2327, abs=1e-4)
        assert r["n_design_effect"] <= r["n_exact"] <= r["n_design_effect"] + 1
        assert abs(r["n"] - math.ceil(r["n_design_effect"])) <= 1
        assert r["cells_if_independent"] == 64

    @pytest.mark.parametrize("delta", [1.0, 0.8, 0.5, 0.3, 0.15])
    def test_design_effect_agreement_at_every_effect(self, delta):
        r = NP.nested_design("n", delta=delta, sd_total=1.0, icc=0.3, m=10,
                             power=0.8)
        assert r["n_design_effect"] <= r["n_exact"] < r["n_design_effect"] + 1
        # normal approximation: exactly cells x DE / m
        z = stats.norm.isf(0.025) + stats.norm.ppf(0.8)
        n_cells = 2 * z * z / delta ** 2
        n_units = 2 * z * z * r["sd_unit_mean"] ** 2 / delta ** 2
        assert n_units == pytest.approx(n_cells * r["design_effect"] / 10,
                                        rel=1e-12)

    def test_two_sd_inputs_equal_total_and_icc(self):
        a = NP.nested_design("power", delta=0.5, sd_between=SB, sd_within=SW,
                             m=10, n=20)
        b = NP.nested_design("power", delta=0.5, sd_total=1.0, icc=0.3,
                             m=10, n=20)
        assert a["power"] == pytest.approx(b["power"], abs=1e-12)

    def test_more_cells_never_beat_more_animals(self):
        r = NP.nested_design("n", delta=0.5, sd_total=1.0, icc=0.3, m=10,
                             power=0.8)
        ns = [t["n"] for t in r["tradeoff"]]
        assert ns == sorted(ns, reverse=True)
        # the floor: animals needed with infinitely many cells
        floor = NP.nested_design("n", delta=0.5, sd_between=SB,
                                 sd_within=0.0, m=1, power=0.8)["n"]
        assert min(ns) >= floor

    def test_icc_extremes(self):
        # ICC 0: cells are independent, m cells per animal count fully
        a = NP.nested_design("n", delta=0.5, sd_total=1.0, icc=0.0, m=10,
                             power=0.8)
        assert a["design_effect"] == 1
        # ICC 1: extra cells add nothing
        b = NP.nested_design("n", delta=0.5, sd_total=1.0, icc=1.0, m=10,
                             power=0.8)
        c = NP.nested_design("n", delta=0.5, sd_total=1.0, icc=1.0, m=1,
                             power=0.8)
        assert b["n"] == c["n"] and b["design_effect"] == 10

    def test_scale_invariance(self):
        base = NP.nested_design("power", delta=0.5, sd_between=SB,
                                sd_within=SW, m=10, n=20)["power"]
        for s in (1e-12, 1e12):
            got = NP.nested_design("power", delta=0.5 * s, sd_between=SB * s,
                                   sd_within=SW * s, m=10, n=20)["power"]
            assert got == pytest.approx(base, abs=1e-10)

    def test_effect_round_trip(self):
        e = NP.nested_design("effect", sd_total=2.0, icc=0.4, m=6, n=10,
                             power=0.8)
        back = NP.nested_design("power", delta=e["effect"]["value"],
                                sd_total=2.0, icc=0.4, m=6, n=10)
        assert back["power"] == pytest.approx(0.8, abs=1e-8)

    @pytest.mark.parametrize("kw,msg", [
        (dict(sd_between=-1, sd_within=1), "cannot be negative"),
        (dict(sd_between=0, sd_within=0), "cannot both be 0"),
        (dict(sd_total=1, icc=1.2), "ICC must be between"),
        (dict(sd_total=1, icc=0.3, m=0), "at least 1 measurement"),
        (dict(sd_total=1, icc=0.3, k=3), "use Dunnett"),
        (dict(sd_total=1, icc=0.3, delta=0), "cannot be 0"),
    ])
    def test_invalid(self, kw, msg):
        kw = {"m": 5, "delta": 0.5, **kw}
        with pytest.raises(ValueError, match=msg):
            NP.nested_design("n", power=0.8, **kw)

    def test_power_needs_two_animals(self):
        with pytest.raises(ValueError, match="at least 2 units"):
            NP.nested_design("power", delta=0.5, sd_total=1, icc=0.3, m=5,
                             n=1)


class TestSimulation:
    def test_t_against_plain_python_monte_carlo(self):
        c = REF["mc"]["t_n25"]
        exact = NP.nested_design("power", delta=c["delta"],
                                 sd_between=c["sb"], sd_within=c["sw"],
                                 m=c["m"], n=c["n"])["power"]
        sim = NP.simulate_power(test="t", n=c["n"], m=c["m"],
                                delta=c["delta"], sd_between=c["sb"],
                                sd_within=c["sw"], n_repeats=6000, seed=4)
        assert within(exact, c["power"], c["reps"])
        assert within(sim["power"], c["power"], c["reps"], k=4.5)
        assert within(sim["power"], exact, 6000)

    def test_mann_whitney(self):
        c = REF["mc"]["mw_n8_d1"]
        sim = NP.simulate_power(test="mann_whitney", n=c["n"], m=c["m"],
                                delta=c["delta"], sd_between=c["sb"],
                                sd_within=c["sw"], n_repeats=6000, seed=5)
        assert within(sim["power"], c["power"], c["reps"], k=4.5)
        are = NP.nested_design("power", test="mann_whitney", delta=c["delta"],
                               sd_between=c["sb"], sd_within=c["sw"],
                               m=c["m"], n=c["n"])["power"]
        assert abs(are - c["power"]) < 0.02

    def test_dunnett(self):
        c = REF["mc"]["dunnett_k4_n12_d1"]
        exact = NP.nested_design("power", test="dunnett", k=c["k"],
                                 delta=c["delta"], sd_between=c["sb"],
                                 sd_within=c["sw"], m=c["m"],
                                 n=c["n"])["power"]
        sim = NP.simulate_power(test="dunnett", k=c["k"], n=c["n"], m=c["m"],
                                delta=c["delta"], sd_between=c["sb"],
                                sd_within=c["sw"], n_repeats=3000, seed=6)
        assert within(exact, c["power"], c["reps"] * (c["k"] - 1), k=5)
        assert within(sim["power"], exact, 3000)
        assert sim["power_all"] <= sim["power"] <= sim["power_any"]

    def test_seed_reproduces_and_chunks_pool(self):
        kw = dict(test="t", n=6, m=4, delta=1.0, sd_between=0.5,
                  sd_within=1.0)
        a = NP.simulate_power(n_repeats=300, seed=9, **kw)
        b = NP.simulate_power(n_repeats=300, seed=9, **kw)
        assert a["hits"] == b["hits"]
        assert a["ci95"][0] <= a["power"] <= a["ci95"][1]
        assert a["mc_se"] == pytest.approx(
            math.sqrt(a["power"] * (1 - a["power"]) / 300))

    def test_pool(self):
        kw = dict(test="dunnett", k=3, n=5, m=3, delta=1.0, sd_between=0.5,
                  sd_within=1.0)
        a = NP.simulate_power(n_repeats=200, seed=1, **kw)
        b = NP.simulate_power(n_repeats=100, seed=2, **kw)
        p = NP.pool([a, b], "dunnett")
        assert p["n_repeats"] == 300 and p["hits"] == a["hits"] + b["hits"]
        assert p["power"] == (a["hits"] + b["hits"]) / 600
        assert p["power_all"] == (a["hits_all"] + b["hits_all"]) / 300
        with pytest.raises(ValueError, match="nothing to pool"):
            NP.pool([])

    def test_null_rejects_at_alpha(self):
        r = NP.simulate_power(test="t", n=5, m=3, delta=0.0, sd_between=1,
                              sd_within=1, n_repeats=8000, seed=10)
        assert within(r["power"], 0.05, 8000)

    def test_caps_and_errors(self):
        r = NP.simulate_power(test="t", n=3, m=1, delta=1, sd_between=1,
                              sd_within=0, n_repeats=50_000, seed=1)
        assert r["capped"] and r["n_repeats"] == NP.MAX_REPEATS
        with pytest.raises(ValueError, match="compare 2 groups"):
            NP.simulate_power(test="t", k=3, n=3, m=2, delta=1,
                              sd_between=1, sd_within=1)


class TestNestedTableAndMonteCarlo:
    def test_nested_t_equals_t_on_animal_means(self):
        sim = S.simulate_nested([{"name": "A", "mean": 0},
                                 {"name": "B", "mean": 1}], units=6,
                                measurements=5, sd_between=0.5,
                                sd_within=0.8, seed=2)
        r = analyze({"analysis": "nested_ttest",
                     "data": {"groups": [{k: g[k] for k in ("name",
                                                            "subgroups")}
                                         for g in sim["groups"]]},
                     "options": {}})
        means = [[np.mean(u) for u in g["subgroups"]] for g in sim["groups"]]
        ref = stats.ttest_ind(means[1], means[0])
        assert r["p"] == pytest.approx(ref.pvalue, rel=1e-9)
        assert r["t"] == pytest.approx(ref.statistic, rel=1e-9)

    def test_generic_monte_carlo_runs_the_nested_t_test(self):
        r = S.monte_carlo(
            {"kind": "nested", "groups": [{"name": "A", "mean": 0},
                                          {"name": "B", "mean": 1.0}],
             "units": 8, "measurements": 10, "sd_between": SB,
             "sd_within": SW},
            {"analysis": "nested_ttest", "options": {}}, 400, "p", seed=3,
            hit={"name": "p", "op": "lt", "value": 0.05})
        assert r["n_failed"] == 0
        exact = NP.nested_design("power", delta=1.0, sd_between=SB,
                                 sd_within=SW, m=10, n=8)["power"]
        assert within(r["hits"]["fraction"], exact, 400, k=4)

    def test_simulate_nested_shape_and_errors(self):
        s = S.simulate_nested([{"name": "A", "mean": 2}], units=3,
                              measurements=4, sd_between=0, sd_within=0,
                              seed=1)
        assert s["groups"][0]["subgroups"] == [[2.0] * 4] * 3
        with pytest.raises(ValueError, match="at least 1 unit"):
            S.simulate_nested([{"name": "A"}], units=0, measurements=2)
        with pytest.raises(ValueError, match="cannot be negative"):
            S.simulate_nested([{"name": "A"}], units=2, measurements=2,
                              sd_between=-1)


class TestThroughTheApi:
    def test_power_kind_nested(self):
        r = analyze({"analysis": "power", "data": {}, "options": {
            "kind": "nested", "solve": "n", "power": 0.8, "delta": 0.5,
            "sd_total": 1.0, "icc": 0.3, "m": 10,
            "justification": {"unit": "mice"}}})
        assert r["n"] == 25
        text = r["justification"]["text"]
        assert "25 mice per group (50 in total)" in text
        assert "10 measurements each" in text and "ICC 0.3" in text

    def test_simulation_handler(self):
        r = analyze({"analysis": "nested_power_sim", "data": {}, "options": {
            "test": "t", "n": 8, "m": 10, "delta": 1.0, "sd_total": 1.0,
            "icc": 0.3, "n_repeats": 200, "seed": 1}})
        assert r["n_repeats"] == 200 and 0 <= r["power"] <= 1
        bad = analyze({"analysis": "nested_power_sim", "data": {},
                       "options": {"test": "t", "n": 1, "m": 10,
                                   "delta": 1.0, "sd_total": 1.0,
                                   "icc": 0.3}})
        assert "at least 2 units" in bad["error"]
