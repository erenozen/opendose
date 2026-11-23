"""Workbook readers for the Import dialog, the assay file pickers and
Apply to new data (P-34): every sheet of an .xlsx, .xls or .ods file as
rows of cell text. The web worker calls ``read_workbook`` on a file it
wrote to Pyodide's file system; nothing here runs at engine start.

All three formats give the same text for the same cell (``cell_text``),
the rule the .xlsx reader has always followed: a blank cell is "", a
whole number that fits a double exactly is written without ".0", any
other number as Python's shortest round-trip repr (so the stored double,
not the value a cell format shows, reaches the table), a date at midnight
as ISO 8601 (2024-03-15), a date with a time to the minute
(2024-03-15 10:30), a time of day as ISO 8601 (10:30:00), TRUE / FALSE,
and text as typed. Trailing blank cells and rows are dropped.

- .xlsx (Office Open XML, ECMA-376): openpyxl with ``data_only=True``,
  ``read_only=True`` (the cached values). Rows hidden in Excel and
  formulas saved without a value are read from the sheet XML by the
  worker (web/src/lib/xlsxFlags.ts).
- .xls (BIFF5/BIFF8, Excel 95 to 2003, what QuantStudio, StepOne and many
  plate-reader PCs still save): xlrd 2.0 (pure Python, loaded on demand).
  Cell types per xlrd's ``Cell.ctype``: a number with a date format is
  XL_CELL_DATE and is converted with the workbook's date mode
  (``xldate_as_tuple``, 1900 or 1904 system); an error cell holds its
  BIFF error code, written as Excel shows it (``error_text_from_code``,
  #DIV/0!). BIFF stores every formula's last result, so no formula reads
  blank. Hidden rows come from the ROW records (``formatting_info=True``,
  ``Rowinfo.hidden``); a hidden row inside the sheet's AutoFilter range
  (the built-in name _FilterDatabase) below its header row counts as
  hidden by the filter, as for .xlsx.
- .ods (OpenDocument spreadsheet, OASIS OpenDocument 1.2 Part 1):
  content.xml read with the standard library (zipfile, ElementTree), no
  extra package. Each table:table-cell carries office:value-type with the
  value in office:value (float, percentage, currency),
  office:date-value, office:time-value or office:boolean-value, or its
  text in text:p paragraphs; LibreOffice marks a formula error with
  calcext:value-type="error" and the error text in text:p.
  table:number-rows-repeated and table:number-columns-repeated are
  expanded only up to the last cell that holds something (LibreOffice
  pads every sheet with a million repeated empty rows).
  table:visibility="filter" marks a row hidden by a filter, "collapse"
  one hidden by hand. A cell with table:formula and no value type is a
  formula saved without a value.

Each sheet is {"name", "rows", "flags"}; flags are indices into rows
(``filterHidden``, ``manualHidden``) and A1 addresses
(``blankFormulas``), or None when they could not be read.
"""
import datetime
import io
import json
import re
import zipfile
from xml.etree import ElementTree

# Rows and columns kept from one sheet: Excel's own limits.
MAX_ROWS = 1048576
MAX_COLS = 16384


