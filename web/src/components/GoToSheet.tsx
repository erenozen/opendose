import { useEffect, useMemo, useRef, useState } from "react";
import { useCommandRegistry, type Command } from "../app/commandRegistry";
import { mergeResults, rankCommands, type PaletteEntry } from "../app/commandRank";
import { rankSheets } from "../app/goto";
import { findSheet } from "../project/ops";
import { SECTION_LABELS, type Project, type Sheet } from "../project/types";
import Dialog from "./ui/Dialog";
import SheetIcon from "./SheetIcon";

type Entry = PaletteEntry<Command, Sheet>;

const RECENT_SHOWN = 6;

/**
 * The command palette (Ctrl/Cmd+K, or the header's find field): one
 * combobox over the command registry (app/commandRegistry.ts) and the
 * sheets. Typing ranks commands by word prefix, those for the sheet on
 * screen first, with the matching sheets between strong and weak command
 * matches (app/commandRank.ts). With nothing typed: Suggested commands and
 * Recent sheets. Arrows pick, Enter runs, Escape closes.
 */
export default function GoToSheet({ project, recent, onGo, onClose }: {
  project: Project;
  recent: string[];
  onGo: (id: string) => void;
  onClose: () => void;
}) {
  const commands = useCommandRegistry();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const q = query.trim();

  const sections = useMemo((): { label: string; entries: Entry[] }[] => {
    const usable = commands.filter((c) => !c.disabled && c.id !== "find");
    if (!q) {
      const suggested = usable.filter((c) => c.suggested);
      const fallback = suggested.length ? suggested
        : usable.filter((c) => c.id === "new-table" || c.id === "open");
      const recentSheets = recent.map((id) => findSheet(project, id))
        .filter((s): s is Sheet => !!s).slice(0, RECENT_SHOWN);
      return [
        { label: "Suggested", entries: fallback.map((item) => ({ kind: "command" as const, item })) },
        { label: "Recent sheets", entries: recentSheets.map((item) => ({ kind: "sheet" as const, item })) },
      ].filter((s) => s.entries.length);
    }
    const entries = mergeResults(rankCommands(usable, q), rankSheets(project, q, recent));
    return entries.length ? [{ label: "Results", entries }] : [];
  }, [commands, q, project, recent]);
  const flat = sections.flatMap((s) => s.entries);
  const cur = Math.min(active, Math.max(0, flat.length - 1));
  const optId = (i: number) => `palette-opt-${i}`;

  // Typing is why the palette was opened: focus the field on every
  // pointer (forms.md, autofocus), after the dialog's own first focus.
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, []);

  const run = (e: Entry | undefined) => {
    if (!e) return;
    if (e.kind === "sheet") { onGo(e.item.id); return; }
    onClose();
    e.item.run();
  };
  const scrollTo = (i: number) => requestAnimationFrame(() =>
    document.getElementById(optId(i))?.scrollIntoView({ block: "nearest" }));
  const owner = (s: Sheet) => (s.kind === "results" || s.kind === "graph"
    || (s.kind === "info" && s.parentId) ? findSheet(project, s.parentId)?.name : undefined);

  let index = -1;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} instant className="modal-narrow palette">
      <Dialog.Body onSubmit={() => run(flat[cur])} className="palette-body">
        <Dialog.Title className="sr-only">Find a command or sheet</Dialog.Title>
        <div className="palette-field">
          <SearchIcon />
          <input ref={input} className="palette-input" value={query}
            role="combobox" aria-expanded={flat.length > 0} aria-controls="palette-list"
            aria-activedescendant={flat.length ? optId(cur) : undefined}
            aria-autocomplete="list" aria-label="Find a command or sheet"
            placeholder="Find a command or sheet" autoComplete="off" spellCheck={false}
            enterKeyHint="go"
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              const n = flat.length;
              if (!n) return;
              let next: number | null = null;
              if (e.key === "ArrowDown") next = (cur + 1) % n;
              else if (e.key === "ArrowUp") next = (cur + n - 1) % n;
              else if ((e.key === "Home" || e.key === "End") && e.ctrlKey) next = e.key === "Home" ? 0 : n - 1;
              if (next === null) return;
              e.preventDefault();
              setActive(next);
              scrollTo(next);
            }} />
        </div>
        <div id="palette-list" className="palette-list" role="listbox" aria-label="Commands and sheets"
          data-still>
          {sections.map((s) => (
            <div key={s.label} role="group" aria-label={s.label} className="palette-group">
              {q ? null : <div className="palette-group-label" aria-hidden="true">{s.label}</div>}
              {s.entries.map((e) => {
                index += 1;
                const i = index;
                const on = i === cur;
                const sheet = e.kind === "sheet" ? e.item : undefined;
                const c = e.kind === "command" ? e.item : undefined;
                const hint = sheet ? owner(sheet) : c?.about;
                return (
                  <div key={`${e.kind}:${sheet?.id ?? c?.id}`} id={optId(i)} role="option"
                    aria-selected={on} className={`palette-option${on ? " active" : ""}`}
                    onPointerMove={() => { if (!on) setActive(i); }}
                    onClick={() => run(e)}>
                    {sheet ? <SheetIcon kind={sheet.kind} /> : <CommandIcon />}
                    <span className="palette-name">{sheet?.name ?? c?.label}</span>
                    {hint && !(sheet && sheet.name.includes(hint)) && (
                      <span className="palette-hint">{hint}</span>
                    )}
                    {sheet ? <span className="palette-kind">{SECTION_LABELS[sheet.kind]}</span>
                      : c?.shortcut ? <kbd className="palette-kind">{c.shortcut}</kbd> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="status-slot" role="status">
          {!flat.length && (
            <p className="field-note palette-empty">
              {q ? `No command or sheet matches “${q}”.` : "Type part of a command or a sheet name."}
            </p>
          )}
        </div>
        <p className="field-note palette-hint-line" aria-hidden="true">
          <kbd>↑</kbd> <kbd>↓</kbd> to choose, <kbd>Enter</kbd> to run, <kbd>Esc</kbd> to close
        </p>
      </Dialog.Body>
    </Dialog>
  );
}

function SearchIcon() {
  return (
    <svg className="palette-search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="7" cy="7" r="4.75" /><path d="m10.5 10.5 3.25 3.25" />
    </svg>
  );
}

function CommandIcon() {
  return (
    <svg className="sheet-icon" width="14" height="14" viewBox="0 0 14 14" fill="none"
      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="m3 4 3 3-3 3M7.5 10.5H11" />
    </svg>
  );
}
