"""Run on many files (FEATURE-PLAN P-78) runs the engine's ordinary
dose-response fit once per file; no engine code is new. This pins the
IC50 the engine gives each of the four plate files the e2e suite runs
(web/e2e-fixtures/batch/) against an independent scipy curve_fit of the
same model (reference/batch_ic50.py, which also wrote the files), at the
4 significant digits the results print.
"""

import csv
import json
import pathlib

import pytest

from opendose.api import analyze

HERE = pathlib.Path(__file__).resolve().parent
FIX = HERE.parents[1] / "web" / "e2e-fixtures" / "batch"
REF = json.loads((HERE / "reference" / "batch_ic50.json").read_text())


def read(name: str) -> tuple[list[float], list[list[float]]]:
    with open(FIX / f"{name}.csv", newline="") as f:
        rows = list(csv.reader(f))[1:]
    return [float(r[0]) for r in rows], [[float(v) for v in r[1:]] for r in rows]


@pytest.mark.parametrize("name", sorted(REF))
def test_engine_ic50_matches_scipy(name):
    x, ys = read(name)
    assert ys == REF[name]["rows"]
    res = analyze({
        "analysis": "dose_response",
        "data": {"x": x, "datasets": [{"name": "Cell line 1", "ys": ys}]},
        "options": {"model": "log_inhibitor_vs_response_4pl", "x_is_log": False, "error_bars": "sd"},
    })
    p = res["datasets"][0]["fit"]["params"]
    assert p["LogIC50"]["value"] == pytest.approx(REF[name]["LogIC50"], abs=1e-5)
    assert f"{p['IC50']['value']:.4g}" == REF[name]["IC50_4sig"]
    assert p["HillSlope"]["value"] == pytest.approx(REF[name]["HillSlope"], rel=1e-3)
