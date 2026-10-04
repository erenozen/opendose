""".pzfx export (opendose.pzfx.write_pzfx).

Round trips write -> parse_pzfx -> identical tables for every table type
the writer supports (XY, column, grouped, contingency, survival), with
titles, replicate subcolumns, row titles, excluded values (Excluded="1")
and the summary subcolumn formats Mean/SD/N, Mean/SEM/N and Mean/%CV/N
(YFormat SDN / SEN / CVN, the names the app's importer maps back). The
written XML is checked against the element and attribute layout of the
.pzfx fixtures in the repository (web/e2e-fixtures, RealTestFiles), and
those fixtures survive parse -> write -> parse unchanged.
"""

from pathlib import Path
from xml.etree import ElementTree

import pytest

from opendose.api import analyze
from opendose.pzfx import parse_pzfx, write_pzfx

ROOT = Path(__file__).parents[2]
# RealTestFiles is private and gitignored, so that fixture only runs locally.
FIXTURES = [p for p in [ROOT / "web" / "e2e-fixtures" / "grouped.pzfx",
                        ROOT / "web" / "e2e-fixtures" / "sample.pzfx",
                        ROOT / "RealTestFiles" / "mcf7resvsbyl_20.08.26.pzfx"]
            if p.exists()]
NS = "{http://graphpad.com/prism/Prism.htm}"

_FROM_YFORMAT = {"replicates": "replicates", "SDN": "mean_sd_n",
                 "SEN": "mean_sem_n", "CVN": "mean_cv_n", "SD": "mean_sd",
                 "SE": "mean_sem"}
_FROM_TYPE = {"XY": "xy", "OneWay": "column", "TwoWay": "grouped",
              "Contingency": "contingency", "Survival": "survival"}


def roundtrip(tables, **kw):
    out = write_pzfx(tables)
    return out, parse_pzfx(out["xml"], keep_excluded=True, row_titles=True,
                           **kw)["tables"]


def as_float(rows):
    return [[None if v in (None, "") else float(v) for v in r] for r in rows]


def canonical(parsed):
    """parse_pzfx table -> the app's table shape (for re-export)."""
    out = {"type": _FROM_TYPE[parsed["table_type"]],
           "x": parsed["x"], "xTitle": parsed["x_title"],
           "rowTitles": parsed.get("row_titles", []),
           "xExcluded": parsed.get("x_excluded", []),
           "subcolumnFormat": _FROM_YFORMAT.get(parsed["y_format"],
                                                "replicates"),
           "datasets": [{"name": d["name"], "rows": d["ys"],
                         "excluded": [f"{r}:{k}" for r, k in
                                      d.get("excluded", [])]}
                        for d in parsed["datasets"]]}
    return {"title": parsed["title"], "table": out}


XY = {"title": "Dose response", "table": {
    "type": "xy", "x": ["-9", "-8", "-7", "-6"], "xTitle": "log[Dose]",
    "xExcluded": [3], "subcolumnFormat": "replicates",
    "datasets": [
        {"name": "Control", "rows": [["98.1", "101.3"], ["75.2", "120.9"],
                                     ["30.4", "28.8"], ["5.5", ""]],
         "excluded": ["1:1"]},
        {"name": "Treated & co <1>", "rows": [["99", "97.5"], ["90.1", ""],
                                              ["60.3", "58.7"]]}]}}


def test_xy_roundtrip_with_replicates_and_exclusions():
    out, (t,) = roundtrip([XY])
    assert out["n_tables"] == 1 and out["warnings"] == []
    assert t["title"] == "Dose response"
    assert t["table_type"] == "XY" and t["x_format"] == "numbers"
    assert t["replicates"] == 2 and t["y_format"] == "replicates"
    assert t["x_title"] == "log[Dose]"
    assert t["x"] == [-9.0, -8.0, -7.0, -6.0]
    assert t["x_excluded"] == [3]
    c, tr = t["datasets"]
    assert c["name"] == "Control" and tr["name"] == "Treated & co <1>"
    assert c["ys"] == as_float(XY["table"]["datasets"][0]["rows"])
    assert c["excluded"] == [[1, 1]]
    # ragged data set padded to the table's rows
    assert tr["ys"] == [[99.0, 97.5], [90.1, None], [60.3, 58.7],
                        [None, None]]
    # default parsing (what the app imports) blanks excluded cells
    plain = parse_pzfx(out["xml"])["tables"][0]
    assert plain["datasets"][0]["ys"][1] == [75.2, None]
    assert plain["x"][3] is None


