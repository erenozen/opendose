// "Describe the experiment": three questions about the design pick the
// table type and its layout (what goes in rows, columns and subcolumns),
// before any data are entered. Pure data and one function; unit-tested.
//
// The rules follow the data-type x design table of the GraphPad FAQ
// "Choosing a statistical test" (Motulsky, Intuitive Biostatistics) and
// the statistics guide's pages on paired data, repeated measures and
// nested designs: matched values are entered so that they share a row
// (column tables) or a subcolumn (grouped and XY tables); technical
// replicates are nested in their subject, not independent values.
import type { NewTableInit } from "../project/table.ts";
import type { TableType } from "../project/types.ts";
import { SRC, type Source } from "./sources.ts";

/** What each value is. */
export type ValueKind = "measurement" | "count" | "time-to-event" | "variables" | "fraction";
/** What was varied (measurements only). */
export type Factors = "one" | "two" | "x";
/** How values relate to subjects. */
export type Repeats = "independent" | "repeated" | "nested";

export interface DesignAnswers {
  value: ValueKind;
  factors: Factors;
  repeats: Repeats;
}

export interface TableRecommendation {
  type: TableType;
  init: Partial<NewTableInit>;
  /** One line: the table chosen. */
  title: string;
  /** How to enter the data: rows, columns, subcolumns. */
  layout: string;
  /** The analyses this layout leads to. */
  analyses: string;
  sources: Source[];
}

export const VALUE_CHOICES: [ValueKind, string, string][] = [
  ["measurement", "A measurement", "weight, signal, concentration, a score…"],
  ["count", "A count of subjects in each category", "alive / dead, responders / non-responders"],
  ["time-to-event", "The time until an event", "death, relapse, or until the subject left the study (censored)"],
  ["variables", "One of several variables measured on each subject", "to relate the variables to each other"],
  ["fraction", "A part of a whole", "the fraction each category makes of a total"],
];

export const FACTOR_CHOICES: [Factors, string, string][] = [
  ["one", "One factor", "e.g. control vs drug A vs drug B"],
  ["two", "Two factors", "e.g. genotype and time, or treatment and sex"],
  ["x", "A numeric X, for a curve", "dose, concentration, or time as a number"],
];

export const REPEAT_CHOICES: [Repeats, string, string][] = [
  ["independent", "No: every value is from a different subject", "animal, patient, culture or well"],
  ["repeated", "Yes: the same subjects under every condition or at every time", "paired or repeated measures"],
  ["nested", "Several values per subject in one condition", "technical replicates, cells or fields per animal"],
];

/** Questions that apply to an answer about what each value is. */
export function asksFactors(v: ValueKind): boolean {
  return v === "measurement";
}
export function asksRepeats(v: ValueKind): boolean {
  return v === "measurement" || v === "count";
}

/** Worked examples that fill in the three answers. */
export const DESIGN_EXAMPLES: { label: string; answers: DesignAnswers }[] = [
  { label: "I measured the same mice (WT and KO) at 4 times",
    answers: { value: "measurement", factors: "two", repeats: "repeated" } },
  { label: "Control vs two drugs, different animals",
    answers: { value: "measurement", factors: "one", repeats: "independent" } },
  { label: "Before and after treatment in the same patients",
    answers: { value: "measurement", factors: "one", repeats: "repeated" } },
  { label: "Cells imaged in 3 animals per group",
    answers: { value: "measurement", factors: "one", repeats: "nested" } },
  { label: "A dose-response curve in triplicate wells",
    answers: { value: "measurement", factors: "x", repeats: "independent" } },
  { label: "Survival of treated and control mice",
    answers: { value: "time-to-event", factors: "one", repeats: "independent" } },
  { label: "Responders and non-responders in two groups",
    answers: { value: "count", factors: "one", repeats: "independent" } },
];

/** The table type and layout for a design. */
export function recommendTable(a: DesignAnswers): TableRecommendation {
  switch (a.value) {
    case "count":
      return a.repeats === "repeated" ? {
        type: "contingency", init: { datasets: 2, rows: 2 },
        title: "Contingency table, paired layout",
        layout: "The same subjects classified twice: rows = the outcome the first time, columns = the "
          + "outcome the second time, each cell a count of subjects (not percentages).",
        analyses: "McNemar's test for the paired proportions.",
        sources: [SRC.gpContingency, SRC.gpChooseTest],
      } : {
        type: "contingency", init: { datasets: 2, rows: 2 },
        title: "Contingency table",
        layout: "Rows = groups (or exposures), columns = outcomes; each cell is a count of subjects, "
          + "never a percentage or a mean.",
        analyses: "Fisher's exact or chi-square test, relative risk and odds ratio.",
        sources: [SRC.gpContingency, SRC.gpChooseTest],
      };
    case "time-to-event":
      return {
        type: "survival", init: {},
        title: "Survival table",
        layout: "One row per subject: the time, then 1 if the event happened or 0 if the subject was "
          + "censored (left the study or still event-free at the end); one data set per group.",
        analyses: "Kaplan-Meier curves, log-rank test, hazard ratio, Cox regression.",
        sources: [SRC.gpSurvival, SRC.gpChooseTest],
      };
    case "variables":
      return {
        type: "multivariable", init: {},
        title: "Multiple variables table",
        layout: "One row per subject, one column per variable; mark each variable continuous or "
          + "categorical.",
        analyses: "Correlation matrix, multiple linear or logistic regression, PCA.",
        sources: [SRC.gpChooseTest],
      };
    case "fraction":
      return {
        type: "partsofwhole", init: {},
        title: "Parts of whole table",
        layout: "One row per category, its value in the column; OpenDose computes each fraction of the "
          + "total.",
        analyses: "Fraction of total, chi-square goodness of fit against expected fractions.",
        sources: [SRC.gpChooseTest],
      };
    default:
      return measurement(a);
  }
}

