"""qPCR relative quantification (assay_qpcr).

Pinned to Livak & Schmittgen (2001), Methods 25:402, Tables 1 and 2
(c-myc normalised to GAPDH, kidney relative to brain), and to hand
calculations of the efficiency-corrected qBase normalised relative
quantity (Hellemans et al. 2007) with two reference genes.
"""

import math

import numpy as np
import pytest

from opendose import anova, api, assay_qpcr as q, ttests

# Livak & Schmittgen 2001, Table 1 (target and reference in separate wells)
T1 = {
    "Brain": {"c-myc": [30.72, 30.34, 30.58, 30.34, 30.50, 30.43],
              "GAPDH": [23.70, 23.56, 23.47, 23.65, 23.69, 23.68]},
    "Kidney": {"c-myc": [27.06, 27.03, 27.03, 27.10, 26.99, 26.94],
               "GAPDH": [22.76, 22.61, 22.62, 22.60, 22.61, 22.76]},
}


def _table1_records():
    return [{"sample": tissue, "group": tissue, "target": gene, "cq": c}
            for tissue, genes in T1.items() for gene, cts in genes.items()
            for c in cts]


def test_livak_table1_ddct_and_fold_change():
    res = q.qpcr_analysis(_table1_records(), reference_genes=["GAPDH"],
                          calibrator="Brain")
    rows = {(r["sample"], r["target"]): r for r in res["results"]}
    brain, kidney = rows[("Brain", "c-myc")], rows[("Kidney", "c-myc")]
    # printed: brain dCT 6.86, kidney dCT 4.37, ddCT -2.50, 5.6-fold
    assert round(brain["dcq"], 2) == 6.86
    assert round(kidney["dcq"], 2) == 4.37      # 4.365 exactly
    assert kidney["dcq"] == pytest.approx(27.025 - 22.66, abs=1e-12)
    assert kidney["ddcq"] == pytest.approx(4.365 - 6.86, abs=1e-12)  # -2.50
    assert round(kidney["relative_quantity"], 1) == 5.6
    assert brain["relative_quantity"] == pytest.approx(1.0)
    # printed SDs of the technical replicates (0.15/0.09, 0.06/0.08)
    reps = {(r["sample"], r["target"]): r for r in res["replicates"]}
    assert round(reps[("Brain", "c-myc")]["sd_cq"], 2) == 0.15
    assert round(reps[("Brain", "GAPDH")]["sd_cq"], 2) == 0.09
    assert round(reps[("Kidney", "c-myc")]["sd_cq"], 2) == 0.06
    assert round(reps[("Kidney", "GAPDH")]["sd_cq"], 2) == 0.08
    # Livak's range: 2^-(ddCT -/+ s), s = sqrt(s_target^2 + s_ref^2)
    s = math.hypot(reps[("Kidney", "c-myc")]["sd_cq"],
                   reps[("Kidney", "GAPDH")]["sd_cq"])
    assert round(s, 2) == 0.10
    lo, hi = 2 ** -(kidney["ddcq"] + s), 2 ** -(kidney["ddcq"] - s)
    assert (round(lo, 1), round(hi, 1)) == (5.3, 6.0)
    # one sample per group: no test, said so
    st = res["per_target"][0]
    assert st["statistics"] is None and st["statistics_note"]


# Table 2 (same well): per-well dCT, printed kidney average 4.47 +/- 0.14
T2 = {
    "Brain": [(32.38, 25.07), (32.08, 25.29), (32.35, 25.32), (32.08, 25.24),
              (32.34, 25.17), (32.13, 25.29)],
    "Kidney": [(28.73, 24.30), (28.84, 24.32), (28.51, 24.31), (28.86, 24.25),
               (28.86, 24.34), (28.70, 24.18)],
}


