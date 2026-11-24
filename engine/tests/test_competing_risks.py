"""P-90: cumulative incidence (Aalen-Johansen) and Gray's test.

References (engine/tests/reference/competing_risks.py, which writes
competing_risks.json):
- published cmprsk::cuminc output on tidycmprsk's `trial` data (tidycmprsk
  reference page for cuminc(), Sjoberg & Fei): estimates, SEs, 95% CIs at
  months 5, 10, 15, 20 and Gray's test 1.99 (p 0.16) and 0.089 (p 0.77);
- published survfit output on survival::mgus2 (Therneau, survival
  vignette "Multi-state models and competing risks", print(mfit2,
  rmean=240, scale=12)): restricted mean time in each state;
- an independent Aalen-Johansen product-integral in the reference script.
"""
import csv
import json
import os
import random

import pytest

from opendose import api
from opendose import competing_risks as cr

HERE = os.path.dirname(__file__)
REF = json.load(open(os.path.join(HERE, "reference", "competing_risks.json")))
CODES = {"censor": 0, "death from cancer": 1, "death other causes": 2}


def _trial():
    g = {}
    with open(os.path.join(HERE, "fixtures", "tidycmprsk_trial.csv")) as f:
        for row in csv.DictReader(f):
            x = g.setdefault(row["trt"], ([], []))
            x[0].append(float(row["ttdeath"]))
            x[1].append(CODES[row["death_cr"]])
    return ["Drug A", "Drug B"], [g["Drug A"], g["Drug B"]]


def _mgus2():
    g = {}
    with open(os.path.join(HERE, "fixtures", "mgus2_competing.csv")) as f:
        for row in csv.DictReader(f):
            x = g.setdefault(row["sex"], ([], []))
            x[0].append(float(row["etime"]))
            x[1].append(int(row["event"]))
    return ["F", "M"], [g["F"], g["M"]]


def _payload(names, groups):
    return {"datasets": [{"name": n, "ys": [[t, c] for t, c in zip(*g)]}
                         for n, g in zip(names, groups)]}


@pytest.fixture(scope="module")
def trial_result():
    names, groups = _trial()
    return api.analyze({"analysis": "competing_risks",
                        "data": _payload(names, groups),
                        "options": {"times": [5, 10, 15, 20]}})


def test_trial_matches_published_cuminc(trial_result):
    pub = REF["trial"]["published"]
    for cause in trial_result["causes"]:
        c = str(cause["code"])
        for g in cause["groups"]:
            for i, a in enumerate(g["at_times"]):
                assert round(a["cif"], 3) == pytest.approx(pub["est"][g["name"]][c][i], abs=1e-9)
                assert round(a["se"], 3) == pytest.approx(pub["se"][g["name"]][c][i], abs=1e-9)
                want = pub["ci"][g["name"]][c][i]
                if want is None:
                    assert a["lower"] is None and a["upper"] is None
                else:
                    assert [round(a["lower"], 3), round(a["upper"], 3)] == pytest.approx(want, abs=1e-9)


def test_trial_gray_test_matches_published(trial_result):
    g1 = trial_result["causes"][0]["gray"]
    g2 = trial_result["causes"][1]["gray"]
    assert round(g1["chi2"], 2) == 1.99 and g1["df"] == 1 and round(g1["p"], 2) == 0.16
    assert round(g2["chi2"], 3) == 0.089 and round(g2["p"], 2) == 0.77
    for cause in trial_result["causes"]:
        assert cause["gray"]["score"] == pytest.approx(
            REF["trial"]["gray_score"][str(cause["code"])], abs=1e-10)


def test_trial_matches_independent_aalen_johansen(trial_result):
    for cause in trial_result["causes"]:
        for g in cause["groups"]:
            want = REF["trial"]["cif"][g["name"]][str(cause["code"])]
            assert [a["cif"] for a in g["at_times"]] == pytest.approx(want, abs=1e-12)


def test_pooled_trial_matches_published():
    names, groups = _trial()
    pooled = [(groups[0][0] + groups[1][0], groups[0][1] + groups[1][1])]
    res = cr.competing_risks(pooled, ["All"], times=[5, 10, 15, 20])
    pub = REF["trial"]["published"]
    for cause in res["causes"]:
        c = str(cause["code"])
        at = cause["groups"][0]["at_times"]
        assert [round(a["cif"], 3) for a in at] == pytest.approx(pub["pooled_est"][c])
        assert [round(a["se"], 3) for a in at] == pytest.approx(pub["pooled_se"][c])
        assert [a["cif"] for a in at] == pytest.approx(REF["trial"]["pooled"][c], abs=1e-12)
        assert cause["gray"] is None  # one group: no test


