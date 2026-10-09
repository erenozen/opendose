# Improvement plan from the user-needs catalogue (2026-10-09)

Improvements are the needs that OpenDose meets only in part or not at all, plus the needs it meets but where users would not find the feature (*make discoverable*). Of 92 such items, the 40 with the highest priority score (see CATALOGUE.md › How needs are ranked) are listed here in four waves: 22 quick wins (effort S), 15 medium builds (M), 2 large builds (L) and 1 research-first item. 5 of the 40 are already built and only need to be made discoverable. Within each wave the order is the score. Effort: S = days, M = one to two weeks, L = more. Proposals that change screens belong in the UI/UX pass planned with Eren rather than being done piecemeal. Each item names its need id (evidence in CATALOGUE.md and needs.json) and an acceptance test written as what a user would see.

## Wave 1: quick wins (effort S)

### 1. Tell me which test fits my design before I run anything

`design-first-test-chooser` · score 100.0 (need rank 1 of 178) · 51 observations, 14 venues · status: done · effort S

- **Already done: make it discoverable.** Offer "Which test?" inline in the Analyze dialog (a 'Help me choose' first entry, pre-filled from the table) and phrase its pairing question with the user's own first row ('Is A1 the same animal as B1?').
- Already there: README › Guidance: 'A "Which test?" wizard that asks about the design, runs the data checks it can and opens the recommended analysis pre-configured' (web/src/guide/recommend.ts).
- Acceptance test: A user who opens Analyze on a two-column table sees 'Help me choose' first, answers three questions about their own rows, and lands on the pre-configured test with a one-paragraph reason.

### 2. Tell me what n = 1–3 can and cannot show, and refuse P values when there is one independent value

`small-n-honesty` · score 99.0 (need rank 2 of 178) · 45 observations, 14 venues · status: partial · effort S

- When any group has fewer than two independent values, withhold P and show descriptive results labelled exploratory; at n = 2–3 add a chip with the detectable effect (from the power engine) and the t-based CI width.
- Gap today: No hard stop or 'exploratory' label at n = 1 per group; no note of what effect the current n could detect.
- Acceptance test: A user who runs a t test with one pooled sample per group sees no P value but a message that one value per group allows description only, with what replication would be needed.

### 4. Ask what the independent unit is (animal, culture, experiment) and compute n from it

`declare-experimental-unit` · score 91.0 (need rank 4 of 178) · 69 observations, 11 venues · status: partial · effort S

- Ask 'What does each value represent?' (independent experiment / animal / technical repeat / cell) when a table is created or pasted, and extend replicate assignment to XY tables and grouped cells.
- Gap today: Not asked at table creation; XY tables and grouped cells cannot be assigned (ROADMAP Open items, Theme 2).
- Acceptance test: A user who pastes triplicate wells from three experiments is asked what each column is before any P value, and the legend then reads 'n = 3 independent experiments (9 wells)'.

### 5. Paste from Excel exactly: blanks stay missing, decimals and IDs are never mangled

`excel-paste-fidelity` · score 81.8 (need rank 7 of 178) · 45 observations, 9 venues · status: partial · effort S

- After every paste or import, show a one-line report ('412 numbers, 3 blanks kept as missing, 2 text cells in numeric columns: B7, C12') and keep text columns as text.
- Gap today: No paste report of cells read as missing or text, and no stated guarantee that identifiers are never converted.
- Acceptance test: A user pastes a sheet with '#DIV/0!' and empty cells and is told exactly which cells became missing, with nothing read as 0.

### 6. Check assumptions sensibly: residual QQ plots, not a normality-test P that gates the test

`assumption-checks-residuals` · score 81.5 (need rank 8 of 178) · 38 observations, 12 venues · status: partial · effort S

- Add a 'Residuals' tab to t-test and ANOVA results with a QQ plot and residual-vs-fitted plot, and word the normality chip as advice that depends on n.
- Gap today: No residual QQ or residual-vs-fitted plot on t-test and ANOVA results.
- Acceptance test: A user who runs one-way ANOVA opens 'Residuals' and sees a QQ plot with a sentence on what it shows, rather than only a Shapiro-Wilk P.

### 8. Work out how many animals or replicates I need, with a justification sentence

`power-sample-size` · score 72.8 (need rank 14 of 178) · 58 observations, 10 venues · status: done · effort S

- **Already done: make it discoverable.** Offer 'Plan the next experiment' from any results sheet, pre-filled with this data's SD and effect.
- Already there: README › Clinical statistics: power and sample size for t tests, ANOVA, proportions, McNemar, chi-square, correlation and log-rank, power curves and an ARRIVE-style justification sentence.
- Acceptance test: A user looking at a pilot t test clicks 'Plan next experiment' and gets n per group for 80% power with the pilot SD filled in and a justification sentence.

### 9. Treat each independent experiment (day, plate, run) as a block instead of pooling or normalising it away

`experiment-as-block` · score 67.7 (need rank 19 of 178) · 35 observations, 8 venues · status: partial · effort S

- Ask 'Was each condition run once per experiment, on different days?' and, if yes, open the matched analysis (RM ANOVA / paired) with experiment as the block, and show the experiment-to-experiment variance it removed.
- Gap today: No explicit 'experiment' factor in the wizard; no randomised-block two-way ANOVA with experiment as a factor from a column table.
- Acceptance test: A user who ran control, A and B once on each of four days gets a matched (blocked) analysis by day, with the note 'day-to-day differences removed', rather than an ordinary one-way ANOVA.

### 11. Exclusions need a reason, stay visible and are reported (n enrolled vs analysed)

`exclusion-log` · score 64.1 (need rank 26 of 178) · 29 observations, 10 venues · status: partial · effort S

