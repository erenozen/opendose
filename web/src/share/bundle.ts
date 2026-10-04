// The export bundle: everything in a project as open files, so the work
// stays readable without OpenDose (R, Python, a spreadsheet, a text
// editor). Pure assembly; the app collects the rendered parts (results
// tables, graphs, methods text) and this module names and zips them.
import { zipSync, strToU8 } from "fflate";
import { tableMatrix, toDelimited, DEFAULT_EXPORT } from "../project/exportTable.ts";
import type { DataTableModel } from "../project/types.ts";
import { longMatrix, tableToLong } from "./tidy.ts";

export interface BundleInput {
  title: string;
  /** The project file (persist.serializeProject, with results). */
  projectJson: string;
  tables: { name: string; table: DataTableModel }[];
  results: { name: string; analysis: string; data: string; matrix: string[][] }[];
  graphs: { name: string; svg: string | null; png: Uint8Array | null }[];
  methods: { name: string; text: string }[];
  citation: { plain: string; bibtex: string };
  /** "OpenDose 0.2.0 (build abc123, 2026-10-04)" */
  app: string;
  /** "SciPy 1.14.1 and NumPy 2.0.2 (Python … in Pyodide …)" */
  libraries: string;
  /** ISO date-time the bundle was made. */
  date: string;
  /** Parts that could not be produced (named in the README). */
  skipped: string[];
}

export interface BundleFile { name: string; data: Uint8Array }

/** File-name stem: lower case letters and digits joined by "-". */
export function stem(name: string, fallback: string): string {
  const s = name.normalize("NFKC").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return s || fallback;
}

/** Unique stems in order: "a", "a-2", "a-3". */
export function uniq(stems: string[]): string[] {
  const used = new Set<string>();
  return stems.map((s) => {
    let n = s;
    for (let i = 2; used.has(n); i++) n = `${s}-${i}`;
    used.add(n);
    return n;
  });
}

const csv = (m: string[][]) => toDelimited(m, "csv");

const TYPE_NAMES: Record<string, string> = {
  xy: "XY", column: "Column", grouped: "Grouped", contingency: "Contingency",
  survival: "Survival", partsofwhole: "Parts of whole", multivariable: "Multiple variables",
  nested: "Nested",
};

/** The bundle's files, in the order they are listed in the README. */
export function bundleFiles(b: BundleInput): BundleFile[] {
  const files: { name: string; text?: string; bytes?: Uint8Array; about: string }[] = [];
  files.push({ name: "project.json", text: b.projectJson,
    about: "The project file: open it in OpenDose with Open (any later version opens it)." });

  const tStems = uniq(b.tables.map((t) => stem(t.name, "table")));
  b.tables.forEach((t, i) => {
    const kind = TYPE_NAMES[t.table.type] ?? t.table.type;
    files.push({ name: `data/${tStems[i]}.csv`, text: csv(tableMatrix(t.table, DEFAULT_EXPORT)),
      about: `"${t.name}" (${kind} table) as laid out in the app (wide form); excluded values end in *.` });
    files.push({ name: `data/${tStems[i]}.long.csv`, text: csv(longMatrix(tableToLong(t.table))),
      about: `"${t.name}" in long (tidy) form: one observation per row with its keys.` });
  });

  const rStems = uniq(b.results.map((r) => stem(r.name, "results")));
  b.results.forEach((r, i) => {
    files.push({ name: `results/${rStems[i]}.csv`, text: csv(r.matrix),
      about: `"${r.name}": ${r.analysis} of "${r.data}", as shown in the app.` });
  });

  const gStems = uniq(b.graphs.map((g) => stem(g.name, "graph")));
  b.graphs.forEach((g, i) => {
    if (g.svg) files.push({ name: `graphs/${gStems[i]}.svg`, text: g.svg, about: `"${g.name}" (vector).` });
    if (g.png) files.push({ name: `graphs/${gStems[i]}.png`, bytes: g.png, about: `"${g.name}" (bitmap).` });
  });

  const methods = b.methods.length
    ? b.methods.map((m) => `${m.name}\n${"-".repeat(Math.min(72, m.name.length))}\n${m.text}\n`).join("\n")
    : "No analysis in this project produced methods text.\n";
  files.push({ name: "methods.txt", text: methods, about: "Methods text for each results sheet." });
  files.push({ name: "CITATION.txt", text: `${b.citation.plain}\n\nBibTeX:\n\n${b.citation.bibtex}\n`,
    about: "How to cite OpenDose (plain reference and BibTeX)." });

  const readme = readmeText(b, files.map((f) => ({ name: f.name, about: f.about })));
  const out: BundleFile[] = [{ name: "README.txt", data: strToU8(readme) }];
  for (const f of files) out.push({ name: f.name, data: f.bytes ?? strToU8(f.text ?? "") });
  return out;
}

export function readmeText(b: BundleInput, list: { name: string; about: string }[]): string {
  const lines = [
    `${b.title || "OpenDose project"}: export bundle`,
    "=".repeat(Math.min(72, (b.title || "OpenDose project").length + 15)),
    "",
    `Made ${b.date.slice(0, 16).replace("T", " ")} UTC with ${b.app}`,
    `Numerical libraries: ${b.libraries}`,
    "",
    "Every file here is an open format: CSV (UTF-8, comma-separated, first row",
    "holds the column titles), SVG, PNG, JSON and plain text. Nothing needs",
    "OpenDose to be read; project.json reopens the whole project in it.",
    "",
    "Contents",
    "--------",
    "README.txt",
    "    This file.",
    ...list.flatMap((f) => [f.name, `    ${f.about}`]),
  ];
  if (b.skipped.length) {
    lines.push("", "Not included", "------------",
      ...b.skipped.map((s) => `${s} (it could not be drawn or computed in time; export it from the app)`));
  }
  lines.push("", "Results tables are written as shown in the app, at its display",
    "precision; the project file and the data CSVs keep every stored digit.", "");
  return lines.join("\n");
}

/** The bundle as a zip: text deflated, PNG stored. */
export function zipBundle(files: BundleFile[]): Uint8Array {
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (const f of files) entries[f.name] = [f.data, { level: f.name.endsWith(".png") ? 0 : 6 }];
  return zipSync(entries);
}
