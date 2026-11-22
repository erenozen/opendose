"""Minimum inhibitory concentration (MIC) by broth microdilution, read
from plate-reader optical densities: growth relative to the growth
control, the MIC of each dilution series and of each strain, MIC50 and
MIC90 across strains, and an IC50 from a dose-response fit.

Method sources:
- CLSI M07 (Methods for Dilution Antimicrobial Susceptibility Tests for
  Bacteria That Grow Aerobically) and ISO 20776-1: the MIC is the lowest
  concentration that inhibits growth; a growth-control well (no drug)
  must show growth for the series to be read; with a single skipped well
  (no growth at one concentration but growth at a higher one) the higher
  MIC is read, and with more than one skipped well the result is not
  reported.
- Reading the plate by optical density instead of by eye: growth as a
  percentage of the growth control after subtracting a medium blank,
  with "no growth" at or below a set fraction of the growth control (a
  90% inhibition cut-off, e.g. EUCAST's broth-microdilution reading for
  yeasts uses 50% or 90% depending on the drug, and plate-reader MICs
  commonly use 80 or 90%), or at or below a fixed OD.
- Essential agreement: replicate MICs within one doubling dilution of
  each other (CLSI M23); a strain's MIC is the modal replicate MIC.
- CLSI M39 (Analysis and Presentation of Cumulative Antimicrobial
  Susceptibility Test Data): MIC50 and MIC90 are the MICs at which 50%
  and 90% of the isolates are inhibited, read from the ranked MICs at
  rank ceil(0.5 n) and ceil(0.9 n); MIC90 needs at least 10 isolates.
- IC50: a four-parameter logistic fit of % growth against log
  concentration (the engine's dose-response fit, nlfit), a continuous
  measure next to the two-fold MIC.

Per well: growth = (OD - blank) / (growth control - blank) x 100, the
growth control being the 0-concentration well of the same dilution
series (or the mean of the strain's growth-control wells when that
series has none).
"""

from __future__ import annotations

import math
from collections import Counter

import numpy as np

from . import doseresponse

_RANK = {"<=": 0, "=": 1, ">": 2}


def _num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _key(m):
    """Sort key of a qualified MIC: <=v below v below >v."""
    return (m["value"], _RANK[m["qualifier"]])


def _label(m):
    if m is None:
        return None
    v = f"{m['value']:g}"
    return {"<=": f"≤ {v}", "=": v, ">": f"> {v}"}[m["qualifier"]]


def _read_series(conc, growth, nogrowth):
    """MIC of one dilution series (concentrations ascending, > 0)."""
    if not conc:
        return None, 0
    grows = [not ng for ng in nogrowth]
    if grows[-1]:
        return {"value": conc[-1], "qualifier": ">"}, 0
    # lowest concentration from which every higher well shows no growth
    i = len(conc) - 1
    while i > 0 and not grows[i - 1]:
        i -= 1
    mic = {"value": conc[i], "qualifier": "<=" if i == 0 else "="}
    skipped = sum(1 for j in range(i) if not grows[j])
    return mic, skipped


