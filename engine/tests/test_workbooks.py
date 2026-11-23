"""Workbook readers (P-34): one sheet saved by LibreOffice as .xls, .ods and
.xlsx reads to identical cells, equal to openpyxl's reading of the .xlsx.

Fixtures and reference: web/e2e-fixtures/import/make_workbooks.py (how
each file was made is in its docstring) and workbook.expected.json, which
holds openpyxl's reading of workbook.xlsx. xlrd is not in the test
environment's requirements: the test uses the wheel the web app vendors
(web/public/pyodide/, written by `npm run sync-pyodide`, or its download
cache) when xlrd itself is not installed.
"""
import datetime
import glob
import io
import json
import os
import sys
import zipfile

import pytest

from opendose import workbooks

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FIX = os.path.join(ROOT, "web", "e2e-fixtures", "import")
REF = json.load(open(os.path.join(FIX, "workbook.expected.json"), encoding="utf-8"))


def _xlrd_available():
    try:
        import xlrd  # noqa: F401
        return True
    except ImportError:
        pass
    pats = [os.path.join(ROOT, "web", "public", "pyodide", "v*", "xlrd-*.whl"),
            os.path.join(ROOT, "web", "node_modules", ".cache", "opendose-pyodide", "v*", "xlrd-*.whl")]
    for p in pats:
        for whl in sorted(glob.glob(p)):
            sys.path.insert(0, whl)   # a pure-Python wheel imports as a zip
            try:
                import xlrd  # noqa: F401
                return True
            except ImportError:
                sys.path.remove(whl)
    return False


HAVE_XLRD = _xlrd_available()


def _read(fmt):
    return json.loads(workbooks.read_workbook(os.path.join(FIX, "workbook." + fmt), fmt))


def test_xlsx_matches_openpyxl_reference():
    got = _read("xlsx")
    assert [s["name"] for s in got] == ["Assay", "Plate 2"]
    for sheet, ref in zip(got, REF):
        assert sheet["rows"] == ref["rows"]


@pytest.mark.skipif(not HAVE_XLRD, reason="xlrd (or the vendored wheel) is not available")
def test_xls_reads_the_same_cells_as_the_xlsx():
    got = _read("xls")
    assert [s["name"] for s in got] == [r["name"] for r in REF]
    for sheet, ref in zip(got, REF):
        assert sheet["rows"] == ref["rows"], sheet["name"]
        assert sheet["flags"]["manualHidden"] == ref["manualHidden"]
        assert sheet["flags"]["filterHidden"] == []
        assert sheet["flags"]["blankFormulas"] == []


def test_ods_reads_the_same_cells_as_the_xlsx():
    got = _read("ods")
    assert [s["name"] for s in got] == [r["name"] for r in REF]
    for sheet, ref in zip(got, REF):
        assert sheet["rows"] == ref["rows"], sheet["name"]
        assert sheet["flags"]["manualHidden"] == ref["manualHidden"]
        assert sheet["flags"]["filterHidden"] == []
        assert sheet["flags"]["blankFormulas"] == []


def test_reference_cells_pinned():
    """The values the e2e step and the cross-format tests rest on, from
    openpyxl's reading of workbook.xlsx (make_workbooks.py)."""
    assay = REF[0]["rows"]
    assert assay[1] == ["A1", "0.1", "0.125", "2024-03-15", "10:30:00", "TRUE", "5 µM at 37 °C"]
    assert assay[2][1] == "0.333333333333333"   # LibreOffice keeps 15 significant digits
    assert assay[3][1:3] == ["-2.5e-09", "1"]
    assert assay[3][6] == "0.2"                   # =B2*2, its saved result
    assert assay[4][1] == "6.02214076e+23" and assay[4][6] == "#DIV/0!"
    assert assay[7] == ["A7", "", "-0.25", "", "", "", "line one\nline two"]
    assert REF[0]["manualHidden"] == [6]


# ---- edge cases of the .ods reader, on hand-made content.xml

def _ods(rows_xml, tables=None):
    ns = ('xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
          'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" '
          'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
          'xmlns:calcext="urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0"')
    tables = tables or [("Sheet1", rows_xml)]
    body = "".join('<table:table table:name="%s">%s</table:table>' % t for t in tables)
    xml = ('<?xml version="1.0"?><office:document-content %s><office:body><office:spreadsheet>%s'
           '</office:spreadsheet></office:body></office:document-content>' % (ns, body))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("mimetype", "application/vnd.oasis.opendocument.spreadsheet")
        z.writestr("content.xml", xml)
    return buf.getvalue()


