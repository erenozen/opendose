"""Survival extras: pairwise log-rank, log-rank test for trend, survival
at chosen times, restricted mean survival time and few-events warnings.

Methods and sources:

- Pairwise comparisons of survival curves. GraphPad Prism statistics
  guide, "Multiple comparisons of survival curves": analyse each pair of
  groups as a separate two-group log-rank test and correct for the number
  of comparisons (Bonferroni). Each pair is
  ``survival.compare_survival`` on the two-group subset, so its chi-square
  is the same log-rank statistic the engine reports for two groups (Peto
  form sum((O-E)^2/E) for Prism parity; the Mantel-Haenszel variance form
  U^2/V that R's ``survival::survdiff`` prints is also given). The
  adjustments are those of ``opendose.fdr``: Bonferroni P*K, Sidak
  1-(1-P)^K, Holm (1979) step-down Bonferroni, and the step-down
  Holm-Sidak method of the guide's one-way ANOVA pages ("Holm-Sidak
  multiple comparisons test"), made monotone. K is exactly the size of
  the family asked for: all k(k-1)/2 pairs, or the k-1 comparisons with a
  control group.
- Log-rank test for trend. GraphPad Prism statistics guide, "Log-rank
  test for trend" (ordered groups, scores 1..k by default); Collett, D.
  (2015) Modelling Survival Data in Medical Research, 3rd ed., Chapman &
  Hall/CRC, chapter 2, "log-rank test for trend": U_T = sum_k w_k (O_k -
  E_k) with variance V_T = sum_k sum_l w_k w_l V_kl, where V is the
  hypergeometric covariance matrix of the (O - E) vector summed over the
  distinct event times; U_T^2 / V_T is chi-square on 1 df. Also the
  simpler approximation of Altman, D. G. (1991) Practical Statistics for
  Medical Research, Chapman & Hall, section 13.6 (Peto et al. 1977):
  U_T^2 / [sum w^2 E - (sum w E)^2 / sum E].
- Survival at chosen times. Kaplan-Meier product-limit estimate with
  Greenwood's variance and the log-log confidence interval, exactly as
  ``survival.km_curve``; the at-risk count and the treatment of times
  after the last observation follow R's ``summary(survfit(...), times =
  ...)`` (Therneau, survival package documentation, ``summary.survfit``:
  n.risk = number with T >= t; times beyond the last observed time are
  not reported unless extend = TRUE).
- Restricted mean survival time (RMST): the area under the Kaplan-Meier
  curve up to a truncation time tau (Royston, P. & Parmar, M. K. B.
  (2013) BMC Med Res Methodol 13:152; Uno, H. et al. (2014) J Clin Oncol
  32:2380-2385). Standard error exactly as the ``rmst1`` function of the R
  package survRM2 (Uno et al.): sum over the distinct times t_i <= tau of
  (integral of S from t_i to tau)^2 * d_i / (n_i (n_i - d_i)). Between
  groups, survRM2's ``rmst2`` contrasts: difference arm1 - arm0 with SE
  sqrt(var1 + var0), ratio arm1 / arm0 on the log scale with SE
  sqrt(var1/rmst1^2 + var0/rmst0^2), normal-theory CIs and P values.
- Few-events warning: the log-rank statistic is referred to its
  large-sample chi-square distribution, and the hazard ratio and survival
  CIs are large-sample too (Collett 2015, chapter 2; Machin, Cheung &
  Parmar (2006) Survival Analysis: A Practical Approach, 2nd ed.); with
  few events these approximations are rough.
"""

from __future__ import annotations

import math
from itertools import combinations

import numpy as np
from scipy import stats

from . import fdr
from .survival import _weighted_logrank, compare_survival

CORRECTIONS = ("bonferroni", "holm_sidak", "holm", "sidak", "none")


def _f(x):
    """Python float, or None for None/NaN/inf."""
    if x is None:
        return None
    x = float(x)
    return x if math.isfinite(x) else None


def _fmt(x) -> str:
    """Compact number for explanation text (no trailing zeros)."""
    return f"{float(x):.4g}"


