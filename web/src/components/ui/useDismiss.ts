import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref, type RefObject } from "react";

/*
 * The one dismiss + focus layer every overlay primitive (Dialog, Popover,
 * Menu, Tooltip) is built on:
 * - input modality: was the last input a key or a pointer? Keyboard-opened
 *   layers skip their entrance, keyboard closes skip their exit
 *   (emil-animations: keyboard-initiated actions never animate).
 * - a layer stack, so Escape closes only the topmost layer.
 * - useDismiss: Escape and light dismiss (a press outside the layer and
 *   its trigger).
 * - restoreFocus: give focus back to the trigger when it would otherwise
 *   be lost, unless something else (a dialog) has taken it.
 * - usePresence: keeps a closing layer mounted for its exit, with
 *   data-state="open|closed".
 */

// ------------------------------------------------------------ modality

let modality: "keyboard" | "pointer" = "pointer";
let lastKey = "";
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (!MODIFIERS.has(e.key)) { modality = "keyboard"; lastKey = e.key; }
  }, true);
  window.addEventListener("pointerdown", () => { modality = "pointer"; }, true);
}

/** True when the most recent user input was a key press, not a pointer. */
export const lastInputWasKeyboard = () => modality === "keyboard";

/** True when the last input was Tab: focus moved by the user, not handed
 *  back by a closing layer (Escape, Enter on an item). */
export const lastKeyWasTab = () => modality === "keyboard" && lastKey === "Tab";

/** Touch-first device: no autofocus into text fields, no tooltips. */
export const coarsePointer = () =>
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ------------------------------------------------------------ layer stack

interface Layer {
  /** "native": a modal <dialog>, which handles Escape itself (cancel). */
  kind: "native" | "custom";
  contains: (n: Node) => boolean;
  escape: () => void;
}
const stack: Layer[] = [];
let listening = false;

function onEscape(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.isComposing) return;
  const top = stack[stack.length - 1];
  if (!top || top.kind === "native") return;
  // Cancelling the keydown also stops a modal dialog underneath from
  // treating the same press as its close request.
  e.preventDefault();
  e.stopPropagation();
  top.escape();
}

/** Registers an open layer; returns its removal. */
export function pushLayer(layer: Layer): () => void {
  if (!listening && typeof window !== "undefined") {
    window.addEventListener("keydown", onEscape, true);
    listening = true;
  }
  stack.push(layer);
  return () => {
    const i = stack.indexOf(layer);
    if (i >= 0) stack.splice(i, 1);
  };
}

const above = (layer: Layer, n: Node) =>
  stack.slice(stack.indexOf(layer) + 1).some((l) => l.contains(n));

// ------------------------------------------------------------ trigger registry

/* Layer elements remember their trigger for as long as they exist, so a
   dialog opened from inside a menu or popover can fall back to that
   trigger when the control that opened it has gone. */
const triggers = new WeakMap<Element, () => HTMLElement | null>();

function registerTrigger(layer: Element, trigger: () => HTMLElement | null) {
  triggers.set(layer, trigger);
  return () => { triggers.delete(layer); };
}

/** The trigger of the layer that holds `el`, if any. */
export function triggerOf(el: Element | null): HTMLElement | null {
  let n: Element | null = el;
  while (n) {
    const t = triggers.get(n);
    if (t) return t();
    n = n.parentElement;
  }
  return null;
}

// ------------------------------------------------------------ focus

const focusable = (el: HTMLElement | null | undefined): el is HTMLElement =>
  !!el && el.isConnected && el.getClientRects().length > 0 && !el.closest("[inert]")
  && !(el as HTMLButtonElement).disabled;

/**
 * After a layer closes: focus `trigger` when focus would otherwise be lost
 * (on <body>, or still inside the closing layer). Focus that has moved
 * elsewhere on purpose (into a dialog, a rename field) stays where it is.
 */
