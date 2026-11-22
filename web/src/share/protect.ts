// Password-protected share links: the project travels in the URL
// fragment encrypted, so a link that passes through e-mail, chat, link
// scanners or browser history reveals nothing without the password.
//
//   https://opendose.erenozen.dev/#e=<payload>
//   payload = base64url( header | iv | AES-GCM( DEFLATE( UTF-8( JSON ) ) ) )
//   header  = version (1 byte, 1) | PBKDF2 iterations (uint32 BE) | salt (16 bytes)
//   iv      = 12 bytes
//
// The key is PBKDF2-SHA256(password, salt, iterations) → AES-256-GCM; the
// header is the additional authenticated data, so any change to it, the
// IV or the ciphertext fails decryption the same way a wrong password
// does. Salt and IV are random for every link. The JSON is the same
// compact project a "#p=" link carries (link.ts shareJson). Everything
// runs in the browser (Web Crypto); the password and the plain project
// never leave it.
//
// A link is only as strong as its password: anyone holding it can try
// passwords offline, and the iterations only slow each try down. Hence
// suggestPassword() (about 99 random bits) in the share dialog.
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import type { SerializeOptions } from "../project/persist.ts";
import type { Project } from "../project/types.ts";
import { fromBase64Url, SHARE_LIMIT, shareJson, toBase64Url } from "./link.ts";

export const PROTECTED_KEY = "e";
const VERSION = 1;
/** OWASP's 2023 recommendation for PBKDF2-HMAC-SHA256. */
export const PBKDF2_ITERATIONS = 600_000;
/** A link may not ask for more work than this (a crafted link could
 *  otherwise freeze the tab that opens it). */
const MAX_ITERATIONS = 5_000_000;
const SALT = 16;
const IV = 12;
const HEADER = 1 + 4 + SALT;
export const MIN_PASSWORD = 10;

export class ProtectError extends Error {}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number,
  usage: KeyUsage): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", strToU8(password.normalize("NFC")),
    "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base, { name: "AES-GCM", length: 256 }, false, [usage]);
}

/** Encrypt a project's JSON with a password: the "#e=" payload. */
export async function protectJson(json: string, password: string,
  iterations = PBKDF2_ITERATIONS): Promise<string> {
  const header = new Uint8Array(HEADER);
  header[0] = VERSION;
  new DataView(header.buffer).setUint32(1, iterations);
  const salt = header.subarray(5, 5 + SALT);
  crypto.getRandomValues(salt);
  const iv = crypto.getRandomValues(new Uint8Array(IV));
  const key = await deriveKey(password, salt.slice(), iterations, "encrypt");
  const sealed = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: header },
    key, deflateSync(strToU8(json), { level: 9 })));
  const out = new Uint8Array(HEADER + IV + sealed.length);
  out.set(header, 0);
  out.set(iv, HEADER);
  out.set(sealed, HEADER + IV);
  return toBase64Url(out);
}

/** The project JSON inside a "#e=" payload. Throws a ProtectError with a
 *  readable reason: a damaged link, a newer format, or a wrong password
 *  (which AES-GCM cannot tell apart from a changed link). */
export async function unprotectJson(payload: string, password: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) {
    throw new ProtectError("the link contains characters a share link never has");
  }
  let bytes: Uint8Array;
  try { bytes = fromBase64Url(payload); } catch {
    throw new ProtectError("the link is incomplete or damaged (was it cut off when pasted?)");
  }
  if (bytes.length < HEADER + IV + 16) {
    throw new ProtectError("the link is incomplete or damaged (was it cut off when pasted?)");
  }
  if (bytes[0] !== VERSION) {
    throw new ProtectError("this link was made by a newer version of OpenDose");
  }
  const header = bytes.slice(0, HEADER);
  const iterations = new DataView(header.buffer).getUint32(1);
  if (iterations < 1 || iterations > MAX_ITERATIONS) {
    throw new ProtectError("the link is incomplete or damaged");
  }
  const key = await deriveKey(password, header.slice(5, 5 + SALT), iterations, "decrypt");
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(HEADER, HEADER + IV), additionalData: header },
      key, bytes.slice(HEADER + IV)));
  } catch {
    throw new ProtectError("wrong password, or the link was changed or cut off");
  }
  try { return strFromU8(inflateSync(plain)); } catch {
    throw new ProtectError("the link is incomplete or damaged");
  }
}

/** The payload of a protected fragment ("#e=…"), or null. */
export function protectedPayload(hash: string): string | null {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  for (const part of h.split("&")) {
    if (part.startsWith(`${PROTECTED_KEY}=`)) return part.slice(PROTECTED_KEY.length + 1);
  }
  return null;
}

export type ProtectedOutcome =
  | { ok: true; fragment: string; withResults: boolean; length: number }
  | { ok: false; length: number; limit: number };

/** "#e=…" for a project, or why not: makeFragment's rules (cached results
 *  when they fit, the same size limit), encrypted with the password. */
export async function makeProtectedFragment(p: Project, password: string,
  results?: ReadonlyMap<string, unknown>, limit = SHARE_LIMIT, opts: SerializeOptions = {},
  iterations = PBKDF2_ITERATIONS): Promise<ProtectedOutcome> {
  const attempt = async (r?: ReadonlyMap<string, unknown>) =>
    `#${PROTECTED_KEY}=${await protectJson(shareJson(p, r, r ? opts : { selected: opts.selected }),
      password, iterations)}`;
  if (results?.size) {
    const full = await attempt(results);
    if (full.length <= limit) return { ok: true, fragment: full, withResults: true, length: full.length };
  }
  const bare = await attempt();
  if (bare.length <= limit) return { ok: true, fragment: bare, withResults: false, length: bare.length };
  return { ok: false, length: bare.length, limit };
}

/** A random password that is easy to read out over the phone: five groups
 *  of four characters from 31 that cannot be confused (no 0/o, 1/l/i),
 *  about 99 random bits. */
export function suggestPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const pick = new Uint8Array(20);
  const out: string[] = [];
  while (out.length < 20) {
    crypto.getRandomValues(pick);
    for (const b of pick) {
      // 31 characters: drop bytes past the largest multiple of 31 (248) so
      // every character is equally likely.
      if (b < 248 && out.length < 20) out.push(alphabet[b % 31]);
    }
  }
  return [0, 4, 8, 12, 16].map((i) => out.slice(i, i + 4).join("")).join("-");
}