# ---------------------------------------------------------------------------
# 1. payload parsing


def groups_from_datasets(datasets):
    """Parse survival datasets as ``api._survival`` does.

    datasets: [{"name": str, "ys": [[time, event], ...]}, ...] (one per
    group). A row is used when it has at least two cells and neither time
    nor event is None, exactly as ``api._survival``; in addition rows whose
    time is not finite, or whose event code is not 0 or 1, are left out
    (they would otherwise be miscounted). Completely empty rows (no values
    at all) are blank table rows, not data, and are skipped without a
    note. Returns (groups, names, dropped): groups = [(times, events)],
    names = [str], dropped = [{"group", "group_index", "row", "reason"}]
    for every left-out row, and one entry with row None for every dataset
    left out because it had no usable rows.
    """
    groups, names, dropped = [], [], []
    for gi, ds in enumerate(datasets or []):
        name = ds.get("name", "") if isinstance(ds, dict) else ""
        rows = ds.get("ys", []) if isinstance(ds, dict) else []
        times, events = [], []
        for ri, row in enumerate(rows or []):
            cells = list(row) if isinstance(row, (list, tuple)) else [row]
            if all(c is None for c in cells):
                continue
            t = cells[0] if len(cells) >= 1 else None
            e = cells[1] if len(cells) >= 2 else None
            reason = None
            if t is None:
                reason = "missing time"
            elif e is None:
                reason = "missing event code"
            else:
                try:
                    tf = float(t)
                    ef = float(e)
                except (TypeError, ValueError):
                    reason = "time or event is not a number"
                else:
                    if not math.isfinite(tf):
                        reason = "time is not a finite number"
                    elif ef not in (0.0, 1.0):
                        reason = (f"event code {e!r} is not 1 (event) or 0 "
                                  "(censored)")
            if reason is not None:
                dropped.append({"group": name, "group_index": gi,
                                "row": ri, "reason": reason})
                continue
            times.append(float(t))
            events.append(int(float(e)))
        if times:
            groups.append((times, events))
            names.append(name)
        else:
            dropped.append({"group": name, "group_index": gi, "row": None,
                            "reason": "no usable rows; group left out"})
    return groups, names, dropped


def _check_groups(groups, names, minimum=1):
    groups = [(list(t), list(e)) for t, e in groups]
    if len(groups) < minimum:
        raise ValueError(f"need at least {minimum} group(s) with survival "
                         "data")
    if names is None:
        names = [f"Group {i + 1}" for i in range(len(groups))]
    names = [str(n) for n in names]
    if len(names) != len(groups):
        raise ValueError("names must match groups")
    for (t, e), nm in zip(groups, names):
        if len(t) != len(e):
            raise ValueError(f"group {nm!r}: times and events differ in "
                             "length")
        if not t:
            raise ValueError(f"group {nm!r} has no survival data")
    return groups, names


# ---------------------------------------------------------------------------
# Kaplan-Meier at every distinct time (R survfit rows)


def _km_steps(times, events):
    """Rows of R's survfit at each distinct time (events and censored):
    time, n_risk (T >= t), n_event, n_censor, surv (S just after t),
    greenwood (cumulative sum d/(n(n-d)), terms with n == d skipped as in
    survival.km_curve)."""
    pairs = sorted((float(t), int(e)) for t, e in zip(times, events))
    n = len(pairs)
    tt = np.array([p[0] for p in pairs])
    ee = np.array([p[1] for p in pairs])
    rows = []
    s, gw = 1.0, 0.0
    for t in np.unique(tt):
        at = tt == t
        n_risk = int(np.sum(tt >= t))
        d = int(np.sum(ee[at] == 1))
        c = int(np.sum(at)) - d
        if d > 0:
            s *= (n_risk - d) / n_risk
            if n_risk > d:
                gw += d / (n_risk * (n_risk - d))
        rows.append({"time": float(t), "n_risk": n_risk, "n_event": d,
                     "n_censor": c, "surv": s, "greenwood": gw})
    return rows, n, int(np.sum(ee == 1))


