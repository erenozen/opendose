"""One sheet saved by LibreOffice as .xls, .ods and .xlsx (P-34), and its
reference.

Run from the repository root (needs LibreOffice's soffice on the PATH):
    /home/eren/opendose/.venv/bin/python web/e2e-fixtures/import/make_workbooks.py

How the files are made: openpyxl writes a source workbook (a temporary
file) with the sheets below; LibreOffice (soffice --headless
--convert-to) opens it, recalculates its formulas, and saves it as
workbook.ods; LibreOffice then opens workbook.ods and saves it as
workbook.xls (Excel 97-2003, BIFF8) and as workbook.xlsx. So all three
files are written by the same LibreOffice from the same sheet, as a lab
saving one sheet in three formats would.

Sheet "Assay" holds every kind of cell an instrument sheet has: text with
µ and °, a code with a leading zero, whole and fractional numbers, a third
(0.333...), 1e-9 and 1e23 magnitudes, a percent-formatted 0.125, a date, a
date with a time, a time of day, TRUE and FALSE, a formula with its saved
result, a formula error (#DIV/0!), a blank cell inside the block, a
two-line text and a row hidden by hand (row 7). Sheet "Plate 2" is small,
to check that every sheet is listed.

The reference is openpyxl's reading of workbook.xlsx (data_only=True, the
cached values), written to workbook.expected.json as cell text by the rule
the app's reader follows (engine/opendose/workbooks.py cell_text, restated
here so the reference does not import the code it checks), with the
hidden rows openpyxl reports. engine/tests/test_workbooks.py and
scripts/e2e-import.mjs assert that .xls and .ods read to these cells.
"""
import datetime
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import openpyxl

HERE = Path(__file__).resolve().parent


def text(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, datetime.datetime):
        return v.date().isoformat() if v.time() == datetime.time(0) else v.isoformat(sep=" ", timespec="minutes")
    if isinstance(v, (datetime.date, datetime.time)):
        return v.isoformat()
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() and abs(v) < 1e15 else repr(v)
    return str(v)


def source(path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Assay"
    ws.append(["Well", "Value", "Fraction", "Read on", "Time", "Pass", "Note"])
    ws.append(["A1", 0.1, 0.125, datetime.date(2024, 3, 15), datetime.time(10, 30), True, "5 µM at 37 °C"])
    ws.append(["A2", 1 / 3, 0.5, datetime.datetime(2024, 3, 15, 10, 30), datetime.time(23, 59, 59), False, "007"])
    ws.append(["A3", -2.5e-9, 1.0, datetime.date(1999, 12, 31), None, True, "=B2*2"])
    ws.append(["A4", 6.02214076e23, 0.075, None, None, None, "=1/0"])
    ws.append(["A5", 123456789012, 0.0, datetime.date(2024, 2, 29), None, None, "below is hidden"])
    ws.append(["A6", 42, 2.5, None, None, None, "hidden by hand"])
    ws.append(["A7", None, -0.25, None, None, None, "line one\nline two"])
    ws.append(["A8", 2.0, 0.3333, None, None, None, None])
    for r in range(2, 10):
        ws.cell(r, 3).number_format = "0.0%"
        ws.cell(r, 4).number_format = "yyyy-mm-dd hh:mm" if r == 3 else "yyyy-mm-dd"
        ws.cell(r, 5).number_format = "hh:mm:ss"
    ws.row_dimensions[7].hidden = True
    p2 = wb.create_sheet("Plate 2")
    p2.append(["x", "y"])
    p2.append([1, 2.5])
    p2.append([2, 4.75])
    wb.save(path)


def convert(src, fmt, outdir, profile):
    filt = {"ods": "ods", "xls": "xls:MS Excel 97", "xlsx": "xlsx:Calc MS Excel 2007 XML"}[fmt]
    subprocess.run(["soffice", f"-env:UserInstallation=file://{profile}", "--headless",
                    "--convert-to", filt, "--outdir", str(outdir), str(src)],
                   check=True, capture_output=True)


def main():
    if not shutil.which("soffice"):
        raise SystemExit("LibreOffice (soffice) is needed to write the fixtures")
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        profile = tmp / "profile"
        src = tmp / "workbook.xlsx"
        source(src)
        ods_dir = tmp / "ods"
        convert(src, "ods", ods_dir, profile)
        shutil.copy(ods_dir / "workbook.ods", HERE / "workbook.ods")
        for fmt in ("xls", "xlsx"):
            convert(HERE / "workbook.ods", fmt, tmp / fmt, profile)
            shutil.copy(tmp / fmt / f"workbook.{fmt}", HERE / f"workbook.{fmt}")

    wb = openpyxl.load_workbook(HERE / "workbook.xlsx", data_only=True)
    sheets = []
    for ws in wb.worksheets:
        rows = [[text(v) for v in r] for r in ws.iter_rows(values_only=True)]
        for r in rows:
            while r and r[-1] == "":
                r.pop()
        while rows and not rows[-1]:
            rows.pop()
        hidden = sorted(i - 1 for i, d in ws.row_dimensions.items() if d.hidden and i - 1 < len(rows))
        sheets.append({"name": ws.title, "rows": rows, "manualHidden": hidden})
    (HERE / "workbook.expected.json").write_text(json.dumps(sheets, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
