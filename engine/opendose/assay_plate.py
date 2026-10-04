"""Microplate assays: plate map, blank subtraction, normalisation to
control wells, plate QC (Z', signal window, CVs, edge effects) and
per-compound dose-response tables.

Method sources:
- Zhang, Chung & Oldenburg (1999), J Biomol Screen 4:67: Z' = 1 -
  3(SD_pos + SD_neg)/|mean_pos - mean_neg| from the control wells, with
  the categories of their Table 1 (Z' = 1 ideal; 1 > Z' >= 0.5
  excellent; 0.5 > Z' > 0 marginal ("double"); 0 "yes/no"; < 0
  screening essentially impossible). A robust Z' with median and
  1.4826*MAD is reported alongside.
- NCATS Assay Guidance Manual, "HTS Assay Validation" (Iversen et
  al.): signal-to-background mean_max/mean_min, signal-to-noise
  (mean_max - mean_min)/SD_min (definitions of S/N vary; this one is
  stated so it can be compared), and the signal window SW = (|mean_max -
  mean_min| - 3(SD_max + SD_min))/SD_max (the manual's formula with
  single wells, n = 1); control and replicate CV (common acceptance:
  CV <= 15-20%); edge effects judged from uniform wells (outer ring vs
  interior, row and column means).
- Normalisation (GraphPad Prism curve-fitting guide, "Normalizing
  dose-response data" and the dose-response FAQ; Vichai & Kirtikara
  2006 Nat Protoc for SRB, as in plate.py):
    percent_of_control  = 100*(S - blank)/(mean_neg - blank)
    percent_activity    = 100*(S - mean_pos)/(mean_neg - mean_pos)
    percent_inhibition  = 100*(mean_neg - S)/(mean_neg - mean_pos)
    inhibition_vs_blank = 100 - percent_of_control
  with "neg" the negative / vehicle wells (no effect, 100% signal or 0%
  inhibition) and "pos" the positive / kill control (full effect).
  Blank = mean of the blank wells (0 when there are none).

Roles: blank, negative (vehicle), positive (kill / full effect),
sample (compound, concentration, replicate), empty. Wells are named A1
to P24 (96-well 8 x 12, 384-well 16 x 24) or AF48 (1536-well 32 x 48;
plate.parse_well). The
per-compound output is the canonical {x, datasets} table that the
"dose_response" analysis takes (X = concentration; pass x_is_log false
so it is log-transformed there).
"""

from __future__ import annotations

import re

import numpy as np

from . import anova, ttests
from .plate import parse_well, row_label

ROLES = ("blank", "negative", "positive", "sample", "empty")
NORMALIZATIONS = ("none", "percent_of_control", "percent_activity",
                  "percent_inhibition", "inhibition_vs_blank")
FORMATS = {96: (8, 12), 384: (16, 24), 48: (6, 8), 24: (4, 6),
           6: (2, 3), 12: (3, 4), 1536: (32, 48)}
_ROLE_ALIASES = {"vehicle": "negative", "neg": "negative", "high": "negative",
                 "max": "negative", "pos": "positive", "kill": "positive",
                 "low": "positive", "min": "positive", "unknown": "sample",
                 "compound": "sample", "none": "empty"}
_RANGE_RE = re.compile(
    r"^\s*([A-Za-z]{1,2}\d{1,2})\s*[:\-]\s*([A-Za-z]{1,2}\d{1,2})\s*$")


def well_name(r: int, c: int) -> str:
    return f"{row_label(r)}{c + 1}"


def expand_wells(spec) -> list[str]:
    """'A1', 'A1:B3' (rectangle, row-major) or a list of either."""
    if isinstance(spec, (list, tuple)):
        out = []
        for s in spec:
            out.extend(expand_wells(s))
        return out
    m = _RANGE_RE.match(str(spec))
    if not m:
        r, c = parse_well(str(spec))
        return [well_name(r, c)]
    (r1, c1), (r2, c2) = parse_well(m.group(1)), parse_well(m.group(2))
    return [well_name(r, c)
            for r in range(min(r1, r2), max(r1, r2) + 1)
            for c in range(min(c1, c2), max(c1, c2) + 1)]


def build_plate_map(assignments) -> dict:
    """[{wells, role, compound?, concentration? | concentrations?,
    replicate?}] -> {well: {role, compound, concentration, replicate}}.
    "concentrations" gives one value per expanded well, in order; later
    assignments override earlier ones."""
    pm = {}
    for a in assignments or []:
        role = str(a.get("role", "sample")).lower()
        role = _ROLE_ALIASES.get(role, role)
        if role not in ROLES:
            raise ValueError(f"unknown well role: {a.get('role')}")
        wells = expand_wells(a.get("wells", a.get("well")))
        concs = a.get("concentrations")
        if concs is not None and len(concs) != len(wells):
            raise ValueError("concentrations must give one value per well "
                             f"({len(wells)} wells, {len(concs)} values)")
        reps = a.get("replicates")
        for i, w in enumerate(wells):
            conc = concs[i] if concs is not None else a.get("concentration")
            rep = reps[i] if reps is not None else a.get("replicate")
            pm[w] = {"role": role, "compound": a.get("compound"),
                     "concentration": None if conc is None else float(conc),
                     "replicate": rep}
    return pm


