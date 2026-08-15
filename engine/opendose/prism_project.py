"""Prism project import (.prism / .prism.zip), the format Prism 10 and 11 write.

Where a .pzfx file is a single XML document, a .prism file is a zip archive
of JSON sheets with the numbers kept alongside as CSV:

    document.json                       lists which sheets exist, by role
    data/sheets/<uid>/sheet.json        one sheet: title + table description
    data/tables/<uid>/data.csv          that table's numbers, one row per row
    data/sets/<uid>.json                one column group: title, X or Y

A table description names its columns indirectly:

    "table": {"uid": <table>, "format": "xy", "dataFormat": "y_replicates",
              "replicatesCount": 3, "xDataSet": <set>, "dataSets": [<set>, ...]}

so the CSV's columns are the X column (when there is one) followed by each
Y data set in `dataSets` order, `replicatesCount` columns apiece.

Only the sheets listed under document.json's "data" role are imported. The
archive also stores sheets backing each analysis (a transform, a normalize,
a table of results) and the 999-point curves Prism draws, all of which are
outputs rather than data, and all of which OpenDose recomputes itself.

Output matches prism_project.parse_prism -> pzfx.parse_pzfx, so both formats
reach the app through one code path.
"""

from __future__ import annotations

import base64
import csv
import io
import json
import zipfile

ZIP_MAGIC = b"PK\x03\x04"

# Prism's table-format names -> the table_type vocabulary the app switches on.
_TABLE_TYPES = {
    "xy": "XY",
    "survival": "Survival",
    "column": "Column",
    "grouped": "Grouped",
    "contingency": "Contingency",
    "partsofwhole": "PartsOfWhole",
    "nested": "Nested",
}


def looks_like_prism_project(content: bytes) -> bool:
    """True for a zip archive, which is what a .prism file is."""
    return content[:4] == ZIP_MAGIC


def _cell(text):
    """One CSV cell -> float, or None when empty or not a number."""
    text = (text or "").strip()
    if not text:
        return None
    try:
        return float(text.replace(",", ""))
    except ValueError:
        return None


def _load(zf: zipfile.ZipFile, name: str, default=None):
    try:
        with zf.open(name) as fh:
            return json.load(fh)
    except (KeyError, json.JSONDecodeError):
        return default


def _read_grid(zf: zipfile.ZipFile, table_uid: str) -> list[list]:
    """data/tables/<uid>/data.csv -> rows of float|None."""
    try:
        raw = zf.read(f"data/tables/{table_uid}/data.csv")
    except KeyError:
        return []
    text = raw.decode("utf-8-sig", errors="replace")
    return [[_cell(c) for c in row]
            for row in csv.reader(io.StringIO(text)) if row]


def _set_title(zf: zipfile.ZipFile, uid: str) -> str:
    ds = _load(zf, f"data/sets/{uid}.json", {}) or {}
    return (ds.get("title") or "").strip()


def _table_from_sheet(zf: zipfile.ZipFile, sheet_uid: str) -> dict | None:
    sheet = _load(zf, f"data/sheets/{sheet_uid}/sheet.json")
    if not sheet:
        return None
    spec = sheet.get("table") or {}
    table_uid = spec.get("uid")
    if not table_uid:
        return None

    grid = _read_grid(zf, table_uid)
    n_cols = max((len(r) for r in grid), default=0)
    y_uids = list(spec.get("dataSets") or [])
    if not y_uids or not grid:
        return None

    # A "series" X is generated from a start/step rather than stored, so it
    # occupies no CSV column.
    x_uid = spec.get("xDataSet")
    has_x_col = bool(x_uid) and spec.get("xDataSetFormat") != "series"
    x_cols = 1 if has_x_col else 0

    # replicatesCount is authoritative when present; otherwise infer it from
    # how many columns each data set had to share.
    per_set = spec.get("replicatesCount") or 0
    if per_set <= 0 or x_cols + per_set * len(y_uids) != n_cols:
        per_set = max(1, (n_cols - x_cols) // len(y_uids))

    def col(row, i):
        return row[i] if i < len(row) else None

    x_vals = [col(row, 0) for row in grid] if has_x_col else None
    datasets = []
    for n, uid in enumerate(y_uids):
        start = x_cols + n * per_set
        datasets.append({
            "name": _set_title(zf, uid),
            "ys": [[col(row, start + k) for k in range(per_set)] for row in grid],
        })

    fmt = str(spec.get("format") or "xy").lower()
    return {
        "id": sheet_uid,
        "title": (sheet.get("title") or "").strip(),
        "table_type": _TABLE_TYPES.get(fmt, fmt.upper() or "XY"),
        "x_format": "numbers" if has_x_col else "none",
        "y_format": str(spec.get("dataFormat") or "replicates"),
        "replicates": per_set,
        "x_title": _set_title(zf, x_uid) if has_x_col else "",
        "x": x_vals,
        "datasets": datasets,
        "n_rows": len(grid),
    }


def parse_prism(content: bytes | str) -> dict:
    """Parse a .prism/.prism.zip archive into the data tables it contains."""
    if isinstance(content, str):
        content = content.encode("utf-8", errors="replace")
    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        raise ValueError("not a valid .prism file (not a zip archive)") from None

    with zf:
        doc = _load(zf, "document.json")
        if not doc:
            raise ValueError("not a GraphPad Prism project "
                             "(no document.json in the archive)")
        sheet_uids = (doc.get("sheets") or {}).get("data") or []
        tables = [t for t in (_table_from_sheet(zf, u) for u in sheet_uids) if t]

    if not tables:
        raise ValueError("no data tables found in the .prism file")
    return {"tables": tables}


def parse_prism_b64(b64: str) -> dict:
    return parse_prism(base64.b64decode(b64))
