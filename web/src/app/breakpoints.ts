// The shell's widths, in one place for scripts (C-23). CSS media queries
// cannot read custom properties, so the stylesheets repeat these three
// numbers as literals; docs/design/layout-and-surfaces.md lists what each
// one changes. Never add a fourth for the shell: a component whose own
// width decides its layout uses a container query instead.
import { useSyncExternalStore } from "react";

export const BREAKPOINTS = {
  /** At or below: the workbench is one column. */
  columns: 1100,
  /** At or below: the navigator is a drawer (a modal dialog). */
  drawer: 900,
  /** At or below: the phone layout. */
  phone: 760,
} as const;

export const DRAWER_QUERY = `(max-width: ${BREAKPOINTS.drawer}px)`;

// One subscribe function per query, so React keeps its subscription
// across renders instead of re-subscribing each time.
const subscribers = new Map<string, (onChange: () => void) => () => void>();
function subscribe(query: string) {
  let fn = subscribers.get(query);
  if (!fn) {
    fn = (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    };
    subscribers.set(query, fn);
  }
  return fn;
}

/** True while `query` matches; re-renders when it starts or stops. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(subscribe(query), () => window.matchMedia(query).matches, () => false);
}
