"""End-to-end test of the JSON API: the exact payload shape the web app
sends through Pyodide. Also defines the reference dataset used to
validate against a real Prism installation (see docs/prism-validation.md).
"""

import json

import pytest

from prism_engine.api import analyze, analyze_json
from prism_engine.doseresponse import model_curve

# Reference dataset: inhibitor dose-response, triplicates, generated from
# Top=100, Bottom=0, LogIC50=-7, HillSlope=-1 with fixed "noise" so it can
# be typed into Prism verbatim and both tools' outputs compared exactly.
REF_X_MOLAR = [10 ** e for e in [-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5]]
REF_Y = [
    [98.2, 101.5, 99.1],
    [97.0, 95.8, 99.9],
    [93.4, 90.1, 92.7],
    [78.9, 82.3, 80.0],
    [51.2, 48.7, 50.9],
    [22.1, 25.6, 24.0],
    [8.9, 10.2, 7.5],
    [3.1, 4.4, 2.2],
    [1.0, 0.5, 2.1],
]


def payload():
    return {
        "analysis": "dose_response",
        "data": {
            "x": REF_X_MOLAR,
            "datasets": [{"name": "Drug A", "ys": REF_Y}],
        },
        "options": {
            "model": "log_inhibitor_vs_response_4pl",
            "x_is_log": False,   # engine applies X = log10(X) first
            "error_bars": "sd",
        },
    }


def test_full_pipeline():
    result = analyze(payload())
    assert "error" not in result
    ds = result["datasets"][0]
    fit = ds["fit"]
    p = fit["params"]
    # Generating parameters should be recovered within noise.
    assert p["LogIC50"]["value"] == pytest.approx(-7.0, abs=0.05)
    assert p["Top"]["value"] == pytest.approx(100.0, abs=3.0)
    assert p["Bottom"]["value"] == pytest.approx(0.0, abs=3.0)
    assert p["HillSlope"]["value"] == pytest.approx(-1.0, abs=0.15)
    assert fit["goodness"]["n_points"] == 27
    assert fit["goodness"]["df"] == 23
    assert fit["goodness"]["r_squared"] > 0.99
    # Curve is provided for plotting and spans the data.
    assert len(fit["curve"]["x"]) == 200
    # Error bars computed per row.
    assert len(ds["points"]["bars"]) == 9
    assert ds["points"]["bars"][0]["n"] == 3


def test_json_roundtrip():
    out = json.loads(analyze_json(json.dumps(payload())))
    assert "error" not in out
    assert out["datasets"][0]["fit"]["params"]["IC50"]["value"] > 0


def test_dataset_error_isolated():
    p = payload()
    p["data"]["datasets"].append({"name": "Empty", "ys": [[None]] * 9})
    result = analyze(p)
    assert "fit" in result["datasets"][0]
    assert "error" in result["datasets"][1]


def test_unknown_analysis():
    assert "error" in analyze({"analysis": "nope", "data": {}})
