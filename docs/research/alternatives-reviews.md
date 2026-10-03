# What wet-lab users want: Prism reviews, alternatives and journal rules

Research agent report, 2026-10-04. 42 searches, 10 YouTube searches by
view count, GitHub issue searches; ~49 pages in full plus YouTube
comments via API and GitHub issue bodies. Capterra fully readable (143
reviews, pages 1–6); G2, TrustRadius, Software Advice reviews,
ResearchGate, some bioRxiv, rupress.org and nature.com returned 403 or
login redirects (search summaries used). Social media not searchable.
Reviewer typos kept as written.

## 1. Top 25 needs and pains (frequency × intensity)

1. **Price, licence access, losing access after graduating.** Most
   frequent con (≥7 per 25-review page): "not affordable by students";
   "even the academic pricing is still pretty steep"; "many students used
   just craked version"; "does not offer network licenses". MetricGate:
   "a folder of .pzfx files still needs to become a thesis chapter, and
   the software that opens them is now behind a paywall". Must: free, no
   seat/account/expiry.
2. **Entering data and choosing the table type.** "options are confusing
   (column vs x-y, etc)"; "the selected format type dictates the graph
   layout"; top video 495,192 views; "multiple t tests need the data to
   be in column while grouped data need the data to be in row". Must:
   infer structure from pasted data or ask one plain question; allow
   restructuring without retyping.
3. **Automatic significance stars and brackets.** "a function should be
   written in to automatically display your statistics on the graph
   page"; videos 152,946 and 103,467 views; "Why yall doing it manually?";
   "can't put the marks on the graph". Must: one click from the post-hoc
   table, choose comparisons, no overlaps.
4. **Guidance on which test and what results mean.** Praise: "set up a
   lot of notes to help us choose the correct statistical method";
   "guides them from the moment they open it". Complaints: "brief
   description on statistical tests would help newbies"; "statistics
   poorly explained". "I can't believe no one has ever mentioned the
   narrative results checkbox". Must: guided chooser with assumption
   checks plus plain-language results paragraph.
5. **Unambiguous IC50/EC50 fitting.** IC50 videos 198,977 / 140,519 /
   117,399 / 104,955 views; "What is the difference … log(inhibitor) vs
   normalised response-variable slope"; "graph with increasing manner?";
   "Changing the value to 1 is not an appropriate solution" (zero dose);
   relative vs absolute "will not be the same". Must: a wizard handling
   zero dose, normalisation, direction, relative vs absolute, explained
   inline.
6. **Reformatting and consistency across graphs.** "I spend a decent
   amount of time stylistically reformatting"; "wish there was a way to
   set up rules across data sets and graphs"; magic wand praised and
   criticised. Must: style presets applied everywhere; "make all graphs
   like this one".
7. **Multi-panel figures and alignment.** "Moving items around on a
   figure to align … can be clunky"; "limited to one graph per page".
   Must: layout with snapping, shared axis sizes, panel letters.
8. **Excel import, paste, reshaping.** "a bug that crashes the software
   when you copy and paste from microsoft excel"; "Two-way ANOVA requires
   data transposition"; ELISA-in-Excel prep video 141,043 views; decimal-
   comma CSV errors "cryptic". Must: robust paste (decimal commas, merged
   headers), wide↔tidy, clear errors.
9. **Crashes, lag, large data.** "often shocks or crashes"; "significant
   lag when an analysis file contains multiple sheets"; "resource-
   intensive, even … 8GB of RAM". Must: responsive, autosave.
10. **Mac, Linux, version compatibility, lock-in.** "As a Mac user …
    comparability issues"; "not backward compatible"; "No native Linux
    support"; .prism "opaque, version-locked". Must: any browser, open
    .pzfx, open save format.
11. **Individual points instead of bare bars.** "86% of papers … used bar
    graphs" (Weissgerber); JCB: "the actual points should also be shown".
    Must: dots + summary default; warn on bars with small n.
12. **Replicate-aware SuperPlots and correct n.** "counting each cell as a
    separate n can easily result in false-positive rates of >50%" (Lord);
    SuperPlotsOfData requests (unequal n, SEM option, paired-line colours).
    Must: replicate column drives colour and statistics.
13. **Full statistical reporting.** Nature Portfolio summary: exact n, test
    and sidedness, test statistics, CIs, df, exact P, effect sizes; eLife:
    legends with exact n, P, inclusion criteria, replicates; Cell STAR:
    "exact value of n, and what n represents". Must: auto legend and
    methods paragraph.
14. **Estimation statistics.** DABEST: NHST "diverts attention from effect
    quantification"; estimationstats.com needs "only an internet
    connection". Must: Gardner-Altman and Cumming plots with bootstrap CIs.
