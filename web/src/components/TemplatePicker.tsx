import { useEffect, useMemo, useState } from "react";
import {
  builtinTemplates, deleteTemplate, downloadTemplate, importTemplateFile, saveTemplate,
  templateShape, useSavedTemplates,
} from "../app/templates";
import { newId } from "../project/ids";
import { Button, FileButton, Field, Input, notify } from "./ui";
import { TABLE_TOKEN, type SheetTemplate } from "../project/templates";
import type { ProjectPrefs } from "../project/types";
import { REGISTRY } from "../sheets/registry";

export interface TemplatePick {
  template: SheetTemplate;
  name: string;
  withData: boolean;
}

/**
 * The "From a template" half of the New data table dialog: templates saved
 * in this browser (newest first) and the built-in ones, a template file to
 * import, and what the chosen one is for.
 */
export default function TemplatePicker({ prefs, defaultName, onChange }: {
  prefs: ProjectPrefs;
  defaultName: string;
  onChange: (p: TemplatePick | null) => void;
}) {
  const { saved, ready, error } = useSavedTemplates();
  const builtin = useMemo(() => builtinTemplates(prefs), [prefs]);
  const all = useMemo(() => [...saved, ...builtin], [saved, builtin]);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [withData, setWithData] = useState(true);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const chosen = all.find((t) => t.id === chosenId) ?? (ready ? all[0] : undefined) ?? null;
  const shownName = nameTouched ? name : chosen ? chosen.tableName || defaultName : defaultName;
  const useData = !!chosen?.withData && withData;

  useEffect(() => {
    onChange(chosen ? { template: chosen, name: shownName, withData: useData } : null);
  }, [chosen, shownName, useData, onChange]);

  const choose = (t: SheetTemplate) => {
    setChosenId(t.id);
    setWithData(true);
  };

  // Deleting is one click and undone from the toast: the template
  // goes back into this browser's list.
  const remove = (t: SheetTemplate) => {
    void deleteTemplate(t.id);
    setChosenId(null);
    notify(`Deleted the template “${t.name}”.`, {
      tone: "success", id: `template-delete-${t.id}`,
      action: { label: "Undo", onAction: () => { void saveTemplate(t).then(() => setChosenId(t.id)); } },
    });
  };

  const onImport = async (f: File) => {
    try {
      const t = await importTemplateFile(f, newId, prefs.scheme);
      setChosenId(t.id);
      setImportMsg(`Imported “${t.name}”.`);
    } catch (e) {
      setImportMsg(`Could not import “${f.name}”: ${e instanceof Error ? e.message : String(e)}. `
        + "Choose a template file (.odtemplate.json).");
    }
  };

  const option = (t: SheetTemplate) => (
    <label key={t.id} className={`type-option${t.id === chosen?.id ? " checked" : ""}`}>
      <input type="radio" name="template" value={t.id}
        checked={t.id === chosen?.id} onChange={() => choose(t)} />
      <span className="type-option-text">
        <span className="type-option-name">
          {t.name}
          <span className="nav-tag" title={`${REGISTRY[t.table.type]?.label ?? ""} table`}>
            {REGISTRY[t.table.type]?.short ?? t.table.type}
          </span>
        </span>
        <span className="type-option-desc">
          {t.results.length} analys{t.results.length === 1 ? "is" : "es"}, {t.graphs.length}
          {" "}graph{t.graphs.length === 1 ? "" : "s"}{t.withData ? ", with data" : ""}
        </span>
      </span>
    </label>
  );

  return (
    <div className="new-table-grid template-grid">
      <fieldset className="type-list">
        <legend>Templates</legend>
        {saved.length > 0 && <p className="template-heading">Saved in this browser</p>}
        {saved.map(option)}
        <p className="template-heading">Built in</p>
        {builtin.map(option)}
      </fieldset>
      <div className="new-table-options">
        <Field label="Table name">
          <Input value={shownName} autoComplete="off"
            onChange={(e) => { setName(e.target.value); setNameTouched(true); }} />
        </Field>
        {chosen && (
          <>
            <div className="template-about">
              <p className="template-about-title">{chosen.name}</p>
              <p className="field-note">{templateShape(chosen)}</p>
              {chosen.description && <p className="template-desc">{chosen.description}</p>}
              {(chosen.results.length > 0 || chosen.graphs.length > 0) && (
                <p className="field-note">
                  Creates {[...chosen.results, ...chosen.graphs]
                    .map((x) => x.name.split(TABLE_TOKEN).join(shownName)).join(", ")}.
                </p>
              )}
            </div>
            {chosen.withData ? (
              <label className="check-row template-check">
                <input type="checkbox" checked={withData}
                  onChange={(e) => setWithData(e.target.checked)} />
                <span>Include the template’s data (otherwise X values and titles only)</span>
              </label>
            ) : (
              <p className="field-note">
                This template has no Y values: enter or import your data and the
                analyses and graphs follow.
              </p>
            )}
            {!chosen.builtin && (
              <div className="table-actions template-tools">
                <Button size="sm" onClick={() => downloadTemplate(chosen)}>Download</Button>
                <Button size="sm" onClick={() => remove(chosen)}>Delete template</Button>
              </div>
            )}
          </>
        )}
        <FileButton className="template-import" accept=".json,application/json"
          inputLabel="Import a template file" onFile={(f) => void onImport(f)}>
          Import template file…</FileButton>
        <div className="status-slot" role="status">{importMsg && <p className="field-note">{importMsg}</p>}</div>
        {error && <p className="field-note" role="alert">{error}</p>}
      </div>
    </div>
  );
}
