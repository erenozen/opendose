# Needs by venue (2026-10-09)

The same catalogue, split by where the observations came from, so that the differences between
venues are visible. Each venue has a short reading, its ten most frequent needs (with the need's share
of the venue next to its share of the whole corpus) and the needs most over-represented there.
Severity shares are the agents' classification of each observation.

| Venue | Obs | Blocks | Wrong result | Slows | Cosmetic | Top need |
|---|---:|---:|---:|---:|---:|---|
| Stack Exchange | 698 | 15% | 43% | 35% | 6% | `nested-mixed-models` |
| GitHub issues | 463 | 22% | 35% | 30% | 13% | `brackets-from-analysis` |
| GraphPad support pages | 400 | 18% | 38% | 31% | 14% | `free-access` |
| YouTube comments | 324 | 26% | 39% | 32% | 3% | `ic50-no-code-fit` |
| Methods literature | 274 | 1% | 73% | 19% | 7% | `declare-experimental-unit` |
| Competitor trackers | 233 | 15% | 24% | 47% | 14% | `brackets-from-analysis` |
| Software reviews | 188 | 16% | 7% | 46% | 30% | `free-access` |
| Statistics-consulting FAQs | 183 | 10% | 55% | 29% | 5% | `power-sample-size` |
| Lab blogs | 171 | 9% | 36% | 47% | 8% | `free-access` |
| Journal requirements | 160 | 14% | 52% | 29% | 5% | `design-reporting-capture` |
| Forums (image.sc, Bioconductor, Galaxy) | 153 | 29% | 44% | 25% | 3% | `normalise-step` |
| Courses and workshops | 151 | 3% | 37% | 56% | 5% | `power-sample-size` |
| Non-English communities | 126 | 27% | 29% | 39% | 6% | `localised-ui` |
| Hacker News | 101 | 5% | 47% | 40% | 9% | `no-code-approachable` |
| Mastodon / fediverse | 41 | 12% | 44% | 39% | 5% | `prism-files` |

## Stack Exchange (`raw/stackexchange.json`, 698 observations)

The analysts' venue. Questions are long, specific and well answered, and they come from people who already know a test exists but cannot map their design onto it: nested and blocked experiments, counts and proportions, small samples, standard curves and IC50s. Its distinctive needs (counts models, limits of detection, error propagation, rank tests at tiny n) are the statistics that sit just beyond the textbook. 698 observations; 15% block the analysis, 43% risk a wrong result, 35% slow the work, 6% are cosmetic. Most frequent: Nested t test, nested ANOVA or a mixed model with animal, litter or culture as a random effect, without code (33); Treat each independent experiment (day, plate, run) as a block instead of pooling or normalising it away (23); Fit a dose-response curve and get the IC50 without Excel Solver, macros or code (22).

| # | Need | In this venue | Share of venue | Corpus share | Status |
|---:|---|---:|---:|---:|---|
| 1 | Nested t test, nested ANOVA or a mixed model with animal, litter or culture as a random effect, without code `nested-mixed-models` | 33 | 4.7% | 2.0% | partial |
| 2 | Treat each independent experiment (day, plate, run) as a block instead of pooling or normalising it away `experiment-as-block` | 23 | 3.3% | 1.0% | partial |
| 3 | Fit a dose-response curve and get the IC50 without Excel Solver, macros or code `ic50-no-code-fit` | 22 | 3.2% | 1.6% | done |
| 4 | Interpolate unknowns from a standard curve (ELISA, BCA, copies), with dilution factors `standard-curve-interpolation` | 20 | 2.9% | 1.3% | done |
| 5 | Analyse ratios and skewed positive data on the log scale and report back-transformed fold changes `log-scale-analysis` | 19 | 2.7% | 1.2% | partial |
| 6 | Ask whether the same subjects were measured repeatedly and choose a paired or repeated-measures analysis `repeated-measures-detection` | 19 | 2.7% | 1.1% | done |
| 7 | Work out how many animals or replicates I need, with a justification sentence `power-sample-size` | 18 | 2.6% | 1.6% | done |
| 8 | Pick the post hoc test from my question: each vs control (Dunnett), all pairs (Tukey), a few planned pairs (Šídák) `posthoc-by-question` | 18 | 2.6% | 1.0% | done |
| 9 | Ask what the independent unit is (animal, culture, experiment) and compute n from it `declare-experimental-unit` | 17 | 2.4% | 1.9% | partial |
| 10 | Tell me what n = 1–3 can and cannot show, and refuse P values when there is one independent value `small-n-honesty` | 17 | 2.4% | 1.2% | partial |

Most distinctive (needs with at least 3 observations here, by over-representation against the whole corpus): `lod-loq` (7, ×4.6), `error-propagation` (5, ×4.4), `counts-proportions-routing` (14, ×4.1), `assay-validation-suite` (3, ×3.9), `rank-test-small-n` (4, ×3.5).

## GitHub issues (`raw/github.json`, 463 observations)

