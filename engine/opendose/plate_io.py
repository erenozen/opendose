"""Plate-file parsing: locate a microplate grid inside a spreadsheet.

Plate-reader exports (SpectraMax, BioTek, Multiskan, Envision...) embed
a grid whose first column holds the row letters (A, B, C ...) and whose
header row holds the column numbers (1, 2, 3 ...), often below a
preamble of instrument settings. We scan for that signature instead of
assuming a fixed position, so decorated or hand-edited exports parse.

Shape rule (``locate_plate``; the TypeScript port in
web/src/share/recipes/plate.ts mirrors it):

1. Labelled grid. The first cell (reading order: top to bottom, left to
   right) holding "A" with "B" directly below it starts a labelled
   block. Its row count R is the run of consecutive row labels below it
   (A..Z, then AA..AF for 1536 wells). Its column count C is the run of
   consecutive integers 1, 2, 3 ... in the row above, starting one cell
   to the right of the "A" (the column header), when that header is
   present. Without a header, C is the column count of the known format
   with R rows (2 -> 3, 3 -> 4, 4 -> 6, 6 -> 8, 8 -> 12, 16 -> 24,
   32 -> 48), or, when R matches no format, the extent of the numbers to
   the right of the labels (up to a column that is text in more than
   half of the rows, such as the labels of a second plate). A labelled
   block needs a column header, or numbers in at least half of the
   R x min(C, extent) cells. The labelled extent always wins over the
   format list, so a 16 x 24 grid is never read as its top-left 8 x 12.
2. Bare grid (no "A"/"B" labels anywhere). Consecutive rows of numbers
   form a block (a row is numeric when all its non-empty cells are
   numbers, or when it starts with a number, holds at least two and at
   most a quarter of its cells are text such as "OVRFLW", which become
   empty wells; a line with nothing but white space ends a block, a line
   of separators only is an empty row inside it;
   a leading or trailing row with fewer than half the block's numbers,
   such as a lone wavelength, is dropped). A first row reading exactly
   1, 2, ..., k is a column header (C = k). Of several blocks the
   largest (rows x columns) is taken, the first of equal ones.
3. Formats: 6 (2 x 3), 12 (3 x 4), 24 (4 x 6), 48 (6 x 8), 96 (8 x 12),
   384 (16 x 24), 1536 (32 x 48) wells. A block that is not exactly one
   of them is padded with empty wells to the smallest format that holds
   it, with a warning; a block larger than 1536 wells is returned as it
   stands, with a warning. Numbers to the right of or below the block
   that were not read are reported in a warning. Nothing is dropped
   silently.
4. A requested ``plate_format`` that differs from the detected one gives
   a warning; the grid is padded to the requested size when that is
   larger and never truncated when it is smaller.

Works natively and in Pyodide (openpyxl is pure Python).
"""

from __future__ import annotations

import io

from .plate import ROW_LABELS

# wells -> (rows, columns), smallest first
PLATE_FORMATS = {6: (2, 3), 12: (3, 4), 24: (4, 6), 48: (6, 8),
                 96: (8, 12), 384: (16, 24), 1536: (32, 48)}
# kept for callers that iterate shapes; largest first
PLATE_SHAPES = [PLATE_FORMATS[w] for w in sorted(PLATE_FORMATS, reverse=True)]
_COLS_FOR_ROWS = {r: c for r, c in PLATE_FORMATS.values()}


def _cell_matrix(sheet) -> list[list]:
    return [list(row) for row in sheet.iter_rows(values_only=True)]


def _num(v) -> float | None:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _empty(v) -> bool:
    return v is None or (isinstance(v, str) and not v.strip())


def _cell(matrix, r, c):
    if r < 0 or r >= len(matrix) or matrix[r] is None:
        return None
    row = matrix[r]
    return row[c] if 0 <= c < len(row) else None


def _label(v) -> str | None:
    return v.strip().upper() if isinstance(v, str) else None


def _header_run(matrix, r, c0) -> int:
    """Length of the run 1, 2, 3 ... in row r starting at column c0."""
    k = 0
    while True:
        v = _cell(matrix, r, c0 + k)
        if isinstance(v, str):
            try:
                v = float(v.strip())
            except ValueError:
                break
        x = _num(v)
        if x is None or x != k + 1:
            break
        k += 1
    return k


def _format_of(rows: int, cols: int) -> int | None:
    for wells, shape in PLATE_FORMATS.items():
        if shape == (rows, cols):
            return wells
    return None


def _containing_format(rows: int, cols: int) -> int | None:
    for wells, (nr, nc) in PLATE_FORMATS.items():  # smallest first
        if rows <= nr and cols <= nc:
            return wells
    return None


