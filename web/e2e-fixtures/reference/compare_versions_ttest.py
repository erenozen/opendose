"""Reference values for P-73 (compare two versions), e2e-project.

The project e2e-fixtures/project-study.json: Control and Treated, six
values each, compared by Welch's unpaired t test. The second version
excludes Control row 4 (14.1). Independent oracle: scipy.stats.ttest_ind
(equal_var=False), not the OpenDose engine.

    /home/eren/opendose/.venv/bin/python -I web/e2e-fixtures/reference/compare_versions_ttest.py
writes compare_versions_ttest.json next to this file.
"""
import json
from pathlib import Path

import numpy as np
import scipy
from scipy import stats

CONTROL = [10.2, 11.5, 9.8, 14.1, 10.9, 11.3]
TREATED = [11.9, 12.8, 11.4, 13.6, 12.7, 13.1]
EXCLUDED_ROW = 3  # 0-based: row 4, the 14.1


def run(control):
    r = stats.ttest_ind(TREATED, control, equal_var=False)
    return {
        "n_control": len(control),
        "t": float(r.statistic),
        "df": float(r.df),
        "p": float(r.pvalue),
        "difference": float(np.mean(TREATED) - np.mean(control)),
    }


out = {
    "source": f"scipy.stats.ttest_ind (Welch, equal_var=False), scipy {scipy.__version__}",
    "before": run(CONTROL),
    "after": run([v for i, v in enumerate(CONTROL) if i != EXCLUDED_ROW]),
}
Path(__file__).with_suffix(".json").write_text(json.dumps(out, indent=2) + "\n")
print(json.dumps(out, indent=2))
