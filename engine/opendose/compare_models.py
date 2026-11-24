"""Comparing two fitted models: are they nested, and which fits better.

Method sources:

- Extra-sum-of-squares F test (valid only for nested models, the
  simpler one a special case of the other) and Akaike's information
  criterion corrected for small samples (AICc, valid for nested and
  non-nested models fitted to the same data): Motulsky H & Christopoulos
  A (2004), Fitting Models to Biological Data Using Linear and Nonlinear
  Regression, Oxford University Press, ch. 21-23; GraphPad curve-fitting
  guide, "Comparing models" (nlfit.compare_fits_f_test /
  compare_fits_aicc compute them).
- Global models: each model is fitted to all data sets at once
  (equations.fit_global_model, the curve-fitting guide's "Global
  nonlinear regression"); one pooled sum of squares and one df per
  model, so the F test and AICc compare the two global fits exactly as
  they compare two fits of one data set (the indicator-coded single
  regression of Motulsky & Christopoulos ch. 22 / R's anova(nls, nls)).
- Which library models are nested: GraphPad curve-fitting guide,
  "Comparing models of enzyme inhibition" (the mixed model includes
  competitive, uncompetitive and noncompetitive inhibition as special
  cases; uncompetitive and noncompetitive are not nested); Gaddum/Schild
  with SchildSlope = 1 is the general model with that parameter fixed
  (curve-fitting guide, "Gaddum/Schild EC50 shift"); the 3-parameter
  logistic is the 4-parameter one with HillSlope fixed at 1 or -1.

The engine cannot prove that two arbitrary equations are nested, so
`nesting` answers "nested" only for a known relation (the table below,
or the same equation with extra parameters held constant or shared),
"not_nested" when the two fits have the same number of parameters (no F
test exists), and "unknown" otherwise: the F test is then reported with
the warning that it is valid only if one model is a special case of the
other, and AICc is the comparison to read if it is not.
"""

from __future__ import annotations

from . import nlfit

SOURCE = ("Motulsky & Christopoulos 2004, Fitting Models to Biological "
          "Data, ch. 21-23; GraphPad curve-fitting guide, 'Comparing "
          "models' and 'Comparing models of enzyme inhibition'")

# (simpler, more general) -> how the simpler is a special case
KNOWN_NESTED = {
    ("noncompetitive_inhibition", "mixed_model_inhibition"):
        "noncompetitive inhibition is mixed-model inhibition with Alpha = 1",
    ("competitive_inhibition", "mixed_model_inhibition"):
        "competitive inhibition is the limit of mixed-model inhibition as "
        "Alpha grows very large",
    ("uncompetitive_inhibition", "mixed_model_inhibition"):
        "uncompetitive inhibition is the limit of mixed-model inhibition as "
        "Alpha approaches 0",
    ("gaddum_schild_slope1_log", "gaddum_schild_log"):
        "the Gaddum/Schild model with SchildSlope = 1 is the general one "
        "with that parameter fixed",
    ("gaddum_schild_slope1", "gaddum_schild"):
        "the Gaddum/Schild model with SchildSlope = 1 is the general one "
        "with that parameter fixed",
    ("log_inhibitor_vs_response_3pl", "log_inhibitor_vs_response_4pl"):
        "the 3-parameter model is the 4-parameter one with HillSlope = -1",
    ("log_agonist_vs_response_3pl", "log_agonist_vs_response_4pl"):
        "the 3-parameter model is the 4-parameter one with HillSlope = 1",
}
KNOWN_NOT_NESTED = {
    frozenset(("uncompetitive_inhibition", "noncompetitive_inhibition")):
        "uncompetitive and noncompetitive inhibition are not nested",
}


def _equation_key(model):
    """Models that are the same equation: a user equation is registered
    once per data set ("user:<key>:<i>"), so compare its key."""
    m = str(model)
    if m.startswith("user:"):
        return m.rsplit(":", 1)[0]
    return m


def _restricts(c_simple, c_complex, s_simple, s_complex):
    """True when (c_simple, s_simple) holds constant / shares everything
    (c_complex, s_complex) does, with the same constant values, and more."""
    for k, v in c_complex.items():
        if k not in c_simple or float(c_simple[k]) != float(v):
            return False
    # a parameter shared by the general fit is shared or held constant in
    # the restricted one
    if not all(p in s_simple or p in c_simple for p in s_complex):
        return False
    return (len(c_simple) > len(c_complex)
            or len(set(s_simple)) > len(set(s_complex)))


