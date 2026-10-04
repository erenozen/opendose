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


def _parse_subcolumn(sub, keep_excluded=False, excluded=None):
    """One <Subcolumn> -> list of float|None down the rows. With
    keep_excluded, excluded cells keep their value and their row indices
    are appended to `excluded`."""
    vals = []
    for d in _children(sub, "d"):
        if d.get("Excluded") == "1":
            if not keep_excluded:
                vals.append(None)
                continue
            if excluded is not None:
                excluded.append(len(vals))
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


def _parse_column(col, keep_excluded=False, excluded=None):
    """<XColumn>/<YColumn> -> (title, [subcolumn value lists]). With
    keep_excluded, `excluded` receives [row, subcolumn] pairs."""
    title_el = _first(col, "Title")
    title = "".join(title_el.itertext()).strip() if title_el is not None else ""
    subs = []
    for k, sub in enumerate(_children(col, "Subcolumn")):
        rows = [] if keep_excluded else None
        subs.append(_parse_subcolumn(sub, keep_excluded, rows))
        if excluded is not None and rows:
            excluded.extend([r, k] for r in rows)
    return title, subs


def _rows_from_subcolumns(subs):
    """Column-major subcolumn lists -> row-major grid (rows x subcols)."""
    n_rows = max((len(s) for s in subs), default=0)
    return [[s[r] if r < len(s) else None for s in subs]
            for r in range(n_rows)]


def parse_pzfx(content: str | bytes, *, keep_excluded: bool = False,
               row_titles: bool = False) -> dict:
    """Parse a .pzfx file's XML into the data tables it contains.

    keep_excluded: excluded cells keep their value, and each table gains
    "x_excluded" (row indices) and each data set "excluded" ([row,
    subcolumn] pairs). row_titles: tables gain "row_titles" from the
    RowTitlesColumn. Both default off, leaving the output unchanged."""
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
        x_excl = [] if keep_excluded else None
        if xcol is not None:
            x_title, x_subs = _parse_column(xcol, keep_excluded, x_excl)
            if x_subs:
                x_vals = x_subs[0]

        datasets = []
        for ycol in _children(table, "YColumn"):
            excl = [] if keep_excluded else None
            name, subs = _parse_column(ycol, keep_excluded, excl)
            datasets.append({"name": name, "ys": _rows_from_subcolumns(subs)})
            if keep_excluded:
                datasets[-1]["excluded"] = excl

        n_rows = max([len(ds["ys"]) for ds in datasets]
                     + ([len(x_vals)] if x_vals else [0]), default=0)
        if x_vals is not None:
            x_vals = x_vals + [None] * (n_rows - len(x_vals))
        for ds in datasets:
            width = max((len(r) for r in ds["ys"]), default=1)
            ds["ys"] = [ds["ys"][r] + [None] * (width - len(ds["ys"][r]))
                        if r < len(ds["ys"]) else [None] * width
                        for r in range(n_rows)]

        extra = {}
        if keep_excluded:
            extra["x_excluded"] = [r for r, k in x_excl if k == 0]
        if row_titles:
            rt = _first(table, "RowTitlesColumn")
            titles = []
            if rt is not None:
                sub = _first(rt, "Subcolumn")
                if sub is not None:
                    titles = ["".join(d.itertext()).strip()
                              for d in _children(sub, "d")]
            extra["row_titles"] = titles + [""] * max(0, n_rows - len(titles))

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
            **extra,
        })
    if not tables:
        raise ValueError("no data tables found in the .pzfx file")
    return {"tables": tables}


def parse_pzfx_b64(b64: str) -> dict:
    return parse_pzfx(base64.b64decode(b64))


# ------------------------------------------------------------------ export
# Writing mirrors the structure parse_pzfx reads (and that Prism itself
# writes, cf. the fixtures): <GraphPadPrismFile> with a <TableSequence> of
# <Ref>s and one <Table> per data table, carrying TableType, XFormat,
# YFormat and Replicates; an optional <RowTitlesColumn>, an <XColumn> for
# XY and survival tables, and one <YColumn Subcolumns="k"> per data set
# whose <Subcolumn>s list <d> cells down the rows (<d/> blank,
# Excluded="1" for excluded values).

from xml.sax.saxutils import escape as _esc

