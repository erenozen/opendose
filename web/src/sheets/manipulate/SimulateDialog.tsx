// "Simulate data": a dialog that makes a new simulated data table (or
// re-makes an existing one with new settings). Opened from the New data
// table dialog and from a simulated table's note.
import { useEffect, useMemo, useState } from "react";
import { useProject } from "../../app/context";
import { addFamily } from "../../app/factory";
import Modal from "../../components/Modal";
import { Button, Field, Input, useValidationTiming } from "../../components/ui";
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
  const [running, setRunning] = useState(false);
  // Problems show after a field is left or a submit is tried, and clear
  // as soon as they are fixed (reward early, punish late).
  const [attempts, setAttempts] = useState(0);
  const form = forms[kind];

  const seedProblem = seed.trim() && !/^\d+$/.test(seed.trim()) ? "Enter a whole number, or leave it blank" : null;
  const problem = useMemo(() => {
    try {
      simOptions(kind, form);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [kind, form]);
  const shown = useValidationTiming(problem, attempts);

  const submit = async () => {
    if (running || !engineReady) return;
    if (problem || seedProblem) { setAttempts((n) => n + 1); return; }
    const s = seed.trim() ? Number(seed.trim()) : randomSeed();
    setRunning(true);
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
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal title={editing ? `Simulation settings: ${editing.name}` : "Simulate data"}
      className="modal-wide simulate-dialog" onClose={onClose} onSubmit={submit}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!engineReady} busy={running}
            busyLabel="Simulating…">
            {editing ? "Simulate" : "Create table"}
          </Button>
        </>
      }>
      <div className="simulate-body" onBlur={shown.onBlur}>
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
          <Field label="Table name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Random seed" className="field-num" error={seedProblem} submitCount={attempts}>
            <Input inputMode="numeric" value={seed} placeholder="new" autoComplete="off"
              onChange={(e) => setSeed(e.target.value)}
              aria-describedby="sim-seed-note" />
          </Field>
        </div>
        <p className="field-note" id="sim-seed-note">
          Leave the seed blank for fresh random numbers; the same seed and
          settings always give the same table.
        </p>
        <SimFields kind={kind} form={form}
          onChange={(f) => { setForms((m) => ({ ...m, [kind]: f })); setRunError(null); }} />
        <p className="sim-status" role="status" aria-live="polite">
          {!engineReady ? "The analysis engine is still loading…"
            : shown.problem ?? runError ?? ""}
        </p>
      </div>
    </Modal>
  );
}
