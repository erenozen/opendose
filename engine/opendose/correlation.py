"""Correlation (Prism: Analyze -> Correlation).

Prism statistics guide, "Correlation": Pearson r (assumes Gaussian
scatter) or nonparametric Spearman rs; two-tailed P; 95% CI of r via the
Fisher z transformation; R squared reported for Pearson.
Spearman CI uses the Fisher z approach with the Fieller-Hartley-Pearson
variance sqrt(1.06/(n-3)), the standard approximation.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats


def _pairs(values_a, values_b):
    pairs = [(float(a), float(b)) for a, b in zip(values_a, values_b)
             if a is not None and b is not None]
    return (np.array([p[0] for p in pairs]), np.array([p[1] for p in pairs]))


def _fisher_ci(r: float, n: int, sd_z: float, ci_level: float) -> list | None:
    if n < 4 or abs(r) >= 1:
        return None
    z = math.atanh(r)
    zcrit = stats.norm.ppf((1 + ci_level) / 2)
    return [math.tanh(z - zcrit * sd_z), math.tanh(z + zcrit * sd_z)]


def correlate(values_a, values_b, *, method: str = "pearson",
              ci_level: float = 0.95) -> dict:
    a, b = _pairs(values_a, values_b)
    n = int(a.size)
    if n < 3:
        raise ValueError("correlation needs at least 3 XY pairs")
    if method == "pearson":
        r, p = stats.pearsonr(a, b)
        ci = (_fisher_ci(float(r), n, 1 / math.sqrt(n - 3), ci_level)
              if n >= 4 else None)
        return {"method": "pearson", "n": n, "r": float(r),
                "ci_r": ci, "r_squared": float(r * r),
                "p_two_tailed": float(p)}
    if method == "spearman":
        rs, p = stats.spearmanr(a, b)
        ci = (_fisher_ci(float(rs), n, math.sqrt(1.06 / (n - 3)), ci_level)
              if n >= 4 else None)
        return {"method": "spearman", "n": n, "r": float(rs),
                "ci_r": ci, "p_two_tailed": float(p)}
    raise ValueError(f"unknown correlation method: {method}")
