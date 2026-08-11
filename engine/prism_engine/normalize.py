"""Normalize analysis.

Prism reference: User Guide, "Normalize"
(guides/prism/latest/user-guide/using_normalizing_data.htm):

- Zero may be defined as: the smallest value in each data set, the value
  in the first row, or a value you enter.
- One hundred may be defined as: the largest value in each data set, the
  value in the last row, a value you enter, or the sum of all values.
- Results can be fractions or percentages.
- With replicate subcolumns you can either normalize each subcolumn
  separately, or define 0%/100% from the row MEANS and apply that scale
  to every replicate. Each value is normalized as (Y - Z) / (H - Z).
"""

from __future__ import annotations

import math

import numpy as np

_MISSING = float("nan")


def _col_to_array(col) -> np.ndarray:
    return np.array([_MISSING if v is None else float(v) for v in col], dtype=float)


def _zero_value(values: np.ndarray, mode: str, custom) -> float:
    finite = values[~np.isnan(values)]
    if mode == "smallest":
        return float(np.min(finite))
    if mode == "first":
        first = values[~np.isnan(values)][:1]
        return float(first[0])
    if mode == "value":
        return float(custom)
    raise ValueError(f"unknown zero mode: {mode}")


def _hundred_value(values: np.ndarray, mode: str, custom) -> float:
    finite = values[~np.isnan(values)]
    if mode == "largest":
        return float(np.max(finite))
    if mode == "last":
        return float(finite[-1])
    if mode == "value":
        return float(custom)
    if mode == "sum":
        return float(np.sum(finite))
    raise ValueError(f"unknown hundred mode: {mode}")


def normalize_dataset(replicate_rows, *, zero_mode="smallest", zero_value=None,
                      hundred_mode="largest", hundred_value=None,
                      as_percent=True, subcolumns="mean") -> list:
    """Normalize one dataset (rows x subcolumns, None = missing).

    subcolumns: 'mean':     Z/H from row means, applied to all replicates
                'separate': each subcolumn normalized independently
    Returns rows x subcolumns with None for missing.
    """
    grid = np.array([_col_to_array(r) for r in replicate_rows], dtype=float)
    if grid.size == 0:
        return []
    scale = 100.0 if as_percent else 1.0
    out = np.full_like(grid, np.nan)

    if subcolumns == "separate":
        for j in range(grid.shape[1]):
            col = grid[:, j]
            if np.all(np.isnan(col)):
                continue
            z = _zero_value(col, zero_mode, zero_value)
            h = _hundred_value(col, hundred_mode, hundred_value)
            out[:, j] = (col - z) / (h - z) * scale
    else:
        means = np.array([np.nan if np.all(np.isnan(r)) else np.nanmean(r)
                          for r in grid])
        z = _zero_value(means, zero_mode, zero_value)
        h = _hundred_value(means, hundred_mode, hundred_value)
        out = (grid - z) / (h - z) * scale

    return [[None if math.isnan(v) else float(v) for v in row] for row in out]
