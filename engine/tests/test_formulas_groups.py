"""Group-wise, running and conditional formula functions (formulas.py).
Expected values worked by hand from the definitions in the module
docstring."""

import math

import pytest

from opendose import api, formulas as f

COLS = {"Group": ["a", "a", "b", "b", "a", None],
        "Y": [1.0, 3.0, 10.0, None, 5.0, 7.0],
        "Time": [0, 1, 0, 1, 2, 0]}


def calc(expr, cols=COLS):
    return f.calculate_variables(cols, [{"name": "r", "formula": expr}])["columns"]["r"]


def test_group_statistics():
    assert calc("GROUPMEAN(Y, Group)") == [3.0, 3.0, 10.0, None, 3.0, None]
    assert calc("GROUPSUM(Y, Group)") == [9.0, 9.0, 10.0, None, 9.0, None]
    # count fills every row of the group (non-blank values counted)
    assert calc("GROUPCOUNT(Y, Group)") == [3.0, 3.0, 1.0, 1.0, 3.0, None]
    assert calc("GROUPSTDEV(Y, Group)")[0] == pytest.approx(2.0)
    assert calc("GROUPSTDERR(Y, Group)")[0] == pytest.approx(2.0 / math.sqrt(3))
    assert calc("GROUPMEDIAN(Y, Group)")[:3] == [3.0, 3.0, 10.0]
    assert calc("GROUPMIN(Y, Group)")[0] == 1.0 and calc("GROUPMAX(Y, Group)")[0] == 5.0


def test_percent_of_group_total_and_baseline():
    pct = calc("100 * Y / GROUPSUM(Y, Group)")
    assert pct[:3] == pytest.approx([100 / 9, 300 / 9, 100.0])
    # baseline per subject: the first value in row order, on every row
    assert calc("GROUPFIRST(Y, Group)") == [1.0, 1.0, 10.0, 10.0, 1.0, None]
    assert calc("Y - GROUPFIRST(Y, Group)")[:3] == [0.0, 2.0, 0.0]


def test_running_statistics():
    assert calc("CUMSUM(Y)") == [1.0, 4.0, 14.0, None, 19.0, 26.0]
    assert calc("CUMSUM(Y, Group)") == [1.0, 4.0, 10.0, None, 9.0, None]
    # the mean of the last 2 non-blank values
    assert calc("MOVAVG(Y, 2)") == [1.0, 2.0, 6.5, None, 7.5, 6.0]
    with pytest.raises(f.FormulaError, match="whole number"):
        calc("MOVAVG(Y, 1.5)")


def test_rank_and_zscore():
    assert calc("RANK(Y)") == [1.0, 2.0, 5.0, None, 3.0, 4.0]
    assert calc("RANK(Y, Group)") == [1.0, 2.0, 1.0, None, 3.0, None]
    ties = calc("RANK(Y)", {"Y": [2.0, 1.0, 2.0]})
    assert ties == [2.5, 1.0, 2.5]
    z = calc("ZSCORE(Y)")
    vals = [1.0, 3.0, 10.0, 5.0, 7.0]
    m = sum(vals) / 5
    sd = math.sqrt(sum((v - m) ** 2 for v in vals) / 4)
    assert z[0] == pytest.approx((1 - m) / sd) and z[3] is None


def test_conditional_aggregates():
    assert calc('MEANIF(Y, Group = "a")')[0] == 3.0
    assert calc('MEANIF(Y, Group = "A")')[0] == 3.0       # text: case-insensitive
    assert calc("SUMIF(Y, Time = 0)")[0] == 18.0
    assert calc("COUNTIF(Y > 2)") == [4.0, 4.0, 4.0, None, 4.0, 4.0]
    assert calc('MEANIF(Y, Group = "zzz")')[0] is None     # no rows: blank


def test_numeric_groups_and_validation():
    cols = {"Subject": [1, 1, 2, 2], "V": [5.0, 7.0, 2.0, 4.0]}
    assert calc("V - GROUPFIRST(V, Subject)", cols) == [0.0, 2.0, 0.0, 2.0]
    out = api.analyze({"analysis": "formula_transform", "data": {},
                       "options": {"mode": "validate", "formula": "GROUPMEAN(Y)"}})
    assert not out["ok"]
    assert "GROUPMEAN" in f.FUNCTION_NAMES and "MEANIF" in f.FUNCTION_NAMES