The power users' venue. Issues ask for precise, reproducible output from code libraries: brackets that carry the right adjusted P, risk tables locked to the time axis, exact test variants, SS types, pairing by subject ID rather than row order. It is the venue most concerned with figure mechanics and with results that silently differ between tools. 463 observations; 22% block the analysis, 35% risk a wrong result, 30% slow the work, 13% are cosmetic. Most frequent: Significance brackets drawn from the analysis I ran, stacked automatically, on any graph (36); A publication Kaplan-Meier figure: censor ticks, aligned at-risk table, nudged curves (13); Exact P values everywhere, formatted to my journal's style (11).

| # | Need | In this venue | Share of venue | Corpus share | Status |
|---:|---|---:|---:|---:|---|
| 1 | Significance brackets drawn from the analysis I ran, stacked automatically, on any graph `brackets-from-analysis` | 36 | 7.8% | 2.0% | done |
| 2 | A publication Kaplan-Meier figure: censor ticks, aligned at-risk table, nudged curves `km-figure` | 13 | 2.8% | 0.8% | done |
| 3 | Exact P values everywhere, formatted to my journal's style `exact-p` | 11 | 2.4% | 1.0% | done |
| 4 | Say whether each P is adjusted, by which method, and show the unadjusted value beside it `adjusted-vs-raw-labelled` | 11 | 2.4% | 0.7% | partial |
| 5 | Control axis ranges, ticks, number formats and long or rotated group labels `axis-label-control` | 10 | 2.2% | 0.7% | done |
| 6 | Repeated measures with missing values: fit a mixed model instead of dropping subjects `rm-missing-mixed-model` | 10 | 2.2% | 0.7% | done |
| 7 | Name the exact test variant: paired or not, Welch, tails, exact or approximate `test-variant-named` | 10 | 2.2% | 1.0% | done |
| 8 | Assemble multi-panel figures with panel letters, shared axes and one font size `multi-panel-layout` | 9 | 1.9% | 1.1% | done |
| 9 | Dunn's (or Conover) after Kruskal-Wallis or Friedman, including each vs control only `nonparametric-posthoc` | 9 | 1.9% | 0.8% | partial |
| 10 | Vector export (SVG, PDF) that opens editable in Illustrator or Inkscape `vector-export` | 9 | 1.9% | 1.1% | done |

Most distinctive (needs with at least 3 observations here, by over-representation against the whole corpus): `pair-by-subject-id` (6, ×6.8), `legend-control` (4, ×5.3), `anova-method-transparency` (7, ×4.3), `fail-loudly` (8, ×4.2), `pairwise-logrank` (8, ×4.0).

## GraphPad support pages (`raw/graphpad-support-mirror.json`, 400 observations)

The vendor's view. Release notes and FAQs are a log of what users requested and of what broke: licensing and platform problems, large data, file compatibility, pasting from Excel, and a long tail of wrong-result bug fixes in multiple comparisons and curve fitting (see finding 3 in CATALOGUE.md). 400 observations; 18% block the analysis, 38% risk a wrong result, 31% slow the work, 14% are cosmetic. Most frequent: A free tool I can use legally, without licences, trials or seat limits (30); Stay fast with tens of thousands of rows and points (19); Runs on any computer (Mac, Windows, Linux, tablet), with no install, even offline (17).

| # | Need | In this venue | Share of venue | Corpus share | Status |
|---:|---|---:|---:|---:|---|
| 1 | A free tool I can use legally, without licences, trials or seat limits `free-access` | 30 | 7.5% | 2.7% | done |
| 2 | Stay fast with tens of thousands of rows and points `large-data` | 19 | 4.8% | 1.2% | partial |
| 3 | Runs on any computer (Mac, Windows, Linux, tablet), with no install, even offline `runs-anywhere` | 17 | 4.2% | 1.1% | done |
| 4 | An open, documented project format that every version opens and never corrupts `open-file-format` | 15 | 3.8% | 0.9% | done |
| 5 | Paste from Excel exactly: blanks stay missing, decimals and IDs are never mangled `excel-paste-fidelity` | 14 | 3.5% | 1.2% | partial |
| 6 | Show every data point by default instead of a bar of the mean `show-every-point` | 11 | 2.8% | 1.9% | done |
| 7 | Vector export (SVG, PDF) that opens editable in Illustrator or Inkscape `vector-export` | 10 | 2.5% | 1.1% | done |
| 8 | Reopened analyses give the same numbers, and I am told if a version changed them `stable-results-versions` | 10 | 2.5% | 0.7% | partial |
| 9 | Share a project with people who don't have the software `share-with-collaborators` | 10 | 2.5% | 0.7% | done |
| 10 | Significance brackets drawn from the analysis I ran, stacked automatically, on any graph `brackets-from-analysis` | 8 | 2.0% | 2.0% | done |

