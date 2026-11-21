"""Wound-healing (scratch) assays: percent closure over time, the closure
rate and the time to 50% closure of each well, and a comparison of the
rates between conditions.

Method sources:
- Jonkman et al. (2014), "An introduction to the wound healing assay
  using live-cell microscopy", Cell Adh Migr 8:440-451: the wound area
  (or width) is measured at each time point; percent closure (relative
  wound closure) = (A0 - At) / A0 x 100 against the same wound at time
  0, so wounds of different initial size are comparable; the migration
  rate is the change in wound width or area per unit time, best taken as
  the slope of a straight line over the linear part of the closure
  rather than from two time points.
- Grada et al. (2017), "Research Techniques Made Simple: Analysis of
  Collective Cell Migration Using the Wound Healing Assay", J Invest
  Dermatol 137:e11-e16: rate of migration = (initial - final wound
  width or area) / time; percent wound closure as above; the time to
  closure as a summary.
- Suarez-Arnedo et al. (2020), "An image J plugin for the high
  throughput image analysis of in vitro scratch wound healing assays",
  PLOS ONE 15:e0232565: the same area-based definitions, measured per
  well from ImageJ.

Per well (one replicate column of one data set): A0 = the first measured
value (the earliest time with a value); closure(t) = (A0 - A(t)) / A0 x
100; rate = minus the least-squares slope of A against t within the
chosen time window (area or width per time unit, positive when the wound
closes), also as % of A0 per time unit; time to target closure (50% by
default) by linear interpolation between the last time below and the
first time at or above the target, "not reached" otherwise. Conditions
are compared on the rate (in % of A0 per time unit by default): an
unpaired t test for two, ordinary one-way ANOVA with a post test for
more. Wells are the unit: the result says so.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

from . import anova, ttests


def _num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _slope(t, a):
    """Least-squares slope of a on t with its SE and R^2."""
    t, a = np.asarray(t, float), np.asarray(a, float)
    n = t.size
    tm, am = t.mean(), a.mean()
    sxx = float(((t - tm) ** 2).sum())
    if n < 2 or sxx == 0:
        return None
    b = float(((t - tm) * (a - am)).sum() / sxx)
    resid = a - (am + b * (t - tm))
    sst = float(((a - am) ** 2).sum())
    r2 = 1 - float((resid ** 2).sum()) / sst if sst > 0 else None
    se = math.sqrt(float((resid ** 2).sum()) / (n - 2) / sxx) if n > 2 else None
    return {"slope": b, "se": se, "r_squared": r2, "n": int(n)}


def _time_to(times, closure, target):
    """First crossing of the target closure, by linear interpolation."""
    for i, (t, c) in enumerate(zip(times, closure)):
        if c >= target:
            if i == 0:
                return t
            t0, c0 = times[i - 1], closure[i - 1]
            return t0 + (target - c0) * (t - t0) / (c - c0)
    return None


def _summary(values):
    v = [x for x in values if x is not None]
    if not v:
        return {"n": 0, "mean": None, "sd": None}
    return {"n": len(v), "mean": float(np.mean(v)),
            "sd": float(np.std(v, ddof=1)) if len(v) > 1 else None}


def wound_healing(x, datasets, *, window=None, target=50.0,
                  rate_basis="percent", control_index=0, test="auto",
                  comparisons="dunnett", ci_level=0.95) -> dict:
    """x: time of each row. datasets: [{name, ys: rows x replicates}],
    one data set per condition, one replicate column per well, values the
    wound area (or width). window: [start, end] times for the rate fit
    (None or a None end = every time point). target: the closure (%) whose
    time is reported. rate_basis: "percent" (% of the initial wound per
    time unit) or "absolute" (area per time unit) for the comparison.
    test: "auto" or "none"."""
    if rate_basis not in ("percent", "absolute"):
        raise ValueError(f"unknown rate basis: {rate_basis}")
    if test not in ("auto", "none"):
        raise ValueError(f"unknown test: {test}")
    if not 0 < float(target) <= 100:
        raise ValueError("the target closure must be above 0 and at most 100%")
    xs = [_num(v) for v in x]
    win_ = list(window or []) + [None, None]
    lo, hi = _num(win_[0]), _num(win_[1])
    if lo is not None and hi is not None and hi <= lo:
        raise ValueError("the rate window must end after it starts")
    first_time = min((t for t in xs if t is not None), default=None)
    if first_time is None:
        raise ValueError("no time values")
    wells, warnings, conditions = [], [], []
    n_late = 0
    for di, d in enumerate(datasets):
        name = str(d.get("name") or f"Condition {di + 1}")
        rows = d.get("ys") or []
        reps = max((len(r) for r in rows), default=0)
        cond_wells = []
        for k in range(reps):
            pts = sorted((xs[i], _num(r[k])) for i, r in enumerate(rows)
                         if i < len(xs) and xs[i] is not None and k < len(r)
                         and _num(r[k]) is not None)
            if len(pts) < 2:
                continue
            times = [p[0] for p in pts]
            area = [p[1] for p in pts]
            a0, flags = area[0], []
            if a0 <= 0:
                flags.append("initial_not_positive")
            if times[0] != first_time:
                flags.append("no_value_at_first_time")
                n_late += 1
            closure = [(a0 - a) / a0 * 100 if a0 > 0 else None for a in area]
            win = [(t, a) for t, a in pts
                   if (lo is None or t >= lo) and (hi is None or t <= hi)]
            fit = _slope([p[0] for p in win], [p[1] for p in win]) \
                if len(win) >= 2 else None
            if fit is None:
                flags.append("too_few_points_in_window")
            rate = -fit["slope"] if fit else None
            rate_pct = rate / a0 * 100 if fit and a0 > 0 else None
            t50 = _time_to(times, closure, float(target)) if a0 > 0 else None
            w = {"condition": name, "well": k + 1, "times": times,
                 "area": area, "initial": a0, "closure": closure,
                 "final_closure": closure[-1],
                 "rate": rate, "rate_se": fit["se"] if fit else None,
                 "rate_percent": rate_pct,
                 "rate_r_squared": fit["r_squared"] if fit else None,
                 "rate_points": fit["n"] if fit else 0,
                 "time_to_target": t50, "target_reached": t50 is not None,
                 "flags": flags}
            cond_wells.append(w)
            wells.append(w)
        conditions.append({"name": name, "wells": cond_wells})
    if not wells:
        raise ValueError("no wells: each needs a wound measurement at two "
                         "or more times")
    if n_late:
        warnings.append(f"{n_late} well(s) have no value at the first time "
                        "point: their closure is relative to their first "
                        "measured value.")
    n_few = sum("too_few_points_in_window" in w["flags"] for w in wells)
    if n_few:
        warnings.append(f"{n_few} well(s) have fewer than two time points in "
                        "the rate window: no rate for them.")
    nonlin = [w for w in wells if w["rate_r_squared"] is not None
              and w["rate_points"] >= 3 and w["rate_r_squared"] < 0.9]
    if nonlin:
        warnings.append(f"{len(nonlin)} well(s) close far from linearly in the "
                        "rate window (R² below 0.9): the closure probably "
                        "levels off; a window over the linear part gives a "
                        "truer rate.")

    # per-condition summaries and the mean closure curve
    all_times = sorted({t for w in wells for t in w["times"]})
    summaries = []
    for c in conditions:
        ws = c["wells"]
        curve = []
        for t in all_times:
            vals = [w["closure"][w["times"].index(t)] for w in ws
                    if t in w["times"] and w["closure"][w["times"].index(t)]
                    is not None]
            s = _summary(vals)
            curve.append({"time": t, **s})
        summaries.append({
            "condition": c["name"], "n_wells": len(ws),
            "rate": _summary([w["rate"] for w in ws]),
            "rate_percent": _summary([w["rate_percent"] for w in ws]),
            "time_to_target": _summary([w["time_to_target"] for w in ws]),
            "n_target_not_reached": sum(not w["target_reached"] for w in ws),
            "final_closure": _summary([w["final_closure"] for w in ws]),
            "initial": _summary([w["initial"] for w in ws]),
            "curve": curve,
        })

    key = "rate_percent" if rate_basis == "percent" else "rate"
    used = [s for s, c in zip(summaries, conditions)
            if sum(w[key] is not None for w in c["wells"]) >= 2]
    names = [s["condition"] for s in used]
    data = [[w[key] for w in c["wells"] if w[key] is not None]
            for s, c in zip(summaries, conditions) if s in used]
    control_index = int(control_index)
    if not 0 <= control_index < len(conditions):
        raise ValueError("control condition out of range")
    control = conditions[control_index]["name"]
    st = None
    if test == "auto" and len(used) >= 2 and control in names:
        if any(np.ptp(v) == 0 for v in data):
            warnings.append("No test: every well of a condition has the same "
                            "rate.")
        elif len(used) == 2:
            ci_ = names.index(control)
            oi = 1 - ci_
            st = ttests.unpaired_t(data[oi], data[ci_], ci_level=ci_level)
            st["names"] = [names[oi], names[ci_]]
            st["note"] = ("Unpaired t test on the closure rates, wells as "
                          "the unit; the difference is "
                          f"{names[oi]} minus {names[ci_]}.")
        else:
            order = [control] + [n for n in names if n != control]
            ordered = [data[names.index(n)] for n in order]
            st = anova.one_way_anova(ordered, order)
            st["test"] = "one_way_anova"
            mc = anova.multiple_comparisons(ordered, comparisons, names=order,
                                            control_index=0,
                                            ci_level=ci_level)
            comps = []
            for c in mc["comparisons"]:
                a, _, b = c["pair"].partition(" vs. ")
                d, ci = c["difference"], c.get("ci")
                if a == control:            # report as condition vs. control
                    a, b, d = b, a, -d
                    ci = [-ci[1], -ci[0]] if ci else None
                comps.append({"pair": f"{a} vs. {b}", "first": a, "second": b,
                              "difference": d, "ci": ci,
                              "p_adjusted": c["p_adjusted"]})
            st["comparisons"] = comps
            st["method_comparisons"] = comparisons
            st["note"] = ("Ordinary one-way ANOVA on the closure rates, "
                          "wells as the unit.")
        if st is not None:
            warnings.append("Wells are the unit: wells scratched in one "
                            "experiment share its cells and conditions. "
                            "Repeat the experiment and compare its means to "
                            "test between experiments.")
    elif test == "auto":
        warnings.append("No test: needs the control and at least one other "
                        "condition with a rate for two or more wells each.")
    return {
        "analysis": "wound_healing", "conditions": [c["name"] for c in conditions],
        "control": control, "times": all_times, "window": [lo, hi],
        "target": float(target), "rate_basis": rate_basis,
        "wells": wells, "summaries": summaries, "statistics": st,
        "warnings": warnings,
    }
