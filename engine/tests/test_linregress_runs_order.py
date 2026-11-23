"""Linear regression's runs test reads the residual signs in order of X
(Wave 0 follow-up). Before the fix it read them in entry order, so a table
typed unsorted got a different number of runs and a wrong P.

Independent reference: the number of runs is counted by hand on the
residual signs sorted by X, and the P value is the share of all
C(n1 + n2, n1) sign arrangements with that many runs or fewer, counted by
enumerating every arrangement (itertools), not by the engine's formula.
"""

from __future__ import annotations

import itertools
import math
import random

import numpy as np
import pytest

from opendose import api
from opendose.linregress import linear_regression, linear_regression_through_point

# A line with a curve in it: residuals run -, -, +, +, +, +, -, - along X.
X = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]
Y = [1.0, 2.6, 4.6, 6.2, 7.4, 8.2, 8.6, 8.8]


def runs_by_enumeration(signs):
    s = [v for v in signs if v != 0]
    n1 = sum(1 for v in s if v > 0)
    n = len(s)
    runs = 1 + sum(1 for a, b in zip(s, s[1:]) if a != b)
    hit = total = 0
    for pos in itertools.combinations(range(n), n1):
        seq = [1 if i in pos else -1 for i in range(n)]
        total += 1
        hit += (1 + sum(1 for a, b in zip(seq, seq[1:]) if a != b)) <= runs
    return runs, hit / total


def reference_signs(x, y):
    x, y = np.asarray(x), np.asarray(y)
    b, a = np.polyfit(x, y, 1)
    order = np.argsort(x, kind="stable")
    return np.sign((y - (a + b * x))[order]).tolist()


def test_sorted_runs_match_enumeration():
    runs, p = runs_by_enumeration(reference_signs(X, Y))
    assert runs == 3
    rt = linear_regression(X, Y)["runs_test"]
    assert rt["n_runs"] == runs
    assert rt["p"] == pytest.approx(p, abs=1e-12)
    # 3 runs among 4 + and 4 -: 8 of the 70 arrangements have 3 or fewer
    assert p == pytest.approx(8 / 70, abs=1e-15)


@pytest.mark.parametrize("seed", range(6))
def test_shuffling_rows_leaves_runs_test_unchanged(seed):
    rows = list(zip(X, Y))
    random.Random(seed).shuffle(rows)
    xs, ys = [r[0] for r in rows], [r[1] for r in rows]
    a = linear_regression(X, Y)["runs_test"]
    b = linear_regression(xs, ys)["runs_test"]
    assert (b["n_runs"], b["n_positive"], b["n_negative"]) == \
        (a["n_runs"], a["n_positive"], a["n_negative"])
    assert b["p"] == a["p"]


def test_unsorted_entry_gave_a_different_answer_before_the_fix():
    """The case the fix is for: entry order X = 1, 3, 2, 4, 7, 5, 8, 6
    alternates the signs, 8 runs in entry order against 3 along X."""
    order = [0, 2, 1, 3, 6, 4, 7, 5]
    xs, ys = [X[i] for i in order], [Y[i] for i in order]
    entry_signs = np.sign(np.array(ys) - np.polyval(np.polyfit(xs, ys, 1), xs))
    entry_runs = 1 + int(np.sum(entry_signs[1:] != entry_signs[:-1]))
    assert entry_runs == 8
    assert linear_regression(xs, ys)["runs_test"]["n_runs"] == 3


def test_tied_x_keep_entry_order():
    """Replicates at the same X: their residuals stay in entry order."""
    x = [1, 1, 2, 2, 3, 3, 4, 4]
    y = [0.5, 1.5, 2.6, 1.4, 3.7, 2.3, 3.4, 4.6]
    signs = reference_signs(x, y)  # stable sort = entry order within X
    runs, p = runs_by_enumeration(signs)
    rt = linear_regression(x, y)["runs_test"]
    assert rt["n_runs"] == runs
    assert rt["p"] == pytest.approx(p, abs=1e-12)
    assert "same X" in rt["order"]


def test_through_point_orders_by_x_too():
    rows = list(zip(X, Y))
    random.Random(3).shuffle(rows)
    a = linear_regression_through_point(X, Y, 0.0, 0.0)["runs_test"]
    b = linear_regression_through_point([r[0] for r in rows], [r[1] for r in rows],
                                        0.0, 0.0)["runs_test"]
    assert (a["n_runs"], a["p"]) == (b["n_runs"], b["p"])


def test_api_handler_with_unsorted_rows():
    x_sorted = {"x": X, "datasets": [{"name": "A", "ys": [[v] for v in Y]}]}
    order = [0, 2, 1, 3, 6, 4, 7, 5]
    x_shuf = {"x": [X[i] for i in order],
              "datasets": [{"name": "A", "ys": [[Y[i]] for i in order]}]}
    a = api.analyze({"analysis": "linear_regression", "data": x_sorted, "options": {}})
    b = api.analyze({"analysis": "linear_regression", "data": x_shuf, "options": {}})
    ra, rb = a["datasets"][0]["fit"]["runs_test"], b["datasets"][0]["fit"]["runs_test"]
    assert ra["n_runs"] == rb["n_runs"] == 3
    assert math.isclose(ra["p"], rb["p"])
