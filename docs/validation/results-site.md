# OpenDose site validation (live site, through the UI)

Site: https://erenozen.dev/opendose/ · run 2026-10-09 23:24 UTC

Produced by `web/scripts/validate-site.mjs` (Playwright, headless Chromium). Every dataset of the reference corpus (`docs/validation/datasets/manifest.json` and, when present, the local-only `docs/validation/private/datasets/manifest.json`) is entered the way a user would (New data table, paste into the grid or the Import dialog / recipes, Analyze menu, options), and every reference quantity is compared with the number the results sheet shows. Screenshots: `docs/validation/site-screens/<id>.png`.

Results precision: Preferences offer 3, 4, 5, 6, 7, 8, 9, 10 significant digits; the run used 6. Tolerance: manifest tolerance + half a unit in the last significant digit the page shows (two rounded numbers agree when their rounding intervals overlap); the page strips trailing zeros, so a value is taken to carry the results precision setting (6 significant digits; P values 4) unless it shows more). Re-expressions (e.g. a scale parameter from a Hill slope, F = t²) are marked in the notes.

Cross-reference: `docs/validation/results-engine.json` (the engine run natively on the repository's current code) is matched per quantity; a quantity that fails here and passes there is fixed in the repository's engine but not yet on the live site (not deployed, or not wired into the UI).

**99 datasets**: 22 pass, 45 pass with some quantities not shown, 22 with at least one failing quantity, 10 not comparable. **1499 reference quantities**: 967 pass, 112 fail, 348 not shown / not available, 72 informational (source marked inconsistent or approximate).

## Summary per dataset

| dataset | workflow | refs | pass | fail | not shown | info | time | engine (long tasks) | status |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| `nist-sirstv` | one_way_anova | 9 | 6 | 0 | 3 | 0 | 4.3 s | 0.1 s | pass (partial) |
| `nist-smls01` | one_way_anova | 9 | 6 | 0 | 3 | 0 | 4.3 s | 0.1 s | pass (partial) |
| `nist-smls02` | one_way_anova | 9 | 6 | 0 | 3 | 0 | 4.5 s | 0.3 s | pass (partial) |
| `nist-smls03` | one_way_anova | 9 | 6 | 0 | 3 | 0 | 5.7 s | 1.2 s | pass (partial) |
| `nist-smls04` | one_way_anova | 9 | 6 | 0 | 3 | 0 | 4.5 s | 0.0 s | pass (partial) |
| `nist-smls05` | one_way_anova | 9 | 6 | 0 | 3 | 0 | 4.4 s | 0.3 s | pass (partial) |
| `nist-smls06` | one_way_anova | 9 | 6 | 0 | 3 | 0 | 5.6 s | 0.9 s | pass (partial) |
| `nist-smls07` | one_way_anova | 9 | 2 | 4 | 3 | 0 | 4.5 s | 0.0 s | FAIL |
| `nist-smls08` | one_way_anova | 9 | 2 | 4 | 3 | 0 | 4.5 s | 0.3 s | FAIL |
| `nist-smls09` | one_way_anova | 9 | 2 | 4 | 3 | 0 | 5.5 s | 0.8 s | FAIL |
| `nist-atmwtag` | one_way_anova | 9 | 6 | 0 | 3 | 0 | 4.4 s | 0.0 s | pass (partial) |
| `nist-pidigits` | descriptive_statistics | 4 | 3 | 0 | 1 | 0 | 3.8 s | 0.2 s | pass (partial) |
| `nist-lottery` | descriptive_statistics | 4 | 3 | 0 | 1 | 0 | 4 s | 0.1 s | pass (partial) |
| `nist-lew` | descriptive_statistics | 4 | 3 | 0 | 1 | 0 | 3.7 s | 0.0 s | pass (partial) |
| `nist-mavro` | descriptive_statistics | 4 | 3 | 0 | 1 | 0 | 6.9 s | 0.0 s | pass (partial) |
| `nist-michelso` | descriptive_statistics | 4 | 3 | 0 | 1 | 0 | 3.6 s | 0.0 s | pass (partial) |
| `nist-numacc1` | descriptive_statistics | 4 | 3 | 0 | 1 | 0 | 6.8 s | 0.0 s | pass (partial) |
| `nist-numacc2` | descriptive_statistics | 4 | 3 | 0 | 1 | 0 | 3.7 s | 0.1 s | pass (partial) |
| `nist-numacc3` | descriptive_statistics | 4 | 3 | 0 | 1 | 0 | 3.9 s | 0.1 s | pass (partial) |
| `nist-numacc4` | descriptive_statistics | 4 | 3 | 0 | 1 | 0 | 3.9 s | 0.1 s | pass (partial) |
| `nist-misra1a` | nonlinear_regression | 7 | 7 | 0 | 0 | 0 | 5 s | 0.0 s | pass |
| `nist-chwirut2` | nonlinear_regression | 9 | 9 | 0 | 0 | 0 | 5 s | 0.0 s | pass |
| `nist-thurber` | nonlinear_regression | 17 | 17 | 0 | 0 | 0 | 6.6 s | 0.1 s | pass |
| `nist-mgh09` | nonlinear_regression | 11 | 11 | 0 | 0 | 0 | 6.2 s | 0.0 s | pass |
| `nist-lanczos3` | nonlinear_regression | 15 | 15 | 0 | 0 | 0 | 6.5 s | 0.1 s | pass |
| `nist-boxbod` | nonlinear_regression | 7 | 7 | 0 | 0 | 0 | 5.1 s | 0.0 s | pass |
| `nist-rat42` | nonlinear_regression | 9 | 9 | 0 | 0 | 0 | 5 s | 0.0 s | pass |
| `nist-rat43` | nonlinear_regression | 11 | 11 | 0 | 0 | 0 | 5.1 s | 0.0 s | pass |
| `nist-eckerle4` | nonlinear_regression | 9 | 9 | 0 | 0 | 0 | 5 s | 0.0 s | pass |
| `nist-hahn1` | nonlinear_regression | 17 | 17 | 0 | 0 | 0 | 6.4 s | 0.0 s | pass |
| `nist-norris` | linear_regression | 13 | 8 | 0 | 5 | 0 | 4.2 s | 0.0 s | pass (partial) |
| `nist-noint1` | linear_regression | 11 | 5 | 1 | 5 | 0 | 4.1 s | 0.0 s | FAIL |
| `nist-pontius` | polynomial_regression | 15 | 10 | 0 | 5 | 0 | 4.1 s | 0.0 s | pass (partial) |
| `nist-filip` | polynomial_regression | 31 | 1 | 25 | 5 | 0 | 6.1 s | 0.0 s | FAIL |
| `nist-longley` | multiple_regression | 23 | 20 | 0 | 3 | 0 | 4.4 s | 0.0 s | pass (partial) |
| `r-plantgrowth` | one_way_anova | 8 | 6 | 0 | 2 | 0 | 4.2 s | 0.1 s | pass (partial) |
| `r-chickwts` | one_way_anova | 8 | 6 | 0 | 2 | 0 | 4.4 s | 0.1 s | pass (partial) |
| `r-insectsprays` | one_way_anova | 67 | 60 | 0 | 7 | 0 | 6.2 s | 0.0 s | pass (partial) |
| `r-hw-mucociliary` | nonparametric | 3 | 2 | 0 | 1 | 0 | 4.2 s | 0.0 s | pass (partial) |
| `r-airquality-ozone` | nonparametric | 23 | 12 | 0 | 11 | 0 | 8.2 s | 0.0 s | pass (partial) |
| `r-sleep` | t_test | 20 | 20 | 0 | 0 | 0 | 17.8 s | 0.0 s | pass |
| `r-welch-examples` | t_test | 11 | 11 | 0 | 0 | 0 | 6.5 s | 0.0 s | pass |
| `r-mtcars-mpg-by-am` | t_test | 7 | 7 | 0 | 0 | 0 | 4.1 s | 0.0 s | pass |
| `r-hw-depression` | nonparametric | 4 | 2 | 0 | 2 | 0 | 4.1 s | 0.0 s | pass (partial) |
| `r-hw-permeability` | nonparametric | 3 | 1 | 0 | 2 | 0 | 4.2 s | 0.0 s | pass (partial) |
| `r-friedman-roundingtimes` | nonparametric | 3 | 2 | 0 | 1 | 0 | 4.2 s | 0.0 s | pass (partial) |
| `r-hw-tuna-correlation` | correlation | 13 | 2 | 0 | 11 | 0 | 6.1 s | 0.0 s | pass (partial) |
| `r-warpbreaks` | two_way_anova | 36 | 36 | 0 | 0 | 0 | 8.2 s | 0.1 s | pass |
| `r-toothgrowth` | two_way_anova | 92 | 92 | 0 | 0 | 0 | 8.5 s | 0.2 s | pass |
| `r-morley` | two_way_anova | 13 | 13 | 0 | 0 | 0 | 4.2 s | 0.3 s | pass |
| `gp-book-twoway-bonferroni` (private) | two_way_anova | 32 | 31 | 1 | 0 | 0 | 5.8 s | 0.0 s | FAIL |
| `r-fisher-teatasting` | contingency | 3 | 0 | 0 | 3 | 0 | 3.6 s | 0.0 s | not comparable |
| `r-fisher-convictions` | contingency | 7 | 1 | 0 | 6 | 0 | 3.6 s | 0.0 s | pass (partial) |
| `r-fisher-job` | contingency | 1 | 0 | 0 | 1 | 0 | 4 s | 0.0 s | not comparable |
| `r-fisher-mp6` | contingency | 1 | 0 | 0 | 1 | 0 | 4.1 s | 0.0 s | not comparable |
| `r-chisq-party-gender` | contingency | 15 | 3 | 0 | 12 | 0 | 4 s | 0.0 s | pass (partial) |
| `r-chisq-2x2-yates` | contingency | 1 | 1 | 0 | 0 | 0 | 3.5 s | 0.0 s | pass |
| `r-mcnemar-performance` | contingency | 3 | 3 | 0 | 0 | 0 | 4 s | 0.0 s | pass |
| `r-cmh-rabbits` | contingency | 8 | 6 | 0 | 2 | 0 | 5.8 s | 0.0 s | pass (partial) |
| `r-cmh-ucbadmissions` | contingency | 11 | 7 | 0 | 4 | 0 | 6.1 s | 0.0 s | pass (partial) |
| `r-cmh-satisfaction` | contingency | 3 | 0 | 0 | 3 | 0 | 0.5 s | 0.0 s | not comparable |
| `r-chisq-goodness-of-fit` | contingency | 8 | 8 | 0 | 0 | 0 | 15.4 s | 0.3 s | pass |
| `r-binom-mendel` | proportion | 4 | 4 | 0 | 0 | 0 | 4.9 s | 0.1 s | pass |
| `surv-aml` | survival | 53 | 16 | 2 | 35 | 0 | 7.9 s | 0.0 s | FAIL |
| `surv-ovarian` | survival | 42 | 18 | 0 | 24 | 0 | 23 s | 0.0 s | pass (partial) |
| `surv-lung` | survival | 58 | 29 | 1 | 28 | 0 | 13.6 s | 0.6 s | FAIL |
| `r-usarrests` | pca | 27 | 27 | 0 | 0 | 0 | 6.2 s | 0.0 s | pass |
| `r-iris` | pca | 2 | 2 | 0 | 0 | 0 | 6.3 s | 0.1 s | pass |
| `r-infert` | logistic_regression | 30 | 24 | 3 | 3 | 0 | 7.5 s | 0.1 s | FAIL |
| `r-puromycin` | nonlinear_regression | 17 | 13 | 4 | 0 | 0 | 7.1 s | 0.0 s | FAIL |
| `r-dnase-run1` | standard_curve | 30 | 28 | 0 | 2 | 0 | 10.5 s | 0.0 s | pass (partial) |
| `r-loblolly-329` | growth_curve | 11 | 8 | 0 | 3 | 0 | 4.2 s | 0.0 s | pass (partial) |
| `r-indometh-1` | nonlinear_regression | 14 | 11 | 1 | 2 | 0 | 4.9 s | 0.0 s | FAIL |
| `r-chickweight-chick1` | growth_curve | 14 | 10 | 0 | 4 | 0 | 4.3 s | 0.0 s | pass (partial) |
| `growthcurver-a1` | growth_curve | 12 | 9 | 0 | 3 | 0 | 6.9 s | 0.1 s | pass (partial) |
| `r-cars` | linear_regression | 16 | 11 | 0 | 5 | 0 | 15.5 s | 0.0 s | pass (partial) |
| `r-anscombe` | linear_regression | 48 | 24 | 0 | 24 | 0 | 16.2 s | 0.0 s | pass (partial) |
| `drc-ryegrass` | dose_response | 18 | 5 | 5 | 8 | 0 | 5.4 s | 0.0 s | FAIL |
| `drc-s-alba` | global_fit | 21 | 11 | 4 | 6 | 0 | 6.5 s | 0.0 s | FAIL |
| `drc-earthworms` | quantal_dose_response | 10 | 0 | 0 | 10 | 0 | 6 s | 0.1 s | not comparable |
| `drc-selenium` | quantal_dose_response | 20 | 11 | 5 | 4 | 0 | 6.1 s | 0.0 s | FAIL |
| `roc-asah` | roc | 18 | 14 | 0 | 4 | 0 | 31.6 s | 0.7 s | pass (partial) |
| `deming-arsenate` | deming | 7 | 4 | 0 | 3 | 0 | 9.6 s | 0.0 s | pass (partial) |
| `synergy-mathews-block1` | synergy | 49 | 20 | 0 | 4 | 25 | 9.3 s | 0.3 s | pass (partial) |
| `power-r-examples` | power | 10 | 8 | 1 | 1 | 0 | 16.3 s | 0.2 s | FAIL |
| `power-gpower-examples` | power | 21 | 18 | 0 | 3 | 0 | 12.7 s | 0.2 s | pass (partial) |
| `power-prism4-receptors` (private) | power | 2 | 0 | 0 | 0 | 2 | 3.8 s | 0.0 s | not comparable |
| `bland-altman-pefr` (private) | bland_altman | 14 | 4 | 6 | 4 | 0 | 5.1 s | 0.1 s | FAIL |
| `qpcr-livak-table1` (private) | qpcr | 21 | 8 | 0 | 13 | 0 | 7.2 s | 0.1 s | pass (partial) |
| `gp-book-ch1-bloodpressure` (private) | dose_response | 10 | 0 | 0 | 0 | 10 | 4.8 s | 0.0 s | not comparable |
| `gp-book-twosite-ex1` (private) | model_comparison | 36 | 24 | 12 | 0 | 0 | 10.1 s | 0.0 s | FAIL |
| `gp-book-twosite-ex2` (private) | model_comparison | 21 | 10 | 11 | 0 | 0 | 10.8 s | 0.2 s | FAIL |
| `gp-book-hillslope-test` (private) | model_comparison | 18 | 9 | 8 | 1 | 0 | 10.4 s | 0.0 s | FAIL |
| `gp-book-enzyme-mm` (private) | nonlinear_regression | 16 | 9 | 1 | 6 | 0 | 4.2 s | 0.0 s | FAIL |
| `gp-book-normalized-2param` (private) | dose_response | 15 | 4 | 7 | 4 | 0 | 4.7 s | 0.0 s | FAIL |
| `gp-book-operational-depletion` (private) | global_fit | 12 | 0 | 0 | 0 | 12 | 4.7 s | 0.0 s | not comparable |
| `gp-book-operational-partial` (private) | global_fit | 12 | 0 | 0 | 0 | 12 | 5.1 s | 0.2 s | not comparable |
| `gp-book-schild-global` (private) | global_fit | 16 | 0 | 0 | 5 | 11 | 8.8 s | 0.1 s | not comparable |
| `gp-stats-ratio-ttest` (private) | t_test | 10 | 5 | 2 | 3 | 0 | 6.6 s | 0.1 s | FAIL |

## Findings, by severity

### 1. Wrong numbers and wrong behaviour

- The Kaplan-Meier log-rank (Mantel-Cox) χ² is the approximate Σ(O − E)²/E form: 3.135 for R's aml data where R's survdiff (and the score test of the Cox model on the same site, 3.417) give 3.40; lung by sex 10.23 vs 10.33. P values shift accordingly (0.077 vs 0.065). (surv-aml)

**Substantive (> 1% off): 29 quantities**

| dataset | quantity | reference | page shows | rel. diff | engine run (native, repo HEAD) | note |
|---|---|---:|---|---:|---|---|
| `nist-filip` | B0 | -1467.489614 | 5.79866 | 1.0e+0 | pass (-1467.489633) |  |
| `nist-filip` | se_B0 | 298.084531 | 345.501 | 1.6e-1 | pass (298.0845176) |  |
| `nist-filip` | B1 | -2772.179592 | -3.60511 | 1.0e+0 | pass (-2772.179628) |  |
| `nist-filip` | se_B1 | 559.7798655 | 648.819 | 1.6e-1 | pass (559.7798402) |  |
| `nist-filip` | B2 | -2316.371082 | -9.49271 | 1.0e+0 | pass (-2316.371113) |  |
| `nist-filip` | se_B2 | 466.4775721 | 540.67 | 1.6e-1 | pass (466.477551) |  |
| `nist-filip` | B3 | -1127.973941 | -5.35788 | 1.0e+0 | pass (-1127.973956) |  |
| `nist-filip` | se_B3 | 227.2042745 | 263.338 | 1.6e-1 | pass (227.2042642) |  |
| `nist-filip` | B4 | -354.4782337 | -1.04126 | 1.0e+0 | pass (-354.4782387) |  |
| `nist-filip` | se_B4 | 71.64786609 | 83.0419 | 1.6e-1 | pass (71.64786286) |  |
| `nist-filip` | B5 | -75.12420174 | 0.122557 | 1.0e+0 | pass (-75.12420284) |  |
| `nist-filip` | se_B5 | 15.28971787 | 17.7211 | 1.6e-1 | pass (15.28971719) |  |
| `nist-filip` | B6 | -10.87531804 | 0.100053 | 1.0e+0 | pass (-10.8753182) |  |
| `nist-filip` | se_B6 | 2.236911598 | 2.5926 | 1.6e-1 | pass (2.236911499) |  |
| `nist-filip` | B7 | -1.062214986 | 0.0211941 | 1.0e+0 | pass (-1.062215003) |  |
| `nist-filip` | se_B7 | 0.2216243219 | 0.256863 | 1.6e-1 | pass (0.2216243122) |  |
| `nist-filip` | B8 | -0.06701911546 | 0.00227945 | 1.0e+0 | pass (-0.06701911656) |  |
| `nist-filip` | se_B8 | 0.01423637632 | 0.0164999 | 1.6e-1 | pass (0.01423637569) |  |
| `nist-filip` | B9 | -0.002467810783 | 1.26955e-4 | 1.1e+0 | pass (-0.002467810825) |  |
| `nist-filip` | se_B9 | 5.356174e-4 | 6.20773e-4 | 1.6e-1 | pass (5.356174e-4) |  |
| `nist-filip` | B10 | -4.029625e-5 | 2.91233e-6 | 1.1e+0 | pass (-4.029625e-5) |  |
| `nist-filip` | se_B10 | 8.966328e-6 | 1.03918e-5 | 1.6e-1 | pass (8.966328e-6) |  |
| `nist-filip` | sy_x | 0.003348010513 | 0.00388219 | 1.6e-1 | pass (0.003348010496) |  |
| `nist-filip` | residual_ss | 7.958514e-4 | 0.00107007 | 3.4e-1 | pass (7.958514e-4) |  |
| `surv-aml` | logrank_chi2 | 3.4 | 3.13517 | 7.8e-2 | pass (3.396388699) |  |
| `surv-aml` | logrank_p | 0.07 | 0.0766203 | 9.5e-2 | pass (0.06533932204) |  |
| `gp-book-twosite-ex2` | AICc_two | 289.98 | 293.209 | 1.1e-2 | not in the engine run |  |
| `gp-book-twosite-ex2` | evidence_ratio | 1.57 | 0.897469 | 5.9e-1 | not in the engine run | evidence ratio for model 2 = exp(−ΔAICc / 2) from the page's difference in AICc (2 − 1) |
| `gp-book-hillslope-test` | evidence_ratio | 1.11 | -0.259427 | 2.6e-2 | not in the engine run | evidence ratio for model 2 = exp(−ΔAICc / 2) from the page's difference in AICc (2 − 1) |

**Small (≤ 1% off): 16 quantities**

| dataset | quantity | reference | page shows | rel. diff | engine run (native, repo HEAD) | note |
|---|---|---:|---|---:|---|---|
| `nist-smls08` | ss_between | 16.08 | 16.0819  | 1.2e-4 | fail (16.08191428) | stress test (float64 input): shifted two-pass gives F 201.013, plain two-pass 200.891 |
| `nist-smls09` | ss_between | 160.08 | 160.099  | 1.2e-4 | fail (160.0994944) | stress test (float64 input): shifted two-pass gives F 2001.13, plain two-pass 1999.91 |
| `nist-filip` | r_squared | 0.9967274162 | 0.9956 | 1.1e-3 | pass (0.9967274162) |  |
| `surv-lung` | logrank_chi2 | 10.3 | 10.2308 | 6.7e-3 | pass (10.32674195) |  |
| `gp-book-twosite-ex1` | two.se_Top | 39.85059 | 39.8457 | 1.2e-4 | not in the engine run |  |
| `gp-book-twosite-ex1` | two.se_Fraction1 | 0.05738087 | 0.0573951 | 2.5e-4 | not in the engine run |  |
| `gp-book-twosite-ex1` | two.se_LogEC50_2 | 0.07960846 | 0.0796242 | 2.0e-4 | not in the engine run |  |
| `gp-book-twosite-ex1` | F | 30.48 | 30.4715 | 2.8e-4 | not in the engine run |  |
| `gp-book-twosite-ex2` | AICc_one | 290.88 | 292.312 | 4.9e-3 | not in the engine run |  |
| `gp-book-hillslope-test` | Bottom | 55.19 | 55.1964 | 1.2e-4 | not in the engine run |  |
| `gp-book-hillslope-test` | HillSlope | 0.7535 | 0.753739 | 3.2e-4 | not in the engine run |  |
| `gp-book-hillslope-test` | se_Bottom | 5.551 | 5.55706 | 1.1e-3 | not in the engine run |  |
| `gp-book-hillslope-test` | se_Top | 5.599 | 5.60513 | 1.1e-3 | not in the engine run |  |
| `gp-book-hillslope-test` | se_LogEC50 | 0.1102 | 0.110292 | 8.3e-4 | not in the engine run |  |
| `gp-book-hillslope-test` | se_HillSlope | 0.1356 | 0.135382 | 1.6e-3 | not in the engine run |  |
| `gp-book-hillslope-test` | p | 0.0958 | 0.0957172 | 8.6e-4 | not in the engine run |  |

**Last digits (≤ 1e-4 relative): 29 quantities**

| dataset | quantity | reference | page shows | rel. diff | engine run (native, repo HEAD) | note |
|---|---|---:|---|---:|---|---|
| `nist-smls07` | ss_between | 1.68 | 1.68016  | 9.5e-5 | fail (1.680156269) | stress test: the data (1e12 + 0.x) are not exactly representable in float64; a shifted two-pass computation on the same doubles gives F 21.0008 and a plain two-pass 21.0399, so the certified 21 at rel 1e-6 is out of reach of float64 input |
| `nist-smls07` | F | 21 | 21.0008 | 3.8e-5 | fail (21.00077433) | stress test: the data (1e12 + 0.x) are not exactly representable in float64; a shifted two-pass computation on the same doubles gives F 21.0008 and a plain two-pass 21.0399, so the certified 21 at rel 1e-6 is out of reach of float64 input |
| `nist-smls07` | ss_within | 1.8 |  1.8001 | 5.6e-5 | fail (1.800101057) | stress test: the data (1e12 + 0.x) are not exactly representable in float64; a shifted two-pass computation on the same doubles gives F 21.0008 and a plain two-pass 21.0399, so the certified 21 at rel 1e-6 is out of reach of float64 input |
| `nist-smls07` | r_squared | 0.4827586207 | 0.482768 | 1.9e-5 | fail (0.4827678278) | stress test: the data (1e12 + 0.x) are not exactly representable in float64; a shifted two-pass computation on the same doubles gives F 21.0008 and a plain two-pass 21.0399, so the certified 21 at rel 1e-6 is out of reach of float64 input |
| `nist-smls08` | F | 201 | 201.013 | 6.5e-5 | fail (201.0129375) | stress test (float64 input): shifted two-pass gives F 201.013, plain two-pass 200.891 |
| `nist-smls08` | ss_within | 18 |  18.001 | 5.6e-5 | fail (18.00098421) | stress test (float64 input): shifted two-pass gives F 201.013, plain two-pass 200.891 |
| `nist-smls08` | r_squared | 0.4718309859 | 0.471847 | 3.4e-5 | fail (0.4718470258) | stress test (float64 input): shifted two-pass gives F 201.013, plain two-pass 200.891 |
| `nist-smls09` | F | 2001 | 2001.13 | 6.5e-5 | fail (2001.134595) | stress test (float64 input): shifted two-pass gives F 2001.13, plain two-pass 1999.91 |
| `nist-smls09` | ss_within | 180 |  180.01 | 5.6e-5 | fail (180.0098121) | stress test (float64 input): shifted two-pass gives F 2001.13, plain two-pass 1999.91 |
| `nist-smls09` | r_squared | 0.4707127735 | 0.47073 | 3.7e-5 | fail (0.4707295312) | stress test (float64 input): shifted two-pass gives F 2001.13, plain two-pass 1999.91 |
| `gp-book-twoway-bonferroni` | bonferroni[time=4].ci_upper | -0.8733 | 0.87337 | 8.0e-5 | not in the engine run |  |
| `r-infert` | m2.se_education_6_11 | 0.79255 | 0.792559 | 1.1e-5 | fail (0.79255907) |  |
| `r-infert` | m2.se_education_12plus | 0.83416 | 0.834166 | 7.2e-6 | fail (0.8341662081) |  |
| `r-infert` | m2.se_induced | 0.30146 | 0.301466 | 2.0e-5 | fail (0.3014661871) |  |
| `r-indometh-1` | lrc2_7digits | -1.787785 | 0.167331 | 2.0e-6 | fail (-1.787783309) | lrc2 = ln(KSlow) |
| `drc-selenium` | type2.ED50 | 378.4605 | 378.459 | 4.0e-6 | fail (378.4588748) |  |
| `drc-selenium` | type2.se_ED50 | 39.3707 | 39.370431878775335 | 6.8e-6 | fail (39.37044783) | drc's delta-method value re-expressed from the page's ED50 378.459 and log dose SE 0.0451789: SE(ED50) = ED50 · ln 10 · SE(log ED50), CI = ED50 ± 1.9600 · SE(ED50) |
| `drc-selenium` | type2.ED50_ci_lower | 301.2953 | 301.2943714618127 | 3.1e-6 | fail (301.294215) | drc's delta-method value re-expressed from the page's ED50 378.459 and log dose SE 0.0451789: SE(ED50) = ED50 · ln 10 · SE(log ED50), CI = ED50 ± 1.9600 · SE(ED50) |
| `drc-selenium` | type2.ED50_ci_upper | 455.63 | 455.6236285381873 | 1.4e-5 | fail (455.6235346) | drc's delta-method value re-expressed from the page's ED50 378.459 and log dose SE 0.0451789: SE(ED50) = ED50 · ln 10 · SE(log ED50), CI = ED50 ± 1.9600 · SE(ED50) |
| `drc-selenium` | type4.ED50_ci_lower | 71.918 | 71.91784372306752 | 2.2e-6 | fail (71.91787389) | drc's delta-method value re-expressed from the page's ED50 88.8052 and log dose SE 0.0421366: SE(ED50) = ED50 · ln 10 · SE(log ED50), CI = ED50 ± 1.9600 · SE(ED50) |
| `gp-book-twosite-ex1` | two.Bottom | 188.87 | 188.872 | 1.1e-5 | not in the engine run |  |
| `gp-book-twosite-ex1` | two.Fraction1 | 0.3130884 | 0.313079 | 3.0e-5 | not in the engine run |  |
| `gp-book-twosite-ex1` | two.LogEC50_1 | -7.520541 | -7.52058 | 5.2e-6 | not in the engine run |  |
| `gp-book-twosite-ex1` | two.LogEC50_2 | -6.121639 | -6.12165 | 1.8e-6 | not in the engine run |  |
| `gp-book-twosite-ex1` | two.se_Bottom | 27.88553 | 27.8865 | 3.5e-5 | not in the engine run |  |
| `gp-book-twosite-ex1` | two.se_LogEC50_1 | 0.1907365 | 0.19072 | 8.7e-5 | not in the engine run |  |
| `gp-book-twosite-ex1` | two.LogEC50_1_ci_lower | -7.987273 | -7.98725 | 2.9e-6 | not in the engine run |  |
| `gp-book-twosite-ex1` | two.LogEC50_1_ci_upper | -7.053809 | -7.0539 | 1.3e-5 | not in the engine run |  |
| `gp-book-enzyme-mm` | Vmax_ci_upper | 70.19 | 70.1966 | 9.4e-5 | not in the engine run |  |

**Differences traced to the reference, not the page: 38 quantities** (still counted as failures above)

| dataset | quantity | reference | page shows | why |
|---|---|---:|---|---|
| `nist-noint1` | r_squared | 0.9993654923 | -0.157025 | definition: the page computes R² against a horizontal line through the mean (it is negative here, −0.157); NIST's 0.99937 uses the uncentred total sum of squares for a line through the origin |
| `r-puromycin` | treated_weighted_1_over_Yhat.Vmax | 206.83 | 207.784 | method: the page's 1/Y weighting is the IRLS fixed point (independent IRLS: Vmax 207.7835, Km 0.056729); the reference minimises Σ(y − Ŷ)²/Ŷ |
| `r-puromycin` | treated_weighted_1_over_Yhat.Km | 0.054611 | 0.0567295 | method: the page's 1/Y weighting is the IRLS fixed point (independent IRLS: Vmax 207.7835, Km 0.056729); the reference minimises Σ(y − Ŷ)²/Ŷ |
| `r-puromycin` | treated_weighted_1_over_Yhat.se_Vmax | 9.22 | 9.52661 | method: the page's 1/Y weighting is the IRLS fixed point (independent IRLS: Vmax 207.7835, Km 0.056729); the reference minimises Σ(y − Ŷ)²/Ŷ |
| `r-puromycin` | treated_weighted_1_over_Yhat.se_Km | 0.00798 | 0.0084908 | method: the page's 1/Y weighting is the IRLS fixed point (independent IRLS: Vmax 207.7835, Km 0.056729); the reference minimises Σ(y − Ŷ)²/Ŷ |
| `drc-ryegrass` | se_b | 0.34168 | 0.318736 | independent least-squares refit (scipy curve_fit) gives SE(b) 0.31872, SE(d) 0.20799, SE(e) 0.20220, as the page shows; drc's printed SEs differ (its own numerical Hessian) |
| `drc-ryegrass` | se_d | 0.20438 | 0.207984 | independent least-squares refit (scipy curve_fit) gives SE(b) 0.31872, SE(d) 0.20799, SE(e) 0.20220, as the page shows; drc's printed SEs differ (its own numerical Hessian) |
| `drc-ryegrass` | se_e | 0.19641 | 0.202199 | independent least-squares refit (scipy curve_fit) gives SE(b) 0.31872, SE(d) 0.20799, SE(e) 0.20220, as the page shows; drc's printed SEs differ (its own numerical Hessian) |
| `drc-ryegrass` | ED50_ci_lower_delta | 2.85491 | 2.84286 | independent least-squares refit (scipy curve_fit) gives SE(b) 0.31872, SE(d) 0.20799, SE(e) 0.20220, as the page shows; drc's printed SEs differ (its own numerical Hessian) |
| `drc-ryegrass` | ED50_ci_upper_delta | 3.6718 | 3.68385 | independent least-squares refit (scipy curve_fit) gives SE(b) 0.31872, SE(d) 0.20799, SE(e) 0.20220, as the page shows; drc's printed SEs differ (its own numerical Hessian) |
| `drc-s-alba` | b_Bentazone | 5.046141 | -5.05836 | independent least-squares refit (scipy) gives b 2.38545 / 5.05836, SE(b) 0.43711 / 1.01637, SE(c) 0.08671, as the page shows; drc stopped short of the optimum (README: printed estimates hold to 3-4 digits) |
| `drc-s-alba` | se_b_Bentazone | 1.040135 | 1.01637 | independent least-squares refit (scipy) gives b 2.38545 / 5.05836, SE(b) 0.43711 / 1.01637, SE(c) 0.08671, as the page shows; drc stopped short of the optimum (README: printed estimates hold to 3-4 digits) |
| `drc-s-alba` | se_b_Glyphosate | 0.495959 | 0.437108 | independent least-squares refit (scipy) gives b 2.38545 / 5.05836, SE(b) 0.43711 / 1.01637, SE(c) 0.08671, as the page shows; drc stopped short of the optimum (README: printed estimates hold to 3-4 digits) |
| `drc-s-alba` | se_c | 0.089245 | 0.0867123 | independent least-squares refit (scipy) gives b 2.38545 / 5.05836, SE(b) 0.43711 / 1.01637, SE(c) 0.08671, as the page shows; drc stopped short of the optimum (README: printed estimates hold to 3-4 digits) |
| `power-r-examples` | r_prop_p2.p2 | 0.8026141 | 0.802631 | solving R's own power formula to 1e-14 gives p2 = 0.8026306 (the page's 0.802631); R's power.prop.test stops its root search at tol ≈ 1.2e-4 |
| `bland-altman-pefr` | loa_lower_2sd | -79.7 | -79.648 | the paper computes the limits from the bias and SD rounded to 0.1 (−2.1 ± 2 × 38.8); unrounded −2.118 ± 2 × 38.765 gives −79.65 and 75.41 as the page shows |
| `bland-altman-pefr` | loa_upper_2sd | 75.5 | 75.4127 | the paper computes the limits from the bias and SD rounded to 0.1 (−2.1 ± 2 × 38.8); unrounded −2.118 ± 2 × 38.765 gives −79.65 and 75.41 as the page shows |
| `bland-altman-pefr` | lower_loa_ci_lower | -114.3 | -114.882 | the page's approximate CI uses Bland & Altman (1999) SE = s√(1/n + z²/(2(n−1))); the 1986 paper used s√(3/n) (and its rounded limits) |
| `bland-altman-pefr` | lower_loa_ci_upper | -45.1 | -44.4143 | the page's approximate CI uses Bland & Altman (1999) SE = s√(1/n + z²/(2(n−1))); the 1986 paper used s√(3/n) (and its rounded limits) |
| `bland-altman-pefr` | upper_loa_ci_lower | 40.9 | 40.179 | the page's approximate CI uses Bland & Altman (1999) SE = s√(1/n + z²/(2(n−1))); the 1986 paper used s√(3/n) (and its rounded limits) |
| `bland-altman-pefr` | upper_loa_ci_upper | 110.1 | 110.646 | the page's approximate CI uses Bland & Altman (1999) SE = s√(1/n + z²/(2(n−1))); the 1986 paper used s√(3/n) (and its rounded limits) |
| `gp-book-twosite-ex2` | two.Bottom | 299 | 298.909 | README: an independent scipy refit gives Fraction 0.128 and SS 150257 (the page: 0.1281); the book's 0.1271 is not reproduced by any refit |
| `gp-book-twosite-ex2` | two.Fraction1 | 0.1271 | 0.128087 | README: an independent scipy refit gives Fraction 0.128 and SS 150257 (the page: 0.1281); the book's 0.1271 is not reproduced by any refit |
| `gp-book-twosite-ex2` | two.LogEC50_1 | -7.147 | -7.14234 | README: an independent scipy refit gives Fraction 0.128 and SS 150257 (the page: 0.1281); the book's 0.1271 is not reproduced by any refit |
| `gp-book-twosite-ex2` | two.se_Bottom | 28.97 | 28.9332 | README: an independent scipy refit gives Fraction 0.128 and SS 150257 (the page: 0.1281); the book's 0.1271 is not reproduced by any refit |
| `gp-book-twosite-ex2` | two.se_Top | 33.22 | 33.3451 | README: an independent scipy refit gives Fraction 0.128 and SS 150257 (the page: 0.1281); the book's 0.1271 is not reproduced by any refit |
| `gp-book-twosite-ex2` | two.se_Fraction1 | 0.1658 | 0.162283 | README: an independent scipy refit gives Fraction 0.128 and SS 150257 (the page: 0.1281); the book's 0.1271 is not reproduced by any refit |
| `gp-book-twosite-ex2` | two.se_LogEC50_1 | 0.774 | 0.774721 | README: an independent scipy refit gives Fraction 0.128 and SS 150257 (the page: 0.1281); the book's 0.1271 is not reproduced by any refit |
| `gp-book-twosite-ex2` | two.se_LogEC50_2 | 0.1125 | 0.110926 | README: an independent scipy refit gives Fraction 0.128 and SS 150257 (the page: 0.1281); the book's 0.1271 is not reproduced by any refit |
| `gp-book-normalized-2param` | se_LogEC50 | 0.05264 | 0.0524959 | README: an independent refit of the printed table gives SE 0.05250 / 0.05232 and SS 1641.5 (the page's values); one printed data value is probably rounded |
| `gp-book-normalized-2param` | HillSlope | 0.6996 | 0.699505 | README: an independent refit of the printed table gives SE 0.05250 / 0.05232 and SS 1641.5 (the page's values); one printed data value is probably rounded |
| `gp-book-normalized-2param` | se_HillSlope | 0.05237 | 0.0523188 | README: an independent refit of the printed table gives SE 0.05250 / 0.05232 and SS 1641.5 (the page's values); one printed data value is probably rounded |
| `gp-book-normalized-2param` | HillSlope_ci_lower | 0.5934 | 0.593497 | README: an independent refit of the printed table gives SE 0.05250 / 0.05232 and SS 1641.5 (the page's values); one printed data value is probably rounded |
| `gp-book-normalized-2param` | HillSlope_ci_upper | 0.8057 | 0.805513 | README: an independent refit of the printed table gives SE 0.05250 / 0.05232 and SS 1641.5 (the page's values); one printed data value is probably rounded |
| `gp-book-normalized-2param` | residual_ss | 1644.2 | 1641.49 | README: an independent refit of the printed table gives SE 0.05250 / 0.05232 and SS 1641.5 (the page's values); one printed data value is probably rounded |
| `gp-book-normalized-2param` | sy_x | 6.6661 | 6.66067 | README: an independent refit of the printed table gives SE 0.05250 / 0.05232 and SS 1641.5 (the page's values); one printed data value is probably rounded |
| `gp-stats-ratio-ttest` | ratio.mean_log10_diff_control_minus_treated | -0.3042 | -0.304295 ± 0.00693229 | README: scipy gives the mean log10 difference −0.30429 (the guide prints −0.3042); 10^−0.27454 = 0.5315 (the guide prints 0.531) |
| `gp-stats-ratio-ttest` | ratio.ratio_ci_upper | 0.531 | 0.531536 | README: scipy gives the mean log10 difference −0.30429 (the guide prints −0.3042); 10^−0.27454 = 0.5315 (the guide prints 0.531) |

**Informational only** (the corpus marks these sources inconsistent or approximate): 62 quantities differ, in `synergy-mathews-block1`, `gp-book-ch1-bloodpressure`, `gp-book-operational-depletion`, `gp-book-operational-partial`, `gp-book-schild-global`. See the JSON for the values.

### 2. Missing features (a reference quantity the page cannot produce or does not show)

- XY tables have no linear-regression analysis (Prism's Simple linear regression: slope, intercept, r², the F test of slope = 0, runs test, X at Y). A straight line is available only as "Straight line (via nonlinear engine)" in the curve-fit model list, without the regression ANOVA. (nist-norris)
- Polynomial models stop at sixth order; a tenth-order polynomial (NIST Filip) needs a user-defined equation, which the nonlinear least-squares engine cannot fit reliably at this conditioning. (nist-filip)
- No one-tailed option anywhere in the t test / Wilcoxon / Mann-Whitney / correlation / Fisher results; one-sided P values have to be halved by hand. (r-hw-depression)
- XY tables have no correlation analysis; correlating two measured variables needs a column table (Correlation, two datasets) or a multiple-variables table. (r-hw-tuna-correlation)
- Fisher's exact test is computed only for 2×2 tables; r×c tables (Fisher-Freeman-Halton) get the chi-square test only. (r-fisher-job, r-fisher-mp6)
- Cochran-Mantel-Haenszel handles stratified 2×2 tables only; the generalized CMH test for r×c×k tables is not available. (r-cmh-satisfaction)
- not shown: the survival results list n, events, censored and the median per group, but not the Kaplan-Meier table (survival and SE at each event time) nor median CIs: 57 quantities (surv-aml, surv-ovarian)
- not shown: there is no linear-regression analysis for XY tables (only the straight-line model of the nonlinear fit), so the regression ANOVA (SS/MS regression, F, residual MS) is not printed: 47 quantities (nist-norris, nist-noint1, nist-pontius, nist-filip, r-cars, r-anscombe)
- not shown: one-way ANOVA has no ANOVA table (no MS rows, no residual SD); only F(DFn, DFd), P, R² and SS (treatment / residual) are printed: 40 quantities (nist-sirstv, nist-smls01, nist-smls02, nist-smls03, nist-smls04, nist-smls05, nist-smls06, nist-smls07, nist-smls08, nist-smls09, nist-atmwtag, r-plantgrowth, r-chickwts, r-insectsprays)
- not shown: the survival results list n, events, censored and the median per group, but not the Kaplan-Meier table (survival and SE at each event time) nor median CIs (or a KM fit stratified by two factors): 26 quantities (surv-lung)
- not shown: expected counts and standardized residuals are not printed: 12 quantities (r-chisq-party-gender)
- not read: the comparison of fits sheet ("Compare with another model…" under a fit since 0.4.0) offers the F test and AICc, but this comparison needs a set-up the script does not drive yet (a constrained or global model, or R's anova() against the largest model): 11 quantities (r-dnase-run1, r-cars, drc-s-alba, gp-book-schild-global)
- not available: Holm's step-down adjustment (only Holm-Šídák) for pairwise comparisons: 10 quantities (r-airquality-ozone)
- not shown: the t test / nonparametric / correlation / Fisher results offer no one-tailed option, only two-tailed P: 10 quantities (r-hw-depression, r-hw-permeability, r-hw-tuna-correlation, r-fisher-teatasting, r-fisher-convictions)
- not available: the quantal fit (probit / logit / cloglog with an optional natural response) has no upper limit below 100% (drc's d parameter), so this binomial log-logistic model cannot be reproduced: 10 quantities (drc-earthworms)
- not available: no autocorrelation statistic in column statistics: 9 quantities (nist-pidigits, nist-lottery, nist-lew, nist-mavro, nist-michelso, nist-numacc1, nist-numacc2, nist-numacc3, nist-numacc4)
- not shown: the initial values the fit started from are not displayed: 7 quantities (r-loblolly-329, r-chickweight-chick1)
- not shown: with one biological sample per tissue the SDs are blank (the page does not propagate technical-replicate SDs as Livak does): 7 quantities (qpcr-livak-table1)
- not available: only the sample odds ratio (with Baptista-Pike / Woolf CIs) is shown, not the conditional MLE odds ratio of R's fisher.test: 6 quantities (r-fisher-teatasting, r-fisher-convictions)
- not available: ECanything (ED5, ED10) is offered only for log(agonist) models, which cannot take the zero-dose control: 6 quantities (drc-ryegrass)
- not shown: joint confidence regions / Monte Carlo CIs of this kind are not part of the fit results (the Monte Carlo tool simulates new data sets instead): 6 quantities (gp-book-enzyme-mm)
- not available: Kendall's tau: 5 quantities (r-hw-tuna-correlation)
- not shown on the page: 5 quantities (roc-asah, power-r-examples, gp-stats-ratio-ttest)
- not shown: per-stratum odds ratios / the collapsed table are not printed: 4 quantities (r-cmh-ucbadmissions)
- not shown: no likelihood-ratio test of a common ED50 (only a parallelism test of slopes): 4 quantities (drc-selenium)
- not shown: SynergyFinder's monotherapy IC50 / RI / CSS sensitivity scores are not reported: 4 quantities (synergy-mathews-block1)
- not shown: Livak's 2^−(ΔΔCq ± s) range (the page gives a CI from biological replicates): 4 quantities (qpcr-livak-table1)
- not shown: joint (2-D) confidence region limits: 4 quantities (gp-book-normalized-2param)
- not shown: multiple regression prints F, R² and Sy.x but no regression ANOVA table (SS / MS): 3 quantities (nist-longley)
- not shown: Kruskal-Wallis prints H and P but not its df: 3 quantities (r-insectsprays, r-hw-mucociliary, r-airquality-ozone)
- not shown: the correlation result prints r, its CI, R², P and n only: 3 quantities (r-hw-tuna-correlation)
- not available: generalized CMH for r×c×k tables: 3 quantities (r-cmh-satisfaction)
- not shown: the logistic results print n, the parameters and the likelihood-ratio df, not the residual / null deviance df: 3 quantities (r-infert)
- not shown: the growth assay reports the fit and the doubling time, not the inflection time or areas under the curve: 3 quantities (growthcurver-a1)
- not shown: no relative potency or slope comparison for a global nonlinear fit: 3 quantities (drc-s-alba)
- not shown: the page gives the partial AUC as an area, not as a percentage or McClish-standardized percentage of this kind: 3 quantities (roc-asah)
- not available: Deming regression with a per-point SD for each X and Y (only one error ratio or two SDs for all points): 3 quantities (deming-arsenate)
- not available: no point-biserial (t-test based) model; point-biserial substitute (correlation vs ρ0 = 0, exact): N = 168, power 95.02% (target 95%): 3 quantities (power-gpower-examples)
- not available: Fligner-Killeen test (Brown-Forsythe is printed instead): 2 quantities (r-insectsprays)
- not available: no Fisher-Freeman-Halton exact test for r×c tables (chi-square only): 2 quantities (r-fisher-job, r-fisher-mp6)
- not available: exact conditional CMH test / conditional MLE odds ratio: 2 quantities (r-cmh-rabbits)
- not shown: observed and expected events per group are not printed with the log-rank test: 2 quantities (surv-aml)
- not shown: expected events per group: 2 quantities (surv-lung)
- not shown: two-phase decay reports Y0, Plateau, PercentFast, KFast, KSlow (and half-lives) but not SpanFast / SpanSlow (R's A1, A2) with SEs: 2 quantities (r-indometh-1)
- not available: robust (sandwich) standard errors: 2 quantities (drc-ryegrass)
- not shown: standard errors of the bias and limits are not printed (their CIs are): 2 quantities (bland-altman-pefr)
- not available: repeatability coefficients from duplicate readings: 2 quantities (bland-altman-pefr)
- not shown: reference-gene Cq means are not listed (the per-sample table shows target rows only): 2 quantities (qpcr-livak-table1)
- could not read a number from "<": 1 quantities (r-insectsprays)
- not shown: the Friedman result prints no df: 1 quantities (r-friedman-roundingtimes)
- not shown: the t test of HillSlope = 1 from the 4PL fit's SE is not printed (the F test is): 1 quantities (gp-book-hillslope-test)
- not shown: Kb is not reported (pA2 is): 1 quantities (gp-book-schild-global)

### 3. Usability friction

- Switching a results sheet from Column statistics to one-way ANOVA (or t test, etc.) keeps the sheet and tab name "Column stats" (e.g. tab "Column stats 1", sheet "Column stats of …"); the analysis selects (test kind, group pickers, ANOVA type) carry no accessible name. (seen in 16 datasets: nist-sirstv, nist-smls01, nist-smls02, nist-smls03, nist-smls04, nist-smls05, …)
- A column table made with the default three groups keeps an empty "Group C" after a two-column paste; it is listed in Column statistics with n = 0 and every value n/a, and in every group picker. (seen in 1 dataset: r-sleep)
- Import → Recipes: "Recognise the file" takes a long (tidy) table for an instrument export and picks that recipe; the long-table recipe has to be chosen by hand. (seen in 1 dataset: r-warpbreaks (Looks like: Plate reader grid (8 × 12 or 16 × 24).))
- CMH needs each stratum typed as two adjacent rows with titles "Stratum: level"; a long file with a stratum column cannot be pasted or imported into that layout (the recipe has no contingency output), so the titles have to be built by hand. (seen in 2 datasets: r-cmh-rabbits, r-cmh-ucbadmissions)
- Pasting replicate columns (treated_1, treated_2, …) names each data set after its first replicate column ("treated_1", "control_1") instead of the shared stem. (seen in 1 dataset: r-puromycin)
- Curve fit "Weight by 1/Y (Poisson-like)" solves the iteratively reweighted fixed point (weights 1/Ŷ from the curve, held fixed within each iteration): Puromycin treated Vmax 207.78, Km 0.05673, which an independent IRLS reproduces exactly. R's weighted nls (and the corpus reference) minimises Σ(y − Ŷ)²/Ŷ instead (206.83, 0.05461). Neither the option label nor the methods text says which. (seen in 1 dataset: r-puromycin)
- A new XY table's automatic first fit is a 4PL with "X values are already log10(concentration)" unticked: pasting log-dose X values gives "not enough data points (0) to fit 4 parameters" (negative X silently dropped), and pasting non-dose data (time, age, …) starts a long, futile multi-start fit. (seen in 1 dataset: r-loblolly-329)
- An XY table has one X column shared by every data set, so Anscombe's four (x_i, y_i) pairs need four separate XY tables (or a stacked layout); there is no per-data-set X. (seen in 1 dataset: r-anscombe)
- drc's S.alba file has the two herbicides as blocks of rows (herbicide, dose, replicates); a global fit needs them as two XY data sets side by side, which the Import dialog and the recipes cannot produce from that layout (rearranged by hand here). (seen in 1 dataset: drc-s-alba)
- Quantal data in long form (type, dose, dead, total) must be rearranged by hand into dose rows with a responders / N subcolumn pair per group; the recipes take a single value column. (seen in 1 dataset: drc-selenium)
- Quantal dose-response with a log dose transform refuses the zero-dose control rows ("a dose of 0 or less cannot be log-transformed. Remove the control row …"), so the controls have to be deleted by hand; drc's LL.2 uses them (p(0) = 0). (seen in 1 dataset: drc-selenium)
- ROC on a column table needs one column per marker and outcome (patients, controls); a long file with an outcome column and several markers has to be split by hand (the Unstack option handles one value column at a time). (seen in 1 dataset: roc-asah)
- The power tool solves for a detectable effect only as Cohen's d; with group SDs and n in hand (StatMate's question), the user must pool the SD and multiply by d by hand. (seen in 1 dataset: power-prism4-receptors)

## Performance and robustness probe

Each step is timed from the user action to the result on screen (slow = over 5 s).

| probe | time | slow? | detail |
|---|---:|---|---|
| cold load to first results, run 1 | 15.28 s | **yes** | DOMContentLoaded 716 ms; 2.1 MB transferred (fresh profile, no cache); first numbers (saved example results) at 1073 ms, live engine results at 15284 ms; engine boot 14571 ms |
| cold load to first results, run 2 | 14.66 s | **yes** | DOMContentLoaded 373 ms; 2.1 MB transferred (fresh profile, no cache); first numbers (saved example results) at 694 ms, live engine results at 14663 ms; engine boot 13906 ms |
| cold load to first results, run 3 | 14.45 s | **yes** | DOMContentLoaded 371 ms; 2.1 MB transferred (fresh profile, no cache); first numbers (saved example results) at 695 ms, live engine results at 14445 ms; engine boot 13987 ms |
| warm reload to first results | 0.27 s |  | live engine results at 14861 ms |
| second warm reload (offline cache) | 0.36 s |  | live engine results at 12888 ms; served by the offline cache |
| offline reload | 0.20 s |  | live engine results at 12669 ms; served by the offline cache; network switched off |
| 2,000-row column paste (Ctrl+V → Import dialog → grid) | 0.27 s |  | Import dialog opened in 105 ms; Import → 2,000 rows in the grid 161 ms |
| unpaired t test on 2 × 2,000 values (select → result) | 1.37 s |  | result after 1327 ms; main-thread long tasks 657 ms |
| edit one cell of the 2,000-row table → t test updated | 0.12 s |  |  |
| one-way ANOVA, 9 × 2,001 values: page stays responsive | 7.12 s |  | result shown; typing 9 characters meanwhile took 1096 ms; main thread blocked 1289 ms in total, longest task 194 ms |
| 100,000-row paste (Ctrl+V → Import dialog → grid) | 3.53 s |  | Import dialog opened in 2089 ms; Import → 100,000 rows in the grid 1443 ms; 39 rows rendered |
| 100,000 rows: column scatter drawn (WebGL) | 2.63 s |  | 200,000 points as scattergl |
| 100,000 rows: scroll frame time | 0.02 s |  | median 16.6 ms, 95th percentile 21.3 ms, worst 35.3 ms per frame over 120 frames; jump to the middle shows row 49986; JS heap 97 → 97 MB |
| unpaired t test on 2 × 100,000 values (select → result) | 10.50 s | **yes** | result after 10008 ms |
| 500-point XY fit (4PL) | 2.14 s |  | Import → fitted 4PL on 500 points; main-thread long tasks 53 ms |
| 50-dataset grouped table (paste + two-way ANOVA) | 4.37 s |  | two-way ANOVA ready 3518 ms after Import; Column factor 29.1% 313 49 6.387 239.5 < 0.0001 ****; long tasks 609 ms |
| 50-dataset grouped table: switch graph to box plots | 0.62 s |  |  |
| 200 cell edits (typed, Enter after each) | 28.88 s |  | 144 ms per edit including Playwright's typing; total not a single user wait |
| undo back to the empty table (Undo button) | 17.67 s |  | 200 values typed; 200 undo steps; 0 values left |
| redo everything (Redo button) | 15.03 s |  | 200 redo steps; 200 of 200 values back; last cell = 200 (correct) |
| undo all + redo all, app side (one rendered frame per step) | 7.48 s |  | 201 undo steps 4127 ms (20.5 ms each), 201 redo steps 3351 ms |
| reload and restore a 30-sheet project | 0.54 s |  | 33 sheets before, 33 after the reload (all back); tables 10/10 |
| share link round trip | 1.11 s |  | link 10.9 kB for 33 sheets; opened in a fresh browser with 33 sheets, read-only banner shown |
| 384-well plate: read a labelled grid (rows A–P, columns 1–24) | 0.84 s |  | wizard says: "Read 1 plate of 384 wells." |
| 384-well plate: QC preview in the wizard | 10.57 s | **yes** |  |
| 384-well plate: finish the wizard → plate QC and linked dose-response tables | 0.50 s |  | Plate QC  1 plate of 384 wells; % of vehicle control (blank-subtracted): viability. Limits: Z′ ≥ 0.5, control and replicate CV ≤ 15%.  Plate; linked dose-response sheets in the navigator: 8 |
| 384-well plate: open the linked dose-response fits | 1.49 s |  | 24 midpoint rows shown |

## Per dataset: notes and timing

- `nist-sirstv` (pass (partial)): import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); one-way ANOVA 0.70 s (long tasks 0.05 s)
- `nist-smls01` (pass (partial)): import + automatic first analysis (page frozen until done) 0.40 s (long tasks 0.00 s); one-way ANOVA 0.70 s (long tasks 0.12 s)
- `nist-smls02` (pass (partial)): import + automatic first analysis (page frozen until done) 0.45 s (long tasks 0.00 s); one-way ANOVA 0.82 s (long tasks 0.33 s)
- `nist-smls03` (pass (partial)): import + automatic first analysis (page frozen until done) 0.55 s (long tasks 0.00 s); one-way ANOVA 1.74 s (long tasks 1.16 s)
- `nist-smls04` (pass (partial)): import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); one-way ANOVA 0.70 s (long tasks 0.00 s)
- `nist-smls05` (pass (partial)): import + automatic first analysis (page frozen until done) 0.44 s (long tasks 0.00 s); one-way ANOVA 0.77 s (long tasks 0.28 s)
- `nist-smls06` (pass (partial)): import + automatic first analysis (page frozen until done) 0.55 s (long tasks 0.00 s); one-way ANOVA 1.62 s (long tasks 0.87 s)
- `nist-smls07` (FAIL): import + automatic first analysis (page frozen until done) 0.40 s (long tasks 0.00 s); one-way ANOVA 0.70 s (long tasks 0.00 s)
- `nist-smls08` (FAIL): import + automatic first analysis (page frozen until done) 0.44 s (long tasks 0.00 s); one-way ANOVA 0.76 s (long tasks 0.28 s)
- `nist-smls09` (FAIL): import + automatic first analysis (page frozen until done) 0.53 s (long tasks 0.00 s); one-way ANOVA 1.48 s (long tasks 0.80 s)
- `nist-atmwtag` (pass (partial)): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); one-way ANOVA 0.54 s (long tasks 0.00 s)
- `nist-pidigits` (pass (partial)): import + automatic first analysis (page frozen until done) 0.43 s (long tasks 0.00 s); column statistics 0.59 s (long tasks 0.23 s)
- `nist-lottery` (pass (partial)): import + automatic first analysis (page frozen until done) 0.40 s (long tasks 0.00 s); column statistics 0.56 s (long tasks 0.06 s)
- `nist-lew` (pass (partial)): import + automatic first analysis (page frozen until done) 0.40 s (long tasks 0.00 s); column statistics 0.55 s (long tasks 0.00 s)
- `nist-mavro` (pass (partial)): column statistics 0.01 s (long tasks 0.00 s)
- `nist-michelso` (pass (partial)): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); column statistics 0.54 s (long tasks 0.00 s)
- `nist-numacc1` (pass (partial)): column statistics 0.00 s (long tasks 0.00 s)
- `nist-numacc2` (pass (partial)): import + automatic first analysis (page frozen until done) 0.40 s (long tasks 0.00 s); column statistics 0.56 s (long tasks 0.05 s)
- `nist-numacc3` (pass (partial)): import + automatic first analysis (page frozen until done) 0.40 s (long tasks 0.00 s); column statistics 0.71 s (long tasks 0.05 s)
- `nist-numacc4` (pass (partial)): import + automatic first analysis (page frozen until done) 0.41 s (long tasks 0.00 s); column statistics 0.72 s (long tasks 0.06 s)
- `nist-misra1a` (pass): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); user-defined equation fit 0.57 s (long tasks 0.00 s). Start 1 ({"b1":500,"b2":0.0001}): 7/7 references pass
- `nist-chwirut2` (pass): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); user-defined equation fit 0.57 s (long tasks 0.00 s). Start 1 ({"b1":0.1,"b2":0.01,"b3":0.02}): 9/9 references pass
- `nist-thurber` (pass): import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); user-defined equation fit 2.03 s (long tasks 0.05 s). Start 1 ({"b1":1000,"b2":1000,"b3":400,"b4":40,"b5":0.7,"b6":0.3,"b7":0.03}): 17/17 references pass · Start 1 banner: How this is validated checked against GraphPad Prism results for the same data and SciPy (41 pinned checks) Ambiguous fit: y The data are consistent with many
- `nist-mgh09` (pass): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); user-defined equation fit 1.04 s (long tasks 0.00 s). Start 1 ({"b1":25,"b2":39,"b3":41.5,"b4":39}): 11/11 references pass
- `nist-lanczos3` (pass): import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); user-defined equation fit 0.92 s (long tasks 0.11 s). Start 1 ({"b1":1.2,"b2":0.3,"b3":5.6,"b4":5.5,"b5":6.5,"b6":7.6}): 15/15 references pass · Start 1 banner: How this is validated checked against GraphPad Prism results for the same data and SciPy (41 pinned checks) Ambiguous fit: y The data are consistent with many
- `nist-boxbod` (pass): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); user-defined equation fit 0.71 s (long tasks 0.00 s). Start 1 ({"b1":1,"b2":1}): 7/7 references pass
- `nist-rat42` (pass): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); user-defined equation fit 0.56 s (long tasks 0.00 s). Start 1 ({"b1":100,"b2":1,"b3":0.1}): 9/9 references pass
- `nist-rat43` (pass): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); user-defined equation fit 0.70 s (long tasks 0.00 s). Start 1 ({"b1":100,"b2":10,"b3":1,"b4":1}): 11/11 references pass
- `nist-eckerle4` (pass): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); user-defined equation fit 0.55 s (long tasks 0.00 s). Start 1 ({"b1":1,"b2":10,"b3":500}): 9/9 references pass
- `nist-hahn1` (pass): import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); user-defined equation fit 0.74 s (long tasks 0.00 s). Start 1 ({"b1":10,"b2":-1,"b3":0.05,"b4":-0.00001,"b5":-0.05,"b6":0.001,"b7":-0.000001}): 17/17 references pass · Start 1 banner: How this is validated checked against GraphPad Prism results for the same data and SciPy (41 pinned checks) Ambiguous fit: y The data are consistent with many
- `nist-norris` (pass (partial)): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); straight line fit 0.74 s (long tasks 0.00 s)
- `nist-noint1` (FAIL): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); line through origin 0.75 s (long tasks 0.00 s)
- `nist-pontius` (pass (partial)): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); quadratic 0.74 s (long tasks 0.00 s)
- `nist-filip` (FAIL): import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); 10th-order polynomial (user equation) 0.89 s (long tasks 0.00 s). user equation, all start values 1
- `nist-longley` (pass (partial)): import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); multiple regression 0.58 s (long tasks 0.00 s)
- `r-plantgrowth` (pass (partial)): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); one-way ANOVA 0.56 s (long tasks 0.07 s)
- `r-chickwts` (pass (partial)): import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); one-way ANOVA 0.70 s (long tasks 0.11 s)
- `r-insectsprays` (pass (partial)): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); one-way ANOVA 0.69 s (long tasks 0.00 s); Kruskal-Wallis 0.51 s (long tasks 0.00 s)
- `r-hw-mucociliary` (pass (partial)): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); Kruskal-Wallis 0.51 s (long tasks 0.00 s)
- `r-airquality-ozone` (pass (partial)): import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); Kruskal-Wallis 0.51 s (long tasks 0.00 s); one-way ANOVA 0.67 s (long tasks 0.00 s); Bonferroni comparisons 0.51 s (long tasks 0.00 s)
- `r-sleep` (pass): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); t test (paired) 0.49 s (long tasks 0.00 s); t test (welch) 0.49 s (long tasks 0.00 s); t test (unpaired) 0.49 s (long tasks 0.00 s); one-way ANOVA on two groups 0.53 s (long tasks 0.00 s); one-sample t test 0.49 s (long tasks 0.00 s)
- `r-welch-examples` (pass): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); t test (welch) 0.50 s (long tasks 0.00 s); t test (welch) 0.50 s (long tasks 0.00 s)
- `r-mtcars-mpg-by-am` (pass): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); t test (welch) 0.49 s (long tasks 0.00 s)
- `r-hw-depression` (pass (partial)): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); t test (wilcoxon) 0.49 s (long tasks 0.00 s)
- `r-hw-permeability` (pass (partial)): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); t test (mann_whitney) 0.49 s (long tasks 0.00 s)
- `r-friedman-roundingtimes` (pass (partial)): import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); Friedman 0.50 s (long tasks 0.00 s)
- `r-hw-tuna-correlation` (pass (partial)): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); Pearson 0.53 s (long tasks 0.00 s); Spearman 0.52 s (long tasks 0.00 s)
- `r-warpbreaks` (pass): two-way ANOVA 0.01 s (long tasks 0.11 s); two-way ANOVA, main effects only 0.53 s (long tasks 0.00 s); additive model, Tukey on tension means 0.67 s (long tasks 0.00 s)
- `r-toothgrowth` (pass): two-way ANOVA 0.01 s (long tasks 0.23 s); Tukey, row means 0.67 s (long tasks 0.00 s); Tukey, every cell mean 0.66 s (long tasks 0.00 s)
- `r-morley` (pass): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); two-way ANOVA, one value per cell 0.59 s (long tasks 0.25 s)
- `gp-book-twoway-bonferroni` (FAIL): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); two-way ANOVA 0.54 s (long tasks 0.00 s); Bonferroni within rows 0.51 s (long tasks 0.00 s)
- `r-fisher-teatasting` (not comparable): import + automatic first analysis (page frozen until done) 0.36 s (long tasks 0.00 s); contingency 0.52 s (long tasks 0.00 s)
- `r-fisher-convictions` (pass (partial)): import + automatic first analysis (page frozen until done) 0.36 s (long tasks 0.00 s); contingency 0.52 s (long tasks 0.00 s)
- `r-fisher-job` (not comparable): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); contingency 0.99 s (long tasks 0.00 s)
- `r-fisher-mp6` (not comparable): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); contingency 0.99 s (long tasks 0.00 s)
- `r-chisq-party-gender` (pass (partial)): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); contingency 0.99 s (long tasks 0.00 s)
- `r-chisq-2x2-yates` (pass): import + automatic first analysis (page frozen until done) 0.36 s (long tasks 0.00 s); contingency 0.52 s (long tasks 0.00 s)
- `r-mcnemar-performance` (pass): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); /McNemar/ 0.54 s (long tasks 0.00 s)
- `r-cmh-rabbits` (pass (partial)): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); CMH 0.65 s (long tasks 0.00 s); CMH, continuity correction 0.51 s (long tasks 0.00 s)
- `r-cmh-ucbadmissions` (pass (partial)): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); CMH 0.69 s (long tasks 0.00 s); CMH, continuity correction 0.52 s (long tasks 0.00 s)
- `r-cmh-satisfaction` (not comparable): no engine step timed
- `r-chisq-goodness-of-fit` (pass): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); goodness of fit 0.66 s (long tasks 0.08 s); import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); goodness of fit 0.63 s (long tasks 0.10 s); goodness of fit (expected proportions) 0.60 s (long tasks 0.00 s); import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); goodness of fit 0.64 s (long tasks 0.07 s); goodness of fit (expected proportions) 0.58 s (long tasks 0.00 s)
- `r-binom-mendel` (pass): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); binomial test 0.49 s (long tasks 0.07 s)
- `surv-aml` (FAIL): Kaplan-Meier 0.01 s (long tasks 0.00 s); Cox (Efron) 0.65 s (long tasks 0.00 s); Cox (Breslow) 0.51 s (long tasks 0.00 s)
- `surv-ovarian` (pass (partial)): import + automatic first analysis (page frozen until done) 0.40 s (long tasks 0.00 s); Cox regression 0.54 s (long tasks 0.00 s); import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); Cox regression 0.53 s (long tasks 0.00 s); import + automatic first analysis (page frozen until done) 0.41 s (long tasks 0.00 s); Cox regression 0.56 s (long tasks 0.00 s); import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); Cox regression 0.56 s (long tasks 0.00 s); import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); Cox regression 0.58 s (long tasks 0.00 s)
- `surv-lung` (FAIL): Kaplan-Meier 0.01 s (long tasks 0.35 s); import + automatic first analysis (page frozen until done) 0.48 s (long tasks 0.00 s); Cox regression 0.56 s (long tasks 0.16 s); import + automatic first analysis (page frozen until done) 0.47 s (long tasks 0.00 s); Cox regression 0.55 s (long tasks 0.08 s)
- `r-usarrests` (pass): import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); PCA 0.47 s (long tasks 0.00 s); PCA, covariance 0.70 s (long tasks 0.00 s)
- `r-iris` (pass): import + automatic first analysis (page frozen until done) 0.47 s (long tasks 0.00 s); PCA 0.68 s (long tasks 0.10 s); PCA, covariance 0.75 s (long tasks 0.00 s)
- `r-infert` (FAIL): import + automatic first analysis (page frozen until done) 0.47 s (long tasks 0.00 s); logistic m1 0.76 s (long tasks 0.08 s); logistic m2 0.63 s (long tasks 0.00 s)
- `r-puromycin` (FAIL): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); Michaelis-Menten 1.53 s (long tasks 0.00 s); Michaelis-Menten, weight 1/Y 0.49 s (long tasks 0.00 s)
- `r-dnase-run1` (pass (partial)): import + automatic first analysis (page frozen until done) 0.36 s (long tasks 0.00 s); 4PL (fpl) 1.50 s (long tasks 0.00 s); 3PL, Bottom = 0 (logis) 0.48 s (long tasks 0.00 s); Gompertz (user equation) 0.57 s (long tasks 0.00 s)
- `r-loblolly-329` (pass (partial)): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); exponential plateau 0.73 s (long tasks 0.00 s)
- `r-indometh-1` (FAIL): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); two-phase decay, Plateau = 0 0.63 s (long tasks 0.00 s). parameters shown: Y0, Plateau, PercentFast, KFast, KSlow, HalfLifeFast, HalfLifeSlow
- `r-chickweight-chick1` (pass (partial)): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); Boltzmann 0.90 s (long tasks 0.00 s)
- `growthcurver-a1` (pass (partial)): import + automatic first analysis (page frozen until done) 0.42 s (long tasks 0.00 s); growth assay 2.02 s (long tasks 0.05 s); logistic growth on min-subtracted OD 0.04 s (long tasks 0.00 s). growth assay: blank = minimum of each curve, no log, logistic model
- `r-cars` (pass (partial)): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); polynomial degree 1 0.79 s (long tasks 0.00 s); polynomial degree 2 0.83 s (long tasks 0.00 s); polynomial degree 3 0.72 s (long tasks 0.00 s); polynomial degree 4 0.72 s (long tasks 0.00 s); straight line on ln/ln 0.84 s (long tasks 0.00 s)
- `r-anscombe` (pass (partial)): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); straight line set 1 0.80 s (long tasks 0.00 s); import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); straight line set 2 0.79 s (long tasks 0.00 s); import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); straight line set 3 0.78 s (long tasks 0.00 s); import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); straight line set 4 1.55 s (long tasks 0.00 s)
- `drc-ryegrass` (FAIL): import + automatic first analysis (page frozen until done) 0.40 s (long tasks 0.00 s); [Inhibitor] vs response, Bottom = 0 0.48 s (long tasks 0.00 s)
- `drc-s-alba` (FAIL): import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); global 4PL, shared Bottom and Top 0.63 s (long tasks 0.00 s). fit headings: Glyphosate \| Bentazone
- `drc-earthworms` (not comparable): import + automatic first analysis (page frozen until done) 0.40 s (long tasks 0.00 s); quantal dose-response 2.77 s (long tasks 0.09 s)
- `drc-selenium` (FAIL): import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); quantal dose-response 0.67 s (long tasks 0.00 s); quantal logit 0.61 s (long tasks 0.00 s). control rows (dose 0) removed: the quantal fit cannot log-transform a zero dose
- `roc-asah` (pass (partial)): import + automatic first analysis (page frozen until done) 0.44 s (long tasks 0.00 s); ROC 0.65 s (long tasks 0.20 s); ROC wfns 0.10 s (long tasks 0.00 s); ROC s100b 0.58 s (long tasks 0.05 s); ROC ndka 0.58 s (long tasks 0.00 s); partial AUC ndka 0.40 s (long tasks 0.06 s); partial AUC wfns 0.61 s (long tasks 0.06 s); DeLong wfns vs s100b 0.58 s (long tasks 0.00 s); DeLong wfns vs ndka 0.57 s (long tasks 0.06 s); DeLong wfns vs s100b, unpaired 0.59 s (long tasks 0.13 s); DeLong ndka vs s100b 0.58 s (long tasks 0.15 s)
- `deming-arsenate` (pass (partial)): import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); Deming 2.36 s (long tasks 0.00 s); least squares line 1.50 s (long tasks 0.00 s)
- `synergy-mathews-block1` (pass (partial)): synergy (fill) 0.07 s (long tasks 0.00 s); synergy scores 2.69 s (long tasks 0.31 s). matrix titles: Synergy scores \| MONOTHERAPY FITS (FOUR-PARAMETER LOG-LOGISTIC, % INHIBITION) \| OBSERVED RESPONSE (% INHIBITION) \| HSA EXPECTED RESPONSE \| BLISS EXPECTED RESPONSE \| LOEWE EXPECTED RESPONSE \| ZIP EXPECTED RESPONSE (FROM THE MONOTHERAPY FITS) \| ZIP FITTED RESPONSE (DOSE-RESPONSE SLICES) \| HSA SYNERGY \| BLISS SYNERGY \| LOEWE SYNERGY \| ZIP SYNERGY
- `power-r-examples` (FAIL): power: t_two_sample solve power 0.47 s (long tasks 0.08 s); power: t_two_sample solve n 0.46 s (long tasks 0.00 s); power: t_two_sample solve n 0.43 s (long tasks 0.00 s); power: two_proportions solve power 0.45 s (long tasks 0.05 s); power: two_proportions solve n 0.45 s (long tasks 0.00 s); power: two_proportions solve effect 0.46 s (long tasks 0.00 s); power: two_proportions solve n 0.27 s (long tasks 0.00 s); power: anova_oneway solve power 0.43 s (long tasks 0.05 s); power: anova_oneway solve n 0.40 s (long tasks 0.00 s); power: anova_oneway solve n 0.43 s (long tasks 0.00 s)
- `power-gpower-examples` (pass (partial)): power: correlation solve n 1.30 s (long tasks 0.00 s); power: anova_oneway solve n 0.48 s (long tasks 0.08 s); power: correlation solve n 0.84 s (long tasks 0.00 s); power: t_paired solve power 0.48 s (long tasks 0.00 s); power: t_one_sample solve n 0.48 s (long tasks 0.00 s); power: t_one_sample solve n 0.49 s (long tasks 0.00 s); power: t_two_sample solve n 0.48 s (long tasks 0.12 s). point-biserial substitute (correlation vs ρ0 = 0, exact): N = 168, power 95.02% (target 95%)
- `power-prism4-receptors` (not comparable): power: t_two_sample solve effect 0.45 s (long tasks 0.00 s); power: t_two_sample solve effect 0.43 s (long tasks 0.00 s)
- `bland-altman-pefr` (FAIL): import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); Bland-Altman, bias ± 2 SD 0.54 s (long tasks 0.09 s). agreement set to 95.45% (bias ± 2 SD as in the paper)
- `qpcr-livak-table1` (pass (partial)): qPCR ΔΔCq 0.58 s (long tasks 0.05 s)
- `gp-book-ch1-bloodpressure` (not comparable): import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); agonist variable slope four 0.49 s (long tasks 0.00 s)
- `gp-book-twosite-ex1` (FAIL): import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); competition 0.63 s (long tasks 0.00 s); two-site competition 1.69 s (long tasks 0.00 s); one site vs two sites 0.51 s (long tasks 0.00 s). two-site parameters: Top, Bottom, FracHi, LogIC50_HiAff, LogIC50_LoAff, IC50_HiAff, IC50_LoAff, Span
- `gp-book-twosite-ex2` (FAIL): import + automatic first analysis (page frozen until done) 0.48 s (long tasks 0.00 s); competition 0.66 s (long tasks 0.21 s); two-site competition 1.07 s (long tasks 0.00 s); one site vs two sites 0.71 s (long tasks 0.00 s). two-site parameters: Top, Bottom, FracHi, LogIC50_HiAff, LogIC50_LoAff, IC50_HiAff, IC50_LoAff, Span
- `gp-book-hillslope-test` (FAIL): import + automatic first analysis (page frozen until done) 0.40 s (long tasks 0.00 s); agonist variable slope four 0.63 s (long tasks 0.00 s); Hill slope = 1 1.65 s (long tasks 0.00 s); Hill slope 1 vs free 0.48 s (long tasks 0.00 s)
- `gp-book-enzyme-mm` (FAIL): import + automatic first analysis (page frozen until done) 0.37 s (long tasks 0.00 s); michaelis 0.16 s (long tasks 0.00 s)
- `gp-book-normalized-2param` (FAIL): import + automatic first analysis (page frozen until done) 0.39 s (long tasks 0.00 s); agonist normalized variable 0.63 s (long tasks 0.00 s)
- `gp-book-operational-depletion` (not comparable): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); operational depletion 0.62 s (long tasks 0.00 s). parameters: Basal, Effectmax, LogKA, n, LogTau, KA, Tau
- `gp-book-operational-partial` (not comparable): import + automatic first analysis (page frozen until done) 0.40 s (long tasks 0.00 s); operational partial 0.66 s (long tasks 0.18 s). parameters: Basal,Effectmax,n,LogEC50,EC50 \| Basal,Effectmax,n,LogKA,LogTau,KA,Tau
- `gp-book-schild-global` (not comparable): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); gaddum 0.64 s (long tasks 0.06 s); Gaddum/Schild with antagonist concentrations 0.01 s (long tasks 0.00 s); Gaddum/Schild, SchildSlope = 1 0.17 s (long tasks 0.00 s). parameters: Bottom, Top, LogEC50, HillSlope, pA2, B, EC50, Kb, LogKb, Span
- `gp-stats-ratio-ttest` (FAIL): import + automatic first analysis (page frozen until done) 0.38 s (long tasks 0.00 s); t test (paired) 0.51 s (long tasks 0.06 s); t test (ratio_paired) 0.51 s (long tasks 0.00 s)

