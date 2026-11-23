"""Potency across independent experiments (opendose/potency.py, P-08).

Reference values come from engine/tests/reference/
potency_across_experiments.py (scipy.optimize.curve_fit per experiment,
scipy.stats.t for the interval, cross-checked against
scipy.stats.ttest_1samp and pingouin.ttest); the hand derivations are
written out in the tests.
"""

import json
import math
from pathlib import Path

import pytest

from opendose import api, potency

REF = json.loads((Path(__file__).parent / "reference"
                  / "potency_across_experiments.json").read_text())
X = [float(v) for v in REF["x"]]
NAMES = ["Experiment 1", "Experiment 2", "Experiment 3"]


def run(rows=None, x=None, of=None, names=None, log10_molar=0.0, **opts):
    exp = {"of": of if of is not None else REF["experiments_of_subcolumn"],
           "names": names or NAMES}
    if log10_molar is not None:
        exp["log10_molar"] = log10_molar
    r = api.analyze({"analysis": "dose_response",
                     "data": {"x": x or X, "datasets": [
                         {"name": "Drug A", "ys": rows or REF["rows"]}]},
                     "options": {"model": "log_inhibitor_vs_response_4pl",
                                 "x_is_log": False, "experiments": exp, **opts}})
    return r["datasets"][0]


def sig(v, d=4):
    return float(f"{v:.{d}g}")


# ------------------------------------------------------------ reference

def test_per_experiment_fits_match_curve_fit():
    e = run()["experiments"]
    assert e["param"] == "LogIC50" and e["n_experiments"] == 3
    for got, ref in zip(e["fits"], REF["experiments"]):
        assert got["name"] == ref["name"] and got["included"] and got["reason"] is None
        assert got["n_points"] == ref["n_points"] == 24
        assert got["log_value"] == pytest.approx(ref["log_ic50"], abs=1e-6)
        assert sig(got["value"]) == sig(ref["ic50"])
        assert got["ci95_log"] == pytest.approx(ref["log_ic50_ci95"], abs=1e-4)


def test_summary_matches_t_interval_on_log_ic50():
    s = run()["experiments"]["summary"]
    ref = REF["summary"]
    assert s["n"] == 3 and s["df"] == 2 and s["withheld"] is None
    for k in ("mean_log", "sd_log", "t_crit", "p_mean"):
        assert s[k] == pytest.approx(ref[k], abs=1e-6), k
    assert s["ci95_log"] == pytest.approx(ref["ci95_log"], abs=1e-6)
    assert s["ci95_log"] == pytest.approx(ref["ci_scipy_ttest_1samp"], abs=1e-6)
    assert s["p_ci95"] == pytest.approx(ref["p_ci95"], abs=1e-6)
    assert s["geomean"] == pytest.approx(ref["geomean"], rel=1e-5)
    assert s["geomean_ci95"] == pytest.approx(ref["geomean_ci95"], rel=1e-5)
    # display precision pins (what the results show): 4 significant digits
    assert [sig(s["mean_log"]), sig(s["sd_log"])] == [-7.035, 0.2925]
    assert [sig(v) for v in s["ci95_log"]] == [-7.761, -6.308]
    assert sig(s["p_mean"]) == 7.035
    assert [sig(v) for v in s["p_ci95"]] == [6.308, 7.761]
    assert sig(s["geomean"]) == 9.235e-8
    assert [sig(v) for v in s["geomean_ci95"]] == [1.733e-8, 4.922e-7]


def test_pooled_fit_unchanged_by_the_experiments_option():
    with_exp = run()
    plain = api.analyze({"analysis": "dose_response",
                         "data": {"x": X, "datasets": [{"name": "Drug A", "ys": REF["rows"]}]},
                         "options": {"model": "log_inhibitor_vs_response_4pl",
                                     "x_is_log": False}})["datasets"][0]
    assert "experiments" not in plain
    assert json.dumps(with_exp["fit"], sort_keys=True, default=float) == \
        json.dumps(plain["fit"], sort_keys=True, default=float)
    # the pooled CI counts 24 wells and is far narrower than the CI on 3
    # experiments: the reason for the summary
    pooled = plain["fit"]["params"]["LogIC50"]["ci95"]
    s = with_exp["experiments"]["summary"]
    assert pooled[1] - pooled[0] < (s["ci95_log"][1] - s["ci95_log"][0]) / 5


# ------------------------------------------------------------ hand derivation

