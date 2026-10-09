// "Is the treatment effect different between groups?" (need
// `interaction-question`). The "Which test?" wizard asks it; a yes routes
// to two-way ANOVA with the interaction first: the interaction P, the
// difference of the two treatment effects (difference of differences)
// with its CI from the engine's interaction_contrasts, the simple effects
// and an interaction plot. And the chip for the error it replaces: two
// separate tests (one per group) read as "significant in one, not in the
// other". Sources: the GraphPad guide "Interpreting results: Two-way
// ANOVA" (the interaction is often the most important of the three
// tests); Gelman & Stern 2006; Nieuwenhuis et al. 2011. Pure; unit-tested.
import type { Project, ResultsSheet } from "../project/types.ts";
import type { Chip } from "./checks.ts";
import { tTestRuns, type TTestRun } from "./multiplicity.ts";
import type { Design, Recommendation, Target } from "./recommend.ts";
import { SRC } from "./sources.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** Options key of grouped_two_way: show the Interaction block first. */
export const INTERACTION_FOCUS = "interactionFocus";

export const INTERACTION_LAYOUT = "Grouped table: rows = the treatment (e.g. Vehicle, Drug), "
  + "data sets (columns) = the groups whose treatment effects you compare (e.g. WT, KO), "
  + "replicate values side by side in subcolumns (one per animal).";

export const SEPARATE_TESTS_WARNING = "Do not compare two separate t tests (one per group): "
  + "“significant in one group, not in the other” is not evidence that the effects differ. "
  + "The interaction tests that difference directly.";

/** Two-way ANOVA with the interaction first, for the wizard's
 *  differential-effect question. `base` carries the notes and tails text
 *  recommend() has built so far. */
export function interactionRecommendation(d: Design,
  base: { notes: string[]; tails: string }): Recommendation {
  const rm = d.repeated !== "none" || d.paired;
  const design = d.repeated === "both" ? "rm_both" : rm ? "rm_rows" : "none";
  const target: Target = { tableType: "grouped", analysisId: "grouped_two_way",
    options: { design, comparisons: "sidak", direction: "rows_within_columns",
      [INTERACTION_FOCUS]: true },
    layout: INTERACTION_LAYOUT };
  const notes = [...base.notes, SEPARATE_TESTS_WARNING];
  if (d.replicates !== "independent") {
    notes.push("Average the technical replicates (or cells) within each animal, culture or "
      + "experiment first: the ANOVA's n must be the number of independent units.");
  }
  if (rm) {
    notes.push("With repeated measures the interaction is the interaction row of the "
      + "repeated-measures ANOVA; the difference of differences with its CI is computed for "
      + "ordinary (independent) designs.");
  }
  return { ...base, notes,
    rule: rm ? "two_way_interaction_rm" : "two_way_interaction",
    test: rm ? "Two-way repeated-measures ANOVA, interaction first" : "Two-way ANOVA, interaction first",
    reason: "You are asking whether the treatment effect is different in one group than in "
      + "another (for example, is the drug effect bigger in KO than in WT?). That question is "
      + "the interaction of the two factors: the difference between the two treatment effects "
      + "(a difference of differences), with its 95% confidence interval and the interaction "
      + "P value. Two-way ANOVA tests it directly; the treatment effect within each group "
      + "(the simple effects) comes after it.",
    target,
    alternatives: [
      { test: "Separate t tests within each group", when: "never as evidence that the effects "
        + "differ; the results show them as simple effects, for description" },
      { test: rm ? "Two-way ANOVA without repeated measures" : "Two-way repeated-measures ANOVA",
        when: rm ? "if every value comes from a different animal"
          : "if the same animals are measured under both treatments" },
    ],
    postHoc: { family: "selected pairs", method: "Šídák (the treatment effect within each group)",
      why: "After the interaction, compare the treatments within each group, correcting for the "
        + "number of groups. Read these simple effects as description, not as the answer to "
        + "whether the effects differ." },
    sources: [SRC.gpTwoWayResults, SRC.gelmanStern2006, SRC.nieuwenhuis2011],
    explainers: ["interaction"] };
}

