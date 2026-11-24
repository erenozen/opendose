// Blinding keys (P-124) in this browser: localStorage, never the project
// file, autosave copy, share link or export. A key file (saved from the
// blinding dialog) carries the same key to another computer. Guarded:
// storage that refuses (private mode, full) only means the key must come
// from its file.
import { parseKey, serializeKey, type BlindingKey } from "../project/blinding";
import { saveBlob } from "../export/download";

const STORE = "opendose-blinding-keys";

function all(): BlindingKey[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(raw) ? raw.map(parseKey).filter((k): k is BlindingKey => !!k) : [];
  } catch {
    return [];
  }
}

/** Keep a key in this browser; false when the browser refused. */
export function keepKey(k: BlindingKey): boolean {
  try {
    localStorage.setItem(STORE, JSON.stringify([...all().filter((x) => x.id !== k.id), k]));
    return true;
  } catch {
    return false;
  }
}

export function findKey(id: string): BlindingKey | null {
  return all().find((k) => k.id === id) ?? null;
}

export function forgetKey(id: string): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(all().filter((k) => k.id !== id)));
  } catch { /* storage unavailable */ }
}

/** "Blinding key for Weights.json" */
export function keyFileName(k: BlindingKey): string {
  const base = (k.table || "table").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60) || "table";
  return `Blinding key for ${base}.json`;
}

export function downloadKey(k: BlindingKey): void {
  saveBlob(new Blob([serializeKey(k)], { type: "application/json" }), keyFileName(k));
}

/** A random blinding id (Web Crypto). */
export function newBlindingId(): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return `blind-${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