def nesting(model_1, model_2, *, constraints_1=None, constraints_2=None,
            shared_1=None, shared_2=None, k_1=None, k_2=None) -> dict:
    """Is one of the two fits a special case of the other?

    model_i: engine model ids; constraints_i: {param: value} held
    constant; shared_i: parameters shared between data sets (global
    fits; None for one data set); k_i: fitted parameter counts (equal
    counts cannot be nested for an F test). Returns {"status": "nested"
    | "not_nested" | "unknown", "simpler": 1 | 2 | None, "reason"}."""
    c1, c2 = dict(constraints_1 or {}), dict(constraints_2 or {})
    s1, s2 = list(shared_1 or []), list(shared_2 or [])
    if k_1 is not None and k_1 == k_2:
        key = frozenset((model_1, model_2))
        reason = KNOWN_NOT_NESTED.get(
            key, "the two fits have the same number of parameters, so "
                 "neither is a special case of the other")
        return {"status": "not_nested", "simpler": None, "reason": reason}
    if _equation_key(model_1) == _equation_key(model_2):
        if _restricts(c1, c2, s1, s2):
            return {"status": "nested", "simpler": 1,
                    "reason": "model 1 is model 2 with parameters held "
                              "constant or shared"}
        if _restricts(c2, c1, s2, s1):
            return {"status": "nested", "simpler": 2,
                    "reason": "model 2 is model 1 with parameters held "
                              "constant or shared"}
        return {"status": "unknown", "simpler": None,
                "reason": "the two fits hold different parameters constant"}
    for (a, b), reason in KNOWN_NESTED.items():
        for simple, general, idx in ((model_1, model_2, 1),
                                     (model_2, model_1, 2)):
            if (simple, general) != (a, b):
                continue
            c_s, c_g = (c1, c2) if idx == 1 else (c2, c1)
            s_s, s_g = (s1, s2) if idx == 1 else (s2, s1)
            # a constant or a shared parameter of the general model keeps
            # the relation only if the simpler model has it too (the
            # general model's extra parameter, e.g. Alpha, is the one the
            # simpler model restricts)
            own = set(nlfit.MODELS[simple].params) if simple in nlfit.MODELS \
                else set()
            if all(k in c_s and float(c_s[k]) == float(v)
                   for k, v in c_g.items() if k in own) \
                    and all(p in s_s for p in s_g if p in own):
                return {"status": "nested", "simpler": idx, "reason": reason}
            return {"status": "unknown", "simpler": None,
                    "reason": "the models are nested as written, but the "
                              "parameters held constant or shared differ"}
    key = frozenset((model_1, model_2))
    if key in KNOWN_NOT_NESTED:
        return {"status": "not_nested", "simpler": None,
                "reason": KNOWN_NOT_NESTED[key]}
    return {"status": "unknown", "simpler": None,
            "reason": "OpenDose cannot tell whether one of these models is a "
                      "special case of the other"}


def fit_identity(fit: dict, constraints=None) -> tuple[str, dict]:
    """(model id, constants) of one fit for `nesting`. A user equation
    is identified by its text (whitespace-normalised) and carries its
    own default constants (e.g. Alpha = 1 typed in the equation editor)
    besides the ones held constant for this comparison."""
    held = {k: float(v) for k, v in (constraints or {}).items()}
    ue = fit.get("user_equation")
    if not ue:
        return str(fit.get("model")), held
    text = " ".join(str(fit.get("equation", "")).split())
    own = {k: float(c["value"]) for k, c in (ue.get("constraints") or {}).items()
           if c.get("kind") == "constant" and c.get("value") is not None}
    return f"user:{text}:0", {**own, **held}


def compare_two(ss, k, df, n, nest) -> dict:
    """F test and AICc for two fits of the same N points.

    ss / k / df: per model (index 0 = model 1); nest: nesting(). The F
    test is computed when the fits' df differ and the pair is not known
    to be non-nested; simpler = the one with more df."""
    out = {"nesting": nest, "f_test": None, "warnings": []}
    if df[0] != df[1] and nest["status"] != "not_nested":
        simple, complex_ = (0, 1) if df[0] > df[1] else (1, 0)
        if ss[simple] < ss[complex_] * (1 - 1e-9):
            out["warnings"].append(
                f"Model {complex_ + 1} (more parameters) fits worse than "
                f"model {simple + 1}: its fit stopped short of its best "
                "(a parameter running to a limit); the F test is set to F = 0")
        f = nlfit.compare_fits_f_test(max(ss[simple], ss[complex_]),
                                      df[simple], ss[complex_], df[complex_])
        f["simpler_model"] = simple + 1
        out["f_test"] = f
        if nest["status"] == "unknown":
            out["warnings"].append(
                "The F test is valid only if the simpler model is a special "
                "case of the other (nested); OpenDose cannot check that for "
                "these models. If they are not nested, read AICc only.")
    out["aicc"] = nlfit.compare_fits_aicc(ss[0], k[0], ss[1], k[1], n)
    return out
