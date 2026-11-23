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

normalize_references reports the 0% and 100% references (Z and H) each
data set used, with the rule and the row they came from, so the results
can state them next to the output (P-57).
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


def _ref_row(values: np.ndarray, mode: str):
    """Row index the reference came from (None for a typed value or a sum)."""
    ok = np.flatnonzero(~np.isnan(values))
    if not ok.size:
        return None
    if mode == "smallest":
        return int(ok[np.argmin(values[ok])])
    if mode == "largest":
        return int(ok[np.argmax(values[ok])])
    if mode == "first":
        return int(ok[0])
    if mode == "last":
        return int(ok[-1])
    return None


def _refs(values, zero_mode, zero_value, hundred_mode, hundred_value):
    return {
        "zero": {"value": _zero_value(values, zero_mode, zero_value),
                 "rule": zero_mode, "row": _ref_row(values, zero_mode)},
        "hundred": {"value": _hundred_value(values, hundred_mode,
                                            hundred_value),
                    "rule": hundred_mode,
                    "row": _ref_row(values, hundred_mode),
                    "n_summed": int(np.sum(~np.isnan(values)))
                    if hundred_mode == "sum" else None},
    }


def normalize_references(replicate_rows, *, zero_mode="smallest",
                         zero_value=None, hundred_mode="largest",
                         hundred_value=None, subcolumns="mean") -> dict | None:
    """The 0% and 100% references normalize_dataset uses for one data set:
    {"basis": "row means" | "each subcolumn", "zero": {value, rule, row},
    "hundred": {value, rule, row, n_summed}} for the row means, or with
    'separate' a list of those per subcolumn under "subcolumns". row is the
    0-based row the value came from (None for a typed value or a sum).
    None for a data set with no values."""
    grid = np.array([_col_to_array(r) for r in replicate_rows], dtype=float)
    if grid.size == 0 or np.all(np.isnan(grid)):
        return None
    if subcolumns == "separate":
        subs = []
        for j in range(grid.shape[1]):
            col = grid[:, j]
            subs.append(None if np.all(np.isnan(col)) else
                        _refs(col, zero_mode, zero_value, hundred_mode,
                              hundred_value))
        return {"basis": "each subcolumn", "subcolumns": subs}
    means = np.array([np.nan if np.all(np.isnan(r)) else np.nanmean(r)
                      for r in grid])
    return {"basis": "row means",
            **_refs(means, zero_mode, zero_value, hundred_mode,
                    hundred_value)}
