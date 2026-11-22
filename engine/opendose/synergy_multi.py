"""Higher-order drug-combination synergy: HSA, Bliss, Loewe and ZIP for
two or more drugs, from long-format records (one row per well).

Method sources (reimplemented from the published definitions; no code
copied): SynergyFinder Plus (Zheng et al. 2022, Genomics Proteomics
Bioinformatics 20:587, Supplementary Table S1, the formulation of the
synergyfinder R package; it corrects the higher-order Bliss and Loewe of
SynergyFinder 2.0, Ianevski et al. 2020 NAR 48:W488). Responses are %
inhibition; x_i the dose of drug i in a cell, y_i(x_i) the observed
response to drug i alone, f_i its four-parameter log-logistic fit (as
opendose.assay_synergy):

- HSA: expected = max_i y_i(x_i).
- Bliss: expected = 100 (1 - prod_i (1 - y_i(x_i)/100)).
- Loewe: expected = the y solving sum_i x_i / f_i^-1(y) = 1 (solved as in
  assay_synergy.loewe_response); where no y solves it, the largest f_i at
  the total dose sum_i x_i (the two-drug fallback, applied to n drugs; the
  sources do not describe one).
- ZIP: fitted = the mean over the drugs present of f'_i(x_i), f'_i the
  log-logistic fit to the cell's slice along drug i (the other drugs held
  at the cell's doses; its zero-dose point is the sub-combination without
  drug i); expected = the Bliss combination of f_i(x_i); delta = fitted -
  expected. The slice's zero-dose response is held at its observed value
  with the other three parameters free, then also Top = 100 when that
  fails, as assay_synergy's two-drug ZIP (SynergyFinder Plus describes
  the minimum as the fitted sub-combination response and the maximum as
  100).
- Only drugs with a non-zero dose in a cell enter its expectations, so a
  cell holding two of three drugs is scored as a two-drug combination.
  Synergy is 0 where fewer than two drugs are present. The summary score
  is the mean synergy over cells with at least two drugs (SynergyFinder:
  "excluding the monotherapy observations"; whether sub-combinations count
  is not stated), and score_all_drugs the mean over cells holding every
  drug. P values, the Bliss / Loewe consensus, RI and relative IC50 per
  drug follow assay_synergy. With n = 2 every number equals
  assay_synergy.synergy's.

Not offered for n drugs (two-dimensional definitions): CSS, the most
synergistic area, outlier detection and filling, Chou-Talalay, MuSyC.
"""

from __future__ import annotations

import math
import warnings as _warnings

import numpy as np
from scipy.optimize import brentq

from .assay_synergy import (P_ITERATIONS, P_SEED, _fit_ll4, _inverse_dose,
                            _ll4, _num, _resampled, relative_inhibition,
                            synergy_p)

MODELS = ("hsa", "bliss", "loewe", "zip", "consensus")


# ------------------------------------------------------------ input

def build_tensor(records, n_drugs=None, response_kind="inhibition"):
    """Long records [{conc1, ..., concN, response, replicate?}] -> (concs,
    reps): concs[i] the sorted doses of drug i (0 first), reps an array
    (n_rep, k_1, ..., k_N) of % inhibition with NaN where no well was
    measured."""
    if response_kind not in ("inhibition", "viability"):
        raise ValueError("response_kind must be 'inhibition' or 'viability'")
    if not records:
        raise ValueError("no records")
    if n_drugs is None:
        n_drugs = 0
        while f"conc{n_drugs + 1}" in records[0]:
            n_drugs += 1
    if n_drugs < 2:
        raise ValueError("records need conc1, conc2, ... (two or more drugs)")
    extra = f"conc{n_drugs + 1}"
    if any(extra in r for r in records):
        raise ValueError(f"some records carry {extra}: every record needs "
                         "the same drugs (conc1, ..., concN)")
    keys = [f"conc{i + 1}" for i in range(n_drugs)]
    rows = []
    for r in records:
        cs = [_num(r.get(k)) for k in keys]
        if any(c is None or c < 0 for c in cs):
            raise ValueError(f"every record needs non-negative {', '.join(keys)}")
        v = _num(r.get("response"))
        if v is not None:
            rows.append((cs, v, r.get("replicate")))
    concs = [sorted({cs[i] for cs, _, _ in rows}) for i in range(n_drugs)]
    for i, c in enumerate(concs):
        if not c or c[0] != 0:
            raise ValueError(f"drug {i + 1} needs its zero dose (the other "
                             "drugs alone)")
    cells = {}
    for cs, v, rid in rows:
        idx = tuple(concs[i].index(c) for i, c in enumerate(cs))
        cells.setdefault(idx, []).append((rid, v))
    n_rep = max(len(v) for v in cells.values())
    rep_ids = []
    for vals in cells.values():
        for rid, _ in vals:
            if rid is not None and rid not in rep_ids:
                rep_ids.append(rid)
    reps = np.full((n_rep,) + tuple(len(c) for c in concs), np.nan)
    for idx, vals in cells.items():
        for k, (rid, v) in enumerate(vals):
            slot = (rep_ids.index(rid) if rid is not None
                    and len(rep_ids) == n_rep else k)
            reps[(slot,) + idx] = v
    if response_kind == "viability":
        reps = 100.0 - reps
    return concs, reps