def cell_text(v):
    """One cell's value as the import reads it (see the module docstring)."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, datetime.datetime):
        if v.time() == datetime.time(0):
            return v.date().isoformat()
        return v.isoformat(sep=" ", timespec="minutes")
    if isinstance(v, (datetime.date, datetime.time)):
        return v.isoformat()
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() and abs(v) < 1e15 else repr(v)
    return str(v)


def _trim(rows):
    """Drop trailing blank cells of each row, then trailing empty rows."""
    for cells in rows:
        while cells and cells[-1] == "":
            cells.pop()
    while rows and not rows[-1]:
        rows.pop()
    return rows


def column_letters(col):
    """1 -> A, 28 -> AB."""
    s = ""
    while col > 0:
        col, r = divmod(col - 1, 26)
        s = chr(65 + r) + s
    return s


# ---------------------------------------------------------------- .xlsx

def read_xlsx(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    out = []
    for ws in wb.worksheets:
        rows = [[cell_text(v) for v in row] for row in ws.iter_rows(values_only=True)]
        out.append({"name": ws.title, "rows": _trim(rows)})
    wb.close()
    return out


# ---------------------------------------------------------------- .xls

def _xls_value(book, cell):
    import xlrd
    t = cell.ctype
    if t in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK):
        return None
    if t == xlrd.XL_CELL_BOOLEAN:
        return bool(cell.value)
    if t == xlrd.XL_CELL_ERROR:
        return xlrd.error_text_from_code.get(cell.value, "#N/A")
    if t == xlrd.XL_CELL_DATE:
        try:
            y, mo, d, h, mi, s = xlrd.xldate_as_tuple(cell.value, book.datemode)
        except xlrd.xldate.XLDateError:
            return float(cell.value)
        if (y, mo, d) == (0, 0, 0):
            return datetime.time(h, mi, s)
        return datetime.datetime(y, mo, d, h, mi, s)
    if t == xlrd.XL_CELL_NUMBER:
        return float(cell.value)
    return cell.value


def _xls_filter_ranges(book):
    """Sheet index -> (first row, last row), 0-based inclusive, of its
    AutoFilter range (the built-in name _FilterDatabase)."""
    out = {}
    for name in book.name_map.get("_filterdatabase", []):
        try:
            _, rlo, rhi, _, _ = name.area2d()
        except Exception:  # noqa: BLE001 - a name that is not one area
            continue
        out[name.scope] = (rlo, rhi - 1)
    return out


def read_xls(path):
    import xlrd
    try:
        book = xlrd.open_workbook(path, formatting_info=True)
        formatted = True
    except (NotImplementedError, xlrd.XLRDError):
        book = xlrd.open_workbook(path)
        formatted = False
    filters = _xls_filter_ranges(book) if formatted else {}
    out = []
    for si in range(book.nsheets):
        sh = book.sheet_by_index(si)
        rows = [[cell_text(_xls_value(book, sh.cell(r, c))) for c in range(sh.row_len(r))]
                for r in range(sh.nrows)]
        rows = _trim(rows)
        flags = None
        if formatted:
            rng = filters.get(si)
            filt, hand = [], []
            for r, info in sorted(sh.rowinfo_map.items()):
                if not info.hidden or r >= len(rows):
                    continue
                if rng and rng[0] < r <= rng[1]:
                    filt.append(r)
                else:
                    hand.append(r)
            flags = {"filterHidden": filt, "manualHidden": hand, "blankFormulas": []}
        out.append({"name": sh.name, "rows": rows, "flags": flags})
    book.release_resources()
    return out


# ---------------------------------------------------------------- .ods

_NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
    "calcext": "urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0",
}


def _q(prefix, local):
    return "{%s}%s" % (_NS[prefix], local)


_ROW = _q("table", "table-row")
_CELL = _q("table", "table-cell")
_COVERED = _q("table", "covered-table-cell")
_ROW_GROUPS = {_q("table", t) for t in ("table-header-rows", "table-rows", "table-row-group")}
_P = _q("text", "p")
_S = _q("text", "s")
_TAB = _q("text", "tab")
_BREAK = _q("text", "line-break")
_ANNOTATION = _q("office", "annotation")
_DURATION = re.compile(r"^-?P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$")


def _repeat(el, attr):
    try:
        return max(1, int(el.get(_q("table", attr), "1")))
    except ValueError:
        return 1


def _paragraph(el):
    """The text of a text:p, with text:s spaces, tabs and line breaks."""
    parts = [el.text or ""]
    for ch in el:
        if ch.tag == _S:
            parts.append(" " * int(ch.get(_q("text", "c"), "1")))
        elif ch.tag == _TAB:
            parts.append("\t")
        elif ch.tag == _BREAK:
            parts.append("\n")
        elif ch.tag != _ANNOTATION:
            parts.append(_paragraph(ch))
        parts.append(ch.tail or "")
    return "".join(parts)


def _cell_paragraphs(cell):
    return "\n".join(_paragraph(p) for p in cell if p.tag == _P)


def _ods_value(cell):
    """The cell's value, and whether it is a formula with no saved value."""
    if cell.tag == _COVERED:
        return None, False
    office = lambda a: cell.get(_q("office", a))  # noqa: E731
    kind = office("value-type")
    if cell.get(_q("calcext", "value-type")) == "error":
        return _cell_paragraphs(cell), False
    if kind in ("float", "percentage", "currency"):
        return float(office("value")), False
    if kind == "date":
        v = office("date-value")
        try:
            return datetime.datetime.fromisoformat(v), False
        except (TypeError, ValueError):
            return v, False
    if kind == "time":
        m = _DURATION.match(office("time-value") or "")
        if not m:
            return office("time-value"), False
        d, h, mi, s = (float(g) if g else 0.0 for g in m.groups())
        total = ((d * 24 + h) * 60 + mi) * 60 + s
        if total < 86400:
            whole = int(round(total))
            return datetime.time(whole // 3600, whole // 60 % 60, whole % 60), False
        return datetime.timedelta(seconds=total), False
    if kind == "boolean":
        return office("boolean-value") == "true", False
    if kind == "string":
        sv = office("string-value")
        return (sv if sv is not None else _cell_paragraphs(cell)), False
    text = _cell_paragraphs(cell)
    if text:
        return text, False
    return None, cell.get(_q("table", "formula")) is not None


def _table_rows(el):
    for ch in el:
        if ch.tag == _ROW:
            yield ch
        elif ch.tag in _ROW_GROUPS:
            yield from _table_rows(ch)


def _ods_sheet(table):
    rows = []
    pending = 0            # empty rows not yet written (they may be trailing)
    at = 0                 # sheet row index of the next row
    hidden = []            # (first row, count, "filterHidden" | "manualHidden")
    blank_formulas = []
    for row in _table_rows(table):
        n = _repeat(row, "number-rows-repeated")
        vis = row.get(_q("table", "visibility"), "visible")
        if vis in ("filter", "collapse"):
            hidden.append((at, n, "filterHidden" if vis == "filter" else "manualHidden"))
        cells = []
        empty_run = 0
        for cell in row:
            if cell.tag not in (_CELL, _COVERED):
                continue
            k = _repeat(cell, "number-columns-repeated")
            v, blank_formula = _ods_value(cell)
            if blank_formula:
                for j in range(min(k, MAX_COLS - len(cells) - empty_run)):
                    blank_formulas.append((at, len(cells) + empty_run + j))
            if v is None or v == "":
                empty_run += k
                continue
            cells.extend([""] * empty_run)
            empty_run = 0
            cells.extend([cell_text(v)] * min(k, MAX_COLS - len(cells)))
        if not cells:
            pending += n
        else:
            n_kept = min(n, MAX_ROWS - len(rows) - pending)
            rows.extend([] for _ in range(pending))
            pending = 0
            rows.extend(list(cells) for _ in range(max(0, n_kept)))
        at += n
        if len(rows) >= MAX_ROWS:
            break
    rows = _trim(rows)
    flags = {"filterHidden": [], "manualHidden": [], "blankFormulas": []}
    for first, n, key in hidden:
        flags[key].extend(range(first, min(first + n, len(rows))))
    flags["blankFormulas"] = ["%s%d" % (column_letters(c + 1), r + 1) for r, c in blank_formulas]
    return {"name": table.get(_q("table", "name"), ""), "rows": rows, "flags": flags}


def read_ods(path):
    with zipfile.ZipFile(path) as z:
        content = z.read("content.xml")
    root = ElementTree.parse(io.BytesIO(content)).getroot()
    body = root.find(_q("office", "body"))
    sheet = body.find(_q("office", "spreadsheet")) if body is not None else None
    if sheet is None:
        raise ValueError("the file holds no spreadsheet")
    return [_ods_sheet(t) for t in sheet.findall(_q("table", "table"))]


# ---------------------------------------------------------------- entry

READERS = {"xlsx": read_xlsx, "xls": read_xls, "ods": read_ods}


def read_workbook(path, fmt):
    """Every sheet of the workbook at `path` ("xlsx", "xls" or "ods"), as
    JSON text: [{"name", "rows", "flags"?}, ...]."""
    if fmt not in READERS:
        raise ValueError("unknown workbook format %r" % (fmt,))
    return json.dumps(READERS[fmt](path))
