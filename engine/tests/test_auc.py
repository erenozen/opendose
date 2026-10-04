"""Area under the curve (opendose.auc).

References:
- GraphPad Prism statistics guide, "Area under the curve": trapezoid rule
  Delta X * ((Y1 + Y2)/2 - baseline), linear interpolation of baseline
  crossings, no extrapolation, peaks below 10% of the min-to-max Y
  distance ignored, total area / total peak area / net area, and the SE
  and z-based CI from replicates by Gagnon & Peterson (1998) and Bailer
  (1988); comparing AUCs as a t test with df = points - X values.
- Hand-computed trapezoids (worked in the comments) and the exact
  variance algebra Var(sum c_i ybar_i) = sum c_i^2 s_i^2 / n_i, checked
  also by simulation.
"""

import math

import numpy as np
import pytest
from scipy import stats

from opendose.api import analyze
from opendose.auc import (analyze_datasets, area_under_curve, compare_aucs,
                          subject_auc)

X = [0, 1, 2, 3, 4, 5, 6]
Y = [-1, 2, 4, 1, -2, -0.1, 3]


def test_hand_computed_regions():
    r = area_under_curve(X, [[v] for v in Y])
    # signed trapezoids: 0.5 + 3 + 2.5 - 0.5 - 1.05 + 1.45
    assert r["area"] == pytest.approx(5.9)
    above = [p for p in r["peaks"] if p["direction"] == "above"]
    below = [p for p in r["peaks"] if p["direction"] == "below"]
    # first crossing at x = 1/3; region above to x = 10/3
    assert above[0]["x_start"] == pytest.approx(1 / 3)
    assert above[0]["x_end"] == pytest.approx(10 / 3)
    assert above[0]["area"] == pytest.approx(2 / 3 + 3 + 2.5 + 1 / 6)
    assert (above[0]["peak_x"], above[0]["peak_y"]) == (2.0, 4.0)
    xc = 5 + 0.1 / 3.1
    assert above[1]["x_start"] == pytest.approx(xc)
    assert above[1]["area"] == pytest.approx(3 * (6 - xc) / 2)
    assert below[0]["area"] == pytest.approx(1 / 6)
    assert below[1]["area"] == pytest.approx(2 / 3 + 1.05 + 0.1 * (xc - 5) / 2)
    assert r["area_above"] - r["area_below"] == pytest.approx(r["area"])
    assert r["total_area"] == pytest.approx(r["area_above"] + r["area_below"])
    # default: only peaks above the baseline count
    assert r["n_peaks"] == 2
    assert r["total_peak_area"] == pytest.approx(r["area_above"])
    assert sum(p["fraction"] for p in above) == pytest.approx(1.0)
    assert r["net_peak_area"] is None
    both = area_under_curve(X, [[v] for v in Y], peak_direction="both")
    assert both["n_peaks"] == 4
    assert both["net_peak_area"] == pytest.approx(r["area"])


def test_peak_height_and_width_rules():
    y = [0, 5, 0, 0.4, 0, 3, 3.5, 3, 0]
    x = list(range(len(y)))
    r = area_under_curve(x, [[v] for v in y])
    # threshold 10% of (5 - 0): the 0.4 bump does not count
    assert r["peak_threshold"] == pytest.approx(0.5)
    assert [p["counted"] for p in r["peaks"]] == [True, False, True]
    r = area_under_curve(x, [[v] for v in y], min_peak_height_pct=5)
    assert all(p["counted"] for p in r["peaks"])
    r = area_under_curve(x, [[v] for v in y], min_peak_points=2)
    assert [p["counted"] for p in r["peaks"]] == [False, False, True]
    assert r["total_area"] == pytest.approx(5 + 0.4 + 3 / 2 + 3.25 + 3.25 + 1.5)


