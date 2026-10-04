import { useEffect, useRef, useState } from "react";
import { useProject } from "../app/context";
import { SCHEME_LIST, type SchemeId } from "../lib/palette";
import type { Prefs, TableType } from "../project/types";
import { REGISTRY, TABLE_ORDER } from "../sheets/registry";
import { ERROR_BAR_LABELS, type ErrorBarKind } from "../types";
import {
  P_FLOOR_LABELS, P_STYLE_LABELS, SMD_LABELS, VARIANCE_LABELS, reportPrefsOf,
  type PFloor, type PStyle, type ReportPrefs, type SmdPref, type VariancePref,
} from "../report/prefs";

/** Every keyboard binding in the app, by where it works. Keep in sync
 *  with useShortcuts, the navigator, the data grid, the layout canvas,
 *  floating notes and the dialogs. */
const SHORTCUTS: { area: string; keys: [string, string][] }[] = [
  { area: "Anywhere", keys: [
    ["Ctrl/⌘ Z", "Undo"],
    ["Ctrl/⌘ Shift Z, Ctrl Y", "Redo"],
    ["Ctrl/⌘ K", "Go to sheet: type part of a name or note, ↑ ↓, Enter"],
    ["Ctrl/⌘ P", "Print the selected sheet"],
    ["Esc", "Close a dialog, menu, popover or the navigator drawer"],
  ] },
  { area: "Navigator", keys: [
    ["↑ ↓, Home, End", "Move between rows"],
    ["→ / ←", "Expand / collapse (or go to the parent row)"],
    ["Enter, Space", "Open the sheet or note; fold or unfold a section or group"],
    ["F2, double-click", "Rename the sheet or group"],
    ["Delete", "Delete the sheet, note, or group (a group's sheets stay)"],
    ["Alt ↑ / ↓", "Move the sheet or group up / down"],
    ["Shift F10, ⋯", "Menu: groups, templates, analyze like, notes, formats"],
    ["* / −", "Expand all / collapse all"],
    ["Drag a sheet", "Onto a group to move it in, a section title to take it out, another sheet to reorder"],
  ] },
  { area: "Data table", keys: [
    ["Arrows, Enter, Shift Enter", "Move between cells"],
    ["Shift arrows", "Select a block of cells"],
    ["Ctrl/⌘ C, X, V", "Copy, cut, paste (tab-separated)"],
    ["Delete", "Clear the selected block"],
    ["Ctrl/⌘ E", "Exclude / include the value(s)"],
    ["Ctrl/⌘ Shift Enter", "Insert a row below"],
  ] },
  { area: "Workbench", keys: [
    ["← / → on the analysis tabs", "Switch analysis"],
    ["Arrows on a splitter", "Resize the panes"],
    ["Arrows on a note's grip", "Move a floating note (Shift: further)"],
    ["Esc in a note", "Fold it into its chip"],
  ] },
  { area: "Layout page", keys: [
    ["Arrows", "Move the selected item (Shift: 10 mm)"],
    ["Alt arrows", "Resize it"],
    ["Delete", "Remove it from the page"],
    ["Esc", "Deselect"],
  ] },
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
  // Reporting (src/report): P-value style, "ns", default effect sizes.
  const report = reportPrefsOf(prefs);
  const setReport = (patch: Partial<ReportPrefs>) => set("report", { ...report, ...patch });

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
              {[3, 4, 5, 6, 7, 8, 9, 10].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <h3 className="prefs-subtitle">Reporting</h3>
          <label className="field">
            <span>P-value style (tables, sentences, legends)</span>
            <select value={report.pStyle}
              onChange={(e) => setReport({ pStyle: e.target.value as PStyle })}>
              {(Object.keys(P_STYLE_LABELS) as PStyle[]).map((k) => (
                <option key={k} value={k}>{P_STYLE_LABELS[k]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Smallest P written exactly{report.pStyle !== "graphpad"
              ? " (GraphPad style only; APA and NEJM keep their own floor)" : ""}</span>
            <select value={report.pFloor} disabled={report.pStyle !== "graphpad"}
              onChange={(e) => setReport({ pFloor: e.target.value as PFloor })}>
              {(Object.keys(P_FLOOR_LABELS) as PFloor[]).map((k) => (
                <option key={k} value={k}>{P_FLOOR_LABELS[k]}</option>
              ))}
            </select>
          </label>
          <label className="field field-check">
            <input type="checkbox" checked={report.hideNs}
              onChange={(e) => setReport({ hideNs: e.target.checked })} />
            <span>Hide “ns” for non-significant results</span>
          </label>
          <label className="field">
            <span>Standardized mean difference shown first</span>
            <select value={report.smd}
              onChange={(e) => setReport({ smd: e.target.value as SmdPref })}>
              {(Object.keys(SMD_LABELS) as SmdPref[]).map((k) => (
                <option key={k} value={k}>{SMD_LABELS[k]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Variance explained shown first</span>
            <select value={report.variance}
              onChange={(e) => setReport({ variance: e.target.value as VariancePref })}>
              {(Object.keys(VARIANCE_LABELS) as VariancePref[]).map((k) => (
                <option key={k} value={k}>{VARIANCE_LABELS[k]}</option>
              ))}
            </select>
          </label>
          <details className="advanced shortcuts">
            <summary>Keyboard shortcuts</summary>
            <section>
              {SHORTCUTS.map((g) => (
                <table key={g.area} className="results-table shortcuts-table">
                  <caption>{g.area}</caption>
                  <tbody>
                    {g.keys.map(([k, v]) => (
                      <tr key={k}><th scope="row"><kbd>{k}</kbd></th><td>{v}</td></tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </section>
          </details>
        </div>
      )}
    </span>
  );
}
