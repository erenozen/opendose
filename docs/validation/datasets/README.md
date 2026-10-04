# External validation datasets

99 datasets with **1499 reference quantities** whose correct results were
published independently of OpenDose: NIST certified values, R's own saved
reference output, package test suites and vignettes, peer-reviewed papers,
and the GraphPad and G*Power manuals. Every dataset is a CSV in this folder;
`manifest.json` describes all of them in one machine-readable file
(`datasets[]`, one entry per CSV, shape documented below).

Collected 2026-10-04. Nothing here was computed by OpenDose.

## How to use

For each manifest entry: load `file`, arrange it as `table_type` using
`layout`, run `analysis.handler` (an `opendose.api` handler name) with the
model described in `analysis.model_hint` / `analysis.options` (the options are
hints for the test author, not a guaranteed API payload), then compare each
`reference[].quantity` with its `value` within `tolerance`.

Entry fields:

| field | meaning |
|---|---|
| `id`, `title`, `file` | identifier, description, CSV file name |
| `source_url` | where the data were downloaded |
| `citation` | original data source and the exact URL(s) the reference numbers were read from |
| `licence` | redistribution terms (see "Licences" below) |
| `workflow` | analysis family (e.g. `nonlinear_regression`, `one_way_anova`, `survival`) |
| `table_type` | `xy`, `column`, `grouped`, `contingency`, `survival`, `multiple_variables`, `matrix`, `parameters` |
| `layout` | which CSV columns play which role, plus notes (replicates, blanks, transforms) |
| `analysis` | `handler`, `model_hint`, `options` |
| `reference[]` | `quantity`, `value`, `tolerance` (`abs` or `rel`), `source` (the exact command or page), `printed` (string exactly as printed, when transcribed) |
| `digits_note`, `verbatim_quote` | precision of the source, one verbatim line |
| optional | `notes`, `derived` (re-expressions of printed numbers, not references), `difficulty` and `stress_test` (NIST), `reference_status` (source inconsistent; not a pass/fail gate), `model_dependent` / `approximate` on single references, `licence_flag`, `extra_sources` |

### Tolerances

* Certified values (NIST): `rel` 1e-6 for nonlinear parameters (1e-5 for
  their SEs and for the ill-conditioned Lanczos3), `rel` 1e-9 for linear
  regression, ANOVA and summary statistics (certified to 15 digits);
  relaxed to 1e-6 for the stress tests (Filip, SmLs07-09).
* Printed values: `abs` = half a unit in the last printed digit (e.g.
  `4.8461` -> 0.00005, `0.068` -> 0.0005). Integers (df, counts, N) are exact.
* Where a source is known to be imprecise the entry says so and loosens the
  tolerance (drc S.alba, GraphPad operational-model examples, Monte Carlo CIs).

### CSV layouts

* `column`: one column per group (blank = missing / unequal n). Paired data
  have matched rows; a leading ID/label column is noted in `layout`.
* `xy`: an X column followed by Y columns; replicate Y values side by side
  (`Y1, Y2, ...` or `name_1, name_2`). NIST files keep the values exactly as
  printed by NIST (Fortran `E` notation, e.g. `77.6E0`).
* `grouped` (two-way ANOVA): tidy long files (`factor A, factor B, value`)
  or a wide replicate layout as stated in `layout`.
* `contingency`: first column = row labels, then one column per outcome.
  Stratified tables (CMH) are long: one row per stratum x row.
* `survival`: one row per subject with time, event/status, group and covariates.
* `matrix` (synergy): first column = drug A concentrations, header = drug B
  concentrations, cells = response.
* `parameters` (power): one row per scenario; blank = the quantity solved for.

## Datasets

`(!)` = source internally inconsistent or not exactly reproducible (see notes);
`(stress)` = numerical-accuracy stress test; `*` = see Licences.

