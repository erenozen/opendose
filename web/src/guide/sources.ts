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

  // n = biological replicates; P "using an n of three, not 300".
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
} satisfies Record<string, Source>;

export type SourceKey = keyof typeof SRC;