# ---------------------------------------------------------------------------
# 2. pairwise log-rank


def _adjust(pvals, correction):
    """Adjust the valid P values within a family of size len(pvals);
    untestable comparisons (None) count in the family with P = 1."""
    p = np.array([1.0 if v is None else float(v) for v in pvals])
    if p.size == 0:
        return []
    func = {"bonferroni": fdr.bonferroni, "holm_sidak": fdr.holm_sidak,
            "holm": fdr.holm, "sidak": fdr.sidak}.get(correction)
    adj = p if func is None else func(p)
    return [None if v is None else float(a) for v, a in zip(pvals, adj)]


_CORRECTION_TEXT = {
    "bonferroni": "Bonferroni: P x K, capped at 1",
    "sidak": "Sidak: 1 - (1 - P)^K",
    "holm_sidak": ("Holm-Sidak step-down: the i-th smallest P becomes "
                   "1 - (1 - P)^(K - i + 1), made monotone"),
    "holm": ("Holm step-down Bonferroni: the i-th smallest P times "
             "(K - i + 1), made monotone"),
    "none": "no correction for multiple comparisons",
}


def pairwise_logrank(groups, names=None, *, family="all", control=0,
                     correction="bonferroni", ci_level=0.95,
                     statistic="peto", trend_scores=None):
    """Log-rank test for each pair of survival curves, adjusted for the
    family of comparisons (GraphPad guide "Multiple comparisons of
    survival curves").

    groups: [(times, events), ...] (events 1 = event, 0 = censored);
    family "all" (every pair) or "control" (each group vs the group at
    index ``control``); correction "bonferroni" | "holm_sidak" | "holm" |
    "sidak" | "none"; statistic "peto" (Prism's sum((O-E)^2/E), default)
    or "variance" (U^2/V, R's survdiff) picks the chi2 and p_unadjusted
    columns (both forms are always reported). The trend test (all groups,
    in the given order) is added when there are 3 or more groups.
    """
    groups, names = _check_groups(groups, names, minimum=2)
    k = len(groups)
    family = (family or "all").lower()
    if family not in ("all", "control"):
        raise ValueError("family must be 'all' or 'control'")
    correction = fdr.canonical_method(correction or "bonferroni")
    if correction not in CORRECTIONS:
        raise ValueError("correction must be one of " + ", ".join(CORRECTIONS))
    statistic = (statistic or "peto").lower()
    if statistic not in ("peto", "variance"):
        raise ValueError("statistic must be 'peto' or 'variance'")
    if not 0 < float(ci_level) < 1:
        raise ValueError("ci_level must be between 0 and 1")

    if family == "control":
        control = int(control)
        if not 0 <= control < k:
            raise ValueError(f"control index {control} out of range "
                             f"(0..{k - 1})")
        pairs = [(control, j) for j in range(k) if j != control]
        fam_label = (f"each group vs. {names[control]} (control): "
                     f"{len(pairs)} comparisons")
    else:
        pairs = list(combinations(range(k), 2))
        fam_label = f"all pairs: {len(pairs)} comparisons"
    m = len(pairs)

    warnings: list[str] = []
    rows = []
    for i, j in pairs:
        res = compare_survival([groups[i], groups[j]], [names[i], names[j]],
                               ci_level=ci_level)
        lr = res["logrank"]
        c_peto, p_peto = _f(lr["chi2_peto"]), _f(lr["p_peto"])
        c_var, p_var = _f(lr["chi2_variance"]), _f(lr["p_variance"])
        chi2, p = (c_peto, p_peto) if statistic == "peto" else (c_var, p_var)
        if p is None:
            warnings.append(f"{names[i]} vs. {names[j]}: the log-rank test "
                            "cannot be computed (no events, or no subject "
                            "at risk in one group at the event times); "
                            "counted in the family with P = 1")
        hr = res.get("hazard_ratio")
        rows.append({
            "a": names[i], "b": names[j], "a_index": i, "b_index": j,
            "chi2": chi2, "df": 1, "p_unadjusted": p,
            "chi2_peto": c_peto, "p_peto": p_peto,
            "chi2_variance": c_var, "p_variance": p_var,
            "hr": _f(hr["value"]) if hr else None,
            "hr_ci": [_f(v) for v in hr["ci"]] if hr else None,
            "hr_method": ("Mantel-Haenszel (exp((O_a - E_a)/V)), hazard "
                          f"of {names[i]} relative to {names[j]}"
                          if hr else None),
            "observed": [float(v) for v in lr["observed"]],
            "expected": [float(v) for v in lr["expected"]],
        })
    adj = _adjust([r["p_unadjusted"] for r in rows], correction)
    method_row = (f"two-group log-rank ({'Peto form' if statistic == 'peto' else 'variance form'}"
                  f"), {_CORRECTION_TEXT[correction]}, K = {m}")
    for r, pa in zip(rows, adj):
        r["p_adjusted"] = pa
        r["significant_05"] = bool(pa is not None and pa < 0.05)
        r["family_size"] = m
        r["method"] = method_row

    trend = None
    if k >= 3:
        trend = logrank_trend(groups, names, scores=trend_scores)

    stat_text = ("chi2 / p_unadjusted use the Peto form sum((O-E)^2/E) "
                 "(the form the engine's survival result reports, for "
                 "Prism parity)" if statistic == "peto" else
                 "chi2 / p_unadjusted use the Mantel-Haenszel variance "
                 "form U^2/V (R's survdiff)")
    method = ("Each pair of groups analysed by its own two-group log-rank "
              "test (only the two groups' subjects; GraphPad guide "
              "'Multiple comparisons of survival curves'), then the P "
              f"values corrected for the family of K = {m} comparisons ("
              f"{fam_label}): {_CORRECTION_TEXT[correction]}. {stat_text}; "
              "both forms are reported (the Peto form is never larger). "
              "hr: Mantel-Haenszel hazard ratio of a relative to b with "
              f"its {ci_level:.0%} CI (not adjusted for multiplicity).")
    return {
        "comparisons": rows, "family_size": m, "correction": correction,
        "statistic": statistic,
        "family": {"size": m, "method": correction, "label": fam_label},
        "trend": trend, "method": method, "warnings": warnings,
    }