Most distinctive (needs with at least 3 observations here, by over-representation against the whole corpus): `accessibility` (3, ×9.2), `calculated-columns` (6, ×5.0), `rich-text-labels` (7, ×4.9), `nway-anova-contrasts` (3, ×4.6), `logistic-regression` (3, ×4.6).

## YouTube comments (`raw/youtube.json`, 324 observations)

The beginners' venue. Comments under tutorials ask how to get a number at all: an IC50 from three doses, ΔΔCt from a Ct table, a standard curve, a densitometry ratio, an asterisk on a bar. A quarter of them are blocked outright, and some replies give dangerous advice (invent a concentration, replace zero with 0.1). 324 observations; 26% block the analysis, 39% risk a wrong result, 32% slow the work, 3% are cosmetic. Most frequent: Fit a dose-response curve and get the IC50 without Excel Solver, macros or code (16); ΔΔCt from the instrument export to fold change and statistics, with the reference and direction stated (15); Interpolate unknowns from a standard curve (ELISA, BCA, copies), with dilution factors (11).

| # | Need | In this venue | Share of venue | Corpus share | Status |
|---:|---|---:|---:|---:|---|
| 1 | Fit a dose-response curve and get the IC50 without Excel Solver, macros or code `ic50-no-code-fit` | 16 | 4.9% | 1.6% | done |
| 2 | ΔΔCt from the instrument export to fold change and statistics, with the reference and direction stated `qpcr-ddct-workflow` | 15 | 4.6% | 1.1% | done |
| 3 | Interpolate unknowns from a standard curve (ELISA, BCA, copies), with dilution factors `standard-curve-interpolation` | 11 | 3.4% | 1.3% | done |
| 4 | Significance brackets drawn from the analysis I ran, stacked automatically, on any graph `brackets-from-analysis` | 10 | 3.1% | 2.0% | done |
| 5 | From band intensities to normalised fold change and statistics in one place `wb-densitometry-workflow` | 9 | 2.8% | 1.3% | done |
| 6 | A free tool I can use legally, without licences, trials or seat limits `free-access` | 9 | 2.8% | 2.7% | done |
| 7 | Run qPCR statistics on ΔCt and back-transform fold changes with asymmetric error bars `qpcr-stats-log-scale` | 9 | 2.8% | 0.6% | done |
| 8 | From a plate-reader export to a plate map, blanks and % of control in one step `plate-map-normalise` | 7 | 2.2% | 0.6% | done |
| 9 | Enter survival data simply (dates, deaths per day, event yes/no) and preview how each row is read `survival-data-entry` | 7 | 2.2% | 0.6% | partial |
| 10 | Lane and band detection with background subtraction on the image itself `image-quantification` | 7 | 2.2% | 0.3% | missing |

Most distinctive (needs with at least 3 observations here, by over-representation against the whole corpus): `dose-design-advice` (3, ×8.5), `image-quantification` (7, ×7.9), `auc-analysis` (5, ×6.3), `qpcr-qc-nondetects` (4, ×5.7), `standard-curve-qc` (6, ×5.2).

## Methods literature (`raw/literature.json`, 274 observations)

The auditors' venue. Methods papers count how often published analyses go wrong; three quarters of the observations are silent wrong results: pseudoreplication, bar graphs hiding data, missing randomisation and blinding, saturated blots, undefined plateaus. This is where most prevalence figures come from. 274 observations; 1% block the analysis, 73% risk a wrong result, 19% slow the work, 7% are cosmetic. Most frequent: Ask what the independent unit is (animal, culture, experiment) and compute n from it (14); Show every data point by default instead of a bar of the mean (10); Nested t test, nested ANOVA or a mixed model with animal, litter or culture as a random effect, without code (10).

| # | Need | In this venue | Share of venue | Corpus share | Status |
|---:|---|---:|---:|---:|---|
| 1 | Ask what the independent unit is (animal, culture, experiment) and compute n from it `declare-experimental-unit` | 14 | 5.1% | 1.9% | partial |
| 2 | Show every data point by default instead of a bar of the mean `show-every-point` | 10 | 3.6% | 1.9% | done |
| 3 | Nested t test, nested ANOVA or a mixed model with animal, litter or culture as a random effect, without code `nested-mixed-models` | 10 | 3.6% | 2.0% | partial |
| 4 | Capture randomisation, blinding, exclusions, sample-size rationale and subject details, and print them in methods `design-reporting-capture` | 10 | 3.6% | 0.6% | partial |
| 5 | Exact P values everywhere, formatted to my journal's style `exact-p` | 7 | 2.6% | 1.0% | done |
| 6 | Check the linear range and saturation before quantifying bands `wb-linear-range` | 7 | 2.6% | 0.4% | missing |
| 7 | Colour-blind-safe palettes by default and a preview of how the figure looks with CVD `colour-blind-safe` | 6 | 2.2% | 0.6% | done |
| 8 | Draft the figure legend from the graph: what is plotted, error bars, n and test `figure-legend` | 6 | 2.2% | 0.6% | done |
| 9 | Warn me when my n is cells, wells or repeated reads rather than independent units `pseudoreplication-warning` | 6 | 2.2% | 0.7% | done |
| 10 | Gating hierarchy, compensation and FCS provenance kept with the statistics `flow-gating-provenance` | 6 | 2.2% | 0.4% | missing |