function measurement(a: DesignAnswers): TableRecommendation {
  if (a.factors === "x") {
    return a.repeats === "repeated" ? {
      type: "xy", init: { datasets: 1, subcolumns: 4, rows: 8 },
      title: "XY table, one subcolumn per subject",
      layout: "X = dose or time down the rows; one Y subcolumn per subject, the same subject in the "
        + "same subcolumn at every X (one data set per group).",
      analyses: "Curve fit per subject or of the means, area under the curve per subject, or a "
        + "mixed model over time; not a separate test at each X.",
      sources: [SRC.gpRmAnova, SRC.gpChooseTest],
    } : {
      type: "xy", init: { datasets: 1, subcolumns: 3, rows: 9 },
      title: "XY table",
      layout: "X = dose, concentration or time down the rows; replicate Y values side by side in "
        + "subcolumns; one data set per condition."
        + (a.repeats === "nested" ? " Technical replicates of one sample are not independent: "
          + "enter each sample's mean as one replicate." : ""),
      analyses: "Nonlinear regression (dose-response, binding, kinetics) or linear regression, and "
        + "comparing curves.",
      sources: a.repeats === "nested" ? [SRC.gpNested, SRC.lord2020] : [SRC.gpChooseTest],
    };
  }
  if (a.factors === "two") {
    if (a.repeats === "repeated") {
      return {
        type: "grouped", init: { datasets: 2, subcolumns: 4, rows: 4 },
        title: "Grouped table, subjects as subcolumns",
        layout: "Rows = the repeated factor (e.g. the 4 times), data sets = the groups (e.g. WT and KO), "
          + "one subcolumn per subject: the same subject in the same subcolumn on every row.",
        analyses: "Two-way repeated-measures ANOVA (a mixed-effects model when values are missing).",
        sources: [SRC.gpRmAnova, SRC.gpMixed],
      };
    }
    return {
      type: "grouped", init: { datasets: 2, subcolumns: 3, rows: 3 },
      title: "Grouped table",
      layout: "Rows = levels of one factor, data sets (columns) = levels of the other; replicate "
        + "values side by side in subcolumns."
        + (a.repeats === "nested" ? " Technical replicates are not independent: enter one value "
          + "(the mean) per subject." : ""),
      analyses: "Two-way ANOVA with multiple comparisons.",
      sources: a.repeats === "nested" ? [SRC.gpTwoWay, SRC.gpNested, SRC.lord2020] : [SRC.gpTwoWay],
    };
  }
  if (a.repeats === "repeated") {
    return {
      type: "column", init: { datasets: 2, rows: 10 },
      title: "Column table, one row per subject",
      layout: "One column per condition (before, after…); each row is one subject, so a subject's "
        + "values share a row. Leave a cell blank if it is missing: incomplete rows are left out "
        + "of paired tests and named in the results.",
      analyses: "Paired or ratio paired t test, Wilcoxon matched pairs, repeated-measures one-way "
        + "ANOVA or Friedman test.",
      sources: [SRC.gpPairedT, SRC.gpRmAnova],
    };
  }
  if (a.repeats === "nested") {
    return {
      type: "nested", init: { datasets: 2, subcolumns: 3, rows: 5 },
      title: "Nested table",
      layout: "One column per group, one subcolumn per subject (animal, experiment), its technical "
        + "values (cells, wells, fields) down the rows.",
      analyses: "Nested t test or nested one-way ANOVA, which use the subjects as the experimental "
        + "unit.",
      sources: [SRC.gpNested, SRC.lord2020],
    };
  }
  return {
    type: "column", init: { datasets: 3, rows: 8 },
    title: "Column table",
    layout: "One column per group, its values down the rows; groups may have different numbers of "
      + "values.",
    analyses: "Unpaired (Welch) t test, Mann-Whitney test, one-way ANOVA or Kruskal-Wallis.",
    sources: [SRC.gpChooseT, SRC.gpChooseAnova],
  };
}
