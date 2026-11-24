// SHA-256 of a file's bytes or a text's UTF-8 bytes, as 64 hex digits,
// with the browser's Web Crypto (crypto.subtle). Nothing leaves the page.
export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
