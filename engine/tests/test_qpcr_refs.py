"""Reference-gene validation for qPCR (qpcr_refs).

geNorm M (Vandesompele et al. 2002) and the comparative delta-Cq pairs
(Silver et al. 2006) are pinned to hand calculations on constructed data;
the group tests are pinned to scipy.stats.f_oneway / kruskal.
"""

import json
import math

import numpy as np
import pytest
from scipy import stats

from opendose import qpcr_refs as qr


def _cq(table):
    """{gene: [Cq per sample]} -> {sample: {gene: Cq}} with samples S1..Sn."""
    n = len(next(iter(table.values())))
    return {f"S{i + 1}": {g: v[i] for g, v in table.items()} for i in range(n)}


def _gene(res, name):
    return next(g for g in res["genes"] if g["gene"] == name)


# (a) two references --------------------------------------------------------
def test_two_references_m_equals_sd_of_cq_difference():
    a = [18.2, 18.9, 17.6, 18.4]
    b = [22.1, 23.3, 21.2, 22.0]
    cq = _cq({"A": a, "B": b})
    res = qr.reference_stability(cq, {s: "G" for s in cq}, ["A", "B"])
    # differences B - A: 3.9, 4.4, 3.6, 3.6; mean 3.875;
    # squared deviations .000625 + .275625 + .075625 + .075625 = .4275;
    # var = .4275/3 = .1425; SD = sqrt(.1425) = 0.37749172
    assert np.std(np.subtract(b, a), ddof=1) == pytest.approx(
        math.sqrt(0.1425), abs=1e-12)
    for g in ("A", "B"):
        assert round(_gene(res, g)["M"], 6) == 0.377492
    pair = res["pairs"][0]
    assert (pair["gene_a"], pair["gene_b"], pair["n"]) == ("A", "B", 4)
    assert pair["mean_dcq"] == pytest.approx(-3.875, abs=1e-12)  # A - B
    assert pair["V"] == pytest.approx(math.sqrt(0.1425), abs=1e-12)
    assert pair["sd_dcq"] == pytest.approx(pair["V"], abs=1e-12)
    assert any("M of both equals V" in n for n in res["notes"])
    assert res["most_stable"] == ["A", "B"]
    assert res["genorm_steps"] == [{"n_genes": 2, "genes": ["A", "B"],
                                    "M": {"A": _gene(res, "A")["M"],
                                          "B": _gene(res, "B")["M"]},
                                    "removed": None}]
    assert not res["any_unstable"]
    json.dumps(res, allow_nan=False)        # plain floats, JSON-safe


# (b) three references with hand-computed M ----------------------------------
def test_three_references_hand_m():
    # E = 2, so A_jk = log2Q_j - log2Q_k = Cq_k - Cq_j.
    # A_AB = 5, 6, 7        -> SD 1
    # A_AC = 10, 10, 12     -> mean 32/3, devs -2/3,-2/3,4/3, SS 24/9,
    #                          var 4/3, SD 2/sqrt(3) = 1.1547005
    # A_BC = 5, 4, 5        -> mean 14/3, devs 1/3,-2/3,1/3, SS 6/9,
    #                          var 1/3, SD 1/sqrt(3) = 0.5773503
    # M_A = (1 + 2/sqrt3)/2 = 1.0773503
    # M_B = (1 + 1/sqrt3)/2 = 0.7886751
    # M_C = (2/sqrt3 + 1/sqrt3)/2 = sqrt(3)/2 = 0.8660254
    cq = _cq({"A": [20, 20, 20], "B": [25, 26, 27], "C": [30, 30, 32]})
    res = qr.reference_stability(cq, {s: "G" for s in cq}, ["A", "B", "C"])
    r3 = math.sqrt(3)
    assert _gene(res, "A")["M"] == pytest.approx((1 + 2 / r3) / 2, abs=1e-12)
    assert _gene(res, "B")["M"] == pytest.approx((1 + 1 / r3) / 2, abs=1e-12)
    assert _gene(res, "C")["M"] == pytest.approx(r3 / 2, abs=1e-12)
    v = {(p["gene_a"], p["gene_b"]): p["V"] for p in res["pairs"]}
    assert v[("A", "B")] == pytest.approx(1.0, abs=1e-12)
    assert v[("A", "C")] == pytest.approx(2 / r3, abs=1e-12)
    assert v[("B", "C")] == pytest.approx(1 / r3, abs=1e-12)
    # stepwise: A (highest M) leaves; then B, C with M = V_BC
    steps = res["genorm_steps"]
    assert [s["removed"] for s in steps] == ["A", None]
    assert steps[1]["M"]["B"] == pytest.approx(1 / r3, abs=1e-12)
    assert steps[1]["M"]["C"] == pytest.approx(1 / r3, abs=1e-12)
    assert res["ranking"] == ["A", "B", "C"]
    assert res["most_stable"] == ["B", "C"]


