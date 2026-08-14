// Baseline TIFF writer for figure export.
//
// Neither Plotly nor the canvas API can produce TIFF, but journals keep
// asking for it at a stated resolution, so we take the rendered pixels
// and write the container ourselves: little-endian ("II"), 8-bit RGB,
// a single strip, Deflate (Adobe's compression tag 8) when the platform
// can compress and uncompressed otherwise. The resolution tags carry the
// requested DPI so the file reports its physical size to the submission
// system. Reference: TIFF 6.0 spec, sections 2 and 8 (baseline RGB).

const TYPE_ASCII = 2;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;

const COMPRESSION_NONE = 1;
const COMPRESSION_DEFLATE = 8;

const SOFTWARE = "OpenDose";

export interface TiffSource {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

// Baseline TIFF has no alpha channel, so composite over white: a
// transparent plot background must print as paper, never as black.
function toRgb(data: Uint8ClampedArray, pixels: number): Uint8Array<ArrayBuffer> {
  const rgb = new Uint8Array(pixels * 3);
  for (let i = 0, o = 0; i < pixels; i++) {
    const p = i * 4;
    const alpha = data[p + 3];
    if (alpha === 255) {
      rgb[o++] = data[p];
      rgb[o++] = data[p + 1];
      rgb[o++] = data[p + 2];
    } else {
      const a = alpha / 255;
      const bg = 255 * (1 - a);
      rgb[o++] = Math.round(data[p] * a + bg);
      rgb[o++] = Math.round(data[p + 1] * a + bg);
      rgb[o++] = Math.round(data[p + 2] * a + bg);
    }
  }
  return rgb;
}

// CompressionStream("deflate") emits the zlib wrapper (RFC 1950), which
// is exactly what TIFF's Adobe Deflate expects. Flat-colour plots shrink
// by ~50x, so this is the difference between a 15 MB file and a 300 KB one.
async function deflate(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([bytes]).stream()
      .pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

export async function encodeTiff(img: TiffSource, dpi = 300): Promise<Blob> {
  const rgb = toRgb(img.data, img.width * img.height);
  const packed = await deflate(rgb);
  const strip = packed ?? rgb;

  // Layout: header, pixel strip, IFD, then the values too big to sit
  // inline in their 4-byte entry field. Every block starts word-aligned.
  const dataOffset = 8;
  const ifdOffset = dataOffset + strip.length + (strip.length % 2);
  const entryCount = 14;
  const bitsOffset = ifdOffset + 2 + entryCount * 12 + 4;
  const xResOffset = bitsOffset + 6;
  const yResOffset = xResOffset + 8;
  const softwareOffset = yResOffset + 8;
  const size = softwareOffset + SOFTWARE.length + 1;

  const buf = new ArrayBuffer(size + (size % 2));
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  view.setUint8(0, 0x49); // "II" - little endian
  view.setUint8(1, 0x49);
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);

  bytes.set(strip, dataOffset);

  let p = ifdOffset;
  view.setUint16(p, entryCount, true);
  p += 2;
  const entry = (tag: number, type: number, count: number, value: number) => {
    view.setUint16(p, tag, true);
    view.setUint16(p + 2, type, true);
    view.setUint32(p + 4, count, true);
    // Values of 4 bytes or less live in the entry; a SHORT is left-
    // justified there, anything larger stores an offset instead.
    if (type === TYPE_SHORT && count === 1) view.setUint16(p + 8, value, true);
    else view.setUint32(p + 8, value, true);
    p += 12;
  };

  // Tags must be written in ascending order.
  entry(256, TYPE_LONG, 1, img.width); // ImageWidth
  entry(257, TYPE_LONG, 1, img.height); // ImageLength
  entry(258, TYPE_SHORT, 3, bitsOffset); // BitsPerSample
  entry(259, TYPE_SHORT, 1, packed ? COMPRESSION_DEFLATE : COMPRESSION_NONE);
  entry(262, TYPE_SHORT, 1, 2); // PhotometricInterpretation: RGB
  entry(273, TYPE_LONG, 1, dataOffset); // StripOffsets
  entry(277, TYPE_SHORT, 1, 3); // SamplesPerPixel
  entry(278, TYPE_LONG, 1, img.height); // RowsPerStrip (one strip)
  entry(279, TYPE_LONG, 1, strip.length); // StripByteCounts
  entry(282, TYPE_RATIONAL, 1, xResOffset); // XResolution
  entry(283, TYPE_RATIONAL, 1, yResOffset); // YResolution
  entry(284, TYPE_SHORT, 1, 1); // PlanarConfiguration: chunky
  entry(296, TYPE_SHORT, 1, 2); // ResolutionUnit: inch
  entry(305, TYPE_ASCII, SOFTWARE.length + 1, softwareOffset); // Software
  view.setUint32(p, 0, true); // no second IFD

  view.setUint16(bitsOffset, 8, true);
  view.setUint16(bitsOffset + 2, 8, true);
  view.setUint16(bitsOffset + 4, 8, true);
  const num = Math.round(dpi * 100);
  for (const off of [xResOffset, yResOffset]) {
    view.setUint32(off, num, true);
    view.setUint32(off + 4, 100, true);
  }
  for (let i = 0; i < SOFTWARE.length; i++) {
    view.setUint8(softwareOffset + i, SOFTWARE.charCodeAt(i));
  }

  return new Blob([buf], { type: "image/tiff" });
}