Most distinctive (needs with at least 3 observations here, by over-representation against the whole corpus): `blinding-mode` (5, ×6.7), `design-reporting-capture` (10, ×6.1), `wb-linear-range` (7, ×5.9), `batch-confounding` (3, ×5.7), `flow-gating-provenance` (6, ×5.0).

## Competitor trackers (`raw/competitor-signals.json`, 233 observations)

Other tools' backlogs. Trackers of BarelySig, JASP and jamovi converge on the same features: significance brackets, journal export, summary-data entry, plot editing, nested data, plain-language output. They show what the market treats as table stakes. 233 observations; 15% block the analysis, 24% risk a wrong result, 47% slow the work, 14% are cosmetic. Most frequent: Significance brackets drawn from the analysis I ran, stacked automatically, on any graph (10); A free tool I can use legally, without licences, trials or seat limits (9); Export at the journal's size and DPI with the fonts at the right point size (8).

| # | Need | In this venue | Share of venue | Corpus share | Status |
|---:|---|---:|---:|---:|---|
| 1 | Significance brackets drawn from the analysis I ran, stacked automatically, on any graph `brackets-from-analysis` | 10 | 4.3% | 2.0% | done |
| 2 | A free tool I can use legally, without licences, trials or seat limits `free-access` | 9 | 3.9% | 2.7% | done |
| 3 | Export at the journal's size and DPI with the fonts at the right point size `journal-export-presets` | 8 | 3.4% | 0.6% | done |
| 4 | Nested t test, nested ANOVA or a mixed model with animal, litter or culture as a random effect, without code `nested-mixed-models` | 7 | 3.0% | 2.0% | partial |
| 5 | Choose SD, SEM or CI by purpose, with SD (or the points) by default `error-bar-choice` | 7 | 3.0% | 1.3% | done |
| 6 | Show every data point by default instead of a bar of the mean `show-every-point` | 6 | 2.6% | 1.9% | done |
| 7 | Paste from Excel exactly: blanks stay missing, decimals and IDs are never mangled `excel-paste-fidelity` | 5 | 2.1% | 1.2% | partial |
| 8 | Enter mean, SD (or SEM) and n and still get tests and error bars `summary-data-input` | 5 | 2.1% | 0.5% | done |
| 9 | Explain each result in plain words: what it means and how it is often misread `plain-language-results` | 5 | 2.1% | 0.5% | partial |
| 10 | Fit a dose-response curve and get the IC50 without Excel Solver, macros or code `ic50-no-code-fit` | 5 | 2.1% | 1.6% | done |

Most distinctive (needs with at least 3 observations here, by over-representation against the whole corpus): `journal-export-presets` (8, ×5.5), `graph-direct-editing` (3, ×4.7), `summary-data-input` (5, ×4.6), `plain-language-results` (5, ×4.6), `linked-live-results` (3, ×4.3).

## Software reviews (`raw/reviews.json`, 188 observations)

The buyers' venue. Reviews judge ease of use, price, stability and the look of the default graphs; almost none mention a wrong result. They ask for tutorials, templates, instrument import and guided assay workflows. 188 observations; 16% block the analysis, 7% risk a wrong result, 46% slow the work, 30% are cosmetic. Most frequent: A free tool I can use legally, without licences, trials or seat limits (19); A point-and-click tool as quick as Excel, with no coding and a short learning curve (17); Publication-ready graphs by default, without fighting the software (10).

| # | Need | In this venue | Share of venue | Corpus share | Status |
|---:|---|---:|---:|---:|---|
| 1 | A free tool I can use legally, without licences, trials or seat limits `free-access` | 19 | 10.1% | 2.7% | done |
| 2 | A point-and-click tool as quick as Excel, with no coding and a short learning curve `no-code-approachable` | 17 | 9.0% | 1.7% | done |
| 3 | Publication-ready graphs by default, without fighting the software `publication-defaults` | 10 | 5.3% | 0.7% | done |
| 4 | Stay fast with tens of thousands of rows and points `large-data` | 9 | 4.8% | 1.2% | partial |
| 5 | Runs on any computer (Mac, Windows, Linux, tablet), with no install, even offline `runs-anywhere` | 8 | 4.3% | 1.1% | done |
| 6 | From band intensities to normalised fold change and statistics in one place `wb-densitometry-workflow` | 8 | 4.3% | 1.3% | done |
| 7 | Import instrument exports directly (plate readers, qPCR, LabChart, Incucyte) `instrument-import` | 7 | 3.7% | 0.5% | partial |
| 8 | Worked examples and tutorials inside the tool `examples-tutorials` | 7 | 3.7% | 0.4% | done |
| 9 | Start from my goal ('I want an IC50') and be walked through the assay `guided-assay-workflows` | 6 | 3.2% | 0.4% | done |
| 10 | Stable software that autosaves and never loses work `stable-autosave` | 6 | 3.2% | 0.4% | done |

