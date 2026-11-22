// Exclude (or include again) the rows whose IDs are pasted in a list
// (project/excludeById.ts).
import { useState } from "react";
import Modal from "../../components/Modal";
import {
  excludeRowsById, idSources, matchRows, parseIds, type IdSource,
} from "../../project/excludeById";
import type { DataTableModel } from "../../project/types";

export default function ExcludeByIdDialog({ table, onApply, onClose }: {
  table: DataTableModel;
  onApply: (fn: (t: DataTableModel) => DataTableModel) => void;
  onClose: () => void;
}) {
  const sources = idSources(table);
  const [src, setSrc] = useState(0);
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  if (!sources.length) {
    return (
      <Modal title="Exclude rows by ID" onClose={onClose}
        actions={<button type="button" onClick={onClose}>Close</button>}>
        <p className="hint-block">This table has no row titles to match IDs against. Give the rows
          titles (the subject or animal IDs) first.</p>
      </Modal>
    );
  }
  const source: IdSource = sources[Math.min(src, sources.length - 1)].source;
  const ids = parseIds(text);
  const m = ids.length ? matchRows(table, source, ids) : { rows: [], unmatched: [] };
  const apply = (on: boolean) => {
    onApply((t) => excludeRowsById(t, source, ids, { on, reason }).table);
    onClose();
  };
  return (
    <Modal title="Exclude rows by ID" onClose={onClose} onSubmit={() => { if (m.rows.length) apply(true); }}
      actions={
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" disabled={!m.rows.length} onClick={() => apply(false)}
            title="Bring the values of these rows back into analyses and graphs">Include again</button>
          <button type="submit" className="btn-primary" disabled={!m.rows.length}>
            Exclude {m.rows.length ? `${m.rows.length} row${m.rows.length === 1 ? "" : "s"}` : ""}</button>
        </>
      }>
      {sources.length > 1 && (
        <label className="field">
          <span>Match the IDs against</span>
          <select value={src} onChange={(e) => setSrc(Number(e.target.value))}>
            {sources.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </label>
      )}
      <label className="field">
        <span>IDs (one per line, or separated by commas)</span>
        <textarea rows={6} value={text} autoFocus aria-label="IDs of the rows to exclude"
          onChange={(e) => setText(e.target.value)} placeholder={"M3\nM7\nM12"} />
      </label>
      <label className="field">
        <span>Reason (optional, shown with each excluded value)</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for excluding"
          placeholder="e.g. died before day 7" />
      </label>
      {ids.length > 0 && (
        <p className="hint-block" role="status">
          {m.rows.length} of {ids.length} ID{ids.length === 1 ? "" : "s"} found
          {m.unmatched.length > 0 && <> ; not found: {m.unmatched.join(", ")}</>}.
          Their values stay in the table, marked as excluded, and are left out of analyses and graphs.
        </p>
      )}
    </Modal>
  );
}
