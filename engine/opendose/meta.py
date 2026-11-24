"""Meta-analysis: combining the estimates of several experiments or
studies, each given as an estimate with its standard error.

Methods (inverse-variance pooling, as in metafor's rma.uni; Viechtbauer
2010, J Stat Softw 36(3), and Borenstein, Hedges, Higgins & Rothstein
2009, Introduction to Meta-Analysis):

- Common (fixed) effect: weights w_i = 1/v_i, v_i = SE_i^2; estimate
  sum(w_i y_i)/sum(w_i) with SE 1/sqrt(sum(w_i)) and a normal (z) CI.
- Heterogeneity: Cochran's Q = sum(w_i (y_i - mu_FE)^2) on k - 1 df.
- Between-study variance tau^2: restricted maximum likelihood (REML,
  default; Viechtbauer 2005, J Educ Behav Stat 30:261) as the root of the
  REML score equation in tau^2 >= 0 (a 1-D root, bracketed and solved
  with Brent's method; tau^2 = 0 when the score at 0 is not positive),
  or DerSimonian & Laird's moment estimator (1986, Control Clin Trials
  7:177), max(0, (Q - (k - 1)) / (sum w - sum w^2 / sum w)). The SE of
  tau^2 is the inverse square root of the expected information (REML:
  tr(PP)/2, P = W - W 1 1' W / sum W; DL: metafor's delta-method
  formula is not reproduced, so no SE is given for DL).
- Random effects: weights w_i* = 1/(v_i + tau^2); estimate
  sum(w* y)/sum(w*). Its CI is the Hartung-Knapp (Sidik-Jonkman)
  interval by default (Hartung & Knapp 2001, Stat Med 20:3875; Sidik &
  Jonkman 2002, Stat Med 21:3153): SE_HK^2 = sum(w* (y - mu)^2) /
  ((k - 1) sum w*) and a t quantile on k - 1 df, not truncated at the
  z-based SE (metafor's test = "knha"). IntHout, Ioannidis & Borm 2014
  (BMC Med Res Methodol 14:25) show the z interval is too narrow when
  there are few studies, which is the usual case for a handful of
  experiments; the z interval is reported alongside.
- I^2 = 100 tau^2 / (tau^2 + s^2) with the typical within-study
  variance s^2 = (k - 1) sum w / ((sum w)^2 - sum w^2) and H^2 =
  (tau^2 + s^2) / s^2 (Higgins & Thompson 2002, Stat Med 21:1539;
  metafor's definition for random-effects models). The Q-based I^2 =
  100 max(0, (Q - (k - 1)) / Q) is reported too.
- Prediction interval for the effect in a new study: mu +/- t_{k-2}
  sqrt(tau^2 + SE(mu)^2) (Higgins, Thompson & Spiegelhalter 2009, J R
  Stat Soc A 172:137; Riley, Higgins & Deeks 2011, BMJ 342:d549), with
  SE(mu) the SE of the chosen interval (Hartung-Knapp or z), as R's meta
  package computes it (metagen with hakn = TRUE); needs k >= 3.
- Ratios (odds, risk, hazard ratios) are pooled on the log scale and
  reported back-transformed.

With few studies tau^2 is estimated poorly (often 0 even when the
studies differ), so the result carries a note when k < 5.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import optimize, stats

METHODS = ("REML", "DL")
SCALES = ("difference", "log_ratio", "ratio")


def weighted_mean(estimates, weights):
    """sum(w_i y_i) / sum(w_i) over the first axis: one pooled value for a
    1-D array of estimates, or one per column for a (k, B) array (each
    bootstrap resample of k comparisons). The pooling step shared by the
    meta-analysis here and the mini-meta weighted delta of the estimation
    plot (estimation.py)."""
    y = np.asarray(estimates, float)
    w = np.asarray(weights, float)
    return np.tensordot(w, y, axes=(0, 0)) / w.sum()


def inverse_variance_mean(estimates, variances) -> dict:
    """Inverse-variance weighted mean of estimates with known variances:
    {estimate, se, weights (normalised to sum 1)}."""
    w = 1.0 / np.asarray(variances, float)
    sw = float(w.sum())
    return {"estimate": float(weighted_mean(estimates, w)),
            "se": math.sqrt(1.0 / sw), "weights": (w / sw).tolist()}


def _reml_score(tau2, y, v):
    w = 1.0 / (v + tau2)
    sw = w.sum()
    mu = np.dot(w, y) / sw
    return 0.5 * (np.sum(w * w * (y - mu) ** 2) - sw + np.sum(w * w) / sw)


def tau2_reml(y, v) -> dict:
    """REML tau^2: the root of the restricted-likelihood score in
    tau^2 >= 0 (0 when the score at 0 is not positive)."""
    y, v = np.asarray(y, float), np.asarray(v, float)
    if _reml_score(0.0, y, v) <= 0:
        return {"tau2": 0.0, "converged": True, "boundary": True}
    hi = max(float(np.var(y, ddof=1)), float(v.max()), 1e-300)
    for _ in range(200):
        if _reml_score(hi, y, v) < 0:
            break
        hi *= 4.0
    else:
        return {"tau2": None, "converged": False, "boundary": False}
    root = optimize.brentq(_reml_score, 0.0, hi, args=(y, v), xtol=1e-14 * hi,
                           rtol=1e-12, maxiter=500)
    return {"tau2": float(root), "converged": True, "boundary": False}


def tau2_dl(y, v) -> float:
    w = 1.0 / np.asarray(v, float)
    y = np.asarray(y, float)
    mu = np.dot(w, y) / w.sum()
    q = float(np.sum(w * (y - mu) ** 2))
    c = w.sum() - np.sum(w * w) / w.sum()
    return max(0.0, (q - (y.size - 1)) / c) if c > 0 else 0.0


def _clean(estimates, ses, labels):
    rows, dropped = [], []
    for i, (e, s) in enumerate(zip(estimates, ses)):
        lab = labels[i] if labels and i < len(labels) else f"Row {i + 1}"
        ok_e = e is not None and isinstance(e, (int, float)) and math.isfinite(e)
        ok_s = s is not None and isinstance(s, (int, float)) and math.isfinite(s)
        if not ok_e or not ok_s:
            dropped.append({"label": lab, "reason": "estimate or SE missing"})
        elif s <= 0:
            dropped.append({"label": lab, "reason": "SE is not positive"})
        else:
            rows.append((lab, float(e), float(s)))
    return rows, dropped


def meta_analysis(estimates, ses, labels=None, *, method: str = "REML",
                  test: str = "knha", ci_level: float = 0.95,
                  scale: str = "difference") -> dict:
    """Common- and random-effects meta-analysis of estimates with their
    standard errors (see the module docstring). estimates and ses are on
    the pooling scale (log ratios for scale "log_ratio"; scale "ratio"
    means the caller already took logs, see from_limits). Rows with a
    missing estimate or SE, or SE <= 0, are left out and listed in
    "dropped". Result: studies (estimate, se, ci, weights in percent),
    fixed, random (tau2, tau, estimate, se and CI of the chosen test, and
    the z ones), heterogeneity (Q, df, p, I2, H2, I2 from Q), prediction
    interval, notes; with exp-transformed values when scale is a ratio."""
    if method not in METHODS:
        raise ValueError(f"unknown tau^2 method: {method}")
    if test not in ("knha", "z"):
        raise ValueError(f"unknown test: {test}")
    if scale not in SCALES:
        raise ValueError(f"unknown scale: {scale}")
    if not 0.5 < ci_level < 1:
        raise ValueError("the confidence level must be between 50% and 100%")
    rows, dropped = _clean(list(estimates), list(ses), labels)
    k = len(rows)
    if k < 2:
        raise ValueError(
            f"combining needs at least 2 rows with an estimate and a positive "
            f"SE; this table has {k}")
    lab = [r[0] for r in rows]
    y = np.array([r[1] for r in rows])
    se = np.array([r[2] for r in rows])
    v = se ** 2
    z = float(stats.norm.ppf(0.5 + ci_level / 2))
    notes = []

    # common (fixed) effect and Cochran's Q
    fe = inverse_variance_mean(y, v)
    w = 1.0 / v
    q = float(np.sum(w * (y - fe["estimate"]) ** 2))
    df = k - 1
    p_q = float(stats.chi2.sf(q, df))
    zf = fe["estimate"] / fe["se"]
    fixed = {"estimate": fe["estimate"], "se": fe["se"],
             "ci": [fe["estimate"] - z * fe["se"], fe["estimate"] + z * fe["se"]],
             "z": zf, "p": float(2 * stats.norm.sf(abs(zf)))}

    # tau^2
    tau2_se = None
    if method == "REML":
        r = tau2_reml(y, v)
        if not r["converged"]:
            raise ValueError("the REML estimate of tau^2 did not converge; "
                             "try the DerSimonian-Laird estimator")
        tau2 = r["tau2"]
    else:
        tau2 = tau2_dl(y, v)
    ws = 1.0 / (v + tau2)
    sws = float(ws.sum())
    if method == "REML":
        info = 0.5 * (np.sum(ws ** 2) - 2 * np.sum(ws ** 3) / sws
                      + np.sum(ws ** 2) ** 2 / sws ** 2)
        tau2_se = float(1.0 / math.sqrt(info)) if info > 0 else None

    re = inverse_variance_mean(y, v + tau2)
    mu, se_z = re["estimate"], re["se"]
    resid = float(np.sum(ws * (y - mu) ** 2))
    se_hk = math.sqrt(resid / (df * sws))
    t = float(stats.t.ppf(0.5 + ci_level / 2, df))
    z_ci = [mu - z * se_z, mu + z * se_z]
    hk_ci = [mu - t * se_hk, mu + t * se_hk]
    zr = mu / se_z
    stat_hk = mu / se_hk if se_hk > 0 else (math.copysign(math.inf, mu) if mu else math.nan)
    p_z = float(2 * stats.norm.sf(abs(zr)))
    p_hk = (float(2 * stats.t.sf(abs(stat_hk), df)) if math.isfinite(stat_hk)
            else (0.0 if mu else None))
    if test == "knha":
        random = {"estimate": mu, "se": se_hk, "ci": hk_ci, "stat": stat_hk,
                  "stat_name": "t", "df": df, "p": p_hk}
    else:
        random = {"estimate": mu, "se": se_z, "ci": z_ci, "stat": zr,
                  "stat_name": "z", "df": None, "p": p_z}
    random.update({"method": method, "test": test, "tau2": tau2,
                   "tau2_se": tau2_se, "tau": math.sqrt(tau2),
                   "se_z": se_z, "ci_z": z_ci, "p_z": p_z, "se_hk": se_hk,
                   "ci_hk": hk_ci, "p_hk": p_hk})

    # heterogeneity
    s2 = df * float(w.sum()) / (float(w.sum()) ** 2 - float(np.sum(w * w)))
    i2 = 100.0 * tau2 / (tau2 + s2)
    h2 = (tau2 + s2) / s2
    i2_q = 100.0 * max(0.0, (q - df) / q) if q > 0 else 0.0
    heterogeneity = {"Q": q, "df": df, "p": p_q, "I2": i2, "H2": h2,
                     "I2_Q": i2_q, "s2": s2}

    # prediction interval (k >= 3)
    if k >= 3:
        tp = float(stats.t.ppf(0.5 + ci_level / 2, k - 2))
        se_p = math.sqrt(tau2 + random["se"] ** 2)
        prediction = {"ci": [mu - tp * se_p, mu + tp * se_p], "df": k - 2,
                      "se": se_p}
    else:
        prediction = None
        notes.append("No prediction interval: it needs at least 3 rows.")

    if k < 5:
        notes.append(
            f"Only {k} rows: tau^2 is estimated poorly with so few, and is "
            "often 0 even when the experiments differ. The Hartung-Knapp "
            "interval allows for that uncertainty; the z interval does not "
            "(IntHout et al. 2014, BMC Med Res Methodol 14:25).")
    if tau2 == 0 and q > 0:
        notes.append("tau^2 is estimated as 0: the random-effects result "
                     "equals the common-effect result.")
    if np.ptp(y) == 0:
        notes.append("All estimates are equal: there is no spread to "
                     "estimate a CI from under Hartung-Knapp.")

    sw_fe = float(w.sum())
    studies = [{"label": lab[i], "estimate": float(y[i]), "se": float(se[i]),
                "ci": [float(y[i] - z * se[i]), float(y[i] + z * se[i])],
                "weight_fixed": 100.0 * float(w[i]) / sw_fe,
                "weight_random": 100.0 * float(ws[i]) / sws}
               for i in range(k)]
    out = {"k": k, "studies": studies, "dropped": dropped,
           "fixed": fixed, "random": random, "heterogeneity": heterogeneity,
           "prediction": prediction, "ci_level": ci_level, "scale": scale,
           "method": method, "test": test, "notes": notes}
    if scale in ("log_ratio", "ratio"):
        ex = _exp
        for s in studies:
            s["ratio"], s["ratio_ci"] = ex(s["estimate"]), [ex(c) for c in s["ci"]]
        for blk in (fixed, random):
            blk["ratio"] = ex(blk["estimate"])
            blk["ratio_ci"] = [ex(c) for c in blk["ci"]]
        random["ratio_ci_z"] = [ex(c) for c in z_ci]
        if prediction:
            prediction["ratio_ci"] = [ex(c) for c in prediction["ci"]]
    return out


def _exp(x):
    try:
        return math.exp(x)
    except OverflowError:
        return math.inf


def from_limits(estimates, lowers, uppers, *, level: float = 0.95,
                ratio: bool = False):
    """Estimates and SEs from CI limits: SE = (upper - lower) / (2 z),
    on the log scale for ratios (each ratio and limit must then be
    positive). Returns (estimates, ses, problems) with None where a row
    cannot be read; problems names each such row's reason by index."""
    z = float(stats.norm.ppf(0.5 + level / 2))
    est, ses, problems = [], [], {}
    for i, (e, lo, hi) in enumerate(zip(estimates, lowers, uppers)):
        vals = (e, lo, hi)
        if any(x is None or not math.isfinite(x) for x in vals):
            est.append(None), ses.append(None)
            continue
        if lo > hi:
            lo, hi = hi, lo
        if ratio:
            if min(vals) <= 0:
                est.append(None), ses.append(None)
                problems[i] = "a ratio or limit is not positive"
                continue
            e, lo, hi = math.log(e), math.log(lo), math.log(hi)
        est.append(e)
        ses.append((hi - lo) / (2 * z))
    return est, ses, problems


