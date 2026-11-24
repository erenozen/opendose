"""Blinding a table (FEATURE-PLAN P-124) renames its groups and changes
no number. The e2e suite checks the P of web/e2e-fixtures/blind-4groups.json
before, during and after blinding against reference/blind_anova.json
(scipy.stats.f_oneway, written by reference/blind_anova.py); this pins
the engine to the same reference, and shows that the group names (real
or coded) do not enter the computation.
"""

import json
import pathlib

import pytest

from opendose.api import analyze

HERE = pathlib.Path(__file__).resolve().parent
REF = json.loads((HERE / "reference" / "blind_anova.json").read_text())
PROJECT = json.loads((HERE.parents[1] / "web" / "e2e-fixtures" / "blind-4groups.json").read_text())
DATASETS = PROJECT["sheets"][0]["table"]["datasets"]


def run(names):
    data = {"datasets": [{"name": n, "ys": [[float(r[0])] for r in d["rows"]]}
                         for n, d in zip(names, DATASETS)]}
    return analyze({"analysis": "anova", "data": data, "options": {"comparisons": "tukey"}})


def test_engine_anova_matches_scipy_and_ignores_the_names():
    real = run([d["name"] for d in DATASETS])
    coded = run(["A", "B", "C", "D"])
    assert real["table"]["p"] == pytest.approx(REF["P"], rel=1e-9)
    assert real["table"]["F"] == pytest.approx(REF["F"], rel=1e-9)
    assert coded["table"] == real["table"]
    adj = lambda r: [c["p_adjusted"] for c in r["multiple_comparisons"]["comparisons"]]
    assert adj(coded) == adj(real)