# (c) efficiency weighting ---------------------------------------------------
def test_efficiency_weighting_changes_a_jk():
    a = [20.0, 21.5, 19.2, 22.3, 20.8]
    b = [24.0, 25.1, 23.9, 26.0, 24.2]
    cq = _cq({"A": a, "B": b})
    grp = {s: "G" for s in cq}
    plain = qr.reference_stability(cq, grp, ["A", "B"])
    res = qr.reference_stability(cq, grp, ["A", "B"],
                                 efficiencies={"A": 90, "B": 2.0})
    assert _gene(res, "A")["efficiency"] == pytest.approx(1.9)
    # A_AB = log2 Q_A - log2 Q_B = -log2(1.9)*Cq_A + log2(2)*Cq_B
    ajk = -math.log2(1.9) * np.array(a) + np.array(b)
    v = float(np.std(ajk, ddof=1))
    assert _gene(res, "A")["M"] == pytest.approx(v, abs=1e-12)
    assert res["pairs"][0]["V"] == pytest.approx(v, abs=1e-12)
    assert res["pairs"][0]["mean_dcq"] == pytest.approx(
        float(np.mean(math.log2(1.9) * np.array(a) - np.array(b))), abs=1e-12)
    unweighted = float(np.std(np.subtract(b, a), ddof=1))
    assert _gene(plain, "A")["M"] == pytest.approx(unweighted, abs=1e-12)
    assert abs(v - unweighted) > 0.05


# (d) shift with treatment, ANOVA ---------------------------------------------
CTRL = ["c1", "c2", "c3", "c4"]
DRUG = ["d1", "d2", "d3", "d4"]
SHIFT = {
    "GAPDH": ([20.0, 20.1, 19.9, 20.05], [22.0, 21.9, 22.1, 22.05]),
    "ACTB": ([18.0, 18.3, 17.8, 18.1], [18.1, 17.9, 18.2, 18.0]),
    "B2M": ([21.0, 21.02, 20.98, 21.01], [21.5, 21.52, 21.48, 21.51]),
}


def _shift_data():
    cq, groups = {}, {}
    for i, s in enumerate(CTRL):
        cq[s] = {g: v[0][i] for g, v in SHIFT.items()}
        groups[s] = "Control"
    for i, s in enumerate(DRUG):
        cq[s] = {g: v[1][i] for g, v in SHIFT.items()}
        groups[s] = "Drug"
    return cq, groups


def test_shift_flag_anova():
    cq, groups = _shift_data()
    res = qr.reference_stability(cq, groups, ["GAPDH", "ACTB", "B2M"],
                                 calibrator="Control")
    g = _gene(res, "GAPDH")
    f, p = stats.f_oneway(*SHIFT["GAPDH"])
    assert g["group_test"]["statistic"] == pytest.approx(f, rel=1e-10)
    assert g["group_test"]["p"] == pytest.approx(p, rel=1e-10)
    assert (g["group_test"]["dfn"], g["group_test"]["dfd"]) == (1, 6)
    assert "t test" in g["group_test"]["note"]
    assert g["shift"] == pytest.approx(22.0125 - 20.0125, abs=1e-12)
    assert g["shift_between"] == ["Control", "Drug"]
    assert g["shifts_with_treatment"] is True
    assert "shifts_with_treatment" in g["flags"]
    svc = {r["group"]: r["shift"] for r in g["shift_vs_calibrator"]}
    assert svc["Control"] == 0.0
    assert svc["Drug"] == pytest.approx(2.0, abs=1e-12)
    # equals the unpaired t test
    t = stats.ttest_ind(*SHIFT["GAPDH"])
    assert g["group_test"]["p"] == pytest.approx(t.pvalue, rel=1e-9)

    a = _gene(res, "ACTB")
    assert a["group_test"]["p"] > 0.05
    assert a["shifts_with_treatment"] is False

    b = _gene(res, "B2M")
    assert b["group_test"]["p"] < 0.05
    assert b["group_test"]["p"] == pytest.approx(
        stats.f_oneway(*SHIFT["B2M"]).pvalue, rel=1e-10)
    assert b["shift"] == pytest.approx(0.5, abs=1e-12)
    assert b["shifts_with_treatment"] is False        # below 1 cycle
    assert "small_significant_shift" in b["flags"]

    assert res["any_shift"] is True
    assert res["summary"].startswith("GAPDH shifts with treatment (P ")
    assert "2.0 cycles between Control and Drug" in res["summary"]
    assert "bias fold changes" in res["summary"]
    assert res["thresholds"] == {"m": 1.5, "shift_cq": 1.0, "alpha": 0.05}
    json.dumps(res, allow_nan=False)


