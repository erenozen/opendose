"""Denominator degrees of freedom for the mixed models of
opendose.mixedmodel: Kenward-Roger and Satterthwaite.

The models are y = X b + sum_k Z_k u_k + e, u_k ~ N(0, s_k^2 I),
e ~ N(0, s^2 I), so V = s^2 I + sum_k s_k^2 Z_k Z_k' is linear in the
variance parameters theta = (s_1^2, ..., s_K^2, s^2): dV/dtheta_i = V_i
(Z_i Z_i', or I for the residual) and every second derivative is 0.

Kenward & Roger (1997), "Small sample inference for fixed effects from
restricted maximum likelihood", Biometrics 53:983-997, as implemented in
R's pbkrtest (Halekoh & Hojsgaard 2014, J Stat Softw 59(9)):
- Phi = (X' V^-1 X)^-1, P_i = X' V^-1 V_i V^-1 X,
  Q_ij = X' V^-1 V_i V^-1 V_j V^-1 X, W = the inverse of the expected
  REML information, W^-1_ij = tr(P V_i P V_j) / 2 with
  P = V^-1 - V^-1 X Phi X' V^-1;
- adjusted covariance Phi_A = Phi + 2 Phi {sum_ij W_ij (Q_ij - P_i Phi
  P_j)} Phi (the R_ij term is 0: V is linear in theta);
- for H0: L b = 0 with rank l, F = (L b)' (L Phi_A L')^-1 (L b) / l,
  Theta = L' (L Phi L')^-1 L, A1 = sum_ij W_ij tr(Theta Phi P_i Phi)
  tr(Theta Phi P_j Phi), A2 = sum_ij W_ij tr(Theta Phi P_i Phi Theta Phi
  P_j Phi), and the scale lambda and denominator df m of the paper's
  section 4: lambda F ~ F(l, m). For one contrast lambda = 1 and the t
  test uses the SE from Phi_A on m df.

Satterthwaite, as in R's lmerTest (Kuznetsova, Brockhoff & Christensen
2017, J Stat Softw 82(13)): for one contrast l, df = 2 (l' Phi l)^2 /
(g' A g), g_i = d(l' Phi l)/d theta_i = l' Phi P_i Phi l, A the
asymptotic covariance of theta = 2 H^-1, H the observed Hessian of the
REML deviance (-2 log restricted likelihood), H_ij = -tr(P V_i P V_j) +
2 y' P V_i P V_j P y (lmerTest takes it numerically, in a different
parameterisation; at the REML optimum the df do not depend on the
parameterisation). For l > 1 rows: L Phi L' = U D U', each row of U' L
gets its own df nu_m, E = sum over nu_m > 2 of nu_m / (nu_m - 2) and
ddf = 2 E / (E - l); F is the ordinary Wald F (Phi, not Phi_A).

Everything is computed with n x (p or q) products (V^-1 by Woodbury from
the fit's q x q matrices), never an n x n matrix, so large designs and
Pyodide are fine. Only numpy and scipy.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

METHODS = ("kenward_roger", "satterthwaite", "containment")
LABELS = {
    "kenward_roger": "Kenward-Roger",
    "satterthwaite": "Satterthwaite",
    "containment": "containment",
}


class _DdfBase:
    """Kenward-Roger / Satterthwaite from Phi, beta, P_i, Q_ij, R_ij (None
    when V is linear in theta), the expected information W and the
    observed covariance A of theta; subclasses compute them."""

    R = None
    _phi_a = None

    # ------------------------------------------------------- Kenward-Roger
    def phi_adjusted(self) -> np.ndarray:
        if self._phi_a is None:
            Phi, P, Q, Wm, R = self.Phi, self.P, self.Q, self.W_expected, self.R
            nth = len(P)
            S = np.zeros_like(Phi)
            for i in range(nth):
                for j in range(nth):
                    if Wm[i, j] != 0.0:
                        term = Q[i][j] - P[i] @ Phi @ P[j]
                        if R is not None:
                            term = term - 0.25 * R[i][j]
                        S += Wm[i, j] * term
            Pa = Phi + 2.0 * Phi @ S @ Phi
            self._phi_a = (Pa + Pa.T) / 2.0
        return self._phi_a

    def kenward_roger(self, L) -> dict:
        """F test of L b = 0: {F, df_num, df_den, scale, p}."""
        L = np.atleast_2d(np.asarray(L, float))
        ell = int(np.linalg.matrix_rank(L))
        Phi, Pa = self.Phi, self.phi_adjusted()
        b = L @ self.beta
        F = float(b @ np.linalg.solve(L @ Pa @ L.T, b)) / ell
        Theta = L.T @ np.linalg.solve(L @ Phi @ L.T, L)
        M = [Theta @ Phi @ Pi @ Phi for Pi in self.P]
        tr = np.array([float(np.trace(Mi)) for Mi in M])
        Wm = self.W_expected
        nth = len(M)
        A1 = float(tr @ Wm @ tr)
        A2 = 0.0
        for i in range(nth):
            for j in range(nth):
                A2 += Wm[i, j] * float(np.sum(M[i] * M[j].T))
        df_den, lam = _kr_df(ell, A1, A2)
        Fs = lam * F
        p = float(stats.f.sf(Fs, ell, df_den)) if df_den > 0 else None
        return {"F": Fs, "F_unscaled": F, "scale": lam, "df_num": ell,
                "df_den": df_den, "p": p}

    def kenward_roger_1d(self, l) -> tuple[float, float]:
        """(SE from Phi_A, df) of the contrast l' b."""
        l = np.asarray(l, float)
        var = float(l @ self.phi_adjusted() @ l)
        res = self.kenward_roger(l[None, :])
        return math.sqrt(max(var, 0.0)), res["df_den"]

    # ------------------------------------------------------- Satterthwaite
    def _satt_1d(self, l) -> float:
        l = np.asarray(l, float)
        v = float(l @ self.Phi @ l)
        pl = self.Phi @ l
        g = np.array([float(pl @ Pi @ pl) for Pi in self.P])
        den = float(g @ self.A_observed @ g)
        return 2.0 * v * v / den if den > 0 else math.inf

    def satterthwaite(self, L) -> dict:
        L = np.atleast_2d(np.asarray(L, float))
        b = L @ self.beta
        C = L @ self.Phi @ L.T
        q = int(np.linalg.matrix_rank(L))
        F = float(b @ np.linalg.solve(C, b)) / q
        if q == 1:
            ddf = self._satt_1d(L[0])
        else:
            d, U = np.linalg.eigh((C + C.T) / 2.0)
            keep = d > d.max() * 1e-10
            nus = [self._satt_1d(U[:, m] @ L) for m in np.flatnonzero(keep)]
            E = sum(nu / (nu - 2.0) for nu in nus if nu > 2.0)
            ddf = 2.0 * E / (E - q) if E > q else math.nan
        p = (float(stats.f.sf(F, q, ddf))
             if ddf > 0 and math.isfinite(ddf) else None)
        return {"F": F, "df_num": q, "df_den": ddf, "p": p}

    def satterthwaite_1d(self, l) -> tuple[float, float]:
        l = np.asarray(l, float)
        return math.sqrt(max(float(l @ self.Phi @ l), 0.0)), self._satt_1d(l)

    # --------------------------------------------------------- dispatch
    def test(self, method: str, L) -> dict:
        return (self.kenward_roger(L) if method == "kenward_roger"
                else self.satterthwaite(L))

    def contrast(self, method: str, l) -> tuple[float, float]:
        return (self.kenward_roger_1d(l) if method == "kenward_roger"
                else self.satterthwaite_1d(l))

    def cov(self, method: str) -> np.ndarray:
        return self.phi_adjusted() if method == "kenward_roger" else self.Phi