## Notes from the 2026-10-04 run (written by hand, not regenerated)

- **The live site was redeployed during this test** (Last-Modified 04:10 UTC, then 10:26 UTC, carrying the engine commit that makes fits converge to certified optima). The tables above are from a full run against the 10:26 build. Against the 04:10 build the same script also found, and the redeploy fixed:
  NIST nonlinear fits stopping short of the certified optimum (BoxBOD from Start 1 at b1 = 172.5 instead of 213.8; Hahn1 parameters off by up to 0.7 %, its SEs by up to 42 %; Thurber, MGH09, Lanczos3, Misra1a and Rat43 off in the 5th–6th digit);
  two-way ANOVA with one value per cell failing with "Analysis failed: not enough replicates for interaction model" (r-morley now passes all 13 quantities);
  the power tool's "Detectable effect" for two groups failing with "The function value at x=… is NaN; solver cannot continue" (power 0.9 / n 20, 0.7 / 20, 0.8 / 18, 0.8 / 10, 0.95 / 50; rechecked after the redeploy: all solve);
  SmLs07–09 one-way ANOVA a further two digits worse (F 21.040 for SmLs07, now 21.0008).
- One-way ANOVA blocks the page far longer than its size suggests: 9.5 s of main-thread work for 9 groups × 21 values (NIST SmLs01, measured on its own after the paste), 18 s for 9 × 201 and 47 s for 9 × 2001. Pasting and column statistics on the same table take 0.2 s.
- `nist-rat43`: the corpus lists df = 9, but Rat43 has 15 observations and 4 parameters (df = 11; the certified residual SD 28.262 = √(8786.4/11)). The page and the engine both show 11: a manifest error, not a page error.
- **2026-10-10: drivers updated for 0.4.0.** A run against the 0.4.0 interface lost passes to the script, not to the numbers (every pass came back once the drivers were updated, checked against a development server of the 0.4.0 code). What changed in `web/scripts/validate-site*.mjs`:
  - Precision is a command-line option, `--digits=6` by default, the precision of this protocol. Preferences now offer up to 10 significant digits and the script used to take the largest offered; at 10, sixteen quantities whose references carry fewer digits fail in the last digits (rel. 5e-7 to 7e-6: `nist-numacc4` sd 0.1000000006, `r-infert` m2.se_intercept, `r-indometh-1` lrc1_7digits, `drc-ryegrass` b, `power-r-examples` three unrounded n, `gp-book-twosite-ex1` two.Top, three `drc-selenium` ED50 values and four of its re-expressed SEs / CI limits, and `r-toothgrowth` F.supp_4dp, whose reference is truncated). That is the precision of the references and of floating-point arithmetic (WebAssembly versus native BLAS), not a regression; run `--digits=10` to see it. `--out=<path>` writes the report elsewhere.
  - A driver that fails half-way no longer leaves a dialog over the page (a stuck qPCR wizard made every later dataset of the run time out).
  - Import → Recipes: the Source step now recognises instrument exports and took the r-warpbreaks long table (first column A/B) for a plate-reader grid; the script chooses "Long (tidy) table" by name and records the friction. The output table type is chosen by its label.
  - Two-way ANOVA: the sources table names the factors from the file (tension, wool, dose, supp) instead of "Row factor" / "Column factor", and comparison tables gained an "Unadjusted P" column and a family line; both are read by header and by the factor names shown in the controls, not by position. The main-effects-only model (r-warpbreaks' additive quantities) and Tukey on every cell mean (r-toothgrowth's tukey_cells) are now read: 78 quantities that were not shown on 2026-10-04.
  - qPCR wizard: the new Reference check step is walked through before QC and statistics.
  - Power dialog: it opens with a result for its default inputs, so the script waits for the output to change before reading it.
  - Quantal: replicate titles "type 1" / "type 1" now name the data set "type" (the import takes the shared stem), so the titles are "type 1 dead" / "type 1 total"; values are read by column header. drc's delta-method SE and CI of the ED50 are re-expressed from the new "log dose ± SE" column (ED50 · ln 10 · SE), with the rounding of both shown numbers propagated.
  - Curve fits: "Compare with another model…" under a fit opens the comparison-of-fits sheet; the one-site vs two-site and Hill slope = 1 vs free comparisons (F, P, AICc, probability, evidence ratio = exp(−ΔAICc / 2)) are read from it. The model comparisons that need a constrained or global model (r-dnase-run1, r-cars, drc-s-alba, gp-book-schild-global) are still not driven.