# (e) Kruskal-Wallis option --------------------------------------------------
def test_kruskal_matches_scipy():
    cq, groups = _shift_data()
    res = qr.reference_stability(cq, groups, ["GAPDH", "ACTB"],
                                 test="kruskal")
    for gene in ("GAPDH", "ACTB"):
        h, p = stats.kruskal(*SHIFT[gene])
        gt = _gene(res, gene)["group_test"]
        assert gt["test"] == "Kruskal-Wallis"
        assert gt["statistic"] == pytest.approx(h, rel=1e-12)
        assert gt["p"] == pytest.approx(p, rel=1e-12)
        assert gt["df"] == 1
    # three groups
    vals = {"X": [20.1, 20.4, 19.8], "Y": [20.9, 21.3, 21.0, 20.7],
            "Z": [19.5, 19.9, 19.7]}
    cq3, g3 = {}, {}
    for grp, vs in vals.items():
        for i, v in enumerate(vs):
            cq3[f"{grp}{i}"] = {"R": v}
            g3[f"{grp}{i}"] = grp
    res3 = qr.reference_stability(cq3, g3, ["R"], test="kruskal")
    h, p = stats.kruskal(*vals.values())
    gt = res3["genes"][0]["group_test"]
    assert gt["statistic"] == pytest.approx(h, rel=1e-12)
    assert gt["p"] == pytest.approx(p, rel=1e-12)
    assert gt["df"] == 2
    res3a = qr.reference_stability(cq3, g3, ["R"])
    assert res3a["genes"][0]["group_test"]["p"] == pytest.approx(
        stats.f_oneway(*vals.values()).pvalue, rel=1e-10)


# (f) unstable flag ---------------------------------------------------------
def test_unstable_above_threshold():
    # B - A = 0, 3, 1, 5: mean 2.25, SS 14.75, var 4.9167, SD 2.2174 > 1.5
    cq = _cq({"A": [20, 20, 20, 20], "B": [20, 23, 21, 25]})
    res = qr.reference_stability(cq, {s: "G" for s in cq}, ["A", "B"])
    m = math.sqrt(14.75 / 3)
    for g in ("A", "B"):
        assert _gene(res, g)["M"] == pytest.approx(m, abs=1e-12)
        assert _gene(res, g)["unstable"] is True
        assert "unstable" in _gene(res, g)["flags"]
    assert res["any_unstable"] is True
    assert "not stable (geNorm M = 2.22 > 1.5)" in res["summary"]
    res2 = qr.reference_stability(cq, {s: "G" for s in cq}, ["A", "B"],
                                  m_threshold=2.5)
    assert res2["any_unstable"] is False


# (g) dropped samples ---------------------------------------------------------
def test_dropped_samples_are_listed():
    cq = {"S1": {"A": 20.0, "B": 24.0}, "S2": {"A": 20.5, "B": 24.7},
          "S3": {"A": 19.8, "B": None}, "S4": {"A": 20.2, "B": 24.1},
          "S5": {"A": 20.1, "B": "Undetermined"}}
    res = qr.reference_stability(cq, {s: "G" for s in cq}, ["A", "B"])
    assert res["samples_dropped"] == ["S3", "S5"]
    assert res["n_samples_complete"] == 3
    assert any("S3, S5" in w for w in res["warnings"])
    assert _gene(res, "A")["n"] == 5          # group tests use every Cq
    assert _gene(res, "B")["n"] == 3
    d = np.array([4.0, 4.2, 3.9])
    assert _gene(res, "A")["M"] == pytest.approx(np.std(d, ddof=1), abs=1e-12)


# (h) one reference -----------------------------------------------------------
def test_one_reference_m_none():
    cq, groups = _shift_data()
    res = qr.reference_stability(cq, groups, ["ACTB"])
    g = res["genes"][0]
    assert g["M"] is None and g["unstable"] is False
    assert any("at least 2 reference genes" in w for w in res["warnings"])
    assert g["group_test"]["p"] == pytest.approx(
        stats.f_oneway(*SHIFT["ACTB"]).pvalue, rel=1e-10)
    assert res["pairs"] == [] and res["genorm_steps"] == []
    assert res["ranking"] is None and res["most_stable"] is None
    assert "ACTB does not shift with treatment" in res["summary"]


def test_one_group_with_two_values_has_no_test():
    cq = {"a1": {"R": 20.0}, "a2": {"R": 20.4}, "b1": {"R": 22.0}}
    res = qr.reference_stability(cq, {"a1": "A", "a2": "A", "b1": "B"}, "R")
    g = res["genes"][0]
    assert g["group_test"]["p"] is None
    assert "fewer than 2 groups" in g["group_test"]["note"]
    assert g["shifts_with_treatment"] is False
    assert "not_tested" in g["flags"]