def test_column_grouped_contingency_roundtrip():
    column = {"title": "Groups", "table": {
        "type": "column", "datasets": [
            {"name": "Placebo", "rows": [["3.1"], ["4.2"], ["2.9"]]},
            {"name": "Drug", "rows": [[6.5], [7.1]]}]}}
    grouped = {"title": "Two factors", "table": {
        "type": "grouped", "rowTitles": ["Male", "Female"],
        "subcolumnFormat": "replicates", "datasets": [
            {"name": "Placebo", "rows": [[10, 12, 11], [9, 11, 10]]},
            {"name": "Drug", "rows": [[20, 22, 21], [18, 19, None]],
             "excluded": [[0, 2]]}]}}
    cont = {"title": "Outcome", "table": {
        "type": "contingency", "rowTitles": ["Exposed", "Not exposed"],
        "datasets": [{"name": "Disease", "rows": [[15], [5]]},
                     {"name": "No disease", "rows": [[85], [95]]}]}}
    _, (c, g, k) = roundtrip([column, grouped, cont])
    assert c["table_type"] == "OneWay" and c["x"] is None
    assert c["datasets"][1]["ys"] == [[6.5], [7.1], [None]]
    assert g["table_type"] == "TwoWay" and g["replicates"] == 3
    assert g["row_titles"] == ["Male", "Female"]
    assert g["datasets"][1]["ys"] == [[20.0, 22.0, 21.0], [18.0, 19.0, None]]
    assert g["datasets"][1]["excluded"] == [[0, 2]]
    assert k["table_type"] == "Contingency"
    assert k["row_titles"] == ["Exposed", "Not exposed"]
    assert [d["ys"] for d in k["datasets"]] == [[[15.0], [5.0]],
                                                [[85.0], [95.0]]]


def test_survival_roundtrip_in_prism_layout():
    surv = {"title": "Trial", "table": {
        "type": "survival", "xTitle": "Days", "datasets": [
            {"name": "Control", "subTitles": ["Time", "Event"],
             "rows": [["5", "1"], ["8", "0"], ["12", "1"]]},
            {"name": "Treated", "rows": [["7", "1"], ["15", "0"]]}]}}
    _, (t,) = roundtrip([surv])
    assert t["table_type"] == "Survival" and t["x_format"] == "numbers"
    assert t["x"] == [5.0, 8.0, 12.0, 7.0, 15.0]
    assert t["x_title"] == "Days"
    ctl, trt = t["datasets"]
    assert [r[0] for r in ctl["ys"]] == [1.0, 0.0, 1.0, None, None]
    assert [r[0] for r in trt["ys"]] == [None, None, None, 1.0, 0.0]
    # the app's importer (factory.ts) rebuilds [time, event] per group
    groups = [[(t["x"][r], ds["ys"][r][0]) for r in range(t["n_rows"])
               if ds["ys"][r][0] is not None] for ds in t["datasets"]]
    assert groups == [[(5.0, 1.0), (8.0, 0.0), (12.0, 1.0)],
                      [(7.0, 1.0), (15.0, 0.0)]]


@pytest.mark.parametrize("fmt,yformat", [("mean_sd_n", "SDN"),
                                         ("mean_sem_n", "SEN"),
                                         ("mean_cv_n", "CVN")])
@pytest.mark.parametrize("ttype", ["xy", "column", "grouped"])
def test_summary_formats_roundtrip(fmt, yformat, ttype):
    table = {"type": ttype, "subcolumnFormat": fmt,
             "datasets": [{"name": "A", "rows": [[10.5, 1.2, 4], [12, 2.5, 5]]},
                          {"name": "B", "rows": [[8, 0.9, 6], [9.1, 1.1, 3]]}]}
    if ttype == "xy":
        table["x"] = [1, 10]
    if ttype == "grouped":
        table["rowTitles"] = ["Day 1", "Day 2"]
    out, (t,) = roundtrip([{"title": "Summary", "table": table}])
    assert out["warnings"] == []
    assert t["y_format"] == yformat
    assert t["replicates"] == 1
    assert [d["ys"] for d in t["datasets"]] == \
        [as_float(d["rows"]) for d in table["datasets"]]
    root = ElementTree.fromstring(out["xml"])
    for y in root.iter(NS + "YColumn"):
        assert y.get("Subcolumns") == "3"
    again = write_pzfx([canonical(t)])
    assert again["xml"] == out["xml"]


