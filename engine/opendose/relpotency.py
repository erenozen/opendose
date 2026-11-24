"""Relative potency from parallel dose-response curves (FEATURE-PLAN P-100).

A test sample and a reference standard are fitted together twice
(equations.fit_global_model):

- the parallel (restricted) model: every parameter shared except the
  potency (logEC50, EC50, ...), so the two curves are horizontal shifts
  of one shape;
- the unrestricted model: every parameter separate (one curve per
  sample, one pooled residual variance).

Method sources:

- Parallel-line / parallel-curve assay and the relative potency as the
  horizontal shift between parallel curves: Finney DJ (1978), Statistical
  Method in Biological Assay, 3rd ed., Griffin, ch. 3-4; USP <1034>
  "Analysis of biological assays".
- Parallelism by the extra-sum-of-squares F test (restricted vs
  unrestricted; Finney 1978; Motulsky & Christopoulos 2004, Fitting
  Models to Biological Data, ch. 22) and, because an F test cannot show
  that curves ARE parallel (precise assays fail it on trivial
  differences, noisy ones pass it on large ones), by equivalence:
  USP <1032> "Design and development of biological assays" and <1034>;
  Hauck WW, Capen RC, Callahan JD et al. (2005), "Assessing parallelism
  prior to determining relative potency", PDA J Pharm Sci Technol
  59:127-137. Each non-potency parameter's difference (test minus
  reference; a ratio for a slope) gets a 90% CI from the unrestricted
  model (two one-sided tests at alpha = 0.05), and the curves are
  equivalent when every CI lies inside its margin. The margins must be
  set before the data are seen, from the reference standard's history.
- The potency ratio rho = EC50_reference / EC50_test (above 1: the test
  sample is more potent) from the parallel model, with Fieller's
  interval for a ratio of two correlated estimates (Fieller EC 1954, J R
  Stat Soc B 16:175; Finney 1978, sec. 2.5): with a = EC50_test, b =
  EC50_reference, variances v_aa, v_bb, covariance v_ab and g = t^2
  v_aa / a^2, the limits are [rho - g v_ab / v_aa +/- (t / |a|) sqrt(v_bb
  - 2 rho v_ab + rho^2 v_aa - g (v_bb - v_ab^2 / v_aa))] / (1 - g),
  unbounded when g >= 1. For a potency fitted as log10(EC50) the EC50
  covariance is the delta-method transform of the log covariance (exact
  for the Gauss-Newton covariance at the optimum). drc's EDcomp reports
  the same ratio (as e_1 / e_2) with a delta-method SE (also given here)
  or, with interval = "fieller", Fieller's interval.
"""

from __future__ import annotations

import math

from scipy import stats

from . import nlfit

SOURCE = ("Finney 1978, Statistical Method in Biological Assay, ch. 3-4; "
          "USP <1032> and <1034>; Hauck et al. 2005, PDA J Pharm Sci "
          "Technol 59:127-137; Fieller 1954, J R Stat Soc B 16:175")

POTENCY_PARAMS = ("LogXmid", "LogEC50", "LogIC50", "EC50", "IC50")


def potency_parameter(spec) -> str | None:
    """The parameter whose shift is the potency (None: no such one)."""
    for p in POTENCY_PARAMS:
        if p in spec.params:
            return p
    return None


def display_name(spec, name: str) -> str:
    if name == "LogXmid":
        return "LogIC50" if "IC50" in spec.equation else "LogEC50"
    return name


def check_model(spec) -> str:
    """The potency parameter of a model a parallel-curve assay can use,
    or ValueError saying why the model cannot."""
    if spec.global_only or spec.dataset_constants or spec.param_scope:
        raise ValueError(f"{spec.label} is a global model; relative potency "
                         "needs a model fitted to each curve (a 4PL, 3PL, ...)")
    p = potency_parameter(spec)
    if p is None:
        raise ValueError(f"{spec.label} has no EC50 or IC50 parameter, so it "
                         "has no potency to compare")
    return p


