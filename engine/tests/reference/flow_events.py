"""Independent reference for the flow event-count calculator
(FEATURE-PLAN P-50).

- Events to acquire: Roederer (2008, Cytometry A 73:384), counting is
  Poisson, so r positive events give CV = 1/sqrt(r); a target CV needs
  r = 1/CV^2 and r / frequency events in all. Worked with fractions
  (exact rational arithmetic, not floats): 10% CV -> 100 positive
  events, at 0.1% -> 100,000 events; 5% -> 400; 1% at 0.01% -> 10,000
  positive, 100,000,000 in all.
- CI of a gated percentage: the Wilson score interval from statsmodels
  proportion_confint(method="wilson") and scipy binomtest().proportion_ci
  (method="wilson"), which must agree, for 120 of 50,000.

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/flow_events.py
writes flow_events.json next to this file.
"""

from __future__ import annotations

import json
import math
from fractions import Fraction
from pathlib import Path

from scipy import stats
from statsmodels.stats.proportion import proportion_confint

HERE = Path(__file__).resolve().parent


def plan(cv_pct, freq_pct):
    cv, f = Fraction(str(cv_pct)) / 100, Fraction(str(freq_pct)) / 100
    pos = math.ceil(1 / cv ** 2)
    return {"target_cv_pct": cv_pct, "frequency_pct": freq_pct,
            "positive_events": pos, "total_events": math.ceil(Fraction(pos) / f)}


def observed(k, n, level=0.95):
    sm = proportion_confint(k, n, alpha=1 - level, method="wilson")
    sp = stats.binomtest(k, n).proportion_ci(confidence_level=level, method="wilson")
    assert abs(sm[0] - sp.low) < 1e-12 and abs(sm[1] - sp.high) < 1e-12
    return {"positive": k, "total": n, "percent": 100 * k / n,
            "ci_pct": [100 * sm[0], 100 * sm[1]],
            "count_cv_pct": 100 / math.sqrt(k) if k else None}


def main():
    out = {
        "plans": [plan(10, 0.1), plan(5, 1), plan(1, 0.01), plan(3, 2.5)],
        "observed": [observed(120, 50000), observed(0, 1000), observed(50, 50),
                     observed(7, 20, 0.99)],
    }
    (HERE / "flow_events.json").write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
