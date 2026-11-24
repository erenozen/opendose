// Blinding a table (P-124): the group (data set) names are replaced by
// codes (A, B, C …) in the project itself, so the grid, graphs, results,
// methods, every export and share link show only the codes; the key that
// maps codes back to names lives outside the project (this browser's
// storage and a key file, app/blindingKeys.ts) and unblinding needs it.
// Option values of the table's analyses and graphs that equal a group name
// are coded too (their places are recorded, so unblinding restores
// exactly those); the table's import record (it holds names, a plate map)
// travels with the key while blind. Undo history is cleared by the
// caller, so undo cannot bring the names back.
//
// Exclusions made while blind are found at unblinding (excluded now, not
// when blinding started) and kept in `blindLog`, which the methods
// paragraph reports. Plain data + pure functions.
import { parseImportRecord } from "./importRecord.ts";
import { derivedFrom } from "./derived.ts";
import type { DataSheet, Project, Sheet } from "./types.ts";

export interface BlindingRecord {
  /** Random; the key carries the same id. */
  id: string;
  /** ISO date-time of blinding. */
  at: string;
  /** The codes, in data set order when blinded. */
  codes: string[];
  /** Exclusions when blinding started: "code|row:sub", "X|row". */
  excludedAtStart: string[];
  /** Option values of the family's analyses and graphs coded at blinding. */
  paths: { sheetId: string; path: string[]; code: string }[];
  /** The table's import record is held with the key. */
  importHeld?: boolean;
}

/** One blinded stretch, ended by unblinding. */
export interface BlindSession {
  blindedAt: string;
  unblindedAt: string;
  codes: string[];
  /** Values excluded while blind (named after unblinding). */
  exclusions: { dataset: string; row: number; sub: number; value: string; reason?: string }[];
}

/** The key: which code is which group. Never part of the project. */
export interface BlindingKey {
  opendose_blinding_key: 1;
  id: string;
  /** The table's name when it was blinded. */
  table: string;
  createdAt: string;
  names: { code: string; name: string }[];
  /** The table's import record, held while blind. */
  imported?: unknown;
  /** Colours pinned to the group names, held while blind. */
  pins?: { name: string; color: string }[];
}

/** A, B, … Z, AA, AB, … */
export function codeFor(i: number): string {
  let n = i;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** "A to D", "A and B". */
export function codesText(codes: readonly string[]): string {
  if (codes.length <= 1) return codes[0] ?? "";
  return codes.length === 2 ? `${codes[0]} and ${codes[1]}` : `${codes[0]} to ${codes[codes.length - 1]}`;
}

const familyOf = (p: Project, dataId: string) => p.sheets.filter((s) =>
  (s.kind === "results" || s.kind === "graph") && s.parentId === dataId);

/** Why this table cannot be blinded now ("" when it can). */
export function blindProblem(p: Project, dataId: string): string {
  const s = p.sheets.find((x) => x.id === dataId);
  if (!s || s.kind !== "data") return "it is not a data table";
  if (s.blinding) return "it is already blinded";
  if (s.derived) return "it is computed from another table; blind that table instead";
  if (s.frozen) return "it is frozen";
  if (s.table.datasets.length < 2) return "it has fewer than two groups";
  if (derivedFrom(p, dataId).length) {
    return "other tables are computed from it and would keep the names; unlink them first";
  }
  if (familyOf(p, dataId).some((x) => x.frozen)) {
    return "a frozen results sheet or graph keeps a copy with the names; unfreeze it first";
  }
  return "";
}

type Path = (string | number)[];

/** Every string in a value, with its path. */
function strings(v: unknown, path: Path, out: { path: Path; text: string }[]): void {
  if (typeof v === "string") out.push({ path, text: v });
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, [...path, i], out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) strings(x, [...path, k], out);
  }
}

function setAt<T>(root: T, path: Path, value: unknown): T {
  if (!path.length) return value as T;
  const [head, ...rest] = path;
  const copy = (Array.isArray(root) ? [...root] : { ...(root as object) }) as Record<string | number, unknown>;
  copy[head] = setAt(copy[head], rest, value);
  return copy as T;
}

