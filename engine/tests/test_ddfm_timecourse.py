"""Kenward-Roger and Satterthwaite df for the time-course model
(opendose.ddfm.BlockDdf, mixed_timecourse ddf option).

References:
- compound symmetry and random slopes: R 4.6.1 lme4 + pbkrtest +
  lmerTest (fixtures/ddfm_timecourse_r_reference.json; 2 of 40 random
  unbalanced time courses, all 40 agreeing to ~1e-7), fitted with
  lmerControl(optimizer = "bobyqa", optCtrl = list(rhobeg = 2e-3,
  rhoend = 1e-12, maxfun = 1e5)):
      lmer(y ~ group * factor(time) + (1 | subj))           # cs
      lmer(y ~ group * factor(time) + (1 + time | subj))    # random slope
      anova(m, type = 3, ddf = "Kenward-Roger"); contestMD(m, <the term's
      identity rows>, ddf = "Satterthwaite"); contest1D(m, L, ddf = ...)
  (Satterthwaite agrees except on singular fits, correlation +-1, where
  it depends on the parameterisation; mixed_timecourse warns then.)
- unstructured covariance, balanced and complete: Kenward & Roger (1997)
  show their F is exact here: Hotelling's T^2 test of the time effect.
- AR(1), no R reference with Kenward-Roger: Satterthwaite is checked
  against a purely numerical version (finite-difference Hessian of the
  REML deviance and gradient of l' Phi l), and the derivative matrices
  (including R_ij, AR(1)'s second derivatives) against finite
  differences: dP_i/dtheta_j = -(Q_ij + Q_ji) + R_ij.
"""

import json
import math
from pathlib import Path

import numpy as np
import pytest

from opendose import api, ddfm
from opendose import mixed_timecourse as mt
from opendose import mixedmodel as mm

REF = json.loads((Path(__file__).parent / "fixtures"
                  / "ddfm_timecourse_r_reference.json").read_text())


def _tc(records, covariance, ddf, **opts):
    out = api.analyze({"analysis": "mixed_timecourse", "data": {"records": records},
                       "options": {"covariance": covariance, "ddf": ddf,
                                   "comparisons": "fisher", **opts}})
    assert "error" not in out, out.get("error")
    return out


@pytest.mark.parametrize("key", sorted(REF))
def test_matches_r(key):
    e = REF[key]
    kr = _tc(e["records"], e["covariance"], "kenward_roger")
    st = _tc(e["records"], e["covariance"], "satterthwaite")
    for a, b in zip(kr["anova"], st["anova"]):
        f_kr, df_kr, f_st, df_st = e["tests"][a["term"]]
        assert a["f"] == pytest.approx(f_kr, rel=1e-5)
        assert a["dfd"] == pytest.approx(df_kr, rel=1e-5)
        assert b["f"] == pytest.approx(f_st, rel=1e-5)
        assert b["dfd"] == pytest.approx(df_st, rel=1e-5)
    for a, b in zip(kr["group_difference_at_time"]["comparisons"],
                    st["group_difference_at_time"]["comparisons"]):
        se_kr, df_kr, se_st, df_st = e["contrasts"][str(float(a["time"]))]
        assert a["se"] == pytest.approx(se_kr, rel=1e-5)
        assert a["df"] == pytest.approx(df_kr, rel=1e-5)
        assert b["se"] == pytest.approx(se_st, rel=1e-5)
        assert b["df"] == pytest.approx(df_st, rel=1e-5)
    assert kr["df_method"] == "Kenward-Roger" and kr["ddf"] == "kenward_roger"


def test_unstructured_balanced_is_hotelling():
    rng = np.random.default_rng(5)
    n, T = 12, 4
    C = np.array([[4, 2, 1.5, 1], [2, 5, 2.5, 2], [1.5, 2.5, 6, 3], [1, 2, 3, 7.0]])
    Y = rng.multivariate_normal([10, 11, 11.5, 13], C, n)
    y = Y.ravel()
    subj = np.repeat(np.arange(n), T)
    pos = np.tile(np.arange(T), n)
    X = np.column_stack([np.ones(y.size), mm.effect_columns(pos, T)])
    f = mt.fit_structured(y, X, subj, pos, "unstructured")
    Sig, dS, d2, _ = ddfm.structure_derivatives("unstructured", T, f["params"])
    kr = ddfm.BlockDdf(y, X, subj, pos, Sig, dS, d2).kenward_roger(np.eye(T)[1:])
    d = np.diff(Y, axis=1)
    m, Sd, k = d.mean(0), np.cov(d, rowvar=False), T - 1
    F_h = (n - k) / ((n - 1) * k) * n * m @ np.linalg.solve(Sd, m)
    assert kr["F"] == pytest.approx(F_h, rel=1e-6)
    assert kr["df_den"] == pytest.approx(n - k, rel=1e-6)


