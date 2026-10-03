// Saving files and copying images.

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A zip of the given files (fflate, loaded on demand). Already-compressed
 *  images are stored; text formats (SVG) are deflated. */
export async function zipFiles(files: { name: string; data: Uint8Array }[]): Promise<Blob> {
  const { zipSync } = await import("fflate");
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (const f of files) entries[f.name] = [f.data, { level: f.name.endsWith(".svg") ? 6 : 0 }];
  const bytes = zipSync(entries);
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/zip" });
}

/** Copy text; falls back to a hidden textarea where the async Clipboard
 *  API is unavailable (non-secure contexts, older browsers). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export type CopyOutcome = "copied" | "unsupported" | "failed";

/**
 * Put a PNG on the clipboard. The ClipboardItem is created synchronously
 * (inside the click) with the image still rendering, which is what
 * Safari and Chrome require for an async write to count as user-initiated.
 */
export async function copyPng(render: () => Promise<Blob>): Promise<CopyOutcome> {
  const Item = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  if (!Item || !navigator.clipboard?.write) return "unsupported";
  try {
    await navigator.clipboard.write([new Item({ "image/png": render() })]);
    return "copied";
  } catch {
    return "failed";
  }
}