def test_livak_table2_per_well_dct():
    recs = []
    for tissue, wells in T2.items():
        for k, (myc, gapdh) in enumerate(wells):
            s = f"{tissue}{k}"
            recs += [{"sample": s, "group": tissue, "target": "c-myc",
                      "cq": myc},
                     {"sample": s, "group": tissue, "target": "GAPDH",
                      "cq": gapdh}]
    res = q.qpcr_analysis(recs, reference_genes="GAPDH", calibrator="Brain")
    groups = {g["group"]: g for g in res["per_target"][0]["groups"]}
    assert round(groups["Kidney"]["mean_dcq"], 2) == 4.47
    assert round(groups["Kidney"]["sd_dcq"], 2) == 0.14
    # The paper prints a brain average of 6.93 +/- 0.16, but its six
    # printed per-well dCT values (7.31, 6.79, 7.03, 6.84, 7.17, 6.84)
    # average 7.00 +/- 0.21; the engine reproduces the rows.
    rows = [7.31, 6.79, 7.03, 6.84, 7.17, 6.84]
    assert groups["Brain"]["mean_dcq"] == pytest.approx(np.mean(rows))
    assert groups["Brain"]["sd_dcq"] == pytest.approx(np.std(rows, ddof=1))
    # statistics on dCq: unpaired t test, fold change CI from its CI
    stat = res["per_target"][0]["statistics"]
    kid = [m - g for m, g in T2["Kidney"]]
    ref = ttests.unpaired_t(kid, rows)
    assert stat["p_two_tailed"] == pytest.approx(ref["p_two_tailed"])
    comp = stat["comparisons"][0]
    assert comp["fold_change"] == pytest.approx(2 ** -ref["difference"])
    lo, hi = ref["ci_difference"]
    assert comp["fold_change_ci"] == pytest.approx([2 ** -hi, 2 ** -lo])


def test_efficiency_from_dilution_series():
    qty = [1e5, 1e4, 1e3, 1e2, 1e1]
    slope, icpt = -3.45, 38.0
    cqs = [icpt + slope * math.log10(v) for v in qty]
    cqs = [c + d for c, d in zip(cqs, [0.05, -0.04, 0.02, -0.06, 0.03])]
    res = q.efficiency_from_dilution(qty, cqs)
    s = np.polyfit(np.log10(qty), cqs, 1)[0]
    assert res["slope"] == pytest.approx(s, rel=1e-12)
    assert res["efficiency"] == pytest.approx(10 ** (-1 / s), rel=1e-12)
    assert res["efficiency_pct"] == pytest.approx(100 * (10 ** (-1 / s) - 1))
    lo, hi = res["slope_ci"]
    assert res["efficiency_ci"] == pytest.approx([10 ** (-1 / lo),
                                                  10 ** (-1 / hi)])
    assert q.efficiency_factor(95) == pytest.approx(1.95)
    assert q.efficiency_factor(1.9) == 1.9


def test_efficiency_weighted_two_reference_genes_equals_qbase_nrq():
    E = {"T": 1.90, "R1": 2.00, "R2": 1.95}
    cq = {  # sample: (group, T, R1, R2)
        "c1": ("ctrl", 25.0, 18.0, 20.0), "c2": ("ctrl", 25.6, 18.3, 20.1),
        "c3": ("ctrl", 24.7, 17.8, 19.9),
        "t1": ("trt", 23.1, 18.1, 20.2), "t2": ("trt", 22.8, 17.9, 19.8),
        "t3": ("trt", 23.5, 18.4, 20.4),
    }
    recs = [{"sample": s, "group": g, "target": t, "cq": v}
            for s, (g, ct, r1, r2) in cq.items()
            for t, v in (("T", ct), ("R1", r1), ("R2", r2))]
    res = q.qpcr_analysis(recs, reference_genes=["R1", "R2"],
                          calibrator="ctrl", efficiencies=E)
    # qBase: RQ = E^(min Cq - Cq) per gene, NRQ = RQ_T / geomean(RQ_refs),
    # fold vs calibrator = NRQ / geomean(NRQ of calibrator samples)
    def rq(gene, s):
        idx = {"T": 1, "R1": 2, "R2": 3}[gene]
        base = min(v[idx] for v in cq.values())
        return E[gene] ** (base - cq[s][idx])
    nrq = {s: rq("T", s) / math.sqrt(rq("R1", s) * rq("R2", s)) for s in cq}
    cal = math.exp(np.mean([math.log(nrq[s]) for s in ("c1", "c2", "c3")]))
    rows = {r["sample"]: r for r in res["results"]}
    for s in cq:
        assert rows[s]["relative_quantity"] == pytest.approx(nrq[s] / cal,
                                                             rel=1e-12)
    trt = [g for g in res["per_target"][0]["groups"] if g["group"] == "trt"]
    gm = math.exp(np.mean([math.log(nrq[s] / cal) for s in ("t1", "t2", "t3")]))
    assert trt[0]["fold_change"] == pytest.approx(gm, rel=1e-12)


