"""Western blot densitometry: background subtraction, loading-control
or total-protein normalisation, fold change within each blot, and the
ratio tests that treat the blot as the experimental unit.

Method sources:
- Background-corrected band volume divided by the loading control (a
  housekeeping protein) or a total-protein stain in the same lane, then
  expressed relative to the control lanes of the same blot (Taylor &
  Posch 2014, BioMed Res Int 2014:361590; Pillai-Kastoori et al. 2020,
  Anal Biochem 593:113608; J Biol Chem author guidelines prefer total-
  protein normalisation).
- Degasperi et al. (2014), PLOS ONE 9:e87293: normalising to a single
  control lane fixes that lane at exactly 1 and "tends to increase the
  mean CV"; normalising to the mean of several control lanes (the
  default here) is preferred.
- GraphPad Prism statistics guide, "The ratio paired t test" FAQ and
  "Paired or ratio t test?": blots are the pairing unit; the paired t
  test on log ratios (geometric mean ratio with CI) is the right
  analysis, and a column of controls that are all exactly 1 has SD 0,
  so an unpaired t test against it is wrong: the one-sample t test of
  log fold changes against 0 (ratio 1) is the equivalent analysis. With
  three or more groups: repeated-measures one-way ANOVA on the logs,
  blot as subject (statistics guide, "Repeated-measures one-way
  ANOVA"), with post tests from the matched mixed model (which also
  allows a missing lane).

Per lane: corrected target = target - background (target band);
corrected reference = reference - reference_background (when given);
normalised = corrected target / corrected reference. Per blot: lanes of
one group are averaged; fold change = normalised / mean normalised of
the control group in that blot (or of a designated control lane).
Negative or zero corrected values, saturated raw intensities (at or
above saturation_limit) and blots without a control are reported.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

from . import columnstats, mixedmodel, repeated, ttests


def _num(v):
    if v is None:
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


def _geo_summary(values, ci_level):
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
    return {"n": int(arr.size), "geometric_mean": gm, "ci": ci,
            "mean": float(arr.mean()),
            "sd": float(arr.std(ddof=1)) if arr.size > 1 else None}


def densitometry(records, *, control_group=None, control_lanes=None,
                 saturation_limit=None, test="auto", comparisons=None,
                 groups=None, ci_level=0.95) -> dict:
    """records: [{blot, lane, sample?, group, target, reference,
    background?, reference_background?}]. control_lanes: {blot: lane}
    to normalise each blot to one designated lane instead of the mean
    of its control-group lanes."""
    if test not in ("auto", "ratio_paired", "one_sample", "rm_anova",
                    "none"):
        raise ValueError(f"unknown test: {test}")
    lanes, warnings = [], []
    for r in records:
        blot, group = r.get("blot"), r.get("group")
        t_raw = _num(r.get("target", r.get("target_signal")))
        ref_raw = _num(r.get("reference", r.get("reference_signal")))
        if blot is None or group is None or t_raw is None:
            continue
        bg = _num(r.get("background")) or 0.0
        rbg = _num(r.get("reference_background")) or 0.0
        flags = []
        if saturation_limit is not None:
            if t_raw >= saturation_limit:
                flags.append("target_saturated")
            if ref_raw is not None and ref_raw >= saturation_limit:
                flags.append("reference_saturated")
        tc = t_raw - bg
        rc = ref_raw - rbg if ref_raw is not None else None
        if tc <= 0:
            flags.append("target_not_above_background")
        if rc is not None and rc <= 0:
            flags.append("reference_not_above_background")
        norm = None
        if ref_raw is None:
            norm = tc if tc > 0 else None
            flags.append("no_reference")
        elif tc > 0 and rc > 0:
            norm = tc / rc
        lanes.append({"blot": str(blot), "lane": r.get("lane"),
                      "sample": r.get("sample"), "group": str(group),
                      "target": t_raw, "reference": ref_raw,
                      "background": bg, "reference_background": rbg,
                      "target_corrected": tc, "reference_corrected": rc,
                      "normalized": norm, "flags": flags,
                      "fold_change": None})
    if not lanes:
        raise ValueError("no lanes (each record needs blot, group and "
                         "target)")
    group_order = [str(g) for g in groups] if groups else \
        _ordered(l["group"] for l in lanes)
    control_group = str(control_group) if control_group is not None \
        else group_order[0]
    if control_group not in group_order:
        raise ValueError(f"control group {control_group!r} not found")
    blots = _ordered(l["blot"] for l in lanes)
    if any(l["flags"] for l in lanes):
        n_sat = sum(any("saturated" in f for f in l["flags"]) for l in lanes)
        n_neg = sum(any("not_above" in f for f in l["flags"]) for l in lanes)
        if n_sat:
            warnings.append(f"{n_sat} lane(s) at or above the saturation "
                            "limit: band intensities are outside the linear "
                            "range.")
        if n_neg:
            warnings.append(f"{n_neg} lane(s) not above background were left "
                            "out of the ratios.")

    control_lanes = {str(k): v for k, v in (control_lanes or {}).items()}
    per_blot = {}
    for b in blots:
        bl = [l for l in lanes if l["blot"] == b]
        if b in control_lanes:
            ref = [l["normalized"] for l in bl
                   if str(l["lane"]) == str(control_lanes[b])
                   and l["normalized"] is not None]
            basis = "control lane"
        else:
            ref = [l["normalized"] for l in bl
                   if l["group"] == control_group
                   and l["normalized"] is not None]
            basis = "control-group mean"
        if not ref:
            warnings.append(f"Blot {b} has no usable control lane; its lanes "
                            "were left out.")
            per_blot[b] = None
            continue
        denom = float(np.mean(ref))
        for l in bl:
            if l["normalized"] is not None:
                l["fold_change"] = l["normalized"] / denom
        means = {}
        for g in group_order:
            vals = [l["normalized"] for l in bl
                    if l["group"] == g and l["normalized"] is not None]
            if vals:
                means[g] = float(np.mean(vals))
        per_blot[b] = {"denominator": denom, "basis": basis,
                       "group_means": means,
                       "fold": {g: v / denom for g, v in means.items()}}
    if control_lanes:
        warnings.append("Each blot was normalised to a single control lane, "
                        "which fixes it at exactly 1 (Degasperi 2014: "
                        "normalising to the mean of several control lanes "
                        "is less variable).")

    used_blots = [b for b in blots if per_blot[b] is not None]
    # matched matrix of per-blot group means (normalised, not fold)
    mat = {g: [per_blot[b]["group_means"].get(g) for b in used_blots]
           for g in group_order}
    fold = {g: [per_blot[b]["fold"].get(g) for b in used_blots]
            for g in group_order}
    others = [g for g in group_order if g != control_group]
    # pre-normalised input: every control lane already exactly 1 (the
    # "normalise to 1, then t test against SD 0" trap)
    ctrl_raw = [l["normalized"] for l in lanes
                if l["group"] == control_group and l["normalized"] is not None]
    control_is_one = bool(ctrl_raw) and all(abs(v - 1.0) < 1e-12
                                            for v in ctrl_raw)
    if control_is_one:
        warnings.append(
            "Every control value is exactly 1 (data normalised to the "
            "control before entry). Its SD is 0, so an unpaired t test "
            "against it is invalid; the fold changes are tested against 1 "
            "on the log scale (one-sample t test of log fold changes), "
            "which equals the ratio paired t test.")
    result = None
    if test != "none" and len(used_blots) >= 2 and others:
        if len(others) == 1 and test in ("auto", "ratio_paired",
                                         "one_sample"):
            g = others[0]
            if test == "one_sample" or control_is_one:
                vals = [v for v in fold[g] if v is not None]
                result = columnstats.one_sample_ratio_t(vals, 1.0,
                                                        ci_level=ci_level)
                result["test"] = "one_sample_ratio_t"
                result["names"] = [g, control_group]
                result["note"] = ("One-sample t test of log10 fold changes "
                                  "against 0 (ratio 1), blot as the unit.")
            else:
                result = ttests.ratio_paired_t(mat[g], mat[control_group],
                                               ci_level=ci_level)
                result["names"] = [g, control_group]
                result["note"] = ("Ratio paired t test, blot as the pairing "
                                  "unit: geometric mean of the treated/"
                                  "control ratios with its CI (identical to "
                                  "a one-sample t test of the log fold "
                                  "changes against 0).")
        elif test in ("auto", "rm_anova"):
            ordered = [control_group] + others
            logs = [[math.log10(v) if v is not None and v > 0 else None
                     for v in mat[g]] for g in ordered]
            method = comparisons or "dunnett"
            complete = all(all(v is not None for v in col) for col in logs)
            mm = mixedmodel.mixed_rm_one_way(logs, ordered,
                                             comparisons=method,
                                             control_index=0,
                                             ci_level=ci_level)
            if complete:
                result = repeated.rm_one_way_anova(logs, ordered)
                result["test"] = "rm_one_way_anova_log10"
            else:
                result = mm
                result["test"] = "mixed_rm_one_way_log10"
            comps = []
            for c in mm["multiple_comparisons"]["comparisons"]:
                a, _, b = c["pair"].partition(" vs. ")
                d, ci = c["difference"], c.get("ci")
                if a == control_group:      # report as group vs. control
                    a, b, d = b, a, -d
                    ci = [-ci[1], -ci[0]] if ci else None
                comps.append({"pair": f"{a} vs. {b}", "first": a, "second": b,
                              "ratio": 10 ** d,
                              "ratio_ci": ([10 ** ci[0], 10 ** ci[1]]
                                           if ci else None),
                              "log10_difference": d,
                              "p_adjusted": c["p_adjusted"]})
            result["comparisons"] = comps
            result["method_comparisons"] = method
            result["note"] = ("Repeated-measures one-way ANOVA on log10 "
                              "normalised signals, blot as subject; ratios "
                              "are antilogs of the differences.")
    summaries = []
    for g in group_order:
        s = _geo_summary(fold[g], ci_level)
        s["group"] = g
        summaries.append(s)
    graph = {
        "reference_line": 1.0,
        "points": [{"group": g, "blot": b, "fold_change": per_blot[b]["fold"]
                    .get(g)} for b in used_blots for g in group_order
                   if per_blot[b]["fold"].get(g) is not None],
        "lines": [{"blot": b, "groups": [g for g in group_order
                                         if per_blot[b]["fold"].get(g)
                                         is not None],
                   "fold_change": [per_blot[b]["fold"][g]
                                   for g in group_order
                                   if per_blot[b]["fold"].get(g)
                                   is not None]}
                  for b in used_blots],
        "summary": [{"group": s["group"], "geometric_mean": s["geometric_mean"],
                     "ci": s["ci"]} for s in summaries],
    }
    return {
        "analysis": "densitometry",
        "control_group": control_group, "groups": group_order,
        "blots": blots, "n_blots_used": len(used_blots),
        "lanes": lanes,
        "per_blot": per_blot,
        "matched_normalized": {"blots": used_blots, "groups": mat},
        "matched_fold_change": {"blots": used_blots, "groups": fold},
        "control_exactly_one": control_is_one,
        "statistics": result,
        "group_summaries": summaries,
        "graph": graph,
        "warnings": warnings,
    }
