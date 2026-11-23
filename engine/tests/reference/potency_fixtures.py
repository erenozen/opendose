"""Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/potency_fixtures.py

Writes web/e2e-fixtures/potency-experiments.json (no replicate map: the
e2e assigns it through the UI) and web/e2e-fixtures/stage/potency.json
(with the map, and a second compound whose third experiment is flat)."""
import json
from pathlib import Path

root = str(Path(__file__).resolve().parents[3])
ref = json.load(open(f"{root}/engine/tests/reference/potency_across_experiments.json"))
PREFS = {"defaultTableType": "xy", "errorBars": "sd", "ciMethod": "asymptotic",
         "scheme": "default", "digits": 4}


def table(datasets, replicates=None):
    t = {"type": "xy", "x": ref["x"], "xTitle": "[Conc.]", "xFormat": "numbers", "xUnit": "M",
         "yTitle": "", "rowTitles": [""] * len(ref["x"]),
         "datasets": [{"name": n, "rows": [[f"{v:.1f}" for v in r] for r in rows]}
                      for n, rows in datasets],
         "subcolumnFormat": "replicates", "replicateLayout": "side_by_side"}
    if replicates:
        t["replicates"] = replicates
    return t


def project(title, name, datasets, replicates=None):
    return {"opendose_project": 2, "version": 2, "title": title, "prefs": PREFS,
            "selected": "r1",
            "sheets": [
                {"id": "d1", "kind": "data", "name": name, "table": table(datasets, replicates)},
                {"id": "r1", "kind": "results", "parentId": "d1", "analysis": "nonlin",
                 "name": f"Nonlin fit of {name}", "options": {"autoFit": "requested"}},
                {"id": "g1", "kind": "graph", "parentId": "d1", "resultsId": "r1",
                 "graphType": "xy", "name": f"Graph of {name}",
                 "settings": {"titles": {"x": "", "y": ""}, "scheme": "default"}},
            ]}


rows = ref["rows"]
flat = [r[:6] + [50.0, 50.0, 50.0] for r in rows]
blocks = {"by": "subcolumns", "of": ref["experiments_of_subcolumn"], "unit": "wells"}
open(f"{root}/web/e2e-fixtures/potency-experiments.json", "w").write(
    json.dumps(project("Potency across experiments", "Three experiments", [("Compound A", rows)]),
               indent=1) + "\n")
open(f"{root}/web/e2e-fixtures/stage/potency.json", "w").write(
    json.dumps(project("Potency across experiments", "Three experiments",
                       [("Compound A", rows), ("Compound B", flat)], blocks), indent=1) + "\n")