Most distinctive (needs with at least 3 observations here, by over-representation against the whole corpus): `examples-tutorials` (7, ×9.1), `guided-assay-workflows` (6, ×9.0), `stable-autosave` (6, ×8.4), `publication-defaults` (10, ×7.5), `instrument-import` (7, ×7.2).

## Statistics-consulting FAQs (`raw/consulting-faqs.json`, 183 observations)

What biologists ask statisticians. Power and sample size lead, followed by the experimental unit, nested data, test choice and assumption checks; the answers favour design-stage planning and honest wording of non-significant results. 183 observations; 10% block the analysis, 55% risk a wrong result, 29% slow the work, 5% are cosmetic. Most frequent: Work out how many animals or replicates I need, with a justification sentence (15); Ask what the independent unit is (animal, culture, experiment) and compute n from it (8); Nested t test, nested ANOVA or a mixed model with animal, litter or culture as a random effect, without code (7).

| # | Need | In this venue | Share of venue | Corpus share | Status |
|---:|---|---:|---:|---:|---|
| 1 | Work out how many animals or replicates I need, with a justification sentence `power-sample-size` | 15 | 8.2% | 1.6% | done |
| 2 | Ask what the independent unit is (animal, culture, experiment) and compute n from it `declare-experimental-unit` | 8 | 4.4% | 1.9% | partial |
| 3 | Nested t test, nested ANOVA or a mixed model with animal, litter or culture as a random effect, without code `nested-mixed-models` | 7 | 3.8% | 2.0% | partial |
| 4 | Tell me which test fits my design before I run anything `design-first-test-chooser` | 7 | 3.8% | 1.4% | done |
| 5 | Check assumptions sensibly: residual QQ plots, not a normality-test P that gates the test `assumption-checks-residuals` | 7 | 3.8% | 1.0% | partial |
| 6 | Check my design before the experiment: controls, replicates, units `design-stage-checks` | 6 | 3.3% | 0.4% | partial |
| 7 | Word non-significant results honestly (inconclusive, with the CI), never 'trend' `nonsig-wording` | 5 | 2.7% | 0.4% | partial |
| 8 | Analyse ratios and skewed positive data on the log scale and report back-transformed fold changes `log-scale-analysis` | 4 | 2.2% | 1.2% | partial |
| 9 | Name the exact test variant: paired or not, Welch, tails, exact or approximate `test-variant-named` | 4 | 2.2% | 1.0% | done |
| 10 | Explanations at the point of choice, tied to my data `in-context-explainers` | 4 | 2.2% | 0.6% | done |

Most distinctive (needs with at least 3 observations here, by over-representation against the whole corpus): `flow-event-counts` (3, ×15.0), `summary-matches-test` (3, ×8.6), `power-complex-designs` (3, ×8.6), `design-stage-checks` (6, ×8.6), `nonsig-wording` (5, ×6.7).

## Lab blogs (`raw/blogs.json`, 171 observations)

Practitioners writing for peers: price and coding fears, show-the-points campaigns, and the case for linked, reproducible analysis (raw data to figure without copy-paste). 171 observations; 9% block the analysis, 36% risk a wrong result, 47% slow the work, 8% are cosmetic. Most frequent: A free tool I can use legally, without licences, trials or seat limits (10); A point-and-click tool as quick as Excel, with no coding and a short learning curve (10); Show every data point by default instead of a bar of the mean (8).

| # | Need | In this venue | Share of venue | Corpus share | Status |
|---:|---|---:|---:|---:|---|
| 1 | A free tool I can use legally, without licences, trials or seat limits `free-access` | 10 | 5.8% | 2.7% | done |
| 2 | A point-and-click tool as quick as Excel, with no coding and a short learning curve `no-code-approachable` | 10 | 5.8% | 1.7% | done |
| 3 | Show every data point by default instead of a bar of the mean `show-every-point` | 8 | 4.7% | 1.9% | done |
| 4 | Record every point-and-click step as a re-runnable recipe or script `analysis-replay` | 6 | 3.5% | 0.9% | partial |
| 5 | Import per-cell and per-image tables (Fiji, CellProfiler, QuPath), many files at once, condition from file names `image-table-import` | 5 | 2.9% | 0.7% | partial |
| 6 | Paste from Excel exactly: blanks stay missing, decimals and IDs are never mangled `excel-paste-fidelity` | 5 | 2.9% | 1.2% | partial |
| 7 | Tell me which test fits my design before I run anything `design-first-test-chooser` | 5 | 2.9% | 1.4% | done |
| 8 | Data, results and figures stay linked and update together `linked-live-results` | 4 | 2.3% | 0.3% | done |
| 9 | Explanations at the point of choice, tied to my data `in-context-explainers` | 4 | 2.3% | 0.6% | done |
| 10 | Assemble multi-panel figures with panel letters, shared axes and one font size `multi-panel-layout` | 4 | 2.3% | 1.1% | done |

