// Plate layouts the user saved as templates: kept in this browser
// (localStorage), next to the built-in ones. Storage can be missing or
// refuse (private windows); every access is guarded.
import {
  BUILTIN_TEMPLATES, normalizePlateOptions, type PlateFormat, type PlateMap, type PlateTemplate,
} from "./model";

const KEY = "opendose-plate-layouts";

export function savedTemplates(): PlateTemplate[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((t: unknown) => {
      const o = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
      if (typeof o.name !== "string" || !o.name.trim()) return [];
      const opts = normalizePlateOptions({ wells: o.wells, format: o.format });
      return [{
        id: `saved:${o.name}`, name: o.name, saved: true,
        description: typeof o.description === "string" ? o.description : "Saved layout",
        format: opts.format, wells: opts.wells,
      }];
    });
  } catch {
    return [];
  }
}

/** Save (or replace) a layout under a name; false when the browser
 *  would not store it. */
export function saveTemplate(name: string, format: PlateFormat, wells: PlateMap): boolean {
  try {
    const list = savedTemplates().filter((t) => t.name !== name)
      .map((t) => ({ name: t.name, format: t.format, wells: t.wells, description: t.description }));
    list.push({ name, format, wells, description: `Saved layout (${format} wells)` });
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function deleteTemplate(name: string): void {
  try {
    const list = savedTemplates().filter((t) => t.name !== name)
      .map((t) => ({ name: t.name, format: t.format, wells: t.wells, description: t.description }));
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* storage unavailable */ }
}

export function allTemplates(): PlateTemplate[] {
  return [...BUILTIN_TEMPLATES, ...savedTemplates()];
}
