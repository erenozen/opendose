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
from functools import lru_cache
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


# --- large data: tens of thousands of rows (need "large-data") -------------

# Every request goes through api.analyze on fixed-seed random data. The
# measured native times in the docstrings are CPython 3.14 / numpy 2 on
# a WSL2 laptop, after the O(n^2) paths were replaced (opendose.orderstats,
# effectsize.CLIFF_DIRECT_MAX_PAIRS, correlation.KENDALL_DIRECT_MAX_N,
# columnstats.MEDIAN_CI_LOOP_MAX_N; test_large_data_paths.py checks they
# return what the direct methods do). Before, Mann-Whitney took 16 s at
# 2 x 8,000 values and could not run at 2 x 100,000 (10^10 differences).
# The bounds are about five times the measured times, never under 5 s.


def _col(name, values):
    return {"name": name, "ys": [[float(v)] for v in values]}


@lru_cache(maxsize=None)
def _two_large_columns():
    rng = np.random.default_rng(20261009)
    return {"x": [], "datasets": [_col("A", rng.normal(10.0, 2.0, 100_000)),
                                  _col("B", rng.normal(10.05, 2.0, 100_000))]}


@lru_cache(maxsize=None)
def _fifty_columns():
    rng = np.random.default_rng(20261010)
    return {"x": [], "datasets": [_col(f"C{i}", rng.lognormal(1.0, 0.4,
                                                              10_000))
                                  for i in range(50)]}


@lru_cache(maxsize=None)
def _five_groups():
    rng = np.random.default_rng(20261011)
    return {"x": [], "datasets": [_col(f"G{i}", rng.normal(5 + 0.02 * i, 1,
                                                           20_000))
                                  for i in range(5)]}


@lru_cache(maxsize=None)
def _dose_response_points(distinct):
    rng = np.random.default_rng(20261012)
    x = (np.linspace(-9, -4, 5_000) if distinct
         else np.repeat(np.linspace(-9, -4, 50), 100))
    y = 10 + 90 / (1 + 10 ** (x + 6.5)) + rng.normal(0, 5, x.size)
    return {"x": [float(v) for v in x],
            "datasets": [{"name": "Response", "ys": [[float(v)] for v in y]}]}


@lru_cache(maxsize=None)
def _twenty_variables():
    rng = np.random.default_rng(20261013)
    base = rng.normal(size=20_000)
    return {"variables": [
        {"name": f"V{i}", "kind": "continuous",
         "values": [float(v) for v in 0.3 * base + rng.normal(size=20_000)]}
        for i in range(20)]}


def _timed(request):
    t0 = time.perf_counter()
    res = api.analyze(request)
    elapsed = time.perf_counter() - t0
    assert "error" not in res, res.get("error")
    return res, elapsed


@pytest.mark.parametrize("options,bound", [
    ({"kind": "unpaired"}, 5.0),
    ({"kind": "unpaired", "welch": True}, 5.0),
    ({"kind": "paired"}, 5.0),
    ({"kind": "mann_whitney"}, 5.0),
    ({"kind": "wilcoxon"}, 6.0),
])
def test_ttest_on_two_columns_of_100000_values(options, bound):
    """2 x 100,000 values. Measured: unpaired 0.1 s, Welch 0.1 s, paired
    0.5 s, Mann-Whitney 0.7 s (was O(n^2): 16 s at 2 x 8,000), Wilcoxon
    0.7 s (was O(n^2): 1.2 s at 8,000 pairs)."""
    res, elapsed = _timed({"analysis": "ttest", "data": _two_large_columns(),
                           "options": options})
    assert res.get("p_two_tailed") is not None
    if options["kind"] in ("mann_whitney", "wilcoxon"):
        # large samples: normal approximation, labelled as such
        assert res["p_method"] == "approximate"
        ci = (res["ci_hodges_lehmann"] if options["kind"] == "mann_whitney"
              else res["ci_median"])
        assert ci[0] < ci[1]
    assert elapsed < bound


