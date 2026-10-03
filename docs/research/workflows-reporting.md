# Bench-science analysis workflows: specs from primary sources

Research agent report, 2026-10-04. ~45 searches, ~65 fetches (~50 full:
GraphPad guides and FAQs, Bio-protocol full texts via Europe PMC, PMC
papers, Nature/eLife/Cell/ARRIVE/SAMPL checklists, vendor app notes).
Forum sources were mostly blocked, so most "pain" evidence comes from
GraphPad's own documented limitations, methodological critiques and
Hacker News. Inferences are marked [inference].

## 1. Cell viability / cytotoxicity IC50, plus synergy

Inputs: 96/384-well reads (absorbance, luminescence, fluorescence);
medium blanks, vehicle (DMSO-matched) = 100%, no-cell or kill control =
0%; screening assays add high/low control columns (HTRF: high and low;
BRET: col 11 = 100%, col 12 = 0%). Preprocessing: blank subtraction;
%viability = (test − medium)/(cell ctrl − medium) × 100; %inhibition =
100 − [(Smax − Sx)/(Smax − Smin)] × 100; log10 concentration ("graphing
the logarithm of X is not the same as graphing the logarithmic axis");
plate QC Z′ ≥ 0.5, replicate CV ≤ 15%; ratio readouts per well.
Analysis: default "log(inhibitor) vs. response – variable slope"; with
good controls either the normalized model or 4PL with Bottom = 0 / Top =
100 ("The decision to constrain Top and Bottom is quite distinct from
the decision to normalize"); relative IC50 (default) vs absolute (GI50,
"undefined" if the curve never crosses 50%); do not weight normalised
data; 5PL for asymmetry; 5–10 concentrations; "EC50 should be within
range of your data". Synergy: SynergyFinder long format (block_id,
drug1, drug2, conc1, conc2, response, conc_unit; response declared as
viability or inhibition); HSA, Bliss, Loewe, ZIP (partial designs only
Bliss/HSA); baseline correction; per-dose and summary scores, landscapes,
CSS. Chou–Talalay median-effect (Dm, m), CI < 1 synergy; Prism does not
compute CI. Outputs: IC50 with 95% CI ("45.8 nM (95% CI: 35.1–59.3
nM)"), Hill slope, plateaus, number of experiments, logIC50 mean ± SD
across experiments. Figure: log10[drug] vs % with mean ± SD and curve.
Mistakes: raw concentrations on a log-stretched axis; undefined plateau;
relative/absolute mix-up; forced 0–100 with poor controls; IC50 outside
range. Pains: HN "often requires expensive software like GraphPad
Prism"; no plate-map import or Z′ in Prism [inference]; no synergy.

## 2. ELISA and standard curves

