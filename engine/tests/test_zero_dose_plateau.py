"""Per-curve zero-dose plateau (FEATURE-PLAN P-104): with options
zero_dose_plateau {"param": "Top"} each data set's Top is held at the
mean of its own zero-dose wells. Reference: engine/tests/reference/
zero_dose_plateau.py (scipy least_squares on the 4PL with Top fixed per
curve; R drc with a fixed d is not installed). The vehicle wells are
never a point on the curve: they stay in log_x_dropped, now with their
rows."""

import json
from pathlib import Path

import pytest

from opendose import api

HERE = Path(__file__).resolve().parent
REF = json.loads((HERE / "reference" / "zero_dose_plateau.json").read_text())
MODEL = "log_inhibitor_vs_response_4pl"


def _run(sets=None, x=None, **options):
    sets = REF["sets"] if sets is None else sets
    data = {"x": REF["x"] if x is None else x,
            "datasets": [{"name": n, "ys": rows} for n, rows in sets.items()]}
    opts = {"model": MODEL, "x_is_log": False, **options}
    return api.analyze({"analysis": "dose_response", "data": data,
                        "options": opts})


def _by_name(r):
    return {d["name"]: d for d in r["datasets"]}


def test_each_curve_uses_its_own_vehicle_wells():
    r = _by_name(_run(zero_dose_plateau={"param": "Top"}))
    for name, ref in REF["fits"].items():
        ds = r[name]
        zc = ds["zero_dose_constraint"]
        assert zc["param"] == "Top"
        assert zc["value"] == pytest.approx(ref["Top"]["value"], rel=1e-12)
        assert zc["n_values"] == 3 and zc["x_values"] == [0.0]
        fit = ds["fit"]
        top = fit["params"]["Top"]
        assert top["value"] == pytest.approx(ref["Top"]["value"], rel=1e-12)
        assert top["constrained"] is True
        assert fit["goodness"]["df"] == ref["df"]
        assert fit["goodness"]["ss_res"] == pytest.approx(ref["ss_res"],
                                                          rel=1e-6)
        for p in ("Bottom", "LogIC50", "HillSlope"):
            assert fit["params"][p]["value"] == pytest.approx(
                ref[p]["value"], rel=1e-6, abs=1e-7), (name, p)
            assert fit["params"][p]["se"] == pytest.approx(
                ref[p]["se"], rel=2e-3), (name, p)
        # the vehicle stays out of the curve: no dose is made up for it
        assert ds["points"]["x"][0] is None
        assert ds["log_x_dropped"]["rows"] == [0]
        assert ds["log_x_dropped"]["row_x"] == [0.0]
        assert ds["log_x_dropped"]["n_values"] == 3


def test_display_values_pinned():
    """Display precision of the reference, as the e2e step reads them."""
    r = _by_name(_run(zero_dose_plateau={"param": "Top"}))
    a = r["Drug A"]["fit"]["params"]
    b = r["Drug B"]["fit"]["params"]
    assert f"{a['Top']['value']:.4g}" == "100.7"
    assert f"{b['Top']['value']:.4g}" == "86.2"
    assert f"{a['LogIC50']['value']:.4f}" == "-6.5545"
    assert f"{b['LogIC50']['value']:.4f}" == "-5.5750"


def test_without_the_option_nothing_changes():
    free = _by_name(_run())
    for ds in free.values():
        assert "zero_dose_constraint" not in ds
        assert ds["fit"]["params"]["Top"]["constrained"] is False
        assert ds["log_x_dropped"]["rows"] == [0]


def test_replaces_a_shared_constant_range_and_start_of_that_plateau():
    r = _by_name(_run(zero_dose_plateau={"param": "Top"},
                      constraints={"Top": 100.0, "HillSlope": -0.6},
                      bounds={"Top": [90, 110]},
                      initial_values={"Top": 50}))
    for name, ref in REF["fits"].items():
        fit = r[name]["fit"]
        assert fit["params"]["Top"]["value"] == pytest.approx(
            ref["Top"]["value"], rel=1e-12)
        # other held parameters are kept
        assert fit["params"]["HillSlope"]["value"] == -0.6
        assert fit["params"]["HillSlope"]["constrained"] is True


def test_bottom_from_the_vehicle_of_an_agonist():
    sets = {"Up": [[2.0, 3.0, 4.0], [3.1, 2.2, 4.0], [8.0, 9.5, 7.2],
                   [30.0, 33.1, 28.4], [70.5, 66.0, 72.2], [93.0, 90.1, 95.4],
                   [99.0, 101.2, 97.5]]}
    r = _run(sets=sets, model="log_agonist_vs_response_4pl",
             zero_dose_plateau={"param": "Bottom"})
    ds = r["datasets"][0]
    assert ds["fit"]["params"]["Bottom"]["value"] == pytest.approx(3.0)
    assert ds["fit"]["params"]["Bottom"]["constrained"] is True


