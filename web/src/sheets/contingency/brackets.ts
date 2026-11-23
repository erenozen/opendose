// Brackets for the pairs of rows of an r x c table (FEATURE-PLAN P-14) on
// the contingency graphs: one comparison per pair of rows, read from the
// bound contingency result's `pairwise_rows` (engine
// contingency.pairwise_rows) with its adjusted P (a q value under
// Benjamini-Hochberg), so the bracket says what the results table says.
// The stacked graphs draw one stack per row and a bracket joins two
// stacks; grouped bars draw a cluster of bars per row, where a bracket
// between rows has no single bar to join, so they refuse, and say why.
// Pure; unit-tested (__tests__/brackets.test.ts).
import { readFormat } from "../../graph/format.ts";
import type { ComparisonSet } from "../../graph/results.ts";
import { splitPair, type Comparison } from "../../graph/significance.ts";
import { familyLegendClause, familyOf } from "../../report/family.ts";
import type { DataTableModel, GraphSettings } from "../../project/types.ts";
import { contingencyBars, GRAPH_CT_GROUPED } from "./bars.ts";
import { pairTestHow } from "./pairwiseText.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Why this graph draws no brackets between rows, or null when it can. */
export function ctBracketRefusal(graphType: string, table: DataTableModel): string | null {
  if (graphType === GRAPH_CT_GROUPED) {
    return "grouped bars show each row as a cluster of bars, so a bracket between two rows "
      + "has no single bar to join; the stacked bar graphs draw them";
  }
  const groups = contingencyBars(table).groups;
  const dup = groups.find((g, i) => groups.indexOf(g) !== i);
  return dup === undefined ? null
    : `two rows are both named “${dup}”, so a bracket cannot tell them apart; give each row its own title`;
}

/** The pairs of rows a contingency graph can draw as brackets (adjusted
 *  P), or null when the result has none or the graph refuses them. Pairs
 *  with no test (a row without counts) or a row not drawn are counted as
 *  unmatched. */
export function ctComparisons(result: unknown, table: DataTableModel,
  graphType: string): ComparisonSet | null {
  const pw = (result as any)?.pairwise_rows;
  if (!pw || !Array.isArray(pw.comparisons) || ctBracketRefusal(graphType, table)) return null;
  const groups = contingencyBars(table).groups;
  const comparisons: Comparison[] = [];
  let unmatched = 0;
  for (const c of pw.comparisons) {
    const pair = typeof c?.pair === "string" ? splitPair(c.pair, groups) : null;
    if (!pair || !num(c.p_adjusted)) { unmatched++; continue; }
    comparisons.push({ a: pair[0], b: pair[1], p: c.p_adjusted });
  }
  const fam = familyOf(pw);
  const what = fam?.kind === "fdr" ? "q values" : "adjusted P";
  return {
    label: `pairs of rows, ${what} (${fam?.name ?? String(pw.method ?? "")})`,
    comparisons, unmatched, letters: false,
  };
}

/** Does the graph draw brackets: asked for in its format, and possible? */
export function ctBracketsDrawn(graph: { graphType: string; settings: GraphSettings },
  table: DataTableModel, result: unknown): boolean {
  return !!readFormat(graph.settings).comparisons?.show
    && !!ctComparisons(result, table, graph.graphType)?.comparisons.length;
}

/** What the figure legend says about the brackets: the pairs, the test
 *  each pair used and the family the P values were adjusted for; with
 *  asterisks, where the exact P values are; or why none are drawn. Null
 *  when brackets are off or the results have no pairs of rows. */
export function ctBracketLegend(graph: { graphType: string; settings: GraphSettings },
  table: DataTableModel, result: unknown): string | null {
  const cmp = readFormat(graph.settings).comparisons;
  const pw = (result as any)?.pairwise_rows;
  if (!cmp?.show || !pw || !Array.isArray(pw.comparisons)) return null;
  const refusal = ctBracketRefusal(graph.graphType, table);
  if (refusal) return `No brackets between rows: ${refusal}.`;
  if (!ctBracketsDrawn(graph, table, result)) return null;
  const fam = familyOf(pw);
  const adjusted = fam ? familyLegendClause(fam)
    : "with P values adjusted for multiple comparisons";
  const exact = cmp.display === "p" ? ""
    : ` The exact ${fam?.kind === "fdr" ? "q values" : "adjusted P values"} are in the results (Pairs of rows).`;
  return `Brackets compare pairs of rows, each tested ${pairTestHow(pw)}, ${adjusted}.${exact}`;
}
