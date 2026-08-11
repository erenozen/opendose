"""Microplate quantification (SRB / MTT / viability assays).

Workflow (standard SRB analysis, e.g. Vichai & Kirtikara 2006, Nat Protoc):
1. Blank subtraction: mean of designated blank wells (dye + medium, no
   cells) is subtracted from every sample well.
2. Per-group normalization: each replicate group (e.g. one cell line in
   rows B-D) has a 0-dose control column; blank-corrected absorbance is
   expressed relative to the mean corrected control of the SAME group:
       viability%  = 100 * (A - blank) / mean(A_control - blank)
       inhibition% = 100 - viability%
3. The dosed columns then form a dose-response table (X = dose,
   replicates from the group's rows) ready for log-transform + 4PL fit.

The plate is a plain rows x cols grid of numbers (None = empty); parsing
file formats lives in plate_io.py.
"""

from __future__ import annotations

import re

ROW_LETTERS = "ABCDEFGHIJKLMNOP"  # up to 384-well

_WELL_RE = re.compile(r"^([A-Pa-p])(\d{1,2})$")


def parse_well(address: str) -> tuple[int, int]:
    """'H3' -> (row_index, col_index), zero-based."""
    m = _WELL_RE.match(address.strip())
    if not m:
        raise ValueError(f"invalid well address: {address!r}")
    row = ROW_LETTERS.index(m.group(1).upper())
    col = int(m.group(2)) - 1
    if col < 0:
        raise ValueError(f"invalid well address: {address!r}")
    return row, col


def well_value(grid, address: str) -> float | None:
    r, c = parse_well(address)
    if r >= len(grid) or c >= len(grid[r]):
        return None
    return grid[r][c]


def blank_mean(grid, blank_wells) -> float:
    values = [well_value(grid, w) for w in blank_wells]
    values = [v for v in values if v is not None]
    if not values:
        raise ValueError("no blank wells with values")
    return sum(values) / len(values)


def quantify_plate(grid, layout: dict) -> dict:
    """Blank-correct and normalize a plate into per-group dose tables.

    layout = {
      "blank_wells": ["H3", "H4", "H5"],        # optional; no subtraction if absent
      "groups": [{"name": "...", "rows": ["B","C","D"]}, ...],
      "columns": [{"col": 2, "dose": 0.0}, {"col": 3, "dose": 5.0}, ...],
      "control_dose": 0.0,                      # which dose defines 100%
      "output": "viability" | "inhibition" | "corrected",
    }
    Returns {"blank": float|None, "groups": [{name, doses, values, control_mean,
             n_replicates}]} where values[i][j] = replicate j at doses[i]
    (control dose excluded; it defines the scale).
    """
    blank = blank_mean(grid, layout["blank_wells"]) if layout.get("blank_wells") else 0.0
    output = layout.get("output", "viability")
    control_dose = layout.get("control_dose", 0.0)
    columns = layout["columns"]
    control_cols = [c["col"] for c in columns if c["dose"] == control_dose]
    dose_cols = [c for c in columns if c["dose"] != control_dose]

    groups_out = []
    for group in layout["groups"]:
        row_idx = [ROW_LETTERS.index(r.upper()) for r in group["rows"]]

        def corrected(ri: int, col_1based: int) -> float | None:
            v = grid[ri][col_1based - 1] if col_1based - 1 < len(grid[ri]) else None
            return None if v is None else v - blank

        control_values = [corrected(ri, col) for ri in row_idx for col in control_cols]
        control_values = [v for v in control_values if v is not None]
        if output != "corrected" and not control_values:
            raise ValueError(f"group {group['name']!r}: no control-dose wells")
        control_mean = (sum(control_values) / len(control_values)
                        if control_values else None)

        doses, values = [], []
        for c in sorted(dose_cols, key=lambda d: d["dose"]):
            row_vals = []
            for ri in row_idx:
                v = corrected(ri, c["col"])
                if v is None:
                    row_vals.append(None)
                elif output == "corrected":
                    row_vals.append(v)
                elif output == "viability":
                    row_vals.append(100.0 * v / control_mean)
                else:  # inhibition
                    row_vals.append(100.0 - 100.0 * v / control_mean)
            doses.append(c["dose"])
            values.append(row_vals)

        groups_out.append({
            "name": group["name"],
            "doses": doses,
            "values": values,
            "control_mean": control_mean,
            "n_replicates": len(row_idx),
        })

    return {"blank": blank if layout.get("blank_wells") else None,
            "groups": groups_out}
