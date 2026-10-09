# GitHub issues and discussions: needs catalogue digest

`github.json` holds **463 observations** from about 400 distinct issue and discussion pages in 61 repositories. They were gathered in two passes: part A covered the R ecosystem, and part B covered non-R tools plus a global GitHub search. Every quote was checked programmatically against the cached text of the page it came from: 0 failures.

Three NormaliseForIC50 observations turned up in both passes. The part-B copies were dropped when the passes were merged.

Severity: wrong result risk 162, slows the work 141, blocks the analysis 100, cosmetic / preference 60. A role is stated (in the post or the author's GitHub bio) for 149 of 463.

Observations per repository: kassambara/ggpubr 82, kassambara/rstatix 49, jasp-stats/jasp-issues 39, kassambara/survminer 37, jbengler/tidyplots 32, ACCLAB/dabestr 29, DoseResponse/drc 17, csdaw/ggprism 16, raivokolde/pheatmap 15, jamovi/jamovi 11, Yue-Jiang/pzfx 9, albertopessia/drda 8, JoachimGoedhart/SuperPlotsOfData 8, BooneAndrewsLab/BarelySig 8, raphaelvallat/pingouin 7, trevismd/statannotations 7, JoachimGoedhart/VolcaNoseR 6, TKMarkCheng/NormaliseForIC50 6, NoahHenrikKleinschmidt/qpcr 5, JoachimGoedhart/PlotsOfData 4, statsmodels/statsmodels 4, CamDavidsonPilon/lifelines 4, ACCLAB/DABEST-python 4, cytoflow/cytoflow 4, CellProfiler/CellProfiler 3, kusterlab/curve_curator 3, angelovangel/tidydrc 2, DoseResponse/medrc 2, jbloomlab/neutcurve 2, maximtrp/scikit-posthocs 2, mwaskom/seaborn 2, kirkebylab/LUMIN 2, ulido/pzfx_parser 2, qupath/qupath 2, whitews/FlowKit 2, RobertsLab/resources 2, IBL-bioinfo/IBL-bioinformatics-wiki 2, Biomiha/prism2R 1, JoachimGoedhart/BA-plotteR 1, LifeScienceHub/IC50 1, fslaborg/FSharp.Stats 1, tBuLi/symfit 1, CenterForOpenScience/modular-file-renderer 1, ucscXena/ucsc-xena-client 1, calkit/calkit 1, tompollard/tableone 1, WhitakerLab/scona 1, bio-ml/pyzyme 1, bendichter/brokenaxes 1, dcwuser/metanumerics 1, lmfit/lmfit-py 1, cBioPortal/cbioportal 1, fiji/fiji 1, taborlab/FlowCal 1, kynnemall/superviolin 1, flatironinstitute/CaImAn 1, laasfeld/Aparecium 1, PhilPalmer/AutoPlate 1, KlementineJBS/USYD_PhD_ELN 1, narunlifescience/AlphaPlot 1, auerbachs/BMDExpress-2 1

## Coverage

### Part A: R ecosystem

**Method.** `gh api` (authenticated) REST `repos/{o}/{r}/issues?state=all&per_page=100 --paginate` pulled every issue of every repo below (bodies included). GraphQL pulled all Discussions where enabled (csdaw/ggprism: 7, jbengler/tidyplots: 82). Comments were fetched per issue (`repos/{o}/{r}/issues/{n}/comments`) for every issue read in depth. Quotes were then verified against the public HTML of each page, fetched with fetch.py (all 200). Author roles come from `users/{login}` bios and are filled only where the bio states a role or field (93 of 323). All raw JSON is cached in `github_a/cache/`. That includes issues, comments, discussions, users and search results.

**Repos and issues listed (non-PR issues):**
- Small repos, every issue read: csdaw/ggprism (25 + 7 discussions), Yue-Jiang/pzfx (12), cran/ggprism (1, a duplicate of an upstream issue), DoseResponse/drc (42), DoseResponse/medrc (9), albertopessia/drda (7), angelovangel/tidydrc (2), CancerRxGene/gdscIC50 (5), LifeScienceHub/IC50 (3), nickytong/drexplorer (3), rcgsheffield/graphpadexport (1), Biomiha/prism2R (1), PhilPalmer/AutoPlate (41, all filed by the developer), TKMarkCheng/NormaliseForIC50 (17, all filed by the developer), Bayer-Group/DoRiS (13, developer to-dos), JoachimGoedhart/SuperPlotsOfData (9), PlotsOfData (14), PlotTwist (5), PlotsOfDifferences (5), VolcaNoseR (19), BA-plotteR (1), quantixed/SuperPlotR (0), cran/pzfx (0), cran/drc (issues disabled).
- Large repos, all titles scanned and candidates read in full with comments: kassambara/ggpubr (630), kassambara/rstatix (229), kassambara/survminer (592), raivokolde/pheatmap (92), jbengler/tidyplots (85 issues + 82 discussions), ACCLAB/dabestr (103).
- Total: 1,966 issues listed and title/body scanned. **About 300 issues and discussions read in full with their comments** (260 comment threads cached, plus issues without comments and the discussion threads).

**Searches run.**
- Repo discovery: `gh search repos` with `language:R` for ic50, dose-response, graphpad, prism, superplot and drc. This added gdscIC50, drda, medrc, AutoPlate, NormaliseForIC50, tidydrc, graphpadexport, prism2R, DoRiS, drexplorer, LifeScienceHub/IC50 and SuperPlotR.
- `search/issues` with `repo:` qualifiers: 78 queries (6 large repos × 13 terms: prism, graphpad, excel, illustrator, colorblind, dunnett, two-way, "repeated measures", ic50, normalize, superplot, export, svg). 17 of these were rate-limited by the search API (HTTP 403 secondary rate limit). For those I grepped the complete local issue dump for the same terms instead, so coverage is equivalent.
- The other keywords in the brief (asterisk, p-value, p.adj, error bars, replicates, kaplan, hazard ratio, pdf, post hoc, tukey, paired, bracket, label, significance) were covered by reading the full title list of every large repo, not through separate API calls.

**Unreachable.** None. Every github.com issue and discussion page fetched with HTTP 200. cran/drc has issues disabled, so it has no venue. Long threads (>~40 comments, e.g. ggpubr#65) hide middle comments behind "Load more" in the HTML. One quote from such a hidden comment failed verification and was dropped rather than altered.

**Caveats.** Several dose-response and Shiny-app repos (AutoPlate, NormaliseForIC50, DoRiS, most PlotTwist and PlotsOfData issues) are developer to-do lists. I used only the NormaliseForIC50 ones (5): its author is a resident doctor and visiting researcher building the tool for his own lab's neutralisation assays. Maintainer-filed audit bugs in ggpubr and rstatix from 2026 (e.g. ggpubr#783: error bars drawn on the neighbouring bar) were **not** counted as user needs. Five survminer issues are user e-mails relayed by the maintainer, and their role field says so.

### Part B: non-R tools and global search

- Observations: 143 from 117 distinct issue/discussion pages, 44 repositories. verify.py: `143 observations, 0 with problems`.
- Issue/discussion pages read in full with all comments (via `gh api` issues + comments endpoints, GraphQL for discussions): 131. Text written to the shared fetch cache under the exact html URL; raw JSON in `github_b/cache/`.
- Search queries run: 67 (REST `search/issues` and GraphQL `type: DISCUSSION`), plus `gh search repos` for ic50, dose-response, superplot, qpcr, elisa, flow cytometry, graphpad, standard curve, and full issue listings (`repos/{o}/{r}/issues?state=all`) for 15 repos: BarelySig, NormaliseForIC50, cytoflow, FlowCal, FlowKit, thunor, curve_curator, superviolin, AlphaPlot, xstars, BMDExpress-2, eleven, Auto-qPCR, NoahHenrikKleinschmidt/qpcr, FlowCytometryTools.
- Repos with hits used: jasp-stats/jasp-issues (39 obs), jamovi/jamovi (11), BarelySig (8), pingouin (7), statannotations (7), qpcr (5), statsmodels, lifelines, DABEST-python, cytoflow, NormaliseForIC50 (4 each), CellProfiler, curve_curator (3), plus ~30 others with 1-2.
- Searched with no usable bench-scientist hits: pingouin for prism/graphpad (0 hits); imagej/ImageJ and fiji/fiji (only 1 relevant, fiji#158); qupath statistics (mostly scripting/dev); BooneAndrewsLab/BarelySig exists but is a one-developer roadmap, so only the 8 issues that relay explicit user feedback were used; ELISA repo search returned only unrelated projects (KDE Elisa, etc.); thunor, xstars, Auto-qPCR, eleven had no relevant user issues.
- Global searches: `"graphpad prism"` was flooded by ~100 identical mactype fork issues (excluded with NOT); `"like prism"`, `"same as prism"`, `"differs from prism"`, `"prism gives"` are dominated by PrismJS/Prisma/Prism Launcher/ruby prism and gave no bench hits. Productive global queries were `graphpad is:issue`, `"graphpad" ic50`, `"prism" "ic50"`, `pzfx`, `"prism" tukey/dunnett`.
- Excluded as not user voice (judged from titles/bodies in search results): apparently agent-generated or developer-planning issues (johannehouweling/vitro-crate, jiazhenz026/SciStudio, 0xaicrypto/heurion, harbor-framework task proposals, annayzhu/Microplate-Assay-Analysis-Studio), crack/patcher repos, autopkg install recipes, Chinese WeChat repost mirrors (ixxmu/mp_duty), R-package repos (part A scope: pzfx, ggprism, rstatix, ggpubr, survminer).
- UNREACHABLE: none. All access was via authenticated `gh api`; the search API's 30 req/min limit was respected with throttling. No archives, caches or proxies used.
- Role field: filled only from the issue text or a GitHub bio that states a role/field (`users/{login}`); otherwise null.

Queries (total_count, query):

```
204	"graphpad prism" is:issue
6	"like graphpad" is:issue
104	"graphpad prism" is:issue NOT mactype NOT grphpad
6	"graphpad" ic50 is:issue
28	"same as prism" is:issue
7	"differs from prism" is:issue
52	"prism gives" is:issue
112	graphpad is:issue NOT mactype NOT grphpad NOT "graphpad prism"
9	repo:jasp-stats/jasp-issues is:issue "prism"
6	repo:jasp-stats/jasp-issues is:issue "graphpad"
209	repo:jasp-stats/jasp-issues is:issue "excel"
5	repo:jasp-stats/jasp-issues is:issue "asterisk"
16	repo:jasp-stats/jasp-issues is:issue "error bars"
241	repo:jasp-stats/jasp-issues is:issue "repeated measures"
150	repo:jasp-stats/jasp-issues is:issue "post hoc"
32	repo:jasp-stats/jasp-issues is:issue "two-way"
149	repo:jasp-stats/jasp-issues is:issue "missing values"
140	repo:jasp-stats/jasp-issues is:issue "mixed model"
2	repo:jamovi/jamovi is:issue "prism"
2	repo:jamovi/jamovi is:issue "graphpad"
5	repo:jamovi/jamovi is:issue "error bars"
32	repo:jamovi/jamovi is:issue "post hoc"
44	repo:jamovi/jamovi is:issue "repeated measures"
26	repo:jamovi/jamovi is:issue "missing values"
0	repo:jamovi/jamovi is:issue "asterisk"
110	repo:jamovi/jamovi is:issue "export"
16	repo:jamovi/jamovi is:issue "svg"
0	repo:raphaelvallat/pingouin is:issue prism
0	repo:raphaelvallat/pingouin is:issue graphpad
13	repo:raphaelvallat/pingouin is:issue "mixed" missing
14	repo:raphaelvallat/pingouin is:issue spss
88	repo:ACCLAB/DABEST-python is:issue
4	repo:statsmodels/statsmodels is:issue prism
2	repo:CamDavidsonPilon/lifelines is:issue prism
1	repo:CamDavidsonPilon/lifelines is:issue "hazard ratio" spss
1	repo:CellProfiler/CellProfiler is:issue statistics export excel
5	repo:CellProfiler/CellProfiler is:issue "per well" mean
33	repo:qupath/qupath is:issue export measurements
8	repo:qupath/qupath is:issue statistics
1	repo:imagej/imagej is:issue excel
2	repo:fiji/fiji is:issue excel
2	repo:fiji/fiji is:issue statistics
5	repo:imagej/ImageJ is:issue measurements
10	graphpad
5	"graphpad prism"
1	prism anova
28	prism "p value"
0	prism ic50
1	superplot
2	"dose response" ic50
10	"biological replicates" statistics
32	"technical replicates"
6	"error bars" SEM
11	"two-way anova"
26	"which statistical test"
10	"kaplan meier" p-value
1	qpcr "delta delta"
37	plate reader standard curve
1005	"like prism" is:issue
43	pzfx is:issue -repo:Yue-Jiang/pzfx
26	"prism" "ic50" is:issue
5	"in prism" "p value" is:issue
2	"in prism" anova is:issue
3	"prism" "dunnett" is:issue
13	"prism" "tukey" is:issue
96	repo:trevismd/statannotations is:issue
3	repo:mwaskom/seaborn is:issue "standard error" sem
```

## Ten most frequent tags

| tag | count |
|---|---|
| significance-brackets | 62 |
| numbers-differ-between-tools | 58 |
| multiple-comparisons | 47 |
| post-hoc-choice | 42 |
| graph-formatting | 41 |
| survival | 40 |
| trust-validation | 39 |
| reporting-methods | 31 |
| ic50-ec50-setup | 28 |
| error-bars-sd-sem | 25 |

## Twenty strongest observations

1. **github-ggpubr-293-1** (https://github.com/kassambara/ggpubr/issues/293; kassambara/ggpubr; wrong result risk)  
   Requested p-value adjustment was silently not applied to plotted pairwise comparisons.  
   > 2 years on and this bug still lurks. How many papers have boxplots with unadjusted p-values on them?
2. **github-jasp-1123-1** (https://github.com/jasp-stats/jasp-issues/issues/1123; jasp-stats/jasp-issues; wrong result risk)  
   Dunn's p-values are half of Prism/SPSS because the tool silently runs one-sided tests.  
   > Dunn's test under the ANOVA section produces unadjusted p-values (they're exactly half) that do not match other softwares (GraphPad PRISM v9.0.0, R v3.6.2).
3. **github-ggpubr-560-1** (https://github.com/kassambara/ggpubr/issues/560; kassambara/ggpubr; wrong result risk)  
   Paired test silently paired the wrong samples because pairing relied on row order.  
   > The problem was that the data.frame I used for plotting was not sorted by the ID of the patients. Therefore, the samples wer incorrectly paired by stat_compare_means().
4. **github-jamovi-790-1** (https://github.com/jamovi/jamovi/issues/790; jamovi/jamovi; wrong result risk)  
   A level name clashing with a variable name silently produced completely wrong RM ANOVA p-values.  
   > In jamovi I get p < .001, p = .025 and p = .014 In SPSS I get p = .382, p = .945 and p = .756
5. **github-dabestr-106-1** (https://github.com/ACCLAB/dabestr/issues/106; ACCLAB/dabestr; wrong result risk)  
   Paired CI wrong; work rejected after validation in another package.  
   > Today morning my work was rejected by a statistical reviewer at my client due to this issue, as they used SAS to validate the outcome.
6. **github-jasp-4520-1** (https://github.com/jasp-stats/jasp-issues/issues/4520; jasp-stats/jasp-issues; wrong result risk)  
   Decimal-comma numbers display correctly but are computed as thousands.  
   > For example, 6,2 is shown as 6,2 in "Edit data" but calculated as 6200.
7. **github-pingouin-199-1** (https://github.com/raphaelvallat/pingouin/issues/199; raphaelvallat/pingouin; wrong result risk)  
   Subjects missing the second session silently produced absurdly small p-values.  
   > I ran mixed_anova function with the data, discovering that the results were extremely significant, to an absurd extent (very low p-uncorrected value).
8. **github-ggpubr-36-1** (https://github.com/kassambara/ggpubr/issues/36; kassambara/ggpubr; wrong result risk)  
   Changing the axis to log for appearance changed the test result.  
   > when I transformed the ylim with log10 I just want to make the distribution looks more beautiful. the results will change totally.
9. **github-tidyplots-25-1** (https://github.com/jbengler/tidyplots/issues/25; jbengler/tidyplots; wrong result risk)  
   SD error bars drawn at twice the true SD.  
   > When drawing the graphs with this package I noticed that the standard deviation values are double of the actual ones.
10. **github-statsmodels-8619-1** (https://github.com/statsmodels/statsmodels/issues/8619; statsmodels/statsmodels; wrong result risk)  
   Two-stage BKY q-values came back re-ordered and above 1; user validated against Prism output.  
   > it sometimes but not always returns results in sorted order, which does not mach input order. ... it returns values above 1  results from `fdrcorrection_twostage` and `multipletests` should match but only results from `multipletests` seems to be correct compared to results from Prism
11. **github-neutcurve-27-1** (https://github.com/jbloomlab/neutcurve/issues/27; jbloomlab/neutcurve; wrong result risk)  
   Moving data by hand into a separate curve-fitting program introduces errors; lab learns Python to avoid it.  
   > The problem is that we need GraphPad Prism software to generate the dose-response curve. And by using outsourced softwares, we have to manually explore and clean our data, which makes mistakes easier to happen.
12. **github-ggpubr-205-1** (https://github.com/kassambara/ggpubr/issues/205; kassambara/ggpubr; wrong result risk)  
   Correlation p-value printed on the plot differed from the base statistical test (2.2e-16 vs 0.33).  
   > Someone notice a weird p-value in my correlation plot. When I checked the spearman test from `stat_cor` is different from the one given by `cor.test`.
13. **github-dabestr-193-1** (https://github.com/ACCLAB/dabestr/issues/193; ACCLAB/dabestr; wrong result risk)  
   Paired bootstrap resampled arms independently, destroying pairing; R and Python versions disagree.  
   > Consequently, for every paired or repeated-measures design, the **point estimate is correct but the confidence interval is the unpaired one**, which is far too wide whenever the within-pair correlation is high.
14. **github-drc-33-1** (https://github.com/DoseResponse/drc/issues/33; DoseResponse/drc; wrong result risk)  
   Same data give different fitted parameters on different operating systems.  
   > All the estimates are slightly but I believe not negligibly different. Do you have any insights into how I can improve the reproducibility of the results?
15. **github-drc-4-1** (https://github.com/DoseResponse/drc/issues/4; DoseResponse/drc; wrong result risk)  
   Many fits return implausibly large EC50 (extrapolated) values.  
   > Out of ~89,000 curves fit, 3,589 had values outside of the range of values (>~115) produced by a different tool
16. **github-jasp-342-2** (https://github.com/jasp-stats/jasp-issues/issues/342; jasp-stats/jasp-issues; blocks the analysis)  
   Field convention (letters) unsupported, so a whole discipline finds the tool unsuitable.  
   > In plant science this way of summarizing the results of statistic tests is extremely prevalent (by which I mean almost omnipresent). ... That is why the lack of it makes JASP a lot less interesting for scientists active in the plant science field since it takes quite some time to generate the significance 'levels' (with a, b, etc) by hand.
17. **github-rstatix-101-1** (https://github.com/kassambara/rstatix/issues/101; kassambara/rstatix; slows the work)  
   Dunn's test vs a reference group not available; users bounce data between tools.  
   > It would be great if we can do this without transferring datasets back and forth to graphpad or other software.
18. **github-jasp-1227-1** (https://github.com/jasp-stats/jasp-issues/issues/1227; jasp-stats/jasp-issues; wrong result risk)  
   Silent Morey correction shrinks error bars; non-expert fears it misrepresents data.  
   > I'm sure you can tell I'm not a stats expert but I'm worried I'm introducing statistical bias in using these tiny and shrinking error bars, especially since all the papers in my field use SPSS and I have never come across this correction before.
19. **github-scikit-posthocs-74-1** (https://github.com/maximtrp/scikit-posthocs/issues/74; maximtrp/scikit-posthocs; wrong result risk)  
   Same post hoc test goes by different names across tools; had to trial-and-error to reproduce Prism.  
   > I had some difficulties replicating the Friedman test with Dunn's correction that I was using in Prism. ... I ended up trying nemenyi, conover and siegel, and siegel was the test that was able to exacly replicate my Prism results.
20. **github-jasp-3566-1** (https://github.com/jasp-stats/jasp-issues/issues/3566; jasp-stats/jasp-issues; blocks the analysis)  
   Plate-reader data analysis is locked in closed vendor software or ad-hoc scripts.  
   > Biotek and other OD readers have closed programs to analyze data. for bacterial growth curves, ELISA test, etc.. work arounds are R, matlab and python scripts, but not in a handy way. It would great to be able to import OD reads from 96-well plates, and easily plot curves, run standard curves, fit growth models (e.g., logistic or Gompertz curves), and do statistics between curves.

## Surprises and patterns

### Part A: R ecosystem

- **The leading theme is wrong results that look right.** 109 of 323 observations are "wrong result risk". Again and again the plot looked correct while the statistics were wrong or mislabelled:
  - correction not applied (ggpubr #59, #119, #293, #435; tidyplots #142)
  - pairing done by row order (ggpubr #560; rstatix #136, #192; tidyplots D32)
  - display transforms changing the test (ggpubr #36, #193)
  - wrong n (rstatix #147, #175; dabestr #73; survminer #36, #337, #592)
  - error bars at the wrong size or on the wrong bar (tidyplots #25; ggpubr #71, #147, #426)

  Users mostly found these by cross-checking against another tool ("numbers-differ-between-tools" is the 2nd most frequent tag, 37).
- **Users repeatedly ask which test or correction was run.** Many issues come down to that question (ggpubr #44, #102, #471; rstatix #23, #124). Users writing methods sections cannot find the answer.
- **Significance brackets are the most frequent tag (47).** Common requests:
  - brackets over the right sub-group in grouped plots
  - brackets on log axes
  - hiding ns
  - compact letter display
  - brackets from externally computed p-values
  - p-value formats (P < 0.001, 1×10⁻¹⁰, trailing zeros, journal styles)
- **Commercial tools are the reference point for correctness.** Users validate against GraphPad (rstatix #101, Dunn's test vs control), SAS (dabestr #106), SPSS (rstatix #74, #225), jamovi/JASP (rstatix #50, #54) and EstimationStats web vs R (dabestr #94, #102, #119). Different defaults confuse them: pooled vs unpooled SD, type II vs type III SS, one- vs two-sided Dunn's test, exact vs approximate Wilcoxon.
- **Dose-response:** the users here are rarely pharmacologists asking basics. The problems they report:
  - convergence failures with no explanation
  - EC50 extrapolated far outside the tested range (drc #4)
  - relative vs absolute EC50 (tidydrc #1)
  - EC50 CI vs plotted band (drda #5)
  - fits that differ by OS (drc #33)
  - log-dose vs dose model choice (drda #12)
  - the most complete package going unmaintained for 4 years (drc #43, 7 reactions)
- **Lock-in to the commercial file format matters:**
  - the new .prism format broke the open reader (pzfx #20)
  - users want to write summary-data and grouped tables back out for collaborators (pzfx #11 with 19 comments, #18)
  - comma decimals in German/Dutch files (pzfx #9)
- **Web-app fragility and privacy:** Shiny apps (PlotsOfData, VolcaNoseR, SuperPlotsOfData) are often down or hit upload limits right before dissertations and theses. A user asked what happens to unpublished data uploaded to them (PlotsOfData #10). This points to an offline, in-browser tool that stores nothing.
- **Survival:** many issues concern the number-at-risk table (alignment, wrong counts, wrong labels) and exporting compound figures (curve + table) to PDF or PowerPoint.

### Part B: non-R tools

- **Cross-tool disagreement is the dominant theme** (numbers-differ-between-tools 21, trust-validation 17). Users routinely run the same data in 2-3 programs (Prism, SPSS, JASP, R, DATAtab) and file issues when p-values differ. Causes are mundane but invisible: one- vs two-sided defaults (JASP Dunn), different post hoc variants sharing a name (Conover vs Siegel-Castellan vs Dunn), undisclosed error-bar corrections (Morey), row-order pairing (pingouin, statannotations), locale parsing. Prism output is repeatedly used as the reference answer (statsmodels BKY, scikit-posthocs Friedman, lifelines KM CI, JASP Dunn).
- **Silent wrong answers beat crashes as the scary failure.** Several of the strongest reports are tools that ran without error and produced wrong numbers (jamovi naming clash, pingouin dropouts and sorting, JASP 9999 and decimal comma, FlowKit compensated channels). Users explicitly ask tools to refuse or warn instead.
- **Significance annotation is a recurring, cross-tool pain** (15): stars on plots, brackets placed badly, reorder breaks brackets, corrected vs raw p-values mixed on the plot, and the compact-letter (a/b/ab) convention which is near-mandatory in plant science.
- **Post hoc/multiplicity menus are a battleground**: FDR and specifically the two-stage BKY method ("only ever seen in Prism"), Dunnett vs control, uncorrected p-values for external correction, supervisors demanding LSD/SNK. Users want the method named exactly and the sidedness stated.
- **Prism's table model is what bench users miss** in case-per-row tools: one column per group, replicate subcolumns, summary-data entry (mean/SD/n), and a 'block/experiment' factor. Maintainers of general stats tools often push back ("a little unusual"), which shows the gap.
- **Image-analysis / instrument outputs end in a CSV the graphing tool can't read** (LUMIN, CaImAn, QuPath, Fiji, CellProfiler, cytoflow, CFX Maestro, BioTek): users ask how to get per-cell or per-well numbers into Prism/Excel.
- **Vector export is fragile on macOS** (jamovi crash on EPS/SVG, missing fonts; cytoflow EPS/PDF), and the BioRender handoff loses styling.
- Institutions treat Prism as the validated standard (Leiden IBL policy) and want a validation track record before approving any other tool.

## Gaps

- GitHub issues over-represent R-literate users (bioinformaticians, biostatisticians, postdocs). Bench scientists who never open an R issue are under-represented. Roles were stated in only 93 of 323 cases.
- I did not read issues in ggplot2 itself, ggsignif, ggstatsplot, emmeans, ComplexHeatmap, EnhancedVolcano or ggsurvfit. These are probably rich in similar needs; ggsignif and ggstatsplot are good next targets.
- Long ggpubr threads (#65, 41 comments; #102) hide middle comments in the HTML, so only visible comments could be quoted.
- 17 `search/issues` calls were rate-limited. They were replaced by local grep over the full dumps, so no issues were missed, but those searches are not recorded as API results.

- jasp-issues and jamovi each have hundreds more issues; only targeted keyword searches were read (about 60 jasp/jamovi pages). Topics like survival, contingency, ROC, regression in those trackers were not mined.
- CellProfiler/QuPath/ImageJ statistics needs mostly live on forum.image.sc, not GitHub; not covered here.
- FlowJo itself has no public GitHub tracker; flow-cytometry coverage is via FlowKit/cytoflow/FlowCal only.
- GitHub Discussions search returned little bench content (mostly AI-benchmark proposals); only 7 discussion threads were usable.
- No ELISA- or western-blot-specific non-R repos with user issues were found; western-blot-densitometry, colour-blind (1), illustrator-handoff (2) and powerpoint (0) are thin.
- NormaliseForIC50 is an R package but was explicitly in this venue's scope. BarelySig observations are user feedback relayed by its developer, not first-hand posts; weight accordingly.

Proposed new tags (not added to TAGS.md): `repeated-measures` (used closest: mixed-model-missing-values), `compact-letter-display` (used closest: significance-brackets).

## Proposed new tags

The agents proposed these; the coordinator decided which to add to TAGS.md.

- `repeated-measures`, proposed by both passes; `mixed-model-missing-values` was used meanwhile.
- `compact-letter-display`, proposed by both passes; `significance-brackets` / `post-hoc-choice` were used.
- `paired-data`, for pairing by subject ID versus row order; `trust-validation` / `long-vs-wide` were used.
- `software-updates-break-scripts`; `reproducibility-audit` was used.
