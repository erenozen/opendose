"""Prism project file (.pzfx) import.

A .pzfx file is Prism's XML project format (the sibling of the binary
.prism/.pzf formats). Data tables live in <Table> elements:

    <Table ID="Table0" XFormat="numbers" YFormat="replicates"
           Replicates="3" TableType="XY">
      <Title>Dose response</Title>
      <XColumn Subcolumns="1"><Title>Dose</Title>
        <Subcolumn><d>1</d><d>2</d>...</Subcolumn></XColumn>
      <YColumn Subcolumns="3"><Title>Control</Title>
        <Subcolumn><d>...</d></Subcolumn>...</YColumn>
      ...
    </Table>

Values may be empty (<d/>) or flagged Excluded="1" (Prism shows them
struck through and ignores them); both import as None. Only the data
tables are read; graphs/layouts/info sheets are ignored.
"""

from __future__ import annotations

import base64
from xml.etree import ElementTree


def _local(tag: str) -> str:
    """Tag name with any XML namespace stripped."""
    return tag.rsplit("}", 1)[-1]


def _children(elem, name):
    return [c for c in elem if _local(c.tag) == name]


def _first(elem, name):
    found = _children(elem, name)
    return found[0] if found else None


def _parse_subcolumn(sub):
    """One <Subcolumn> -> list of float|None down the rows."""
    vals = []
    for d in _children(sub, "d"):
        if d.get("Excluded") == "1":
            vals.append(None)
            continue
        text = (d.text or "").strip()
        if not text:
            vals.append(None)
            continue
        try:
            vals.append(float(text.replace(",", "")))
        except ValueError:
            vals.append(None)  # non-numeric cell (e.g. text)
        # nested formatting elements are ignored
    return vals


def _parse_column(col):
    """<XColumn>/<YColumn> -> (title, [subcolumn value lists])."""
    title_el = _first(col, "Title")
    title = "".join(title_el.itertext()).strip() if title_el is not None else ""
    subs = [_parse_subcolumn(s) for s in _children(col, "Subcolumn")]
    return title, subs


def _rows_from_subcolumns(subs):
    """Column-major subcolumn lists -> row-major grid (rows x subcols)."""
    n_rows = max((len(s) for s in subs), default=0)
    return [[s[r] if r < len(s) else None for s in subs]
            for r in range(n_rows)]


def parse_pzfx(content: str | bytes) -> dict:
    """Parse a .pzfx file's XML into the data tables it contains."""
    if isinstance(content, bytes):
        content = content.decode("utf-8-sig", errors="replace")
    try:
        root = ElementTree.fromstring(content)
    except ElementTree.ParseError as exc:
        raise ValueError(f"not a valid .pzfx (XML) file: {exc}") from None
    if _local(root.tag) != "GraphPadPrismFile":
        raise ValueError("not a GraphPad Prism .pzfx file "
                         f"(root element is <{_local(root.tag)}>)")

    tables = []
    for table in root.iter():
        if _local(table.tag) != "Table":
            continue
        title_el = _first(table, "Title")
        title = ("".join(title_el.itertext()).strip()
                 if title_el is not None else table.get("ID", ""))

        x_title, x_vals = "", None
        xcol = _first(table, "XColumn")
        if xcol is None:
            xcol = _first(table, "XAdvancedColumn")
        if xcol is not None:
            x_title, x_subs = _parse_column(xcol)
            if x_subs:
                x_vals = x_subs[0]

        datasets = []
        for ycol in _children(table, "YColumn"):
            name, subs = _parse_column(ycol)
            datasets.append({"name": name, "ys": _rows_from_subcolumns(subs)})

        n_rows = max([len(ds["ys"]) for ds in datasets]
                     + ([len(x_vals)] if x_vals else [0]), default=0)
        if x_vals is not None:
            x_vals = x_vals + [None] * (n_rows - len(x_vals))
        for ds in datasets:
            width = max((len(r) for r in ds["ys"]), default=1)
            ds["ys"] = [ds["ys"][r] + [None] * (width - len(ds["ys"][r]))
                        if r < len(ds["ys"]) else [None] * width
                        for r in range(n_rows)]

        tables.append({
            "id": table.get("ID", ""),
            "title": title,
            "table_type": table.get("TableType", "XY"),
            "x_format": table.get("XFormat", "none"),
            "y_format": table.get("YFormat", "replicates"),
            "replicates": int(table.get("Replicates", "1") or 1),
            "x_title": x_title,
            "x": x_vals,
            "datasets": datasets,
            "n_rows": n_rows,
        })
    if not tables:
        raise ValueError("no data tables found in the .pzfx file")
    return {"tables": tables}


def parse_pzfx_b64(b64: str) -> dict:
    return parse_pzfx(base64.b64decode(b64))
