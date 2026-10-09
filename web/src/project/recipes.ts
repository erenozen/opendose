// Import recipes kept in the project (Project.recipes): a mapping the
// user saved from the Import dialog or a recipe dialog (delimiter, lines
// skipped, column roles, name pattern, aggregation, plate map), under a
// name, so the project file and a share link carry it and the next export
// of the same instrument imports in one click. The settings themselves
// are owned by share/recipes/saved.ts; this module only keeps them well
// formed. Pure.
import type { Project } from "./types.ts";

export interface ProjectRecipe {
  id: string;
  name: string;
  /** ISO date-time of the save. */
  savedAt: string;
  /** What it was built on ("Incucyte time series", "Plain import"). */
  basis: string;
  /** The settings (share/recipes/saved.ts, normalizeSpec). */
  spec: Record<string, unknown>;
}

const MAX_RECIPES = 100;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Recipes from a file or a link: well-formed entries only, names unique
 *  (the last one with a name wins), at most 100. */
export function normalizeRecipes(raw: unknown): ProjectRecipe[] {
  if (!Array.isArray(raw)) return [];
  const byName = new Map<string, ProjectRecipe>();
  for (const r of raw.slice(0, 500)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const name = str(o.name, 80);
    const id = str(o.id, 80);
    const spec = o.spec;
    if (!name || !id || !spec || typeof spec !== "object" || Array.isArray(spec)) continue;
    byName.delete(name);
    byName.set(name, { id, name, savedAt: str(o.savedAt, 40), basis: str(o.basis, 120),
      spec: spec as Record<string, unknown> });
  }
  return [...byName.values()].slice(-MAX_RECIPES);
}

/** The project with its recipes read from a loaded file's `recipes`. */
export function withLoadedRecipes(p: Project, raw: unknown): Project {
  const recipes = normalizeRecipes(raw);
  return recipes.length ? { ...p, recipes } : p;
}

/** Add a recipe, replacing one with the same name. */
export function withRecipe(p: Project, r: ProjectRecipe): Project {
  return { ...p, recipes: [...(p.recipes ?? []).filter((x) => x.name !== r.name), r] };
}

export function withoutRecipe(p: Project, id: string): Project {
  const recipes = (p.recipes ?? []).filter((x) => x.id !== id);
  if (recipes.length) return { ...p, recipes };
  const next = { ...p };
  delete next.recipes;
  return next;
}
