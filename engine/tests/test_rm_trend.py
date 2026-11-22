"""Test for linear trend after repeated-measures one-way ANOVA
(repeated.rm_linear_trend). R 4.6.1 reference:
    d <- data.frame(y = unlist(cols), treat = factor(rep(1:4, each = 6)),
                    subj = factor(rep(1:6, 4)))
    contrasts(d$treat) <- contr.poly(4)
    summary(aov(y ~ treat + Error(subj / treat), data = d),
            split = list(treat = list(linear = 1, rest = 2:3)))
    t.test(as.matrix(cols) %*% (1:4 - 2.5))   # per-subject linear scores
"""

import pytest

from opendose import api, repeated

COLS = [[10.1, 11.4, 9.8, 12.0, 10.6, 11.1], [11.0, 12.6, 10.2, 13.1, 11.9, 11.8],
        [12.4, 13.0, 11.6, 14.6, 12.2, 13.5], [12.9, 14.1, 11.9, 14.8, 13.4, 13.6]]


def test_matches_r():
    r = repeated.rm_linear_trend(COLS)
    assert r["linear"]["F"] == pytest.approx(290.218, rel=1e-5)
    assert r["linear"]["p"] == pytest.approx(3.179816e-11, rel=1e-5)
    assert r["linear"]["ss"] == pytest.approx(24.120, rel=1e-4)
    assert r["nonlinear"]["F"] == pytest.approx(2.184, rel=1e-3)
    assert r["nonlinear"]["p"] == pytest.approx(0.1470984, rel=1e-5)
    assert r["within"]["df"] == 15
    assert r["per_subject"]["t"] == pytest.approx(26.20185, rel=1e-6)
    assert r["per_subject"]["p"] == pytest.approx(1.513178e-06, rel=1e-5)
    assert r["slope"] == pytest.approx(0.8966667, rel=1e-6)


def test_api_option_and_incomplete_subjects():
    cols = [c[:] for c in COLS]
    cols[2][0] = None                      # subject 1 incomplete: left out
    data = {"datasets": [{"name": f"T{i}", "ys": [[v] for v in c]} for i, c in enumerate(cols)]}
    r = api.analyze({"analysis": "rm_anova", "data": data, "options": {"trend": True}})
    assert r["trend"]["n_subjects"] == 5 and r["trend"]["within"]["df"] == 12
    two = api.analyze({"analysis": "rm_anova", "data": {"datasets": data["datasets"][:2]},
                       "options": {"trend": True}})
    assert "at least 3 treatments" in two["trend"]["error"]