| id | workflow | table | reference source | licence | refs |
|---|---|---|---|---|---|
| `nist-misra1a` | nonlinear_regression | xy | NIST StRD (certified) | public domain | 7 |
| `nist-chwirut2` | nonlinear_regression | xy | NIST StRD (certified) | public domain | 9 |
| `nist-thurber` | nonlinear_regression | xy | NIST StRD (certified) | public domain | 17 |
| `nist-mgh09` | nonlinear_regression | xy | NIST StRD (certified) | public domain | 11 |
| `nist-lanczos3` | nonlinear_regression | xy | NIST StRD (certified) | public domain | 15 |
| `nist-boxbod` | nonlinear_regression | xy | NIST StRD (certified) | public domain | 7 |
| `nist-rat42` | nonlinear_regression | xy | NIST StRD (certified) | public domain | 9 |
| `nist-rat43` | nonlinear_regression | xy | NIST StRD (certified) | public domain | 11 |
| `nist-eckerle4` | nonlinear_regression | xy | NIST StRD (certified) | public domain | 9 |
| `nist-hahn1` | nonlinear_regression | xy | NIST StRD (certified) | public domain | 17 |
| `nist-norris` | linear_regression | xy | NIST StRD (certified) | public domain | 13 |
| `nist-pontius` | polynomial_regression | xy | NIST StRD (certified) | public domain | 15 |
| `nist-noint1` | linear_regression | xy | NIST StRD (certified) | public domain | 11 |
| `nist-filip` (stress) | polynomial_regression | xy | NIST StRD (certified) | public domain | 31 |
| `nist-longley` | multiple_regression | multiple_variables | NIST StRD (certified) | public domain | 23 |
| `nist-sirstv` | one_way_anova | column | NIST StRD (certified) | public domain | 9 |
| `nist-smls01` | one_way_anova | column | NIST StRD (certified) | public domain | 9 |
| `nist-smls02` | one_way_anova | column | NIST StRD (certified) | public domain | 9 |
| `nist-smls03` | one_way_anova | column | NIST StRD (certified) | public domain | 9 |
| `nist-smls04` | one_way_anova | column | NIST StRD (certified) | public domain | 9 |
| `nist-smls05` | one_way_anova | column | NIST StRD (certified) | public domain | 9 |
| `nist-smls06` | one_way_anova | column | NIST StRD (certified) | public domain | 9 |
| `nist-smls07` (stress) | one_way_anova | column | NIST StRD (certified) | public domain | 9 |
| `nist-smls08` (stress) | one_way_anova | column | NIST StRD (certified) | public domain | 9 |
| `nist-smls09` (stress) | one_way_anova | column | NIST StRD (certified) | public domain | 9 |
| `nist-atmwtag` | one_way_anova | column | NIST StRD (certified) | public domain | 9 |
| `nist-pidigits` | descriptive_statistics | column | NIST StRD (certified) | public domain | 4 |
| `nist-lottery` | descriptive_statistics | column | NIST StRD (certified) | public domain | 4 |
| `nist-lew` | descriptive_statistics | column | NIST StRD (certified) | public domain | 4 |
| `nist-mavro` | descriptive_statistics | column | NIST StRD (certified) | public domain | 4 |
| `nist-michelso` | descriptive_statistics | column | NIST StRD (certified) | public domain | 4 |
| `nist-numacc1` | descriptive_statistics | column | NIST StRD (certified) | public domain | 4 |
| `nist-numacc2` | descriptive_statistics | column | NIST StRD (certified) | public domain | 4 |
| `nist-numacc3` (stress) | descriptive_statistics | column | NIST StRD (certified) | public domain | 4 |
| `nist-numacc4` (stress) | descriptive_statistics | column | NIST StRD (certified) | public domain | 4 |
| `r-plantgrowth` | one_way_anova | column | R reference output (`*-Ex.Rout.save`) | GPL-2/3 (R datasets) | 8 |
| `r-insectsprays` | one_way_anova | column | R reference output + open workshop page | GPL-2/3 (R datasets) | 67 |
| `r-chickwts` | one_way_anova | column | R reference output (`*-Ex.Rout.save`) | GPL-2/3 (R datasets) | 8 |
| `r-sleep` | t_test | column | R reference output (`*-Ex.Rout.save`) | GPL-2/3 (R datasets) | 20 |
| `r-welch-examples` | t_test | column | R reference output (`stats-Ex.Rout.save`) | GPL-2/3 (R docs) | 11 |
| `r-mtcars-mpg-by-am` | t_test | column | R reference output (`*-Ex.Rout.save`) | GPL-2/3 (R datasets) | 7 |
| `r-hw-depression` | nonparametric | column | R reference output (`stats-Ex.Rout.save`) | GPL-2/3 (R docs) | 4 |
| `r-hw-permeability` | nonparametric | column | R reference output (`stats-Ex.Rout.save`) | GPL-2/3 (R docs) | 3 |
| `r-hw-mucociliary` | nonparametric | column | R reference output (`stats-Ex.Rout.save`) | GPL-2/3 (R docs) | 3 |
| `r-airquality-ozone` | nonparametric | column | R reference output (`*-Ex.Rout.save`) | GPL-2/3 (R datasets) | 23 |
| `r-friedman-roundingtimes` | nonparametric | column | R reference output (`stats-Ex.Rout.save`) | GPL-2/3 (R docs) | 3 |
| `r-hw-tuna-correlation` | correlation | xy | R reference output (`stats-Ex.Rout.save`) | GPL-2/3 (R docs) | 13 |
| `r-warpbreaks` | two_way_anova | grouped | R reference output (`*-Ex.Rout.save`) | GPL-2/3 (R datasets) | 36 |
| `r-toothgrowth` | two_way_anova | grouped | RPubs + r-statistics.co (knitted R output) | GPL-2/3 (R datasets) | 92 |
| `r-morley` | two_way_anova | grouped | R reference output (`*-Ex.Rout.save`) | GPL-2/3 (R datasets) | 13 |
| `r-fisher-teatasting` | contingency | contingency | R reference output (`stats-Ex.Rout.save`) | GPL-2/3 (R docs) | 3 |
| `r-fisher-convictions` | contingency | contingency | R reference output (`stats-Ex.Rout.save`) | GPL-2/3 (R docs) | 7 |
| `r-fisher-job` | contingency | contingency | R reference output (`stats-Ex.Rout.save`) | GPL-2/3 (R docs) | 1 |
| `r-fisher-mp6` | contingency | contingency | R reference output (`stats-Ex.Rout.save`) | GPL-2/3 (R docs) | 1 |
| `r-chisq-party-gender` | contingency | contingency | R reference output (`stats-Ex.Rout.save`) | GPL-2/3 (R docs) | 15 |
| `r-chisq-2x2-yates` | contingency | contingency | R reference output (`stats-Ex.Rout.save`) | GPL-2/3 (R docs) | 1 |
| `r-chisq-goodness-of-fit` | contingency | column | R reference output (`stats-Ex.Rout.save`) | GPL-2/3 (R docs) | 8 |
| `r-binom-mendel` | proportion | column | R reference output (`stats-Ex.Rout.save`) | GPL-2/3 (R docs) | 4 |
| `r-mcnemar-performance` | contingency | contingency | R reference output (`stats-Ex.Rout.save`) | GPL-2/3 (R docs) | 3 |
| `r-cmh-rabbits` | contingency | contingency | R reference output (`stats-Ex.Rout.save`) | GPL-2/3 (R docs) | 8 |
| `r-cmh-ucbadmissions` | contingency | contingency | R reference output (`*-Ex.Rout.save`) | GPL-2/3 (R datasets) | 11 |
| `r-cmh-satisfaction` | contingency | contingency | R reference output (`stats-Ex.Rout.save`) | GPL-2/3 (R docs) | 3 |
| `r-anscombe` | linear_regression | xy | R reference output (`*-Ex.Rout.save`) | GPL-2/3 (R datasets) | 48 |
| `r-cars` | linear_regression | xy | R reference output (`*-Ex.Rout.save`) | GPL-2/3 (R datasets) | 16 |
| `r-puromycin` | nonlinear_regression | xy | R reference output (`*-Ex.Rout.save`) | GPL-2/3 (R datasets) | 17 |
| `r-dnase-run1` | standard_curve | xy | R reference output (`*-Ex.Rout.save`) | GPL-2/3 (R datasets) | 30 |
| `r-loblolly-329` | growth_curve | xy | R reference output (`*-Ex.Rout.save`) | GPL-2/3 (R datasets) | 11 |
| `r-indometh-1` | nonlinear_regression | xy | R reference output (`*-Ex.Rout.save`) | GPL-2/3 (R datasets) | 14 |
| `r-chickweight-chick1` | growth_curve | xy | R reference output (`*-Ex.Rout.save`) | GPL-2/3 (R datasets) | 14 |
| `r-infert` | logistic_regression | multiple_variables | R reference output (`*-Ex.Rout.save`) | GPL-2/3 (R datasets) | 30 |
| `r-usarrests` | pca | multiple_variables | R reference output (`*-Ex.Rout.save`) | GPL-2/3 (R datasets) | 27 |
| `r-iris` | pca | multiple_variables | scikit-learn printed example | GPL-2/3 (R datasets) | 2 |
| `growthcurver-a1` | growth_curve | xy | Growthcurver vignette | GPL-2+ (growthcurver) | 12 |
| `surv-aml` | survival | survival | survival pkg tests + vignette | LGPL (survival) | 53 |
| `surv-ovarian` | survival | survival | survival pkg tests | LGPL (survival) | 42 |
| `surv-lung` | survival | survival | survival vignette + 2 open tutorials | LGPL (survival) | 58 |
| `roc-asah` | roc | column | pROC test suite + Robin 2011 | GPL-3 (pROC) | 18 |
| `drc-ryegrass` | dose_response | xy | Ritz et al. 2015 PLOS ONE, S1 File | GPL-2 (drc) | 18 |
| `drc-s-alba` | global_fit | xy | Ritz et al. 2015 PLOS ONE, S1 File | GPL-2 (drc) | 21 |
| `drc-earthworms` | quantal_dose_response | xy | Ritz et al. 2015 PLOS ONE, S1 File | GPL-2 (drc) | 10 |
| `drc-selenium` | quantal_dose_response | xy | Ritz et al. 2015 PLOS ONE, S1 File | GPL-2 (drc) | 20 |
| `deming-arsenate` | deming | xy | deming pkg vignette | LGPL-2+ (deming) | 7 |
| `bland-altman-pefr` | bland_altman | column | Bland & Altman 1986 Lancet | facts from (c) article * | 14 |
| `qpcr-livak-table1` | qpcr | column | Livak & Schmittgen 2001 Table 1 | facts from (c) article * | 21 |
| `synergy-mathews-block1` | synergy | matrix | SynergyFinder vignette | MPL-2.0 (synergyfinder) | 49 |
| `gp-book-ch1-bloodpressure` (!) | dose_response | xy | GraphPad/Motulsky & Christopoulos 2003 book | no open licence (GraphPad) * | 10 |
| `gp-book-twosite-ex1` | model_comparison | xy | GraphPad/Motulsky & Christopoulos 2003 book | no open licence (GraphPad) * | 36 |
| `gp-book-twosite-ex2` | model_comparison | xy | GraphPad/Motulsky & Christopoulos 2003 book | no open licence (GraphPad) * | 21 |
| `gp-book-hillslope-test` | model_comparison | xy | GraphPad/Motulsky & Christopoulos 2003 book | no open licence (GraphPad) * | 18 |
| `gp-book-enzyme-mm` | nonlinear_regression | xy | GraphPad/Motulsky & Christopoulos 2003 book | no open licence (GraphPad) * | 16 |
| `gp-book-normalized-2param` | dose_response | xy | GraphPad/Motulsky & Christopoulos 2003 book | no open licence (GraphPad) * | 15 |
| `gp-book-operational-depletion` (!) | global_fit | xy | GraphPad/Motulsky & Christopoulos 2003 book | no open licence (GraphPad) * | 12 |
| `gp-book-operational-partial` (!) | global_fit | xy | GraphPad/Motulsky & Christopoulos 2003 book | no open licence (GraphPad) * | 12 |
| `gp-book-schild-global` (!) | global_fit | xy | GraphPad/Motulsky & Christopoulos 2003 book | no open licence (GraphPad) * | 16 |
| `gp-book-twoway-bonferroni` | two_way_anova | grouped | GraphPad/Motulsky & Christopoulos 2003 book | no open licence (GraphPad) * | 32 |
| `gp-stats-ratio-ttest` | t_test | column | Prism 4 Statistics Guide | no open licence (GraphPad) * | 10 |
| `power-r-examples` | power | parameters | R reference output | GPL-2/3 (R docs) | 10 |
| `power-gpower-examples` | power | parameters | G*Power 3.1 manual; Faul 2007 | facts (parameters only) | 21 |
| `power-prism4-receptors` | power | column | Prism 4 Statistics Guide (StatMate) | no open licence (GraphPad) * | 2 |

