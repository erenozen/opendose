"""Simulated data tables and Monte Carlo analyses.

GraphPad Prism guide references (publicly documented behaviour):

- Statistics guide "Simulating a XY data table"
  (statistics/stat_simulating_data_with_random_error.htm): X values are a
  regular arithmetic or geometric series (or the X values of a table);
  Y comes from a chosen equation (or the Y values of a table) with chosen
  parameter values; choose the number of data sets and replicates, the
  random error, optional outliers, and an optional random seed that makes
  the simulation exactly reproducible.
- "Simulating a Column data table" (stat_simulating_a_column_data_table.htm):
  number of data sets; per column the number of rows, the population mean
  and a title -- or enter the mean and SD of a set of means and have each
  column mean chosen randomly; same random-error choices and seed.
- "Simulating a contingency table" (stat_simulating_a_contingency_table.htm):
  total sample size and the design -- cross-sectional, prospective,
  experimental, case-control (retrospective) -- with probabilities that
  depend on the design.
- "How Prism generates random numbers" (stat_how_prism_generates_random_num.htm):
  Gaussian error is added to the ideal value; relative error draws a
  Gaussian with SD = the percent you enter and multiplies that percentage
  by the ideal Y; t-distributed error with df degrees of freedom (built
  from df+1 Gaussian draws: wider tails, Cauchy at df = 1); Poisson error
  draws an integer with mean = the ideal value (no SD); binomial error
  draws from a binomial with the proportion computed by the simulation
  and a sample size you enter.  (Prism's own generator is RAN3/GASDEV from
  Numerical Recipes seeded from the clock; this module uses numpy's PCG64
  so values are reproducible here but not bit-identical to Prism's.)
- "How to: Monte Carlo analyses" (statistics/stat_how_to_monte_carlo_analyses.htm)
  and "Monte Carlo example: Accuracy of confidence intervals"
  (statistics/stat_example_accuracy_of_confidence.htm): repeat the
  simulation + analysis many times, tabulate chosen results, optionally
  define a "hit" (a value equals a number or lies within a range, e.g. the
  CI brackets the true value) and report the fraction of hits.

Equations come from the nlfit model registry (MODELS[...].func), so the
simulated curves are exactly the curves the fitter fits.
"""

from __future__ import annotations

import copy
import math
import re

import numpy as np

from . import nlfit

MAX_POINTS = 100_000
MAX_REPEATS = 10_000


# --------------------------------------------------------------- seeds

def _resolve_seed(seed):
    if seed is None:
        return int(np.random.SeedSequence().entropy % (2 ** 32))
    return int(seed)


def _out(v):
    if v is None:
        return None
    v = float(v)
    return v if math.isfinite(v) else None


def _letter(i: int) -> str:
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


# ------------------------------------------------------------ X values

def x_series(spec) -> list:
    """X values from a spec.

    list/tuple -> used as is.
    {"kind": "arithmetic", "start", "increment", "stop" | "count"}
        start, start+inc, ... stopping when X equals or exceeds stop
        (the guide's example: -9 by 0.5 to -3 -> 13 values)
    {"kind": "geometric", "start", "factor", "stop" | "count"}
        start, start*factor, ...
    {"kind": "linear" | "log", "start", "stop", "count"}
        evenly spaced (log: evenly spaced in log10, start/stop > 0)
    """
    if isinstance(spec, (list, tuple)):
        return [None if v is None else float(v) for v in spec]
    kind = spec.get("kind", "arithmetic")
    start = float(spec["start"])
    count = spec.get("count")
    stop = spec.get("stop")
    if count is not None:
        count = int(count)
        if count < 1:
            raise ValueError("count must be at least 1")
        if count > MAX_POINTS:
            raise ValueError(f"at most {MAX_POINTS} X values")
    if kind in ("linear", "log"):
        if stop is None or count is None:
            raise ValueError(f"{kind} spacing needs start, stop and count")
        if kind == "linear":
            return [float(v) for v in np.linspace(start, float(stop), count)]
        if start <= 0 or float(stop) <= 0:
            raise ValueError("log spacing needs positive start and stop")
        return [float(v) for v in np.logspace(math.log10(start),
                                              math.log10(float(stop)), count)]
    if kind == "arithmetic":
        step = float(spec.get("increment", spec.get("step", 1.0)))
        if step == 0:
            raise ValueError("increment must not be zero")
        nxt = lambda i: start + i * step  # noqa: E731
    elif kind == "geometric":
        factor = float(spec.get("factor", 10.0))
        if factor <= 0 or factor == 1 or start == 0:
            raise ValueError("geometric series needs start != 0 and a "
                             "positive factor != 1")
        nxt = lambda i: start * factor ** i  # noqa: E731
    else:
        raise ValueError(f"unknown X series kind: {kind}")
    if count is not None:
        return [float(nxt(i)) for i in range(count)]
    if stop is None:
        raise ValueError("X series needs stop or count")
    stop = float(stop)
    out = []
    increasing = nxt(1) > nxt(0)
    for i in range(MAX_POINTS + 1):
        v = nxt(i)
        out.append(float(v))
        tol = 1e-9 * max(1.0, abs(stop))
        if (increasing and v >= stop - tol) or \
                (not increasing and v <= stop + tol):
            break
    else:
        raise ValueError(f"more than {MAX_POINTS} X values; check stop")
    # snap the float drift of the last value onto stop
    if abs(out[-1] - stop) <= 1e-9 * max(1.0, abs(stop)):
        out[-1] = stop
    return out


