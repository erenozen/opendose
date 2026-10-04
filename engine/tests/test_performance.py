"""Timing guards for inputs that used to freeze the page.

The live-site validation (docs/validation/results-site.md, "Performance
and robustness probe") found the automatic 4PL fit of a straight line
(NIST NoInt1, X = 60..70) running for ~50 s and Tukey's test after a
9-group one-way ANOVA taking 10-47 s. The targets are natively: the
NoInt1 fit under 2 s (the multistart budget, nlfit.MULTISTART_*), the
SmLs01 ANOVA with Tukey under 0.5 s and 9 x 2001 values under 3 s (the
studentized range of opendose.studentized). The bounds below are five
times those targets so a slow CI machine does not flake.
"""

import csv
import time
from pathlib import Path

import numpy as np
import pytest
from scipy import stats

from opendose import api, studentized

DATA = Path(__file__).resolve().parents[2] / "docs" / "validation" / "datasets"


def _column_table(name):
    with open(DATA / f"{name}.csv") as fh:
        rows = list(csv.reader(fh))
    cols = list(zip(*rows[1:]))
    return {"x": [], "datasets": [
        {"name": h, "ys": [[float(v)] for v in c if v != ""]}
        for h, c in zip(rows[0], cols)]}


def _noint1():
    with open(DATA / "nist-noint1.csv") as fh:
        rows = list(csv.DictReader(fh))
    return {"x": [float(r["x"]) for r in rows],
            "datasets": [{"name": "y", "ys": [[float(r["y"])] for r in rows]}]}


@pytest.mark.parametrize("options", [{}, {"x_is_log": False}])
def test_sigmoid_fit_of_a_straight_line_stops_within_budget(options):
    t0 = time.perf_counter()
    res = api.analyze({"analysis": "dose_response", "data": _noint1(),
                       "options": options})
    elapsed = time.perf_counter() - t0
    assert "error" not in res, res.get("error")
    ds = res["datasets"][0]
    # no sigmoid fits a straight line: reported as not converged (or as
    # an ambiguous fit), never as a confident result
    assert ds.get("error") or ds["fit"]["status"] == "ambiguous"
    assert elapsed < 10.0


def test_line_through_origin_is_instant():
    t0 = time.perf_counter()
    res = api.analyze({"analysis": "dose_response", "data": _noint1(),
                       "options": {"model": "line_through_origin"}})
    assert res["datasets"][0]["fit"]["status"] == "converged"
    assert time.perf_counter() - t0 < 2.5


@pytest.mark.parametrize("name,bound", [("nist-smls01", 2.5),
                                        ("nist-smls03", 15.0),
                                        ("nist-smls09", 15.0)])
def test_one_way_anova_with_tukey_scales(name, bound):
    data = _column_table(name)
    t0 = time.perf_counter()
    res = api.analyze({"analysis": "anova", "data": data,
                       "options": {"kind": "parametric",
                                   "comparisons": "tukey"}})
    elapsed = time.perf_counter() - t0
    assert "error" not in res, res.get("error")
    assert len(res["multiple_comparisons"]["comparisons"]) == 36
    assert elapsed < bound


# --- accuracy of the studentized range (opendose.studentized) --------------

@pytest.mark.parametrize("df", [1, 2, 5, 30, 180, 1800, 18000, 1e6, np.inf])
def test_studentized_range_k2_is_exact_t(df):
    # the range of two normals is sqrt(2)|Z|: P(Q > q) = 2 P(T > q/sqrt 2)
    q = np.array([0.05, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 15])
    exact = 2 * (stats.norm.sf(q / np.sqrt(2)) if df == np.inf
                 else stats.t.sf(q / np.sqrt(2), df))
    np.testing.assert_allclose(studentized.sf(q, 2, df), exact, rtol=1e-11)


@pytest.mark.parametrize("k", [3, 4, 9, 20, 50])
@pytest.mark.parametrize("df", [1, 3, 5, 10, 30])
def test_studentized_range_matches_scipy_where_scipy_is_accurate(k, df):
    q = np.array([0.5, 1, 2, 3, 4, 5, 6, 8])
    np.testing.assert_allclose(studentized.sf(q, k, df),
                               stats.studentized_range.sf(q, k, df),
                               rtol=1e-9)


@pytest.mark.parametrize("p,k,df", [(0.95, 3, 10), (0.95, 9, 180),
                                    (0.95, 2, 1), (0.99, 20, 5),
                                    (0.95, 4, 8), (0.5, 2, 3)])
def test_studentized_range_quantile(p, k, df):
    ref = (np.sqrt(2) * stats.t.ppf(1 - (1 - p) / 2, df) if k == 2
           else stats.studentized_range.ppf(p, k, df))  # k = 2: exact
    assert studentized.ppf(p, k, df) == pytest.approx(ref, rel=1e-10)
    assert studentized.cdf(studentized.ppf(p, k, df), k, df) == \
        pytest.approx(p, rel=1e-12)


def test_studentized_range_far_tail_keeps_relative_accuracy():
    # scipy returns 0 here; the integral is evaluated in logarithms
    p = studentized.sf(15.0, 9, 180)
    assert 0 < p < 1e-12
    assert studentized.sf(15.0, 2, 180) == pytest.approx(
        2 * stats.t.sf(15 / np.sqrt(2), 180), rel=1e-10)
