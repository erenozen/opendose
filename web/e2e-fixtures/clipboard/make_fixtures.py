"""Clipboard fixtures for full-precision paste (P-05), and their reference.

Run from the repository root:
    /home/eren/opendose/.venv/bin/python web/e2e-fixtures/clipboard/make_fixtures.py

CONSTRUCTED FROM DOCUMENTATION, NOT CAPTURED. Nobody on this project could
copy from Excel 365, LibreOffice Calc or Google Sheets on a machine that
runs the tests, so each clipboard is written here in the format the
sources below describe. A real capture can replace any file: the e2e step
reads whatever the .html and .txt hold and checks it against expected.json.

  Excel (Windows and Mac)  Cells carry x:num="<stored number>"; x:num with no
      value means the shown text is the number. Excel declares the
      xmlns:x="urn:schemas-microsoft-com:office:excel" namespace.
      Sources: Microsoft, "XML in Excel and the Spreadsheet Component"
      (Office XP developer docs, learn.microsoft.com/en-us/previous-versions/
      office/developer/office-xp/aa140062(v=office.10)); the Microsoft Office
      HTML and XML Reference (Office 2000) that defines x:num and x:str;
      LibreOffice bug 51345 ("x:num attribute is not handled while importing
      HTML files created by Excel 2003"). The Windows clipboard wraps the
      HTML in the CF_HTML header (Version, StartHTML, ..., <!--StartFragment-->),
      Microsoft, "HTML Clipboard Format", learn.microsoft.com/en-us/windows/
      win32/dataxchg/html-clipboard-format. The Windows file writes x:num
      with 17 significant digits (what Excel's HTML writer is reported to
      emit, e.g. 0.33333333333333331); the Mac file the shortest form. The
      parser accepts both, so the exact digit count Excel writes does not
      matter.
  Google Sheets  Cells carry data-sheets-value='{"1":3,"3":<number>}' (type 3
      is a number, 2 text, 4 a boolean) inside <google-sheets-html-origin>.
      Google does not document it; source: iter.ca, "Google Docs HTML"
      (iter.ca/post/docs-html/), which shows {"1":3,"3":6} on a cell showing 6
      and {"1":4,"4":0} for FALSE.
  LibreOffice Calc  Cells carry sdval="<number>" and sdnum="<lang>;0;<format>".
      Sources: Apache OpenOffice issue 127105 and LibreOffice bugs 60071 and
      156638 (Calc writes the value in sdval and the format in sdnum, and the
      attributes travel through the clipboard as well as Save as HTML).

What the reference is: the workbook below is written with openpyxl, then
read back with openpyxl (load_workbook, the stored values and formats);
expected.json holds, for every cell, the value openpyxl reads and the text
the cell's number format shows. The e2e step (scripts/e2e-check.mjs) pastes
each clipboard into a column table and asserts cell by cell: a plain number
holds exactly openpyxl's float; a percent, date or text cell keeps its shown
text (today's path).
"""
import datetime
import json
import math
from pathlib import Path

import openpyxl

HERE = Path(__file__).resolve().parent

# The acceptance column: three values formatted to two decimals.
COLUMN = [(0.123456, "0.00"), (0.234567, "0.00"), (0.345678, "0.00")]

# A wider block: column A plain numbers in several formats, column B what
# keeps its text (percent, date, text) plus two numbers shown exactly.
MIXED = [
    [(0.123456, "0.00"), (0.1234, "0.00%")],
    [(1 / 3, "General"), (datetime.datetime(2024, 1, 5), "yyyy-mm-dd")],
    [(12.4, "0"), ("ctrl", "General")],
    [(-0.000123456, "0.00E+00"), (7, "General")],
    [(1234.5, "0.0"), (2.5e-7, "General")],
]


def shown(value, fmt):
    """The text Excel shows for value in fmt (only the formats used here)."""
    if isinstance(value, str):
        return value
    if isinstance(value, datetime.datetime):
        return value.strftime("%Y-%m-%d")
    if fmt == "0.00":
        return f"{value:.2f}"
    if fmt == "0.0":
        return f"{value:.1f}"
    if fmt == "0":
        return f"{value:.0f}"
    if fmt == "0.00%":
        return f"{value * 100:.2f}%"
    if fmt == "0.00E+00":
        m, e = f"{value:.2E}".split("E")
        return f"{m}E{int(e):+03d}"
    if fmt == "General":
        if float(value).is_integer():
            return str(int(value))
        # General: up to 10 significant digits for small and large magnitudes
        if abs(value) < 1e-4:
            m, e = f"{value:.5E}".split("E")
            return f"{m.rstrip('0').rstrip('.')}E{int(e):+03d}"
        return f"{value:.10g}"
    raise ValueError(fmt)


