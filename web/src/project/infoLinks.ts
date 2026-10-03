// Info constants as analysis inputs. An analysis option list of named
// constants (`options.constants: {name, value, info?}[]`, as the user
// formula transform keeps them) can hook a constant to an info-sheet
// constant by name (`info`). The hooked value is copied in whenever the
// info sheets change, so the analysis re-runs with it and saved files
// carry the value that was used.
//
// Plain data + pure functions, like the rest of this folder.
import type { InfoSheet, Project, Sheet } from "./types.ts";

export interface ProjectConstant {
  sheetId: string;
  sheet: string;          // info sheet name
  name: string;
  value: string;
  /** The info sheet is linked to the table asked about. */
  linked: boolean;
}

/** Named, non-empty info constants, the ones linked to `dataId` first,
 *  then project-wide ones, then those linked to other tables. */
export function projectConstants(p: Project, dataId?: string | null): ProjectConstant[] {
  const rank = (s: InfoSheet) => (dataId && s.parentId === dataId ? 0 : s.parentId ? 2 : 1);
  const infos = p.sheets.filter((s): s is InfoSheet => s.kind === "info")
    .map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i);
  const out: ProjectConstant[] = [];
  for (const { s } of infos) {
    for (const c of s.constants) {
      if (!c.name.trim() || !c.value.trim()) continue;
      out.push({
        sheetId: s.id, sheet: s.name, name: c.name.trim(), value: c.value.trim(),
        linked: !!dataId && s.parentId === dataId,
      });
    }
  }
  return out;
}

/** Value of the info constant called `name` as seen from `dataId`. */
export function constantValue(p: Project, name: string, dataId?: string | null): string | undefined {
  const want = name.trim().toLowerCase();
  return projectConstants(p, dataId).find((c) => c.name.toLowerCase() === want)?.value;
}

/** A formula-friendly name for an info constant ("Dilution factor" ->
 *  "Dilution_factor"). */
export function identifierFor(name: string): string {
  let id = name.trim().replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!id) id = "C";
  if (/^[0-9]/.test(id)) id = `C_${id}`;
  return id;
}

interface HookedConstant { name: string; value: string; info?: string }

function hooked(options: unknown): HookedConstant[] | null {
  if (!options || typeof options !== "object") return null;
  const list = (options as { constants?: unknown }).constants;
  if (!Array.isArray(list) || !list.some((c) => c && typeof c === "object"
    && typeof (c as HookedConstant).info === "string")) return null;
  return list as HookedConstant[];
}

/** Copy current info-constant values into every hooked analysis constant.
 *  Frozen results sheets keep theirs; a hook whose info constant is gone
 *  keeps the last value. */
export function syncInfoLinks(p: Project): Project {
  let changed = false;
  const sheets = p.sheets.map((s): Sheet => {
    if (s.kind !== "results" || s.frozen) return s;
    const list = hooked(s.options);
    if (!list) return s;
    let touched = false;
    const next = list.map((c) => {
      if (!c || typeof c.info !== "string") return c;
      const v = constantValue(p, c.info, s.parentId);
      if (v === undefined || v === c.value) return c;
      touched = true;
      return { ...c, value: v };
    });
    if (!touched) return s;
    changed = true;
    return { ...s, options: { ...(s.options as object), constants: next } };
  });
  return changed ? { ...p, sheets } : p;
}