def _ar1_data(seed=3, S=10, T=5):
    rng = np.random.default_rng(seed)
    rho, s2, ss = 0.6, 1.0, 1.2
    R = rho ** np.abs(np.subtract.outer(np.arange(T), np.arange(T)))
    y, subj, pos, grp = [], [], [], []
    for s in range(S):
        e = rng.multivariate_normal(np.zeros(T), s2 * R) + rng.normal(0, math.sqrt(ss))
        for t in range(T):
            if rng.random() < 0.15:
                continue
            y.append(5 + 0.4 * t + (s % 2) * 0.8 + e[t])
            subj.append(s); pos.append(t); grp.append(s % 2)
    y, subj, pos, grp = map(np.array, (y, subj, pos, grp))
    A, B = mm.effect_columns(pos, T), mm.effect_columns(grp, 2)
    X = np.column_stack([np.ones(y.size), A, B, mm._interaction(A, B)])
    return y, X, subj, pos, T


def _ar1(theta, T):
    return ddfm.structure_derivatives("ar1", T, {"subject_variance": theta[0],
                                                 "residual_variance": theta[1], "rho": theta[2]})


def test_ar1_satterthwaite_equals_a_numerical_computation():
    y, X, subj, pos, T = _ar1_data()
    f = mt.fit_structured(y, X, subj, pos, "ar1")
    th = np.array([f["params"]["subject_variance"], f["sigma2"], f["params"]["rho"]])
    Sig, dS, d2, _ = _ar1(th, T)
    D = ddfm.BlockDdf(y, X, subj, pos, Sig, dS, d2)

    def blocks(theta):
        S_ = _ar1(theta, T)[0]
        return [(np.flatnonzero(subj == s), S_[np.ix_(pos[subj == s], pos[subj == s])])
                for s in np.unique(subj)]

    def phi(theta):
        return np.linalg.inv(sum(X[i].T @ np.linalg.solve(V, X[i]) for i, V in blocks(theta)))

    def dev(theta):  # REML deviance (constants dropped)
        bl = blocks(theta)
        A = sum(X[i].T @ np.linalg.solve(V, X[i]) for i, V in bl)
        b = np.linalg.solve(A, sum(X[i].T @ np.linalg.solve(V, y[i]) for i, V in bl))
        return (sum(np.linalg.slogdet(V)[1] for _, V in bl) + np.linalg.slogdet(A)[1]
                + sum((y[i] - X[i] @ b) @ np.linalg.solve(V, y[i] - X[i] @ b) for i, V in bl))

    h = 1e-4 * np.maximum(np.abs(th), 1e-2)
    H = np.zeros((3, 3))
    for a in range(3):
        for b in range(3):
            ea, eb = np.eye(3)[a] * h[a], np.eye(3)[b] * h[b]
            H[a, b] = (dev(th + ea + eb) - dev(th + ea - eb) - dev(th - ea + eb)
                       + dev(th - ea - eb)) / (4 * h[a] * h[b])
    assert D.H_observed == pytest.approx(H, rel=2e-3, abs=2e-3)
    Acov = 2 * np.linalg.inv(H)
    for row in (1, 5):  # a time contrast and the group contrast
        l = np.eye(X.shape[1])[row]
        v = float(l @ phi(th) @ l)
        g = np.array([(float(l @ phi(th + np.eye(3)[k] * h[k]) @ l)
                       - float(l @ phi(th - np.eye(3)[k] * h[k]) @ l)) / (2 * h[k]) for k in range(3)])
        df_num = 2 * v * v / float(g @ Acov @ g)
        assert D.satterthwaite_1d(l)[1] == pytest.approx(df_num, rel=5e-3)


def test_derivative_matrices_by_finite_differences():
    # dP_i / dtheta_j = -(Q_ij + Q_ji) + R_ij, R from AR(1)'s second
    # derivatives (rho enters non-linearly)
    y, X, subj, pos, T = _ar1_data(seed=8)
    th = np.array([0.9, 1.1, 0.5])
    D = ddfm.BlockDdf(y, X, subj, pos, *_ar1(th, T)[:3])
    assert D.R is not None
    for j in range(3):
        h = 1e-6 * max(abs(th[j]), 1e-2)
        up = ddfm.BlockDdf(y, X, subj, pos, *_ar1(th + np.eye(3)[j] * h, T)[:3])
        dn = ddfm.BlockDdf(y, X, subj, pos, *_ar1(th - np.eye(3)[j] * h, T)[:3])
        for i in range(3):
            fd = (up.P[i] - dn.P[i]) / (2 * h)
            an = -(D.Q[i][j] + D.Q[j][i]) + D.R[i][j]
            assert fd == pytest.approx(an, rel=1e-4, abs=1e-6)


def test_api_options():
    e = REF["13"]
    bw = _tc(e["records"], "ar1", "between_within")
    kr = _tc(e["records"], "ar1", "kenward_roger")
    assert bw["df_method"].startswith("between-within")
    assert kr["df_method"] == "Kenward-Roger"
    assert any("Kenward-Roger or Satterthwaite df" in w for w in bw["warnings"])
    assert not any("Kenward-Roger or Satterthwaite df" in w for w in kr["warnings"])
    assert all(isinstance(r["dfd"], float) for r in kr["anova"])
    bad = api.analyze({"analysis": "mixed_timecourse", "data": {"records": e["records"]},
                       "options": {"covariance": "ar1", "ddf": "kenward_roger", "method": "ml"}})
    assert "REML" in bad["error"]
    bad = api.analyze({"analysis": "mixed_timecourse", "data": {"records": e["records"]},
                       "options": {"ddf": "residual"}})
    assert "ddf must be" in bad["error"]
