"""CI of the X intercept and a line forced through a point (linregress).

R 4.6.1 reference (x = 1..8, y below):
    m <- lm(y ~ x); X intercept -coef(m)[1] / coef(m)[2]; its CI: the X
    values where predict(m, interval = "confidence") crosses 0 (uniroot)
    g <- lm(I(y - 1) ~ 0 + I(x - 2))   # through (2, 1)
    predict(g, data.frame(x = 7), interval = "confidence" | "prediction") + 1
(12 random datasets agree with R to ~1e-14.)
"""

import pytest

from opendose import api, linregress as lr

X = [1, 2, 3, 4, 5, 6, 7, 8]
Y = [-1.2, 0.3, 1.1, 2.4, 2.9, 4.6, 5.0, 6.3]


def test_x_intercept_ci_matches_r():
    f = lr.linear_regression(X, Y)
    assert f["x_intercept"] == pytest.approx(1.91724137931, rel=1e-10)
    assert f["x_intercept_ci"] == pytest.approx([1.53871885489, 2.24242600538], rel=1e-9)


def test_x_intercept_ci_unbounded_when_slope_not_clearly_nonzero():
    f = lr.linear_regression([1, 2, 3, 4, 5], [2.0, 1.0, 2.5, 1.2, 2.1])
    assert f["x_intercept_ci"] is None


def test_line_through_a_point_matches_r():
    g = lr.linear_regression_through_point(X, Y, 2.0, 1.0)
    assert g["slope"]["value"] == pytest.approx(0.836956521739, rel=1e-10)
    assert g["slope"]["se"] == pytest.approx(0.0738719286451, rel=1e-10)
    assert g["df"] == 7
    assert g["y_intercept"]["value"] == pytest.approx(1.0 - 2.0 * 0.836956521739, rel=1e-9)
    c = lr.linear_bands(X, Y, [7.0], kind="confidence", through=(2.0, 1.0))
    assert [c["y"][0], c["lower"][0], c["upper"][0]] == pytest.approx(
        [5.1847826087, 4.31138583876, 6.05817937863], rel=1e-10)
    p = lr.linear_bands(X, Y, [7.0], kind="prediction", through=(2.0, 1.0))
    assert [p["lower"][0], p["upper"][0]] == pytest.approx([3.29533650601, 7.07422871138], rel=1e-10)
    # zero width at the point itself
    at = lr.linear_bands(X, Y, [2.0], through=(2.0, 1.0))
    assert at["lower"][0] == pytest.approx(1.0) and at["upper"][0] == pytest.approx(1.0)


def test_api_through_point_and_curve_reaches_the_point():
    r = api.analyze({"analysis": "linear_regression",
                     "data": {"x": X, "datasets": [{"name": "A", "ys": [[v] for v in Y]}]},
                     "options": {"through_point": [-2.0, 0.0], "bands": "confidence"}})
    fit = r["datasets"][0]["fit"]
    assert fit["through_point"] == [-2.0, 0.0]
    assert min(fit["curve"]["x"]) == pytest.approx(-2.0)
    assert fit["x_intercept"] == pytest.approx(-2.0)
    assert "bands" in fit
