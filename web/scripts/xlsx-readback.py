"""Read an OpenDose .xlsx back with three independent readers and compare
every cell with what the CSV export holds (P-64, P-65).

    python xlsx-readback.py BOOK.xlsx EXPECTED.json [--readers openpyxl,calamine,libreoffice]

EXPECTED.json maps sheet name -> rows of cells, each cell
{"t": "n", "v": "<CSV text>"} (must read back as a number equal to the
double the CSV text parses to), {"t": "s", "v": "<text>"} (must read
back as that text) or null (empty). Sheets not listed are not checked;
a listed sheet must exist and hold nothing beyond the expected rows.

Readers:
  openpyxl      openpyxl.load_workbook (pure Python)
  calamine      python-calamine (Rust calamine, the reader pandas uses)
  libreoffice   LibreOffice Calc, headless over UNO: every sheet's used
                area as Calc holds it (getDataArray: a double per number
                cell, a string per text cell). Calc's own CSV and ODS
                writers round numbers to 15 digits, so a conversion
                cannot show what it read; pyuno lives in the system
                Python (OPENDOSE_UNO_PYTHON, default /usr/bin/python3),
                so this reader runs in a child process there.

Prints one line per reader and exits 1 on the first mismatch. A reader
that is not installed is reported as missing (exit 2), never skipped
silently. Used by e2e-export.mjs (OPENDOSE_PYTHON names the Python with
openpyxl and python-calamine).
"""
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile


def same_number(got, text):
    want = float(text)
    if isinstance(got, bool) or not isinstance(got, (int, float)):
        return False
    return float(got) == want or (math.isnan(want) and math.isnan(float(got)))


def check(reader, sheets, expected):
    """sheets: name -> rows of (kind, value); kind 'n', 's' or None."""
    for name, rows in expected.items():
        if name not in sheets:
            return f"{reader}: no sheet {name!r} (sheets: {sorted(sheets)})"
        got = sheets[name]
        width = max([len(r) for r in rows] + [0])
        for i in range(max(len(rows), len(got))):
            want_row = rows[i] if i < len(rows) else []
            got_row = got[i] if i < len(got) else []
            for j in range(max(width, len(got_row))):
                w = want_row[j] if j < len(want_row) else None
                kind, val = got_row[j] if j < len(got_row) else (None, None)
                where = f"{reader}: {name}!R{i + 1}C{j + 1}"
                if w is None:
                    if kind is not None:
                        return f"{where}: expected empty, got {val!r}"
                elif w["t"] == "n":
                    if kind != "n" or not same_number(val, w["v"]):
                        return f"{where}: expected the number {w['v']}, got {kind} {val!r}"
                elif kind != "s" or val != w["v"]:
                    return f"{where}: expected the text {w['v']!r}, got {kind} {val!r}"
    return None


def kind_of(v):
    if v is None or v == "":
        return (None, None)
    if isinstance(v, bool):
        return ("s", str(v))
    if isinstance(v, (int, float)):
        return ("n", v)
    return ("s", str(v))


def read_openpyxl(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True)
    return {ws.title: [[kind_of(c.value) for c in row] for row in ws.iter_rows()] for ws in wb.worksheets}


def read_calamine(path):
    from python_calamine import CalamineWorkbook
    wb = CalamineWorkbook.from_path(path)
    out = {}
    for name in wb.sheet_names:
        rows = wb.get_sheet_by_name(name).to_python(skip_empty_area=False)
        out[name] = [[kind_of(v) for v in r] for r in rows]
    return out


def read_libreoffice(path):
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    sys_python = os.environ.get("OPENDOSE_UNO_PYTHON", "/usr/bin/python3")
    if not soffice or not os.path.exists(sys_python):
        raise ImportError("soffice or the system Python with pyuno not found")
    res = subprocess.run([sys_python, os.path.abspath(__file__), "--lo-dump", os.path.abspath(path), soffice],
                         capture_output=True, text=True, timeout=300)
    if res.returncode == 3:
        raise ImportError(res.stderr.strip() or "pyuno missing")
    if res.returncode != 0:
        raise RuntimeError(f"LibreOffice reader failed: {res.stderr.strip()[-400:]}")
    dump = json.loads(res.stdout)
    return {name: [[("n", float.fromhex(c["n"])) if "n" in c else (("s", c["s"]) if c["s"] != "" else (None, None))
                    for c in row] for row in rows] for name, rows in dump.items()}


def lo_dump(path, soffice):
    """Child process in the system Python: print every sheet as JSON
    (numbers as float.hex, exact)."""
    try:
        import uno
        from com.sun.star.beans import PropertyValue
    except ImportError as e:
        print(f"pyuno: {e}", file=sys.stderr)
        sys.exit(3)
    import time
    tmp = tempfile.mkdtemp(prefix="od-lo-")
    pipe = f"opendose{os.getpid()}"
    proc = subprocess.Popen([soffice, f"-env:UserInstallation=file://{tmp}/profile", "--headless", "--invisible",
                             "--norestore", "--nologo", f"--accept=pipe,name={pipe};urp;StarOffice.ComponentContext"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
        ctx = None
        for _ in range(240):
            try:
                ctx = resolver.resolve(f"uno:pipe,name={pipe};urp;StarOffice.ComponentContext")
                break
            except Exception:
                time.sleep(0.5)
        if ctx is None:
            raise RuntimeError("LibreOffice did not start")
        desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
        hidden = PropertyValue()
        hidden.Name, hidden.Value = "Hidden", True
        doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(path), "_blank", 0, (hidden,))
        out = {}
        for i in range(doc.Sheets.getCount()):
            sheet = doc.Sheets.getByIndex(i)
            cur = sheet.createCursor()
            cur.gotoEndOfUsedArea(False)
            addr = cur.getRangeAddress()
            data = sheet.getCellRangeByPosition(0, 0, addr.EndColumn, addr.EndRow).getDataArray()
            out[sheet.getName()] = [[{"n": float(v).hex()} if isinstance(v, float) else {"s": str(v)}
                                     for v in row] for row in data]
        doc.close(True)
        try:
            desktop.terminate()
        except Exception:
            pass
        print(json.dumps(out))
    finally:
        try:
            proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            proc.kill()
        shutil.rmtree(tmp, ignore_errors=True)


READERS = {"openpyxl": read_openpyxl, "calamine": read_calamine, "libreoffice": read_libreoffice}


def main():
    args = sys.argv[1:]
    if args and args[0] == "--lo-dump":
        lo_dump(args[1], args[2])
        return
    readers = list(READERS)
    if "--readers" in args:
        k = args.index("--readers")
        readers = args[k + 1].split(",")
        del args[k:k + 2]
    path, exp_path = args
    with open(exp_path, encoding="utf-8") as fh:
        expected = json.load(fh)
    missing = []
    for r in readers:
        try:
            sheets = READERS[r](path)
        except ImportError as e:
            print(f"{r}: missing ({e})")
            missing.append(r)
            continue
        err = check(r, sheets, expected)
        if err:
            print(err)
            sys.exit(1)
        cells = sum(1 for rows in expected.values() for row in rows for c in row if c)
        print(f"{r}: {len(expected)} sheets, {cells} cells equal")
    sys.exit(2 if missing else 0)


if __name__ == "__main__":
    main()