**Count: 99 datasets, 1499 reference quantities**
(NIST StRD: 10 nonlinear, 5 linear, 11 ANOVA, 9 univariate).

## Independent transcription check

Before publishing, the CSVs were checked against their printed references by
recomputing at least one reference per dataset with scipy, statsmodels or
scikit-learn: all 35 NIST files against their certified values, 75 checks on
the R, survival, pROC, drc, Deming, Bland-Altman, Livak and SynergyFinder
files, and a refit of every GraphPad book example. Not independently
recomputed: `r-fisher-job`, `r-fisher-mp6` (r x c exact test), `r-cmh-satisfaction`,
`drc-earthworms`, `drc-selenium` (binomial fits) and the G*Power/R power rows. This only checks that the data and numbers
were transcribed correctly; it is not an OpenDose test. The two checks that do
not match are explained below (ToothGrowth on r-statistics.co, drc S.alba).

## Sources that disagree or need care

* `gp-book-ch1-bloodpressure` (!): the GraphPad book's results table
  (Top 27.36, LogEC50 -5.946, Hill 0.8078, SS 96.71) does not fit its own
  printed data (refit: 26.97, -5.908, 0.8048, SS 101.04), and the book's prose
  quotes yet other values (Top 26.9, Hill 0.84). Kept only to document this.