def _mono_index(n, i, k):
    idx = [0] * n
    idx[i] = k
    return tuple(idx)


# ------------------------------------------------------------ models

def loewe_response_n(doses, params):
    """Loewe-additive effect of doses (d_i > 0) with fitted curves params:
    the y solving sum d_i / D_i(y) = 1 (None when no y does)."""
    terms = [(d, p) for d, p in zip(doses, params) if d > 0 and p is not None]
    if not terms:
        return None
    lo = min(min(p["Bottom"], p["Top"]) for _, p in terms)
    hi = max(max(p["Bottom"], p["Top"]) for _, p in terms)
    if not hi > lo:
        return None

    def f(y):
        s = 0.0
        for d, p in terms:
            X = _inverse_dose(y, p)
            if X == 0.0:
                return math.inf
            s += 0.0 if math.isinf(X) else d / X
        return s - 1.0

    def g(v):
        r = f(v)
        return r if math.isfinite(r) else 1e300
    ys = np.linspace(lo, hi, 401)[1:-1]
    vals = [g(v) for v in ys]
    for a, b, fa, fb in zip(ys, ys[1:], vals, vals[1:]):
        if fa == 0.0:
            return float(a)
        if fa > 0 > fb:
            return float(brentq(g, a, b, xtol=1e-12, rtol=1e-12,
                                maxiter=200))
    return None


def _zip_slice(x, y):
    """assay_synergy's ZIP slice fit: zero-dose response held at its
    observed value, then also Top = 100; the observed values if neither
    fits. -> (fitted values, fell back?)"""
    y = np.asarray(y, float)
    if math.isfinite(y[0]):
        for cons in ({"Bottom": float(y[0])},
                     {"Bottom": float(y[0]), "Top": 100.0}):
            f = _fit_ll4(x, y, cons)
            if f is not None:
                return _ll4(x, f["params"]), False
    return y.copy(), True


def score_tensor(R, concs):
    """Every model on one response tensor -> {model: {"expected",
    "synergy", "score", "score_all_drugs"}} (+ "zip" "fitted"), the
    monotherapy fits and counts of fallbacks."""
    R = np.asarray(R, float)
    n = R.ndim
    shape = R.shape
    mono_obs = [R[tuple(slice(None) if a == i else 0 for a in range(n))]
                for i in range(n)]
    fits = [_fit_ll4(concs[i], mono_obs[i]) for i in range(n)]
    params = [f["params"] if f else None for f in fits]
    mono_fit = [(_ll4(concs[i], params[i]) if params[i] else
                 np.array(mono_obs[i], float)) for i in range(n)]
    exp = {k: np.full(shape, np.nan) for k in ("hsa", "bliss", "loewe",
                                               "zip")}
    zip_fit = np.full(shape, np.nan)
    slice_cache = {}
    n_loewe_fallback = 0
    n_zip_fallback = 0
    for idx in np.ndindex(shape):
        present = [i for i in range(n) if idx[i] > 0]
        if len(present) < 2:
            continue
        ys = [mono_obs[i][idx[i]] for i in present]
        exp["hsa"][idx] = max(ys)
        exp["bliss"][idx] = 100.0 * (1.0 - np.prod([1.0 - v / 100.0
                                                     for v in ys]))
        doses = [concs[i][idx[i]] for i in present]
        y = loewe_response_n(doses, [params[i] for i in present])
        if y is None:
            fitted = [p for p in (params[i] for i in present) if p]
            total = sum(doses)
            y = (max(float(_ll4([total], p)[0]) for p in fitted) if fitted
                 else max(ys))
            n_loewe_fallback += 1
        exp["loewe"][idx] = y
        fy = [mono_fit[i][idx[i]] for i in present]
        exp["zip"][idx] = 100.0 * (1.0 - np.prod([1.0 - v / 100.0
                                                   for v in fy]))
        parts = []
        for i in present:
            key = (i,) + tuple(idx[a] for a in range(n) if a != i)
            if key not in slice_cache:
                sl = tuple(slice(None) if a == i else idx[a]
                           for a in range(n))
                vals, fell = _zip_slice(concs[i], R[sl])
                slice_cache[key] = vals
                n_zip_fallback += int(fell)
            parts.append(slice_cache[key][idx[i]])
        zip_fit[idx] = float(np.mean(parts))
    observed = {"hsa": R, "bliss": R, "loewe": R, "zip": zip_fit}
    out = {}
    with np.errstate(all="ignore"), _warnings.catch_warnings():
        _warnings.simplefilter("ignore", RuntimeWarning)
        cons_ref = np.nanmax(np.stack([exp[k] for k in ("hsa", "bliss",
                                                        "loewe")]), axis=0)
    exp["consensus"] = cons_ref
    observed["consensus"] = R
    present_n = np.zeros(shape, int)
    for idx in np.ndindex(shape):
        present_n[idx] = sum(1 for a in idx if a > 0)
    combo = present_n >= 2
    full = present_n == n
    for k in MODELS:
        syn = observed[k] - exp[k]
        syn[~combo] = 0.0
        out[k] = {"expected": exp[k], "synergy": syn,
                  "score": _mean(syn[combo]),
                  "score_all_drugs": _mean(syn[full]),
                  "cells": syn[combo]}
    out["zip"]["fitted"] = zip_fit
    out["_fits"] = (fits, mono_fit)
    out["_counts"] = (n_loewe_fallback, n_zip_fallback)
    return out


