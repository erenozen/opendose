"""Independent reference for relative potency from parallel curves
(FEATURE-PLAN P-100).

R (drc::drm, EDcomp, compParm) is not installed, so drc's computations on
its S.alba data (engine/tests/fixtures/s_alba.json; Christensen, Teicher &
Streibig 2003) are redone here with scipy, in drc's own LL.4
parameterisation f(x) = c + (d - c) / (1 + exp(b (ln x - ln e))) (e is
the ED50 itself, not its log; not opendose's code or its log10
parameterisation), every model one regression over the stacked data with
the herbicide as an indicator:

1. drc's printed example (common c and d, separate b and e) is refitted
   and compared with the printed estimates and residual SE (the
   published check of the fitting itself). drc's standard errors come
   from the observed information (the Hessian of the sum of squares);
   both that and the Gauss-Newton J'J covariance opendose uses are
   computed, to show the printed SEs are reproduced by the former.
2. The parallel model (common b, c, d; separate e) and the unrestricted
   model (everything separate), the extra-sum-of-squares F test for
   parallelism (Finney 1978, Statistical Method in Biological Assay, 3rd
   ed., ch. 3-4; USP <1034>), with F and P by hand.
3. The relative potency rho = e_Bentazone / e_Glyphosate from the
   parallel model, as drc's EDcomp(m, c(50, 50)) reports it (the ratio
   of the two ED50s): the delta-method SE (EDcomp's default interval)
   and Fieller's interval (EDcomp(..., interval = "fieller"); Fieller
   1954, J R Stat Soc B 16:175), here as the roots of the quadratic
   (e_G^2 - t^2 v_GG) rho^2 - 2 (e_B e_G - t^2 v_BG) rho + (e_B^2 - t^2
   v_BB) = 0 with the covariance of the two ED50s, t = t(0.975, df).
   With J'J covariance (as opendose); the observed-information values
   are written too, for comparison with drc output.
4. Equivalence of the other parameters (USP <1032>/<1034>; Hauck WW et
   al. 2005, "Assessing parallelism prior to determining relative
   potency", PDA J Pharm Sci Technol 59:127-137): from the unrestricted
   model (one residual variance), the 90% CIs of the differences of the
   upper and lower limits (Glyphosate - Bentazone) and Fieller's 90% CI
   of the slope ratio b_G / b_B.

No published EDcomp or compParm output exists for S.alba (the drc help
pages print only the fit of step 1), so steps 2-4 are this script's.

Run: /home/eren/opendose/.venv/bin/python engine/tests/reference/relative_potency.py
writes relative_potency.json next to this file.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from scipy import optimize, stats

HERE = Path(__file__).resolve().parent
DATA = json.loads((HERE.parent / "fixtures" / "s_alba.json").read_text())
B = DATA["Bentazone"]
G = DATA["Glyphosate"]
x = np.array(B["dose"] + G["dose"], float)
y = np.array(B["drymatter"] + G["drymatter"], float)
is_g = np.array([0] * len(B["dose"]) + [1] * len(G["dose"]))
N = x.size


def ll4(xv, b, c, d, e):
    with np.errstate(divide="ignore"):
        t = np.where(xv > 0, np.exp(b * (np.log(np.where(xv > 0, xv, 1.0)) - np.log(e))), 0.0)
    return c + (d - c) / (1 + t)


# each model: (names, unpack theta -> per-row b, c, d, e)
MODELS = {
    "common_cd": (["b_B", "b_G", "c", "d", "e_B", "e_G"],
                  lambda t: (np.where(is_g, t[1], t[0]), t[2], t[3],
                             np.where(is_g, t[5], t[4]))),
    "parallel": (["b", "c", "d", "e_B", "e_G"],
                 lambda t: (t[0], t[1], t[2], np.where(is_g, t[4], t[3]))),
    "separate": (["b_B", "b_G", "c_B", "c_G", "d_B", "d_G", "e_B", "e_G"],
                 lambda t: (np.where(is_g, t[1], t[0]), np.where(is_g, t[3], t[2]),
                            np.where(is_g, t[5], t[4]), np.where(is_g, t[7], t[6]))),
}
STARTS = {
    "common_cd": [4.0, 2.0, 0.7, 3.9, 30.0, 60.0],
    "parallel": [3.0, 0.7, 3.9, 30.0, 60.0],
    "separate": [4.0, 2.0, 0.7, 0.8, 3.9, 3.9, 30.0, 60.0],
}


def resid(t, model):
    _, unpack = MODELS[model]
    return y - ll4(x, *unpack(t))


def jac(t, model, h=1e-7):
    f0 = resid(t, model)
    J = np.empty((N, len(t)))
    for j in range(len(t)):
        step = h * max(1.0, abs(t[j]))
        tp, tm = np.array(t, float), np.array(t, float)
        tp[j] += step
        tm[j] -= step
        J[:, j] = -(resid(tp, model) - resid(tm, model)) / (2 * step)
    return J, f0


def hessian_ss(t, model, h=1e-4):
    """Observed Hessian of SS(theta) by central differences."""
    k = len(t)
    H = np.empty((k, k))

    def ss(tt):
        r = resid(tt, model)
        return float(r @ r)
    for i in range(k):
        for j in range(k):
            si, sj = h * max(1.0, abs(t[i])), h * max(1.0, abs(t[j]))
            tpp, tpm, tmp, tmm = (np.array(t, float) for _ in range(4))
            tpp[i] += si; tpp[j] += sj
            tpm[i] += si; tpm[j] -= sj
            tmp[i] -= si; tmp[j] += sj
            tmm[i] -= si; tmm[j] -= sj
            H[i, j] = (ss(tpp) - ss(tpm) - ss(tmp) + ss(tmm)) / (4 * si * sj)
    return H


def fit(model):
    names, _ = MODELS[model]
    r = optimize.least_squares(resid, STARTS[model], args=(model,), method="lm",
                               xtol=1e-15, ftol=1e-15, gtol=1e-15, max_nfev=100000)
    t = r.x
    J, f = jac(t, model)
    ss = float(f @ f)
    df = N - len(t)
    s2 = ss / df
    cov_jtj = s2 * np.linalg.inv(J.T @ J)
    cov_obs = s2 * np.linalg.inv(0.5 * hessian_ss(t, model))
    return {"names": names, "theta": t.tolist(), "ss": ss, "df": df,
            "sigma": math.sqrt(s2), "cov_jtj": cov_jtj.tolist(),
            "cov_observed": cov_obs.tolist(),
            "se_jtj": np.sqrt(np.diag(cov_jtj)).tolist(),
            "se_observed": np.sqrt(np.diag(cov_obs)).tolist()}


def ratio_block(par, cov_key, level=0.95):
    names = par["names"]
    iB, iG = names.index("e_B"), names.index("e_G")
    eB, eG = par["theta"][iB], par["theta"][iG]
    V = np.asarray(par[cov_key])
    vBB, vGG, vBG = V[iB, iB], V[iG, iG], V[iB, iG]
    rho = eB / eG
    se_delta = rho * math.sqrt(vBB / eB ** 2 + vGG / eG ** 2 - 2 * vBG / (eB * eG))
    t = float(stats.t.ppf((1 + level) / 2, par["df"]))
    A = eG ** 2 - t ** 2 * vGG
    Bq = -2 * (eB * eG - t ** 2 * vBG)
    C = eB ** 2 - t ** 2 * vBB
    roots = sorted(np.real(np.roots([A, Bq, C]))) if A > 0 else None
    ln_se = math.sqrt(vBB / eB ** 2 + vGG / eG ** 2 - 2 * vBG / (eB * eG))
    return {"ratio": rho, "se_delta": se_delta,
            "delta_ci": [rho - t * se_delta, rho + t * se_delta],
            "fieller_ci": [float(r) for r in roots] if roots is not None else None,
            "log_ci": [rho * math.exp(-t * ln_se), rho * math.exp(t * ln_se)],
            "t": t, "df": par["df"]}


def equivalence(sep, level=0.90):
    names = sep["names"]
    th = dict(zip(names, sep["theta"]))
    V = np.asarray(sep["cov_jtj"])
    idx = {n: i for i, n in enumerate(names)}
    t = float(stats.t.ppf((1 + level) / 2, sep["df"]))
    out = {}
    for lab, a, b in (("Top", "d_B", "d_G"), ("Bottom", "c_B", "c_G")):
        dv = th[b] - th[a]
        se = math.sqrt(V[idx[a], idx[a]] + V[idx[b], idx[b]] - 2 * V[idx[a], idx[b]])
        out[lab] = {"difference": dv, "se": se, "ci": [dv - t * se, dv + t * se]}
    bB, bG = th["b_B"], th["b_G"]
    vBB, vGG, vBG = V[idx["b_B"], idx["b_B"]], V[idx["b_G"], idx["b_G"]], V[idx["b_B"], idx["b_G"]]
    A = bB ** 2 - t ** 2 * vBB
    Bq = -2 * (bB * bG - t ** 2 * vBG)
    C = bG ** 2 - t ** 2 * vGG
    roots = sorted(np.real(np.roots([A, Bq, C]))) if A > 0 else None
    out["HillSlope"] = {"ratio": bG / bB,
                        "ci": [float(r) for r in roots] if roots is not None else None}
    out["t"] = t
    return out


def main():
    fits = {m: fit(m) for m in MODELS}
    par, sep = fits["parallel"], fits["separate"]
    dfn = par["df"] - sep["df"]
    F = ((par["ss"] - sep["ss"]) / dfn) / (sep["ss"] / sep["df"])
    out = {
        "fits": fits,
        "parallelism_f": {"F": F, "dfn": dfn, "dfd": sep["df"],
                          "p": float(stats.f.sf(F, dfn, sep["df"]))},
        "potency_jtj": ratio_block(par, "cov_jtj"),
        "potency_observed": ratio_block(par, "cov_observed"),
        "equivalence_90": equivalence(sep),
    }
    (HERE / "relative_potency.json").write_text(json.dumps(out, indent=1) + "\n")
    cd = fits["common_cd"]
    print("common c,d:", dict(zip(cd["names"], np.round(cd["theta"], 6))), "sigma", round(cd["sigma"], 6))
    print("  SE observed:", np.round(cd["se_observed"], 6), "SE J'J:", np.round(cd["se_jtj"], 6))
    print("parallel:", dict(zip(par["names"], np.round(par["theta"], 6))), par["ss"], par["df"])
    print("separate:", sep["ss"], sep["df"])
    print("F:", out["parallelism_f"])
    print("potency J'J:", out["potency_jtj"])
    print("potency observed:", out["potency_observed"])
    print("equivalence:", out["equivalence_90"])


if __name__ == "__main__":
    main()
