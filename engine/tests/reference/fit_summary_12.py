"""Twelve compounds, one 4PL fit each, for the fit summary (FEATURE-PLAN
P-17): the web unit test (web/src/sheets/xy/__tests__/fitSummary.test.ts)
reads the engine's result on this table, and the e2e suite opens the same
table as a project (web/e2e-fixtures/fit-summary-12.json; the stage
harness's copy is web/e2e-fixtures/stage/fit-summary.json).

The data are simulated (seeded): Y = 5 + 95 / (1 + 10^((log10 X - log10
IC50) h)) plus N(0, 2.5) noise (h from 0.8 to 1.3), duplicates at ten
concentrations (µM).
Compound L's true IC50 (60 µM) lies above the top dose (30 µM): its curve
never reaches the bottom plateau, so its fit is flagged (rangeflags.py:
IC50 reported as "> 30", the bottom plateau not defined by the data).

No reference value is pinned from this script: it only makes the inputs.
Run from the repository root:
    PYTHONPATH=engine python engine/tests/reference/fit_summary_12.py
"""

from __future__ import annotations

import json
import pathlib

import numpy as np

from opendose import api

ROOT = pathlib.Path(__file__).resolve().parents[3]
X = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30]
IC50 = [0.004, 0.009, 0.02, 0.05, 0.08, 0.15, 0.3, 0.6, 1.2, 2.5, 6.0, 60.0]
HILL = [1.0, 0.9, 1.2, 1.1, 0.8, 1.0, 1.3, 1.0, 0.9, 1.1, 1.0, 1.0]
NAMES = [f"Compound {chr(65 + i)}" for i in range(12)]


def table() -> dict:
    rng = np.random.default_rng(17)
    lx = np.log10(X)
    sets = []
    for name, ic, h in zip(NAMES, IC50, HILL):
        y = 5 + 95 / (1 + 10 ** ((lx - np.log10(ic)) * h))
        rows = [[f"{v + rng.normal(0, 2.5):.1f}" for _ in range(2)] for v in y]
        sets.append({"name": name, "rows": rows})
    return {"type": "xy", "x": [f"{v:g}" for v in X], "xTitle": "[Compound] (µM)",
            "xFormat": "numbers", "xUnit": "µM", "yTitle": "Response (%)",
            "rowTitles": [""] * len(X), "datasets": sets,
            "subcolumnFormat": "replicates", "replicateLayout": "side_by_side"}


def engine_result(t: dict) -> dict:
    data = {"x": [float(v) for v in t["x"]],
            "datasets": [{"name": d["name"],
                          "ys": [[float(v) for v in r] for r in d["rows"]]}
                         for d in t["datasets"]]}
    return api.analyze({"analysis": "dose_response", "data": data,
                        "options": {"model": "log_inhibitor_vs_response_4pl",
                                    "x_is_log": False, "error_bars": "sd",
                                    "ci_method": "asymptotic"}})


def project(t: dict) -> dict:
    return {
        "opendose_project": 2, "version": 2, "title": "Twelve compounds",
        "prefs": {"defaultTableType": "xy", "errorBars": "sd",
                  "ciMethod": "asymptotic", "scheme": "default", "digits": 4},
        "selected": "r1",
        "sheets": [
            {"id": "d1", "kind": "data", "name": "Twelve compounds", "table": t},
            {"id": "r1", "kind": "results", "parentId": "d1", "analysis": "nonlin",
             "name": "Nonlin fit of Twelve compounds",
             "options": {"autoFit": "requested"}},
            {"id": "g1", "kind": "graph", "parentId": "d1", "resultsId": "r1",
             "graphType": "xy", "name": "Graph of Twelve compounds",
             "settings": {"titles": {"x": "", "y": ""}, "scheme": "default"}},
        ],
    }


def main() -> None:
    t = table()
    res = json.loads(json.dumps(engine_result(t), default=float))
    # the summary reads the fits only: the drawn curves, points and
    # residual plots stay out of the fixture
    for d in res["datasets"]:
        for key in ("points", "residual_check"):
            d.pop(key, None)
        d["fit"].pop("curve", None)
    out = ROOT / "web/src/sheets/xy/__tests__/fitSummary.fixture.json"
    out.write_text(json.dumps({"table": t, "result": res}) + "\n")
    for path in ("web/e2e-fixtures/fit-summary-12.json",
                 "web/e2e-fixtures/stage/fit-summary.json"):
        (ROOT / path).write_text(
            json.dumps(project(t), indent=1, ensure_ascii=False) + "\n")
    for d in res["datasets"]:
        f = d["fit"]
        print(d["name"], f["status"], f["params"]["IC50"]["value"],
              (f.get("range_flags") or {}).get("report_as"))


if __name__ == "__main__":
    main()