_TABLE_TYPES_OUT = {"xy": "XY", "column": "OneWay", "grouped": "TwoWay",
                    "contingency": "Contingency", "survival": "Survival"}

# Subcolumn formats with a Prism YFormat name the app's importer already
# maps back (web/src/app/factory.ts PRISM_SUMMARY_FORMATS). Others are
# written as replicate subcolumns with a warning.
_YFORMATS_OUT = {"replicates": "replicates", "mean_sd_n": "SDN",
                 "mean_sem_n": "SEN", "mean_cv_n": "CVN", "mean_sd": "SD",
                 "mean_sem": "SE"}


def _cell_text(v):
    """Raw cell -> text for <d>; None / '' -> None (blank)."""
    if v is None:
        return None
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int,)):
        return str(v)
    if isinstance(v, float):
        if v != v or v in (float("inf"), float("-inf")):
            return None
        return str(int(v)) if v.is_integer() and abs(v) < 1e15 else repr(v)
    text = str(v).strip()
    return text or None


def _d(v, excluded=False):
    text = _cell_text(v)
    attr = ' Excluded="1"' if excluded and text is not None else ""
    return f"<d{attr}/>" if text is None else f"<d{attr}>{_esc(text)}</d>"


def _subcolumn(cells, excluded_rows=()):
    excl = set(excluded_rows)
    return "<Subcolumn>" + "".join(_d(v, r in excl) for r, v in
                                   enumerate(cells)) + "</Subcolumn>"


def _excluded_pairs(ds):
    """Data-set exclusions as {(row, sub)}: app "r:s" strings or pairs."""
    out = set()
    for e in ds.get("excluded") or []:
        if isinstance(e, str) and ":" in e:
            r, k = e.split(":", 1)
            out.add((int(r), int(k)))
        elif isinstance(e, (list, tuple)) and len(e) == 2:
            out.add((int(e[0]), int(e[1])))
    return out


def _rows(ds):
    rows = ds.get("rows")
    if rows is None:
        rows = ds.get("ys") or []
    return [list(r) if isinstance(r, (list, tuple)) else [r] for r in rows]


def _norm_table(t):
    """Accept the app's DataTableModel (camelCase, under "table" or at the
    top level, with "rows") or engine-style keys (snake_case, "ys")."""
    inner = t.get("table") if isinstance(t.get("table"), dict) else t
    get = lambda *keys, default=None: next(  # noqa: E731
        (inner[k] for k in keys if k in inner and inner[k] is not None),
        default)
    ttype = str(get("type", "table_type", default="xy")).lower()
    ttype = {"oneway": "column", "twoway": "grouped"}.get(ttype, ttype)
    return {
        "title": t.get("title") or t.get("name") or get("title", "name",
                                                         default="Data"),
        "type": ttype,
        "x": get("x", default=None),
        "x_title": get("xTitle", "x_title", default=""),
        "x_excluded": set(get("xExcluded", "x_excluded", default=[]) or []),
        "row_titles": get("rowTitles", "row_titles", default=[]) or [],
        "datasets": get("datasets", default=[]) or [],
        "format": str(get("subcolumnFormat", "subcolumn_format",
                          default="replicates")),
    }