def fieller_cov(a, b, v_aa, v_bb, v_ab, t):
    """b / a with Fieller's limits for correlated estimates (module
    docstring); ci None when unbounded (g >= 1)."""
    if a == 0:
        return {"value": None, "ci": None, "g": None}
    q = b / a
    g = t * t * v_aa / (a * a)
    ci = None
    if g < 1:
        disc = v_bb - 2 * q * v_ab + q * q * v_aa - g * (v_bb - v_ab * v_ab / v_aa)
        if disc >= 0:
            half = (t / abs(a)) * math.sqrt(disc)
            centre = q - g * v_ab / v_aa
            ci = [float((centre - half) / (1 - g)), float((centre + half) / (1 - g))]
    return {"value": float(q), "ci": ci, "g": float(g)}


def _cov_lookup(res):
    """{(name, data-set index or None): row} and the matrix of a
    global_model_fit result (its "covariance" block)."""
    cov = res.get("covariance") or {}
    names = [d.get("name", "") for d in res["datasets"]]
    index = {}
    for k, p in enumerate(cov.get("parameters") or []):
        ds = p.get("dataset")
        index[(p["name"], None if ds is None else names.index(ds))] = k
    return index, cov.get("matrix") or []


def _entry(res, i, name):
    p = (res["datasets"][i]["params"] or {}).get(name)
    if p is None or p.get("se") is None:
        raise ValueError(f"{name} of {res['datasets'][i].get('name')} has no "
                         "standard error (held constant, or the fit is "
                         "ambiguous)")
    return float(p["value"]), float(p["se"])


def _wss(goodness):
    w = goodness.get("ss_res_weighted")
    return float(w if w is not None else goodness["ss_res"])


