import {
  createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState,
  type ComponentProps, type ReactNode, type RefObject,
} from "react";
import {
  containTab, focusInside, restoreFocus, useMergedRefs, useReturnFocus,
  useDismiss, usePresence, useTopLayer,
} from "./useDismiss.ts";
import { boxOf, useAnchoredPosition, type AnchorOptions } from "./Popover.anchor.ts";
import type { Box } from "./Popover.place.ts";
import "./Popover.css";

/*
 * Popover: a non-modal floating panel anchored to its trigger.
 *
 *   <Popover>
 *     <Popover.Trigger className="settings-btn">Options</Popover.Trigger>
 *     <Popover.Content aria-label="Export options" side="bottom" align="end">…</Popover.Content>
 *   </Popover>
 *
 * Built on the Popover API (`popover="manual"`): the panel renders in the
 * top layer, so no clipping ancestor (a card with overflow: hidden) cuts it
 * off and no z-index fights it, while it stays next to its trigger in the
 * DOM and the tab order. "manual" rather than "auto" because the shared
 * dismiss hook owns Escape and light dismiss (one stack for menus,
 * popovers and dialogs), and an auto popover would be closed by any
 * dialog that opens. Focus moves in on open, Tab stays inside, Escape and
 * a press outside close it, and focus returns to the trigger.
 */

interface Ctx {
  open: boolean;
  setOpen: (open: boolean) => void;
  trigger: RefObject<HTMLButtonElement | null>;
  contentId: string;
}
const PopoverContext = createContext<Ctx | null>(null);
const usePopover = () => {
  const c = useContext(PopoverContext);
  if (!c) throw new Error("Popover parts must sit inside <Popover>");
  return c;
};

function Popover({ open: openProp, defaultOpen = false, onOpenChange, children }: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [inner, setInner] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : inner;
  const trigger = useRef<HTMLButtonElement>(null);
  const contentId = useId();
  const setOpen = useCallback((o: boolean) => {
    if (!controlled) setInner(o);
    onOpenChange?.(o);
  }, [controlled, onOpenChange]);
  const value = useMemo(() => ({ open, setOpen, trigger, contentId }),
    [open, setOpen, contentId]);
  return <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>;
}

/** The button that opens and closes the popover (a second click closes it). */
function Trigger({ ref, onClick, ...props }: ComponentProps<"button">) {
  const { open, setOpen, trigger, contentId } = usePopover();
  const setRef = useMergedRefs(trigger, ref);
  return (
    <button type="button" aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? contentId : undefined} {...props}
      ref={setRef}
      onClick={(e) => { onClick?.(e); if (!e.defaultPrevented) setOpen(!open); }} />
  );
}

type ContentProps = Omit<ComponentProps<"div">, "popover"> & AnchorOptions & {
  /** Move focus into the panel on open (default true). */
  autoFocus?: boolean;
  /** Place the panel against this element (or viewport box) instead of
   *  Popover.Trigger: a coach mark pointing at part of the page. */
  anchor?: () => Element | Box | null;
  /** A new value places the panel again (the anchor changed). */
  anchorKey?: string;
  /** Close on a press outside (default true). False for a panel the user
   *  works beside, such as a tour step that asks them to edit a cell. */
  closeOnOutsidePress?: boolean;
};

/** The floating panel. `role="dialog"` by default; name it with aria-label. */
function Content({
  ref, side = "bottom", align = "start", sideOffset = 8, collisionPadding, collisionBoundary,
  autoFocus = true, anchor, anchorKey, closeOnOutsidePress = true, className = "", children,
  onKeyDown, ...props
}: ContentProps) {
  const { open, setOpen, trigger, contentId } = usePopover();
  const el = useRef<HTMLDivElement>(null);
  const setRef = useMergedRefs(el, ref);
  const { mounted, state, instant } = usePresence(open, el);
  useTopLayer(el, mounted);
  useAnchoredPosition(el, mounted, () => {
    const a = anchor ? anchor() : trigger.current;
    return a instanceof Element ? boxOf(a) : a;
  },
    { side, align, sideOffset, collisionPadding, collisionBoundary }, anchorKey);
  useDismiss({
    open, layer: el, trigger,
    onDismiss: (reason) => {
      if (reason === "outside" && !closeOnOutsidePress) return;
      setOpen(false);
      // A press outside moves focus after this runs: check again once it has.
      if (reason === "outside") setTimeout(() => restoreFocus(trigger.current, el.current));
    },
  });
  useReturnFocus(open, mounted, el, trigger);
  useLayoutEffect(() => {
    if (open && autoFocus && el.current) focusInside(el.current);
  }, [open, autoFocus]);
  if (!mounted) return null;
  return (
    <div role="dialog" {...props} id={contentId} ref={setRef} popover="manual"
      tabIndex={-1} className={`ui-layer ${className}`} data-state={state}
      data-instant={instant || undefined}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (!e.defaultPrevented && el.current) containTab(e, el.current);
      }}>
      {children}
    </div>
  );
}

/** A button inside the panel that closes it (focus goes back to the trigger). */
function Close({ onClick, ...props }: ComponentProps<"button">) {
  const { setOpen } = usePopover();
  return (
    <button type="button" {...props} onClick={(e) => {
      onClick?.(e);
      if (!e.defaultPrevented) setOpen(false);
    }} />
  );
}

Popover.Trigger = Trigger;
Popover.Content = Content;
Popover.Close = Close;

export default Popover;
