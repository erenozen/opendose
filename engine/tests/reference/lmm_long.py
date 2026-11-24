"""Reference values for P-87 (general linear mixed model on a long table):
engine/tests/test_lmm.py, the e2e step and the ui-stage fixture.

R is not installed (lme4::lmer and lmerTest not available). The oracles:

1. statsmodels MixedLM (REML) for the fixed effects, their SEs, the
   variance components and the REML criterion (-2 * llf), with
   vc_formula for the nested second level;
2. published lme4 / lmerTest output for the same data:
   - sleepstudy, Reaction ~ Days + (1 | Subject): (Intercept) 251.4051,
     SE 9.7467, Satterthwaite df 22.8102; Days 10.4673, SE 0.8042, df
     161 (lmerTest's printed summary; Kuznetsova, Brockhoff & Christensen
     2017, J Stat Softw 82(13), and the lmerTest manual's example);
   - sleepstudy, Reaction ~ Days + (Days | Subject): REML criterion
     1743.6, Subject variances 612.09 (Intercept) and 35.07 (Days),
     correlation 0.07, residual 654.94; (Intercept) 251.405 SE 6.825,
     Days 10.467 SE 1.546, df 17 (lme4's ?sleepstudy / ?lmer example
     printout, Bates et al. 2015, J Stat Softw 67(1), section 1);
   - Pastes, strength ~ 1 + (1 | batch) + (1 | batch:cask): intercept
     60.0533, SE 0.6769, batch variance 1.657, residual 0.678 (lme4
     values pinned in statsmodels' own test suite,
     statsmodels/regression/tests/test_lme.py::test_pastes_vcomp);
3. an independent dense implementation in this script of Satterthwaite's
   df (lmerTest's definition: df = 2 (l' Phi l)^2 / (g' A g), A = 2 H^-1,
   H the numerical Hessian of the REML deviance in the natural variance
   parameters, g the numerical gradient of l' Phi l) and of the
   Kenward-Roger df and adjusted SE (Kenward & Roger 1997, Biometrics
   53:983, section 4; full n x n matrices, statsmodels' estimates).

Data: lme4's sleepstudy (Belenky et al. 2003, J Sleep Res 12:1-12; the
CSV from the Rdatasets mirror of lme4) and Pastes (Davies & Goldsmith
1972; CSV shipped with statsmodels' tests), both in engine/tests/fixtures;
and a synthetic animal / slice / cell design (12 animals, 3 slices each,
4 to 6 cells per slice, genotype between animals, cell size as a
covariate) generated below with a fixed seed.

Run from the repository root:
  /home/eren/opendose/.venv/bin/python engine/tests/reference/lmm_long.py
"""
import json
import os
import warnings

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from scipy import stats

