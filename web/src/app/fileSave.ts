// Save in place (P-71): where the File System Access API exists (Chromium
// browsers), a project opened through Open…, by double-click in the
// installed app or saved with Save as… stays linked to its file, and Save
// project (Ctrl/Cmd+S) writes the same bytes the download would carry back
// into that file. Every other browser keeps the download, unchanged.
//
// The link is view state, never part of the project or its file: it is
// dropped whenever the project on screen is replaced (ProjectContext
// replace), and kept per autosave session in IndexedDB so a reloaded tab
// still saves to its file. A handle read back from storage has lost its
// permission; the browser asks again on the next save (a key press or a
// click, so the prompt is allowed).
import { readValue, writeValue } from "../project/autosave.ts";

/** The parts of a FileSystemFileHandle used here. */
export interface FileHandleLike {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string | Blob): Promise<void>; close(): Promise<void> }>;
  queryPermission?(d: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission?(d: { mode: "readwrite" }): Promise<PermissionState>;
}

interface PickerType { description: string; accept: Record<string, string[]> }
interface FsaWindow {
  showOpenFilePicker?: (o: { types?: PickerType[]; multiple?: boolean;
    excludeAcceptAllOption?: boolean; id?: string }) => Promise<FileHandleLike[]>;
  showSaveFilePicker?: (o: { suggestedName?: string; types?: PickerType[]; id?: string }) =>
    Promise<FileHandleLike>;
}
const fsa = (): FsaWindow => (typeof window === "undefined" ? {} : window as unknown as FsaWindow);

/** Can this browser write a file the user picked (Save as…, save in place)? */
export const canPickFiles = (): boolean =>
  typeof fsa().showSaveFilePicker === "function" && typeof fsa().showOpenFilePicker === "function";

const PROJECT_TYPE: PickerType = { description: "OpenDose project", accept: { "application/json": [".json"] } };
/** What Open… offers in the system picker: the same files as the Open input. */
export function openPickerTypes(accept: string): PickerType[] {
  const exts = accept.split(",").map((e) => e.trim()).filter((e) => /^\.[\w.]+$/.test(e));
  return [{ description: "Projects, Prism files and tables", accept: { "application/octet-stream": exts } }];
}

/** "assay-3.json" from the project title (as the download names it). */
export function projectFileName(title: string): string {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "opendose-project";
  return `${slug}.json`;
}

// ------------------------------------------------------------ the link

let linked: FileHandleLike | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

/** The file the open project saves to, if any. */
export const linkedFile = (): FileHandleLike | null => linked;
export function linkFile(handle: FileHandleLike | null): void {
  if (linked === handle) return;
  linked = handle;
  emit();
}
export const unlinkFile = () => linkFile(null);
export function onLinkChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** A stored value that is still a usable handle (structured clone keeps
 *  it in IndexedDB; anything else, such as a localStorage copy, is not). */
export function isHandle(v: unknown): v is FileHandleLike {
  return !!v && typeof v === "object" && typeof (v as FileHandleLike).createWritable === "function"
    && typeof (v as FileHandleLike).getFile === "function";
}

// ------------------------------------------------------------ per session

const handleKey = (sessionId: string) => `file-handle:${sessionId}`;

/** Keep (or drop, with null) the file an autosave session saves to. */
export function rememberHandle(sessionId: string, handle: FileHandleLike | null): Promise<boolean> {
  return writeValue(handleKey(sessionId), handle);
}

/** The file an autosave session saved to, if it is still a handle. */
export async function recallHandle(sessionId: string): Promise<FileHandleLike | null> {
  const v = await readValue(handleKey(sessionId));
  return isHandle(v) ? v : null;
}

// ------------------------------------------------------------ writing

export class SaveRefused extends Error {}

/** Write `text` into the file, asking for permission when the browser
 *  has not granted it (yet, or any more). */
export async function writeToHandle(handle: FileHandleLike, text: string): Promise<void> {
  if (handle.queryPermission && await handle.queryPermission({ mode: "readwrite" }) !== "granted") {
    const asked = handle.requestPermission ? await handle.requestPermission({ mode: "readwrite" }) : "denied";
    if (asked !== "granted") throw new SaveRefused("permission to write the file was not given");
  }
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
}

/** Save as…: the system save picker, then the write. null: cancelled. */
export async function saveAsPicker(suggestedName: string, text: string): Promise<FileHandleLike | null> {
  const show = fsa().showSaveFilePicker;
  if (!show) return null;
  let handle: FileHandleLike;
  try {
    handle = await show({ suggestedName, types: [PROJECT_TYPE], id: "opendose-project" });
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
  await writeToHandle(handle, text);
  return handle;
}

/** Open…: the system open picker. null: cancelled; "unavailable": the
 *  browser refused to show it (use the file input instead). */
export async function openPicker(accept: string): Promise<{ file: File; handle: FileHandleLike } | null | "unavailable"> {
  const show = fsa().showOpenFilePicker;
  if (!show) return "unavailable";
  let handles: FileHandleLike[];
  try {
    handles = await show({ types: openPickerTypes(accept), multiple: false, id: "opendose-project" });
  } catch (e) {
    if (isAbort(e)) return null;
    return "unavailable";
  }
  const handle = handles[0];
  if (!handle) return null;
  return { file: await handle.getFile(), handle };
}

export const isAbort = (e: unknown) => e instanceof Error && e.name === "AbortError";

/** The reason a save failed, as the error toast says it. */
export function saveFailure(e: unknown): string {
  if (e instanceof SaveRefused) return e.message;
  if (e instanceof Error && e.name === "NotAllowedError") return "permission to write the file was not given";
  if (e instanceof Error && e.name === "NotFoundError") return "the file was moved or deleted";
  if (e instanceof Error && e.name === "QuotaExceededError") return "the disk is full";
  return String(e instanceof Error ? e.message : e).replace(/\.$/, "") || "the browser refused to write it";
}
