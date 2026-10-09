# Courses and software-use surveys: digest

Output file: `courses.json` (151 observations, id prefix `courses-`). Venue A = course and workshop materials that teach GraphPad Prism and bench statistics; Venue B = studies and polls that size how many people work in each workflow.

## Coverage

Method: WebSearch to find materials, then `curl` with a browser user agent; PDFs extracted with pypdf, PPTX with python-pptx, HTML with BeautifulSoup. Every quote was checked by script as a verbatim substring of the extracted text (whitespace normalised). GitHub files read via raw.githubusercontent.com (gh-authenticated tree listing).

### Venue A: course material

| Site / institution | Documents read | Observations | Notes |
|---|---|---|---|
| bioinformatics.babraham.ac.uk (Babraham Institute) | training index; Prism course slides (257 pp), exercises (11 pp), worked answers (38 pp); Figure Design slides, Exporting Files, Submitting to Journals, data-representation exercise; Research Integrity slides = 9 | 55 | richest source; two-day 'Introduction to Statistics with GraphPad Prism', v2024-05/v2025-01 |
| github.com/niaid/Prism (NIH NIAID BCBB) | README + 8 lab PDFs (Labs 1-7, curve-fitting seminar 2010) + 2 workshop decks (Customizing Graphs; Statistical Testing pdf+pptx) = 11 | 40 | Prism 8 hands-on labs |
| bbsp710.web.unc.edu (UNC Chapel Hill) | Fall 2023 syllabus PDF + course home page = 2 | 5 | 2-credit graduate course |
| ehealth.kcl.ac.uk (King's College London) | Prism tutorial index page = 1 | 3 | titles only; tutorial pages are video-like |
| cscu.cornell.edu (Cornell CSCU) | workshop page = 1 | 1 | materials in Box (login), not read |
| gsls.cloud.opencampus.net (Würzburg GSLS) | course page = 1 | 2 | 4 x 3.5 h, 'Size: 39/15' |
| sfb1064.med.uni-muenchen.de (LMU) | workshop page = 1 | 2 |  |
| hmu.edu.krd (Hawler Medical Univ.) | 3-day agenda PDF = 1 | 2 |  |
| gms.fli.de (FLI Jena) | 2 course pages (Oct 2025, Apr 2026) = 2 | 1 | capacity 14 / 12 |
| irbbarcelona.org (IRB Barcelona) | 2 workshop pages (2023, 2025) = 2 | 2 | Prism + Illustrator |
| library.weill.cornell.edu, becker.wustl.edu, it.hms.harvard.edu, libguides.nova.edu | 4 licence/software pages | 5 | price and access signals; Nova page had nothing usable |

Blocked / unreachable / empty (no circumvention attempted):

- tess.elixir-europe.org and dev.tess.elixir-europe.org: 403 (Babraham/ELIXIR training catalogue entries)
- www.nihlibrary.nih.gov/resources/tools/graphpad-prism: 403
- medsci.ox.ac.uk (Oxford 'Analysing biological data by model fitting in GraphPad Prism' page and 2 flyer PDFs): HTTP 202 with empty body (bot challenge)
- cms-tenant.umassmed.edu workshop flier PDF: 403
- peerj.com/preprints/92 (BioStat Decision Tool, common mistakes): 403
- shnaton.huji.ac.il (Hebrew University syllabus): connection failure (000), twice
- pharfac.mans.edu.eg (Mansoura Prism workshop): connection failure (000)
- gradschool.weill.cornell.edu 2021 syllabus PDF: 404
- sites.tufts.edu listing: 404
- uni-goettingen.de 682150 and onishlab.colostate.edu workshop pages: 200 but no Prism content on page
- GRADE Frankfurt (Goethe University): no Prism course page found by search; only the general GRADE good-research-practice programme
- Yale / UCSF / Johns Hopkins / Crick / EMBL / CRUK: no reachable Prism course material found by search (only licence pages for Harvard, WashU, Weill Cornell, Rochester, Pitt)
- Cornell CSCU workshop files: hosted in Cornell Box (login wall), not read

### Venue B: software-use surveys and polls

| Source | Read | Observations |
|---|---|---|
| pmc.ncbi.nlm.nih.gov PMC13352756 (Forero 2026, BMC Res Notes, n=1740 articles) | full text | 3 |
| pmc.ncbi.nlm.nih.gov PMC7870941 (Gosselin 2021, Sci Rep, 223 preclinical articles) | full text | 4 |
| pmc.ncbi.nlm.nih.gov PMC6326723 (Weissgerber 2018, eLife, 328 physiology articles) | full text | 5 |
| pmc.ncbi.nlm.nih.gov PMC4406565 (Weissgerber 2015, PLoS Biol, 703 articles) | full text | 3 |
| pmc.ncbi.nlm.nih.gov PMC9366861 (Riedel 2022, Clin Sci, 227,998 papers) | full text | 1 |
| pmc.ncbi.nlm.nih.gov PMC5902037 (Lazic 2018, PLoS Biol) | full text | 1 |
| pmc.ncbi.nlm.nih.gov PMC6093658 (Diong 2018, PLoS One, 401 papers) | full text | 3 |
| labome.com (Statistical Analysis Software Programs in Biomedical Research) | full page (first guessed URL 404; correct URL found by search, 200) | 4 |
| protocol-online.org BioForum thread 'Graphing + statistical softwares' (2011) | 1 thread, 8 posts | 3 |
| rcop.michaeljfox.org 'Stats software insights, which one and why?' (2025) | 1 thread, 12 posts (Discourse JSON of the same page) | 4 |
| nzmsj.scholasticahq.com statistics primer (2022) | PDF | 2 |

Not read: ResearchGate polls (not attempted; expected 403), biostars/seqanswers (no relevant software-share poll surfaced in search).

## Top tags

| Tag | Count |
|---|---|
| which-test | 21 |
| learning-curve | 20 |
| graph-formatting | 16 |
| teaching | 13 |
| reporting-methods | 12 |
| ic50-ec50-setup | 11 |
| show-the-points | 10 |
| fit-diagnostics | 10 |
| nonparametric | 10 |
| excel-paste | 9 |

## Canonical tasks taught across courses (task-frequency signal)

Ten courses with readable curricula: Babraham (B), NIAID BCBB labs (N), Cornell CSCU (C), Würzburg GSLS (W), LMU SFB1064 (L), Hawler Medical University (H), FLI Jena (F), IRB Barcelona (I), UNC BBSP 710 (U), KCL Life Science Tutorials (K). A course counts when its published agenda, slides or exercises teach the task.

| Task | Courses | Which |
|---|---|---|
| Making and formatting graphs | 10 | B, N, C, W, L, H, F, I, U, K |
| Data entry, table types, Excel/CSV import | 9 | B, N, C, W, L, H, F, I, K |
| Descriptive statistics, SD vs SEM vs CI, error bars | 8 | B, N, C, W, L, H, U, K |
| t-test (unpaired / paired) | 6 | B, N, C, W, U, K |
| One-way ANOVA | 6 | B, N, C, W, U, K |
| Linear regression | 6 | B, N, C, W, U, K |
| Checking normality / test assumptions | 5 | B, N, C, W, K |
| Repeated-measures ANOVA | 5 | B, N, W, U, K |
| Nonlinear regression / dose-response IC50-EC50 | 5 | B, N, W, U, K |
| Contingency tables: chi-square / Fisher | 5 | B, N, C, U, K |
| Survival (Kaplan-Meier, log-rank) | 5 | N, H, W, U, K |
| Choosing the right test (decision tree) | 5 | B, N, W, I, U |
| Two-way ANOVA | 4 | B, C, W, U |
| Nonparametric tests (Mann-Whitney, Wilcoxon, Kruskal-Wallis, Friedman) | 4 | B, N, W, U |
| Multiple comparisons / post-hoc choice | 4 | B, N, W, U |
| Export to Word/PowerPoint/journal formats | 4 | N, H, F, I |
| Correlation (Pearson / Spearman) | 3 | B, C, U |
| Outlier handling / excluding values | 3 | B, N, U |
| Frequency distribution / histogram | 3 | B, N, U |
| Figure layout / assembly (Layouts, Illustrator) | 3 | N, F, I |
| Reporting methods and results | 3 | B, N, U |
| Power / sample size (taught in G*Power or NQuiry, not Prism) | 2 | B, U |
| Comparing curves / global fit / shared parameters | 2 | B, N |
| Experimental design, technical vs biological replicates | 2 | B, U |
| Logistic regression (optional topic) | 2 | W, U |
| Axis breaks | 1 | N |
| Area under the curve | 1 | K |
| Three-way ANOVA | 1 | U |

Reading: graphing, data entry and descriptive statistics/error bars are taught almost everywhere; the core inferential set is t-test, one-way ANOVA (with post-hoc), linear regression, repeated measures, dose-response fitting, contingency and survival. Power analysis is taught in both courses that cover it, but always with a separate tool (G*Power, NQuiry).

## Software-use survey numbers

- **Preclinical (cell and animal models), PubMed Central 2021+2023, n=1740 articles across 9 designs** (Forero 2026): GraphPad Prism is the most reported package for preclinical research, 48.4%; overall across all designs SPSS 37.1%, R 14.6%, Stata 12.5%, none reported 8.9%, Prism 8.8%, SAS 7.6%. Software not reported in 17.0% of animal-model and 15.7% of cell-model papers.
- **Preclinical, 223 articles in 16 journals, 2019** (Gosselin 2021): Prism mentioned in 59.01% of articles, SPSS 16.22%, R 4.50% (only open-source package). Tests: one-way ANOVA 53.15%, unpaired t-test 38.74%, two-way ANOVA 28.83%, t-test of undefined type 26.83%, Mann-Whitney 19.37%, RM one-way ANOVA 9.46%. Insufficient reporting: tests 44.8%, software 31%, sample sizes 44.2% (journal medians).
- **Labome survey of formal publications since 2006**: article counts GraphPad (Prism/InStat) 101, Excel 17, Origin 15, SPSS 13, R 6, Stata 5, Matlab 3.
- **Physiology journals, June 2017, 328 articles** (Weissgerber 2018): 84.5% used ANOVA or t-test; ANOVA 68.6%, t-test 54.5%; 95% of ANOVA papers did not say which ANOVA; 26.7% did not name the post-hoc test; 60.9% of one-way ANOVA users had two or more factors; 53% did not say paired/unpaired; t-statistic missing in 95.7%.
- **Physiology journals, 2014, 703 articles** (Weissgerber 2015): 85.6% used bar graphs for continuous data, 77.6% of those with mean ± SE; 13.4% used univariate scatterplots; median minimum group n = 4 (IQR 3-6).
- **PubMed Central, 23 fields, 227,998 papers, 2010-2020** (Riedel 2022): bar graphs of continuous data in 4-58% of papers per field in 2020, highest in biochemistry/cell biology, physiology, pharmacology, oncology, immunology.
- **J Physiol + Br J Pharmacol, 401 papers** (Diong 2018): 76-84% used SEM, 2-4% plotted raw data, 90-96% gave no exact p-values, 56-63% called p between 0.05 and 0.1 a trend or significant.
- **Animal offspring studies 2011-2016** (Lazic 2018): 22% genuine replication, 46% pseudoreplication, 32% unclear.
- **Forum polls**: Protocol Online 2011 (7 replies), Prism named by 5 of 8 posters, Excel 3, R 2, SPSS 2, SigmaPlot 2. MJFF data community 2025 (12 posts): R/Python dominate for large data; Prism and SPSS used 'for small data biostatistics'; a grant reviewer asked whether Prism alone covers a trainee's analyses.
- **Licence prices seen on institutional pages**: Weill Cornell $150/year/machine (stated as 60% below public pricing, students one free licence); WashU $150 per person-year or per machine-year, not prorated; Harvard requires departmental billing, hospital affiliates ineligible, up to 8 business days to provision.

## Twenty strongest observations

- **courses-gosselin-prism-share** (pmc.ncbi.nlm.nih.gov, slows the work): "The most frequently used software was determined to be Prism (mentioned in 59.01% of publications, k = 223) and SPSS (16.22%). The only non-proprietary package mentioned in the sampled articles is R (used in 4.50% of articles)."  
  https://pmc.ncbi.nlm.nih.gov/articles/PMC7870941/
- **courses-pmc-forero-prism-preclinical** (pmc.ncbi.nlm.nih.gov, slows the work): "For preclinical research, such as cell models and animal models, the proprietary GraphPad Prism software was the most frequently reported (48.4%)."  
  https://pmc.ncbi.nlm.nih.gov/articles/PMC13352756/
- **courses-gosselin-test-frequency** (pmc.ncbi.nlm.nih.gov, slows the work): "The most frequently used tests were one way analysis of variance (ANOVA; used in 53.15% of articles, k = 223 articles), two way ANOVA (28.83%), repeated measure one way ANOVA (9.46%), unpaired Student’s t test (38.74%) and Student’s t test of undefined laterality (26.83% of articles)."  
  https://pmc.ncbi.nlm.nih.gov/articles/PMC7870941/
- **courses-weissgerber2018-oneway-misuse** (pmc.ncbi.nlm.nih.gov, wrong result risk): "Among papers that used one-way ANOVAs, 60.9% (67/110) used a one-way ANOVA for an analysis where the study design included two or more factors."  
  https://pmc.ncbi.nlm.nih.gov/articles/PMC6326723/
- **courses-lazic2018-pseudoreplication** (pmc.ncbi.nlm.nih.gov, wrong result risk): "We found that only 22% of studies (95% CI = 17%–29%) had genuine replication and thus made valid statistical inferences. Nearly half of the studies (46%, 95% CI = 38%–53%) had pseudoreplication while 32% (95% CI = 26%–39%) did not provide enough information to determine if N corresponds to genuine replication or pseudoreplication."  
  https://pmc.ncbi.nlm.nih.gov/articles/PMC5902037/
- **courses-weissgerber2015-bar-graphs** (pmc.ncbi.nlm.nih.gov, wrong result risk): "Bar graphs were the most commonly used figures for presenting continuous data. 85.6% of papers included at least one bar graph. Most of these papers used bar graphs that showed mean ± SE (77.6%, Panel B in S2 Fig ), rather than mean ± SD (15.3%)."  
  https://pmc.ncbi.nlm.nih.gov/articles/PMC4406565/
- **courses-diong2018-sem-exact-p** (pmc.ncbi.nlm.nih.gov, wrong result risk): "76-84% of papers that plotted measures to summarize data variability used standard errors of the mean, and only 2-4% of papers plotted raw data used to calculate variability."  
  https://pmc.ncbi.nlm.nih.gov/articles/PMC6093658/
- **courses-weissgerber2018-anova-type** (pmc.ncbi.nlm.nih.gov, wrong result risk): "However, papers in our sample were routinely missing essential information about both types of tests: 213 papers (95% of the papers that used ANOVA) did not contain the information needed to determine what type of ANOVA was performed, and 26.7% of papers did not specify what post-hoc test was performed."  
  https://pmc.ncbi.nlm.nih.gov/articles/PMC6326723/
- **courses-babraham-sl-decision-tree** (www.bioinformatics.babraham.ac.uk, blocks the analysis): "Start Differences? How many factors? Two or more Two-way ANOVA, General Linear (Mixed) Model, etc. One Same or different subjects? Same Parametric Paired T test/repeated ANOVA Non-parametric Wilcoxon paired test"  
  https://www.bioinformatics.babraham.ac.uk/training/GraphPadPrism/Intro%20to%20statistics%20with%20GraphPad%20Prism%20slides.pdf
- **courses-babraham-ex-rm-anova-neutrophils** (www.bioinformatics.babraham.ac.uk, wrong result risk): "A researcher is looking at the difference between 4 cell groups. They have run the experiment 5 times. Within each experiment, they have neutrophils from a WT (control), a KO, a KO + Treatment 1 and a KO + Treatment2."  
  https://www.bioinformatics.babraham.ac.uk/training/GraphPadPrism/GraphPad%20Prism%20Exercises.pdf
- **courses-babraham-ans-paired-graph** (www.bioinformatics.babraham.ac.uk, wrong result risk): "It is misleading to show a p-value associated with a paired t-test without showing the pairing on the graph (as in the first plot). It is preferable to show what has actually been tested, by either showing the pairing on the plot or plotting the differences between the groups, as in the second and third plots."  
  https://www.bioinformatics.babraham.ac.uk/training/GraphPadPrism/GraphPad%20Prism%20Exercises%20Worked%20Answers.pdf
- **courses-babraham-ans-stack-of-p** (www.bioinformatics.babraham.ac.uk, slows the work): "For this, we need to run 3 separate tests to get results for the individual comparisons (i.e. Rockhampton vs Mackay, Rockhampton vs Bowen, and Mackay vs Bowden), then add the resulting p-values to a column table and select “Analyse a stack of P values” to get multiple comparison corrections"  
  https://www.bioinformatics.babraham.ac.uk/training/GraphPadPrism/GraphPad%20Prism%20Exercises%20Worked%20Answers.pdf
- **courses-babraham-ans-correlation-workaround** (www.bioinformatics.babraham.ac.uk, slows the work): "If we run a non-linear regression, but choose a linear model this gives us many more options, including normality testing and outlier identification."  
  https://www.bioinformatics.babraham.ac.uk/training/GraphPadPrism/GraphPad%20Prism%20Exercises%20Worked%20Answers.pdf
- **courses-babraham-ans-outlier-policy** (www.bioinformatics.babraham.ac.uk, wrong result risk): "You should state how you will deal with outliers before seeing your data, and be consistent across experiments (i.e. do not delete them when you get a significant result without them and leave them in when you get a significant result with them)."  
  https://www.bioinformatics.babraham.ac.uk/training/GraphPadPrism/GraphPad%20Prism%20Exercises%20Worked%20Answers.pdf
- **courses-babraham-sl-what-is-n** (www.bioinformatics.babraham.ac.uk, wrong result risk): "• Design 1: One value per glass slide e.g. cell count • After quantification: 6 values • Sample size: n = 1 • no independence between slides • variability = pipetting/measurement error"  
  https://www.bioinformatics.babraham.ac.uk/training/GraphPadPrism/Intro%20to%20statistics%20with%20GraphPad%20Prism%20slides.pdf
- **courses-niaid-l1-table-choice** (github.com, blocks the analysis): "The choice you make about how to format your data table is important. If you don't choose the appropriate kind of data table, you won't be able to make the kind of graph you want or perform the analyses you have in mind."  
  https://github.com/niaid/Prism/blob/master/Lab-1/1.Create%20and%20Edit%20Data%20Tables.pdf
- **courses-niaid-st-fisher-silent** (github.com, wrong result risk): "In Prism, if you enter huge numbers (the sum is greater than 1,000,000), it will perform the chi-square test even if you chose Fisher's test."  
  https://github.com/niaid/Prism/blob/master/Workshops/Practical%20Training%20on%20GraphPad%20Prism%20for%20Statistical%20Testing/Graphpad%20Prism%20-%20Statistical%20testing%20(upload).pptx
- **courses-niaid-st-mixed-missing** (github.com, wrong result risk): "Under this experimental design, if there is missing values, mixed effects model will be performed instead of ANOVA. Result only meaningful if the values are missing for random reasons."  
  https://github.com/niaid/Prism/blob/master/Workshops/Practical%20Training%20on%20GraphPad%20Prism%20for%20Statistical%20Testing/Graphpad%20Prism%20-%20Statistical%20testing%20(upload).pptx
- **courses-niaid-l6-no-crosstab** (github.com, slows the work): "You must enter data in the form of a contingency table. Prism cannot cross- tabulate raw data to create a contingency table."  
  https://github.com/niaid/Prism/blob/master/Lab-6/6.%20Categorical%20data%20analysis.pdf
- **courses-niaid-l2-ambiguous-fit** (github.com, wrong result risk): "The control results are labeled ambiguous. This means that Prism is unable to find a unique curve through the data. Lots of other sets of parameter values would lead to curves that fit just as well."  
  https://github.com/niaid/Prism/blob/master/Lab-2/2.Visualization.pdf
- **courses-nzmsj-point-click-reanalysis** (nzmsj.scholasticahq.com, slows the work): "It encourages a point-and-click approach, and while this can be very appealing for beginners, we find that this approach makes it much harder for researchers to update or expand the statistical analyses they’ve performed."  
  https://nzmsj.scholasticahq.com/api/v1/articles/36704-what-statistical-software-should-i-use-and-does-it-actually-matter.pdf
- **courses-hms-licence-eligibility** (it.hms.harvard.edu, blocks the analysis): "GraphPad Prism is available to members of Harvard University, including Faculty, Staff and Students who are working within a lab or department that will provide funding for software purchases using the Harvard University 33-digit billing system. Note – Hospital affiliates are not eligible for this service."  
  https://it.hms.harvard.edu/service/graphpad-prism

## Surprising

- Course material is a map of workarounds: Babraham's worked answers teach running *nonlinear* regression with a straight-line model to get outlier detection and residual tests for a correlation, re-entering three separate 2x2 tests and pasting their p-values into an 'Analyse a stack of P values' table to correct a chi-square post-hoc, and a four-step 'Remove baseline and column math' detour to plot paired differences.
- Both courses that teach power analysis use a separate program (G*Power; NQuiry). The Babraham slides warn that G*Power's defaults are one-tailed with 95% power.
- The NIAID statistical-testing deck notes that Prism silently computes chi-square instead of Fisher's test when the table total exceeds 1,000,000, and that missing values silently switch RM ANOVA to a mixed model.
- The NIAID Lab 4 advises against Welch's correction ('used rarely, so don't check it unless you are quite sure'), while the survey literature (Weissgerber 2018) flags unstated equal-variance assumptions as a reporting failure: course advice and meta-research disagree.
- Prism's share is design-specific: about half of preclinical papers (48-59%) but under 9% of all biomedical/health papers, so the bench workflow is the niche where it dominates.
- UNC's BBSP 710 moved from 'mastery of graphing and statistical analysis using GraphPad Prism' (2023 syllabus) to 'trying out a variety of statistical and graphical software and coding options' (current site).
- Würzburg's four-morning Prism course shows 'Size: 39/15', which reads as demand well above capacity.

## Proposed new tags

- `repeated-measures`: the same subject, culture or experiment is measured under several conditions or times (paired/matched/RM designs, sphericity, matched blocks); distinct from `two-way-anova` and `mixed-model-missing-values`. Used 8 times.
