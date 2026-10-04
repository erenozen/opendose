"""Western blot densitometry (assay_densitometry).

The two-group test is pinned to the GraphPad ratio paired t test
example (statistics guide, "Interpreting results: Ratio t test"; Km
treated/control 8.7/4.2, 4.9/2.5, 13.1/6.5: ratio 2.02, 95% CI 1.88 to
2.16, P = 0.0005; the reverse ratio 0.496)."""

import math

import numpy as np
import pytest

from opendose import api, assay_densitometry as dn, columnstats, repeated

PAIRS = [(4.2, 8.7), (2.5, 4.9), (6.5, 13.1)]   # (control, treated) per blot


def _recs(pairs=PAIRS, ref=1.0):
    out = []
    for b, (c, t) in enumerate(pairs):
        out.append({"blot": f"B{b}", "lane": 1, "group": "control",
                    "target": c, "reference": ref})
        out.append({"blot": f"B{b}", "lane": 2, "group": "treated",
                    "target": t, "reference": ref})
    return out


def test_ratio_paired_t_matches_graphpad_example():
    res = dn.densitometry(_recs())
    st = res["statistics"]
    assert st["test"] == "ratio_paired_t"
    assert round(st["geometric_mean_ratio"], 2) == 2.02
    assert [round(v, 2) for v in st["ci_ratio"]] == [1.88, 2.16]
    assert round(st["p_two_tailed"], 4) == 0.0005
    # reverse orientation (control/treated) quoted from the ratio t test
    # FAQ: 0.496 (its CI is quoted as 0.463 to 0.531; from these three
    # pairs the reciprocal CI is 0.463 to 0.532, so only the ratio and
    # lower limit are pinned)
    assert round(1 / st["geometric_mean_ratio"], 3) == 0.496
    assert round(1 / st["ci_ratio"][1], 3) == 0.463
    # graph: control = 1 in every blot, paired lines per blot
    pts = res["graph"]["points"]
    assert all(p["fold_change"] == 1.0 for p in pts if p["group"] == "control")
    assert len(res["graph"]["lines"]) == 3


def test_background_and_loading_control_normalisation():
    recs = [
        {"blot": 1, "lane": 1, "group": "ctrl", "target": 1100,
         "background": 100, "reference": 2100, "reference_background": 100},
        {"blot": 1, "lane": 2, "group": "ctrl", "target": 1300,
         "background": 100, "reference": 2500, "reference_background": 100},
        {"blot": 1, "lane": 3, "group": "drug", "target": 2100,
         "background": 100, "reference": 2050, "reference_background": 50},
    ]
    res = dn.densitometry(recs, test="none")
    lanes = res["lanes"]
    assert [l["normalized"] for l in lanes] == pytest.approx(
        [1000 / 2000, 1200 / 2400, 2000 / 2000])
    # fold vs the mean of the blot's control lanes (Degasperi 2014)
    assert lanes[2]["fold_change"] == pytest.approx(1.0 / 0.5)
    assert res["per_blot"]["1"]["basis"] == "control-group mean"
    one = dn.densitometry(recs, control_lanes={1: 2}, test="none")
    assert one["lanes"][1]["fold_change"] == 1.0
    assert any("single control lane" in w for w in one["warnings"])


def test_prenormalised_controls_route_to_one_sample_test():
    folds = [2.07, 1.96, 2.02, 2.2]
    recs = []
    for b, f in enumerate(folds):
        recs.append({"blot": b, "lane": 1, "group": "control", "target": 1.0})
        recs.append({"blot": b, "lane": 2, "group": "treated", "target": f})
    res = dn.densitometry(recs)
    st = res["statistics"]
    assert res["control_exactly_one"] is True
    assert st["test"] == "one_sample_ratio_t"
    ref = columnstats.one_sample_ratio_t(folds, 1.0)
    assert st["p_two_tailed"] == pytest.approx(ref["p_two_tailed"])
    assert any("SD is 0" in w for w in res["warnings"])
    # identical to the ratio paired t test on the same numbers
    import warnings
    from opendose import ttests
    with warnings.catch_warnings():     # pairing correlation undefined
        warnings.simplefilter("ignore")
        rp = ttests.ratio_paired_t(folds, [1.0] * 4)
    assert st["p_two_tailed"] == pytest.approx(rp["p_two_tailed"])


def test_flags_saturation_and_negative():
    recs = _recs() + [{"blot": "B0", "lane": 3, "group": "treated",
                       "target": 65535, "reference": 1.0},
                      {"blot": "B1", "lane": 4, "group": "treated",
                       "target": 50, "background": 80, "reference": 1.0}]
    res = dn.densitometry(recs, saturation_limit=65535)
    flags = {(l["blot"], l["lane"]): l["flags"] for l in res["lanes"]}
    assert "target_saturated" in flags[("B0", 3)]
    assert "target_not_above_background" in flags[("B1", 4)]
    assert any("saturation" in w for w in res["warnings"])
    assert any("not above background" in w for w in res["warnings"])


def test_three_groups_rm_anova_on_logs():
    third = [5.0, 3.0, 7.5]
    recs = _recs() + [{"blot": f"B{b}", "lane": 3, "group": "low",
                       "target": v, "reference": 1.0}
                      for b, v in enumerate(third)]
    res = dn.densitometry(recs)
    st = res["statistics"]
    assert st["test"] == "rm_one_way_anova_log10"
    logs = [[math.log10(c) for c, _ in PAIRS],
            [math.log10(t) for _, t in PAIRS],
            [math.log10(v) for v in third]]
    ref = repeated.rm_one_way_anova(logs)
    assert st["table"]["F"] == pytest.approx(ref["table"]["F"])
    comp = {c["first"]: c for c in st["comparisons"]}
    assert set(comp) == {"treated", "low"}
    assert comp["treated"]["second"] == "control"
    gm = 10 ** np.mean([l1 - l0 for l0, l1 in zip(logs[0], logs[1])])
    assert comp["treated"]["ratio"] == pytest.approx(gm)
    # a missing lane switches to the mixed model
    res2 = dn.densitometry(recs[:-1])
    assert res2["statistics"]["test"] == "mixed_rm_one_way_log10"


def test_api_densitometry():
    res = api.analyze({"analysis": "densitometry",
                       "data": {"records": _recs(ref=2.0)},
                       "options": {"control_group": "control"}})
    assert "error" not in res, res.get("error")
    summ = {s["group"]: s for s in res["group_summaries"]}
    assert summ["control"]["geometric_mean"] == pytest.approx(1.0)
    assert summ["treated"]["geometric_mean"] == pytest.approx(
        res["statistics"]["geometric_mean_ratio"])