def _mean(v):
    v = np.asarray(v, float)
    v = v[np.isfinite(v)]
    return float(v.mean()) if v.size else None


def _baseline_correct(R, concs, method):
    if method == "none":
        return R, None
    if method not in ("part", "all"):
        raise ValueError("baseline_correction must be 'none', 'part' or "
                         "'all'")
    n = R.ndim
    mins = []
    for i in range(n):
        mono = R[tuple(slice(None) if a == i else 0 for a in range(n))]
        f = _fit_ll4(concs[i], mono)
        if f is not None:
            mins.append(float(np.min(_ll4(concs[i], f["params"]))))
    if not mins:
        return R, None
    base = min(mins)
    out = R.copy()
    mask = np.isfinite(out) if method == "all" else (out < 0)
    out[mask] = out[mask] - (100.0 - out[mask]) / 100.0 * base
    return out, base


def _f(v):
    return None if v is None or not math.isfinite(v) else float(v)


# ------------------------------------------------------------ analysis

def synergy_multi(records, *, drugs=None, response_kind="inhibition",
                  baseline_correction="none", p_iterations=P_ITERATIONS,
                  p_seed=P_SEED) -> dict:
    """HSA, Bliss, Loewe, ZIP and consensus synergy for two or more drugs
    from long records [{conc1, ..., concN, response, replicate?}]; see the
    module docstring. Returns per-cell results in long format ("cells")
    and per-model summaries ("models")."""
    # the number of drugs always comes from the records' conc1..concN, so
    # a short list of names can never drop a concentration column
    concs, reps = build_tensor(records, None, response_kind)
    n = len(concs)
    drugs = list(drugs) if drugs else [f"Drug {i + 1}" for i in range(n)]
    if len(drugs) != n:
        raise ValueError(f"{n} drugs in the records, {len(drugs)} names")
    warnings = []
    with np.errstate(all="ignore"), _warnings.catch_warnings():
        _warnings.simplefilter("ignore", RuntimeWarning)
        mean = np.nanmean(reps, axis=0)
        sd = (np.nanstd(reps, axis=0, ddof=1) if reps.shape[0] > 1
              else np.full(mean.shape, np.nan))
    for i in range(n):
        if len(concs[i]) < 3:
            raise ValueError(f"{drugs[i]} needs at least 2 non-zero doses")
        mono = mean[_mono_index(n, i, slice(None))]
        if np.isnan(mono).any():
            raise ValueError(f"every dose of {drugs[i]} alone (the other "
                             "drugs at 0) needs a response")
    n_unmeasured = int(np.isnan(mean).sum())
    if n_unmeasured:
        warnings.append(f"{n_unmeasured} of {mean.size} dose combinations "
                        "were not measured; they are left out of the "
                        "scores.")
    R, base = _baseline_correct(mean, concs, baseline_correction)
    main = score_tensor(R, concs)
    fits, mono_fit = main.pop("_fits")
    n_lf, n_zf = main.pop("_counts")
    if any(f is None for f in fits):
        warnings.append("A single-drug curve could not be fitted; Loewe and "
                        "ZIP use fallbacks (observed responses).")
    if n_lf:
        warnings.append(f"Loewe additivity had no solution at {n_lf} "
                        "cell(s); the largest single-drug response at the "
                        "total dose was used there.")
    n_rep = reps.shape[0]
    if n_rep > 1 and not p_iterations:
        p_values = {k: None for k in MODELS}
        p_basis = None
    elif n_rep > 1:
        rng = np.random.default_rng(p_seed)
        resampled = {k: [] for k in MODELS}
        for _ in range(int(p_iterations)):
            Rb = _resampled(reps, rng)
            if any(np.isnan(Rb[tuple(slice(None) if a == i else 0
                                     for a in range(n))]).any()
                   for i in range(n)):
                continue
            Rb, _ = _baseline_correct(Rb, concs, baseline_correction)
            sb = score_tensor(Rb, concs)
            for k in MODELS:
                resampled[k].append(sb[k]["score"])
        p_values = {k: synergy_p(resampled[k]) for k in MODELS}
        p_basis = (f"summary scores of {int(p_iterations)} resampled "
                   f"matrices (normal draws with each cell's replicate mean "
                   f"and SD, seed {p_seed})")
    else:
        p_values = {k: synergy_p(main[k]["cells"].tolist()) for k in MODELS}
        p_basis = "synergy of the combination cells"
    per_rep = {k: [] for k in MODELS}
    if n_rep > 1:
        for k_rep in range(n_rep):
            Rk = reps[k_rep]
            if any(np.isnan(Rk[tuple(slice(None) if a == i else 0
                                     for a in range(n))]).any()
                   for i in range(n)):
                continue
            Rk, _ = _baseline_correct(Rk, concs, baseline_correction)
            sk = score_tensor(Rk, concs)
            for k in MODELS:
                per_rep[k].append(sk[k]["score"])
    models = {}
    for k in MODELS:
        e = {"score": main[k]["score"],
             "score_all_drugs": main[k]["score_all_drugs"],
             "p_value": p_values[k]}
        scores = [s for s in per_rep[k] if s is not None]
        if len(scores) > 1:
            e["replicate_scores"] = scores
            e["score_sd"] = float(np.std(scores, ddof=1))
        models[k] = e
    cells = []
    for idx in np.ndindex(R.shape):
        if not math.isfinite(R[idx]):
            continue
        row = {"concs": [float(concs[i][idx[i]]) for i in range(n)],
               "n_drugs": int(sum(1 for a in idx if a > 0)),
               "response": float(R[idx]),
               "response_sd": _f(sd[idx])}
        if row["n_drugs"] >= 2:
            for k in MODELS:
                row[k] = {"expected": _f(main[k]["expected"][idx]),
                          "synergy": _f(main[k]["synergy"][idx])}
            row["zip"]["fitted"] = _f(main["zip"]["fitted"][idx])
        cells.append(row)
    mono, sens = [], []
    for i in range(n):
        f = fits[i]
        doses = concs[i]
        obs = R[tuple(slice(None) if a == i else 0 for a in range(n))]
        ri = relative_inhibition(doses, obs)
        top = float(max(doses))
        points = {"conc": [float(c) for c in doses],
                  "response": [_f(v) for v in obs]}
        if f is None:
            mono.append({"drug": drugs[i], "fitted": False,
                         "observed": points})
            ic = None
        else:
            p = f["params"]
            xs = [c for c in doses if c > 0]
            grid = np.logspace(math.log10(min(xs)) - 0.5,
                               math.log10(max(xs)) + 0.5, 100)
            mono.append({"drug": drugs[i], "fitted": True,
                         "params": {"Bottom": p["Bottom"], "Top": p["Top"],
                                    "EC50": p["EC50"],
                                    "HillSlope": p["HillSlope"]},
                         "r_squared": f["fit"]["goodness"]["r_squared"],
                         "observed": points,
                         "curve": {"x": grid.tolist(),
                                   "y": _ll4(grid, p).tolist()}})
            ic = float(p["EC50"]) if math.isfinite(p["EC50"]) else None
        sens.append({"drug": drugs[i],
                     "ic50": None if ic is None else min(ic, top),
                     "ic50_capped": bool(ic is not None and ic > top),
                     "ri": None if ri is None else ri["ri"]})
    return {
        "analysis": "synergy_multi", "drugs": drugs, "n_drugs": n,
        "concs": [[float(c) for c in cs] for cs in concs],
        "response_kind": response_kind, "response_scale": "% inhibition",
        "n_replicates": int(n_rep), "baseline_correction":
        baseline_correction, "baseline": base,
        "models": models, "scores": {k: models[k]["score"] for k in MODELS},
        "p_value_basis": p_basis, "monotherapy": mono, "sensitivity": sens,
        "cells": cells, "warnings": warnings,
    }