* `gp-book-schild-global` (!): the printed table cannot reproduce pA2 9.678
  exactly (refit 9.651; no assignment of the ambiguous short rows reaches it).
* `gp-book-operational-depletion`, `gp-book-operational-partial`: refits agree
  to about 1% (Prism 4 output, Basal apparently constrained >= 0); tolerances
  loosened.
* `gp-book-normalized-2param`: estimates reproduce, SE and SS are 0.3% off
  (one printed data value probably rounded).
* `gp-book-hillslope-test`: the book prints the SS difference as 76 (should be
  424) and the t statistic three different ways (1.816, 1.691, 1.6816); the
  t-test P (0.1068) matches 1.6816, not the correct |t| = 1.818.
* `gp-stats-ratio-ttest`: the guide's Difference column says 4.3 for the
  first pair (8.7 - 4.2 = 4.5); its CI matches the correct difference.
* `r-toothgrowth`: r-statistics.co prints the interaction F as 4.1067, which
  contradicts its own P (0.0218603 corresponds to F = 4.10699). The RPubs
  output (F = 4.107) is used instead; the SS and other F values agree.
* `drc-s-alba`: drc stopped slightly short of the least-squares optimum (RSS
  at the printed estimates 8.511447 vs 8.511399), so printed estimates hold
  only to about 3-4 significant digits (ED50 Bentazone 28.632 vs exact
  28.638). Tolerances are rel 2e-3.
