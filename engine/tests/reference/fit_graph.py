"""Reference fits for the curve-fit graph features (P-23 drop lines,
P-24 legend): engine output the web unit tests read, and the response of
each model's own equation at its IC50 / EC50 (the y of a drop line).

Regenerate from the repository root:

    PYTHONPATH=engine .venv/bin/python engine/tests/reference/fit_graph.py

It writes engine/tests/reference/fit_graph.json and
web/src/sheets/xy/__tests__/fitGraph.fixtures.json (the same content).
The y values are the model function (equations.py / nlfit.py) evaluated
at the reported midpoint: an independent check of the half-way rule
the web reads from the range flags.
"""

from __future__ import annotations

import json
import os

from opendose import api, nlfit

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

# The example table (web/src/sheets/xy/sample.ts = test_api.py REF_Y).
X = [1e-9, 3.162e-9, 1e-8, 3.162e-8, 1e-7, 3.162e-7, 1e-6, 3.162e-6, 1e-5]
Y = [[98.2, 101.5, 99.1], [97.0, 95.8, 99.9], [93.4, 90.1, 92.7],
     [78.9, 82.3, 80.0], [51.2, 48.7, 50.9], [22.1, 25.6, 24.0],
     [8.9, 10.2, 7.5], [3.1, 4.4, 2.2], [1.0, 0.5, 2.1]]
# The example with one wild value at 1e-7 M (51.2 -> 30.0): ROUT Q = 1%
# removes it.
Y_OUT = [row[:] for row in Y]
Y_OUT[4] = [30.0, 48.7, 50.9]
# Only the top of the curve: the IC50 lies above the highest dose.
X_TOP = X[:4]
Y_TOP = Y[:4]


def fit(x, y, options, name="Drug A"):
    return api.analyze({
        "analysis": "dose_response",
        "data": {"x": x, "datasets": [{"name": name, "ys": y}]},
        "options": {"x_is_log": False, **options},
    })


def curve_at(model, params, x):
    """The model's own equation at x, from the fitted parameters."""
    spec = nlfit.MODELS[model]
    p = {k: v["value"] for k, v in params.items()}
    if "LogXmid" in spec.params:        # legacy 4PL / 3PL: LogIC50 / LogEC50
        p["LogXmid"] = p.get("LogIC50", p.get("LogEC50"))
    return float(spec.func([x], p)[0])


def main():
    cases = {
        "relative_4pl": fit(X, Y, {"model": "log_inhibitor_vs_response_4pl"}),
        "absolute_log": fit(X, Y, {"model": "absolute_ic50_log",
                                   "constraints": {"Baseline": 0.0}}),
        "extrapolated": fit(X_TOP, Y_TOP, {"model": "log_inhibitor_vs_response_4pl"}),
        "legend_4pl": fit(X, Y_OUT, {"model": "log_inhibitor_vs_response_4pl",
                                     "weighting": "1/Y2", "rout_q": 0.01,
                                     "bands": "confidence"}),
    }
    checks = {}
    for key in ("relative_4pl", "legend_4pl"):
        f = cases[key]["datasets"][0]["fit"]
        mid = f["params"]["LogIC50"]["value"]
        checks[key] = {"x": mid, "y_curve": curve_at(f["model"], f["params"], mid),
                       "y_half": f["range_flags"]["half_response"]}
    f = cases["absolute_log"]["datasets"][0]["fit"]
    mid = f["params"]["LogAbsoluteIC50"]["value"]
    checks["absolute_log"] = {
        "x": mid, "y_curve": curve_at(f["model"], f["params"], mid),
        "y_half": (f["params"]["Top"]["value"] + f["params"]["Baseline"]["value"]) / 2}
    # the long curve and band arrays are not read by the tests: keep 3
    for c in cases.values():
        for ds in c["datasets"]:
            for key in ("curve",):
                if key in ds.get("fit", {}):
                    ds["fit"][key] = {k: v[:3] for k, v in ds["fit"][key].items()}
            if ds.get("bands"):
                ds["bands"] = {k: v[:3] for k, v in ds["bands"].items()}
    out = {"cases": cases, "checks": checks}
    text = json.dumps(out, indent=1, sort_keys=True) + "\n"
    for path in (os.path.join(HERE, "fit_graph.json"),
                 os.path.join(ROOT, "web", "src", "sheets", "xy", "__tests__",
                              "fitGraph.fixtures.json")):
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)
    for k, v in checks.items():
        print(k, v)


if __name__ == "__main__":
    main()