export function restoreFocus(trigger: HTMLElement | null | undefined, layer?: Element | null) {
  const a = document.activeElement;
  const lost = !a || a === document.body || !a.isConnected || (!!layer && layer.contains(a));
  if (!lost) return;
  const target = focusable(trigger) ? trigger : triggerOf(trigger ?? null);
  if (focusable(target)) target.focus({ preventScroll: true });
}

const TABBABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])", "textarea:not([disabled])", "summary",
  "[tabindex]:not([tabindex='-1'])", "[contenteditable='true']",
].join(",");

/** Elements Tab can reach inside `root`, in order (one radio per group). */
function tabbables(root: Element): HTMLElement[] {
  const seen = new Set<string>();
  return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => {
    if (el.tabIndex < 0 || !focusable(el)) return false;
    if (el.closest("details:not([open])") && el.tagName !== "SUMMARY") return false;
    if (el instanceof HTMLInputElement && el.type === "radio" && el.name) {
      const group = [...root.querySelectorAll<HTMLInputElement>(
        `input[type=radio][name="${CSS.escape(el.name)}"]`)];
      const pick = group.find((r) => r.checked) ?? group[0];
      if (el !== pick || seen.has(el.name)) return false;
      seen.add(el.name);
    }
    return true;
  });
}

/** Keeps Tab and Shift+Tab inside `root`: call from its keydown handler. */
export function containTab(e: KeyboardEvent | React.KeyboardEvent, root: Element) {
  if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
  const list = tabbables(root);
  if (!list.length) { e.preventDefault(); return; }
  const first = list[0];
  const last = list[list.length - 1];
  const a = document.activeElement;
  if (e.shiftKey && (a === first || a === root || !root.contains(a))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (a === last || !root.contains(a))) {
    e.preventDefault();
    first.focus();
  }
}

/** First focus inside a newly opened panel. Opened from the keyboard: its
 *  first control, so typing goes on at once. Opened with a pointer: the
 *  panel itself (Tab then reaches the first control), so no focus ring
 *  lands on a field nobody chose and no software keyboard pops up. */
export function focusInside(root: HTMLElement) {
  const first = lastInputWasKeyboard() ? tabbables(root)[0] : undefined;
  (first ?? root).focus({ preventScroll: true });
}

/**
 * Focus return for an anchored layer (Popover, Menu), however it closes
 * (Escape, an item, a Close button, the caller):
 * - when `open` turns false, in the layout phase, so it lands after React
 *   has put back the focus it saw before the commit;
 * - when the layer leaves the DOM (after its exit) with focus inside.
 * While the layer exists its trigger stays registered, so a dialog opened
 * from inside it can return to that trigger once the layer has gone.
 */
export function useReturnFocus(open: boolean, mounted: boolean,
  layer: RefObject<HTMLElement | null>, trigger: RefObject<HTMLElement | null>, enabled = true) {
  useLayoutEffect(() => {
    const node = layer.current;
    const owner = trigger.current;
    if (!mounted || !node) return;
    const unregister = registerTrigger(node, () => owner);
    return () => {
      unregister();
      if (enabled) restoreFocus(owner, node);
    };
  }, [mounted, layer, trigger, enabled]);
  const was = useRef(open);
  useLayoutEffect(() => {
    if (was.current && !open && enabled) restoreFocus(trigger.current, layer.current);
    was.current = open;
  }, [open, layer, trigger, enabled]);
}

// ------------------------------------------------------------ dismiss

export type DismissReason = "escape" | "outside";

/**
 * Escape (topmost layer only) and light dismiss for an open layer. A
 * press inside the layer, its trigger or a layer opened above it (a
 * dialog, a nested menu) does not count as outside.
 */
export function useDismiss({ open, layer, trigger, onDismiss }: {
  open: boolean;
  layer: RefObject<HTMLElement | null>;
  trigger?: RefObject<HTMLElement | null>;
  onDismiss: (reason: DismissReason) => void;
}) {
  const latest = useRef(onDismiss);
  useLayoutEffect(() => { latest.current = onDismiss; });
  useEffect(() => {
    if (!open) return;
    const entry: Layer = {
      kind: "custom",
      contains: (n) => !!layer.current?.contains(n),
      escape: () => latest.current("escape"),
    };
    const remove = pushLayer(entry);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (layer.current?.contains(t) || trigger?.current?.contains(t) || above(entry, t)) return;
      latest.current("outside");
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      remove();
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, layer, trigger]);
}

