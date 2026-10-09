# Competitor signals: what rival tools' trackers, changelogs and forums say bench scientists need

233 observations in `competitor-signals.json` (id prefix `competitor-`). Every quote was checked by script against the saved page or API text (whitespace-normalised substring match): 0 mismatches. Competitor product pages are treated as demand signals: they record what each vendor thinks the pain is, not what a user said, so they carry `role: null` and `signal.source: "competitor page"`.

## Coverage

| Source | What was read | Observations | Status |
|---|---|---|---|
| BarelySig GitHub (BooneAndrewsLab/BarelySig) | All 122 issues (96 closed, 26 open), every body and all 24 comments (all by the maintainer), via `gh issue list --state all`. Also the README, CLAUDE.md, the v1.0.0 release note, and 44 design notes (downloaded and grepped; intros of notes 10, 12, 13, 15, 30 and 43 read in full). | 71 | Reachable. Repo created 2026-09-24, v1.0.0 on 2026-09-29, 0 stars and 0 reactions. Every issue was written by the maintainer; user words appear only where the maintainer relays them. |
| BioRender Graphing | Launch blog (2026-05-21), product page /product/graph, /vs/prism comparison page, University of Rochester IT notice about the classic-Graph retirement. | 15 | help.biorender.com returned **403** to curl and to WebFetch (one try each), so it is unreachable. No changelog or community pages found outside the help centre. |
| Plotivy (plotivy.app) | Home (v1.5.0, last updated 2026-02-22), FAQ, About, blog index (82 posts listed), 'GraphPad Prism vs Excel' and 'Free plotting tools comparison 2026'. Use-cases, techniques, tools and plot-reviewer pages were fetched and skimmed. Public GitHub repo fravil92/PLOTIVY.PUBLIC has 0 issues. | 8 | Reachable. |
| PlotNerd (plotnerd.com) | Home, 'PlotNerd vs GraphPad Prism', Updates/changelog (v2.2 to v3.1.1). GitHub paradoxie/plotnerd-public has 0 issues. | 5 | Reachable. It is a box-plot and quartile calculator, not a Prism-scope tool. |
| MetricGate (metricgate.com) | Home (an app shell), docs index, blog index, and 7 Prism-related blog posts (fetched). Read in full: affordable alternative, survival curves, vs Prism, ANOVA. | 10 | Reachable. |
| Conspecta | conspecta.com returns 200 but is a **parked 'domain for sale' page**. conspecta.io serves the same JS shell on every route and 301-redirects to conspecta.bio. Read on conspecta.bio: /alternatives/graphpad-prism, /platform/data-tables, /platform/figures, /blog. | 10 | The real product is at conspecta.bio. |
| jamovi forum (forum.jamovi.org) | 40 search terms, including prism, graphpad, biology, IC50, dose response, western, qPCR, ELISA, survival, Kaplan, posthoc, error bars, significance, asterisks, plot editor, standard curve, two-way repeated, SEM, replicates, excel and copy paste. That gave 360 topics, all fetched and parsed. 102 bench-relevant topics were read (first post plus up to 5 replies). | 51 | Reachable. IC50, qPCR, ELISA, western blot and Dunnett returned 0 hits. |
| jamovi GitHub (jamovi/jamovi) | 12 search terms gave 59 issues. 14 were read in full with comments. | 7 | Reachable. |
| JASP GitHub (jasp-stats/jasp-issues) | 24 search terms gave 215 issues. 70 were read in full (body plus first 5 comments, with reactions). | 42 | Reachable. 'dose response', IC50, biolog and western blot returned 0 hits. |
| JASP forum | forum.jasp-stats.org: no response (curl status 000), so it is unreachable. JASP's real forum is on forum.cogsci.nl. 24 search terms there listed about 100 discussions, and 21 were read in full. | 14 | forum.jasp-stats.org is unreachable; forum.cogsci.nl is reachable. |
| Other | Searched for other browser-based Prism-like tools. alternativeto.net/software/graphpad-prism and capterra.com returned **403** (Cloudflare challenge). JASP release notes (jasp-stats.org/release-notes) were read to check shipped status. The jamovi release-notes page returned an empty JS shell. | 0 | Blocked or used for context only. |