def test_potency_summary_hand_derivation():
    # logs -7.2, -7.0, -6.8: mean -7, SD 0.2, t(0.975, 2) = 4.302653,
    # half width 4.302653 * 0.2 / sqrt(3) = 0.496828
    s = potency.potency_summary([-7.2, -7.0, -6.8], log10_molar=-6)
    assert s["mean_log"] == pytest.approx(-7.0)
    assert s["sd_log"] == pytest.approx(0.2)
    assert s["t_crit"] == pytest.approx(4.302653, abs=1e-6)
    assert s["ci95_log"] == pytest.approx([-7.496828, -6.503172], abs=1e-6)
    assert s["geomean"] == pytest.approx(1e-7)
    assert s["geomean_ci95"] == pytest.approx([10 ** -7.496828, 10 ** -6.503172], rel=1e-5)
    # unit uM (log10 molar -6): IC50 = 1e-7 uM = 1e-13 M, pIC50 = 13
    assert s["p_mean"] == pytest.approx(13.0)
    assert s["p_ci95"] == pytest.approx([12.503172, 13.496828], abs=1e-6)


def test_no_pic50_without_a_molar_unit():
    s = potency.potency_summary([-7.2, -7.0, -6.8])
    assert s["p_mean"] is None and s["p_ci95"] is None
    assert run(log10_molar=None)["experiments"]["summary"]["p_mean"] is None


# ------------------------------------------------------------ edge cases

def test_n_zero_one_two():
    s0 = potency.potency_summary([])
    assert s0["n"] == 0 and s0["mean_log"] is None and "no experiment" in s0["withheld"]
    s1 = potency.potency_summary([-7.0])
    assert s1["n"] == 1 and s1["mean_log"] == -7.0 and s1["sd_log"] is None
    assert s1["ci95_log"] is None and "n = 1" in s1["withheld"]
    s2 = potency.potency_summary([-7.1, -6.9])
    assert s2["df"] == 1 and s2["t_crit"] == pytest.approx(12.706205, abs=1e-6)
    half = 12.706205 * math.sqrt(0.02) / math.sqrt(2)
    assert s2["ci95_log"] == pytest.approx([-7 - half, -7 + half], abs=1e-6)
    assert s2["withheld"] is None
    ref2 = REF["two_experiments"]
    two = run(rows=[r[:6] for r in REF["rows"]], of=[0, 0, 0, 1, 1, 1],
              names=NAMES[:2])["experiments"]["summary"]
    # t = 12.71 magnifies the two optimizers' 1e-7 differences in logIC50
    assert two["ci95_log"] == pytest.approx(ref2["ci95_log"], abs=1e-5)
    assert [sig(v) for v in two["ci95_log"]] == [sig(v) for v in ref2["ci95_log"]]


def test_all_equal_log_values_give_zero_sd():
    s = potency.potency_summary([-7.0, -7.0, -7.0])
    assert s["sd_log"] == 0.0 and s["ci95_log"] == [-7.0, -7.0]


def test_non_finite_input_is_an_error():
    with pytest.raises(ValueError):
        potency.potency_summary([-7.0, float("nan")])


def _rows_with(exp, values):
    """REF rows with experiment `exp`'s three wells replaced by values[row]."""
    out = []
    for r, v in zip(REF["rows"], values):
        row = list(r)
        row[exp * 3:(exp + 1) * 3] = v
        out.append(row)
    return out


def test_failed_experiment_is_named_and_excluded():
    # experiment 3 has values in two rows only: 6 points for 4 parameters
    # is fine, so leave one row: 3 points cannot fit 4 parameters
    vals = [[None] * 3 for _ in REF["rows"]]
    vals[0] = [99.0, 98.0, 97.0]
    e = run(rows=_rows_with(2, vals))["experiments"]
    f3 = e["fits"][2]
    assert not f3["included"] and f3["reason"].startswith("the fit failed")
    s = e["summary"]
    assert s["n"] == 2 and s["df"] == 1 and s["withheld"] is None
    assert s["mean_log"] == pytest.approx(
        (REF["experiments"][0]["log_ic50"] + REF["experiments"][1]["log_ic50"]) / 2, abs=1e-6)


def test_flat_experiment_is_ambiguous_and_excluded():
    vals = [[50.0, 50.0, 50.0] for _ in REF["rows"]]
    e = run(rows=_rows_with(1, vals))["experiments"]
    f2 = e["fits"][1]
    assert not f2["included"]
    assert f2["reason"] == "ambiguous fit: the data do not define the parameters"
    assert e["summary"]["n"] == 2


def test_extrapolated_experiment_is_excluded():
    # plateaus held at 100 and 0; experiment 1's IC50 (true 8 uM) lies past
    # the top dose (3 uM): a defined fit, read off the model's tail
    def curve(x):
        return 100.0 / (1 + 10 ** (math.log10(x) - math.log10(8e-6)))
    vals = [[round(curve(x) + d, 1) for d in (-1.0, 0.0, 1.0)] for x in X]
    e = run(rows=_rows_with(0, vals), constraints={"Top": 100, "Bottom": 0})["experiments"]
    f1 = e["fits"][0]
    assert not f1["included"]
    assert f1["reason"] == "its IC50 lies outside the concentrations tested (extrapolated)"
    assert f1["log_value"] > math.log10(3e-6)
    assert [f["included"] for f in e["fits"]] == [False, True, True]
    assert e["summary"]["n"] == 2


