// "Start from an assay" in the New data table dialog: pick a module, name
// the input table, start empty or with the example; the module's wizard
// opens on the new family.
import { useState } from "react";
import { ASSAYS, type AssayModule } from "../index";
import "./assays.css";

export interface AssayPick {
  module: AssayModule;
  name: string;
  sample: boolean;
}

export default function AssayPicker({ onChange }: { onChange: (p: AssayPick | null) => void }) {
  const [id, setId] = useState(ASSAYS[0]?.id ?? "");
  const [name, setName] = useState(ASSAYS[0]?.tableName ?? "");
  const [named, setNamed] = useState(false);
  const [sample, setSample] = useState(true);
  const mod = ASSAYS.find((m) => m.id === id) ?? null;
  const emit = (next: Partial<{ id: string; name: string; sample: boolean }>) => {
    const m = ASSAYS.find((x) => x.id === (next.id ?? id)) ?? null;
    onChange(m ? { module: m, name: (next.name ?? name).trim() || m.tableName, sample: next.sample ?? sample } : null);
  };
  return (
    <div className="new-table-grid">
      <fieldset className="type-list">
        <legend>Assay</legend>
        {ASSAYS.map((m) => (
          <label key={m.id} className={`type-option${m.id === id ? " checked" : ""}`}>
            <input type="radio" name="assay-module" value={m.id} checked={m.id === id}
              onChange={() => {
                setId(m.id);
                const n = named ? name : m.tableName;
                setName(n);
                emit({ id: m.id, name: n });
              }} />
            <span className="type-option-text">
              <span className="type-option-name">{m.label}</span>
              <span className="type-option-desc">{m.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="new-table-options">
        <label className="field">
          <span>Name</span>
          <input value={name} aria-label="Assay table name"
            onChange={(e) => { setName(e.target.value); setNamed(true); emit({ name: e.target.value }); }} />
        </label>
        <fieldset className="field-radios">
          <legend>Start with</legend>
          <label><input type="radio" name="assay-start" checked={sample}
            onChange={() => { setSample(true); emit({ sample: true }); }} /> Example data</label>
          <label><input type="radio" name="assay-start" checked={!sample}
            onChange={() => { setSample(false); emit({ sample: false }); }} /> An empty layout</label>
        </fieldset>
        {mod && (
          <p className="field-note">
            Creates a {mod.tableName.toLowerCase()} table in the module's layout with its
            analysis and graph, then opens the setup wizard. The results are linked tables
            that follow the data.
          </p>
        )}
      </div>
    </div>
  );
}
