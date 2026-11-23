"""Simulating from a user-defined equation (FEATURE-PLAN P-51). The
validation is identity: the simulated ideal curve equals the compiled
equation evaluated by nlfit (the function a fit of that equation uses)
at every X, and Y = A * exp(-k * X) by hand."""

import math

import numpy as np
import pytest

from opendose import api, nlfit, userequation

DECAY = {"text": "Y = A*exp(-k*X)", "rules": {"A": "1*YMAX", "k": "1"},
         "name": "Decay"}
X = {"kind": "arithmetic", "start": 0, "increment": 0.5, "count": 11}


def _sim(**options):
    r = api.analyze({"analysis": "simulate_xy", "data": {},
                     "options": {"user_equation": DECAY,
                                 "params": {"A": 100, "k": 0.3}, "x": X,
                                 "seed": 7, **options}})
    assert "error" not in r, r.get("error")
    return r


def test_ideal_curve_is_the_compiled_equation():
    r = _sim(error={"kind": "none"}, replicates=2)
    xs = np.array(r["x"], float)
    eq = userequation.from_options(DECAY)
    spec = nlfit.MODELS[eq.register(0)]
    want = spec.func(xs, {"A": 100.0, "k": 0.3})
    ideal = np.array(r["datasets"][0]["ideal"], float)
    assert np.array_equal(ideal, want)               # bit for bit
    assert ideal == pytest.approx([100 * math.exp(-0.3 * x) for x in xs],
                                  rel=1e-15)
    # no error: every replicate is the ideal value
    assert all(row == [v, v] for row, v in zip(r["datasets"][0]["ys"],
                                               r["datasets"][0]["ideal"]))
    assert r["model"] == "user" and r["user_equation"] == "Decay"


def test_scatter_is_seeded_and_centred_on_the_curve():
    a = _sim(error={"kind": "gaussian", "sd": 2}, replicates=200)
    b = _sim(error={"kind": "gaussian", "sd": 2}, replicates=200)
    assert a["datasets"][0]["ys"] == b["datasets"][0]["ys"]
    ys = np.array(a["datasets"][0]["ys"], float)
    ideal = np.array(a["datasets"][0]["ideal"], float)
    resid = ys - ideal[:, None]
    assert abs(resid.mean()) < 0.1 and 1.9 < resid.std(ddof=1) < 2.1


def test_fitting_the_simulation_recovers_the_parameters():
    sim = _sim(error={"kind": "none"})
    fit = api.analyze({"analysis": "dose_response",
                       "data": {"x": sim["x"], "datasets": [
                           {"name": "S", "ys": sim["datasets"][0]["ys"]}]},
                       "options": {"user_equation": DECAY}})
    p = fit["datasets"][0]["fit"]["params"]
    assert p["A"]["value"] == pytest.approx(100, rel=1e-8)
    assert p["k"]["value"] == pytest.approx(0.3, rel=1e-8)


def test_per_data_set_lines_and_values():
    eq = {"text": "<A>Y = A*exp(-k*X)\n<~A>Y = A*exp(-k*X) + C",
          "rules": {"A": "100", "k": "1", "C": "0"}, "name": "Shifted"}
    r = api.analyze({"analysis": "simulate_xy", "data": {},
                     "options": {"user_equation": eq, "n_datasets": 2,
                                 "params": [{"A": 10, "k": 1, "C": 5}, {}],
                                 "x": [0, 1], "error": {"kind": "none"}}})
    a, b = (d["ideal"] for d in r["datasets"])
    assert a == pytest.approx([10, 10 * math.exp(-1)])
    assert b == pytest.approx([15, 10 * math.exp(-1) + 5])


def test_constant_defaults_fill_missing_parameters():
    eq = dict(DECAY, text="Y = A*exp(-k*X) + B", constraints={"B": 3})
    r = api.analyze({"analysis": "simulate_xy", "data": {},
                     "options": {"user_equation": eq,
                                 "params": {"A": 10, "k": 0}, "x": [0, 1],
                                 "error": {"kind": "none"}}})
    assert r["datasets"][0]["ideal"] == pytest.approx([13, 13])


def test_missing_value_and_bad_equation_say_so():
    r = api.analyze({"analysis": "simulate_xy", "data": {},
                     "options": {"user_equation": DECAY, "params": {"A": 1},
                                 "x": [0, 1]}})
    assert r["error"] == "missing parameter value(s) for “Decay”: k"
    r = api.analyze({"analysis": "simulate_xy", "data": {},
                     "options": {"user_equation": {"text": "Y = A*"},
                                 "params": {}, "x": [0, 1]}})
    assert "error" in r and "traceback" in r


def test_monte_carlo_from_a_user_equation():
    r = api.analyze({"analysis": "monte_carlo", "data": {}, "options": {
        "simulation": {"kind": "xy", "user_equation": DECAY,
                       "params": {"A": 100, "k": 0.3}, "x": X,
                       "replicates": 3, "error": {"kind": "gaussian",
                                                  "sd": 2}},
        "analysis": {"analysis": "dose_response",
                     "options": {"user_equation": DECAY}},
        "n_repeats": 40, "seed": 11,
        "tabulate": {"k": "datasets.0.fit.params.k.value",
                     "lo": "datasets.0.fit.params.k.ci95.0",
                     "hi": "datasets.0.fit.params.k.ci95.1"},
        "hit": {"op": "contains", "lower": "lo", "upper": "hi",
                "value": 0.3}}})
    assert r["n_failed"] == 0
    assert r["tabulated"]["k"]["mean"] == pytest.approx(0.3, abs=0.01)
    assert 0.8 <= r["hits"]["fraction"] <= 1.0
