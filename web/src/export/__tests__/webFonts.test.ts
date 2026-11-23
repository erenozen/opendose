// Which of the page's web-font files a raster export inlines: only those
// whose unicode-range meets the characters of the figure's text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rangesMeet } from "../webFonts.ts";

const cps = (s: string) => new Set([...s].map((c) => c.codePointAt(0)!));
const LATIN = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+2000-206F, U+2212";
const GREEK = "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF";

test("a figure's text picks the Latin file, and the Greek one only when it has Greek", () => {
  assert.ok(rangesMeet(LATIN, cps("log[Inhibitor], M")));
  assert.ok(!rangesMeet(GREEK, cps("log[Inhibitor], M")));
  assert.ok(rangesMeet(GREEK, cps("ΔF/F₀")));
  assert.ok(rangesMeet(LATIN, cps("−9")));          // U+2212, a single code point
});

test("wildcards, single points and an absent range", () => {
  assert.ok(rangesMeet("U+4??", cps("Ж")));          // U+0416 in U+0400-04FF
  assert.ok(!rangesMeet("U+4??", cps("A")));
  assert.ok(rangesMeet("U+0131", cps("ı")));
  assert.ok(rangesMeet("", cps("a")));                // no range: the face covers everything
  assert.ok(!rangesMeet("", new Set()));
});
