// Which PDF font each label gets (export/pdfFonts.ts): the embedded Inter
// or Arial-compatible sans when they can show every character, the
// standard fonts (with WinAnsi spelling) otherwise, Inter as the fallback
// that keeps characters. And the vendored fonts really cover the
// characters the P-02 acceptance titles use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLASSIC, covers, INTER, pdfFace, registerPdfFont, winAnsiSafe } from "../pdfFonts.ts";
import { toWinAnsi } from "../pdf.ts";

const PLOT = '"Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif';
const ARIAL = "Arial, Helvetica, sans-serif";
const Y = "ΔF/F₀ ≤ 1", X = "Ca²⁺ (10⁻⁶ M)";

test("both acceptance titles are covered by Inter; Liberation Sans lacks ⁺ and ⁻", () => {
  assert.ok(covers("inter", Y) && covers("inter", X));
  assert.ok(covers("classic", Y));
  assert.ok(!covers("classic", X));
  assert.ok(covers("inter", "µ μ α β γ σ χ² − × ± ° → ½ ‰ ×10⁻³ R²"));
});

test("default theme labels go to Inter, bold kept, as typed", () => {
  assert.deepEqual(pdfFace(PLOT, "400", "normal", Y), { family: INTER, weight: 400, italic: false });
  assert.deepEqual(pdfFace(PLOT, "700", "normal", X), { family: INTER, weight: 700, italic: false });
  assert.deepEqual(pdfFace("Inter, Helvetica, Arial, sans-serif", "bold", "normal", "A"),
    { family: INTER, weight: 700, italic: false });
  assert.equal(pdfFace(PLOT, "600", "normal", "x").weight, 700);
  assert.equal(pdfFace(PLOT, "500", "normal", "x").weight, 400);
});

test("classic theme: the Arial-compatible font, Inter only for characters it lacks", () => {
  assert.deepEqual(pdfFace(ARIAL, "700", "normal", "Response (%)"), { family: CLASSIC, weight: 700, italic: false });
  assert.deepEqual(pdfFace(ARIAL, "400", "normal", Y), { family: CLASSIC, weight: 400, italic: false });
  assert.deepEqual(pdfFace(ARIAL, "400", "normal", X), { family: INTER, weight: 400, italic: false });
});

test("other families and italics: standard fonts while WinAnsi can spell the label, else upright Inter", () => {
  const serif = '"Times New Roman", Times, Georgia, serif';
  assert.deepEqual(pdfFace(serif, "400", "normal", "Dose (mg)"), { family: null, weight: 400, italic: false });
  assert.deepEqual(pdfFace(serif, "400", "normal", Y), { family: INTER, weight: 400, italic: false });
  assert.deepEqual(pdfFace(PLOT, "400", "italic", "n.s."), { family: null, weight: 400, italic: true });
  assert.deepEqual(pdfFace(PLOT, "400", "italic", X), { family: INTER, weight: 400, italic: false });
  // a character no embedded font has: the standard font's spelling
  assert.deepEqual(pdfFace(PLOT, "400", "normal", "漢"), { family: null, weight: 400, italic: false });
  assert.equal(toWinAnsi("漢"), "?");
});

test("WinAnsi: Latin-1 and cp1252 extras pass, the minus sign does not", () => {
  assert.ok(winAnsiSafe("Café – 5 µg ± 2 °C “x”"));
  assert.ok(!winAnsiSafe("−1"));
  assert.equal(toWinAnsi("−1 ≤ 2"), "-1 <= 2");
});

test("jsPDF embeds the vendored fonts as CIDFontType2 subsets with a ToUnicode map", async () => {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: [200, 100], compress: false });
  const dir = new URL("../fonts/", import.meta.url);
  for (const [file, family, style] of [["Inter-Regular.ttf", INTER, "normal"],
    ["OpenDoseSansClassic-Bold.ttf", CLASSIC, "bold"]]) {
    registerPdfFont(doc as never, file, readFileSync(new URL(file, dir)).toString("base64"), family, style);
  }
  doc.setFont(INTER, "normal");
  doc.text(Y, 10, 30);
  doc.setFont(CLASSIC, "bold");
  doc.text("Dose", 10, 60);
  const out = doc.output();
  assert.equal((out.match(/\/FontFile2/g) ?? []).length, 2);
  assert.equal((out.match(/\/Subtype \/CIDFontType2/g) ?? []).length, 2);
  assert.match(out, /\/ToUnicode/);
  assert.match(out, /\/BaseFont \/Inter-Regular/);
  assert.match(out, /\/BaseFont \/OpenDoseSansClassic-Bold/);
  // the shown glyph ids read back through the ToUnicode map as typed
  const map = new Map<string, string>();
  for (const m of out.matchAll(/<([0-9a-f]{4})><([0-9a-f]{4})>/g)) {
    map.set(m[1], String.fromCodePoint(parseInt(m[2], 16)));
  }
  const shown = [...out.matchAll(/<([0-9a-f]+)> Tj/g)].map((m) =>
    (m[1].match(/.{4}/g) ?? []).map((g) => map.get(g) ?? "?").join(""));
  assert.deepEqual(shown, [Y, "Dose"]);
  // the embedded subsets are far smaller than the 44 KB sources
  assert.ok(out.length < 60_000, `${out.length} bytes`);
});

test("vendored fonts are small TrueType files and ship with their licences", () => {
  const dir = new URL("../fonts/", import.meta.url);
  for (const f of ["Inter-Regular.ttf", "Inter-Bold.ttf", "OpenDoseSansClassic-Regular.ttf",
    "OpenDoseSansClassic-Bold.ttf"]) {
    const b = readFileSync(new URL(f, dir));
    assert.equal(b.readUInt32BE(0), 0x00010000, `${f} is TrueType`);
    assert.ok(b.length < 60_000, `${f}: ${b.length} bytes`);
  }
  assert.match(readFileSync(new URL("LICENSE-Inter.txt", dir), "utf8"), /SIL Open Font License/);
  assert.match(readFileSync(new URL("LICENSE-LiberationSans.txt", dir), "utf8"), /Reserved Font Name Liberation/);
});