class Ddf(_DdfBase):
    """Kenward-Roger / Satterthwaite quantities of one fitted model of
    opendose.mixedmodel (variance components: V linear in theta)."""

    def __init__(self, fit):
        prof = fit["_profile"]
        X = np.asarray(fit["_X"], float)
        Zs = list(fit["_Zs"])
        gamma = np.asarray(fit["gamma"], float)
        sol = prof.solve(gamma)
        if sol is None:
            raise ValueError("the fitted covariance is not positive definite")
        s2 = float(sol["sigma2"])
        self.n, self.p = X.shape
        self.K = len(Zs)
        Z = prof.Z
        W = sol["W"]
        self._Z, self._W, self._s2 = Z, W, s2

        def vinv(M):
            M = np.asarray(M, float)
            if Z.shape[1] == 0:
                return M / s2
            return (M - Z @ (W @ (Z.T @ M))) / s2

        self.vinv = vinv
        VX = vinv(X)
        Phi = np.linalg.inv(X.T @ VX)
        self.Phi = (Phi + Phi.T) / 2.0
        self.beta = self.Phi @ (VX.T @ prof.y)
        # the variance components in the order theta = (s_1^2..s_K^2, s^2)
        self.theta = np.concatenate([gamma * s2, [s2]])
        # V_i V^-1 X for each component (n x p), and V^-1 V_i V^-1 X
        self._Zs = Zs
        nth = self.K + 1
        ViVX = [Zs[k] @ (Zs[k].T @ VX) for k in range(self.K)] + [VX]
        Ui = [vinv(M) for M in ViVX]
        self.P = [VX.T @ ViVX[i] for i in range(nth)]
        self.P = [(Pi + Pi.T) / 2.0 for Pi in self.P]
        self.Q = [[ViVX[i].T @ Ui[j] for j in range(nth)] for i in range(nth)]

        # tr(P V_i P V_j), P = V^-1 - VX Phi VX'
        def pz(Zk):  # P Z_k
            return vinv(Zk) - VX @ (self.Phi @ (VX.T @ Zk))

        PZ = [pz(Zs[k]) for k in range(self.K)]
        T = np.zeros((nth, nth))
        for i in range(self.K):
            for j in range(i, self.K):
                M = Zs[i].T @ PZ[j]
                T[i, j] = T[j, i] = float(np.sum(M * M))
            T[i, self.K] = T[self.K, i] = float(np.sum(PZ[i] * PZ[i]))
        # tr(P P) = tr(V^-2) - 2 tr(Phi X'V^-3 X) + tr(Phi M2 Phi M2)
        S = Z.T @ Z
        if Z.shape[1]:
            WS = W @ S
            tr_h2 = self.n - 2.0 * float(np.trace(WS)) + float(np.sum(WS * WS.T))
        else:
            tr_h2 = float(self.n)
        M2 = VX.T @ VX
        M3 = VX.T @ vinv(VX)
        T[self.K, self.K] = (tr_h2 / s2 ** 2 - 2.0 * float(np.sum(self.Phi * M3))
                             + float(np.sum((self.Phi @ M2) * (self.Phi @ M2).T)))
        self.trPVPV = T
        # expected information (Kenward-Roger)
        self.W_expected = 2.0 * np.linalg.pinv(T)
        # observed Hessian of the REML deviance (Satterthwaite)
        e = vinv(prof.y - X @ self.beta)            # P y
        Ve = [Zs[k] @ (Zs[k].T @ e) for k in range(self.K)] + [e]

        def p_apply(v):
            return vinv(v) - VX @ (self.Phi @ (VX.T @ v))

        PVe = [p_apply(v) for v in Ve]
        H = np.zeros((nth, nth))
        for i in range(nth):
            for j in range(i, nth):
                H[i, j] = H[j, i] = -T[i, j] + 2.0 * float(Ve[i] @ PVe[j])
        self.H_observed = H
        try:
            self.A_observed = 2.0 * np.linalg.inv(H)
        except np.linalg.LinAlgError:
            self.A_observed = 2.0 * np.linalg.pinv(H)
        self._phi_a = None

