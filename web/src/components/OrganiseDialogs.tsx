// Dialogs for organising a project: save a family as a template, analyze
// and graph a table like another one, and move a sheet into a group.
import { useState } from "react";
import { familyChildren } from "../project/ops";
import type { DataSheet, Project, SheetGroup } from "../project/types";
import { REGISTRY } from "../sheets/registry";
import Modal from "./Modal";

export function SaveTemplateDialog({ tableName, childCount, onCancel, onSave }: {
  tableName: string;
  childCount: number;
  onCancel: () => void;
  onSave: (o: { name: string; description: string; withData: boolean }, download: boolean) => void;
}) {
  const [name, setName] = useState(tableName);
  const [description, setDescription] = useState("");
  const [withData, setWithData] = useState(false);
  const value = () => ({ name: name.trim() || tableName, description, withData });
  return (
    <Modal title="Save as template" className="modal-narrow save-template-dialog"
      onClose={onCancel} onSubmit={() => onSave(value(), false)}
      actions={
        <>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" onClick={() => onSave(value(), true)}>Download file</button>
          <button type="submit" className="btn-primary">Save template</button>
        </>
      }>
      <p className="modal-text">
        Keeps “{tableName}” with its {childCount} results and graph
        sheet{childCount === 1 ? "" : "s"} (analysis choices, graph settings
        and formatting) to start new tables from. Saved templates are listed
        under “From a template” when you create a data table; they stay in
        this browser and can be downloaded to share.
      </p>
      <label className="field">
        <span>Template name</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()} />
      </label>
      <label className="field">
        <span>Description or instructions (optional)</span>
        <textarea rows={3} value={description} className="field-textarea"
          placeholder="Shown when someone picks this template."
          onChange={(e) => setDescription(e.target.value)} />
      </label>
      <fieldset className="field-radios">
        <legend>Values</legend>
        <label><input type="radio" name="tpl-data" checked={!withData}
          onChange={() => setWithData(false)} /> Without Y values: keep X values,
          column and row titles, and the table’s shape</label>
        <label><input type="radio" name="tpl-data" checked={withData}
          onChange={() => setWithData(true)} /> With all the data</label>
      </fieldset>
    </Modal>
  );
}

export function WandDialog({ project, target, sources, onCancel, onApply }: {
  project: Project;
  target: DataSheet;
  sources: DataSheet[];
  onCancel: () => void;
  onApply: (exampleId: string, prefix: string) => void;
}) {
  const [example, setExample] = useState(sources[0]?.id ?? "");
  const [prefix, setPrefix] = useState("");
  const counts = (id: string) => {
    const kids = familyChildren(project, id);
    const r = kids.filter((k) => k.kind === "results").length;
    const g = kids.length - r;
    return `${r} analys${r === 1 ? "is" : "es"}, ${g} graph${g === 1 ? "" : "s"}`;
  };
  return (
    <Modal title="Analyze and graph like another table" className="modal-narrow wand-dialog"
      onClose={onCancel} onSubmit={() => { if (example) onApply(example, prefix); }}
      actions={
        <>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!example}>
            Analyze and graph
          </button>
        </>
      }>
      <p className="modal-text">
        Gives “{target.name}” the same analyses (with their options) and
        graphs (with their settings and formatting) as the table you pick.
        Its existing results and graphs stay.
      </p>
      {sources.length ? (
        <fieldset className="field-radios wand-list">
          <legend>Analyze like</legend>
          {sources.map((s) => (
            <label key={s.id}>
              <input type="radio" name="wand-source" value={s.id}
                checked={example === s.id} onChange={() => setExample(s.id)} />
              <span>{s.name} <span className="field-note">({counts(s.id)})</span></span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="field-note">
          No other {REGISTRY[target.table.type].label} table in the project
          has analyses or graphs yet.
        </p>
      )}
      <label className="field">
        <span>Prefix for the new sheet names (optional)</span>
        <input value={prefix} placeholder="e.g. *" onChange={(e) => setPrefix(e.target.value)} />
      </label>
    </Modal>
  );
}

export type GroupChoice = { groupId: string | null } | { newName: string };

export function GroupDialog({ sheetName, sectionLabel, groups, current, defaultNewName, onCancel, onMove }: {
  sheetName: string;
  sectionLabel: string;
  groups: SheetGroup[];
  current: string | null;
  defaultNewName: string;
  onCancel: () => void;
  onMove: (c: GroupChoice) => void;
}) {
  const [choice, setChoice] = useState<string>(current ?? (groups.length ? "" : "__new"));
  const [newName, setNewName] = useState(defaultNewName);
  const submit = () => onMove(choice === "__new" ? { newName: newName.trim() || defaultNewName }
    : { groupId: choice || null });
  return (
    <Modal title="Move to group" className="modal-narrow group-dialog"
      onClose={onCancel} onSubmit={submit}
      actions={
        <>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary">Move</button>
        </>
      }>
      <p className="modal-text">
        Groups gather related sheets under one heading in the {sectionLabel}
        {" "}section of the navigator. Deleting a group keeps its sheets.
      </p>
      <fieldset className="field-radios">
        <legend>Put “{sheetName}” in</legend>
        <label><input type="radio" name="group-choice" checked={choice === ""}
          onChange={() => setChoice("")} /> No group</label>
        {groups.map((g) => (
          <label key={g.id}><input type="radio" name="group-choice" checked={choice === g.id}
            onChange={() => setChoice(g.id)} /> {g.name}</label>
        ))}
        <div className="group-new">
          <label><input type="radio" name="group-choice" checked={choice === "__new"}
            onChange={() => setChoice("__new")} /> A new group:</label>
          <input value={newName} aria-label="Name of the new group"
            onFocus={() => setChoice("__new")}
            onChange={(e) => { setNewName(e.target.value); setChoice("__new"); }} />
        </div>
      </fieldset>
    </Modal>
  );
}
