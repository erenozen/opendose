// Import recipes: presets that recognise common instrument and analysis
// software exports and stage them as typed long-format records, with a
// first guess at roles, a name pattern, the aggregation steps and the
// table type. Every guess can be changed in the recipe dialog.
import {
  detectDecimal, detectDelimiter, normalizeNumber, splitDelimited,
} from "../../project/importText.ts";
import { findCqHeader, isUndeterminedCq } from "../../sheets/assays/qpcr/headers.ts";
import { guessDelimiter, guessParts, type NamePattern } from "./pattern.ts";
import { findPlateGrid, ROW_LABELS } from "./plate.ts";
import {
  makeStaging, type AggFn, type OutputType, type Role, type Staging,
} from "./staging.ts";

export type RecipeId = "flowjo" | "cellprofiler" | "qupath" | "plate" | "qpcr" | "tidy";

/** What a recipe proposes for a file. */
export interface Staged {
  recipe: RecipeId;
  staging: Staging;
  pattern: NamePattern | null;
  /** Aggregation proposed: hierarchy column names (after the pattern is
   *  applied) to aggregate into, finest first, with the function. */
  aggregate: { level: string; fn: AggFn }[];
  output: OutputType;
  name: string;
  notes: string[];
}

export interface Recipe {
  id: RecipeId;
  label: string;
  description: string;
  /** 0 (not this format) .. 1 (certainly this format). */
  detect: (m: string[][]) => number;
  stage: (m: string[][]) => Staged;
}

// ------------------------------------------------------------ parsing

