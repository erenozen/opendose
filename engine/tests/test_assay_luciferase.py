"""Dual-luciferase reporter assay (assay_luciferase).

With experiments, the two-group test is pinned to the GraphPad ratio
paired t test example (statistics guide, "Interpreting results: Ratio t
test"; treated/control 8.7/4.2, 4.9/2.5, 13.1/6.5: ratio 2.02, 95% CI
1.88 to 2.16, P = 0.0005), here as Firefly readings over a Renilla of 1.
Without experiments the tests on log ratios are checked against SciPy;
background subtraction and normalisation against hand calculations."""

import math

import numpy as np
import pytest
from scipy import stats

from opendose import api, assay_luciferase as lu

GP = [(4.2, 8.7), (2.5, 4.9), (6.5, 13.1)]   # (control, treated) per experiment


def _gp_records():
    out = []
    for e, (c, t) in enumerate(GP):
        out.append({"experiment": f"E{e + 1}", "group": "Empty vector",
                    "firefly": c, "renilla": 1.0})
        out.append({"experiment": f"E{e + 1}", "group": "Promoter",
                    "firefly": t, "renilla": 1.0})
    return out


def test_experiments_ratio_paired_t_matches_graphpad_example():
    res = lu.luciferase(_gp_records())
    assert res["unit"] == "experiment" and res["n_units"] == 3
    st = res["statistics"]
    assert st["test"] == "ratio_paired_t"
    assert round(st["geometric_mean_ratio"], 2) == 2.02
    assert [round(v, 2) for v in st["ci_ratio"]] == [1.88, 2.16]
    assert round(st["p_two_tailed"], 4) == 0.0005
    assert "experiment" in st["note"]
    # each experiment's control is 1; points carry the experiment
    pts = res["graph"]["points"]
    assert all(p["fold_change"] == pytest.approx(1.0)
               for p in pts if p["group"] == "Empty vector")
    assert {p["experiment"] for p in pts} == {"E1", "E2", "E3"}
    assert len(res["graph"]["lines"]) == 3


def test_blank_wells_are_subtracted_before_the_ratio():
    recs = [
        {"group": "Mock", "firefly": 100, "renilla": 50},
        {"group": "Mock", "firefly": 120, "renilla": 70},
        {"group": "Ctrl", "firefly": 1110, "renilla": 560},
        {"group": "Ctrl", "firefly": 2110, "renilla": 1060},
        {"group": "Drug", "firefly": 4110, "renilla": 560},
        {"group": "Drug", "firefly": 6110, "renilla": 1060},
    ]
    res = lu.luciferase(recs, blank_group="Mock", control_group="Ctrl",
                        test="none")
    assert res["background"]["firefly"] == pytest.approx(110)
    assert res["background"]["renilla"] == pytest.approx(60)
    assert res["groups"] == ["Ctrl", "Drug"]       # blank wells are not a group
    ratios = [w["ratio"] for w in res["wells"]]
    assert ratios == pytest.approx([1000 / 500, 2000 / 1000,
                                    4000 / 500, 6000 / 1000])
    # folds vs the geometric mean of the control wells (2.0 and 2.0)
    assert [w["fold_change"] for w in res["wells"]] == pytest.approx(
        [1, 1, 4, 3])
    drug = next(s for s in res["group_summaries"] if s["group"] == "Drug")
    assert drug["geometric_mean"] == pytest.approx(math.sqrt(12))
    assert res["statistics"] is None


def test_blank_wells_per_experiment():
    recs = [
        {"experiment": "1", "group": "Mock", "firefly": 10, "renilla": 10},
        {"experiment": "1", "group": "C", "firefly": 110, "renilla": 60},
        {"experiment": "1", "group": "T", "firefly": 210, "renilla": 60},
        {"experiment": "2", "group": "Mock", "firefly": 30, "renilla": 20},
        {"experiment": "2", "group": "C", "firefly": 130, "renilla": 120},
        {"experiment": "2", "group": "T", "firefly": 330, "renilla": 120},
    ]
    res = lu.luciferase(recs, blank_group="Mock")
    w = res["wells"]
    assert [x["ratio"] for x in w] == pytest.approx(
        [100 / 50, 200 / 50, 100 / 100, 300 / 100])
    assert res["per_experiment"]["1"]["fold"]["T"] == pytest.approx(2.0)
    assert res["per_experiment"]["2"]["fold"]["T"] == pytest.approx(3.0)
    assert res["statistics"]["geometric_mean_ratio"] == pytest.approx(
        math.sqrt(6))


def _wells(groups, seed=3):
    rng = np.random.default_rng(seed)
    recs = []
    for g, effect in groups:
        for _ in range(4):
            ren = float(rng.uniform(5e4, 2e5))
            recs.append({"group": g, "renilla": ren,
                         "firefly": ren * effect * float(np.exp(rng.normal(0, 0.15)))})
    return recs


