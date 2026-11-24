"""Planning a dose series before a dose-response experiment: the expected
precision of the IC50 (EC50) and whether both plateaus will be defined.

Every input is an assumption about the experiment not yet run: the
expected IC50, the Hill slope, the plateaus and the scatter (SD) of a
single well. The answers say what to expect if those assumptions hold.

Model: the four-parameter logistic of the curve fitter (nlfit,
"log(inhibitor) vs. response -- Variable slope"),
    Y = Bottom + (Top - Bottom) / (1 + 10^((LogIC50 - X) HillSlope)),
X = log10(concentration), fitted by least squares with Gaussian scatter
of SD sigma.

Expected CI width (asymptotic): the expected Fisher information of the
four parameters is I = J'J / sigma^2, J the n x 4 matrix of the
derivatives of the curve at the planned X values (each replicate a row):
    dY/dTop = 1/D, dY/dBottom = 1 - 1/D,
    dY/dLogIC50 = -(Top - Bottom) u ln(10) h / D^2,
    dY/dHill = -(Top - Bottom) u ln(10) (LogIC50 - X) / D^2,
u = 10^((LogIC50 - X) h), D = 1 + u. The SE of LogIC50 is the square
root of the diagonal element of I^-1 (Seber & Wild 1989, Nonlinear
Regression, sec. 2.1; the same covariance the fitter reports, evaluated
at the true values), and the expected 95% CI is LogIC50 +/- t(0.975,
n - 4) SE: its width in log10 units, and 10^width as the ratio of the
upper to the lower IC50 limit.

Plateaus (Sebaugh & McCray 2003, Pharm Stat 2:167; Sebaugh 2011, Pharm
Stat 10:128): the bend points of the 4PL, where the curve leaves its
plateaus, lie at LogIC50 +/- log10(4.6805) / |HillSlope| (17.6% and
82.4% of the span). A relative IC50 needs at least two concentrations
beyond each bend point (Sebaugh 2011); fewer is flagged as a plateau
the series will not define.

Monte Carlo (simulate_fits): data simulated from the same curve with
simulate.simulate_xy (Gaussian error, the planned replicates), each data
set fitted by nlfit.fit_model with the same model and asymptotic CIs;
reported: the median CI width of LogIC50, the coverage of the true
LogIC50 by the 95% CI (with the Monte Carlo SE), and the fraction of
fits that are ambiguous or fail. It checks the asymptotic answer: with
a plateau missing the fitted CIs widen, and some fits cannot find the
IC50 at all.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

from . import nlfit, simulate

MODEL = "log_inhibitor_vs_response_4pl"
BEND_K = 4.6805
LN10 = math.log(10.0)
MAX_DOSES = 48
MAX_SIM = 2000


def dose_series(doses=None, *, top_dose=None, n_doses=None, dilution=None):
    """The planned concentrations (sorted, linear units): a list, or the
    top concentration with the number of concentrations and the dilution
    factor between neighbours (sqrt(10) = half-log steps)."""
    if doses is not None:
        d = [float(v) for v in doses]
    else:
        top = float(_req(top_dose, "the top concentration"))
        n = int(_req(n_doses, "the number of concentrations"))
        f = float(_req(dilution, "the dilution factor"))
        if not f > 1:
            raise ValueError("the dilution factor must be above 1 (e.g. "
                             "3.162 for half-log steps)")
        if n < 1:
            raise ValueError("plan at least one concentration")
        d = [top / f ** i for i in range(n)]
    if not d:
        raise ValueError("plan at least one concentration")
    if any(not (v > 0 and math.isfinite(v)) for v in d):
        raise ValueError("concentrations must be positive numbers (a "
                         "vehicle control has no place on a log axis)")
    if len(d) > MAX_DOSES:
        raise ValueError(f"at most {MAX_DOSES} concentrations")
    if len(set(d)) < len(d):
        raise ValueError("the concentrations must differ")
    return sorted(d)


def _req(v, what):
    if v is None:
        raise ValueError(f"{what} is required")
    return v


def curve(x, top, bottom, log_ic50, hill):
    return bottom + (top - bottom) / (1 + 10.0 ** ((log_ic50 - x) * hill))


def jacobian(x, top, bottom, log_ic50, hill):
    x = np.asarray(x, float)
    with np.errstate(over="ignore"):
        u = 10.0 ** ((log_ic50 - x) * hill)
    D = 1 + u
    span = top - bottom
    # where u overflows the point sits on a plateau: derivatives -> limits
    big = ~np.isfinite(u)
    frac = np.where(big, 0.0, u / np.where(big, 1.0, D) ** 2)
    inv = np.where(big, 0.0, 1 / np.where(big, 1.0, D))
    return np.column_stack([
        inv, 1 - inv,
        -span * frac * LN10 * hill,
        -span * frac * LN10 * (log_ic50 - x)])


def plan(*, ic50=None, hill=-1.0, top=100.0, bottom=0.0, sd=None,
         replicates=1, doses=None, top_dose=None, n_doses=None,
         dilution=None, ci_level=0.95) -> dict:
    """Expected precision of the IC50 and the plateau checks for a planned
    dose series (see the module docstring). hill < 0 for a falling curve
    (inhibition), > 0 for a rising one (stimulation)."""
    d = dose_series(doses, top_dose=top_dose, n_doses=n_doses,
                    dilution=dilution)
    ic50 = float(_req(ic50, "the expected IC50"))
    if not (ic50 > 0 and math.isfinite(ic50)):
        raise ValueError("the expected IC50 must be a positive concentration")
    hill = float(hill)
    if hill == 0 or not math.isfinite(hill):
        raise ValueError("the Hill slope cannot be 0")
    top, bottom = float(top), float(bottom)
    if top == bottom:
        raise ValueError("the plateaus must differ: no curve to fit")
    sd = float(_req(sd, "the SD of a single well"))
    if not sd > 0:
        raise ValueError("the SD must be positive")
    reps = int(replicates)
    if reps < 1:
        raise ValueError("at least one replicate per concentration")
    if not 0 < ci_level < 1:
        raise ValueError("the CI level must be between 0 and 1")
    lx = np.log10(d)
    L = math.log10(ic50)
    x = np.repeat(lx, reps)
    n_obs = x.size
    out = {"model": MODEL, "doses": d, "log_doses": lx.tolist(),
           "replicates": reps, "n_observations": n_obs,
           "ic50": ic50, "log_ic50": L, "hill": hill, "top": top,
           "bottom": bottom, "sd": sd, "ci_level": ci_level,
           "assumptions": ["ic50", "hill", "top", "bottom", "sd"]}
    if len(d) > 1:
        steps = np.diff(lx)
        out["log_step"] = float(np.mean(steps))
        out["even_spacing"] = bool(np.allclose(steps, steps[0], rtol=1e-6,
                                               atol=1e-9))
    out["range_log_units"] = float(lx[-1] - lx[0])
    # plateaus and bend points (Sebaugh & McCray 2003)
    b = math.log10(BEND_K) / abs(hill)
    low_bend, high_bend = L - b, L + b
    n_low = int(np.sum(lx < low_bend - 1e-12))
    n_high = int(np.sum(lx > high_bend + 1e-12))
    low_name = "top" if hill < 0 else "bottom"
    high_name = "bottom" if hill < 0 else "top"
    frac = lambda xx: float((curve(xx, top, bottom, L, hill) - bottom)
                            / (top - bottom))
    out["bend_points"] = {"low": 10 ** low_bend, "high": 10 ** high_bend,
                          "log_low": low_bend, "log_high": high_bend,
                          "k": BEND_K}
    out["plateaus"] = {
        low_name: {"end": "low concentrations", "doses_beyond_bend": n_low,
                   "defined": n_low >= 2},
        high_name: {"end": "high concentrations",
                    "doses_beyond_bend": n_high, "defined": n_high >= 2},
    }
    out["response_at_ends"] = {"lowest_dose": frac(lx[0]),
                               "highest_dose": frac(lx[-1])}
    out["ic50_in_range"] = bool(lx[0] <= L <= lx[-1])
    flags = []
    for name in (low_name, high_name):
        p = out["plateaus"][name]
        if not p["defined"]:
            flags.append({"id": f"{name}_plateau", "text": (
                f"The {name} plateau will not be defined: "
                f"{p['doses_beyond_bend']} concentration"
                f"{'' if p['doses_beyond_bend'] == 1 else 's'} beyond the "
                f"bend point at the {p['end']} (Sebaugh 2011 asks for at "
                "least 2).")})
    if not out["ic50_in_range"]:
        flags.append({"id": "ic50_outside", "text": (
            "The expected IC50 lies outside the planned concentrations: "
            "the fit would extrapolate it.")})
    # expected information
    J = jacobian(x, top, bottom, L, hill)
    df = n_obs - 4
    out["df"] = df
    if df < 1:
        out["estimable"] = False
        flags.append({"id": "too_few_points", "text": (
            f"{n_obs} values cannot fit 4 parameters with any scatter left "
            "to estimate: plan at least 5 values (more concentrations or "
            "replicates).")})
        out["flags"] = flags
        return out
    # Columns scaled to unit length, so the condition number does not
    # depend on the units of the response or the concentration.
    norms = np.linalg.norm(J, axis=0)
    if not np.all(norms > 0):
        cond = math.inf
    else:
        Js = J / norms
        JTJ = Js.T @ Js
        sv = np.linalg.svd(JTJ, compute_uv=False)
        cond = float(sv[0] / sv[-1]) if sv[-1] > 0 else math.inf
    out["condition_number"] = cond
    if not cond < 1e12:
        out["estimable"] = False
        flags.append({"id": "not_estimable", "text": (
            "The planned concentrations cannot separate the four "
            "parameters (the curve is flat over them): widen the range.")})
        out["flags"] = flags
        return out
    cov = sd * sd * np.linalg.inv(JTJ) / np.outer(norms, norms)
    se = np.sqrt(np.diag(cov))
    tq = float(stats.t.isf((1 - ci_level) / 2, df))
    out["estimable"] = True
    out["se"] = {"top": float(se[0]), "bottom": float(se[1]),
                 "log_ic50": float(se[2]), "hill": float(se[3])}
    width = 2 * tq * float(se[2])
    out["expected_ci"] = {
        "t": tq, "log_halfwidth": tq * float(se[2]),
        "log_width": width, "fold_width": 10 ** width,
        "lower": float(10 ** (L - tq * se[2])),
        "upper": float(10 ** (L + tq * se[2])),
    }
    out["flags"] = flags
    return out


def simulate_fits(*, n_sim=200, seed=None, **planned) -> dict:
    """Monte Carlo check of plan(): simulate the planned experiment
    n_sim times (simulate.simulate_xy, Gaussian scatter) and fit each data
    set (nlfit.fit_model, asymptotic CIs). Returns counts (to pool
    chunks), the LogIC50 CIs and estimates."""
    n_sim = int(n_sim)
    if n_sim < 1:
        raise ValueError("simulate at least once")
    n_sim = min(n_sim, MAX_SIM)
    p = plan(**planned)
    if seed is None:
        seed = int(np.random.SeedSequence().entropy % (2 ** 32))
    seed = int(seed)
    children = np.random.SeedSequence(seed).spawn(n_sim)
    params = {"Top": p["top"], "Bottom": p["bottom"],
              "LogXmid": p["log_ic50"], "HillSlope": p["hill"]}
    L = p["log_ic50"]
    fits = []
    n_failed = n_ambiguous = n_no_ci = n_covered = n_ci = 0
    for i in range(n_sim):
        rng = np.random.default_rng(children[i])
        sim = simulate.simulate_xy(
            MODEL, params, x=p["log_doses"], replicates=p["replicates"],
            error={"kind": "gaussian", "sd": p["sd"]}, rng=rng)
        xs = [xv for xv, row in zip(sim["x"], sim["datasets"][0]["ys"])
              for _ in row]
        ys = [v for row in sim["datasets"][0]["ys"] for v in row]
        try:
            r = nlfit.fit_model(xs, ys, MODEL)
        except Exception:  # a failed fit is an outcome, not an error
            n_failed += 1
            fits.append(None)
            continue
        if r.get("status") != "converged":
            n_ambiguous += 1
        pr = (r.get("params") or {}).get("LogIC50") or {}
        ci = pr.get("ci95")
        est = pr.get("value")
        if (ci is None or ci[0] is None or ci[1] is None
                or not all(math.isfinite(c) for c in ci)):
            n_no_ci += 1
            fits.append({"estimate": est, "ci": None,
                         "status": r.get("status")})
            continue
        n_ci += 1
        covered = ci[0] <= L <= ci[1]
        n_covered += int(covered)
        fits.append({"estimate": est, "ci": [float(ci[0]), float(ci[1])],
                     "status": r.get("status")})
    widths = [f["ci"][1] - f["ci"][0] for f in fits if f and f["ci"]]
    out = {"seed": seed, "n_sim": n_sim, "n_failed": n_failed,
           "n_ambiguous": n_ambiguous, "n_no_ci": n_no_ci, "n_ci": n_ci,
           "n_covered": n_covered, "log_widths": widths,
           "estimates": [f["estimate"] if f else None for f in fits],
           "expected_log_width": (p.get("expected_ci") or {}).get(
               "log_width")}
    out.update(summarize(out))
    return out


def summarize(pooled: dict) -> dict:
    """Coverage with its Monte Carlo SE, the median CI width (log10 and
    fold) and the fractions of fits without a usable CI."""
    n_ci, n_sim = pooled["n_ci"], pooled["n_sim"]
    cov = pooled["n_covered"] / n_ci if n_ci else None
    widths = sorted(pooled["log_widths"])
    med = float(np.median(widths)) if widths else None
    return {
        "coverage": cov,
        "coverage_se": (math.sqrt(cov * (1 - cov) / n_ci)
                        if cov is not None else None),
        "median_log_width": med,
        "median_fold_width": 10 ** med if med is not None else None,
        "fraction_without_ci": ((pooled["n_failed"] + pooled["n_no_ci"])
                                / n_sim if n_sim else None),
        "fraction_ambiguous": (pooled["n_ambiguous"] / n_sim
                               if n_sim else None),
    }