/** Text of a file as a matrix of cells, numbers with a point decimal. */
export function parseSource(text: string): string[][] {
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

const norm = (s: string) => s.trim().toLowerCase();

/** Index of the first row whose cells include all the `needles`
 *  (regexes tested against each trimmed, lower-cased cell). */
function headerRow(m: string[][], needles: RegExp[], maxScan = 80): number {
  for (let r = 0; r < Math.min(m.length, maxScan); r++) {
    const cells = m[r].map(norm);
    if (needles.every((re) => cells.some((c) => re.test(c)))) return r;
  }
  return -1;
}

function body(m: string[][], header: number): string[][] {
  return m.slice(header + 1).filter((r) => r.some((c) => c.trim() !== ""));
}

const GROUP_RE = /^(metadata_)?(group|treatment|treat|condition|genotype|drug|compound|arm|cohort|strain|class)$/;
const SUBJECT_RE = /^(metadata_)?(subject|animal|mouse|rat|donor|patient|individual|replicate|biorep|bio[ _]?rep|rep|experiment|id|subject[ _]?id|animal[ _]?id|mouse[ _]?id)$/;
const TIME_RE = /^(metadata_)?(time|timepoint|time[ _]?point|day|days|hour|hours|week|weeks|dose|conc|concentration|x)$/;
const VALUE_RE = /^(value|values|response|measurement|y|signal|od|intensity|result|volume|weight)$/;
const EVENT_RE = /^(event|status|censor|censored|dead|death)$/;

function firstNumeric(st: Staging, from = 0, exclude: (name: string) => boolean = () => false): number {
  return st.columns.findIndex((c, i) => i >= from && c.numeric && !exclude(c.name));
}

// ------------------------------------------------------------ FlowJo

const FLOWJO_SUMMARY = /^(mean|sd|median|cv|min|max|sem|average|std\.? ?dev\.?)$/i;

const flowjo: Recipe = {
  id: "flowjo",
  label: "FlowJo table (samples × statistics)",
  description: "Table Editor export: one row per sample file (.fcs), one column per gate statistic. "
    + "Group, animal and time point are read from the sample names.",
  detect: (m) => {
    const h = m[0] ?? [];
    const statHeads = h.slice(1).filter((c) => /\||freq\.|count|median|mean|geometric|cv/i.test(c)).length;
    const fcs = m.slice(1).filter((r) => /\.fcs$/i.test(r[0]?.trim() ?? "")).length;
    const summary = m.slice(1).some((r) => FLOWJO_SUMMARY.test(r[0]?.trim() ?? ""));
    return Math.min(1, (fcs >= 2 ? 0.6 : 0) + (statHeads ? 0.3 : 0) + (summary ? 0.1 : 0)
      + (/^(|name|sample:?)$/i.test(h[0]?.trim() ?? "") && statHeads ? 0.1 : 0));
  },
  stage: (m) => {
    const headers = [...(m[0] ?? [])];
    headers[0] = headers[0]?.trim() && !/^name$/i.test(headers[0].trim()) ? headers[0] : "Sample";
    const rows = body(m, 0).filter((r) => !FLOWJO_SUMMARY.test(r[0]?.trim() ?? "")
      && r[0]?.trim() !== "");
    const roles: Role[] = headers.map((_, i) => (i === 0 ? "meta" : "meta"));
    const st = makeStaging(headers, rows, roles);
    const v = firstNumeric(st, 1);
    if (v >= 0) st.columns[v].role = "value";
    const names = rows.map((r) => r[0] ?? "");
    const delimiter = guessDelimiter(names);
    const parts = guessParts(names, delimiter, true);
    const pattern: NamePattern = { column: 0, delimiter, stripExtension: true, parts };
    const subject = parts.find((p) => p.role === "subject");
    return {
      recipe: "flowjo", staging: st, pattern,
      aggregate: subject ? [{ level: subject.name, fn: "mean" }] : [],
      output: "column", name: "FlowJo statistics",
      notes: [`${rows.length} samples; summary rows (Mean, SD) dropped.`],
    };
  },
};

// ------------------------------------------------------------ CellProfiler

const cellprofiler: Recipe = {
  id: "cellprofiler",
  label: "CellProfiler per-object table",
  description: "One row per object (cell, nucleus) with ImageNumber, ObjectNumber, Metadata_ "
    + "columns and measurements. Aggregates objects per image, then per animal or well.",
  detect: (m) => {
    const r = headerRow(m, [/^imagenumber$/, /^objectnumber$/], 5);
    if (r < 0) return 0;
    return m[r].some((c) => /^metadata_/i.test(c)) ? 1 : 0.9;
  },
  stage: (m) => {
    const r = Math.max(0, headerRow(m, [/^imagenumber$/, /^objectnumber$/], 5));
    const headers = m[r];
    const roles: Role[] = headers.map((h) => {
      const n = norm(h);
      if (n === "imagenumber") return "level";
      if (n === "objectnumber") return "meta";
      if (GROUP_RE.test(n)) return "group";
      if (SUBJECT_RE.test(n) || /^metadata_(animal|mouse|subject|donor|patient)/.test(n)) return "subject";
      if (TIME_RE.test(n)) return "time";
      if (/^(location|number|parent|children)_/.test(n)) return "skip";
      return "meta";
    });
    const st = makeStaging(headers, body(m, r), roles);
    const v = firstNumeric(st, 0, (name) => /^(imagenumber|objectnumber)$/i.test(name)
      || /^(metadata|location|number|parent|children)_/i.test(name));
    if (v >= 0) st.columns[v].role = "value";
    // Metadata_Well or similar: unit of plating.
    if (!st.columns.some((c) => c.role === "group")) {
      const well = st.columns.findIndex((c) => /^metadata_(well|plate|condition|sample)/i.test(c.name));
      if (well >= 0) st.columns[well].role = "group";
    }
    const subject = st.columns.find((c) => c.role === "subject");
    return {
      recipe: "cellprofiler", staging: st, pattern: null,
      aggregate: [{ level: "ImageNumber", fn: "mean" },
        ...(subject ? [{ level: subject.name, fn: "mean" as AggFn }] : [])],
      output: "column", name: "CellProfiler objects",
      notes: [`${st.rows.length} objects in ${new Set(st.rows.map((x) => x[headers.findIndex((h) => norm(h) === "imagenumber")])).size} images.`],
    };
  },
};

// ------------------------------------------------------------ QuPath

const qupath: Recipe = {
  id: "qupath",
  label: "QuPath measurements",
  description: "Measure > Export measurements: one row per detection or annotation with the image "
    + "name, class and measurements (Nucleus: Area µm^2 …). Group and animal come from image names.",
  detect: (m) => {
    const r = headerRow(m, [/^image$/], 3);
    if (r < 0) return 0;
    const h = m[r].map(norm);
    const qp = ["class", "parent", "roi", "object id", "name"].filter((k) => h.includes(k)).length;
    const meas = h.some((c) => /^(nucleus|cell|cytoplasm|membrane|centroid)[: ]/.test(c));
    return Math.min(1, qp * 0.2 + (meas ? 0.4 : 0));
  },
  stage: (m) => {
    const r = Math.max(0, headerRow(m, [/^image$/], 3));
    const headers = m[r];
    const roles: Role[] = headers.map((h) => {
      const n = norm(h);
      if (n === "image") return "level";
      if (["name", "class", "parent", "roi", "object id", "object type"].includes(n)) return "meta";
      if (/^centroid/.test(n)) return "skip";
      return "meta";
    });
    const st = makeStaging(headers, body(m, r), roles);
    const v = firstNumeric(st, 0, (name) => /^centroid/i.test(name));
    if (v >= 0) st.columns[v].role = "value";
    const img = headers.findIndex((h) => norm(h) === "image");
    const names = st.rows.map((x) => x[img] ?? "");
    const delimiter = guessDelimiter(names);
    const parts = guessParts(names, delimiter, true);
    const subject = parts.find((p) => p.role === "subject");
    return {
      recipe: "qupath", staging: st,
      pattern: img >= 0 ? { column: img, delimiter, stripExtension: true, parts } : null,
      aggregate: [{ level: headers[img] ?? "Image", fn: "mean" },
        ...(subject ? [{ level: subject.name, fn: "mean" as AggFn }] : [])],
      output: "column", name: "QuPath measurements",
      notes: [`${st.rows.length} objects in ${new Set(names).size} images.`],
    };
  },
};

// ------------------------------------------------------------ plate grid

const plate: Recipe = {
  id: "plate",
  label: "Plate reader grid (8 × 12 or 16 × 24)",
  description: "A plate block with row letters A–H (or A–P) and columns 1–12 (or 1–24), "
    + "anywhere in the file. One record per well; columns become groups by default.",
  detect: (m) => (findPlateGrid(m) ? 0.95 : 0),
  stage: (m) => {
    const g = findPlateGrid(m);
    if (!g) throw new Error("No plate block (rows A, B, C … with numbers beside them) was found.");
    const rows: string[][] = [];
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const v = g.values[r][c];
        rows.push([`${ROW_LABELS[r]}${c + 1}`, ROW_LABELS[r], String(c + 1), v === null ? "" : String(v)]);
      }
    }
    const st = makeStaging(["Well", "Row", "Column", "Value"], rows,
      ["meta", "subject", "group", "value"]);
    return {
      recipe: "plate", staging: st, pattern: null, aggregate: [], output: "column",
      name: "Plate", notes: [`${g.rows * g.cols}-well plate found at row ${g.top + 1}.`, ...g.warnings],
    };
  },
};

