import { useEffect, useRef, useState } from "react";
import { useCommands } from "../app/commands";
import { focusNote, NOTE_FOCUS_EVENT } from "../app/noteFocus";
import { noteTitle, notesOf } from "../project/notes";
import { NOTE_COLORS, type FloatingNote, type Sheet } from "../project/types";

/**
 * Floating notes of the selected sheet: a row of chips above the sheet
 * (click to fold / unfold a note) and each unfolded note as a small
 * coloured card over the workbench, dragged by its grip (or moved with
 * the arrow keys on the grip). Notes are for the screen only: print and
 * exports leave them out.
 */
export default function FloatingNotes({ sheet }: { sheet: Sheet }) {
  const cmd = useCommands();
  const notes = notesOf(sheet);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onFocus = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const n = notesOf(sheet).find((x) => x.id === id);
      if (!n) return;
      if (n.collapsed) cmd.foldNote(sheet.id, n.id, false);
      // Two frames: the unfolded card has to render first.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = wrap.current?.querySelector<HTMLTextAreaElement>(
          `[data-note="${CSS.escape(id)}"] textarea`);
        el?.focus();
        el?.scrollIntoView({ block: "nearest" });
      }));
    };
    window.addEventListener(NOTE_FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(NOTE_FOCUS_EVENT, onFocus);
  }, [sheet, cmd]);

  if (!notes.length) return null;

  return (
    <div ref={wrap} className="notes-layer">
      <div className="notes-bar" role="toolbar" aria-label={`Floating notes on ${sheet.name}`}>
        {notes.map((n) => (
          <button key={n.id} type="button" className={`note-chip note-${n.color}`}
            aria-expanded={!n.collapsed} title={n.collapsed ? "Show note" : "Fold note"}
            onClick={() => cmd.foldNote(sheet.id, n.id, !n.collapsed)}>
            <span className="note-dot" aria-hidden="true" />
            <span className="note-chip-text">{noteTitle(n, 28)}</span>
          </button>
        ))}
        <button type="button" className="note-add" aria-label="Add a floating note"
          title="Add a floating note"
          onClick={() => { const id = cmd.addNote(sheet.id); if (id) focusNote(id); }}>+ Note</button>
      </div>
      {notes.filter((n) => !n.collapsed).map((n) => (
        <NoteCard key={n.id} sheetId={sheet.id} note={n} readOnly={false} />
      ))}
    </div>
  );
}

function NoteCard({ sheetId, note, readOnly }: { sheetId: string; note: FloatingNote; readOnly: boolean }) {
  const cmd = useCommands();
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const pos = drag ?? { x: note.x, y: note.y };
  const title = noteTitle(note, 40);
  const move = (x: number, y: number, key = `note:${note.id}:pos`) =>
    cmd.editNote(sheetId, note.id, { x: Math.max(0, x), y: Math.max(0, y) }, key);

  return (
    <section className={`floating-note note-${note.color}`} data-note={note.id}
      style={{ left: pos.x, top: pos.y }} aria-label={`Note: ${title}`}>
      <div className="note-head">
        <button type="button" className="note-grip"
          aria-label="Move note (arrow keys)" title="Drag to move"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            start.current = { px: e.clientX, py: e.clientY, x: note.x, y: note.y };
            setDrag({ x: note.x, y: note.y });
          }}
          onPointerMove={(e) => {
            const s = start.current;
            if (!s) return;
            setDrag({ x: Math.max(0, s.x + e.clientX - s.px), y: Math.max(0, s.y + e.clientY - s.py) });
          }}
          onPointerUp={() => {
            const d = drag;
            start.current = null;
            setDrag(null);
            if (d && (d.x !== note.x || d.y !== note.y)) move(d.x, d.y, `note:${note.id}:drag`);
          }}
          onPointerCancel={() => { start.current = null; setDrag(null); }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 32 : 8;
            const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step],
              ArrowDown: [0, step] }[e.key];
            if (!d) return;
            e.preventDefault();
            move(note.x + d[0], note.y + d[1]);
          }}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="currentColor">
            <circle cx="4" cy="3" r="1" /><circle cx="8" cy="3" r="1" />
            <circle cx="4" cy="6" r="1" /><circle cx="8" cy="6" r="1" />
            <circle cx="4" cy="9" r="1" /><circle cx="8" cy="9" r="1" />
          </svg>
        </button>
        <div className="note-colors" role="radiogroup" aria-label="Note colour">
          {NOTE_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={note.color === c}
              aria-label={c} className={`note-swatch note-${c}`} disabled={readOnly}
              onClick={() => cmd.editNote(sheetId, note.id, { color: c })} />
          ))}
        </div>
        <button type="button" className="note-btn" aria-label="Fold note" title="Fold into its chip"
          onClick={() => cmd.foldNote(sheetId, note.id, true)}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className="note-btn" aria-label="Delete note" title="Delete note"
          onClick={() => cmd.removeNote(sheetId, note.id)}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <textarea value={note.text} aria-label="Note text" rows={4} readOnly={readOnly}
        placeholder="Write a note…"
        onChange={(e) => cmd.editNote(sheetId, note.id, { text: e.target.value },
          `note:${note.id}:text`)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cmd.foldNote(sheetId, note.id, true);
          }
        }} />
    </section>
  );
}
