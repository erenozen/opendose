"""Contingency table analysis (Prism: Analyze -> Contingency).

Prism statistics guide, "Contingency tables":
- 2x2: Fisher's exact test (recommended) or chi-square with/without
  Yates' continuity correction; relative risk and odds ratio with CIs
  (log/Woolf method); difference between proportions; sensitivity &
  specificity with 95% CIs (Wilson).
- Larger tables: chi-square test for independence (+ df).
Rows are outcomes/exposures with counts; layout [[a, b], [c, d]] for 2x2
where row = group, column = outcome.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats


def _wilson_ci(k: int, n: int, ci_level: float = 0.95) -> list:
    z = stats.norm.ppf((1 + ci_level) / 2)
    p = k / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return [center - half, center + half]


def contingency(table, *, yates: bool = True, ci_level: float = 0.95) -> dict:
    grid = np.asarray(table, dtype=float)
    if grid.ndim != 2 or grid.shape[0] < 2 or grid.shape[1] < 2:
        raise ValueError("contingency table must be at least 2x2")
    if np.any(grid < 0):
        raise ValueError("counts must be non-negative")

    out: dict = {"rows": int(grid.shape[0]), "cols": int(grid.shape[1]),
                 "total": float(grid.sum())}

    chi2, p, dof, _ = stats.chi2_contingency(grid, correction=False)
    out["chi_square"] = {"chi2": float(chi2), "df": int(dof), "p": float(p)}

    if grid.shape == (2, 2):
        chi2_y, p_y, _, _ = stats.chi2_contingency(grid, correction=True)
        out["chi_square_yates"] = {"chi2": float(chi2_y), "p": float(p_y)}
        odds, p_fisher = stats.fisher_exact(grid.astype(int))
        out["fisher_exact"] = {"p": float(p_fisher)}
        if not yates:
            out["recommended_p"] = out["chi_square"]["p"]
        a, b = grid[0]
        c, d = grid[1]
        z = stats.norm.ppf((1 + ci_level) / 2)

        if all(v > 0 for v in (a, b, c, d)):
            or_val = (a * d) / (b * c)
            se_log_or = math.sqrt(1 / a + 1 / b + 1 / c + 1 / d)
            out["odds_ratio"] = {
                "value": float(or_val),
                "ci": [float(or_val * math.exp(-z * se_log_or)),
                       float(or_val * math.exp(z * se_log_or))],
            }
        else:
            out["odds_ratio"] = None

        p1 = a / (a + b) if a + b > 0 else None
        p2 = c / (c + d) if c + d > 0 else None
        if p1 is not None and p2 is not None:
            out["proportions"] = {"p1": float(p1), "p2": float(p2),
                                  "difference": float(p1 - p2)}
            if p2 > 0 and a > 0 and c > 0:
                rr = p1 / p2
                se_log_rr = math.sqrt((1 - p1) / a + (1 - p2) / c)
                out["relative_risk"] = {
                    "value": float(rr),
                    "ci": [float(rr * math.exp(-z * se_log_rr)),
                           float(rr * math.exp(z * se_log_rr))],
                }
            else:
                out["relative_risk"] = None
            # sensitivity/specificity when columns = test result
            # (row0 = condition present, row1 = absent)
            if a + b > 0 and c + d > 0:
                out["sensitivity"] = {"value": float(a / (a + b)),
                                      "ci": _wilson_ci(int(a), int(a + b), ci_level)}
                out["specificity"] = {"value": float(d / (c + d)),
                                      "ci": _wilson_ci(int(d), int(c + d), ci_level)}
    return out
