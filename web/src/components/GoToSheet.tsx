import { useMemo, useState } from "react";
import { rankSheets } from "../app/goto";
import { findSheet } from "../project/ops";
import { SECTION_LABELS, type Project, type Sheet } from "../project/types";
import Modal from "./Modal";
import SheetIcon from "./SheetIcon";

/**
 * "Go to sheet" (Ctrl/Cmd+K): type part of a name (or of a note), arrows
 * pick, Enter opens. With nothing typed, recently visited sheets come
 * first.
 */
export default function GoToSheet({ project, recent, onGo, onClose }: {
  project: Project;
  recent: string[];
  onGo: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useMemo(() => rankSheets(project, query, recent), [project, query, recent]);
  const cur = Math.min(active, Math.max(0, list.length - 1));
  const optId = (i: number) => `goto-opt-${i}`;
  const owner = (s: Sheet) => (s.kind === "results" || s.kind === "graph"
    ? findSheet(project, s.parentId)?.name : s.kind === "info" && s.parentId
      ? findSheet(project, s.parentId)?.name : undefined);

  const scrollTo = (i: number) => requestAnimationFrame(() =>
    document.getElementById(optId(i))?.scrollIntoView({ block: "nearest" }));

  return (
    <Modal title="Go to sheet" className="modal-narrow goto-dialog" onClose={onClose}
      onSubmit={() => { const s = list[cur]; if (s) onGo(s.id); }}
      actions={<button type="button" onClick={onClose}>Close</button>}>
      <input className="goto-input" autoFocus value={query}
        role="combobox" aria-expanded="true" aria-controls="goto-list"
        aria-activedescendant={list.length ? optId(cur) : undefined}
        aria-autocomplete="list" aria-label="Sheet name"
        placeholder="Type part of a sheet name or note"
        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const n = list.length;
            if (!n) return;
            const next = (cur + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
            setActive(next);
            scrollTo(next);
          } else if (e.key === "Home" && e.ctrlKey) {
            e.preventDefault(); setActive(0); scrollTo(0);
          }
        }} />
      <ul id="goto-list" className="goto-list" role="listbox" aria-label="Matching sheets">
        {list.map((s, i) => (
          <li key={s.id} id={optId(i)} role="option" aria-selected={i === cur}
            className={`goto-option${i === cur ? " active" : ""}`}
            onPointerMove={() => { if (i !== cur) setActive(i); }}
            onClick={() => onGo(s.id)}>
            <SheetIcon kind={s.kind} />
            <span className="goto-name">{s.name}</span>
            {owner(s) && !s.name.includes(owner(s)!) && (
              <span className="goto-owner">{owner(s)}</span>
            )}
            <span className="goto-kind">{SECTION_LABELS[s.kind]}</span>
          </li>
        ))}
      </ul>
      {!list.length && <p className="field-note">No sheet matches “{query}”.</p>}
      <p className="field-note goto-hint">
        <kbd>↑</kbd> <kbd>↓</kbd> to choose, <kbd>Enter</kbd> to open, <kbd>Esc</kbd> to close.
      </p>
    </Modal>
  );
}