def _area(points, tau):
    total = 0.0
    for a, b in zip(points, points[1:] + [None]):
        lo = a["time"]
        hi = tau if b is None else min(b["time"], tau)
        if hi > lo:
            total += a["cif"] * (hi - lo)
        if b is None or b["time"] >= tau:
            break
    return total


def test_mgus2_restricted_mean_in_state_matches_published_survfit():
    names, groups = _mgus2()
    res = cr.competing_risks(groups, names)
    pub = REF["mgus2"]["published"]
    by = {c["code"]: c for c in res["causes"]}
    for gi, name in enumerate(names):
        pcm = _area(by[1]["groups"][gi]["points"], 240.0) / 12
        death = _area(by[2]["groups"][gi]["points"], 240.0) / 12
        assert pcm == pytest.approx(pub[name]["pcm"], abs=5e-7)
        assert death == pytest.approx(pub[name]["death"], abs=5e-7)
        assert 20 - pcm - death == pytest.approx(pub[name]["event_free"], abs=5e-7)
        for t, want in REF["mgus2"]["rmean_years_tau240"][name]["cif_at"].items():
            assert cr.value_at(by[1]["groups"][gi], float(t))["cif"] == pytest.approx(want[0], abs=1e-12)
            assert cr.value_at(by[2]["groups"][gi], float(t))["cif"] == pytest.approx(want[1], abs=1e-12)


def test_cifs_and_survival_add_to_one():
    """F_1 + F_2 + S = 1 at every time (the multi-state identity)."""
    names, groups = _mgus2()
    res = cr.competing_risks(groups[:1], names[:1], times=[12, 100, 300])
    from opendose.survival import km_curve
    t, c = groups[0]
    km = km_curve(t, [1 if x else 0 for x in c])
    for i, tt in enumerate([12, 100, 300]):
        s = [p for p in km["points"] if p["time"] <= tt][-1]["survival"]
        f = sum(cause["groups"][0]["at_times"][i]["cif"] for cause in res["causes"])
        assert f + s == pytest.approx(1.0, abs=1e-12)


# --------------------------------------------------------------- properties

def test_group_order_does_not_change_gray_test():
    names, groups = _trial()
    a = cr.gray_test(groups, 1)
    b = cr.gray_test(groups[::-1], 1)
    assert a["chi2"] == pytest.approx(b["chi2"], rel=1e-10)
    rnd = random.Random(7)
    three = [([rnd.randint(1, 40) for _ in range(20)],
              [rnd.choice([0, 1, 1, 2]) for _ in range(20)]) for _ in range(3)]
    base = cr.gray_test(three, 2)["chi2"]
    for perm in ([1, 2, 0], [2, 0, 1], [0, 2, 1]):
        assert cr.gray_test([three[i] for i in perm], 2)["chi2"] == pytest.approx(base, rel=1e-9)


@pytest.mark.parametrize("scale", [1e-12, 1 / 7, 1e12])
def test_time_units_do_not_change_estimates_or_test(scale):
    names, groups = _trial()
    res = cr.competing_risks(groups, names, times=[10, 20])
    scaled = [([t * scale for t in ts], cs) for ts, cs in groups]
    res2 = cr.competing_risks(scaled, names, times=[10 * scale, 20 * scale])
    for c1, c2 in zip(res["causes"], res2["causes"]):
        assert c2["gray"]["chi2"] == pytest.approx(c1["gray"]["chi2"], rel=1e-9)
        for g1, g2 in zip(c1["groups"], c2["groups"]):
            for a1, a2 in zip(g1["at_times"], g2["at_times"]):
                assert a2["cif"] == pytest.approx(a1["cif"], rel=1e-12)
                assert a2["se"] == pytest.approx(a1["se"], rel=1e-9)


def test_identical_groups_give_zero_score():
    t = [1, 2, 2, 3, 5, 8, 9, 12]
    c = [1, 2, 0, 1, 1, 2, 0, 1]
    g = cr.gray_test([(t, c), (t, c)], 1)
    assert g["score"][0] == pytest.approx(0.0, abs=1e-12)
    assert g["chi2"] == pytest.approx(0.0, abs=1e-12)
    assert g["p"] == pytest.approx(1.0)


# --------------------------------------------------------------- edge cases

