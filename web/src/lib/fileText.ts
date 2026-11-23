// The text of a data file, from its bytes (P-07). Instrument and ImageJ
// exports come as UTF-8 (with or without a byte-order mark), UTF-16 with a
// byte-order mark (Windows "Unicode" text, StepOne), or a Windows code page
// (Excel's "CSV" and "Text" on Windows): read as UTF-8 regardless, the last
// turns µ, ° and ² into U+FFFD. Every file picker reads through textOf, so
// they all agree. The order matters: a byte-order mark decides; otherwise
// bytes that are valid UTF-8 are UTF-8 (a strict decode, so no byte is
// replaced); anything else is Windows-1252, the one 8-bit code page that
// covers the Latin text and the µ ° ² ³ ± symbols instrument files use.
// Characters outside it (the Cyrillic "т" of a Russian StepOne export) can
// only arrive in UTF-8 or UTF-16 files, which are read correctly.

export type FileEncoding = "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";

/** The encoding of a file's bytes: its byte-order mark, else UTF-8 when
 *  the bytes are valid UTF-8, else Windows-1252. */
export function detectEncoding(bytes: Uint8Array): FileEncoding {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "utf-8";
  } catch {
    return "windows-1252";
  }
}

/** Bytes as text in a given encoding (any TextDecoder label), without
 *  the byte-order mark. */
export function decodeAs(bytes: Uint8Array, encoding: string): string {
  return new TextDecoder(encoding).decode(bytes).replace(/^﻿/, "");
}

/** A file's text, in the encoding its bytes say (detectEncoding). */
export function textOf(bytes: Uint8Array): string {
  return decodeAs(bytes, detectEncoding(bytes));
}

/** Workbooks the engine reads (engine/opendose/workbooks.py): never
 *  decoded as text. */
export const WORKBOOK_FILE = /\.(xlsx|xls|ods)$/i;
/** The `accept` list of a picker that takes workbooks. */
export const WORKBOOK_ACCEPT = ".xlsx,.xls,.ods";

/** The workbook format of a file name, or null for anything else. */
export function workbookFormat(name: string): "xlsx" | "xls" | "ods" | null {
  const m = WORKBOOK_FILE.exec(name);
  return m ? (m[1].toLowerCase() as "xlsx" | "xls" | "ods") : null;
}

/** Why a spreadsheet file cannot be read, with the next step, or null.
 *  .xlsx, .xls and .ods workbooks are read; .numbers and .xlsb are
 *  formats that would decode to garbage as text. */
export function unreadableSheet(name: string): string | null {
  const m = /\.(numbers|xlsb)$/i.exec(name);
  if (!m) return null;
  return `Could not read “${name}”: OpenDose reads .xlsx, .xls and .ods workbooks, not .${m[1].toLowerCase()} files. `
    + "Save it as .xlsx or .csv, then choose it again.";
}