# Summary formats of a grouped table row (web: SUBCOLUMN_FORMAT_ENGINE).
FORMATS = ("mean_sem", "mean_sem_n", "mean_sd_n", "mean_ci_n", "mean_limits")


def read_rows(rows, fmt: str, *, scale: str = "difference",
              limits_level: float = 0.95):
    """Labels, estimates and SEs (on the pooling scale) from table rows
    [{"label", "values": [subcolumns]}] in a summary format: estimate and
    SE (Mean, SEM), mean with SD and N (SE = SD / sqrt(N): pooling means),
    or the estimate with CI limits (Mean, lower, upper, N at 95%; Mean,
    upper, lower at limits_level; SE = (upper - lower) / (2 z), which
    assumes a symmetric interval on the pooling scale). Ratios ("ratio"
    scale) come with CI limits and are logged here. Returns (labels,
    estimates, ses, problems) with problems {label: reason} for rows that
    cannot be read."""
    if fmt not in FORMATS:
        raise ValueError(
            "combining experiments needs an estimate and its SE or CI per "
            "row: set the table's subcolumns to Mean, SEM (estimate, SE) or "
            "to Mean, upper limit, lower limit")
    if scale == "ratio" and fmt not in ("mean_ci_n", "mean_limits"):
        raise ValueError(
            "ratios need their CI limits (Mean, upper limit, lower limit) to "
            "be pooled on the log scale; or enter log ratios with their SE "
            "and choose 'Log ratios'")
    labels, est, ses = [], [], []

    def num(vals, i):
        v = vals[i] if i < len(vals) else None
        return (float(v) if isinstance(v, (int, float)) and math.isfinite(v)
                else None)

    los, his = [], []
    for i, r in enumerate(rows):
        vals = list(r.get("values") or [])
        labels.append(str(r.get("label") or f"Row {i + 1}"))
        if fmt in ("mean_sem", "mean_sem_n"):
            est.append(num(vals, 0))
            ses.append(num(vals, 1))
        elif fmt == "mean_sd_n":
            m, sd, n = num(vals, 0), num(vals, 1), num(vals, 2)
            est.append(m)
            ses.append(sd / math.sqrt(n) if sd is not None and n is not None
                       and n >= 1 else None)
        else:
            est.append(num(vals, 0))
            lo, hi = ((num(vals, 1), num(vals, 2)) if fmt == "mean_ci_n"
                      else (num(vals, 2), num(vals, 1)))
            los.append(lo)
            his.append(hi)
    problems = {}
    if fmt in ("mean_ci_n", "mean_limits"):
        level = 0.95 if fmt == "mean_ci_n" else limits_level
        est, ses, bad = from_limits(est, los, his, level=level,
                                    ratio=scale == "ratio")
        problems = {labels[i]: why for i, why in bad.items()}
    return labels, est, ses, problems
