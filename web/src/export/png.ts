// PNG resolution tag. Browsers write PNGs without a pHYs chunk, so a 300
// dpi export opens as "72 dpi" in layout software and prints four times
// too large. Inserting pHYs (pixels per metre) right after IHDR fixes the
// physical size without touching the pixels. Reference: PNG spec 11.3.5.3.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Return the PNG with a pHYs chunk for `dpi` (replacing any existing one).
 *  Input that is not a PNG is returned unchanged. */
export function withPngDpi(png: Uint8Array<ArrayBuffer>, dpi: number): Uint8Array<ArrayBuffer> {
  if (png.length < 33 || SIGNATURE.some((b, i) => png[i] !== b)) return png;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Uint8Array[] = [];
  let p = 8;
  let inserted = false;
  while (p + 12 <= png.length) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(...png.subarray(p + 4, p + 8));
    const end = p + 12 + len;
    if (type !== "pHYs") chunks.push(png.subarray(p, end));
    if (type === "IHDR" && !inserted) {
      chunks.push(physChunk(dpi));
      inserted = true;
    }
    p = end;
  }
  const out = new Uint8Array(8 + chunks.reduce((a, c) => a + c.length, 0));
  out.set(SIGNATURE, 0);
  let o = 8;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

function physChunk(dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);
  const c = new Uint8Array(21);
  const v = new DataView(c.buffer);
  v.setUint32(0, 9);
  c.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  v.setUint32(8, ppm);
  v.setUint32(12, ppm);
  c[16] = 1; // unit: metre
  v.setUint32(17, crc32(c.subarray(4, 17)));
  return c;
}