## After the fixes (local build)

Written by hand, not regenerated. Measured on 2026-10-04 on the development machine (WSL2, headless Chromium, the jsDelivr CDN over the network) with `web/scripts/validate-site-perf.mjs` (run as `node scripts/validate-site.mjs <url> --no-data`), against the production build served under `/opendose/` by `web/scripts/serve-dist.mjs` (gzip, as GitHub Pages) and against the dev server (`npm run dev`). "Before" is commit 76bb1ff, the build the live run above measured, on the same machine; "after" is branch `worktree-agent-adcdac88649dad9b5` with main's engine commit 2dd82d1 merged (multistart budget, fast Tukey, 384-well reader). The live column repeats the table above.

| probe | live site | before, build | after, build | before, dev | after, dev |
|---|---:|---:|---:|---:|---:|
| cold load to first numbers on screen | 14.65 s | 16.62–17.96 s | **0.45–0.48 s** | 16.89–20.08 s | 1.08–1.19 s |
| cold load to live engine results | 14.65 s | 16.62–17.96 s | 11.78–12.31 s | 16.89–20.08 s | 12.54–13.21 s |
| warm reload: first numbers / live results | — | — | **0.18 s** / 10.70 s | — | 0.86 s / 11.54 s |
| reload from the offline cache, network off | (no offline cache) | (no offline cache) | **0.18 s** / 10.60 s | (none in dev) | — |
| 2,000-row paste | 1.09 s | 1.22 s | 0.86 s | 1.55 s | 1.39 s |
| t test on 2 × 2,000 (main-thread long tasks) | 1.03 s (0.40 s) | 0.82 s (0.46 s) | 1.50 s (0.55 s, rendering) | 1.41 s (1.02 s) | 1.31 s (0.90 s) |
| edit one cell → t test updated | 0.50 s | 0.55 s | 0.25 s | 0.80 s | 0.75 s |
| one-way ANOVA 9 × 2,001, typing meanwhile: longest main-thread task | 47 s (frozen) | — | **0.50 s** | — | 1.66 s |
| 500-point 4PL fit (main-thread long tasks) | 2.84 s (2.2 s) | 3.27 s (2.6 s) | 2.12 s (**0 s**) | 3.78 s (3.2 s) | 2.12 s (0 s) |
| 50-dataset grouped: paste + two-way ANOVA | 1.48 s | 1.53 s | 1.28 s | 2.50 s | 1.95 s |
| 200 cell edits (Playwright typing) | 32.13 s | 35.52 s | 18.77 s | 54.34 s | 36.67 s |
| undo with the Undo button | 8.98 s, 100 steps, **100 values left** | 9.30 s, 100 steps, 100 left | 13.42 s, **200 steps, 0 left** | 12.66 s, 100 left | 17.19 s, 0 left |
| redo with the Redo button | 8.91 s | 9.21 s | 13.35 s (200 steps) | 12.08 s | 15.52 s |
| undo all + redo all, app side, one rendered frame per step | — | — | 6.69 s (16.7 ms per step) | — | 7.88 s |
| reload and restore a 33-sheet project | 12.71 s | 13.25 s | **0.40 s** | 13.71 s | 1.48 s |
| share link round trip (33 sheets) | 15.69 s | 16.69 s | **0.64–2.14 s** | 17.32 s | 1.50 s |
| 384-well labelled grid read as | 96 wells | 96 wells | **384 wells** | 96 wells | 384 wells |
| 384-well QC preview | 0.39 s | 0.44 s | 5.92 s (engine still starting; 0.40 s once up) | 0.42 s | 5.93 s |