def analyse(spec, parallel, full, *, margins=None, ci_level=0.95,
            equivalence_level=0.90, alpha=0.05) -> dict:
    """parallel / full: global_model_fit results of the two data sets
    (index 0 = reference, 1 = test) with every parameter but the potency
    shared, and with none shared. margins: {param: {"lower", "upper"}}
    for the equivalence test (a difference test - reference, or a ratio
    test / reference for a slope)."""
    pot = potency_parameter(spec)
    names = [d.get("name", "") for d in parallel["datasets"]]
    gp, gf = parallel["goodness"], full["goodness"]
    if gp["n_points"] != gf["n_points"]:
        raise ValueError("the two fits used different points")
    warnings, notes = [], []

    # 1. parallelism: extra-sum-of-squares F test, restricted vs full
    ss_p, ss_f = _wss(gp), _wss(gf)
    df_p, df_f = int(gp["df"]), int(gf["df"])
    f_test = None
    if df_p > df_f:
        if ss_p < ss_f * (1 - 1e-9):
            warnings.append("The parallel model fits better than the separate "
                            "curves: a separate fit stopped short of its best; "
                            "the F test is set to F = 0")
        f_test = nlfit.compare_fits_f_test(max(ss_p, ss_f), df_p, ss_f, df_f)
        f_test.update({"ss_parallel": ss_p, "df_parallel": df_p,
                       "ss_separate": ss_f, "df_separate": df_f})
    else:
        notes.append("Only the potency is fitted, so the curves are parallel "
                     "by construction: there is no parallelism to test.")
    n = int(gp["n_points"])
    aicc = nlfit.compare_fits_aicc(ss_p, n - df_p, ss_f, n - df_f, n)

    # 2. potency ratio from the parallel fit
    idx, mat = _cov_lookup(parallel)
    lr, se_r = _entry(parallel, 0, pot)
    lt, se_t = _entry(parallel, 1, pot)
    kr, kt = idx[(pot, 0)], idx[(pot, 1)]
    v_rr, v_tt, v_rt = mat[kr][kr], mat[kt][kt], mat[kr][kt]
    tcrit = float(stats.t.ppf((1 + ci_level) / 2, df_p))
    log_scale = pot.startswith("Log")
    if log_scale:
        ec_r, ec_t = 10.0 ** lr, 10.0 ** lt
        ln10 = math.log(10.0)
        V_rr, V_tt = (ln10 * ec_r) ** 2 * v_rr, (ln10 * ec_t) ** 2 * v_tt
        V_rt = ln10 ** 2 * ec_r * ec_t * v_rt
        d = lr - lt
        se_d = math.sqrt(max(v_rr + v_tt - 2 * v_rt, 0.0))
    else:
        ec_r, ec_t = lr, lt
        V_rr, V_tt, V_rt = v_rr, v_tt, v_rt
        d = se_d = None
    fl = fieller_cov(ec_t, ec_r, V_tt, V_rr, V_rt, tcrit)
    rho = fl["value"]
    se_delta = None
    if rho is not None and ec_r and ec_t:
        var = V_rr / ec_r ** 2 + V_tt / ec_t ** 2 - 2 * V_rt / (ec_r * ec_t)
        se_delta = abs(rho) * math.sqrt(max(var, 0.0))
    if fl["ci"] is None:
        warnings.append("Fieller's interval for the potency ratio is unbounded: "
                        "the test sample's EC50 is not clearly different from "
                        "zero at this confidence level")
    shown = display_name(spec, pot)
    linear = shown[3:] if log_scale else shown
    potency = {
        "parameter": shown, "linear": linear,
        "reference": {"name": names[0], "value": lr, "se": se_r, "ec50": ec_r},
        "test": {"name": names[1], "value": lt, "se": se_t, "ec50": ec_t},
        "ratio": rho, "ci": fl["ci"], "g": fl["g"], "se_delta": se_delta,
        "df": df_p, "ci_level": ci_level,
        "method": "Fieller (correlated estimates, parallel model)",
    }
    if log_scale:
        potency["log_ratio"] = d
        potency["log_ratio_se"] = se_d
        potency["ci_log"] = [10.0 ** (d - tcrit * se_d), 10.0 ** (d + tcrit * se_d)]

    # 3. equivalence of the other parameters (unrestricted model)
    fidx, fmat = _cov_lookup(full)
    teq = float(stats.t.ppf((1 + equivalence_level) / 2, df_f))
    margins = margins or {}
    rows = []
    for name in spec.params:
        if name == pot or (name, 0) not in fidx or (name, 1) not in fidx:
            continue
        a, _ = _entry(full, 0, name)
        b, _ = _entry(full, 1, name)
        ka, kb = fidx[(name, 0)], fidx[(name, 1)]
        vaa, vbb, vab = fmat[ka][ka], fmat[kb][kb], fmat[ka][kb]
        slope = "slope" in name.lower()
        if slope:
            r = fieller_cov(a, b, vaa, vbb, vab, teq)
            row = {"name": display_name(spec, name), "kind": "ratio",
                   "estimate": r["value"], "ci": r["ci"]}
        else:
            se = math.sqrt(max(vaa + vbb - 2 * vab, 0.0))
            row = {"name": display_name(spec, name), "kind": "difference",
                   "estimate": b - a, "ci": [b - a - teq * se, b - a + teq * se]}
        m = margins.get(row["name"]) or margins.get(name)
        if m and m.get("lower") is not None and m.get("upper") is not None:
            lo, hi = float(m["lower"]), float(m["upper"])
            if not lo < hi:
                raise ValueError(f"the equivalence margin of {row['name']} needs "
                                 "a lower limit below its upper limit")
            if row["kind"] == "ratio" and lo <= 0:
                raise ValueError(f"the margin of the {row['name']} ratio must be "
                                 "above 0 (for example 0.8 to 1.25)")
            row["margin"] = [lo, hi]
            row["equivalent"] = (row["ci"] is not None
                                 and lo <= row["ci"][0] and row["ci"][1] <= hi)
        rows.append(row)
    # one margin missed is enough to say equivalence is not shown; all of
    # them met says it is only when every parameter has a margin
    judged = [r for r in rows if "margin" in r]
    if not judged:
        verdict = "not_set"
    elif not all(r["equivalent"] for r in judged):
        verdict = "not_shown"
    elif len(judged) < len(rows):
        verdict = "incomplete"
    else:
        verdict = "equivalent"
    equivalence = {"level": equivalence_level, "df": df_f, "parameters": rows,
                   "verdict": verdict}

    parallel_by_f = None if f_test is None else f_test["p"] >= alpha
    return {
        "parameter": shown, "reference": names[0], "test": names[1],
        "f_test": f_test, "aicc": aicc, "potency": potency,
        "equivalence": equivalence, "alpha": alpha,
        "parallel_by_f": parallel_by_f,
        "warnings": warnings, "notes": notes, "source": SOURCE,
    }
