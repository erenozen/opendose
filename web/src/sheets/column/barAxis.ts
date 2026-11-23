// Bars encode their values as lengths, so a bar graph's value axis should
// include zero (Healy, Data Visualization, ch. 1, "Problems of honesty and
// good judgment"): on a log axis there is no zero, and on an axis cut
// above zero a bar's length says where the axis starts more than what the
// value is. The Checks row of the results the bar graph is bound to says
// so and offers points or an axis break (P-25). Pure.
import { readFormat, type GraphFormat } from "../../graph/format.ts";
import type { GraphSheet } from "../../project/types.ts";
import { SRC } from "../../guide/sources.ts";
import type { Chip } from "../../guide/checks.ts";
import { G_INTERLEAVED, G_SCATTER, G_SEPARATED, G_STACKED } from "../grouped/options.ts";

/** Bar graph kinds, and the kind that shows the same groups as points. */
const POINTS_INSTEAD: Record<string, string> = {
  bar: "scatter",
  [G_INTERLEAVED]: G_SCATTER,
  [G_SEPARATED]: G_SCATTER,
  [G_STACKED]: G_SCATTER,
};

export type BarAxisProblem =
  | { kind: "log" }
  | { kind: "cut"; at: number };

const LOG = new Set(["log10", "log2", "ln"]);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** What is wrong with a bar graph's value axis (null: nothing, or not a
 *  bar graph). An axis broken by a gap still shows zero. */
export function barAxisProblem(graph: Pick<GraphSheet, "graphType" | "settings">): BarAxisProblem | null {
  if (!(graph.graphType in POINTS_INSTEAD)) return null;
  const y = readFormat(graph.settings).y ?? {};
  if (y.scale && LOG.has(y.scale)) return { kind: "log" };
  if (y.gap) return null;
  if (num(y.min) && y.min > 0) return { kind: "cut", at: y.min };
  if (num(y.max) && y.max < 0) return { kind: "cut", at: y.max };
  return null;
}

/** The kind to switch to for "Show points instead". */
export function pointsKind(graphType: string): string | null {
  return POINTS_INSTEAD[graphType] ?? null;
}

/** "Start at 0 with a break": the axis from 0, with the range between a
 *  fifth of the old start and the old start left out (a positive cut
 *  only; negative bars get the points). */
export function withZeroBreak(format: GraphFormat, at: number): GraphFormat | null {
  if (!(at > 0)) return null;
  const from = Number((at / 5).toPrecision(2));
  return { ...format, y: { ...format.y, min: 0, gap: { from, to: at } } };
}

/** A linear value axis in place of the log one. */
export function withLinearY(format: GraphFormat): GraphFormat {
  return { ...format, y: { ...format.y, scale: "linear" } };
}

/** The Checks row chip for a bar graph whose axis hides zero. */
export function barAxisChip(graph: Pick<GraphSheet, "id" | "name" | "graphType" | "settings">): Chip | null {
  const p = barAxisProblem(graph);
  if (!p) return null;
  const sources = [SRC.healyZeroBaseline, SRC.weissgerber2015];
  if (p.kind === "log") {
    return { id: "bar-axis", label: "Bars on a log axis", state: "warn", action: "bar-axis",
      target: graph.id, sources,
      detail: `“${graph.name}” draws bars on a log axis, which has no zero: a bar's length then `
        + "depends on where the axis happens to start, not on the value. Show the points instead "
        + "(with the geometric mean for fold changes), or use a linear axis." };
  }
  return { id: "bar-axis", label: "Bars without zero", state: "warn", action: "bar-axis",
    target: graph.id, sources,
    detail: `The value axis of “${graph.name}” starts at ${p.at}, not at 0. Bars encode their values `
      + "as lengths, so bars cut short exaggerate the differences between groups. Show the points "
      + "instead, or start the axis at 0 with a break." };
}