- Ask for a reason when values are excluded, list exclusions per group in results and methods, and offer a one-click 'results with excluded values included'.
- Gap today: No reason per excluded value, no 'with/without' comparison, no enrolled-vs-analysed count.
- Acceptance test: A user excludes one mouse with reason 'tumour ulceration'; the methods and legend state 'n = 8 enrolled, 7 analysed (1 excluded: ulceration)'.

### 13. Enter survival data simply (dates, deaths per day, event yes/no) and preview how each row is read

`survival-data-entry` · score 61.7 (need rank 31 of 178) · 21 observations, 10 venues · status: partial · effort S

- Add 'From counts per day' and 'From dates' to the survival table (expand to per-subject rows) and a preview column 'read as: death on day 12 / censored on day 30'.
- Gap today: Counts-alive-per-day and date-based entry; a preview of events vs censored rows.
- Acceptance test: A user who has 'alive mice per day' per group pastes that table and gets correct per-mouse survival data with a preview, without retyping.

### 15. Flag IC50s outside the tested range or from undefined plateaus, and report them as '> top dose'

`incomplete-curve-flags` · score 60.8 (need rank 33 of 178) · 20 observations, 9 venues · status: partial · effort S

- Offer 'Report as > highest dose' for extrapolated IC50s, carried into the results table, the results sentence and any ratio, with the reason.
- Gap today: The extrapolated value is still reported as a number; tables, sentences and ratios do not carry it as '> highest dose'.
- Acceptance test: A user whose curve never reaches 50% sees 'IC50 > 30 µM (not reached in the range tested)' in the table and the sentence, not '412 µM'.

### 16. Help me pick the table layout from my experiment, and let me change it later without losing data

`table-layout-chooser` · score 58.5 (need rank 37 of 178) · 24 observations, 11 venues · status: partial · effort S

- Add 'Convert table to…' (column ↔ grouped ↔ multiple variables, stacked ↔ side by side) and a question-first entry on the start screen that picks the table from the design answers.
- Gap today: Changing table type after entry, and question-first entry ('I measured the same mice at 4 times') are missing.
- Acceptance test: A user who entered paired data in a column table converts it to a grouped table in one step, keeping every value and the pairing.

### 20. Say whether each P is adjusted, by which method, and show the unadjusted value beside it

`adjusted-vs-raw-labelled` · score 56.2 (need rank 43 of 178) · 26 observations, 9 venues · status: partial · effort S

- Add 'unadjusted P' and 'family size' columns to every comparisons table and name the correction in its header and in the legend.
- Gap today: Unadjusted P and the family size are not shown next to each adjusted P.
- Acceptance test: A user reading a Tukey table sees adjusted and unadjusted P side by side and a header saying 'adjusted for 6 comparisons (Tukey)'.

### 21. Dunn's (or Conover) after Kruskal-Wallis or Friedman, including each vs control only

`nonparametric-posthoc` · score 56.0 (need rank 44 of 178) · 29 observations, 8 venues · status: partial · effort S

- Add the control-only family to Dunn's (k−1 comparisons) and offer it when a control column is marked.
- Gap today: Dunn's always corrects for every pair; no vs-control family.
- Acceptance test: A user with four groups and one control picks 'each vs control' after Kruskal-Wallis and gets three Dunn's comparisons corrected for three.

### 22. Hazard ratios with CIs and Cox regression with covariates

`hazard-ratio-cox` · score 55.4 (need rank 46 of 178) · 31 observations, 8 venues · status: done · effort S

- **Already done: make it discoverable.** Fix the stale wizard text and link the Cox analysis from the survival results and the wizard.
- Already there: README › Clinical statistics: Cox proportional-hazards regression (hazard ratios, PH test, forest plot, Schoenfeld residuals); sheets README: covariates on survival tables.
- Acceptance test: A user whose survival wizard result lists Cox regression clicks it and lands in the Cox analysis on the same table.

### 24. Correct for multiple comparisons by default and notice when I run many separate t tests

`multiplicity-by-default` · score 54.3 (need rank 49 of 178) · 21 observations, 10 venues · status: partial · effort S

- Count the comparisons run on each table; after the third t test show a chip 'k tests on this table: consider one-way ANOVA with Dunnett, or Holm across them' with one click to either.
- Gap today: No project-level count of tests on the same data; no nudge when a user runs t test after t test.
- Acceptance test: A user who runs three t tests against the same control on one table sees a note offering Dunnett's test, with the familywise error of what they did.

### 25. Show me the tool is validated against reference software so I can trust the numbers

`validated-results` · score 53.5 (need rank 52 of 178) · 23 observations, 8 venues · status: done · effort S

- **Already done: make it discoverable.** Link each results sheet to the validation entries for that analysis ('checked against R and 3 published examples').
- Already there: README › Sharing, export and trust: '"How OpenDose is validated": every pinned cross-check (Prism screenshots, NIST, statistics-guide examples, published tables, statsmodels, pingouin, R) with both values and the source'.
- Acceptance test: A user doubting a Dunnett P clicks 'How this is validated' on the results and sees the pinned comparisons with R and published values.

### 26. Reopened analyses give the same numbers, and I am told if a version changed them

`stable-results-versions` · score 50.8 (need rank 56 of 178) · 26 observations, 6 venues · status: partial · effort S

- Store key results in the project; on reopen with a newer engine, recompute and list any number that changed beyond rounding.
- Gap today: Nothing compares stored results with recomputed ones when an older project is reopened.
- Acceptance test: A user reopens last year's project and sees 'all 48 results reproduced' or a list of the two that changed and why.

### 29. Open my Prism files without a licence, and send work back to Prism users

`prism-files` · score 46.1 (need rank 69 of 178) · 14 observations, 7 venues · status: done · effort S

- **Already done: make it discoverable.** Say on the start screen that .prism/.pzfx files open here, and add batch import of a folder of Prism files to CSV.
- Already there: README › Data tables: '.prism and .pzfx files (one or all tables)'; README › Sharing: '.pzfx export of XY, column, grouped, contingency and survival tables'.
- Acceptance test: A user whose licence expired drags a .prism file onto the start screen and sees every data table, with a note that analyses are recomputed.

