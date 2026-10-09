"""Survival extras (opendose.survival_extras).

Independent references:
- R survival package, ``aml`` data (Maintained: 9, 13, 13+, 18, 23, 28+,
  31, 34, 45+, 48, 161+; Nonmaintained: 5, 5, 8, 8, 12, 16+, 23, 27, 30,
  33, 43, 45). R's printed ``survdiff(Surv(time, status) ~ x, data =
  aml)``: N 11 / 12, Observed 7 / 11, Expected 10.69 / 7.31,
  "Chisq= 3.4 on 1 degrees of freedom, p= 0.07".
- statsmodels ``survdiff`` (log-rank, variance form), ``SurvfuncRight``
  (Kaplan-Meier, Greenwood SE), ``PHReg`` (Cox score test, Breslow ties)
  and ``multipletests`` ("bonferroni", "holm-sidak", "holm", "sidak").
- Hand-written step integration of the Kaplan-Meier curve for RMST and
  the survRM2 (rmst1) standard error, written independently of the module.
"""

from __future__ import annotations

import math

import numpy as np
import pytest
from scipy import stats

from opendose import survival
from opendose import survival_extras as se

# aml (R survival package)
AML_M = ([9, 13, 13, 18, 23, 28, 31, 34, 45, 48, 161],
         [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0])
AML_N = ([5, 5, 8, 8, 12, 16, 23, 27, 30, 33, 43, 45],
         [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1])
# constructed third and fourth groups (with ties to the aml times)
G3 = ([3, 4, 6, 8, 10, 13, 15, 19, 23, 30, 40],
      [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0])
G4 = ([12, 20, 25, 33, 38, 50, 60, 70, 90],
      [1, 0, 1, 1, 0, 1, 0, 1, 0])
GROUPS4 = [AML_M, AML_N, G3, G4]
NAMES4 = ["Maintained", "Nonmaintained", "G3", "G4"]


def _sm_survdiff(groups):
    smsurv = pytest.importorskip("statsmodels.duration.survfunc")
    t = np.concatenate([np.asarray(g[0], float) for g in groups])
    e = np.concatenate([np.asarray(g[1], int) for g in groups])
    lab = np.concatenate([[i] * len(g[0]) for i, g in enumerate(groups)])
    chi2, p = smsurv.survdiff(t, e, lab)
    return float(chi2), float(p)


# ---------------------------------------------------------------- parsing

def test_groups_from_datasets_reports_dropped_rows():
    ds = [{"name": "A", "ys": [[1, 1], [2, None], [None, 1], [3, 0], [],
                               [None, None], [4, 2], [5]]},
          {"name": "B", "ys": [[None, 1]]},
          {"name": "C", "ys": [[2.5, 1.0]]}]
    groups, names, dropped = se.groups_from_datasets(ds)
    assert names == ["A", "C"]
    assert groups[0] == ([1.0, 3.0], [1, 0])
    assert groups[1] == ([2.5], [1])
    rows_a = {(d["row"], d["reason"].split()[0]) for d in dropped
              if d["group"] == "A"}
    assert {r for r, _ in rows_a} == {1, 2, 6, 7}
    b = [d for d in dropped if d["group"] == "B"]
    assert len(b) == 2 and b[-1]["row"] is None   # row + group left out


# ---------------------------------------------------------- pairwise

def test_aml_two_groups_matches_r_survdiff():
    res = se.pairwise_logrank([AML_M, AML_N], ["Maintained",
                                               "Nonmaintained"])
    c = res["comparisons"][0]
    # R: Chisq= 3.4 on 1 df, p= 0.07; O 7 / 11; E 10.69 / 7.31
    assert round(c["chi2_variance"], 1) == 3.4
    assert round(c["p_variance"], 2) == 0.07
    assert c["observed"] == [7.0, 11.0]
    assert [round(v, 2) for v in c["expected"]] == [10.69, 7.31]
    chi2, p = _sm_survdiff([AML_M, AML_N])
    assert c["chi2_variance"] == pytest.approx(chi2, rel=1e-6)
    assert c["p_variance"] == pytest.approx(p, rel=1e-6)
    assert c["chi2_variance"] == pytest.approx(3.396389, rel=1e-6)
    # Peto form (default statistic) = sum (O-E)^2/E
    peto = sum((o - e) ** 2 / e for o, e in zip(c["observed"],
                                                 c["expected"]))
    assert c["chi2"] == pytest.approx(peto, rel=1e-9)
    assert c["chi2"] == pytest.approx(3.135172, rel=1e-6)
    assert c["p_unadjusted"] == c["p_adjusted"]          # family of one
    assert res["family_size"] == 1 and res["trend"] is None
    # Mantel-Haenszel HR (Maintained relative to Nonmaintained) < 1
    assert c["hr"] == pytest.approx(0.398282, rel=1e-5)
    assert c["hr_ci"][0] < c["hr"] < c["hr_ci"][1]


