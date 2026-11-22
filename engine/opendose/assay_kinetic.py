"""Kinetic plate reads: the initial rate of every well from the linear
part of its trace, a blank rate subtracted, conversion to concentration
per time, and the rates per sample ready for a Michaelis-Menten fit.

Method sources:
- Initial velocity: the rate is measured over the early, linear part of
  the progress curve, before substrate depletion, product inhibition or
  detector saturation bend it (Bisswanger, "Enzyme assays", Perspectives
  in Science 1:41-55, 2014; NCATS Assay Guidance Manual, "Basics of
  Enzymatic Assays for HTS", 2012: initial-velocity conditions, at most
  about 10% of the substrate converted).
- Plate-reader software reports the same quantity: SoftMax Pro "Vmax"
  is the maximum slope over a set number of consecutive reads ("Vmax
  points"), and Gen5 "Max V" likewise; a fixed time window is the other
  common choice.
- The default here is that plate-reader rate: the steepest slope over
  5 consecutive reads. It follows the initial rate when substrate
  depletion bends a trace, which an R^2 rule does not: R^2 stays above
  0.99 on curved progress curves (checked in the tests: on a curve bent
  by depletion the R^2 >= 0.99 rule was 27% low and the 5-read steepest
  slope 6.4% low; on simulated Michaelis-Menten plates the steepest
  slope recovered Vmax within a few percent). The
  automatic R^2 rule (the longest stretch from the first read with
  R^2 >= 0.99, at least 3 reads) and a fixed time window are offered.
- Blank (no-enzyme) wells measure drift, not an initial rate: they are
  always fitted over every read, whatever the method.
- Beer-Lambert: an absorbance slope divided by the molar absorptivity
  times the path length gives a concentration change per time (e.g.
  NADH at 340 nm, 6.22 mM^-1 cm^-1).

Per well (one replicate column of one data set): the least-squares slope
of signal on time within the chosen window, its SE and R^2; the blank
rate (the mean slope of a chosen no-enzyme data set) is subtracted; the
velocity is the absolute corrected rate divided by the conversion factor
(signal per concentration unit) when one is given.
"""

from __future__ import annotations

import math

import numpy as np

METHODS = ("auto", "window", "steepest")


def _num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _line(t, y):
    t, y = np.asarray(t, float), np.asarray(y, float)
    n = t.size
    tm, ym = t.mean(), y.mean()
    sxx = float(((t - tm) ** 2).sum())
    if n < 2 or sxx == 0:
        return None
    b = float(((t - tm) * (y - ym)).sum() / sxx)
    a = float(ym - b * tm)
    res = y - (a + b * t)
    sse = float((res ** 2).sum())
    sst = float(((y - ym) ** 2).sum())
    return {"slope": b, "intercept": a,
            "se": math.sqrt(sse / (n - 2) / sxx) if n > 2 else None,
            "r_squared": 1 - sse / sst if sst > 0 else None, "n": int(n)}


def _rate(t, y, method, *, min_r2, min_points, window, k):
    """(fit, first index, last index, flags) of one trace."""
    n = len(t)
    flags = []
    if method == "window":
        lo, hi = window
        idx = [i for i, v in enumerate(t) if (lo is None or v >= lo)
               and (hi is None or v <= hi)]
        if len(idx) < 2:
            return None, None, None, ["too_few_points_in_window"]
        f = _line([t[i] for i in idx], [y[i] for i in idx])
        return f, idx[0], idx[-1], flags
    if method == "steepest":
        if n < k:
            return None, None, None, ["fewer_reads_than_window"]
        best = None
        for s in range(n - k + 1):
            f = _line(t[s:s + k], y[s:s + k])
            if f and (best is None or abs(f["slope"]) > abs(best[0]["slope"])):
                best = (f, s, s + k - 1)
        if best is None:
            return None, None, None, ["no_fit"]
        return best[0], best[1], best[2], flags
    # auto: the longest stretch from the first read with R^2 >= min_r2
    if n < min_points:
        return None, None, None, ["fewer_reads_than_window"]
    best = None
    for m in range(n, min_points - 1, -1):
        f = _line(t[:m], y[:m])
        if f and f["r_squared"] is not None and f["r_squared"] >= min_r2:
            best = (f, 0, m - 1)
            break
    if best is None:
        f = _line(t[:min_points], y[:min_points])
        flags.append("no_linear_phase")
        return f, 0, min_points - 1, flags
    return best[0], best[1], best[2], flags


