"""Row statistics and error-bar computation.

Prism reference: "SD, SEM and 95% CI" (statistics guide). Error bar
choices on grouped/XY graphs: SD, SEM, 95% CI, range (min/max).
SD uses n-1 denominator; 95% CI of the mean uses the t distribution:
mean +/- t(0.975, n-1) * SEM.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats


def _clean(values) -> np.ndarray:
    arr = np.array([v for v in values if v is not None and not (
        isinstance(v, float) and math.isnan(v))], dtype=float)
    return arr


def row_stats(values) -> dict:
    """Descriptive stats for one row of replicates (one X, one dataset)."""
    arr = _clean(values)
    n = int(arr.size)
    if n == 0:
        return {"n": 0, "mean": None, "sd": None, "sem": None,
                "ci95_lo": None, "ci95_hi": None, "min": None, "max": None}
    mean = float(arr.mean())
    out = {"n": n, "mean": mean, "min": float(arr.min()), "max": float(arr.max())}
    if n >= 2:
        sd = float(arr.std(ddof=1))
        sem = sd / math.sqrt(n)
        tcrit = float(stats.t.ppf(0.975, n - 1))
        out.update({"sd": sd, "sem": sem,
                    "ci95_lo": mean - tcrit * sem, "ci95_hi": mean + tcrit * sem})
    else:
        out.update({"sd": None, "sem": None, "ci95_lo": None, "ci95_hi": None})
    return out


def error_bars(rows_of_replicates, kind: str) -> list:
    """Per-row (center, minus, plus) error-bar spans.

    kind: 'sd' | 'sem' | 'ci95' | 'range' | 'none'
    Returns list of dicts {mean, lo, hi} where lo/hi are absolute Y values
    (None when not computable, e.g. n < 2 for sd/sem/ci95).
    """
    out = []
    for row in rows_of_replicates:
        s = row_stats(row)
        mean = s["mean"]
        lo = hi = None
        if mean is not None:
            if kind == "sd" and s["sd"] is not None:
                lo, hi = mean - s["sd"], mean + s["sd"]
            elif kind == "sem" and s["sem"] is not None:
                lo, hi = mean - s["sem"], mean + s["sem"]
            elif kind == "ci95" and s["ci95_lo"] is not None:
                lo, hi = s["ci95_lo"], s["ci95_hi"]
            elif kind == "range":
                lo, hi = s["min"], s["max"]
        out.append({"mean": mean, "lo": lo, "hi": hi, "n": s["n"]})
    return out