15. **Reproducibility, audit trail, scripting.** "Point-and-click workflow
    doesn't document what you did"; MetricGate "every analysis shows the R
    code"; JASP "records nearly all the steps". Must: analysis log, rerun
    on new data, export equivalent code.
16. **Templates and batch for repeated assays.** "It would be wonderful if
    some of it could become automated"; "I have a big group os samples".
    Must: assay template applied to N files/plates.
17. **Gaps in advanced statistics.** "unavailable analysis requires R";
    "advanced analyses like PCA unavailable". Must: cover the bench
    toolkit; clean exit with CSV plus code.
18. **Clear post-hoc output incl. compact letters.** "The ANOVA analysis
    doesn't assign groups"; "could we do as dunkin's analysis by different
    letters"; "did not give me 4 p values only 2". Must: letters, full
    table, explain omitted comparisons.
19. **ELISA/standard-curve QC.** Videos 172,387 and 85,563; "Can you get
    LLOQ and ULOQ"; "%RE … %CV"; "dilution of serum samples?"; "S1 (30
    NG/ML) … GIVE YOU CONCENTRATION 32.45 AND NOT 30". Must: 4PL/5PL with
    weighting, back-calculated recovery, %CV per level, LLOQ/ULOQ,
    extrapolation flags, dilution factor, straight into a graph.
20. **Agreement with other software.** Prism vs SPSS RM results differed
    until GG enabled; EC50 CIs differ drc (delta) vs Prism (asymmetric on
    log EC50). Must: document every default; "why your number differs".
21. **Survival with number-at-risk table.** KM video 115,700 views; "How
    can we show … number of subject at risk"; JASP issues #3333, #3690.
    Must: KM with risk table, censor ticks, log-rank, HR with CI.
22. **Support, activation, licence admin friction.** "Terrible customer
    service"; hard-to-cancel subscription. Must: no activation, in-app help.
23. **Dated UI and hard-to-find features.** "designed in the early 90s";
    "hidden by icons that are difficult to recognize"; "Terminology unclear
    for non-native speakers". Must: command search, plain labels,
    localisation.
24. **Colour options and colour-blind safety.** "number of options for
    colours and patterns are not really great"; eLife recommends Colour
    Universal Design. Must: CVD-safe defaults; grayscale/CVD preview.
25. **Export, collaboration, privacy, web reliability.** Export praised;
    SigmaPlot lines "disappear when the graph is copied"; BioRender pitches
    live-linked slides; Shiny tools: "server down?", "Missing privacy
    policy"; client-side tools state "Data never leaves your browser".
    Must: journal-spec vector export, in-browser compute with a stated
    privacy guarantee, no server dependency, share by file or link.

## 2. Competitive feature matrix (abridged)