def _numeric_extent(matrix, top, n_rows, c0) -> int:
    """Columns from c0 to the right-most number in rows top..top+n_rows-1,
    stopping at a column that is text in more than half of those rows
    (e.g. the row labels of a second plate placed to the right; a lone
    "OVRFLW" well does not stop it)."""
    width = max((len(matrix[top + r] or []) for r in range(n_rows)), default=0)
    extent = 0
    for c in range(c0, width):
        col = [_cell(matrix, top + r, c) for r in range(n_rows)]
        if sum(1 for v in col if not _empty(v) and _num(v) is None) * 2 > n_rows:
            break
        if any(_num(v) is not None for v in col):
            extent = c - c0 + 1
    return extent


def _count_numbers(matrix, r0, r1, c0, c1) -> int:
    return sum(1 for r in range(max(r0, 0), min(r1, len(matrix)))
               for c in range(max(c0, 0), c1)
               if _num(_cell(matrix, r, c)) is not None)


def _labelled_block(matrix):
    for top in range(len(matrix) - 1):
        row = matrix[top] or []
        for left, v in enumerate(row):
            if _label(v) != "A" or _label(_cell(matrix, top + 1, left)) != "B":
                continue
            n_rows = 2
            while n_rows < len(ROW_LABELS) and \
                    _label(_cell(matrix, top + n_rows, left)) == ROW_LABELS[n_rows]:
                n_rows += 1
            header = _header_run(matrix, top - 1, left + 1)
            extent = _numeric_extent(matrix, top, n_rows, left + 1)
            if header:
                n_cols = header
            elif n_rows in _COLS_FOR_ROWS:
                n_cols = _COLS_FOR_ROWS[n_rows]
            else:
                n_cols = extent
            if n_cols == 0:
                continue
            found = _count_numbers(matrix, top, top + n_rows, left + 1,
                                   left + 1 + n_cols)
            # a header vouches for the grid; without one, ask for numbers
            # in at least half of the wells up to the last numeric column
            needed = 1 if header else max(1, 0.5 * n_rows * min(n_cols, max(extent, 1)))
            if found < needed:
                continue
            return {"top": top, "left": left + 1, "rows": n_rows,
                    "cols": n_cols, "extent": extent,
                    "labelled_rows": True, "labelled_columns": bool(header)}
    return None


def _row_kind(row) -> str:
    if row is None:
        return "break"
    cells = [v for v in row if not _empty(v)]
    if not cells:
        return "empty"
    n_num = sum(1 for v in cells if _num(v) is not None)
    if n_num == len(cells):
        return "numeric"
    # a reading such as "OVRFLW" in a row of numbers: still a plate row
    # (it becomes an empty well); preamble rows ("Wavelength: 450")
    # start with their label
    if n_num >= 2 and _num(cells[0]) is not None and \
            4 * (len(cells) - n_num) <= len(cells):
        return "numeric"
    return "text"


def _bare_blocks(matrix):
    kinds = [_row_kind(r) for r in matrix]
    blocks, i = [], 0
    while i < len(matrix):
        if kinds[i] != "numeric":
            i += 1
            continue
        j = i
        while j + 1 < len(matrix) and kinds[j + 1] in ("numeric", "empty"):
            j += 1
        while kinds[j] == "empty":
            j -= 1
        blocks.append((i, j + 1))
        i = j + 1
    out = []
    for r0, r1 in blocks:
        counts = [sum(1 for v in (matrix[r] or []) if _num(v) is not None)
                  for r in range(r0, r1)]
        top_n = max(counts)
        while r0 < r1 and counts[0] < 0.5 * top_n:
            r0, counts = r0 + 1, counts[1:]
        while r1 > r0 and counts[-1] < 0.5 * top_n:
            r1, counts = r1 - 1, counts[:-1]
        if r1 - r0 < 1:
            continue
        firsts = [next((c for c, v in enumerate(matrix[r] or [])
                        if not _empty(v)), None) for r in range(r0, r1)]
        left = min((f for f in firsts if f is not None), default=0)
        header_at = firsts[0] if firsts[0] is not None else left
        header = _header_run(matrix, r0, header_at)
        if header >= 2 and header == counts[0] and r1 - r0 >= 2:
            r0, left, n_cols = r0 + 1, header_at, header
        else:
            header = 0
            n_cols = max(next((c for c in range(len(matrix[r] or []) - 1, -1, -1)
                               if _num(matrix[r][c]) is not None), -1) + 1
                         for r in range(r0, r1)) - left
        n_rows = r1 - r0
        if n_rows >= 2 and n_cols >= 2:
            out.append({"top": r0, "left": left, "rows": n_rows,
                        "cols": n_cols, "extent": n_cols,
                        "labelled_rows": False,
                        "labelled_columns": bool(header)})
    return out


