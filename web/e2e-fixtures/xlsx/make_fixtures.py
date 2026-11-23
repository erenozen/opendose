"""Workbooks for the xlsx import report (P-06), and their reference.

Run from the repository root:
    /home/eren/opendose/.venv/bin/python web/e2e-fixtures/xlsx/make_fixtures.py

formulas-uncached.xlsx (workbook A): x in A2:A6, and =A2*2 ... =A6*2 in
    B2:B6. openpyxl writes formulas without a cached result (it has no
    calculation engine), so a reader of cached values (openpyxl with
    data_only=True, the app's reader) sees B2:B6 blank.
filter-hidden.xlsx (workbook B): sheet "filtered" has an AutoFilter on
    A1:B10 with rows 4 to 6 hidden, which is what Excel writes when a filter
    hides them (row/@hidden="1" inside the worksheet's autoFilter range);
    sheet "by hand" has row 3 hidden and no filter.

The outside reference for B is Excel's documented copy behaviour, which
cannot be run here: copying a filtered range copies the visible rows
(Microsoft, "Copy visible cells only", support.microsoft.com/office/
6e3a1f01-2884-4332-b262-8b814412847e, notes that a filtered table copies
only its visible cells; the same page says a plain range copies hidden
cells by default, which is why rows hidden by hand are kept by default).
The hidden flags and formulas themselves are read back below with
openpyxl in normal mode (data_only=False) and with data_only=True, and
written to expected.json, which the unit test and the e2e step assert
against.
"""
import json
from pathlib import Path

import openpyxl

HERE = Path(__file__).resolve().parent


def workbook_a(path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "doubled"
    ws.append(["x", "y"])
    for i in range(1, 6):
        ws.append([i, f"=A{i + 1}*2"])
    wb.save(path)


def workbook_b(path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "filtered"
    ws.append(["Dose", "Response"])
    for i, (d, r) in enumerate([(0.1, 98.5), (0.3, 95.1), (1, 80.2), (3, 51.7), (10, 22.4),
                                (30, 9.8), (100, 4.1), (300, 2.2), (1000, 1.5)], start=2):
        ws.append([d, r])
    ws.auto_filter.ref = "A1:B10"
    for r in (4, 5, 6):
        ws.row_dimensions[r].hidden = True
    hand = wb.create_sheet("by hand")
    hand.append(["Dose", "Response"])
    for d, r in [(1, 90.0), (2, 70.0), (3, 50.0), (4, 30.0)]:
        hand.append([d, r])
    hand.row_dimensions[3].hidden = True
    wb.save(path)


def reference(path):
    formulas = openpyxl.load_workbook(path, data_only=False)
    values = openpyxl.load_workbook(path, data_only=True)
    out = {}
    for ws in formulas.worksheets:
        wv = values[ws.title]
        blank = [c.coordinate for row in ws.iter_rows() for c in row
                 if isinstance(c.value, str) and c.value.startswith("=")
                 and wv[c.coordinate].value is None]
        hidden = sorted(r for r, d in ws.row_dimensions.items() if d.hidden)
        rows = [[("" if v is None else v) for v in row] for row in wv.iter_rows(values_only=True)]
        out[ws.title] = {"blankFormulas": blank, "hiddenRows": hidden,
                         "autoFilter": ws.auto_filter.ref, "rows": rows}
    return out


def main():
    a = HERE / "formulas-uncached.xlsx"
    b = HERE / "filter-hidden.xlsx"
    workbook_a(a)
    workbook_b(b)
    ref = {a.name: reference(a), b.name: reference(b)}
    assert ref[a.name]["doubled"]["blankFormulas"] == ["B2", "B3", "B4", "B5", "B6"]
    assert ref[b.name]["filtered"]["hiddenRows"] == [4, 5, 6]
    assert ref[b.name]["by hand"]["hiddenRows"] == [3]
    (HERE / "expected.json").write_text(json.dumps(ref, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(ref)[:400])


if __name__ == "__main__":
    main()