def _values(grid, wells):
    out = []
    for w in wells:
        r, c = parse_well(w)
        v = grid[r][c] if r < len(grid) and c < len(grid[r]) else None
        out.append(None if v is None else float(v))
    return out


def _stats(vals):
    arr = np.array([v for v in vals if v is not None], dtype=float)
    if arr.size == 0:
        return {"n": 0, "mean": None, "sd": None, "cv_pct": None,
                "median": None, "mad": None}
    sd = float(arr.std(ddof=1)) if arr.size > 1 else None
    mean = float(arr.mean())
    med = float(np.median(arr))
    return {"n": int(arr.size), "mean": mean, "sd": sd,
            "cv_pct": (100.0 * sd / abs(mean)) if sd is not None and mean
            else None,
            "median": med,
            "mad": float(1.4826 * np.median(np.abs(arr - med)))}


def z_prime(pos, neg) -> dict:
    """Z' (Zhang 1999) and its robust (median / scaled MAD) version."""
    p, n = _stats(pos), _stats(neg)
    out = {"z_prime": None, "robust_z_prime": None, "category": None}
    if p["n"] >= 2 and n["n"] >= 2 and p["mean"] != n["mean"]:
        z = 1.0 - 3.0 * (p["sd"] + n["sd"]) / abs(p["mean"] - n["mean"])
        out["z_prime"] = z
        out["category"] = ("ideal" if z >= 1 else "excellent" if z >= 0.5
                           else "marginal" if z > 0 else "yes/no" if z == 0
                           else "unusable")
        if p["median"] != n["median"]:
            out["robust_z_prime"] = 1.0 - 3.0 * (p["mad"] + n["mad"]) / abs(
                p["median"] - n["median"])
    return out


def _signal_window(hi, lo):
    """Assay Guidance Manual ratios with max = the higher-signal control."""
    if hi["n"] < 2 or lo["n"] < 2:
        return {}
    if hi["mean"] < lo["mean"]:
        hi, lo = lo, hi
    d = hi["mean"] - lo["mean"]
    return {
        "signal_to_background": hi["mean"] / lo["mean"] if lo["mean"] else None,
        "signal_to_noise": d / lo["sd"] if lo["sd"] else None,
        "signal_window": ((d - 3.0 * (hi["sd"] + lo["sd"])) / hi["sd"]
                          if hi["sd"] else None),
    }


def _edge_check(grid, wells, n_rows, n_cols):
    """Outer ring vs interior (Welch t) and one-way ANOVA across rows and
    across columns of the given wells."""
    vals = {}
    for w in wells:
        r, c = parse_well(w)
        v = grid[r][c] if r < len(grid) and c < len(grid[r]) else None
        if v is not None:
            vals[(r, c)] = float(v)
    edge = [v for (r, c), v in vals.items()
            if r in (0, n_rows - 1) or c in (0, n_cols - 1)]
    inner = [v for (r, c), v in vals.items()
             if not (r in (0, n_rows - 1) or c in (0, n_cols - 1))]
    out = {"n_wells": len(vals), "n_edge": len(edge),
           "n_interior": len(inner), "edge_vs_interior": None,
           "rows": None, "columns": None}
    if len(edge) >= 2 and len(inner) >= 2:
        t = ttests.unpaired_t(edge, inner, welch=True)
        m_in = float(np.mean(inner))
        out["edge_vs_interior"] = {
            "mean_edge": float(np.mean(edge)), "mean_interior": m_in,
            "difference_pct": (100.0 * (float(np.mean(edge)) - m_in) / m_in
                               if m_in else None),
            "t": t["t"], "df": t["df"], "p": t["p_two_tailed"],
            "test": "Welch t test"}

    def by(axis, n):
        groups, names = [], []
        for i in range(n):
            g = [v for (r, c), v in vals.items() if (r if axis == 0 else c) == i]
            if len(g) >= 2:
                groups.append(g)
                names.append(row_label(i) if axis == 0 else str(i + 1))
        means = [{"name": nm, "mean": float(np.mean(g)), "n": len(g)}
                 for nm, g in zip(names, groups)]
        if len(groups) < 2:
            return {"means": means, "anova": None}
        try:
            res = anova.one_way_anova(groups, names)
        except ValueError:
            return {"means": means, "anova": None}
        return {"means": means,
                "anova": {"F": res["table"]["F"], "p": res["table"]["p"],
                          "df_between": res["table"]["df_between"],
                          "df_within": res["table"]["df_within"]}}
    out["rows"] = by(0, n_rows)
    out["columns"] = by(1, n_cols)
    return out