def write_book(path, blocks):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "column"
    for r, (v, fmt) in enumerate(blocks["column"], start=1):
        c = ws.cell(row=r, column=1, value=v)
        c.number_format = fmt
    ws2 = wb.create_sheet("mixed")
    for r, row in enumerate(blocks["mixed"], start=1):
        for k, (v, fmt) in enumerate(row, start=1):
            c = ws2.cell(row=r, column=k, value=v)
            c.number_format = fmt
    wb.save(path)


def read_book(path):
    """Every cell as openpyxl reads it back: stored value, format, kind."""
    wb = openpyxl.load_workbook(path)
    out = {}
    for ws in wb.worksheets:
        rows = []
        for row in ws.iter_rows():
            cells = []
            for c in row:
                v = c.value
                if isinstance(v, datetime.datetime):
                    kind, value = "date", v.isoformat()
                elif isinstance(v, str):
                    kind, value = "text", v
                elif "%" in c.number_format:
                    kind, value = "percent", float(v)
                else:
                    kind, value = "number", float(v)
                cells.append({"addr": c.coordinate, "kind": kind, "value": value,
                              "format": c.number_format,
                              "shown": shown(c.value, c.number_format)})
            rows.append(cells)
        out[ws.title] = rows
    return out


def excel_serial(d):
    return (d - datetime.datetime(1899, 12, 30)).days


def excel_num(v, digits17):
    return f"{v:.17g}" if digits17 else repr(float(v))


def excel_html(rows, digits17, windows):
    trs = []
    for row in rows:
        tds = []
        for c in row:
            if c["kind"] == "text":
                tds.append(f'<td class=xl66 x:str>{c["shown"]}</td>')
            elif c["kind"] == "date":
                d = datetime.datetime.fromisoformat(c["value"])
                tds.append(f'<td class=xl67 align=right x:num="{excel_serial(d)}">{c["shown"]}</td>')
            elif c["shown"] == repr(c["value"]) or (c["value"].is_integer() and c["shown"] == str(int(c["value"]))):
                # shown exactly: Excel writes a bare x:num
                tds.append(f'<td align=right x:num>{c["shown"]}</td>')
            else:
                tds.append(f'<td class=xl65 align=right x:num="{excel_num(c["value"], digits17)}">{c["shown"]}</td>')
        trs.append(" <tr height=20 style='height:15.0pt'>\n  " + "\n  ".join(tds) + "\n </tr>")
    body = ("<html xmlns:v=\"urn:schemas-microsoft-com:vml\"\n"
            "xmlns:o=\"urn:schemas-microsoft-com:office:office\"\n"
            "xmlns:x=\"urn:schemas-microsoft-com:office:excel\"\n"
            "xmlns=\"http://www.w3.org/TR/REC-html40\">\n<head>\n"
            "<meta name=ProgId content=Excel.Sheet>\n<meta name=Generator content=\"Microsoft Excel 15\">\n"
            "<style>\n.xl65 {mso-number-format:\"0\\.00\";}\n.xl66 {mso-number-format:\"\\@\";}\n"
            ".xl67 {mso-number-format:\"yyyy\\-mm\\-dd\";}\n</style>\n</head>\n<body link=\"#0563C1\">\n"
            "<table border=0 cellpadding=0 cellspacing=0 style='border-collapse:collapse'>\n"
            "<!--StartFragment-->\n" + "\n".join(trs) + "\n<!--EndFragment-->\n</table>\n</body>\n</html>\n")
    if not windows:
        return body
    # CF_HTML: byte offsets of the HTML and the fragment in the clipboard data
    head = "Version:0.9\r\nStartHTML:{:010d}\r\nEndHTML:{:010d}\r\nStartFragment:{:010d}\r\nEndFragment:{:010d}\r\n"
    n = len(head.format(0, 0, 0, 0).encode())
    raw = body.encode()
    sf = n + raw.index(b"<!--StartFragment-->") + len(b"<!--StartFragment-->")
    ef = n + raw.index(b"<!--EndFragment-->")
    return head.format(n, n + len(raw), sf, ef) + body


