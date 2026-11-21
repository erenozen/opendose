"""Dual-luciferase reporter assays: background from blank wells,
Firefly / Renilla ratio per well, fold change against the control group
with a confidence interval, and tests on the log ratios.

Method sources:
- Promega Dual-Luciferase Reporter Assay System, Technical Manual
  TM040: the experimental (Firefly) reporter is normalised to the
  co-transfected control (Renilla) reporter in the same well, which
  corrects for transfection efficiency and cell number; background is
  the luminescence of untransfected (mock) cells, measured with the
  same reagents.
- The ratio of two luminescence signals is a multiplicative quantity:
  fold changes are summarised by geometric means and compared on the
  log scale, so 2-fold up and 2-fold down are symmetric (GraphPad Prism
  statistics guide, "The ratio paired t test" and "Analyzing data as
  logarithms").
- Experiments (independent transfections) are the experimental unit
  when they are recorded: wells within one experiment are technical
  replicates and are averaged first (Lazic 2010, BMC Neurosci 11:5,
  pseudoreplication). Each experiment is normalised to its own control
  wells and the groups are compared with the ratio paired t test or a
  repeated-measures ANOVA on the logs, experiment as subject; this is
  the densitometry engine (assay_densitometry) with the experiment in
  the role of the blot.
- Without an experiment column the wells are the unit: an unpaired t
  test (two groups) or ordinary one-way ANOVA with a post test (three or
  more) on log10 ratios, and the result says so.

Per well: Firefly corrected = Firefly - mean Firefly of the blank wells,
Renilla corrected = Renilla - mean Renilla of the blank wells (of the
same experiment when that experiment has blank wells), ratio = Firefly
corrected / Renilla corrected. A well whose corrected Renilla is below
low_renilla x the median corrected Renilla of all wells is flagged: a
weak control reporter makes the ratio unstable and can mean a failed
transfection or dead cells (flagged, not removed).
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

from . import anova, assay_densitometry, ttests

TESTS = ("auto", "ratio_paired", "rm_anova", "unpaired", "anova", "none")


def _num(v):
    if v is None or (isinstance(v, str) and not v.strip()):
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


def _geo(values, ci_level):
    """Geometric mean with its t-based CI (log10 scale)."""
    arr = np.array([v for v in values if v is not None and v > 0])
    if arr.size == 0:
        return {"n": 0, "geometric_mean": None, "ci": None}
    logs = np.log10(arr)
    gm = float(10 ** logs.mean())
    ci = None
    if arr.size > 1:
        se = float(logs.std(ddof=1) / math.sqrt(arr.size))
        t = float(stats.t.ppf((1 + ci_level) / 2, arr.size - 1))
        ci = [float(10 ** (logs.mean() - t * se)),
              float(10 ** (logs.mean() + t * se))]
    return {"n": int(arr.size), "geometric_mean": gm, "ci": ci}


def _blanks(wells, blank_group):
    """Mean Firefly and Renilla of the blank wells, overall and per
    experiment."""
    bl = [w for w in wells if w["group"] == blank_group]
    if not bl:
        return None, {}

    def mean_of(ws):
        f = [w["firefly"] for w in ws if w["firefly"] is not None]
        r = [w["renilla"] for w in ws if w["renilla"] is not None]
        return {"firefly": float(np.mean(f)) if f else 0.0,
                "renilla": float(np.mean(r)) if r else 0.0, "n": len(ws)}

    per = {}
    for e in _ordered(w["experiment"] for w in bl):
        if e is not None:
            per[e] = mean_of([w for w in bl if w["experiment"] == e])
    return mean_of(bl), per


def luciferase(records, *, control_group=None, blank_group=None,
               groups=None, test="auto", comparisons="dunnett",
               low_renilla=0.1, ci_level=0.95) -> dict:
    """records: [{group, firefly, renilla, experiment?, well?}].

    control_group: the group whose ratio is 1 (default: the first
    group). blank_group: a group of untransfected / mock wells whose mean
    Firefly and Renilla are subtracted from every other well (none: the
    signals are used as entered). test: "auto" (ratio paired t test or
    repeated-measures ANOVA on logs when there are two or more
    experiments, otherwise unpaired t test or one-way ANOVA on logs),
    "ratio_paired", "rm_anova", "unpaired", "anova" or "none".
    comparisons: post test for three or more groups ("dunnett" against
    the control, "tukey", "bonferroni", "sidak")."""
    if test not in TESTS:
        raise ValueError(f"unknown test: {test}")
    if low_renilla is not None and not 0 <= float(low_renilla) < 1:
        raise ValueError("low_renilla must be a fraction from 0 to 1")
    wells, warnings = [], []
    for i, r in enumerate(records):
        g = r.get("group")
        if g is None or str(g).strip() == "":
            continue
        e = r.get("experiment")
        e = None if e is None or str(e).strip() == "" else str(e)
        wells.append({"well": str(r.get("well") or i + 1), "group": str(g),
                      "experiment": e, "firefly": _num(r.get("firefly")),
                      "renilla": _num(r.get("renilla"))})
    blank_group = None if blank_group in (None, "") else str(blank_group)
    bg_all, bg_per = _blanks(wells, blank_group) if blank_group else (None, {})
    if blank_group and bg_all is None:
        raise ValueError(f"blank group {blank_group!r} has no wells")
    sample = [w for w in wells if w["group"] != blank_group]
    if not sample:
        raise ValueError("no wells (each row needs a group, a Firefly and "
                         "a Renilla reading)")
    group_order = [str(g) for g in groups if str(g) != blank_group] \
        if groups else _ordered(w["group"] for w in sample)
    control_group = str(control_group) if control_group not in (None, "") \
        else group_order[0]
    if control_group not in group_order:
        raise ValueError(f"control group {control_group!r} not found")

    for w in sample:
        bg = bg_per.get(w["experiment"], bg_all) if blank_group else None
        w["background_firefly"] = bg["firefly"] if bg else 0.0
        w["background_renilla"] = bg["renilla"] if bg else 0.0
        f, rn = w["firefly"], w["renilla"]
        w["firefly_corrected"] = f - w["background_firefly"] if f is not None else None
        w["renilla_corrected"] = rn - w["background_renilla"] if rn is not None else None
        flags = []
        if f is None or rn is None:
            flags.append("missing_reading")
        else:
            if w["firefly_corrected"] <= 0:
                flags.append("firefly_not_above_background")
            if w["renilla_corrected"] <= 0:
                flags.append("renilla_not_above_background")
        w["ratio"] = (w["firefly_corrected"] / w["renilla_corrected"]
                      if not flags else None)
        w["flags"] = flags
        w["fold_change"] = None

    rc = [w["renilla_corrected"] for w in sample
          if w["renilla_corrected"] is not None and w["renilla_corrected"] > 0]
    median_renilla = float(np.median(rc)) if rc else None
    if low_renilla and median_renilla:
        cut = float(low_renilla) * median_renilla
        n_low = 0
        for w in sample:
            if w["ratio"] is not None and w["renilla_corrected"] < cut:
                w["flags"].append("low_renilla")
                n_low += 1
        if n_low:
            warnings.append(
                f"{n_low} well(s) with Renilla below {low_renilla:.0%} of the "
                "median well: the control reporter is weak there (failed "
                "transfection or dead cells?), so their ratios are unstable. "
                "They are flagged, not removed: exclude them in the table if "
                "they should not count.")
    n_bad = sum(1 for w in sample if w["ratio"] is None)
    if n_bad:
        warnings.append(f"{n_bad} well(s) without a usable ratio (a reading "
                        "missing or not above background) were left out.")
    if blank_group:
        missing = sorted({w["experiment"] for w in sample
                          if w["experiment"] is not None
                          and w["experiment"] not in bg_per})
        if bg_per and missing:
            warnings.append("Experiment(s) " + ", ".join(missing) + " have no "
                            "blank wells; the mean of all blank wells was "
                            "subtracted there.")

    experiments = _ordered(w["experiment"] for w in sample
                           if w["experiment"] is not None)
    by_experiment = len(experiments) >= 2 and all(
        w["experiment"] is not None for w in sample)
    if len(experiments) >= 2 and not by_experiment:
        warnings.append("Some wells have no experiment: the wells were "
                        "analysed as independent units.")
    if test in ("ratio_paired", "rm_anova") and not by_experiment:
        raise ValueError("the ratio paired t test and repeated-measures "
                         "ANOVA need an experiment column with two or more "
                         "experiments")
    if test in ("unpaired", "anova") and by_experiment:
        warnings.append("Wells were analysed as independent units although "
                        "experiments were recorded: wells of one experiment "
                        "are technical replicates (pseudoreplication).")
        by_experiment = False

    common = {
        "analysis": "luciferase", "control_group": control_group,
        "blank_group": blank_group, "groups": group_order,
        "background": bg_all, "background_per_experiment": bg_per,
        "median_renilla": median_renilla, "wells": sample,
        "warnings": warnings,
    }
    if by_experiment:
        return {**common, **_by_experiment(sample, experiments, group_order,
                                            control_group, test, comparisons,
                                            ci_level, warnings)}
    if not experiments and test != "none":
        warnings.append("No experiment column: every well counts as an "
                        "independent replicate. Wells from one transfection "
                        "are technical replicates; record the experiment "
                        "(independent transfection) to test with experiments "
                        "as the unit.")
    return {**common, **_by_well(sample, group_order, control_group, test,
                                 comparisons, ci_level, warnings)}


def _by_experiment(sample, experiments, group_order, control_group, test,
                   comparisons, ci_level, warnings):
    """Experiments as the unit: the densitometry engine on the ratios."""
    recs = [{"blot": w["experiment"], "lane": w["well"], "group": w["group"],
             "target": w["firefly_corrected"],
             "reference": w["renilla_corrected"]}
            for w in sample if w["ratio"] is not None]
    dn_test = {"auto": "auto", "ratio_paired": "ratio_paired",
               "rm_anova": "rm_anova", "none": "none"}[test]
    res = assay_densitometry.densitometry(
        recs, control_group=control_group, test=dn_test,
        comparisons=comparisons, groups=group_order, ci_level=ci_level)
    for msg in res["warnings"]:
        warnings.append(msg.replace("Blot", "Experiment").replace(
            "blot", "experiment").replace("lanes", "wells").replace(
            "lane", "well"))
    # fold change of each well vs its experiment's control mean
    folds = {(l["blot"], str(l["lane"])): l["fold_change"] for l in res["lanes"]}
    for w in sample:
        w["fold_change"] = folds.get((w["experiment"], w["well"]))
    st = res["statistics"]
    if st:
        if st["test"] == "ratio_paired_t":
            st["note"] = ("Ratio paired t test, experiment as the pairing "
                          "unit: geometric mean of the per-experiment "
                          "treated / control ratios with its CI (a paired t "
                          "test on log ratios).")
        elif st["test"] == "one_sample_ratio_t":
            st["note"] = ("One-sample t test of log10 fold changes against "
                          "0 (ratio 1), experiment as the unit.")
        else:
            st["note"] = ("Repeated-measures one-way ANOVA on log10 ratios, "
                          "experiment as subject; ratios are antilogs of the "
                          "differences.")
    graph = res["graph"]
    for p in graph["points"]:
        p["experiment"] = p.pop("blot")
    for ln in graph["lines"]:
        ln["experiment"] = ln.pop("blot")
    return {
        "unit": "experiment", "experiments": experiments,
        "n_units": res["n_blots_used"],
        "per_experiment": res["per_blot"],
        "matched_ratio": {"experiments": res["matched_normalized"]["blots"],
                          "groups": res["matched_normalized"]["groups"]},
        "statistics": st, "group_summaries": res["group_summaries"],
        "graph": graph,
    }


def _by_well(sample, group_order, control_group, test, comparisons,
             ci_level, warnings):
    """Wells as the unit: tests on log10 ratios, folds vs the geometric
    mean of the control wells (so the control's geometric mean is 1 and
    each group's geometric mean fold is the ratio the test reports)."""
    ratios = {g: [w["ratio"] for w in sample
                  if w["group"] == g and w["ratio"] is not None]
              for g in group_order}
    ctrl = ratios[control_group]
    if not ctrl:
        raise ValueError(f"the control group {control_group!r} has no "
                         "usable wells")
    denom = float(10 ** np.mean(np.log10(ctrl)))
    for w in sample:
        if w["ratio"] is not None:
            w["fold_change"] = w["ratio"] / denom
    logs = {g: [math.log10(v) for v in ratios[g]] for g in group_order}
    others = [g for g in group_order if g != control_group and len(logs[g])]
    st = None
    testable = test != "none" and others and len(ctrl) >= 2 \
        and all(len(logs[g]) >= 2 for g in others)
    if testable and any(np.ptp(logs[g]) == 0
                        for g in [control_group] + others):
        warnings.append("No test: every well of a group has the same ratio "
                        "(no spread to test against).")
        testable = False
    if testable:
        if len(others) == 1 and test in ("auto", "unpaired"):
            g = others[0]
            st = ttests.unpaired_t(logs[g], logs[control_group],
                                   ci_level=ci_level)
            d, ci = st["difference"], st["ci_difference"]
            st.update(names=[g, control_group], ratio=10 ** d,
                      ci_ratio=[10 ** ci[0], 10 ** ci[1]],
                      note=("Unpaired t test on log10 ratios, wells as the "
                            "unit; the ratio is the antilog of the "
                            "difference of the mean logs (the ratio of the "
                            "geometric means)."))
        elif test in ("auto", "anova", "unpaired"):
            ordered = [control_group] + others
            data = [logs[g] for g in ordered]
            st = anova.one_way_anova(data, ordered)
            st["test"] = "one_way_anova"
            mc = anova.multiple_comparisons(data, comparisons, names=ordered,
                                            control_index=0,
                                            ci_level=ci_level)
            comps = []
            for c in mc["comparisons"]:
                a, _, b = c["pair"].partition(" vs. ")
                d, ci = c["difference"], c.get("ci")
                if a == control_group:          # report as group vs. control
                    a, b, d = b, a, -d
                    ci = [-ci[1], -ci[0]] if ci else None
                comps.append({"pair": f"{a} vs. {b}", "first": a,
                              "second": b, "ratio": 10 ** d,
                              "ratio_ci": ([10 ** ci[0], 10 ** ci[1]]
                                           if ci else None),
                              "log10_difference": d,
                              "p_adjusted": c["p_adjusted"]})
            st["comparisons"] = comps
            st["method_comparisons"] = comparisons
            st["note"] = ("Ordinary one-way ANOVA on log10 ratios, wells as "
                          "the unit; ratios are antilogs of the differences.")
    summaries = []
    for g in group_order:
        s = _geo([w["fold_change"] for w in sample
                  if w["group"] == g and w["fold_change"] is not None],
                 ci_level)
        s["group"] = g
        summaries.append(s)
    graph = {
        "reference_line": 1.0,
        "points": [{"group": w["group"], "well": w["well"],
                    "fold_change": w["fold_change"]} for w in sample
                   if w["fold_change"] is not None],
        "lines": [],
        "summary": [{"group": s["group"], "geometric_mean": s["geometric_mean"],
                     "ci": s["ci"]} for s in summaries],
    }
    return {
        "unit": "well", "experiments": [], "n_units": sum(
            1 for w in sample if w["ratio"] is not None),
        "control_denominator": denom,
        "ratios_by_group": ratios,
        "statistics": st, "group_summaries": summaries, "graph": graph,
    }