# --------------------------------------------------------- random error

ERROR_KINDS = ("none", "gaussian", "relative", "t", "poisson", "binomial")


def add_error(ideal, error, rng) -> np.ndarray:
    """Apply one random-error model to an array of ideal values.

    error: {"kind": ...}
      none
      gaussian  {"sd"}       ideal + N(0, sd)
      relative  {"percent"}  ideal + ideal * N(0, percent)/100
      t         {"sd", "df"} ideal + sd * t(df)
      poisson                Poisson(mean = ideal); ideal < 0 -> blank
      binomial  {"n", "percent": bool, "output": "proportion"|"count"}
                k ~ Binomial(n, p = ideal (or ideal/100 when percent));
                returned as k/n (x100 if percent) or as the count k
    optional outliers: {"outliers": {"probability", "sd_multiple",
      "direction": "both"|"up"|"down"}} -- with that probability a point
      is moved by sd_multiple * sd (gaussian/t) or * percent% of Y.
    """
    error = error or {"kind": "none"}
    kind = error.get("kind", "none")
    ideal = np.asarray(ideal, dtype=float)
    if kind == "none":
        y = ideal.copy()
    elif kind == "gaussian":
        y = ideal + float(error.get("sd", 0.0)) * rng.standard_normal(ideal.shape)
    elif kind == "relative":
        pct = float(error.get("percent", 0.0))
        y = ideal + ideal * pct * rng.standard_normal(ideal.shape) / 100.0
    elif kind == "t":
        df = float(error.get("df", 3))
        if df <= 0:
            raise ValueError("t error needs df > 0")
        y = ideal + float(error.get("sd", 1.0)) * rng.standard_t(df, ideal.shape)
    elif kind == "poisson":
        lam = np.where(ideal >= 0, ideal, 0.0)
        y = np.where(ideal >= 0, rng.poisson(np.nan_to_num(lam)).astype(float),
                     np.nan)
        y = np.where(np.isnan(ideal), np.nan, y)
    elif kind == "binomial":
        n = int(error.get("n", 100))
        if n < 1:
            raise ValueError("binomial error needs n >= 1")
        pct = bool(error.get("percent", False))
        p = ideal / 100.0 if pct else ideal
        ok = (p >= 0) & (p <= 1)
        k = rng.binomial(n, np.where(ok, p, 0.0)).astype(float)
        if error.get("output", "proportion") == "count":
            y = k
        else:
            y = k / n * (100.0 if pct else 1.0)
        y = np.where(ok, y, np.nan)
    else:
        raise ValueError(f"unknown error kind: {kind} "
                         f"(choose from {', '.join(ERROR_KINDS)})")
    out = error.get("outliers")
    if out and float(out.get("probability", 0)) > 0:
        prob = float(out["probability"])
        mult = float(out.get("sd_multiple", 5.0))
        if kind == "relative":
            size = np.abs(ideal) * float(error.get("percent", 0.0)) / 100.0
        else:
            size = float(error.get("sd", 1.0))
        hit = rng.random(ideal.shape) < prob
        direction = out.get("direction", "both")
        sign = (np.ones(ideal.shape) if direction == "up" else
                -np.ones(ideal.shape) if direction == "down" else
                np.where(rng.random(ideal.shape) < 0.5, -1.0, 1.0))
        y = np.where(hit, y + sign * mult * size, y)
    return y


# ------------------------------------------------------------ simulate XY

