// LabChart (ADInstruments) "Export as text": a header block of
// "Key=<tab>value" lines, then one row per sample. Layout, as in the
// LabChart help ("Text file export") and the files it writes:
//
//   Interval=      0.001 s
//   ExcelDateTime= 4.53e+04    01/01/2024 10:00:00.000
//   TimeFormat=    StartOfBlock
//   DateFormat=
//   ChannelTitle=  Pressure   Flow      ECG
//   Range=         10.000 V   10.000 V  2.000 mV
//   UnitName=      mmHg       ml/min    mV
//   TopValue=      …
//   BottomValue=   …
//   0       98.1   1.20   0.031
//   0.001   98.3   1.21   0.035  #* Drug added      <- optional comment
//   …
//
// The time column (seconds from the block start, or the time of day) and
// the date column are optional export settings; without a time column the
// time is the sample number × Interval. A new "Interval=" line starts the
// next block. Comments sit at the end of a row, starting with "#" ("#*"
// for a comment on every channel, "#2" for one on channel 2).
//
// The recipe gives an XY table: X = time in the chosen unit, one data set
// per channel. A recording at 1 kHz has 3.6 million rows an hour, so the
// rows are thinned (every k-th sample, no averaging) and an optional
// window keeps part of the block.
import type { Recipe, RecipeParams, Staged } from "./presets.ts";
import { makeStaging } from "./staging.ts";
import { cellNumber } from "../tidy.ts";

export interface LabChartBlock {
  /** Seconds between samples (null when not stated). */
  interval: number | null;
  channels: string[];
  units: string[];
  /** Time of each sample in seconds from the block start. */
  time: number[];
  /** Samples × channels. */
  values: (number | null)[][];
  comments: { time: number; text: string }[];
}

const KEY_RE = /^([A-Za-z][A-Za-z ]*)=$/;

/** "0.001 s", "1 ms", "1000 Hz" -> seconds. */
export function intervalSeconds(text: string): number | null {
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(s|sec|ms|us|µs|min|hz|khz)?\s*$/i.exec(text);
  if (!m) return null;
  const v = Number(m[1]);
  switch ((m[2] ?? "s").toLowerCase()) {
    case "ms": return v / 1e3;
    case "us": case "µs": return v / 1e6;
    case "min": return v * 60;
    case "hz": return v > 0 ? 1 / v : null;
    case "khz": return v > 0 ? 1 / (v * 1e3) : null;
    default: return v;
  }
}