Most distinctive (needs with at least 3 observations here, by over-representation against the whole corpus): `show-intermediate-values` (3, ×10.7), `linked-live-results` (4, ×7.8), `wb-linear-range` (4, ×5.4), `templates-new-data` (3, ×4.3), `analysis-replay` (6, ×4.0).

## Journal requirements (`raw/journal-requirements.json`, 160 observations)

What journals demand. Every item is a reporting obligation: design facts (randomisation, blinding, exclusions), figure legends with n and error-bar type, source data, software versions and statistics tables. Their distinctive needs are exports, not analyses. 160 observations; 14% block the analysis, 52% risk a wrong result, 29% slow the work, 5% are cosmetic. Most frequent: Capture randomisation, blinding, exclusions, sample-size rationale and subject details, and print them in methods (10); Draft the figure legend from the graph: what is plotted, error bars, n and test (9); Ask what the independent unit is (animal, culture, experiment) and compute n from it (8).

| # | Need | In this venue | Share of venue | Corpus share | Status |
|---:|---|---:|---:|---:|---|
| 1 | Capture randomisation, blinding, exclusions, sample-size rationale and subject details, and print them in methods `design-reporting-capture` | 10 | 6.2% | 0.6% | partial |
| 2 | Draft the figure legend from the graph: what is plotted, error bars, n and test `figure-legend` | 9 | 5.6% | 0.6% | done |
| 3 | Ask what the independent unit is (animal, culture, experiment) and compute n from it `declare-experimental-unit` | 8 | 5.0% | 1.9% | partial |
| 4 | From band intensities to normalised fold change and statistics in one place `wb-densitometry-workflow` | 8 | 5.0% | 1.3% | done |
| 5 | Exclusions need a reason, stay visible and are reported (n enrolled vs analysed) `exclusion-log` | 8 | 5.0% | 0.8% | partial |
| 6 | Export the numbers behind each figure panel as source data `source-data-export` | 7 | 4.4% | 0.4% | partial |
| 7 | Print the exact n per group (after exclusions and missing values) with its unit `n-in-output` | 6 | 3.8% | 0.5% | done |
| 8 | Cite the software and its version in every export `software-citation` | 5 | 3.1% | 0.2% | done |
| 9 | Work out how many animals or replicates I need, with a justification sentence `power-sample-size` | 5 | 3.1% | 1.6% | done |
| 10 | One statistics table for every test in the project (figure panel, test, n, statistic, df, exact P, CI) `stats-table-export` | 5 | 3.1% | 0.2% | partial |

Most distinctive (needs with at least 3 observations here, by over-representation against the whole corpus): `stats-table-export` (5, ×16.4), `software-citation` (5, ×12.7), `source-data-export` (7, ×12.3), `design-reporting-capture` (10, ×10.4), `figure-legend` (9, ×9.0).

## Forums (image.sc, Bioconductor, Galaxy) (`raw/forums.json`, 153 observations)

Image analysts and bioinformaticians at the hand-off to statistics: normalising image measurements, importing per-cell tables, deciding what n is when one well yields thousands of cells. 153 observations; 29% block the analysis, 44% risk a wrong result, 25% slow the work, 3% are cosmetic. Most frequent: Normalise to % or fold of control in one step that feeds the analyses (12); Import per-cell and per-image tables (Fiji, CellProfiler, QuPath), many files at once, condition from file names (8); Ask what the independent unit is (animal, culture, experiment) and compute n from it (6).

| # | Need | In this venue | Share of venue | Corpus share | Status |
|---:|---|---:|---:|---:|---|
| 1 | Normalise to % or fold of control in one step that feeds the analyses `normalise-step` | 12 | 7.8% | 1.3% | done |
| 2 | Import per-cell and per-image tables (Fiji, CellProfiler, QuPath), many files at once, condition from file names `image-table-import` | 8 | 5.2% | 0.7% | partial |
| 3 | Ask what the independent unit is (animal, culture, experiment) and compute n from it `declare-experimental-unit` | 6 | 3.9% | 1.9% | partial |
| 4 | Tell me what n = 1–3 can and cannot show, and refuse P values when there is one independent value `small-n-honesty` | 5 | 3.3% | 1.2% | partial |
| 5 | From band intensities to normalised fold change and statistics in one place `wb-densitometry-workflow` | 5 | 3.3% | 1.3% | done |
| 6 | Analyse ratios and skewed positive data on the log scale and report back-transformed fold changes `log-scale-analysis` | 5 | 3.3% | 1.2% | partial |
| 7 | Average technical replicates to one value per biological unit before testing `collapse-technical-replicates` | 4 | 2.6% | 0.7% | done |
| 8 | Warn me when my n is cells, wells or repeated reads rather than independent units `pseudoreplication-warning` | 4 | 2.6% | 0.7% | done |
| 9 | Explain why my number differs from Prism, R, SPSS or Excel `numbers-differ-explained` | 4 | 2.6% | 0.7% | done |
| 10 | Volcano plots and clustered heat maps from my results tables `volcano-heatmap` | 4 | 2.6% | 0.7% | done |

