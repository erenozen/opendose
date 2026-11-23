"""Reference kernel densities for graph/__tests__/kde.test.ts and the
raincloud step of scripts/e2e-figures.mjs (P-53).

R is not installed here. The bandwidth is R's bw.nrd0 (Silverman's rule of
thumb, Silverman 1986 eq. 3.31), written out from its definition in R's
stats package:

    hi <- sd(x); lo <- min(hi, IQR(x) / 1.34)   # IQR: quantile type 7
    if (!lo) lo <- hi                              # (the other fallbacks are
    0.9 * lo * length(x)^(-1/5)                    #  for sd = 0: no density)

with numpy (std ddof=1, percentile method="linear" = H&F definition 7 =
R type 7). The density is scipy.stats.gaussian_kde with
bw_method = h / sd (scipy multiplies the data's SD, ddof=1, by the factor,
so the kernel's SD is h), evaluated on R density()'s grid: 512 points from
min - 3h to max + 3h. A second, independent evaluation by the formula
1/(n h) sum phi((y - x_i)/h) is checked against scipy here.

"example" is the column table of the app's example (sheets/column/index.ts
columnSample), drawn by the e2e step.

Run from the repository root:
  /home/eren/opendose/.venv/bin/python web/src/graph/__tests__/reference/kde.py
"""
import json
import os

import numpy as np
from scipy.stats import gaussian_kde, norm

DATA = {
    "example Control": [23.1, 25.4, 21.8, 24.9, 22.6, 26.0],
    "example Treated A": [28.4, 30.2, 27.1, 31.5, 29.0, 28.8],
    "example Treated B": [35.2, 33.9, 37.4, 34.1, 36.6, 35.8],
    "bimodal": [1.0, 1.2, 0.8, 1.1, 0.9, 5.0, 5.3, 4.8, 5.1, 4.9, 5.2],
    # IQR = 0 with SD > 0: bw.nrd0 falls back to the SD
    "iqr zero": [2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 9.0],
    "two": [4.0, 6.0],
    "tiny": [1.1e-12, 1.4e-12, 0.9e-12, 1.25e-12, 1.05e-12],
    "huge": [1.1e12, 1.4e12, 0.9e12, 1.25e12, 1.05e12],
}


def nrd0(x):
    x = np.asarray(x, dtype=float)
    hi = float(np.std(x, ddof=1))
    iqr = float(np.percentile(x, 75, method="linear") - np.percentile(x, 25, method="linear"))
    lo = min(hi, iqr / 1.34)
    if not lo:
        lo = hi
    return 0.9 * lo * len(x) ** -0.2


out = {}
for name, values in DATA.items():
    x = np.asarray(values, dtype=float)
    h = nrd0(x)
    sd = float(np.std(x, ddof=1))
    kde = gaussian_kde(x, bw_method=h / sd)
    assert abs(float(np.sqrt(kde.covariance[0, 0])) - h) <= 1e-12 * h
    grid = np.linspace(x.min() - 3 * h, x.max() + 3 * h, 512)
    dens = kde(grid)
    by_formula = norm.pdf((grid[:, None] - x[None, :]) / h).sum(axis=1) / (len(x) * h)
    assert np.allclose(dens, by_formula, rtol=1e-10, atol=0)
    # a few grid points, and the peak, for the tests to compare
    idx = [0, 64, 128, 200, 255, 256, 300, 384, 450, 511]
    out[name] = {
        "values": values, "h": h, "sd": sd,
        "grid_lo": float(grid[0]), "grid_hi": float(grid[-1]),
        "idx": idx, "y": [float(grid[i]) for i in idx],
        "density": [float(dens[i]) for i in idx],
        "max": float(dens.max()),
    }

here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "kde.json"), "w") as f:
    json.dump(out, f, indent=1)
    f.write("\n")
for k, v in out.items():
    print(f"{k}: h = {v['h']:.6g}, max density {v['max']:.6g}")