def test_pairwise_variance_form_matches_statsmodels_all_pairs():
    res = se.pairwise_logrank(GROUPS4, NAMES4, statistic="variance",
                              correction="none")
    assert res["family_size"] == 6 == len(res["comparisons"])
    for c in res["comparisons"]:
        chi2, p = _sm_survdiff([GROUPS4[c["a_index"]],
                                GROUPS4[c["b_index"]]])
        assert c["chi2_variance"] == pytest.approx(chi2, rel=1e-6)
        assert c["p_variance"] == pytest.approx(p, rel=1e-6)
        assert c["chi2"] == c["chi2_variance"]
        assert c["p_adjusted"] == c["p_unadjusted"]
        assert c["chi2_peto"] <= c["chi2_variance"] + 1e-12
        assert c["df"] == 1 and c["family_size"] == 6


@pytest.mark.parametrize("ours,theirs", [
    ("bonferroni", "bonferroni"), ("holm_sidak", "holm-sidak"),
    ("holm", "holm"), ("sidak", "sidak")])
def test_adjustments_match_multipletests(ours, theirs):
    mt = pytest.importorskip("statsmodels.stats.multitest")
    res = se.pairwise_logrank(GROUPS4, NAMES4, correction=ours)
    raw = np.array([c["p_unadjusted"] for c in res["comparisons"]])
    expected = mt.multipletests(raw, method=theirs)[1]
    got = [c["p_adjusted"] for c in res["comparisons"]]
    assert got == pytest.approx(list(expected), rel=1e-9)
    assert all(c["p_adjusted"] >= c["p_unadjusted"] - 1e-15
               for c in res["comparisons"])
    assert res["family"]["size"] == 6 and res["family"]["method"] == ours


def test_control_family_has_k_minus_1_comparisons():
    mt = pytest.importorskip("statsmodels.stats.multitest")
    res = se.pairwise_logrank(GROUPS4, NAMES4, family="control", control=1,
                              correction="holm_sidak")
    assert res["family_size"] == 3
    assert [(c["a_index"], c["b_index"]) for c in res["comparisons"]] == \
        [(1, 0), (1, 2), (1, 3)]
    full = se.pairwise_logrank(GROUPS4, NAMES4, correction="none")
    by_pair = {frozenset((c["a_index"], c["b_index"])): c["p_unadjusted"]
               for c in full["comparisons"]}
    raw = [c["p_unadjusted"] for c in res["comparisons"]]
    assert raw == pytest.approx(
        [by_pair[frozenset((c["a_index"], c["b_index"]))]
         for c in res["comparisons"]], rel=1e-12)
    expected = mt.multipletests(raw, method="holm-sidak")[1]
    assert [c["p_adjusted"] for c in res["comparisons"]] == \
        pytest.approx(list(expected), rel=1e-9)
    bonf = se.pairwise_logrank(GROUPS4, NAMES4, family="control", control=1)
    assert [c["p_adjusted"] for c in bonf["comparisons"]] == \
        pytest.approx([min(1.0, 3 * p) for p in raw], rel=1e-12)


def test_pairwise_validation():
    with pytest.raises(ValueError):
        se.pairwise_logrank([AML_M], ["one"])
    with pytest.raises(ValueError):
        se.pairwise_logrank(GROUPS4, NAMES4, family="control", control=4)
    with pytest.raises(ValueError):
        se.pairwise_logrank(GROUPS4, NAMES4, correction="tukey")


# ---------------------------------------------------------- trend

# tie-free three-group data (no time shared by any two subjects)
T1 = ([2.1, 3.4, 5.0, 6.2, 7.7, 9.1, 12.5], [1, 1, 1, 0, 1, 1, 0])
T2 = ([1.3, 4.4, 6.9, 8.3, 10.2, 13.8, 15.1, 18.4], [1, 0, 1, 1, 1, 0, 1, 0])
T3 = ([4.9, 9.9, 11.3, 14.6, 17.2, 20.5, 24.0], [1, 0, 1, 0, 1, 1, 0])


