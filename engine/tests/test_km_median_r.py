"""Kaplan-Meier median survival as R's survfit reports it.

The median is the first time the curve reaches 0.5; where it stays at
exactly 0.5 until a later event, it is the midpoint of the two times
(R's quantile.survfit). A curve that ends flat at 0.5 gives the time it
reached 0.5, as R does; Prism takes the midpoint with the last follow-up
there (GraphPad FAQ "median survival can be incorrect when a curve ends
at 50% survival"). Pinned values: R 4.x, survival package,
summary(survfit(Surv(t, e) ~ 1, conf.type = "log-log" / "log"))$table,
for small datasets with tied times and censoring, eight of them with a
curve flat at exactly 50% (in a check of 294 such datasets, all medians
and limits matched R; the old first-time-at-or-below-0.5 rule disagreed
on 47)."""

import pytest

from opendose import survival as sv, survival_extras as sx

# (times, events, [median, log-log LCL, log-log UCL, log LCL, log UCL]) from R
R_CASES = [
    ([2, 1, 6, 3, 4, 1, 3, 6, 3, 7, 7], [0, 1, 1, 1, 0, 0, 1, 0, 1, 0, 1], [6.0, 3.0, None, 3.0, None]),  # ordinary
    ([3, 2, 3, 2, 2, 7, 5], [1, 1, 1, 1, 1, 1, 1], [3.0, 2.0, 5.0, 2.0, None]),  # ordinary
    ([4, 6, 3, 8, 2], [0, 0, 1, 1, 0], [8.0, 3.0, None, 3.0, None]),  # ordinary
    ([5, 5, 4, 4, 8, 1, 3, 4, 6, 4], [1, 0, 1, 1, 1, 1, 0, 1, 1, 1], [4.0, 1.0, 6.0, 4.0, None]),  # ordinary
    ([2, 3, 8], [0, 1, 1], [5.5, 3.0, None, 3.0, None]),  # flat at 50%
    ([5, 7], [1, 1], [6.0, 5.0, None, 5.0, None]),  # flat at 50%
    ([2, 8, 5, 8, 6, 8], [1, 1, 1, 1, 1, 0], [7.0, 2.0, None, 5.0, None]),  # flat at 50%
    ([1, 3, 3, 3, 4, 8, 4, 5], [1, 1, 1, 1, 1, 1, 1, 1], [3.5, 1.0, 5.0, 3.0, None]),  # flat at 50%
    ([7, 2, 7, 6, 2, 1], [1, 1, 1, 1, 1, 1], [4.0, 1.0, None, 2.0, None]),  # flat at 50%
    ([4, 6], [1, 1], [5.0, 4.0, None, 4.0, None]),  # flat at 50%
    ([1, 5, 4, 2], [1, 1, 1, 1], [3.0, 1.0, None, 1.0, None]),  # flat at 50%
    ([8, 8, 3, 3, 1, 7, 3, 3], [1, 1, 0, 1, 1, 0, 1, 1], [5.5, 1.0, None, 3.0, None]),  # flat at 50%
]


@pytest.mark.parametrize("t, e, r", R_CASES)
def test_median_and_its_cis_match_r(t, e, r):
    k = sv.km_curve(t, e)
    ours = [k["median_survival"], k["median_ci"]["lower"], k["median_ci"]["upper"],
            k["median_ci_log"]["lower"], k["median_ci_log"]["upper"]]
    for o, x in zip(ours, r):
        assert (o is None and x is None) or o == pytest.approx(x, abs=1e-12)


def test_flat_at_half_between_events_is_the_midpoint():
    # 1, 2, 3, 4 all events: S = 0.75, 0.5, 0.25, 0 -> flat at 0.5 from 2 to 3
    assert sv.km_curve([1, 2, 3, 4], [1, 1, 1, 1])["median_survival"] == 2.5


def test_curve_ending_flat_at_half_keeps_the_time_it_got_there():
    # R gives 1 (Prism 1.5): no later event to take a midpoint with
    assert sv.km_curve([1, 2], [1, 0])["median_survival"] == 1.0
    assert sv.km_curve([1, 2, 3, 4], [1, 1, 0, 0])["median_survival"] == 2.0


def test_the_explanation_says_the_same_median():
    rows = [{"time": 1.0, "n_event": 1, "surv": 0.75}, {"time": 2.0, "n_event": 1, "surv": 0.5},
            {"time": 3.0, "n_event": 1, "surv": 0.25}, {"time": 4.0, "n_event": 1, "surv": 0.0}]
    ex = sx._explanation(rows, 4, 4)
    assert ex["median"] == 2.5 and ex["median_reached"]
    assert "midpoint" in ex["text"]
    rows2 = [{"time": 1.0, "n_event": 1, "surv": 0.75}, {"time": 2.0, "n_event": 1, "surv": 0.4}]
    ex2 = sx._explanation(rows2, 4, 2)
    assert ex2["median"] == 2.0 and "reaches 50% at that time" in ex2["text"]
