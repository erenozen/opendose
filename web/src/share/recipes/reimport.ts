// Re-running a recorded import (P-76): the recipe or the plain Import
// dialog's settings a table's import record holds (project/importRecord.ts),
// applied to a file again. The recipe dialog and the Import dialog check
// at import time that re-running gives their table back exactly; Apply to
// new data re-runs it on next week's file. Pure.
import {
  applyImport, defaultRoles, prepareImport, type ColumnRole,
} from "../../project/importText.ts";
import type { ImportRecord } from "../../project/importRecord.ts";
import { emptyTable, flatColumns } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { initialConfig, runPipeline } from "./pipeline.ts";
import { parseSource, recipeById } from "./presets.ts";
import { configFromSpec, normalizeSpec, type PlainSpec, type RecipeSpec } from "./saved.ts";

/** A file's cells as a recipe reads them: text parsed, a worksheet's
 *  cells trimmed (as the recipe dialog does). */
export function recipeMatrix(source: string | string[][]): string[][] {
  return typeof source === "string" ? parseSource(source) : source.map((r) => r.map((c) => c.trim()));
}

/** The table a recipe with these settings makes from these cells. Throws
 *  with the recipe's own message when the file does not fit it. */
export function runRecipe(matrix: string[][], spec: RecipeSpec): DataTableModel {
  const recipe = recipeById(spec.recipe);
  const params = spec.params ?? {};
  const staged = recipe.stage(matrix, params);
  const base = { ...initialConfig(staged), params };
  const cfg = { ...configFromSpec(staged, base, spec), params };
  const out = runPipeline(staged.staging, cfg, { wellColumn: staged.wells?.column, yTitle: staged.yTitle });
  if (!out.result) throw new Error(out.error || "the recipe made no table from this file");
  return out.result.table;
}

/** The table the plain Import dialog makes with these settings, written
 *  into `base` (an empty table of the type for a new table; the table
 *  itself when its values were replaced). */
export function runPlain(source: string | string[][], spec: PlainSpec,
  base: DataTableModel): DataTableModel {
  const preview = prepareImport(source, spec.source, spec.filter);
  if (!preview.rows.length || !preview.columns.length) {
    throw new Error("these settings leave no rows or columns in the file");
  }
  const defaults = defaultRoles(base, preview);
  const roles: ColumnRole[] = preview.columns.map((c, i) => spec.roles[String(c)] ?? defaults[i]);
  if (!roles.includes("y")) throw new Error("no column of the file goes into a Y column");
  const col = Math.max(0, flatColumns(base).findIndex((c) => c.kind === "y"));
  return applyImport(base, preview, roles, {
    mode: "replace", row: 0, col, perDataset: spec.place.perDataset, useTitles: spec.place.useTitles,
  }, { skipBlankX: spec.filter.skipBlankX, asteriskExcluded: spec.filter.asteriskExcluded });
}

/** Why a record cannot be re-run, or "" when it can. */
export function replayProblem(rec: ImportRecord): string {
  if (!rec.replayable) return rec.why || "re-running its settings did not give the same table";
  if (rec.how === "apply") return "";
  const spec = normalizeSpec(rec.spec);
  if (!spec) return "the import settings were not recorded";
  if (spec.kind === "recipe" && spec.multiFile) return "it was made from several files at once";
  return "";
}

/** Re-run a record's import on a file's cells: the new table, or the
 *  error that stopped it. `table` is the current table (its type, and
 *  the base a plain replace writes into). Null for a record Apply to
 *  new data reads in the table's own layout instead (how "apply"). */
export function reimport(rec: ImportRecord, source: string | string[][], table: DataTableModel):
  { table: DataTableModel } | { error: string } | null {
  if (rec.how === "apply" || replayProblem(rec)) return null;
  const spec = normalizeSpec(rec.spec)!;
  try {
    if (spec.kind === "recipe") return { table: runRecipe(recipeMatrix(source), spec) };
    const base = rec.mode === "new" ? emptyTable(table.type) : table;
    return { table: runPlain(source, spec, base) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** The data fields of two tables are identical (what an import writes). */
export function sameValues(a: DataTableModel, b: DataTableModel): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