def _cox_score_chi2(groups, scores):
    phreg = pytest.importorskip("statsmodels.duration.hazard_regression")
    t = np.concatenate([np.asarray(g[0], float) for g in groups])
    e = np.concatenate([np.asarray(g[1], int) for g in groups])
    x = np.concatenate([[s] * len(g[0]) for s, g in zip(scores, groups)])
    model = phreg.PHReg(t, x[:, None].astype(float), status=e,
                        ties="breslow")
    s = model.score(np.zeros(1))[0]
    h = model.hessian(np.zeros(1))[0, 0]
    return s * s / -h


def _o_e(groups):
    """Independent O and E per group (log-rank, weight 1)."""
    t = np.concatenate([np.asarray(g[0], float) for g in groups])
    e = np.concatenate([np.asarray(g[1], int) for g in groups])
    lab = np.concatenate([[i] * len(g[0]) for i, g in enumerate(groups)])
    k = len(groups)
    O, E = np.zeros(k), np.zeros(k)
    for u in np.unique(t[e == 1]):
        risk = t >= u
        dead = (t == u) & (e == 1)
        for i in range(k):
            O[i] += np.sum(dead & (lab == i))
            E[i] += dead.sum() * np.sum(risk & (lab == i)) / risk.sum()
    return O, E


def test_trend_equals_cox_score_test_without_ties():
    res = se.logrank_trend([T1, T2, T3], ["low", "mid", "high"])
    expected = _cox_score_chi2([T1, T2, T3], [1, 2, 3])
    assert res["chi2"] == pytest.approx(expected, rel=1e-9)
    assert res["p"] == pytest.approx(stats.chi2.sf(expected, 1), rel=1e-9)
    assert res["scores"] == [1.0, 2.0, 3.0] and res["df"] == 1
    # custom scores
    res2 = se.logrank_trend([T1, T2, T3], scores=[0, 1, 4])
    assert res2["chi2"] == pytest.approx(
        _cox_score_chi2([T1, T2, T3], [0, 1, 4]), rel=1e-9)


def test_trend_altman_approximation_by_hand():
    groups = [AML_M, AML_N, G3]
    res = se.logrank_trend(groups)
    O, E = _o_e(groups)
    w = np.array([1.0, 2.0, 3.0])
    U = float(np.sum(w * (O - E)))
    approx = U ** 2 / (np.sum(w * w * E) - np.sum(w * E) ** 2 / np.sum(E))
    assert res["U"] == pytest.approx(U, rel=1e-9)
    assert res["chi2_approx"] == pytest.approx(approx, rel=1e-9)
    assert res["p_approx"] == pytest.approx(stats.chi2.sf(approx, 1),
                                            rel=1e-9)


def test_pairwise_attaches_trend_for_three_or_more_groups():
    res = se.pairwise_logrank([T1, T2, T3], ["a", "b", "c"])
    assert res["trend"]["chi2"] == pytest.approx(
        _cox_score_chi2([T1, T2, T3], [1, 2, 3]), rel=1e-9)


# ---------------------------------------------------------- survival at t

def test_survival_at_times_matches_statsmodels():
    smsurv = pytest.importorskip("statsmodels.duration.survfunc")
    times = [0, 4, 9, 13, 20, 30.5, 45, 60, 161, 170]
    res = se.survival_at_times([AML_M, AML_N], ["M", "N"], times)
    z = stats.norm.ppf(0.975)
    for (tt, ee), g in zip([AML_M, AML_N], res["groups"]):
        sf = smsurv.SurvfuncRight(np.asarray(tt, float), np.asarray(ee))
        tt_a, ee_a = np.asarray(tt, float), np.asarray(ee)
        for row in g["at_times"]:
            t = row["time"]
            assert row["at_risk"] == int(np.sum(tt_a >= t))
            assert row["events_so_far"] == int(np.sum((tt_a <= t)
                                                      & (ee_a == 1)))
            if t > max(tt):
                assert row["beyond_last"] and row["survival"] is None
                continue
            idx = np.searchsorted(sf.surv_times, t, side="right") - 1
            s = 1.0 if idx < 0 else sf.surv_prob[idx]
            s_se = 0.0 if idx < 0 else sf.surv_prob_se[idx]
            assert row["survival"] == pytest.approx(s, rel=1e-9, abs=1e-12)
            if s == 0.0:
                assert row["se"] is None and math.isnan(s_se)
            else:
                assert row["se"] == pytest.approx(s_se, rel=1e-9, abs=1e-12)
            if s == 1.0:
                assert row["ci_loglog"] == [1.0, 1.0]
            elif s == 0.0:
                assert row["ci_loglog"] is None
            else:
                sll = (s_se / s) / abs(math.log(s))
                assert row["ci_loglog"] == pytest.approx(
                    [s ** math.exp(z * sll), s ** math.exp(-z * sll)],
                    rel=1e-9)
    # R: summary(survfit(Surv(time, status) ~ 1, subset(aml, x ==
    # "Maintained")), times = 20) -> survival 0.716, std.err 0.1397
    # (the S(t) after the event at 18, n.risk 7 at t = 20)
    m20 = next(r for r in res["groups"][0]["at_times"] if r["time"] == 20)
    assert round(m20["survival"], 4) == 0.7159
    assert round(m20["se"], 4) == 0.1397
    assert m20["at_risk"] == 7 and m20["events_so_far"] == 3
    assert any("after the last observed time" in w for w in res["warnings"])