What the numbers say:

- **The engine no longer runs on the page.** Pyodide and the engine live in a Web Worker (`web/src/lib/engine.worker.ts`); the page's main thread is free while an analysis runs. The 500-point fit and the two-way ANOVA leave no long task at all; during the 9 × 2,001 ANOVA the longest main-thread task is the grid's own re-render after a keystroke (0.5 s in the build for 18,000 inputs), not the engine. A results sheet shows "Computing… 3.2 s" with Cancel after a second ("This is taking unusually long." after 60 s). Cancel answers at once; the worker, which cannot interrupt Python, is retired as soon as a warm spare is up (55 ms when the spare was ready) or keeps going until the job ends if that comes first. A fresh worker takes 9.8–11.9 s even from the cache (Python start, NumPy/SciPy, engine import), which is why a spare is warmed once a job has run 1.5 s and at every cancel.
- **Cold load: the first numbers appear in under half a second.** The example project's results ship with the app and show at first paint, marked as not live (`data-live="false"`, a note and a download progress bar), and are replaced by the live engine's. A reopened project, a restored session or a share link shows its saved results at once for the same reason (they carry the fingerprint of their input). The live engine itself still needs 11.5–12 s cold, 10.6–10.7 s warm; its floor is the engine's own start: Python up at 3.4–3.6 s, NumPy and SciPy loaded at 5.7–6.0 s, and importing the opendose package 5.5–5.8 s more (it imports `scipy.stats`, about 800 modules; PYTHONPROFILEIMPORTTIME puts 4–5.6 s of it under `opendose.anova` → `scipy.stats._stats_py`). Only lazier imports in the engine can shorten that last step.
- **Offline**: the production build registers a service worker that keeps the app, the engine bundle and the Pyodide files; a reload with the network switched off opens the app and computes as usual.
- **Undo** keeps 1,000 steps (and at most about 50 MB of history); 200 edits are undone to the empty table and redone exactly. One undo step costs about one frame in the app; the button probe's 67 ms per step is mostly Playwright's own round trips per click.
- **Restore and share links** are 30× faster because nothing is recomputed whose input did not change: results, their fingerprints and the sheet on screen are saved in files, the autosave and links; whatever did change is recomputed in the background, the visible sheet first. A session reopens on the sheet that was last viewed.
- **384-well plates**: the reader follows the engine's rule (labelled extent first, then the largest consistent bare block, padding to a format with a warning, never truncating); the wizard shows the reader's warnings at the QC step.
- The QC-preview step now comes while the engine is still starting after the restore probe's reload (the restore no longer waits for it); with the engine up it takes 0.4 s as before.