def test_unmapped_summary_format_is_written_as_replicates_with_warning():
    out = write_pzfx([{"title": "CI", "table": {
        "type": "column", "subcolumnFormat": "mean_ci_n",
        "datasets": [{"name": "A", "rows": [[1, 0.5, 1.5, 10]]}]}}])
    t = parse_pzfx(out["xml"])["tables"][0]
    assert t["y_format"] == "replicates" and t["replicates"] == 4
    assert out["warnings"] and "mean_ci_n" in out["warnings"][0]


def _shape(elem):
    """Element layout: tag, sorted attribute names, child shapes (d cells
    collapsed)."""
    tag = elem.tag.replace(NS, "")
    kids = [c for c in elem if c.tag.replace(NS, "") != "d"]
    return (tag, tuple(sorted(elem.attrib)), tuple(_shape(c) for c in kids))


def test_schema_shape_matches_fixtures():
    out = write_pzfx([XY, {"title": "G", "table": {
        "type": "grouped", "rowTitles": ["Male", "Female"], "datasets": [
            {"name": "Placebo", "rows": [[10, 12, 11], [9, 11, 10]]}]}}])
    mine = ElementTree.fromstring(out["xml"])
    fixture = ElementTree.fromstring(FIXTURES[0].read_bytes())
    sample = ElementTree.fromstring(FIXTURES[1].read_bytes())
    assert mine.tag == fixture.tag == NS + "GraphPadPrismFile"
    assert mine.get("PrismXMLVersion") == fixture.get("PrismXMLVersion")
    # same Table attributes as the fixtures (Prism writes these)
    fx_tables = list(fixture.iter(NS + "Table")) + list(sample.iter(NS + "Table"))
    want = set(fx_tables[0].attrib)
    for tbl in mine.iter(NS + "Table"):
        assert set(tbl.attrib) >= want
        assert tbl.find(NS + "Title") is not None
    # TableSequence refers to every table, first one selected
    refs = mine.find(NS + "TableSequence").findall(NS + "Ref")
    assert [r.get("ID") for r in refs] == \
        [t.get("ID") for t in mine.iter(NS + "Table")]
    assert refs[0].get("Selected") == "1"
    # grouped table layout equals the grouped fixture's (ignoring Width)
    g_mine = list(mine.iter(NS + "Table"))[1]
    g_fix = next(fixture.iter(NS + "Table"))
    strip = lambda s: (s[0], tuple(a for a in s[1] if a not in  # noqa: E731
                                    ("Width", "Decimals")),
                       tuple(strip(c) for c in s[2]))
    assert strip(_shape(g_mine))[2][:3] == strip(_shape(g_fix))[2][:3]
    # every YColumn: Title first, then Subcolumns-many Subcolumn elements
    for y in mine.iter(NS + "YColumn"):
        kids = [c.tag.replace(NS, "") for c in y]
        assert kids[0] == "Title"
        assert kids[1:] == ["Subcolumn"] * int(y.get("Subcolumns"))


@pytest.mark.parametrize("path", FIXTURES, ids=lambda p: p.name)
def test_fixtures_survive_parse_write_parse(path):
    first = parse_pzfx(path.read_bytes(), keep_excluded=True, row_titles=True)
    out = write_pzfx([canonical(t) for t in first["tables"]])
    second = parse_pzfx(out["xml"], keep_excluded=True, row_titles=True)
    for a, b in zip(first["tables"], second["tables"]):
        a, b = dict(a), dict(b)
        a.pop("id"), b.pop("id")
        if a["table_type"] not in ("XY", "Survival"):
            a["x"] = b["x"] = None  # the writer drops X for column tables
            a["x_format"] = b["x_format"]
        assert a == b


def test_errors_and_api():
    with pytest.raises(ValueError, match="nothing to export"):
        write_pzfx([])
    with pytest.raises(ValueError, match="cannot be written"):
        write_pzfx([{"title": "MV", "table": {"type": "multivariable",
                                              "datasets": [{"name": "a"}]}}])
    res = analyze({"analysis": "pzfx_export", "data": {"tables": [XY]},
                   "options": {}})
    assert "error" not in res, res.get("error")
    assert res["xml"].startswith("<?xml")
    back = analyze({"analysis": "pzfx_import", "data": {"text": res["xml"]},
                    "options": {}})
    assert back["tables"][0]["datasets"][0]["ys"][0] == [98.1, 101.3]
