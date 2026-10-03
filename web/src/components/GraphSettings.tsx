import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import SchemePicker from "./SchemePicker";
import type { SchemeId } from "../lib/palette";
import type { FormatAction } from "../graph/useFormatDialogs";

export interface AxisTitles {
  x: string;
  y: string;
}

interface Props {
  scheme: SchemeId;
  onSchemeChange: (id: SchemeId) => void;
  titles: AxisTitles;
  onTitlesChange: (t: AxisTitles) => void;
  /** What the axes say when the fields are left empty. */
  autoX: string;
  autoY: string;
  /** Column graphs label their x axis with the dataset names instead. */
  showX?: boolean;
  /** Format Graph / Format Axes / annotation dialogs to offer. */
  actions?: FormatAction[];
  /** Something beyond scheme and titles has been formatted. */
  formatted?: boolean;
  /** The graph kind's own options (GraphKindDef.OptionsPanel). */
  options?: ReactNode;
}

// Colors and titles are set once and then left alone, so they do not earn
// two permanent rows under every graph. They live behind one button that
// opens upward over the plot: the card clips its own overflow, and the plot
// is the only place with room.
export default function GraphSettings({
  scheme, onSchemeChange, titles, onTitlesChange, autoX, autoY, showX = true,
  actions, formatted, options,
}: Props) {
  const [open, setOpen] = useState(false);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // The panel opens upward; keep it below the sticky header so its top
  // (the graph options) is never out of reach. It scrolls inside.
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const measure = () => {
      const top = button.current!.getBoundingClientRect().top;
      const header = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      setMaxHeight(Math.max(180, Math.floor(Math.min(top - Math.max(header, 0) - 16,
        window.innerHeight * 0.7))));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Escape should hand the caret back to the control that opened this,
      // not drop focus to the document.
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Say what has been changed from the automatic titles, so the button
  // still carries the information the open panel would.
  const edited = [titles.x.trim() && "X", titles.y.trim() && "Y",
    formatted && "Formatted"].filter(Boolean).join(" + ");

  return (
    <div className="graph-settings" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="settings-btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        Settings
        {edited && <span className="settings-badge">{edited}</span>}
      </button>
      {open && (
        <div className={`settings-pop${options ? " has-options" : ""}`} role="dialog"
          aria-label="Graph settings" style={maxHeight ? { maxHeight } : undefined}>
          {options && (
            <div className="graph-opts-section" role="group" aria-labelledby="graph-opts-h">
              <span className="axis-titles-label" id="graph-opts-h">Graph options</span>
              {options}
            </div>
          )}
          <SchemePicker value={scheme} onChange={onSchemeChange} />
          <div className="axis-titles">
            <span className="axis-titles-label">Axis titles</span>
            {showX && (
              <label>
                X
                <input
                  type="text"
                  value={titles.x}
                  placeholder={autoX || "Automatic"}
                  aria-label="X axis title"
                  onChange={(e) =>
                    onTitlesChange({ ...titles, x: e.target.value })}
                />
              </label>
            )}
            <label>
              Y
              <input
                type="text"
                value={titles.y}
                placeholder={autoY || "Automatic"}
                aria-label="Y axis title"
                onChange={(e) =>
                  onTitlesChange({ ...titles, y: e.target.value })}
              />
            </label>
            <span className="axis-titles-hint">
              Leave empty to keep the automatic title.
            </span>
          </div>
          {actions && actions.length > 0 && (
            <div className="format-actions" role="group" aria-label="Format the graph">
              <span className="axis-titles-label">Format</span>
              {actions.map((a) => (
                <button key={a.id} type="button" className="format-action"
                  onClick={() => { setOpen(false); a.onClick(); }}>{a.label}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