warnings.simplefilter("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "..", "fixtures")


def synthetic():
    rng = np.random.default_rng(20261124)
    rows = []
    for a in range(12):
        geno = "WT" if a < 6 else "KO"
        ua = rng.normal(0, 1.5)
        for s in range(3):
            us = rng.normal(0, 1.0)
            for _ in range(int(rng.integers(4, 7))):
                size = float(np.round(rng.normal(20, 4), 2))
                y = (10 + (2.0 if geno == "KO" else 0.0) + 0.5 * size + ua + us
                     + rng.normal(0, 2.0))
                rows.append({"animal": f"M{a + 1}", "slice": f"S{s + 1}",
                             "genotype": geno, "size": size,
                             "current": float(np.round(y, 3))})
    return pd.DataFrame(rows)


# ------------------------------------------- dense REML, Satterthwaite, KR

class Dense:
    """V(theta) = sum_i theta_i V_i (natural parameters, linear)."""

    def __init__(self, y, X, Vs):
        self.y, self.X, self.Vs = y, X, Vs

    def V(self, th):
        return sum(t * Vi for t, Vi in zip(th, self.Vs))

    def deviance(self, th):
        V = self.V(th)
        Vi = np.linalg.inv(V)
        XtViX = self.X.T @ Vi @ self.X
        b = np.linalg.solve(XtViX, self.X.T @ Vi @ self.y)
        r = self.y - self.X @ b
        n, p = self.X.shape
        return (np.linalg.slogdet(V)[1] + np.linalg.slogdet(XtViX)[1]
                + r @ Vi @ r + (n - p) * np.log(2 * np.pi))

    def phi(self, th):
        Vi = np.linalg.inv(self.V(th))
        return np.linalg.inv(self.X.T @ Vi @ self.X)

    def satterthwaite(self, th, l):
        k = len(th)
        h = 1e-4 * np.maximum(np.abs(th), 1e-3)
        H = np.zeros((k, k))
        f0 = self.deviance(th)
        for i in range(k):
            for j in range(k):
                ei, ej = np.zeros(k), np.zeros(k)
                ei[i], ej[j] = h[i], h[j]
                H[i, j] = (self.deviance(th + ei + ej) - self.deviance(th + ei - ej)
                           - self.deviance(th - ei + ej) + self.deviance(th - ei - ej)) / (4 * h[i] * h[j])
        del f0
        A = 2 * np.linalg.inv(H)
        g = np.zeros(k)
        for i in range(k):
            e = np.zeros(k)
            e[i] = h[i]
            g[i] = (l @ self.phi(th + e) @ l - l @ self.phi(th - e) @ l) / (2 * h[i])
        v = l @ self.phi(th) @ l
        return 2 * v * v / (g @ A @ g)

    def kenward_roger(self, th, l):
        X = self.X
        V = self.V(th)
        Vi = np.linalg.inv(V)
        Phi = np.linalg.inv(X.T @ Vi @ X)
        Pm = Vi - Vi @ X @ Phi @ X.T @ Vi
        k = len(th)
        Pi = [X.T @ Vi @ Vk @ Vi @ X for Vk in self.Vs]
        Qij = [[X.T @ Vi @ self.Vs[i] @ Vi @ self.Vs[j] @ Vi @ X for j in range(k)]
               for i in range(k)]
        info = np.array([[0.5 * np.trace(Pm @ self.Vs[i] @ Pm @ self.Vs[j])
                          for j in range(k)] for i in range(k)])
        W = np.linalg.inv(info)
        S = sum(W[i, j] * (Qij[i][j] - Pi[i] @ Phi @ Pi[j])
                for i in range(k) for j in range(k))
        PhiA = Phi + 2 * Phi @ S @ Phi
        L = l[None, :]
        Theta = L.T @ np.linalg.inv(L @ Phi @ L.T) @ L
        M = [Theta @ Phi @ P_ @ Phi for P_ in Pi]
        A1 = sum(W[i, j] * np.trace(M[i]) * np.trace(M[j]) for i in range(k) for j in range(k))
        A2 = sum(W[i, j] * np.trace(M[i] @ M[j]) for i in range(k) for j in range(k))
        ell = 1
        B = (A1 + 6 * A2) / (2 * ell)
        gg = ((ell + 1) * A1 - (ell + 4) * A2) / ((ell + 2) * A2)
        c1 = gg / (3 * ell + 2 * (1 - gg))
        c2 = (ell - gg) / (3 * ell + 2 * (1 - gg))
        c3 = (ell + 2 - gg) / (3 * ell + 2 * (1 - gg))
        Es = 1 / (1 - A2 / ell)
        Vs = (2 / ell) * (1 + c1 * B) / ((1 - c2 * B) ** 2 * (1 - c3 * B))
        rho = Vs / (2 * Es ** 2)
        m = 4 + (ell + 2) / (ell * rho - 1)
        return float(np.sqrt(l @ PhiA @ l)), float(m)


def group_mats(codes):
    codes = np.asarray(codes)
    return (codes[:, None] == codes[None, :]).astype(float)


def fixed_rows(fe, bse, dense, th):
    out = []
    p = len(fe)
    for k, (name, est) in enumerate(fe.items()):
        l = np.zeros(p)
        l[k] = 1
        se_kr, df_kr = dense.kenward_roger(th, l)
        df_s = dense.satterthwaite(th, l)
        out.append({"term": name, "estimate": float(est), "se": float(bse.iloc[k]),
                    "se_phi": float(np.sqrt(l @ dense.phi(th) @ l)),
                    "df_satterthwaite": float(df_s), "df_kenward_roger": df_kr,
                    "se_kenward_roger": se_kr,
                    "p_satterthwaite": float(2 * stats.t.sf(abs(est / bse.iloc[k]), df_s))})
    return out


def sleep_models():
    d = pd.read_csv(os.path.join(FIX, "lme4_sleepstudy.csv"))
    X = np.column_stack([np.ones(len(d)), d["Days"].to_numpy(float)])
    y = d["Reaction"].to_numpy(float)
    G = group_mats(d["Subject"])
    days = d["Days"].to_numpy(float)
    out = {}
    m = smf.mixedlm("Reaction ~ Days", d, groups=d["Subject"]).fit(reml=True)
    th = np.array([m.cov_re.iloc[0, 0], m.scale])
    dense = Dense(y, X, [G, np.eye(len(d))])
    out["intercept"] = {
        "reml_criterion": float(-2 * m.llf),
        "subject_variance": float(m.cov_re.iloc[0, 0]), "residual_variance": float(m.scale),
        "fixed": fixed_rows(m.fe_params, m.bse_fe, dense, th),
        "published_lmerTest": {"intercept_df": 22.8102, "days_df": 161.0,
                               "intercept_se": 9.7467, "days_se": 0.8042}}
    m = smf.mixedlm("Reaction ~ Days", d, groups=d["Subject"], re_formula="~Days").fit(reml=True)
    c = m.cov_re.to_numpy()
    th = np.array([c[0, 0], c[0, 1], c[1, 1], m.scale])
    Vs = [G, G * (days[:, None] + days[None, :]), G * np.outer(days, days), np.eye(len(d))]
    dense = Dense(y, X, Vs)
    out["slope"] = {
        "reml_criterion": float(-2 * m.llf),
        "intercept_variance": float(c[0, 0]), "slope_variance": float(c[1, 1]),
        "correlation": float(c[0, 1] / np.sqrt(c[0, 0] * c[1, 1])),
        "residual_variance": float(m.scale),
        "fixed": fixed_rows(m.fe_params, m.bse_fe, dense, th),
        "published_lme4": {"reml_criterion": 1743.6, "intercept_variance": 612.09,
                           "slope_variance": 35.07, "correlation": 0.07,
                           "residual_variance": 654.94, "intercept_se": 6.825,
                           "days_se": 1.546, "df": 17.0}}
    return out


def pastes():
    d = pd.read_csv(os.path.join(FIX, "lme4_pastes.csv"))
    m = smf.mixedlm("strength ~ 1", d, groups="batch", re_formula="1",
                    vc_formula={"cask": "0 + cask"}).fit(reml=True)
    y = d["strength"].to_numpy(float)
    X = np.ones((len(d), 1))
    dense = Dense(y, X, [group_mats(d["batch"]), group_mats(d["sample"]), np.eye(len(d))])
    th = np.array([m.cov_re.iloc[0, 0], m.vcomp[0], m.scale])
    return {"reml_criterion": float(-2 * m.llf),
            "batch_variance": float(m.cov_re.iloc[0, 0]), "cask_variance": float(m.vcomp[0]),
            "residual_variance": float(m.scale),
            "fixed": fixed_rows(m.fe_params, m.bse_fe, dense, th),
            "published_lme4": {"intercept": 60.0533, "se": 0.6769,
                               "batch_variance": 1.657, "residual_variance": 0.678}}


def animals():
    d = synthetic()
    d["geno_KO"] = (d["genotype"] == "KO").astype(float)
    d["animal_slice"] = d["animal"] + ":" + d["slice"]
    m = smf.mixedlm("current ~ C(genotype, Treatment('WT')) + size", d, groups="animal",
                    re_formula="1", vc_formula={"slice": "0 + C(slice)"}).fit(reml=True)
    y = d["current"].to_numpy(float)
    X = np.column_stack([np.ones(len(d)), d["geno_KO"], d["size"]])
    dense = Dense(y, X, [group_mats(d["animal"]), group_mats(d["animal_slice"]), np.eye(len(d))])
    th = np.array([m.cov_re.iloc[0, 0], m.vcomp[0], m.scale])
    fixed = fixed_rows(m.fe_params, m.bse_fe, dense, th)
    for f, name in zip(fixed, ["(Intercept)", "genotype: KO", "size"]):
        f["term"] = name
    return {"records": d[["animal", "slice", "genotype", "size", "current"]].to_dict("records"),
            "reml_criterion": float(-2 * m.llf),
            "animal_variance": float(m.cov_re.iloc[0, 0]), "slice_variance": float(m.vcomp[0]),
            "residual_variance": float(m.scale), "fixed": fixed}


if __name__ == "__main__":
    out = {"sleepstudy": sleep_models(), "pastes": pastes(), "animals": animals()}
    with open(os.path.join(HERE, "lmm_long.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    print(json.dumps({k: (v if k != "animals" else {kk: vv for kk, vv in v.items() if kk != "records"})
                      for k, v in out.items()}, indent=1))