def plate_qc(grid, plate_map, *, normalization="percent_of_control",
             plate_format=None, cv_limit=15.0, z_prime_limit=0.5,
             edge_role="negative") -> dict:
    """Blank subtraction, normalisation, QC metrics and per-compound
    dose-response tables for one plate.

    grid: rows x columns of readings (None = empty). plate_map: a dict
    {well: {role, compound?, concentration?, replicate?}} or the list
    form of build_plate_map. edge_role: role whose wells are used for
    the edge check ("negative", "sample", "all" = every non-blank,
    non-empty well, as on a uniformity plate)."""
    if normalization not in NORMALIZATIONS:
        raise ValueError(f"unknown normalization: {normalization}")
    if isinstance(plate_map, list):
        plate_map = build_plate_map(plate_map)
    plate_map = {well_name(*parse_well(w)): dict(v, role=_ROLE_ALIASES.get(
        str(v.get("role", "sample")).lower(), str(v.get("role", "sample"))
        .lower())) for w, v in plate_map.items()}
    n_rows = len(grid)
    n_cols = max((len(r) for r in grid), default=0)
    if plate_format is not None:
        if int(plate_format) not in FORMATS:
            raise ValueError(f"unknown plate format: {plate_format}")
        n_rows, n_cols = FORMATS[int(plate_format)]
    else:
        for fmt, (nr, nc) in sorted(FORMATS.items()):
            if n_rows <= nr and n_cols <= nc:
                plate_format = fmt
                n_rows, n_cols = nr, nc
                break
    warnings = []

    def wells_of(role):
        return [w for w, v in plate_map.items() if v["role"] == role]
    blank_w, neg_w, pos_w = wells_of("blank"), wells_of("negative"), \
        wells_of("positive")
    blank_s = _stats(_values(grid, blank_w))
    blank = blank_s["mean"] if blank_s["n"] else 0.0
    neg_raw, pos_raw = _values(grid, neg_w), _values(grid, pos_w)
    neg_s, pos_s = _stats(neg_raw), _stats(pos_raw)
    if normalization in ("percent_of_control", "inhibition_vs_blank") \
            and not neg_s["n"]:
        raise ValueError(f"{normalization} needs negative (vehicle) wells")
    if normalization in ("percent_activity", "percent_inhibition") and \
            not (neg_s["n"] and pos_s["n"]):
        raise ValueError(f"{normalization} needs negative and positive "
                         "control wells")

    # control wells tagged with a compound (e.g. one vehicle column per
    # cell line, as plate.quantify_plate's per-group controls) normalise
    # that compound; untagged controls serve the rest of the plate
    def scoped(role, compound):
        tagged = [w for w, v in plate_map.items() if v["role"] == role
                  and v.get("compound") is not None
                  and v.get("compound") == compound]
        return _stats(_values(grid, tagged)) if tagged else None

    def control_means(compound):
        n_ = scoped("negative", compound) if compound is not None else None
        p_ = scoped("positive", compound) if compound is not None else None
        return ((n_ or neg_s)["mean"], (p_ or pos_s)["mean"])

    def norm(v, compound=None):
        if v is None:
            return None
        if normalization == "none":
            return v - blank
        m_neg, m_pos = control_means(compound)
        if normalization in ("percent_of_control", "inhibition_vs_blank"):
            den = m_neg - blank
            if den == 0:
                return None
            pc = 100.0 * (v - blank) / den
            return pc if normalization == "percent_of_control" else 100 - pc
        den = m_neg - m_pos
        if den == 0:
            return None
        if normalization == "percent_activity":
            return 100.0 * (v - m_pos) / den
        return 100.0 * (m_neg - v) / den

    wells_out = []
    for w, info in sorted(plate_map.items(),
                          key=lambda kv: parse_well(kv[0])):
        raw = _values(grid, [w])[0]
        wells_out.append({"well": w, **info, "raw": raw,
                          "corrected": None if raw is None else raw - blank,
                          "normalized": norm(raw, info.get("compound"))
                          if info["role"] not in ("empty", "blank") else None})

    # QC
    zp = z_prime(pos_raw, neg_raw)
    qc = {"blank": blank_s, "negative": neg_s, "positive": pos_s,
          **zp, **_signal_window(neg_s, pos_s),
          "z_prime_limit": z_prime_limit, "cv_limit_pct": cv_limit}
    flags = []
    if zp["z_prime"] is not None and zp["z_prime"] < z_prime_limit:
        flags.append(f"Z' = {zp['z_prime']:.2f} is below {z_prime_limit}")
    for nm, s in (("negative", neg_s), ("positive", pos_s)):
        if s["cv_pct"] is not None and s["cv_pct"] > cv_limit:
            flags.append(f"{nm} control CV {s['cv_pct']:.1f}% exceeds "
                         f"{cv_limit}%")
    if zp["z_prime"] is None:
        warnings.append("Z' needs at least two positive and two negative "
                        "control wells.")

    # per compound / concentration
    samples = [x for x in wells_out if x["role"] == "sample"]
    compounds = []
    for x in samples:
        name = x["compound"] if x["compound"] is not None else "Sample"
        if name not in compounds:
            compounds.append(name)
    tables, rep_cv = [], []
    for comp in compounds:
        ws = [x for x in samples
              if (x["compound"] if x["compound"] is not None
                  else "Sample") == comp]
        concs = sorted({x["concentration"] for x in ws
                        if x["concentration"] is not None})
        if any(x["concentration"] is None for x in ws):
            warnings.append(f"{comp}: wells without a concentration were left "
                            "out of the dose-response table.")
        rows, n_rep = [], 0
        for c in concs:
            cw = [x for x in ws if x["concentration"] == c]
            ordered = sorted(cw, key=lambda x: (x["replicate"] is None,
                                                str(x["replicate"]),
                                                parse_well(x["well"])))
            vals = [x["normalized"] for x in ordered]
            rows.append(vals)
            n_rep = max(n_rep, len(vals))
            st = _stats([x["raw"] for x in ordered])
            nst = _stats(vals)
            entry = {"compound": comp, "concentration": c,
                     "wells": [x["well"] for x in ordered],
                     "n": st["n"], "mean_raw": st["mean"],
                     "cv_raw_pct": st["cv_pct"],
                     "mean_normalized": nst["mean"],
                     "sd_normalized": nst["sd"],
                     "flag": (st["cv_pct"] is not None
                              and st["cv_pct"] > cv_limit)}
            rep_cv.append(entry)
        rows = [r + [None] * (n_rep - len(r)) for r in rows]
        positive = [i for i, c in enumerate(concs) if c > 0]
        if len(positive) < len(concs):
            warnings.append(f"{comp}: zero concentration rows are kept in the "
                            "table but cannot be placed on a log axis.")
        tables.append({"compound": comp, "x": concs,
                       "datasets": [{"name": str(comp), "ys": rows}],
                       "x_is_log": False, "n_replicates": n_rep})
    n_flag_cv = sum(1 for e in rep_cv if e["flag"])
    if n_flag_cv:
        flags.append(f"{n_flag_cv} compound/concentration group(s) with "
                     f"replicate CV above {cv_limit}%")
    combined = None
    if tables and all(t["x"] == tables[0]["x"] for t in tables):
        n_rep = max(t["n_replicates"] for t in tables)
        combined = {"x": tables[0]["x"], "x_is_log": False,
                    "datasets": [{"name": t["datasets"][0]["name"],
                                  "ys": [r + [None] * (n_rep - len(r))
                                         for r in t["datasets"][0]["ys"]]}
                                 for t in tables]}

    if edge_role == "all":
        edge_wells = [w for w, v in plate_map.items()
                      if v["role"] not in ("blank", "empty")]
    else:
        edge_wells = wells_of(edge_role)
    edge = _edge_check(grid, edge_wells, n_rows, n_cols)
    edge["role"] = edge_role
    if edge["edge_vs_interior"] and edge["edge_vs_interior"]["p"] < 0.05:
        flags.append("edge wells differ from interior wells (P < 0.05)")
    if edge_role == "sample":
        warnings.append("The edge check on sample wells is confounded with "
                        "the layout of compounds and doses; use control or "
                        "uniform wells for it.")
    # heat-map grid of normalised values
    norm_grid = [[None] * n_cols for _ in range(n_rows)]
    for x in wells_out:
        r, c = parse_well(x["well"])
        if r < n_rows and c < n_cols:
            norm_grid[r][c] = x["normalized"]
    return {
        "analysis": "plate_qc", "format": plate_format,
        "n_rows": n_rows, "n_columns": n_cols,
        "normalization": normalization, "blank": blank if blank_s["n"]
        else None,
        "qc": qc, "qc_flags": flags, "passed": not flags,
        "replicate_cv": rep_cv,
        "edge_effect": edge,
        "wells": wells_out,
        "normalized_grid": norm_grid,
        "dose_response": tables, "combined": combined,
        "warnings": warnings,
    }
