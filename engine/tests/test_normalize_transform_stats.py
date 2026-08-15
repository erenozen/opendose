import math

import numpy as np
import pytest
from scipy import stats

from opendose.descriptive import error_bars, row_stats
from opendose.normalize import normalize_dataset
from opendose.transform import transform_grid, transform_list


class TestNormalize:
    """Semantics from the Prism User Guide 'Normalize' page: each value is
    (Y - Zero)/(Hundred - Zero); defaults are smallest/largest."""

    def test_smallest_largest_percent_single_column(self):
        rows = [[10.0], [20.0], [30.0], [50.0]]
        out = normalize_dataset(rows)
        assert [r[0] for r in out] == pytest.approx([0.0, 25.0, 50.0, 100.0])

    def test_fraction_output(self):
        rows = [[10.0], [30.0], [50.0]]
        out = normalize_dataset(rows, as_percent=False)
        assert [r[0] for r in out] == pytest.approx([0.0, 0.5, 1.0])

    def test_first_last_modes(self):
        rows = [[20.0], [10.0], [60.0], [40.0]]
        out = normalize_dataset(rows, zero_mode="first", hundred_mode="last")
        # zero = 20, hundred = 40, scale = 20
        assert [r[0] for r in out] == pytest.approx([0.0, -50.0, 200.0, 100.0])

    def test_custom_values(self):
        rows = [[5.0], [10.0]]
        out = normalize_dataset(rows, zero_mode="value", zero_value=0.0,
                                hundred_mode="value", hundred_value=20.0)
        assert [r[0] for r in out] == pytest.approx([25.0, 50.0])

    def test_sum_mode(self):
        rows = [[10.0], [40.0], [50.0]]
        out = normalize_dataset(rows, zero_mode="value", zero_value=0.0,
                                hundred_mode="sum")
        assert [r[0] for r in out] == pytest.approx([10.0, 40.0, 50.0])

    def test_replicates_mean_mode_uses_row_means(self):
        # Row means: 10, 50, 100 -> zero=10, hundred=100, range=90.
        rows = [[8.0, 12.0], [45.0, 55.0], [90.0, 110.0]]
        out = normalize_dataset(rows, subcolumns="mean")
        expect = [[(8 - 10) / 90 * 100, (12 - 10) / 90 * 100],
                  [(45 - 10) / 90 * 100, (55 - 10) / 90 * 100],
                  [(90 - 10) / 90 * 100, (110 - 10) / 90 * 100]]
        for got_row, exp_row in zip(out, expect):
            assert got_row == pytest.approx(exp_row)

    def test_replicates_separate_mode(self):
        rows = [[0.0, 10.0], [50.0, 60.0], [100.0, 110.0]]
        out = normalize_dataset(rows, subcolumns="separate")
        assert [r[0] for r in out] == pytest.approx([0.0, 50.0, 100.0])
        assert [r[1] for r in out] == pytest.approx([0.0, 50.0, 100.0])

    def test_missing_values_preserved(self):
        rows = [[10.0, None], [None, 50.0], [90.0, 90.0]]
        out = normalize_dataset(rows, subcolumns="mean")
        assert out[0][1] is None
        assert out[1][0] is None
        assert out[0][0] is not None


class TestTransforms:
    def test_x_log10(self):
        assert transform_list([1e-9, 1e-6, None], "log10") == \
            pytest.approx([-9.0, -6.0, None])

    def test_log_of_nonpositive_becomes_blank(self):
        assert transform_list([0.0, -5.0, 10.0], "log10") == [None, None, 1.0]

    def test_reciprocal_of_zero_blank(self):
        assert transform_list([0.0, 2.0], "reciprocal") == [None, 0.5]

    def test_grid_with_k(self):
        out = transform_grid([[1.0, 2.0], [None, 4.0]], "multiply_k", k=10)
        assert out == [[10.0, 20.0], [None, 40.0]]


class TestRowStats:
    """SD (n-1), SEM = SD/sqrt(n), 95% CI = mean +/- t(0.975, n-1)*SEM,
    per the Prism statistics guide."""

    DATA = [23.0, 25.0, 30.0]

    def test_against_hand_computation(self):
        s = row_stats(self.DATA)
        arr = np.array(self.DATA)
        assert s["n"] == 3
        assert s["mean"] == pytest.approx(26.0)
        assert s["sd"] == pytest.approx(arr.std(ddof=1))
        assert s["sem"] == pytest.approx(arr.std(ddof=1) / math.sqrt(3))
        t = stats.t.ppf(0.975, 2)
        assert s["ci95_hi"] - s["mean"] == pytest.approx(t * s["sem"])

    def test_single_value_has_no_spread(self):
        s = row_stats([42.0])
        assert s["mean"] == 42.0
        assert s["sd"] is None and s["sem"] is None

    def test_error_bar_kinds(self):
        rows = [self.DATA]
        sd = error_bars(rows, "sd")[0]
        sem = error_bars(rows, "sem")[0]
        rng = error_bars(rows, "range")[0]
        assert sd["hi"] - sd["mean"] > sem["hi"] - sem["mean"]
        assert rng["lo"] == 23.0 and rng["hi"] == 30.0