def test_baselines_and_unequal_spacing():
    x = [0, 0.5, 2, 5]
    y = [2, 6, 4, 3]
    trap = 0.5 * 4 + 1.5 * 5 + 3 * 3.5
    assert area_under_curve(x, [[v] for v in y])["area"] == pytest.approx(trap)
    r = area_under_curve(x, [[v] for v in y], baseline="value",
                         baseline_value=1)
    assert r["area"] == pytest.approx(trap - 5)
    r = area_under_curve(x, [[v] for v in y], baseline="first")
    assert r["baseline"] == 2 and r["area"] == pytest.approx(trap - 10)
    r = area_under_curve(x, [[v] for v in y], baseline="last")
    assert r["area"] == pytest.approx(trap - 15)
    # curve below a baseline at both ends: crossings are interpolated
    r = area_under_curve(x, [[v] for v in y], baseline="value",
                         baseline_value=3.5)
    first = next(p for p in r["peaks"] if p["direction"] == "above")
    assert first["x_start"] == pytest.approx(0.5 * 1.5 / 4)
    assert first["x_end"] == pytest.approx(2 + 3 * 0.5 / 1)


def test_gagnon_bailer_se():
    x = [0, 1, 2, 4, 8]
    reps = [[10, 12, 11], [30, 26, 31], [22, 25, 20], [12, 14, None],
            [5, 6, 4]]
    r = area_under_curve(x, reps)
    c = np.array([0.5, 1.0, 1.5, 3.0, 2.0])
    m = np.array([np.mean([v for v in row if v is not None]) for row in reps])
    s = np.array([np.std([v for v in row if v is not None], ddof=1)
                  for row in reps])
    n = np.array([3, 3, 3, 2, 3])
    assert r["area"] == pytest.approx(float(c @ m))
    assert r["se"] == pytest.approx(math.sqrt(np.sum(c ** 2 * s ** 2 / n)))
    assert r["df"] == 14 - 5
    z = stats.norm.ppf(0.975)
    assert r["ci"] == pytest.approx([r["area"] - z * r["se"],
                                     r["area"] + z * r["se"]])
    # summary-data entry gives the same answer
    r2 = area_under_curve(x, mean=list(m), sd=list(s), n=list(n))
    assert r2["se"] == pytest.approx(r["se"])
    # data-derived baseline folds into the weights: first value
    r3 = area_under_curve(x, reps, baseline="first")
    c3 = c.copy()
    c3[0] -= 8
    assert r3["area"] == pytest.approx(float(c3 @ m))
    assert r3["se"] == pytest.approx(math.sqrt(np.sum(c3 ** 2 * s ** 2 / n)))


def test_se_matches_simulation():
    rng = np.random.default_rng(7)
    x = np.array([0, 1, 3, 6, 10.0])
    mu = np.array([1, 8, 6, 3, 1.0])
    sd = np.array([0.5, 2, 1.5, 1, 0.4])
    k = 4
    aucs, ses = [], []
    for _ in range(4000):
        reps = [list(rng.normal(m, s, k)) for m, s in zip(mu, sd)]
        r = area_under_curve(list(x), reps)
        aucs.append(r["area"])
        ses.append(r["se"])
    c = np.array([0.5, 1.5, 2.5, 3.5, 2.0])
    true_se = math.sqrt(np.sum(c ** 2 * sd ** 2 / k))
    assert np.std(aucs) == pytest.approx(true_se, rel=0.05)
    assert np.sqrt(np.mean(np.square(ses))) == pytest.approx(true_se, rel=0.03)


def test_compare_two_and_three():
    x = [0, 1, 2, 4]
    a = analyze_datasets(x, [
        {"name": "A", "ys": [[1, 2, 1.5], [8, 9, 10], [5, 6, 5.5], [2, 2, 3]]},
        {"name": "B", "ys": [[1, 1, 2], [5, 6, 5], [3, 4, 3], [1, 2, 1]]}])
    ra, rb = a["datasets"]
    comp = a["comparison"]
    diff = ra["area"] - rb["area"]
    sed = math.sqrt(ra["se"] ** 2 + rb["se"] ** 2)
    assert comp["bailer_z"]["z"] == pytest.approx(diff / sed)
    n1, n2 = ra["df"] + 1, rb["df"] + 1
    t = stats.ttest_ind_from_stats(ra["area"], ra["se"] * math.sqrt(n1), n1,
                                   rb["area"], rb["se"] * math.sqrt(n2), n2)
    assert comp["t_test"]["t"] == pytest.approx(t.statistic)
    assert comp["t_test"]["df"] == ra["df"] + rb["df"] == 16
    # ANOVA recipe with two groups equals the t test (F = t^2)
    assert comp["anova"]["F"] == pytest.approx(t.statistic ** 2)
    three = analyze_datasets(x, [
        {"name": n, "ys": ys} for n, ys in
        (("A", [[1, 2], [8, 9], [5, 6], [2, 2]]),
         ("B", [[1, 1], [5, 6], [3, 4], [1, 2]]),
         ("C", [[0, 1], [3, 4], [2, 2], [1, 1]]))])
    assert three["comparison"]["bailer_chi2"]["df"] == 2
    assert "t_test" not in three["comparison"]
    with pytest.raises(ValueError, match="with replicates"):
        compare_aucs([{"area": 1.0, "se": None, "df": None}] * 2)


