// "Copy for Word": HTML tables with header rows, borders and the numbers
// as shown, and the same content as tab-separated text.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firstNumber, htmlEscape, isNumericCell, wordHtml, wordPlain, type WordSection,
} from "../wordTable.ts";

const h = (text: string, colSpan = 1) => ({ text, header: true, colSpan });
const d = (text: string, colSpan = 1) => ({ text, header: false, colSpan });

const sections: WordSection[] = [
  { heading: "Fisher's exact test", rows: [], headRows: 0 },
  { rows: [[h("Test"), h("P value")], [d("Fisher's exact"), d("0.0317")], [d("Note & <b>"), d("1.2 to 3.4", 1)]],
    headRows: 1 },
  { rows: [[d("Odds ratio"), d("3.35")]], headRows: 0 },
];

test("numbers are recognised for right alignment", () => {
  for (const t of ["12.3", "−0.5", "<0.0001", "45%", "1.2e-5", "0.003 **", "[1.2, 3.4]", "1.2 to 3.4", "1,234.5"]) {
    assert.ok(isNumericCell(t), t);
  }
  for (const t of ["", "Drug A", "LogIC50", "P < 0.05 means"]) assert.ok(!isNumericCell(t), t);
});

test("HTML has a thead, borders, escaped text and right-aligned numbers", () => {
  const html = wordHtml(sections, "Contingency of Example");
  assert.match(html, /^<html>.*<!--StartFragment-->.*<!--EndFragment--><\/body><\/html>$/s);
  assert.equal((html.match(/<table /g) ?? []).length, 2);
  assert.match(html, /<thead><tr><th style="[^"]*font-weight:bold[^"]*">Test<\/th>/);
  assert.match(html, /border-collapse:collapse/);
  assert.match(html, /<td style="[^"]*text-align:right[^"]*">0.0317<\/td>/);
  assert.match(html, /<td style="[^"]*text-align:left[^"]*">Fisher&#39;s exact|Fisher's exact/);
  assert.ok(html.includes("Note &amp; &lt;b&gt;"));
  // a table without header rows has no thead
  assert.match(html, /<table [^>]*><tbody><tr><td [^>]*>Odds ratio/);
  assert.match(html, /Contingency of Example<\/p>/);
});

test("spanned cells keep their span; plain text pads them", () => {
  const s: WordSection[] = [{ rows: [[h("Group", 2)], [d("A"), d("1")]], headRows: 1 }];
  assert.match(wordHtml(s), /<th colspan="2"/);
  assert.equal(wordPlain(s), "Group\t\nA\t1");
});

test("plain text: headings, tab-separated rows, a blank line between tables", () => {
  assert.equal(wordPlain(sections),
    "Fisher's exact test\nTest\tP value\nFisher's exact\t0.0317\nNote & <b>\t1.2 to 3.4\n\nOdds ratio\t3.35");
});

test("the first number shown is the first numeric body cell", () => {
  assert.equal(firstNumber(sections), "0.0317");
  assert.equal(firstNumber([]), null);
  assert.equal(htmlEscape('"x"'), "&quot;x&quot;");
});