def locate_plate(matrix: list[list], plate_format: int | None = None) -> dict | None:
    """Find the plate grid in a cell matrix (rows of cells; None or ""
    for empty cells; a None row is a hard break such as a blank text
    line). Returns {"grid", "rows", "cols", "format" (wells or None),
    "top", "left" (0-based position of well A1), "labelled_rows",
    "labelled_columns", "warnings"} or None. See the module docstring
    for the shape rule."""
    block = _labelled_block(matrix)
    if block is None:
        bare = _bare_blocks(matrix)
        if not bare:
            return None
        block = max(bare, key=lambda b: (b["rows"] * b["cols"], -b["top"]))
    warnings = []
    n_rows, n_cols = block["rows"], block["cols"]
    top, left = block["top"], block["left"]
    where = "labelled" if block["labelled_rows"] else "unlabelled"
    if block["extent"] > n_cols:
        warnings.append(
            f"Numbers in {block['extent'] - n_cols} column(s) to the right of "
            f"column {n_cols} of the {where} {n_rows} x {n_cols} grid were "
            "not read as wells.")
    fmt = _format_of(n_rows, n_cols)
    out_rows, out_cols = n_rows, n_cols
    if fmt is None:
        fmt = _containing_format(n_rows, n_cols)
        hint = ""
        if _format_of(n_cols, n_rows) is not None:
            hint = " (it would match if rows and columns were swapped)"
        if fmt is None:
            warnings.append(
                f"The {where} grid is {n_rows} x {n_cols}, larger than any "
                f"known plate format{hint}; it was read as it stands.")
        else:
            out_rows, out_cols = PLATE_FORMATS[fmt]
            warnings.append(
                f"The {where} grid is {n_rows} x {n_cols}, not a known plate "
                f"format{hint}; it was read as the top-left corner of a "
                f"{fmt}-well plate ({out_rows} x {out_cols}) and the other "
                "wells are empty.")
    if plate_format is not None and int(plate_format) != fmt:
        req = int(plate_format)
        if req not in PLATE_FORMATS:
            raise ValueError(f"unknown plate format: {plate_format}")
        warnings.append(
            f"The grid found is {'a ' + str(fmt) + '-well plate' if fmt else 'not a known format'}"
            f" ({n_rows} x {n_cols}) but the plate format is {req} wells.")
        rr, rc = PLATE_FORMATS[req]
        if rr >= out_rows and rc >= out_cols:
            out_rows, out_cols, fmt = rr, rc, req
        else:
            warnings.append("The grid was kept at its full size; no wells "
                            "were dropped.")
    below = _count_numbers(matrix, top + n_rows, top + n_rows + 1, left,
                           left + n_cols) if block["labelled_rows"] else 0
    if below and _label(_cell(matrix, top + n_rows, left - 1)) in (None, ""):
        warnings.append(
            f"Numbers in the row below row {ROW_LABELS[n_rows - 1]} have no "
            "row label and were not read as wells.")
    grid = [[_num(_cell(matrix, top + r, left + c))
             if r < n_rows and c < n_cols else None
             for c in range(out_cols)] for r in range(out_rows)]
    return {"grid": grid, "rows": out_rows, "cols": out_cols, "format": fmt,
            "top": top, "left": left,
            "labelled_rows": block["labelled_rows"],
            "labelled_columns": block["labelled_columns"],
            "warnings": warnings}


def find_plate_grid(matrix: list[list]) -> list[list[float | None]] | None:
    """The plate grid in a cell matrix (labelled block first, then a bare
    numeric block), or None. ``locate_plate`` also returns the shape and
    the warnings."""
    found = locate_plate(matrix)
    return None if found is None else found["grid"]


def read_xlsx(data: bytes, plate_format: int | None = None) -> dict:
    """Parse xlsx bytes: ``locate_plate`` on the first sheet holding a
    plate grid."""
    import openpyxl  # deferred: lets plate.py work without openpyxl installed

    wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True, read_only=True)
    for sheet in wb.worksheets:
        found = locate_plate(_cell_matrix(sheet), plate_format)
        if found is not None:
            return found
    raise ValueError("no plate-shaped grid (rows A, B, C ... with numbers, "
                     "or a numeric block) found in workbook")


def read_text(text: str, plate_format: int | None = None) -> dict:
    """Parse a pasted tab/semicolon/comma-separated block: ``locate_plate``
    on its cells. A line with no characters other than white space ends a
    block; a line of separators only is an empty plate row."""
    rows = []
    for line in text.replace("\r", "").split("\n"):
        if not line.strip(" "):
            rows.append(None)
            continue
        sep = "\t" if "\t" in line else (";" if ";" in line else ",")
        rows.append([_maybe_num(tok) for tok in line.split(sep)])
    found = locate_plate(rows, plate_format)
    if found is None:
        raise ValueError("pasted text does not contain a recognizable plate grid")
    return found


def parse_xlsx(data: bytes) -> list[list[float | None]]:
    """Parse xlsx bytes; return the first plate grid found in any sheet."""
    return read_xlsx(data)["grid"]


def parse_text(text: str) -> list[list[float | None]]:
    """Parse a pasted block and return its plate grid (see read_text)."""
    return read_text(text)["grid"]


def _maybe_num(tok: str):
    t = tok.strip().replace(",", ".") if tok.count(",") == 1 and "." not in tok else tok.strip()
    try:
        return float(t)
    except ValueError:
        return tok.strip()