def _table_xml(idx, t, warnings):
    tt = t["type"]
    if tt not in _TABLE_TYPES_OUT:
        raise ValueError(f"table type '{tt}' cannot be written to .pzfx "
                         "(XY, column, grouped, contingency and survival "
                         "tables can)")
    datasets = t["datasets"]
    if not datasets:
        raise ValueError("a table needs at least one data set")
    fmt = t["format"]
    yformat = _YFORMATS_OUT.get(fmt)
    if tt in ("contingency", "survival"):
        yformat = "replicates"
    elif yformat is None:
        warnings.append(f"'{t['title']}': subcolumn format '{fmt}' has no "
                        "known .pzfx YFormat; written as replicate values")
        yformat = "replicates"
    parts = []
    if tt == "survival":
        # Prism layout: X = time for every subject, one Y column per group
        # holding that subject's event code (1 event, 0 censored).
        times, codes, excl_x = [], [], set()
        for gi, ds in enumerate(datasets):
            ex = _excluded_pairs(ds)
            for r, row in enumerate(_rows(ds)):
                tm = row[0] if row else None
                ev = row[1] if len(row) > 1 else None
                if _cell_text(tm) is None and _cell_text(ev) is None:
                    continue
                if (r, 0) in ex or (r, 1) in ex:
                    excl_x.add(len(times))
                times.append(tm)
                codes.append((gi, ev))
        n = len(times)
        width = 1
        parts.append(f'<XColumn Width="81" Subcolumns="1"><Title>'
                     f'{_esc(str(t["x_title"] or "Time"))}</Title>'
                     f'{_subcolumn(times, excl_x)}</XColumn>')
        for gi, ds in enumerate(datasets):
            col = [ev if g == gi else None for g, ev in codes]
            parts.append(f'<YColumn Width="81" Subcolumns="1"><Title>'
                         f'{_esc(str(ds.get("name", "")))}</Title>'
                         f'{_subcolumn(col)}</YColumn>')
    else:
        rows_by_ds = [_rows(ds) for ds in datasets]
        width = max((len(r) for rows in rows_by_ds for r in rows), default=1)
        width = max(width, 1)
        n = max([len(rows) for rows in rows_by_ds]
                + [len(t["x"] or []) if tt == "xy" else 0])
        titles = [str(v) if v is not None else "" for v in t["row_titles"]]
        if any(titles) and tt != "xy":
            titles += [""] * (n - len(titles))
            parts.append('<RowTitlesColumn Width="81">'
                         + _subcolumn([v if v else None for v in titles[:n]])
                         + "</RowTitlesColumn>")
        if tt == "xy":
            xs = list(t["x"] or [])
            xs += [None] * (n - len(xs))
            parts.append(f'<XColumn Width="81" Subcolumns="1"><Title>'
                         f'{_esc(str(t["x_title"] or ""))}</Title>'
                         f'{_subcolumn(xs, t["x_excluded"])}</XColumn>')
        for ds, rows in zip(datasets, rows_by_ds):
            ex = _excluded_pairs(ds)
            k_sub = 1 if tt == "contingency" else width
            subs = []
            for k in range(k_sub):
                cells = [row[k] if k < len(row) else None for row in rows]
                cells += [None] * (n - len(cells))
                subs.append(_subcolumn(cells, {r for r, kk in ex if kk == k}))
            parts.append(f'<YColumn Width="81" Subcolumns="{k_sub}"><Title>'
                         f'{_esc(str(ds.get("name", "")))}</Title>'
                         + "".join(subs) + "</YColumn>")
    replicates = width if yformat == "replicates" and tt in ("xy", "column",
                                                             "grouped") else 1
    xformat = "numbers" if tt in ("xy", "survival") else "none"
    head = (f'<Table ID="Table{idx}" XFormat="{xformat}" YFormat="{yformat}" '
            f'Replicates="{replicates}" TableType="{_TABLE_TYPES_OUT[tt]}" '
            f'EVFormat="AsteriskAfterNumber">')
    return (head + f"\n<Title>{_esc(str(t['title']))}</Title>\n"
            + "\n".join(parts) + "\n</Table>")


def write_pzfx(tables) -> dict:
    """Data tables -> .pzfx XML text. tables: list of {"title", "table":
    DataTableModel} (or the table fields at the top level). Returns
    {"xml", "n_tables", "warnings"}."""
    if not tables:
        raise ValueError("nothing to export: no data tables")
    warnings: list[str] = []
    bodies = []
    for i, t in enumerate(tables):
        bodies.append(_table_xml(i, _norm_table(t), warnings))
    selected = ' Selected="1"'
    refs = "".join(f'<Ref ID="Table{i}"{selected if i == 0 else ""}/>'
                   for i in range(len(bodies)))
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<GraphPadPrismFile xmlns="http://graphpad.com/prism/Prism.htm" '
           'PrismXMLVersion="5.00">\n'
           '<Created><OriginalVersion CreatedByProgram="OpenDose"/></Created>\n'
           '<InfoSequence><Ref ID="Info0" Selected="1"/></InfoSequence>\n'
           '<Info ID="Info0"><Title>Project info 1</Title><Notes/></Info>\n'
           f"<TableSequence>{refs}</TableSequence>\n"
           + "\n".join(bodies) + "\n</GraphPadPrismFile>\n")
    return {"xml": xml, "n_tables": len(bodies), "warnings": warnings}
