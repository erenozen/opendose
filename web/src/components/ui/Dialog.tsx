import {
  createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState,
  type ComponentProps, type ReactNode, type RefObject,
} from "react";
import {
  coarsePointer, containTab, durationToken, lastInputWasKeyboard, lockScroll, prefersReducedMotion,
  useMergedRefs,
  pushLayer, triggerOf,
} from "./useDismiss.ts";
import { Button, type ButtonProps } from "./Button";
import "./Dialog.css";

/*
 * Dialog: a modal on the native <dialog> and showModal().
 *
 *   <Dialog open={open} onOpenChange={setOpen}>
 *     <Dialog.Body onSubmit={save}>
 *       <Dialog.Title>Rename sheet</Dialog.Title>
 *       …fields…
 *       <Dialog.Actions>
 *         <Dialog.Close>Cancel</Dialog.Close>
 *         <Button type="submit" variant="primary">Rename</Button>
 *       </Dialog.Actions>
 *     </Dialog.Body>
 *   </Dialog>
 *
 * Controlled (open + onOpenChange) or uncontrolled (defaultOpen,
 * Dialog.Trigger). Also works mounted-while-open (the Modal wrapper):
 * closing on unmount happens in a layout-effect cleanup, while the
 * element is still connected, so the browser and this code can put focus
 * back on the control that opened it. Then:
 * - exit: a snapshot of the closing dialog and its backdrop fades out
 *   (opacity + scale 0.97, 150 ms; opacity only with reduced motion), so
 *   the dialog can leave the DOM at once;
 * - keyboard opens and closes skip the motion (data-instant);
 * - the page behind does not scroll;
 * - a backdrop press closes only when it starts and ends outside the box,
 *   so dragging the dialog's own scrollbar never closes it;
 * - first focus is the first control, or `initialFocus`; on touch
 *   devices the dialog itself, so no keyboard pops up;
 * - Tab and Shift+Tab wrap inside instead of leaving for the browser UI.
 */

interface Ctx {
  setOpen: (open: boolean) => void;
  titleId: string;
}
const DialogContext = createContext<Ctx | null>(null);
const useDialog = () => {
  const c = useContext(DialogContext);
  if (!c) throw new Error("Dialog parts must sit inside <Dialog>");
  return c;
};

type DialogProps = Omit<ComponentProps<"dialog">, "open" | "role"> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** "alertdialog" for confirmations that interrupt. */
  role?: "dialog" | "alertdialog";
  /** Open and close without motion (a dialog summoned by a shortcut).
   *  Keyboard opens are instant anyway. */
  instant?: boolean;
  /** The control to focus on open (fine pointers only; ignored on touch). */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Trigger elements rendered outside the dialog (Dialog.Trigger). */
  trigger?: ReactNode;
};

function Dialog({
  open: openProp, defaultOpen = false, onOpenChange, role, instant, initialFocus, trigger,
  className = "", children, ref, onKeyDown, ...props
}: DialogProps) {
  const [inner, setInner] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : inner;
  const setOpen = useCallback((o: boolean) => {
    if (!controlled) setInner(o);
    onOpenChange?.(o);
  }, [controlled, onOpenChange]);
  const el = useRef<HTMLDialogElement>(null);
  const setRef = useMergedRefs(el, ref);
  const titleId = useId();
  const pressedOutside = useRef(false);

  // Kept fresh for the open/close effect, which runs only when `open` changes.
  const opts = useRef({ instant, initialFocus });
  useLayoutEffect(() => { opts.current = { instant, initialFocus }; });

  useLayoutEffect(() => {
    const d = el.current;
    if (!open || !d) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // When the opener sits in a menu or popover that is closing, its trigger.
    const fallback = triggerOf(opener);
    const still = !!opts.current.instant || lastInputWasKeyboard();
    d.toggleAttribute("data-instant", still);
    // Touch: the dialog takes focus itself, so no software keyboard opens.
    const coarse = coarsePointer();
    d.toggleAttribute("autofocus", coarse);
    if (!d.open) d.showModal();
    if (!coarse) opts.current.initialFocus?.current?.focus();
    const unlock = lockScroll();
    const unstack = pushLayer({ kind: "native", contains: (n) => d.contains(n), escape: () => {} });
    return () => {
      unstack();
      unlock();
      const animate = !lastInputWasKeyboard() && !opts.current.instant;
      const ghost = animate ? snapshot(d) : null;
      if (d.open) d.close();
      returnFocus(d, opener, fallback);
      if (ghost) {
        // React StrictMode re-runs this effect at once on the same node:
        // a dialog that is open again a moment later did not close.
        queueMicrotask(() => { if (!(d.isConnected && d.open)) fadeOut(ghost); });
      }
    };
  }, [open]);

  const value = useMemo(() => ({ setOpen, titleId }), [setOpen, titleId]);
  return (
    <DialogContext.Provider value={value}>
      {trigger}
      <dialog {...props} ref={setRef} role={role} aria-labelledby={titleId}
        className={`modal ${className}`}
        onCancel={(e) => { e.preventDefault(); setOpen(false); }}
        onPointerDown={(e) => { pressedOutside.current = outside(e, el.current); }}
        onClick={(e) => {
          // The press began and ended on the backdrop (not on the dialog's
          // scrollbar, not a drag out of a field).
          if (pressedOutside.current && outside(e, el.current)) setOpen(false);
          pressedOutside.current = false;
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (!e.defaultPrevented && el.current) containTab(e, el.current);
        }}>
        {children}
      </dialog>
    </DialogContext.Provider>
  );
}

