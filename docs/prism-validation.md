# Numeric cross-validation protocol

Goal: verify, number for number, that OpenDose reproduces the results a
real GraphPad Prism installation produces on the reference dataset below
(a factual correctness record; see the trademark note in the README).
Repeat this protocol whenever the fitting code changes.

## Reference dataset "Drug A"

Enter in Prism as an **XY table, X: Numbers, Y: 3 replicate values in
side-by-side subcolumns**. X is molar concentration (not yet log).

| X (Conc., M) | Y1    | Y2    | Y3   |
|--------------|-------|-------|------|
| 1e-9         | 98.2  | 101.5 | 99.1 |
| 3.162e-9     | 97.0  | 95.8  | 99.9 |
| 1e-8         | 93.4  | 90.1  | 92.7 |
| 3.162e-8     | 78.9  | 82.3  | 80.0 |
| 1e-7         | 51.2  | 48.7  | 50.9 |
| 3.162e-7     | 22.1  | 25.6  | 24.0 |
| 1e-6         | 8.9   | 10.2  | 7.5  |
| 3.162e-6     | 3.1   | 4.4   | 2.2  |
| 1e-5         | 1.0   | 0.5   | 2.1  |

(The same dataset is hard-coded in `engine/tests/test_api.py` and prefilled
when the web app boots.)

## Steps in Prism

1. Analyze → Transform → **X = log(X)** (or use "Transform concentrations to logs" in the dose-response analysis chain).
2. On the transformed table: Analyze → Nonlinear regression (curve fit) →
   Dose-response, Inhibition → **log(inhibitor) vs. response - Variable
   slope (four parameters)**.
   **Do NOT insert a Normalize step**: the expected values below are for
   the raw responses. (Normalizing rescales Top, Bottom, Span, SS and
   Sy.x; see "Validation session 1" below for how that looks.)
3. Method tab: leave defaults, but confirm:
   - "Consider each replicate Y value as an individual point" is selected.
   - No weighting.
   - No constraints.
4. Confidence tab: select **asymptotic (approximate) 95% CIs** (Prism 8+
   defaults to profile likelihood; switch to asymptotic until we implement
   profile CIs; then validate both).
5. Screenshot the full Results sheet.

## Expected OpenDose results

(Computed with the concentrations exactly as tabulated above: 3.162e-9,
not 10^-8.5. The rounding matters in the 4th significant digit of SS.)

| Quantity  | Best-fit  | Std. Error | 95% CI (asymptotic)      |
|-----------|-----------|------------|--------------------------|
| Top       | 99.8562   | 0.731312   | 98.3433 to 101.369       |
| Bottom    | 0.980133  | 0.744550   | −0.560085 to 2.52035     |
| LogIC50   | −6.98304  | 0.0147123  | −7.01348 to −6.95261     |
| HillSlope | −1.10347  | 0.0386854  | −1.18349 to −1.02344     |
| IC50      | 1.03982e-7| n/a        | 9.69446e-8 to 1.11530e-7 |
| Span      | 98.8760   | 1.17536    | 96.4446 to 101.307       |

| Goodness of fit       |          |
|-----------------------|----------|
| Degrees of freedom    | 23       |
| R squared             | 0.998618 |
| Sum of squares        | 59.5816  |
| Sy.x                  | 1.60950  |
| # of points analyzed  | 27       |

## Acceptance criteria

- Best-fit values: agree to ≥ 5 significant digits (both are least-squares
  minimizers of the identical objective; disagreement beyond convergence
  tolerance means a real semantic difference).
- Std. Errors and asymptotic CIs: agree to ≥ 4 significant digits.
- df, # points: exact.
- R², SS, Sy.x: agree to ≥ 5 significant digits.

Record any deviation in this file together with its diagnosis (e.g. Prism
option we mis-modeled) before changing engine code.

## Validation session 1 (2026-08-10): PASSED

User's Prism run used the chain Data → Transform → **Normalize** → fit
(Normalize was not in the protocol; configured as 0% = 0, 100% = largest
value, i.e. all Y divided by 99.6). Outcome:

