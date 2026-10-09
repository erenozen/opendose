// Sources cited by the guidance (wizard, chips, banners, explainers).
// Every URL was loaded and read on 2026-10-04; the comment after each
// entry is the rule it supports. GraphPad pages are cited nominatively, as
// the reference documentation users compare results against.

export interface Source { label: string; url: string }

const S = "https://www.graphpad.com/guides/prism/latest/statistics/";
const C = "https://www.graphpad.com/guides/prism/latest/curve-fitting/";

export const SRC = {
  // Data type x goal table (Motulsky, Intuitive Biostatistics ch. 37).
  gpChooseTest: { label: "GraphPad FAQ 1790: Choosing a statistical test",
    url: "https://www.graphpad.com/support/faqid/1790/" },
  // Paired vs unpaired by design; Welch as a default; ratio paired when
  // the ratio is consistent.
  gpChooseT: { label: "GraphPad Statistics Guide: Experimental design tab, t tests",
    url: `${S}stat_choosing_a_t_test.htm` },
  // "The Welch test is recommended to be the default test unless there is a
  // compelling reason to use an equal variance test."
  gpWelch: { label: "GraphPad Statistics Guide: The unequal variance (Welch) t test",
    url: `${S}stat_the_unequal_variance_welch_t_t.htm` },
  // Decide equal variances from the design, not by testing the data.
  gpWelchQa: { label: "GraphPad Statistics Guide: Q&A, choosing a test to compare two groups",
    url: `${S}stat_qa_choosing_a_test_to_compare_.htm` },
  gpPairedT: { label: "GraphPad Statistics Guide: Paired or ratio paired t test",
    url: `${S}stat_paired_or_ratio_t_test.htm` },
  gpRatioPaired: { label: "GraphPad FAQ 1574: The ratio paired t test",
    url: "https://www.graphpad.com/support/faq/the-ratio-paired-t-test/" },
  gpOneSample: { label: "GraphPad Statistics Guide: One-sample t and Wilcoxon signed rank test",
    url: `${S}stat_how_to_one-sample_t_test_and_w.htm` },
  // One-sample t test of log(ratios) against 0 (ratio 1).
  gpRatioT: { label: "GraphPad FAQ 1721: Analyzing ratios with logs",
    url: "https://www.graphpad.com/support/faqid/1721/" },
  // A control column of identical values is not data: delete it and run a
  // one-sample t test against that value.
  gpNormalizeFaq: { label: "GraphPad FAQ 1631: The unpaired t test when all values in one group are identical",
    url: "https://www.graphpad.com/support/faq/the-unpaired-t-test-when-all-values-in-one-group-are-identical/" },
  // Don't automate the switch to nonparametric from a normality test.
  gpNormalityChoice: { label: "GraphPad Statistics Guide: Don't automate the decision to use a nonparametric test",
    url: `${S}using_a_normality_test_to_choo.htm` },
  // Small samples (< ~12): normality tests not very useful, rank tests
  // have too little power; large samples: parametric tests are robust.
  gpNonparametric: { label: "GraphPad Statistics Guide: Nonparametric tests with small and large samples",
    url: `${S}choosing_parametric_vs__nonpar.htm` },
  gpNormalityQa: { label: "GraphPad Statistics Guide: Q&A, normality tests",
    url: `${S}stat_qa_normality_tests.htm` },
  // Welch / Brown-Forsythe ANOVA when SDs are not assumed equal; do not
  // assume sphericity if unsure.
  gpChooseAnova: { label: "GraphPad Statistics Guide: Experimental design tab, one-way ANOVA",
    url: `${S}stat_choosing_test_one-way_anova.htm` },
  gpWelchAnova: { label: "GraphPad Statistics Guide: Interpreting Welch and Brown-Forsythe tests",
    url: `${S}interpreting_welch_browne-forsythe_tests.htm` },
  // Tukey for all pairs, Dunnett vs control, Šídák for selected pairs;
  // Games-Howell (large n) or Dunnett T3 (n < 50) with unequal SDs.
  gpMultipleComparisons: { label: "GraphPad Statistics Guide: Options tab, multiple comparisons (one-way ANOVA)",
    url: `${S}stat_options_tab_1wayanova.htm` },
  gpMcSummary: { label: "GraphPad Statistics Guide: Summary of multiple comparisons tests",
    url: `${S}stat_summary_of_multiple_comparison.htm` },
  gpMcHowTo: { label: "GraphPad Statistics Guide: How to choose multiple comparisons after ANOVA",
    url: `${S}stat_how_to_multiple_comparisons_af.htm` },
  gpTwoWay: { label: "GraphPad Statistics Guide: Multiple comparisons tab, two-way ANOVA",
    url: `${S}stat_multiple_comparisons_tab_2way.htm` },
  gpTwoWayMc: { label: "GraphPad Statistics Guide: Q&A, multiple comparisons after ANOVA",
    url: `${S}stat_qa_multiple_comparisons_after_.htm` },
  gpThreeWay: { label: "GraphPad Statistics Guide: What is three-way ANOVA used for?",
    url: `${S}stat_what_is_three-way_anova_used_f.htm` },
  gpSphericity: { label: "GraphPad Statistics Guide: Sphericity and compound symmetry",
    url: `${S}stat_sphericity_and_compound_symmet.htm` },
  gpEpsilon: { label: "GraphPad Statistics Guide: Geisser-Greenhouse epsilon",
    url: `${S}stat_epsilon.htm` },
  // RM ANOVA cannot use subjects with a missing value; mixed model can.
  gpMixed: { label: "GraphPad Statistics Guide: Missing values in repeated measures",
    url: `${S}stat_missing-values-in-repeated-mea.htm` },
  gpRmAnova: { label: "GraphPad Statistics Guide: Repeated measures tab, one-way ANOVA",
    url: `${S}stat_repeated-measures-tab1way.htm` },
  // Technical replicates are pseudoreplicates: nested t / nested ANOVA.
  gpNested: { label: "GraphPad Statistics Guide: Overview of nested t tests and ANOVA",
    url: `${S}stat_overview-of-nested-t-tests.htm` },
  gpContingency: { label: "GraphPad Statistics Guide: Options for contingency table analyses",
    url: `${S}stat_chi-square_or_fishers_test.htm` },
  // "If in doubt, report the logrank test."
  gpLogrankGehan: { label: "GraphPad Statistics Guide: Analysis choices for survival analysis",
    url: `${S}stat_analysis_choices_for_survival.htm` },
  gpHazardRatio: { label: "GraphPad Statistics Guide: The hazard ratio",
    url: `${S}stat_the_hazard_ratio.htm` },
  gpSurvival: { label: "GraphPad Statistics Guide: Survival analysis checklist",
    url: `${S}stat_checklist_survival_analyses.htm` },
  gpMedianSurvival: { label: "GraphPad Statistics Guide: Median survival",
    url: `${S}stat_interpreting_results_ratio_of_.htm` },
  gpTails: { label: "GraphPad Statistics Guide: One-tail vs. two-tail P values",
    url: `${S}one-tail_vs__two-tail_p_values.htm` },
  gpTwoTailed: { label: "GraphPad Statistics Guide: Advice, use two-tailed P values",
    url: `${S}stat_advice_use_two-tailed_p_values.htm` },
  gpSdSem: { label: "GraphPad Statistics Guide: When to plot SD vs. SEM",
    url: `${S}statwhentoplotsdvssem.htm` },
  gpChecklists: { label: "GraphPad Statistics Guide: Analysis checklists",
    url: `${S}analysis_checklists2.htm` },
  gpAdjustedP: { label: "GraphPad Statistics Guide: Multiplicity adjusted P values",
    url: `${S}stat_multiplicity_adjusted_p_values.htm` },
  gpExactP: { label: "GraphPad Statistics Guide: Exact (uncorrected) P values from multiple comparisons",
    url: `${S}stat_exact_p_values_from_multiple_c.htm` },
  // Percentile rank P(n+1)/100 = Hyndman & Fan definition 6.
  gpPercentiles: { label: "GraphPad Statistics Guide: Percentiles and the median",
    url: `${S}stat_percentiles_and_the_median.htm` },

  gpAmbiguous: { label: "GraphPad Curve Fitting Guide: Ambiguous fits",
    url: `${C}reg_analysischeck_nonlin_ambiguous.htm` },
  gpHitConstraint: { label: "GraphPad Curve Fitting Guide: Hit constraint",
    url: `${C}reg_analysischeck_hitconstraint.htm` },
  gpNotConverged: { label: "GraphPad Curve Fitting Guide: Not converged",
    url: `${C}reg_analysischeck_nonlin_not_converged.htm` },
  gpRelAbsIc50: { label: "GraphPad Curve Fitting Guide: 50% of what? Relative vs. absolute IC50",
    url: `${C}reg_50_of_what__relative_vs_absolu.htm` },
  gpR2: { label: "GraphPad Curve Fitting Guide: R squared",
    url: `${C}reg_intepretingnonlinr2.htm` },
  gpLogEc50Ci: { label: "GraphPad Curve Fitting Guide: Why fit the logEC50 rather than the EC50",
    url: `${C}reg_why_prism_fits_the_logec50_rat.htm` },
  gpNormalizing: { label: "GraphPad Curve Fitting Guide: Pros and cons of normalizing",
    url: `${C}reg_pros_and_cons_of_normalizing.htm` },
  gpWideCi: { label: "GraphPad Curve Fitting Guide: Standard errors and confidence intervals",
    url: `${C}reg_standard_errors_and_confidence.htm` },
  gpInterpolate: { label: "GraphPad Curve Fitting Guide: Interpolating from a standard curve",
    url: `${C}reg_interpolating_from_a_standard_.htm` },
  gpCompareCurves: { label: "GraphPad Curve Fitting Guide: Interpreting the extra sum-of-squares F test",
    url: `${C}reg_interpreting_comparison_of_mod_2.htm` },
  gpGlobalFit: { label: "GraphPad Curve Fitting Guide: Global nonlinear regression example",
    url: `${C}reg_example_global_nonlin.htm` },

  // Data are independent when a random factor affects only one value; an
  // experiment done once in triplicate is one value, not three (small-n
  // results, "What does each value represent?"). Read 2026-10-09.
  gpIndependent: { label: "GraphPad Statistics Guide: The need for independent samples",
    url: `${S}the_need_for_independent_samples.htm` },
  // Three comparisons at 0.05 each: 14% chance of at least one false
  // positive; 13 comparisons: about 50%. Read 2026-10-09.
  gpMultipleProblem: { label: "GraphPad Statistics Guide: The multiple comparisons problem",
    url: `${S}beware_of_multiple_comparisons.htm` },
  // Matching removes subject-to-subject (block) variability; the F test
  // for matching says whether it helped. Read 2026-10-09.
  gpRmChecklist: { label: "GraphPad Statistics Guide: Repeated measures one-way ANOVA (analysis checklist)",
    url: `${S}stat_checklist_1wayanova_rm.htm` },
  // Not observed power: the power to detect an effect worth detecting,
  // or the confidence interval. Read 2026-10-09.
  gpPostHocPower: { label: "GraphPad FAQ 1710: Why post-hoc power analysis is futile",
    url: "https://www.graphpad.com/support/faq/why-it-is-not-helpful-to-compute-the-power-of-an-experiment-to-detect-the-difference-actually-observed-why-is-post-hoc-power-analysis-futile/" },
  // Randomised block designs (day, batch, litter as the block) remove
  // between-block variation and raise power.
  festing2014: { label: "Festing 2014, Randomized block experimental designs can increase the power and reproducibility of laboratory animal experiments, ILAR J 55:472",
    url: "https://doi.org/10.1093/ilar/ilu045" },
  // Pseudoreplication: wells, cells or repeated reads counted as n.
  lazic2010: { label: "Lazic 2010, The problem of pseudoreplication in neuroscientific studies, BMC Neurosci 11:5",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2817684/" },
  // Holm's step-down procedure (Holm-Šídák: its Šídák form).
  holm1979: { label: "Holm 1979, A simple sequentially rejective multiple test procedure, Scand J Stat 6:65",
    url: "https://www.jstor.org/stable/4615733" },

  // n = biological replicates; P "using an n of three, not 300".
  // Spreadsheets with default settings turn gene names into dates and
  // numbers (about a fifth of papers with Excel gene lists affected).
  ziemann2016: { label: "Ziemann et al. 2016, Gene name errors are widespread in the scientific literature, Genome Biol 17:177",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4994289/" },
  lord2020: { label: "Lord et al. 2020, SuperPlots, J Cell Biol 219:e202001064",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7265319/" },
  // Show the data; bar graphs of small samples hide the distribution.
  weissgerber2015: { label: "Weissgerber et al. 2015, Beyond bar and line graphs, PLoS Biol 13:e1002128",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4406565/" },
  // n as a discrete number with its unit; one- or two-sided; level of
  // tests in hierarchical designs.
  natureSummary: { label: "Nature Portfolio Reporting Summary",
    url: "https://www.nature.com/documents/nr-reporting-summary-flat.pdf" },
  // mean (SD), not SEM for variability; exact P; state tails.
  sampl: { label: "Lang & Altman, SAMPL guidelines (EQUATOR Network)",
    url: "https://www.equator-network.org/reporting-guidelines/sampl/" },

  // Wave 2 (needs preregistration-plan, design-stage-checks,
  // interaction-question). Every URL loaded and read on 2026-10-09.
  // The interaction asks whether the effect of one factor is the same at
  // every level of the other; often the most important of the three tests.
  gpTwoWayResults: { label: "GraphPad Statistics Guide: Interpreting results: Two-way ANOVA",
    url: `${S}how_to_think_about_results_from_two-way_anova.htm` },
  // "Significant" vs "not significant" is not itself a significant
  // difference: test the difference of the effects.
  gelmanStern2006: { label: "Gelman & Stern 2006, The difference between “significant” and “not significant” is not itself statistically significant, Am Stat 60:328",
    url: "https://doi.org/10.1198/000313006X152649" },
  // 79 of 157 neuroscience papers compared two separate tests instead of
  // testing the interaction.
  nieuwenhuis2011: { label: "Nieuwenhuis, Forstmann & Wagenmakers 2011, Erroneous analyses of interactions in neuroscience: a problem of significance, Nat Neurosci 14:1105",
    url: "https://doi.org/10.1038/nn.2886" },
  // Pairwise log-rank tests with a multiplicity correction; the log-rank
  // test for trend for ordered groups.
  gpSurvivalPairwise: { label: "GraphPad Statistics Guide: Interpreting results: Multiple comparisons of survival curves",
    url: `${S}stat_multiple_comparisons_of_surviv.htm` },
  gpLogrankTrend: { label: "GraphPad Statistics Guide: The logrank test for trend",
    url: `${S}stat_the_logrank_test_for_trend_.htm` },
  // Results are only interpretable at face value when every analysis
  // choice was made as planned; one-tailed P only with a recorded
  // prediction; say whether n was chosen in advance.
  gpDontPHack: { label: "GraphPad Statistics Guide: Advice: Don't P-Hack",
    url: `${S}stat_advice_dont_p-hack.htm` },
  motulsky2014: { label: "Motulsky 2014, Common misconceptions about data analysis and statistics, Naunyn-Schmiedeberg's Arch Pharmacol 387:1017",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4203998/" },
  // ARRIVE 2.0: 1 study design (control groups, experimental unit),
  // 4 randomisation, 5 blinding, 19 protocol registration.
  arrive2020: { label: "Percie du Sert et al. 2020, The ARRIVE guidelines 2.0, PLoS Biol 18:e3000410",
    url: "https://doi.org/10.1371/journal.pbio.3000410" },
  arriveRandomisation: { label: "ARRIVE 2.0 item 4: Randomisation",
    url: "https://arriveguidelines.org/arrive-guidelines/randomisation" },
  arriveBlinding: { label: "ARRIVE 2.0 item 5: Blinding/masking",
    url: "https://arriveguidelines.org/arrive-guidelines/blinding" },
  arriveProtocol: { label: "ARRIVE 2.0 item 19: Protocol registration",
    url: "https://arriveguidelines.org/arrive-guidelines/protocol-registration" },
  arriveDesign: { label: "ARRIVE 2.0 item 1: Study design",
    url: "https://arriveguidelines.org/arrive-guidelines/study-design" },
  // Technical repeats / nested observations treated as independent
  // inflate false positives; use the unit or a multilevel model.
  aarts2014: { label: "Aarts et al. 2014, A solution to dependency: using multilevel analysis to accommodate nested data, Nat Neurosci 17:491",
    url: "https://doi.org/10.1038/nn.3648" },
} satisfies Record<string, Source>;

export type SourceKey = keyof typeof SRC;