def test_wells_two_groups_unpaired_t_on_log_ratios():
    recs = _wells([("Control", 1.0), ("Treated", 3.0)])
    res = lu.luciferase(recs)
    assert res["unit"] == "well"
    st = res["statistics"]
    assert st["test"] == "unpaired_t"
    logs = {g: [math.log10(r["firefly"] / r["renilla"]) for r in recs
                if r["group"] == g] for g in ("Control", "Treated")}
    ref = stats.ttest_ind(logs["Treated"], logs["Control"])
    assert st["p_two_tailed"] == pytest.approx(ref.pvalue, rel=1e-9)
    ratio = 10 ** (np.mean(logs["Treated"]) - np.mean(logs["Control"]))
    assert st["ratio"] == pytest.approx(ratio)
    lo, hi = ref.confidence_interval(0.95)
    assert st["ci_ratio"] == pytest.approx([10 ** lo, 10 ** hi])
    # the group summary is the same ratio; the control's geometric mean is 1
    sums = {s["group"]: s for s in res["group_summaries"]}
    assert sums["Control"]["geometric_mean"] == pytest.approx(1.0)
    assert sums["Treated"]["geometric_mean"] == pytest.approx(ratio)
    assert any("independent replicate" in w for w in res["warnings"])


def test_wells_three_groups_anova_and_dunnett_on_log_ratios():
    recs = _wells([("Control", 1.0), ("A", 2.0), ("B", 0.5)], seed=8)
    res = lu.luciferase(recs, comparisons="dunnett")
    st = res["statistics"]
    assert st["test"] == "one_way_anova"
    logs = [[math.log10(r["firefly"] / r["renilla"]) for r in recs
             if r["group"] == g] for g in ("Control", "A", "B")]
    f = stats.f_oneway(*logs)
    assert st["table"]["F"] == pytest.approx(f.statistic)
    assert st["table"]["p"] == pytest.approx(f.pvalue)
    d = stats.dunnett(logs[1], logs[2], control=logs[0],
                      rng=np.random.default_rng(0))
    comps = {c["first"]: c for c in st["comparisons"]}
    assert set(comps) == {"A", "B"}
    for k, g in enumerate(("A", "B")):
        assert comps[g]["second"] == "Control"
        assert comps[g]["p_adjusted"] == pytest.approx(d.pvalue[k], abs=2e-3)
        assert comps[g]["ratio"] == pytest.approx(
            10 ** (np.mean(logs[k + 1]) - np.mean(logs[0])))


def test_experiments_three_groups_repeated_measures_on_logs():
    recs = []
    for e, scale in enumerate((1.0, 2.5, 0.7)):
        for g, eff in (("C", 1.0), ("X", 2.0 + 0.1 * e), ("Y", 0.5)):
            recs.append({"experiment": e, "group": g, "renilla": 1000 * scale,
                         "firefly": 500 * scale * eff})
    res = lu.luciferase(recs)
    st = res["statistics"]
    assert st["test"] == "rm_one_way_anova_log10"
    assert [c["pair"] for c in st["comparisons"]] == ["X vs. C", "Y vs. C"]
    y = next(c for c in st["comparisons"] if c["first"] == "Y")
    assert y["ratio"] == pytest.approx(0.5)


def test_low_renilla_is_flagged_not_removed():
    recs = [{"group": "C", "firefly": 1000, "renilla": 1000},
            {"group": "C", "firefly": 1100, "renilla": 1000},
            {"group": "T", "firefly": 2000, "renilla": 1000},
            {"group": "T", "firefly": 44, "renilla": 20}]
    res = lu.luciferase(recs, low_renilla=0.1)
    low = [w for w in res["wells"] if "low_renilla" in w["flags"]]
    assert len(low) == 1 and low[0]["ratio"] == pytest.approx(2.2)
    assert any("flagged, not removed" in w for w in res["warnings"])
    off = lu.luciferase(recs, low_renilla=0)
    assert not any("low_renilla" in w["flags"] for w in off["wells"])


def test_no_spread_gives_no_test_instead_of_a_crash():
    recs = [{"group": "C", "firefly": 1000, "renilla": 1000},
            {"group": "C", "firefly": 1100, "renilla": 1000},
            {"group": "T", "firefly": 2000, "renilla": 1000},
            {"group": "T", "firefly": 40, "renilla": 20}]
    res = lu.luciferase(recs)
    assert res["statistics"] is None
    assert any("same ratio" in w for w in res["warnings"])


def test_wells_not_above_background_are_left_out():
    recs = [{"group": "Mock", "firefly": 500, "renilla": 100},
            {"group": "C", "firefly": 400, "renilla": 1100},
            {"group": "C", "firefly": 1500, "renilla": 1100},
            {"group": "T", "firefly": 2500, "renilla": 1100}]
    res = lu.luciferase(recs, blank_group="Mock", test="none")
    flags = [w["flags"] for w in res["wells"]]
    assert flags[0] == ["firefly_not_above_background"]
    assert res["wells"][0]["ratio"] is None
    assert any("without a usable ratio" in w for w in res["warnings"])


def test_input_checks():
    with pytest.raises(ValueError, match="experiment column"):
        lu.luciferase(_wells([("C", 1), ("T", 2)]), test="ratio_paired")
    with pytest.raises(ValueError, match="blank group"):
        lu.luciferase(_gp_records(), blank_group="Mock")
    with pytest.raises(ValueError, match="control group"):
        lu.luciferase(_gp_records(), control_group="Nope")
    with pytest.raises(ValueError, match="unknown test"):
        lu.luciferase(_gp_records(), test="magic")
    # forcing wells as the unit when experiments exist says why it is wrong
    res = lu.luciferase(_gp_records(), test="unpaired")
    assert res["unit"] == "well"
    assert any("pseudoreplication" in w for w in res["warnings"])


def test_api_route():
    res = api.analyze({"analysis": "luciferase",
                       "data": {"records": _gp_records()},
                       "options": {"control_group": "Empty vector"}})
    assert res["statistics"]["test"] == "ratio_paired_t"
    assert res["control_group"] == "Empty vector"
