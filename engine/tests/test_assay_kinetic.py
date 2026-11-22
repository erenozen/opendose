"""Kinetic plate reads (assay_kinetic).

Slopes, windows and the steepest stretch are checked by hand; the blank
subtraction and the Beer-Lambert conversion by arithmetic; and the rates
of simulated Michaelis-Menten wells, fitted with the engine's
Michaelis-Menten model, recover the Km and Vmax they were made with."""

import numpy as np
import pytest

from opendose import api, assay_kinetic as ak, nlfit

T = list(range(10))


def _ds(name, *traces):
    return {"name": name, "ys": [list(r) for r in zip(*traces)]}


def _r2(t, y):
    return float(np.corrcoef(t, y)[0, 1] ** 2)


def test_auto_takes_the_longest_initial_stretch_with_r2_above_threshold():
    # linear at 2 per read up to read 5, then flat at 10
    y = [0, 2, 4, 6, 8, 10, 10, 10, 10, 10]
    res = ak.kinetic_rates(T, [_ds("S", y)], method="auto")
    w = res["wells"][0]
    m = w["n_points"]
    assert _r2(T[:m], y[:m]) >= 0.99 > _r2(T[:m + 1], y[:m + 1])
    assert w["window"] == [0, T[m - 1]]
    assert w["rate"] == pytest.approx(np.polyfit(T[:m], y[:m], 1)[0])
    assert not w["flags"]
    # a perfectly linear trace uses every read
    lin = ak.kinetic_rates(T, [_ds("S", [0.1 + 0.05 * t for t in T])], method="auto")["wells"][0]
    assert lin["n_points"] == 10 and lin["rate"] == pytest.approx(0.05)
    assert lin["r_squared"] == pytest.approx(1.0)


def test_fixed_window_by_hand():
    y = [1, 3, 5, 9, 15, 20, 22, 23, 23, 23]
    res = ak.kinetic_rates(T, [_ds("S", y)], method="window", window=[1, 3])
    w = res["wells"][0]
    # reads at 1, 2, 3: 3, 5, 9 -> slope = sum((t-2)(y-17/3)) / 2 = 3
    assert w["rate"] == pytest.approx(3.0)
    assert w["window"] == [1, 3] and w["n_points"] == 3


def test_steepest_stretch_by_hand():
    y = [0, 0, 1, 3, 5, 6, 6]
    res = ak.kinetic_rates(T[:7], [_ds("S", y)], method="steepest", k=3)
    w = res["wells"][0]
    # slopes of the 3-read windows: 0.5, 1.5, 2, 1.5, 0.5 -> reads 2 to 4
    assert w["rate"] == pytest.approx(2.0)
    assert w["window"] == [2, 4]


def test_blank_subtraction_and_beer_lambert_conversion():
    blank = [0.05 + 0.001 * t for t in T]
    samp = [0.05 + 0.011 * t for t in T]
    res = ak.kinetic_rates(T, [_ds("No enzyme", blank, blank), _ds("Enzyme", samp)],
                           blank_index=0, factor=6.22)
    assert res["blank_rate"] == pytest.approx(0.001) and res["blank"] == "No enzyme"
    e = next(w for w in res["wells"] if w["sample"] == "Enzyme")
    assert e["rate_corrected"] == pytest.approx(0.010)
    assert e["velocity"] == pytest.approx(0.010 / 6.22)
    assert all(w["is_blank"] for w in res["wells"] if w["sample"] == "No enzyme")


def test_decreasing_signal_gives_positive_velocity():
    # NADH oxidation: A340 falls
    y = [1.0 - 0.02 * t for t in T]
    res = ak.kinetic_rates(T, [_ds("S", y)])
    w = res["wells"][0]
    assert w["rate"] == pytest.approx(-0.02)
    assert w["velocity"] == pytest.approx(0.02)
    assert res["direction"] == "decreasing"


def test_flags_no_linear_phase_and_saturation():
    rng = np.random.default_rng(3)
    noisy = list(rng.normal(1.0, 0.2, 10))
    sat = [0.5 + 0.4 * t for t in T]
    res = ak.kinetic_rates(T, [_ds("Noise", noisy), _ds("Bright", sat)], method="auto",
                           saturation=3.5)
    by = {w["sample"]: w for w in res["wells"]}
    assert "no_linear_phase" in by["Noise"]["flags"]
    assert by["Noise"]["n_points"] == 3
    assert "saturated" in by["Bright"]["flags"]
    assert any("R² ≥ 0.99" in w for w in res["warnings"])
    assert any("saturation" in w for w in res["warnings"])


