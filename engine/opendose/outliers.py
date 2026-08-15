"""Outlier detection for column data.

Prism statistics guide, "Identifying outliers": Grubbs' test (also called
the ESD method for one outlier at a time) with the option to detect
multiple outliers by iterating after removal. G = |value - mean| / SD;
the critical value uses the t distribution:

    G_crit = ((n-1)/sqrt(n)) * sqrt(t^2 / (n - 2 + t^2)),
    t = t_ppf(1 - alpha/(2n), n-2)

ROUT for column data is on the roadmap (requires robust regression).
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats


def grubbs_critical(n: int, alpha: float = 0.05) -> float:
    if n < 3:
        raise ValueError("Grubbs' test needs at least 3 values")
    t = stats.t.ppf(1 - alpha / (2 * n), n - 2)
    return float((n - 1) / math.sqrt(n) * math.sqrt(t * t / (n - 2 + t * t)))


def grubbs(values, *, alpha: float = 0.05, iterative: bool = True) -> dict:
    arr = np.array([float(v) for v in values if v is not None], dtype=float)
    outliers = []
    remaining = arr.copy()
    while remaining.size >= 3:
        mean = remaining.mean()
        sd = remaining.std(ddof=1)
        if sd == 0:
            break
        deviations = np.abs(remaining - mean)
        idx = int(np.argmax(deviations))
        g = float(deviations[idx] / sd)
        g_crit = grubbs_critical(remaining.size, alpha)
        if g > g_crit:
            outliers.append({"value": float(remaining[idx]), "G": g,
                             "G_critical": g_crit, "n_at_test": int(remaining.size)})
            remaining = np.delete(remaining, idx)
            if not iterative:
                break
        else:
            break
    return {
        "method": "grubbs", "alpha": alpha,
        "n": int(arr.size),
        "outliers": outliers,
        "cleaned": [float(v) for v in remaining],
    }