def test_replicate_flags_and_undetermined():
    recs = [
        {"sample": "a", "group": "g", "target": "T", "cq": 30.0},
        {"sample": "a", "group": "g", "target": "T", "cq": 30.9},
        {"sample": "a", "group": "g", "target": "T", "cq": "Undetermined"},
        {"sample": "a", "group": "g", "target": "R", "cq": 36.2},
        {"sample": "a", "group": "g", "target": "R", "cq": 36.0},
        {"sample": "b", "group": "g", "target": "T", "cq": None},
        {"sample": "b", "group": "g", "target": "R", "cq": 20.0},
    ]
    reps, _ = q.average_replicates(recs)
    by = {(r["sample"], r["target"]): r for r in reps}
    assert set(by[("a", "T")]["flags"]) == {"undetermined", "replicate_spread"}
    assert by[("a", "T")]["mean_cq"] == pytest.approx(30.45)
    assert "high_cq" in by[("a", "R")]["flags"]
    assert by[("b", "T")]["flags"] == ["all_undetermined"]
    assert by[("b", "T")]["mean_cq"] is None
    assert "single_replicate" in by[("b", "R")]["flags"]
    sub, _ = q.average_replicates(recs, undetermined_value=40)
    sb = {(r["sample"], r["target"]): r for r in sub}
    assert sb[("b", "T")]["mean_cq"] == 40.0


def _three_groups(paired=False):
    rng = np.random.default_rng(2)
    recs = []
    for g, shift in (("veh", 0.0), ("lo", -1.0), ("hi", -2.5)):
        for k in range(4):
            s = f"{g}{k}"
            animal = 0.4 * k
            for _ in range(2):
                rec = {"sample": s, "group": g}
                if paired:
                    rec["pair"] = f"m{k}"
                recs.append(dict(rec, target="ACTB",
                                 cq=18 + animal + rng.normal(0, 0.05)))
                recs.append(dict(rec, target="IL6",
                                 cq=29 + shift + animal + rng.normal(0, 0.05)))
    return recs


def test_three_groups_dunnett_vs_calibrator():
    res = q.qpcr_analysis(_three_groups(), reference_genes=["ACTB"],
                          calibrator="veh")
    st = res["per_target"][0]["statistics"]
    assert st["test"] == "one_way_anova"
    rows = {r["sample"]: r["dcq"] for r in res["results"]}
    cols = [[rows[f"{g}{k}"] for k in range(4)] for g in ("veh", "lo", "hi")]
    ref = anova.one_way_anova(cols)
    assert st["table"]["F"] == pytest.approx(ref["table"]["F"])
    folds = {c["group"]: c["fold_vs_calibrator"] for c in st["comparisons"]}
    assert set(folds) == {"lo", "hi"}
    assert folds["hi"] > folds["lo"] > 1.0
    hi = [c for c in st["comparisons"] if c["group"] == "hi"][0]
    assert hi["fold_vs_calibrator"] == pytest.approx(
        2 ** -(np.mean(cols[2]) - np.mean(cols[0])))
    assert hi["fold_vs_calibrator_ci"][0] < hi["fold_vs_calibrator"] < \
        hi["fold_vs_calibrator_ci"][1]


def test_paired_two_groups_and_api():
    recs = [r for r in _three_groups(paired=True) if r["group"] != "lo"]
    res = api.analyze({"analysis": "qpcr", "data": {"records": recs},
                       "options": {"reference_genes": ["ACTB"],
                                   "calibrator": "veh"}})
    assert "error" not in res, res.get("error")
    st = res["per_target"][0]["statistics"]
    assert st["test"] == "paired_t"
    rows = {r["sample"]: r["dcq"] for r in res["results"]}
    ref = ttests.paired_t([rows[f"hi{k}"] for k in range(4)],
                          [rows[f"veh{k}"] for k in range(4)])
    assert st["p_two_tailed"] == pytest.approx(ref["p_two_tailed"])
    g = res["per_target"][0]["graph"]
    assert g["y_axis"] == "log2" and g["reference_line"] == 1.0
    assert len(g["points"]) == 8