def kinetic_rates(x, datasets, *, method="steepest", min_r2=0.99, min_points=3,
                  window=None, k=5, blank_index=None, factor=None,
                  saturation=None) -> dict:
    """x: read times. datasets: [{name, ys: rows x replicates}], one data
    set per sample, one replicate column per well. method: "steepest"
    (largest |slope| over k consecutive reads, the default), "auto"
    (longest initial stretch with R^2 >= min_r2, at least min_points
    reads) or "window" ([start, end] times). blank_index: data set whose
    mean rate, fitted over every read, is subtracted (no-enzyme
    control). factor: signal change per unit of
    concentration (e.g. epsilon x path length) to convert rates.
    saturation: signal at or above which a read is flagged."""
    if method not in METHODS:
        raise ValueError(f"unknown method: {method}")
    if not 0 < float(min_r2) <= 1:
        raise ValueError("the R² threshold must be above 0 and at most 1")
    min_points, k = int(min_points), int(k)
    if min_points < 3 or k < 2:
        raise ValueError("the automatic fit needs at least 3 reads and the "
                         "steepest stretch at least 2")
    win_ = list(window or []) + [None, None]
    lo, hi = _num(win_[0]), _num(win_[1])
    if method == "window" and lo is not None and hi is not None and hi <= lo:
        raise ValueError("the time window must end after it starts")
    fac = _num(factor)
    if fac is not None and fac <= 0:
        raise ValueError("the conversion factor must be positive")
    sat = _num(saturation)
    xs = [_num(v) for v in x]
    bi = int(blank_index) if blank_index is not None else None
    if bi is not None and not 0 <= bi < len(datasets):
        raise ValueError("blank data set out of range")
    wells, warnings = [], []
    for di, d in enumerate(datasets):
        name = str(d.get("name") or f"Sample {di + 1}")
        rows = d.get("ys") or []
        reps = max((len(r) for r in rows), default=0)
        for kk in range(reps):
            pts = sorted((xs[i], _num(r[kk])) for i, r in enumerate(rows)
                         if i < len(xs) and xs[i] is not None and kk < len(r)
                         and _num(r[kk]) is not None)
            if len(pts) < 2:
                continue
            t = [p[0] for p in pts]
            y = [p[1] for p in pts]
            if di == bi:            # drift: every read
                fit, i0, i1, flags = _line(t, y), 0, len(t) - 1, []
            else:
                fit, i0, i1, flags = _rate(t, y, method, min_r2=float(min_r2),
                                           min_points=min_points,
                                           window=(lo, hi), k=k)
            if sat is not None and any(v >= sat for v in y):
                flags.append("saturated")
            wells.append({
                "sample": name, "dataset": di, "well": kk + 1,
                "times": t, "signal": y,
                "rate": fit["slope"] if fit else None,
                "rate_se": fit["se"] if fit else None,
                "r_squared": fit["r_squared"] if fit else None,
                "intercept": fit["intercept"] if fit else None,
                "window": [t[i0], t[i1]] if fit else None,
                "n_points": fit["n"] if fit else 0,
                "flags": flags,
            })
    if not wells:
        raise ValueError("no wells: each needs at least two reads")

    blank_rate, blank_name = None, None
    if bi is not None:
        br = [w["rate"] for w in wells if w["dataset"] == bi and w["rate"] is not None]
        if not br:
            raise ValueError("the blank data set has no rates")
        blank_rate = float(np.mean(br))
        blank_name = str(datasets[bi].get("name") or f"Sample {bi + 1}")
    for w in wells:
        r = w["rate"]
        w["is_blank"] = w["dataset"] == bi
        corr = r - blank_rate if r is not None and blank_rate is not None else r
        w["rate_corrected"] = corr
        w["velocity"] = (abs(corr) / fac if fac else abs(corr)) if corr is not None else None

    samples = []
    for di, d in enumerate(datasets):
        ws = [w for w in wells if w["dataset"] == di]
        if not ws:
            continue
        v = [w["velocity"] for w in ws if w["velocity"] is not None]
        name = ws[0]["sample"]
        samples.append({
            "sample": name, "substrate": _num(name), "n_wells": len(ws),
            "is_blank": ws[0]["is_blank"],
            "velocity_mean": float(np.mean(v)) if v else None,
            "velocity_sd": float(np.std(v, ddof=1)) if len(v) > 1 else None,
            "velocities": v,
            "rate_mean": float(np.mean([w["rate"] for w in ws if w["rate"] is not None]))
            if any(w["rate"] is not None for w in ws) else None,
        })

    n_nl = sum("no_linear_phase" in w["flags"] for w in wells if not w["is_blank"])
    if n_nl:
        warnings.append(f"{n_nl} well(s) have no initial stretch with R² ≥ "
                        f"{min_r2:g}: the first {min_points} reads were used. "
                        "Check the trace, or use a time window.")
    n_sat = sum("saturated" in w["flags"] for w in wells)
    if n_sat:
        warnings.append(f"{n_sat} well(s) reach the saturation limit: the "
                        "detector is out of its linear range there.")
    n_few = sum(any(f in w["flags"] for f in ("too_few_points_in_window",
                                               "fewer_reads_than_window",
                                               "no_fit")) for w in wells)
    if n_few:
        warnings.append(f"{n_few} well(s) have too few reads for the chosen "
                        "window: no rate for them.")
    signs = [w["rate_corrected"] for w in wells if not w["is_blank"]
             and w["rate_corrected"] is not None]
    direction = "decreasing" if signs and np.median(signs) < 0 else "increasing"
    mm_ready = sum(1 for s in samples if s["substrate"] is not None
                   and not s["is_blank"] and s["velocity_mean"] is not None) >= 3
    return {
        "analysis": "kinetic_rates", "method": method,
        "min_r2": float(min_r2), "min_points": min_points, "k": k,
        "window": [lo, hi], "blank": blank_name, "blank_rate": blank_rate,
        "factor": fac, "direction": direction, "wells": wells,
        "samples": samples, "michaelis_menten_ready": mm_ready,
        "warnings": warnings,
    }