### 30. Median survival with CI, explained when 'not reached', and survival at a chosen time

`median-survival-explained` · score 44.7 (need rank 71 of 178) · 16 observations, 8 venues · status: partial · effort S

- Explain 'median not reached' in the results, warn when few events drive the test, and add survival at a chosen time and RMST difference with CIs.
- Gap today: 'Undefined' medians are unexplained; no RMST; no events-count warning.
- Acceptance test: A user whose treated group never drops below 50% reads 'median not reached: more than half survived to day 60' instead of a blank.

### 32. Never silently drop data or compute a wrong result; show warnings next to the output

`fail-loudly` · score 42.8 (need rank 74 of 178) · 15 observations, 6 venues · status: partial · effort S

- Route every engine warning and every dropped value to a 'Notes' strip on the results sheet, and test that none is swallowed.
- Gap today: Engine warnings and dropped values are not guaranteed to be shown.
- Acceptance test: A user whose data contain a text cell in a numeric column sees a note on the result saying the cell was skipped, never a silent change in n.

### 39. Handle unequal n and missing values, and tell me what was dropped

`missing-values-handling` · score 37.0 (need rank 92 of 178) · 10 observations, 6 venues · status: partial · effort S

- Add an 'Analysed' line to every result: n used per group and which rows or pairs were left out and why.
- Gap today: No 'n analysed / rows dropped' line in results, e.g. incomplete pairs in a paired test.
- Acceptance test: A user runs a paired t test with two incomplete pairs and reads 'n = 10 pairs analysed; 2 incomplete pairs (rows 4, 9) left out'.

### 40. Pairwise log-rank comparisons with multiplicity correction, and a trend test

`pairwise-logrank` · score 36.8 (need rank 94 of 178) · 16 observations, 5 venues · status: partial · effort S

- Add a pairwise log-rank table (all pairs or vs control) with Bonferroni/Holm-Šídák adjusted P and the log-rank test for trend for ordered groups.
- Gap today: Users must correct pairwise log-rank P values by hand.
- Acceptance test: A user with four survival groups gets a table of pairwise log-rank P values already adjusted (Holm-Šídák), and a trend P when groups are doses.

## Wave 2: medium builds (effort M)

### 7. Analyse ratios and skewed positive data on the log scale and report back-transformed fold changes

`log-scale-analysis` · score 78.0 (need rank 11 of 178) · 45 observations, 11 venues · status: partial · effort M

- Add 'Analyse log(values)' to unpaired t tests and ANOVA, reporting geometric-mean ratios with CIs, and a chip that suggests it when SDs rise with means.
- Gap today: No 'analyse on log scale' switch for unpaired t tests and ANOVA; no chip when SD grows with the mean.
- Acceptance test: A user comparing cytokine concentrations sees a chip 'SD grows with the mean: analyse on log scale?' and, after one click, a ratio of geometric means with a 95% CI.

### 10. Stay fast with tens of thousands of rows and points

`large-data` · score 66.1 (need rank 21 of 178) · 43 observations, 11 venues · status: partial · effort M

- Document and test limits (rows, points per graph), virtualise the grid, and switch dense scatters to WebGL above a threshold.
- Gap today: No documented limits; grid and graph performance with 10⁵ rows not stated.
- Acceptance test: A user pastes 100,000 per-cell rows; the grid scrolls smoothly, the graph draws within seconds, and the documented limit is stated.

### 12. Record every point-and-click step as a re-runnable recipe or script

`analysis-replay` · score 63.1 (need rank 30 of 178) · 32 observations, 12 venues · status: partial · effort M

- Let a provenance file (or a project) be applied to a new data file: same tables, analyses, graphs and layouts, with a diff of what changed.
- Gap today: Provenance cannot be replayed onto new data.
- Acceptance test: A user drops next week's plate export onto last week's project and gets the same analyses and figures, with a log saying which numbers changed.

### 14. Correct only for the comparisons I planned (my family), not for every pair

`planned-comparisons-family` · score 61.4 (need rank 32 of 178) · 22 observations, 9 venues · status: partial · effort M

- Add a 'Comparisons to make' picker (all / vs control / ticked pairs) to every post hoc panel; apply Šídák, Holm or Dunn to exactly that family and print the family size.
- Gap today: No way to tick the planned pairs; Dunn's always corrects for every pair.
- Acceptance test: A user who ticks two planned pairs out of six sees P values adjusted for two comparisons, and the methods text says 'Šídák correction for 2 planned comparisons'.

### 17. Fix the analysis plan before seeing the data and log every later change

`preregistration-plan` · score 58.4 (need rank 38 of 178) · 17 observations, 9 venues · status: missing · effort M

- Add an 'Analysis plan' info sheet (primary comparison, test, n, exclusion rules) that results check against, flagging deviations in the methods.
- Gap today: No way to declare the primary test, n and exclusion rules up front.
- Acceptance test: A user who planned a two-tailed Welch test with n = 8 sees a flag when they run a one-tailed test or add animals, and the methods text records the deviation.

### 19. When I ask whether an effect differs between groups, run and explain the interaction test

`interaction-question` · score 57.9 (need rank 40 of 178) · 19 observations, 10 venues · status: partial · effort M

- Add a wizard question 'Are you asking whether the treatment effect differs between groups?' that routes to two-way ANOVA with the interaction first, an interaction plot, the difference of differences with its CI, and an explainer on 'significant in one, not the other'.
- Gap today: No plain-language reading of the interaction, no interaction plot, and the wizard never asks the differential-effect question.
- Acceptance test: A user with WT/KO × vehicle/drug data who asks 'is the drug effect bigger in KO?' gets the interaction P and the difference of the two drug effects with a 95% CI, plus a warning not to compare two separate t tests.

