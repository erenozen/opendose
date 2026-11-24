"""A zero dose (or any X <= 0) in a log(X) dose-response fit.

The model takes log10(X), so X = 0 (the vehicle / zero-dose wells) has no
logarithm and cannot be in the fit. That must be said as what it is, with
the count and mean of those values (the fit result's log_x_dropped), and
not as "rows without an X value", which is for rows with no X at all.
Users ask about exactly this (r/labrats, "Why am I unable to determine
IC50 of my drug using graphpad prism", 2024)."""

import pytest

from opendose import api

X = [0, 1, 3, 10, 30, 100, 300]
Y = [[100, 97], [98, 99], [90, 88], [70, 72], [45, 47], [25, 24], [15, 16]]


def _fit(x=X, ys=Y, **opt):
    options = {"model": "log_inhibitor_vs_response_4pl", "x_is_log": False, **opt}
    return api.analyze({"analysis": "dose_response",
                        "data": {"x": x, "datasets": [{"name": "A", "ys": ys}]},
                        "options": options})["datasets"][0]


def test_zero_dose_is_counted_with_its_mean_and_said_plainly():
    d = _fit()
    assert d["log_x_dropped"] == {"n_values": 2, "x_values": [0.0], "mean_y": 98.5,
                                  "rows": [0], "row_x": [0.0]}
    w = " ".join(d["warnings"])
    assert "2 Y values at X = 0 (mean 98.5) left out of the fit" in w
    assert "no logarithm" in w
    assert "rows without an X value" not in w
    # the fit uses the six nonzero doses, two replicates each
    assert d["fit"]["goodness"]["n_points"] == 12


def test_negative_x_and_missing_x_are_told_apart():
    x = [-1, None, 1, 3, 10, 30, 100]
    d = _fit(x=x)
    assert d["log_x_dropped"]["x_values"] == [-1.0]
    assert d["log_x_dropped"]["n_values"] == 2
    w = " ".join(d["warnings"])
    assert "2 Y values at X = -1" in w
    assert "2 Y values in rows without an X value" in w


def test_no_zero_dose_no_note():
    d = _fit(x=X[1:], ys=Y[1:])
    assert "log_x_dropped" not in d
    assert not any("no logarithm" in w for w in d.get("warnings", []))


def test_x_already_in_logs_keeps_zero():
    # X entered as log10(concentration): 0 is 1 M, a real dose
    d = _fit(x=[-3, -2, -1, 0, 1, 2, 3], x_is_log=True)
    assert "log_x_dropped" not in d


def test_mean_sd_n_rows_use_the_row_mean():
    ys = [[98.5, 2.1, 2], [98.5, 0.7, 2], [89, 1.4, 2], [71, 1.4, 2],
          [46, 1.4, 2], [24.5, 0.7, 2], [15.5, 0.7, 2]]
    d = _fit(ys=ys, summary_format="mean_sd_n")
    assert d["log_x_dropped"] == {"n_values": 1, "x_values": [0.0], "mean_y": 98.5,
                                  "rows": [0], "row_x": [0.0]}


def test_constraining_top_to_the_zero_dose_mean_is_honoured():
    d = _fit(constraints={"Top": 98.5})
    assert d["fit"]["params"]["Top"]["value"] == pytest.approx(98.5)
    assert d["log_x_dropped"]["mean_y"] == 98.5
