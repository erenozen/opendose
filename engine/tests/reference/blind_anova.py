"""A four-group table for blinding (FEATURE-PLAN P-124), and its one-way
ANOVA by scipy, so the e2e suite can check that blinding changes no
number: the P the results show before blinding, while blind (groups
coded A to D) and after unblinding is this one.

Blinding adds no computation (it renames the groups); the engine's
one-way ANOVA is pinned elsewhere (test_prism_parity.py). The reference
here is scipy.stats.f_oneway on the same values, an implementation that
shares no code with the engine.

Writes web/e2e-fixtures/blind-4groups.json (a project: the table, a
one-way ANOVA with Tukey, its graph; one sheet name still says
"Vehicle", which the blinding dialog lists) and
engine/tests/reference/blind_anova.json. Run from the repository root:
    PYTHONPATH=engine /home/eren/opendose/.venv/bin/python engine/tests/reference/blind_anova.py
"""

from __future__ import annotations

import json
import pathlib

from scipy import stats

ROOT = pathlib.Path(__file__).resolve().parents[3]
GROUPS = {
    "Vehicle": [21.4, 23.9, 22.7, 25.1, 20.8, 24.2],
    "Low dose": [23.8, 26.1, 22.9, 25.7, 24.4, 27.0],
    "High dose": [26.3, 24.8, 28.9, 27.4, 25.6, 29.1],
    "Positive control": [22.0, 25.3, 23.1, 21.9, 24.6, 23.5],
}


def project() -> dict:
    n = max(len(v) for v in GROUPS.values())
    return {
        "opendose_project": 2, "version": 2, "title": "Blinding study",
        "prefs": {"defaultTableType": "column", "errorBars": "sd", "ciMethod": "asymptotic",
                  "scheme": "default", "digits": 4},
        "sheets": [
            {"id": "d1", "kind": "data", "name": "Body weight", "table": {
                "type": "column", "x": [""] * n, "xTitle": "", "xFormat": "numbers", "xUnit": "",
                "yTitle": "Body weight (g)", "rowTitles": [""] * n,
                "datasets": [{"name": k, "rows": [[f"{x:g}"] for x in v]} for k, v in GROUPS.items()],
                "subcolumnFormat": "replicates", "replicateLayout": "side_by_side"}},
            {"id": "r1", "kind": "results", "parentId": "d1", "analysis": "column",
             "options": {"analysis": "anova", "comparisons": "tukey"}, "name": "One-way ANOVA of Body weight"},
            {"id": "g1", "kind": "graph", "parentId": "d1", "resultsId": "r1", "graphType": "scatter",
             "settings": {"titles": {"x": "", "y": "Body weight (g)"}, "scheme": "default"},
             "name": "Vehicle and doses"},
        ],
        "selected": "d1",
    }


def main() -> None:
    f, p = stats.f_oneway(*GROUPS.values())
    (ROOT / "web" / "e2e-fixtures" / "blind-4groups.json").write_text(json.dumps(project(), indent=1) + "\n")
    out = {"F": float(f), "P": float(p), "F_4sig": f"{f:.4g}", "P_4sig": f"{p:.4g}",
           "df": [len(GROUPS) - 1, sum(len(v) for v in GROUPS.values()) - len(GROUPS)]}
    pathlib.Path(__file__).with_suffix(".json").write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out))


if __name__ == "__main__":
    main()
