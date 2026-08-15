"""Generate the synthetic Prism-project fixture (synthetic_project.prism).

Fully fabricated data; no measurements from any real experiment. The
archive mirrors the layout Prism 10/11 writes so the importer is exercised
against the real structure:

  - one XY data sheet, two Y data sets of 3 replicates, X = dose
  - one analysis-backing sheet and one 999-point curve sheet, neither of
    which is listed under document.json's "data" role, so both must be
    ignored on import
  - a blank cell, to check that a gap arrives as None rather than 0

Y values follow an exact 4PL with hill = 1, midpoint 3.0:

    y(d) = BOTTOM + (TOP - BOTTOM) / (1 + d / 3.0)

Run this script to (re)create the fixture.
"""

import json
import zipfile
from pathlib import Path

OUT = Path(__file__).parent / "synthetic_project.prism"

DOSES = [0.0, 0.3, 1.0, 3.0, 10.0, 30.0]
TOP, BOTTOM, MID = 100.0, 0.0, 3.0
OFFSETS = (-1.0, 0.0, 1.0)          # cancel in the mean
SETS = [("Line Alpha", 1.0), ("Line Beta", 4.0)]   # midpoint multiplier

DATA_SHEET = "11111111-1111-1111-1111-111111111111"
DATA_TABLE = "22222222-2222-2222-2222-222222222222"
X_SET = "33333333-3333-3333-3333-333333333333"
Y_SETS = ["44444444-4444-4444-4444-444444444444",
          "55555555-5555-5555-5555-555555555555"]
# Sheets that exist in the archive but are analysis output, not data.
VIEW_SHEET = "66666666-6666-6666-6666-666666666666"
VIEW_TABLE = "77777777-7777-7777-7777-777777777777"


def y_at(dose, mult):
    return BOTTOM + (TOP - BOTTOM) / (1.0 + dose / (MID * mult))


def data_csv():
    rows = []
    for i, dose in enumerate(DOSES):
        cells = [f"{dose:g}"]
        for _, mult in SETS:
            for k, off in enumerate(OFFSETS):
                # one deliberate gap, to prove empty imports as missing
                if i == 1 and k == 2 and mult == 1.0:
                    cells.append("")
                else:
                    cells.append(f"{y_at(dose, mult) + off:.6f}")
        rows.append(",".join(cells))
    return "\n".join(rows) + "\n"


def main():
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("document.json", json.dumps({
            "@class": "Document",
            "createdBy": {"name": "Prism", "version": "11.0.0"},
            # Only the data sheet is listed here; the view sheet is not.
            "sheets": {"data": [DATA_SHEET], "analyses": [VIEW_SHEET],
                       "graphs": [], "info": []},
        }, indent=1))

        z.writestr(f"data/sheets/{DATA_SHEET}/sheet.json", json.dumps({
            "@class": "DataSheet",
            "title": "Dose response",
            "table": {
                "@class": "XYDataTable", "uid": DATA_TABLE,
                "format": "xy", "dataFormat": "y_replicates",
                "replicatesCount": 3, "dataSets": Y_SETS,
                "xDataSetFormat": "y_single", "xDataSet": X_SET,
            },
        }, indent=1))
        z.writestr(f"data/tables/{DATA_TABLE}/data.csv", data_csv())
        z.writestr(f"data/tables/{DATA_TABLE}/content.json", json.dumps(
            {"numberOfColumns": 1 + 3 * len(SETS), "numberOfRows": len(DOSES)}))

        z.writestr(f"data/sets/{X_SET}.json", json.dumps(
            {"@class": "DataSet", "uid": X_SET, "format": "y_single",
             "title": "Dose (uM)", "attributes": ["DS_ATTR_X"]}, indent=1))
        for uid, (title, _) in zip(Y_SETS, SETS):
            z.writestr(f"data/sets/{uid}.json", json.dumps(
                {"@class": "DataSet", "uid": uid, "format": "y_replicates",
                 "title": title, "attributes": ["DS_ATTR_Y"]}, indent=1))

        # Analysis output that must not be imported as data.
        z.writestr(f"data/sheets/{VIEW_SHEET}/sheet.json", json.dumps({
            "@class": "DataSheet",
            "title": "Nonlin fit of Dose response:Table of results",
            "table": {"@class": "DataTable", "uid": VIEW_TABLE,
                      "format": "view", "dataFormat": "text",
                      "dataSets": ["99999999-9999-9999-9999-999999999999"]},
        }, indent=1))
        z.writestr(f"data/tables/{VIEW_TABLE}/data.csv",
                   "Best-fit values,,\n     LogIC50,0.4771,1.0792\n")

    print(f"wrote {OUT}")
    for dose in DOSES:
        print(f"  dose {dose:>5g}  alpha {y_at(dose, 1.0):8.4f}"
              f"  beta {y_at(dose, 4.0):8.4f}")


if __name__ == "__main__":
    main()
