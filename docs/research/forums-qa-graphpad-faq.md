# What Prism users need: forums, Q&A sites and GraphPad's own support pages

Research agent report, 2026-10-04. Coverage: ~53 web searches plus ~30 API
queries (five Stack Exchange sites, Hacker News Algolia); ~55 pages read in
full; full bodies and top answers of 48 Cross Validated / Stack Overflow
questions; GraphPad's full FAQ index (1,539 titles) counted by theme.

Caveats: ResearchGate, Student Doctor Network and two university pages
returned 403 (titles only). Hacker News and Quora had little substantive
Prism discussion. Quoted phrases came through a summarising fetch; check
exact wording against the source before publishing it.

## 1. Top 25 user needs and pains (frequency × intensity)

1. **"Which test do I use?"** — design-first choice of test.
   "I have 3 treatment groups and 5 time-points … Should I use two-way
   Repeated Measures ANOVA?" (stats.stackexchange.com/questions/15982, 9.1k
   views); "three groups of non-parametric sample data, can I use the
   Mann-Whitney U test … Or … Kruskal-Wallis?" (…/461045, 10.9k views);
   "Each assay is done at different days with different cells and media.
   The problem comes when a statistical test is to be chosen." (…/76900).
   Tool must: a design-first wizard (factors, pairing, replicate structure,
   outcome type) that recommends a test and explains why.
