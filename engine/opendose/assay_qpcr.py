"""Relative quantification of qPCR data: technical-replicate QC,
efficiency-corrected delta-Cq with several reference genes, statistics
on the log scale and fold changes with asymmetric confidence intervals.

Method sources:
- Livak & Schmittgen (2001), Methods 25:402 (the 2^-ddCt method) and
  Schmittgen & Livak (2008), Nat Protoc 3:1101: dCt = Ct(target) -
  Ct(reference), ddCt = dCt(sample) - dCt(calibrator), fold change
  2^-ddCt; statistics are done on the dCt values, and a fold change's
  range or CI is the back-transform of the interval on the Ct scale
  (asymmetric).
- Pfaffl (2001), Nucleic Acids Res 29:e45, and Hellemans et al. (2007),
  Genome Biol 8:R19 (qBase): amplification efficiency E per target
  (E = 2 is 100%), relative quantity E^(Cq_cal - Cq), normalised by the
  geometric mean of the relative quantities of several reference genes
  (Vandesompele et al. 2002, Genome Biol 3:research0034). On the log2
  scale this is the efficiency-weighted dCq,
      wdCq = log2(E_t)*Cq_t - mean_r[log2(E_r)*Cq_r],
  which equals the classic dCt when every E = 2; 2^-(wdCq_sample -
  mean wdCq_calibrator) is exactly the qBase normalised relative
  quantity relative to the calibrator group's geometric mean.
- MIQE 2.0 (Bustin et al. 2025, Clin Chem 71:634): report efficiencies
  (from a dilution series: E = 10^(-1/slope), %E = 100*(E - 1)),
  several validated reference genes and Cq values, and analyse on the
  log scale. Technical-replicate QC uses the conventional, adjustable
  thresholds of bench protocols: replicates within about 0.5 cycle,
  Cq above 35 treated with caution; undetermined wells are not given
  an arbitrary Cq unless the user chooses one.
- GraphPad FAQ "Graphing data expressed as fold changes": test the
  logs (here dCq) and show fold changes on a log2 axis with the control
  at 1.

Statistics on dCq per target run through the existing modules: unpaired
(or Welch) t test, paired t test when a pairing key links samples
(ttests), ordinary one-way ANOVA with Dunnett (vs the calibrator, the
default) or another post test (anova), repeated-measures one-way ANOVA
with post tests from the matched mixed model (repeated, mixedmodel).
A comparison's difference of mean dCq (group - calibrator) gives the
fold change 2^-difference and its CI [2^-upper, 2^-lower].
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

from . import anova, linregress, mixedmodel, repeated, ttests

_UNDETERMINED = {"", "undetermined", "undet", "nan", "n/a", "na", "-",
                 "no ct", "no cq", "none", "null", "nd", "inf"}


def parse_cq(value):
    """Cq as float, or None for an undetermined / missing well."""
    if value is None:
        return None
    if isinstance(value, str):
        v = value.strip().lower()
        if v in _UNDETERMINED:
            return None
        try:
            f = float(v.replace(",", "."))
        except ValueError:
            return None
    else:
        f = float(value)
    return f if math.isfinite(f) and f > 0 else None


def efficiency_factor(value) -> float:
    """Amplification factor from an entered efficiency: values up to 3
    are factors (2 = 100%), larger values are percentages (95 -> 1.95)."""
    v = float(value)
    if not v > 0:
        raise ValueError(f"invalid efficiency: {value}")
    return v if v <= 3.0 else 1.0 + v / 100.0


def efficiency_from_dilution(quantities, cqs, ci_level=0.95) -> dict:
    """Standard curve Cq = slope*log10(quantity) + intercept; E =
    10^(-1/slope) with the CI of the slope carried through (monotone)."""
    pairs = [(float(q), parse_cq(c)) for q, c in zip(quantities, cqs)
             if q is not None and float(q) > 0 and parse_cq(c) is not None]
    if len({p[0] for p in pairs}) < 2 or len(pairs) < 3:
        raise ValueError("an efficiency standard curve needs at least 3 "
                         "points at 2 or more quantities")
    reg = linregress.linear_regression([math.log10(q) for q, _ in pairs],
                                       [c for _, c in pairs],
                                       ci_level=ci_level)
    s = reg["slope"]["value"]
    lo, hi = reg["slope"]["ci95"]
    e = 10.0 ** (-1.0 / s) if s < 0 else None
    ci = ([10.0 ** (-1.0 / lo), 10.0 ** (-1.0 / hi)]
          if lo < 0 and hi < 0 else None)
    return {"slope": s, "slope_ci": [lo, hi],
            "intercept": reg["y_intercept"]["value"],
            "r_squared": reg["r_squared"], "n": reg["n"],
            "efficiency": e,
            "efficiency_pct": 100.0 * (e - 1.0) if e is not None else None,
            "efficiency_ci": ci,
            "efficiency_pct_ci": ([100.0 * (c - 1.0) for c in ci]
                                  if ci else None)}


def _ordered(seq):
    seen, out = set(), []
    for s in seq:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


def _fold(diff):
    return 2.0 ** (-diff)


def _fold_ci(ci):
    if ci is None:
        return None
    return [2.0 ** (-ci[1]), 2.0 ** (-ci[0])]


def average_replicates(records, *, max_cq=35.0, max_spread=0.5,
                       undetermined_value=None, exclude_high_cq=False):
    """Technical replicates per (sample, target) with QC flags."""
    cells = {}
    meta = {}
    for r in records:
        sample = r.get("sample")
        target = r.get("target")
        if sample is None or target is None:
            continue
        key = (str(sample), str(target))
        cells.setdefault(key, []).append(
            {"cq": parse_cq(r.get("cq", r.get("ct"))), "well": r.get("well")})
        m = meta.setdefault(str(sample), {"group": None, "pair": None})
        if r.get("group") is not None:
            m["group"] = str(r["group"])
        if r.get("pair") is not None:
            m["pair"] = str(r["pair"])
    out = []
    for (sample, target), reps in cells.items():
        flags = []
        raw = [x["cq"] for x in reps]
        n_und = sum(v is None for v in raw)
        vals = [v for v in raw if v is not None]
        if n_und:
            flags.append("undetermined" if vals else "all_undetermined")
            if undetermined_value is not None:
                vals = vals + [float(undetermined_value)] * n_und
                flags.append("undetermined_substituted")
        high = [v for v in vals if v > max_cq]
        if high:
            flags.append("high_cq")
            if exclude_high_cq:
                vals = [v for v in vals if v <= max_cq]
        spread = (max(vals) - min(vals)) if len(vals) >= 2 else None
        if spread is not None and spread > max_spread + 1e-12:
            flags.append("replicate_spread")
        if len(vals) == 1:
            flags.append("single_replicate")
        out.append({
            "sample": sample, "target": target,
            "group": meta[sample]["group"], "pair": meta[sample]["pair"],
            "cq_values": raw, "wells": [x["well"] for x in reps],
            "n_replicates": len(raw), "n_used": len(vals),
            "mean_cq": float(np.mean(vals)) if vals else None,
            "sd_cq": float(np.std(vals, ddof=1)) if len(vals) >= 2 else None,
            "spread": spread, "flags": flags})
    return out, meta


def _comparison_rows(comparisons, names, calibrator):
    """Fold changes of a comparison list (pair 'A vs. B', difference
    A - B of mean dCq)."""
    rows = []
    for c in comparisons:
        a, _, b = c["pair"].partition(" vs. ")
        diff, ci = c["difference"], c.get("ci")
        row = {"pair": c["pair"], "difference_dcq": diff, "ci_dcq": ci,
               "p_adjusted": c.get("p_adjusted"),
               "fold_change": _fold(diff), "fold_change_ci": _fold_ci(ci),
               "first": a, "second": b}
        if b == calibrator:
            row["group"] = a
            row["fold_vs_calibrator"] = row["fold_change"]
            row["fold_vs_calibrator_ci"] = row["fold_change_ci"]
        elif a == calibrator:
            row["group"] = b
            row["fold_vs_calibrator"] = _fold(-diff)
            row["fold_vs_calibrator_ci"] = (_fold_ci([-ci[1], -ci[0]])
                                            if ci else None)
        rows.append(row)
    return rows


def _target_stats(dcq_by_sample, groups, calibrator, meta, *, test,
                  comparisons, ci_level, welch):
    cols = {g: [s for s in dcq_by_sample if meta[s]["group"] == g]
            for g in groups}
    present = [g for g in groups if len(cols[g]) > 0]
    if calibrator not in present or len(present) < 2:
        return None, "needs the calibrator and at least one other group"
    paired = test in ("paired", "rm_anova") or (
        test == "auto" and all(meta[s]["pair"] is not None
                               for g in present for s in cols[g]))
    if test == "none":
        return None, None
    ordered = [calibrator] + [g for g in present if g != calibrator]
    if paired:
        keys = _ordered(meta[s]["pair"] for g in ordered for s in cols[g])
        mat = []
        for g in ordered:
            by = {}
            for s in cols[g]:
                by.setdefault(meta[s]["pair"], []).append(dcq_by_sample[s])
            mat.append([float(np.mean(by[k])) if k in by else None
                        for k in keys])
    else:
        mat = [[dcq_by_sample[s] for s in cols[g]] for g in ordered]
    try:
        if len(ordered) == 2:
            cal, other = mat[0], mat[1]
            if paired:
                res = ttests.paired_t(other, cal, ci_level=ci_level)
                diff, ci = res["mean_difference"], res["ci_difference"]
            else:
                res = ttests.unpaired_t(other, cal,
                                        welch=welch or test == "welch",
                                        ci_level=ci_level)
                diff, ci = res["difference"], res["ci_difference"]
            res["names"] = [ordered[1], ordered[0]]
            res["comparisons"] = _comparison_rows(
                [{"pair": f"{ordered[1]} vs. {ordered[0]}",
                  "difference": diff, "ci": ci,
                  "p_adjusted": res["p_two_tailed"]}], ordered, calibrator)
            return res, None
        method = comparisons or "dunnett"
        if paired:
            res = repeated.rm_one_way_anova(mat, ordered)
            mm = mixedmodel.mixed_rm_one_way(
                mat, ordered, comparisons=method, control_index=0,
                ci_level=ci_level)
            res["multiple_comparisons"] = mm["multiple_comparisons"]
            res["test"] = "rm_one_way_anova"
        else:
            res = anova.one_way_anova(mat, ordered)
            res["multiple_comparisons"] = anova.multiple_comparisons(
                mat, method, names=ordered, control_index=0,
                ci_level=ci_level)
            res["test"] = "one_way_anova"
        res["comparisons"] = _comparison_rows(
            res["multiple_comparisons"]["comparisons"], ordered, calibrator)
        return res, None
    except ValueError as exc:
        return None, str(exc)


def qpcr_analysis(records, *, reference_genes, calibrator=None,
                  efficiencies=None, standard_curves=None, max_cq=35.0,
                  max_spread=0.5, undetermined_value=None,
                  exclude_high_cq=False, test="auto", comparisons=None,
                  welch=False, ci_level=0.95, groups=None,
                  targets=None) -> dict:
    """Relative quantification (efficiency-weighted ddCq) with QC flags,
    statistics on dCq and fold changes with asymmetric CIs.

    records: [{sample, group, target, cq, well?, pair?}] (one per well).
    reference_genes: list of target names used for normalisation.
    calibrator: the reference group (fold change 1); default the first
    group. efficiencies: {target: factor or %}. standard_curves:
    {target: [{"quantity", "cq"}]} (overrides efficiencies for that
    target)."""
    if isinstance(reference_genes, str):
        reference_genes = [reference_genes]
    reference_genes = [str(r) for r in (reference_genes or [])]
    if not reference_genes:
        raise ValueError("qPCR analysis needs at least one reference gene")
    if test not in ("auto", "unpaired", "welch", "paired", "anova",
                    "rm_anova", "none"):
        raise ValueError(f"unknown test: {test}")
    reps, meta = average_replicates(
        records, max_cq=max_cq, max_spread=max_spread,
        undetermined_value=undetermined_value,
        exclude_high_cq=exclude_high_cq)
    if not reps:
        raise ValueError("no qPCR records (each needs sample, target, cq)")
    all_targets = _ordered(r["target"] for r in reps)
    missing_refs = [g for g in reference_genes if g not in all_targets]
    if missing_refs:
        raise ValueError("reference gene(s) not in the data: "
                         + ", ".join(missing_refs))
    targets = [str(t) for t in targets] if targets else \
        [t for t in all_targets if t not in reference_genes]
    group_order = [str(g) for g in groups] if groups else \
        _ordered(meta[r["sample"]]["group"] for r in reps
                 if meta[r["sample"]]["group"] is not None)
    calibrator = str(calibrator) if calibrator is not None else \
        (group_order[0] if group_order else None)
    if calibrator not in group_order:
        raise ValueError(f"calibrator group {calibrator!r} not found")
    warnings = []

    # efficiencies
    eff = {}
    eff_info = {}
    for t in all_targets:
        eff[t] = 2.0
        eff_info[t] = {"efficiency": 2.0, "source": "assumed (100%)"}
    for t, v in (efficiencies or {}).items():
        eff[str(t)] = efficiency_factor(v)
        eff_info[str(t)] = {"efficiency": eff[str(t)], "source": "entered"}
    for t, pts in (standard_curves or {}).items():
        sc = efficiency_from_dilution([p.get("quantity") for p in pts],
                                      [p.get("cq") for p in pts], ci_level)
        if sc["efficiency"] is None:
            raise ValueError(f"standard curve for {t}: slope is not "
                             "negative, efficiency undefined")
        eff[str(t)] = sc["efficiency"]
        eff_info[str(t)] = dict(sc, source="dilution series")
    for t, info in eff_info.items():
        info["efficiency_pct"] = 100.0 * (eff[t] - 1.0)
        if not 1.8 <= eff[t] <= 2.2:
            warnings.append(f"{t}: efficiency {100 * (eff[t] - 1):.0f}% is "
                            "outside 80-120%; check the assay")
    if all(info["source"].startswith("assumed")
           for t, info in eff_info.items()):
        warnings.append("All efficiencies assumed to be 100% (E = 2); "
                        "MIQE 2.0 asks for measured efficiencies.")

    cq = {(r["sample"], r["target"]): r for r in reps}
    samples = _ordered(r["sample"] for r in reps)
    ref_term = {}
    for s in samples:
        terms = []
        for g in reference_genes:
            r = cq.get((s, g))
            if r is None or r["mean_cq"] is None:
                terms = None
                break
            terms.append(math.log2(eff[g]) * r["mean_cq"])
        ref_term[s] = float(np.mean(terms)) if terms else None
    no_ref = [s for s in samples if ref_term[s] is None]
    if no_ref:
        warnings.append("Samples without a Cq for every reference gene were "
                        "left out: " + ", ".join(no_ref))
    no_group = [s for s in samples if meta[s]["group"] is None]
    if no_group:
        warnings.append("Samples without a group were left out: "
                        + ", ".join(no_group))

    table, per_target = [], []
    for t in targets:
        dcq = {}
        for s in samples:
            r = cq.get((s, t))
            if r is None or r["mean_cq"] is None or ref_term[s] is None \
                    or meta[s]["group"] is None:
                continue
            dcq[s] = math.log2(eff[t]) * r["mean_cq"] - ref_term[s]
        cal_vals = [v for s, v in dcq.items()
                    if meta[s]["group"] == calibrator]
        cal_mean = float(np.mean(cal_vals)) if cal_vals else None
        for s in samples:
            r = cq.get((s, t))
            if r is None:
                continue
            d = dcq.get(s)
            dd = d - cal_mean if (d is not None and cal_mean is not None) \
                else None
            refs = {g: cq[(s, g)]["mean_cq"] if (s, g) in cq else None
                    for g in reference_genes}
            table.append({
                "sample": s, "group": meta[s]["group"],
                "pair": meta[s]["pair"], "target": t,
                "mean_cq": r["mean_cq"], "sd_cq": r["sd_cq"],
                "n_replicates": r["n_replicates"], "n_used": r["n_used"],
                "flags": r["flags"], "reference_cq": refs,
                "reference_term": ref_term[s],
                "dcq": d, "ddcq": dd,
                "relative_quantity": _fold(dd) if dd is not None else None,
                "log2_fold_change": -dd if dd is not None else None,
            })
        group_rows = []
        for g in group_order:
            vals = np.array([v for s, v in dcq.items()
                             if meta[s]["group"] == g])
            if vals.size == 0:
                continue
            n = int(vals.size)
            m = float(vals.mean())
            sd = float(vals.std(ddof=1)) if n > 1 else None
            ci = None
            if n > 1 and cal_mean is not None:
                tcrit = float(stats.t.ppf((1 + ci_level) / 2, n - 1))
                half = tcrit * sd / math.sqrt(n)
                ci = [m - half - cal_mean, m + half - cal_mean]
            dd = m - cal_mean if cal_mean is not None else None
            group_rows.append({
                "group": g, "n": n, "mean_dcq": m, "sd_dcq": sd,
                "mean_ddcq": dd,
                "fold_change": _fold(dd) if dd is not None else None,
                "fold_change_ci": _fold_ci(ci),
                "log2_fold_change": -dd if dd is not None else None,
                "log2_fold_change_ci": ([-ci[1], -ci[0]] if ci else None),
            })
        res, note = _target_stats(dcq, group_order, calibrator, meta,
                                  test=test, comparisons=comparisons,
                                  ci_level=ci_level, welch=welch)
        graph = {
            "y_axis": "log2", "reference_line": 1.0,
            "points": [{"group": meta[s]["group"], "sample": s,
                        "fold_change": _fold(v - cal_mean),
                        "log2_fold_change": -(v - cal_mean)}
                       for s, v in dcq.items() if cal_mean is not None],
            "groups": [{"group": gr["group"], "fold_change": gr["fold_change"],
                        "ci": gr["fold_change_ci"]} for gr in group_rows],
        }
        per_target.append({"target": t, "efficiency": eff[t],
                           "calibrator_mean_dcq": cal_mean,
                           "groups": group_rows, "statistics": res,
                           "statistics_note": note, "graph": graph})
    qc_flags = [r for r in reps if r["flags"]]
    return {
        "analysis": "qpcr",
        "reference_genes": reference_genes, "calibrator": calibrator,
        "groups": group_order, "targets": targets,
        "efficiencies": eff_info,
        "replicates": reps,
        "n_flagged_replicate_sets": len(qc_flags),
        "qc": {"max_cq": max_cq, "max_spread": max_spread,
               "exclude_high_cq": exclude_high_cq,
               "undetermined_value": undetermined_value},
        "results": table,
        "per_target": per_target,
        "method": ("efficiency-weighted dCq = log2(E_target)*Cq_target - "
                   "mean over reference genes of log2(E_ref)*Cq_ref; "
                   "fold change = 2^-(dCq - calibrator mean dCq)"),
        "warnings": warnings,
    }