// ------------------------------------------------------------ separate tests

export type SeparateTests =
  /** Column table: two t tests on four different data sets. */
  | { kind: "column"; dataId: string; runs: [TTestRun, TTestRun]; names: string[] }
  /** Grouped table: multiple t tests, one per row (genotype). */
  | { kind: "rows"; dataId: string; rows: number; mixed: boolean; resultsId: string };

const disjoint = (a: TTestRun, b: TTestRun) =>
  a.a !== b.a && a.a !== b.b && a.b !== b.a && a.b !== b.b;

/** Two t tests on the same column table comparing different data sets
 *  (e.g. WT vehicle vs WT drug, KO vehicle vs KO drug), one of them the
 *  sheet shown; reuses the multiplicity chip's count of t tests. */
export function separateColumnTests(p: Project, dataId: string, resultsId: string):
  SeparateTests | null {
  const runs = tTestRuns(p, dataId);
  const me = runs.find((r) => r.sheetId === resultsId);
  if (!me) return null;
  const other = runs.find((r) => r.sheetId !== resultsId && disjoint(me, r));
  if (!other) return null;
  const data = p.sheets.find((s) => s.id === dataId);
  const names = data?.kind === "data"
    ? data.table.datasets.map((d, i) => d.name || `Data set ${i + 1}`) : [];
  return { kind: "column", dataId, runs: [me, other], names };
}

/** Multiple t tests (one per row) on a grouped table with a handful of
 *  rows: a per-group treatment effect, often compared by eye. Omics-size
 *  screens (more than 12 rows) are left alone. */
export function separateRowTests(sheet: ResultsSheet, result: unknown): SeparateTests | null {
  if (sheet.analysis !== "grouped_multiple_t") return null;
  const r = result as R | null;
  const rows = Array.isArray(r?.rows) ? (r!.rows as R[]).filter((x) => typeof x.p === "number") : [];
  if (rows.length < 2 || rows.length > 12) return null;
  const sig = rows.filter((x) => x.p < 0.05).length;
  return { kind: "rows", dataId: sheet.parentId, rows: rows.length,
    mixed: sig > 0 && sig < rows.length, resultsId: sheet.id };
}

export function separateTestsChip(f: SeparateTests): Chip {
  const what = f.kind === "column"
    ? `${f.names[f.runs[0].a] ?? "A"} vs ${f.names[f.runs[0].b] ?? "B"} and ${
      f.names[f.runs[1].a] ?? "C"} vs ${f.names[f.runs[1].b] ?? "D"} were tested separately`
    : `one t test per row (${f.rows} rows)`;
  const label = f.kind === "rows" && f.mixed
    ? "Significant in one row, not in another: that is not a test of a difference"
    : "Separate tests per group do not show that the effects differ";
  return {
    id: "interaction-separate", state: "warn", label,
    detail: `Here ${what}. If the question is whether the treatment effect differs between the `
      + "groups, two separate tests cannot answer it: one P below 0.05 and the other above "
      + "does not show that the two effects differ (the difference between “significant” "
      + "and “not significant” is not itself significant). Test the interaction instead: "
      + "two-way ANOVA gives the difference of the two effects with its 95% CI and the "
      + "interaction P value."
      + (f.kind === "column" ? " Enter the values in a Grouped table (rows = treatment, data "
        + "sets = the groups) and choose two-way ANOVA, or use Help me choose… and answer "
        + "“Yes” to “Are you asking whether the treatment effect differs between groups?”." : ""),
    explainer: "interaction",
    action: f.kind === "rows" ? "interaction" : undefined,
    sources: [SRC.gelmanStern2006, SRC.nieuwenhuis2011, SRC.gpTwoWayResults],
  };
}

/** Options of the two-way ANOVA the chip opens on a grouped table whose
 *  rows are the groups and data sets the treatments. */
export const INTERACTION_FROM_ROWS: Record<string, unknown> = {
  design: "none", comparisons: "sidak", direction: "columns_within_rows",
  [INTERACTION_FOCUS]: true,
};
