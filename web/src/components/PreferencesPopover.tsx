import { useEffect, useRef, useState } from "react";
import { useProject } from "../app/context";
import { SCHEME_LIST, type SchemeId } from "../lib/palette";
import type { Prefs, TableType } from "../project/types";
import { REGISTRY, TABLE_ORDER } from "../sheets/registry";
import { ERROR_BAR_LABELS, type ErrorBarKind } from "../types";

const SHORTCUTS: [string, string][] = [
  ["Ctrl/⌘ Z", "Undo"],
  ["Ctrl/⌘ Shift Z, Ctrl Y", "Redo"],
  ["Arrows, Enter, Shift+Enter", "Move between table cells"],
  ["Ctrl/⌘ E", "Exclude / include the value in a cell"],
  ["Ctrl/⌘ Shift Enter", "Insert a row below"],
  ["F2", "Rename the focused sheet (navigator)"],
  ["Delete", "Delete the focused sheet (navigator)"],
  ["Alt ↑ / ↓", "Move the focused sheet (navigator)"],
  ["Shift F10", "Sheet menu (navigator)"],
];

/** Preferences: kept in this browser and copied into the open project. */
export default function PreferencesPopover() {
  const { prefs, setPrefs } = useProject();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs({ ...prefs, [k]: v });

  return (
    <span className="info-wrap" ref={wrap}>
      <button ref={btn} className="theme-btn" aria-label="Preferences"
        title="Preferences" aria-expanded={open} aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
          stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <circle cx="8" cy="8" r="2.2" />
          <path d="M8 1.6v1.8M8 12.6v1.8M1.6 8h1.8M12.6 8h1.8M3.5 3.5l1.3 1.3M11.2 11.2l1.3 1.3M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3"
            strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="info-pop prefs-pop" role="dialog" aria-label="Preferences">
          <h2 className="prefs-title">Preferences</h2>
          <label className="field">
            <span>New data tables start as</span>
            <select value={prefs.defaultTableType}
              onChange={(e) => set("defaultTableType", e.target.value as TableType)}>
              {TABLE_ORDER.map((t) => <option key={t} value={t}>{REGISTRY[t].label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Error bars on new XY fits</span>
            <select value={prefs.errorBars}
              onChange={(e) => set("errorBars", e.target.value as ErrorBarKind)}>
              {(Object.keys(ERROR_BAR_LABELS) as ErrorBarKind[]).map((k) => (
                <option key={k} value={k}>{ERROR_BAR_LABELS[k]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Confidence intervals on new fits</span>
            <select value={prefs.ciMethod}
              onChange={(e) => set("ciMethod", e.target.value as Prefs["ciMethod"])}>
              <option value="asymptotic">Asymptotic (symmetrical)</option>
              <option value="profile">Profile likelihood (asymmetrical)</option>
            </select>
          </label>
          <label className="field">
            <span>Color scheme for new graphs</span>
            <select value={prefs.scheme}
              onChange={(e) => set("scheme", e.target.value as SchemeId)}>
              {SCHEME_LIST.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Theme</span>
            <select value={prefs.theme}
              onChange={(e) => set("theme", e.target.value as Prefs["theme"])}>
              <option value="auto">Match system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className="field">
            <span>Significant digits in results</span>
            <select value={prefs.digits}
              onChange={(e) => set("digits", Number(e.target.value))}>
              {[3, 4, 5, 6].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <details className="advanced shortcuts">
            <summary>Keyboard shortcuts</summary>
            <section>
              <table className="results-table">
                <tbody>
                  {SHORTCUTS.map(([k, v]) => (
                    <tr key={k}><th><kbd>{k}</kbd></th><td>{v}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
          </details>
        </div>
      )}
    </span>
  );
}
