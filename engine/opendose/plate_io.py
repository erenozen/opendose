"""Plate-file parsing: locate a microplate grid inside a spreadsheet.

Plate-reader exports (SpectraMax, BioTek, Multiskan...) commonly embed an
8x12 (or 16x24) block whose first column is the row letters A-H and whose
header row is 1..12. We scan for that signature instead of assuming a
fixed position, so decorated/hand-edited exports still parse.

Works natively and in Pyodide (openpyxl is pure Python).
"""

from __future__ import annotations

import io

from .plate import ROW_LETTERS

PLATE_SHAPES = [(8, 12), (16, 24), (6, 8), (4, 6)]  # 96, 384, 48, 24 wells


def _cell_matrix(sheet) -> list[list]:
    return [list(row) for row in sheet.iter_rows(values_only=True)]


def find_plate_grid(matrix: list[list]) -> list[list[float | None]] | None:
    """Find the first plate-shaped block: rows starting with consecutive
    letters A, B, C... whose following cells are mostly numeric."""
    for n_rows, n_cols in PLATE_SHAPES:
        for top in range(len(matrix)):
            for left in range(len(matrix[top]) if matrix[top] else 0):
                if _is_plate_at(matrix, top, left, n_rows, n_cols):
                    return [
                        [_num(matrix[top + r][left + 1 + c])
                         for c in range(n_cols)]
                        for r in range(n_rows)
                    ]
    return None


def _num(v) -> float | None:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _is_plate_at(matrix, top, left, n_rows, n_cols) -> bool:
    if top + n_rows > len(matrix):
        return False
    numeric = 0
    for r in range(n_rows):
        row = matrix[top + r]
        if left + 1 + n_cols > len(row):
            return False
        label = row[left]
        if not (isinstance(label, str) and label.strip().upper() == ROW_LETTERS[r]):
            return False
        numeric += sum(1 for c in range(n_cols) if _num(row[left + 1 + c]) is not None)
    return numeric >= n_rows * n_cols * 0.6  # tolerate some empty wells


def parse_xlsx(data: bytes) -> list[list[float | None]]:
    """Parse xlsx bytes; return the first plate grid found in any sheet."""
    import openpyxl  # deferred: lets plate.py work without openpyxl installed

    wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True, read_only=True)
    for sheet in wb.worksheets:
        grid = find_plate_grid(_cell_matrix(sheet))
        if grid is not None:
            return grid
    raise ValueError("no plate-shaped grid (A-H x 1-12 etc.) found in workbook")


def parse_text(text: str) -> list[list[float | None]]:
    """Parse a pasted tab/comma-separated block into a matrix, then find
    the plate grid (or, if the block has no A-H labels but is exactly
    plate-shaped numeric data, accept it as-is)."""
    rows = []
    for line in text.replace("\r", "").split("\n"):
        if not line.strip():
            continue
        sep = "\t" if "\t" in line else (";" if ";" in line else ",")
        rows.append([_maybe_num(tok) for tok in line.split(sep)])
    grid = find_plate_grid(rows)
    if grid is not None:
        return grid
    shape = (len(rows), max((len(r) for r in rows), default=0))
    if shape in PLATE_SHAPES and all(
        all(v is None or isinstance(v, float) for v in row) for row in rows
    ):
        return [[_num(v) for v in row] + [None] * (shape[1] - len(row))
                for row in rows]
    raise ValueError("pasted text does not contain a recognizable plate grid")


def _maybe_num(tok: str):
    t = tok.strip().replace(",", ".") if tok.count(",") == 1 and "." not in tok else tok.strip()
    try:
        return float(t)
    except ValueError:
        return tok.strip()