function getAt(root: unknown, path: Path): unknown {
  let cur = root;
  for (const k of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

/** The fields of a family sheet whose option values can name a group. */
const FIELD: Record<string, "options" | "settings"> = { results: "options", graph: "settings" };

/** Places outside the data set names where a group name still shows:
 *  sheet names, notes, titles, the chooser's reasons, text in graph and
 *  analysis settings (a value that is exactly a name is coded, so it is
 *  not listed). For the blinding dialog to name before the user blinds. */
export function leakScan(p: Project, dataId: string): string[] {
  const s = p.sheets.find((x) => x.id === dataId);
  if (!s || s.kind !== "data") return [];
  const names = [...new Set(s.table.datasets.map((d) => d.name.trim()).filter((n) => n.length >= 2))];
  if (!names.length) return [];
  const esc = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${names.map(esc).join("|")})(?=$|[^\\p{L}\\p{N}])`, "iu");
  const hits = new Set<string>();
  const check = (text: string, where: string) => { if (re.test(text)) hits.add(where); };
  check(p.title, "the project title");
  for (const x of p.sheets) {
    check(x.name, `the name of the sheet “${x.name}”`);
    for (const n of x.floatingNotes ?? []) check(n.text, `a note on “${x.name}”`);
    if (x.kind === "info") {
      check(x.notes, `the notes of “${x.name}”`);
      for (const c of x.constants) check(c.value, `the info constant “${c.name}” of “${x.name}”`);
      if (x.plan) check(JSON.stringify(x.plan), `the analysis plan in “${x.name}”`);
      if (x.design) check(JSON.stringify(x.design), `the study design in “${x.name}”`);
    }
    if ((x.kind === "results" || x.kind === "graph") && x.parentId === dataId) {
      const found: { path: Path; text: string }[] = [];
      strings(x.kind === "results" ? x.options : x.settings, [], found);
      for (const f of found) if (!names.includes(f.text.trim()) || f.text !== f.text.trim()) check(f.text, `a setting of “${x.name}”`);
      if (x.kind === "results" && x.chosen) check(x.chosen.reason, `the reason Help me choose gave in “${x.name}”`);
    }
  }
  const t = s.table;
  check([t.xTitle, t.yTitle, ...(t.rowTitles ?? []), ...t.datasets.flatMap((d) => d.subTitles ?? []),
    t.factorNames?.rows ?? "", t.factorNames?.datasets ?? "", ...(t.replicates?.names ?? [])].join("\n"),
  "the table's titles");
  check(t.datasets.flatMap((d) => Object.values(d.exclusionReasons ?? {})).join("\n"), "a reason for an exclusion");
  if (s.report) check(JSON.stringify(s.report), "the table's reporting details");
  for (const r of p.recipes ?? []) check(JSON.stringify(r.spec), `the saved import recipe “${r.name}”`);
  return [...hits];
}

const excludedKeys = (s: DataSheet, codeOf: (d: number) => string) => [
  ...(s.table.xExcluded ?? []).map((r) => `X|${r}`),
  ...s.table.datasets.flatMap((d, i) => (d.excluded ?? []).map((k) => `${codeOf(i)}|${k}`)),
];

const withoutCache = (x: Sheet): Sheet => {
  if (x.kind !== "results" || (x.cached === undefined && x.cachedKey === undefined)) return x;
  const copy = { ...x };
  delete copy.cached;
  delete copy.cachedKey;
  return copy;
};

/** Blind a table: the project with codes in place of the group names, and
 *  the key. `id` is random (the caller's crypto). */
export function blindTable(p: Project, dataId: string, o: { id: string; at: string }):
  { project: Project; key: BlindingKey } | { error: string } {
  const why = blindProblem(p, dataId);
  if (why) return { error: why };
  const s = p.sheets.find((x) => x.id === dataId) as DataSheet;
  const names = s.table.datasets.map((d) => d.name);
  const codes = names.map((_, i) => codeFor(i));
  const codeByName = new Map<string, string>();
  names.forEach((n, i) => { if (n.trim() && !codeByName.has(n)) codeByName.set(n, codes[i]); });
  const paths: BlindingRecord["paths"] = [];
  const sheets = p.sheets.map((x): Sheet => {
    if ((x.kind === "results" || x.kind === "graph") && x.parentId === dataId) {
      const field = FIELD[x.kind];
      let value: unknown = x.kind === "results" ? x.options : x.settings;
      const found: { path: Path; text: string }[] = [];
      strings(value, [], found);
      for (const f of found) {
        const code = codeByName.get(f.text);
        if (!code) continue;
        value = setAt(value, f.path, code);
        paths.push({ sheetId: x.id, path: [field, ...f.path.map(String)], code });
      }
      // a result saved with the file holds the names
      return withoutCache({ ...x, [field]: value } as Sheet);
    }
    if (x.id !== dataId || x.kind !== "data") return x;
    const blinding: BlindingRecord = {
      id: o.id, at: o.at, codes, excludedAtStart: excludedKeys(x, (i) => codes[i]), paths: [],
      ...(x.imported ? { importHeld: true } : {}),
    };
    const next: DataSheet = {
      ...x, table: { ...x.table, datasets: x.table.datasets.map((d, i) => ({ ...d, name: codes[i] })) }, blinding,
    };
    delete next.imported;
    return next;
  });
  // Colours pinned to these names (P-56) would name the groups in the
  // file: they go with the key and come back at unblinding.
  const lower = new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean));
  const pins = (p.groupColors ?? []).filter((g) => lower.has(g.name.trim().toLowerCase()));
  const keptPins = (p.groupColors ?? []).filter((g) => !pins.includes(g));
  const project: Project = { ...p, sheets: sheets.map((x) => (x.id === dataId && x.kind === "data"
    ? { ...x, blinding: { ...x.blinding!, paths } } : x)) };
  if (pins.length) {
    if (keptPins.length) project.groupColors = keptPins;
    else delete project.groupColors;
  }
  return {
    project,
    key: {
      opendose_blinding_key: 1, id: o.id, table: s.name, createdAt: o.at,
      names: codes.map((code, i) => ({ code, name: names[i] })),
      ...(s.imported ? { imported: JSON.parse(JSON.stringify(s.imported)) } : {}),
      ...(pins.length ? { pins: pins.map((g) => ({ ...g })) } : {}),
    },
  };
}

/** Unblind with the key: the names back, exclusions made while blind
 *  recorded in `blindLog`. */
export function unblindTable(p: Project, dataId: string, key: BlindingKey, at: string):
  { project: Project; session: BlindSession } | { error: string } {
  const s = p.sheets.find((x) => x.id === dataId);
  if (!s || s.kind !== "data" || !s.blinding) return { error: "the table is not blinded" };
  const b = s.blinding;
  if (key.id !== b.id) return { error: "this key belongs to another blinding (its id does not match)" };
  const nameOf = new Map(key.names.map((n) => [n.code, n.name]));
  const start = new Set(b.excludedAtStart);
  const t = s.table;
  const exclusions: BlindSession["exclusions"] = [];
  t.datasets.forEach((d, i) => {
    for (const k of d.excluded ?? []) {
      if (start.has(`${d.name}|${k}`)) continue;
      const [row, sub] = k.split(":").map(Number);
      const reason = d.exclusionReasons?.[k];
      exclusions.push({ dataset: nameOf.get(d.name) ?? d.name, row, sub, value: d.rows[row]?.[sub] ?? "",
        ...(reason ? { reason } : {}) });
      void i;
    }
  });
  for (const r of t.xExcluded ?? []) {
    if (!start.has(`X|${r}`)) exclusions.push({ dataset: "X", row: r, sub: 0, value: t.x[r] ?? "" });
  }
  const session: BlindSession = { blindedAt: b.at, unblindedAt: at, codes: b.codes, exclusions };
  const byId = new Map<string, BlindingRecord["paths"]>();
  for (const q of b.paths) byId.set(q.sheetId, [...(byId.get(q.sheetId) ?? []), q]);
  const imported = key.imported !== undefined ? parseImportRecord(key.imported) : null;
  const sheets = p.sheets.map((x): Sheet => {
    const ps = byId.get(x.id);
    if (ps && (x.kind === "results" || x.kind === "graph")) {
      let next: Sheet = x;
      for (const q of ps) {
        // only where the code is still there: a value changed while blind stays
        if (getAt(next, q.path) === q.code && nameOf.has(q.code)) next = setAt(next, q.path, nameOf.get(q.code));
      }
      return withoutCache(next);
    }
    if (x.kind === "results" && x.parentId === dataId) return withoutCache(x);
    if (x.id !== dataId || x.kind !== "data") return x;
    const next: DataSheet = {
      ...x,
      table: { ...x.table, datasets: x.table.datasets.map((d) => (nameOf.has(d.name) ? { ...d, name: nameOf.get(d.name)! } : d)) },
      blindLog: [...(x.blindLog ?? []), session],
      ...(imported && !x.imported ? { imported } : {}),
    };
    delete next.blinding;
    return next;
  });
  const next: Project = { ...p, sheets };
  const back = (key.pins ?? []).filter((g) => !(p.groupColors ?? []).some((x) =>
    x.name.trim().toLowerCase() === g.name.trim().toLowerCase()));
  if (back.length) next.groupColors = [...(p.groupColors ?? []), ...back];
  return { project: next, session };
}

/** The sentence the methods paragraph adds for a table blinded now or
 *  before (ARRIVE 2.0 item 5: blinding; exclusions made blind). */
export function blindingMethodsSentence(s: DataSheet | undefined): string {
  if (!s) return "";
  const out: string[] = [];
  const day = (iso: string) => iso.slice(0, 10);
  for (const x of s.blindLog ?? []) {
    const n = x.exclusions.length;
    out.push(`The analysis was blinded to group from ${day(x.blindedAt)} to ${day(x.unblindedAt)} (groups coded ${codesText(x.codes)}); `
      + (n ? `the ${n === 1 ? "value" : `${n} values`} excluded in that time ${n === 1 ? "was" : "were"} excluded blind to group.`
        : "no value was excluded in that time."));
  }
  if (s.blinding) out.push(`The group names are blinded: the groups are coded ${codesText(s.blinding.codes)}.`);
  return out.join(" ");
}

// ------------------------------------------------------------ files

const obj = (v: unknown): Record<string, unknown> =>
  (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
const codesOf = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 1000).map((x) => x.slice(0, 8)) : []);

export function parseBlinding(raw: unknown): BlindingRecord | null {
  const o = obj(raw);
  const id = str(o.id, 80);
  const codes = codesOf(o.codes);
  if (!id || !codes.length) return null;
  const paths = Array.isArray(o.paths) ? o.paths.slice(0, 5000).flatMap((q) => {
    const r = obj(q);
    const path = Array.isArray(r.path) && r.path.every((k) => typeof k === "string"
      && k !== "__proto__" && k !== "constructor" && k !== "prototype")
      ? r.path as string[] : null;
    return str(r.sheetId, 80) && path && path.length && str(r.code, 8)
      && (path[0] === "options" || path[0] === "settings")
      ? [{ sheetId: str(r.sheetId, 80), path, code: str(r.code, 8) }] : [];
  }) : [];
  return {
    id, at: str(o.at, 40), codes,
    excludedAtStart: Array.isArray(o.excludedAtStart)
      ? o.excludedAtStart.filter((x): x is string => typeof x === "string").slice(0, 100000) : [],
    paths, ...(o.importHeld === true ? { importHeld: true } : {}),
  };
}

export function parseBlindLog(raw: unknown): BlindSession[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 200).flatMap((x) => {
    const o = obj(x);
    if (!str(o.blindedAt, 40) || !str(o.unblindedAt, 40)) return [];
    const exclusions = Array.isArray(o.exclusions) ? o.exclusions.slice(0, 100000).flatMap((e) => {
      const q = obj(e);
      const row = Number(q.row);
      const sub = Number(q.sub);
      if (!Number.isInteger(row) || !Number.isInteger(sub) || row < 0 || sub < 0) return [];
      return [{ dataset: str(q.dataset), row, sub, value: str(q.value, 100),
        ...(str(q.reason, 300) ? { reason: str(q.reason, 300) } : {}) }];
    }) : [];
    return [{ blindedAt: str(o.blindedAt, 40), unblindedAt: str(o.unblindedAt, 40), codes: codesOf(o.codes), exclusions }];
  });
}

/** A key file's JSON. */
export function serializeKey(k: BlindingKey): string {
  return `${JSON.stringify(k, null, 2)}\n`;
}

/** A key read from a file (null when it is not one). */
export function parseKey(raw: unknown): BlindingKey | null {
  const o = obj(raw);
  if (o.opendose_blinding_key !== 1 || !str(o.id, 80) || !Array.isArray(o.names)) return null;
  const names = o.names.flatMap((n) => {
    const q = obj(n);
    return str(q.code, 8) && typeof q.name === "string" ? [{ code: str(q.code, 8), name: q.name.slice(0, 500) }] : [];
  });
  if (!names.length) return null;
  return {
    opendose_blinding_key: 1, id: str(o.id, 80), table: str(o.table), createdAt: str(o.createdAt, 40), names,
    ...(o.imported !== undefined ? { imported: o.imported } : {}),
    ...(Array.isArray(o.pins) ? { pins: o.pins.flatMap((g) => {
      const q = obj(g);
      return typeof q.name === "string" && /^#[0-9a-f]{6}$/i.test(str(q.color, 7))
        ? [{ name: q.name.slice(0, 200), color: str(q.color, 7) }] : [];
    }) } : {}),
  };
}