Skipped as instructed: the R ggprism, ggpubr and survminer trackers.

## Ten most frequent tags

| Tag | Count |
|---|---|
| graph-formatting | 39 |
| error-bars-sd-sem | 20 |
| learning-curve | 17 |
| numbers-differ-between-tools | 16 |
| which-test | 16 |
| survival | 16 |
| repeated-measures | 14 |
| data-entry-table-types | 13 |
| reproducibility-audit | 13 |
| reporting-methods | 13 |

Severity mix: slows the work 109, wrong result risk 55, blocks the analysis 36, cosmetic / preference 33.

## Twenty strongest observations

Chosen for user voice (not vendor copy), engagement, and severity.

1. **competitor-jaspforum-10022b** (forum.cogsci.nl (JASP forum); blocks the analysis; replies: 6). [link](https://forum.cogsci.nl/discussion/10022/standard-error-of-the-mean-sem-and-asterisks-in-t-test-graphs)  
   > -Is there a way to plot SEMs on the bars? -Also, could JASP graphically represent the “asterisks” between the different conditions?  
   *Need:* SEM bars plus significance asterisks on the test's own plot

2. **competitor-jaspforum-10022e** (forum.cogsci.nl (JASP forum); blocks the analysis; replies: 6). [link](https://forum.cogsci.nl/discussion/10022/standard-error-of-the-mean-sem-and-asterisks-in-t-test-graphs)  
   > Considering that the vast majority do not know how to code (and will not learn...), JASP seems like a credible option to us.  
   *Need:* Full point-and-click workflow for t-tests and ANOVA

3. **competitor-jaspforum-10022c** (forum.cogsci.nl (JASP forum); slows the work; replies: 6). [link](https://forum.cogsci.nl/discussion/10022/standard-error-of-the-mean-sem-and-asterisks-in-t-test-graphs)  
   > Showing each replicate on the graph is now practically mandatory for figures.  
   *Need:* Every replicate shown as a point by default

4. **competitor-barelysig-73** (github.com/BooneAndrewsLab/BarelySig; blocks the analysis; state: closed, comments: 0, reactions: 0, source: issue tracker). [link](https://github.com/BooneAndrewsLab/BarelySig/issues/73)  
   > User: "help me choose must be much better, must be intuitive for even the dumbest of the biologists who are clueless about stats. also the help me choose UI is awkward"  
   *Need:* A one-question-at-a-time guide in bench language with an 'I'm not sure' option and a single Run button

5. **competitor-biorender-5** (biorender.com; wrong result risk; source: competitor page, kind: testimonial). [link](https://www.biorender.com/vs/prism)  
   > We'd been running ANOVAs in Prism for years. When I imported those same files into BioRender Graphing, it flagged a non-parametric test as more appropriate, and it was right.  
   *Need:* Assumption checks that flag when a different test fits the data

6. **competitor-jamovi-4043** (forum.jamovi.org; slows the work; views: 108665, replies: 1). [link](https://forum.jamovi.org/viewtopic.php?t=4043)  
   > The major advantage of GraphPad Prism over Jamovi is its integrated plot editor. It is also quite easy to assign the same plot design to multiple plots or arrange several plots on one page for a combined graph.  
   *Need:* Click-to-edit plots, reusable styles and multi-panel layouts

7. **competitor-jamovi-1232** (forum.jamovi.org; blocks the analysis; views: 10786, replies: 1). [link](https://forum.jamovi.org/viewtopic.php?t=1232)  
   > I would like to know if there is any (except scripting by hand in R) way of importing Graphpad files into Jamovi This would help a lot of my students to switch...  
   *Need:* Import Prism project files

8. **competitor-jasp-1668b** (github.com/jasp-stats/jasp-issues; wrong result risk; state: closed, comments: 14, reactions: {'thumbs_up': 8}). [link](https://github.com/jasp-stats/jasp-issues/issues/1668)  
   > That would be SO helpful. A lot of time wasted editing plots - and it's error prone too.  
   *Need:* Brackets generated from the test results

9. **competitor-jamovi-1259** (forum.jamovi.org; wrong result risk; views: 13325, replies: 3). [link](https://forum.jamovi.org/viewtopic.php?t=1259)  
   > I have found a workaround for this: I have added a new row with "3" option marked and created the box plot. Since the new plot is an outlier, represented as a small dot, I have deleted the "dot" from the exported image in MS Paint  
   *Need:* Manual axis ranges so no one adds fake data to fix a scale

10. **competitor-jamovi-3801** (forum.jamovi.org; wrong result risk; views: 39094, replies: 7). [link](https://forum.jamovi.org/viewtopic.php?t=3801)  
   > <Minimum means the amount of sample was below the detection level of the assay. Is it OK to use 0 in these cases?  
   *Need:* Guidance and options for values below/above the standard-curve range

11. **competitor-jamovi-1449** (forum.jamovi.org; blocks the analysis; views: 6869, replies: 1). [link](https://forum.jamovi.org/viewtopic.php?t=1449)  
   > I use Flow Cytometry to collect my data, and because of the high variability found in most Cytometers, analysis between experiments from different days is often considered non-viable.  
   *Need:* Analyses that treat experiment day as a block/random effect, with replicates handled correctly

12. **competitor-barelysig-13n** (github.com/BooneAndrewsLab/BarelySig; wrong result risk; source: design note). [link](https://github.com/BooneAndrewsLab/BarelySig/blob/main/docs/design/13-nested-tables-superplots.md)  
   > built to fix pseudoreplication (treating hundreds of cells as if n = hundreds, when n is really the number of independent experiments).  
   *Need:* Nested tables, SuperPlots and tests that use the experiment as n

13. **competitor-metricgate-7** (metricgate.com; wrong result risk; source: competitor page, kind: blog). [link](https://metricgate.com/blogs/graphpad-prism-alternative-for-survival-curves/)  
   > This is a quiet failure rather than a loud one: survfit() and coxph() drop incomplete rows through na.action, so the curve and the p-value still come out right — but nrow(long) is now three times your sample size, and if you quote that as n in a methods section nobody downstream will catch it.  
   *Need:* Report the true number of subjects per group with the result

14. **competitor-jasp-1123** (github.com/jasp-stats/jasp-issues; wrong result risk; state: closed, comments: 9, reactions: {'thumbs_up': 2}). [link](https://github.com/jasp-stats/jasp-issues/issues/1123)  
   > Dunn's test under the ANOVA section produces unadjusted p-values (they're exactly half) that do not match other softwares (GraphPad PRISM v9.0.0, R v3.6.2).  
   *Need:* Two-sided by default, with sidedness stated

15. **competitor-jasp-1227** (github.com/jasp-stats/jasp-issues; wrong result risk; state: closed, comments: 2, reactions: 0). [link](https://github.com/jasp-stats/jasp-issues/issues/1227)  
   > I'm sure you can tell I'm not a stats expert but I'm worried I'm introducing statistical bias in using these tiny and shrinking error bars, especially since all the papers in my field use SPSS and I have never come across this correction before.  
   *Need:* Make the correction optional and state it on the plot

16. **competitor-jamovigh-369** (github.com/jamovi/jamovi; wrong result risk; state: open, comments: 6, reactions: 0). [link](https://github.com/jamovi/jamovi/issues/369)  
   > In this case, the plots for the same group pre- and post-intervention aren't on the same scale.- in fact, it looks like group A's scores decreased post-intervention, whereas they actually increased).  
   *Need:* Plot paired variables on one shared axis

17. **competitor-jamovi-1529** (forum.jamovi.org; blocks the analysis; views: 6262, replies: 1). [link](https://forum.jamovi.org/viewtopic.php?t=1529)  
   > I'm working in screening facility at Montpellier CNRS France. I would like to do dose-response analysis. Have you got any module that does this analysis ?  
   *Need:* Dose-response curve fitting with EC50/IC50

18. **competitor-barelysig-88** (github.com/BooneAndrewsLab/BarelySig; wrong result risk; state: open, comments: 0, reactions: 0, source: issue tracker). [link](https://github.com/BooneAndrewsLab/BarelySig/issues/88)  
   > Grouped assumes column 0 holds row titles, so it silently misaligns the headers by one column and produces a garbled table instead of refusing to fit.  
   *Need:* Layout detection for two-header-row nested files that refuses rather than guesses

19. **competitor-conspecta-1** (conspecta.bio; slows the work; source: competitor page, kind: comparison page). [link](https://conspecta.bio/alternatives/graphpad-prism/)  
   > The friction is upstream of the graph. You paste or import numbers into a Prism file, graph them, and end up with a figure that's disconnected from the analysis those numbers came from.  
   *Need:* Figures linked to their upstream analysis

20. **competitor-jamovi-3987** (forum.jamovi.org; wrong result risk; views: 46846, replies: 6). [link](https://forum.jamovi.org/viewtopic.php?t=3987)  
   > If I want to export my deskriptive table into Excel to work with it, some values are interpreted as high values, because Excel interpretes the point as a thousend separator (for example: 3.908 is interpreted as 3908).  
   *Need:* Locale-aware decimal separators on copy/export

## What competitors have already shipped vs what is still open

**BarelySig.** This is the closest copy of a Prism-style browser workflow: WebR in a worker, Prism table types, R-oracle validation. It went from 0 to v1.0.0 in 5 days.
- *Shipped (closed issues):* Excel/Sheets/LibreOffice paste with locale handling; summary-data entry; t tests (also from summary data); Mann-Whitney and Wilcoxon with exact P; one-way ANOVA with Tukey/Dunnett/Šidák/Bonferroni, Welch and Brown-Forsythe; Kruskal-Wallis and Friedman with exact P and Dunn; two-way ANOVA, including unbalanced designs and unweighted means from summary data; repeated-measures one-way and two-way ANOVA (one or both factors repeated, with comparisons and the no-sphericity method); Nested tables with REML nested t and ANOVA, matched (paired) nested tests and SuperPlot colouring; contingency tables (chi-square, Fisher, OR); linear regression and correlation; XY scatter, connected-line, trace and error-band graphs; 4PL dose-response (agonist and inhibitor, standard slope, normalised) with constraints, global fits, extra sum-of-squares/AICc comparison, profile-likelihood CIs, weighting and standard-curve interpolation; Gompertz growth curves; normalise-to-control as a calculated table; CSV/XLSX/ODS import with layout guessing; significance brackets from analyses (draggable, Prism or APA star schemes); a guided "Help me choose"; plain-language margin notes; SVG/PNG export at journal widths with an embedded "figure recipe" that reopens the exact figure; PWA offline mode; undo.
- *Still open:* Kaplan-Meier survival (#40); multi-panel figure layouts (#41, the user's request); **Prism .pzfx import (#42)**; real clipboard captures (#44); comparisons in a two-way ANOVA with an empty cell (#52); SuperPlot over a violin (#74); t test on replicate means and nested nonparametric/two-way designs (#76, #78, #79); contingency graph, relative risk, and the chooser for XY and contingency tables (#86); Nested-layout import (#88); logistic growth, windowed regression and phase shading (#101–103); the wider curve library (Michaelis-Menten, exponential, Gaussian; #107); several nonlinear option combinations (#109–#117); marginal histograms (#119); one-sample t test (#120).

**BioRender Graphing** (launched 2026-05-19, $15/mo add-on).
- *Shipped:* drag-in Prism/CSV/Excel files with replicate detection; ROUT outlier flagging with one-click exclusion; normality and variance pre-tests with a plain-language test recommendation; t, ANOVA and nonparametric tests; dose-response 3/4/5PL with global fitting and an EC50 F-test comparison; Kaplan-Meier, log-rank and Cox; heatmaps and well-plate heatmaps; Style Match; live links to PowerPoint and Google Slides; real-time co-editing with version history.
- *Open:* violin, forest and volcano plots ("coming in late 2026"). The free tier is 1 file with 3 datasets. Classic Graph files did not migrate automatically: users had to export and re-upload.

**JASP.**
- *Shipped:* a plot editor (axes, since 0.15); Plot Builder (beta, 0.95+) with p-value and comparison lines; raincloud plots; survival analysis (KM, Cox, parametric); the Morey error-bar correction made optional (0.19); copy/paste with headers.
- *Open or partial:* editing multi-panel plots, including KM plots with a risk table (#1354, reopened); stars on test plots outside Plot Builder (#3876); axis breaks (#1906); concentration-response fitting (#4482, no response yet); export of plot data (#3917) and of .xlsx data (#611); numeric plot sizing (closed as a duplicate, not built).

**jamovi.**
- *Shipped:* a 2.7 "Plots" tab with custom axes and box-plot labels; PPTX export (2.7); a decimal-symbol option (2026); white-background PNG export (2.7.26).
- *Not available:* dose-response or nonlinear regression; Prism file import ("not at this time"); click-to-edit plots ("on our todo list" since 2018); significance brackets in core (only the third-party jjstatsplot module); header-row paste.

**Conspecta** (conspecta.bio). Ships 4PL dose-response and ELISA fits, ΔΔCt, Welch/MW/ANOVA/KW tests with brackets drawn on the figure, figures linked to their source analyses, and 24 layout presets. By its own account it lacks survival, repeated-measures and mixed models, ROC and contingency tests, and models beyond 4PL.

**MetricGate.** Runs R-backed calculators, including KM, ANOVA and Tukey. It "cannot open .pzfx" and tells users to keep Prism for figures and the 4PL dialog.

## Anything surprising

- **BarelySig has no outside users on its tracker yet.** All 122 issues were written by the maintainer (#86 carries a "Generated with Claude Code" footer), and none has reactions. Its "user" lines (#41, #59, #60, #73, #74, #93, #94, #118, #119) are a lab colleague's feedback relayed by the maintainer. It is a strong signal of *scope* (it reached near-Prism breadth in about 10 days) but a weak signal of *demand*. The most vivid relayed quote is #73: "intuitive for even the dumbest of the biologists who are clueless about stats".
- **"Wrong" usually means "different method".** jamovi, JASP and MetricGate users repeatedly report post-hoc or CI numbers that "don't match SPSS/Prism": jamovi 959, 1191, 3802 and 4040; JASP 1123, 1227, 2127 and 3426; forum 5364. These turn out to be one-sided vs two-sided P, estimated marginal means vs separate t tests, Morey-corrected bars, or a different Conover formula. The bench-user need is a *stated method plus a reconciliation note*, not only a correct number.
- **Users corrupt data to work around missing formatting.** In jamovi-1259 a user added a fake data row to force an axis range, then painted the point out of the PNG. In JASP-2120 a user built a fake dataset to plot published means and SDs.
- **BioRender's lead testimonial sells test-choice correction:** "it flagged a non-parametric test as more appropriate, and it was right." Wrong-test anxiety is being marketed directly.
- **Psychology-first tools miss bench idioms.** The jamovi developer said a line graph was "the first request we've received" (social-science bias). IC50 and western blot returned 0 hits on both the jamovi forum and the JASP tracker (qPCR and ELISA returned 0 on the jamovi forum and only incidental matches on JASP), while biologists who do show up (JASP forum 10022, 10068; jamovi 1309, 1393, 1529, 3720, 3801) ask for exactly these: SEM bars, asterisks, every replicate shown, italic gene names, log titres, dose-response, and detection limits.
- **Assay detection limits** (<LLOQ / >ULOQ, jamovi-3801) came up with no tool offering guidance.
- conspecta.com is a parked domain; the product lives at conspecta.bio.

## Proposed new tags

- `repeated-measures`: the same subject, animal or culture is measured under several conditions or times (RM ANOVA, sphericity and Geisser-Greenhouse, matched post-hoc tests, paired plots). Used 14 times. TAGS.md has no tag for this, although SCHEMA.md's example uses it.
- `limit-of-detection`: values below or above an assay's detection or standard-curve range (<LLOQ, >ULOQ) and how to handle them in statistics. Used once.
