"""Microbial growth curves with a lag phase: the Zwietering (1990)
reparameterisations, registered into the nonlinear-regression library.

Zwietering, Jongenburger, Rombouts & van 't Riet (1990), "Modeling of
the bacterial growth curve", Appl Environ Microbiol 56:1875-1881. With
y = ln(N/N0) the sigmoid models are rewritten so that every parameter
is biologically meaningful: A the asymptote (the maximum ln increase),
mu_m the maximum specific growth rate (slope of the tangent at the
inflection point) and lambda the lag time (where that tangent crosses
y = 0):

- modified Gompertz: y = A*exp(-exp(mu_m*e/A*(lambda - t) + 1))
- modified logistic: y = A/(1 + exp(4*mu_m/A*(lambda - t) + 2))
- modified Richards: y = A*(1 + v*exp(1 + v)*exp(mu_m/A*(1 + v)^(1 + 1/v)
  *(lambda - t)))^(-1/v); v = 1 gives the logistic and v -> 0 the
  Gompertz.

Each is also registered with a baseline Y0 added (y = Y0 + ...), for
data on a log scale that were not divided by N0 (e.g. ln OD600).
Parameter names: A, MuMax, Lag, Nu, Y0. The doubling time is reported
as a "transform of parameters" (curve-fitting guide, "Choosing
transforms of parameters to report"): ln(2)/MuMax with the CI of MuMax
carried through the transform (asymmetrical). It assumes Y in natural-
log units, which is how Zwietering defines y; fit ln-transformed data
(prepare_growth_data, log="ln") when the doubling time is wanted.

Preprocessing for plate-reader OD600 curves (Sprouffske & Wagner 2016,
Growthcurver, BMC Bioinformatics 17:172, and the GraphPad curve-fitting
guide's growth pages): subtract a blank (a constant, each curve's
minimum as Growthcurver's default, or the row means of a blank data
set), drop non-positive values (their logarithm is undefined; they are
counted and reported), take ln / log10 / log2, and
optionally express each curve relative to its first time point
(y = ln(N/N0)).
"""

from __future__ import annotations

import math

import numpy as np

from .nlfit import ModelSpec, Transform, register

LN2 = math.log(2.0)
FAMILY = "Growth equations"


def _arr(x):
    return np.asarray(x, dtype=float)


def _gompertz(t, a, mu, lag):
    with np.errstate(all="ignore"):
        return a * np.exp(-np.exp(mu * math.e / a * (lag - t) + 1.0))


def _logistic(t, a, mu, lag):
    with np.errstate(all="ignore"):
        return a / (1.0 + np.exp(4.0 * mu / a * (lag - t) + 2.0))


def _richards(t, a, mu, lag, nu):
    with np.errstate(all="ignore"):
        nu = np.float64(nu)
        inner = 1.0 + nu * np.exp(1.0 + nu) * np.exp(
            mu / a * np.power(1.0 + nu, 1.0 + 1.0 / nu) * (lag - t))
        return a * np.power(inner, -1.0 / nu)


def _initials(baseline: bool, richards: bool):
    """A from the rise of the distinct-X means, MuMax from the steepest
    segment, Lag where that tangent meets the starting level."""
    def initials(x, y):
        x, y = _arr(x), _arr(y)
        ux = np.unique(x)
        uy = np.array([float(np.mean(y[x == v])) for v in ux])
        y0 = float(uy[0]) if baseline else 0.0
        a = max(float(np.max(uy)) - y0, 1e-6)
        mu, lag = a / max(float(np.ptp(ux)), 1e-12), float(ux[0])
        if ux.size >= 2:
            slopes = np.diff(uy) / np.diff(ux)
            i = int(np.argmax(slopes))
            if slopes[i] > 0:
                mu = float(slopes[i])
                tm, ym = (ux[i] + ux[i + 1]) / 2, (uy[i] + uy[i + 1]) / 2
                lag = float(tm - (ym - y0) / mu)
        out = {"A": a, "MuMax": mu, "Lag": lag}
        if baseline:
            out["Y0"] = y0
        if richards:
            out["Nu"] = 1.0
        return out
    return initials


def _doubling():
    return Transform("DoublingTime",
                     lambda p: LN2 / p["MuMax"] if p["MuMax"] > 0 else math.nan,
                     ("MuMax",))


_EQ = {
    "gompertz": "Y=A*exp(-exp(MuMax*exp(1)/A*(Lag-X)+1))",
    "logistic": "Y=A/(1+exp(4*MuMax/A*(Lag-X)+2))",
    "richards": ("Y=A*(1+Nu*exp(1+Nu)*exp(MuMax/A*(1+Nu)^(1+1/Nu)*(Lag-X)))"
                 "^(-1/Nu)"),
}
_LABEL = {
    "gompertz": "Gompertz growth with lag (Zwietering)",
    "logistic": "Logistic growth with lag (Zwietering)",
    "richards": "Richards growth with lag (Zwietering)",
}