/** A time cell in seconds: a number, or a clock time h:mm:ss(.sss). */
export function timeSeconds(text: string): number | null {
  const n = cellNumber(text);
  if (n !== null) return n;
  const m = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(text.trim());
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

const isNum = (c: string) => timeSeconds(c) !== null || /^(nan|-?inf)$/i.test(c.trim());

/** Every block of a LabChart text export (null when the file has no
 *  ChannelTitle= line). */
export function parseLabChart(m: string[][]): LabChartBlock[] | null {
  if (!m.slice(0, 200).some((r) => /^channeltitle=$/i.test((r[0] ?? "").trim()))) return null;
  const blocks: LabChartBlock[] = [];
  let header: Record<string, string[]> = {};
  let cur: LabChartBlock | null = null;
  let timeOfDay = false;
  let start: number | null = null;
  const open = () => {
    const titles = trimEnd(header.channeltitle ?? []);
    const units = header.unitname ?? [];
    cur = {
      interval: intervalSeconds((header.interval ?? [])[0] ?? ""),
      channels: titles.map((t, i) => t || `Channel ${i + 1}`),
      units: titles.map((_, i) => (units[i] ?? "").trim()),
      time: [], values: [], comments: [],
    };
    timeOfDay = /timeofday/i.test((header.timeformat ?? [])[0] ?? "");
    start = null;
    blocks.push(cur);
  };
  for (const row of m) {
    const first = (row[0] ?? "").trim();
    const key = KEY_RE.exec(first);
    if (key) {
      const k = key[1].replace(/\s+/g, "").toLowerCase();
      // a key line after samples starts the next block's header
      if (cur) { cur = null; header = {}; }
      header[k] = row.slice(1).map((c) => c.trim());
      continue;
    }
    if (!row.some((c) => c.trim() !== "")) continue;
    if (!cur) {
      if (!header.channeltitle) continue;
      open();
    }
    const block = cur as unknown as LabChartBlock;
    const comment = row.map((c) => c.trim()).filter((c) => c.startsWith("#"))
      .map((c) => c.replace(/^#\S*\s*/, "").trim()).filter(Boolean);
    const cells = row.map((c) => c.trim()).filter((c) => c !== "" && !c.startsWith("#"));
    // a leading date (DateFormat=) is not a number
    while (cells.length && !isNum(cells[0])) cells.shift();
    const nch = block.channels.length;
    if (!cells.length || !nch) continue;
    let t: number | null;
    let data: string[];
    if (cells.length >= nch + 1) {
      t = timeSeconds(cells[0]);
      data = cells.slice(1, nch + 1);
    } else {
      t = block.interval !== null ? block.time.length * block.interval : block.time.length;
      data = cells.slice(0, nch);
    }
    if (t === null) continue;
    if (timeOfDay) {
      if (start === null) start = t;
      t -= start;
    }
    block.time.push(t);
    block.values.push(Array.from({ length: nch }, (_, i) => cellNumber(data[i] ?? "")));
    for (const text of comment) block.comments.push({ time: t, text });
  }
  return blocks.filter((b) => b.time.length > 0);
}

function trimEnd(cells: string[]): string[] {
  const out = [...cells];
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

export const TIME_UNITS: [string, string][] = [["s", "seconds"], ["ms", "milliseconds"],
  ["min", "minutes"], ["h", "hours"]];
const PER_SECOND: Record<string, number> = { s: 1, ms: 1e3, min: 1 / 60, h: 1 / 3600 };

/** Rows kept by default: enough for a smooth trace, small enough for a
 *  table and a graph. */
export const DEFAULT_ROWS = 2000;
/** Never more rows than this in the table (the step is raised). */
export const MAX_ROWS = 20000;

export interface Thinned { idx: number[]; step: number; capped: boolean }

/** Sample indices inside the window [from, to] seconds, every `step`-th
 *  (step 0 = so that about DEFAULT_ROWS remain). */
export function thinRows(time: number[], from: number | null, to: number | null, step: number): Thinned {
  const inside: number[] = [];
  time.forEach((t, i) => {
    if ((from === null || t >= from) && (to === null || t <= to)) inside.push(i);
  });
  let k = step >= 1 ? Math.floor(step) : Math.max(1, Math.ceil(inside.length / DEFAULT_ROWS));
  let capped = false;
  if (Math.ceil(inside.length / k) > MAX_ROWS) {
    k = Math.ceil(inside.length / MAX_ROWS);
    capped = true;
  }
  return { idx: inside.filter((_, j) => j % k === 0), step: k, capped };
}

const numOrNull = (s: string | undefined) => {
  const v = cellNumber(s ?? "");
  return v === null ? null : v;
};
const numText = (v: number) => String(Number(v.toPrecision(12)));

export const labchartRecipe: Recipe = {
  id: "labchart",
  label: "LabChart text export",
  description: "Export as text: Interval=, ChannelTitle=, UnitName= … lines, then time and one "
    + "column per channel. X = time, one data set per channel, thinned to a readable number of rows.",
  layouts: "LabChart (ADInstruments) “Export as text” files, with or without the time and date "
    + "columns, several blocks, comments at the end of a row.",
  params: [
    { key: "block", label: "Block", kind: "number", value: "1" },
    { key: "unit", label: "Time unit", kind: "select", choices: TIME_UNITS, value: "s" },
    { key: "every", label: "Keep every k-th sample", kind: "number", value: "",
      placeholder: "auto", note: "Blank: about 2000 rows. Samples are skipped, not averaged." },
    { key: "from", label: "From (s)", kind: "number", value: "", placeholder: "start" },
    { key: "to", label: "To (s)", kind: "number", value: "", placeholder: "end" },
  ],
  detect: (m) => {
    const heads = m.slice(0, 40).map((r) => (r[0] ?? "").trim().toLowerCase());
    if (!heads.includes("channeltitle=")) return 0;
    return heads.includes("interval=") ? 1 : 0.85;
  },
  stage: (m, params?: RecipeParams): Staged => {
    const blocks = parseLabChart(m);
    if (!blocks?.length) throw new Error("No LabChart data found: no ChannelTitle= line with samples below it.");
    const p = (k: string) => params?.[k] ?? labchartRecipe.params!.find((x) => x.key === k)!.value;
    const bi = Math.min(blocks.length, Math.max(1, Math.round(numOrNull(p("block")) ?? 1))) - 1;
    const b = blocks[bi];
    const unit = PER_SECOND[p("unit")] ? p("unit") : "s";
    const thin = thinRows(b.time, numOrNull(p("from")), numOrNull(p("to")), numOrNull(p("every")) ?? 0);
    const rows: string[][] = [];
    const names = b.channels.map((c, i) => (b.units[i] ? `${c} (${b.units[i]})` : c));
    for (const i of thin.idx) {
      const t = numText(b.time[i] * PER_SECOND[unit]);
      b.values[i].forEach((v, c) => rows.push([t, names[c], v === null ? "" : String(v)]));
    }
    const st = makeStaging([`Time (${unit})`, "Channel", "Value"], rows, ["time", "group", "value"]);
    const rate = b.interval ? `${numText(1 / b.interval)} samples/s` : "no interval stated";
    const shown = b.comments.slice(0, 6).map((c) => `${numText(c.time * PER_SECOND[unit])} ${unit}: ${c.text}`);
    return {
      recipe: "labchart", staging: st, pattern: null, aggregate: [], output: "xy",
      name: blocks.length > 1 ? `LabChart block ${bi + 1}` : "LabChart",
      yTitle: b.channels.length === 1 ? names[0] : "",
      notes: [
        `Block ${bi + 1} of ${blocks.length}: ${b.channels.length} channel${b.channels.length === 1 ? "" : "s"}, `
        + `${b.time.length} samples (${rate}); ${thin.idx.length} rows kept`
        + `${thin.step > 1 ? `, every ${thin.step}${ordinal(thin.step)} sample` : ""}.`,
        ...(thin.capped ? [`Raised to every ${thin.step}${ordinal(thin.step)} sample so the table stays under ${MAX_ROWS} rows.`] : []),
        ...(b.comments.length ? [`${b.comments.length} comment${b.comments.length === 1 ? "" : "s"}: ${shown.join("; ")}`
          + `${b.comments.length > shown.length ? " …" : ""}`] : []),
      ],
    };
  },
};

function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}
