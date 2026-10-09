// Text of an export as a matrix of cells, numbers with a point decimal.
// Its own module so the recipe files (presets.ts, multiFile.ts, the
// instrument readers) share it without importing each other.
import {
  detectDecimal, detectDelimiter, normalizeNumber, splitDelimited,
} from "../../project/importText.ts";

export function parseText(text: string): string[][] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  // Sample lines across the file: instrument preambles at the top must
  // not decide the delimiter of the data below them.
  const step = Math.max(1, Math.floor(lines.length / 40));
  const sample = lines.filter((_, i) => i % step === 0).slice(-40).join("\n");
  const delim = detectDelimiter(sample);
  const rows = splitDelimited(text, delim);
  const dec = detectDecimal(rows);
  return rows.map((r) => r.map((c) => normalizeNumber(c, dec)));
}