def _func(kind, baseline):
    def f(x, p):
        t = _arr(x)
        if kind == "gompertz":
            y = _gompertz(t, p["A"], p["MuMax"], p["Lag"])
        elif kind == "logistic":
            y = _logistic(t, p["A"], p["MuMax"], p["Lag"])
        else:
            y = _richards(t, p["A"], p["MuMax"], p["Lag"], p["Nu"])
        return y + p["Y0"] if baseline else y
    return f


MODEL_IDS = []
for _kind in ("gompertz", "logistic", "richards"):
    for _baseline in (False, True):
        _params = ["A", "MuMax", "Lag"] + (["Nu"] if _kind == "richards"
                                           else [])
        if _baseline:
            _params = ["Y0"] + _params
        _id = f"zwietering_{_kind}" + ("_baseline" if _baseline else "")
        MODEL_IDS.append(_id)
        register(ModelSpec(
            name=_id,
            label=_LABEL[_kind] + (", with baseline Y0" if _baseline else ""),
            equation=(_EQ[_kind].replace("Y=", "Y=Y0 + ", 1) if _baseline
                      else _EQ[_kind]),
            params=_params,
            func=_func(_kind, _baseline),
            initials=_initials(_baseline, _kind == "richards"),
            # the tangent construction of the initial values is the
            # parameters' own definition; extra starts only cost time
            # (Richards: seconds per start on 30 points)
            multistart=None,
            x_label="Time", y_label="ln(N/N0)" if not _baseline else "ln(N)",
            family=FAMILY,
            transforms=[_doubling()],
        ))


# ------------------------------------------------------------ preprocessing

_LOGS = {"ln": np.log, "log10": np.log10, "log2": np.log2}


def prepare_growth_data(x, datasets, *, blank=None, blank_dataset=None,
                        log: str | None = "ln",
                        relative_to_first: bool = False) -> dict:
    """Blank subtraction and log transform of OD (or count) curves.

    datasets: [{"name", "ys": [[replicates] per X row]}]. blank: a
    constant subtracted from every value, or "min" (each data set's own
    minimum, Growthcurver's bg_correct = "min"); blank_dataset: index
    of a data set whose row means are subtracted from the same rows of
    the others (it is then dropped). Non-positive values after
    subtraction become missing when a log is taken. relative_to_first:
    subtract each data set's first-row mean (on the log scale: y =
    log(N/N0))."""
    if log not in (None, "none", "ln", "log10", "log2"):
        raise ValueError(f"unknown log: {log}")
    log = None if log == "none" else log
    n_rows = len(x)
    per_min = blank == "min"     # Growthcurver's bg_correct = "min"
    blank_rows = [0.0 if per_min else float(blank or 0.0)] * n_rows
    keep = list(range(len(datasets)))
    if blank_dataset is not None:
        b = datasets[int(blank_dataset)]
        blank_rows = []
        for r in range(n_rows):
            vals = [float(v) for v in (b["ys"][r] if r < len(b["ys"]) else [])
                    if v is not None]
            blank_rows.append(float(np.mean(vals)) if vals else math.nan)
        keep.remove(int(blank_dataset))
    out, n_nonpos, n_noblank = [], 0, 0
    for i in keep:
        ds = datasets[i]
        rows = []
        if per_min:
            vals = [float(v) for rw in ds["ys"][:n_rows] for v in rw
                    if v is not None]
            m = min(vals) if vals else 0.0
            blank_rows = [m] * n_rows
        for r in range(n_rows):
            row = ds["ys"][r] if r < len(ds["ys"]) else []
            new = []
            for v in row:
                if v is None:
                    new.append(None)
                    continue
                if not math.isfinite(blank_rows[r]):
                    n_noblank += 1
                    new.append(None)
                    continue
                c = float(v) - blank_rows[r]
                if log:
                    if c <= 0:
                        n_nonpos += 1
                        new.append(None)
                        continue
                    c = float(_LOGS[log](c))
                new.append(c)
            rows.append(new)
        if relative_to_first:
            first = next((rw for rw in rows
                          if any(v is not None for v in rw)), None)
            if first is not None:
                base = float(np.mean([v for v in first if v is not None]))
                rows = [[None if v is None else
                         (v - base if log else v / base if base else None)
                         for v in rw] for rw in rows]
        out.append({"name": ds.get("name", ""), "ys": rows})
    return {"x": list(x), "datasets": out, "blank": blank_rows,
            "n_nonpositive_dropped": n_nonpos,
            "n_missing_blank": n_noblank, "log": log,
            "relative_to_first": bool(relative_to_first)}
