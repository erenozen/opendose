"""Flow cytometry gate statistics to one value per experiment and
condition.

A pure bookkeeping helper (nothing statistical beyond averaging technical
replicates and subtracting a background):

- records: FlowJo-style statistics rows [{sample, experiment | donor,
  condition, gate, statistic ("freq_parent" | "median" | "mean" |
  "count" | any label), value}];
- technical replicates (several samples of the same experiment and
  condition) are averaged to one value, so the experiment (donor, day)
  stays the experimental unit (Lord et al. 2020, J Cell Biol
  219:e202001064, "SuperPlots"; Lazic 2010, BMC Neurosci 11:5);
- background subtraction per experiment: the value of the FMO or
  isotype control condition of the same experiment is subtracted from
  every other condition (Roederer 2001, Cytometry 45:194, fluorescence-
  minus-one controls; Maecker & Trotter 2006, Cytometry A 69:1037, "Flow
  cytometry controls, instrument setup, and the determination of
  positivity").

The output is a matched layout (rows = experiments, columns =
conditions) ready for a paired / repeated-measures analysis with the
experiment as the block. Anything left out (missing values, other gates
or statistics, experiments without a background value) is reported in
warnings.
"""

from __future__ import annotations

import math

SOURCE = ("Roederer 2001, Cytometry 45:194 (FMO controls); Maecker & "
          "Trotter 2006, Cytometry A 69:1037; Lord et al. 2020, J Cell Biol "
          "219:e202001064 (one value per experiment)")


def _num(v):
    if v is None:
        return None
    if isinstance(v, str):
        s = v.strip().replace("%", "").replace(",", ".")
        if not s:
            return None
        try:
            v = float(s)
        except ValueError:
            return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _ordered(seq):
    seen, out = set(), []
    for s in seq:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