def test_bad_rows_are_left_out_with_a_reason():
    res = api.analyze({"analysis": "competing_risks", "data": {"datasets": [
        {"name": "A", "ys": [[1, 1], [2, 2], [3, 0], [-1, 1], [4, 1.5], [5, None],
                             [None, 1], [None, None], [6, 1]]},
        {"name": "B", "ys": [[2, 1], [3, 2], [4, 0]]},
        {"name": "Empty", "ys": [[None, None]]}]}, "options": {}})
    w = " ".join(res["warnings"])
    assert "A, row 4 left out: time is negative" in w
    assert "row 5 left out: event code 1.5" in w
    assert "row 6 left out: missing event code" in w
    assert "row 7 left out: missing time" in w
    assert "Empty, group left out" in w
    assert res["group_names"] == ["A", "B"]
    assert res["causes"][0]["groups"][0]["n"] == 4


def test_every_subject_censored_is_an_error():
    res = api.analyze({"analysis": "competing_risks", "data": {"datasets": [
        {"name": "A", "ys": [[1, 0], [2, 0]]}]}, "options": {}})
    assert "every subject is censored" in res["error"]


def test_no_data_is_an_error():
    res = api.analyze({"analysis": "competing_risks", "data": {"datasets": [
        {"name": "A", "ys": [[None, None]]}]}, "options": {}})
    assert "no survival data" in res["error"]


def test_one_kind_of_event_says_cif_is_one_minus_km():
    t = [1, 2, 3, 4, 5]
    c = [1, 0, 1, 1, 0]
    res = cr.competing_risks([(t, c)], ["A"], times=[4])
    assert any("equals 1 - Kaplan-Meier" in w for w in res["warnings"])
    from opendose.survival import km_curve
    s = [p for p in km_curve(t, c)["points"] if p["time"] <= 4][-1]["survival"]
    assert res["causes"][0]["groups"][0]["at_times"][0]["cif"] == pytest.approx(1 - s)


def test_no_events_of_a_cause_in_any_group_gives_no_test():
    groups = [([1, 2, 3], [1, 0, 1]), ([1, 2, 4], [1, 1, 0])]
    res = cr.competing_risks(groups, ["A", "B"], causes=[1, 2])
    c2 = res["causes"][1]
    assert c2["gray"]["chi2"] is None and c2["gray"]["p"] is None
    assert "could not be computed" in c2["note"]
    assert all(g["steps"] == [] for g in c2["groups"])


@pytest.mark.parametrize("rows", [[(5.0, 1)], [(5.0, 2), (7.0, 1)], [(3.0, 1), (3.0, 1)]])
def test_tiny_groups(rows):
    t = [r[0] for r in rows]
    c = [r[1] for r in rows]
    res = cr.competing_risks([(t, c)], ["A"], causes=[1], times=[100])
    g = res["causes"][0]["groups"][0]
    assert g["at_times"][0]["beyond_last"] is True
    last = g["steps"][-1]
    assert 0 < last["cif"] <= 1
    if last["cif"] == 1:
        assert last["lower"] is None and last["upper"] is None
    assert any("large-sample" in w for w in res["warnings"])


def test_ties_between_kinds_of_event():
    """Tied events of both kinds at one time: S(t-) d_k / n for each."""
    res = cr.competing_risks([([2, 2, 2, 2, 5], [1, 2, 2, 0, 1])], ["A"])
    by = {c["code"]: c["groups"][0]["steps"] for c in res["causes"]}
    assert by[1][0]["cif"] == pytest.approx(1 / 5)
    assert by[2][0]["cif"] == pytest.approx(2 / 5)
    assert by[1][1]["cif"] == pytest.approx(1 / 5 + (2 / 5) * 1 / 1)


def test_value_at_before_first_event_and_after_last_follow_up():
    r = cr.cumulative_incidence([2, 4, 6], [1, 2, 0], 1)
    assert cr.value_at(r, 1.0)["cif"] == 0.0
    assert cr.value_at(r, 6.0)["cif"] == pytest.approx(1 / 3)
    assert cr.value_at(r, 6.5) is None


def test_kaplan_meier_leaves_other_codes_out_and_says_why():
    """Event code 2 in a survival table: the Kaplan-Meier analysis used to
    loop for ever on it; it now leaves the row out with a warning that
    names Competing risks."""
    res = api.analyze({"analysis": "survival", "data": {"datasets": [
        {"name": "A", "ys": [[1, 1], [2, 2], [3, 0], [4, 1], [6, 1]]}]}, "options": {}})
    assert "error" not in res
    assert res["curves"]["A"]["n"] == 4
    assert any("event code 2 left out of Kaplan-Meier" in w and "Competing risks" in w
               for w in res["warnings"])
    clean = api.analyze({"analysis": "survival", "data": {"datasets": [
        {"name": "A", "ys": [[1, 1], [3, 0], [4, 1], [6, 1]]}]}, "options": {}})
    assert res["curves"]["A"]["points"] == clean["curves"]["A"]["points"]