def _read_ods_bytes(tmp_path, data):
    p = tmp_path / "t.ods"
    p.write_bytes(data)
    return workbooks.read_ods(str(p))


def test_ods_trailing_padding_is_not_expanded(tmp_path):
    rows = ('<table:table-row><table:table-cell office:value-type="float" office:value="1"/>'
            '<table:table-cell table:number-columns-repeated="16383"/></table:table-row>'
            '<table:table-row table:number-rows-repeated="1048575">'
            '<table:table-cell table:number-columns-repeated="16384"/></table:table-row>')
    got = _read_ods_bytes(tmp_path, _ods(rows))
    assert got[0]["rows"] == [["1"]]


def test_ods_repeats_inside_the_data_are_expanded(tmp_path):
    rows = ('<table:table-row><table:table-cell office:value-type="float" office:value="5"/>'
            '<table:table-cell table:number-columns-repeated="2"/>'
            '<table:table-cell office:value-type="string"><text:p>x</text:p></table:table-cell>'
            '</table:table-row>'
            '<table:table-row table:number-rows-repeated="2"/>'
            '<table:table-row table:number-rows-repeated="2">'
            '<table:table-cell table:number-columns-repeated="3" office:value-type="float" office:value="0"/>'
            '</table:table-row>')
    got = _read_ods_bytes(tmp_path, _ods(rows))[0]["rows"]
    assert got == [["5", "", "", "x"], [], [], ["0", "0", "0"], ["0", "0", "0"]]


def test_ods_text_spaces_errors_and_blank_formulas(tmp_path):
    rows = ('<table:table-row table:visibility="filter">'
            '<table:table-cell office:value-type="string"><text:p>a<text:s text:c="2"/>b<text:tab/>c'
            '<office:annotation><text:p>a comment</text:p></office:annotation></text:p></table:table-cell>'
            '<table:table-cell table:formula="of:=1/0" office:value-type="float" office:value="0" '
            'calcext:value-type="error"><text:p>#DIV/0!</text:p></table:table-cell>'
            '<table:table-cell table:formula="of:=A1"/>'
            '<table:table-cell office:value-type="percentage" office:value="0.125"/>'
            '<table:table-cell office:value-type="boolean" office:boolean-value="false"/>'
            '<table:table-cell office:value-type="time" office:time-value="PT10H30M00S"/>'
            '<table:table-cell office:value-type="date" office:date-value="2024-03-15T10:30:00"/>'
            '</table:table-row>'
            '<table:table-row table:visibility="collapse"><table:table-cell office:value-type="float" '
            'office:value="1e-12"/></table:table-row>')
    sheet = _read_ods_bytes(tmp_path, _ods(rows))[0]
    assert sheet["rows"] == [["a  b\tc", "#DIV/0!", "", "0.125", "FALSE", "10:30:00", "2024-03-15 10:30"],
                             ["1e-12"]]
    assert sheet["flags"] == {"filterHidden": [0], "manualHidden": [1], "blankFormulas": ["C1"]}


def test_ods_empty_sheet_and_several_sheets(tmp_path):
    got = _read_ods_bytes(tmp_path, _ods("", tables=[("Empty", ""), ("B", (
        '<table:table-row><table:table-cell office:value-type="float" office:value="1e12"/>'
        '</table:table-row>'))]))
    assert [(s["name"], s["rows"]) for s in got] == [("Empty", []), ("B", [["1000000000000"]])]


def test_not_a_spreadsheet(tmp_path):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("content.xml", '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:'
                   'xmlns:office:1.0"><office:body><office:text/></office:body></office:document-content>')
    p = tmp_path / "doc.ods"
    p.write_bytes(buf.getvalue())
    with pytest.raises(ValueError, match="no spreadsheet"):
        workbooks.read_ods(str(p))
    with pytest.raises(ValueError, match="unknown workbook format"):
        workbooks.read_workbook(str(p), "numbers")


def test_cell_text_rule():
    assert workbooks.cell_text(None) == ""
    assert workbooks.cell_text(3.0) == "3"
    assert workbooks.cell_text(1e15) == "1000000000000000.0"   # repr past the whole-number cut-off
    assert workbooks.cell_text(0.1 + 0.2) == "0.30000000000000004"
    assert workbooks.cell_text(datetime.datetime(2024, 1, 2)) == "2024-01-02"
    assert workbooks.cell_text(datetime.time(7, 5)) == "07:05:00"
    assert workbooks.cell_text(True) == "TRUE"