* `bland-altman-pefr`: the paper uses bias +/- **2** SD (-79.7 to 75.5); with
  1.96 SD the limits are -78.1 to 73.9 (derived).
* `r-mcnemar-performance`: R prints 16.818 for this table.
* Typos in the GraphPad book's AICc prose ("12 data points" vs N = 11) do not
  affect the numbers.

### Numbers in the task brief that the sources do not print

* McNemar chi-square 34.712 for R's `mcnemar.test` example: R prints
  **16.818** (continuity corrected); the uncorrected value is 17.36.
* Bland & Altman 1986 limits "-75.5 to 71.3": the paper prints **-79.7 and
  75.5** (bias -2.1, SD 38.8).
* `wilcox.test` "W = 35, p = 0.2544 for the depression data": W = 35 belongs
  to the *permeability* example and R prints the **one-sided** P 0.1272
  (2 x 0.1272 = 0.2544 is implied, not printed). The depression data are the
  signed-rank example (V = 40, two-sided P 0.03906).
* Fisher tea tasting "p = 0.4857": R's help page prints only the one-sided
  P = 0.2429.
* InsectSprays Kruskal-Wallis 54.691 is not in R's own help pages; it was taken
  from an open university workshop page that prints the R output verbatim.
* `survdiff(... ~ sex, lung)` chi-square 10.3 is not in the survival package's
  own docs; taken from two independent open tutorials that print identical output.
