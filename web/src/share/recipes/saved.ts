// "Save this mapping as a recipe": what the user set in a recipe dialog
// (the recipe, its settings, column roles, name pattern, aggregation,
// table type, plate map) or in the plain Import dialog (delimiter,
// decimal separator, lines skipped, filters, column roles, placement),
// saved under a name in this browser (localStorage) and, when asked, in
// the project (Project.recipes, so the file and a share link carry it).
// Applying a saved recipe to the next file starts from the recipe's own
// guess and overrides it with what was saved, matching columns by name.
// Pure except the guarded localStorage helpers at the end.
import {
  DEFAULT_FILTER, DEFAULT_SOURCE, type ColumnRole, type FilterOptions, type SourceOptions,
} from "../../project/importText.ts";
import { normalizeRecipes, type ProjectRecipe } from "../../project/recipes.ts";
import { normalizePlateOptions, type PlateMap } from "../../sheets/assays/plate/model.ts";
import type { NamePattern, PatternPart } from "./pattern.ts";
import type { RecipeConfig } from "./pipeline.ts";
import type { RecipeId, RecipeParams, Staged } from "./presets.ts";
import { AGG_LABELS, OUTPUT_LABELS, ROLES, type AggFn, type OutputType, type Role } from "./staging.ts";

export interface RecipeSpec {
  kind: "recipe";
  recipe: RecipeId;
  /** Built from several files at once (stacked per-image tables). */
  multiFile?: boolean;
  params?: RecipeParams;
  /** Roles by staged column name. */
  roles?: Record<string, Role>;
  pattern?: (Omit<NamePattern, "column"> & { columnName: string }) | null;
  aggregate?: boolean;
  steps?: { level: string; fn: AggFn }[];
  keepLower?: boolean;
  output?: OutputType;
  tableName?: string;
  replicateMap?: boolean;
  plateMap?: PlateMap | null;
}

export interface PlainSpec {
  kind: "plain";
  source: SourceOptions;
  filter: FilterOptions;
  /** Roles by source column (1-based, as text keys). */
  roles: Record<string, ColumnRole>;
  place: { mode: "replace" | "append" | "insert"; perDataset: number; useTitles: boolean };
}

export type SavedSpec = RecipeSpec | PlainSpec;

const RECIPE_IDS: RecipeId[] = ["flowjo", "cellprofiler", "qupath", "plate", "qpcr", "tidy",
  "incucyte", "labchart", "multiread", "images"];

// ------------------------------------------------------------ from / to a dialog

/** The recipe dialog's state as a spec. */
export function specFromConfig(staged: Staged, cfg: RecipeConfig, multiFile = false): RecipeSpec {
  const cols = staged.staging.columns;
  const pat = cfg.pattern;
  return {
    kind: "recipe",
    recipe: staged.recipe,
    ...(multiFile ? { multiFile: true } : {}),
    ...(cfg.params && Object.keys(cfg.params).length ? { params: { ...cfg.params } } : {}),
    roles: Object.fromEntries(cols.map((c, i) => [c.name, cfg.roles[i] ?? c.role])),
    pattern: pat && cols[pat.column] ? {
      columnName: cols[pat.column].name, delimiter: pat.delimiter, stripExtension: pat.stripExtension,
      parts: pat.parts.map((p) => ({ ...p })),
      ...(pat.template !== undefined ? { template: pat.template } : {}),
    } : null,
    aggregate: cfg.aggregate,
    steps: cfg.steps.map((s) => ({ ...s })),
    keepLower: cfg.keepLower,
    output: cfg.output,
    tableName: cfg.name,
    replicateMap: !!cfg.replicateMap,
    ...(cfg.plateMap && Object.keys(cfg.plateMap).length ? { plateMap: cfg.plateMap } : {}),
  };
}

/** The dialog configuration for a newly staged file under a saved spec:
 *  the recipe's own guess, overridden by what was saved wherever the
 *  file has the same columns. */
export function configFromSpec(staged: Staged, base: RecipeConfig, spec: RecipeSpec): RecipeConfig {
  const cols = staged.staging.columns;
  const roles = cols.map((c, i) => spec.roles?.[c.name] ?? base.roles[i]);
  let pattern = base.pattern;
  if (spec.pattern === null) pattern = null;
  else if (spec.pattern) {
    const column = cols.findIndex((c) => c.name === spec.pattern!.columnName);
    if (column >= 0) {
      pattern = {
        column, delimiter: spec.pattern.delimiter, stripExtension: spec.pattern.stripExtension,
        parts: spec.pattern.parts.map((p) => ({ ...p })),
        ...(spec.pattern.template !== undefined ? { template: spec.pattern.template } : {}),
      };
    }
  }
  return {
    ...base,
    roles,
    pattern,
    aggregate: spec.aggregate ?? base.aggregate,
    steps: spec.steps ? spec.steps.map((s) => ({ ...s })) : base.steps,
    keepLower: spec.keepLower ?? base.keepLower,
    output: spec.output ?? base.output,
    name: spec.tableName || base.name,
    replicateMap: spec.replicateMap ?? base.replicateMap,
    plateMap: spec.plateMap ?? base.plateMap ?? null,
    ...(spec.params ? { params: { ...spec.params } } : {}),
  };
}