def test_blank_wells_use_every_read_and_steepest_is_the_default():
    rng = np.random.default_rng(5)
    drift = [[0.05 + 0.0005 * t + rng.normal(0, 0.002) for t in T] for _ in range(2)]
    samp = [0.05 + 0.02 * t for t in T]
    res = ak.kinetic_rates(T, [_ds("No enzyme", *drift), _ds("E", samp)], blank_index=0)
    assert res["method"] == "steepest" and res["k"] == 5
    for w in res["wells"]:
        if w["is_blank"]:
            assert w["n_points"] == 10 and w["window"] == [0, 9]
            assert w["rate"] == pytest.approx(np.polyfit(T, w["signal"], 1)[0])
    e = next(w for w in res["wells"] if not w["is_blank"])
    assert e["n_points"] == 5


def test_steepest_recovers_initial_rates_where_r2_rule_underestimates():
    # a progress curve strongly bent by substrate depletion (a quarter of
    # the product limit reached in 10 min): true initial rate v. The
    # 5-read steepest slope is 6.4% low, the R² >= 0.99 rule 27% low.
    v, amax = 0.06, 0.9
    t = [0.5 * i for i in range(21)]
    y = [0.05 + amax * (1 - np.exp(-v * ti / amax)) for ti in t]
    steep = ak.kinetic_rates(t, [_ds("S", y)])["wells"][0]["rate"]
    auto = ak.kinetic_rates(t, [_ds("S", y)], method="auto")["wells"][0]["rate"]
    assert steep == pytest.approx(v, rel=0.07)
    assert auto < 0.8 * v          # R² >= 0.99 accepts the bent curve
    assert abs(steep - v) < abs(auto - v) / 3


def test_michaelis_menten_from_the_rates_recovers_km_and_vmax():
    km, vmax = 50.0, 0.2
    subs = [5, 10, 25, 50, 100, 200, 400]
    rng = np.random.default_rng(11)
    ds = []
    for s in subs:
        v = vmax * s / (km + s)
        traces = [[0.1 + v * t * (1 + rng.normal(0, 0.02)) for t in T] for _ in range(3)]
        ds.append(_ds(str(s), *traces))
    res = ak.kinetic_rates(T, ds)
    assert res["michaelis_menten_ready"]
    xs, ys = [], []
    for s in res["samples"]:
        assert s["substrate"] == float(s["sample"])
        xs += [s["substrate"]] * len(s["velocities"])
        ys += s["velocities"]
    fit = nlfit.fit_model(xs, ys, "michaelis_menten")
    assert fit["params"]["Km"]["value"] == pytest.approx(km, rel=0.05)
    assert fit["params"]["Vmax"]["value"] == pytest.approx(vmax, rel=0.03)


def test_input_checks():
    with pytest.raises(ValueError, match="unknown method"):
        ak.kinetic_rates(T, [_ds("S", T)], method="x")
    with pytest.raises(ValueError, match="no wells"):
        ak.kinetic_rates(T, [_ds("S", [None] * 10)])
    with pytest.raises(ValueError, match="end after"):
        ak.kinetic_rates(T, [_ds("S", T)], method="window", window=[5, 2])
    with pytest.raises(ValueError, match="conversion factor"):
        ak.kinetic_rates(T, [_ds("S", T)], factor=0)
    with pytest.raises(ValueError, match="blank data set has no rates"):
        ak.kinetic_rates(T, [_ds("S", T), _ds("B", [None] * 10)], blank_index=1)
    few = ak.kinetic_rates(T[:4], [_ds("S", [0, 1, 2, 3])], method="steepest", k=5)
    assert "fewer_reads_than_window" in few["wells"][0]["flags"]


def test_api_route():
    res = api.analyze({"analysis": "kinetic_rates",
                       "data": {"x": T, "datasets": [_ds("S", [0.2 * t for t in T])]},
                       "options": {"method": "auto", "min_r2": 0.99}})
    assert res["wells"][0]["rate"] == pytest.approx(0.2)
