// Every file picker decodes bytes the same way (P-07): a byte-order mark
// decides, then valid UTF-8, then Windows-1252. Fixtures from
// e2e-fixtures/encodings/make_fixtures.py. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeAs, detectEncoding, textOf, unreadableSheet } from "../fileText.ts";

const bytes = (name: string) => new Uint8Array(readFileSync(new URL(`../../../e2e-fixtures/encodings/${name}`, import.meta.url)));
const utf8 = (name: string) => readFileSync(new URL(`../../../e2e-fixtures/encodings/${name}`, import.meta.url), "utf8");

test("one ImageJ results file in five encodings decodes to the same text, µm² and °C intact", () => {
  const want = utf8("imagej-results.expected.txt");
  assert.match(want, /Area \(µm²\)/);
  const enc: Record<string, string> = {
    utf8: "utf-8", "utf8-bom": "utf-8", utf16le: "utf-16le", utf16be: "utf-16be", cp1252: "windows-1252",
  };
  for (const [name, e] of Object.entries(enc)) {
    const b = bytes(`imagej-results.${name}.csv`);
    assert.equal(detectEncoding(b), e, name);
    assert.equal(textOf(b), want, name);
  }
  // read as UTF-8 regardless (the old pickers), the cp1252 file loses µ and ²
  assert.notEqual(new TextDecoder("utf-8").decode(bytes("imagej-results.cp1252.csv")), want);
  assert.match(new TextDecoder("utf-8").decode(bytes("imagej-results.cp1252.csv")), /�/);
});

test("StepOne's Cyrillic Cт survives in UTF-8 and UTF-16 (cp1252 cannot carry it)", () => {
  const want = utf8("stepone-cq.expected.txt");
  assert.match(want, /\tCт\r\n/);
  for (const name of ["utf8", "utf8-bom", "utf16le", "utf16be"]) {
    assert.equal(textOf(bytes(`stepone-cq.${name}.txt`)), want, name);
  }
});

test("empty files, a lone byte-order mark, and an explicit encoding", () => {
  assert.equal(textOf(new Uint8Array()), "");
  assert.equal(detectEncoding(new Uint8Array()), "utf-8");
  assert.equal(textOf(Uint8Array.of(0xef, 0xbb, 0xbf)), "");
  assert.equal(textOf(Uint8Array.of(0xff, 0xfe)), "");
  assert.equal(textOf(Uint8Array.of(0xfe, 0xff)), "");
  // a byte that cannot start UTF-8 → Windows-1252
  assert.equal(textOf(Uint8Array.of(0x31, 0xb5, 0x4d)), "1µM");
  // valid UTF-8 is never second-guessed as cp1252 (Ã‚Âµ mojibake)
  assert.equal(textOf(new TextEncoder().encode("1µM")), "1µM");
  // the Import dialog's manual override still decodes as asked, BOM dropped
  assert.equal(decodeAs(bytes("imagej-results.cp1252.csv"), "windows-1252"), utf8("imagej-results.expected.txt"));
  assert.equal(decodeAs(Uint8Array.of(0xef, 0xbb, 0xbf, 0x41), "utf-8"), "A");
});

test("legacy workbooks are refused with the next step, by name", () => {
  assert.equal(unreadableSheet("blot.xls"),
    "Could not read “blot.xls”: OpenDose reads .xlsx workbooks, not .xls files. Save it as .xlsx or .csv, then choose it again.");
  assert.match(unreadableSheet("a.ODS") ?? "", /not \.ods files/);
  assert.equal(unreadableSheet("blot.xlsx"), null);
  assert.equal(unreadableSheet("blot.csv"), null);
});
