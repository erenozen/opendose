// Saved import recipes for the dialogs: this browser's and the project's
// in one list, with save and delete. The settings are in saved.ts.
import { useMemo, useState } from "react";
import { useProject } from "../../app/context";
import { withRecipe, withoutRecipe, type ProjectRecipe } from "../../project/recipes";
import { RECIPES, type RecipeId } from "./presets";
import {
  browserRecipes, deleteBrowserRecipe, describeSpec, makeSaved, mergeRecipes, normalizeSpec,
  saveBrowserRecipe, type SavedSpec,
} from "./saved";

export interface SavedEntry {
  recipe: ProjectRecipe;
  spec: SavedSpec;
  inProject: boolean;
  inBrowser: boolean;
  description: string;
}

export const recipeLabel = (id: RecipeId) => RECIPES.find((r) => r.id === id)?.label ?? id;

/** Saved recipes (browser + project) with save and delete. */
export function useSavedRecipes() {
  const { project, apply, readOnly } = useProject();
  const [browser, setBrowser] = useState<ProjectRecipe[]>(() => browserRecipes());
  const list: SavedEntry[] = useMemo(() => mergeRecipes(browser, project.recipes).flatMap((e) => {
    const spec = normalizeSpec(e.recipe.spec);
    return spec ? [{ ...e, spec, description: describeSpec(spec, recipeLabel) }] : [];
  }), [browser, project.recipes]);
  const save = (name: string, spec: SavedSpec, basis: string, inProject: boolean): string => {
    const r = makeSaved(name, spec, basis);
    const stored = saveBrowserRecipe(r);
    setBrowser(browserRecipes());
    if (inProject && !readOnly) apply((p) => withRecipe(p, r));
    if (!stored && !(inProject && !readOnly)) return "This browser would not store the recipe.";
    return `Saved “${r.name}”${inProject && !readOnly ? " in this browser and the project" : " in this browser"}.`;
  };
  const remove = (id: string) => {
    deleteBrowserRecipe(id);
    setBrowser(browserRecipes());
    if (!readOnly && project.recipes?.some((r) => r.id === id)) apply((p) => withoutRecipe(p, id));
  };
  return { list, save, remove, readOnly };
}

