// Help panel (Ctrl/Cmd+/): searchable explainers, the guided tour, the
// "Which test?" wizard, the start screen and the keyboard shortcuts.
import { useEffect, useMemo, useRef, useState } from "react";
import { explainer, searchExplainers } from "./explainers";
import { ExplainerBody } from "./LearnMore";

const mac = typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform);
const MOD = mac ? "⌘" : "Ctrl+";

const SHORTCUTS: [string, string][] = [
  [`${MOD}/`, "Open or close this help panel"],
  [`${MOD}K`, "Go to a sheet by name"],
  [`${MOD}Z`, "Undo"],
  [`${MOD}Shift+Z or ${MOD}Y`, "Redo"],
  [`${MOD}P`, "Print the current sheet"],
  ["Arrows, Enter, Shift+Enter", "Move between cells in a data table"],
  ["Shift+arrows or drag", "Select a block of cells"],
  [`${MOD}C / ${MOD}X / ${MOD}V`, "Copy, cut, paste a block (tab-separated)"],
  [`${MOD}E`, "Exclude or include the selected values"],
  [`${MOD}Shift+Enter`, "Insert a row below"],
  ["Delete", "Clear the selected block"],
  ["Alt+↑ / Alt+↓", "Move a sheet in the navigator"],
  ["F2", "Rename the selected sheet"],
];

export default function HelpPanel({ initial, onClose, onWizard, onTour, onStart }: {
  initial: string | null;
  onClose: () => void;
  onWizard: () => void;
  onTour: () => void;
  onStart: () => void;
}) {
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState<string | null>(initial);
  useEffect(() => { setCurrent(initial); }, [initial]);
  const search = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  const list = useMemo(() => searchExplainers(query), [query]);
  const shortcuts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? SHORTCUTS.filter(([k, v]) => `${k} ${v}`.toLowerCase().includes(q)) : SHORTCUTS;
  }, [query]);
  const e = current ? explainer(current) : undefined;

  useEffect(() => {
    if (e) heading.current?.focus();
    else search.current?.focus();
  }, [e]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !document.querySelector("dialog[open]")) {
        ev.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside className="help-panel" ref={panel} role="complementary" aria-label="Help">
      <div className="help-head">
        <h2>Help</h2>
        <button type="button" className="help-close" onClick={onClose}
          aria-label="Close help">×</button>
      </div>
      {e ? (
        <div className="help-body">
          <button type="button" className="help-back" onClick={() => setCurrent(null)}>
            ← All topics</button>
          <h3 ref={heading} tabIndex={-1} className="help-topic-title">{e.title}</h3>
          <p className="help-summary">{e.summary}</p>
          <ExplainerBody e={e} />
        </div>
      ) : (
        <div className="help-body">
          <label className="help-search">
            <span className="sr-only">Search help</span>
            <input ref={search} type="search" value={query} placeholder="Search: SEM, post hoc, IC50…"
              onChange={(ev) => setQuery(ev.target.value)} aria-label="Search help" />
          </label>
          {!query && (
            <div className="help-actions">
              <button type="button" className="btn-primary" onClick={onWizard}>Help me choose a test…</button>
              <button type="button" onClick={onTour}>Take the tour</button>
              <button type="button" onClick={onStart}>Start screen</button>
            </div>
          )}
          <h3 className="help-section">Explainers</h3>
          {list.length ? (
            <ul className="help-topics">
              {list.map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => setCurrent(x.id)}>
                    <span className="help-topic-name">{x.title}</span>
                    <span className="help-topic-sum">{x.summary}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="hint-block">No explainer matches “{query}”.</p>}
          {shortcuts.length > 0 && (
            <>
              <h3 className="help-section">Keyboard shortcuts</h3>
              <table className="help-keys">
                <tbody>
                  {shortcuts.map(([k, v]) => (
                    <tr key={k}><th><kbd>{k}</kbd></th><td>{v}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