def _kr_df(ell: int, A1: float, A2: float) -> tuple[float, float]:
    """Kenward & Roger (1997) section 4: (m, lambda) from A1, A2."""
    B = (A1 + 6.0 * A2) / (2.0 * ell)
    g = ((ell + 1.0) * A1 - (ell + 4.0) * A2) / ((ell + 2.0) * A2)
    den = 3.0 * ell + 2.0 * (1.0 - g)
    c1, c2, c3 = g / den, (ell - g) / den, (ell + 2.0 - g) / den
    Estar = 1.0 / (1.0 - A2 / ell)
    Vstar = (2.0 / ell) * (1.0 + c1 * B) / ((1.0 - c2 * B) ** 2 * (1.0 - c3 * B))
    rho = Vstar / (2.0 * Estar ** 2)
    m = 4.0 + (ell + 2.0) / (ell * rho - 1.0)
    lam = m / (Estar * (m - 2.0))
    return float(m), float(lam)


def method_of(options_value) -> str:
    v = (options_value or "containment")
    if v not in METHODS:
        raise ValueError(f"ddf must be one of {', '.join(METHODS)}")
    return v


class BlockDdf(_DdfBase):
    """Kenward-Roger / Satterthwaite for block-diagonal V: subject s's
    block is Sigma(theta) at its observed time positions (the models of
    opendose.mixed_timecourse). dSigma[i] = dSigma/dtheta_i and d2Sigma
    {(i, j): d2Sigma/dtheta_i dtheta_j} (only the non-zero ones; AR(1)'s
    rho enters non-linearly, so Kenward & Roger's R_ij term is kept).
    Everything is computed block by block (m_s x m_s per subject).

    REML information as in Ddf; the observed Hessian of the REML deviance
    adds tr(P V_ij) - y'P V_ij P y for the non-linear parameters."""

    def __init__(self, y, X, subjects, positions, Sigma, dSigma, d2Sigma=None):
        y = np.asarray(y, float)
        X = np.asarray(X, float)
        subjects = np.asarray(subjects)
        positions = np.asarray(positions, int)
        Sigma = np.asarray(Sigma, float)
        nth = len(dSigma)
        d2Sigma = d2Sigma or {}
        D = [np.asarray(d, float) for d in dSigma]
        pairs = {}
        for (i, j), M in d2Sigma.items():
            pairs[(i, j)] = pairs[(j, i)] = np.asarray(M, float)
        blocks = []
        for s in np.unique(subjects):
            idx = np.flatnonzero(subjects == s)
            pos = positions[idx]
            V = Sigma[np.ix_(pos, pos)]
            Vi = np.linalg.inv(V)
            blocks.append((idx, (Vi + Vi.T) / 2.0,
                           [d[np.ix_(pos, pos)] for d in D],
                           {k: M[np.ix_(pos, pos)] for k, M in pairs.items()}))
        self._from_blocks(y, X, blocks, nth, set(pairs))

    def _from_blocks(self, y, X, blocks, nth, pairs):
        """blocks: (row indices, V_s^-1, [dV_s/dtheta_i], {(i, j):
        d2V_s/dtheta_i dtheta_j}) per independent block of V; pairs: the
        (i, j) with a non-zero second derivative (empty: V linear)."""
        XtVX = sum(X[i].T @ Vi @ X[i] for i, Vi, _, _ in blocks)
        Phi = np.linalg.inv(XtVX)
        self.Phi = (Phi + Phi.T) / 2.0
        self.beta = self.Phi @ sum(X[i].T @ Vi @ y[i] for i, Vi, _, _ in blocks)
        self.theta = None
        P = [np.zeros_like(self.Phi) for _ in range(nth)]
        Q = [[np.zeros_like(self.Phi) for _ in range(nth)] for _ in range(nth)]
        R = ([[np.zeros_like(self.Phi) for _ in range(nth)] for _ in range(nth)]
             if pairs else None)
        T1 = np.zeros((nth, nth))   # sum_s tr(Vi D_i Vi D_j)
        TV2 = np.zeros((nth, nth))  # sum_s tr(Vi D_ij)
        ev = np.zeros((nth, nth))   # e' V_ij e
        r = y - X @ self.beta
        u_all = [[] for _ in range(nth)]   # (idx, D_i e_s) per subject
        g = [np.zeros(X.shape[1]) for _ in range(nth)]
        for idx, Vi, Ds, M2b in blocks:
            A = Vi @ X[idx]                              # V_s^-1 X_s
            e = Vi @ r[idx]                              # (P y)_s
            ViD = [Vi @ d for d in Ds]
            for a in range(nth):
                P[a] += A.T @ Ds[a] @ A
                u = Ds[a] @ e
                u_all[a].append((Vi, u))
                g[a] += A.T @ u
                for b in range(nth):
                    Q[a][b] += A.T @ Ds[a] @ Vi @ Ds[b] @ A
                    T1[a, b] += float(np.sum(ViD[a] * ViD[b].T))
                    M2s = M2b.get((a, b))
                    if M2s is not None:
                        R[a][b] += A.T @ M2s @ A
                        TV2[a, b] += float(np.sum(Vi * M2s.T))
                        ev[a, b] += float(e @ M2s @ e)
        self.P = [(Pi + Pi.T) / 2.0 for Pi in P]
        self.Q = Q
        self.R = R
        Phi = self.Phi
        trPVPV = np.zeros((nth, nth))
        H = np.zeros((nth, nth))
        for a in range(nth):
            for b in range(nth):
                trPVPV[a, b] = (T1[a, b] - 2.0 * float(np.sum(Phi * Q[a][b].T))
                                + float(np.sum((Phi @ self.P[a]) * (Phi @ self.P[b]).T)))
                # (V_a e)' P (V_b e)
                quad = sum(float(ua @ Vi @ ub) for (Vi, ua), (_, ub)
                           in zip(u_all[a], u_all[b])) - float(g[a] @ Phi @ g[b])
                H[a, b] = -trPVPV[a, b] + 2.0 * quad
                if R is not None and (a, b) in pairs:
                    H[a, b] += (TV2[a, b] - float(np.sum(Phi * R[a][b].T))) - ev[a, b]
        self.trPVPV = (trPVPV + trPVPV.T) / 2.0
        self.W_expected = 2.0 * np.linalg.pinv(self.trPVPV)
        self.H_observed = (H + H.T) / 2.0
        try:
            self.A_observed = 2.0 * np.linalg.inv(self.H_observed)
        except np.linalg.LinAlgError:
            self.A_observed = 2.0 * np.linalg.pinv(self.H_observed)
        self._phi_a = None