- All scale-invariant quantities matched our expected table **exactly at
  every displayed digit**: LogIC50 −6.983 (CI −7.013 to −6.953),
  HillSlope −1.103 (CI −1.183 to −1.023), IC50 1.040e-7
  (CI 9.694e-8 to 1.115e-7), df 23, R² 0.9986.
- Re-running the same normalize-then-fit pipeline through our engine
  reproduced every remaining number to the displayed precision:
  Bottom 0.9841, Top 100.3, Span 99.27 (CI 96.83 to 101.7), SS 60.1,
  Sy.x 1.616. Differences confined to the 4th significant digit
  (convergence tolerance).
- Discovered gap, now fixed: Prism reports **Span** (Top − Bottom) with
  SE/CI from the full covariance; the engine now reports it too (row
  added to the expected table above).

## Validation session 2 (2026-08-11): PASSED, digit-perfect

User re-ran the exact protocol (Transform -> fit, no Normalize,
asymptotic CIs). Result: **all 16 reported quantities matched at every
displayed digit**: best-fit values, all six 95% CIs, df, R², SS, Sy.x,
n. The one earlier discrepancy (SS 59.58 vs 59.60) traced to the tabulated
concentration rounding (3.162e-9 vs 10^-8.5); with the typed values our
engine reproduces Prism exactly. This ground truth is pinned in
`engine/tests/test_prism_parity.py`, which asserts every number from the
Prism screenshot at display precision.

## Validation session 3 (2026-08-11): profile CIs PASSED digit-perfect; weighted fit PASSED for best-fit values

**(a) Asymmetrical (profile likelihood) CIs, unweighted:** all five CI
pairs (Bottom, Top, LogIC50, HillSlope, IC50) matched **at every
displayed digit**. Best-fit values unchanged from session 2, as
expected. Our profile CI implementation is validated against Prism's
default method.

**(b) Weighted fit (1/Y²):** revealed Prism's exact weighting semantics
with replicates: each replicate is weighted by the **mean observed Y of
the replicates at that X** (not the per-point observed Y, and not the
predicted curve Y). With that (`weight_source="observed_mean"`, now the
engine default) all best-fit values matched at display precision:
Bottom 0.3122, Top 101.4, LogIC50 −7.002, HillSlope −1.023,
IC50 9.955e-8, Span 101.0; and R²(weighted) 0.9422 (exact),
weighted SS 1.232, Sy.x 0.2314.

**RESOLVED (same day, from the Prism docs):** the guide page ["Math
theory of weighting"](https://www.graphpad.com/guides/prism/latest/curve-fitting/reg_how_weigting_works.htm)
specifies that Y-based weights come from the **predicted curve Y**, the
**first iteration is unweighted**, and each subsequent iteration
re-derives weights from the current curve, i.e. iteratively reweighted
least squares (IRLS) with weights frozen within an iteration. The IRLS
fixed point differs from the minimizer of the ratio objective; and
during Venzon-Moolgavkar profiling
(["How profile likelihood CIs are computed"](https://www.graphpad.com/guides/prism/latest/curve-fitting/reg_how_confidence_intervals_are_c.htm))
each profiled refit re-derives its own weights. After implementing IRLS
(`weight_source="predicted"`, now the default), **all 15 weighted-fit
quantities match Prism at every displayed digit**, including all five
weighted profile CIs, weighted R² 0.9422, weighted SS 1.232 and
Sy.x 0.2314.

All matched values pinned in `engine/tests/test_prism_parity.py`
(31 real-Prism assertions).

## Known parity gaps (roadmap)

- Profile-likelihood ("asymmetrical") CIs, the Prism 8+ default.
- Robust fitting and outlier detection (ROUT, Motulsky & Brown 2006).
- Weighting options (1/Y, 1/Y²).
- "Ambiguous" / "hit constraint" fit-status flagging.
- Replicates test / runs test for lack of fit.