// ------------------------------------------------------------ qPCR

// Header variants (Sample Name, Well Name, Target Name, Gene, Detector,
// CT, Cт, Cq Mean ...) are matched case-insensitively by the qPCR
// module's resolver, so the recipe and the qPCR wizard agree.
const qpcr: Recipe = {
  id: "qpcr",
  label: "qPCR Cq / Ct export",
  description: "Rows of Well, Sample, Target and Cq (Bio-Rad CFX, QuantStudio, LightCycler …). "
    + "Technical replicate wells are averaged per sample and target.",
  detect: (m) => (findCqHeader(m)?.complete ? 0.95 : 0),
  stage: (m) => {
    const h = findCqHeader(m);
    if (!h?.complete) throw new Error("No Cq table found: no header row names a sample, a target and a Cq (or Ct) column.");
    const { row: r, headers, idx } = h;
    const { cq, sample, target } = idx;
    const roles: Role[] = headers.map((_, i) => (i === cq ? "value" : i === sample ? "group"
      : i === target ? "time" : "meta"));
    const rows = body(m, r).filter((x) => (x[sample] ?? "").trim() !== "" || (x[cq] ?? "").trim() !== "");
    const st = makeStaging(headers, rows, roles);
    const undetermined = rows.filter((x) => isUndeterminedCq(x[cq] ?? "")).length;
    return {
      recipe: "qpcr", staging: st, pattern: null,
      aggregate: [{ level: "", fn: "mean" }],
      output: "grouped", name: "qPCR Cq",
      notes: [`${rows.length} wells, ${new Set(rows.map((x) => x[target])).size} targets.`
        + (undetermined ? ` ${undetermined} undetermined Cq read as missing.` : "")],
    };
  },
};

// ------------------------------------------------------------ tidy

const tidy: Recipe = {
  id: "tidy",
  label: "Long (tidy) table",
  description: "Any table with one observation per row and explicit columns for group, "
    + "replicate or subject, time and value.",
  detect: (m) => {
    const h = (m[0] ?? []).map(norm);
    const hits = [GROUP_RE, SUBJECT_RE, TIME_RE, VALUE_RE].filter((re) => h.some((c) => re.test(c))).length;
    return h.length >= 2 ? 0.1 + hits * 0.15 : 0;
  },
  stage: (m) => {
    const headers = m[0] ?? [];
    const roles: Role[] = headers.map((x) => {
      const n = norm(x);
      if (GROUP_RE.test(n)) return "group";
      if (SUBJECT_RE.test(n)) return "subject";
      if (TIME_RE.test(n)) return "time";
      if (EVENT_RE.test(n)) return "event";
      if (VALUE_RE.test(n)) return "value";
      return "meta";
    });
    const st = makeStaging(headers, body(m, 0), roles);
    if (!st.columns.some((c) => c.role === "value")) {
      const last = st.columns.map((_, i) => i).reverse()
        .find((i) => st.columns[i].numeric && st.columns[i].role === "meta");
      if (last !== undefined) st.columns[last].role = "value";
    }
    if (!st.columns.some((c) => c.role === "group")) {
      const text = st.columns.findIndex((c) => !c.numeric && c.role === "meta");
      if (text >= 0) st.columns[text].role = "group";
    }
    const time = st.columns.find((c) => c.role === "time");
    const event = st.columns.some((c) => c.role === "event");
    return {
      recipe: "tidy", staging: st, pattern: null, aggregate: [],
      output: event ? "survival" : time ? (time.numeric ? "xy" : "grouped") : "column",
      name: "Imported data", notes: [],
    };
  },
};

export const RECIPES: Recipe[] = [flowjo, cellprofiler, qupath, plate, qpcr, tidy];

export function recipeById(id: RecipeId): Recipe {
  return RECIPES.find((r) => r.id === id)!;
}

/** The recipe that recognises this file best (tidy as the fallback). */
export function detectRecipe(m: string[][]): Recipe {
  let best = tidy;
  let score = 0;
  for (const r of RECIPES) {
    const s = r.detect(m);
    if (s > score + 1e-9) { best = r; score = s; }
  }
  return best;
}
