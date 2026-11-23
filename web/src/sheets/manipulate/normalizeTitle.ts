// The Y title of a Normalize output, named from its settings (P-55):
// "% of vehicle (mean)" when 100% is the last row and that row is titled
// "vehicle", "% of largest mean", "Fraction of total". The figure legend
// of a graph of the output says the same phrase. Only outputs made since
// (options.namedTitle, set on new Normalize sheets) are named this way:
// older ones keep "Normalized response (%)" (ruling 10). Pure;
// unit-tested in __tests__/normalizeTitle.test.ts.
import { numericData } from "../../project/table.ts";
import type { DataSheet, DataTableModel, Project } from "../../project/types.ts";

/** The Normalize options a title reads (run.ts NormalizeOptions; that
 *  file imports without extensions, so the unit tests cannot load it). */
export interface TitleOptions {
  hundredMode: "largest" | "last" | "value" | "sum";
  asPercent: boolean;
  subcolumns: "mean" | "separate";
  namedTitle?: boolean;
}

/** The title Normalize gave its output before P-55 (kept for old sheets). */
export function legacyNormalizeTitle(o: Pick<TitleOptions, "asPercent">): string {
  return o.asPercent ? "Normalized response (%)" : "Normalized response";
}

/** Row r of a data set holds a value (any subcolumn). */
const has = (ys: (number | null)[][], r: number) => (ys[r] ?? []).some((v) => v !== null);

/** The row every data set's 100% comes from with "Value in the last row":
 *  the last row with a value, when it is the same row in every data set
 *  that has values; else null. */
function lastRow(t: DataTableModel): number | null {
  const rows = numericData(t).datasets
    .map((d) => d.ys.reduce((at, _, r) => (has(d.ys, r) ? r : at), -1))
    .filter((r) => r >= 0);
  return rows.length && rows.every((r) => r === rows[0]) ? rows[0] : null;
}

/** "vehicle" (the row title), "the value at X = 0", or "last row". */
function rowName(t: DataTableModel, r: number | null): string {
  if (r === null) return "last row";
  const title = t.rowTitles?.[r]?.trim();
  if (title) return title;
  const x = t.type === "xy" ? t.x[r]?.trim() : "";
  return x ? `value at X = ${x}` : "last row";
}

/** The Y title of a Normalize output, from its settings. A 100% typed as a
 *  value keeps the general title (the value alone names nothing). */
export function normalizeTitle(o: TitleOptions, t: DataTableModel): string {
  const reps = t.subcolumnFormat === "replicates" && t.datasets.some((d) => (d.rows[0]?.length ?? 1) > 1);
  const means = o.subcolumns === "mean" && reps;
  const suffix = means ? " (mean)" : "";
  let ref: string;
  switch (o.hundredMode) {
    case "largest": ref = means ? "largest mean" : "largest value"; break;
    case "last": ref = `${rowName(t, lastRow(t))}${suffix}`; break;
    case "sum": ref = `total${suffix}`; break;
    default: return legacyNormalizeTitle(o);
  }
  return o.asPercent ? `% of ${ref}` : `Fraction of ${ref}`;
}

/** The Y title runNormalize gives its output: named from the settings on
 *  sheets made since P-55, the old title on sheets saved before. */
export function outputTitle(o: TitleOptions, t: DataTableModel): string {
  return o.namedTitle ? normalizeTitle(o, t) : legacyNormalizeTitle(o);
}

/** The phrase a figure legend states for a graph of a named Normalize
 *  output ("% of vehicle (mean)"), or null for any other table. */
export function normalizedPhrase(p: Project, data: DataSheet): string | null {
  if (!data.derived) return null;
  const prod = p.sheets.find((s) => s.id === data.derived!.resultsId);
  if (prod?.kind !== "results" || prod.analysis !== "normalize") return null;
  const o = prod.options as Partial<TitleOptions> | null;
  if (o?.namedTitle !== true) return null;
  const y = data.table.yTitle.trim();
  return /^(% of|Fraction of) /.test(y) ? y : null;
}
