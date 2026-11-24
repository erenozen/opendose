"""Power and sample size for nested designs: animals (or cultures,
patients: the experimental units) each measured several times (cells,
wells, fields), planned from the between-unit and within-unit SDs (or
the total SD and the intraclass correlation). Prospective only: every
input is an assumption about the planned experiment.

The experimental unit is the animal, so the test compares groups of
animal means (do-not-build 12: cells are not n; Lazic 2010, BMC
Neurosci 11:5). For a balanced design the nested t test (and the nested
one-way ANOVA) equals the t test (ANOVA) on the unit means (Aarts,
Verhage, Veenvliet, Dolan & van der Sluis 2014, Nat Neurosci 17:491;
checked in engine/tests/test_nested_power.py against nested.py), and a
unit mean of m cells has variance

    sigma_b^2 + sigma_w^2 / m = sigma_t^2 (1 + (m - 1) ICC) / m,

ICC = sigma_b^2 / (sigma_b^2 + sigma_w^2), sigma_t^2 = sigma_b^2 +
sigma_w^2. 1 + (m - 1) ICC is the design effect (Kish 1965): the number
of cells a naive analysis would count is worth n m / (1 + (m - 1) ICC)
independent values. So the animals needed per group are, to the normal
approximation, n_cells_naive (1 + (m - 1) ICC) / m, where n_cells_naive
is what a t test treating every cell as independent would ask for (the
hand check of FEATURE-PLAN P-96); the engine solves the exact noncentral
t of the unit means instead.

nested_design (closed form):
- "t": two groups, t test on unit means, noncentral t (power.t_power).
- "mann_whitney": two groups, Mann-Whitney on unit means, A.R.E. method
  with a normal parent (3/pi; power_designs.mann_whitney).
- "dunnett": k - 1 treated groups each against one control, all unit
  means; per-comparison power P(|T| > c) for one treated group differing
  by delta, T noncentral t on k (n - 1) df and c the two-sided Dunnett
  critical value (dunnett.critical_value_one_factor; Dunnett 1955).

simulate_power (Monte Carlo): cells generated as unit effect + cell
noise (normal), averaged per unit, then the test the app runs: Student's
t on the unit means; the Mann-Whitney test with exact P for up to 100
units per group (ttests._mann_whitney_p's rule; continuous data have no
ties); Dunnett's test with the same critical value. Seeded (numpy
PCG64), so a seed reproduces the run; the Monte Carlo SE sqrt(p (1 - p)
/ R) is reported with a Wilson 95% CI. Repeats are capped
(MAX_REPEATS) and the app runs them in chunks with progress.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

from . import dunnett
from .power import _check, _continuous_n, _need, _smallest_n, _solve_effect, \
    t_power

MAX_REPEATS = 10_000
MAX_CELLS_PER_BATCH = 2_000_000
TESTS = ("t", "mann_whitney", "dunnett")
ARE_NORMAL = 3 / math.pi
TRADEOFF_M = (1, 2, 3, 5, 10, 20, 50, 100)


def components(sd_between=None, sd_within=None, sd_total=None, icc=None):
    """(sigma_b, sigma_w) from the two SDs or from the total SD and ICC."""
    if sd_between is not None or sd_within is not None:
        sb = float(_need(sd_between, "sd_between"))
        sw = float(_need(sd_within, "sd_within"))
    else:
        st = float(_need(sd_total, "sd_total (or sd_between and sd_within)"))
        r = float(_need(icc, "icc"))
        if not 0 <= r <= 1:
            raise ValueError("the ICC must be between 0 and 1")
        if not st > 0:
            raise ValueError("the total SD must be positive")
        sb, sw = st * math.sqrt(r), st * math.sqrt(1 - r)
    if sb < 0 or sw < 0 or not math.isfinite(sb + sw):
        raise ValueError("the SDs cannot be negative")
    if sb == 0 and sw == 0:
        raise ValueError("the SDs cannot both be 0: nothing varies")
    return sb, sw


def _critical(test, n, k, alpha, tails):
    df = k * (n - 1)
    if test == "dunnett":
        lam = np.full(k - 1, math.sqrt(0.5))
        return dunnett.critical_value_one_factor(1 - alpha, lam, df), df
    return float(stats.t.isf(alpha / tails, df)), df


def _unit_power(test, n, d_unit, k, alpha, tails):
    """Power for n units per group, effect d_unit = delta / SD of a unit
    mean."""
    if test == "t":
        return t_power(d_unit * math.sqrt(n / 2), 2 * n - 2, alpha, tails)
    if test == "mann_whitney":
        return t_power(d_unit * math.sqrt(n * ARE_NORMAL / 2),
                       2 * n * ARE_NORMAL - 2, alpha, tails)
    c, df = _critical("dunnett", n, k, alpha, 2)
    ncp = d_unit * math.sqrt(n / 2)
    far = float(stats.nct.cdf(-c, df, ncp))
    return float(stats.nct.sf(c, df, ncp)) + (far if math.isfinite(far)
                                              else 0.0)


def nested_design(solve="n", *, delta=None, sd_between=None, sd_within=None,
                  sd_total=None, icc=None, m=None, k=2, test="t", n=None,
                  alpha=0.05, power=None, tails=2) -> dict:
    """Animals (units) per group for a nested design: delta is the
    difference between group means that matters; m measurements (cells)
    per animal; k groups (Dunnett: the control and k - 1 treated groups);
    n animals per group (solve "power" or "effect")."""
    if test not in TESTS:
        raise ValueError(f"test must be one of {TESTS}")
    if test == "dunnett":
        tails = 2
    _check(alpha, power, tails, solve)
    sb, sw = components(sd_between, sd_within, sd_total, icc)
    m = int(_need(m, "m (measurements per unit)"))
    if m < 1:
        raise ValueError("each unit needs at least 1 measurement")
    k = int(k)
    if test in ("t", "mann_whitney") and k != 2:
        raise ValueError("the t and Mann-Whitney tests compare 2 groups; "
                         "use Dunnett's test for more")
    if test == "dunnett" and k < 2:
        raise ValueError("Dunnett's test needs a control and at least one "
                         "treated group")
    var_unit = sb * sb + sw * sw / m
    sd_unit = math.sqrt(var_unit)
    st = math.sqrt(sb * sb + sw * sw)
    r = sb * sb / (st * st)
    de = 1 + (m - 1) * r
    pw = lambda nn, dd: _unit_power(test, nn, dd / sd_unit, k, alpha, tails)
    out = {"kind": "nested", "solve": solve, "alpha": alpha,
           "tails": tails, "test": test, "k": k, "m": m,
           "sd_between": sb, "sd_within": sw, "sd_total": st, "icc": r,
           "design_effect": de, "sd_unit_mean": sd_unit}
    if solve == "n":
        dl = abs(float(_need(delta, "delta")))
        if dl == 0:
            raise ValueError("the difference that matters cannot be 0")
        nn = _smallest_n(lambda v: pw(v, dl), power, 2)
        out["target_power"] = power
        if test == "t":
            out["n_exact"] = _continuous_n(lambda v: pw(v, dl), power, 2.0, nn)
            # the hand check: cells counted as if independent, deflated by
            # the design effect (Aarts et al. 2014)
            naive = lambda v: t_power(dl / st * math.sqrt(v / 2), 2 * v - 2,
                                      alpha, tails)
            nc = _smallest_n(naive, power, 2)
            nc_exact = _continuous_n(naive, power, 2.0, nc)
            out["cells_if_independent"] = nc
            out["cells_if_independent_exact"] = nc_exact
            out["n_design_effect"] = (nc_exact * de / m
                                      if nc_exact is not None else None)
        if test != "dunnett":
            trade = []
            for mm in sorted(set(TRADEOFF_M) | {m}):
                vu = math.sqrt(sb * sb + sw * sw / mm)
                trade.append({"m": mm, "n": _smallest_n(
                    lambda v: _unit_power(test, v, dl / vu, k, alpha, tails),
                    power, 2)})
            out["tradeoff"] = trade
    else:
        nn = int(_need(n, "n (units per group)"))
        if nn < 2:
            raise ValueError("each group needs at least 2 units")
        if solve == "effect":
            dl = _solve_effect(lambda e: pw(nn, e), power, 1e-12 * sd_unit,
                               1e3 * sd_unit)
        else:
            dl = abs(float(_need(delta, "delta")))
    crit, df = _critical(test, nn, k, alpha, tails)
    out.update({
        "n": nn, "n_per_group": [nn] * k, "n_total": nn * k,
        "cells_per_group": nn * m, "cells_total": nn * m * k,
        "power": pw(nn, dl), "df": df,
        "critical_t" if test != "dunnett" else "critical_dunnett": crit,
        "effect": {"name": "delta", "value": dl, "d_unit": dl / sd_unit,
                   "d_total": dl / st},
    })
    if test == "mann_whitney":
        out["are"] = ARE_NORMAL
    return out


# ------------------------------------------------------------ simulation

def _wilson(h, n, z=1.959963984540054):
    if n == 0:
        return [None, None]
    p = h / n
    den = 1 + z * z / n
    mid = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return [max(0.0, mid - half), min(1.0, mid + half)]


def unit_means(rng, reps, k, n, m, sb, sw, shifts):
    """(reps, k, n) unit means from simulated cells: unit effect
    N(0, sb^2) plus m cells N(0, sw^2) each, group g shifted by
    shifts[g]."""
    unit = rng.standard_normal((reps, k, n)) * sb
    if sw > 0:
        cells = rng.standard_normal((reps, k, n, m)) * sw
        unit = unit + cells.mean(axis=3)
    return unit + np.asarray(shifts, float)[None, :, None]


def _t_reject(x0, x1, alpha, tails):
    n0, n1 = x0.shape[-1], x1.shape[-1]
    m0, m1 = x0.mean(-1), x1.mean(-1)
    ss = ((x0 - m0[..., None]) ** 2).sum(-1) + ((x1 - m1[..., None]) ** 2
                                                 ).sum(-1)
    df = n0 + n1 - 2
    with np.errstate(divide="ignore", invalid="ignore"):
        t = (m1 - m0) / np.sqrt(ss / df * (1 / n0 + 1 / n1))
    if tails == 2:
        return np.abs(t) > stats.t.isf(alpha / 2, df)
    return t > stats.t.isf(alpha, df)


def _mw_reject(x0, x1, alpha, tails):
    method = "exact" if min(x0.shape[-1], x1.shape[-1]) <= 100 else \
        "asymptotic"
    alt = "two-sided" if tails == 2 else "greater"
    p = stats.mannwhitneyu(x1, x0, axis=-1, alternative=alt,
                           method=method).pvalue
    return p <= alpha


def pool(chunks, test="t") -> dict:
    """Pool chunks of simulate_power (run with consecutive seeds) into
    one result: the counts summed, the power with its Monte Carlo SE and
    Wilson 95% CI."""
    if not chunks:
        raise ValueError("nothing to pool")
    reps = sum(int(c["n_repeats"]) for c in chunks)
    hits = sum(int(c["hits"]) for c in chunks)
    comps = sum(int(c["comparisons"]) for c in chunks)
    p = hits / comps
    out = {"test": test, "n_repeats": reps, "hits": hits,
           "comparisons": comps, "power": p,
           "mc_se": math.sqrt(p * (1 - p) / reps),
           "ci95": _wilson(hits, comps)}
    if test == "dunnett":
        out["power_all"] = sum(int(c["hits_all"]) for c in chunks) / reps
        out["power_any"] = sum(int(c["hits_any"]) for c in chunks) / reps
    return out


def simulate_power(*, test="t",k=2, n=None, m=None, delta=None,
                   sd_between=None, sd_within=None, sd_total=None, icc=None,
                   alpha=0.05, tails=2, n_repeats=1000, seed=None) -> dict:
    """Monte Carlo power of the planned test on n units per group with m
    measurements each. Returns counts (to pool chunks) and the power with
    its Monte Carlo SE and Wilson 95% CI. Dunnett: per comparison (one
    treated group vs the control, averaged over the k - 1), all treated
    groups detected, and at least one."""
    if test not in TESTS:
        raise ValueError(f"test must be one of {TESTS}")
    if not 0 < alpha < 1:
        raise ValueError("alpha must be between 0 and 1")
    sb, sw = components(sd_between, sd_within, sd_total, icc)
    n = int(_need(n, "n (units per group)"))
    m = int(_need(m, "m (measurements per unit)"))
    k = int(k)
    if n < 2:
        raise ValueError("each group needs at least 2 units")
    if m < 1:
        raise ValueError("each unit needs at least 1 measurement")
    if test != "dunnett" and k != 2:
        raise ValueError("the t and Mann-Whitney tests compare 2 groups")
    if test == "dunnett":
        tails = 2
        if k < 2:
            raise ValueError("Dunnett's test needs at least 2 groups")
    reps = int(n_repeats)
    if reps < 1:
        raise ValueError("n_repeats must be at least 1")
    capped = reps > MAX_REPEATS
    reps = min(reps, MAX_REPEATS)
    dl = abs(float(_need(delta, "delta")))
    if seed is None:
        seed = int(np.random.SeedSequence().entropy % (2 ** 32))
    seed = int(seed)
    rng = np.random.default_rng(seed)
    shifts = [0.0] + [dl] * (k - 1)
    per = max(1, MAX_CELLS_PER_BATCH // max(1, k * n * m))
    crit = None
    if test == "dunnett":
        crit, df = _critical("dunnett", n, k, alpha, 2)
    hits = hits_all = hits_any = 0
    done = 0
    while done < reps:
        b = min(per, reps - done)
        x = unit_means(rng, b, k, n, m, sb, sw, shifts)
        if test == "t":
            hits += int(np.sum(_t_reject(x[:, 0], x[:, 1], alpha, tails)))
        elif test == "mann_whitney":
            hits += int(np.sum(_mw_reject(x[:, 0], x[:, 1], alpha, tails)))
        else:
            means = x.mean(axis=2)
            mse = ((x - means[..., None]) ** 2).sum(axis=(1, 2)) / df
            tt = (means[:, 1:] - means[:, :1]) / np.sqrt(mse * 2 / n)[:, None]
            rej = np.abs(tt) > crit
            hits += int(rej.sum())
            hits_all += int(rej.all(axis=1).sum())
            hits_any += int(rej.any(axis=1).sum())
        done += b
    comparisons = reps * (k - 1) if test == "dunnett" else reps
    p = hits / comparisons
    out = {"test": test, "k": k, "n": n, "m": m, "delta": dl,
           "sd_between": sb, "sd_within": sw, "alpha": alpha,
           "tails": tails, "seed": seed, "n_repeats": reps,
           "capped": capped, "hits": hits, "comparisons": comparisons,
           "power": p, "mc_se": math.sqrt(p * (1 - p) / reps),
           "ci95": _wilson(hits, comparisons)}
    if test == "dunnett":
        out.update({"critical_dunnett": crit,
                    "hits_all": hits_all, "hits_any": hits_any,
                    "power_all": hits_all / reps,
                    "power_any": hits_any / reps})
    return out
