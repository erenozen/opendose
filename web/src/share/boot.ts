// Opening a share link: when the page loads with "#p=…", the project in
// the link is what the app starts with, read-only. A password-protected
// link ("#e=…") is first unlocked by UnlockScreen (main.tsx), which hands
// the project JSON over with setUnlockedShare; it is kept in memory only,
// never written back into the address.
import type { IdFactory } from "../project/ids.ts";
import { projectFromJson } from "../project/persist.ts";
import { parseSavedWith, type SavedWith } from "../project/reproduce.ts";
import type { Project, ProjectPrefs } from "../project/types.ts";
import { readFragment, sharePayload } from "./link.ts";
import { protectedPayload } from "./protect.ts";

let unlocked: string | null = null;
/** The project JSON of a protected link, once its password was given. */
export function setUnlockedShare(json: string): void { unlocked = json; }

export interface ShareBoot {
  project: Project | null;
  /** The sheet the sender had on screen, if the link says. */
  selected?: string | null;
  /** The software that made the link (absent in older links). */
  savedWith?: SavedWith | null;
  /** Why a share link in the address could not be opened ("" = fine). */
  error: string;
}

export function locationHash(): string {
  try { return globalThis.location?.hash ?? ""; } catch { return ""; }
}

export function hasShareLink(hash = locationHash()): boolean {
  return sharePayload(hash) !== null || protectedPayload(hash) !== null;
}

/** Is the address a password-protected link ("#e=…")? */
export function hasProtectedLink(hash = locationHash()): boolean {
  return protectedPayload(hash) !== null;
}

/** The shared project in the address bar, if any. */
export function readShareBoot(prefs: ProjectPrefs, ids: IdFactory, hash = locationHash()): ShareBoot {
  if (!hasShareLink(hash)) return { project: null, error: "" };
  try {
    let raw: unknown;
    if (protectedPayload(hash) !== null) {
      if (unlocked === null) return { project: null, error: "" };
      raw = JSON.parse(unlocked);
    } else {
      raw = readFragment(hash);
    }
    const r = raw as { selected?: unknown; savedWith?: unknown } | null;
    const sel = r?.selected;
    return {
      project: projectFromJson(raw, { prefs, ids }), error: "",
      selected: typeof sel === "string" ? sel : null,
      savedWith: parseSavedWith(r?.savedWith),
    };
  } catch (e) {
    return { project: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Drop "#p=…" (or "#e=…") from the address without reloading (after "Make a copy",
 *  or when another project replaces the shared one), so a reload opens
 *  the user's own work rather than the link again. */
export function clearShareLink(): void {
  try {
    if (!hasShareLink()) return;
    const { pathname, search } = globalThis.location;
    globalThis.history.replaceState(globalThis.history.state, "", `${pathname}${search}`);
  } catch { /* history unavailable */ }
}
