"""Frequency distributions (statistics guide, "How to: Frequency
distribution"; GraphPad FAQ 1660 for the automatic bin width): bins,
borders, omitted values, relative and cumulative values, the exact
cumulative distribution, and Gaussian / cumulative Gaussian fits."""

import math

import numpy as np
import pytest

from opendose import api, frequency as fq

RNG = np.random.default_rng(2)


@pytest.mark.parametrize("w,nice", [(3.7, 3.5), (4.4, 4.2), (9.9, 9.5),
                                    (0.0371, 0.035), (120, 120), (1.0, 1.0),
                                    (0.99, 0.95), (2.19, 2.0), (51, 50)])
def test_nice_floor(w, nice):
    assert fq.nice_floor(w) == pytest.approx(nice, rel=1e-12)


def test_automatic_width_follows_faq_1660():
    a, b = RNG.normal(50, 8, 200), RNG.normal(40, 5, 60)
    raw = np.mean([(a.max() - a.min()) / (1 + math.log2(200)),
                   (b.max() - b.min()) / (1 + math.log2(60))])
    assert fq.auto_bin_width([a, b]) == fq.nice_floor(raw)
    ints = RNG.integers(0, 40, 50).astype(float)
    w = fq.auto_bin_width([ints])
    assert w == int(w) and w >= 1


def test_border_goes_to_the_higher_bin_and_out_of_range_values_are_counted():
    r = fq.frequency_distribution([[3.0, 3.5, 4.5, 4.5, 5.49, 5.5, 8.0]],
                                  bin_width=1, first_center=4,
                                  upper_limit=6.0)
    d = r["datasets"][0]
    assert r["centers"] == [4.0, 5.0, 6.0]
    assert d["counts"] == [1, 3, 1]
    assert d["n_omitted_below"] == 1 and d["n_omitted_above"] == 1
    assert any("below the first bin" in w for w in r["warnings"])


def test_relative_and_cumulative():
    x = RNG.normal(0, 1, 120).tolist()
    pct = fq.frequency_distribution([x], bin_width=0.5, relative="percent")
    assert sum(pct["datasets"][0]["y"]) == pytest.approx(100.0)
    cum = fq.frequency_distribution([x], bin_width=0.5, cumulative=True)
    y = cum["datasets"][0]["y"]
    assert y[-1] == 120 and all(b >= a for a, b in zip(y, y[1:]))
    frac = fq.frequency_distribution([x], bin_width=0.5, cumulative=True,
                                     relative="fraction")
    assert frac["datasets"][0]["y"][-1] == pytest.approx(1.0)


def test_exact_cumulative_counts_ties_at_their_value():
    r = fq.frequency_distribution([[3, 1, 2, 2, 5]], exact=True)
    d = r["datasets"][0]
    assert d["x"] == [1, 2, 2, 3, 5]
    assert d["cumulative"] == [1, 3, 3, 4, 5]
    assert d["cumulative_percent"][-1] == pytest.approx(100.0)


def test_gaussian_fits_recover_the_distribution():
    x = RNG.normal(50, 8, 2000)
    h = fq.frequency_distribution([x.tolist()], bin_width=2, fit="gaussian")
    p = h["fits"][0]["params"]
    assert p["Mean"]["value"] == pytest.approx(x.mean(), abs=0.6)
    assert p["SD"]["value"] == pytest.approx(x.std(), rel=0.05)
    # the Gaussian's area = n * bin width
    assert p["Area"]["value"] == pytest.approx(2000 * 2, rel=0.03)
    assert any("bin width" in w for w in h["warnings"])
    c = fq.frequency_distribution([x.tolist()], exact=True,
                                  fit="cumulative_gaussian")
    q = c["fits"][0]["params"]
    assert q["Mean"]["value"] == pytest.approx(x.mean(), abs=0.3)
    assert q["SD"]["value"] == pytest.approx(x.std(), rel=0.03)
    # cumulative points are not independent: no (too narrow) intervals
    assert "ci95" not in q["Mean"] and "se" not in q["Mean"]
    assert any("not independent" in w for w in c["warnings"])


@pytest.mark.parametrize("kw", [{"fit": "gaussian", "cumulative": True},
                                {"fit": "cumulative_gaussian"},
                                {"fit": "gaussian", "exact": True},
                                {"relative": "percentage"}])
def test_impossible_combinations_are_errors(kw):
    with pytest.raises(ValueError):
        fq.frequency_distribution([[1.0, 2.0, 3.0, 4.0]], **kw)


def test_api_replicates_each_or_mean():
    data = {"datasets": [{"name": "A", "ys": [[1, 2], [3, None], [None],
                                               [4, 6]]}]}
    each = api.analyze({"analysis": "frequency_distribution", "data": data,
                        "options": {"bin_width": 2, "first_center": 2}})
    assert each["datasets"][0]["counts"] == [2, 2, 1]
    mean = api.analyze({"analysis": "frequency_distribution", "data": data,
                        "options": {"bin_width": 2, "first_center": 2,
                                    "replicates": "mean"}})
    assert mean["datasets"][0]["counts"] == [1, 1, 1]
