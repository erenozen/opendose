// Share by link, with no server: the project travels inside the URL
// fragment, which browsers never send to a web server.
//
// Format (stable; a later encoding would use a new key, never reuse p=):
//
//   https://…/opendose/#p=<payload>
//   payload = base64url( DEFLATE( UTF-8( compact project JSON ) ) )
//
// base64url is RFC 4648 §5 (A–Z a–z 0–9 - _), without "=" padding;
// DEFLATE is raw RFC 1951 (fflate deflateSync, level 9). The JSON is the
// ordinary project file (version 2, see project/persist.ts) minus the
// browser's preferences, so a link opens in any build that opens files.
// Nothing else goes in: no autosave, no preferences, no export settings.
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { serializeProject, type SerializeOptions } from "../project/persist.ts";
import { familyChildren, findSheet } from "../project/ops.ts";
import type { Project, Sheet } from "../project/types.ts";

export const SHARE_KEY = "p";
/** Longest fragment we hand out. Browsers accept far longer URLs, but
 *  chat apps, e-mail clients and forms truncate or refuse them; 64 kB
 *  keeps links pasteable. */
export const SHARE_LIMIT = 64 * 1024;

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The project JSON a link carries: the file format without preferences,
 *  written compactly. `results` adds cached results (see persist.ts). */
export function shareJson(p: Project, results?: ReadonlyMap<string, unknown>,
  opts: SerializeOptions = {}): string {
  const obj = JSON.parse(serializeProject(p, results, opts)) as Record<string, unknown>;
  delete obj.prefs;
  return JSON.stringify(obj);
}

export function encodePayload(json: string): string {
  return toBase64Url(deflateSync(strToU8(json), { level: 9 }));
}

export function decodePayload(payload: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) {
    throw new Error("the link contains characters a share link never has");
  }
  let bytes: Uint8Array;
  try { bytes = inflateSync(fromBase64Url(payload)); } catch {
    throw new Error("the link is incomplete or damaged (was it cut off when pasted?)");
  }
  return strFromU8(bytes);
}

export type ShareOutcome =
  | { ok: true; fragment: string; withResults: boolean; length: number }
  | { ok: false; length: number; limit: number };

/** "#p=…" for a project, or why not. Cached results are included when
 *  they fit (the receiver then sees numbers at once, before the engine
 *  has booted); a project too large with them is tried without them. */
export function makeFragment(p: Project, results?: ReadonlyMap<string, unknown>,
  limit = SHARE_LIMIT, opts: SerializeOptions = {}): ShareOutcome {
  const attempt = (r?: ReadonlyMap<string, unknown>) =>
    `#${SHARE_KEY}=${encodePayload(shareJson(p, r, r ? opts : { selected: opts.selected }))}`;
  if (results?.size) {
    const full = attempt(results);
    if (full.length <= limit) return { ok: true, fragment: full, withResults: true, length: full.length };
  }
  const bare = attempt();
  if (bare.length <= limit) return { ok: true, fragment: bare, withResults: false, length: bare.length };
  return { ok: false, length: bare.length, limit };
}

/** The payload of a share fragment ("#p=…"), or null for any other hash. */
export function sharePayload(hash: string): string | null {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  for (const part of h.split("&")) {
    if (part.startsWith(`${SHARE_KEY}=`)) return part.slice(SHARE_KEY.length + 1);
  }
  return null;
}

/** The project JSON (parsed) inside a share fragment. Throws with a
 *  readable reason when the link is damaged. */
export function readFragment(hash: string): unknown {
  const payload = sharePayload(hash);
  if (payload === null) throw new Error("this is not a share link");
  const text = decodePayload(payload);
  try { return JSON.parse(text); } catch {
    throw new Error("the link is incomplete or damaged");
  }
}

/** Just one family: a data table with its results and graphs, plus the
 *  info sheets attached to it. Links to sheets left behind (derived-table
 *  sources, layouts) are dropped when the project is read back. */
export function familyProject(p: Project, dataId: string): Project | null {
  const data = findSheet(p, dataId);
  if (!data || data.kind !== "data") return null;
  const keep = new Set<string>([data.id, ...familyChildren(p, data.id).map((s) => s.id)]);
  for (const s of p.sheets) if (s.kind === "info" && s.parentId === data.id) keep.add(s.id);
  const sheets = p.sheets.filter((s) => keep.has(s.id)).map((s): Sheet => {
    const { groupId: _g, ...rest } = s;
    void _g;
    return rest as Sheet;
  });
  return { ...p, title: data.name, sheets, groups: undefined };
}

/** Rough size in kB, for messages. */
export function kb(n: number): string {
  return `${Math.max(1, Math.round(n / 1024))} kB`;
}
