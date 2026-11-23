"""Table files for scripts/e2e-import.mjs (P-33), and their reference.

Run from the repository root:
    /home/eren/opendose/.venv/bin/python web/e2e-fixtures/import/make_fixtures.py

dose-response.csv and dose-response.xlsx hold the same table: a titles
row "Dose (uM)", "Rep 1", "Rep 2", "Rep 3", then eight doses in threefold
steps with three responses each. The .xlsx is written by openpyxl. A drop
of either file on the page, or Open, must give the table the Import dialog
gives from the same file on the grid's toolbar; expected.json holds the
cells as openpyxl reads them back from the .xlsx (numbers as their
shortest round-trip text, which is what the app's reader writes).
"""
import csv
import json
from pathlib import Path

import openpyxl

HERE = Path(__file__).resolve().parent

TITLES = ["Dose (uM)", "Rep 1", "Rep 2", "Rep 3"]
DOSES = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3]
RESP = [
    [99.1, 101.4, 98.7], [97.8, 99.5, 100.2], [94.6, 92.1, 95.8], [81.3, 84.7, 79.9],
    [52.4, 49.8, 55.1], [24.9, 21.6, 26.3], [9.7, 11.2, 8.4], [4.1, 3.6, 5.2],
]


def text(v):
    """A number as the app's workbook reader writes it: whole floats
    without ".0", others as Python's shortest round-trip repr."""
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() and abs(v) < 1e15 else repr(v)
    return str(v)


def main():
    rows = [TITLES] + [[d, *r] for d, r in zip(DOSES, RESP)]
    with open(HERE / "dose-response.csv", "w", newline="", encoding="utf-8") as f:
        csv.writer(f, lineterminator="\n").writerows([[text(v) for v in r] for r in rows])
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Dose response"
    for r in rows:
        ws.append(r)
    wb.save(HERE / "dose-response.xlsx")

    back = openpyxl.load_workbook(HERE / "dose-response.xlsx", data_only=True, read_only=True)
    cells = [[text(v) for v in r] for r in back.worksheets[0].iter_rows(values_only=True)]
    expected = {"dose-response": {"titles": cells[0], "rows": cells[1:]}}
    (HERE / "expected.json").write_text(json.dumps(expected, indent=1) + "\n")


if __name__ == "__main__":
    main()