// ------------------------------------------------------------ presence

/**
 * Keeps a layer mounted while it plays its exit. `state` goes to "closed"
 * when `open` turns false; the layer unmounts once the transitions that
 * started have finished. Keyboard closes unmount at once, and `instant`
 * reports a keyboard open (the layer then skips its entrance).
 */
export function usePresence(open: boolean, ref: RefObject<HTMLElement | null>,
  onExitComplete?: () => void) {
  const [prev, setPrev] = useState(open);
  const [exiting, setExiting] = useState(false);
  const [instant, setInstant] = useState(() => open && lastInputWasKeyboard());
  if (prev !== open) {
    setPrev(open);
    const keyboard = lastInputWasKeyboard();
    if (open) { setExiting(false); setInstant(keyboard); }
    else setExiting(!keyboard && !!ref.current);
  }
  const done = useRef(onExitComplete);
  useLayoutEffect(() => { done.current = onExitComplete; });
  const mounted = open || exiting;
  const wasMounted = useRef(mounted);
  useEffect(() => {
    if (wasMounted.current && !mounted) done.current?.();
    wasMounted.current = mounted;
  }, [mounted]);
  useEffect(() => {
    if (!exiting) return;
    let over = false;
    const finish = () => { if (!over) { over = true; setExiting(false); } };
    const raf = requestAnimationFrame(() => {
      const runs = ref.current?.getAnimations() ?? [];
      if (!runs.length) finish();
      else Promise.all(runs.map((a) => a.finished)).then(finish, finish);
    });
    const cap = setTimeout(finish, 400);
    return () => { cancelAnimationFrame(raf); clearTimeout(cap); };
  }, [exiting, ref]);
  return { mounted, state: open ? "open" : "closed", instant } as const;
}

// ------------------------------------------------------------ top layer

/** Shows a `popover="manual"` element in the top layer while mounted. */
export function useTopLayer(ref: RefObject<HTMLElement | null>, mounted: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!mounted || !el) return;
    if (!el.matches(":popover-open")) el.showPopover();
    return () => { if (el.isConnected && el.matches(":popover-open")) el.hidePopover(); };
  }, [mounted, ref]);
}

// ------------------------------------------------------------ scroll lock

let locks = 0;
let saved = { overflow: "", gutter: "" };

/** Stops the page behind a modal layer from scrolling (ref-counted). */
export function lockScroll(): () => void {
  const html = document.documentElement;
  if (locks++ === 0) {
    saved = { overflow: html.style.overflow, gutter: html.style.scrollbarGutter };
    // Keep the scrollbar's room so the page does not shift sideways.
    if (window.innerWidth > html.clientWidth) html.style.scrollbarGutter = "stable";
    html.style.overflow = "hidden";
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) {
      html.style.overflow = saved.overflow;
      html.style.scrollbarGutter = saved.gutter;
    }
  };
}

// ------------------------------------------------------------ refs

/** One ref callback that feeds several refs (a primitive's own and the caller's). */
function mergeRefs<T>(...refs: (Ref<T> | undefined)[]): (node: T | null) => void {
  return (node) => {
    for (const r of refs) {
      if (typeof r === "function") r(node);
      else if (r) (r as React.RefObject<T | null>).current = node;
    }
  };
}

/** mergeRefs, stable across renders. A new callback on every render would
 *  make React detach the refs (set them to null) during each commit, just
 *  when a closing layer's cleanup needs its trigger. */
export function useMergedRefs<T>(a: Ref<T> | undefined, b: Ref<T> | undefined) {
  return useMemo(() => mergeRefs(a, b), [a, b]);
}