def test_a_data_set_without_vehicle_wells_is_fitted_and_says_so():
    sets = {"A": REF["sets"]["Drug A"],
            "No vehicle": [[None, None, None]] + REF["sets"]["Drug B"][1:]}
    r = _by_name(_run(sets=sets, zero_dose_plateau={"param": "Top"}))
    assert "zero_dose_constraint" in r["A"]
    nv = r["No vehicle"]
    assert "zero_dose_constraint" not in nv
    assert nv["fit"]["params"]["Top"]["constrained"] is False
    assert any("No values at a zero dose in this data set: its Top" in w
               for w in nv["warnings"])


def test_one_vehicle_well_and_missing_values():
    sets = {"A": [[None, 99.5, None]] + REF["sets"]["Drug A"][1:]}
    ds = _run(sets=sets, zero_dose_plateau={"param": "Top"})["datasets"][0]
    assert ds["zero_dose_constraint"]["value"] == 99.5
    assert ds["zero_dose_constraint"]["n_values"] == 1


def test_all_vehicle_values_equal():
    sets = {"A": [[100.0, 100.0, 100.0]] + REF["sets"]["Drug A"][1:]}
    ds = _run(sets=sets, zero_dose_plateau={"param": "Top"})["datasets"][0]
    assert ds["fit"]["params"]["Top"]["value"] == 100.0
    assert ds["fit"]["status"] == "converged"


def test_logged_x_has_no_zero_dose_wells():
    """With X already log10, X = 0 is 1 M, a real dose: nothing to hold."""
    x = [-10, -9, -8, -7, -6, -5, -4]
    ds = _run(x=x, x_is_log=True, sets={"A": REF["sets"]["Drug A"]},
              zero_dose_plateau={"param": "Top"})["datasets"][0]
    assert "zero_dose_constraint" not in ds
    assert ds["fit"]["params"]["Top"]["constrained"] is False


def test_summary_data_accounting_for_n_use_the_weighted_mean():
    # two vehicle rows of mean / SD / N: 100 (n 2) and 94 (n 4) -> 96
    x = [0, 0, 1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4]
    rows = [[100, 2, 2], [94, 3, 4], [98, 2, 3], [90, 2, 3], [70, 3, 3],
            [32, 3, 3], [11, 2, 3], [6, 1, 3]]
    data = {"x": x, "datasets": [{"name": "S", "ys": rows}]}
    base = {"model": MODEL, "x_is_log": False, "summary_format": "mean_sd_n",
            "zero_dose_plateau": {"param": "Top"}}
    acc = api.analyze({"analysis": "dose_response", "data": data,
                       "options": base})["datasets"][0]
    assert acc["zero_dose_constraint"]["value"] == pytest.approx(96.0)
    assert acc["zero_dose_constraint"]["n_values"] == 6
    means = api.analyze({"analysis": "dose_response", "data": data,
                         "options": {**base, "replicates": "means_only"}}
                        )["datasets"][0]
    assert means["zero_dose_constraint"]["value"] == pytest.approx(97.0)


def test_scaling_y_scales_the_plateau_and_keeps_the_ic50():
    k = 1e6
    scaled = {n: [[None if v is None else v * k for v in row] for row in rows]
              for n, rows in REF["sets"].items()}
    r = _by_name(_run(sets=scaled, zero_dose_plateau={"param": "Top"}))
    for name, ref in REF["fits"].items():
        p = r[name]["fit"]["params"]
        assert p["Top"]["value"] == pytest.approx(ref["Top"]["value"] * k,
                                                  rel=1e-12)
        assert p["LogIC50"]["value"] == pytest.approx(ref["LogIC50"]["value"],
                                                      abs=1e-6)


def test_order_of_data_sets_does_not_matter():
    rev = dict(reversed(list(REF["sets"].items())))
    a = _by_name(_run(zero_dose_plateau={"param": "Top"}))
    b = _by_name(_run(sets=rev, zero_dose_plateau={"param": "Top"}))
    for name in REF["sets"]:
        assert a[name]["fit"]["params"]["LogIC50"]["value"] == pytest.approx(
            b[name]["fit"]["params"]["LogIC50"]["value"], rel=1e-12)


def test_bootstrap_refits_hold_each_curves_own_plateau():
    """The bootstrap refits (P-101) keep the curve's held Top: no CI for it,
    and the other parameters' CIs bracket the held fit's values."""
    r = _by_name(_run(zero_dose_plateau={"param": "Top"}, ci_method="bootstrap",
                      bootstrap={"method": "case", "resamples": 200, "seed": 1}))
    for name, ref in REF["fits"].items():
        fit = r[name]["fit"]
        assert fit["params"]["Top"]["value"] == pytest.approx(ref["Top"]["value"], rel=1e-12)
        boot = fit["bootstrap"]
        assert not boot.get("error"), boot
        assert "Top" not in boot["params"] or boot["params"]["Top"].get("ci95") is None
        lo, hi = boot["params"]["LogIC50"]["ci95"]
        assert lo < ref["LogIC50"]["value"] < hi


def test_bad_parameter_is_a_clear_error():
    r = _run(zero_dose_plateau={"param": "LogIC50"})
    assert "Top or Bottom" in r["error"]
    r = _run(model="log_inhibitor_vs_response_3pl",
             zero_dose_plateau={"param": "HillSlope"})
    assert "error" in r