def mic(x, datasets, *, blank=None, threshold_mode="percent",
        threshold=10.0, od_cutoff=None, fit_ic50=True,
        ci_level=0.95) -> dict:
    """x: concentration of each row (0 = growth control). datasets:
    [{name, ys: rows x replicates}], one data set per strain, one
    replicate column per dilution series, values the endpoint OD.
    blank: medium-only OD subtracted from every well (None = 0).
    threshold_mode "percent": no growth when growth <= threshold % of
    the growth control (10 = at least 90% inhibition); "od": no growth
    when the blank-corrected OD <= od_cutoff."""
    if threshold_mode not in ("percent", "od"):
        raise ValueError(f"unknown threshold mode: {threshold_mode}")
    if threshold_mode == "percent" and not 0 <= float(threshold) < 100:
        raise ValueError("the growth threshold must be from 0 to below 100%")
    if threshold_mode == "od" and _num(od_cutoff) is None:
        raise ValueError("an OD cut-off is needed to read growth by OD")
    xs = [_num(v) for v in x]
    if any(v is not None and v < 0 for v in xs):
        raise ValueError("concentrations cannot be negative")
    if not any(v is not None and v > 0 for v in xs):
        raise ValueError("no drug concentrations (X above 0)")
    b = _num(blank) or 0.0
    warnings, strains, series_all = [], [], []
    for di, d in enumerate(datasets):
        name = str(d.get("name") or f"Strain {di + 1}")
        rows = d.get("ys") or []
        reps = max((len(r) for r in rows), default=0)
        gc_all = [_num(r[k]) - b for i, r in enumerate(rows) for k in range(len(r))
                  if i < len(xs) and xs[i] == 0 and _num(r[k]) is not None]
        gc_mean = float(np.mean(gc_all)) if gc_all else None
        series = []
        for k in range(reps):
            cells = [(xs[i], _num(r[k])) for i, r in enumerate(rows)
                     if i < len(xs) and xs[i] is not None and k < len(r)
                     and _num(r[k]) is not None]
            if not cells:
                continue
            gcs = [v - b for c, v in cells if c == 0]
            gc = float(np.mean(gcs)) if gcs else gc_mean
            drug = sorted((c, v - b) for c, v in cells if c > 0)
            flags = []
            if not gcs:
                flags.append("growth_control_from_strain_mean" if gc is not None
                             else "no_growth_control")
            wells = []
            for c, od in drug:
                g = od / gc * 100 if gc and gc > 0 else None
                ng = (od <= float(od_cutoff) if threshold_mode == "od"
                      else (g is not None and g <= float(threshold)))
                wells.append({"concentration": c, "od": od, "growth": g,
                              "no_growth": bool(ng)})
            m, skipped = (None, 0)
            if gc is None or gc <= 0:
                if "no_growth_control" not in flags:
                    flags.append("growth_control_did_not_grow")
            else:
                m, skipped = _read_series([w["concentration"] for w in wells],
                                          [w["growth"] for w in wells],
                                          [w["no_growth"] for w in wells])
            if skipped == 1:
                flags.append("skipped_well")
            elif skipped > 1:
                flags.append("multiple_skipped_wells")
            s = {"strain": name, "series": k + 1, "growth_control": gc,
                 "wells": wells, "mic": m, "mic_label": _label(m),
                 "skipped_wells": skipped,
                 "valid": m is not None and skipped <= 1, "flags": flags}
            series.append(s)
            series_all.append(s)
        valid = [s["mic"] for s in series if s["valid"]]
        strain_mic, spread = None, None
        if valid:
            counts = Counter((m["qualifier"], m["value"]) for m in valid)
            top = max(counts.values())
            modal = [{"qualifier": q, "value": v} for (q, v), c in counts.items()
                     if c == top]
            strain_mic = max(modal, key=_key)
            exact = [m["value"] for m in valid]
            spread = math.log2(max(exact) / min(exact)) if min(exact) > 0 else None
        # % growth by concentration, for the graph and the fit
        concs = sorted({w["concentration"] for s in series for w in s["wells"]})
        curve = []
        for c in concs:
            g = [w["growth"] for s in series for w in s["wells"]
                 if w["concentration"] == c and w["growth"] is not None]
            curve.append({"concentration": c, "n": len(g),
                          "mean": float(np.mean(g)) if g else None,
                          "sd": float(np.std(g, ddof=1)) if len(g) > 1 else None})
        ic50 = _fit_ic50(series, concs) if fit_ic50 else None
        strains.append({
            "strain": name, "n_series": len(series),
            "n_valid": len(valid), "mic": strain_mic,
            "mic_label": _label(strain_mic),
            "replicate_mics": [s["mic_label"] for s in series],
            "dilution_spread": spread,
            "within_one_dilution": spread is None or spread <= 1 + 1e-9,
            "curve": curve, "ic50": ic50,
        })
    if not series_all:
        raise ValueError("no wells: each strain needs OD readings")
    n_skip1 = sum("skipped_well" in s["flags"] for s in series_all)
    n_skipm = sum("multiple_skipped_wells" in s["flags"] for s in series_all)
    n_nogc = sum(not s["valid"] and s["mic"] is None for s in series_all)
    if n_skip1:
        warnings.append(f"{n_skip1} series with one skipped well (no growth "
                        "below a well with growth): the higher MIC was read "
                        "(CLSI M07).")
    if n_skipm:
        warnings.append(f"{n_skipm} series with more than one skipped well "
                        "were not read (CLSI M07: repeat the test).")
    if n_nogc:
        warnings.append(f"{n_nogc} series without a growing growth control "
                        "were not read.")
    wide = [s["strain"] for s in strains if not s["within_one_dilution"]]
    if wide:
        warnings.append("Replicate MICs more than one doubling dilution apart "
                        "for " + ", ".join(wide) + " (outside essential "
                        "agreement).")
    summary = _cumulative(strains, warnings)
    return {
        "analysis": "mic", "blank": b, "threshold_mode": threshold_mode,
        "threshold": float(threshold), "od_cutoff": _num(od_cutoff),
        "strains": strains, "series": series_all, "cumulative": summary,
        "warnings": warnings,
    }


def _cumulative(strains, warnings):
    """MIC50 / MIC90 across strains (CLSI M39 ranks)."""
    mics = sorted((s["mic"] for s in strains if s["mic"]), key=_key)
    n = len(mics)
    if n < 2:
        return None
    out = {"n_strains": n}
    for p, k in ((50, "mic50"), (90, "mic90")):
        m = mics[math.ceil(p / 100 * n) - 1]
        out[k] = m
        out[f"{k}_label"] = _label(m)
    out["range"] = [_label(mics[0]), _label(mics[-1])]
    if n < 10:
        warnings.append(f"MIC90 from {n} strains: CLSI M39 asks for at least "
                        "10 isolates before reporting it.")
    return out


def _fit_ic50(series, concs):
    """4PL fit of % growth against log10 concentration, all series."""
    pts = [(math.log10(w["concentration"]), w["growth"]) for s in series
           for w in s["wells"] if w["growth"] is not None]
    if len(concs) < 4 or len(pts) < 5:
        return {"value": None, "reason": "needs at least four concentrations"}
    try:
        fit = doseresponse.fit_dose_response([p[0] for p in pts],
                                             [p[1] for p in pts],
                                             "log_inhibitor_vs_response_4pl")
    except Exception as exc:                       # the fit can fail on flat data
        return {"value": None, "reason": f"the curve could not be fitted ({exc})"}
    par = fit.get("params", {}).get("IC50") or {}
    val = par.get("value")
    ci = par.get("ci95")
    if val is None or not math.isfinite(val):
        return {"value": None, "reason": "the curve could not be fitted"}
    lo, hi = min(concs), max(concs)
    curve = doseresponse.curve_points(fit, math.log10(lo), math.log10(hi), 120)
    return {
        "value": float(val),
        "ci": ([float(ci[0]), float(ci[1])] if ci and ci[0] is not None
               and ci[1] is not None and all(math.isfinite(float(c)) for c in ci)
               else None),
        "hill_slope": fit["params"].get("HillSlope", {}).get("value"),
        "outside_range": not lo <= val <= hi,
        "curve": {"concentration": [10 ** v for v in curve["x"]],
                  "growth": curve["y"]},
    }
