// Sources for the log-scale analysis and the RM comparisons (checked
// 2026-10-09: titles from the pages and Crossref).
import { SRC, type Source } from "../../guide/sources.ts";

const S = "https://www.graphpad.com/guides/prism/latest/statistics/";

/** The log-scale analysis: when and why to analyse logarithms. */
export const LOG_SOURCES: Source[] = [
  { label: "GraphPad Statistics Guide: The lognormal distribution",
    url: `${S}stat_the_lognormal_distribution.htm` },
  { label: "Bland & Altman 1996, Transforming data, BMJ 312:770",
    url: "https://doi.org/10.1136/bmj.312.7033.770" },
  { label: "Bland & Altman 1996, The use of transformation when comparing two means, BMJ 312:1153",
    url: "https://doi.org/10.1136/bmj.312.7039.1153" },
];

/** Comparisons after repeated-measures one-way ANOVA. */
export const RM_POSTHOC_SOURCES: Source[] = [
  { label: "GraphPad Statistics Guide: Multiple comparisons after repeated measures one-way ANOVA",
    url: `${S}stat_multiple_comparisons_after_rep.htm` },
  SRC.gpSphericity,
];