def test_survival_at_times_agrees_with_km_curve():
    res = se.survival_at_times([AML_N], ["N"], [12, 27])
    km = survival.km_curve(*AML_N)
    for row in res["groups"][0]["at_times"]:
        pt = [p for p in km["points"] if p["time"] <= row["time"]][-1]
        assert row["survival"] == pytest.approx(pt["survival"], rel=1e-12)
        assert row["ci_loglog"] == pytest.approx([pt["lower"], pt["upper"]],
                                                 rel=1e-12)


def test_median_explanation():
    res = se.survival_at_times([AML_M, AML_N], ["M", "N"], [])
    m, n = (g["explanation"] for g in res["groups"])
    km_m = survival.km_curve(*AML_M)
    assert m["median_reached"] and m["median"] == km_m["median_survival"]
    assert n["median"] == survival.km_curve(*AML_N)["median_survival"]
    stays = ([10, 20, 30, 40, 50, 60, 60, 60, 60, 60],
             [1, 0, 1, 0, 0, 1, 0, 0, 0, 0])
    g = se.survival_at_times([stays], ["high"], [60])["groups"][0]
    ex = g["explanation"]
    assert not ex["median_reached"] and ex["median"] is None
    assert ex["last_time"] == 60.0 and ex["events"] == 3 and ex["n"] == 10
    # S = 0.9 * (7/8) * (4/5) = 0.63 (5 at risk at 60, one event)
    assert ex["fraction_at_last"] == pytest.approx(0.63, rel=1e-12)
    assert ex["text"].startswith("median not reached: 63% still event-free")
    assert "60" in ex["text"]


# ---------------------------------------------------------- RMST

def _step_area(times, surv, a, b):
    """Integral over [a, b] of the right-continuous step function equal to
    1 before times[0] and surv[i] on [times[i], times[i+1])."""
    knots = [0.0] + list(times)
    vals = [1.0] + list(surv)
    total = 0.0
    for i, (lo, v) in enumerate(zip(knots, vals)):
        hi = knots[i + 1] if i + 1 < len(knots) else math.inf
        lo_c, hi_c = max(lo, a), min(hi, b)
        if hi_c > lo_c:
            total += v * (hi_c - lo_c)
    return total


def _rmst_independent(tt, ee, tau):
    smsurv = pytest.importorskip("statsmodels.duration.survfunc")
    sf = smsurv.SurvfuncRight(np.asarray(tt, float), np.asarray(ee))
    est = _step_area(sf.surv_times, sf.surv_prob, 0.0, tau)
    var = 0.0
    for t, n, d in zip(sf.surv_times, sf.n_risk, sf.n_events):
        if t <= tau and n > d:
            var += _step_area(sf.surv_times, sf.surv_prob, t, tau) ** 2 \
                * d / (n * (n - d))
    return est, var


