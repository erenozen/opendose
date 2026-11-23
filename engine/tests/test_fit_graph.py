"""The curve-fit graph's IC50 / EC50 drop lines (P-23) read their point
from the fit: (midpoint, (Top + Bottom) / 2) for the relative models the
web lists in sheets/xy/fitGraph.ts RELATIVE_MODELS, and (absolute IC50,
(Top + Baseline) / 2) for the absolute IC50 models. These tests check
that rule against each model's own equation (equations.py, nlfit.py), so
a drop line's y always equals the drawn curve at its x, and pin the
reference fits in reference/fit_graph.json (made by
reference/fit_graph.py)."""

from __future__ import annotations

import json
import math
import os
import re

import numpy as np
import pytest

from opendose import nlfit

HERE = os.path.dirname(os.path.abspath(__file__))
TS = os.path.join(HERE, "..", "..", "web", "src", "sheets", "xy", "fitGraph.ts")


def _ts_set(name):
    src = open(TS, encoding="utf-8").read()
    body = re.search(name + r" = new Set\(\[(.*?)\]\)", src, re.S).group(1)
    return re.findall(r'"([a-z0-9_]+)"', body)


RELATIVE = _ts_set("RELATIVE_MODELS")
ABSOLUTE = _ts_set("ABSOLUTE_MODELS")
MIDPOINTS = ("LogXmid", "LogIC50", "LogEC50", "IC50", "EC50")


def test_lists_name_registered_models():
    assert len(RELATIVE) == 19 and ABSOLUTE == ["absolute_ic50_log", "absolute_ic50"]
    for m in RELATIVE + ABSOLUTE:
        assert m in nlfit.MODELS, m


def _params(spec, rng):
    p = {}
    for name in spec.params:
        if name == "HillSlope":
            p[name] = float(rng.choice([-1, 1]) * rng.uniform(0.5, 2.5))
        elif name == "S":
            p[name] = float(rng.uniform(0.4, 3.0))
        elif name.startswith("Log"):
            p[name] = float(rng.uniform(-9, -5))
        elif name in ("IC50", "EC50", "AbsoluteIC50"):
            p[name] = float(10 ** rng.uniform(-9, -5))
        elif name == "Top":
            p[name] = float(rng.uniform(80, 120))
        elif name == "Bottom":
            p[name] = float(rng.uniform(-10, 20))
        elif name == "Baseline":
            p[name] = float(rng.uniform(-5, 5))
        else:
            raise AssertionError(f"unexpected parameter {name}")
    return p


@pytest.mark.parametrize("model", RELATIVE)
def test_relative_midpoint_is_half_way(model):
    spec = nlfit.MODELS[model]
    mid = next(n for n in MIDPOINTS if n in spec.params)
    rng = np.random.default_rng(23)
    for _ in range(20):
        p = _params(spec, rng)
        top, bottom = p.get("Top", 100.0), p.get("Bottom", 0.0)
        y = float(spec.func([p[mid]], p)[0])
        assert y == pytest.approx((top + bottom) / 2, rel=1e-12, abs=1e-12)


@pytest.mark.parametrize("model", ABSOLUTE)
def test_absolute_ic50_is_where_the_curve_crosses_fifty(model):
    spec = nlfit.MODELS[model]
    mid = "LogAbsoluteIC50" if model.endswith("_log") else "AbsoluteIC50"
    rng = np.random.default_rng(23)
    for _ in range(20):
        p = _params(spec, rng)
        y = float(spec.func([p[mid]], p)[0])
        assert y == pytest.approx((p["Top"] + p["Baseline"]) / 2, rel=1e-12, abs=1e-12)


def test_reference_fits():
    ref = json.load(open(os.path.join(HERE, "reference", "fit_graph.json"),
                         encoding="utf-8"))
    for key, c in ref["checks"].items():
        assert c["y_curve"] == pytest.approx(c["y_half"], rel=1e-12), key
    # the example's 4PL (web e2e-figures pins the same numbers)
    rel = ref["checks"]["relative_4pl"]
    assert rel["x"] == pytest.approx(-6.98304, abs=5e-6)
    assert rel["y_half"] == pytest.approx(50.4181, abs=5e-5)
    ab = ref["checks"]["absolute_log"]
    assert ab["x"] == pytest.approx(-6.97524, abs=5e-6)
    assert ab["y_half"] == pytest.approx(49.9281, abs=5e-5)
    ex = ref["cases"]["extrapolated"]["datasets"][0]["fit"]
    assert ex["range_flags"]["ec50_above_range"] is True
    leg = ref["cases"]["legend_4pl"]["datasets"][0]
    assert leg["rout"]["n_outliers"] == 1
    assert leg["rout"]["outliers"][0]["x"] == pytest.approx(-7.0)
    assert leg["rout"]["outliers"][0]["y"] == pytest.approx(30.0)
    assert not math.isnan(leg["fit"]["params"]["LogIC50"]["value"])
