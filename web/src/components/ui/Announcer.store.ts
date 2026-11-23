// The app's one pair of live regions (DECISIONS 6): a polite
// role=status and an assertive role=alert, mounted once at the root by
// <Announcer> (Announcer.tsx). Toasts and banners are not live regions
// themselves; they speak through announce(), so every message is read
// exactly once and focus never moves.
//
// Each message is written once, as a node of its own added in its own
// animation frame: three messages in one second are three additions,
// read in turn, not one overwriting the next. Spoken nodes are removed
// after a while (removals are not read), so the region never grows.

export type Politeness = "polite" | "assertive";

/** How long a spoken message stays in the region. */
const KEEP_MS = 10000;

const regions: Partial<Record<Politeness, HTMLElement>> = {};
const queues: Record<Politeness, string[]> = { polite: [], assertive: [] };
const frames: Partial<Record<Politeness, number>> = {};

function flush(p: Politeness) {
  frames[p] = undefined;
  const el = regions[p];
  if (!el) return;
  const message = queues[p].shift();
  if (message == null) return;
  const node = document.createElement("p");
  node.textContent = message;
  el.appendChild(node);
  setTimeout(() => node.remove(), KEEP_MS);
  if (queues[p].length) frames[p] = requestAnimationFrame(() => flush(p));
}

/** Speaks `message` once. Errors are assertive; everything else polite. */
export function announce(message: string, politeness: Politeness = "polite"): void {
  const text = message.trim();
  if (!text) return;
  queues[politeness].push(text);
  if (regions[politeness] && frames[politeness] == null) {
    frames[politeness] = requestAnimationFrame(() => flush(politeness));
  }
}

/** Called by <Announcer> when its regions mount (null when they unmount).
 *  Messages raised before the mount are spoken then. */
export function registerRegions(polite: HTMLElement | null, assertive: HTMLElement | null): void {
  for (const [p, el] of [["polite", polite], ["assertive", assertive]] as const) {
    if (el) {
      regions[p] = el;
      if (queues[p].length && frames[p] == null) frames[p] = requestAnimationFrame(() => flush(p));
    } else {
      delete regions[p];
      if (frames[p] != null) cancelAnimationFrame(frames[p]);
      frames[p] = undefined;
    }
  }
}
