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
  /** A file-name template such as "{condition}_rep{replicate}_img{image}.csv"
   *  (see compileTemplate): when set, the parts are the template's fields
   *  in order and `delimiter` is not used. */
  template?: string;
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

// ------------------------------------------------------------ templates

/** A name template: literal text with `{field}` placeholders, `{*}` (or
 *  `{}`) for a part to ignore. "{condition}_rep{replicate}_img{image}.csv"
 *  reads "ctrl_rep1_img03.csv" as condition "ctrl", replicate "1", image
 *  "03". Matching ignores case; a template without an extension also
 *  matches names that have one. */
export interface CompiledTemplate {
  /** Field names in order ("" for an ignored part). */
  fields: string[];
  re: RegExp;
  /** The template ends in a file extension (else names are matched
   *  without theirs first). */
  ext: boolean;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function compileTemplate(template: string): CompiledTemplate | null {
  const t = template.trim();
  if (!t) return null;
  const fields: string[] = [];
  let src = "";
  let last = 0;
  const tokens = /\{([^{}]*)\}/g;
  for (let m = tokens.exec(t); m; m = tokens.exec(t)) {
    src += escapeRe(t.slice(last, m.index));
    const f = m[1].trim();
    fields.push(f === "*" ? "" : f);
    src += "(.*?)";
    last = m.index + m[0].length;
  }
  if (!fields.length) return null;
  src += escapeRe(t.slice(last));
  try {
    return { fields, re: new RegExp(`^${src}$`, "i"), ext: EXT.test(t) };
  } catch {
    return null;
  }
}

/** The template's parts of a name, or null when the name does not fit. */
export function matchTemplate(c: CompiledTemplate, name: string): string[] | null {
  const n = name.trim();
  const bare = n.replace(EXT, "");
  const m = c.ext ? c.re.exec(n) ?? c.re.exec(bare) : c.re.exec(bare) ?? c.re.exec(n);
  return m ? m.slice(1).map((p) => p.trim()) : null;
}

const FIELD_ROLES: [RegExp, Role][] = [
  [/^(condition|cond|group|treatment|treat|genotype|drug|compound|strain|line|cell ?line|construct|sirna|arm)$/i, "group"],
  [/^(replicate|rep|biorep|experiment|exp|animal|mouse|rat|subject|donor|patient|batch|run)$/i, "subject"],
  [/^(time|timepoint|time ?point|day|hour|hours|h|t|dose|conc|concentration)$/i, "time"],
];

/** Role of a template field from its name: condition-like fields are the
 *  group, replicate-like ones the subject (experimental unit), time-like
 *  ones the X / row; anything else (image, field, well) is kept as
 *  metadata. */
export function fieldRole(field: string): Role {
  if (!field) return "skip";
  return FIELD_ROLES.find(([re]) => re.test(field.trim()))?.[1] ?? "meta";
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Pattern parts of a template (one per field). */
export function templateParts(template: string): PatternPart[] {
  const c = compileTemplate(template);
  if (!c) return [];
  return c.fields.map((f, i) => ({
    role: fieldRole(f),
    name: f ? titleCase(f.trim()) : `Part ${i + 1}`,
  }));
}

/** Share of the names (0..1) a template fits. */
export function templateFit(template: string, names: string[]): number {
  const c = compileTemplate(template);
  if (!c || !names.length) return 0;
  return names.filter((n) => matchTemplate(c, n) !== null).length / names.length;
}

/** The parts of one name under a pattern (template or separator). */
export function nameParts(name: string, pat: NamePattern): string[] {
  if (pat.template !== undefined) {
    const c = compileTemplate(pat.template);
    return (c && matchTemplate(c, name)) ?? [];
  }
  return splitName(name, pat.delimiter, pat.stripExtension);
}

/** The staging table with the pattern's parts appended as new columns
 *  (skipped parts are not added). */
export function applyPattern(st: Staging, pat: NamePattern | null): Staging {
  if (!pat || pat.column < 0 || pat.column >= st.columns.length) return st;
  const kept = pat.parts.map((p, i) => ({ p, i })).filter(({ p }) => p.role !== "skip");
  if (!kept.length) return st;
  const split = st.rows.map((r) => nameParts(r[pat.column] ?? "", pat));
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
  return st.columns.map((_, i) => i).filter((i) => !st.columns[i].numeric
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