Inputs: standards in duplicate plus unknown ODs; Prism: "it is essential
that the unknowns go below the standard curve values". Preprocessing:
blank subtraction, average duplicates with %CV, log X, %B/B0 for
competitive. Analysis: 4PL with X = log(conc), 5PL only for
"reproducible asymmetry"; weighting judged by back-calculated accuracy;
interpolated X returns as log and must be back-transformed ("Prism isn't
smart enough to adjust the column titles"); multiply by dilution. QC
(FDA/ICH M10): back-calculated standards within ±20% (±25% at LLOQ/
ULOQ), ≥75% of standards and ≥6 levels pass, CV ≤ 20% (≤25% at LLOQ);
spike recovery and dilutional linearity 80–120%; parallelism %CV
20–30%; MRD; report "<LLOQ" / ">ULOQ", never extrapolate. Outputs:
dilution-corrected concentration with mean and CV, parameters,
back-calc table, flags. Mistakes: R² as proof; 5PL to chase an outlier;
ignoring residual patterns. Pains: layout rules, no automatic
back-transform/dilution step, no acceptance report [inference].

## 3. qPCR

Inputs: Cq/Ct export (sample, target, reference genes, well, technical
replicates); RDML/RDES (MIQE 2.0). Preprocessing: average technical
replicates (within ~0.5 Ct, distrust Ct > 35); ΔCt; ΔΔCt; 2^−ΔΔCt;
efficiency %E = 100 × (10^(−1/slope) − 1); efficiency-weighted wΔCt =
log2(E_t)·Ct_t − log2(E_r)·Ct_r; geometric mean of reference genes. MIQE
2.0 (2025) "strongly recommend[s] against relying on the ΔΔCq approach".
Analysis: statistics on ΔCt (log scale), never on fold changes; back-
transform mean and CI → fold change with asymmetric CI; GraphPad: test
log(ratios), one-sample t against 0. Outputs: geometric fold change with
95% CI, P from the ΔCt test, efficiency and R², n biological. Figure:
fold change with control = 1 on a log2 axis ("Convert that Y axis into
a log base 2 axis, and everything makes more sense"), individual
replicates, asymmetric bars. Mistakes: averaging fold changes; reversed
subtraction; unvalidated GAPDH; assuming 100% efficiency; stats on raw
Cq. Pain: Prism has no qPCR module; ΔCt in Excel first.

## 4. Western blot densitometry

Inputs: per-lane intensities (ImageJ, Image Lab, Image Studio): target,
loading control or total-protein stain, local background.
Preprocessing: band − background; target/reference; fold change vs mean
control within blot; JBC prefers total-protein normalisation; linear
range; Degasperi 2014: single-fixed-point normalisation "tends to
increase the mean CV" and "greatly increases… false negatives".
Analysis: ratio paired t test with blot as pairing unit (GraphPad
example: paired t P = 0.07, ratio t P = 0.0005, ratio 0.496, CI
0.463–0.531); RM one-way on logs or mixed model for 3+ groups. Figure:
representative blot plus dot/bar fold change with control = 1 and
paired lines. Mistakes: saturated bands; unstable housekeeping (2% with
tubulin vs 19% with total protein); stripping losses; control = exactly
1 then t test against SD 0. Pain: the "normalise to 1 then t test" trap;
users do not know the ratio t test [inference].

## 5. Flow cytometry summary statistics

Inputs: FlowJo Table Editor export (rows = samples; Count, Freq. of
Parent, median/geometric-mean MFI, CV). Preprocessing: parse sample
names into group/animal/timepoint; median MFI (arithmetic mean
unsuitable, ICCS); fold change vs FMO/isotype; logit for percentages
near 0/100 with asymmetric back-transformed SD. Analysis: t/ANOVA per
population or multiple t tests with FDR (BKY default in Prism).
Figure: dot plot per group; Nature requires contour/pseudocolor plots,
marker-fluorochrome labels, gating figure. Mistakes: mean MFI on log
data; cross-day voltages; uncorrected tests.

## 6. Pharmacology: binding and enzymes

Agonist 4PL on log[agonist] (EC50/pEC50, Emax, Hill; fix Hill = 1 with
few points). Schild/Gaddum: column titles = antagonist molar
concentrations, first = 0; Antag = 1 + (B/10^(−pA2))^SchildSlope; global
fit; constrain Hill and SchildSlope to 1 so pA2 = pKb. Binding: specific
= total − NSB; one-site; avoid Scatchard; bound < 10% (depletion); Bmax
units; competition one vs two sites by F test; Ki = IC50/(1 + [L]/Kd).
Enzymes: Michaelis–Menten (Km, Vmax with CI; kcat = Vmax/[E]);
inhibition as global fit with inhibitor as column titles (competitive
KmObs = Km(1 + I/Ki); mixed α); Lineweaver–Burk display only; replicates
test for fit adequacy.

## 7. Animal studies

Tumour growth: long format (mouse, group, day, volume L×W²/2); missing
after euthanasia; analyse ln(volume) with a linear mixed model (random
mouse; spatial-power or random-effects covariance); test coincident
curves; doubling time ln2/rate; alternatives AUC per mouse, T/C,
time-to-endpoint by KM. Criticised: per-day t tests (type I ">double the
commonly specified 5%"); percent change from baseline. Prism's mixed
model: "You don't have to, or get to, define a covariance matrix. You
can't add a covariate." Dropouts are not missing at random. Body weight:
% baseline, RM two-way or mixed [inference]. Survival: time + code;
KM; log-rank (standard), Gehan–Breslow–Wilcoxon (early events), trend;
HR with CI, median and ratio of medians with CI, number-at-risk, censor
ticks, CI bands; crossing curves undermine both tests; SAMPL items.
Behaviour (MWM): RM two-way with GG; probe trial one-sample t vs 25%;
Tukey/Sidak or Games–Howell; partial η². Figure: mean ± SEM plus
spaghetti of individual mice; KM step plot with censor marks and risk
table.

## 8. Clinical and translational

ROC: sensitivity/specificity with CI per cutoff, likelihood ratio, AUC
with SE/CI/P; Prism gaps: "Prism does not compare ROC curves", no
Youden cutoff. Bland–Altman: bias, SD, limits = bias ± 1.96 SD; Prism
gives no CI for the limits; reporting standards want CI on limits,
normality/homoscedasticity check, a-priori acceptable limit,
repeatability, repeated-measures correction (Zou/Olofsen).
Correlation: name Pearson/Spearman, r with 95% CI, scatter. Logistic:
coefficients with CI and P, goodness of fit, selection process,
collinearity. Contingency: Fisher/χ², RR, OR, risk difference with CI;
Prism's OR/RR CIs "only approximately correct". Power: see 13.

## 9. The universal figure: bars/dots with points and stars

2 groups: unpaired (Welch), paired, ratio paired. 3+: one-way ANOVA with
Tukey (Games–Howell), Dunnett (T3), Sidak; adjusted P. Stars: GP style
ns/*/**/***/**** (≤0.05/0.01/0.001/0.0001); APA/NEJM stop at three;
"you ought to state the scale in your figure legends". n (SuperPlots):
"Counting each cell as a separate n can easily result in false-positive
rates of >50%"; "P values were calculated using an n of three, not 300";
colour by replicate, overlay means, paired/ratio tests when linked by
day; "list the number of independent experiments in the figure or
caption". Nested: Prism's nested t/ANOVA (subcolumns = biological units,
technical replicates stacked); "Prism cannot run the nested t test with
huge data sets"; one nesting level. Weissgerber 2015: 85.6% bar graphs,
13.4% scatter; "Showing the SE rather than the SD magnifies the apparent
visual differences."

## 10. Microscopy / image-analysis exports

CellProfiler ExportToSpreadsheet (Image.csv plus per-object CSVs);
QuPath Measurement Exporter (one table across images; blanks for
missing). Long format, thousands of rows. Must offer: join objects to
images and metadata; filter by size/intensity; aggregate cell → image →
animal by mean/median; pivot to group columns; keep cell-level points
for SuperPlots. Analysis: nested/mixed or tests on per-animal means.
Pain: Prism's nested table cannot handle very large data; reshaping in
Excel/R [inference].

## 11. Omics-lite

Volcano only from Prism's own multiple t tests (X = difference, Y =
−log10 P or q; "Prism does not offer the choice to not create it"); a
DESeq2/limma table needs a "volcano from table" mode with thresholds,
colours, top-N labels [inference]. Heat map + hierarchical clustering
with dendrogram (10.3+), row z-scoring, linkage and distance choices.
PCA present.

## 12. Time courses and kinetics

Exponential growth (doubling ln2/k; weight or fit ln(Y) linearly; never
fit the exponential to logged Y). One-phase decay (half-life ln2/K, τ =
1/K; Plateau = 0 if background subtracted). OD600: logistic (Growthcurver:
r, K, doubling, model and empirical AUC), blank subtraction; Gompertz
(1/K inflection; no Zwietering lag parameterisation in Prism). AUC:
trapezoid, horizontal baseline, peaks < 10% ignored, SE from replicates;
"Prism does not compare peaks". IncuCyte: normalise to t0, live/dead
ratio, AUC, IC50 on AUC.

## 13. Power, sample size, randomisation, blinding

"Neither InStat nor Prism does these" (StatMate discontinued). Inputs:
effect size, SD, α, power ("a one in five chance of being unable to
detect a true effect"), sidedness. Users want (G*Power, NC3Rs EDA): a
priori / post hoc / sensitivity / compromise across t, F, χ², z;
randomisation sequences; blinding support; design diagram and report.
GraphPad offers only a QuickCalc randomiser. ARRIVE 2b requires the
a-priori calculation.

## Journal reporting requirements (for the methods generator)

Nature reporting summary: exact n "as a discrete number and unit";
distinct vs repeated samples; tests "AND whether they are one- or two-
sided"; covariates; assumptions and corrections; centre AND variation/
CI; "test statistic (e.g. F, t, r) with confidence intervals, effect
sizes, degrees of freedom and P value… exact values whenever suitable";
hierarchical level; effect sizes and how calculated; data availability;
design disclosures; flow gating. Cell STAR: tests, exact n, "what n
represents", centre and dispersion, significance definition,
randomisation, sample-size estimation, inclusion/exclusion, assumption
checks. eLife: sample-size method; biological vs technical replicates
defined; outliers and exclusion; raw data shown "typically when N per
group is less than 10"; exact P "alongside… 95% confidence intervals…
not only when the p-value is less than 0.05"; masking; source data and
code. JCB: SuperPlots, n = independent experiments. PLOS Biology:
scatter/box for small n, SD not SE. JAMA: 95% CIs; P to 2–3 decimals,
P < .001 floor (snippet). SAMPL: "mean (SD), not mean ± SD"; "Do NOT use
the standard error of the mean (SE) to indicate the variability of a
data set"; numerators and denominators; name test, tails, pairing; α;
P as equalities, no "NS", floor P < 0.001; multiplicity; software;
regression equation with CIs; survival censoring, number at risk,
median with CI. ARRIVE 2.0 Essential 10: design and experimental unit;
sample size and how decided; inclusion/exclusion with exact n per
analysis; randomisation method and confounder strategy; blinding at
each stage; outcome measures; statistical methods per analysis with
software and assumption handling; animals; procedures; results with
variability "(e.g. mean and SD, or median and range)" and "the effect
size with a confidence interval".

## Cross-workflow summary

(a) Top 20 capabilities: 1 4PL/5PL on log X with constraints, relative
and absolute IC50 with CI, global fitting, out-of-range and undefined-
plateau flags; 2 standard-curve interpolation with back-transform,
dilution, %recovery, LLOQ/ULOQ, %CV report; 3 correct n hierarchy
(aggregation, SuperPlots, nested, scalable mixed model); 4 t tests incl.
ratio-paired and one-sample on logs; 5 one/two-way ANOVA (ordinary, RM)
with Tukey/Dunnett/Sidak/Games–Howell/T3 and adjusted P; 6 longitudinal
mixed model with covariance choice, covariates, log scale, dropouts;
7 survival with HR, median CI, risk table, Cox; 8 qPCR module; 9 plate-
reader module (map → blank → normalise → Z′/CV → fit); 10 densitometry
module; 11 power and sample size plus randomisation/blinding log;
12 contingency with exact/score CIs; 13 ROC with Youden and DeLong
comparison; 14 Bland–Altman with CIs on limits and repeated measures;
15 AUC per subject with group comparison; 16 growth/kinetics models
with lag; 17 synergy (Bliss, HSA, Loewe, ZIP, Chou–Talalay); 18 volcano
from table, clustered heat map, PCA; 19 pharmacology specials; 20 FDR
and logit.

(b) First-class preprocessing: long ↔ wide; metadata parsing from
sample names; hierarchical aggregation; blank/background subtraction;
normalisation to controls (0/100% wells, vehicle, t0, baseline); log10,
log2, ln, logit; back-transform with asymmetric CI; ratios; fold change
vs control within experiment; ΔCt/ΔΔCt with efficiency and geometric
reference means; dilution factors; technical-replicate averaging with
CV flags; plate map and Z′; outlier flagging with audit record.

(c) Figure defaults: show every point; bars off by default for n < ~10;
SD for description or 95% CI for inference, labelled, SEM not default;
SuperPlot mode; paired lines; fold change on log2 with line at 1;
dose-response on log10 X with mean ± SD and curve; KM with censor ticks
and risk table; exact P on brackets, stars optional with auto legend;
auto legend with n and unit, test, sidedness, post hoc, centre and
dispersion; flow axis labels.

(d) Explanations needed in-product: what n is; relative vs absolute
IC50 and when to normalise/constrain; statistics on ΔCt / log ratios
and the ratio t test; SD vs SEM vs CI; which post hoc for which
question; per-timepoint t tests are wrong, MNAR dropouts; log-rank vs
Gehan, HR, median, crossing curves; R² is not curve quality; ambiguous
fits; logit and median MFI; what reviewers will ask (ARRIVE / Nature /
eLife / STAR checklist with generated methods).

## Sources

GraphPad: reg_dr_inhibit_normalized, relative-vs-absolute-ic50 FAQ,
how-do-i-perform-a-dose-response-experiment FAQ, Prism 8
reg_pros_and_cons_of_normalizing, Prism 7 reg_troubleshooting_fits_of_
dose-r, reg_example_ria, reg_interpolating_with_linear_or_n, graphing-
data-expressed-as-fold-changes FAQ, the-ratio-paired-t-test FAQ,
stat_the_false_discovery_rate_appro, reg_gaddumschild, troubleshooting-
schild-plots FAQ, reg_mixered_model, reg_example_enzyme_kinetics,
stat_anova-approach-vs_-mixed-model, stat_analysis_choices_for_survival,
survival-methods FAQ, Prism 7 sensitivity_and_specificity,
stat_comparing_roc_curves, bland-altman_results, contingency CI FAQ,
stat_options_tab_1wayanova, asterisks FAQ, stat_how-to-nested-t-test,
stat_analysis-checklist-nested-anova, stat_volcano-plot-from-multiple-
t-t, stat_hierclust_graphs_tab, stat_pca_data_tab, 10.3 release notes,
reg_exponential_growth, reg_exponential_decay_1phase,
reg_gompertz-growth, stat_area_under_the_curve, StatMate FAQ, power FAQ,
quickcalcs randomize. Bio-protocol PMC13598656, PMC13598654,
PMC13403126, PMC13067154; SynergyFinder NAR 48:W488 and Bioconductor
vignette; Chou 2010 Cancer Res; HN Algolia "graphpad"; bosterbio ELISA
and WB posts; enzo ELISA QC; FDA M10 (snippet); MIQE 2.0 Clin Chem
71:634; Schmittgen & Livak (abstract); bitesizebio ΔΔCt; rtpcr
vignette; Degasperi PLOS ONE 2014; LI-COR normalization; FlowJo TE
export docs; ICCS MFI; PMC11269570; Nature reporting summary PDF;
Motulsky radioligand guide; PMC8044116, PMC3079203, TumGrowth
(abstract), PMC4401674 (MWM); PMC7278016 (Bland–Altman); SAMPL PDF;
Weissgerber PLOS Biol 2015; Lord 2020 JCB; CellProfiler and QuPath
export docs; Growthcurver PMC4837600; PMC11825301; G*Power; NC3Rs EDA;
ARRIVE author checklist PDF.