@pytest.mark.parametrize("method,bound", [("spearman", 5.0),
                                          ("kendall", 5.0)])
def test_correlation_of_100000_pairs(method, bound):
    """100,000 XY pairs. Measured: Spearman 0.4 s, Kendall 0.6 s (was
    O(n^2) memory: two n x n sign matrices)."""
    res, elapsed = _timed({"analysis": "correlation",
                           "data": _two_large_columns(),
                           "options": {"method": method}})
    assert res["n"] == 100_000 and res["p_type"] == "approximate"
    assert elapsed < bound


@pytest.mark.parametrize("options,bound", [
    ({}, 6.0),
    ({"normality_tests": ["shapiro_wilk", "dagostino_pearson",
                          "anderson_darling", "kolmogorov_smirnov"],
      "extras": True}, 9.0),
    ({"hypothetical": 2.7}, 20.0),
])
def test_column_statistics_of_50_columns_of_10000_values(options, bound):
    """50 columns x 10,000 values. Measured: default 1.1 s; all four
    normality tests + extras 1.6 s (the binomial median CI was ~n/2 scipy
    calls per column); hypothetical value (one-sample t + Wilcoxon) 3.3 s
    (the Walsh-average CI was O(n^2): 1.5 s at 50 x 800)."""
    res, elapsed = _timed({"analysis": "column_statistics",
                           "data": _fifty_columns(), "options": options})
    assert len(res["datasets"]) == 50
    ds = res["datasets"][0]
    if "extras" in options:
        assert ds["extras"]["median_ci"]["ci"] is not None
        assert "note" in ds["normality"]["shapiro_wilk"]   # n > 5000
    if "hypothetical" in options:
        assert ds["wilcoxon"]["p_method"] == "approximate"
        assert ds["wilcoxon"]["ci_median"] is not None
    assert elapsed < bound


@pytest.mark.parametrize("options,bound", [
    ({"kind": "parametric", "comparisons": "tukey"}, 5.0),
    ({"kind": "nonparametric"}, 5.0),
])
def test_anova_on_5_groups_of_20000(options, bound):
    """5 groups x 20,000 values. Measured: parametric + Tukey 0.2 s,
    Kruskal-Wallis + Dunn 0.1 s."""
    res, elapsed = _timed({"analysis": "anova", "data": _five_groups(),
                           "options": options})
    if options["kind"] == "parametric":
        assert res["table"]["p"] is not None
        assert len(res["multiple_comparisons"]["comparisons"]) == 10
    else:
        assert res["p"] is not None and res["dunns"]
    assert elapsed < bound


@pytest.mark.parametrize("distinct,bound", [(False, 5.0), (True, 10.0)])
def test_dose_response_with_5000_points(distinct, bound):
    """4PL inhibitor fit, 5,000 points. Measured: 50 doses x 100
    replicates 0.6 s; 5,000 distinct X 1.6 s (the multistart is capped
    by nlfit.MULTISTART_*)."""
    res, elapsed = _timed({"analysis": "dose_response",
                           "data": _dose_response_points(distinct),
                           "options": {
                               "model": "log_inhibitor_vs_response_4pl"}})
    fit = res["datasets"][0]["fit"]
    assert fit["status"] == "converged"
    assert fit["params"]["LogIC50"]["value"] == pytest.approx(-6.5, abs=0.05)
    assert elapsed < bound


@pytest.mark.parametrize("method,bound", [("pearson", 10.0),
                                          ("spearman", 10.0)])
def test_correlation_matrix_of_20_variables_of_20000_rows(method, bound):
    """20 variables x 20,000 rows (190 pairs). Measured: Pearson 1.6 s,
    Spearman 2.0 s (was ~4 s: complete cases were paired in Python)."""
    res, elapsed = _timed({"analysis": "correlation_matrix",
                           "data": _twenty_variables(),
                           "options": {"method": method}})
    assert res["n"][0][1] == 20_000 and res["r"][0][1] > 0
    assert elapsed < bound
