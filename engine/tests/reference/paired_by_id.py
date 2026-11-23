"""Independent reference for pairing by subject ID (FEATURE-PLAN P-38).

Six mice, M1 to M6, measured before and after, given as a long table in a
shuffled order (web/e2e-fixtures/import/paired_long.csv). Paired by the
ID, the paired t test of after - before is scipy.stats.ttest_rel on the
hand-aligned columns. Paired by the order the records come in (the first
"before" with the first "after", and so on) the test is a different,
wrong one: both are written, so a check can tell them apart.

R is not installed here; the oracle is scipy (1.18 in the project venv).

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/paired_by_id.py
writes paired_by_id.json next to this file.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

from scipy import stats

HERE = Path(__file__).resolve().parent
CSV = HERE.parents[2] / "web" / "e2e-fixtures" / "import" / "paired_long.csv"

# the hand-aligned wide table: one row per mouse
WIDE = {
    "M1": (12.1, 14.3), "M2": (10.4, 11.9), "M3": (13.8, 13.1),
    "M4": (9.7, 12.6), "M5": (11.2, 13.4), "M6": (12.9, 15.0),
}


def main() -> None:
    with CSV.open(newline="") as f:
        records = list(csv.DictReader(f))
    # the long file holds exactly the wide table's values
    by_id = {(r["mouse"], r["time"]): float(r["value"]) for r in records}
    assert len(by_id) == len(records) == 12
    for m, (b, a) in WIDE.items():
        assert by_id[(m, "before")] == b and by_id[(m, "after")] == a
    ids = list(WIDE)
    before = [WIDE[m][0] for m in ids]
    after = [WIDE[m][1] for m in ids]
    t = stats.ttest_rel(after, before)
    diffs = [a - b for a, b in zip(after, before)]
    # by order of appearance in the long file (what pairing must not do)
    b_order = [float(r["value"]) for r in records if r["time"] == "before"]
    a_order = [float(r["value"]) for r in records if r["time"] == "after"]
    wrong = stats.ttest_rel(a_order, b_order)
    out = {
        "source": "scipy.stats.ttest_rel, after - before, two-sided",
        "by_id": {"t": float(t.statistic), "df": int(t.df), "p": float(t.pvalue),
                  "mean_diff": sum(diffs) / len(diffs)},
        "by_order": {"t": float(wrong.statistic), "p": float(wrong.pvalue)},
    }
    (HERE / "paired_by_id.json").write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