def simulate_xy(model: str | None = None, params=None, *, x=None,
                n_datasets: int = 1, replicates: int = 1, error=None,
                ideal=None, names=None, seed=None, rng=None) -> dict:
    """Simulate an XY table.

    model: a key of nlfit.MODELS (X in the model's own units -- log10
    concentration for the log(dose) models). params: {name: value} shared
    by all data sets, or a list with one dict per data set (each merged
    over the first, so only differences need entering).
    ideal: instead of a model, a list (one per data set) of ideal Y per
    row -- Prism's "use Y values from the data table, then add scatter".
    x: list or x_series spec. replicates: subcolumns per data set.
    Returns the API table {"x", "datasets": [{"name", "ys", "ideal"}],
    "seed", "model", "params"}.
    """
    if rng is None:
        seed = _resolve_seed(seed)
        rng = np.random.default_rng(seed)
    xs = x_series(x if x is not None else
                  {"kind": "arithmetic", "start": 0, "increment": 1,
                   "count": 10})
    x_arr = np.array([np.nan if v is None else v for v in xs])
    replicates = int(replicates)
    if not 1 <= replicates <= 1000:
        raise ValueError("replicates must be between 1 and 1000")
    if len(xs) * replicates * max(1, int(n_datasets)) > MAX_POINTS:
        raise ValueError(f"simulation larger than {MAX_POINTS} values")

    if ideal is not None:
        ideals = [np.array([np.nan if v is None else float(v) for v in col])
                  for col in ideal]
        param_list = [None] * len(ideals)
    else:
        spec = nlfit.MODELS.get(model)
        if spec is None:
            raise ValueError(f"unknown model: {model}")
        if isinstance(params, list):
            base = dict(params[0] if params else {})
            param_list = [{**base, **(p or {})} for p in params]
            if len(param_list) < n_datasets:
                param_list += [base] * (n_datasets - len(param_list))
        else:
            param_list = [dict(params or {})] * int(n_datasets)
        ideals = []
        for p in param_list:
            missing = [k for k in spec.params if k not in p]
            if missing:
                raise ValueError(f"missing parameter value(s) for {model}: "
                                 f"{', '.join(missing)}")
            with np.errstate(all="ignore"):
                y = np.asarray(spec.func(x_arr, {k: float(p[k])
                                                 for k in spec.params}),
                               dtype=float)
            ideals.append(np.broadcast_to(y, x_arr.shape).astype(float))

    datasets = []
    for i, yi in enumerate(ideals):
        grid = add_error(np.repeat(yi[:, None], replicates, axis=1), error,
                         rng)
        name = (names[i] if names and i < len(names)
                else f"Data Set {_letter(i)}")
        datasets.append({"name": name,
                         "ys": [[_out(v) for v in row] for row in grid],
                         "ideal": [_out(v) for v in yi]})
    result = {"x": [_out(v) for v in x_arr], "datasets": datasets,
              "seed": seed, "model": model}
    if param_list and param_list[0] is not None:
        result["params"] = param_list
    return result


# -------------------------------------------------------- simulate column

def simulate_column(groups, *, error=None, random_means=None, seed=None,
                    rng=None) -> dict:
    """Simulate a Column table.

    groups: [{"name", "n", "mean"}] (per-group "error" overrides the shared
    one).  random_means={"mean", "sd"}: instead of entering each mean,
    each column mean is drawn from N(mean, sd).  error as in add_error,
    default Gaussian with sd 1.
    Returns {"x": row numbers, "datasets": [{"name", "ys": [[v], ...],
    "population_mean"}], "seed"} -- the column-table shape the t test /
    ANOVA handlers read.
    """
    if rng is None:
        seed = _resolve_seed(seed)
        rng = np.random.default_rng(seed)
    error = error or {"kind": "gaussian", "sd": 1.0}
    total = sum(int(g.get("n", 0)) for g in groups)
    if total > MAX_POINTS:
        raise ValueError(f"simulation larger than {MAX_POINTS} values")
    datasets = []
    for i, g in enumerate(groups):
        n = int(g.get("n", 0))
        if n < 0:
            raise ValueError("n must be >= 0")
        if random_means is not None:
            mu = float(random_means.get("mean", 0.0)) + float(
                random_means.get("sd", 0.0)) * rng.standard_normal()
        else:
            mu = float(g.get("mean", 0.0))
        vals = add_error(np.full(n, mu), g.get("error") or error, rng)
        datasets.append({"name": g.get("name") or f"Group {_letter(i)}",
                         "ys": [[_out(v)] for v in vals],
                         "population_mean": mu})
    n_max = max((int(g.get("n", 0)) for g in groups), default=0)
    return {"x": [float(i + 1) for i in range(n_max)],
            "datasets": datasets, "seed": seed}


