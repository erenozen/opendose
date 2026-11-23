"""An EC50-shift (Gaddum/Schild) fit with a single antagonist
concentration and the Schild slope free used to stop with the raw
"(34, 'Numerical result out of range')": one dose ratio fits any slope
with a matching pA2, so the fit ran off to an overflow. It now says why
and what to do; with the slope fixed at 1 the same data fit (the
example of engine/tests/reference/schild_plot.py)."""

import json
import math
import os

import pytest

from opendose import api

EX = json.load(open(os.path.join(os.path.dirname(__file__), "reference",
                                 "schild_example.json")))["data"]


def _run(curves, constraints=None):
    data = {"x": EX["x"], "datasets": [{"name": EX["names"][i],
                                        "ys": EX["ys"][i]} for i in curves]}
    return api.analyze({"analysis": "ec50_shift", "data": data,
                        "options": {"antagonist": [EX["antagonist"][i]
                                                   for i in curves],
                                    "constraints": constraints or {}}})


@pytest.mark.parametrize("curves", [(0, 1), (0, 2), (0, 5), (0, 3, 0)])
def test_one_antagonist_with_free_slope_says_why(curves):
    r = _run(curves)
    assert r["error"].startswith("One antagonist concentration cannot "
                                 "define a free Schild slope")
    assert "Fix the Schild slope at 1" in r["error"]
    assert "Numerical result" not in r["error"]


def test_one_antagonist_with_slope_fixed_at_one_fits():
    r = _run((0, 2), {"SchildSlope": 1})
    assert "error" not in r
    assert math.isfinite(r["fitted_values"]["pA2"])
    # the simulated truth is pA2 = 7.5
    assert r["fitted_values"]["pA2"] == pytest.approx(7.5, abs=0.15)


def test_two_antagonist_concentrations_fit_a_free_slope():
    r = _run((0, 2, 4))
    assert "error" not in r
    assert math.isfinite(r["fitted_values"]["SchildSlope"])