# (i) from records ------------------------------------------------------------
def test_from_records_averages_replicates():
    recs = []
    data = {("c1", "Control"): {"A": [20.0, 20.2, 20.1], "B": [24.0, 24.1, 24.2]},
            ("c2", "Control"): {"A": [20.4, 20.6, 20.5], "B": [24.3, 24.5, 24.4]},
            ("d1", "Drug"): {"A": [20.3, 20.1, 20.2], "B": [24.0, 24.8, 24.3]},
            ("d2", "Drug"): {"A": [19.9, 20.0, 20.1], "B": [24.1, 24.2, 24.0]}}
    for (s, grp), genes in data.items():
        for gene, cts in genes.items():
            for i, c in enumerate(cts):
                recs.append({"sample": s, "group": grp, "target": gene,
                             "cq": c, "well": f"{s}{gene}{i}"})
        recs.append({"sample": s, "group": grp, "target": "MYC", "cq": 30.0})
    res = qr.reference_stability_from_records(recs, ["A", "B"])
    means = {s: {g: float(np.mean(v)) for g, v in genes.items()}
             for (s, _), genes in data.items()}
    gm = {r["group"]: r for r in _gene(res, "A")["group_means"]}
    assert gm["Control"]["mean_cq"] == pytest.approx(
        (means["c1"]["A"] + means["c2"]["A"]) / 2, abs=1e-12)
    assert gm["Drug"]["n"] == 2
    d = [means[s]["A"] - means[s]["B"] for s in ("c1", "c2", "d1", "d2")]
    assert _gene(res, "A")["M"] == pytest.approx(np.std(d, ddof=1),
                                                 abs=1e-12)
    assert res["replicates_flagged"] == 1          # d1/B spread 0.8
    assert res["reference_genes"] == ["A", "B"]
    with pytest.raises(ValueError, match="not in the data: GAPDH"):
        qr.reference_stability_from_records(recs, ["A", "GAPDH"])


# (j) geNorm elimination order -------------------------------------------------
SAMPLE = [0.0, 1.3, -0.7, 2.1, 0.4, -1.2]
NOISE = {"R1": [0.05, -0.05, 0.02, -0.02, 0.04, -0.04],
         "R2": [0.10, -0.12, 0.08, -0.10, 0.15, -0.11],
         "R3": [0.40, -0.50, 0.30, -0.35, 0.45, -0.30],
         "R4": [1.20, -1.00, 0.90, -1.40, 1.10, -0.80]}
BASE = {"R1": 18.0, "R2": 21.0, "R3": 24.0, "R4": 27.0}


def _ref_m(table, genes):
    """Independent geNorm M (loops, explicit A_jk)."""
    out = {}
    for j in genes:
        vs = []
        for k in genes:
            if k == j:
                continue
            ajk = [-table[j][i] + table[k][i] for i in range(len(SAMPLE))]
            vs.append(float(np.std(ajk, ddof=1)))
        out[j] = sum(vs) / len(vs)
    return out


def test_genorm_elimination_order():
    table = {g: [BASE[g] + s + e for s, e in zip(SAMPLE, NOISE[g])]
             for g in NOISE}
    # listed in shuffled order so the order is not an artefact of input
    refs = ["R3", "R1", "R4", "R2"]
    res = qr.reference_stability(_cq(table), {f"S{i + 1}": "G"
                                              for i in range(6)}, refs)
    steps = res["genorm_steps"]
    assert [s["n_genes"] for s in steps] == [4, 3, 2]
    assert [s["removed"] for s in steps] == ["R4", "R3", None]
    assert res["ranking"] == ["R4", "R3", "R1", "R2"]
    assert set(res["most_stable"]) == {"R1", "R2"}
    for s in steps:
        ref = _ref_m(table, s["genes"])
        for g in s["genes"]:
            assert s["M"][g] == pytest.approx(ref[g], abs=1e-12)
    # M in the gene rows is the full-set M
    for g in refs:
        assert _gene(res, g)["M"] == pytest.approx(steps[0]["M"][g],
                                                   abs=1e-15)


def test_bad_input():
    with pytest.raises(ValueError):
        qr.reference_stability({"S1": {"A": 20}}, {"S1": "G"}, [])
    with pytest.raises(ValueError, match="unknown test"):
        qr.reference_stability({"S1": {"A": 20}}, {"S1": "G"}, ["A"],
                               test="welch")
    with pytest.raises(ValueError, match="without any Cq"):
        qr.reference_stability({"S1": {"A": 20}}, {"S1": "G"}, ["A", "B"])
    with pytest.raises(ValueError, match="calibrator"):
        qr.reference_stability({"S1": {"A": 20}}, {"S1": "G"}, ["A"],
                               calibrator="X")
