import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { HIGHLIGHT_COLORS, type HighlightColor, type Sheet } from "../project/types";

export interface MenuAction {
  label: string;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
  shortcut?: string;
}

/**
 * Popup menu for one sheet: actions plus a highlight-color row. Opens at a
 * point (right click) or under its anchor; arrow keys move, Escape closes
 * and gives focus back to whatever opened it.
 */
export default function SheetMenu({ sheet, at, actions, onHighlight, onClose }: {
  sheet: Sheet;
  at: { x: number; y: number };
  actions: (MenuAction | "sep")[];
  onHighlight: (c: HighlightColor | null) => void;
  onClose: (refocus: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(8, Math.min(at.x, window.innerWidth - r.width - 8)),
      y: Math.max(8, Math.min(at.y, window.innerHeight - r.height - 8)),
    });
    el.querySelector<HTMLElement>("[role=menuitem]:not([aria-disabled=true])")?.focus();
  }, [at]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onClose]);

  const items = () => [...(ref.current?.querySelectorAll<HTMLElement>(
    "[role=menuitem]:not([aria-disabled=true]), [role=menuitemradio]") ?? [])];

  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      onClose(true);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      list[(i + d + list.length) % list.length]?.focus();
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      // Within the color row, left/right move between swatches.
      if ((document.activeElement as HTMLElement)?.getAttribute("role") !== "menuitemradio") return;
      e.preventDefault();
      const d = e.key === "ArrowRight" ? 1 : -1;
      list[(i + d + list.length) % list.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      (e.key === "Home" ? list[0] : list[list.length - 1])?.focus();
    }
  };

  return (
    <div ref={ref} className="sheet-menu" role="menu"
      aria-label={`Actions for ${sheet.name}`}
      style={{ left: pos.x, top: pos.y }} onKeyDown={onKeyDown}>
      {actions.map((a, i) => a === "sep" ? (
        <div key={`sep${i}`} className="menu-sep" role="separator" />
      ) : (
        <button key={a.label} type="button" role="menuitem" tabIndex={-1}
          aria-disabled={a.disabled || undefined}
          className={`menu-item${a.danger ? " danger" : ""}`}
          onClick={() => {
            if (a.disabled) return;
            onClose(false);
            a.run();
          }}>
          <span>{a.label}</span>
          {a.shortcut && <kbd>{a.shortcut}</kbd>}
        </button>
      ))}
      <div className="menu-sep" role="separator" />
      <div className="menu-colors" role="group" aria-label="Highlight color">
        <button type="button" role="menuitemradio" tabIndex={-1}
          aria-checked={!sheet.highlight} aria-label="No highlight"
          className="swatch swatch-none"
          onClick={() => { onHighlight(null); onClose(true); }} />
        {HIGHLIGHT_COLORS.map((c) => (
          <button key={c} type="button" role="menuitemradio" tabIndex={-1}
            aria-checked={sheet.highlight === c} aria-label={`Highlight ${c}`}
            className={`swatch hl-${c}`}
            onClick={() => { onHighlight(c); onClose(true); }} />
        ))}
      </div>
    </div>
  );
}