What the 25 MB of a first visit are (measured on the live build, fresh profile):

| what | transferred | in memory |
|---|---:|---:|
| SciPy wheel (jsDelivr, already compressed) | 13.9 MB | 14.0 MB |
| Pyodide runtime `pyodide.asm.wasm` (brotli) | 3.4 MB | 9.6 MB |
| NumPy wheel | 2.9 MB | 2.9 MB |
| Python standard library `python_stdlib.zip` | 2.5 MB | 2.6 MB |
| Plotly (our bundle, gzip) | 1.4 MB | 4.6 MB |
| the app's own JavaScript and CSS | 0.4 MB | 1.3 MB |
| `pyodide.asm.mjs`, lock file | 0.3 MB | 1.4 MB |
| openpyxl and et_xmlfile from PyPI, micropip | 0.4 MB | — |
| the engine's 61 Python files (gzip) | 0.4 MB | 1.4 MB |
| Inter font | 0.05 MB | — |

GitHub Pages serves the app, the JSON and the `.py` files gzip-compressed; jsDelivr serves the `.wasm` and `.zip` files compressed (brotli, gzip) and with a one-year cache lifetime; the wheels are zip archives already. The critical path before: page script, Plotly parsed (1.6 s) → Pyodide downloaded and started (5.4 s) → only then NumPy and SciPy downloaded (7.2 s) and loaded (9.8 s) → micropip and openpyxl from PyPI (10.2 s) → 61 engine files (10.5 s) → engine import → first result (14.7 s). After: a 14 kB boot script starts the worker first; the worker fetches the lock file, the wheels and the engine (one gzip'd `bundle.json`, versioned by a hash of its content) in parallel with the runtime, so all downloads end by about 4.3 s; openpyxl installs in the background after the start; Plotly loads when the first graph is drawn; Python runs with `-OO` (SciPy then skips building its distribution docstrings, about 1 s; the engine's test suite passes under `-OO`). The probe's "MB transferred" counts the page's own resources only (1.9 MB in the build): the worker's downloads do not appear in the page's resource timing.