No single free tool covers dose-response fitting, ANOVA with stars on a
dot plot, and survival curves. JASP and jamovi lack dose-response (JASP
nls request #4570; jamovi: "if you had some R skills"). The Goedhart
tools (SuperPlotsOfData/PlotsOfData/PlotTwist) and estimationstats lack
fitting and ANOVA but set the bar for dots, SuperPlots, effect sizes,
colour-blind palettes, wide-or-tidy paste and URL-encoded settings; they
run on Shiny servers with documented outages. Online IC50 calculators do
only fitting (AAT Bioquest 4PL, "cited in 526 publications", no CI shown;
ConductScience 4PL/5PL with unverified Prism/drc claim; BioProcessTools;
CalcBe with weighting choices and extrapolation flag; elisaanalysis.com).
R (drc, ggprism add_pvalue, SuperPlotR, dabestr, survminer, pzfx) and
Python (scipy, statsmodels, pingouin, lifelines, DABEST) cover
everything but need code. OriginPro (~$755/yr), SigmaPlot (custom models
"clunky", paste problems), SPSS ("Visualizations are quite poor"). New
web challengers pitching against Prism: BioRender Graphing ($15/mo,
global fitting, KM + Cox, imports Prism files), MetricGate (freemium,
shows R code, "nonlinear fitting, global curve fitting remain stronger
in Prism"), Conspecta ("4PL only"), Plotivy, PlotNerd (five quartile
definitions, "all calculations performed locally"). AlternativeTo likes:
R 229, Matplotlib 43, JASP 33, OriginPro 27, SOFA 20 ("a wizard to help
you to select the best graph similar to GraphPad"), LabPlot 17.

Switching: toward Prism from Origin/SPSS/Excel ("more intuitive"); away
only 3 of 143 Capterra reviewers (MATLAB, SPSS, XLSTAT). Loyalty high
(4.7/5 Capterra, 93% recommend SelectHub). The opening is price and
access, not dissatisfaction with what Prism does.

## 3. Online IC50/EC50/ELISA fitters: complaints

Missing constraints (AAT "does not allow you to set the minimum and
maximum % inhibition at 0 and 100"); values differ from Prism (relative
vs absolute, CI method, replicates averaged before fitting); CIs missing
or undocumented; interpolation trust (back-calculated standard 32.45 vs
30); no batch (no plate of many compounds; no curve comparison); server
dependence. Opportunity: the only free browser fitter with a published
side-by-side validation against Prism and drc, weighting, constraints,
shared parameters, curve comparison, batch, offline.

## 4. Figure expectations 2025–2026

Show the data (JCB; Nature "Show the dots in plots": points for small n
and when significance is claimed, box plots at n ≈ 100+). SuperPlots
(colour by replicate, statistics on replicate means). Reporting (Nature
Portfolio checklist; eLife legends; Cell STAR). Estimation plots.
Colour Universal Design; eLife accepts TIFF/JPG/EPS/AI/PDF at ≥300 dpi
and ≥10 cm width. Defaults implied: dots + mean/median with SD or CI and
the error-bar definition in the legend; exact P with stars optional;
effect size and CI; replicate column; source-data CSV per panel; CVD-safe
palette; vector export at 89/183 mm or ≥10 cm.

## 5. Trust and validation

Agreement with a published reference with numbers (GraphPad's NIST FAQ
lists exactly which cases failed; StatMate: "match to at least 4 decimal
places"); citations and institutional acceptance; transparency
(MetricGate shows R code and maps Prism menus to R; PlotNerd attacks the
quartile "black box"; open source + issue trackers); explaining
discrepancies (state error term, sphericity correction, CI method,
relative/absolute IC50); data privacy ("Data never leaves your browser";
a PlotsOfData issue titled "Missing privacy policy"); smart checks that
turn out right.

## 6. Onboarding

Guided start choosing table/analysis; example data with a finished
analysis to modify (JASP Data Library, 50+ sets with analyses and
interpretations; live-updating results; jamovi "fastest onboarding";
built-in examples in PlotsOfData/estimationstats); short task videos (the
YouTube topic ranking is the curriculum: table types 495K, grouped data
326K, two-way ANOVA 226K, one-way 217K, XY graphs 208K, IC50 199K, ELISA
172K, GraphPad's own 170K, significance lines 153K, bar basics 150K,
dose-response 141K, chi-square/Fisher 129K, heat map 117K, KM 116K, qPCR
fold change 112K, t test 106K, correlation 100K, combined Y 95K,
standard curve 86K); many viewers are students and non-native speakers;
shareable state (PlotTwist URLs, "Clone current settings"); narrative
output visible by default.

## Sources

Capterra reviews pages 1–6 (+ .ie, .co.za), alternatives and SPSS
comparison; SigmaPlot reviews; Software Advice vs OriginPro; SelectHub;
SourceForge; AlternativeTo (+about); G2/TrustRadius/Software Advice
(snippets). metricgate free-alternative and pricing posts; plotivy;
conspecta; plotnerd; biorender vs prism; scientistinprogress; sci-draw;
wildtypeone; r4stats JASP; jasp-issues 279, 4570, 3384, 3333, 1475, 3690;
JASP getting started and data library; jamovi forum t=1529; ggprism;
yuejiang pzfx post; CRAN pzfx vignette; tidyplots preprint; r-statistics
drc; statmate. Goedhart: SuperPlotsOfData preprint, PlotsOfData and
PlotTwist PLOS Biology papers, GitHub issues; Lord 2020 PMC7265319;
Laylin lab SuperPlots; DABEST preprint and GitHub; Weissgerber
PMC5733595; ecrLife tools post. Fitters: aatbio, conductscience,
bioprocesstools, calcbe, GraphPad relative-vs-absolute FAQ and logEC50
page, NIST FAQ. Journals: casrai Nature Portfolio summary; eLife author
instructions; JCB, Nature s41551-017-0079, Cell STAR (snippets). YouTube
IDs M0Sl-3eu974, nCW_gfz8fJg, sA4lPpKyNyE, kpGDAetOrFo, QF6fWNzAYr0,
7NgRqXSByFo, 5IqqpKSnXfI, l9tO81ZCeRg, Ja0QMElDY6E, PraEKrhJlt8,
YKsYY6MihWU, sdN9tDIBeks, ZAEYgU_kp7I, CD9CZjzDTEE, AEJvkrl7NsU,
2js_cNqRI8Y, L_XtKqJg1ug, tsP617goc-Q, Kwm6DYnccoM, yahM5sRTlVM.
