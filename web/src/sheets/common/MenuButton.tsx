import { useEffect, useRef, useState, type ReactNode } from "react";

export interface MenuEntry {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  hint?: string;          // right-aligned, e.g. a shortcut
  danger?: boolean;
}

/**
 * A toolbar button that opens a small menu (WAI-ARIA menu button):
 * arrows move between items, Escape or a click outside closes it and
 * focus returns to the button.
 */
export default function MenuButton({ label, items, align = "left", title }: {
  label: ReactNode;
  items: (MenuEntry | "sep")[];
  align?: "left" | "right";
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    requestAnimationFrame(() => wrap.current
      ?.querySelector<HTMLElement>("[role=menuitem]:not([aria-disabled=true])")?.focus());
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) requestAnimationFrame(() => btn.current?.focus());
  };

  const onKey = (e: React.KeyboardEvent) => {
    const list = [...(wrap.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : list.length - 1;
      list[(i + step) % list.length]?.focus();
    } else if (e.key === "Home") { e.preventDefault(); list[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); list[list.length - 1]?.focus(); }
    else if (e.key === "Tab") close(false);
  };

  return (
    <span className="menu-wrap" ref={wrap}>
      <button type="button" ref={btn} aria-haspopup="menu" aria-expanded={open}
        title={title} onClick={() => setOpen((o) => !o)}>
        {label}<span className="caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={`sheet-menu grid-menu${align === "right" ? " align-right" : ""}`}
          role="menu" onKeyDown={onKey}>
          {items.map((it, i) => it === "sep" ? (
            <div key={`sep${i}`} className="menu-sep" role="separator" />
          ) : (
            <button key={it.label} type="button" role="menuitem" tabIndex={-1}
              className={`menu-item${it.danger ? " danger" : ""}`}
              aria-disabled={it.disabled || undefined}
              onClick={() => {
                if (it.disabled) return;
                close(false);
                it.onSelect();
              }}>
              <span>{it.label}</span>
              {it.hint && <kbd>{it.hint}</kbd>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