def test_fewer_than_two_left_withholds_the_summary():
    flat = [[50.0, 50.0, 50.0] for _ in REF["rows"]]
    rows = _rows_with(1, flat)
    rows = [r[:3] + r[3:6] + [50.0, 50.0, 50.0] for r in rows]
    e = run(rows=rows)["experiments"]
    s = e["summary"]
    assert s["n"] == 1 and s["ci95_log"] is None
    assert s["withheld"].startswith("fewer than two experiments can be summarised (1 of 3)")
    assert "Experiment 2" in s["withheld"] and "Experiment 3" in s["withheld"]


def test_unequal_blocks_and_missing_values():
    # experiment 1 = subcolumns A-B, 2 = C-E, 3 = F-I; some wells missing
    rows = [list(r) for r in REF["rows"]]
    rows[2][4] = None
    rows[5][7] = None
    of = [0, 0, 1, 1, 1, 2, 2, 2, 2]
    e = run(rows=rows, of=of)["experiments"]
    assert [f["n_points"] for f in e["fits"]] == [16, 23, 31]
    assert all(f["included"] for f in e["fits"])
    assert e["summary"]["n"] == 3


def test_model_without_a_log_potency():
    r = api.analyze({"analysis": "dose_response",
                     "data": {"x": [1, 2, 4, 8, 16, 32], "datasets": [
                         {"name": "E", "ys": [[1, 1.1], [1.9, 2], [3, 3.2], [4, 4.1],
                                              [4.6, 4.8], [5, 5.1]]}]},
                     "options": {"model": "michaelis_menten",
                                 "experiments": {"of": [0, 1], "names": ["a", "b"]}}})
    ds = r["datasets"][0]
    assert "fit" in ds
    assert "no logIC50 or logEC50" in ds["experiments"]["error"]


def test_bad_replicate_map_is_an_error_not_a_crash():
    e = run(of=[0, 0, 0, 1, 1, 1, 5, 5, 5])["experiments"]
    assert "does not name an experiment" in e["error"]


# ------------------------------------------------------------ invariance

def test_permuting_experiments_gives_the_same_summary():
    base = run()["experiments"]["summary"]
    # experiment blocks in the order 3, 1, 2
    perm = [r[6:9] + r[0:3] + r[3:6] for r in REF["rows"]]
    s = run(rows=perm, names=["Experiment 3", "Experiment 1", "Experiment 2"])[
        "experiments"]["summary"]
    for k in ("mean_log", "sd_log", "p_mean"):
        assert s[k] == pytest.approx(base[k], abs=1e-9)
    assert s["ci95_log"] == pytest.approx(base["ci95_log"], abs=1e-9)
    ref = REF["invariance"]["permuted"]
    assert s["ci95_log"] == pytest.approx(ref["ci95_log"], abs=1e-6)


def test_scaling_concentrations_shifts_the_mean_only():
    base = run()["experiments"]["summary"]
    # the same doses written in nM (x 1e9): log IC50 shifts by 9
    s = run(x=[v * 1e9 for v in X], log10_molar=-9)["experiments"]["summary"]
    assert s["mean_log"] == pytest.approx(base["mean_log"] + 9, abs=1e-5)
    assert s["sd_log"] == pytest.approx(base["sd_log"], abs=1e-5)
    w0 = base["ci95_log"][1] - base["ci95_log"][0]
    w1 = s["ci95_log"][1] - s["ci95_log"][0]
    assert w1 == pytest.approx(w0, abs=1e-5)
    # pIC50 is a property of the compound, not of the unit it was typed in
    assert s["p_mean"] == pytest.approx(base["p_mean"], abs=1e-5)
    ref = REF["invariance"]["x_times_1e3"]
    assert ref["mean_log"] == pytest.approx(REF["summary"]["mean_log"] + 3, abs=1e-12)
    assert ref["sd_log"] == pytest.approx(REF["summary"]["sd_log"], abs=1e-12)


def test_editing_one_well_changes_that_experiment_only():
    ed = REF["edited"]
    rows = [list(r) for r in REF["rows"]]
    rows[ed["row"]][ed["sub"]] = ed["value"]
    e = run(rows=rows)["experiments"]
    assert e["fits"][0]["log_value"] == pytest.approx(REF["experiments"][0]["log_ic50"], abs=1e-6)
    # the 5.0 well flattens the optimum: the two optimizers agree to 1e-5
    assert e["fits"][2]["log_value"] == pytest.approx(ed["experiment_3"]["log_ic50"], abs=2e-5)
    assert sig(e["fits"][2]["value"]) == sig(ed["experiment_3"]["ic50"]) == 9.536e-8
    s = e["summary"]
    assert s["p_mean"] == pytest.approx(ed["summary"]["p_mean"], abs=1e-5)
    assert s["p_ci95"] == pytest.approx(ed["summary"]["p_ci95"], abs=1e-5)
    assert [sig(s["p_mean"])] + [sig(v) for v in s["p_ci95"]] == [7.12, 6.634, 7.606]
