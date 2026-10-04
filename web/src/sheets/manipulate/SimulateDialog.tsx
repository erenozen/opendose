// "Simulate data": a dialog that makes a new simulated data table (or
// re-makes an existing one with new settings). Opened from the New data
// table dialog and from a simulated table's note.
import { useEffect, useMemo, useState } from "react";
import { useProject } from "../../app/context";
import { addFamily } from "../../app/factory";
import Modal from "../../components/Modal";
import { runEngine } from "../../lib/engine";
import { newId } from "../../project/ids";
import { findSheet, nextNumberedName, updateSheet } from "../../project/ops";
import type { DataSheet, Sheet } from "../../project/types";
import { SimFields } from "./SimulateForms";
import {
  defaultForm, randomSeed, simOptions, simulateTable, type SimForm, type SimKind,
} from "./simulate";
import { onSimulateRequest, withSimulation, type SimulateRequest as Request } from "./simulateApi";
import "./manipulate.css";

const KIND_LABEL: Record<SimKind, string> = { xy: "XY", column: "Column", contingency: "Contingency" };

/** Mounted once by the app shell; shows the dialog when asked to. */
export function SimulateHost() {
  const [req, setReq] = useState<Request | null>(null);
  useEffect(() => onSimulateRequest(setReq), []);
  if (!req) return null;
  return <SimulateDialog req={req} onClose={() => setReq(null)} key={req.editId ?? "new"} />;
}

function SimulateDialog({ req, onClose }: { req: Request; onClose: () => void }) {
  const { project, apply, select, engineReady } = useProject();
  const editing = req.editId ? findSheet(project, req.editId) as DataSheet | undefined : undefined;
  const spec = editing?.simulation;
  const [kind, setKind] = useState<SimKind>(spec?.kind ?? req.kind ?? "xy");
  const [forms, setForms] = useState<Record<SimKind, SimForm>>(() => ({
    xy: defaultForm("xy"), column: defaultForm("column"), contingency: defaultForm("contingency"),
    ...(spec ? { [spec.kind]: spec.form as SimForm } : {}),
  }));
  const [name, setName] = useState(() => editing?.name ?? nextNumberedName(project, "Simulated data"));
  const [seed, setSeed] = useState(spec ? String(spec.seed) : "");
  const [runError, setRunError] = useState<string | null>(null);
  const form = forms[kind];

  const problem = useMemo(() => {
    try {
      simOptions(kind, form);
      if (seed.trim() && !/^\d+$/.test(seed.trim())) return "The seed must be a whole number";
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [kind, form, seed]);

  const submit = async () => {
    if (problem || !engineReady) return;
    const s = seed.trim() ? Number(seed.trim()) : randomSeed();
    try {
      const table = await runEngine((engine) => simulateTable(engine, kind, form, s), { priority: "user" });
      if (editing) {
        apply((p) => withSimulation(updateSheet<Sheet>(p, editing.id, (x) => (x.kind === "data"
          ? { ...x, table, name: name.trim() || x.name } : x)), editing.id, kind, form, s, false));
        select(editing.id);
      } else {
        let dataId = "";
        apply((p) => {
          const res = addFamily(p, table, name.trim() || "Simulated data", newId);
          dataId = res.dataId;
          return withSimulation(res.project, res.dataId, kind, form, s, true);
        });
        if (dataId) select(dataId);
      }
      onClose();
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal title={editing ? `Simulation settings: ${editing.name}` : "Simulate data"}
      className="modal-wide simulate-dialog" onClose={onClose} onSubmit={submit}
      actions={
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!!problem || !engineReady}>
            {editing ? "Simulate" : "Create table"}
          </button>
        </>
      }>
      <div className="simulate-body">
        <div className="field-row">
          {!editing && (
            <fieldset className="field-radios sim-kind">
              <legend>Table</legend>
              {(Object.keys(KIND_LABEL) as SimKind[]).map((k) => (
                <label key={k}>
                  <input type="radio" name="sim-kind" value={k} checked={k === kind}
                    onChange={() => { setKind(k); setRunError(null); }} /> {KIND_LABEL[k]}
                </label>
              ))}
            </fieldset>
          )}
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Table name" />
          </label>
          <label className="field field-num">
            <span>Random seed</span>
            <input inputMode="numeric" value={seed} placeholder="new"
              onChange={(e) => setSeed(e.target.value)}
              aria-describedby="sim-seed-note" />
          </label>
        </div>
        <p className="field-note" id="sim-seed-note">
          Leave the seed blank for fresh random numbers; the same seed and
          settings always give the same table.
        </p>
        <SimFields kind={kind} form={form}
          onChange={(f) => { setForms((m) => ({ ...m, [kind]: f })); setRunError(null); }} />
        <p className="sim-status" role="status" aria-live="polite">
          {!engineReady ? "The analysis engine is still loading…"
            : problem ?? runError ?? ""}
        </p>
      </div>
    </Modal>
  );
}
