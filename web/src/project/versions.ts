// Saved versions and recent projects (P-72), all in this browser.
//
// "Save a version…" keeps the project file as Save project would write it
// (the same bytes: serializeProject with every result and its input
// fingerprint), with the user's note, under "version:<id>" in the same
// store as the autosave sessions (project/autosave.ts: IndexedDB, the
// localStorage fallback, every call guarded). So the Forget control in
// Preferences erases versions with everything else, and turning autosave
// off leaves them alone: a version is kept because the user asked.
//
// Recent projects are what this browser holds, grouped by project title:
// the autosaved sessions of closed tabs (project/sessions.ts) and the
// saved versions. Pure over a Kv, so the tests run it on a Map.
import type { Kv, SessionRecord } from "./autosave.ts";
import { formatBytes, type StorageReport } from "./sessions.ts";

const PREFIX = "version:";
export const versionKey = (id: string) => `${PREFIX}${id}`;
export const isVersionKey = (k: string) => k.startsWith(PREFIX);

export interface VersionRecord {
  id: string;
  /** epoch ms */
  savedAt: number;
  /** The project's title when the version was saved. */
  title: string;
  note: string;
  sheets: number;
  /** The project file's text (persist.serializeProject). */
  json: string;
}

export const MAX_NOTE = 120;

/** The note as stored: one line, trimmed, at most MAX_NOTE characters. */
export const cleanNote = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE);

/** What to enter in the note field (null: fine). */
export function noteProblem(s: string): string | null {
  return cleanNote(s) ? null : "Enter a note, such as “before reviewer”";
}

export function isVersionRecord(v: unknown): v is VersionRecord {
  const r = v as VersionRecord;
  return !!r && typeof r === "object" && typeof r.id === "string" && typeof r.json === "string"
    && typeof r.savedAt === "number" && typeof r.note === "string" && typeof r.title === "string";
}

/** Bytes a version takes (UTF-8 of its text; storage overhead aside). */
export const versionBytes = (json: string) => new TextEncoder().encode(json).length;

/** Is there room for `bytes` more? A sentence saying why not, or null.
 *  A browser that does not report its quota is let through (the write
 *  itself reports a full store). */
export function quotaProblem(r: Pick<StorageReport, "usage" | "quota">, bytes: number): string | null {
  if (r.usage === null || r.quota === null) return null;
  const free = r.quota - r.usage;
  if (bytes <= free) return null;
  return `the version needs ${formatBytes(bytes)} and this browser allows ${formatBytes(Math.max(0, free))} more`
    + ` (${formatBytes(r.usage)} of ${formatBytes(r.quota)} used)`;
}

export async function saveVersion(kv: Kv, rec: VersionRecord): Promise<boolean> {
  return kv.put(versionKey(rec.id), rec);
}

export async function readVersion(kv: Kv, id: string): Promise<VersionRecord | null> {
  const v = await kv.get(versionKey(id));
  return isVersionRecord(v) ? v : null;
}

export async function deleteVersion(kv: Kv, id: string): Promise<void> {
  await kv.delete(versionKey(id));
}

/** Every saved version, most recent first. */
export async function listVersions(kv: Kv): Promise<VersionRecord[]> {
  const out: VersionRecord[] = [];
  for (const k of await kv.keys()) {
    if (!isVersionKey(k)) continue;
    const v = await kv.get(k);
    if (isVersionRecord(v)) out.push(v);
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export interface RecentProject {
  title: string;
  /** The latest save of any kind, epoch ms. */
  lastAt: number;
  /** Autosaved sessions of closed tabs, most recent first. */
  sessions: SessionRecord[];
  versions: VersionRecord[];
}

/** Sessions and versions grouped by project title, the most recently
 *  saved project first. */
export function recentProjects(sessions: readonly SessionRecord[],
  versions: readonly VersionRecord[]): RecentProject[] {
  const by = new Map<string, RecentProject>();
  const get = (title: string) => {
    let r = by.get(title);
    if (!r) { r = { title, lastAt: 0, sessions: [], versions: [] }; by.set(title, r); }
    return r;
  };
  for (const s of sessions) {
    const r = get(s.title);
    r.sessions.push(s);
    r.lastAt = Math.max(r.lastAt, s.savedAt);
  }
  for (const v of versions) {
    const r = get(v.title);
    r.versions.push(v);
    r.lastAt = Math.max(r.lastAt, v.savedAt);
  }
  const out = [...by.values()];
  for (const r of out) {
    r.sessions.sort((a, b) => b.savedAt - a.savedAt);
    r.versions.sort((a, b) => b.savedAt - a.savedAt);
  }
  return out.sort((a, b) => b.lastAt - a.lastAt);
}