### 23. Compare EC50s or whole curves between conditions with one test and a ratio with its CI

`compare-curves-ec50` · score 55.2 (need rank 47 of 178) · 26 observations, 7 venues · status: partial · effort M

- Add 'Compare a parameter' to curve fits: pick two data sets and a parameter (logEC50, Hill slope, top), get the difference or ratio with CI and the F test for sharing it.
- Gap today: No EC50 ratio (relative potency) with CI and no comparison of one chosen parameter between a chosen pair of curves.
- Acceptance test: A user with drug alone and drug + inhibitor curves gets 'EC50 shifted 4.2-fold (95% CI 2.9–6.1), P < 0.001' from one comparison.

### 27. Explain each result in plain words: what it means and how it is often misread

`plain-language-results` · score 48.1 (need rank 63 of 178) · 17 observations, 9 venues · status: partial · effort M

- Add a 'What this means' line under the key result of every analysis ('the drug lowered tumour volume by 38% (95% CI 12–57%); a difference this large would be unusual if the drug had no effect'), with common misreadings.
- Gap today: Key numbers (P, CI, Hill slope, HR) carry no one-line meaning next to them.
- Acceptance test: A first-year student reading a hazard ratio of 0.45 sees one sentence saying what it means in their own groups, without opening Help.

### 28. Several reference genes with a stability check before normalising

`qpcr-reference-genes` · score 47.3 (need rank 68 of 178) · 18 observations, 6 venues · status: partial · effort M

- Show each reference gene's Cq across groups with a stability measure (geNorm M or the SD of ΔCq between references) and warn when a reference shifts with treatment.
- Gap today: Reference-gene stability across conditions is not checked.
- Acceptance test: A user with GAPDH and ACTB sees whether either reference moves with treatment before any fold change is shown.

### 31. Put graphs and results into PowerPoint and Word, editable

`office-export` · score 43.4 (need rank 73 of 178) · 19 observations, 10 venues · status: missing · effort M

- Add 'Export to PowerPoint' (.pptx, one slide per graph or layout, as SVG pictures that Office keeps editable as shapes) and 'Copy table for Word' (HTML table on the clipboard).
- Gap today: No .pptx export and no Word-formatted results tables.
- Acceptance test: A user exports a project's graphs to a .pptx, opens it in PowerPoint, and can ungroup a graph to edit its text; a results table pastes into Word as a formatted table.

### 33. Import instrument exports directly (plate readers, qPCR, LabChart, Incucyte)

`instrument-import` · score 42.2 (need rank 75 of 178) · 19 observations, 9 venues · status: partial · effort M

- Add recipes for the most requested exports (Incucyte time series, LabChart, multi-wavelength plate runs) and a generic 'save this mapping as a recipe'.
- Gap today: No readers for LabChart, Incucyte, Thermo .eds or multi-read plate runs.
- Acceptance test: A user drops an Incucyte export and gets an XY table of confluence over time per well without reshaping it in Excel.

### 34. Pairwise comparisons after repeated-measures or mixed ANOVA that keep the matching

`rm-posthoc` · score 40.9 (need rank 78 of 178) · 13 observations, 5 venues · status: partial · effort M

- Add Dunnett (vs baseline) and Tukey comparisons after RM one-way ANOVA and the mixed model, using paired differences and the Geisser-Greenhouse-corrected error.
- Gap today: RM one-way ANOVA has no post hoc tests.
- Acceptance test: A user with the same mice at baseline, day 7 and day 14 gets 'day 7 vs baseline' and 'day 14 vs baseline' with adjusted P from the repeated-measures analysis, not unpaired tests.

### 36. Import per-cell and per-image tables (Fiji, CellProfiler, QuPath), many files at once, condition from file names

`image-table-import` · score 40.0 (need rank 82 of 178) · 27 observations, 7 venues · status: partial · effort M

- Accept a multi-file drop (or zip) of per-image CSVs, stack them with the file name as a column, parse condition and repeat from the name pattern, then run the existing recipe.
- Gap today: One file at a time; no condition/replicate parsed from file or folder names across many files.
- Acceptance test: A user drops 60 per-image CSVs named 'ctrl_rep1_img03.csv' and gets one table with condition, replicate and image columns, ready for a SuperPlot.

### 37. Take FlowJo gate statistics (% of parent, MFI) across replicates straight into tests and graphs

`flow-stats-to-tests` · score 37.9 (need rank 86 of 178) · 23 observations, 8 venues · status: partial · effort M

- Add a flow summary module: FlowJo table in, one value per sample per experiment (median MFI, % of parent), FMO/isotype subtraction, statistics with experiment as block, graphs.
- Gap today: No flow module: per-sample median MFI and % of parent per experiment, background subtraction, tests on replicate level.
- Acceptance test: A user pastes a FlowJo statistics table of 3 donors × 4 conditions and gets % CD69+ per donor with a paired analysis by donor and the graph.

### 38. Check my design before the experiment: controls, replicates, units

`design-stage-checks` · score 37.4 (need rank 90 of 178) · 14 observations, 5 venues · status: partial · effort M

- Add 'Plan an experiment': the wizard's design questions before data, producing the planned table, analysis, n and a design check list.
- Gap today: Design mistakes (single control, n = 1 pooled) are found after the data exist.
- Acceptance test: A user describing a planned experiment with one pooled sample per group is told before running it that this gives n = 1.

## Wave 3: large builds (effort L)

### 3. Nested t test, nested ANOVA or a mixed model with animal, litter or culture as a random effect, without code

`nested-mixed-models` · score 98.7 (need rank 3 of 178) · 75 observations, 11 venues · status: partial · effort L