def test_per_replicate_experiments():
    x = [0, 1, 2]
    ds = [{"name": "A", "ys": [[0, 0, 0], [4, 6, 5], [0, 0, 0]]},
          {"name": "B", "ys": [[0, 0, 0], [2, 3, 1], [0, 0, 0]]}]
    res = analyze_datasets(x, ds, replicates="experiments")
    a, b = res["datasets"]
    assert a["per_replicate"] == [4.0, 6.0, 5.0]
    assert a["mean"] == pytest.approx(5.0) and a["sd"] == pytest.approx(1.0)
    t = stats.ttest_ind([4, 6, 5], [2, 3, 1])
    assert res["comparison"]["t"] == pytest.approx(t.statistic)
    assert res["comparison"]["p"] == pytest.approx(t.pvalue)


def test_subject_auc_long_format():
    subj = ["m1"] * 3 + ["m2"] * 3 + ["m3"] * 2 + ["m4"] * 3 + ["m5"] * 3
    grp = ["ctl"] * 6 + ["ctl"] * 2 + ["drug"] * 6
    t = [0, 2, 4, 0, 2, 4, 0, 3, 0, 2, 4, 0, 2, 4]
    v = [100, 200, 400, 120, 180, 380, 90, 250, 100, 120, 150, 110, 130, 170]
    res = subject_auc(subj, grp, t, v)
    aucs = {r["subject"]: r["auc"] for r in res["subjects"]}
    assert aucs["m1"] == pytest.approx(2 * 150 + 2 * 300)
    assert aucs["m3"] == pytest.approx(3 * 170)
    assert [d["name"] for d in res["table"]["datasets"]] == ["ctl", "drug"]
    ctl = [aucs[k] for k in ("m1", "m2", "m3")]
    drug = [aucs[k] for k in ("m4", "m5")]
    assert res["comparison"]["t"] == pytest.approx(
        stats.ttest_ind(ctl, drug).statistic)
    rel = subject_auc(subj, grp, t, v, baseline="first", per_time=True)
    m1 = next(r for r in rel["subjects"] if r["subject"] == "m1")
    assert m1["auc"] == pytest.approx((2 * 150 + 2 * 300 - 4 * 100) / 4)


def test_api_auc():
    res = analyze({"analysis": "auc", "data": {
        "x": X, "datasets": [{"name": "A", "ys": [[v] for v in Y]}]},
        "options": {"peak_direction": "both"}})
    assert "error" not in res, res.get("error")
    assert res["datasets"][0]["area"] == pytest.approx(5.9)
    res = analyze({"analysis": "auc", "data": {
        "subject": ["a", "a", "b", "b"], "group": ["g", "g", "h", "h"],
        "time": [0, 1, 0, 1], "value": [1, 3, 2, 2]}, "options": {}})
    assert "error" not in res, res.get("error")
    assert [r["auc"] for r in res["subjects"]] == [2.0, 2.0]
    # summary-format rows (mean, SD, N) give the Gagnon SE
    res = analyze({"analysis": "auc", "data": {
        "x": [0, 1, 2], "datasets": [{"name": "A", "ys": [
            [1, 0.5, 3], [5, 1.0, 3], [2, 0.4, 3]]}]},
        "options": {"summary_format": "mean_sd_n"}})
    assert "error" not in res, res.get("error")
    a = res["datasets"][0]
    assert a["area"] == pytest.approx(0.5 * 1 + 1 * 5 + 0.5 * 2)
    assert a["se"] == pytest.approx(math.sqrt((0.25 * 0.25 + 1 + 0.25 * 0.16)
                                              / 3))
    assert a["df"] == 6
