// Name pattern builder: split a text column (FlowJo sample names, QuPath
// image names, qPCR sample names) at a delimiter and turn chosen parts
// into new staging columns, e.g. "KO_M5_D7_2.fcs" -> group KO, subject
// M5, time D7.
import { isNumericColumn } from "../tidy.ts";
import type { Role, Staging } from "./staging.ts";

export interface PatternPart {
  role: Role;          // "skip" drops the part
  name: string;        // column name of the part
}

export interface NamePattern {
  column: number;          // staging column split
  delimiter: string;       // "_", "-", ".", " " (any run of spaces) or any text
  stripExtension: boolean; // drop a trailing file extension (.fcs, .tif, .svs …)
  parts: PatternPart[];    // by position, left to right
}

export const DELIMITERS: [string, string][] = [
  ["_", "Underscore ( _ )"], ["-", "Hyphen ( - )"], [" ", "Space"], [".", "Dot ( . )"],
  ["/", "Slash ( / )"], [",", "Comma ( , )"],
];

const EXT = /\.(fcs|tiff?|png|jpe?g|czi|nd2|lif|svs|ndpi|scn|mrxs|vsi|ome\.tiff?|csv|txt|xlsx?)$/i;

export function splitName(name: string, delimiter: string, stripExtension: boolean): string[] {
  let s = name.trim();
  if (stripExtension) s = s.replace(EXT, "");
  if (!delimiter) return [s];
  const parts = delimiter === " " ? s.split(/\s+/) : s.split(delimiter);
  return parts.map((p) => p.trim());
}

const DEFAULT_NAMES: Partial<Record<Role, string>> = {
  group: "Group", subject: "Subject", time: "Time", level: "Level", meta: "Part",
};

/** Sensible first guess for the parts of names split at `delimiter`:
 *  group, then subject, then (when numeric-ish like D7 / 24h) time, the
 *  rest skipped. */
export function guessParts(names: string[], delimiter: string, stripExtension: boolean): PatternPart[] {
  const split = names.slice(0, 200).map((n) => splitName(n, delimiter, stripExtension));
  const width = Math.max(0, ...split.map((p) => p.length));
  const roles: Role[] = ["group", "subject"];
  return Array.from({ length: width }, (_, i) => {
    let role: Role = roles[i] ?? "skip";
    if (i === 2) {
      const vals = split.map((p) => p[i] ?? "");
      // a time point carries its unit: D7, day3, T0, 24h, 30min (a bare
      // number is more often a tube or well count)
      if (vals.every((v) => /^(d|day|t|w|wk|week)\d+(\.\d+)?$|^\d+(\.\d+)?(h|hr|hrs|d|min|w|wk)$/i.test(v))) {
        role = "time";
      }
    }
    return { role, name: role === "skip" ? `Part ${i + 1}` : DEFAULT_NAMES[role] ?? `Part ${i + 1}` };
  });
}

/** The staging table with the pattern's parts appended as new columns
 *  (skipped parts are not added). */
export function applyPattern(st: Staging, pat: NamePattern | null): Staging {
  if (!pat || pat.column < 0 || pat.column >= st.columns.length) return st;
  const kept = pat.parts.map((p, i) => ({ p, i })).filter(({ p }) => p.role !== "skip");
  if (!kept.length) return st;
  const split = st.rows.map((r) => splitName(r[pat.column] ?? "", pat.delimiter, pat.stripExtension));
  const used = new Set(st.columns.map((c) => c.name));
  const columns = kept.map(({ p, i }) => {
    let name = p.name.trim() || `Part ${i + 1}`;
    for (let k = 2; used.has(name); k++) name = `${p.name.trim() || `Part ${i + 1}`} ${k}`;
    used.add(name);
    return { name, role: p.role, numeric: isNumericColumn(split.map((s) => s[i] ?? "")) };
  });
  return {
    columns: [...st.columns, ...columns],
    rows: st.rows.map((r, ri) => [...r, ...kept.map(({ i }) => split[ri][i] ?? "")]),
  };
}

/** Text columns worth splitting: text with a delimiter in most names. */
export function splittableColumns(st: Staging): number[] {
  return st.columns.map((c, i) => i).filter((i) => !st.columns[i].numeric
    && st.rows.some((r) => /[_\-. /]/.test(r[i] ?? "")));
}

/** The delimiter most names contain, in order of preference. */
export function guessDelimiter(names: string[]): string {
  const sample = names.slice(0, 200).map((n) => n.replace(EXT, ""));
  for (const d of ["_", "-", " ", "."]) {
    const hits = sample.filter((n) => n.includes(d)).length;
    if (sample.length && hits / sample.length >= 0.8) return d;
  }
  return "_";
}