- Add a two-way nested mixed model (treatment × genotype with animal random) and a 'grouping column' role on multiple-variables tables that any comparison fits as a random intercept.
- Gap today: Grouped + nested (two-way) designs, random effects in other analyses, litter/cage as a grouping column.
- Acceptance test: A user with cells nested in mice in a WT/KO × vehicle/drug design runs one analysis whose df come from mice, not cells, without writing a formula.

### 18. Time courses and longitudinal data: a mixed model with sensible covariance, AUC or a summary measure per subject

`time-course-models` · score 58.1 (need rank 39 of 178) · 23 observations, 10 venues · status: partial · effort L

- Generalise the tumour-growth controls into a 'time course' analysis for any grouped table with time rows: mixed model (choice of covariance), AUC per subject, or a summary window per subject.
- Gap today: AR(1) or unstructured covariance, random slopes, a general time-course wizard outside the tumour module.
- Acceptance test: A user with GTT curves per mouse picks 'time course' and gets group × time from a mixed model plus AUC per mouse compared between groups, from the same table.

## Wave 4: research first, then decide

### 35. Keep the raw, uncropped image and every adjustment linked to the numbers

`raw-image-provenance` · score 40.6 (need rank 80 of 178) · 11 observations, 6 venues · status: missing · effort L

- **Research only.** Research only: let a densitometry table carry a link (or embedded thumbnail) of the source blot with lane labels, and export it with the figure; image processing itself stays in ImageJ/Fiji.
- Gap today: Image provenance lives outside the tool.
- Acceptance test: A user exporting a densitometry figure gets the uncropped blot with lane labels as a supplementary panel from the same project.

## The 40 at a glance

| # | Wave | Need | Score | Obs | Kind | Effort |
|---:|---:|---|---:|---:|---|---|
| 1 | 1 | Tell me which test fits my design before I run anything `design-first-test-chooser` | 100.0 | 51 | discoverability | S |
| 2 | 1 | Tell me what n = 1–3 can and cannot show, and refuse P values when there is one independent value `small-n-honesty` | 99.0 | 45 | build | S |
| 4 | 1 | Ask what the independent unit is (animal, culture, experiment) and compute n from it `declare-experimental-unit` | 91.0 | 69 | build | S |
| 5 | 1 | Paste from Excel exactly: blanks stay missing, decimals and IDs are never mangled `excel-paste-fidelity` | 81.8 | 45 | build | S |
| 6 | 1 | Check assumptions sensibly: residual QQ plots, not a normality-test P that gates the test `assumption-checks-residuals` | 81.5 | 38 | build | S |
| 8 | 1 | Work out how many animals or replicates I need, with a justification sentence `power-sample-size` | 72.8 | 58 | discoverability | S |
| 9 | 1 | Treat each independent experiment (day, plate, run) as a block instead of pooling or normalising it away `experiment-as-block` | 67.7 | 35 | build | S |
| 11 | 1 | Exclusions need a reason, stay visible and are reported (n enrolled vs analysed) `exclusion-log` | 64.1 | 29 | build | S |
| 13 | 1 | Enter survival data simply (dates, deaths per day, event yes/no) and preview how each row is read `survival-data-entry` | 61.7 | 21 | build | S |
| 15 | 1 | Flag IC50s outside the tested range or from undefined plateaus, and report them as '> top dose' `incomplete-curve-flags` | 60.8 | 20 | build | S |
| 16 | 1 | Help me pick the table layout from my experiment, and let me change it later without losing data `table-layout-chooser` | 58.5 | 24 | build | S |
| 20 | 1 | Say whether each P is adjusted, by which method, and show the unadjusted value beside it `adjusted-vs-raw-labelled` | 56.2 | 26 | build | S |
| 21 | 1 | Dunn's (or Conover) after Kruskal-Wallis or Friedman, including each vs control only `nonparametric-posthoc` | 56.0 | 29 | build | S |
| 22 | 1 | Hazard ratios with CIs and Cox regression with covariates `hazard-ratio-cox` | 55.4 | 31 | discoverability | S |
| 24 | 1 | Correct for multiple comparisons by default and notice when I run many separate t tests `multiplicity-by-default` | 54.3 | 21 | build | S |
| 25 | 1 | Show me the tool is validated against reference software so I can trust the numbers `validated-results` | 53.5 | 23 | discoverability | S |
| 26 | 1 | Reopened analyses give the same numbers, and I am told if a version changed them `stable-results-versions` | 50.8 | 26 | build | S |
| 29 | 1 | Open my Prism files without a licence, and send work back to Prism users `prism-files` | 46.1 | 14 | discoverability | S |
| 30 | 1 | Median survival with CI, explained when 'not reached', and survival at a chosen time `median-survival-explained` | 44.7 | 16 | build | S |
| 32 | 1 | Never silently drop data or compute a wrong result; show warnings next to the output `fail-loudly` | 42.8 | 15 | build | S |
| 39 | 1 | Handle unequal n and missing values, and tell me what was dropped `missing-values-handling` | 37.0 | 10 | build | S |
| 40 | 1 | Pairwise log-rank comparisons with multiplicity correction, and a trend test `pairwise-logrank` | 36.8 | 16 | build | S |
| 7 | 2 | Analyse ratios and skewed positive data on the log scale and report back-transformed fold changes `log-scale-analysis` | 78.0 | 45 | build | M |
| 10 | 2 | Stay fast with tens of thousands of rows and points `large-data` | 66.1 | 43 | build | M |
| 12 | 2 | Record every point-and-click step as a re-runnable recipe or script `analysis-replay` | 63.1 | 32 | build | M |
| 14 | 2 | Correct only for the comparisons I planned (my family), not for every pair `planned-comparisons-family` | 61.4 | 22 | build | M |
| 17 | 2 | Fix the analysis plan before seeing the data and log every later change `preregistration-plan` | 58.4 | 17 | build | M |
| 19 | 2 | When I ask whether an effect differs between groups, run and explain the interaction test `interaction-question` | 57.9 | 19 | build | M |
| 23 | 2 | Compare EC50s or whole curves between conditions with one test and a ratio with its CI `compare-curves-ec50` | 55.2 | 26 | build | M |
| 27 | 2 | Explain each result in plain words: what it means and how it is often misread `plain-language-results` | 48.1 | 17 | build | M |
| 28 | 2 | Several reference genes with a stability check before normalising `qpcr-reference-genes` | 47.3 | 18 | build | M |
| 31 | 2 | Put graphs and results into PowerPoint and Word, editable `office-export` | 43.4 | 19 | build | M |
| 33 | 2 | Import instrument exports directly (plate readers, qPCR, LabChart, Incucyte) `instrument-import` | 42.2 | 19 | build | M |
| 34 | 2 | Pairwise comparisons after repeated-measures or mixed ANOVA that keep the matching `rm-posthoc` | 40.9 | 13 | build | M |
| 36 | 2 | Import per-cell and per-image tables (Fiji, CellProfiler, QuPath), many files at once, condition from file names `image-table-import` | 40.0 | 27 | build | M |
| 37 | 2 | Take FlowJo gate statistics (% of parent, MFI) across replicates straight into tests and graphs `flow-stats-to-tests` | 37.9 | 23 | build | M |
| 38 | 2 | Check my design before the experiment: controls, replicates, units `design-stage-checks` | 37.4 | 14 | build | M |
| 3 | 3 | Nested t test, nested ANOVA or a mixed model with animal, litter or culture as a random effect, without code `nested-mixed-models` | 98.7 | 75 | build | L |
| 18 | 3 | Time courses and longitudinal data: a mixed model with sensible covariance, AUC or a summary measure per subject `time-course-models` | 58.1 | 23 | build | L |
| 35 | 4 | Keep the raw, uncropped image and every adjustment linked to the numbers `raw-image-provenance` | 40.6 | 11 | research | L |

