// Saved recipes in the plain Import dialog: apply one (a plain mapping
// fills the dialog's settings; a recipe opens the Recipes step with it
// chosen), or save the dialog's settings as a recipe.
import { useState } from "react";
import type { PlainSpec } from "./saved";
import { SaveRecipeForm } from "./SavedRecipes";
import { useSavedRecipes } from "./useSavedRecipes";

export default function ImportRecipesBar({ current, onPlain, onRecipe }: {
  /** The dialog's settings now. */
  current: () => PlainSpec;
  onPlain: (spec: PlainSpec) => void;
  onRecipe: (id: string) => void;
}) {
  const saved = useSavedRecipes();
  const [saving, setSaving] = useState(false);
  const [applied, setApplied] = useState("");
  return (
    <div className="import-recipes">
      <div className="field-row">
        {saved.list.length > 0 && (
          <label className="field">
            <span>Saved recipes</span>
            <select aria-label="Apply a saved recipe" value=""
              onChange={(e) => {
                const entry = saved.list.find((x) => x.recipe.id === e.target.value);
                if (!entry) return;
                if (entry.spec.kind === "plain") {
                  onPlain(entry.spec);
                  setApplied(`Applied “${entry.recipe.name}”: ${entry.description}`);
                } else {
                  onRecipe(entry.recipe.id);
                }
              }}>
              <option value="">Apply a saved recipe…</option>
              {saved.list.map((e) => (
                <option key={e.recipe.id} value={e.recipe.id}>
                  {e.recipe.name} ({e.spec.kind === "plain" ? "import settings" : e.recipe.basis})
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="linkish" aria-expanded={saving}
          onClick={() => setSaving(!saving)}>Save these settings as a recipe…</button>
      </div>
      {applied && <p className="field-note" role="status">{applied}</p>}
      {saving && (
        <SaveRecipeForm defaultName="My import settings"
          onSave={(name, inProject) => saved.save(name, current(), "Plain import", inProject)}
          onCancel={() => setSaving(false)} />
      )}
    </div>
  );
}
