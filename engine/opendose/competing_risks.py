"""Competing risks: cumulative incidence (Aalen-Johansen) and Gray's test.

When a subject can have one of several kinds of event (death from the
tumour, death from another cause), and the first one ends follow-up, the
probability of having had event k by time t is the cumulative incidence
function (CIF)

    F_k(t) = sum over event times t_j <= t of S(t_j-) d_kj / n_j

where S is the Kaplan-Meier estimate of being free of every kind of
event, d_kj the events of kind k at t_j and n_j the number at risk just
before t_j: the Aalen-Johansen estimator for the competing-risks model
(Aalen, O. O. & Johansen, S. (1978) Scand J Statist 5:141-150;
Kalbfleisch, J. D. & Prentice, R. L. (2002) The Statistical Analysis of
Failure Time Data, 2nd ed., Wiley, section 8.2). 1 - Kaplan-Meier of one
kind of event, with the other kinds censored, is larger than F_k and is
not a probability of anything observable when the other kinds exist
(Putter, Fiocco & Geskus (2007) Stat Med 26:2389), so this module never
returns it.

Methods and sources:

- Variance of F_k(t): the delta-method (Aalen-type) estimator of Gray's
  ``cinc`` routine in the R package cmprsk (Gray, R. J., cmprsk 2.2-12,
  2024, ``cuminc``), with the hypergeometric correction for tied events
  (1 - (d - 1)/(n - 1)). Only cause-k event times update it, as cmprsk
  reports it, so the variance shown at a time is the one of the last
  cause-k event up to that time.
- Confidence interval of F_k(t): on the log(-log) scale,
  F^exp(+-z se / (F log F)) (Choudhury, J. B. (2002) Stat Med 21:1129;
  as R's tidycmprsk prints for cmprsk's estimates). Undefined where
  F = 0 or F = 1.
- Gray's test: the K-sample test of equal cumulative incidence of one
  kind of event (Gray, R. J. (1988) Ann Statist 16:1141-1154), score
  sum_t W (d_1k - R_k d_1 / R) with the subdistribution risk set
  R_k(t) = n_k(t) (1 - F_1k(t-)) / S_k(t-), weight (1 - F_1(t-))^rho
  (rho = 0, cmprsk's default, the log-rank-like weight), and the
  asymptotic covariance of Gray's paper as cmprsk's ``crstm`` computes
  it. The statistic s' V^-1 s on the first K - 1 groups is chi-square on
  K - 1 df.
- Values at chosen times follow cmprsk's ``timepoints``: the estimate at
  the last cause-k event time up to t; a time after a group's last
  follow-up has no estimate.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats


def _f(x):
    """Python float, or None for None/NaN/inf."""
    if x is None:
        return None
    x = float(x)
    return x if math.isfinite(x) else None


# ---------------------------------------------------------------------------
# payload parsing


def groups_from_datasets(datasets):
    """Survival datasets with event codes 0 (censored), 1, 2, ... (one
    code per kind of event). datasets: [{"name", "ys": [[time, code,
    ...], ...]}]. A row is used when its time is a finite number >= 0 and
    its code a whole number >= 0; any other non-blank row is left out
    with a reason. Returns (groups, names, dropped): groups = [(times,
    codes)], dropped = [{"group", "group_index", "row", "reason"}] (row
    None: the whole group had no usable rows)."""
    groups, names, dropped = [], [], []
    for gi, ds in enumerate(datasets or []):
        name = ds.get("name", "") if isinstance(ds, dict) else ""
        rows = ds.get("ys", []) if isinstance(ds, dict) else []
        times, codes = [], []
        for ri, row in enumerate(rows or []):
            cells = list(row) if isinstance(row, (list, tuple)) else [row]
            t = cells[0] if len(cells) >= 1 else None
            e = cells[1] if len(cells) >= 2 else None
            if t is None and e is None:
                continue  # a blank row (covariates alone do not make a subject)
            reason = None
            if t is None:
                reason = "missing time"
            elif e is None:
                reason = "missing event code"
            else:
                try:
                    tf, ef = float(t), float(e)
                except (TypeError, ValueError):
                    reason = "time or event code is not a number"
                else:
                    if not math.isfinite(tf):
                        reason = "time is not a finite number"
                    elif tf < 0:
                        reason = "time is negative"
                    elif not math.isfinite(ef) or ef < 0 or ef != int(ef):
                        reason = (f"event code {e!r} is not 0 (censored) or a "
                                  "whole number for the kind of event")
            if reason is not None:
                dropped.append({"group": name, "group_index": gi,
                                "row": ri, "reason": reason})
                continue
            times.append(float(t))
            codes.append(int(float(e)))
        if times:
            groups.append((times, codes))
            names.append(name)
        else:
            dropped.append({"group": name, "group_index": gi, "row": None,
                            "reason": "no usable rows; group left out"})
    return groups, names, dropped


# ---------------------------------------------------------------------------
# cumulative incidence of one cause in one group


def _distinct(times):
    """Sorted distinct times with the row indices at each."""
    order = sorted(range(len(times)), key=lambda i: times[i])
    out = []
    for i in order:
        if out and out[-1][0] == times[i]:
            out[-1][1].append(i)
        else:
            out.append((times[i], [i]))
    return out


def cumulative_incidence(times, codes, cause, ci_level=0.95):
    """Aalen-Johansen estimate of F_cause(t) in one group, with cmprsk's
    variance. Returns {"steps": [{time, at_risk, events, competing,
    censored, cif, se, lower, upper}] (one row per distinct time at which
    an event of ``cause`` happened), "points": the step curve [{time,
    cif, lower, upper}] from (0, 0) to the last follow-up, "n",
    "events", "competing", "censored", "last_time"}."""
    if len(times) != len(codes):
        raise ValueError("times and codes differ in length")
    if not times:
        raise ValueError("no survival data")
    z = float(stats.norm.ppf((1 + ci_level) / 2))
    n = len(times)
    fk = 1.0       # Kaplan-Meier of being free of every event, S(t-)
    cif = 0.0
    v1 = v2 = v3 = 0.0
    var = 0.0
    rs = n
    steps = []
    points = [{"time": 0.0, "cif": 0.0, "lower": None, "upper": None}]
    for t, idx in _distinct(times):
        c = [codes[i] for i in idx]
        nd1 = sum(1 for k in c if k == cause)
        nd2 = sum(1 for k in c if k != 0 and k != cause)
        ncens = sum(1 for k in c if k == 0)
        nd = nd1 + nd2
        if nd > 0:
            fkn = fk * (rs - nd) / rs
            if nd1 > 0:
                cif = cif + fk * nd1 / rs
            if nd2 > 0 and fkn > 0:
                t5 = 1.0 - (nd2 - 1.0) / (rs - 1.0) if nd2 > 1 else 1.0
                t6 = fk * fk * t5 * nd2 / (rs * rs)
                t3 = 1.0 / fkn
                t4 = cif / fkn
                v1 += t4 * t4 * t6
                v2 += t3 * t4 * t6
                v3 += t3 * t3 * t6
            if nd1 > 0:
                t5 = 1.0 - (nd1 - 1.0) / (rs - 1.0) if nd1 > 1 else 1.0
                t6 = fk * fk * t5 * nd1 / (rs * rs)
                t3 = 1.0 / fkn if fkn > 0 else 0.0
                t4 = 1.0 + t3 * cif
                v1 += t4 * t4 * t6
                v2 += t3 * t4 * t6
                v3 += t3 * t3 * t6
                var = v1 + cif * cif * v3 - 2.0 * cif * v2
                se = math.sqrt(var) if var > 0 else 0.0
                lo, hi = _loglog_ci(cif, se, z)
                steps.append({"time": t, "at_risk": rs, "events": nd1,
                              "competing": nd2, "censored": ncens,
                              "cif": cif, "se": se, "lower": lo,
                              "upper": hi})
                points.append({"time": t, "cif": cif, "lower": lo,
                               "upper": hi})
            fk = fkn
        rs -= len(idx)
    last = max(times)
    if points[-1]["time"] < last:
        points.append({**points[-1], "time": last})
    return {"steps": steps, "points": points, "n": n,
            "events": sum(1 for k in codes if k == cause),
            "competing": sum(1 for k in codes if k not in (0, cause)),
            "censored": sum(1 for k in codes if k == 0),
            "last_time": last}


def _loglog_ci(f, se, z):
    """F^exp(+-z se / (F log F)); None where F is 0 or 1 or se is 0."""
    if not (0 < f < 1) or not se > 0:
        return None, None
    a = math.exp(z * se / (f * math.log(f)))
    lims = sorted((f ** a, f ** (1.0 / a)))
    return lims[0], lims[1]


def value_at(cif_result, t):
    """cmprsk ``timepoints``: the step at the last cause event time <= t
    ({cif, se, lower, upper}); zeros before the first event; None after
    the last follow-up."""
    if t > cif_result["last_time"]:
        return None
    row = {"cif": 0.0, "se": 0.0, "lower": None, "upper": None}
    for s in cif_result["steps"]:
        if s["time"] <= t:
            row = {k: s[k] for k in ("cif", "se", "lower", "upper")}
        else:
            break
    return row


# ---------------------------------------------------------------------------
# Gray's test


def gray_test(groups, cause, rho=0.0):
    """Gray's (1988) K-sample test of equal cumulative incidence of
    ``cause`` (one stratum). groups: [(times, codes)], codes 0 =
    censored. Returns {"chi2", "df", "p", "score", "variance"}; chi2 and
    p are None when the variance matrix is singular (e.g. no events of
    this cause)."""
    ng = len(groups)
    if ng < 2:
        raise ValueError("Gray's test needs two or more groups")
    y, m, g = [], [], []
    for gi, (times, codes) in enumerate(groups):
        for t, c in zip(times, codes):
            y.append(float(t))
            m.append(0 if c == 0 else (1 if c == cause else 2))
            g.append(gi)
    order = sorted(range(len(y)), key=lambda i: y[i])
    y = [y[i] for i in order]
    m = [m[i] for i in order]
    g = [g[i] for i in order]
    n = len(y)
    ng1 = ng - 1
    rs = np.zeros(ng)
    for gi in g:
        rs[gi] += 1
    s = np.zeros(ng1)
    v = np.zeros((ng1, ng1))
    f1m = np.zeros(ng)
    f1 = np.zeros(ng)
    skmm = np.ones(ng)
    skm = np.ones(ng)
    v3 = np.zeros(ng)
    v2 = np.zeros((ng1, ng))
    c = np.zeros((ng, ng))
    fm = 0.0
    f = 0.0
    ll = 0
    while ll < n:
        lu = ll
        while lu + 1 < n and y[lu + 1] == y[ll]:
            lu += 1
        d = np.zeros((3, ng))
        for i in range(ll, lu + 1):
            d[m[i], g[i]] += 1
        nd1 = d[1].sum()
        nd2 = d[2].sum()
        if nd1 > 0 or nd2 > 0:
            tr = 0.0
            tq = 0.0
            for i in range(ng):
                if rs[i] <= 0:
                    continue
                td = d[1, i] + d[2, i]
                skm[i] = skmm[i] * (rs[i] - td) / rs[i]
                f1[i] = f1m[i] + skmm[i] * d[1, i] / rs[i]
                tr += rs[i] / skmm[i]
                tq += rs[i] * (1 - f1m[i]) / skmm[i]
            f = fm + nd1 / tr
            fb = (1 - fm) ** rho
            a = np.zeros((ng, ng))
            for i in range(ng):
                if rs[i] <= 0:
                    continue
                t1 = rs[i] / skmm[i]
                a[i, i] = fb * t1 * (1 - t1 / tr)
                if a[i, i] != 0:
                    c[i, i] += a[i, i] * nd1 / (tr * (1 - fm))
                for j in range(i + 1, ng):
                    if rs[j] <= 0:
                        continue
                    a[i, j] = -fb * t1 * rs[j] / (skmm[j] * tr)
                    if a[i, j] != 0:
                        c[i, j] += a[i, j] * nd1 / (tr * (1 - fm))
            for i in range(1, ng):
                for j in range(i):
                    a[i, j] = a[j, i]
                    c[i, j] = c[j, i]
            for i in range(ng1):
                if rs[i] <= 0:
                    continue
                s[i] += fb * (d[1, i] - nd1 * rs[i] * (1 - f1m[i])
                              / (skmm[i] * tq))
            if nd1 > 0:
                for k in range(ng):
                    if rs[k] <= 0:
                        continue
                    t4 = 1 - (1 - f) / skm[k] if skm[k] > 0 else 1.0
                    t5 = (1 - (nd1 - 1) / (tr * skmm[k] - 1)
                          if nd1 > 1 else 1.0)
                    t3 = t5 * skmm[k] * nd1 / (tr * rs[k])
                    v3[k] += t4 * t4 * t3
                    for i in range(ng1):
                        t1 = a[i, k] - t4 * c[i, k]
                        v2[i, k] += t1 * t4 * t3
                        for j in range(i + 1):
                            t2 = a[j, k] - t4 * c[j, k]
                            v[i, j] += t1 * t2 * t3
            if nd2 > 0:
                for k in range(ng):
                    if skm[k] <= 0 or d[2, k] <= 0:
                        continue
                    t4 = (1 - f) / skm[k]
                    t5 = (1 - (d[2, k] - 1.0) / (rs[k] - 1.0)
                          if d[2, k] > 1 else 1.0)
                    t3 = t5 * (skmm[k] ** 2) * d[2, k] / (rs[k] ** 2)
                    v3[k] += t4 * t4 * t3
                    for i in range(ng1):
                        t1 = t4 * c[i, k]
                        v2[i, k] -= t1 * t4 * t3
                        for j in range(i + 1):
                            t2 = t4 * c[j, k]
                            v[i, j] += t1 * t2 * t3
        if lu >= n - 1:
            break
        for i in range(ll, lu + 1):
            rs[g[i]] -= 1
        fm = f
        f1m = f1.copy()
        skmm = skm.copy()
        ll = lu + 1
    for i in range(ng1):
        for j in range(i + 1):
            for k in range(ng):
                v[i, j] += c[i, k] * c[j, k] * v3[k]
                v[i, j] += c[i, k] * v2[j, k]
                v[i, j] += c[j, k] * v2[i, k]
    for i in range(ng1):
        for j in range(i):
            v[j, i] = v[i, j]
    chi2 = None
    if np.linalg.matrix_rank(v) == ng1 and np.all(np.isfinite(v)):
        chi2 = float(s @ np.linalg.solve(v, s))
    p = float(stats.chi2.sf(chi2, ng1)) if chi2 is not None else None
    return {"chi2": chi2, "df": ng1, "p": p, "score": s.tolist(),
            "variance": v.tolist(), "rho": rho}


# ---------------------------------------------------------------------------
# the analysis


def competing_risks(groups, names=None, *, causes=None, times=(),
                    ci_level=0.95):
    """Cumulative incidence of each kind of event in each group and, with
    two or more groups, Gray's test per kind. groups: [(times, codes)],
    codes 0 = censored and 1, 2, ... the kinds of event. causes: the
    codes to report (default every code seen). times: chosen times for
    the at-a-time table. Returns {"causes": [{code, groups: [{name, n,
    events, competing, censored, last_time, steps, points, at_times}],
    gray: {chi2, df, p, ...} | null, note?}], "group_names",
    "competing_present", "ci_level", "method", "warnings"}."""
    groups = [(list(map(float, t)), list(map(int, c))) for t, c in groups]
    if not groups:
        raise ValueError("no survival data (need time + event code "
                         "subcolumns)")
    names = [str(x) for x in (names or [f"Group {i + 1}"
                                         for i in range(len(groups))])]
    if len(names) != len(groups):
        raise ValueError("names must match groups")
    seen = sorted({c for _, cs in groups for c in cs if c != 0})
    if causes is None:
        causes = seen
    causes = [int(c) for c in causes]
    if not causes:
        raise ValueError("no events of any kind: every subject is "
                         "censored, so there is no cumulative incidence "
                         "to estimate")
    warnings = []
    if len(seen) < 2:
        warnings.append(
            "Only one kind of event in the data (event codes "
            + ", ".join(str(c) for c in seen)
            + "): with no competing event the cumulative incidence equals "
            "1 - Kaplan-Meier. Code each other kind of event 2, 3, ...")
    out_causes = []
    for cause in causes:
        per = []
        for (t, c), nm in zip(groups, names):
            r = cumulative_incidence(t, c, cause, ci_level)
            r["name"] = nm
            r["at_times"] = []
            for tt in times or ():
                v = value_at(r, float(tt))
                r["at_times"].append(
                    {"time": float(tt), **(v or {"cif": None, "se": None,
                                                 "lower": None,
                                                 "upper": None}),
                     "beyond_last": v is None})
            per.append(r)
        entry = {"code": cause, "groups": per, "gray": None}
        if len(groups) >= 2:
            gt = gray_test(groups, cause)
            entry["gray"] = gt
            if gt["chi2"] is None:
                entry["note"] = ("Gray's test could not be computed: its "
                                 "variance is zero or singular (no events "
                                 "of this kind in the groups compared).")
        out_causes.append(entry)
    for (t, c), nm in zip(groups, names):
        ev = sum(1 for k in c if k != 0)
        if 0 < ev < 5:
            warnings.append(f"{nm}: {ev} event{'s' if ev != 1 else ''} in "
                            "all; cumulative incidence CIs and Gray's test "
                            "are large-sample approximations.")
    return {"causes": out_causes, "group_names": names,
            "codes_seen": seen, "competing_present": len(seen) >= 2,
            "ci_level": ci_level,
            "method": ("Aalen-Johansen cumulative incidence with cmprsk's "
                       "delta-method variance and log(-log) CIs; Gray's "
                       "(1988) test, rho = 0."),
            "warnings": warnings}