def sheets_html(rows):
    def attr(c):
        if c["kind"] == "text":
            j = {"1": 2, "2": c["value"]}
        elif c["kind"] == "date":
            d = datetime.datetime.fromisoformat(c["value"])
            j = {"1": 3, "3": excel_serial(d)}
        else:
            j = {"1": 3, "3": c["value"]}
        return json.dumps(j, separators=(",", ":")).replace('"', "&quot;")
    trs = "".join("<tr style=\"height:21px;\">" + "".join(
        f'<td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;" '
        f'data-sheets-value="{attr(c)}">{c["shown"]}</td>' for c in row) + "</tr>" for row in rows)
    return ("<meta charset='utf-8'><google-sheets-html-origin><style type=\"text/css\"><!--td "
            "{border: 1px solid #cccccc;}br {mso-data-placement:same-cell;}--></style>"
            "<table xmlns=\"http://www.w3.org/1999/xhtml\" cellspacing=\"0\" cellpadding=\"0\" dir=\"ltr\" "
            "border=\"1\" style=\"table-layout:fixed;font-size:10pt;font-family:Arial;width:0px;"
            "border-collapse:collapse;border:none\"><colgroup><col width=\"100\"/></colgroup><tbody>"
            + trs + "</tbody></table></google-sheets-html-origin>")


def calc_html(rows):
    fmt_code = {"0.00": "0.00", "0.0": "0.0", "0": "0", "0.00%": "0.00%", "0.00E+00": "0.00E+00",
                "General": "General", "yyyy-mm-dd": "YYYY-MM-DD"}
    tds_rows = []
    for row in rows:
        tds = []
        for c in row:
            if c["kind"] == "text":
                tds.append(f'<td height="17" align="left">{c["shown"]}</td>')
                continue
            if c["kind"] == "date":
                d = datetime.datetime.fromisoformat(c["value"])
                v = str(excel_serial(d))
            else:
                v = repr(c["value"])
            tds.append(f'<td align="right" sdval="{v}" sdnum="1033;0;{fmt_code[c["format"]]}">{c["shown"]}</td>')
        tds_rows.append("\t<tr>\n\t\t" + "\n\t\t".join(tds) + "\n\t</tr>")
    return ("<!DOCTYPE HTML PUBLIC \"-//W3C//DTD HTML 4.0 Transitional//EN\">\n<html>\n<head>\n"
            "\t<meta http-equiv=\"content-type\" content=\"text/html; charset=utf-8\"/>\n"
            "\t<meta name=\"generator\" content=\"LibreOffice 24.8\"/>\n</head>\n<body>\n"
            "<table cellspacing=\"0\" border=\"0\">\n\t<colgroup width=\"85\"></colgroup>\n"
            + "\n".join(tds_rows) + "\n</table>\n</body>\n</html>\n")


def plain(rows, newline, trailing):
    text = newline.join("\t".join(c["shown"] for c in row) for row in rows)
    return text + (newline if trailing else "")


def main():
    book = HERE / "workbook.xlsx"
    write_book(book, {"column": COLUMN, "mixed": MIXED})
    ref = read_book(book)
    for name, rows in ref.items():
        files = {
            f"{name}.excel-windows.html": excel_html(rows, digits17=True, windows=True),
            f"{name}.excel-windows.txt": plain(rows, "\r\n", True),
            f"{name}.excel-mac.html": excel_html(rows, digits17=False, windows=False),
            f"{name}.excel-mac.txt": plain(rows, "\n", True),
            f"{name}.sheets.html": sheets_html(rows),
            f"{name}.sheets.txt": plain(rows, "\n", False),
            f"{name}.calc.html": calc_html(rows),
            f"{name}.calc.txt": plain(rows, "\n", True),
        }
        for fn, text in files.items():
            (HERE / fn).write_text(text, encoding="utf-8", newline="")
    # The HTML of a copy whose table does not line up with its text (a row
    # the text lacks): the values as shown are used, and the report says so.
    rows = ref["column"]
    (HERE / "column.mismatch.html").write_text(excel_html(rows + [rows[0]], True, False), encoding="utf-8")
    for name, rows in ref.items():
        for row in rows:
            for c in row:
                if c["kind"] == "number":
                    assert math.isfinite(c["value"])
    (HERE / "expected.json").write_text(json.dumps(ref, indent=1) + "\n", encoding="utf-8")
    print("wrote", sorted(p.name for p in HERE.iterdir()))


if __name__ == "__main__":
    main()