# --------------------------------------------------- simulate contingency

DESIGNS = ("cross_sectional", "prospective", "experimental", "case_control")


def _probs(p, width, what):
    """A probability row: a number (2 columns -> [p, 1-p]) or a list."""
    if isinstance(p, (int, float)):
        p = [float(p), 1.0 - float(p)]
    p = np.asarray(p, dtype=float)
    if p.size == width - 1:
        p = np.append(p, 1.0 - p.sum())
    if p.size != width or np.any(p < -1e-12) or abs(p.sum() - 1) > 1e-6:
        raise ValueError(f"{what} must be {width} probabilities that sum "
                         "to 1")
    return np.clip(p, 0, None) / np.clip(p, 0, None).sum()


def simulate_contingency(design: str = "prospective", *, total=None,
                         row_totals=None, column_totals=None,
                         cell_probabilities=None, row_probabilities=None,
                         outcome_probabilities=None,
                         exposure_probabilities=None,
                         row_titles=None, column_titles=None,
                         seed=None, rng=None) -> dict:
    """Simulate a contingency table (rows = groups/exposure, columns =
    outcomes).

    cross_sectional: `total` subjects sampled regardless of exposure or
      outcome -> multinomial over cells. Give cell_probabilities (rows x
      cols) or row_probabilities + outcome_probabilities (one row of
      outcome probabilities per row).
    prospective / experimental: rows are chosen (exposure) or assigned
      (treatment): row_totals (or `total` split by row_probabilities,
      default equal) and outcome_probabilities per row (a number for a
      two-column table means P(first outcome)) -> binomial per row.
    case_control: columns (cases / controls) are chosen: column_totals (or
      `total` split equally) and exposure_probabilities per column (P(row)
      within that column) -> binomial per column, looking back at exposure.
    Returns {"table", "row_titles", "column_titles", "design", "seed"}.
    """
    if rng is None:
        seed = _resolve_seed(seed)
        rng = np.random.default_rng(seed)
    if design not in DESIGNS:
        raise ValueError(f"unknown design: {design}")

    def split(tot, probs, k):
        probs = _probs(probs, k, "group fractions") if probs is not None \
            else np.full(k, 1.0 / k)
        return rng.multinomial(int(tot), probs)

    if design == "cross_sectional":
        if total is None:
            raise ValueError("cross-sectional design needs total")
        if cell_probabilities is not None:
            cp = np.asarray(cell_probabilities, dtype=float)
            if np.any(cp < 0) or cp.ndim != 2:
                raise ValueError("cell_probabilities must be a rows x "
                                 "columns grid of non-negative numbers")
            flat = cp.ravel() / cp.sum()
            table = rng.multinomial(int(total), flat).reshape(cp.shape)
        else:
            if outcome_probabilities is None:
                raise ValueError("give cell_probabilities, or "
                                 "row_probabilities + outcome_probabilities")
            out = [o for o in outcome_probabilities]
            width = 2 if isinstance(out[0], (int, float)) else len(out[0])
            rp = (_probs(row_probabilities, len(out), "row_probabilities")
                  if row_probabilities is not None
                  else np.full(len(out), 1.0 / len(out)))
            cp = np.array([rp[i] * _probs(o, width, "outcome_probabilities")
                           for i, o in enumerate(out)])
            table = rng.multinomial(int(total), cp.ravel()).reshape(cp.shape)
    elif design in ("prospective", "experimental"):
        if outcome_probabilities is None:
            raise ValueError(f"{design} design needs outcome_probabilities "
                             "(one per row)")
        out = list(outcome_probabilities)
        width = 2 if isinstance(out[0], (int, float)) else len(out[0])
        if row_totals is None:
            if total is None:
                raise ValueError("give row_totals or total")
            if row_probabilities is not None:
                row_totals = split(total, row_probabilities, len(out))
            else:  # equal allocation; remainder to the first rows
                q, r = divmod(int(total), len(out))
                row_totals = [q + (1 if i < r else 0) for i in range(len(out))]
        if len(row_totals) != len(out):
            raise ValueError("row_totals and outcome_probabilities differ "
                             "in length")
        table = np.array([rng.multinomial(int(n), _probs(o, width,
                                                         "outcome "
                                                         "probabilities"))
                          for n, o in zip(row_totals, out)])
    else:  # case_control
        if exposure_probabilities is None:
            raise ValueError("case-control design needs "
                             "exposure_probabilities (one per column)")
        exp = list(exposure_probabilities)
        height = 2 if isinstance(exp[0], (int, float)) else len(exp[0])
        if column_totals is None:
            if total is None:
                raise ValueError("give column_totals or total")
            q, r = divmod(int(total), len(exp))
            column_totals = [q + (1 if i < r else 0) for i in range(len(exp))]
        cols = [rng.multinomial(int(n), _probs(e, height,
                                               "exposure probabilities"))
                for n, e in zip(column_totals, exp)]
        table = np.array(cols).T
    table = np.asarray(table, dtype=int)
    r, c = table.shape
    return {"table": [[int(v) for v in row] for row in table],
            "row_titles": list(row_titles) if row_titles else
            [f"Row {i + 1}" for i in range(r)],
            "column_titles": list(column_titles) if column_titles else
            [f"Column {_letter(j)}" for j in range(c)],
            "design": design, "seed": seed}


