// History of a family: every analysis, derived table and graph with its
// full options (defaults marked), the input table's fingerprint and the
// software versions (provenance.ts). "Copy as JSON" copies the same
// document the export bundle writes as provenance.json.
import { useMemo, useState } from "react";
import { useProject } from "../app/context";
import Modal from "../components/Modal";
import { copyText } from "../export/download";
import type { DataSheet } from "../project/types";
import { projectProvenance, type ProvenanceStep } from "./provenance";
import { provenanceDeps, provenanceEnv } from "./provenanceDeps";
import "./report.css";

const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

function Step({ s }: { s: ProvenanceStep }) {
  if (s.kind === "analysis") {
    const opts = Object.entries((s.options ?? {}) as Record<string, { value: unknown; default: boolean }>);
    const res = s.result as Record<string, unknown> | null;
    return (
      <div className="history-step">
        <h3>{s.sheet}: {String(s.label)}</h3>
        <p className="hs-meta">
          Analysis id “{String(s.analysis)}” · input “{String((s.input as { table: string }).table)}”
          {" "}({String((s.input as { fingerprint: string }).fingerprint)}){s.frozen ? " · frozen" : ""}
          {res?.error ? ` · failed: ${String(res.error)}` : res?.fingerprint ? ` · result ${String(res.fingerprint)}` : ""}
        </p>
        <table className="results-table">
          <thead><tr><th>Option</th><th>Value</th><th></th></tr></thead>
          <tbody>
            {opts.map(([k, o]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{show(o.value)}</td>
                <td>{o.default ? <span className="opt-default">default</span>
                  : <span className="opt-changed">changed</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (s.kind === "derived_table") {
    const by = s.produced_by as { sheet: string; analysis: string } | null;
    return (
      <div className="history-step">
        <h3>Derived table: {s.sheet}</h3>
        <p className="hs-meta">Made by {by ? `“${by.sheet}” (${by.analysis})` : "a missing analysis"} · {String(s.fingerprint)}</p>
      </div>
    );
  }
  return (
    <div className="history-step">
      <h3>Graph: {s.sheet}</h3>
      <p className="hs-meta">{String(s.label)} · draws {String(s.draws)}{s.formatted ? " · formatted" : ""}{s.frozen ? " · frozen" : ""}</p>
    </div>
  );
}

export default function HistoryPanel({ dataId, onClose }: { dataId?: string; onClose: () => void }) {
  const { project, results } = useProject();
  const datas = project.sheets.filter((s): s is DataSheet => s.kind === "data");
  const [id, setId] = useState(() => dataId && datas.some((d) => d.id === dataId) ? dataId : datas[0]?.id);
  const doc = useMemo(() => projectProvenance(project, provenanceDeps(results), provenanceEnv(),
    id ? [id] : undefined), [project, results, id]);
  const [note, setNote] = useState("");
  const fam = doc.families[0];
  const json = JSON.stringify(doc, null, 2);
  return (
    <Modal title="History" onClose={onClose} className="history-modal"
      actions={(
        <>
          <span className="hint" role="status">{note}</span>
          <button type="button" onClick={async () => setNote(await copyText(json) ? "Copied." : "Copy failed.")}>
            Copy as JSON
          </button>
          <button type="button" onClick={onClose}>Close</button>
        </>
      )}>
      {datas.length > 1 && (
        <label className="field">
          <span>Data table</span>
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {datas.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      )}
      <p className="hint-block">
        {doc.app}; engine {doc.engine ? Object.entries(doc.engine).map(([k, v]) => `${k} ${v}`).join(", ") : "not started"}.
        Every option is listed; “default” marks the value a new analysis starts with.
        The export bundle writes this for every table as provenance.json.
      </p>
      {fam && (
        <>
          <div className="history-step">
            <h3>Data table: {fam.table.name}</h3>
            <p className="hs-meta">
              {fam.table.type} table · {fam.table.rows} rows · data sets: {fam.table.data_sets.join(", ") || "none"}
              {" "}· {fam.table.excluded_values} excluded values · {fam.table.fingerprint}
              {fam.table.derived_from ? ` · derived from “${fam.table.derived_from.table}” by ${fam.table.derived_from.analysis}` : ""}
            </p>
          </div>
          {fam.steps.map((s) => <Step key={s.sheet_id} s={s} />)}
        </>
      )}
    </Modal>
  );
}
