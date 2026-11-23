// The figure legend of a curve-fit graph (P-24): after what the points
// and error bars are, it names, in this order, the model, what was fitted
// (every replicate value, or the means) and its weighting, what the
// shaded band is (95% confidence or prediction band) and the points ROUT
// removed, then the IC50 / EC50 drop lines (fitGraph.ts) and why any are
// missing. Journals ask the legend to define what every mark on a figure
// is (Nature reporting summary, Cell STAR Methods; report/legend.ts).
// Statistical wording is scientific output (ruling 10): e2e-figures and
// __tests__/fitLegend.test.ts pin it. Pure.
import { nStatement, xyPointsClause, type ErrorBars } from "../../report/legend.ts";
import { numericData } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { formatSig } from "../../types.ts";
import { maxOf } from "../../lib/extent.ts";
import { dropLegend, type XYGraphSettings } from "./fitGraph.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** The model's library label as legend words: "log(inhibitor) vs.
 *  response -- Variable slope (four parameters)" -> "log(inhibitor) vs.
 *  response, variable slope (four parameters)"; "Absolute IC50, X is
 *  log(concentration)" -> "Absolute IC50 (X is log(concentration))". */
export function modelWords(label: string): string {
  return label.replace(/\s+--\s+(\S)/g, (_, c: string) => `, ${c.toLowerCase()}`)
    .replace(/,\s*(X is .+)$/, " ($1)");
}

const SQUARED: Record<string, string> = { "1/Y2": "1/Y²", "1/X2": "1/X²", "1/SD2": "1/SD²" };

/** "unweighted", "weighted by 1/Y²", "weighted by 1/Y^1.5". */
export function weightingWords(w: unknown): string {
  if (typeof w !== "string" || !w || w === "none") return "unweighted";
  return `weighted by ${SQUARED[w] ?? w}`;
}

/** What the fit was given: every replicate, or the means. */
function fittedWhat(table: DataTableModel, options: R): string {
  if (table.subcolumnFormat === "replicates") return "fitted to every replicate value";
  const hasN = /_n$/.test(table.subcolumnFormat);
  if (hasN && (options.summaryReplicates ?? "account") === "account") {
    return "fitted to the entered means, SDs and n (the same fit as to every replicate value)";
  }
  return "fitted to the means only (one point per X value)";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The legend's description of a curve-fit graph ("" when the result
 *  has no fitted curve). `yGap`: the graph's Y axis break, if any (the
 *  drop lines skip a response inside it, fitGraph.ts dropLegend). */
export function fitLegendClause(table: DataTableModel, result: unknown, options: unknown,
  settings: XYGraphSettings, yGap?: { from: number; to: number } | null): string {
  const r = result as R | null;
  if (!r || r.error || !Array.isArray(r.datasets)) return "";
  const sets = (r.datasets as R[]).filter((d) => d?.fit && !d.error);
  if (!sets.length) return "";
  const o = (options ?? {}) as R;
  const fit = sets[0].fit as R;
  const err: ErrorBars = ["sd", "sem", "ci95", "range", "none"].includes(o.errorBars) ? o.errorBars : "sd";
  const parts: string[] = [`${xyPointsClause(err)}.`];
  const model = modelWords(String(fit.label ?? fit.model ?? "model"));
  const how = fit.fit_method === "robust"
    ? "by robust regression (best-fit values only)" : weightingWords(fit.weighting);
  let curve = `${sets.length > 1 ? "Each curve" : "The curve"} is the ${model} model ${fittedWhat(table, o)}, ${how}`;
  const bands = sets.some((d) => d.bands);
  if (bands && o.bands === "prediction") {
    curve += "; the shaded band is its 95% prediction band (where 95% of new values are expected)";
  } else if (bands) {
    curve += "; the shaded band is its 95% confidence band";
  }
  parts.push(`${curve}.`);
  const routs = sets.filter((d) => d.rout);
  if (routs.length) {
    const q = Number(routs[0].rout.q) * 100;
    const out = routs.flatMap((d) => ((d.rout.outliers ?? []) as R[])
      .map((p) => `${d.name}, X = ${formatSig(p.x)}, Y = ${formatSig(p.y)}`));
    parts.push(out.length
      ? `ROUT (Q = ${formatSig(q)}%) removed ${plural(out.length, "point", "points")} from the fit, `
        + `drawn as × (${out.join("; ")}).`
      : `ROUT (Q = ${formatSig(q)}%) found no outliers.`);
  }
  const drop = dropLegend(result, settings, yGap);
  if (drop) parts.push(drop);
  return parts.join(" ");
}

/** n at each X, as the legend states it for XY tables ("n = 3 replicates
 *  per X value"). */
export function xyN(table: DataTableModel): string | null {
  const groups = numericData(table).datasets.map((d) => ({
    name: d.name, n: Math.max(0, maxOf(d.ys.map((row) => row.filter((v) => v !== null).length))),
  })).filter((g) => g.n > 0);
  const unit = groups.length && groups.every((g) => g.n === 1)
    ? "replicate per X value" : "replicates per X value";
  return nStatement(groups, { nUnit: "values" }, { unit });
}

/** The legend sentence drawn inside the figure ("In the figure"). */
export function fitCaption(table: DataTableModel, result: unknown, options: unknown,
  settings: XYGraphSettings, yGap?: { from: number; to: number } | null): string {
  const clause = fitLegendClause(table, result, options, settings, yGap);
  if (!clause) return "";
  const n = xyN(table);
  return n ? `${clause} ${n}.` : clause;
}