/** True for a pointer event on the backdrop: on the <dialog> itself, outside its box. */
function outside(e: { target: EventTarget; clientX: number; clientY: number }, d: HTMLDialogElement | null) {
  if (!d || e.target !== d) return false;
  const r = d.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

/** After close(): the browser has restored focus to the opener if it
 *  could; if focus was dropped instead, put it back ourselves. */
function returnFocus(d: HTMLDialogElement, opener: HTMLElement | null, fallback: HTMLElement | null) {
  const a = document.activeElement;
  if (a && a !== document.body && a.isConnected && !d.contains(a)) return;
  for (const target of [opener, fallback]) {
    if (target?.isConnected && target.getClientRects().length && !target.closest("[inert]")) {
      target.focus({ preventScroll: true });
      if (document.activeElement === target) return;
    }
  }
}

interface Ghost { box: HTMLElement; backdrop: HTMLElement; scrolled: number }

/** A static copy of the closing dialog and its backdrop, in the top layer. */
function snapshot(d: HTMLDialogElement): Ghost | null {
  if (!d.open || typeof d.showPopover !== "function") return null;
  const r = d.getBoundingClientRect();
  const backdrop = document.createElement("div");
  backdrop.className = "dialog-ghost-backdrop";
  const box = document.createElement("div");
  box.className = `${d.className} dialog-ghost`;
  box.append(...[...d.cloneNode(true).childNodes]);
  Object.assign(box.style, {
    left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
  });
  for (const g of [backdrop, box]) {
    g.setAttribute("popover", "manual");
    g.setAttribute("aria-hidden", "true");
    g.inert = true;
  }
  return { box, backdrop, scrolled: d.scrollTop };
}

function fadeOut(g: Ghost) {
  const { box, backdrop, scrolled } = g;
  document.body.append(backdrop, box);
  backdrop.showPopover();
  box.showPopover();
  box.scrollTop = scrolled;
  const root = getComputedStyle(document.documentElement);
  const timing: KeyframeAnimationOptions = {
    duration: durationToken("--dur-exit", 150),
    easing: root.getPropertyValue("--ease-out").trim() || "ease-out",
    fill: "forwards",
  };
  const frames = prefersReducedMotion()
    ? [{ opacity: 1 }, { opacity: 0 }]
    : [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.97)" }];
  box.animate(frames, timing);
  backdrop.animate([{ opacity: 1 }, { opacity: 0 }], timing).finished
    .finally(() => { box.remove(); backdrop.remove(); });
}

/** The padded content; a form, so Enter in a field calls onSubmit. */
function Body({ onSubmit, className = "", ...props }: Omit<ComponentProps<"form">, "onSubmit"> & {
  onSubmit?: () => void;
}) {
  return (
    <form method="dialog" className={`modal-body ${className}`} {...props}
      onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }} />
  );
}

function Title({ className = "", ...props }: ComponentProps<"h2">) {
  const { titleId } = useDialog();
  return <h2 id={titleId} className={`modal-title ${className}`} {...props} />;
}

function Actions({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`modal-actions ${className}`} {...props} />;
}

/** A button that closes the dialog (Cancel, Close): a secondary Button. */
function Close({ onClick, ...props }: ButtonProps) {
  const { setOpen } = useDialog();
  return <Button {...props}
    onClick={(e) => { onClick?.(e); if (!e.defaultPrevented) setOpen(false); }} />;
}

/** A button that opens an uncontrolled dialog; pass it as `trigger`. */
function Trigger({ onClick, ...props }: ComponentProps<"button">) {
  const { setOpen } = useDialog();
  return <button type="button" aria-haspopup="dialog" {...props}
    onClick={(e) => { onClick?.(e); if (!e.defaultPrevented) setOpen(true); }} />;
}

Dialog.Body = Body;
Dialog.Title = Title;
Dialog.Actions = Actions;
Dialog.Close = Close;
Dialog.Trigger = Trigger;

export default Dialog;
