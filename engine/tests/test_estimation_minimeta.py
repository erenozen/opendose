"""Mini-meta weighted delta and delta-delta (estimation.combined_effect,
P-93) against DABEST-python 2025.03.27 itself.

engine/tests/reference/estimation_minimeta.py ran DABEST (installed in a
throwaway virtual environment, never a project dependency) on its own
seeded data and stored the data with DABEST's output in
estimation_minimeta.json. Point estimates are deterministic and match to
1e-12; bootstrap limits come from different random streams and must
agree within Monte Carlo error (5% of the CI width at 5000 resamples).
"""

import json
import math
from pathlib import Path

import numpy as np
import pytest

from opendose import api, estimation, meta

REF = json.loads((Path(__file__).parent / "reference" / "estimation_minimeta.json").read_text())
MM = REF["mini_meta"]
DD = REF["delta_delta"]


def mm_groups():
    groups, names = [], []
    for i, r in enumerate(MM["repeats"], 1):
        groups += [r["control"], r["test"]]
        names += [f"Control {i}", f"Drug {i}"]
    return groups, names


def run_mm(**kw):
    g, n = mm_groups()
    return estimation.estimation(g, n, design="multi_two_group", combine="mini_meta", **kw)


def dd_groups():
    c = DD["cells"]
    return ([c["W Placebo"], c["W Drug"], c["M Placebo"], c["M Drug"]],
            ["W Placebo", "W Drug", "M Placebo", "M Drug"])


def run_dd(**kw):
    g, n = dd_groups()
    return estimation.estimation(g, n, design="multi_two_group", combine="delta_delta", **kw)


def within_mc(ours, ref, width):
    return abs(ours - ref) <= 0.05 * width


def test_mini_meta_matches_dabest():
    r = run_mm()
    c = r["combined"]
    assert c["kind"] == "mini_meta" and c["label"] == "Weighted mean difference"
    assert c["difference"] == pytest.approx(MM["difference"], abs=1e-12)
    assert [x["difference"] for x in c["comparisons"]] == pytest.approx(MM["differences"], abs=1e-12)
    assert c["pooled_variances"] == pytest.approx(MM["group_var"], rel=1e-12)
    w = MM["bca_high"] - MM["bca_low"]
    assert within_mc(c["bca_ci"][0], MM["bca_low"], w), c["bca_ci"]
    assert within_mc(c["bca_ci"][1], MM["bca_high"], w), c["bca_ci"]
    assert within_mc(c["percentile_ci"][0], MM["pct_low"], w)
    assert within_mc(c["percentile_ci"][1], MM["pct_high"], w)
    assert c["ci"] == c["bca_ci"]
    # DABEST: 0 of 5000 reshuffles reached the weighted delta (b / m);
    # ours reports (b + 1) / (m + 1)
    assert MM["pvalue_permutation"] == 0.0
    assert c["permutation"]["p"] == pytest.approx(1 / 5001)
    assert sum(c["weights"]) == pytest.approx(100)
    # each repeat's own CI also matches DABEST within Monte Carlo error
    for comp, lo, hi in zip(r["comparisons"], MM["bca_low_each"], MM["bca_high_each"]):
        ci = comp["effects"][0]["ci"]
        assert within_mc(ci[0], lo, hi - lo) and within_mc(ci[1], hi, hi - lo)


def test_delta_delta_matches_dabest():
    c = run_dd()["combined"]
    assert c["kind"] == "delta_delta"
    assert DD["comparisons"] == [["Placebo W", "Drug W"], ["Placebo M", "Drug M"]]
    assert [x["difference"] for x in c["comparisons"]] == pytest.approx(DD["differences"], abs=1e-12)
    assert c["difference"] == pytest.approx(DD["difference"], abs=1e-12)
    w = DD["bca_high"] - DD["bca_low"]
    assert within_mc(c["bca_ci"][0], DD["bca_low"], w), c["bca_ci"]
    assert within_mc(c["bca_ci"][1], DD["bca_high"], w), c["bca_ci"]
    assert within_mc(c["percentile_ci"][0], DD["pct_low"], w)
    assert within_mc(c["percentile_ci"][1], DD["pct_high"], w)
    assert "permutation" not in c


def test_weighted_delta_is_the_shared_pooling_step():
    c = run_mm()["combined"]
    d = np.array(MM["differences"])
    w = 1 / np.array(MM["group_var"])
    assert c["difference"] == pytest.approx(float(meta.weighted_mean(d, w)), abs=1e-15)
    assert c["difference"] == pytest.approx(float(np.sum(w * d) / np.sum(w)), abs=1e-12)


def test_bootstrap_spread_matches_the_normal_approximation():
    # independent check: the SD of the weighted bootstrap differences is
    # sqrt(sum(w^2 se^2)) / sum(w) with se^2 = s_c^2/n_c + s_t^2/n_t
    # (the plug-in bootstrap variance uses n, not n - 1)
    c = run_mm(n_boot=20000)["combined"]
    w = 1 / np.array(MM["group_var"])
    se2 = []
    for r in MM["repeats"]:
        a, b = np.array(r["control"]), np.array(r["test"])
        se2.append(a.var(ddof=0) / a.size + b.var(ddof=0) / b.size)
    sd = math.sqrt(np.sum(w ** 2 * np.array(se2))) / w.sum()
    assert c["bootstrap"]["sd"] == pytest.approx(sd, rel=0.03)


