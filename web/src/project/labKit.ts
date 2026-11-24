// A lab kit file (P-75): what a lab sets up once in a browser, as one file
// a new member (or another computer) imports: saved templates, import
// recipes, plate layouts, "My equations", the preferences and the image
// export settings. Pure: reading and writing the browser's stores is in
// app/labKit.ts.
//
// Format (`*.odkit.json`):
//   { "opendose_lab_kit": 1, "exportedAt": ISO date, "software": "...",
//     "templates": [...], "recipes": [...], "plateLayouts": [...],
//     "equations": [...], "preferences": {...}, "exportSettings": {...} }
// Version rule: the number after the marker is the kit format version
// (KIT_VERSION). Adding a section or an optional field does not change
// it: a reader ignores sections it does not know, and a section missing
// from a file is empty. A change that older readers would misread
// (renaming or reshaping a section) raises KIT_VERSION and adds a step to
// MIGRATIONS that turns a version N kit into N + 1, so every older kit
// still imports. A kit with a version above KIT_VERSION is refused with a
// message to update OpenDose, never half read.
import { sanitizeExport } from "../export/settings.ts";
import { normalizeEquation, type UserEquationDef } from "../lib/userEquation.ts";
import { sanitizePrefs } from "./prefs.ts";
import { normalizeRecipes, type ProjectRecipe } from "./recipes.ts";
import { templateFromJson, type SheetTemplate } from "./templates.ts";
import type { ExportPrefs, Prefs } from "./types.ts";

export const KIT_MARKER = "opendose_lab_kit";
export const KIT_VERSION = 1;
export const KIT_EXTENSION = ".odkit.json";

/** A saved plate layout as the plate editor stores it. */
export interface KitPlateLayout { name: string; format: number; wells: Record<string, unknown>; description: string }

export interface LabKit {
  version: number;
  exportedAt: string;
  software: string;
  templates: SheetTemplate[];
  recipes: ProjectRecipe[];
  plateLayouts: KitPlateLayout[];
  equations: UserEquationDef[];
  preferences: Prefs | null;
  exportSettings: ExportPrefs | null;
}

export type KitSection = "templates" | "recipes" | "plateLayouts" | "equations" | "preferences" | "exportSettings";
export const KIT_SECTIONS: KitSection[] = ["templates", "recipes", "plateLayouts", "equations", "preferences", "exportSettings"];

/** Steps from kit version N to N + 1 (none yet: version 1 is the first). */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

const obj = (v: unknown): Record<string, unknown> =>
  (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function serializeKit(k: Omit<LabKit, "version">): string {
  return JSON.stringify({
    [KIT_MARKER]: KIT_VERSION,
    exportedAt: k.exportedAt,
    software: k.software,
    templates: k.templates,
    recipes: k.recipes,
    plateLayouts: k.plateLayouts,
    equations: k.equations,
    ...(k.preferences ? { preferences: k.preferences } : {}),
    ...(k.exportSettings ? { exportSettings: k.exportSettings } : {}),
  }, null, 2);
}

/** Is this JSON text a lab kit (whatever its version)? */
export function isLabKitText(text: string): boolean {
  if (!text.includes(KIT_MARKER)) return false;
  try { return obj(JSON.parse(text))[KIT_MARKER] !== undefined; } catch { return false; }
}

function plateLayout(v: unknown): KitPlateLayout | null {
  const o = obj(v);
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name || (o.format !== 96 && o.format !== 384) || !o.wells || typeof o.wells !== "object") return null;
  return {
    name, format: o.format, wells: o.wells as Record<string, unknown>,
    description: typeof o.description === "string" ? o.description : `Saved layout (${o.format} wells)`,
  };
}

/** Read a kit file. Damaged entries are skipped, not fatal. */
export function parseKit(text: string): LabKit {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("not a valid JSON file"); }
  let r = obj(raw);
  const version = r[KIT_MARKER];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new Error(r.opendose_project !== undefined
      ? "this is a project file; open it with Open instead" : "not an OpenDose lab kit file");
  }
  if (version > KIT_VERSION) {
    throw new Error(`this lab kit was made by a newer version of OpenDose (kit format ${version}); `
      + "update OpenDose (reload the page) to import it");
  }
  for (let v = version; v < KIT_VERSION; v++) r = MIGRATIONS[v](r);
  const templates: SheetTemplate[] = [];
  for (const t of list(r.templates)) {
    try {
      const id = typeof obj(t).id === "string" && obj(t).id ? String(obj(t).id) : undefined;
      const parsed = templateFromJson(t, { id });
      if (!parsed.builtin) templates.push(parsed);
    } catch { /* a damaged template is skipped */ }
  }
  return {
    version: KIT_VERSION,
    exportedAt: typeof r.exportedAt === "string" ? r.exportedAt : "",
    software: typeof r.software === "string" ? r.software : "",
    templates,
    recipes: normalizeRecipes(r.recipes),
    plateLayouts: list(r.plateLayouts).map(plateLayout).filter((x): x is KitPlateLayout => !!x),
    equations: list(r.equations).map(normalizeEquation)
      .filter((e): e is UserEquationDef => !!e && !!e.id),
    preferences: r.preferences && typeof r.preferences === "object" ? sanitizePrefs(r.preferences) : null,
    exportSettings: r.exportSettings && typeof r.exportSettings === "object"
      ? sanitizeExport(r.exportSettings) : null,
  };
}

/** How many entries a section brings (preferences: 1 or 0). */
export function sectionCount(k: LabKit, s: KitSection): number {
  if (s === "preferences") return k.preferences ? 1 : 0;
  if (s === "exportSettings") return k.exportSettings ? 1 : 0;
  return k[s].length;
}

export interface MergedList<T> {
  list: T[];
  /** Entries added. */
  added: number;
  /** Entries already here, identical: not doubled. */
  already: number;
  /** Names taken by another entry: the kit's came in as "name (2)". */
  renamed: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Entries of a kit added after the ones already in this browser: an
 * identical entry is not doubled; one whose key (name or id) is taken by
 * different content comes in under a new key, so nothing here is
 * overwritten. `rekey` gives an entry a new name or id; `content` is
 * what "identical" compares (an entry minus its save time).
 */
export function mergeEntries<T>(have: T[], add: T[], o: {
  key: (t: T) => string;
  rekey: (t: T, taken: (k: string) => boolean) => T;
  content?: (t: T) => unknown;
  label?: (t: T) => string;
}): MergedList<T> {
  const content = o.content ?? ((t: T) => t);
  const out = [...have];
  let added = 0;
  let already = 0;
  const renamed: string[] = [];
  const taken = (k: string) => out.some((x) => o.key(x) === k);
  for (const t of add) {
    if (out.some((x) => same(content(x), content(t)))) { already++; continue; }
    if (taken(o.key(t))) {
      out.push(o.rekey(t, taken));
      renamed.push(o.label ? o.label(t) : o.key(t));
    } else out.push(t);
    added++;
  }
  return { list: out, added, already, renamed };
}

/** "Name (2)", "Name (3)", ... first free. */
export function nextName(name: string, taken: (k: string) => boolean): string {
  for (let i = 2; ; i++) {
    const n = `${name} (${i})`;
    if (!taken(n)) return n;
  }
}