## Run of 2026-10-10 against version 0.4.0 (written by hand, not regenerated)

The tables above were regenerated by `validate-site.mjs` against the live site after the 0.4.0 deployment (run started 2026-10-09 23:24 UTC, finished 2026-10-10), with the drivers updated the same day (`--digits=6`, the documented protocol; tables read by column header; the qPCR wizard's Reference check step; the two-way factor names from the file; the model comparison through "Compare with another model…"). The engine reference corpus run natively (`engine/tests/test_reference_corpus.py`) gives 1197 passed, 99 skipped, 203 xfailed, the same as before the 0.4.0 work.

| run | datasets pass / partial / fail / not comparable | quantities pass | fail | not shown | informational |
|---|---|---:|---:|---:|---:|
| 2026-10-04, version 0.3.0 | 19 / 47 / 23 / 10 | 856 | 112 | 474 | 57 |
| 2026-10-10, version 0.4.0 | 22 / 45 / 22 / 10 | 967 | 112 | 348 | 72 |

No quantity that passed on 2026-10-04 fails or is missing now (0 transitions out of pass). 111 quantities are newly read and pass: r-toothgrowth (+60, Tukey on every cell mean), r-warpbreaks (+18, the main-effects model with Tukey), synergy-mathews-block1 (+10), drc-selenium (+8, delta-method SE and CI), gp-book-twosite-ex1 (+7), gp-book-hillslope-test (+3), gp-book-twosite-ex2 (+2), nist-rat43, r-cmh-ucbadmissions and power-r-examples (+1 each). The failure count stays at 112 because the newly driven model comparisons add seven failures of their own: the AICc the engine reports for replicate data (gp-book-twosite-ex2: 292.31 and 293.21 against the book's 290.88 and 289.98, and so the evidence ratio) and small differences in F, P and the evidence ratio of gp-book-twosite-ex1 and gp-book-hillslope-test; these are recorded as an engine follow-up in `docs/ROADMAP.md`. Sixteen quantities would fail only at 10 significant digits (relative differences 5e-7 to 7e-6, wasm against native BLAS); they are listed in the 2026-10-10 driver note above. Three usability findings of the driver update (a long CSV recognised as a plate grid by the recipe detector; identical paired column titles collapsing to one data-set name; the "No interaction term" note shown under the full two-way model) were fixed after this run and are covered by unit and e2e tests.
