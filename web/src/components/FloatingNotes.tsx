import { useEffect, useRef } from "react";
import { useCommands } from "../app/commands";
import { focusNote, NOTE_FOCUS_EVENT } from "../app/noteFocus";
import { noteTitle, notesOf } from "../project/notes";
import { NOTE_COLORS, type FloatingNote, type Sheet } from "../project/types";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import Tooltip from "./ui/Tooltip";

/** Focus `selector` once React has rendered the change that removed the
 *  focused element; the sheet itself if it is gone too. */
function focusAfterRender(selector: string) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    const el = document.querySelector<HTMLElement>(selector) ?? document.getElementById("sheet");
    el?.focus({ preventScroll: true });
  }));
}

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

  // The note may not be rendered yet (just added, or folded): wait for
  // React, unfold it if needed, then focus its text.
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const foldRef = useRef(cmd.foldNote);
  foldRef.current = cmd.foldNote;
  useEffect(() => {
    const frames = (n: number, fn: () => void) =>
      (n <= 0 ? fn() : requestAnimationFrame(() => frames(n - 1, fn)));
    const onFocus = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      frames(2, () => {
        const s = sheetRef.current;
        const n = notesOf(s).find((x) => x.id === id);
        if (!n) return;
        if (n.collapsed) foldRef.current(s.id, n.id, false);
        frames(n.collapsed ? 2 : 0, () => {
          const el = wrap.current?.querySelector<HTMLTextAreaElement>(
            `[data-note="${CSS.escape(id)}"] textarea`);
          el?.focus();
          el?.scrollIntoView({ block: "nearest" });
        });
      });
    };
    window.addEventListener(NOTE_FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(NOTE_FOCUS_EVENT, onFocus);
  }, []);

  if (!notes.length) return null;

  return (
    <div ref={wrap} className="notes-layer">
      <div className="notes-bar" role="group" aria-label={`Floating notes on ${sheet.name}`}>
        {notes.map((n) => (
          <Button key={n.id} variant="ghost" size="sm" className={`note-chip note-${n.color}`}
            data-chip={n.id} aria-expanded={!n.collapsed}
            title={n.collapsed ? "Show the note" : "Fold the note"}
            onClick={() => cmd.foldNote(sheet.id, n.id, !n.collapsed)}>
            <span className="note-dot" aria-hidden="true" />
            <span className="note-chip-text">{noteTitle(n, 28)}</span>
          </Button>
        ))}
        <Button variant="ghost" size="sm" className="note-add"
          onClick={() => { const id = cmd.addNote(sheet.id); if (id) focusNote(id); }}>New note</Button>
      </div>
      {notes.filter((n) => !n.collapsed).map((n) => (
        <NoteCard key={n.id} sheetId={sheet.id} note={n} readOnly={false} />
      ))}
    </div>
  );
}

function NoteCard({ sheetId, note, readOnly }: { sheetId: string; note: FloatingNote; readOnly: boolean }) {
  const cmd = useCommands();
  const card = useRef<HTMLElement>(null);
  // The drag: where the pointer and the note started, and the offset so far.
  const drag = useRef<{ px: number; py: number; dx: number; dy: number } | null>(null);
  const title = noteTitle(note, 40);
  const move = (x: number, y: number, key = `note:${note.id}:pos`) =>
    cmd.editNote(sheetId, note.id, { x: Math.max(0, x), y: Math.max(0, y) }, key);
  // Folding or deleting unmounts the card that has focus: hand focus to
  // the note's chip, or to "New note" once the note is gone.
  const fold = () => {
    cmd.foldNote(sheetId, note.id, true);
    focusAfterRender(`.notes-bar [data-chip="${CSS.escape(note.id)}"]`);
  };
  const remove = () => {
    cmd.removeNote(sheetId, note.id);
    focusAfterRender(".notes-bar .note-add");
  };
  // The card follows the pointer 1:1 by transform (no layout, no React
  // render per frame); left/top are written once, on release.
  const endDrag = (commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    const el = card.current;
    if (commit && d && (d.dx || d.dy)) move(note.x + d.dx, note.y + d.dy, `note:${note.id}:drag`);
    // The new left/top and the cleared transform land in the same frame;
    // transitions come back only after it, so nothing slides twice.
    if (el) el.style.transform = "";
    requestAnimationFrame(() => el?.removeAttribute("data-dragging"));
  };

  return (
    <section ref={card} className={`floating-note note-${note.color}`} data-note={note.id}
      style={{ left: note.x, top: note.y }} aria-label={`Note: ${title}`}>
      <div className="note-head">
        <IconButton size="sm" className="note-grip" data-still
          aria-label="Move note (drag, or arrow keys)"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { px: e.clientX, py: e.clientY, dx: 0, dy: 0 };
            card.current?.setAttribute("data-dragging", "");
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || !card.current) return;
            // Clamped at the workbench's top-left corner, as the saved position is.
            d.dx = Math.max(-note.x, e.clientX - d.px);
            d.dy = Math.max(-note.y, e.clientY - d.py);
            card.current.style.transform = `translate(${d.dx}px, ${d.dy}px)`;
          }}
          onPointerUp={() => endDrag(true)}
          onPointerCancel={() => endDrag(false)}
          onLostPointerCapture={() => { if (drag.current) endDrag(true); }}
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
        </IconButton>
        <div className="note-colors" role="radiogroup" aria-label="Note colour">
          {NOTE_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={note.color === c}
              aria-label={c} className={`note-swatch note-${c}`} disabled={readOnly}
              onClick={() => cmd.editNote(sheetId, note.id, { color: c })} />
          ))}
        </div>
        <Tooltip content="Fold into its chip">
          <IconButton size="sm" className="note-btn" aria-label="Fold note" onClick={fold}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </IconButton>
        </Tooltip>
        <Tooltip content="Delete note">
          <IconButton size="sm" className="note-btn" aria-label="Delete note" onClick={remove}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" />
            </svg>
          </IconButton>
        </Tooltip>
      </div>
      <textarea value={note.text} aria-label="Note text" rows={4} readOnly={readOnly}
        placeholder="Write a note…"
        onChange={(e) => cmd.editNote(sheetId, note.id, { text: e.target.value },
          `note:${note.id}:text`)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            fold();
          }
        }} />
    </section>
  );
}
