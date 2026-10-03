# What Prism users need: Hacker News, GitHub trackers, methods literature

Research agent report, 2026-10-04 (the re-scoped Reddit study). Reddit
blocks automated access and was not reached; no block was circumvented.
~130 searches via the Hacker News Algolia API (~50), GitHub search
(~40) and Europe PMC (~30) after the shared web-search budget ran out;
~45 pages read (22 GitHub issues/discussions, 16 open-access papers or
protocols, 4 HN threads, 5 blog/tool pages). Stack Overflow, Cross
Validated, YouTube search, Slant, ResearchGate and Biostars were
blocked. The voice is mostly methodologists, developers relaying user
requests, and power users; rankings are judgement, not counts.

## Two findings to know about now

1. **A direct competitor launched 10 days ago.** BarelySig
   (github.com/BooneAndrewsLab/BarelySig, created 2026-09-24, ~120
   issues): "Free, browser-based statistics and graphing for wet-lab
   scientists. No license required. Asterisks included." Runs R in the
   browser via WebR. Shipped: nested tables and SuperPlots; fits
   validated against R and the GraphPad curve-fitting guide's worked
   examples; global fits, profile-likelihood CIs, growth curves; a
   "Help me choose" test guide; draggable significance brackets. Open:
   .pzfx import, survival tables, figure layouts. Issue #90 asks whether
   to keep naming Prism in the UI. Its tracker relays the best direct
   user voice found (#73, #118, #94).
2. **BioRender is now a graphing competitor.** Its Graph tool imports
   .prism files and runs t tests, ANOVA, EC50/IC50 fits and Kaplan–
   Meier; an institute wiki still mandates Prism because "Prism is the
   validated, widely-cited standard in our publications".

## 1. Top 25 needs and pains, ranked

1. **Show the points, not dynamite plots.** Weissgerber 2015: "85.6% of
   papers included at least one bar graph", median n "4 (IQR 3–6)";
   bar graphs "erroneously suggest that the groups being compared are
   independent". Irizarry: "graphical representations of a grand total
   of 4 numbers". Motulsky: box-whisker when raw data would clutter.
   Must: points plus summary by default; bar-only opt-in.
2. **Get n right: biological vs technical, SuperPlots, nested.** Lord
   2020: "counting each cell as a separate n can easily result in
   false-positive rates of >50%"; the Prism recipe needs a manual
   overlay "on a 'Layout'". Cumming 2007: "For replicates, n = 1, and it
   is therefore inappropriate to show error bars or statistics". Lazic
   2010: "12% of papers had pseudoreplication and a further 36% were
   suspected". Eisner 2021 wrote a nested-analysis guide for Prism.
   Must: replicate-ID column, one-click SuperPlot, tests on replicate
   means or nested model, warning when n looks like cells.
3. **A test chooser in bench language.** Immunohorizons 2026 decision
   tree: "many scientists use GraphPad Prism, for better or for worse,
   ergo the need for a decision tree". BarelySig #73: "help me choose
   must be much better, must be intuitive for even the dumbest of the
   biologists who are clueless about stats." statsandr: "kind of like
   GraphPad Prisms suggestions". HN: "I'm a barely stats-literate
   biology graduate…". Only 67.5% of top physiology departments require
   statistics training (Weissgerber 2016). Must: one question at a time,
   the user's own data as the example, "I'm not sure" with a safe
   default, one Run button.
4. **Guardrails, not just ease.** HN: "make it easy to get an answer,
   right or wrong. I'd rather see them make it hard to get a wrong
   answer"; "turbo-tax for (basic) statistical analyses"; "remarkably
   easy to get an answer without any clue as to what was happening".
   Motulsky: "Misconception 1: P-Hacking is OK." Must: inline assumption
   checks, plain warnings, a visible log of choices.
5. **Choosing and reporting post hoc tests.** "26.7% of papers did not
   specify what post-hoc test was performed"; in 95% the ANOVA type
   could not be determined. JASP requests for FDR and a Dunn explainer;
   Dunn P mismatches between R packages. Must: recommend from the
   design; name it in the output.
6. **Stars and brackets with exact P and journal styles.** "I know that
   programs like GraphPad Prism and SPSS offer this feature" (JASP
   #3876); hide "ns" (ggprism #7); round P (ggpubr #716); "p Value =
   .123 / P value = 0.123" (survminer #375); a Sci Rep 2022 legend
   prints Prism's defaults "**** p < 0.0001, *** p < 0.0002, ** p <
   0.0021, * p < 0.0332". Must: stars or exact P with APA, NEJM and
   Prism-style presets; auto-stacked draggable brackets; legend stating
   thresholds.
7. **Wide (grouped) entry vs long/tidy.** JASP #1267 ("similar to what
   can be done in GraphPad Prism"), jamovi #1643, JASP #33 ("first melt
   into long"), PlotsOfData. Must: both layouts, lossless conversion,
   replicate subcolumns.
8. **Cost and licence access.** neutcurve #27: "we need GraphPad Prism
   software to generate the dose-response curve"; NormaliseForIC50 #14;
   HN calculator suite; OpenStats 2026: "reliance on such software
   undermines the reproducibility of data analysis by limiting
   accessibility". Must: free, no install, no account.
9. **Trustworthy dose-response fitting.** "flag outstanding values (IC50
   outside the upper/lower detection limits)"; HN on a web fitter:
   "needs at a minimum error estimates on the estimated parameters…
   ideally some kind of 'error envelope'"; "a residuals plot and IID
   tests of residuals"; "an almost surely meaningless 16 decimals!";
   Morrison tight-binding request (pyzyme #2). Must: CIs and bands,
   ambiguous/out-of-range flags, residual diagnostics.
10. **Interpolating unknowns plate by plate.** STAR Protocols ELISA:
    "multiply the interpolated value by the dilution factor"; "Since
    each ELISA plate has its own standard curve, repeat steps 3–7 for
    each ELISA plate"; a microplate spec: reference wavelength, per-plate
    blank, per-plate 4PL. Must: batch per plate, dilution column,
    quantification-limit flags, blank subtraction.
11. **Normalising to a control and the statistics after it.** BarelySig
    #118: "the control group becomes constant (SD 0)… recommend a
    one-sample test vs. 100". Motulsky: "explain exactly how you defined
    100 and 0%". Must: normalise as a recorded transform; steer to the
    right test.
12. **Reproducibility and audit trail.** Wildtype One; tidyplots:
    "workflows—often reliant on copy-pasting and manual spreadsheet
    manipulations—are struggling"; HN: "halfass R script, or some
    disorganized SPSS/Excel or Graphpad". Must: replayable recipe with
    each figure and export.
13. **Running the same analysis many times.** HN: "months manually
    clicking boxes… 30 lines of python and a CSV file would save them
    months". Must: one template to N tables.
14. **Prism files and Prism-using colleagues.** pzfx: "I went to Google
    expecting there'll be some readxl or readr equivalent for prism";
    .prism breaks the reader ("Start tag expected", pzfx #20); "a format
    more of my team are familiar with" (#18); rio #205. Must: import and
    export .pzfx and .prism.
15. **SD vs SEM vs CI, labelled.** Cumming Rule 1: "always describe in
    the figure legends what they are"; Rule 3: "never for replicates";
    77.6% of bar graphs showed SE. Must: explicit defaults; error-bar
    type and n in the legend automatically.
16. **The Prism look.** ggprism's author "missed the 'look'"; ggprism
    #37: "when there are two overlapping or close points, they are
    placed symmetrically from the center"; ggthemes #80. Must: offset
    axes, symmetric scatter placement, good defaults.
17. **A chart builder that is GUI and flexible.** JASP #2120; HN: "a
    hybrid model… a GUI could be used to modify the appearance of the
    plot" → "Have you tried graphpad prism?". Must: click any element to
    format; plot summary statistics people already have.
18. **Repeated measures, mixed models, missing values.** Wildtype One;
    eLife 2018: "not specifying that the analysis included repeated
    measures". Must: tolerate missing cells; say which model.
19. **Colour-blind-safe palettes.** Jambor 2021: "45% of cell biology
    papers… inaccessible to readers with deuteranopia"; Crameri 2020 on
    rainbow maps. Must: CVD-safe defaults and a simulator.
20. **Effect sizes and CIs.** Motulsky: "identical P values, but the
    scientific conclusion is very different"; eLife 2018 "strongly
    recommended"; Lord: "focus less on… superficial statistical tests".
    Must: difference with CI always; estimation plots.
21. **Survival-plot polish.** survminer #551: "see all the groups at 100%
    survival… Prism does something similar they call nudging"; P
    formatting (#375). Must: nudge overlapping curves, censor marks,
    number-at-risk, journal P format.
22. **Microbial growth curves.** BarelySig #94: scientists "want the
    biologically meaningful phases identified" (lag, rate/doubling,
    stationary). Must: Gompertz/logistic with phases read off.
23. **Methods and legend text.** eLife 2018's typical line: "Data were
    analyzed by t-tests or ANOVA, as appropriate…"; Lazic: report "the
    sample size, degrees of freedom, the test statistic, and precise
    p-values". Must: auto sentences naming test, n, df, exact P.
24. **Excel paste and instrument files.** HN: "copy-paste data straight
    from a spreadsheet"; plate-layout joins; JASP #611 .xlsx; Excel
    auto-converting gene names and dates. Must: clipboard paste, layout
    detection, plate maps, no silent coercion.
25. **Room to grow, learning materials.** UCSF scientist: "as my
    datasets grow larger and more multidimensional… I need to handle my
    own analysis"; Babraham runs parallel Prism and R courses. Must:
    worked examples; thousands of rows.

## 2. Workflows people actually run

ELISA (STAR Protocols PMC11667700): export → XY table with replicate
subcolumns ("the 8th value will be 0 to represent the blank") → unknowns
under standards → Interpolate a Standard Curve (they chose a hyperbola)
→ r² as QC → dilution by hand → repeat per plate → t test/ANOVA.
Viability IC50 (PMC8476855): normalise to vehicle and positive controls
per plate, fit "log [inhibitor] vs normalized response – variable slope
(four parameters)" (the name itself confuses). Western blot (PMC9585080,
PMC3971489): target ÷ loading control per lane → ÷ control-lane mean
within gel → average across gels → test; housekeeping proteins "are
grossly overloaded"; wrong normalisation order "potentially gives
non-significant data… entirely consequent to the data analysis
approach"; all in Excel first. qPCR: Yuan 2006 "Confidence interval and
statistical significance considerations are not explicit". Survival:
KM + log-rank routine; nudging and P formatting requested. Grouped
bar/dot with stars: stars by default (JASP #3876), adjustable brackets,
hide ns, show points. SuperPlots: two graphs on a Layout in Prism.
Growth curves: OD600 → lag, doubling, plateau.

## 3. Why people leave or avoid Prism, and what keeps them

Leave: price/licensing ("for the price of this app, you could buy… an
infinite number of copies of R"); reproducibility/automation ("cannot
be exported as scripts"); methods arrive late (SuperPlots, estimation);
data growth; file lock-in. Stay: look and speed ("Clean, publication-
ready figures", "Built-in stats (no need to remember what a Tukey
post-hoc test is)"); purpose-built ("Something purpose-made, like JMP or
even GraphPad, is probably the better choice"); polish ("one of the last
great pieces of optimized native software"); standard (48.4% of
preclinical papers report Prism, PMC13352756; "the validated, widely-
cited standard"; institutes run Prism courses).

## 4. Figure conventions people want

Points on or instead of bars with Prism-style symmetric beeswarm;
SuperPlots by replicate; estimation plots and CIs; CVD-safe palettes;
stars and exact P with configurable thresholds and APA/NEJM/Prism P
styles; hide "ns"; error-bar type and n in the legend; survival curves
nudged apart at 100%; output that drops into Illustrator/BioRender
(BioRender "cannot pull over Prism's custom styling").

## 5. What confuses people statistically

Which test and which post hoc (Welch/Brown–Forsythe ANOVA → Games–
Howell/Dunnett T3; Holm–Šídák; Dunn after Kruskal–Wallis); what n is
(wells "reflect the accuracy of pipetting"); SD vs SEM; dose-response
model names; P as effect size and P-hacking; normalised controls with
SD 0; star thresholds copied from software defaults. Helpful:
flowcharts ("my go-to for when i get any doubts"), simulated examples
of false-positive inflation (Eisner, Lazic), Motulsky's identical-P
table.

## 6. Data entry and import pains

Wide vs long; replicate subcolumns lost on export (pzfx #11);
summary-only tables (mean, SEM, n; pzfx #18); .pzfx XML vs .prism JSON
(pzfx #20); clipboard paste; instrument exports (plate-layout joins,
per-plate blanks, reference wavelength); Excel type coercion; comma
decimal separators (pzfx #9).

## Sources

HN items 16781852 (16784089, 16783798, 16785154, 16783967, 16784092),
45810086, 34812195, 27982493, 28212043, 31664217, 46788519, 46549293,
31210705, 46053234. GitHub: BooneAndrewsLab/BarelySig (issues 33, 37,
45, 73, 90, 94, 118); IBL-bioinfo wiki #199; jamovi #1643; jasp-issues
3876, 1267, 33, 2120, 611, 2843, 1123; Yue-Jiang/pzfx 11, 18, 20, 9;
csdaw/ggprism 7, 37; jrnold/ggthemes 80; gesistsa/rio 205; survminer
375, 551; rstatix 50; ggpubr 716; FSharp.Stats 68; pyzyme 2;
NormaliseForIC50 14; neutcurve 27; statsandr discussion 93;
2026-RLAB-Practical-Exercises discussion 2; terminal-bench-science
discussion 366; scientific-python summit-2025 #40. Papers: PMC7265319,
PMC8101441, PMC6453475, pbio.1002128, PMC5733595, PMC6326723,
PMC12768886, PMC4203998, PMC2064100, PMC2817684, PMC7814346,
PMC5762161, PMC4825954, PMC11995173, PMC13330261, PMC13352756,
PMC9585080, PMC3971489, PMC1395339, PMC7595127, PMC8041175,
PMC11667700, PMC8476855. Blogs: wildtypeone; yuejiang pzfx; ggprism;
scientistinprogress (low weight); simplystatistics dynamite plots;
Goedhart DataViz protocols; Laylin lab SuperPlots; Babraham training;
AlternativeTo.