# ---------------------------------------------------------------------------
# 3. log-rank test for trend


def logrank_trend(groups, names=None, *, scores=None):
    """Log-rank test for trend across ordered groups (GraphPad guide
    "Log-rank test for trend"; Collett 2015, ch. 2). scores: one per group
    (default 1..k in the given order)."""
    groups, names = _check_groups(groups, names, minimum=2)
    k = len(groups)
    if scores is None:
        w = np.arange(1, k + 1, dtype=float)
    else:
        w = np.asarray([float(s) for s in scores], dtype=float)
        if w.size != k or not np.all(np.isfinite(w)):
            raise ValueError("scores: one finite number per group")
        if np.ptp(w) == 0:
            raise ValueError("scores must not all be equal")
    O, E, V, _ = _weighted_logrank(groups, lambda N: 1.0)
    U = float(w @ (O - E))
    var = float(w @ V @ w)
    chi2 = U * U / var if var > 0 else float("nan")
    sE = float(np.sum(E))
    denom = (float(np.sum(w * w * E)) - float(np.sum(w * E)) ** 2 / sE
             if sE > 0 else float("nan"))
    chi2_a = U * U / denom if denom > 0 else float("nan")
    return {
        "chi2": _f(chi2), "df": 1,
        "p": _f(stats.chi2.sf(chi2, 1)) if math.isfinite(chi2) else None,
        "scores": [float(v) for v in w], "group_names": list(names),
        "chi2_approx": _f(chi2_a),
        "p_approx": (_f(stats.chi2.sf(chi2_a, 1))
                     if math.isfinite(chi2_a) else None),
        "U": U, "variance": _f(var),
        "observed": [float(v) for v in O], "expected": [float(v) for v in E],
        "method": (
            "Log-rank test for trend (GraphPad guide 'Log-rank test for "
            "trend'; Collett 2015, Modelling Survival Data in Medical "
            "Research, ch. 2): groups ordered as given with scores w "
            f"({', '.join(_fmt(v) for v in w)}); U = sum w_k (O_k - E_k); "
            "chi2 = U^2 / V with V = w'Vw, V the hypergeometric covariance "
            "of (O - E) summed over event times (equals the Cox score test "
            "for the score as a covariate when there are no tied times); "
            "1 df. chi2_approx: the simpler approximation of Altman (1991, "
            "section 13.6) and Peto et al., U^2 / [sum w^2 E - (sum w E)^2 / "
            "sum E], which uses the expected counts in place of the "
            "variance and is usually a little smaller."),
    }