def test_reproducible_and_comparisons_unchanged():
    a, b = run_mm(), run_mm()
    assert a["combined"]["ci"] == b["combined"]["ci"]
    g, n = mm_groups()
    plain = estimation.estimation(g, n, design="multi_two_group")
    for x, y in zip(plain["comparisons"], a["comparisons"]):
        assert x["effects"][0]["ci"] == y["effects"][0]["ci"]
        assert x["effects"][0]["permutation"]["p"] == y["effects"][0]["permutation"]["p"]
        assert "bootstraps" not in y["effects"][0]
    other = run_mm(seed=7)
    assert other["combined"]["ci"] != a["combined"]["ci"]
    assert other["combined"]["difference"] == a["combined"]["difference"]


def test_percentile_ci_option():
    c = run_mm(ci_type="percentile")["combined"]
    assert c["ci"] == c["percentile_ci"]


def test_invariances():
    g, n = mm_groups()
    base = run_mm()["combined"]
    # units x 1000: the difference and its CI scale; weights unchanged
    big = estimation.estimation([[v * 1000 for v in x] for x in g], n, design="multi_two_group",
                                combine="mini_meta")["combined"]
    assert big["difference"] == pytest.approx(base["difference"] * 1000, rel=1e-10)
    assert big["bca_ci"] == pytest.approx([x * 1000 for x in base["bca_ci"]], rel=1e-8)
    assert big["weights"] == pytest.approx(base["weights"], rel=1e-10)
    # a shift of every value leaves it unchanged
    shifted = estimation.estimation([[v + 50 for v in x] for x in g], n, design="multi_two_group",
                                    combine="mini_meta")["combined"]
    assert shifted["difference"] == pytest.approx(base["difference"], abs=1e-9)
    # swapping control and test flips the sign
    sw = []
    for i in range(0, len(g), 2):
        sw += [g[i + 1], g[i]]
    flipped = estimation.estimation(sw, n, design="multi_two_group", combine="mini_meta")["combined"]
    assert flipped["difference"] == pytest.approx(-base["difference"], abs=1e-12)
    # delta-delta: swapping the two pairs flips its sign
    dg, dn = dd_groups()
    dd = estimation.estimation(dg[2:] + dg[:2], dn[2:] + dn[:2], design="multi_two_group",
                               combine="delta_delta")["combined"]
    assert dd["difference"] == pytest.approx(-DD["difference"], abs=1e-12)


def test_equal_repeats_weighted_delta_is_the_plain_mean():
    rng = np.random.default_rng(3)
    c = rng.normal(10, 1, 6)
    t = c - 2
    g = [c, t, c + 1, t + 1, c - 1, t - 1]
    r = estimation.estimation(g, [f"G{i}" for i in range(6)], design="multi_two_group",
                              combine="mini_meta")["combined"]
    assert r["difference"] == pytest.approx(-2, abs=1e-12)
    assert r["weights"] == pytest.approx([100 / 3] * 3)


def test_refusals():
    g, n = mm_groups()
    with pytest.raises(ValueError, match="mean difference"):
        estimation.estimation(g, n, design="multi_two_group", combine="mini_meta",
                              effects=("hedges_g",))
    with pytest.raises(ValueError, match="exactly 2"):
        estimation.estimation(g, n, design="multi_two_group", combine="delta_delta")
    with pytest.raises(ValueError, match="at least 2"):
        estimation.estimation(g[:2], n[:2], design="two_group", combine="mini_meta")
    with pytest.raises(ValueError, match="share no group"):
        estimation.estimation(g[:3], n[:3], design="shared_control", combine="mini_meta")
    with pytest.raises(ValueError, match="unpaired"):
        estimation.estimation([[1, 2, 3], [2, 3, 5], [1, 2, 4], [3, 3, 6]], list("ABCD"),
                              design="repeated_baseline", combine="mini_meta")
    with pytest.raises(ValueError, match="no spread"):
        estimation.estimation([[1, 1, 1], [1, 1, 1], [2, 3, 4], [3, 4, 6]], list("ABCD"),
                              design="multi_two_group", combine="mini_meta")
    with pytest.raises(ValueError, match="unknown combined"):
        estimation.estimation(g, n, design="multi_two_group", combine="pooled")


def test_two_values_per_group_and_missing_values():
    g = [[1.0, 2.0], [3.0, 4.5], [2.0, None, 3.0], [5.0, 6.0, float("nan"), 7.0]]
    r = estimation.estimation(g, list("ABCD"), design="multi_two_group", combine="mini_meta")
    c = r["combined"]
    assert np.isfinite(c["difference"]) and all(np.isfinite(c["ci"]))
    assert r["comparisons"][1]["n_control"] == 2 and r["comparisons"][1]["n_test"] == 3


def test_api_option():
    g, n = mm_groups()
    datasets = [{"name": nm, "ys": [[v] for v in vals]} for nm, vals in zip(n, g)]
    r = api.analyze({"analysis": "estimation", "data": {"datasets": datasets},
                     "options": {"design": "multi_two_group", "combine": "mini_meta",
                                 "pairs": [[0, 1], [2, 3], [4, 5]]}})
    assert "error" not in r, r.get("error")
    assert r["combined"]["difference"] == pytest.approx(MM["difference"], abs=1e-12)
    none = api.analyze({"analysis": "estimation", "data": {"datasets": datasets},
                        "options": {"design": "multi_two_group", "combine": "none"}})
    assert "combined" not in none