def flow_summary(records, *, statistic=None, gate=None, background=None,
                 conditions=None, experiments=None) -> dict:
    """See the module docstring. background: {"kind": "fmo" | "isotype" |
    "none", "condition": name of the control condition}."""
    warnings = []
    recs = [r for r in (records or []) if isinstance(r, dict)]
    if not recs:
        raise ValueError("flow_summary needs records [{sample, experiment, "
                         "condition, gate, statistic, value}]")
    stats_present = _ordered(str(r["statistic"]) for r in recs
                             if r.get("statistic") is not None)
    if statistic is None:
        if len(stats_present) > 1:
            raise ValueError("several statistics in the records ("
                             + ", ".join(stats_present)
                             + "): choose one with options.statistic")
        statistic = stats_present[0] if stats_present else None
    gates_present = _ordered(str(r["gate"]) for r in recs
                             if r.get("gate") is not None)
    if gate is None:
        if len(gates_present) > 1:
            raise ValueError("several gates in the records ("
                             + ", ".join(gates_present)
                             + "): choose one with options.gate")
        gate = gates_present[0] if gates_present else None
    n_other = 0
    kept = []
    for r in recs:
        if statistic is not None and r.get("statistic") is not None \
                and str(r["statistic"]) != str(statistic):
            n_other += 1
            continue
        if gate is not None and r.get("gate") is not None \
                and str(r["gate"]) != str(gate):
            n_other += 1
            continue
        kept.append(r)
    if n_other:
        warnings.append(f"{n_other} record{'s' if n_other != 1 else ''} of "
                        "another gate or statistic not used")

    bg = dict(background or {})
    kind = bg.get("kind", "none") or "none"
    if kind not in ("fmo", "isotype", "none"):
        raise ValueError("background kind must be 'fmo', 'isotype' or "
                         "'none'")
    bg_cond = bg.get("condition")
    if kind != "none" and bg_cond is None:
        raise ValueError("background subtraction needs the control "
                         "condition's name (background.condition)")
    bg_cond = str(bg_cond) if bg_cond is not None else None

    cells = {}
    bad, no_exp = 0, 0
    for r in kept:
        exp = r.get("experiment", r.get("donor"))
        cond = r.get("condition")
        if exp is None:
            no_exp += 1
            continue
        if cond is None:
            bad += 1
            continue
        v = _num(r.get("value"))
        if v is None:
            bad += 1
            continue
        cells.setdefault((str(exp), str(cond)), []).append(v)
    if no_exp:
        warnings.append(f"{no_exp} record{'s' if no_exp != 1 else ''} "
                        "without an experiment / donor left out")
    if bad:
        warnings.append(f"{bad} record{'s' if bad != 1 else ''} without a "
                        "condition or a numeric value left out")
    if not cells:
        raise ValueError("no usable records")

    all_exps = _ordered(e for e, _ in cells)
    all_conds = _ordered(c for _, c in cells)
    exps = [str(e) for e in experiments] if experiments else all_exps
    conds = [str(c) for c in conditions] if conditions else \
        [c for c in all_conds if c != bg_cond]
    if kind != "none" and bg_cond not in all_conds:
        raise ValueError(f"background condition {bg_cond!r} not found "
                         f"(conditions: {', '.join(all_conds)})")
    if kind != "none" and bg_cond in conds:
        conds = [c for c in conds if c != bg_cond]

    def mean(vals):
        return math.fsum(vals) / len(vals)

    background_values = {}
    if kind != "none":
        for e in exps:
            vals = cells.get((e, bg_cond))
            background_values[e] = mean(vals) if vals else None
        missing_bg = [e for e in exps if background_values[e] is None]
        if missing_bg:
            warnings.append("No background (" + bg_cond + ") value for "
                            + ", ".join(missing_bg)
                            + ": those experiments' values are left blank")

    values, raw, n_tech = [], [], []
    n_negative = 0
    for e in exps:
        row_v, row_r, row_n = [], [], []
        for c in conds:
            vals = cells.get((e, c))
            if not vals:
                row_v.append(None)
                row_r.append(None)
                row_n.append(0)
                continue
            m = mean(vals)
            row_r.append(m)
            row_n.append(len(vals))
            if kind != "none":
                b = background_values.get(e)
                v = m - b if b is not None else None
                if v is not None and v < 0:
                    n_negative += 1
                row_v.append(v)
            else:
                row_v.append(m)
        values.append(row_v)
        raw.append(row_r)
        n_tech.append(row_n)
    missing = [(e, c) for e, row in zip(exps, values)
               for c, v in zip(conds, row) if v is None]
    if missing:
        warnings.append(f"{len(missing)} experiment x condition cell"
                        f"{'s are' if len(missing) != 1 else ' is'} blank: "
                        + ", ".join(f"{e}/{c}" for e, c in missing[:10])
                        + (" ..." if len(missing) > 10 else ""))
    if n_negative:
        warnings.append(f"{n_negative} value{'s' if n_negative != 1 else ''}"
                        " below the background after subtraction (kept as "
                        "negative numbers)")
    averaged = sum(1 for row in n_tech for n in row if n > 1)
    if averaged:
        warnings.append(f"{averaged} experiment x condition cell"
                        f"{'s' if averaged != 1 else ''} averaged over "
                        "technical replicates (n_technical)")
    unused = [c for c in all_conds if c not in conds and c != bg_cond]
    if unused:
        warnings.append("Conditions not shown: " + ", ".join(unused))
    table = {"datasets": [
        {"name": c, "ys": [[values[r][j]] for r in range(len(exps))]}
        for j, c in enumerate(conds)],
        "row_titles": exps}
    return {"analysis": "flow_summary", "statistic": statistic,
            "gate": gate, "conditions": conds, "experiments": exps,
            "values": values, "values_before_subtraction": raw,
            "n_technical": n_tech, "subtracted": kind != "none",
            "background": ({"kind": kind, "condition": bg_cond,
                            "values": background_values}
                           if kind != "none" else None),
            "table": table, "warnings": warnings, "source": SOURCE}