Most distinctive (needs with at least 3 observations here, by over-representation against the whole corpus): `correlation-scatter` (3, ×8.0), `image-table-import` (8, ×7.1), `normalise-step` (12, ×6.3), `method-comparison` (3, ×4.5), `volcano-heatmap` (4, ×4.0).

## Courses and workshops (`raw/courses.json`, 151 observations)

What courses teach and where they stop: test choice, power, contingency tables, showing points, methods text and how to trust a result. 151 observations; 3% block the analysis, 37% risk a wrong result, 56% slow the work, 5% are cosmetic. Most frequent: Work out how many animals or replicates I need, with a justification sentence (7); Show every data point by default instead of a bar of the mean (6); A free tool I can use legally, without licences, trials or seat limits (6).

| # | Need | In this venue | Share of venue | Corpus share | Status |
|---:|---|---:|---:|---:|---|
| 1 | Work out how many animals or replicates I need, with a justification sentence `power-sample-size` | 7 | 4.6% | 1.6% | done |
| 2 | Show every data point by default instead of a bar of the mean `show-every-point` | 6 | 4.0% | 1.9% | done |
| 3 | A free tool I can use legally, without licences, trials or seat limits `free-access` | 6 | 4.0% | 2.7% | done |
| 4 | Tell me which test fits my design before I run anything `design-first-test-chooser` | 5 | 3.3% | 1.4% | done |
| 5 | Fisher, chi-square and McNemar tests with odds ratios and the right test for small counts `contingency-tests` | 5 | 3.3% | 0.5% | done |
| 6 | Generate the methods / statistical-analysis paragraph from what I actually ran `methods-text` | 4 | 2.6% | 0.7% | done |
| 7 | Show me the tool is validated against reference software so I can trust the numbers `validated-results` | 4 | 2.6% | 0.6% | done |
| 8 | Ask whether the same subjects were measured repeatedly and choose a paired or repeated-measures analysis `repeated-measures-detection` | 3 | 2.0% | 1.1% | done |
| 9 | Exclusions need a reason, stay visible and are reported (n enrolled vs analysed) `exclusion-log` | 3 | 2.0% | 0.8% | partial |
| 10 | Check assumptions sensibly: residual QQ plots, not a normality-test P that gates the test `assumption-checks-residuals` | 3 | 2.0% | 1.0% | partial |

Most distinctive (needs with at least 3 observations here, by over-representation against the whole corpus): `contingency-tests` (5, ×6.4), `validated-results` (4, ×4.2), `methods-text` (4, ×4.0), `graph-style-reuse` (3, ×3.8), `two-factor-recognition` (3, ×3.3).

## Non-English communities (`raw/non-english.json`, 126 observations)

The same statistical questions as the English venues, plus interface language and legal access; compact letter displays and potency summaries recur (see finding 10 in CATALOGUE.md). 126 observations; 27% block the analysis, 29% risk a wrong result, 39% slow the work, 6% are cosmetic. Most frequent: Interface and help in my language (7); A free tool I can use legally, without licences, trials or seat limits (7); Compact letter display (a, b, c) from post hoc results on tables and graphs (4).

| # | Need | In this venue | Share of venue | Corpus share | Status |
|---:|---|---:|---:|---:|---|
| 1 | Interface and help in my language `localised-ui` | 7 | 5.6% | 0.3% | missing |
| 2 | A free tool I can use legally, without licences, trials or seat limits `free-access` | 7 | 5.6% | 2.7% | done |
| 3 | Compact letter display (a, b, c) from post hoc results on tables and graphs `compact-letter-display` | 4 | 3.2% | 0.4% | done |
| 4 | Average technical replicates to one value per biological unit before testing `collapse-technical-replicates` | 3 | 2.4% | 0.7% | done |
| 5 | Normalise to % or fold of control in one step that feeds the analyses `normalise-step` | 3 | 2.4% | 1.3% | done |
| 6 | Run qPCR statistics on ΔCt and back-transform fold changes with asymmetric error bars `qpcr-stats-log-scale` | 3 | 2.4% | 0.6% | done |
| 7 | Summarise IC50 across independent experiments (mean log IC50 with CI, n = experiments) `potency-across-experiments` | 3 | 2.4% | 0.2% | partial |
| 8 | Vector export (SVG, PDF) that opens editable in Illustrator or Inkscape `vector-export` | 3 | 2.4% | 1.1% | done |
| 9 | A route for non-normal two-factor or repeated designs (aligned rank transform, permutation, transform) `nonparam-factorial` | 3 | 2.4% | 0.2% | missing |
| 10 | Explain why ANOVA is significant but no pair is (or the reverse) `omnibus-posthoc-disagree` | 3 | 2.4% | 0.3% | done |

