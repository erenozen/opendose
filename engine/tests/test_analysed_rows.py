"""The "Analysed" line of multiple, logistic and Poisson regression and
Cox regression (FEATURE-PLAN P-16): the rows used and each dropped row
with its reason (multivar.analysed_rows).

Reference: engine/tests/reference/analysed_rows.py (statsmodels OLS / GLM
/ PHReg with missing = "drop": nobs and the rows pandas finds missing),
which writes analysed_rows.json.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from opendose import api
from opendose.multivar import analysed_rows

REF = json.loads((Path(__file__).resolve().parent / "reference"
                  / "analysed_rows.json").read_text())
T = REF["table"]


def variables(cols=T, text_row=None, kinds=None):
    out = []
    for name, vals in cols.items():
        vals = list(vals)
        if text_row is not None and name == "Dose":
            vals[text_row - 1] = "n/a"
        v = {"name": name, "values": vals}
        if kinds and name in kinds:
            v["kind"] = kinds[name]
        out.append(v)
    return out


def run(kind, data, options):
    out = api.analyze({"analysis": kind, "data": data, "options": options})
    assert "error" not in out, out.get("error")
    return out


def check(block, ref, *, blank=("Age",)):
    assert block["n_used"] == ref["nobs"]
    assert block["n_rows"] == 30
    assert [d["row"] for d in block["dropped"]] == ref["dropped_rows"]
    for d in block["dropped"]:
        if d["row"] != 27:
            assert d["blank"] == list(blank) and d["not_number"] == []


def test_multiple_regression_acceptance():
    """30 rows, Age blank in 4: Analysed 26 of 30 rows; rows 3, 9, 17, 22."""
    r = run("multiple_regression", {"variables": variables()},
            {"outcome": "Y", "predictors": ["Age", "Dose"]})
    check(r["analysed_rows"], REF["multiple"])
    assert r["n_rows_analyzed"] == 26 and "rows_used" not in r
    assert r["analysed_rows"]["variables"] == ["Y", "Age", "Dose"]


def test_text_in_a_numeric_column_is_named_not_a_number():
    r = run("multiple_regression", {"variables": variables(text_row=27, kinds={"Dose": "continuous"})},
            {"outcome": "Y", "predictors": ["Age", "Dose"]})
    b = r["analysed_rows"]
    check(b, REF["multiple_text"])
    last = b["dropped"][-1]
    assert last == {"row": 27, "blank": [], "not_number": ["Dose"]}


def test_logistic_and_poisson():
    lr = run("logistic_regression", {"variables": variables()},
             {"outcome": "Response", "predictors": ["Age", "Dose"]})
    check(lr["analysed_rows"], REF["logistic"])
    pr = run("poisson_regression", {"variables": variables()},
             {"outcome": "Count", "predictors": ["Age", "Dose"]})
    check(pr["analysed_rows"], REF["poisson"])
    # a model without Age drops nothing
    p2 = run("poisson_regression", {"variables": variables()},
             {"outcome": "Count", "predictors": ["Dose"]})
    assert p2["analysed_rows"]["n_used"] == REF["poisson_dose_only"]["nobs"] == 30
    assert p2["analysed_rows"]["dropped"] == []


def test_cox_both_payloads():
    r = run("cox", {"variables": variables()},
            {"time": "Time", "event": "Event", "covariates": ["Age", "Dose"]})
    check(r["analysed_rows"], REF["cox"])
    assert r["n"] == REF["cox"]["nobs"]
    r2 = run("cox", {"time": T["Time"], "event": T["Event"],
                     "covariates": {"Age": T["Age"], "Dose": T["Dose"]}}, {})
    check(r2["analysed_rows"], REF["cox"])


def test_trailing_blank_rows_are_not_rows():
    vs = [{"name": "Y", "values": [1.0, 2.0, 3.5, 4.1, None, None]},
          {"name": "X", "values": [1.0, None, 3.0, 4.0, None, None]}]
    b = analysed_rows(vs, ["Y", "X"], [0, 2, 3])
    assert b["n_rows"] == 4 and b["n_used"] == 3
    assert b["dropped"] == [{"row": 2, "blank": ["X"], "not_number": []}]


def test_row_with_values_only_in_unused_columns():
    vs = [{"name": "Y", "values": [1.0, None, 3.0]},
          {"name": "X", "values": [1.0, None, 3.0]},
          {"name": "Note", "values": ["a", "b", "c"]}]
    b = analysed_rows(vs, ["Y", "X"], [0, 2])
    assert b["dropped"] == [{"row": 2, "blank": ["Y", "X"], "not_number": []}]


def test_no_complete_rows_is_an_error_not_a_silent_zero():
    vs = [{"name": "Y", "values": [1.0, 2.0]}, {"name": "X", "values": [None, None]}]
    out = api.analyze({"analysis": "multiple_regression", "data": {"variables": vs},
                       "options": {"outcome": "Y", "predictors": ["X"]}})
    assert "no rows with complete data" in out["error"]


def test_row_order_does_not_change_the_count():
    cols = {k: list(reversed(v)) for k, v in T.items()}
    r = run("multiple_regression", {"variables": variables(cols)},
            {"outcome": "Y", "predictors": ["Age", "Dose"]})
    b = r["analysed_rows"]
    assert b["n_used"] == 26
    assert [d["row"] for d in b["dropped"]] == sorted(31 - x for x in REF["multiple"]["dropped_rows"])