class GeneralBlockDdf(BlockDdf):
    """Kenward-Roger / Satterthwaite for any block-diagonal V that is
    linear in its parameters (opendose.lmm: random intercepts and slopes
    of groups nested in one top-level grouping factor): blocks are
    (row indices, V_s, [dV_s/dtheta_i]) with V_s dense for that block."""

    def __init__(self, y, X, blocks):
        y = np.asarray(y, float)
        X = np.asarray(X, float)
        prepared = []
        nth = None
        for idx, V, Ds in blocks:
            Vi = np.linalg.inv(np.asarray(V, float))
            prepared.append((np.asarray(idx, int), (Vi + Vi.T) / 2.0,
                             [np.asarray(d, float) for d in Ds], {}))
            nth = len(Ds)
        self._from_blocks(y, X, prepared, nth, set())


def structure_derivatives(kind, T, Sigma_params, *, level_times=None,
                          random_intercept=True):
    """Sigma(theta) and its derivatives in natural units for the
    structures of opendose.mixed_timecourse:
    cs (subject variance, residual variance); ar1 ([subject variance,]
    residual variance, rho): Sigma = s_s^2 J + s^2 rho^|i-j|;
    unstructured (each sigma_ij, i <= j); random_slope (G11, G12, G22,
    residual variance): Sigma = Z G Z' + s^2 I, Z = [1, time].
    Returns (Sigma, dSigma list, d2Sigma dict, names)."""
    I = np.eye(T)
    J = np.ones((T, T))
    lag = np.abs(np.subtract.outer(np.arange(T), np.arange(T))).astype(float)
    p = Sigma_params
    if kind == "cs":
        Sigma = p["subject_variance"] * J + p["residual_variance"] * I
        return Sigma, [J, I], {}, ["subject variance", "residual variance"]
    if kind == "ar1":
        rho, s2 = p["rho"], p["residual_variance"]
        Rm = rho ** lag
        dR = np.where(lag > 0, lag * np.power(rho, np.maximum(lag - 1, 0)), 0.0)
        d2R = np.where(lag > 1, lag * (lag - 1) * np.power(rho, np.maximum(lag - 2, 0)), 0.0)
        Sigma = s2 * Rm
        dS, names, d2 = [], [], {}
        off = 0
        if random_intercept:
            Sigma = Sigma + p["subject_variance"] * J
            dS.append(J)
            names.append("subject variance")
            off = 1
        dS += [Rm, s2 * dR]
        names += ["residual variance", "rho"]
        d2[(off, off + 1)] = dR          # d2 / d s2 d rho
        d2[(off + 1, off + 1)] = s2 * d2R
        return Sigma, dS, d2, names
    if kind == "unstructured":
        Sigma = np.asarray(p["covariance"], float)
        dS, names = [], []
        for i in range(T):
            for j in range(i + 1):
                E = np.zeros((T, T))
                E[i, j] = E[j, i] = 1.0
                dS.append(E)
                names.append(f"sigma[{i + 1},{j + 1}]")
        return Sigma, dS, {}, names
    if kind == "random_slope":
        z0 = np.ones(T)
        z1 = np.asarray(level_times, float)
        G = np.asarray(p["G"], float)
        Z = np.column_stack([z0, z1])
        Sigma = Z @ G @ Z.T + p["residual_variance"] * I
        dS = [np.outer(z0, z0), np.outer(z0, z1) + np.outer(z1, z0), np.outer(z1, z1), I]
        return Sigma, dS, {}, ["intercept variance", "intercept-slope covariance",
                               "slope variance", "residual variance"]
    raise ValueError(f"unknown covariance structure: {kind}")
