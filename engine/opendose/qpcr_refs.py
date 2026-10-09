"""Reference-gene validation for qPCR: per-gene Cq across groups, geNorm
stability (M), the comparative delta-Cq pairs, and a warning when a
reference gene shifts with treatment, so the check comes before any fold
change is shown.

Method sources:
- Vandesompele et al. (2002), Genome Biol 3:research0034 (geNorm). For
  reference genes j and k, A_jk is, per sample, the log2 of the ratio of
  the relative quantities of j and k; V_jk is the standard deviation of
  A_jk over the samples; the gene-stability measure M_j is the mean of
  V_jk over all other reference genes k. Stepwise exclusion of the gene
  with the highest M until two remain ranks the genes; M > 1.5 marks a
  gene as not stable (the geNorm threshold).
- Silver et al. (2006), BMC Mol Biol 7:33: the comparative delta-Ct
  method, i.e. the mean and SD of dCq between each pair of reference
  genes over the samples (a constant difference = co-stable pair).
- Hellemans et al. (2007), Genome Biol 8:R19 (qBase): efficiency-
  weighted relative quantities, Q = E^(-Cq) up to a constant, so on the
  log2 scale log2 Q = -log2(E)*Cq (E = 2 is 100% efficiency). This is
  the same efficiency-weighted dCq that assay_qpcr uses.
- MIQE 2.0 (Bustin et al. 2025, Clin Chem 71:634): reference genes must
  be validated for the samples and conditions of the experiment; a
  reference whose Cq changes with treatment biases every fold change
  normalised to it.

Per reference gene the Cq values are compared across groups with an
ordinary one-way ANOVA F test (the unpaired t test when there are two
groups, F = t^2) or a Kruskal-Wallis test. A gene "shifts with
treatment" when that test is significant (P < alpha) AND the largest
difference between group mean Cq exceeds a practical threshold (default
1 cycle, a 2-fold change at 100% efficiency).
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

from .assay_qpcr import _ordered, average_replicates, efficiency_factor, \
    parse_cq

SOURCE = ("geNorm M: Vandesompele et al. 2002, Genome Biol 3:research0034; "
          "comparative delta-Cq: Silver et al. 2006, BMC Mol Biol 7:33; "
          "efficiency-weighted quantities: Hellemans et al. 2007, Genome "
          "Biol 8:R19; reference validation: MIQE 2.0, Bustin et al. 2025, "
          "Clin Chem 71:634")


def _f(x):
    """Plain JSON-safe float (None for missing / non-finite)."""
    if x is None:
        return None
    x = float(x)
    return x if math.isfinite(x) else None


def _fmt_p(p):
    if p is None:
        return "P not computed"
    if p < 0.0001:
        return "P < 0.0001"
    return f"P = {p:.2g}"


def _sd(values):
    return float(np.std(values, ddof=1)) if len(values) >= 2 else None


def genorm_m(log2q, genes):
    """geNorm M for `genes` given {gene: np.array of log2 relative
    quantity over the same (complete) samples}. Returns ({gene: M},
    {(a, b): V})."""
    v = {}
    for i, a in enumerate(genes):
        for b in genes[i + 1:]:
            v[(a, b)] = v[(b, a)] = _sd(log2q[a] - log2q[b])
    m = {}
    for a in genes:
        vs = [v[(a, b)] for b in genes if b != a]
        m[a] = (float(np.mean(vs))
                if vs and all(x is not None for x in vs) else None)
    return m, v


def _group_test(by_group, test):
    """Omnibus test over groups with >= 2 values."""
    tested = [(g, vals) for g, vals in by_group if len(vals) >= 2]
    name = "one-way ANOVA" if test == "anova" else "Kruskal-Wallis"
    out = {"test": name, "groups_tested": [g for g, _ in tested],
           "statistic": None, "p": None, "note": None}
    if test == "anova":
        out.update(dfn=None, dfd=None)
    else:
        out.update(df=None)
    if len(tested) < 2:
        out["note"] = ("fewer than 2 groups have 2 or more values; no "
                       "test across groups")
        return out
    data = [np.asarray(vals, dtype=float) for _, vals in tested]
    k = len(data)
    n = sum(d.size for d in data)
    if test == "anova":
        out["dfn"], out["dfd"] = k - 1, n - k
        ss_within = sum(float(((d - d.mean()) ** 2).sum()) for d in data)
        if not ss_within > 0:
            out["note"] = ("no variation within groups; the F test is "
                           "undefined")
            return out
        f, p = stats.f_oneway(*data)
        out["statistic"], out["p"] = _f(f), _f(p)
        if k == 2:
            out["note"] = ("with 2 groups the F test is the unpaired t test "
                           "(F = t^2, same P)")
    else:
        out["df"] = k - 1
        try:
            h, p = stats.kruskal(*data)
        except ValueError:
            out["note"] = "all values are identical; Kruskal-Wallis undefined"
            return out
        out["statistic"], out["p"] = _f(h), _f(p)
        if out["p"] is None:
            out["note"] = "all values are identical; Kruskal-Wallis undefined"
    return out


def reference_stability(cq, groups, reference_genes, *, efficiencies=None,
                        test="anova", alpha=0.05, shift_threshold=1.0,
                        m_threshold=1.5, calibrator=None,
                        groups_order=None) -> dict:
    """Validate qPCR reference genes.

    cq: {sample: {gene: mean Cq or None}}; groups: {sample: group or
    None}; reference_genes: list of gene names; efficiencies: {gene:
    amplification factor (2 = 100%) or percent}, default 2 for all.
    test: "anova" (one-way ANOVA F; the t test with 2 groups) or
    "kruskal" (Kruskal-Wallis). calibrator: optional control group for
    the per-group shift. groups_order: optional order of the groups."""
    if isinstance(reference_genes, str):
        reference_genes = [reference_genes]
    refs = _ordered(str(g) for g in (reference_genes or []))
    if not refs:
        raise ValueError("reference-gene validation needs at least one "
                         "reference gene")
    if test not in ("anova", "kruskal"):
        raise ValueError(f"unknown test: {test!r} (use 'anova' or "
                         "'kruskal')")
    if not 0 < float(alpha) < 1:
        raise ValueError("alpha must be between 0 and 1")
    groups = {str(s): (str(g) if g is not None else None)
              for s, g in (groups or {}).items()}
    samples = [str(s) for s in cq]
    vals = {str(s): {str(g): parse_cq(v) for g, v in (genes or {}).items()}
            for s, genes in cq.items()}
    present = {g for s in samples for g, v in vals[s].items()
               if v is not None}
    missing = [g for g in refs if g not in present]
    if missing:
        raise ValueError("reference gene(s) without any Cq in the data: "
                         + ", ".join(missing))

    eff = {g: 2.0 for g in refs}
    for g, e in (efficiencies or {}).items():
        if str(g) in eff and e is not None:
            eff[str(g)] = efficiency_factor(e)
    lg = {g: math.log2(eff[g]) for g in refs}

    warnings, notes = [], []
    for g in refs:
        if not 1.8 <= eff[g] <= 2.2:
            warnings.append(f"{g}: efficiency {100 * (eff[g] - 1):.0f}% is "
                            "outside 80-120%; check the assay")

    if groups_order:
        group_names = [str(g) for g in groups_order]
    else:
        group_names = _ordered(groups.get(s) for s in samples
                               if groups.get(s) is not None)
    if calibrator is not None:
        calibrator = str(calibrator)
        if calibrator not in group_names:
            raise ValueError(f"calibrator group {calibrator!r} not found")

    # --- stability (complete samples only) -------------------------------
    complete = [s for s in samples
                if all(vals[s].get(g) is not None for g in refs)]
    dropped = [s for s in samples if s not in complete]
    if dropped:
        warnings.append("Samples without a Cq for every reference gene were "
                        "left out of the stability (M) and pair statistics: "
                        + ", ".join(dropped))
    log2q = {g: np.array([-lg[g] * vals[s][g] for s in complete])
             for g in refs}

    m_all, pairs, steps, ranking, most_stable = {}, [], [], None, None
    if len(refs) < 2:
        warnings.append("Stability (geNorm M) needs at least 2 reference "
                        "genes; only the shift across groups is tested.")
        m_all = {g: None for g in refs}
    elif len(complete) < 2:
        warnings.append("Stability (geNorm M) needs at least 2 samples with "
                        "a Cq for every reference gene.")
        m_all = {g: None for g in refs}
    else:
        m_all, v = genorm_m(log2q, refs)
        for i, a in enumerate(refs):
            for b in refs[i + 1:]:
                d = np.array([lg[a] * vals[s][a] - lg[b] * vals[s][b]
                              for s in complete])
                raw = np.array([vals[s][a] - vals[s][b] for s in complete])
                # sd_dcq_raw: Silver et al. 2006's comparative dCt uses the
                # unweighted Cq difference; sd_dcq is efficiency-weighted
                pairs.append({"gene_a": a, "gene_b": b, "n": len(complete),
                              "mean_dcq": float(d.mean()),
                              "sd_dcq": _sd(d), "V": v[(a, b)],
                              "mean_dcq_raw": float(raw.mean()),
                              "sd_dcq_raw": _sd(raw)})
        if len(refs) == 2:
            notes.append("With 2 reference genes, M of both equals V, the "
                         "SD of their (efficiency-weighted) dCq; geNorm "
                         "cannot tell which of the two is more stable.")
        current = list(refs)
        ranking = []
        while True:
            m, _ = genorm_m(log2q, current)
            if len(current) == 2:
                steps.append({"n_genes": 2, "genes": list(current),
                              "M": {g: m[g] for g in current},
                              "removed": None})
                break
            # highest M leaves; a tie goes to the first gene listed
            worst = max(current, key=lambda g: (m[g], -current.index(g)))
            steps.append({"n_genes": len(current), "genes": list(current),
                          "M": {g: m[g] for g in current},
                          "removed": worst})
            ranking.append(worst)
            current.remove(worst)
        ranking.extend(current)
        most_stable = list(current)
        notes.append("Ranking is from least to most stable (geNorm stepwise "
                     "exclusion); the last 2 genes tie as the most stable "
                     "pair.")
        notes.append("M is computed over all samples pooled. Reference genes "
                     "that shift together with treatment can still have a low "
                     "M, so the per-gene test across groups is reported "
                     "separately.")

    # --- per gene across groups ------------------------------------------
    no_group = [s for s in samples if groups.get(s) is None]
    if no_group:
        warnings.append("Samples without a group were left out of the tests "
                        "across groups: " + ", ".join(no_group))
    unknown_group = _ordered(groups.get(s) for s in samples
                             if groups.get(s) is not None
                             and groups.get(s) not in group_names)
    if unknown_group:
        warnings.append("Groups not in the group order were left out: "
                        + ", ".join(unknown_group))
    if test == "anova":
        notes.append("Each reference gene's Cq is compared across groups "
                     "with an ordinary one-way ANOVA (the unpaired t test "
                     "when there are 2 groups).")
    else:
        notes.append("Each reference gene's Cq is compared across groups "
                     "with the Kruskal-Wallis test.")
    notes.append(f"A reference gene shifts with treatment when that test "
                 f"gives P < {alpha:g} and its group means differ by more "
                 f"than {shift_threshold:g} cycle(s); geNorm M > "
                 f"{m_threshold:g} marks it as not stable.")

    gene_rows = []
    for g in refs:
        all_v = [vals[s][g] for s in samples if vals[s].get(g) is not None]
        by_group = []
        for grp in group_names:
            gv = [vals[s][g] for s in samples
                  if groups.get(s) == grp and vals[s].get(g) is not None]
            by_group.append((grp, gv))
        group_means = [{"group": grp, "n": len(gv),
                        "mean_cq": float(np.mean(gv)) if gv else None,
                        "sd_cq": _sd(gv)} for grp, gv in by_group]
        gt = _group_test(by_group, test)
        tested = [r for r in group_means if r["n"] >= 2]
        basis = tested if len(tested) >= 2 else \
            [r for r in group_means if r["n"] >= 1]
        shift, between = None, None
        if len(basis) >= 2:
            lo = min(basis, key=lambda r: r["mean_cq"])
            hi = max(basis, key=lambda r: r["mean_cq"])
            shift = float(hi["mean_cq"] - lo["mean_cq"])
            between = [lo["group"], hi["group"]]
        row = {"gene": g, "efficiency": eff[g], "n": len(all_v),
               "mean_cq": float(np.mean(all_v)), "sd_cq": _sd(all_v),
               "M": m_all.get(g), "group_means": group_means,
               "group_test": gt, "shift": shift, "shift_between": between}
        if calibrator is not None:
            cal = next(r for r in group_means if r["group"] == calibrator)
            row["shift_vs_calibrator"] = [
                {"group": r["group"],
                 "shift": (float(r["mean_cq"] - cal["mean_cq"])
                           if r["mean_cq"] is not None
                           and cal["mean_cq"] is not None else None)}
                for r in group_means]
        p = gt["p"]
        unstable = row["M"] is not None and row["M"] > m_threshold
        big = shift is not None and abs(shift) > shift_threshold
        shifts = p is not None and p < alpha and big
        flags = []
        if unstable:
            flags.append("unstable")
        if shifts:
            flags.append("shifts_with_treatment")
        elif p is not None and p < alpha:
            flags.append("small_significant_shift")
        elif big:
            flags.append("large_shift_not_significant")
        if p is None:
            flags.append("not_tested")
        row.update(unstable=unstable, shifts_with_treatment=shifts,
                   flags=flags)
        gene_rows.append(row)

    # --- summary ----------------------------------------------------------
    sentences = []
    for r in gene_rows:
        if r["shifts_with_treatment"]:
            a, b = r["shift_between"]
            sentences.append(
                f"{r['gene']} shifts with treatment "
                f"({_fmt_p(r['group_test']['p'])}, {r['shift']:.1f} cycles "
                f"between {a} and {b}): normalising to it would bias fold "
                "changes.")
            warnings.append(sentences[-1])
    for r in gene_rows:
        if r["unstable"]:
            sentences.append(f"{r['gene']} is not stable (geNorm M = "
                             f"{r['M']:.2f} > {m_threshold:g}).")
            warnings.append(sentences[-1])
    any_unstable = any(r["unstable"] for r in gene_rows)
    any_shift = any(r["shifts_with_treatment"] for r in gene_rows)
    if not sentences:
        if len(refs) == 1:
            r = gene_rows[0]
            sentences.append(
                f"{r['gene']} does not shift with treatment "
                f"({_fmt_p(r['group_test']['p'])}); its stability (M) needs "
                "at least 2 reference genes.")
        elif most_stable:
            sentences.append(
                "No reference gene shifts with treatment and all are stable "
                f"(geNorm M <= {m_threshold:g}); most stable: "
                f"{most_stable[0]} and {most_stable[1]}.")
        else:
            sentences.append("No reference gene shifts with treatment.")
    summary = " ".join(sentences)

    return {
        "reference_genes": refs,
        "n_samples_complete": len(complete),
        "samples_dropped": dropped,
        "genes": gene_rows,
        "pairs": pairs,
        "genorm_steps": steps,
        "ranking": ranking,
        "most_stable": most_stable,
        "any_unstable": any_unstable,
        "any_shift": any_shift,
        "thresholds": {"m": float(m_threshold),
                       "shift_cq": float(shift_threshold),
                       "alpha": float(alpha)},
        "summary": summary,
        "warnings": warnings,
        "notes": notes,
        "source": SOURCE,
    }


def reference_stability_from_records(records, reference_genes, *,
                                     max_cq=35.0, max_spread=0.5,
                                     undetermined_value=None,
                                     exclude_high_cq=False,
                                     efficiencies=None, groups_order=None,
                                     **kw) -> dict:
    """reference_stability from well records [{sample, group, target, cq,
    well?}] (as the qPCR handler takes): technical replicates are
    averaged with assay_qpcr.average_replicates first."""
    if isinstance(reference_genes, str):
        reference_genes = [reference_genes]
    refs = _ordered(str(g) for g in (reference_genes or []))
    if not refs:
        raise ValueError("reference-gene validation needs at least one "
                         "reference gene")
    reps, meta = average_replicates(
        records or [], max_cq=max_cq, max_spread=max_spread,
        undetermined_value=undetermined_value,
        exclude_high_cq=exclude_high_cq)
    if not reps:
        raise ValueError("no qPCR records (each needs sample, target, cq)")
    targets = _ordered(r["target"] for r in reps)
    missing = [g for g in refs if g not in targets]
    if missing:
        raise ValueError("reference gene(s) not in the data: "
                         + ", ".join(missing) + " (targets found: "
                         + ", ".join(targets) + ")")
    cq, groups = {}, {}
    for r in reps:
        if r["target"] in refs:
            cq.setdefault(r["sample"], {})[r["target"]] = r["mean_cq"]
            groups[r["sample"]] = meta[r["sample"]]["group"]
    res = reference_stability(cq, groups, refs, efficiencies=efficiencies,
                              groups_order=groups_order, **kw)
    flagged = [r for r in reps if r["target"] in refs and r["flags"]
               and r["flags"] != ["single_replicate"]]
    res["replicates_flagged"] = len(flagged)
    if flagged:
        res["warnings"].append(
            f"{len(flagged)} reference-gene replicate set(s) have QC flags "
            "(undetermined, high Cq or replicate spread): "
            + ", ".join(f"{r['sample']}/{r['target']}" for r in flagged))
    return res
