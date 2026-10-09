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
import "./integrity.css";
import { useReproduceState } from "../app/reproduceCheck";
import { changedLines, headline, type ReproductionReport } from "../project/reproduce";
import { whyLines } from "../share/engineChanges";

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

/** One reopen-and-recompute check: the headline, every changed number
 *  with both values, the engine change log entries that may explain them. */
function Reproduction({ r }: { r: ReproductionReport }) {
  const lines = changedLines(r);
  const why = whyLines(r);
  return (
    <div className="history-step history-reproduction">
      <h3>Reproduced on reopening “{r.file}”</h3>
      <p className="hs-meta">{new Date(r.checkedAt).toLocaleString()} · {headline(r)} · compared at
        {" "}{r.digits} significant digits (P values at 4)</p>
      {lines.length > 0 && (
        <ul aria-label="Changed results">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      )}
      {why.length > 0 && (
        <ul aria-label="Engine changes">{why.map((c) => <li key={c.note}>{c.version}: {c.note}</li>)}</ul>
      )}
      <ul aria-label="Sheets compared">
        {r.sheets.map((s) => (
          <li key={s.sheetId}>{s.name}: {s.status === "reproduced" ? `${s.compared} numbers reproduced`
            : s.status === "changed" ? `${s.changes.length} of ${s.compared} numbers changed`
              : s.status === "failed" ? `could not be recomputed (${s.note})` : `not compared: ${s.note}`}</li>
        ))}
      </ul>
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
  // Projects reopened in this session from a file saved by another build:
  // every saved result recomputed and compared (app/reproduceCheck.ts).
  const checks = useReproduceState().history;
  const json = JSON.stringify(checks.length ? { ...doc, reproduction: checks } : doc, null, 2);
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
            {fam.table.exclusions.length > 0 && (
              <ul className="hs-exclusions" aria-label="Excluded values">
                {fam.table.exclusions.map((x, i) => (
                  <li key={i}>{x.data_set}, {x.where}: {x.value} ({x.reason ?? "no reason recorded"})</li>
                ))}
              </ul>
            )}
          </div>
          {fam.steps.map((s) => <Step key={s.sheet_id} s={s} />)}
        </>
      )}
      {checks.map((r) => <Reproduction key={r.checkedAt} r={r} />)}
    </Modal>
  );
}
