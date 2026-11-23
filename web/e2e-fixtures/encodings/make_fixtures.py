"""One ImageJ results file and one StepOne Cq export in every encoding a
file picker meets (P-07).

Run from the repository root:
    /home/eren/opendose/.venv/bin/python web/e2e-fixtures/encodings/make_fixtures.py

imagej-results.*.csv  the same ImageJ / Fiji Results table (a "µm²" header,
    a "°C" label) as UTF-8, UTF-8 with a byte-order mark, UTF-16LE with a
    byte-order mark (Windows "Unicode text"), UTF-16BE with a byte-order mark
    and Windows-1252 (Excel's "CSV" on a Western Windows). µ (0xB5), ² (0xB2)
    and ° (0xB0) all exist in Windows-1252, so all five decode to the same
    text.
stepone-cq.*.txt  a StepOne export whose Cq column is headed "Cт" (C and the
    Cyrillic letter te, U+0442, as StepOne writes it) and whose first sample
    is "Контроль". Windows-1252 has no Cyrillic letters, so this file exists
    only as UTF-8, UTF-8 with a BOM, UTF-16LE and UTF-16BE: a cp1252 copy
    could not carry it, and none is pretended.
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent

IMAGEJ = "\r\n".join([
    " ,Label,Area (µm²),Mean,IntDen,Group",
    "1,Lane 1 37 °C,1523.4,87.2,132840,Control",
    "2,Lane 2 37 °C,1498.1,85.9,128687,Control",
    "3,Lane 3 37 °C,1510.7,86.4,130524,Control",
    "4,Lane 4 42 °C,1532.9,52.3,80171,Heat",
    "5,Lane 5 42 °C,1505.2,49.8,74959,Heat",
    "6,Lane 6 42 °C,1519.6,51.1,77652,Heat",
]) + "\r\n"

STEPONE = "\r\n".join([
    "* Block Type = 96well",
    "* Experiment Name = encoding check",
    "",
    "[Results]",
    "Well\tSample Name\tTarget Name\tTask\tCт",
    "A1\tКонтроль\tGAPDH\tUNKNOWN\t18.21",
    "A2\tКонтроль\tGAPDH\tUNKNOWN\t18.34",
    "A3\tКонтроль\tIL6\tUNKNOWN\t27.02",
    "A4\tКонтроль\tIL6\tUNKNOWN\t26.88",
    "B1\tLPS\tGAPDH\tUNKNOWN\t18.40",
    "B2\tLPS\tGAPDH\tUNKNOWN\t18.29",
    "B3\tLPS\tIL6\tUNKNOWN\t22.15",
    "B4\tLPS\tIL6\tUNKNOWN\t22.31",
]) + "\r\n"

ENCODINGS = {
    "utf8": lambda s: s.encode("utf-8"),
    "utf8-bom": lambda s: b"\xef\xbb\xbf" + s.encode("utf-8"),
    "utf16le": lambda s: b"\xff\xfe" + s.encode("utf-16-le"),
    "utf16be": lambda s: b"\xfe\xff" + s.encode("utf-16-be"),
    "cp1252": lambda s: s.encode("cp1252"),
}


def main():
    for name, enc in ENCODINGS.items():
        (HERE / f"imagej-results.{name}.csv").write_bytes(enc(IMAGEJ))
        if name != "cp1252":
            (HERE / f"stepone-cq.{name}.txt").write_bytes(enc(STEPONE))
    try:
        STEPONE.encode("cp1252")
    except UnicodeEncodeError:
        pass
    else:
        raise AssertionError("cp1252 should not carry Cyrillic")
    (HERE / "imagej-results.expected.txt").write_bytes(IMAGEJ.encode("utf-8"))
    (HERE / "stepone-cq.expected.txt").write_bytes(STEPONE.encode("utf-8"))
    # A broken .xls: an OLE2 header and nothing else. Since P-34 reads .xls,
    # e2e-import checks that it fails with a reason, not a traceback.
    (HERE / "densitometry.xls").write_bytes(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + bytes(504))
    print(sorted(p.name for p in HERE.iterdir()))


if __name__ == "__main__":
    main()