Most distinctive (needs with at least 3 observations here, by over-representation against the whole corpus): `localised-ui` (7, ×20.4), `nonparam-factorial` (3, ×10.9), `potency-across-experiments` (3, ×9.7), `compact-letter-display` (4, ×7.3), `omnibus-posthoc-disagree` (3, ×7.3).

## Hacker News (`raw/hackernews.json`, 101 observations)

Engineers and scientists discussing tools in general: the spreadsheet-versus-code divide, Excel mangling identifiers, analysis plans and forking paths, validation and sharing. 101 observations; 5% block the analysis, 47% risk a wrong result, 40% slow the work, 9% are cosmetic. Most frequent: A point-and-click tool as quick as Excel, with no coding and a short learning curve (15); Paste from Excel exactly: blanks stay missing, decimals and IDs are never mangled (7); Publication-ready graphs by default, without fighting the software (4).

| # | Need | In this venue | Share of venue | Corpus share | Status |
|---:|---|---:|---:|---:|---|
| 1 | A point-and-click tool as quick as Excel, with no coding and a short learning curve `no-code-approachable` | 15 | 14.9% | 1.7% | done |
| 2 | Paste from Excel exactly: blanks stay missing, decimals and IDs are never mangled `excel-paste-fidelity` | 7 | 6.9% | 1.2% | partial |
| 3 | Publication-ready graphs by default, without fighting the software `publication-defaults` | 4 | 4.0% | 0.7% | done |
| 4 | Fix the analysis plan before seeing the data and log every later change `preregistration-plan` | 4 | 4.0% | 0.5% | missing |
| 5 | Share a project with people who don't have the software `share-with-collaborators` | 4 | 4.0% | 0.7% | done |
| 6 | Show me the tool is validated against reference software so I can trust the numbers `validated-results` | 4 | 4.0% | 0.6% | done |
| 7 | A free tool I can use legally, without licences, trials or seat limits `free-access` | 3 | 3.0% | 2.7% | done |
| 8 | Record every point-and-click step as a re-runnable recipe or script `analysis-replay` | 3 | 3.0% | 0.9% | partial |
| 9 | Apply the same analysis to many files or subsets at once `batch-many-datasets` | 3 | 3.0% | 0.4% | partial |
| 10 | Stay fast with tens of thousands of rows and points `large-data` | 3 | 3.0% | 1.2% | partial |

Most distinctive (needs with at least 3 observations here, by over-representation against the whole corpus): `no-code-approachable` (15, ×8.9), `preregistration-plan` (4, ×8.5), `batch-many-datasets` (3, ×7.3), `validated-results` (4, ×6.3), `share-with-collaborators` (4, ×6.0).

## Mastodon / fediverse (`raw/social.json`, 41 observations)

A small sample of fediverse posts by bench scientists: opening Prism files without a licence, instrument formats, plain-language output and image provenance. 41 observations; 12% block the analysis, 44% risk a wrong result, 39% slow the work, 5% are cosmetic. Most frequent: Open my Prism files without a licence, and send work back to Prism users (2); Runs on any computer (Mac, Windows, Linux, tablet), with no install, even offline (2); Import instrument exports directly (plate readers, qPCR, LabChart, Incucyte) (2).

| # | Need | In this venue | Share of venue | Corpus share | Status |
|---:|---|---:|---:|---:|---|
| 1 | Open my Prism files without a licence, and send work back to Prism users `prism-files` | 2 | 4.9% | 0.4% | done |
| 2 | Runs on any computer (Mac, Windows, Linux, tablet), with no install, even offline `runs-anywhere` | 2 | 4.9% | 1.1% | done |
| 3 | Import instrument exports directly (plate readers, qPCR, LabChart, Incucyte) `instrument-import` | 2 | 4.9% | 0.5% | partial |
| 4 | Explain each result in plain words: what it means and how it is often misread `plain-language-results` | 2 | 4.9% | 0.5% | partial |
| 5 | Stay fast with tens of thousands of rows and points `large-data` | 2 | 4.9% | 1.2% | partial |
| 6 | Keep the raw, uncropped image and every adjustment linked to the numbers `raw-image-provenance` | 2 | 4.9% | 0.3% | missing |
| 7 | An open, documented project format that every version opens and never corrupts `open-file-format` | 1 | 2.4% | 0.9% | done |
| 8 | Help me pick the table layout from my experiment, and let me change it later without losing data `table-layout-chooser` | 1 | 2.4% | 0.7% | partial |
| 9 | A free tool I can use legally, without licences, trials or seat limits `free-access` | 1 | 2.4% | 2.7% | done |
| 10 | Tell me which test fits my design before I run anything `design-first-test-chooser` | 1 | 2.4% | 1.4% | done |
