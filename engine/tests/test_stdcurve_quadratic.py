"""Quadratic (second-order polynomial) standard curves, as used for BCA
protein assays: unknowns are read off the parabola within the standards'
range only, on the side of the vertex the standards are on."""

import numpy as np
import pytest

from opendose import assay_stdcurve as sc

BCA = {0: (0.098, 0.102), 25: (0.128, 0.124), 125: (0.226, 0.231),
       250: (0.336, 0.330), 500: (0.551, 0.560), 750: (0.745, 0.752),
       1000: (0.921, 0.935), 1500: (1.241, 1.250), 2000: (1.512, 1.498)}


def _standards(table):
    return [{"concentration": c, "signals": list(s)} for c, s in table.items()]


def test_unknown_is_the_root_of_the_fitted_parabola():
    r = sc.standard_curve_qc(
        _standards(BCA),
        [{"name": "L", "signals": [0.402, 0.410], "dilution": 5}],
        model="quadratic", blank="zero_standard")
    assert r["model_id"] == "polynomial_second"
    p = r["fit"]["params"]
    b0, b1, b2 = (p[k]["value"] for k in ("B0", "B1", "B2"))
    roots = np.roots([b2, b1, b0 - 0.306])          # blank-subtracted mean
    want = min(v.real for v in roots if 0 < v.real < 2000)
    u = r["unknowns"][0]
    assert u["concentration"] == pytest.approx(want, rel=1e-6)
    assert u["corrected"] == pytest.approx(5 * want, rel=1e-6)
    lo, hi = u["concentration_ci"]
    assert lo < u["concentration"] < hi


def test_no_extrapolation_beyond_the_standards():
    r = sc.standard_curve_qc(_standards(BCA),
                             [{"name": "High", "signals": [1.71, 1.70]}],
                             model="quadratic", blank="zero_standard")
    assert r["unknowns"][0]["status"] == ">ULOQ"


def test_a_parabola_turning_inside_the_standards_is_cut_at_the_vertex():
    # saturating signal: the parabola peaks between 1500 and 2000
    conc = [100, 300, 600, 900, 1200, 1500, 1800, 2000]
    y = [0.2 + 1.6e-3 * c - 4.6e-7 * c * c for c in conc]
    r = sc.standard_curve_qc(
        [{"concentration": c, "signals": [v, v + 0.002]}
         for c, v in zip(conc, y)],
        [{"name": "Near top", "signals": [1.58, 1.58]}],
        model="quadratic")
    assert any("turns within the standards" in w for w in r["warnings"])
    u = r["unknowns"][0]
    p = r["fit"]["params"]
    vertex = -p["B1"]["value"] / (2 * p["B2"]["value"])
    # never the second root, beyond the turning point
    assert u["concentration"] is None or u["concentration"] <= vertex
