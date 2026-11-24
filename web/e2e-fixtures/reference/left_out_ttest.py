"""Reference values for P-68 (leave a value out of one analysis), e2e-results.

The built-in "Two-group t test" template (web/src/app/templates.ts): Control
and Treated, six values each, compared by Student's unpaired t test. The
sensitivity copy leaves Control row 3 (21.8) out. Independent oracle:
scipy.stats.ttest_ind (equal variances), not the OpenDose engine.

    /home/eren/opendose/.venv/bin/python -I web/e2e-fixtures/reference/left_out_ttest.py
writes left_out_ttest.json next to this file.
"""
import json
from pathlib import Path

import numpy as np
from scipy import stats

CONTROL = [23.1, 25.4, 21.8, 24.9, 22.6, 26.0]
TREATED = [28.4, 30.2, 27.1, 31.5, 29.0, 28.8]
LEFT_OUT_ROW = 2  # 0-based: row 3, the 21.8


def run(control):
    r = stats.ttest_ind(TREATED, control)
    ci = r.confidence_interval(0.95)
    return {
        "n_control": len(control),
        "t": float(r.statistic),
        "df": float(r.df),
        "p": float(r.pvalue),
        "difference": float(np.mean(TREATED) - np.mean(control)),
        "ci": [float(ci.low), float(ci.high)],
    }


out = {
    "source": "scipy.stats.ttest_ind (Student, equal variances), scipy "
              + __import__("scipy").__version__,
    "all_values": run(CONTROL),
    "left_out": run([v for i, v in enumerate(CONTROL) if i != LEFT_OUT_ROW]),
}
Path(__file__).with_suffix(".json").write_text(json.dumps(out, indent=2) + "\n")
print(json.dumps(out, indent=2))
