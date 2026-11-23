// The "Save as recipe" form of the import dialogs (the list and the
// storage are in useSavedRecipes.ts, the settings in saved.ts).
import { useState } from "react";
import { Button, Field, Input } from "../../components/ui";

/** "Save as recipe": a name, and whether the project keeps it too. */
export function SaveRecipeForm({ defaultName, onSave, onCancel }: {
  defaultName: string;
  onSave: (name: string, inProject: boolean) => string;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [inProject, setInProject] = useState(true);
  const [msg, setMsg] = useState("");
  return (
    <section className="recipe-save" aria-label="Save as recipe">
      <div className="field-row">
        <Field label="Recipe name">
          <Input value={name} maxLength={80} autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </Field>
        <label className="field-check">
          <input type="checkbox" checked={inProject} onChange={(e) => setInProject(e.target.checked)} />
          Also keep it in this project (it travels with the project file and share links)
        </label>
      </div>
      <p className="field-note">
        Saves the settings, not the data: the next export of the same layout imports with them
        in one click (Import → Recipes, or the saved recipes list).
      </p>
      <div className="recipe-save-actions">
        {/* Secondary: the dialog's one primary stays "Create table". */}
        <Button disabled={!name.trim()} onClick={() => setMsg(onSave(name.trim(), inProject))}>
          Save recipe</Button>
        <Button onClick={onCancel}>Close</Button>
        <span role="status" className="field-note">{msg}</span>
      </div>
    </section>
  );
}
