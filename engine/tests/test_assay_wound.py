"""Wound-healing (scratch) assay (assay_wound).

Percent closure, the rate and the time to 50% closure are checked
against hand calculations (Jonkman et al. 2014; Grada et al. 2017
definitions); the comparison of rates against SciPy."""

import numpy as np
import pytest
from scipy import stats

from opendose import api, assay_wound as wh

T = [0, 6, 12, 24]


def test_closure_rate_and_time_to_half_closure_by_hand():
    # one well: 1000 -> 800 -> 600 -> 200 (area units)
    res = wh.wound_healing(T, [{"name": "Ctrl", "ys": [[1000], [800], [600], [200]]}],
                           test="none")
    w = res["wells"][0]
    assert w["initial"] == 1000
    assert w["closure"] == pytest.approx([0, 20, 40, 80])
    assert w["final_closure"] == pytest.approx(80)
    # least-squares slope of area on time: by hand
    t, a = np.array(T, float), np.array([1000, 800, 600, 200], float)
    slope = ((t - t.mean()) * (a - a.mean())).sum() / ((t - t.mean()) ** 2).sum()
    assert w["rate"] == pytest.approx(-slope)
    assert w["rate_percent"] == pytest.approx(-slope / 1000 * 100)
    # 50% lies between 12 h (40%) and 24 h (80%): 12 + (50-40)/(80-40)*12 = 15 h
    assert w["time_to_target"] == pytest.approx(15.0)
    assert w["target_reached"]


def test_rate_window_and_target_not_reached():
    res = wh.wound_healing(T, [{"name": "Ctrl", "ys": [[1000], [800], [600], [500]]}],
                           window=[0, 12], test="none")
    w = res["wells"][0]
    # within 0-12 h the closure is exactly linear: 200 per 6 h
    assert w["rate"] == pytest.approx(200 / 6)
    assert w["rate_r_squared"] == pytest.approx(1.0)
    assert w["rate_points"] == 3
    assert w["time_to_target"] == pytest.approx(24.0)   # exactly 50% at 24 h
    res2 = wh.wound_healing(T, [{"name": "C", "ys": [[1000], [900], [800], [700]]}],
                            test="none")
    w2 = res2["wells"][0]
    assert w2["time_to_target"] is None and not w2["target_reached"]
    s = res2["summaries"][0]
    assert s["n_target_not_reached"] == 1


def test_each_well_is_relative_to_its_own_start():
    # two wells of different size closing at the same relative pace
    res = wh.wound_healing(T, [{"name": "C", "ys": [[1000, 2000], [750, 1500],
                                                    [500, 1000], [250, 500]]}],
                           test="none")
    a, b = res["wells"]
    assert a["closure"] == pytest.approx(b["closure"])
    assert a["rate_percent"] == pytest.approx(b["rate_percent"])
    assert b["rate"] == pytest.approx(2 * a["rate"])
    curve = res["summaries"][0]["curve"]
    assert [c["mean"] for c in curve] == pytest.approx([0, 25, 50, 75])
    assert [c["sd"] for c in curve] == pytest.approx([0, 0, 0, 0])


def _three(seed=4):
    rng = np.random.default_rng(seed)
    out = []
    for name, k in (("Control", 2.5), ("siRNA", 1.4), ("TGF-β", 3.6)):
        ys = []
        a0 = rng.uniform(4e5, 6e5, 4)
        ks = k * np.exp(rng.normal(0, 0.1, 4))
        for t in T:
            ys.append([float(a * (1 - min(0.98, kk * t / 100))) for a, kk in zip(a0, ks)])
        out.append({"name": name, "ys": ys})
    return out


def test_two_conditions_unpaired_t_on_rates():
    ds = _three()[:2]
    res = wh.wound_healing(T, ds, window=[0, 24])
    st = res["statistics"]
    assert st["test"] == "unpaired_t"
    rates = {d["name"]: [w["rate_percent"] for w in res["wells"]
                         if w["condition"] == d["name"]] for d in ds}
    ref = stats.ttest_ind(rates["siRNA"], rates["Control"])
    assert st["p_two_tailed"] == pytest.approx(ref.pvalue, rel=1e-9)
    assert st["difference"] == pytest.approx(np.mean(rates["siRNA"]) - np.mean(rates["Control"]))
    assert st["names"] == ["siRNA", "Control"]
    assert any("Wells are the unit" in w for w in res["warnings"])


def test_three_conditions_anova_and_dunnett():
    ds = _three(9)
    res = wh.wound_healing(T, ds, rate_basis="absolute")
    st = res["statistics"]
    assert st["test"] == "one_way_anova"
    rates = [[w["rate"] for w in res["wells"] if w["condition"] == d["name"]] for d in ds]
    f = stats.f_oneway(*rates)
    assert st["table"]["F"] == pytest.approx(f.statistic)
    d = stats.dunnett(rates[1], rates[2], control=rates[0], rng=np.random.default_rng(0))
    comps = {c["first"]: c for c in st["comparisons"]}
    for k, g in enumerate(("siRNA", "TGF-β")):
        assert comps[g]["second"] == "Control"
        assert comps[g]["difference"] == pytest.approx(np.mean(rates[k + 1]) - np.mean(rates[0]))
        assert comps[g]["p_adjusted"] == pytest.approx(d.pvalue[k], abs=2e-3)


def test_control_can_be_any_condition():
    ds = _three(9)
    res = wh.wound_healing(T, ds, control_index=2)
    assert res["control"] == "TGF-β"
    assert all(c["second"] == "TGF-β" for c in res["statistics"]["comparisons"])


def test_flags_and_warnings():
    ds = [{"name": "C", "ys": [[None, 1000], [900, 800], [800, 700], [700, 600]]}]
    res = wh.wound_healing(T, ds, window=[20, 30], test="none")
    late, ok = res["wells"]
    assert "no_value_at_first_time" in late["flags"]
    assert late["initial"] == 900
    assert all("too_few_points_in_window" in w["flags"] for w in res["wells"])
    assert any("no value at the first time" in w for w in res["warnings"])
    # a wound that levels off is not linear over the whole time course
    lev = wh.wound_healing([0, 6, 12, 18, 24, 30],
                           [{"name": "C", "ys": [[1000], [300], [50], [20], [10], [5]]}],
                           test="none")
    assert any("levels off" in w for w in lev["warnings"])


def test_input_checks():
    with pytest.raises(ValueError, match="no wells"):
        wh.wound_healing(T, [{"name": "C", "ys": [[1000], [None], [None], [None]]}])
    with pytest.raises(ValueError, match="window"):
        wh.wound_healing(T, _three(), window=[12, 6])
    with pytest.raises(ValueError, match="target"):
        wh.wound_healing(T, _three(), target=0)
    with pytest.raises(ValueError, match="rate basis"):
        wh.wound_healing(T, _three(), rate_basis="x")


def test_api_route():
    res = api.analyze({"analysis": "wound_healing",
                       "data": {"x": T, "datasets": _three()},
                       "options": {"window": [0, None], "target": 50}})
    assert res["conditions"] == ["Control", "siRNA", "TGF-β"]
    assert res["statistics"]["test"] == "one_way_anova"
