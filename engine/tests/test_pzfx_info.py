"""Prism Info sheets in .pzfx files (FEATURE-PLAN P-59): read on import,
written on export, and the round trip.

The fixture web/e2e-fixtures/info.pzfx was written by hand in the layout
Prism 6 writes for Info sheets (InfoSequence, then Info with Title, Notes
and Constant/Name/Value, before the TableSequence), checked against the
Prism-written sample exponential_decay.pzfx in the open-source pzfx R
package (inst/extdata) and that package's write_pzfx.R. Its Info sheet
holds the acceptance test's constant "Cell line = HeLa", Prism's six
default constants (some empty) and notes with <Font>, <B> and <BR>.

Opening the exported file in Prism itself is the one manual check
(docs/prism-validation.md); it cannot run here.
"""

from pathlib import Path
from xml.etree import ElementTree

from opendose.api import analyze
from opendose.pzfx import parse_pzfx, write_pzfx

ROOT = Path(__file__).parents[2]
FIXTURE = ROOT / "web" / "e2e-fixtures" / "info.pzfx"
NS = "{http://graphpad.com/prism/Prism.htm}"

CONSTANTS = [
    {"name": "Experiment Date", "value": "2026-11-02"},
    {"name": "Experiment ID", "value": ""},
    {"name": "Notebook ID", "value": "NB-14 p. 32"},
    {"name": "Project", "value": ""},
    {"name": "Experimenter", "value": "A. Müller"},
    {"name": "Protocol", "value": ""},
    {"name": "Cell line", "value": "HeLa"},
    {"name": "Dilution factor", "value": "2.5"},
]
NOTES = ("Viability after 48 h, three plates.\n"
         "Plate 2 edge wells left out (evaporation).")
TABLE = {"title": "Viability", "table": {
    "type": "column", "datasets": [
        {"name": "Control", "rows": [["98.2"], ["101.4"], ["99.0"]]},
        {"name": "Drug", "rows": [["61.7"], ["58.3"], ["64.9"]]}]}}


def test_import_reads_the_info_sheet():
    out = parse_pzfx(FIXTURE.read_bytes())
    assert out["info"] == [{"title": "Project info 1", "notes": NOTES,
                            "constants": CONSTANTS}]
    # the data table is read as before
    assert [d["name"] for d in out["tables"][0]["datasets"]] == ["Control", "Drug"]
    # the API passes the sheets on
    res = analyze({"analysis": "pzfx_import", "data": {"text": FIXTURE.read_text()},
                   "options": {}})
    assert res["info"][0]["constants"][6] == {"name": "Cell line", "value": "HeLa"}


def test_files_without_info_sheets_and_old_exports():
    plain = ROOT / "web" / "e2e-fixtures" / "sample.pzfx"
    assert parse_pzfx(plain.read_bytes())["info"] == []
    # the previous export's one empty sheet reads as an empty sheet
    old = write_pzfx([TABLE])
    assert parse_pzfx(old["xml"])["info"] == [
        {"title": "Project info 1", "notes": "", "constants": []}]


def test_export_writes_constants_and_notes_and_round_trips():
    info = [{"title": "Project info 1", "notes": NOTES, "constants": CONSTANTS},
            {"title": "Plate 2 & <edge>", "notes": "Line one\n\nLine three", "constants": [
                {"name": "Reader", "value": "Synergy H1"}, {"name": "  ", "value": "dropped"}]}]
    out = write_pzfx([TABLE], info)
    back = parse_pzfx(out["xml"])
    assert back["info"][0] == info[0]
    assert back["info"][1] == {"title": "Plate 2 & <edge>", "notes": "Line one\n\nLine three",
                               "constants": [{"name": "Reader", "value": "Synergy H1"}]}
    # layout: InfoSequence with a Ref per sheet, the first selected, the
    # Info sheets before the TableSequence; Title, Notes, then Constants
    root = ElementTree.fromstring(out["xml"])
    kids = [c.tag.replace(NS, "") for c in root]
    assert kids[:5] == ["Created", "InfoSequence", "Info", "Info", "TableSequence"]
    refs = root.find(NS + "InfoSequence").findall(NS + "Ref")
    assert [(r.get("ID"), r.get("Selected")) for r in refs] == [("Info0", "1"), ("Info1", None)]
    first = root.findall(NS + "Info")[0]
    assert [c.tag.replace(NS, "") for c in first] == ["Title", "Notes"] + ["Constant"] * 8
    hela = first.findall(NS + "Constant")[6]
    assert [c.tag.replace(NS, "") for c in hela] == ["Name", "Value"]
    assert (hela.find(NS + "Name").text, hela.find(NS + "Value").text) == ("Cell line", "HeLa")
    assert len(first.find(NS + "Notes").findall(NS + "BR")) == 1


def test_fixture_round_trip_through_the_api():
    """Open the fixture, export its tables and info sheets, open the export:
    the constants and notes come back unchanged."""
    first = analyze({"analysis": "pzfx_import", "data": {"text": FIXTURE.read_text()},
                     "options": {}})
    out = analyze({"analysis": "pzfx_export", "data": {"tables": [TABLE], "info": first["info"]},
                   "options": {}})
    assert "error" not in out, out.get("error")
    again = analyze({"analysis": "pzfx_import", "data": {"text": out["xml"]}, "options": {}})
    assert again["info"] == first["info"]


def test_no_info_keeps_the_previous_output():
    a = write_pzfx([TABLE])
    b = write_pzfx([TABLE], [])
    assert a == b
    assert '<Info ID="Info0"><Title>Project info 1</Title><Notes/></Info>' in a["xml"]


def test_notes_markup_variants():
    def notes(inner):
        xml = ('<GraphPadPrismFile xmlns="http://graphpad.com/prism/Prism.htm">'
               f'<Info ID="Info0"><Title>T</Title><Notes>{inner}</Notes></Info>'
               '<Table ID="Table0" TableType="OneWay"><Title>x</Title><YColumn Subcolumns="1">'
               '<Title>A</Title><Subcolumn><d>1</d></Subcolumn></YColumn></Table></GraphPadPrismFile>')
        return parse_pzfx(xml)["info"][0]["notes"]
    # no <BR>: the text's own line breaks
    assert notes("first line\n  second line\n") == "first line\nsecond line"
    # runs of formatting keep their spaces
    assert notes('<Font Face="Arial"><B>Bold</B> then <I>italic</I><BR/>next</Font>') == "Bold then italic\nnext"
    # empty notes, and a Notes element that is only whitespace
    assert notes("") == "" and notes("\n  \n") == ""
