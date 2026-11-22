// Toasts for events (DECISIONS 6): a stack at the bottom right (bottom
// centre on phones, above the home indicator), 380px wide, at most three,
// the newest at the bottom. Each toast sits at the bottom of the stack and
// is lifted by transform from the measured heights of the newer ones, so
// a toast arriving or leaving moves the others without a re-layout.
//
// Toasts never take focus. F6 moves focus into the stack (the newest
// toast's first button) and F6 again returns it where it was.
import {
  useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore,
  type CSSProperties, type ReactNode,
} from "react";
import { Announcer } from "./Announcer";
import { announce } from "./Announcer.store";
import { Button } from "./Button";
import { CloseIcon, ToneIcon } from "./feedbackIcons";
import { IconButton } from "./IconButton";
import { toasts, type Toast } from "./Toast.store";
import "./Toast.css";

const GAP = 8;

// Every toast shown or replaced is spoken once; errors interrupt.
toasts.onMessage = (t) => announce(t.message, t.tone === "error" ? "assertive" : "polite");
// For the e2e scripts (scripts/e2e-feedback.mjs), as __opendose is.
(globalThis as { __opendoseToasts?: typeof toasts }).__opendoseToasts = toasts;

/** Mounted once at the app root: the toast stack and the live regions. */
export function ToastProvider({ children }: { children?: ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
      <Announcer />
    </>
  );
}

function Toaster() {
  const list = useSyncExternalStore(toasts.subscribe, toasts.getSnapshot);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const region = useRef<HTMLElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const measured = useCallback((id: string, h: number) => {
    setHeights((m) => (m[id] === h ? m : { ...m, [id]: h }));
  }, []);

  // Forget the heights of removed toasts.
  useEffect(() => {
    setHeights((m) => {
      const keep = Object.fromEntries(Object.entries(m).filter(([id]) => list.some((t) => t.id === id)));
      return Object.keys(keep).length === Object.keys(m).length ? m : keep;
    });
  }, [list]);

  // Timers stand still while the tab is hidden.
  useEffect(() => {
    const onVis = () => toasts.setPaused("hidden", document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // F6: into the stack, and back out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F6" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = region.current;
      if (!el) return;
      const active = document.activeElement as HTMLElement | null;
      if (active && el.contains(active)) {
        e.preventDefault();
        const back = returnTo.current;
        returnTo.current = null;
        if (back?.isConnected) back.focus(); else active.blur();
        return;
      }
      const targets = el.querySelectorAll<HTMLElement>("li:not([data-closing]) button");
      if (!targets.length) return;
      e.preventDefault();
      returnTo.current = active && active !== document.body ? active : null;
      // The newest toast is last; focus its first button.
      const newest = [...el.querySelectorAll<HTMLElement>("li:not([data-closing])")].at(-1);
      (newest?.querySelector<HTMLElement>("button") ?? targets[0]).focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const dismiss = (t: Toast, viaKeyboardFocus: boolean) => {
    toasts.dismiss(t.id);
    if (!viaKeyboardFocus) return;
    // Focus was on the toast that leaves: hand it to the next toast, or
    // back to where it came from.
    const el = region.current;
    const next = el && [...el.querySelectorAll<HTMLElement>("li:not([data-closing])")]
      .filter((li) => li.dataset.id !== t.id).at(-1);
    const btn = next?.querySelector<HTMLElement>("button");
    if (btn) btn.focus();
    else {
      const back = returnTo.current;
      returnTo.current = null;
      back?.focus();
    }
  };

  // Offsets: each toast is lifted by the heights of the newer ones.
  const offsets: number[] = [];
  let acc = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    offsets[i] = acc;
    acc += (heights[list[i].id] ?? 0) + GAP;
  }

  return (
    <section ref={region} className="toast-region" aria-label="Notifications (F6)"
      onPointerEnter={() => toasts.setPaused("hover", true)}
      onPointerLeave={() => toasts.setPaused("hover", false)}
      onFocus={() => toasts.setPaused("focus", true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) toasts.setPaused("focus", false);
      }}>
      <ol className="toast-list">
        {list.map((t, i) => (
          <ToastItem key={t.id} toast={t} offset={offsets[i]} onMeasure={measured}
            onDismiss={(kb) => dismiss(t, kb)} />
        ))}
      </ol>
    </section>
  );
}

function ToastItem({ toast: t, offset, onMeasure, onDismiss }: {
  toast: Toast;
  offset: number;
  onMeasure: (id: string, h: number) => void;
  onDismiss: (focusWasInside: boolean) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    onMeasure(t.id, el.offsetHeight);
    const ro = new ResizeObserver(() => onMeasure(t.id, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [t.id, t.version, onMeasure]);

  const focusInside = () => !!ref.current?.contains(document.activeElement);
  return (
    <li ref={ref} className="toast" data-tone={t.tone} data-id={t.id}
      data-closing={t.closing ? "" : undefined}
      style={{ "--toast-y": `${offset}px` } as CSSProperties}>
      <span className="toast-icon"><ToneIcon tone={t.tone} /></span>
      <p className="toast-message">{t.message}</p>
      {t.action && (
        <Button size="sm" className="toast-action" onClick={() => {
          const kb = focusInside();
          t.action!.onAction();
          onDismiss(kb);
        }}>{t.action.label}</Button>
      )}
      <IconButton size="sm" className="toast-dismiss" aria-label="Dismiss notification"
        onClick={() => onDismiss(focusInside())}>
        <CloseIcon />
      </IconButton>
    </li>
  );
}