# ---------------------------------------------------------------------------
# 4. survival at chosen times


def _explanation(rows, n, n_events):
    surv = [r["surv"] for r in rows]
    median = None
    for r in rows:
        if r["n_event"] > 0 and r["surv"] <= 0.5:
            median = r["time"]
            break
    last_time = rows[-1]["time"]
    s_last = surv[-1]
    if median is not None:
        # the same rule as survival.km_curve's median_survival (first
        # time S <= 0.5), so the text matches the survival result
        text = (f"median survival {_fmt(median)} (time units): the "
                "Kaplan-Meier curve reaches 50% at that time")
    else:
        text = (f"median not reached: {s_last:.0%} still event-free at the "
                f"last follow-up (time {_fmt(last_time)}); the Kaplan-Meier "
                "curve never fell to 50%, so the median survival time is "
                "not known (only that it is later than the follow-up)")
    return {"median_reached": median is not None, "median": _f(median),
            "fraction_at_last": float(s_last), "last_time": float(last_time),
            "events": int(n_events), "n": int(n), "text": text}


def survival_at_times(groups, names=None, times=(), *, ci_level=0.95):
    """Kaplan-Meier survival of each group at chosen times, with the
    Greenwood SE and the log-log CI (as survival.km_curve), and a
    per-group median explanation."""
    groups, names = _check_groups(groups, names)
    if not 0 < float(ci_level) < 1:
        raise ValueError("ci_level must be between 0 and 1")
    tq = [float(t) for t in (times or [])]
    if any(not math.isfinite(t) for t in tq):
        raise ValueError("times must be finite numbers")
    z = float(stats.norm.ppf((1 + ci_level) / 2))
    warnings: list[str] = []
    out = []
    for (tt, ee), name in zip(groups, names):
        rows, n, n_events = _km_steps(tt, ee)
        last = rows[-1]["time"]
        all_t = np.array(tt, dtype=float)
        all_e = np.array(ee, dtype=int)
        at = []
        for t in tq:
            before = [r for r in rows if r["time"] <= t]
            at_risk = int(np.sum(all_t >= t))
            ev = int(np.sum((all_t <= t) & (all_e == 1)))
            if t > last:
                at.append({"time": t, "survival": None, "se": None,
                           "ci_loglog": None, "at_risk": at_risk,
                           "events_so_far": ev, "beyond_last": True,
                           "note": (f"after the last observed time "
                                    f"({_fmt(last)}): the curve is not "
                                    "estimated there (as R's "
                                    "summary.survfit by default)")})
                warnings.append(f"{name}: time {_fmt(t)} is after the last "
                                f"observed time ({_fmt(last)}); survival "
                                "not reported")
                continue
            s = before[-1]["surv"] if before else 1.0
            gw = before[-1]["greenwood"] if before else 0.0
            # Greenwood SE; undefined where S = 0 (NaN in R and
            # statsmodels: the n == d term is infinite)
            se = s * math.sqrt(gw) if s > 0 else None
            if s >= 1.0:
                ci = [1.0, 1.0]
            elif s <= 0.0:
                ci = None
            else:
                se_ll = math.sqrt(gw) / abs(math.log(s))
                ci = [s ** math.exp(z * se_ll), s ** math.exp(-z * se_ll)]
            at.append({"time": t, "survival": float(s), "se": _f(se),
                       "ci_loglog": ci, "at_risk": at_risk,
                       "events_so_far": ev, "beyond_last": False})
        out.append({"name": name, "n": n, "events": n_events,
                    "at_times": at,
                    "explanation": _explanation(rows, n, n_events)})
    return {
        "groups": out, "ci_level": float(ci_level), "warnings": warnings,
        "columns": {
            "survival": "Kaplan-Meier S(t), including events at t",
            "se": ("Greenwood standard error of S(t); null where S = 0 "
                   "(undefined, NaN in R)"),
            "ci_loglog": (f"{ci_level:.0%} CI, log-log transform "
                          "S^exp(+-z SE/|log S|) with SE = sqrt(Greenwood); "
                          "[1, 1] where S = 1, null where S = 0"),
            "at_risk": "number at risk at t (time >= t; R's n.risk)",
            "events_so_far": "events at or before t",
            "beyond_last": ("t after the last observed time: survival not "
                            "estimated (R's default, extend = FALSE)"),
        },
    }


