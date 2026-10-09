"""Fail loudly (need fail-loudly): every column-like handler fed a blank
(None) or a NaN value either reports it in a "warnings" list or carries
an n-used count that shows the value was left out; nothing changes n
silently and NaN never poisons a result."""

import math

import pytest

from opendose.api import analyze

NAN = float("nan")


def _cols(*groups):
    return {"datasets": [{"name": chr(65 + i), "ys": [[v] for v in g]}
                         for i, g in enumerate(groups)]}


A = [3.1, 4.2, None, 4.4, 3.9, 4.0]
B = [5.5, 6.1, 4.9, NAN, 6.8, 6.0]
C = [7.2, 6.4, 8.1, 7.7, 6.9, 7.4]


def _finite_numbers(obj):
    """No NaN anywhere in a result (NaN would mean a poisoned value)."""
    if isinstance(obj, float):
        assert not math.isnan(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            _finite_numbers(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _finite_numbers(v)


def _has_nan_warning(r):
    return any("NaN" in w for w in r.get("warnings", []))


def test_ttest_unpaired():
    r = analyze({"analysis": "ttest", "data": _cols(A, B)})
    assert (r["n_a"], r["n_b"]) == (5, 5)
    assert _has_nan_warning(r)
    _finite_numbers(r)


def test_ttest_paired():
    r = analyze({"analysis": "ttest", "data": _cols(A, B),
                 "options": {"kind": "paired"}})
    assert r["n_pairs"] == 4 and r["incomplete_pairs"] == [2, 3]
    assert any("incomplete pairs" in w for w in r["warnings"])


@pytest.mark.parametrize("kind", ["parametric", "nonparametric"])
def test_anova_and_kruskal(kind):
    r = analyze({"analysis": "anova", "data": _cols(A, B, C),
                 "options": {"kind": kind}})
    assert [g["n"] for g in r["group_summaries"]] == [5, 5, 6]
    assert _has_nan_warning(r)
    _finite_numbers({k: v for k, v in r.items() if k != "bartlett"})


def test_column_statistics():
    r = analyze({"analysis": "column_statistics", "data": _cols(A, B)})
    assert [d["descriptive"]["n"] for d in r["datasets"]] == [5, 5]
    assert _has_nan_warning(r)
    assert not math.isnan(r["datasets"][1]["descriptive"]["mean"])


def test_correlation():
    r = analyze({"analysis": "correlation", "data": _cols(A, B)})
    assert r["n"] == 4 and r["incomplete_pairs"] == [2, 3]
    assert r["warnings"]


def test_two_way_anova():
    data = {"datasets": [
        {"name": "A", "ys": [[1.0, 2.0, None], [3.0, 4.0, 5.0]]},
        {"name": "B", "ys": [[2.0, 3.0, 4.0], [5.0, NAN, 7.0]]}]}
    r = analyze({"analysis": "two_way_anova", "data": data})
    assert "error" not in r, r.get("error")
    assert r["n"] == 10
    assert _has_nan_warning(r)
    assert not math.isnan(r["ss_total"])


def test_rm_anova():
    r = analyze({"analysis": "rm_anova", "data": _cols(A, B, C)})
    assert r["n_subjects"] == 4
    assert r["incomplete_subjects"] == [2, 3]
    assert r["warnings"]


def test_survival():
    data = {"datasets": [
        {"name": "A", "ys": [[1, 1], [2, 0], [3, 1], [4, None], [5, 1]]},
        {"name": "B", "ys": [[2, 1], [NAN, 1], [4, 1], [6, 0], [7, 1]]}]}
    r = analyze({"analysis": "survival", "data": data})
    assert r["curves"]["A"]["n"] == 4 and r["curves"]["B"]["n"] == 4
    assert any("row 4" in w for w in r["warnings"])
    assert any("row 2" in w for w in r["warnings"])


def test_contingency_blank_cell_is_an_explicit_error():
    for blank in (None, NAN):
        r = analyze({"analysis": "contingency",
                     "data": {"table": [[3, blank], [4, 5]]}})
        assert "blank" in r["error"] and "row 1, column 2" in r["error"]


def test_dose_response():
    x = [-9, -8, -7, -6, -5, None]
    data = {"x": x, "datasets": [{"name": "A", "ys": [
        [0, 1], [10, None], [50, NAN], [90, 88], [100, 99], [5, 5]]}]}
    r = analyze({"analysis": "dose_response", "data": data,
                 "options": {"model": "log_agonist_vs_response_4pl"}})
    entry = r["datasets"][0]
    assert entry["fit"]["goodness"]["n_points"] == 8
    assert any("without an X value" in w for w in entry["warnings"])
    assert any("NaN" in w for w in entry["warnings"])