2. **Multiple comparisons after two-way ANOVA.** "The multiple comparisons
   options in Graphpad though are confusing me … irrelevant comparisons
   being made that decrease significance levels." (…/364730); "Do I adjust
   it to 0.05/28 … or 0.05/36? Graphpad calculates them separately."
   (…/389765); "Time x Genotype term is significant … none of the multiple
   comparisons at each time point … are significant. How could this be?"
   (…/595764). Tool must: plain-language comparison choice ("treatment vs
   control at each time point"), show family size and correction, explain
   omnibus-vs-post-hoc disagreement next to the output.
3. **Technical vs biological replicates; pooling experiments; n = cells.**
   "What test will compare the 4 different conditions, but will also take
   into account the variation between biological replicates?" (…/6579);
   "Is there a way to combine the two experiments" (…/71626); "the 'right'
   way to handle technical replicates is to just take the mean" (…/663411);
   "My stats software (GraphPad Prism) doesn't know that these said
   individual values … are composed of multiple pooled values" (…/573475);
   SuperPlots: "The cell biology literature is littered with erroneously
   tiny P values" (arxiv.org/pdf/1911.03509). Tool must: experiment /
   animal / technical replicate as a first-class structure; nested or
   mixed models or average-then-test; warn when n is the number of cells.
4. **Numbers don't match R/SPSS/Python/Excel.** Dunn's test half the P in R
   (…/160634), Friedman vs Kruskal setup (…/596638), kruskal_test vs Prism
   (stackoverflow 69629089), aov vs Prism (74867521), multitest (70284098),
   quantile type 6 (44522293). Tool must: show method, tails, tie handling,
   correction, quantile definition on every result; ideally equivalent R /
   Python code.
5. **IC50/EC50 setup.** Log X or not, which equation, normalise or not,
   "The EC50 is not the concentration producing a Y value of 50" (GraphPad
   FAQ), relative vs absolute. Tool must: detect log vs linear X, handle
   concentration 0, ask inhibitor/agonist, state which IC50 and what 0% /
   100% mean.
6. **Fit diagnostics.** "Your data simply do not define all the parameters
   in your model." (FAQ 931), "High R² but useless results" (FAQ 1462),
   interrupted / did not converge / blank EC50. Tool must: plain-language
   diagnosis with concrete fixes.
7. **Comparing curves or parameters between groups.** t test on Kd values
   (…/546123); "a single test for the overall dose-response relationship"
   (…/92569, 11.3k views); growth curves "side-by-side" only (Physics
   Forums). Tool must: one-click "Do these curves differ? Which parameter?"
   via extra-SS F / AIC with global fit; across-experiment pooled logEC50.
8. **Normalisation side effects.** What Normalize does to SD/SEM (…/277005);
   Western blots normalised to a control with SD = 0 → one-sample t test
   against 1. Tool must: record how normalisation was done; warn about
   zero-variance controls and route to one-sample / ratio-paired tests.
9. **RM with missing values, mixed models, covariates.** Prism's own guide:
   "You can't add a covariate." "You can't compare alternative mixed effects
   models." Tool must: RM-equivalent mixed model with missing values,
   covariates, covariance-structure choice.
10. **Standard-curve interpolation.** "Where are my standard curve results?",
    unknowns must be below standards, blanks outside range, replicate
    unknowns, "I am trying to mimic the graphpad ELISA analysis using R"
    (stackoverflow 59652913). Tool must: dedicated standards + unknowns
    layout with replicate averaging and dilution factors; flag out-of-range.
11. **Significance annotations linked to the analysis.** Brackets on tumour
    growth plots (stackoverflow 79467218), manual brackets "will not be
    linked to the analysis" (FAQ). Tool must: live brackets / stars / exact
    P / letters from the analysis, including XY time-course layouts.
12. **Publication export.** ~187 of 1,539 FAQ titles concern export; EPS
    fonts "jumbled" in Illustrator; line thickness 6 pt → 5.04 pt "No known
    workaround" (FAQ 1066); SVG only in 10.6 (Aug 2025). Tool must: SVG/PDF
    with real text, exact pt sizes, journal size/DPI presets.
13. **Consistent formatting across graphs.** "magic wand … doesn't include
    all elements"; "hard to place … the legend on the same place in
    multiple graphs" (Capterra). Tool must: style templates/themes applied
    to every graph; layouts that align axes.
14. **Data shape and interoperability.** Long vs wide (stackoverflow
    63578511, 56500942, 73831753), pzfx round trips, plate exports
    (75619452). Tool must: long and wide with one-click pivot; read/write
    .pzfx; plate-layout mapping.
15. **Cost and access.** "How can I access GraphPad Prism for free?";
    "trial version which has expired"; "subscription cost is high".
16. **Reproducibility, batch, automation.** "months manually clicking
    boxes" (HN 27982493); scripts have no conditionals/variables; "Copy-
    paste the wrong result" (Wildtype One). Tool must: analysis log /
    recipe; one analysis over many datasets; project captures what was done.
17. **Reporting.** Exact P, test names, effect sizes, methods text; Welch df
    reporting (…/124961, 24k views). Prism 11 made effect sizes a Pro
    feature. Tool must: copyable methods paragraph and results sentence
    with exact P, CI, effect size, test name, software version.
18. **Survival.** Pairwise log-rank after 3+ curves, HR with CI, number at
    risk (only in 10.5, Pro), Cox regression. Tool must: all of these.
19. **Nonparametric post hoc.** Dunn's / FDR after Kruskal-Wallis;
    Friedman issues (…/653137). Tool must: state adjusted vs unadjusted P
    and which correction.
20. **Outliers.** "Those values are not outliers! They are the tail of a
    lognormal distribution." Tool must: flag, not delete; record exclusions.
21. **SD vs SEM; analysis from summary data.** Paired t from means and
    errors (…/67724). Tool must: explicit error-bar labels in legends;
    summary entry with clear limits.
22. **Omics-lite.** Volcano "without using R", MA plots, heat maps, PCA,
    clustering.
23. **Platform and sharing.** No Linux; viewer cannot copy/export; named-
    user licences not on shared PCs. Tool must: any browser, share-by-link.
24. **Dot plots, beeswarms, SuperPlots.** Non-overlapping points
    (stackoverflow 78042479, 11889353); SuperPlots in Prism need manual
    recolouring per replicate. Tool must: colour points by replicate
    automatically; overlay replicate means.
25. **Quantal / proportion dose-response.** LD50 by probit/logistic with n
    per dose and CIs (…/677208, …/443078, …/23629; GraphPad FAQ).

## 2. GraphPad FAQ map (1,539 titles by theme)

| Theme | Titles |
|---|---|
| Graph, layout, colour or legend | 437 |
| Mac, Windows or OS-specific | 249 |
| Data entry, import or tables | 196 |
| Export, copy, paste or print | 187 |
| Nonlinear fit, dose-response or interpolation | 182 |
| Licence or installation | 128 |
| Axes | 117 |
| Linear, multiple or logistic regression | 99 |
| ANOVA or multiple comparisons | 81 |
| P values or reporting | 71 |
| Fonts or symbols | 59 |
| t tests or nonparametric | 57 |
| Error bars, SD or SEM | 49 |
| Survival | 41 |
| Normalize or transform | 23 |
| Contingency tables | 22 |
| Normality | 17 |
| Outliers | 13 |

GraphPad's live "popular questions" list is entirely licensing. Thirty
recurrent themes, with whether the fix is explanation (statistics) or UI
(software): licensing ×3 (software); which equation / log X (both);
ambiguous / interrupted / blank EC50 (statistics, diagnosed in UI);
constraints (software); standard-curve interpolation (software);
weighting (statistics); fit replicates vs means, averaging EC50 across
experiments (statistics); comparing fits (both); normalise before
fitting, relative vs absolute (statistics); post-test choice
(statistics); omnibus vs pairwise disagreement (statistics); two-way
family definition (both); RM / sphericity / mixed model (statistics);
nested ANOVA and technical replicates (statistics); exact vs adjusted P
(both); Dunn after KW (statistics); three-way limits (statistics);
survival data entry (software); comparing 3+ curves (statistics); median
survival CI, HR, number at risk (statistics); per-point colours
(software); axes and breaks (software); asterisks and brackets
(software); Office paste (software); TIFF/EPS/Illustrator (software);
Excel import, mean/SD/N entry, templates (software); file compatibility
(software); how to report P, cite, tails, SD vs SEM (statistics).

Takeaway: by count, software friction dominates (graphing, export,
platform, licensing, data entry); the statistical confusions are what
people actually ask on forums (post hoc, replicates, fit diagnostics,
test choice).

## 3. What GraphPad added in Prism 9, 10, 11

- **9 (2020):** PCA, multiple-variables tables with categorical data,
  categorical predictors in regression, residual plots, multiple t tests
  with Welch/paired/nonparametric, estimation plots, automatic pairwise
  annotations, bubble plots, geometric means, main-effects-only two-way.
- **10 (Nov 2023):** open .prism format, Prism Cloud, Graph Inspector,
  "one or none" P style, 2,048 columns. Point releases: 10.2 compact letter
  display, dark mode; 10.3 power/sample size (cloud), hierarchical and
  K-means clustering, dendrograms, confidence ellipses, TeX equations;
  10.4 Gaddum-Schild; 10.5 number-at-risk table (Pro), pairwise log-rank,
  CI for median survival, lognormal tests, cloud co-editing; 10.6 SVG
  export, automatic cluster count.
- **11 (Feb 2026):** calculated variables, multifactor ANOVA, t tests /
  nonlinear regression / KM from multiple-variables tables, effect sizes
  (eta², Cohen's d, Hedges' g, Cramér's V), browser upload. 11.1: bar /
  box / violin from MV tables. Almost all headline 11.x features are
  Pro/Enterprise only.

Inferred demand: tidy data and formulas, N-way designs without
reshaping, effect sizes and CIs, survival figures as published, compact
letters, SVG, clustering/heat maps/PCA, power analysis, collaboration.
GraphPad monetises these through tiers, leaving room for a free tool.

## 4. Workflows and sticking points

ELISA/BCA standard curves (finding 4PL/5PL, unknowns placement, blanks,
replicate unknowns, log X dropping unknowns); IC50/EC50 (normalise or
not, concentration 0, unconstrained plateaus, ambiguous fits, comparing
EC50s across experiments); quantal toxicity (pooled percentages fitted
with Top = 100 / Bottom = 0 draw reviewer objections); qPCR (ΔCt vs
2^-ΔΔCt, per-gene families); Western blot (control SD = 0, one-sample t
vs 1); imaging (n = cells; SuperPlots need manual recolouring and a
layout overlay); in vivo time courses (RM two-way or mixed model,
interaction significant but no per-day comparison, brackets on XY);
survival (pairwise log-rank, HR, number at risk); mixed R/Prism labs
(pivot wide, pzfx); figure assembly (Prism → EPS/PDF → Illustrator, font
and stroke fidelity); checking results in R/SPSS/Excel and hitting silent
default differences.

## 5. Reporting needs

Exact P values ("say 'the P value was 0.0234' rather than 'P < 0.05'");
journal P formats differ (APA ".123 / <.001"; NEJM two decimals, P<0.001;
GraphPad "0.1234 … <0.0001", **** below 0.0001); name the full test
("paired t test"); software with version; GraphPad's own methods
boilerplate for the mixed model (REML, compound symmetry, GG applied or
not); effect sizes and CIs ("Consider emphasizing the effect size and
confidence interval"); fractional Welch df; error-bar definition in the
legend; reviewers demand correct units of replication. Implication: APA /
NEJM / GraphPad-style results sentence and methods paragraph with effect
size and 95% CI by default.

## 6. Licensing and pricing friction

Student $142/yr, academic $260/yr, corporate $520/yr, monthly $50;
academic group $520 / 2 seats … $2,600 / 10; perpetual $1,600 / $3,200
with no upgrades or OS guarantees. Named-user licences with email login;
legacy licences expire "through some time in 2026"; Standard vs
Pro/Enterprise split (multifactor ANOVA, effect sizes, calculated
variables, clustering, number-at-risk table, MV categorical graphs are
Pro). University of Queensland: proposed 2026 pricing from A$220K to
A$2.5M/year; central funding for coursework students ends; staff steered
to SPSS, Stata, JMP, R, JASP, LabPlot. Duke +19% (2025→2026); Weill
Cornell $150/machine/yr; WashU $150/person; UCSD named-user licences not
on shared computers; Cambridge per-user charging. Free web tools now
advertise against this pricing; ggprism exists to copy the Prism look.

## Sources

GraphPad: support index and FAQ pages 931, 1462, 1066, 1859, 328, 2172,
144, 1765; user guide pages exporting_to_journals, citing_graphpad_prism,
stat_how-to-report-the-methods-used, stat_anova-approach-vs_-mixed-model,
stat_how_to_report_statistical_resu; release notes 9.0.0, 10.1.1, 10.2.0,
10.3.0, 10.5.0, 11.0.0; how-to-buy pages; new-plans and restricted-features
FAQs. Cross Validated IDs 677208, 160634, 6579, 673955, 43157, 663411,
653137, 15423, 628833, 596638, 595764, 573475, 546123, 477680, 467235,
461045, 443078, 440560, 389765, 365581, 364730, 23629, 277005, 204936,
162679, 76900, 92569, 71626, 67724, 48390, 15982, 27372, 6368, 124961.
Stack Overflow IDs 79467218, 78042479, 77986988, 75619452, 74867521,
73831753, 70284098, 69629089, 63578511, 59652913, 56500942, 56483081,
25506099, 44522293, 19049759, 11889353. Hacker News items 46783752,
46788519, 27982493, 28212043, 31210705. protocol-online posts 23504,
31549; physicsforums threads 130955, 690185; toptipbio; wildtypeone
substack; scientistinprogress review; labome method survey; zygi
bio_tool_skills; arxiv 1911.03509; sardanalab blog; Capterra and Software
Advice reviews; Yale guide; Duke, Weill Cornell, WashU, Cambridge,
Edinburgh, UCSD, UQ (snippet) licensing pages; vivusoft and metricgate
pricing posts; ResearchGate titles (403 bodies).