## Below the line

Further improvements, in score order (see CATALOGUE.md for their evidence): `explain-test-choice-in-output` (36.7), `wb-linear-range` (36.2), `fit-report-complete` (36.1), `dose-time-not-per-point` (35.3), `nonparam-factorial` (35.1), `estimation-plots` (34.8), `enzyme-kinetics-rates` (34.6), `superplots` (34.0), `nonsig-wording` (33.2), `design-reporting-capture` (32.3), `templates-new-data` (30.8), `batch-curve-fitting` (30.5), `qpcr-qc-nondetects` (29.6), `counts-proportions-routing` (29.0), `blinding-mode` (27.8), `units-in-data` (27.8), `flow-gating-provenance` (26.7), `image-quantification` (26.7), `batch-many-datasets` (26.5), `calculated-columns` (26.0), `contingency-posthoc-graphs` (25.0), `zero-dose-control` (24.8), `nway-anova-contrasts` (23.4), `batch-confounding` (23.1), `ordinal-scores` (22.6), `compare-slopes` (22.4), `potency-across-experiments` (22.3), `rich-text-labels` (22.3), `rank-test-small-n` (21.3), `pair-by-subject-id` (20.0), `lod-loq` (19.8), `ancova-baseline` (19.7), `merge-tables` (18.9), `source-data-export` (18.6), `graph-direct-editing` (18.1), `show-intermediate-values` (17.7), `summary-matches-test` (17.3), `power-complex-designs` (16.4), `localised-ui` (15.3), `dose-design-advice` (14.6), `bar-axis-zero` (13.4), `per-series-x` (12.8), `axis-breaks` (12.6), `error-propagation` (12.3), `assay-validation-suite` (11.9), `stats-table-export` (11.5), `no-post-hoc-power` (10.8), `ic50-graph-markers` (8.0), `per-plate-curves` (7.9), `flow-event-counts` (6.2), `normalised-axis-label` (5.1), `consistent-group-colours` (4.6).

## Do not build (offer this instead)

Some requests in the corpus would make results worse if built as asked. Each line names what users ask for or do, the needs where the evidence sits (with their observation counts), example quotes showing the practice and the warnings against it, and what to offer instead.

