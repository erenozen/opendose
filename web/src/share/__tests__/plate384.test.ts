// Plate shape detection, as engine/opendose/plate_io.py locate_plate: the
// labelled extent decides the shape (a 384-well grid is never read as its
// 96-well corner), bare numeric blocks are read whole, other shapes are
// padded to a format with a warning, and a requested format never
// truncates. Labelled and bare 96 and 384, with and without a header,
// with a preamble. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { findPlateGrid } from "../recipes/plate.ts";
import { findPlates } from "../../sheets/assays/plate/model.ts";

const LETTERS = "ABCDEFGHIJKLMNOP";
const value = (r: number, c: number) => (0.05 + r * 0.1 + c * 0.003).toFixed(4);

/** A reader export: optional preamble, optional header of column numbers,
 *  rows with or without letter labels. */
function grid(rows: number, cols: number,
  { header = true, preamble = true, labels = true } = {}): string[][] {
  const out: string[][] = preamble ? [["Reader export"], ["Wavelength: 450 nm"], [""]] : [];
  const lead = labels ? [""] : [];
  if (header) out.push([...lead, ...Array.from({ length: cols }, (_, c) => String(c + 1))]);
  for (let r = 0; r < rows; r++) {
    out.push([...(labels ? [LETTERS[r]] : []), ...Array.from({ length: cols }, (_, c) => value(r, c))]);
  }
  return out;
}

for (const [rows, cols, wells] of [[8, 12, 96], [16, 24, 384]] as const) {
  for (const labels of [true, false]) {
    for (const header of [true, false]) {
      for (const preamble of [true, false]) {
        const name = `${labels ? "labelled" : "bare"} ${wells}${header ? ", header" : ", no header"}`
          + `${preamble ? ", preamble" : ""}`;
        test(name, () => {
          const g = findPlateGrid(grid(rows, cols, { header, preamble, labels }))!;
          assert.ok(g, "found");
          assert.equal(g.format, wells);
          assert.equal(g.rows, rows);
          assert.equal(g.cols, cols);
          assert.deepEqual(g.warnings, []);
          assert.equal(g.values[0][0], Number(value(0, 0)));
          assert.equal(g.values[rows - 1][cols - 1], Number(value(rows - 1, cols - 1)));
          assert.equal(g.labelledRows, labels);
          if (labels) assert.equal(g.labelledColumns, header);
        });
      }
    }
  }
}

test("the labelled extent wins: A–P × 1–24 is 384 wells, and the wizard reads it whole", () => {
  const found = findPlates([grid(16, 24)]);
  assert.equal(found.format, 384);
  assert.equal(found.plates.length, 1);
  assert.equal(found.plates[0].length, 16);
  assert.equal(found.plates[0][0].length, 24);
  assert.deepEqual(found.warnings, []);
  // with the format chosen as 96, the grid is kept whole, with a warning
  const as96 = findPlates([grid(16, 24)], 96);
  assert.equal(as96.format, 384);
  assert.match(as96.warnings.join(" "), /384-well plate .* but the plate format is 96 wells/);
  assert.match(as96.warnings.join(" "), /kept at its full size/);
});

test("stacked plates are read one after another", () => {
  const two = [...grid(8, 12), [""], ["Plate 2"], ...grid(8, 12, { preamble: false })];
  assert.equal(findPlates([two]).plates.length, 2);
  const big = [...grid(16, 24), [""], ["Plate 2"], ...grid(16, 24, { preamble: false })];
  const found = findPlates([big]);
  assert.equal(found.format, 384);
  assert.equal(found.plates.length, 2);
});

test("other shapes are padded to a format, with a warning; nothing is dropped", () => {
  // A–H with 10 numbered columns: an 8 × 10 block in a 96-well plate
  const g = findPlateGrid(grid(8, 10))!;
  assert.equal(g.format, 96);
  assert.equal(g.cols, 12);
  assert.equal(g.values[0][10], null);
  assert.match(g.warnings[0], /8 x 10, not a known plate format.*96-well plate/);
  // numbers beyond the numbered columns are reported
  const extra = grid(8, 12);
  for (const row of extra.slice(4)) row.push("9.9");
  assert.match(findPlateGrid(extra)!.warnings.join(" "), /1 column\(s\) to the right of column 12/);
  // a requested larger format pads
  const pad = findPlateGrid(grid(8, 12), 384)!;
  assert.equal(pad.format, 384);
  assert.equal(pad.rows, 16);
  assert.match(pad.warnings[0], /96-well plate .* plate format is 384 wells/);
});

test("a stray text reading among numbers stays a plate row", () => {
  const m = grid(8, 12, { labels: false, header: false, preamble: false });
  m[3][5] = "OVRFLW";
  const g = findPlateGrid(m)!;
  assert.equal(g.format, 96);
  assert.equal(g.values[3][5], null);
});
