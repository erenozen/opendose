// Opening a share link: when the page loads with "#p=…", the project in
// the link is what the app starts with, read-only.
import type { IdFactory } from "../project/ids.ts";
import { projectFromJson } from "../project/persist.ts";
import type { Project, ProjectPrefs } from "../project/types.ts";
import { readFragment, sharePayload } from "./link.ts";

export interface ShareBoot {
  project: Project | null;
  /** The sheet the sender had on screen, if the link says. */
  selected?: string | null;
  /** Why a share link in the address could not be opened ("" = fine). */
  error: string;
}

export function locationHash(): string {
  try { return globalThis.location?.hash ?? ""; } catch { return ""; }
}

export function hasShareLink(hash = locationHash()): boolean {
  return sharePayload(hash) !== null;
}

/** The shared project in the address bar, if any. */
export function readShareBoot(prefs: ProjectPrefs, ids: IdFactory, hash = locationHash()): ShareBoot {
  if (!hasShareLink(hash)) return { project: null, error: "" };
  try {
    const raw = readFragment(hash);
    const sel = (raw as { selected?: unknown } | null)?.selected;
    return {
      project: projectFromJson(raw, { prefs, ids }), error: "",
      selected: typeof sel === "string" ? sel : null,
    };
  } catch (e) {
    return { project: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Drop "#p=…" from the address without reloading (after "Make a copy",
 *  or when another project replaces the shared one), so a reload opens
 *  the user's own work rather than the link again. */
export function clearShareLink(): void {
  try {
    if (!hasShareLink()) return;
    const { pathname, search } = globalThis.location;
    globalThis.history.replaceState(globalThis.history.state, "", `${pathname}${search}`);
  } catch { /* history unavailable */ }
}
