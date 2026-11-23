// Help panel (Ctrl/Cmd+/): searchable explainers, the guided tour, the
// "Which test?" wizard, the example project and the keyboard shortcuts.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import {
  coarsePointer, pushLayer, restoreFocus, useMergedRefs,
} from "../components/ui/useDismiss";
import { explainer, searchExplainers } from "./explainers";
import { ExplainerBody } from "./LearnMore";

const mac = typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform);
const MOD = mac ? "⌘" : "Ctrl+";

const SHORTCUTS: [string, string][] = [
  [`${MOD}/`, "Open or close this help panel"],
  [`${MOD}K`, "Find a command or sheet"],
  [`${MOD}S`, "Save the project file"],
  [`${MOD}O`, "Open a project or a Prism file"],
  [`${MOD}Z`, "Undo"],
  [`${MOD}Shift+Z or ${MOD}Y`, "Redo"],
  [`${MOD}P`, "Print the current sheet"],
  ["Arrows, Enter, Shift+Enter", "Move between cells in a data table"],
  ["Shift+arrows or drag", "Select a block of cells"],
  [`${MOD}arrow, ${MOD}Shift+arrow`, "Jump to the edge of the data in a data table; with Shift, select up to it"],
  ["Home, End", "First or last cell of the row (in a cell being edited: start or end of its text)"],
  [`${MOD}Home, ${MOD}End`, "First cell of the table, or its last row and column with a value"],
  [`${MOD}A`, "Select the whole table (in a cell being edited: its text first)"],
  [`${MOD}D`, "Fill down: copy the top row of the selection into the rows below (one row: the row above); exclusions stay as they were"],
  [`${MOD}C / ${MOD}X / ${MOD}V`, "Copy, cut, paste a block (tab-separated)"],
  [`${MOD}E`, "Exclude or include the selected values"],
  [`${MOD}Shift+Enter`, "Insert a row below"],
  [`${MOD}F`, "Find in a data table"],
  [mac ? "⌘Shift+H" : "Ctrl+H", "Replace in a data table (with the table focused; elsewhere the browser keeps the key)"],
  ["Delete", "Clear the selected block"],
  ["Alt+↑ / Alt+↓", "Move a sheet in the navigator"],
  ["F2", "Rename the selected sheet"],
];

export default function HelpPanel({
  open, instant, initial, onClose, onWizard, onTour, onExample, ref,
}: {
  /** False while the panel plays its exit (GuideProvider keeps it mounted). */
  open: boolean;
  /** Opened from the keyboard (Ctrl/Cmd+/): no entrance. */
  instant: boolean;
  initial: string | null;
  onClose: () => void;
  onWizard: () => void;
  onTour: () => void;
  /** Open the example project (the shell asks first). */
  onExample: () => void;
  ref?: Ref<HTMLElement>;
}) {
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState<string | null>(initial);
  useEffect(() => { setCurrent(initial); }, [initial]);
  const search = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  const setPanel = useMergedRefs(panel, ref);
  const list = useMemo(() => searchExplainers(query), [query]);
  const shortcuts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? SHORTCUTS.filter(([k, v]) => `${k} ${v}`.toLowerCase().includes(q)) : SHORTCUTS;
  }, [query]);
  const e = current ? explainer(current) : undefined;

  // First focus: the topic's heading, or the search field, except on touch
  // screens, where the panel's own heading takes it so no keyboard covers
  // the panel before anyone chose to search.
  useEffect(() => {
    if (!open) return;
    if (e) heading.current?.focus();
    else if (coarsePointer()) title.current?.focus();
    else search.current?.focus();
  }, [e, open]);
  // Escape closes the panel when it is the topmost layer (a menu or dialog
  // above it closes first), through the shared layer stack.
  const close = useRef(onClose);
  useLayoutEffect(() => { close.current = onClose; });
  useEffect(() => {
    if (!open) return;
    return pushLayer({
      kind: "custom", contains: (n) => !!panel.current?.contains(n), escape: () => close.current(),
    });
  }, [open]);
  // Closed by any route: focus goes back to where it was when the panel
  // opened, as it closes, not after its exit.
  useLayoutEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = panel.current;
    return () => restoreFocus(opener, node);
  }, [open]);

  return (
    <aside className="help-panel" ref={setPanel} role="complementary" aria-label="Help"
      data-state={open ? "open" : "closed"} data-instant={instant || undefined}
      // Leaving: inert and out of the accessibility tree while it fades.
      inert={!open || undefined}>
      <div className="help-head">
        <h2 ref={title} tabIndex={-1}>Help</h2>
        <IconButton aria-label="Close help" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
          </svg>
        </IconButton>
      </div>
      {e ? (
        <div className="help-body">
          <Button variant="ghost" size="sm" className="help-back" onClick={() => setCurrent(null)}>
            ← All topics</Button>
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
              <Button variant="primary" onClick={onWizard}>Help me choose a test…</Button>
              <Button onClick={onTour}>Take the tour</Button>
              <Button onClick={onExample}>Open the example project…</Button>
            </div>
          )}
          <h3 className="help-section">Explainers</h3>
          {list.length ? (
            <ul className="help-topics" data-still>
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
