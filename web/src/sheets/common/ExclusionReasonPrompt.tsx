// The reason prompt shown after Ctrl/Cmd+E excludes values: pick one of
// the usual reasons or type another, or skip. It never blocks: the grid
// keeps the keyboard, the strip stays until answered, skipped or the
// values are included again. The reason is kept with the data
// (project/exclusions.ts) and reported with the results, the methods
// paragraph and the figure legend (ARRIVE 2.0 item 3b).
import { useEffect, useId, useRef, useState } from "react";
import {
  EXCLUSION_SOURCES, MAX_REASON_LENGTH, PRESET_REASONS, setReasons,
} from "../../project/exclusions";
import { isExcluded, type CellRef } from "../../project/table";
import type { DataTableModel } from "../../project/types";
import "./exclusions.css";

export interface ReasonAsk { sheetId: string; refs: CellRef[] }

function where(t: DataTableModel, refs: CellRef[]): string {
  const first = refs[0];
  if (!first || first.kind !== "y") return "";
  const d = t.datasets[first.dataset];
  const row = t.type === "xy" ? `X = ${t.x[first.row] || "(blank)"}`
    : t.rowTitles[first.row]?.trim() || `row ${first.row + 1}`;
  const one = `${d?.name || "Data set"}, ${row}`;
  return refs.length === 1 ? one : `${one} and ${refs.length - 1} more`;
}

export default function ExclusionReasonPrompt({ table, refs, onSave, onClose }: {
  table: DataTableModel;
  refs: CellRef[];
  /** Apply a table edit (the grid's onChange). */
  onSave: (fn: (t: DataTableModel) => DataTableModel) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  // The grid cell that had focus: it gets it back after Save or Skip.
  const back = useRef(document.activeElement as HTMLElement | null);
  const box = useRef<HTMLElement>(null);
  const close = () => {
    const inside = !!box.current?.contains(document.activeElement);
    onClose();
    if (inside && back.current?.isConnected) back.current.focus();
  };
  const id = useId();
  const live = refs.filter((r) => isExcluded(table, r));
  // Included again (Ctrl/Cmd+E, undo): nothing left to explain.
  const gone = live.length === 0;
  useEffect(() => { if (gone) onClose(); }, [gone, onClose]);
  if (gone) return null;
  const save = (reason: string) => {
    if (reason.trim()) onSave((t) => setReasons(t, live, reason));
    close();
  };
  return (
    <section className="exclusion-reason" aria-label="Exclusion reason" ref={box}>
      <p className="er-what" role="status">
        Excluded {live.length === 1 ? "1 value" : `${live.length} values`} ({where(table, live)}).
        {" "}Reason for excluding (kept with the data):
      </p>
      <div className="er-presets" role="group" aria-label="Usual reasons">
        {PRESET_REASONS.map((r) => (
          <button key={r} type="button" onClick={() => save(r)}>{r}</button>
        ))}
      </div>
      <form className="er-other" onSubmit={(e) => { e.preventDefault(); save(text); }}
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); close(); } }}>
        <label htmlFor={`${id}-r`}>Other reason for excluding</label>
        <input id={`${id}-r`} type="text" value={text} maxLength={MAX_REASON_LENGTH}
          placeholder="e.g. tumour ulceration"
          onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn-primary" disabled={!text.trim()}>Save reason</button>
        <button type="button" className="dismiss" onClick={close}>Skip</button>
      </form>
      <p className="er-why">
        Excluded values stay in the table and are left out of analyses and graphs; the
        reason is listed with the results and stated in the methods and legend.{" "}
        <a href={EXCLUSION_SOURCES[0].url} target="_blank" rel="noreferrer">ARRIVE 2.0 item 3b</a>
        {" "}asks for every exclusion and why.
      </p>
    </section>
  );
}