* Iris correlation-matrix eigenvalues 2.918/0.914/0.147/0.021: no verbatim
  open source was pinned, so only scikit-learn's printed covariance-PCA
  explained-variance ratios are used.

## Licences

* NIST StRD: US government work, public domain.
* R `datasets` data and R help-page examples: distributed with R (GPL-2 |
  GPL-3); the data come from the cited publications.
* Package data: drc (GPL-2), survival (LGPL), pROC (GPL >= 3), growthcurver
  (GPL >= 2), deming (LGPL >= 2), synergyfinder (MPL-2.0).
* Ritz et al. 2015 is CC BY 4.0; Robin et al. 2011 is CC BY 2.0.
* `*` **No open licence**: `qpcr-livak-table1` (Methods 2001, Elsevier) and
  `bland-altman-pefr` (Lancet 1986) reproduce small factual measurement tables
  (24 and 68 numbers) from copyrighted articles; the eleven `gp-*` entries and
  `power-prism4-receptors` quote small worked examples from GraphPad's freely
  downloadable but copyrighted Prism 4 manuals. These are included as facts
  for validation and are marked with `licence_flag`. Remove them if you need
  a corpus that is redistributable under open licences only.
* G*Power: parameters and results only (no data).

## Not obtained, and why

* SuperPlots (Lord et al. 2020, JCB): Data S1 exists, but the article prints no
  P values for it in text (only inside figure images), so there is nothing to
  compare verbatim.
* Spector & Mazzeo (statsmodels): statsmodels lists it as "used with express
  permission ... who retains all rights", so not redistributable. `r-infert`
  covers logistic regression instead.
* Orange, Titanic: R's reference output prints no fitted estimates or test
  results for them. Mroz was not pursued.
* `Theoph`: the first-order compartment fit is printed (lKe -2.4365, lKa
  0.1583, lCl -3.2861) but needs a model OpenDose does not have, so it was left out.
* GraphPad online guide pages (enzyme kinetics, two-site, Schild): they show
  data and results only as screenshots. The equivalent worked examples were
  taken from GraphPad's text PDF book instead (`gp-book-*`).
* NCATS/PubChem qHTS example with a printed AC50: none found in a reliable
  text source.
* Bland & Altman 1999/2007 worked data: not pursued once the 1986 data were in.
* Faul et al. 2007 "actual power 0.9512" appears only in a screenshot; only
  N = 176 (88 per group) is in the text.
* `veteran`: the survival vignette prints only a time-dependent Cox model
  (counting-process data), which a simple survival table cannot reproduce.

## Re-building

The CSVs and manifest were generated by scripts that parse the downloaded
files (NIST `.dat` files, Rdatasets CSVs, package `.rda` files read with
`pyreadr`) and copy printed numbers by hand. Reference numbers were copied
from the raw text of the sources listed in each entry's `citation` and
`source` fields, never from a summarising tool.

## Entries kept out of the repository

Fifteen datasets whose source is a copyrighted publication without an open
licence (GraphPad's Prism 4 book and statistics guide examples, the Livak &
Schmittgen 2001 table, the Bland & Altman 1986 PEFR table) are kept locally
under `docs/validation/private/` (gitignored) and are not redistributed
here. The validation runs include them; the public manifest lists only the
open-licence and public-domain datasets.