// ------------------------------------------------------------ validation

const obj = (v: unknown): Record<string, unknown> =>
  (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const text = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const int = (v: unknown, d: number, min = 0, max = 1e7) =>
  (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T =>
  (typeof v === "string" && (list as readonly string[]).includes(v) ? v as T : d);

const COLUMN_ROLES: ColumnRole[] = ["x", "y", "rowTitle", "ignore"];
const OUTPUTS = Object.keys(OUTPUT_LABELS) as OutputType[];
const FNS = Object.keys(AGG_LABELS) as AggFn[];

/** A spec read from storage, a file or a link: unknown fields dropped,
 *  every value checked (null when it is not a spec). */
export function normalizeSpec(raw: unknown): SavedSpec | null {
  const o = obj(raw);
  if (o.kind === "plain") {
    const s = obj(o.source);
    const f = obj(o.filter);
    const p = obj(o.place);
    const un = obj(f.unstack);
    return {
      kind: "plain",
      source: {
        delimiter: oneOf(s.delimiter, ["auto", "tab", "comma", "semicolon", "space"] as const, DEFAULT_SOURCE.delimiter),
        decimal: oneOf(s.decimal, ["auto", ".", ","] as const, DEFAULT_SOURCE.decimal),
        skipLines: int(s.skipLines, 0, 0, 100000),
        transpose: bool(s.transpose, false),
        titlesRow: bool(s.titlesRow, false),
      },
      filter: {
        rowFrom: int(f.rowFrom, 1, 1), rowTo: f.rowTo === null || f.rowTo === undefined ? null : int(f.rowTo, 1, 1),
        everyK: int(f.everyK, 1, 1), colFrom: int(f.colFrom, 1, 1),
        colTo: f.colTo === null || f.colTo === undefined ? null : int(f.colTo, 1, 1),
        missingCode: text(f.missingCode, 40), skipBlankX: bool(f.skipBlankX, DEFAULT_FILTER.skipBlankX),
        asteriskExcluded: bool(f.asteriskExcluded, DEFAULT_FILTER.asteriskExcluded),
        unstack: f.unstack ? { dataCol: int(un.dataCol, 2, 1), groupCol: int(un.groupCol, 1, 1) } : null,
      },
      roles: Object.fromEntries(Object.entries(obj(o.roles))
        .filter(([k, v]) => /^\d{1,5}$/.test(k) && COLUMN_ROLES.includes(v as ColumnRole))
        .map(([k, v]) => [k, v as ColumnRole])),
      place: {
        mode: oneOf(p.mode, ["replace", "append", "insert"] as const, "append"),
        perDataset: int(p.perDataset, 1, 1, 24),
        useTitles: bool(p.useTitles, true),
      },
    };
  }
  if (o.kind !== "recipe" || !RECIPE_IDS.includes(o.recipe as RecipeId)) return null;
  const pat = o.pattern === null ? null : o.pattern ? obj(o.pattern) : undefined;
  const parts = (v: unknown): PatternPart[] => (Array.isArray(v) ? v.slice(0, 40).map((x) => {
    const q = obj(x);
    return { role: oneOf(q.role, ROLES, "skip"), name: text(q.name, 80) };
  }) : []);
  const params = Object.fromEntries(Object.entries(obj(o.params))
    .filter(([k, v]) => /^[a-z][a-zA-Z0-9]{0,30}$/.test(k) && typeof v === "string")
    .map(([k, v]) => [k, (v as string).slice(0, 80)]));
  const plate = o.plateMap ? normalizePlateOptions({ wells: o.plateMap, format: 384 }).wells : null;
  return {
    kind: "recipe",
    recipe: o.recipe as RecipeId,
    ...(o.multiFile === true ? { multiFile: true } : {}),
    ...(Object.keys(params).length ? { params } : {}),
    roles: Object.fromEntries(Object.entries(obj(o.roles))
      .filter(([, v]) => ROLES.includes(v as Role)).slice(0, 2000).map(([k, v]) => [k.slice(0, 200), v as Role])),
    ...(pat === undefined ? {} : {
      pattern: pat === null ? null : {
        columnName: text(pat.columnName), delimiter: text(pat.delimiter, 10) || "_",
        stripExtension: bool(pat.stripExtension, true), parts: parts(pat.parts),
        ...(typeof pat.template === "string" ? { template: pat.template.slice(0, 200) } : {}),
      },
    }),
    aggregate: bool(o.aggregate, false),
    steps: Array.isArray(o.steps) ? o.steps.slice(0, 10).map((s) => {
      const q = obj(s);
      return { level: text(q.level), fn: oneOf(q.fn, FNS, "mean") };
    }) : [],
    keepLower: bool(o.keepLower, false),
    output: oneOf(o.output, OUTPUTS, "column"),
    tableName: text(o.tableName, 120),
    replicateMap: bool(o.replicateMap, false),
    ...(plate && Object.keys(plate).length ? { plateMap: plate } : {}),
  };
}

/** A saved recipe ready to store. */
export function makeSaved(name: string, spec: SavedSpec, basis: string, now = new Date()): ProjectRecipe {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return {
    id: `rcp-${slug || "recipe"}-${now.getTime().toString(36)}`,
    name: name.trim().slice(0, 80),
    savedAt: now.toISOString(),
    basis: basis.slice(0, 120),
    spec: spec as unknown as Record<string, unknown>,
  };
}

/** What a saved recipe does, in a line for the menu. */
export function describeSpec(spec: SavedSpec, recipeLabel: (id: RecipeId) => string): string {
  if (spec.kind === "plain") {
    const s = spec.source;
    const bits = [
      s.delimiter === "auto" ? "delimiter detected" : `${s.delimiter} delimited`,
      ...(s.skipLines ? [`${s.skipLines} line${s.skipLines === 1 ? "" : "s"} skipped`] : []),
      ...(s.titlesRow ? ["titles row"] : []),
      ...(spec.filter.everyK > 1 ? [`every ${spec.filter.everyK}${ordinal(spec.filter.everyK)} row`] : []),
      `values ${spec.place.mode === "replace" ? "replace the table's" : spec.place.mode === "append" ? "go below the last row" : "start at a cell"}`,
    ];
    return `Plain import: ${bits.join(", ")}.`;
  }
  const out = spec.output ? OUTPUT_LABELS[spec.output].split(" (")[0].toLowerCase() : "table";
  const extra = [
    ...(spec.multiFile ? ["many files"] : []),
    ...(spec.pattern?.template ? [`names like ${spec.pattern.template}`] : []),
    ...(spec.aggregate && spec.steps?.length ? [`aggregated by ${spec.steps.map((s) => s.level || "group and row").join(", then ")}`] : []),
    ...(spec.plateMap ? [`plate map of ${Object.keys(spec.plateMap).length} wells`] : []),
    ...(spec.replicateMap ? ["replicate map for SuperPlots"] : []),
  ];
  return `${recipeLabel(spec.recipe)} → ${out} table${extra.length ? `; ${extra.join("; ")}` : ""}.`;
}

function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

/** Browser and project recipes in one list (a recipe in both is listed
 *  once, as the project's). */
export function mergeRecipes(browser: ProjectRecipe[], project: ProjectRecipe[] | undefined):
  { recipe: ProjectRecipe; inProject: boolean; inBrowser: boolean }[] {
  const out = new Map<string, { recipe: ProjectRecipe; inProject: boolean; inBrowser: boolean }>();
  for (const r of browser) out.set(r.id, { recipe: r, inProject: false, inBrowser: true });
  for (const r of project ?? []) {
    const had = out.get(r.id);
    out.set(r.id, { recipe: r, inProject: true, inBrowser: !!had });
  }
  return [...out.values()].sort((a, b) => a.recipe.name.localeCompare(b.recipe.name));
}

// ------------------------------------------------------------ this browser

const KEY = "opendose-import-recipes";

export function browserRecipes(): ProjectRecipe[] {
  try {
    return normalizeRecipes(JSON.parse(localStorage.getItem(KEY) ?? "[]"))
      .filter((r) => normalizeSpec(r.spec) !== null);
  } catch {
    return [];
  }
}

/** Save (or replace by name); false when the browser would not store it. */
export function saveBrowserRecipe(r: ProjectRecipe): boolean {
  try {
    const list = browserRecipes().filter((x) => x.name !== r.name && x.id !== r.id);
    localStorage.setItem(KEY, JSON.stringify([...list, r]));
    return true;
  } catch {
    return false;
  }
}

export function deleteBrowserRecipe(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(browserRecipes().filter((r) => r.id !== id)));
  } catch { /* storage unavailable */ }
}
