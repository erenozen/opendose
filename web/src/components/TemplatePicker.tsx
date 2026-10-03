import { useEffect, useMemo, useState } from "react";
import {
  builtinTemplates, deleteTemplate, downloadTemplate, importTemplateFile,
  templateShape, useSavedTemplates,
} from "../app/templates";
import { newId } from "../project/ids";
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

  const onImport = async (f: File) => {
    try {
      const t = await importTemplateFile(f, newId, prefs.scheme);
      setChosenId(t.id);
      setImportMsg(`Imported “${t.name}”.`);
    } catch (e) {
      setImportMsg(`Could not import: ${e instanceof Error ? e.message : String(e)}`);
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
        <label className="field">
          <span>Name</span>
          <input value={shownName} aria-label="Table name"
            onChange={(e) => { setName(e.target.value); setNameTouched(true); }} />
        </label>
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
                <button type="button" onClick={() => downloadTemplate(chosen)}>Download</button>
                <button type="button" className="danger-text"
                  onClick={() => { void deleteTemplate(chosen.id); setChosenId(null); }}>
                  Delete template
                </button>
              </div>
            )}
          </>
        )}
        <label className="load-btn template-import">
          Import template file…
          <input type="file" accept=".json,application/json" hidden
            aria-label="Import a template file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = "";
            }} />
        </label>
        {importMsg && <p className="field-note" role="status">{importMsg}</p>}
        {error && <p className="field-note" role="alert">{error}</p>}
      </div>
    </div>
  );
}