1. **Per-dose or per-time-point t tests as the analysis of a curve.** Needs: `dose-time-not-per-point` (13); `time-course-models` (23).
   - “I've been using a one-way ANOVA using the percentage of dead cells, and I've been testing Dunnett's and Fisher's LSD tests, but I'm not sure this is the best way to approach the problem.” ([stats.stackexchange.com](https://stats.stackexchange.com/questions/196683), `stackexchange-stats-196683`)
   - “Does it make sense to use ANOVA multiple comparison tests to compare two dose-response curves at every dose (or two time course curves at every time point)?” ([graphpad.com FAQ](https://www.graphpad.com/support/faq/does-it-make-sense-to-use-anova-multiple-comparison-tests-to-compare-two-dose-response-curves-at-every-dose-or-two-time-course-curves-at-every-time-point/), `gpsupport-faq-1084`)
   - “Multiple tests used to assess the same hypothesis lead to risk of false discoveries due to multiple comparisons, with type I error rate more than double the commonly specified 5% 8 .” ([Scientific Reports](https://pmc.ncbi.nlm.nih.gov/articles/PMC8044116/), `lit-tumorgrowth2021-typeI`)
   - *Offer instead:* Curve comparison (shared vs separate fits), AUC per subject or a mixed model over time. Keep "multiple t tests per row" for omics-style screens with FDR, and label it as many comparisons.
2. **SEM as the default error bar.** Needs: `error-bar-choice` (47); `error-bar-labelled` (20).
   - “In their response to my comments, the authors explained they changed the SEM to SD in text, but kept the SEM in figures because this was the convention for the Journal of Neurophysiology!” ([scientificallysound.org](https://scientificallysound.org/2016/10/24/poor-statistical-practices/), `blog-scisound-poorstats-4`)
   - “Stop using SEM instead of SD to make data look cleaner. In most cases, your need SD + independent points.” ([wildtypeone.substack.com](https://wildtypeone.substack.com/p/hard-biology-bench-truths-that-take), `blog-wildtypeone-truths-3`)
   - *Offer instead:* SD with the points to describe data, 95% CI for precision; SEM only by explicit choice and always named in the legend (already the default).
3. **Post hoc ('observed') power after a non-significant result.** Needs: `no-post-hoc-power` (3); `power-sample-size` (58).
   - “検定力が0.10と小さく、「差があるはずなのに、差がないと出てしまう」確率が高いはずです。” ([chiebukuro.yahoo.co.jp](https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q12213029872), `nonen-ja-n3-power-1`) *(Gloss: 'Power is only 0.10, so the chance that it says no difference even though there should be one must be high.' — Problem: with n=3 and p=0.50 does not know whether 'no significant difference' can be stated.)*
   - “Why it is not helpful to compute the power of an experiment to detect the difference actually observed? Why is post-hoc power analysis futile?” ([graphpad.com FAQ](https://www.graphpad.com/support/faq/why-it-is-not-helpful-to-compute-the-power-of-an-experiment-to-detect-the-difference-actually-observed-why-is-post-hoc-power-analysis-futile/), `gpsupport-faq-1710`)
   - *Offer instead:* The CI of the effect and the smallest effect the design could detect; prospective power from a planned effect only.
4. **Automatic outlier deletion.** Needs: `exclusion-log` (29); `outlier-detection` (16); `analysis-replay` (32).
   - “Or try a different way to analyze the data: remove a few outliers; transform to logarithms; try a nonparametric test; redefine the outcome by normalizing (say, dividing by each animal’s weight); use a method to compare one variable while adjusting for differences in another; the list of possibilities is endless.” ([Naunyn-Schmiedeberg's Archives of Pharmacology](https://pmc.ncbi.nlm.nih.gov/articles/PMC4203998/), `lit-motulsky2014-phack`)
   - “You're not allowed to remove outliers because your statistics are non-significant.” ([wildtypeone.substack.com](https://wildtypeone.substack.com/p/hard-biology-bench-truths-that-take), `blog-wildtypeone-truths-4`)
   - “Outliers should therefore be included in data analysis and presentation unless a predefined and defensible set of exclusion criteria can be generated and applied.” ([pmc.ncbi.nlm.nih.gov](https://pmc.ncbi.nlm.nih.gov/articles/PMC5843711/), `journal-bjp-design-7`)
   - *Offer instead:* Flag (ROUT, Grubbs), keep the point visible, require a reason, report results with and without it.
5. **Choosing between parametric and rank tests from a normality-test P value.** Needs: `assumption-checks-residuals` (38).
   - “Including the potential outliers, the data fail normality tests and, although the QQ plot doesn’t look too far off, it doesn’t seem to follow the line as well as we would like, particularly with the potential outlier.” ([www.bioinformatics.babraham.ac.uk](https://www.bioinformatics.babraham.ac.uk/training/GraphPadPrism/GraphPad%20Prism%20Exercises%20Worked%20Answers.pdf), `courses-babraham-ans-kw-vs-anova`)
   - “My recommendation: do not perform normality test before ANOVA ... underpowered for small samples (many false negatives) ... oversensitive for large samples (many false positives)” ([dag.compbio.dundee.ac.uk](https://dag.compbio.dundee.ac.uk/workshops/statistics_lectures/09_ANOVA.pdf), `consult-dundee-normality-test-40`)
   - *Offer instead:* Choose from the design and the scale (log for ratios and concentrations), show residual QQ plots, and use Welch before switching to ranks.
6. **Bar graphs of means as the default for small samples.** Needs: `show-every-point` (70).
   - “However, despite all these efforts, dynamite plots continue to be ubiquitous in the scientific literature.” ([simplystatistics.org](https://simplystatistics.org/posts/2019-02-21-dynamite-plots-must-die/), `blog-simplystats-dynamite-1`)
   - “Show your data! Dynamite plot Awful! Box plot OK Jitter plot Better Beeswarm plot Best!” ([dag.compbio.dundee.ac.uk](https://dag.compbio.dundee.ac.uk/workshops/statistics_lectures/05_Data_presentation.pdf), `consult-dundee-dynamite-32`)
   - *Offer instead:* Dot or box plots with every point (the default today); bars for counts and proportions.
7. **Stars instead of P values.** Needs: `brackets-from-analysis` (75); `exact-p` (37).
   - “How can I add a significance brackets with * between boxplots? Can this be done automatically by JASP? Or do you really all do it afterwards in an image editor?” ([forum.cogsci.nl (JASP forum)](https://forum.cogsci.nl/discussion/9495/figures-in-jasp), `competitor-jaspforum-9495`)
   - “This idea of ‘significance’ is commonly ingrained in interpretation of statistical tests in biology. But, it turns out that this approach leads to serious errors.” ([biomedical-sciences.ed.ac.uk](https://biomedical-sciences.ed.ac.uk/experimental-design-and-data-analysis/what-to-do-with-experiments/chapter-8), `consult-edinburgh-significance-14`)
   - *Offer instead:* Brackets drawn from the analysis with exact P available on them, effect sizes with CIs in the results, and the star thresholds written into the legend.
8. **One-tailed tests chosen after seeing the data.** Needs: `test-variant-named` (35).
   - “Two times easier to reach significance with one-tailed than two-tailed → suspicious reviewer!” ([bioinformatics.babraham.ac.uk](https://www.bioinformatics.babraham.ac.uk/training/GraphPadPrism/Intro%20to%20statistics%20with%20GraphPad%20Prism%20slides.pdf), `consult-babbio-onetailed`)
   - “Choosing a one-tailed test after running a two-tailed test that failed to reject the null hypothesis is not appropriate, no matter how "close" to significant the two-tailed test was.” ([stats.oarc.ucla.edu](https://stats.oarc.ucla.edu/other/mult-pkg/faq/general/faq-what-are-the-differences-between-one-tailed-and-two-tailed-tests/), `consult-ucla-onetailed`)
   - *Offer instead:* Two-tailed by default; one-tailed only when declared before the data (the proposed analysis plan).
9. **Inventing data to make a fit or a graph work (an untested concentration, a number for the vehicle's zero, a fake row).** Needs: `zero-dose-control` (10); `incomplete-curve-flags` (20); `constraints-initial-values` (23); `axis-label-control` (24).
   - “Impossible, however u can virtualy take 4th conc sime where in between these three and can plot but that might effect IC50 slightly” ([youtube.com](https://www.youtube.com/watch?v=AEJvkrl7NsU&lc=Ugzke5JJYCXwPBG7aBJ4AaABAg.A2PgvkdHvaiA2Ytud4rCuC), `youtube-AEJvkrl7NsU-Ugzke5JJYCXwPBG7aBJ4AaABAg.A2PgvkdHvaiA2Ytud4rCuC`)
   - “I have found a workaround for this: I have added a new row with "3" option marked and created the box plot. Since the new plot is an outlier, represented as a small dot, I have deleted the "dot" from the exported image in MS Paint” ([forum.jamovi.org](https://forum.jamovi.org/viewtopic.php?t=1259), `competitor-jamovi-1259`)
   - “Changing the value to 1 is not an appropriate solution to ridding yourself of the missing value.” ([youtube.com](https://www.youtube.com/watch?v=7NgRqXSByFo&lc=UgxNyIrc66T6bIjNKNh4AaABAg), `youtube-7NgRqXSByFo-UgxNyIrc66T6bIjNKNh4AaABAg`)
   - *Offer instead:* Constraints with a stated reason, vehicle wells as the plateau, 'IC50 > top dose' reporting, manual axis ranges, and summary-data entry instead of fabricated datasets.
10. **Data-driven 'optimal' cut-points for survival groups.** Needs: `pairwise-logrank` (16); `median-survival-explained` (16); `adjusted-vs-raw-labelled` (26); `km-logrank` (24).
   - “This will cause an unadjusted p-value overestimating significance to be reported.” ([github.com/kassambara/survminer](https://github.com/kassambara/survminer/issues/359), `github-survminer-359-1`)
   - “The procedure for categorisation of continuous variables in logrank analyses was explained in only 8/49 (16%) papers.” ([British Journal of Cancer](https://pmc.ncbi.nlm.nih.gov/articles/PMC2033978/), `lit-altman1995-3`)
   - *Offer instead:* Pre-specified cut-points, or Cox regression on the continuous variable; ROC cut-offs only as diagnostics, with their optimism stated.
11. **Testing fold changes with the control fixed at 1 (or averaging 2^−ΔΔCt).** Needs: `qpcr-stats-log-scale` (23); `normalised-control-variance` (14).
   - “why you should have a standard deviation from your control groups in the experiment? i do not really understand this, in my lab they do it the same way but i have read a lot and there are people who is against this” ([youtube.com](https://www.youtube.com/watch?v=Kkle8T7aXjk&lc=UgzDVkqcmtfD9OlAXHV4AaABAg), `youtube-Kkle8T7aXjk-UgzDVkqcmtfD9OlAXHV4AaABAg`)
   - “我仔细看了下仪器的分析结果，好像它的error bar用的是RQ max和RQ min，所以请问一下，这里的error bar难道不是用SD么？” ([muchong.com](https://muchong.com/t-4936959-1), `nonen-zh-qpcr-errorbar-1`) *(Gloss: 'The instrument's error bars appear to use RQmax and RQmin — shouldn't error bars be SD?' — Problem: does not know how to carry SD of ΔCt onto 2^-ΔΔCt bars (gets bars larger than the bar height).)*
   - *Offer instead:* Statistics on ΔCt or on log ratios (ratio paired or one-sample t on logs), fold change with an asymmetric CI at the end (both exist).
12. **Counting cells, wells or repeated reads as n.** Needs: `declare-experimental-unit` (69); `pseudoreplication-warning` (26).
   - “Then I decided to pool all treated cells and all controls for a general comparison. The question, more specifically, is: do I have the right, statistically, to do so?” ([forum.image.sc](https://forum.image.sc/raw/33993), `imagesc-33993-1`)
   - “The resulting P values are worse than useless: counting each cell as a separate n can easily result in false-positive rates of >50% ( Aarts et al., 2015 ).” ([Journal of Cell Biology](https://pmc.ncbi.nlm.nih.gov/articles/PMC7265319/), `lit-lord2020superplots-cell-as-n`)
   - *Offer instead:* Statistics on experiment means with every cell shown (SuperPlots), or a nested / mixed model.
13. **Linearised fits (Lineweaver-Burk, Scatchard) to estimate parameters.** Needs: `enzyme-kinetics-rates` (17).
   - “How can I make Lineweaver Burk plot in GraphPad? ... I can't project the trend line” ([youtube.com](https://www.youtube.com/watch?v=QF6fWNzAYr0&lc=UgwsgfpMtviUP3KTHkp4AaABAg), `youtube-QF6fWNzAYr0-UgwsgfpMtviUP3KTHkp4AaABAg`)
   - “should be estimated using nonlinear fitting (and the software system cited). Parameters should include estimates of error (SD preferred). The use of linear transformations for calculation of Michaelis-Menten parameters is recognized to be inaccurate.” ([asbmb.org](https://www.asbmb.org/journals/author-resources/collecting-and-presenting-data), `journal-jbc-data-13`)
   - *Offer instead:* Nonlinear fits for Km, Vmax, Kd; the linear plots stay as display transforms.