# ----------------------------------------------------------- Monte Carlo

_PATH_TOKEN = re.compile(r"[^.\[\]]+|\[\s*-?\d+\s*\]")


def extract(result, path):
    """Pull a value out of a nested result by 'a.b.0.c' or 'a.b[0].c'.
    Integer steps index lists; a list step that is not an integer selects
    the element whose "name" equals it. Returns None when absent."""
    cur = result
    for tok in _PATH_TOKEN.findall(str(path)):
        tok = tok.strip()
        if tok.startswith("["):
            tok = tok[1:-1].strip()
        if isinstance(cur, dict):
            if tok in cur:
                cur = cur[tok]
                continue
            return None
        if isinstance(cur, (list, tuple)):
            try:
                cur = cur[int(tok)]
                continue
            except (ValueError, IndexError):
                match = [e for e in cur if isinstance(e, dict)
                         and e.get("name") == tok]
                if not match:
                    return None
                cur = match[0]
                continue
        return None
    return cur


def _number(v):
    if isinstance(v, bool):
        return float(v)
    if isinstance(v, (int, float)) and math.isfinite(float(v)):
        return float(v)
    return None


def _cond_ok(cond, row: dict) -> bool | None:
    op = cond.get("op", "between")

    def val(key):
        ref = cond.get(key)
        if isinstance(ref, str):
            return row.get(ref)
        return None if ref is None else float(ref)

    if op == "contains":  # lower <= value <= upper (CI brackets truth)
        lo, hi = row.get(cond["lower"]), row.get(cond["upper"])
        v = float(cond["value"])
        if lo is None or hi is None:
            return None
        return lo <= v <= hi
    v = row.get(cond["name"])
    if v is None:
        return None
    if op in ("between", "outside"):
        lo, hi = val("low"), val("high")
        lo = -math.inf if lo is None else lo
        hi = math.inf if hi is None else hi
        inside = lo <= v <= hi
        return inside if op == "between" else not inside
    ref = val("value")
    if ref is None:
        return None
    return {"lt": v < ref, "le": v <= ref, "gt": v > ref, "ge": v >= ref,
            "eq": abs(v - ref) <= 1e-12 * max(1.0, abs(ref)),
            "ne": abs(v - ref) > 1e-12 * max(1.0, abs(ref))}[op]


def _summary(vals: list) -> dict:
    a = np.array([v for v in vals if v is not None], dtype=float)
    n = int(a.size)
    if not n:
        return {"n": 0, "n_missing": len(vals)}
    pct = np.percentile(a, [2.5, 25, 50, 75, 97.5])
    sd = float(a.std(ddof=1)) if n > 1 else None
    return {"n": n, "n_missing": len(vals) - n, "mean": float(a.mean()),
            "sd": sd, "sem": sd / math.sqrt(n) if sd is not None else None,
            "min": float(a.min()), "max": float(a.max()),
            "median": float(pct[2]),
            "percentiles": {"2.5": float(pct[0]), "25": float(pct[1]),
                            "50": float(pct[2]), "75": float(pct[3]),
                            "97.5": float(pct[4])}}