# ---------------------------------------------------------------------------
# 5. restricted mean survival time


def _rmst1(times, events, tau):
    """survRM2::rmst1: (rmst, variance)."""
    rows, _, _ = _km_steps(times, events)
    rows = [r for r in rows if r["time"] <= tau]
    wk_time = [r["time"] for r in rows] + [tau]
    surv = [1.0] + [r["surv"] for r in rows]
    diffs = np.diff(np.concatenate([[0.0], wk_time]))
    areas = diffs * np.array(surv)
    rmst = float(np.sum(areas))
    var = 0.0
    for i, r in enumerate(rows):
        d, n_r = r["n_event"], r["n_risk"]
        if d == 0 or n_r == d:
            continue
        tail = float(np.sum(areas[i + 1:]))  # integral of S from t_i to tau
        var += tail * tail * d / (n_r * (n_r - d))
    return rmst, var


def rmst(groups, names=None, *, tau=None, ci_level=0.95):
    """Restricted mean survival time up to tau per group, and each group's
    difference and ratio vs the first group (the reference)."""
    groups, names = _check_groups(groups, names)
    if not 0 < float(ci_level) < 1:
        raise ValueError("ci_level must be between 0 and 1")
    z = float(stats.norm.ppf((1 + ci_level) / 2))
    lasts = []
    for tt, ee in groups:
        rows, _, _ = _km_steps(tt, ee)
        lasts.append((rows[-1]["time"], rows[-1]["surv"]))
    smallest_last = min(t for t, _ in lasts)
    if tau is None:
        tau = smallest_last
        tau_rule = (f"tau = {_fmt(tau)}, the smallest of the groups' largest "
                    "observed times (survRM2's default), so every curve is "
                    "estimated up to tau")
    else:
        tau = float(tau)
        if not math.isfinite(tau) or tau <= 0:
            raise ValueError("tau must be a positive number")
        bad = [(nm, t) for nm, (t, s) in zip(names, lasts)
               if tau > t and s > 0]
        if bad:
            raise ValueError(
                "tau (" + _fmt(tau) + ") is after the largest observed time "
                "of " + ", ".join(f"{nm} ({_fmt(t)})" for nm, t in bad)
                + "; the Kaplan-Meier curve is not estimated there. Choose "
                "tau <= " + _fmt(min(t for _, t in bad))
                + " (survRM2 refuses such a tau too).")
        tau_rule = (f"tau = {_fmt(tau)}, chosen by the user (no later than "
                    "any group's largest observed time, except groups whose "
                    "curve has already reached 0)")
    warnings: list[str] = []
    per = []
    for (tt, ee), name in zip(groups, names):
        r, v = _rmst1(tt, ee, tau)
        se = math.sqrt(v)
        per.append({"name": name, "rmst": r, "se": se,
                    "ci": [r - z * se, r + z * se], "tau": tau,
                    "n": len(tt), "events": int(sum(1 for e in ee if e == 1)),
                    "variance": v})
    diffs, ratios = [], []
    ref = per[0]
    for g in per[1:]:
        est = g["rmst"] - ref["rmst"]
        se = math.sqrt(g["variance"] + ref["variance"])
        zstat = est / se if se > 0 else float("nan")
        diffs.append({
            "a": g["name"], "b": ref["name"], "reference": ref["name"],
            "label": f"{g['name']} minus {ref['name']}",
            "estimate": est, "se": se, "ci": [est - z * se, est + z * se],
            "p": (_f(2 * stats.norm.sf(abs(zstat)))
                  if math.isfinite(zstat) else None)})
        if g["rmst"] > 0 and ref["rmst"] > 0:
            lr = math.log(g["rmst"] / ref["rmst"])
            se_l = math.sqrt(g["variance"] / g["rmst"] ** 2
                             + ref["variance"] / ref["rmst"] ** 2)
            zl = lr / se_l if se_l > 0 else float("nan")
            ratios.append({
                "a": g["name"], "b": ref["name"], "reference": ref["name"],
                "label": f"{g['name']} / {ref['name']}",
                "estimate": math.exp(lr), "se_log": se_l,
                "ci": [math.exp(lr - z * se_l), math.exp(lr + z * se_l)],
                "p": (_f(2 * stats.norm.sf(abs(zl)))
                      if math.isfinite(zl) else None)})
        if se == 0:
            warnings.append(f"{g['name']} vs. {ref['name']}: the RMST "
                            "difference has zero standard error (no "
                            "estimable variance before tau); no CI or P")
    for g in per:
        if g["se"] == 0:
            warnings.append(f"{g['name']}: RMST has zero standard error "
                            "(no events with subjects remaining at risk "
                            "before tau)")
    method = (
        "Restricted mean survival time = area under the Kaplan-Meier curve "
        "from 0 to tau (Royston & Parmar 2013; Uno et al. 2014), the mean "
        "event-free time over the first tau time units. SE as R survRM2's "
        "rmst1: sum over times t_i <= tau of (area under S from t_i to "
        "tau)^2 d_i / (n_i (n_i - d_i)). Contrasts as survRM2's rmst2 with "
        f"the first group ({ref['name']}) as reference (arm 0): difference "
        "= group minus reference, SE sqrt(var + var_ref); ratio = group / "
        "reference with a log-scale CI, SE(log) = sqrt(var/rmst^2 + "
        f"var_ref/rmst_ref^2); {ci_level:.0%} normal-theory CIs and "
        "two-sided P values.")
    return {"tau": float(tau), "tau_rule": tau_rule, "groups": per,
            "difference": diffs, "ratio": ratios, "reference": ref["name"],
            "ci_level": float(ci_level), "method": method,
            "warnings": warnings}


# ---------------------------------------------------------------------------
# 6. few-events warnings


def few_events_warnings(groups, names=None, *, min_total=10, min_group=5):
    """Warning strings when the analysis rests on few events: total events
    < min_total, or any group with < min_group events."""
    groups, names = _check_groups(groups, names)
    counts = [int(sum(1 for e in ee if e == 1)) for _, ee in groups]
    total = sum(counts)
    out = []
    if total < min_total:
        out.append(
            f"Only {total} event{'s' if total != 1 else ''} in total (fewer "
            f"than {min_total}): the log-rank P value relies on a "
            "large-sample chi-square approximation, and the hazard ratio, "
            "median and survival confidence intervals are large-sample "
            "too; with so few events they are rough. Interpret with "
            "caution.")
    low = [(nm, c) for nm, c in zip(names, counts) if c < min_group]
    if low:
        out.append(
            "Few events in " + ", ".join(f"{nm} ({c} event"
                                         f"{'s' if c != 1 else ''})"
                                         for nm, c in low)
            + f" (fewer than {min_group} per group): the tests and "
            "confidence intervals for these groups rest on very few events "
            "(the log-rank chi-square approximation needs adequate numbers "
            "of events in each group).")
    return out
