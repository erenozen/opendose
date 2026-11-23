"""Initial values shown and typed (FEATURE-PLAN P-21), against
engine/tests/reference/initial_values.py (the rules computed by hand,
and scipy least_squares from the rule start and from LogIC50 = -5)."""

import json
import math
from pathlib import Path

import numpy as np
import pytest

from opendose import api, equations, nlfit

HERE = Path(__file__).resolve().parent
REF = json.loads((HERE / "reference" / "initial_values.json").read_text())

CONC = [1e-9, 3.162e-9, 1e-8, 3.162e-8, 1e-7, 3.162e-7, 1e-6, 3.162e-6, 1e-5]
ROWS = [[98.2, 101.5, 99.1], [97.0, 95.8, 99.9], [93.4, 90.1, 92.7],
        [78.9, 82.3, 80.0], [51.2, 48.7, 50.9], [22.1, 25.6, 24.0],
        [8.9, 10.2, 7.5], [3.1, 4.4, 2.2], [1.0, 0.5, 2.1]]
MODEL = "log_inhibitor_vs_response_4pl"


def _fit(model=MODEL, **options):
    r = api.analyze({"analysis": "dose_response",
                     "data": {"x": CONC, "datasets": [{"name": "Drug A",
                                                       "ys": ROWS}]},
                     "options": {"model": model, "x_is_log": False,
                                 **options}})
    return r["datasets"][0]


def test_example_4pl_reports_the_rule_starts():
    fit = _fit()["fit"]
    iv = fit["initial_values"]
    want = REF["rule_start"]["start"]
    assert list(iv) == ["Top", "Bottom", "LogIC50", "HillSlope"]
    for name, v in want.items():
        assert iv[name] == {"value": pytest.approx(v, abs=1e-12),
                            "source": "rule"}, name
    # each rule by hand: YMAX, YMIN, X nearest the mid response, -1
    assert iv["Top"]["value"] == 101.5
    assert iv["Bottom"]["value"] == 0.5
    assert iv["LogIC50"]["value"] == pytest.approx(math.log10(1e-7))
    assert iv["HillSlope"]["value"] == -1.0
    assert fit["starts"] == {"n": 10, "seeded": "LogIC50",
                             "restarted": False}


def test_typed_start_converges_to_the_same_estimates():
    auto = _fit()["fit"]["params"]
    ds = _fit(initial_values={"LogIC50": -5})
    fit = ds["fit"]
    assert fit["initial_values"]["LogIC50"] == {"value": -5.0,
                                                "source": "typed"}
    assert fit["initial_values"]["Top"]["source"] == "rule"
    assert fit["starts"]["n"] == 1 and fit["starts"]["seeded"] is None
    ref = REF["typed_logic50"]["params"]
    for name, r in ref.items():
        assert fit["params"][name]["value"] == pytest.approx(
            r["value"], rel=1e-7), name
        assert fit["params"][name]["se"] == pytest.approx(r["se"],
                                                          rel=1e-4), name
        assert fit["params"][name]["value"] == pytest.approx(
            auto[name]["value"], rel=1e-7), name
    # the plan's check against R nls: the same least-squares point
    assert fit["goodness"]["ss_res"] == pytest.approx(
        REF["typed_logic50"]["ss_res"], rel=1e-9)


def test_every_start_can_be_typed():
    fit = _fit(initial_values={"Top": 90, "Bottom": 5, "LogIC50": -8,
                               "HillSlope": -2})["fit"]
    assert {k: v["source"] for k, v in fit["initial_values"].items()} == {
        "Top": "typed", "Bottom": "typed", "LogIC50": "typed",
        "HillSlope": "typed"}
    assert fit["params"]["LogIC50"]["value"] == pytest.approx(
        REF["rule_start"]["params"]["LogIC50"]["value"], rel=1e-7)


def test_held_constant_parameters_have_no_start():
    fit = _fit(constraints={"Top": 100})["fit"]
    assert "Top" not in fit["initial_values"]
    ds = _fit(constraints={"Top": 100}, initial_values={"Top": 90})
    assert ds["error"] == ("Top is held constant, so it has no initial "
                           "value: clear one of the two")


@pytest.mark.parametrize("bad,message", [
    ({"Kd": 1}, "unknown parameter"),
    ({"LogIC50": float("inf")}, "must be a finite number"),
])
def test_bad_starts_say_what_to_fix(bad, message):
    assert message in _fit(initial_values=bad)["error"]


def test_blank_starts_are_automatic():
    fit = _fit(initial_values={"LogIC50": None})["fit"]
    assert fit["initial_values"]["LogIC50"]["source"] == "rule"
    assert fit["starts"]["n"] == 10


def test_start_outside_a_range_is_moved_inside():
    fit = _fit(initial_values={"Bottom": -50},
               bounds={"Bottom": [0, None]})["fit"]
    assert fit["initial_values"]["Bottom"]["value"] == -50.0
    assert fit["params"]["Bottom"]["value"] >= 0


@pytest.mark.parametrize("model", ["weibull1", "agonist_vs_response",
                                   "one_site_total", "exponential_plateau"])
def test_rule_values_equal_the_model_rules(model):
    """The reported starts are exactly what the registered rules give."""
    spec = nlfit.MODELS[model]
    x = np.geomspace(0.1, 100, 8)
    y = 10 + 80 * x / (5 + x)
    fit = nlfit.fit_model(list(x), list(y), model)
    rules = spec.initials(x, y)
    for name, v in fit["initial_values"].items():
        assert v == {"value": pytest.approx(rules[name]), "source": "rule"}


def test_weibull_rules_are_documented_ones():
    x = np.array([0, 0, 1, 1, 10, 10, 100, 100], float)
    y = np.array([9, 8, 7, 7.4, 3, 3.2, 1, 1.2])
    s = equations.DataStats(x, y)
    fit = nlfit.fit_model(list(x), list(y), "weibull1")
    iv = {k: v["value"] for k, v in fit["initial_values"].items()}
    assert iv == {"b": 1.0, "c": 1.0, "d": 9.0,
                  "e": pytest.approx(s.x_at_ymid)}


def test_robust_and_rout_report_their_starts():
    rob = _fit(fit_method="robust", initial_values={"LogIC50": -5})["fit"]
    assert rob["initial_values"]["LogIC50"] == {"value": -5.0,
                                                "source": "typed"}
    rout = _fit(rout_q=0.01)["fit"]
    assert rout["initial_values"]["HillSlope"]["source"] == "rule"