def simulate(spec: dict, *, seed=None, rng=None) -> dict:
    """Run one simulation from a spec {"kind": "xy"|"column"|
    "contingency", ...keyword arguments of that simulate_* function}."""
    spec = dict(spec)
    kind = spec.pop("kind", "xy")
    spec.pop("seed", None)
    fn = {"xy": simulate_xy, "column": simulate_column,
          "contingency": simulate_contingency}.get(kind)
    if fn is None:
        raise ValueError(f"unknown simulation kind: {kind}")
    return fn(**spec, seed=seed, rng=rng)


def _as_data(kind: str, sim: dict) -> dict:
    if kind == "contingency":
        return {"table": sim["table"], "row_titles": sim["row_titles"],
                "column_titles": sim["column_titles"]}
    return {"x": sim["x"],
            "datasets": [{"name": d["name"], "ys": d["ys"]}
                         for d in sim["datasets"]]}


def monte_carlo(spec: dict, analysis_payload_template: dict, n_repeats: int,
                result_path, seed=None, *, hit=None,
                keep_values: bool = True) -> dict:
    """Repeat simulate -> analyze -> tabulate.

    spec: simulation spec (see simulate()); analysis_payload_template: an
    api.analyze payload ({"analysis", "options"}); its "data" is replaced
    by each simulated table. result_path: a path string, a list of paths,
    or {label: path} -- what to tabulate (see extract()).
    hit: optional condition, or {"all": [conditions]} / {"any": [...]}:
      {"name", "op": "lt"|"le"|"gt"|"ge"|"eq"|"ne", "value": number|label}
      {"name", "op": "between"|"outside", "low", "high"}
      {"op": "contains", "lower": label, "upper": label, "value": truth}
    n_repeats is capped at MAX_REPEATS. Each repeat gets an independent
    stream spawned from `seed`, so the same seed reproduces every data set.

    Returns {"n_repeats", "seed", "n_failed", "errors" (first few),
    "tabulated": {label: summary}, "values": {label: [...]},
    "hits": {"n", "fraction", "ci95"}?}.
    """
    from . import api  # lazy: api imports this module
    from .manipulate import proportion_ci

    n_repeats = int(n_repeats)
    if n_repeats < 1:
        raise ValueError("n_repeats must be at least 1")
    capped = n_repeats > MAX_REPEATS
    n_repeats = min(n_repeats, MAX_REPEATS)
    if isinstance(result_path, str):
        paths = {result_path: result_path}
    elif isinstance(result_path, dict):
        paths = dict(result_path)
    else:
        paths = {p: p for p in result_path}
    seed = _resolve_seed(seed)
    children = np.random.SeedSequence(seed).spawn(n_repeats)
    kind = spec.get("kind", "xy")

    values = {label: [] for label in paths}
    hit_flags: list = []
    errors, n_failed = [], 0
    for i in range(n_repeats):
        rng = np.random.default_rng(children[i])
        row = {}
        try:
            sim = simulate(spec, rng=rng)
            payload = copy.deepcopy(analysis_payload_template)
            payload["data"] = _as_data(kind, sim)
            res = api.analyze(payload)
            if "error" in res and len(res) <= 2:
                raise ValueError(res["error"])
            for label, path in paths.items():
                row[label] = _number(extract(res, path))
        except Exception as exc:  # one failed repeat must not stop the run
            n_failed += 1
            if len(errors) < 5:
                errors.append(f"repeat {i + 1}: {exc}")
            row = {label: None for label in paths}
        for label in paths:
            values[label].append(row[label])
        if hit is not None:
            hit_flags.append(_hit(hit, row))

    result = {"n_repeats": n_repeats, "capped": capped, "seed": seed,
              "n_failed": n_failed, "errors": errors,
              "tabulated": {label: _summary(v) for label, v in values.items()}}
    if keep_values:
        result["values"] = values
    if hit is not None:
        decided = [h for h in hit_flags if h is not None]
        n_hits = sum(1 for h in decided if h)
        frac = n_hits / len(decided) if decided else None
        result["hits"] = {
            "n_hits": n_hits, "n_decided": len(decided),
            "n_undecided": len(hit_flags) - len(decided),
            "fraction": frac,
            "ci95": (proportion_ci(n_hits, len(decided)) if decided
                     else [None, None]),
            "flags": hit_flags if keep_values else None,
        }
    return result


def _hit(hit, row):
    if "all" in hit or "any" in hit:
        conds = hit.get("all") or hit.get("any")
        res = [_cond_ok(c, row) for c in conds]
        if any(r is None for r in res):
            return None
        return all(res) if "all" in hit else any(res)
    return _cond_ok(hit, row)
