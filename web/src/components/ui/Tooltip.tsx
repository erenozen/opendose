import {
  Children, cloneElement, useEffect, useId, useLayoutEffect, useRef, useState,
  type FocusEvent, type PointerEvent, type ReactElement, type Ref,
} from "react";
import { lastKeyWasTab, useMergedRefs, useTopLayer } from "./useDismiss.ts";
import { boxOf, useAnchoredPosition } from "./Popover.anchor.ts";
import type { Align, Side } from "./Popover.place.ts";
import "./Popover.css";
import "./Tooltip.css";

/*
 * Tooltip, for icon-only buttons only (everything else keeps plain text or
 * `title`). The button's aria-label stays its name, so the tooltip is
 * never the only source of information:
 *
 *   <Tooltip content="Undo" shortcut="Ctrl+Z">
 *     <button aria-label="Undo">…</button>
 *   </Tooltip>
 *
 * Opens 500 ms after the pointer settles on the button, at once on
 * keyboard focus, and at once (no entrance) while warm: within 300 ms of
 * another tooltip closing (emil-touch-and-accessibility). Hidden on touch
 * screens. Escape closes it; the pointer may move onto it (WCAG 1.4.13).
 * aria-describedby carries only what the name does not already say (the
 * shortcut, or a label that differs from the name).
 */

const DELAY_MS = 500;
const WARM_MS = 300;
const GRACE_MS = 100;
let warmUntil = 0;
/** The tooltip on screen, if any: a new one replaces it without a wait. */
let current: { close: () => void } | null = null;

const canHover = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

interface TriggerProps {
  ref?: Ref<HTMLElement>;
  "aria-label"?: string;
  "aria-describedby"?: string;
  onPointerEnter?: (e: PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (e: PointerEvent<HTMLElement>) => void;
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  onFocus?: (e: FocusEvent<HTMLElement>) => void;
  onBlur?: (e: FocusEvent<HTMLElement>) => void;
}

export default function Tooltip({ content, shortcut, side = "bottom", align = "center", children }: {
  content: string;
  shortcut?: string;
  side?: Side;
  align?: Align;
  /** One element: the icon button. */
  children: ReactElement<TriggerProps>;
}) {
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  const tip = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const id = useId();
  const child = Children.only(children);
  const p = child.props;
  const setRef = useMergedRefs(trigger, p.ref);
  const self = useRef({ close: () => {} });
  useTopLayer(tip, open);
  useAnchoredPosition(tip, open, () => boxOf(trigger.current), { side, align, sideOffset: 6 });

  const show = (now: boolean) => {
    clearTimeout(timer.current);
    const other = current && current !== self.current ? current : null;
    other?.close();
    if (now || other || Date.now() < warmUntil) { setInstant(true); setOpen(true); return; }
    timer.current = setTimeout(() => { setInstant(false); setOpen(true); }, DELAY_MS);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen((was) => {
      if (was) warmUntil = Date.now() + WARM_MS;
      return false;
    });
  };
  const hideSoon = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(hide, GRACE_MS);
  };

  useLayoutEffect(() => { self.current.close = hide; });
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const me = self.current;
    current = me;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    document.addEventListener("keydown", onKey, true);
    return () => {
      if (current === me) current = null;
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const name = p["aria-label"]?.trim().toLowerCase();
  const sameAsName = name === content.trim().toLowerCase();
  const describedBy = [p["aria-describedby"],
    sameAsName ? (shortcut ? `${id}-keys` : undefined) : id].filter(Boolean).join(" ") || undefined;

  return (
    <>
      {cloneElement(child, {
        ref: setRef,
        "aria-describedby": describedBy,
        onPointerEnter: (e) => {
          p.onPointerEnter?.(e);
          if (e.pointerType === "mouse" && canHover()) show(false);
        },
        onPointerLeave: (e) => { p.onPointerLeave?.(e); hideSoon(); },
        onPointerDown: (e) => { p.onPointerDown?.(e); hide(); },
        onFocus: (e) => {
          p.onFocus?.(e);
          // Tabbed to, not focus handed back by a closing popover.
          if (canHover() && lastKeyWasTab()) show(true);
        },
        onBlur: (e) => { p.onBlur?.(e); hide(); },
      })}
      <span ref={tip} id={id} role="tooltip" popover="manual" className="ui-layer ui-tooltip"
        data-instant={instant || undefined}
        onPointerEnter={() => clearTimeout(timer.current)} onPointerLeave={hideSoon}>
        {content}
        {shortcut && <kbd id={`${id}-keys`}>{shortcut}</kbd>}
      </span>
    </>
  );
}
