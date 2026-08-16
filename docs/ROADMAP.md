# Feature roadmap

The analysis catalog follows the standard methods of the field as they
are publicly documented in GraphPad's guides (referenced nominatively
as the de-facto catalog of what a wet lab needs; see the trademark
note in the README): [user guide](https://www.graphpad.com/guides/prism/latest/user-guide/index.htm),
[curve fitting](https://www.graphpad.com/guides/prism/latest/curve-fitting/index.htm),
[statistics](https://www.graphpad.com/guides/prism/latest/statistics/index.htm).

## Done

### Curve fitting / XY workflow
- [x] Dose-response models: log(inhibitor|agonist) vs. response, 3PL/4PL,
      Prism's exact equations and initial values
- [x] "Constant equal to" constraints; each-replicate-individual-point fitting
- [x] Asymptotic SEs, t-based 95% CIs, IC50/EC50 with asymmetric CI
- [x] R², Sy.x, df, sum of squares; multi-start optimizer;
      Prism "Ambiguous" flag (dependency > 0.9999)
- [x] Transforms (X=log(X) etc.), Normalize (full dialog semantics),
      error bars SD/SEM/95% CI/range
- [x] Plate quantification: SRB/MTT xlsx or pasted grid, blank subtraction,
      % viability / % inhibition vs 0-dose control, per-group splitting

### Curve fitting, round 2
- [x] General model registry: Michaelis-Menten, saturation binding,
      one-phase decay/association (half-life, tau), exponential growth
      (doubling time), straight line
- [x] Weighting by predicted Y (1/Y, 1/Y²) and by X (1/X, 1/X²)
- [x] Profile-likelihood ("asymmetrical") CIs, the Prism 8+ default method
- [x] Robust regression + ROUT outlier elimination (Motulsky-Brown, FDR Q)
- [x] Compare fits: extra sum-of-squares F test + AICc probabilities

### Statistics (column data)
- [x] Column statistics: full descriptive set + geometric mean/CI, CV,
      skewness, kurtosis
- [x] Normality: Shapiro-Wilk, D'Agostino-Pearson, Anderson-Darling
- [x] One-sample t, Wilcoxon signed rank
- [x] t tests: unpaired, Welch, paired (+ pairing correlation), Mann-Whitney
      (+ Hodges-Lehmann), Wilcoxon matched pairs; F test for variances
- [x] One-way ANOVA (+ Brown-Forsythe, Bartlett); Tukey-Kramer, Dunnett,
      Bonferroni, Šídák, Holm-Šídák; Kruskal-Wallis + Dunn's
- [x] Outliers: Grubbs (iterative ESD)
- [x] Correlation: Pearson (Fisher-z CI), Spearman
- [x] Two-way ANOVA: Type III SS via effect-coded GLM (balanced and
      unbalanced), % of total variation
- [x] Contingency: chi-square (±Yates), Fisher exact, odds ratio (Woolf),
      relative risk, sensitivity/specificity (Wilson CIs), R×C tables

### App
- [x] XY + Column table modes, Excel paste, plate import UI, Plotly graphs
      (dose-response curves, column scatter with mean±SD), Prism-style
      results sheets, ambiguity badge

### Roadmap completion (2026-08-11)
- [x] Interpolation from standard curves (Y→X) + confidence/prediction
      bands (delta method); absolute IC50 with band-crossing CI
- [x] Global fitting with shared parameters (pooled df/SEs, UI sharing
      checkboxes)
- [x] Dedicated linear regression (slope/intercept CIs, X-intercept,
      F test, exact runs test, closed-form bands); two-phase decay;
      2nd/3rd order polynomials
- [x] Diagnostics: replicates (lack-of-fit) test, runs test, residual
      normality, all behind one checkbox in the app
- [x] Survival: Kaplan-Meier (Greenwood log-log CIs, medians), log-rank
      (Peto form, Prism's), Gehan-Breslow-Wilcoxon (proper quadratic-form
      variance, matches statsmodels), Mantel-Haenszel hazard ratio;
      full Survival mode in the app
- [x] RM one-way ANOVA (Geisser-Greenhouse, matches statsmodels AnovaRM),
      Friedman + Dunn's, ROC (DeLong), Bland-Altman, column ROUT
- [x] App: project save/load (JSON), methods-text generator with copy
      button, survival table mode, interpolation panel, global-fit UI

### Final round (2026-08-11)
- [x] Competitive binding: One site - Fit logIC50, One site - Fit Ki
      (Cheng-Prusoff, hot-ligand constants), Two sites - Fit logIC50
- [x] Gaddum/Schild EC50 shift: global fit across agonist curves with
      per-dataset antagonist concentration; pA2, SchildSlope, KB with CI;
      dose ratios per curve; optional SchildSlope = 1 constraint
- [x] Two-way ANOVA multiple comparisons: Tukey / Šídák / Bonferroni,
      within rows, within columns, or on main-effect means, with pooled
      MS_residual and df from the two-way model
- [x] Two-way repeated-measures ANOVA: mixed design (groups × repeated
      rows; matches pingouin.mixed_anova to machine precision, GG epsilon
      included) and fully-repeated design (matches statsmodels AnovaRM)
- [x] Prism-file import, both formats: .pzfx XML and the .prism archive
      Prism 10/11 writes (zipped JSON sheets with the numbers in CSV).
      XY / Column / Grouped / Survival tables, dataset titles, replicate
      layout, excluded-value handling, multi-table chooser in the app
      (Open button). Which format a file is comes from its bytes, not its
      name. Analysis output inside a project (transforms, results tables,
      the 999-point drawn curves) is skipped: OpenDose recomputes it.
- [x] Graph types for column data: bar (mean ± SD + points), box &
      whiskers, violin
- [x] Export controls: PNG/SVG/JPEG/WebP at exact width × height × scale
      for every graph
- [x] TIFF export at a chosen DPI (8-bit RGB, Deflate, resolution tags
      written into the file) for journals that require it
- [x] Editable axis titles on every graph, kept per graph type and saved
      with the project. Empty means "use the automatic title", so clearing
      a field undoes an edit; the placeholder shows what that restores.
- [x] Graph color schemes: default, colorblind safe, black and white for
      print, sequential for ordered series. Every palette is checked with
      a validator (lightness band, chroma floor, CVD separation over every
      pair, normal-vision floor, surface contrast) rather than picked by
      eye, and each scheme also varies the marker symbol so series
      identity never rests on color alone. Slot counts are what the
      checks allow: 6 hues in light mode, 4 in dark.

### UI/UX pass (2026-08-11)
- [x] Visual identity: Apple system palette (grouped-gray page, flat
      white cards, system-blue accent, WCAG-AA-verified contrast), Inter
      variable font (self-hosted), logo mark, tabular numerals
- [x] Layout/navigation: translucent sticky header with segmented-control
      tabs (sliding thumb, role=tablist + arrow keys, compact labels on
      narrow screens), full-width main grid, privacy/non-affiliation
      note in a header info popover
- [x] Onboarding/empty states: welcome panel with spinner + live engine
      status; editor column inert until the engine is ready; engine-load
      failures show a plain-language error with Try again
- [x] Workspace: draggable column splitter (keyboard-adjustable,
      persisted) and two-axis island resizing with live plot redraw
- [x] Theme: auto/light/dark toggle overriding the OS, persisted,
      driving both CSS tokens and Plotly chrome
- [x] Motion: gated animation set (engine-ready reveal, entrances,
      label crossfades), prefers-reduced-motion respected
- [x] Mobile: single-column reflow, ≥40px touch targets, resize/splitter
      affordances disabled on touch
- [x] Accessibility: visible focus ring everywhere, aria-live status,
      labeled selects/file inputs, per-mode data preserved on tab
      switches, all text ≥4.5:1 contrast in both themes
- [x] Robustness: engine file fetches validated (HTML-fallback
      detection + retry), idempotent sync-py so live dev servers stay
      coherent

## Next up

1. ~~Publish the site~~ LIVE (2026-08-11): https://erenozen.dev/opendose/
   (public repo, MIT license, deployed via GitHub Actions + Pages; full
   e2e suite verified against the production URL)
2. Further screenshot validations against the user's Prism install
   (survival, ANOVA sheets, competitive binding)
3. Mixed-effects models for RM designs with missing values

## Validation protocol

Every analysis lands with tests cross-checked against an independent
implementation (statsmodels, hand-derived formulas, or published values)
(see engine/tests/). Number-level comparison against a real Prism
installation: docs/prism-validation.md (user provides screenshots).
