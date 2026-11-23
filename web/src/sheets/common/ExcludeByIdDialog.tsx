// Exclude (or include again) the rows whose IDs are pasted in a list
// (project/excludeById.ts).
import { useId, useState } from "react";
import Modal from "../../components/Modal";
import { Button, Field, Input, Textarea } from "../../components/ui";
import {
  excludeRowsById, idSources, matchRows, parseIds, type IdSource,
} from "../../project/excludeById";
import type { DataTableModel } from "../../project/types";

export default function ExcludeByIdDialog({ table, onApply, onClose }: {
  table: DataTableModel;
  onApply: (fn: (t: DataTableModel) => DataTableModel) => void;
  onClose: () => void;
}) {
  const uid = useId();
  const sources = idSources(table);
  const [src, setSrc] = useState(0);
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [attempts, setAttempts] = useState(0);
  if (!sources.length) {
    return (
      <Modal title="Exclude rows by ID" onClose={onClose}
        actions={<Button variant="primary" onClick={onClose}>Close</Button>}>
        <p className="modal-text">This table has no row titles to match IDs against. Give the rows
          titles (the subject or animal IDs) first.</p>
      </Modal>
    );
  }
  const source: IdSource = sources[Math.min(src, sources.length - 1)].source;
  const ids = parseIds(text);
  const m = ids.length ? matchRows(table, source, ids) : { rows: [], unmatched: [] };
  // Both buttons need at least one matching row; the problem shows under
  // the IDs after a press (forms.md, validation timing).
  const problem = !ids.length ? "Enter one or more IDs"
    : !m.rows.length ? `Enter IDs that match ${source.kind === "rowTitle" ? "a row title" : "a value in the column"}`
      : null;
  const apply = (on: boolean) => {
    if (problem) { setAttempts((n) => n + 1); return; }
    onApply((t) => excludeRowsById(t, source, ids, { on, reason }).table);
    onClose();
  };
  return (
    <Modal title="Exclude rows by ID" onClose={onClose} onSubmit={() => apply(true)}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={() => apply(false)}
            title="Bring the values of these rows back into analyses and graphs">Include again</Button>
          <Button type="submit" variant="primary">Exclude rows</Button>
        </>
      }>
      {/* The IDs are what the user came to type: first, so the dialog
          focuses them on a mouse (no autoFocus: on a phone the keyboard
          would cover the dialog). */}
      <Field label="IDs" description="One per line, or separated by commas"
        error={problem} submitCount={attempts}>
        <Textarea rows={6} value={text}
          spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off"
          aria-describedby={`${uid}-status`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds a line; Ctrl/Cmd+Enter excludes.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={"M3\nM7\nM12"} />
      </Field>
      {sources.length > 1 && (
        <Field label="Match the IDs against" id={`${uid}-src`}>
          <select id={`${uid}-src`} value={src} onChange={(e) => setSrc(Number(e.target.value))}>
            {sources.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </Field>
      )}
      <Field label="Reason (optional)" description="Shown with each excluded value">
        <Input value={reason} autoComplete="off" placeholder="e.g. died before day 7"
          onChange={(e) => setReason(e.target.value)} />
      </Field>
      <p id={`${uid}-status`} className="field-note" role="status">
        {ids.length > 0 && (
          <>
            {m.rows.length} of {ids.length} ID{ids.length === 1 ? "" : "s"} found
            {m.unmatched.length > 0 && <>; not found: {m.unmatched.join(", ")}</>}.{" "}
          </>
        )}
        Excluded values stay in the table, marked as excluded, and are left out of analyses and graphs.
      </p>
    </Modal>
  );
}