def test_rmst_matches_hand_integration_and_survrm2_formula():
    res = se.rmst([AML_N, AML_M], ["Nonmaintained", "Maintained"])
    # default tau: smaller of the two largest observed times (45, 161)
    assert res["tau"] == 45.0
    z = stats.norm.ppf(0.975)
    vals = []
    for g, (tt, ee) in zip(res["groups"], [AML_N, AML_M]):
        est, var = _rmst_independent(tt, ee, 45.0)
        assert g["rmst"] == pytest.approx(est, rel=1e-9)
        assert g["se"] == pytest.approx(math.sqrt(var), rel=1e-9)
        assert g["ci"] == pytest.approx([est - z * math.sqrt(var),
                                         est + z * math.sqrt(var)], rel=1e-9)
        vals.append((est, var))
    (r0, v0), (r1, v1) = vals
    d = res["difference"][0]
    assert d["a"] == "Maintained" and d["b"] == "Nonmaintained"
    assert d["estimate"] == pytest.approx(r1 - r0, rel=1e-9)
    assert d["se"] == pytest.approx(math.sqrt(v0 + v1), rel=1e-9)
    assert d["p"] == pytest.approx(
        2 * stats.norm.sf(abs(r1 - r0) / math.sqrt(v0 + v1)), rel=1e-9)
    rt = res["ratio"][0]
    sl = math.sqrt(v1 / r1 ** 2 + v0 / r0 ** 2)
    assert rt["estimate"] == pytest.approx(r1 / r0, rel=1e-9)
    assert rt["ci"] == pytest.approx([r1 / r0 * math.exp(-z * sl),
                                      r1 / r0 * math.exp(z * sl)], rel=1e-9)
    # display precision, by hand: Nonmaintained to 45 = 5 + 3(10/12) +
    # 4(8/12) + 11(7/12) + 4(35/72) + 3(28/72) + 3(21/72) + 10(14/72) +
    # 2(7/72) = 22.7083; Maintained = 9 + 4(10/11) + 5(9/11) + 5(63/88) +
    # 8(54/88) + 3(43.2/88) + 11(32.4/88) = 30.7386
    assert round(res["groups"][0]["rmst"], 4) == 22.7083
    assert round(res["groups"][1]["rmst"], 4) == 30.7386


def test_rmst_tau_rules():
    res = se.rmst([AML_N, AML_M], ["N", "M"], tau=30)
    assert res["tau"] == 30.0 and "user" in res["tau_rule"]
    est, _ = _rmst_independent(*AML_M, 30.0)
    assert res["groups"][1]["rmst"] == pytest.approx(est, rel=1e-9)
    # G4's curve ends censored at 90 with S > 0: tau 100 is refused
    with pytest.raises(ValueError, match="largest observed time"):
        se.rmst([AML_M, G4], ["M", "G4"], tau=100)
    # Nonmaintained ends with S = 0 at 45, so tau = 100 is allowed
    r100 = se.rmst([AML_N, AML_M], ["N", "M"], tau=100)
    assert r100["groups"][0]["rmst"] == pytest.approx(
        _rmst_independent(*AML_N, 100.0)[0], rel=1e-9)
    # a curve that has reached 0 is known beyond its last time
    allev = ([1, 2, 3], [1, 1, 1])
    r = se.rmst([AML_M, allev], ["M", "dead"], tau=20)
    assert r["groups"][1]["rmst"] == pytest.approx(1 + 2 / 3 + 1 / 3)


# ---------------------------------------------------------- few events

def test_few_events_warnings():
    assert se.few_events_warnings([AML_M, AML_N], ["M", "N"]) == []
    w = se.few_events_warnings([([1, 2, 3, 4], [1, 1, 0, 1]),
                                ([2, 5, 6], [1, 0, 1])], ["A", "B"])
    assert len(w) == 2
    assert "5 events in total" in w[0]
    assert "A (3 events)" in w[1] and "B (2 events)" in w[1]
    w2 = se.few_events_warnings([AML_M, ([1, 2, 3, 4, 5],
                                         [1, 1, 1, 1, 0])], ["M", "X"])
    assert len(w2) == 1 and "X (4 events)" in w2[0] and "M" not in w2[0]


# ---------------------------------------------------------- JSON types

def _plain(obj):
    if obj is None or type(obj) in (bool, int, float, str):
        return True
    if type(obj) is list:
        return all(_plain(v) for v in obj)
    if type(obj) is dict:
        return all(type(k) is str and _plain(v) for k, v in obj.items())
    return False


def test_results_are_plain_json_types():
    import json
    results = [
        se.pairwise_logrank(GROUPS4, NAMES4, correction="holm_sidak"),
        se.pairwise_logrank(GROUPS4, NAMES4, family="control"),
        se.logrank_trend(GROUPS4, NAMES4),
        se.survival_at_times(GROUPS4, NAMES4, [0, 10, 45, 200]),
        se.rmst(GROUPS4, NAMES4),
        {"w": se.few_events_warnings(GROUPS4, NAMES4)},
        {"d": se.groups_from_datasets([{"name": "A", "ys": [[1, None]]}])[2]},
    ]
    for r in results:
        assert _plain(r), r
        json.dumps(r, allow_nan=False)
